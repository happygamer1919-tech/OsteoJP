/**
 * inngest/backstop.test.ts - SWEEP-47: what a sleeping reminder job does when
 * it wakes, by the send switch.
 *
 *   1. SWITCH OFF: the job of today, step for step and argument for argument.
 *   2. SWITCH ON: it waits 20 minutes for the sweep, then asks the dispatcher,
 *      and follows a visit that was moved later.
 *   3. THE STEP NAMES: a job that waited under the switch and wakes after it
 *      was turned off still sends, because no step here is named `dispatch`.
 *   4. No option of the function changes with the switch.
 *
 * The scheduler is a stand-in that stores each finished step under its name
 * and never runs a stored step again, which is what a resumed run looks like.
 * THAT THE HOSTED SCHEDULER DOES THE SAME WITH A STORED STEP A RUN NO LONGER
 * ASKS FOR IS NOT ESTABLISHED HERE.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  dispatchReminder: vi.fn(),
}));

vi.mock("../dispatch", () => ({
  dispatchReminder: h.dispatchReminder,
  dispatchConfirmation: vi.fn(),
  dispatchFollowUp: vi.fn(),
  dispatchNoShow: vi.fn(),
}));
// The sweep's scheduled function is named in functions.ts; its passes are not this file's subject.
vi.mock("../sweep-send", () => ({ runReminderSweepSend: vi.fn() }));

const { MOVED_MARK_WAITS, SWEEP_HEAD_START_MS, dispatchAfterTheSweep } = await import("./backstop");
const { sendAppointmentReminder, REMINDER_IDEMPOTENCY_KEY, REMINDER_SINGLETON, REMINDER_SUPERSEDE_CANCEL_ON } = await import("./functions");
const { EVENT_REMINDER_DUE } = await import("./client");

const MIN = 60_000;
const SEND_AT = "2031-05-13T10:00:00.000Z";
const DATA = {
  appointmentId: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  offsetId: "24h",
  channel: "sms",
  sendAt: SEND_AT,
  scheduledBy: "evt-1",
} as const;
const KEY = `${DATA.appointmentId}:24h:sms`;
const SENT = { dispatched: true, channels: [{ channel: "sms", sandbox: false, id: "SM1" }] };
const HELD = { dispatched: false, reason: "claim_held" };
const notDue = (dueAt: string) => ({ dispatched: false, reason: "not_due", dueAt });

type Handler = (ctx: unknown) => Promise<Record<string, unknown>>;
const handler = (sendAppointmentReminder as unknown as { fn: Handler }).fn;

/** A scheduler that stores finished steps by name and never runs a stored one again. */
function scheduler(stored: Record<string, unknown> = {}) {
  const log: string[] = [];
  const step = {
    sleepUntil: async (id: string, at: Date) => {
      if (id in stored) return;
      log.push(`sleepUntil:${id}:${at.toISOString()}`);
      stored[id] = null;
    },
    run: async (id: string, fn: () => Promise<unknown>) => {
      if (id in stored) return stored[id];
      log.push(`run:${id}`);
      const result = await fn();
      stored[id] = result;
      return result;
    },
  };
  return { step, log, stored };
}

const SWITCH_OFF = [undefined, "", "shadow", "SEND", "Send", " send", "send ", "send\n", "true", "1", "on"];
let savedMode: string | undefined;

function setSwitch(value: string | undefined) {
  if (value === undefined) delete process.env.REMINDERS_SWEEP_MODE;
  else process.env.REMINDERS_SWEEP_MODE = value;
}

beforeEach(() => {
  savedMode = process.env.REMINDERS_SWEEP_MODE;
  delete process.env.REMINDERS_SWEEP_MODE;
  h.dispatchReminder.mockReset();
});

afterEach(() => {
  if (savedMode === undefined) delete process.env.REMINDERS_SWEEP_MODE;
  else process.env.REMINDERS_SWEEP_MODE = savedMode;
});

describe("the send switch off: the reminder job of today", () => {
  it.each(SWITCH_OFF)("REMINDERS_SWEEP_MODE=%j: sleeps to its time, sends in the step named dispatch, and waits for nobody", async (value) => {
    setSwitch(value);
    h.dispatchReminder.mockResolvedValue(SENT);
    const { step, log } = scheduler();
    const out = await handler({ event: { data: DATA }, step });
    expect(log).toEqual([`sleepUntil:wait-until-due:${SEND_AT}`, "run:dispatch"]);
    // The dispatcher is called with exactly the four arguments it always was.
    expect(h.dispatchReminder.mock.calls).toEqual([[DATA.tenantId, DATA.appointmentId, "24h", "sms"]]);
    expect(out).toEqual({ key: KEY, ...SENT });
  });
});

describe("the send switch on: the job is the backstop", () => {
  beforeEach(() => setSwitch("send"));

  it("waits 20 minutes past its time for the sweep, then asks; a reminder the sweep took is held and the job ends silent", async () => {
    h.dispatchReminder.mockResolvedValue(HELD);
    const { step, log } = scheduler();
    const out = await handler({ event: { data: DATA }, step });
    expect(SWEEP_HEAD_START_MS).toBe(20 * MIN);
    expect(log).toEqual([
      `sleepUntil:wait-until-due:${SEND_AT}`,
      "sleepUntil:wait-for-the-sweep:2031-05-13T10:20:00.000Z",
      "run:dispatch-after-the-sweep",
    ]);
    expect(h.dispatchReminder.mock.calls).toEqual([[DATA.tenantId, DATA.appointmentId, "24h", "sms"]]);
    expect(out).toEqual({ key: KEY, ...HELD });
  });

  it("with the sweep dead there is no claim: the job sends, 20 minutes late", async () => {
    h.dispatchReminder.mockResolvedValue(SENT);
    const { step, log } = scheduler();
    expect(await handler({ event: { data: DATA }, step })).toEqual({ key: KEY, ...SENT });
    expect(log.at(-1)).toBe("run:dispatch-after-the-sweep");
    expect(h.dispatchReminder).toHaveBeenCalledTimes(1);
  });

  it("a visit moved later: told not due, the job sleeps to the new time plus 20 minutes and asks again", async () => {
    h.dispatchReminder.mockResolvedValueOnce(notDue("2031-05-15T14:00:00.000Z")).mockResolvedValueOnce(SENT);
    const { step, log } = scheduler();
    expect(await handler({ event: { data: DATA }, step })).toEqual({ key: KEY, ...SENT });
    expect(log).toEqual([
      `sleepUntil:wait-until-due:${SEND_AT}`,
      "sleepUntil:wait-for-the-sweep:2031-05-13T10:20:00.000Z",
      "run:dispatch-after-the-sweep",
      "sleepUntil:wait-for-the-moved-mark-1:2031-05-15T14:20:00.000Z",
      "run:dispatch-after-the-moved-mark-1",
    ]);
  });

  it("moved later again and again: it follows at most four times, then ends with the last answer", async () => {
    expect(MOVED_MARK_WAITS).toBe(4);
    let day = 15;
    h.dispatchReminder.mockImplementation(async () => notDue(`2031-05-${day++}T14:00:00.000Z`));
    const { step, log } = scheduler();
    const out = await handler({ event: { data: DATA }, step });
    expect(h.dispatchReminder).toHaveBeenCalledTimes(1 + MOVED_MARK_WAITS);
    expect(log.filter((l) => l.startsWith("sleepUntil:wait-for-the-moved-mark-"))).toHaveLength(MOVED_MARK_WAITS);
    expect(out).toMatchObject({ key: KEY, dispatched: false, reason: "not_due" });
  });

  it.each([
    ["any other answer ends the job", { dispatched: false, reason: "status" }],
    ["too late ends the job", { dispatched: false, reason: "mark_missed" }],
    ["not due with no time to wait for ends the job", { dispatched: false, reason: "not_due" }],
    ["not due with a time that is not one ends the job", { dispatched: false, reason: "not_due", dueAt: "soon" }],
  ])("%s", async (_name, answer) => {
    h.dispatchReminder.mockResolvedValue(answer);
    const { step, log } = scheduler();
    expect(await handler({ event: { data: DATA }, step })).toEqual({ key: KEY, ...answer });
    expect(log.at(-1)).toBe("run:dispatch-after-the-sweep");
    expect(h.dispatchReminder).toHaveBeenCalledTimes(1);
  });

  it("an error from the dispatcher goes on, so the scheduler retries the step", async () => {
    const boom = new Error("claim store");
    h.dispatchReminder.mockRejectedValue(boom);
    const { step } = scheduler();
    await expect(handler({ event: { data: DATA }, step })).rejects.toBe(boom);
  });

  it("a resumed run repeats no finished step: nothing is asked twice", async () => {
    h.dispatchReminder.mockResolvedValue(SENT);
    const { step, log } = scheduler({
      "wait-until-due": null,
      "wait-for-the-sweep": null,
      "dispatch-after-the-sweep": notDue("2031-05-15T14:00:00.000Z"),
      "wait-for-the-moved-mark-1": null,
    });
    expect(await handler({ event: { data: DATA }, step })).toEqual({ key: KEY, ...SENT });
    expect(log).toEqual(["run:dispatch-after-the-moved-mark-1"]);
    expect(h.dispatchReminder).toHaveBeenCalledTimes(1);
  });

  it("the helper on its own asks with four arguments: the taker and the clock are the dispatcher's defaults", async () => {
    h.dispatchReminder.mockResolvedValue(SENT);
    const { step } = scheduler();
    await dispatchAfterTheSweep(step as never, DATA as never);
    expect(h.dispatchReminder.mock.calls[0]).toHaveLength(4);
  });
});

describe("the step names are the rollback", () => {
  it("no step the backstop runs is named `dispatch`", async () => {
    setSwitch("send");
    let day = 15;
    h.dispatchReminder.mockImplementation(async () => notDue(`2031-05-${day++}T14:00:00.000Z`));
    const { step, stored } = scheduler();
    await handler({ event: { data: DATA }, step });
    expect(Object.keys(stored)).not.toContain("dispatch");
    expect(Object.keys(stored)).toContain("wait-until-due");
  });

  it("a job that waited under the switch, was told not due, slept again and wakes with the switch OFF sends in today's step", async () => {
    // What the scheduler holds for that job: every step it finished under the switch.
    const { step, log } = scheduler({
      "wait-until-due": null,
      "wait-for-the-sweep": null,
      "dispatch-after-the-sweep": notDue("2031-05-15T14:00:00.000Z"),
      "wait-for-the-moved-mark-1": null,
    });
    setSwitch(undefined);
    h.dispatchReminder.mockResolvedValue(SENT);
    const out = await handler({ event: { data: DATA }, step });
    // The stored `not_due` is not replayed: `dispatch` was never run, so it runs now.
    expect(log).toEqual(["run:dispatch"]);
    expect(h.dispatchReminder).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ key: KEY, ...SENT });
  });

  it("and a job that already sent in today's step does not send again when the switch is turned on", async () => {
    // Finished under the switch off, then replayed by the scheduler with it on.
    const { step, log } = scheduler({ "wait-until-due": null, dispatch: SENT });
    setSwitch("send");
    h.dispatchReminder.mockResolvedValue(HELD);
    const out = await handler({ event: { data: DATA }, step });
    // It asks once more under the new names, and the claim answers: held.
    expect(log).toEqual(["sleepUntil:wait-for-the-sweep:2031-05-13T10:20:00.000Z", "run:dispatch-after-the-sweep"]);
    expect(out).toEqual({ key: KEY, ...HELD });
  });
});

describe("the function the scheduler is given does not change with the switch", () => {
  it.each([undefined, "send"])("REMINDERS_SWEEP_MODE=%j: the same trigger, key, singleton and cancelOn", (value) => {
    setSwitch(value);
    const opts = (sendAppointmentReminder as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts).toEqual({
      id: "send-appointment-reminder",
      triggers: [{ event: EVENT_REMINDER_DUE }],
      cancelOn: REMINDER_SUPERSEDE_CANCEL_ON,
      idempotency: REMINDER_IDEMPOTENCY_KEY,
      singleton: REMINDER_SINGLETON,
    });
  });
});

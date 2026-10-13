/**
 * sweep-send.test.ts - SWEEP-47: the sending pass, without a database.
 *
 *   1. ONE MARK: what the pass hands the dispatcher, the word it gives each
 *      answer, and that a throw is caught, counted and logged with ids only.
 *   2. THE PASS: the ceiling over every tenant, a tenant that fails, the log.
 *   3. THE SECOND SWITCH: which values make a sending pass take the visits
 *      that never had a reminder.
 *
 * Which marks a pass selects, and that a mark is sent once, are proven on
 * seeded rows in sweep-send.db.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { SWEEP_LOG_PREFIX, SWEEP_MARK_CEILING } = await import("./sweep");
const {
  ReminderSweepSendError,
  SWEEP_RETRY_AFTER_MS,
  SWEEP_SEND_PASS_MODE,
  handOverMark,
  runReminderSweepSend,
  sendingPassIncludesNeverReminded,
} = await import("./sweep-send");
const { REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER } = await import("./reminder-population");
type SweepSendTenantOutcome = import("./sweep-send").SweepSendTenantOutcome;
type SendableMark = import("./sweep-send").SendableMark;
type DispatchOutcome = import("./dispatch").DispatchOutcome;

const T1 = "aaaaaaaa-0000-4000-8000-000000000001";
const T2 = "aaaaaaaa-0000-4000-8000-000000000002";
const T3 = "aaaaaaaa-0000-4000-8000-000000000003";
const APPOINTMENT = "bbbbbbbb-0000-4000-8000-000000000001";
const NOW = new Date("2027-02-10T10:15:00.000Z");
const MIN = 60_000;

const mark = (minutesAfterNow: number): SendableMark => ({
  appointmentId: APPOINTMENT,
  offsetId: "24h",
  channel: "sms",
  startsAt: new Date(NOW.getTime() + minutesAfterNow * MIN + 24 * 60 * MIN),
  mark: new Date(NOW.getTime() + minutesAfterNow * MIN),
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("one mark, handed to the dispatcher", () => {
  it("is handed over as the taker `sweep`, with the pass's clock, and nothing else", async () => {
    const calls: unknown[][] = [];
    const dispatch = vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return { dispatched: true, channels: [{ channel: "sms", sandbox: false, id: "SM1" }] } as DispatchOutcome;
    });
    const result = await handOverMark({ tenantId: T1, mark: mark(-30), now: NOW, dispatch: dispatch as never });
    expect(result).toBe("sent");
    expect(calls).toEqual([[T1, APPOINTMENT, "24h", "sms", "sweep", { now: NOW }]]);
  });

  it("a mark still ahead of the pass's clock is handed over as taken ahead; a mark due this instant is not", async () => {
    const seen: unknown[] = [];
    const dispatch = vi.fn(async (...args: unknown[]) => {
      seen.push(args[5]);
      return { dispatched: false, reason: "status" } as DispatchOutcome;
    });
    await handOverMark({ tenantId: T1, mark: mark(40), now: NOW, dispatch: dispatch as never });
    await handOverMark({ tenantId: T1, mark: mark(0), now: NOW, dispatch: dispatch as never });
    await handOverMark({ tenantId: T1, mark: mark(-1), now: NOW, dispatch: dispatch as never });
    expect(seen).toEqual([{ now: NOW, takenAhead: true }, { now: NOW }, { now: NOW }]);
  });

  it.each([
    [{ dispatched: true, channels: [{ channel: "sms", sandbox: false, id: "SM1" }] }, "sent"],
    // The gate kept it in the sandbox, or the number cannot take an SMS: nothing left.
    [{ dispatched: true, channels: [{ channel: "sms", sandbox: true, id: "sandbox" }] }, "held_back"],
    [{ dispatched: true, channels: [] }, "held_back"],
    [{ dispatched: false, reason: "status" }, "held_back"],
    [{ dispatched: false, reason: "unconfirmed" }, "held_back"],
    [{ dispatched: false, reason: "channels_off" }, "held_back"],
    [{ dispatched: false, reason: "not_found" }, "held_back"],
    [{ dispatched: false, reason: "claim_held" }, "claim_held"],
  ] as const)("the dispatcher answers %o: %s", async (outcome, word) => {
    const dispatch = vi.fn(async () => outcome as unknown as DispatchOutcome);
    expect(await handOverMark({ tenantId: T1, mark: mark(-5), now: NOW, dispatch: dispatch as never })).toBe(word);
  });

  it("NEVER THROWS: a call that throws is `failed`, logged with ids and the error's name only", async () => {
    const alarms: string[] = [];
    const dispatch = vi.fn(async () => {
      throw Object.assign(new Error("Paciente Ficticio +351912345678 refused"), { name: "ProviderSendError" });
    });
    const result = await handOverMark({ tenantId: T1, mark: mark(-5), now: NOW, dispatch: dispatch as never, alarm: (l) => alarms.push(l) });
    expect(result).toBe("failed");
    expect(alarms).toEqual([
      `${SWEEP_LOG_PREFIX} mark FAILED tenantId=${T1} appointmentId=${APPOINTMENT} offsetId=24h channel=sms: ProviderSendError`,
    ]);
    expect(alarms.join("\n")).not.toMatch(/Paciente|912345678/);

    const notAnError = vi.fn(async () => {
      throw "a string";
    });
    await handOverMark({ tenantId: T1, mark: mark(-5), now: NOW, dispatch: notAnError as never, alarm: (l) => alarms.push(l) });
    expect(alarms[1]).toMatch(/: unknown$/);
  });
});

/** A tenant's sending pass that takes what it is allowed of what it has due. */
function fakeSweep(dueByTenant: Record<string, number>) {
  const calls: { tenantId: string; limit: number; passId?: string }[] = [];
  const sweepTenant = async (args: { tenantId: string; limit: number; passId?: string }): Promise<SweepSendTenantOutcome> => {
    calls.push({ tenantId: args.tenantId, limit: args.limit, passId: args.passId });
    const due = dueByTenant[args.tenantId] ?? 0;
    if (due < 0) throw Object.assign(new Error("a patient's name must never reach a log"), { name: "PostgresError" });
    const taken = Math.min(due, args.limit);
    // Of what it took: all but two sent, one held back, one failed (when it took that many).
    const failed = taken >= 2 ? 1 : 0;
    const heldBack = taken >= 2 ? 1 : 0;
    return { due, taken, sent: taken - failed - heldBack, heldBack, claimHeld: 0, failed, overCeiling: due > taken };
  };
  return { calls, sweepTenant: sweepTenant as never };
}

describe("one sending pass", () => {
  it("sweeps every tenant with the pass's id and what is left of the ceiling, and logs counts only", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 3, [T2]: 1 });
    const steps: string[] = [];
    const lines: string[] = [];
    const alarms: string[] = [];
    const out = await runReminderSweepSend({
      listTenantIds: async () => [T1, T2],
      step: async (id, fn) => {
        steps.push(id);
        return fn();
      },
      passId: "01JRUNID",
      sweepTenant,
      log: (l) => lines.push(l),
      alarm: (l) => alarms.push(l),
    });
    expect(out).toEqual({
      mode: "send",
      tenants: 2,
      failedTenants: 0,
      due: 4,
      taken: 4,
      sent: 2,
      heldBack: 1,
      claimHeld: 0,
      failedMarks: 1,
      overCeiling: false,
    });
    // The pass itself runs one step, the listing; each tenant's pass runs its own.
    expect(steps).toEqual(["list-tenants"]);
    expect(calls).toEqual([
      { tenantId: T1, limit: 50, passId: "01JRUNID" },
      { tenantId: T2, limit: 47, passId: "01JRUNID" },
    ]);
    expect(lines).toEqual([
      `${SWEEP_LOG_PREFIX} mode=send tenants=2 failed=0 due=4 taken=4 sent=2 heldBack=1 claimHeld=0 failedMarks=1`,
    ]);
    // A mark that failed does not fail the pass.
    expect(alarms).toEqual([]);
  });

  it("never takes more than the ceiling over all tenants, and says so when more was due", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 30, [T2]: 45, [T3]: 4 });
    const alarms: string[] = [];
    const out = await runReminderSweepSend({
      listTenantIds: async () => [T1, T2, T3],
      sweepTenant,
      log: () => {},
      alarm: (l) => alarms.push(l),
    });
    expect(calls.map((c) => c.limit)).toEqual([50, 20, 0]);
    expect(out.taken).toBe(SWEEP_MARK_CEILING);
    expect(out).toMatchObject({ due: 79, taken: 50, overCeiling: true });
    expect(alarms).toEqual([`${SWEEP_LOG_PREFIX} OVER THE CEILING due=79 taken=50 ceiling=50`]);
  });

  it("a tenant that fails does not stop the others; the pass then fails, naming an id and the error's name only", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 1, [T2]: -1, [T3]: 1 });
    const alarms: string[] = [];
    const failure = await runReminderSweepSend({
      listTenantIds: async () => [T1, T2, T3],
      sweepTenant,
      log: () => {},
      alarm: (l) => alarms.push(l),
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ReminderSweepSendError);
    const error = failure as InstanceType<typeof ReminderSweepSendError>;
    expect(error.name).toBe("ReminderSweepSendError");
    expect(error.message).toBe("reminder sweep: 1 of 3 tenant(s) could not be swept");
    expect(error.outcome).toMatchObject({ mode: "send", tenants: 3, failedTenants: 1, taken: 2, sent: 2 });
    expect(calls.map((c) => c.tenantId)).toEqual([T1, T2, T3]);
    expect(alarms).toEqual([`${SWEEP_LOG_PREFIX} tenant FAILED tenantId=${T2}: PostgresError`]);
    expect([...alarms, error.message].join("\n")).not.toContain("patient");
  });

  it("when the tenants cannot be listed nothing is swept and the error goes on", async () => {
    const { calls, sweepTenant } = fakeSweep({ [T1]: 1 });
    const boom = new Error("list failed");
    await expect(
      runReminderSweepSend({
        listTenantIds: async () => {
          throw boom;
        },
        sweepTenant,
        log: () => {},
        alarm: () => {},
      }),
    ).rejects.toBe(boom);
    expect(calls).toEqual([]);
  });

  it("with no tenant at all the pass is an empty one", async () => {
    const lines: string[] = [];
    const out = await runReminderSweepSend({ listTenantIds: async () => [], log: (l) => lines.push(l), alarm: () => {} });
    expect(out).toMatchObject({ mode: "send", tenants: 0, taken: 0, sent: 0 });
    expect(lines).toEqual([`${SWEEP_LOG_PREFIX} mode=send tenants=0 failed=0 due=0 taken=0 sent=0 heldBack=0 claimHeld=0 failedMarks=0`]);
  });

  it("the fixed words: the heartbeat's mode and the hour between two tries", () => {
    expect(SWEEP_SEND_PASS_MODE).toBe("send");
    expect(SWEEP_RETRY_AFTER_MS).toBe(60 * 60_000);
  });
});

describe("the second switch: the visits that never had a reminder", () => {
  it("the constant the shadow and the counts read is still off", () => {
    expect(REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER).toBe(false);
  });

  it("a sending pass leaves them out unless REMINDERS_SWEEP_NEVER_REMINDED is exactly on", () => {
    expect(sendingPassIncludesNeverReminded({})).toBe(false);
    expect(sendingPassIncludesNeverReminded({ REMINDERS_SWEEP_NEVER_REMINDED: "on" })).toBe(true);
    for (const value of ["ON", "On", " on", "on ", "on\n", "true", "1", "yes", "send", ""]) {
      expect(sendingPassIncludesNeverReminded({ REMINDERS_SWEEP_NEVER_REMINDED: value }), JSON.stringify(value)).toBe(false);
    }
    // The send switch does not set it.
    expect(sendingPassIncludesNeverReminded({ REMINDERS_SWEEP_MODE: "send" })).toBe(false);
  });
});

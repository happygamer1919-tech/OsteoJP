import { describe, expect, it, vi } from "vitest";

// functions.ts → ../dispatch imports "server-only"; neutralise it for the node
// test runner (we only assert the declarative supersession config here).
vi.mock("server-only", () => ({}));

import {
  CONFIRMATION_IDEMPOTENCY_KEY,
  CONFIRMATION_TRIGGER_FILTER,
  REMINDER_IDEMPOTENCY_KEY,
  REMINDER_SCHEDULE_DEBOUNCE,
  REMINDER_SINGLETON,
  REMINDER_SUPERSEDE_CANCEL_ON,
  functions,
  reminderScheduledBy,
  scheduleAppointmentReminders,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
} from "./functions";
import { EVENT_APPOINTMENT_SCHEDULED, EVENT_REMINDER_DUE } from "./client";

describe("reminder reschedule supersession config", () => {
  it("cancels the in-flight reminder run on a new appointment/scheduled event", () => {
    expect(REMINDER_SUPERSEDE_CANCEL_ON).toHaveLength(1);
    expect(REMINDER_SUPERSEDE_CANCEL_ON[0].event).toBe(EVENT_APPOINTMENT_SCHEDULED);
  });

  it("matches supersession on appointment id AND tenant id (tenant-safe)", () => {
    const expr = REMINDER_SUPERSEDE_CANCEL_ON[0].if;
    // `event` = the sleeping run's reminder.due trigger; `async` = the incoming
    // appointment/scheduled cancel event.
    expect(expr).toContain("event.data.appointmentId == async.data.appointmentId");
    expect(expr).toContain("event.data.tenantId == async.data.tenantId");
  });

  it("keys idempotency on appointment + offset + send instant, so a reschedule is a new run", () => {
    // sendAt in the key is what lets the new time start a fresh run while a
    // duplicate delivery of the SAME schedule still dedupes.
    expect(REMINDER_IDEMPOTENCY_KEY).toContain("event.data.appointmentId");
    expect(REMINDER_IDEMPOTENCY_KEY).toContain("event.data.offsetId");
    expect(REMINDER_IDEMPOTENCY_KEY).toContain("event.data.sendAt");
  });

  // This assertion exists because its NEGATIVE ARM initially passed: reverting
  // the expression to the old shape broke nothing, which meant the Inngest half
  // of the channel-in-key rule was unenforced while the offsets.ts half was
  // covered. Without channel here, two channels at one offset and send instant
  // collapse into a single Inngest run and the second is silently dropped.
  it("keys idempotency on CHANNEL as well, so two channels at one offset cannot collapse", () => {
    expect(REMINDER_IDEMPOTENCY_KEY).toContain("event.data.channel");

    // Order matters for readability of the resulting key in Inngest's run history:
    // appointment : offset : channel : sendAt.
    expect(REMINDER_IDEMPOTENCY_KEY.indexOf("event.data.channel")).toBeGreaterThan(
      REMINDER_IDEMPOTENCY_KEY.indexOf("event.data.offsetId"),
    );
    expect(REMINDER_IDEMPOTENCY_KEY.indexOf("event.data.channel")).toBeLessThan(
      REMINDER_IDEMPOTENCY_KEY.indexOf("event.data.sendAt"),
    );
  });

  it("registers all five notification functions (2 reminders + confirmation + follow-up + no-show)", () => {
    expect(functions).toHaveLength(5);
  });
});

/** Read the options an InngestFunction was constructed with. See the note in the
 *  trigger-wiring test for why this reaches past the public surface. */
function authoredTriggers(fn: unknown): unknown {
  return (fn as { opts?: { triggers?: unknown } }).opts?.triggers;
}

describe("series burst guard — confirmation fires once per booking action", () => {
  it("filters on confirmationEligible", () => {
    expect(CONFIRMATION_TRIGGER_FILTER).toBe("event.data.confirmationEligible == true");
  });

  it("wires the filter to the TRIGGER, so suppressed occurrences never start a run", () => {
    // The constant being right is not enough: it has to be attached. Without this
    // assertion the filter could be defined and unused, and a 10-session series
    // would still fire 10 confirmations. Read through the SDK's own accessor
    // rather than a stringified object, so an internal shape change fails loudly
    // instead of silently matching nothing.
    // Deliberate reach into the SDK's resolved options. `getConfigTriggers()` is
    // protected, and asserting on the exported constant alone would leave the
    // hole this test exists to close: a filter that is defined and never wired.
    // If the SDK changes this shape the cast yields undefined and the test fails,
    // which is the correct outcome — it is a real signal, not a flake.
    expect(authoredTriggers(sendAppointmentConfirmation)).toEqual([
      { event: EVENT_APPOINTMENT_SCHEDULED, if: CONFIRMATION_TRIGGER_FILTER },
    ]);
  });

  it("leaves reminder scheduling unfiltered, so every occurrence still gets reminders", () => {
    const scheduler = functions.find((f) => f.id() === "schedule-appointment-reminders");
    expect(scheduler).toBeDefined();

    // No `if` at all: the scheduler must fire for EVERY occurrence of a series,
    // which is what keeps reminders per-occurrence while confirmations are not.
    expect(authoredTriggers(scheduler!)).toEqual([{ event: EVENT_APPOINTMENT_SCHEDULED }]);
  });
});

/** The options an InngestFunction was constructed with (see authoredTriggers). */
function authoredOptions(fn: unknown): Record<string, unknown> {
  return (fn as { opts?: Record<string, unknown> }).opts ?? {};
}

/**
 * INC 2026-10-07: A SAVE THAT KEEPS THE START LOST THE REMINDER.
 *
 * The behaviour itself is Inngest's (a cancelled run, then a replacement dropped
 * as a duplicate key) and was measured on the Inngest dev server; the table is in
 * functions.ts. What a unit test can hold is the CONFIGURATION those measurements
 * were taken with, and the one value our code computes: who scheduled a reminder.
 * Each assertion below names the setting whose removal brought a failure back.
 */
describe("a re-save never loses or doubles a reminder (INC 2026-10-07)", () => {
  it("the idempotency key carries the save, last, so a second save with the SAME start is a new run", () => {
    expect(REMINDER_IDEMPOTENCY_KEY).toContain("event.data.scheduledBy");
    expect(REMINDER_IDEMPOTENCY_KEY.indexOf("event.data.scheduledBy")).toBeGreaterThan(
      REMINDER_IDEMPOTENCY_KEY.indexOf("event.data.sendAt"),
    );
    // The whole expression, so a dropped term cannot hide behind `toContain`.
    expect(REMINDER_IDEMPOTENCY_KEY).toBe(
      'event.data.appointmentId + ":" + event.data.offsetId + ":" + event.data.channel + ":" + event.data.sendAt + ":" + event.data.scheduledBy',
    );
  });

  it("only the newest run of one reminder stays alive: singleton, mode cancel, per appointment + offset + channel", () => {
    expect(REMINDER_SINGLETON.mode).toBe("cancel");
    expect(REMINDER_SINGLETON.key).toBe(
      'event.data.appointmentId + ":" + event.data.offsetId + ":" + event.data.channel',
    );
    // NOT per send instant and NOT per save: a move and a re-save must both land
    // on the key of the run they replace, or the old one survives beside the new.
    expect(REMINDER_SINGLETON.key).not.toContain("sendAt");
    expect(REMINDER_SINGLETON.key).not.toContain("scheduledBy");
  });

  it("the fan-out of one appointment is debounced, so two saves a moment apart start their runs in order", () => {
    expect(REMINDER_SCHEDULE_DEBOUNCE).toEqual({ key: "event.data.appointmentId", period: "2s" });
  });

  it("all three settings, and cancelOn, are on the functions Inngest is given", () => {
    const send = authoredOptions(sendAppointmentReminder);
    expect(send.triggers).toEqual([{ event: EVENT_REMINDER_DUE }]);
    expect(send.idempotency).toBe(REMINDER_IDEMPOTENCY_KEY);
    expect(send.singleton).toEqual(REMINDER_SINGLETON);
    // cancelOn stays: it removes a run created before the singleton key existed.
    expect(send.cancelOn).toEqual(REMINDER_SUPERSEDE_CANCEL_ON);

    const schedule = authoredOptions(scheduleAppointmentReminders);
    expect(schedule.debounce).toEqual(REMINDER_SCHEDULE_DEBOUNCE);
    // The scheduler is not a singleton and has no idempotency key: every save
    // must reach it (the debounce picks the last).
    expect(schedule.singleton).toBeUndefined();
    expect(schedule.idempotency).toBeUndefined();
  });

  it("the confirmation keeps its own key: one per appointment and start, however many saves", () => {
    const confirmation = authoredOptions(sendAppointmentConfirmation);
    expect(confirmation.idempotency).toBe(CONFIRMATION_IDEMPOTENCY_KEY);
    expect(CONFIRMATION_IDEMPOTENCY_KEY).not.toContain("scheduledBy");
    expect(confirmation.singleton).toBeUndefined();
    expect(confirmation.debounce).toBeUndefined();
  });

  it("scheduledBy is the event's id, never empty, and differs between two saves", () => {
    expect(reminderScheduledBy({ id: "01JABC", ts: 1 })).toBe("01JABC");
    expect(reminderScheduledBy({ id: "", ts: 1791000000000 })).toBe("ts:1791000000000");
    expect(reminderScheduledBy({ ts: 1791000000000 })).toBe("ts:1791000000000");
    expect(reminderScheduledBy({})).toBe("ts:0");
    expect(reminderScheduledBy({ id: "a" })).not.toBe(reminderScheduledBy({ id: "b" }));
    expect(reminderScheduledBy({ ts: 1 })).not.toBe(reminderScheduledBy({ ts: 2 }));
  });

  it("the fan-out stamps every reminder with the save that scheduled it", async () => {
    const sent: Array<{ name: string; data: Record<string, unknown> }> = [];
    const step = {
      sendEvent: async (_id: string, events: Array<{ name: string; data: Record<string, unknown> }>) => {
        sent.push(...events);
      },
    };
    const handler = (scheduleAppointmentReminders as unknown as {
      fn: (ctx: unknown) => Promise<{ scheduled: number }>;
    }).fn;
    // Ten days out: both offsets (48h email, 24h SMS) are still due.
    const startsAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const data = { appointmentId: "appt-1", tenantId: "tenant-1", startsAt, confirmationEligible: false };

    const first = await handler({ event: { id: "evt-first", ts: 1, data }, step });
    const second = await handler({ event: { id: "evt-second", ts: 2, data }, step });

    expect(first.scheduled).toBe(2);
    expect(second.scheduled).toBe(2);
    expect(sent).toHaveLength(4);
    expect(sent.every((e) => e.name === EVENT_REMINDER_DUE)).toBe(true);
    expect(sent.slice(0, 2).map((e) => e.data.scheduledBy)).toEqual(["evt-first", "evt-first"]);
    expect(sent.slice(2).map((e) => e.data.scheduledBy)).toEqual(["evt-second", "evt-second"]);
    // The SAME appointment, offsets and send instants: without scheduledBy the
    // second save's reminders would carry the first save's keys.
    const withoutSave = (e: { data: Record<string, unknown> }) =>
      `${e.data.appointmentId}:${e.data.offsetId}:${e.data.channel}:${e.data.sendAt}`;
    expect(sent.slice(2).map(withoutSave)).toEqual(sent.slice(0, 2).map(withoutSave));
  });
});

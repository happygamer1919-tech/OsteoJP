import { describe, expect, it, vi } from "vitest";

// functions.ts → ../dispatch imports "server-only"; neutralise it for the node
// test runner (we only assert the declarative supersession config here).
vi.mock("server-only", () => ({}));

import {
  CONFIRMATION_TRIGGER_FILTER,
  REMINDER_IDEMPOTENCY_KEY,
  REMINDER_SUPERSEDE_CANCEL_ON,
  functions,
  sendAppointmentConfirmation,
} from "./functions";
import { EVENT_APPOINTMENT_SCHEDULED } from "./client";

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

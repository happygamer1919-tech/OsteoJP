import { describe, expect, it, vi } from "vitest";

// functions.ts → ../dispatch imports "server-only"; neutralise it for the node
// test runner (we only assert the declarative supersession config here).
vi.mock("server-only", () => ({}));

import {
  REMINDER_IDEMPOTENCY_KEY,
  REMINDER_SUPERSEDE_CANCEL_ON,
  functions,
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

  it("registers all five notification functions (2 reminders + confirmation + follow-up + no-show)", () => {
    expect(functions).toHaveLength(5);
  });
});

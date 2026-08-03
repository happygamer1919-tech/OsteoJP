/**
 * Item 3 DoD: a recurring-series booking sends ONE confirmation, not one per
 * occurrence, and a booking action cannot emit an unbounded number of events.
 *
 * Before this guard, actions.ts mapped every created occurrence into
 * reminderTargets, so a 10-session series emitted 10 appointment/scheduled events
 * and 10 immediate confirmation SMS in one burst. Idempotency did not help: the
 * appointment ids differ.
 *
 * The confirmation filter is on the Inngest TRIGGER, so what these tests assert
 * is the payload flag that the trigger reads — that is the boundary this module
 * controls. The trigger wiring itself is asserted in
 * lib/reminders/inngest/functions.test.ts, which already neutralises server-only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: { name: string; data: Record<string, unknown> }[] = [];

vi.mock("@/lib/reminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reminders")>();
  return {
    ...actual,
    enqueueAppointmentReminders: vi.fn(
      async (a: { appointmentId: string; tenantId: string; startsAt: Date; confirmationEligible: boolean }) => {
        sent.push({ name: "appointment/scheduled", data: { ...a } });
      },
    ),
    enqueueFollowUp: vi.fn(async () => {}),
    enqueueNoShow: vi.fn(async () => {}),
  };
});

import {
  enqueueRemindersAfterCommit,
  confirmationEligibleIndex,
  MAX_EVENTS_PER_BOOKING_ACTION,
  ReminderBurstError,
  type ReminderEnqueueTarget,
} from "./reminders";

const TENANT = "3a2d0711-0000-0000-0000-000000000000";
const BASE = Date.UTC(2026, 8, 1, 9, 0, 0);

/** A weekly series of `n` occurrences, earliest first. */
function series(n: number): ReminderEnqueueTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    appointmentId: `appt-${i}`,
    startsAt: new Date(BASE + i * 7 * 24 * 3600_000),
  }));
}

beforeEach(() => {
  sent.length = 0;
});

describe("recurring series emits exactly one confirmation", () => {
  it("a 10-occurrence series yields 1 confirmation-eligible event and 10 reminder schedules", async () => {
    await enqueueRemindersAfterCommit(TENANT, series(10));

    expect(sent).toHaveLength(10); // every occurrence still schedules its own reminders
    const eligible = sent.filter((e) => e.data.confirmationEligible === true);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.data.appointmentId).toBe("appt-0");
  });

  it("a single-appointment booking still gets its confirmation", async () => {
    await enqueueRemindersAfterCommit(TENANT, series(1));

    expect(sent).toHaveLength(1);
    expect(sent[0]!.data.confirmationEligible).toBe(true);
  });

  it("emits nothing at all for an empty target list", async () => {
    await enqueueRemindersAfterCommit(TENANT, []);
    expect(sent).toHaveLength(0);
  });

  it("picks the EARLIEST occurrence, not array position, when targets arrive unsorted", async () => {
    const unsorted = [series(3)[2]!, series(3)[0]!, series(3)[1]!];
    await enqueueRemindersAfterCommit(TENANT, unsorted);

    const eligible = sent.filter((e) => e.data.confirmationEligible === true);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.data.appointmentId).toBe("appt-0");
  });

  it("confirmationEligibleIndex returns -1 for an empty list", () => {
    expect(confirmationEligibleIndex([])).toBe(-1);
  });
});

describe("hard cap on events per booking action", () => {
  it("allows a booking action exactly at the ceiling", async () => {
    await enqueueRemindersAfterCommit(TENANT, series(MAX_EVENTS_PER_BOOKING_ACTION));
    expect(sent).toHaveLength(MAX_EVENTS_PER_BOOKING_ACTION);
  });

  it("throws loudly one past the ceiling and emits NOTHING", async () => {
    await expect(
      enqueueRemindersAfterCommit(TENANT, series(MAX_EVENTS_PER_BOOKING_ACTION + 1)),
    ).rejects.toThrow(ReminderBurstError);

    // The cap is checked before the loop, so a burst is refused whole, not partly sent.
    expect(sent).toHaveLength(0);
  });

  it("names the attempted count and the ceiling in the error", async () => {
    const attempted = MAX_EVENTS_PER_BOOKING_ACTION + 7;
    await expect(enqueueRemindersAfterCommit(TENANT, series(attempted))).rejects.toThrow(
      new RegExp(`${attempted} appointment events .* ${MAX_EVENTS_PER_BOOKING_ACTION} ceiling`),
    );
  });

  it("is derived from MAX_OCCURRENCES so the two cannot drift", async () => {
    const { MAX_OCCURRENCES } = await import("./recurrence");
    expect(MAX_EVENTS_PER_BOOKING_ACTION).toBe(MAX_OCCURRENCES);
  });
});

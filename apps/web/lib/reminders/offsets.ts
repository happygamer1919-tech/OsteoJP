// Reminder offset configuration + scheduling math.
//
// Pure module — no DB, no SDK, no clock-of-its-own beyond the `now` passed in.
// "Which reminders are still worth sending for an appointment, and when" lives
// here so it can be unit-tested deterministically.

import type { ReminderOffsetId } from "./templates";

export type ReminderOffset = {
  id: ReminderOffsetId;
  /** Minutes before appointment start that this reminder fires. */
  minutesBefore: number;
};

/**
 * Two nudges with reschedule runway — the standard clinic no-show pattern, and
 * the set both template docs were authored against (48h + 24h). Ordered
 * earliest-firing first.
 */
export const REMINDER_OFFSETS: readonly ReminderOffset[] = [
  { id: "48h", minutesBefore: 48 * 60 },
  { id: "24h", minutesBefore: 24 * 60 },
] as const;

export type DueReminder = {
  offsetId: ReminderOffsetId;
  /** Absolute instant the reminder should be delivered. */
  sendAt: Date;
};

/**
 * Given an appointment start and "now", return the reminders that still have a
 * send time in the future. Offsets whose send time has already passed (e.g. an
 * appointment booked 10h out skips the 48h and 24h reminders) are dropped — we
 * never schedule a reminder into the past.
 *
 * Pure: callers pass `now` explicitly so the result is deterministic in tests.
 */
export function computeDueReminders(startsAt: Date, now: Date): DueReminder[] {
  const due: DueReminder[] = [];
  for (const offset of REMINDER_OFFSETS) {
    const sendAt = new Date(startsAt.getTime() - offset.minutesBefore * 60_000);
    if (sendAt.getTime() > now.getTime()) {
      due.push({ offsetId: offset.id, sendAt });
    }
  }
  return due;
}

/**
 * Stable idempotency key for a single (appointment, offset) reminder. Inngest
 * dedupes runs on this, which is why Stream E needs no sent-log table: the same
 * appointment+offset can be enqueued repeatedly and only fires once.
 */
export function reminderIdempotencyKey(
  appointmentId: string,
  offsetId: ReminderOffsetId,
): string {
  return `${appointmentId}:${offsetId}`;
}

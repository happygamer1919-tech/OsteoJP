// Reminder offset configuration + scheduling math.
//
// Pure module — no DB, no SDK, no clock-of-its-own beyond the `now` passed in.
// "Which reminders are still worth sending for an appointment, and when" lives
// here so it can be unit-tested deterministically.

import type { ReminderOffsetId } from "./templates";
import type { Channel } from "@osteojp/notify";

export type ReminderOffset = {
  id: ReminderOffsetId;
  /** Minutes before appointment start that this reminder fires. */
  minutesBefore: number;
  /**
   * The channel this offset goes out on. ONE channel per offset, deliberately:
   * two nudges on two different media beats two nudges on the same one, and it
   * halves SMS cost versus sending both channels at both offsets.
   *
   * 48h email: the patient has runway to reschedule, and email carries the
   * signed reschedule link (the token is far too long for one GSM-7 segment).
   * 24h SMS: immediate and hard to miss, pointing at the clinic phone.
   */
  channel: Channel;
};

/**
 * Two nudges with reschedule runway — the standard clinic no-show pattern, and
 * the set both template docs were authored against (48h + 24h). Ordered
 * earliest-firing first.
 */
export const REMINDER_OFFSETS: readonly ReminderOffset[] = [
  { id: "48h", minutesBefore: 48 * 60, channel: "email" },
  { id: "24h", minutesBefore: 24 * 60, channel: "sms" },
] as const;

/**
 * The ONE channel an offset goes out on. Derived from REMINDER_OFFSETS so the
 * scheduler, the dispatcher and the server-side routing guard cannot disagree.
 *
 * WHY AN ACCESSOR RATHER THAN THREE READS OF THE ARRAY. Before this, "48h is
 * email" was a fact the scheduler asserted (it fans out `offset.channel`) and
 * the dispatcher merely INHERITED, by being handed the channel the scheduler
 * chose. Nothing refused a `(48h, sms)` pair, so the owner's routing rule held
 * only as long as every caller kept passing the right pair. The rule is now
 * enforced where the send happens - see `dispatchReminder` - and this is the
 * single definition both sides ask.
 *
 * Returns undefined for an unknown id rather than defaulting to a channel: a
 * routing question with no answer must refuse the send, never guess one.
 */
export function channelForOffset(offsetId: ReminderOffsetId): Channel | undefined {
  return REMINDER_OFFSETS.find((o) => o.id === offsetId)?.channel;
}

export type DueReminder = {
  offsetId: ReminderOffsetId;
  channel: Channel;
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
      due.push({ offsetId: offset.id, channel: offset.channel, sendAt });
    }
  }
  return due;
}

/**
 * Stable idempotency key for a single (appointment, offset, CHANNEL) reminder.
 * Inngest dedupes runs on this, which is why Stream E needs no sent-log table.
 *
 * CHANNEL IS NOT OPTIONAL AND IS NOT REDUNDANT. Today each offset carries one
 * channel, so channel looks derivable from offsetId — that is exactly the trap.
 * The moment an offset carries both (a 24h email as well as a 24h SMS, which is
 * a config change, not a code change), a key without channel makes Inngest
 * silently dedupe the second channel against the first. No error, no log, no run:
 * the patient simply never receives one of them. Including channel costs nothing
 * now and removes a failure mode that would be invisible when it arrives.
 */
export function reminderIdempotencyKey(
  appointmentId: string,
  offsetId: ReminderOffsetId,
  channel: Channel,
): string {
  return `${appointmentId}:${offsetId}:${channel}`;
}

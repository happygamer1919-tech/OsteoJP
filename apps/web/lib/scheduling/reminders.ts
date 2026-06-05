import { enqueueAppointmentReminders } from "@/lib/reminders";

// Bridge from a committed appointment mutation (Stream B) to the reminder
// pipeline (Stream E). Kept out of the server action's DB transaction on purpose:
// enqueueAppointmentReminders does a network send (inngest.send), and a network
// call must never run inside an open Postgres transaction — nor should reminders
// be enqueued for a row that later rolls back. Callers invoke this AFTER the
// transaction has committed successfully.
//
// No "server-only" here so it stays unit-testable under vitest's node env, the
// same choice lib/reminders/index.ts and clients.ts make.

export type ReminderEnqueueTarget = {
  appointmentId: string;
  /** The appointment's CURRENT start instant (post-create / post-reschedule). */
  startsAt: Date;
};

/**
 * Enqueue reminders for each affected appointment occurrence, best-effort.
 *
 * - Create: pass every created occurrence (recurring series included) so each
 *   gets its own reminders.
 * - Reschedule: pass each moved occurrence with its NEW startsAt. Re-enqueuing is
 *   how supersession happens — the new appointment/scheduled event cancels the
 *   prior sleeping reminder run (cancelOn, matched on appointment id) and the new
 *   send instant starts a fresh run. So the patient never gets the old time.
 *
 * Best-effort by design: the appointment is already persisted, so a failed
 * enqueue is logged (sanitized — no PII; ids are uuids) and swallowed rather than
 * surfaced as a user-facing failure. A miss degrades to "no reminder", never to a
 * wrong reminder or a lost appointment.
 *
 * Safe with REMINDERS_LIVE_SEND off: this only emits the schedule event. The
 * actual email/SMS is gated to sandbox downstream in the send wrappers, so wiring
 * this in does NOT send anything real until the flag is flipped separately.
 */
export async function enqueueRemindersAfterCommit(
  tenantId: string,
  targets: ReminderEnqueueTarget[],
): Promise<void> {
  for (const t of targets) {
    try {
      await enqueueAppointmentReminders({
        appointmentId: t.appointmentId,
        tenantId,
        startsAt: t.startsAt,
      });
    } catch (e) {
      console.error(
        "scheduling: reminder enqueue failed",
        e instanceof Error ? e.name : "unknown",
      );
    }
  }
}

import { enqueueAppointmentReminders, enqueueFollowUp, enqueueNoShow } from "@/lib/reminders";
import { MAX_OCCURRENCES } from "./recurrence";
import type { MoveConfirmation } from "./move-confirmation";

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
  /**
   * Q-K. The appointment's CURRENT Terapeuta (post-create / post-reschedule).
   * Required: it rides every appointment/scheduled event, because the
   * confirmation's duplicate key is appointment + start + therapist
   * (lib/reminders/inngest/functions.ts).
   */
  practitionerId: string;
  /**
   * Q-K. What this save means for the patient's confirmation, set by a MOVE
   * (`rescheduleAppointment`) from `moveConfirmation` (./move-confirmation.ts)
   * and by nobody else.
   * Absent: today's confirmation, email and SMS (a booking, an acceptance, a
   * visit brought back to Confirmada, a change of start).
   *   "therapist_only"  the Terapeuta changed and the start did not: the email
   *                     alone, the SMS only when there is no email on file.
   *   "none"            neither changed: no confirmation at all. The event is
   *                     still emitted, for the reminders.
   */
  confirmation?: MoveConfirmation;
  /**
   * BOOK-CONFIRM. True only for the acceptance of an online booking request;
   * built by `acceptedPedidoTarget` in ./pedido-acceptance.ts and nowhere else.
   * Carried onto the event so the confirmation dispatch can tell an acceptance
   * from a reschedule. Per TARGET, not per call: one `updateAppointment` can
   * accept a pedido and bring another row back from Cancelada in the same list.
   */
  acceptedPedido?: boolean;
  /**
   * BOOK-CONFIRM, the public-form path. True only for the ONE occurrence a
   * guest request was linked to; built by `acceptedGuestRequestTarget` in
   * ./guest-link.ts and nowhere else. It asks the confirmation dispatch to read
   * the link row; the dispatch never acts on the marker alone.
   */
  acceptedGuestRequest?: boolean;
};

/**
 * Hard ceiling on events emitted by ONE booking action. Derived from
 * MAX_OCCURRENCES rather than restated, so the two cannot drift: a booking action
 * can never legitimately touch more occurrences than a series can contain. Above
 * this we throw rather than emit, because the plausible causes (an unbounded
 * series, a scope resolving to the wrong set) are all bugs whose blast radius is
 * measured in SMS to real patients.
 */
export const MAX_EVENTS_PER_BOOKING_ACTION = MAX_OCCURRENCES;

export class ReminderBurstError extends Error {
  constructor(readonly attempted: number) {
    super(
      `scheduling/reminders: ${attempted} appointment events in one booking action exceeds ` +
        `the ${MAX_EVENTS_PER_BOOKING_ACTION} ceiling. Refusing to emit. This is a bug, not a ` +
        `large booking: a single action cannot legitimately touch more occurrences than a series holds.`,
    );
    this.name = "ReminderBurstError";
  }
}

/**
 * Enqueue reminders for each affected appointment occurrence, best-effort.
 *
 * - Create: pass every created occurrence (recurring series included) so each
 *   gets its own reminders.
 * - Reschedule: pass each moved occurrence with its NEW startsAt. Re-enqueuing is
 *   how supersession happens — the new appointment/scheduled event cancels the
 *   prior sleeping reminder run (cancelOn, matched on appointment id) and the new
 *   send instant starts a fresh run. So the patient never gets the old time.
 *   A re-save that keeps the start (therapist, clinic or duration changed; a
 *   visit brought back from Cancelada) starts a fresh run too, since
 *   2026-10-07: before that its replacement was dropped as a duplicate key and
 *   the reminder was lost (lib/reminders/inngest/functions.ts).
 *   Q-K: what such a re-save owes the CONFIRMATION is the target's
 *   `confirmation` field; the reminders are emitted either way.
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
  if (targets.length > MAX_EVENTS_PER_BOOKING_ACTION) {
    // Loud, and BEFORE any send. Throwing here is deliberate: the callers wrap
    // this in their own try/catch, but a burst is not a degraded reminder, it is
    // a defect that would page real patients.
    throw new ReminderBurstError(targets.length);
  }

  // Exactly one confirmation per booking action. The FIRST occurrence carries it;
  // 2..n schedule reminders only. The invariant lives here, not at the three call
  // sites, so a future call site inherits it instead of having to remember it.
  const eligibleIndex = confirmationEligibleIndex(targets);

  for (const [i, t] of targets.entries()) {
    try {
      await enqueueAppointmentReminders({
        appointmentId: t.appointmentId,
        tenantId,
        startsAt: t.startsAt,
        practitionerId: t.practitionerId,
        confirmationEligible: i === eligibleIndex,
        ...(t.acceptedPedido === true ? { acceptedPedido: true } : {}),
        ...(t.acceptedGuestRequest === true ? { acceptedGuestRequest: true } : {}),
        ...(t.confirmation === "therapist_only" ? { therapistChangeOnly: true } : {}),
      });
    } catch (e) {
      console.error(
        "scheduling: reminder enqueue failed",
        e instanceof Error ? e.name : "unknown",
      );
    }
  }
}

/**
 * Which occurrence carries the confirmation: the EARLIEST by start instant, not
 * merely index 0. Callers build their target arrays from different queries
 * (create maps `created`, reschedule maps `targets`) and neither guarantees a
 * sort, so keying on the array position alone would make the patient's
 * confirmation depend on row order. Returns -1 for an empty list.
 *
 * Q-K: a target whose save owes no confirmation (`confirmation: "none"`) is
 * never chosen, so a list of those returns -1 and the action sends none. And
 * a FULL confirmation (no `confirmation` field) wins over a therapist-only one
 * before the start is compared: in a series move where some occurrences
 * changed start and others only changed Terapeuta, the start change is the one
 * the patient must hear about (rule 1), with both legs. Without a Q-K field
 * on any target this is the earliest start, exactly as before.
 *
 * Exported for direct testing.
 */
export function confirmationEligibleIndex(targets: readonly ReminderEnqueueTarget[]): number {
  const rank = (t: ReminderEnqueueTarget) => (t.confirmation === "therapist_only" ? 1 : 0);
  let best = -1;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (t.confirmation === "none") continue;
    if (best === -1) {
      best = i;
      continue;
    }
    const b = targets[best]!;
    if (rank(t) < rank(b) || (rank(t) === rank(b) && t.startsAt.getTime() < b.startsAt.getTime())) {
      best = i;
    }
  }
  return best;
}

export type StatusNotificationTarget = {
  appointmentId: string;
  endsAt: Date;
};

/**
 * Emit completion or no-show events for each affected appointment, best-effort,
 * post-commit. Mirrors the enqueueRemindersAfterCommit pattern: network calls
 * stay outside the DB transaction, a failed enqueue is logged and swallowed.
 */
export async function enqueueStatusNotificationsAfterCommit(
  tenantId: string,
  targets: StatusNotificationTarget[],
  status: "completed" | "no_show",
): Promise<void> {
  const enqueue = status === "completed" ? enqueueFollowUp : enqueueNoShow;
  for (const t of targets) {
    try {
      await enqueue({ appointmentId: t.appointmentId, tenantId, endsAt: t.endsAt });
    } catch (e) {
      console.error(
        `scheduling: ${status} notification enqueue failed`,
        e instanceof Error ? e.name : "unknown",
      );
    }
  }
}

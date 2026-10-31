import { randomUUID } from "node:crypto";
import { enqueueAppointmentReminders, enqueueFollowUp, enqueueNoShow } from "@/lib/reminders";
import { MAX_OCCURRENCES } from "./recurrence";
import { CONFIRMABLE_STATUSES } from "@/lib/reminders/confirmable-statuses";
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
   * Required: it rides every appointment/scheduled event.
   */
  practitionerId: string;
  /**
   * Q-K. What this save means for the patient's confirmation, set by a MOVE
   * (`rescheduleAppointment`) from `moveConfirmation` (./move-confirmation.ts)
   * and by nobody else.
   * Absent: today's confirmation, email and SMS (a booking, an acceptance, a
   * visit brought back to Confirmada, a change of start).
   *   "therapist_only"  the Terapeuta changed and the start and the clinic did
   *                     not: the email alone, the SMS only when there is no
   *                     usable email.
   *   "none"            neither changed: no confirmation at all. The event is
   *                     still emitted, for the reminders.
   */
  confirmation?: MoveConfirmation;
  /**
   * Q-K. The row's status AFTER the save, where the caller knows it (the move
   * and the un-cancel set it). A row whose status cannot be confirmed
   * (CONFIRMABLE_STATUSES) never carries the confirmation; absent means "not
   * known here", and the dispatch's own status gate still applies.
   */
  status?: string;
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
 * Q-N: ONE CALL IS ONE SAVE. The call makes the save's marker (`saveId`, a
 * random uuid) once, here, and puts it on every event it emits. The
 * confirmation's duplicate key is appointment + that marker
 * (lib/reminders/inngest/functions.ts), so a second delivery of an event is
 * dropped and a second save is not. Every emitter of appointment/scheduled in
 * the application reaches Inngest through this function, so none of them can
 * send an event without a marker; lib/reminders/index.ts requires it.
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
  const eligibleIndex = confirmationEligibleIndex(targets, Date.now());

  // Q-N: made once per save, BEFORE the loop, so every event of this save
  // carries the same marker, and a retried send of one event carries it too.
  const saveId = randomUUID();

  for (const [i, t] of targets.entries()) {
    try {
      await enqueueAppointmentReminders({
        appointmentId: t.appointmentId,
        tenantId,
        startsAt: t.startsAt,
        practitionerId: t.practitionerId,
        saveId,
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
 * Q-K: a target that CANNOT be confirmed is never chosen: its save owes no
 * confirmation (`confirmation: "none"`), its status is known and is not one a
 * confirmation goes out for (a cancelled occurrence moved with its series),
 * or its start is not after `nowMs` (a past occurrence). Those are left out
 * BEFORE the rank, so none of them can take the confirmation from an
 * occurrence that would send it; a list of only those returns -1 and the
 * action sends none. And
 * a FULL confirmation (no `confirmation` field) wins over a therapist-only one
 * before the start is compared: in a series move where some occurrences
 * changed start and others only changed Terapeuta, the start change is the one
 * the patient must hear about (rule 1), with both legs. Without a Q-K field
 * on any target this is the earliest start, exactly as before.
 *
 * Exported for direct testing.
 */
export function confirmationEligibleIndex(
  targets: readonly ReminderEnqueueTarget[],
  nowMs: number = Date.now(),
): number {
  const rank = (t: ReminderEnqueueTarget) => (t.confirmation === "therapist_only" ? 1 : 0);
  const confirmable = (t: ReminderEnqueueTarget) =>
    t.confirmation !== "none" &&
    (t.status === undefined || CONFIRMABLE_STATUSES.has(t.status)) &&
    t.startsAt.getTime() > nowMs;
  let best = -1;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (!confirmable(t)) continue;
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
  /**
   * R37. The appointment's patient, read in the save's own transaction, so the
   * completion can ask the canary list (lib/reminders/follow-up-start.ts).
   * Read for a completion only: the no-show event does not use it, and its
   * targets carry null. null on a completion fails closed for canary.
   */
  patientId: string | null;
};

/**
 * Q-O. After a "Corrigir estado" INTO Concluida commits, ask for the
 * satisfaction survey: the same appointment/completed event the ordinary
 * Estado path emits, marked `surveyOnly`, so the 24 hour function sends the
 * survey alone and never the follow-up message. Whether a correction asks at
 * all (into Concluida, a visit that ended in the last 7 days or has not
 * ended yet) is
 * `correctionAsksSurvey` in ./estado-correction.ts; the caller emits only
 * when it says so.
 *
 * Best-effort and post-commit, like the others here: the correction stands,
 * and a failed enqueue is logged without a payload and swallowed.
 */
export async function enqueueSurveyAfterCorrection(
  tenantId: string,
  target: StatusNotificationTarget,
): Promise<void> {
  try {
    // R37: enqueueFollowUp sends nothing when no survey can result for this
    // patient under the switch as it reads now.
    await enqueueFollowUp({
      appointmentId: target.appointmentId,
      tenantId,
      endsAt: target.endsAt,
      patientId: target.patientId,
      surveyOnly: true,
    });
  } catch (e) {
    console.error("scheduling: correction survey enqueue failed", e instanceof Error ? e.name : "unknown");
  }
}

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
  for (const t of targets) {
    try {
      const args = { appointmentId: t.appointmentId, tenantId, endsAt: t.endsAt };
      // R37: a completion starts the 24 hour run only when a message can
      // result; enqueueFollowUp decides, with the patient. The no-show event
      // is untouched: it is a different event with its own function.
      if (status === "completed") await enqueueFollowUp({ ...args, patientId: t.patientId });
      else await enqueueNoShow(args);
    } catch (e) {
      console.error(
        `scheduling: ${status} notification enqueue failed`,
        e instanceof Error ? e.name : "unknown",
      );
    }
  }
}

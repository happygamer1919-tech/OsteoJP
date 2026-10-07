import { sql } from "drizzle-orm";
import type { DbTx } from "@osteojp/db";
import { enqueueRemindersAfterCommit, type ReminderEnqueueTarget } from "./reminders";

// W14-02 — ACCEPTING A PORTAL PEDIDO IS ONE EVENT, WHICHEVER DOOR IT COMES
// THROUGH. Owner ruling 2026-09-10 (M2 Option A).
//
// A portal booking is a PEDIDO and emits nothing when it is made. The owner
// ruled 2026-08-31 that its confirmation - and with it the reminder schedule -
// starts when reception ACCEPTS it, and #1085 put that emit in
// confirmAppointmentRequest (the Pedidos queue). Three other writers can also
// move an unaccepted pedido to `confirmed`, and none of them emitted:
//
//   - the drawer's Estado selector      updateAppointment (actions.ts)
//   - the SMS review queue              resolveReviewItem (lib/reminders/inbound-store.ts)
//   - the patient's own SIM reply       applyInboundReply (lib/reminders/inbound-reply.ts)
//
// Each became a real confirmed appointment with no run behind it. They now emit
// exactly as confirmAppointmentRequest does: one target per accepted pedido,
// post-commit, best-effort.
//
// ONLY FOR AN UNACCEPTED PEDIDO, AND THAT IS THE SAFETY HALF. A staff booking,
// or a pedido already accepted, has had its run since creation or acceptance. A
// second `appointment/scheduled` at an unchanged start CANCELS its sleeping
// reminder runs (cancelOn) and the replacements are dropped by the 24h
// idempotency key (lib/reminders/inngest/functions.ts): emitting for such a row
// would REMOVE its reminders. THAT WAS TRUE UNTIL 2026-10-07: the reminder key
// now carries the save, so the replacement runs. The rule here stands anyway,
// because the confirmation key is unchanged and an event nobody needs is still
// an event. So pedido-ness is read BEFORE the write, from the
// database's own definition (public.is_unconfirmed_pedido, 0059/0067), which is
// SECURITY DEFINER so the answer does not depend on who is asking.
//
// No "server-only" here, the same choice ./reminders.ts makes, so the helpers
// stay unit-testable under vitest's node environment.

/**
 * True when `appointmentId` is an unaccepted portal pedido RIGHT NOW. Must be
 * called inside the writing transaction and BEFORE the status write: the
 * function requires `status = 'scheduled'`, so afterwards it answers false.
 */
export async function isUnconfirmedPedido(tx: DbTx, appointmentId: string): Promise<boolean> {
  const res = (await tx.execute(
    sql`SELECT public.is_unconfirmed_pedido(${appointmentId}::uuid) AS pedido`,
  )) as unknown;
  const rows = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
  return (rows[0] as { pedido?: boolean } | undefined)?.pedido === true;
}

/**
 * Which of `appointmentIds` are unaccepted portal pedidos RIGHT NOW, in one
 * statement. The database's own definition (public.is_unconfirmed_pedido), read
 * inside the caller's transaction, so it sees the caller's own writes.
 *
 * ==========================================================================
 * WHY A MOVE OR AN UN-CANCEL OF AN UNACCEPTED PEDIDO MUST NOT EMIT. 2026-10-03.
 * ==========================================================================
 * `rescheduleAppointment` and the un-cancel in `updateAppointment` used to emit
 * `appointment/scheduled` for every row they touched. For an unaccepted pedido
 * that event could send nothing (the dispatch refuses both the confirmation and
 * the reminders while the request is unaccepted) but it was not harmless: it
 * started a send-appointment-confirmation run whose idempotency key is
 * `appointmentId:confirmation:startsAt`, and its fan-out spent the reminder
 * keys `appointmentId:offset:channel:sendAt`. Inngest remembers a key for 24
 * hours. So when reception then ACCEPTED the request at that same start within
 * the day, the acceptance's confirmation run was dropped as a duplicate, and
 * its reminder runs too (the acceptance's own event cancels the sleeping runs
 * and their replacements carry the keys already seen). The patient got no
 * confirmation and no reminders, and nothing anywhere recorded an attempt.
 * (Since 2026-10-07 the reminder key carries the save, so the reminder half of
 * this can no longer happen; the confirmation half still can.)
 *
 * THE FIX IS TO NOT EMIT, not to change a key: the key and the trigger filter
 * are untouched.
 *
 * NOTHING IS LOST BY STAYING SILENT, in every case:
 *   - A request never accepted has NO runs at all. The portal emits nothing at
 *     booking time (apps/api has no Inngest client), so there is nothing for a
 *     move to supersede. Moved once or moved five times, it reaches acceptance
 *     with every key unspent, and the acceptance's event schedules the
 *     confirmation and both reminders at the FINAL start.
 *   - A request accepted, cancelled, then brought back to Agendada IS an
 *     unaccepted pedido again and may still have sleeping reminder runs from
 *     its first acceptance. Left alone they wake at the old instant and the
 *     dispatch refuses them (`unconfirmed`), so the old time never sends. If
 *     reception accepts it again, that event cancels them (cancelOn matches on
 *     the appointment id) and schedules the new ones.
 *   - An ACCEPTED appointment is not a pedido here and is never filtered: its
 *     move re-emits exactly as before, which is what supersedes its reminders.
 *
 * An empty list asks nothing and answers the empty set.
 */
export async function unconfirmedPedidoIdsAmong(
  tx: DbTx,
  appointmentIds: readonly string[],
): Promise<Set<string>> {
  if (appointmentIds.length === 0) return new Set();
  const res = (await tx.execute(sql`
    SELECT a.id::text AS id
      FROM public.appointments a
     WHERE a.id IN (${sql.join(
       appointmentIds.map((i) => sql`${i}::uuid`),
       sql`, `,
     )})
       AND public.is_unconfirmed_pedido(a.id)
  `)) as unknown;
  const rows = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
  return new Set(rows.map((r) => (r as { id: string }).id));
}

/**
 * BOOK-CONFIRM: the enqueue target for an ACCEPTED pedido, carrying the marker.
 *
 * ONE PLACE WRITES THE MARKER. All four doors that can accept a pedido build
 * their target here, so the event they emit says "this is an acceptance" in the
 * same way, and a fifth door inherits it by calling this instead of having to
 * remember a field. The confirmation dispatch reads it to send the
 * booking-approved message; a reschedule's target is built by hand, without it,
 * and keeps today's confirmation.
 */
export function acceptedPedidoTarget(appointmentId: string, startsAt: Date): ReminderEnqueueTarget {
  return { appointmentId, startsAt, acceptedPedido: true };
}

/**
 * Emit the accepted pedido's `appointment/scheduled` AFTER the commit. One
 * target makes it confirmationEligible (confirmationEligibleIndex over a
 * one-element list), so the confirmation sends exactly once, at acceptance.
 *
 * NEVER THROWS. The pedido really is accepted by the time this runs, so a failed
 * enqueue must not be reported as a failed acceptance - the same contract as
 * afterCommit in actions.ts. Logged with the step and the error NAME only,
 * never the message, which can carry patient data (CLAUDE.md rule 7).
 */
export async function emitAcceptedPedidoReminders(
  step: string,
  tenantId: string,
  targets: ReminderEnqueueTarget[],
): Promise<void> {
  if (targets.length === 0) return;
  try {
    await enqueueRemindersAfterCommit(tenantId, targets);
  } catch (e) {
    console.error(`scheduling: post-commit ${step} failed`, e instanceof Error ? e.name : "unknown");
  }
}

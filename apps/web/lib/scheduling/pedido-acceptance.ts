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
// would REMOVE its reminders. So pedido-ness is read BEFORE the write, from the
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

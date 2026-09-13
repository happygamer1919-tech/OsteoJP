import type { AppointmentStatusValue } from "./types";

/**
 * SCHED-27 — bringing a Cancelada appointment back. Owner approval, 2026-09-13,
 * all four points as recommended:
 *
 *   1. Option A: Cancelada -> Agendada or Confirmada through the ordinary Estado
 *      control. Concluída and Falta stay on "Corrigir estado" (SCHED-25), which
 *      re-checks the slot since SCHED-28.
 *   2. Therapists cannot un-cancel: the same people who can cancel (owner, admin,
 *      reception - appointments:delete).
 *   3. A FUTURE appointment brought back emits appointment/scheduled so its
 *      reminders exist again. A past one fires nothing, because its offsets have
 *      passed; that is expected, not a defect.
 *   4. The Corrigir estado clash check is SCHED-28.
 *
 * Pure, so the rules below are table tests rather than claims.
 */
export function isUncancel(from: AppointmentStatusValue, to: AppointmentStatusValue): boolean {
  return from === "cancelled" && (to === "scheduled" || to === "confirmed");
}

export type PackBalanceRow = {
  instanceId: string;
  sessionsTotal: number;
  legacyConsumed: number;
  /** Linked appointments that consume a session: NOT cancelled (PACK_CONSUMING_STATUS_SQL). */
  linkedAppointments: number;
};

/**
 * The pacote instances an un-cancel would overdraw.
 *
 * A cancelled appointment stops using its pacote session, because the balance
 * counts only non-cancelled linked rows. Bringing it back uses the session again,
 * so the rows being un-cancelled on one instance must fit in what that instance
 * has left. The rows are NOT already in `linkedAppointments` - they are still
 * cancelled when this is read - so they are added here, never double-counted.
 */
export function uncancelPackShortfall(
  balances: readonly PackBalanceRow[],
  rowsPerInstance: ReadonlyMap<string, number>,
): string[] {
  return balances
    .filter(
      (b) => b.sessionsTotal - b.legacyConsumed - b.linkedAppointments < (rowsPerInstance.get(b.instanceId) ?? 0),
    )
    .map((b) => b.instanceId);
}

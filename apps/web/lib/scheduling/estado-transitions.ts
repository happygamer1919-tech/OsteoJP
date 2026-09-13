import type { AppointmentStatusValue } from "./types";

/**
 * Lifecycle-legal Estado transitions for the per-row Estado control (W5-09).
 *
 * This is the LIFECYCLE axis only (`appointment_status`). It is deliberately
 * kept DISTINCT from the orthogonal confirmation axis
 * (`appointment_confirmation_state`, migration 0024, DECISIONS 0024/0026): this
 * map only ever names lifecycle values, so the Estado control can never set a
 * confirmation-axis value.
 *
 * Rules (matching how the codebase already treats the lifecycle):
 *   - `cancelled` is NEVER offered here. Cancelling is a delete-capability
 *     action and routes through cancelAppointment; updateAppointment even
 *     refuses `patch.status === "cancelled"` server-side. So the Estado control
 *     changes only the non-cancel lifecycle states; Cancel is its own control.
 *   - `completed` and `no_show` have NO onward lifecycle transition from this
 *     control — once a visit is concluded or a no-show, its lifecycle is closed
 *     here (a typo is fixed through "Corrigir estado", estado-correction.ts).
 *   - `cancelled` → `scheduled` | `confirmed`. SCHED-27, owner 2026-09-13: a
 *     cancelled appointment can be brought back. This line used to read that
 *     all three terminal states were closed; the owner reversed it for
 *     `cancelled` only. The server gates the move to the people who can cancel
 *     (appointments:delete) and re-checks the slot, the clinic closure, NESA's
 *     location and the pacote balance (actions.ts, updateAppointment). Concluída
 *     and Falta from `cancelled` stay on the correction door, so the two doors
 *     never offer the same move.
 *   - `scheduled` → `confirmed` | `completed` | `no_show`.
 *   - `confirmed`  → `completed` | `no_show` (already confirmed; cannot go back
 *     to `scheduled`).
 *
 * A transition is "legal" iff the target appears in the current state's list.
 * The UI both (a) offers only these targets and (b) guards the submit with
 * isLegalEstadoTransition, so an illegal jump is rejected before any server
 * call — the server itself is unchanged (no new lifecycle rule authored there).
 */
const LEGAL: Record<AppointmentStatusValue, AppointmentStatusValue[]> = {
  scheduled: ["confirmed", "completed", "no_show"],
  confirmed: ["completed", "no_show"],
  completed: [],
  cancelled: ["scheduled", "confirmed"],
  no_show: [],
};

/** The lifecycle-legal target states reachable from `from` via the Estado control. */
export function legalEstadoTransitions(
  from: AppointmentStatusValue,
): AppointmentStatusValue[] {
  return LEGAL[from];
}

/** True iff moving `from` → `to` is a lifecycle-legal Estado transition. */
export function isLegalEstadoTransition(
  from: AppointmentStatusValue,
  to: AppointmentStatusValue,
): boolean {
  return LEGAL[from].includes(to);
}

/** True iff `from` has at least one legal onward Estado transition. */
export function hasLegalEstadoTransition(from: AppointmentStatusValue): boolean {
  return LEGAL[from].length > 0;
}

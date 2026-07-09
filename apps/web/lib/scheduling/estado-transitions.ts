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
 *   - Terminal states (`completed`, `cancelled`, `no_show`) have NO onward
 *     lifecycle transition from this control — once a visit is concluded, a
 *     no-show, or cancelled, its lifecycle is closed here.
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
  cancelled: [],
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

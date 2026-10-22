import type { AppointmentStatusValue } from "./types";

/**
 * CORRECTING A FINAL STATE. Owner ruling, 2026-09-10.
 *
 * ==========================================================================
 * WHAT THE CLINIC HIT
 * ==========================================================================
 * An appointment was set to `cancelled` by mistake and had to become
 * `completed`. Every route refused it with "Mudança de estado não permitida":
 * `estado-transitions.ts` maps all three final states to `[]`, and
 * `updateAppointment` enforces that map on the server (actions.ts, INC-08 (a)).
 *
 * The refusal is CORRECT for the lifecycle and WRONG for a typo, and those are
 * different things. A lifecycle transition asserts something happened; a
 * correction asserts the record was wrong. Conflating them is what left a
 * cancelled visit permanently cancelled.
 *
 * ==========================================================================
 * SO IT IS A SEPARATE DOOR, NOT A WIDER MAP
 * ==========================================================================
 * `LEGAL` in estado-transitions.ts is UNCHANGED and stays the rule for the
 * ordinary Estado control. This module is a second, explicitly-named path:
 * "Corrigir estado", reception and up, one final state to another.
 *
 * WHY NOT JUST ADD THE EDGES TO `LEGAL`: because that map is what the Estado
 * <Select> renders from, and the ruling is that a correction must NEVER be
 * reachable through the normal control. Widening the map would put
 * "cancelada → concluída" one click away in the same dropdown that records
 * real lifecycle events, and the audit trail could no longer tell an operator
 * correcting a mistake from one recording an outcome. Two doors, two actions,
 * two audit actions.
 *
 * PENDING AND CONFIRMADA ARE UNTOUCHED. A non-final state is not a correction
 * case: it still has ordinary onward transitions, and the ruling names only the
 * three finals.
 */

/** The three states the ruling calls final. Order is the display order. */
export const FINAL_STATES = ["completed", "cancelled", "no_show"] as const;

export type FinalStatus = (typeof FINAL_STATES)[number];

/** True iff `s` is one of the three final states a correction can move between. */
export function isFinalStatus(s: AppointmentStatusValue): s is FinalStatus {
  return (FINAL_STATES as readonly string[]).includes(s);
}

/**
 * The states a correction may move `from` to: the OTHER finals, never itself.
 *
 * Empty for a non-final state, which is what keeps `scheduled` and `confirmed`
 * out of this path entirely — the caller does not need a second check, and a
 * future status that is not in FINAL_STATES gets no correction door by default
 * rather than by omission.
 */
export function correctionTargets(from: AppointmentStatusValue): FinalStatus[] {
  if (!isFinalStatus(from)) return [];
  return FINAL_STATES.filter((s) => s !== from);
}

/**
 * True iff `from` → `to` is a legal CORRECTION.
 *
 * Both ends must be final and they must differ. A no-op correction is refused
 * rather than accepted-and-ignored: it would write an audit row claiming a
 * change that did not happen, and an audit row that lies is worse than none.
 */
export function isLegalEstadoCorrection(
  from: AppointmentStatusValue,
  to: AppointmentStatusValue,
): boolean {
  return isFinalStatus(from) && isFinalStatus(to) && from !== to;
}

/**
 * SCHED-28 — does this correction put the row BACK into the slot?
 *
 * `cancelled` and `no_show` release the slot (0052) and `completed` holds it, so
 * the only corrections that can double-book are the two into `completed`. The
 * other four either leave the blocking set or move between two states that are
 * both outside it, and checking them would refuse nothing a clinic could act on.
 *
 * Measured, not argued: on 2026-09-12 a Cancelada row moved to Concluída over a
 * booking made after the cancel was ACCEPTED by the database, and this door ran
 * no check at all. The caller runs the conflict check exactly when this is true.
 */
export function correctionEntersBlockingSet(
  from: AppointmentStatusValue,
  to: AppointmentStatusValue,
): boolean {
  return (from === "cancelled" || from === "no_show") && to === "completed";
}

/** Q-O: how far back a visit may have ended for a correction to ask the survey. */
export const CORRECTION_SURVEY_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * Q-O. Does this correction ask for the satisfaction survey? Strategy's ruling
 * of 2026-10-22: "emit on a correction into Concluida, only for visits that
 * ended in the last 7 days, same 24 h and 60-day rules."
 *
 * True only for a legal correction INTO `completed` (from Cancelada or Falta)
 * of a visit whose end is at or before `nowMs` and no more than 7 days before
 * it. A correction OUT of `completed`, or into anything else, asks nothing,
 * which is what it did before.
 *
 * A VISIT THAT HAS NOT ENDED YET (marked Falta early, then corrected) has not
 * "ended in the last 7 days", so it asks nothing. That reading is the
 * ruling's words; whether such a visit should ask is an open question.
 *
 * The 24 hour wait and the 60-day rule are not here: the event this answer
 * emits runs the same Inngest function and the same issue door as an
 * ordinary Concluida (lib/reminders/inngest/functions.ts, the 0102 door).
 */
export function correctionAsksSurvey(
  from: AppointmentStatusValue,
  to: AppointmentStatusValue,
  endsAt: Date,
  nowMs: number,
): boolean {
  if (to !== "completed" || !isLegalEstadoCorrection(from, to)) return false;
  const sinceEnd = nowMs - endsAt.getTime();
  return sinceEnd >= 0 && sinceEnd <= CORRECTION_SURVEY_WINDOW_MS;
}

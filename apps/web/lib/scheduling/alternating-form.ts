import { addDays } from "./time";

/**
 * The Alternadas dialog's two answerable questions, as pure functions.
 *
 * WHY THIS IS NOT A BOOLEAN. The panel used to gate its Guardar on one
 * conjunction of six terms, and a disabled button with no sentence beside it
 * tells reception NOTHING: every one of the six looks identical from outside,
 * and the two that bite in practice (the same clinic in both weeks, an end time
 * at or before the start) are invisible on a form where every field looks
 * filled. The dialog now lists EVERY reason at once rather than the first one
 * found - a list that shortens as you fix things is a form you can finish; a
 * single reason that changes each time you fix it is a guessing game.
 *
 * The functions return i18n KEYS, never sentences: the panel is the only thing
 * that knows how to render, and the copy stays in packages/i18n where the pt-PT
 * wording is reviewed.
 */

export type AlternatingFormState = {
  weekdays: number[];
  startDate: string;
  endDate: string;
  locationAId: string;
  locationBId: string;
  startTime: string;
  endTime: string;
};

/** i18n keys for every reason the form cannot be saved, in form order. */
export function alternatingBlockingReasons(state: AlternatingFormState): string[] {
  const reasons: string[] = [];
  if (state.weekdays.length === 0) reasons.push("schedule.altBlockNoWeekday");
  if (state.startDate === "") reasons.push("schedule.altBlockNoStart");
  if (state.endDate === "") reasons.push("schedule.altBlockNoEnd");
  // Only meaningful once BOTH dates exist: reporting "the end is before the
  // start" on an empty field would be a second sentence about the same gap.
  if (state.startDate !== "" && state.endDate !== "" && state.endDate < state.startDate) {
    reasons.push("schedule.altBlockEndBeforeStart");
  }
  if (state.locationAId === "" || state.locationBId === "") reasons.push("schedule.altBlockNoClinic");
  else if (state.locationAId === state.locationBId) reasons.push("schedule.altBlockSameClinic");
  if (state.endTime <= state.startTime) reasons.push("schedule.altBlockEndTimeNotAfterStart");
  return reasons;
}

/**
 * The window the dialog opens with. Both dates prefilled, and prefilled to
 * something a human would have typed.
 *
 * IT STARTS ON THE NEXT MONDAY, not today. The pattern alternates BY WEEK, so a
 * window that opens on a Wednesday makes week A a three-day week - the first
 * thing anyone would fix by hand, and the kind of off-by-a-few-days that is
 * invisible until a therapist is at the wrong clinic.
 *
 * IT RUNS EIGHT WEEKS, which is four A weeks and four B weeks: a WHOLE number of
 * two-week cycles, so the pattern does not stop halfway through one. Eight weeks
 * also sits inside the three-month horizon the plan type documents, with room to
 * extend by hand.
 */
export function defaultAlternatingWindow(todayIso: string): { startDate: string; endDate: string } {
  const weekday = new Date(`${todayIso}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  // Sunday 1, Monday 7 (the NEXT one, never today), Tuesday 6 ... Saturday 2.
  const daysToMonday = (8 - weekday) % 7 || 7;
  const startDate = addDays(todayIso, daysToMonday);
  // 8 whole weeks INCLUSIVE of the start day: 56 days spans Monday to Sunday
  // eight times, so the last day is start + 55.
  return { startDate, endDate: addDays(startDate, 55) };
}

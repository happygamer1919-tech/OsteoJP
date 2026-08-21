/**
 * RB-01 — the recuperacao selection WINDOW, and nothing else.
 *
 * PURE MODULE: no DB, no env, NO `server-only` — unit-testable anywhere, the
 * same choice `lib/reminders/phone.ts` makes and for the same reason. A
 * `server-only` import here would buy nothing (there is no secret and no
 * connection to protect) and would cost the boundary tests below, which are the
 * only proof this arithmetic is right.
 *
 * Extracted from the query on purpose. The predicate has three clauses and only
 * this one is arithmetic over dates, which is the clause a reader cannot check
 * by eye and the one a test can pin exactly. The other two clauses ("no future
 * appointment", "not currently postponed") are existence checks that read as
 * what they are.
 *
 * THE RULE, as ruled by the owner 2026-08-20, verbatim: *a completed attendance
 * from the first day of the PREVIOUS month until 7 days ago*.
 *
 * ==========================================================================
 * IT IS THE PATIENT'S MOST RECENT ATTENDANCE THAT MUST FALL IN THE WINDOW, NOT
 * MERELY SOME ATTENDANCE. THIS IS THE ONE INTERPRETATION DECISION HERE.
 * ==========================================================================
 * Read as "has any completed attendance in the window", a patient seen in July
 * AND again three days ago qualifies — and reception rings somebody they saw on
 * Tuesday. The list would be wrong in the direction that costs the clinic
 * credibility with its own patients.
 *
 * Read as "their LAST completed attendance falls in the window", both ends of
 * the window do the work the ruling wants:
 *   - the **late** end (7 days ago) means *not seen recently*, so nobody is
 *     chased days after walking out of the clinic;
 *   - the **early** end (first of the previous month) means *seen recently
 *     enough to still be a live relationship*. A patient last seen in February
 *     is a different conversation and deliberately not on this list.
 *
 * WHY 7 DAYS IS AT THE END AND NOT THE START. It is a quiet period, not a
 * deadline: the patient may simply not have rung yet, and the clinic does not
 * want to appear to be chasing a booking the moment a treatment finishes.
 *
 * TIMEZONE. Both boundaries are computed in **Europe/Lisbon**, because "the
 * first day of the previous month" is a claim about the clinic's calendar and
 * not about UTC. In January that means December of the previous year, which
 * `Date.UTC` handles by construction rather than by a branch — a month index of
 * -1 rolls the year back, and the test pins it.
 */

export type FollowupWindow = {
  /** Inclusive. Midnight Lisbon on the first day of the previous month. */
  from: Date;
  /** Inclusive. `now` minus 7 days. */
  to: Date;
};

/** Days of quiet before a patient appears on the list. */
export const FOLLOWUP_QUIET_DAYS = 7;

/**
 * The Lisbon offset from UTC at a given instant, in minutes.
 *
 * DERIVED FROM THE Intl DATABASE, NEVER HARDCODED. Portugal is UTC+0 in winter
 * and UTC+1 in summer, so a fixed offset is wrong for roughly half the year and
 * wrong in a way nobody notices: a window boundary an hour out only changes the
 * answer for a patient seen within an hour of midnight, which is rare enough to
 * survive every casual test and still be wrong.
 */
function lisbonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * The window, computed from an explicit `now`.
 *
 * `now` IS A PARAMETER AND NOT `new Date()` INSIDE. A function that reads the
 * clock cannot be tested at a month boundary, at a DST change, or in January —
 * which are the three cases where this function is capable of being wrong. The
 * caller passes the clock; the test passes the interesting instants.
 */
export function followupWindow(now: Date): FollowupWindow {
  const offset = lisbonOffsetMinutes(now);
  // The wall-clock date in Lisbon, expressed as a UTC instant so the month
  // arithmetic below is plain integer arithmetic on Y/M rather than string work.
  const lisbonWall = new Date(now.getTime() + offset * 60000);

  // Month index minus one. December of the previous year needs no special case:
  // Date.UTC(2027, -1, 1) is 2026-12-01.
  const firstOfPreviousMonth = Date.UTC(
    lisbonWall.getUTCFullYear(),
    lisbonWall.getUTCMonth() - 1,
    1,
    0,
    0,
    0,
    0,
  );

  // Back to a real instant. The offset is re-derived AT THAT DATE, not reused
  // from `now`: a window opening on 1 July and closing in late July spans a DST
  // change in the general case, and reusing one offset for both ends is how a
  // boundary silently moves by an hour.
  const provisional = new Date(firstOfPreviousMonth);
  const fromOffset = lisbonOffsetMinutes(provisional);
  const from = new Date(firstOfPreviousMonth - fromOffset * 60000);

  const to = new Date(now.getTime() - FOLLOWUP_QUIET_DAYS * 24 * 60 * 60 * 1000);

  return { from, to };
}

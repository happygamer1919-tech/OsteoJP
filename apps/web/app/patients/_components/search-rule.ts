/**
 * PERF-08 — WHAT A KEYSTROKE IN THE PATIENT SEARCH SHOULD DO.
 *
 * ==========================================================================
 * A PURE FUNCTION, BECAUSE THE RULE IS THE THING WORTH PINNING
 * ==========================================================================
 * This lived inside the filter bar's change handler, where it could only be
 * tested by rendering a component - and this repository has no DOM test
 * harness, deliberately (no jsdom, no testing-library; rule 13 says a new
 * dependency is asked for, not assumed). Extracting the decision means the rule
 * gets exhaustive tests and the component keeps only the wiring.
 *
 * ==========================================================================
 * THE MINIMUM LENGTH IS NOT BECAUSE SHORT SEARCHES ARE EXPENSIVE
 * ==========================================================================
 * They are not. Measured against the shipped RLS policies at production row
 * counts, one location-scoped receptionist, the SAME search costs the same
 * whatever its length:
 *
 *     "s"      1,750 matches    396 ms
 *     "si"       350 matches    706 ms
 *     "sil"      350 matches    423 ms
 *     "silv"     350 matches    475 ms
 *     "silva"    350 matches    334 ms
 *
 * FLAT. Postgres applies RLS quals BEFORE user quals, as a security barrier, so
 * the per-row policy work happens on all 8,400 patients and the ILIKE only
 * narrows what survives it. The text filter's selectivity buys nothing at all.
 *
 * SO THE WIN IS FEWER QUERIES, NOT CHEAPER ONES. Every debounced keystroke is a
 * full page render of /patients. Skipping the one- and two-character renders
 * removes up to two of them per surname, and the no-op check below removes the
 * rest of the ones that would have asked the same question twice.
 */

/** Milliseconds of quiet before a search is issued. Was 300. */
export const DEBOUNCE_MS = 500;

/**
 * Below this, no search is issued. Three is where a surname prefix starts
 * being an answer rather than a letter: "s" matches 1,750 of 8,400.
 */
export const MIN_SEARCH_LENGTH = 3;

export type SearchTarget =
  /** Nothing to do: this keystroke asks the question the URL already answers. */
  | { navigate: false }
  /** Navigate, setting `q` to this value. `null` removes the filter. */
  | { navigate: true; q: string | null };

/**
 * Decide what a keystroke should do, given the box's raw value and the `q`
 * currently in the URL.
 *
 * BELOW THE MINIMUM MEANS "NO FILTER", NOT "KEEP THE OLD ONE". The first version
 * of this returned early on a short value, which left a stale filter applied:
 * type "silva", backspace to "si", and the list still showed silva's results
 * while the box said "si". Mapping short to null keeps the box and the list
 * telling the same story at every keystroke.
 *
 * AND A NAVIGATION THAT CHANGES NOTHING IS REFUSED. Typing "s" then "i" into an
 * empty box both resolve to no filter, and re-issuing the same URL is a full
 * page render for no new information - which is the cost this whole change
 * exists to remove.
 */
export function nextSearchTarget(raw: string, currentQ: string | null): SearchTarget {
  const trimmed = raw.trim();
  const q = trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : null;
  if (q === (currentQ === "" ? null : currentQ)) return { navigate: false };
  return { navigate: true, q };
}

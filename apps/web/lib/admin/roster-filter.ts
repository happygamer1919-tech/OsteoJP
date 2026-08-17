/**
 * SCHED-03 - matching a therapist name the way somebody at reception types it.
 *
 * A FUNCTION AND NOT AN INLINE `.includes()`, for the reason the rest of this
 * repo extracts rules: components here are rendered with
 * `renderToStaticMarkup` and there is no DOM harness, so a predicate living
 * inside a component is a predicate nothing can assert.
 *
 * ===========================================================================
 * DIACRITICS ARE THE WHOLE POINT, NOT A REFINEMENT
 * ===========================================================================
 * The clinic is Portuguese and so are the names on this roster: Abilio, Ines,
 * Joao, Antonio. A plain `toLowerCase().includes()` answers NO when somebody
 * types "abilio" and the record says "Abilio" with an accent - and the failure
 * is silent and total: the card simply is not there, which reads as "that
 * therapist is not at this clinic" rather than as "your search missed".
 *
 * Reception types on a hurry, on a keyboard, mid-call. They will not stop to
 * find the acute. So BOTH SIDES are folded - the query and the name - and a
 * search with an accent finds a record without one just as well as the reverse.
 *
 * NFD SPLITS A LETTER FROM ITS MARK, and the mark is then removed by the
 * `\p{Diacritic}` class. It is done this way rather than with a hand-written
 * character map because a map is a list somebody has to remember to extend, and
 * the first name it does not carry fails silently in exactly the way above.
 *
 * THIS IS NOT A SECURITY BOUNDARY AND FILTERS NOTHING SENSITIVE. The roster it
 * narrows was already resolved server-side by `resolveScheduleScope`; this only
 * decides which of the cards the viewer is entitled to see are on screen.
 */
export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Does this name match what was typed?
 *
 * AN EMPTY QUERY MATCHES EVERYTHING, which is what makes the unfiltered roster
 * the default state rather than a special case the caller has to remember to
 * handle. A query of only spaces is the same thing: somebody has typed nothing.
 *
 * SUBSTRING, NOT PREFIX. Reception knows people by first name and by surname,
 * and half of this roster is filed under the other one.
 */
export function matchesName(name: string, query: string): boolean {
  const q = foldName(query);
  if (q === "") return true;
  return foldName(name).includes(q);
}

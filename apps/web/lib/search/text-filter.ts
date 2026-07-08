/**
 * Shared client/server text filter for list-surface search (W5-02).
 *
 * Accent- and case-insensitive substring match, so "joao" finds "João" and
 * "TERAPEUTA" finds "Terapeuta". Pure presentation-side filtering over data a
 * role has already read: never a query-semantics or visibility change.
 */

/** Lowercase and strip combining diacritics for comparison. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * True when the (normalized) query is a substring of any haystack.
 * An empty/whitespace query matches everything (filter off).
 */
export function matchesSearch(
  query: string,
  ...haystacks: (string | null | undefined)[]
): boolean {
  const q = normalizeSearchText(query);
  if (q.length === 0) return true;
  return haystacks.some((h) => !!h && normalizeSearchText(h).includes(q));
}

/**
 * U1 — the pager's DECISIONS, as a plain module.
 *
 * ==========================================================================
 * WHY THIS IS NOT INSIDE THE COMPONENT
 * ==========================================================================
 * `apps/web` runs vitest in the NODE environment with no jsdom: component tests
 * here render to a string via `react-dom/server` and cannot click anything. The
 * three things worth proving about a pager — that it clamps, that the ellipsis
 * lands in the right places, and that junk typed into "Ir para página" sends no
 * request — are pure functions of (page, pageCount, input), so they live where a
 * test can call them directly.
 *
 * Same shape and the same reason as `app/patients/_components/search-rule.ts`,
 * which exists so the debounce decision can be tested without a DOM harness.
 *
 * ==========================================================================
 * THE DEFECT THIS EXISTS TO END
 * ==========================================================================
 * Three screens (/patients, /recuperacao, /comunicacoes/lembretes-sms) each
 * render ONLY "Anterior" and "Seguinte" links. Reaching page 100 is 99 clicks,
 * and there is no way to reach the last page at all without knowing how many
 * there are and clicking that many times. Every one of the three built its own
 * copy of the same two links, so the fix is one module and one component rather
 * than three near-identical edits.
 */

/** A rendered slot in the number strip: a page to link, or a gap marker. */
export type PageItem = number | "ellipsis";

/**
 * How many neighbours flank the current page. Two each side gives the
 * `1 … 8 9 [10] 11 12 … 100` shape the spec asks for: five consecutive numbers
 * centred on the current page, with the first and last page always reachable.
 */
export const PAGE_WINDOW = 2;

/**
 * Force any number into 1..pageCount.
 *
 * NOT A VALIDATOR — it never rejects. A page far past the end lands on the last
 * page rather than showing an empty list, which is the same correction
 * `listPatientsPage` already applies server-side (`Math.min(page, pageCount)`).
 * Doing it here too means the LINK is right before the request is made, so the
 * URL a user lands on is the URL that describes what they are looking at.
 *
 * A pageCount below 1 is treated as 1: a list with no results still has a
 * "page 1", and returning 0 would produce a link to `?page=0`.
 */
export function clampPage(raw: number, pageCount: number): number {
  const last = Math.max(1, Math.floor(pageCount) || 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(last, Math.max(1, Math.floor(raw)));
}

/**
 * The number strip, with gaps collapsed to a single marker.
 *
 * Returns `[]` for a single page: the spec hides the whole pager when N = 1, and
 * returning `[1]` would tempt a caller into rendering a lone dead button.
 *
 * The first and last page are ALWAYS present when there is more than one, which
 * is what makes "Última" reachable in one action from anywhere — the specific
 * complaint that opened this ticket.
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  const last = Math.max(1, Math.floor(pageCount) || 1);
  if (last <= 1) return [];

  const current = clampPage(page, last);

  // The window, plus the two anchors. A Set because the window overlaps the
  // anchors near either end and a duplicate "1" would render twice.
  const wanted = new Set<number>([1, last]);
  for (let p = current - PAGE_WINDOW; p <= current + PAGE_WINDOW; p += 1) {
    if (p >= 1 && p <= last) wanted.add(p);
  }

  const sorted = [...wanted].sort((a, b) => a - b);

  // A gap of exactly one page becomes that page, never an ellipsis: printing
  // "1 … 3" to hide a single "2" is wider than the thing it replaces and costs
  // the reader a click they should not need.
  const items: PageItem[] = [];
  let previous: number | null = null;
  for (const p of sorted) {
    if (previous !== null) {
      if (p - previous === 2) items.push(previous + 1);
      else if (p - previous > 2) items.push("ellipsis");
    }
    items.push(p);
    previous = p;
  }
  return items;
}

/**
 * What "Ir para página" should do with what was typed.
 *
 * Returns a page number to navigate to, or `null` meaning SEND NO REQUEST.
 *
 * `null` for empty and for anything non-numeric is the spec's explicit
 * requirement, and it is the half that is easy to get wrong: `Number("")` is 0
 * and `parseInt("abc")` is NaN, so a careless implementation navigates to
 * `?page=0` or `?page=NaN` the moment somebody presses Enter on an empty box.
 * Both produce a request that cannot be satisfied, and the second one reaches
 * the server as a string it must then defend against.
 *
 * A number that IS typed is clamped rather than refused: typing 999 into a
 * 100-page list means "the end", and answering that with an error message would
 * be pedantry. Leading and trailing whitespace is ignored; a decimal, a sign, or
 * anything else with a non-digit in it is not a page number.
 */
export function parseGotoPage(input: string, pageCount: number): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Digits only. This deliberately rejects "1.5", "-2", "1e3" and "12abc",
  // each of which Number() would otherwise accept or half-accept.
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return clampPage(parsed, pageCount);
}

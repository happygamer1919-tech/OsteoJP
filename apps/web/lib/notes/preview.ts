/**
 * NOTES-PREVIEW — the ONE definition of what a note excerpt on a list row is.
 *
 * ==========================================================================
 * PURE, AND SEPARATE FROM EVERY SURFACE THAT RENDERS ONE
 * ==========================================================================
 * Two surfaces show a note without a click - the Recuperação row and the
 * Marcações row - and a third (the agenda hover) already showed one. Three
 * copies of "cut it at about this many characters" drift, and the drift is
 * invisible: each screen looks fine on its own. Same argument
 * `pack-balance.ts` makes for the balance formula and `patient-label.ts` for
 * the withheld name.
 *
 * ==========================================================================
 * IT RETURNS null FOR "NOTHING TO SHOW", AND THAT IS A DELIBERATE SHAPE
 * ==========================================================================
 * The dispatch is explicit: "No notes means render nothing, not an empty
 * affordance." A caller that receives `null` has nothing to draw; a caller
 * that received `""` would draw an empty box, and a caller that received
 * `"—"` would draw a claim that the note is blank. A note whose body is
 * whitespace is the same case as no note at all - it says nothing - so it
 * collapses to `null` here rather than at each call site.
 *
 * ==========================================================================
 * NEWLINES BECOME SPACES, WHICH IS NOT COSMETIC
 * ==========================================================================
 * These rows are scanned. A note with six line breaks renders six lines tall
 * on a list of fifty, and the list stops being a list - the same reasoning the
 * Marcações row's two-line layout records about a long patient name shoving
 * every column along. The FULL text keeps its formatting: it is one press away
 * in the board, which renders `whitespace-pre-line`.
 */

/**
 * How much of a note reaches a row.
 *
 * 160 characters is about two lines at the row's text size, which is the most
 * a list row can carry without becoming a document. It is a presentation
 * number and not a clinical one: the excerpt never decides anything, it only
 * says whether this is the patient who asked not to be chased.
 */
export const NOTE_PREVIEW_MAX_CHARS = 160;

export type NoteExcerpt = {
  /** What the row prints. Never empty. */
  text: string;
  /** True when `text` is shorter than the note. Drives the ellipsis and the
   *  "read the rest" affordance; NEVER inferred from `text.length`, which
   *  cannot tell a note that is exactly 160 characters from a cut one. */
  truncated: boolean;
};

/**
 * The excerpt for one note body, or null when there is nothing to show.
 *
 * CUT AT A WORD BOUNDARY WHEN ONE IS CLOSE, and at the hard limit when it is
 * not. A word boundary reads better; a note with no spaces in 160 characters
 * (a URL, a long identifier) must still be cut, so the boundary search is a
 * preference and never the rule. The threshold is deliberate: falling back to
 * the hard cut only when the last space is in the first 60% keeps the excerpt
 * from losing a third of its length to a single long word.
 */
export function noteExcerpt(body: string | null | undefined): NoteExcerpt | null {
  if (typeof body !== "string") return null;
  // Every run of whitespace - including the newlines - becomes ONE space, so a
  // note written as a list does not arrive as a column.
  const flat = body.replace(/\s+/gu, " ").trim();
  if (flat.length === 0) return null;
  if (flat.length <= NOTE_PREVIEW_MAX_CHARS) return { text: flat, truncated: false };

  const hard = flat.slice(0, NOTE_PREVIEW_MAX_CHARS);
  const lastSpace = hard.lastIndexOf(" ");
  const cut =
    lastSpace >= Math.floor(NOTE_PREVIEW_MAX_CHARS * 0.6) ? hard.slice(0, lastSpace) : hard;
  return { text: cut.trimEnd(), truncated: true };
}

/**
 * helpers/flight-span-labels.ts: find timing span labels (`db:...`) in a page's
 * served bytes, for the privacy guard in `timing-panel-audience.spec.ts`.
 *
 * PURE, ON PURPOSE: no Playwright import, no I/O. It takes the HTML string a
 * navigation answered with and returns what it found, so its unit test
 * (`lib/perf/flight-span-labels.test.ts`) runs without a browser.
 *
 * ==========================================================================
 * WHY A PATTERN OVER THE RAW BYTES WAS NOT ENOUGH, IN EITHER DIRECTION
 * ==========================================================================
 * Next.js writes the RSC flight payload into the page as a run of inline
 * scripts, each `self.__next_f.push([1,"<chunk>"])`, where `<chunk>` is a JSON
 * string with `<`, `>` and `&` further escaped as `\u003c`, `\u003e`, `\u0026`.
 * Searching those bytes as they stand fails both ways:
 *
 * - TOO MUCH. A flight ROW HEADER is a hex row id, a colon and an uppercase row
 *   tag at the start of a row: `\n1db:I[...]` is row `1db`, an import row. A
 *   loose `db:` pattern reads that as a label (the #1701 failure, `["db:I"]`).
 * - TOO LITTLE. A pattern narrowed against that (lowercase first letter, no
 *   letter or digit before `db`) misses a label that starts uppercase, with a
 *   digit or an underscore, or that follows an escaped `>` or `&`
 *   (`\u003edb:...` ends in `e`), or that is glued to a word. And no pattern
 *   over raw bytes sees a label the serialiser split across two push chunks.
 *
 * So the flight chunks are decoded and joined first, and the pattern runs on
 * the decoded text, where a row header can be told from a label by position.
 *
 * ==========================================================================
 * THE ONE THING DROPPED, AND THE DEGRADED PATH
 * ==========================================================================
 * Only a match in the FLIGHT text that sits at a row start after a hex id
 * (`(?:^|\n)[0-9a-f]*` immediately before it) AND continues with an uppercase
 * letter is dropped. Everything else is kept, the remaining HTML is searched
 * with no exception at all, and nothing is dropped from it.
 *
 * If no push() chunk is found, `flight` is empty and the whole page is searched
 * as plain HTML: a change in how Next writes the payload degrades this to the
 * raw-bytes search, which may go red on a row header, and never to silence on
 * an unsplit label. A label split across chunks would be missed on that path;
 * what covers it is the spec's admin arm, which asserts `flightChunks > 0`, so
 * the degradation itself goes red on the run it happens.
 *
 * KNOWN LIMIT, THE DROP: a text row (`T`) whose content holds a newline, then a
 * hex run, then `db:` and an uppercase letter would be dropped too. No span
 * label is written that way today; it is recorded here rather than claimed
 * impossible.
 *
 * KNOWN LIMIT, FALSE POSITIVES. The drop is narrow on purpose, so some flight
 * shapes that are not labels are still reported as labels:
 * - a row id ending in "db" followed by a lowercase row tag;
 * - a row whose value is a JSON primitive (`1db:null`, `1db:true`, `1db:42`);
 * - a row header glued to the end of a `T` row's text, with no newline between.
 * Every one of these goes RED, never silently passes. The drop is not widened to
 * cover them; the real cure is a row walker that reads row lengths, carded
 * separately.
 */

/** Any `db:` label shape: letter, digit or underscore first, then those or `-`. */
const LABEL = /db:[A-Za-z0-9_][A-Za-z0-9_-]*/g;

/**
 * One inline flight instruction: `self.__next_f.push([1,"..."])` (a UTF-8 text
 * chunk) or `self.__next_f.push([3,"..."])` (a chunk Next could not decode as
 * UTF-8, written as base64). The string is matched as a JSON string literal,
 * escape by escape, so a `"` inside it can never end it early.
 */
const PUSH = /self\.__next_f\.push\(\[([13]),("(?:[^"\\]|\\[\s\S])*")\]\)/g;

/** A hex row id that starts at a row boundary, ending right where `db:` begins. */
const ROW_ID_BEFORE = /(?:^|\n)[0-9a-f]*$/;

export interface SplitPayload {
  /** The page with every decoded push() expression replaced by a space. */
  html: string;
  /** Every decoded chunk, in document order, joined with nothing between. */
  flight: string;
  /** How many push() chunks were decoded. 0 means `flight` is empty. */
  flightChunks: number;
}

/** Separate the inline RSC flight payload from the rest of the page, decoded. */
export function splitPayload(page: string): SplitPayload {
  let flight = "";
  let flightChunks = 0;
  const html = page.replace(PUSH, (_whole, kind: string, literal: string) => {
    // JSON.parse throws on a malformed literal, and that is wanted: a payload
    // this cannot read must fail the test, not pass it.
    const chunk = JSON.parse(literal) as string;
    // A [3] chunk is base64. Buffer.from(..., "base64") skips characters it does
    // not know instead of failing, so a chunk that is not base64 is refused here.
    if (kind === "3" && (chunk.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk))) {
      throw new Error("flight [3] chunk is not base64");
    }
    flight += kind === "3" ? Buffer.from(chunk, "base64").toString("utf8") : chunk;
    flightChunks += 1;
    return " ";
  });
  return { html, flight, flightChunks };
}

function labelsIn(text: string, dropRowHeaders: boolean): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(LABEL)) {
    const at = m.index ?? 0;
    const rowHeader =
      dropRowHeaders && /^db:[A-Z]/.test(m[0]) && ROW_ID_BEFORE.test(text.slice(0, at));
    if (!rowHeader) found.push(m[0]);
  }
  return found;
}

export interface SpanLabelScan {
  /** Every label found, HTML first then flight, duplicates kept. */
  labels: string[];
  /** The labels found in the decoded flight text alone. */
  flightLabels: string[];
  /** How many push() chunks were decoded (see `splitPayload`). */
  flightChunks: number;
}

/** Every `db:` span label a page's bytes carry, flight row headers excepted. */
export function scanSpanLabels(page: string): SpanLabelScan {
  const { html, flight, flightChunks } = splitPayload(page);
  const flightLabels = labelsIn(flight, true);
  return { labels: [...labelsIn(html, false), ...flightLabels], flightLabels, flightChunks };
}

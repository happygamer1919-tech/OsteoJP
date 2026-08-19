import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ==========================================================================
 * LE-notes-list-hydration-mismatch — the stamp must not depend on the runtime.
 * ==========================================================================
 * `toLocaleString("pt-PT")` with no `timeZone` formats in whatever zone the
 * process is in. Server-rendered on Vercel (UTC) and re-rendered in the
 * viewer's browser, the same instant produced two different strings and React
 * logged a hydration failure.
 *
 * WHY A SOURCE-LEVEL ARM AND NOT A RENDER TEST. The defect is the ABSENCE of an
 * option, and it only shows when two runtimes in different zones format the
 * same instant — which a single-process test cannot stage. What it CAN do is
 * refuse the shape that caused it, in the file that caused it.
 *
 * THE VACUOUS-PASS GUARD IS NOT DECORATION. An assertion that "no bare call
 * exists" passes trivially against an empty read, a renamed file, or a typo in
 * the path — so the file is asserted to contain the formatter first. Criterion
 * F: a guard proves a test ran; only the assertion proves it tested the right
 * subject.
 */
const SRC = readFileSync(join(__dirname, "notes-list.tsx"), "utf8");

/**
 * COMMENTS STRIPPED BEFORE SCANNING, and this is not defensive tidiness — the
 * first version of this file FAILED ON ITS OWN DOC COMMENT. The comment above
 * `stamp()` quotes `toLocaleString("pt-PT")` to describe the defect, and a raw
 * text scan cannot tell a description from a call.
 *
 * That is criterion F at the tooling level: matching a MENTION rather than a
 * USE — the same shape as the assertion that matched an `import` instead of the
 * JSX element, and the same shape as RECON-02's first draft matching a doc
 * comment about a deleted suite. Third instance in one day, which is why the
 * repo already has the pattern: `audit-override-trace.test.ts` strips exactly
 * like this.
 *
 * SAFE HERE, and criterion C is why that needs saying: `strip()` also blanks
 * template literals, which is where SQL lives — so this technique is wrong for
 * an anti-SQL assertion. What is being looked for here is a plain call
 * expression in JSX, which no template literal hides.
 */
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the notes list formats in a fixed zone, not the runtime's", () => {
  it("VACUOUS-PASS GUARD: the file was read, and survived stripping", () => {
    // Asserted on the STRIPPED body, not the raw source: if stripping ever ate
    // the code as well as the comments, every assertion below would pass over
    // an empty string and prove nothing.
    expect(BODY.length).toBeGreaterThan(500);
    expect(BODY).toMatch(/function stamp\(/);
  });

  it("pins Europe/Lisbon", () => {
    // Not merely "a" fixed zone: it is the zone this product displays in
    // (CLAUDE.md), and the one the notification centre already uses. UTC would
    // also have removed the mismatch and shown a Lisbon clinic a time nobody in
    // the building recognises.
    expect(BODY).toMatch(/timeZone:\s*"Europe\/Lisbon"/);
  });

  it("has NO bare toLocaleString/toLocaleDateString/toLocaleTimeString left", () => {
    // The card named one line; the same defect was on three. This is what stops
    // a fourth being added next to them.
    const bare = [
      ...BODY.matchAll(/toLocale(?:String|DateString|TimeString)\(\s*"pt-PT"\s*\)/g),
    ];
    expect(
      bare.length,
      `bare locale formatting must not return: ${bare.map((m) => m[0]).join(", ")}`,
    ).toBe(0);
  });
});

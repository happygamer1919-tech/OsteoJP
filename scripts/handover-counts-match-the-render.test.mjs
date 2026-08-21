// The handover's card counts must be the counts ON THE BOARD, not the counts in
// the file behind it.
//
// WHY THIS EXISTS. `docs/board/HANDOVER-STATE.md` is written FOR THE OWNER, and
// he counts cards by looking at the rendered board. The JSON behind it holds
// FIVE MORE: the external-agenda cards, which `render-board.mjs` deliberately
// drops from the artifact, from the lane counts and from the fingerprint because
// the owner tracks them on his own agenda.
//
// So there are two true numbers, and only one of them belongs in a document
// addressed to him. On 2026-08-21 a report quoted 195 where his screen said 190,
// he asked whether it should be 190, and it should. The handover had the same
// class of error one batch older and staler: "194 cards. 147 shipped, 47 open".
//
// A PROSE NOTE WOULD NOT HAVE FIXED THIS, which is the whole reason the check is
// mechanical. The renderer ALREADY prints "5 card(s) NOT rendered and NOT
// counted" on every run; that line was there each time and was read past. A
// second sentence saying the same thing is one more thing to read past. This
// fails the build instead.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = join(ROOT, "docs/board/portal-board.json");
const HANDOVER = join(ROOT, "docs/board/HANDOVER-STATE.md");
const RENDERER = join(ROOT, "docs/board/render-board.mjs");

/**
 * The renderer's own filter, restated.
 *
 * IT IS RESTATED RATHER THAN IMPORTED because `render-board.mjs` exports nothing
 * and runs at import: it reads `process.argv` and writes a file. Importing it
 * from a test would render the board as a side effect.
 *
 * A RESTATED RULE DRIFTS, so the second test below pins the renderer's source.
 * If that filter ever changes, this guard fails and says which line to look at,
 * rather than going on comparing against a rule the product no longer uses.
 * Same shape as the frozen-column guard asserting the schema still names it.
 */
const RENDERER_FILTER = "(c) => c.external_agenda !== true";
const rendered = (cards) => cards.filter((c) => c.external_agenda !== true);

/** The one live headline. The dated blocks further down are snapshots and are
 *  deliberately NOT matched: rewriting a record of what was true on a date is a
 *  different and worse thing than correcting a stale live claim. */
const HEADLINE = /^\*\*(\d+) cards on the board\. (\d+) shipped, (\d+) open\./m;

test("the handover headline quotes the RENDERED counts", () => {
  const board = JSON.parse(readFileSync(BOARD, "utf8"));
  const shown = rendered(board.cards ?? []);
  const shipped = shown.filter((c) => c.status === "shipped").length;
  const expected = { total: shown.length, shipped, open: shown.length - shipped };

  const m = readFileSync(HANDOVER, "utf8").match(HEADLINE);
  assert.ok(
    m,
    "HANDOVER-STATE.md has no line matching " +
      '"**N cards on the board. N shipped, N open."\n' +
      `It should read: **${expected.total} cards on the board. ${expected.shipped} shipped, ${expected.open} open.**`,
  );

  const actual = { total: Number(m[1]), shipped: Number(m[2]), open: Number(m[3]) };
  assert.deepEqual(
    actual,
    expected,
    `The handover disagrees with the board.\n` +
      `  handover says: ${actual.total} cards, ${actual.shipped} shipped, ${actual.open} open\n` +
      `  board renders: ${expected.total} cards, ${expected.shipped} shipped, ${expected.open} open\n` +
      `If the difference is exactly ${(board.cards ?? []).length - expected.total}, you have quoted the JSON ` +
      `total instead of the rendered one - the external-agenda cards are not on his board.`,
  );
});

test("the renderer still filters the way this guard assumes", () => {
  // The restated rule above is only safe while it matches. This is the line that
  // makes the drift loud.
  assert.ok(
    readFileSync(RENDERER, "utf8").includes(RENDERER_FILTER),
    `docs/board/render-board.mjs no longer contains ${RENDERER_FILTER}. ` +
      "The rendered-card rule changed, so the count comparison in this file is " +
      "now against a rule the product does not use. Update both together.",
  );
});

test("the count that is checked is a number a human can find", () => {
  // A guard on a line nobody can locate is a guard nobody can satisfy. The
  // headline must sit directly under the live-board link, which is what the
  // owner opens.
  const src = readFileSync(HANDOVER, "utf8");
  const link = src.indexOf("**Live board:**");
  const headline = src.search(HEADLINE);
  assert.ok(link > -1, "HANDOVER-STATE.md no longer carries the live-board link");
  assert.ok(
    headline > link && headline - link < 400,
    "the counts headline is no longer directly beneath the live-board link",
  );
});

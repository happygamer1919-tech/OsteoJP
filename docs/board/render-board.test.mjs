import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * render-board.test.mjs — THE EXCLUSION, AND THE THREE THINGS IT MUST NOT DO.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS ON THE DAY THE EXCLUSION SHIPS.
 * ==========================================================================
 * Nothing tested the renderer before this. That was tolerable while it rendered
 * everything: the artifact was a function of the board, and a wrong render was
 * visible on the page. `external_agenda` breaks that property — it makes the
 * render a STRICT SUBSET of the board, and the difference between the two is
 * invisible on the page BY CONSTRUCTION. A card wrongly excluded does not look
 * wrong; it looks like a card that was never there.
 *
 * So the three ways this can go wrong are asserted directly:
 *   1. it hides too little — a flagged card still reaches the data island;
 *   2. it hides too much — an ordinary card is dropped;
 *   3. it hides QUIETLY — the counts, the fingerprint, or the operator's
 *      console say nothing about the difference.
 *
 * And one thing the exclusion MUST NOT reach: the refuse-to-render-a-lie guard.
 * If flagging a card could silence that check, the field would become a way to
 * smuggle an unevidenced shipped card past the renderer.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = join(HERE, "render-board.mjs");
const REAL_PORTAL = join(HERE, "portal-board.json");

const TMP = mkdtempSync(join(tmpdir(), "board-render-"));
let seq = 0;

/**
 * Render a board object and return { code, out, err, html }.
 *
 * EVERY FIXTURE STARTS WITH THE FLAGS CLEARED, and the first version of this
 * file did not - which cost a red run. The real board already carries five
 * flagged cards, so a fixture that added one and asserted "1 card not rendered"
 * was asserting against six. These tests are about the MECHANISM, not about
 * which cards happen to be flagged today, and a fixture that inherits today's
 * board contents fails the day somebody flags a sixth.
 */
function render(mutate) {
  const board = JSON.parse(readFileSync(REAL_PORTAL, "utf8"));
  for (const c of board.cards) delete c.external_agenda;
  mutate(board);
  const boardPath = join(TMP, `board-${seq}.json`);
  const outPath = join(TMP, `out-${seq++}.html`);
  writeFileSync(boardPath, JSON.stringify(board));
  const r = spawnSync("node", [RENDERER, boardPath, outPath], { encoding: "utf8" });
  let html = "";
  try {
    html = readFileSync(outPath, "utf8");
  } catch {
    html = "";
  }
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", html };
}

/** The ids the renderer actually put in the data island. */
function renderedIds(html) {
  const m = html.match(/<script type="application\/json" id="board-data">([\s\S]*?)<\/script>/);
  assert.ok(m, "no board-data island in the rendered html");
  const data = JSON.parse(m[1].replace(/\\u003c/g, "<"));
  return data.cards.map((c) => c.id);
}

function fingerprintOf(html) {
  const m = html.match(/<script type="application\/json" id="board-data">([\s\S]*?)<\/script>/);
  return JSON.parse(m[1].replace(/\\u003c/g, "<")).fingerprint;
}

describe("external_agenda removes a card from the artifact and from its counts", () => {
  test("a flagged card is NOT in the rendered data island", () => {
    const r = render((b) => {
      b.cards[0].external_agenda = true;
    });
    assert.equal(r.code, 0, r.err);
    const board = JSON.parse(readFileSync(REAL_PORTAL, "utf8"));
    assert.ok(!renderedIds(r.html).includes(board.cards[0].id), `${board.cards[0].id} was rendered`);
    assert.equal(renderedIds(r.html).length, board.cards.length - 1);
  });

  test("an UNFLAGGED card is still rendered - the negative arm", () => {
    // Without this, a renderer that dropped every card would pass the test above
    // and report a clean exclusion of everything.
    const r = render(() => {});
    assert.equal(r.code, 0, r.err);
    const board = JSON.parse(readFileSync(REAL_PORTAL, "utf8"));
    const ids = renderedIds(r.html);
    // Every card, because the fixture cleared the flags.
    assert.equal(ids.length, board.cards.length);
    assert.ok(ids.includes(board.cards[0].id));
  });

  test("the lane counts and the reported total follow the VISIBLE set", () => {
    // A card excluded from the lanes but still inside the totals is the worst of
    // both - invisible and yet counted - and "39 open" against a page showing 34
    // is the kind of discrepancy that costs an hour to explain.
    const plain = render(() => {});
    const hidden = render((b) => {
      b.cards[0].external_agenda = true;
    });
    const n = (out) => Number(/rendered (\d+) cards/.exec(out)?.[1]);
    assert.equal(n(hidden.out), n(plain.out) - 1);
  });

  test("the render SAYS how many it dropped, rather than dropping them silently", () => {
    // A render that quietly dropped cards is indistinguishable from a render of
    // a board that never had them.
    const r = render((b) => {
      b.cards[0].external_agenda = true;
    });
    assert.match(r.out, /external agenda: 1 card\(s\) NOT rendered and NOT counted/);
  });

  test("and says nothing when there is nothing to say", () => {
    // The fixture already clears every flag, so this renders a board with none.
    const r = render(() => {});
    assert.doesNotMatch(r.out, /external agenda:/);
  });
});

describe("the fingerprint answers 'did what you can SEE change'", () => {
  test("it MOVES when a visible card changes", () => {
    // The positive control. Without it the next assertion passes for a
    // fingerprint that never changes at all.
    const a = render(() => {});
    const b = render((bd) => {
      bd.cards[0].last_checkpoint = "1999-01-01";
    });
    assert.notEqual(fingerprintOf(a.html), fingerprintOf(b.html));
  });

  test("it does NOT move when only a HIDDEN card changes", () => {
    // Hashing a card the viewer cannot see would fire the staleness notice at
    // somebody for whom nothing changed - a notification about invisible data,
    // which is noise that teaches people to ignore the notice.
    const a = render((b) => {
      b.cards[0].external_agenda = true;
    });
    const b2 = render((b) => {
      b.cards[0].external_agenda = true;
      b.cards[0].last_checkpoint = "1999-01-01";
      b.cards[0].notes = "changed, and invisible";
    });
    assert.equal(fingerprintOf(a.html), fingerprintOf(b2.html));
  });
});

describe("the exclusion decides what is DISPLAYED, never what is VERIFIED", () => {
  test("a shipped card with no evidence still BLOCKS the render when flagged", () => {
    // If flagging could silence this, the field would be a way to smuggle an
    // unevidenced shipped card past the renderer - a check that can be switched
    // off by the thing it is checking.
    const r = render((b) => {
      const c = b.cards.find((x) => x.status === "shipped");
      c.evidence = null;
      c.external_agenda = true;
    });
    assert.equal(r.code, 1);
    assert.match(r.err, /RENDER BLOCKED/);
    assert.match(r.err, /shipped w\/o evidence/);
  });

  test("and blocks it when NOT flagged - the adjacent state", () => {
    const r = render((b) => {
      b.cards.find((x) => x.status === "shipped").evidence = null;
    });
    assert.equal(r.code, 1);
    assert.match(r.err, /RENDER BLOCKED/);
  });
});

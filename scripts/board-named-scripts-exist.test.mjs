// SR-61: A SCRIPT THE OWNER IS ASKED TO RUN MUST EXIST ON origin/main AT THE
// MOMENT IT IS ASKED FOR. A path that does not exist is not a delivery.
//
// ===========================================================================
// WHERE THIS CAME FROM, AND THE FIRST DIAGNOSIS WAS WRONG
// ===========================================================================
// On 2026-09-09 the owner tried to run four owner-run reads named on the board
// and got nothing back from all of them. Reported as "authored and rehearsed in
// a lane, never merged".
//
// THEY WERE ALL MERGED. Every one of the five files - long-telefone-five.sql,
// backfill-counts.sql, notes-1027-provenance.sql and the two location backfills
// - is on origin/main at scripts/import/, and was before he tried. What was
// actually wrong is one step earlier and is not fixable by merging anything:
//
//   THE RUN RECIPE PRINTED IN EACH FILE'S OWN HEADER IS WORKING-TREE-RELATIVE
//   (`psql ... -f scripts/import/<file>.sql`), and the clone he runs from,
//   /Users/ivan/osteojp, is parked on a DETACHED HEAD from two days earlier
//   where none of the five files exists. Relative path, stale checkout, "No
//   such file or directory" - and the same shape one layer up, `git show
//   <ref>:<path>` against a ref that has not been fetched, produces git's own
//   "path does not exist in <ref>".
//
// SO THE RULE HAS TWO HALVES AND THIS FILE ENFORCES THE FIRST ONE. A path
// printed on the owner's only status surface must resolve. The second half -
// the recipe must be REF-ADDRESSED, not checkout-relative, and the report must
// state the ref - is a habit; this is the part a machine can hold.
//
// IT IS A GATE AND NOT A LINT because the operator does not read code. He copies
// a path off the board and pastes it. A stale path there is indistinguishable,
// from where he sits, from a broken script.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import assert from "node:assert/strict";
import test from "node:test";

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = join(ROOT, "docs/board/portal-board.json");

/**
 * A runnable path, as it would appear in prose on a card.
 *
 * THE PREFIX ALTERNATION IS ORDERED LONGEST-FIRST AND THAT IS LOAD-BEARING. A
 * bare `scripts/` alternative tried first matches the TAIL of
 * `.github/scripts/assert-rls-executed.mjs` and reports a file that exists as
 * missing. The first version of this scan produced four such phantoms out of six
 * hits, and `json` before `js` for the same reason: `js` matches first inside
 * `.json` and leaves `on` behind, which invented two more.
 *
 * THE LOOKBEHIND IS THE THIRD CLASS OF PHANTOM AND THE LAST ONE FOUND.
 * RB-02a quotes a source line - `imports { stripSqlComments } from
 * ../scripts/check-migration-functions.mjs` - which is a RELATIVE IMPORT from
 * packages/db/tests/, not a path anybody pastes into a shell. Without
 * `(?<![\w./-])` the scan reads the tail of it as `scripts/...` and reports a
 * missing file that is neither missing nor a deliverable. A relative path is
 * excluded outright rather than resolved: if it is relative it is being quoted
 * from code, and code is what CI already compiles.
 */
const SCRIPT_PATH =
  /(?<![\w./-])(?:\.github\/scripts|packages\/db\/scripts|apps\/[a-z]+\/scripts|scripts|tools)\/[A-Za-z0-9._/-]*\.(?:sql|mjs|jsonc|json|tsx|ts|js)\b/g;

/**
 * Paths the board names on purpose that are NOT deliverables, with the reason.
 *
 * AN ALLOWLIST IS A HOLE, so it is one entry long and it is specific. The
 * alternative - dropping the check for anything the scan finds awkward - is the
 * failure this file exists to prevent.
 */
const NOT_A_DELIVERABLE = new Map([
  [
    "packages/db/scripts/ficha-v5-only/osteopathy-v5.json",
    "LE-prod-apply-worktree-loose-scripts is an INVENTORY of 21 UNTRACKED files " +
      "in a different working copy (osteojp-prod-apply). It is a record of what " +
      "is loose on somebody's disk, not something anyone is asked to run, and " +
      "the card's whole point is that nothing has been moved or deleted.",
  ],
]);

const board = JSON.parse(readFileSync(BOARD, "utf8"));

/** Every script path the board names, with the card or ruling that names it. */
function namedPaths() {
  const hits = new Map();
  const scan = (where, s) => {
    if (typeof s !== "string") return;
    for (const m of s.match(SCRIPT_PATH) ?? []) {
      if (!hits.has(m)) hits.set(m, new Set());
      hits.get(m).add(where);
    }
  };
  for (const c of board.cards ?? []) {
    scan(c.id, c.title);
    scan(c.id, c.notes);
    scan(c.id, c.open_on_purpose);
    if (c.evidence) scan(c.id, JSON.stringify(c.evidence));
    if (c.spec) scan(c.id, JSON.stringify(c.spec));
  }
  for (const r of board.rulings ?? []) scan(r.id, JSON.stringify(r));
  for (const d of board.doctrine ?? []) {
    scan("doctrine", typeof d === "string" ? d : JSON.stringify(d));
  }
  return hits;
}

const named = namedPaths();

test("the scan found the board's script paths at all", () => {
  // VACUOUS-PASS GUARD. A regex that stopped matching would make the assertion
  // below pass over nothing, which is precisely the shape of failure that let
  // this defect exist: absence reading as health.
  assert.ok(
    named.size > 30,
    `only ${named.size} script paths found on a board of ${board.cards?.length} cards; the scan is broken`,
  );
  // And it must be finding paths in more than one directory, or the prefix
  // alternation has silently collapsed to one branch.
  const dirs = new Set([...named.keys()].map((p) => p.split("/")[0]));
  assert.ok(dirs.size >= 2, `every hit is under ${[...dirs]}; the prefix alternation is broken`);
});

test("every script path the board names EXISTS on disk", () => {
  const missing = [];
  for (const [path, where] of [...named].sort()) {
    if (NOT_A_DELIVERABLE.has(path)) continue;
    if (existsSync(join(ROOT, path))) continue;
    missing.push(`${path}   named by: ${[...where].join(", ")}`);
  }
  assert.deepEqual(
    missing,
    [],
    "SR-61: the board names a script that is not in this tree. The owner copies these paths\n" +
      "off the rendered board and pastes them; a path that does not resolve is\n" +
      "indistinguishable, from where he sits, from a broken script.\n\n  " +
      missing.join("\n  ") +
      "\n\nFix the PATH on the card (the file has usually moved, not vanished), or add the\n" +
      "file. Only add to NOT_A_DELIVERABLE if the board is naming it as a record rather\n" +
      "than as something to run, and say which.",
  );
});

test("the CONTROL: the scan reports a path that really is missing", () => {
  // Without this, a bug that made `namedPaths` return an empty map, or
  // `existsSync` always return true, would leave the test above green for ever.
  const planted = "run scripts/import/this-file-does-not-exist.sql against production";
  const hits = planted.match(SCRIPT_PATH) ?? [];
  assert.deepEqual(hits, ["scripts/import/this-file-does-not-exist.sql"]);
  assert.equal(existsSync(join(ROOT, hits[0])), false);
});

test("the CONTROL: the scan does NOT report a path that exists under a longer prefix", () => {
  // The four phantoms the first version produced. Each of these is a real file
  // and the scan must return the WHOLE path, not the `scripts/...` tail.
  for (const p of [
    ".github/scripts/assert-rls-executed.mjs",
    "packages/db/scripts/check-migration-functions.mjs",
    "apps/web/scripts/sign-reminder-token.mjs",
  ]) {
    const hits = `see ${p} for the detail`.match(SCRIPT_PATH) ?? [];
    assert.deepEqual(hits, [p], `the prefix alternation truncated ${p}`);
    assert.ok(existsSync(join(ROOT, p)), `${p} was expected to exist and does not`);
  }
  // And `.json` must not be truncated to `.js`.
  const j = "the file mapping-config.template.json is at scripts/import/mapping-config.template.json";
  assert.deepEqual(j.match(SCRIPT_PATH) ?? [], ["scripts/import/mapping-config.template.json"]);
});

test("every allowlist entry is still named by the board, and still absent", () => {
  // AN ALLOWLIST ENTRY THAT NO LONGER APPLIES IS A HOLE NOBODY CAN SEE. If the
  // card stops naming the path, or the file appears, the entry must go.
  for (const [path, why] of NOT_A_DELIVERABLE) {
    assert.ok(named.has(path), `NOT_A_DELIVERABLE names ${path}, which the board no longer mentions`);
    assert.ok(
      !existsSync(join(ROOT, path)),
      `${path} now EXISTS, so its allowlist entry is dead and must be removed`,
    );
    assert.ok(why.length > 40, `the allowlist entry for ${path} has no real reason on it`);
  }
});

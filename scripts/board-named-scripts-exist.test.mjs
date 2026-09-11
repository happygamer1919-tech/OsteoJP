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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
/**
 * A PATH QUOTED AS EVIDENCE OF A FAILURE IS NOT A PATH ANYBODY IS ASKED TO RUN,
 * and the difference has to be mechanical or the gate punishes the card that
 * documents the defect.
 *
 * FOUND BY THIS FILE FIRING ON ITS OWN INCIDENT CARD. The correction to
 * INC-owner-run-reads-unreachable-from-a-stale-clone quotes the failing command
 * and git's reply verbatim - that transcript IS the evidence that one missing
 * directory segment produces the same message as an absent file. Scanned
 * naively, the wrong path in the transcript reads as a wrong path on the board.
 *
 * THE RULE: a `fatal:` line is output, never an instruction, and a `$ ` line
 * whose path git is quoted as REFUSING two lines later is a transcript of that
 * refusal. Both are dropped before the scan. Anything else - including a `$ `
 * line that worked - is still an instruction and is still checked.
 */
function stripFailureTranscripts(text) {
  const lines = text.split("\n");
  const refused = new Set();
  for (const l of lines) {
    const m = l.match(/fatal:\s*path '([^']+)' does not exist/);
    if (m) refused.add(m[1]);
  }
  return lines
    .filter((l) => {
      const t = l.trim();
      if (t.startsWith("fatal:")) return false;
      if (t.startsWith("$ ")) return ![...refused].some((p) => t.includes(p));
      return true;
    })
    .join("\n");
}

function namedPaths() {
  const hits = new Map();
  const scan = (where, s) => {
    if (typeof s !== "string") return;
    for (const m of stripFailureTranscripts(s).match(SCRIPT_PATH) ?? []) {
      if (!hits.has(m)) hits.set(m, new Set());
      hits.get(m).add(where);
    }
  };
  // FIELDS, NEVER JSON.stringify. Escaping a multi-line note turns every newline
  // into the two characters \\ and n, so `stripFailureTranscripts` sees ONE line
  // and strips nothing - which is how the incident card's own transcript was
  // read as a live path.
  for (const c of board.cards ?? []) {
    scan(c.id, c.title);
    scan(c.id, c.notes);
    scan(c.id, c.open_on_purpose);
    if (c.evidence) scan(c.id, c.evidence.ref);
    if (c.spec) for (const v of Object.values(c.spec)) scan(c.id, v);
  }
  for (const r of board.rulings ?? []) {
    scan(r.id, r.title);
    scan(r.id, r.ruling);
    scan(r.id, r.notes);
    for (const g of r.governs ?? []) scan(r.id, g);
  }
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

/* ======================================================================
 * SR-61's SECOND CLAUSE, ADDED 2026-09-09: THE FULL PATH, NOT THE FILENAME.
 * ======================================================================
 * The check above catches a path that does not resolve. It cannot catch a card
 * that never writes a path at all - and that is the shape the founding incident
 * actually had. The report said `long-telefone-five.sql`; a filename is what a
 * writer remembers and a path is what a shell needs.
 *
 * THE SCOPE IS CARDS THAT TELL SOMEBODY TO RUN SOMETHING, and it was measured
 * before it was chosen. The board names a real script filename 95 times, and 82
 * of those sit on cards with NO run instruction: prose about validate-board.mjs,
 * render-board.mjs, a migration's filename. Flagging every mention would have
 * meant 82 corrections to catch 11 defects - the same trade the six phantoms in
 * this file's first draft already lost.
 */

/** A card that instructs somebody to run something. */
const RUN_INSTRUCTION =
  /git show origin\/main:|psql .*-f |pbcopy|Supabase SQL editor|OWNER-RUN|owner-run|Owner-run/;

/** A bare `foo.sql` / `foo.mjs` with no directory in front of it. */
const BARE_FILENAME = /(?<![\w./-])[A-Za-z0-9][A-Za-z0-9._-]*\.(?:sql|mjs)\b/g;

/** Every tracked file in the repo, indexed by basename. */
function repoFilesByBasename() {
  const byBase = new Map();
  const walk = (dir, rel = "") => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e === "dist" || e === ".git") continue;
      const full = join(dir, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(full).isDirectory()) walk(full, r);
      else {
        if (!byBase.has(e)) byBase.set(e, []);
        byBase.get(e).push(r);
      }
    }
  };
  walk(ROOT);
  return byBase;
}

const BY_BASENAME = repoFilesByBasename();

function cardText(c) {
  return stripFailureTranscripts(
    [c.title, c.notes, c.open_on_purpose, c.evidence ? c.evidence.ref : ""]
      .filter(Boolean)
      .join("\n"),
  );
}

test("the run-instruction scan finds cards, and the basename index is populated", () => {
  // Two vacuous-pass guards. An empty index or a regex that matches nothing would
  // make the assertion below pass over nothing at all.
  const runCards = (board.cards ?? []).filter((c) => RUN_INSTRUCTION.test(cardText(c)));
  assert.ok(runCards.length >= 10, `only ${runCards.length} cards carry a run instruction`);
  assert.ok(BY_BASENAME.has("check-journal.mjs"), "the repo file index is not populated");
});

test("a card that tells you to RUN a script names its FULL PATH (SR-61)", () => {
  const offenders = [];
  for (const c of board.cards ?? []) {
    const text = cardText(c);
    if (!RUN_INSTRUCTION.test(text)) continue;
    for (const base of new Set(text.match(BARE_FILENAME) ?? [])) {
      if (!BY_BASENAME.has(base)) continue; // not a real file; prose, not a delivery
      // "HAS A FULL PATH" IS ASKED DIRECTLY - a directory segment immediately in
      // front of the basename - and NOT via SCRIPT_PATH. That constant's prefix
      // alternation only knows script directories, so it does not recognise
      // apps/web/e2e/seed/seed-e2e.mjs as a path at all, and the clause would
      // have demanded a path from a card that already gave one.
      const withDir = new RegExp(`[\\w.-]+/${base.replace(/[.]/g, "\\.")}`);
      if (withDir.test(text)) continue;
      offenders.push(`${c.id} names "${base}" with no full path (real: ${BY_BASENAME.get(base).join(" | ")})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "SR-61: a card that instructs somebody to RUN a script must give its FULL PATH from the\n" +
      "repository root somewhere on the same card. A filename is what a writer remembers; a path\n" +
      "is what a shell needs, and git reports a misspelled path in the same words it uses for a\n" +
      "file that does not exist - which is exactly how the founding incident was misdiagnosed twice.\n\n  " +
      offenders.join("\n  "),
  );
});

test("the CONTROL: the clause fires on a card that names a script by filename alone", () => {
  // Without this, a broken BARE_FILENAME regex or an empty index would leave the
  // assertion above green for ever.
  const fake = {
    id: "FAKE",
    title: "t",
    notes: "OWNER-RUN: paste check-journal.mjs into the shell",
    evidence: null,
  };
  const text = cardText(fake);
  assert.ok(RUN_INSTRUCTION.test(text), "the run-instruction regex missed an owner-run card");
  const bare = new Set(text.match(BARE_FILENAME) ?? []);
  assert.ok(bare.has("check-journal.mjs"), "the bare-filename regex missed a filename");
  assert.ok(!/[\w.-]+\/check-journal\.mjs/.test(text), "the fake card should carry no full path");
  assert.ok(BY_BASENAME.has("check-journal.mjs"), "the index should know this file");
});

test("the CONTROL: the clause does NOT fire when the full path is also present", () => {
  // A rule that flagged a card carrying both would force the path out of the prose.
  const ok = {
    id: "OK",
    title: "t",
    notes: "OWNER-RUN. scripts/check-journal.mjs is the gate; run check-journal.mjs before the apply.",
    evidence: null,
  };
  const text = cardText(ok);
  assert.ok(/[\w.-]+\/check-journal\.mjs/.test(text), "the full path was not seen");
  // ...including a path OUTSIDE the script directories the other check knows.
  const deep = "OWNER-RUN: apps/web/e2e/seed/seed-e2e.mjs writes it; seed-e2e.mjs is the file.";
  assert.ok(/[\w.-]+\/seed-e2e\.mjs/.test(deep), "a non-script-directory path was not recognised");
});

test("the CONTROL: a quoted FAILURE transcript is not read as a named path", () => {
  // The card that documents the incident quotes the bad path on purpose. If this
  // stripping ever breaks, the gate starts failing the only card that explains it.
  const transcript =
    "    $ git show origin/main:scripts/long-telefone-five.sql\n" +
    "    fatal: path 'scripts/long-telefone-five.sql' does not exist in 'origin/main'\n";
  assert.deepEqual(stripFailureTranscripts(transcript).match(SCRIPT_PATH) ?? [], []);
});

test("the CONTROL: stripping does NOT hide an ordinary instruction", () => {
  // The stripper must not become a way to smuggle a bad path past the gate. A
  // line with no `fatal:` beside it is an instruction and stays visible.
  const instruction = "run scripts/import/does-not-exist.sql against production\n";
  assert.deepEqual(stripFailureTranscripts(instruction).match(SCRIPT_PATH) ?? [], [
    "scripts/import/does-not-exist.sql",
  ]);
  // ...and so does a `$ ` line whose command git did not refuse.
  const worked = "    $ psql -f scripts/import/does-not-exist.sql\n";
  assert.deepEqual(stripFailureTranscripts(worked).match(SCRIPT_PATH) ?? [], [
    "scripts/import/does-not-exist.sql",
  ]);
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

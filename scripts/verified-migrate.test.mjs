// The apply wrapper's ARITHMETIC and its argument contract, without a database.
//
// ===========================================================================
// WHAT THIS FILE CAN AND CANNOT PROVE, SAID FIRST
// ===========================================================================
// The wrapper's integration arms were RUN, against a throwaway Postgres 17 at
// production's exact journal position (79 rows, 0081 applied, 0082 pending):
//
//   happy path            journal 79 -> 80, sha256 present   exit 0
//   file not on disk      SR-58's subject                    exit 3
//   sha256 mismatch       wrong commit / edited after approval exit 3
//   already applied       refused, and says the journal is NOT the problem  exit 3
//   journal `when` lowered below the last applied (the 0058 cause)          exit 3
//                         - refused BEFORE drizzle ran
//   no arguments                                             exit 2
//
// EXIT 5 - "drizzle succeeded and the journal did not move" - IS NOT IN THAT
// LIST, and the honest reason is that forcing it requires making drizzle lie.
// Every real cause of it (a wrong working tree, a stale `when`, a different
// database) is caught EARLIER by the preconditions, which is the wrapper working
// as designed. So exit 5 is proven here, over the pure function the runner
// delegates its verdict to. `verdictFor` is exported for exactly this reason,
// and the runner has no second copy of the arithmetic.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(REPO, "packages/db/scripts/verified-migrate.mjs");
const src = fs.readFileSync(SRC, "utf8");

const { verdictFor, validateArgs, EXIT } = await import(SRC);

test("EXIT 5 exists and names the silent no-op", () => {
  // The whole point of the file. Today that state is indistinguishable from
  // success, and it is the one that has cost the days.
  assert.equal(EXIT.SILENT_NOOP, 5);
  assert.deepEqual(
    verdictFor({ before: 79, after: 79, expectedPending: 1, drizzleExit: 0 }),
    { code: 5, reason: "silent_noop" },
  );
});

test("the happy path is a delta of exactly the pending count", () => {
  assert.deepEqual(
    verdictFor({ before: 79, after: 80, expectedPending: 1, drizzleExit: 0 }),
    { code: 0, reason: "ok" },
  );
  assert.deepEqual(
    verdictFor({ before: 10, after: 13, expectedPending: 3, drizzleExit: 0 }),
    { code: 0, reason: "ok" },
  );
});

test("MORE than expected is a failure, not a bonus", () => {
  // Something else applied migrations during this run. Neither direction is safe
  // to continue from, and an assertion of "at least one" would have accepted it.
  assert.equal(verdictFor({ before: 79, after: 82, expectedPending: 1, drizzleExit: 0 }).reason, "wrong_delta");
});

test("FEWER than expected is a failure too", () => {
  assert.equal(verdictFor({ before: 79, after: 81, expectedPending: 3, drizzleExit: 0 }).reason, "wrong_delta");
});

test("a drizzle failure outranks the delta", () => {
  // If drizzle exited non-zero the delta is not the story, and reporting
  // `wrong_delta` would send the reader to the journal instead of to the error.
  assert.equal(verdictFor({ before: 79, after: 79, expectedPending: 1, drizzleExit: 1 }).code, EXIT.DRIZZLE_FAILED);
  assert.equal(verdictFor({ before: 79, after: 80, expectedPending: 1, drizzleExit: 1 }).code, EXIT.DRIZZLE_FAILED);
});

test("a zero-pending run is not a silent no-op", () => {
  // `--expect-pending 0` is a legitimate invocation - the second half of an
  // apply block, asserting nothing is left. A delta of 0 is then CORRECT, and
  // collapsing it into exit 5 would make the check unusable there.
  assert.deepEqual(
    verdictFor({ before: 80, after: 80, expectedPending: 0, drizzleExit: 0 }),
    { code: 0, reason: "ok" },
  );
});

test("the argument contract refuses everything it must", () => {
  assert.deepEqual(validateArgs({}).length, 3);
  assert.ok(validateArgs({ tag: "x", sha256: "short", "expect-pending": "1" })[0].includes("64 lowercase hex"));
  assert.ok(validateArgs({ tag: "x", sha256: "A".repeat(64), "expect-pending": "1" })[0].includes("64 lowercase hex"));
  assert.ok(validateArgs({ tag: "x", sha256: "a".repeat(64), "expect-pending": "-1" })[0].includes("non-negative"));
  assert.deepEqual(validateArgs({ tag: "x", sha256: "a".repeat(64), "expect-pending": "0" }), []);
});

test("it delegates the apply and never reimplements it", () => {
  // A wrapper that applied migrations itself would be a second migration engine
  // that can disagree with the first.
  assert.match(src, /spawnSync\(\s*\n?\s*"pnpm"/, "the wrapper no longer shells out to the real applier");
  assert.match(src, /"drizzle-kit",\s*"migrate"/);
  assert.ok(!/CREATE TABLE|INSERT INTO drizzle/i.test(src), "the wrapper writes to the journal itself");
});

test("every read is READ ONLY, and it reads only drizzle's own table", () => {
  assert.match(src, /set transaction read only/, "the wrapper's reads are no longer read-only");
  // No patient table may appear. This script is pointed at production.
  for (const t of ["patients", "appointments", "clinical_records", "attachments", "users"]) {
    assert.ok(
      !new RegExp(`from ${t}\\b|from public\\.${t}\\b`, "i").test(src),
      `the wrapper reads ${t}; it must touch only drizzle.__drizzle_migrations`,
    );
  }
});

test("it prints drizzle's output EVEN ON SUCCESS, because silence is the symptom", () => {
  // POST-01 is a run with no output at all. A wrapper that printed only on
  // failure would reproduce the silence it exists to end.
  assert.match(src, /stdout: \$\{out \|\| "\(nothing\)"\}/);
  assert.match(src, /stderr: \$\{err \|\| "\(nothing\)"\}/);
});

test("SR-58: the file check comes before anything is invoked", () => {
  const fileCheck = src.indexOf("is not on disk");
  // THE CALL, NOT THE IMPORT. `import { spawnSync }` is line 80-something, above
  // everything, so indexOf("spawnSync") finds it and this assertion passed
  // vacuously in the other direction on its first run.
  const spawn = src.indexOf("const run = spawnSync(");
  assert.ok(fileCheck > -1, "the on-disk check is gone");
  assert.ok(spawn > -1, "the spawnSync CALL is gone or was renamed; this test is looking at nothing");
  assert.ok(fileCheck < spawn, "the on-disk assertion no longer precedes the apply (SR-58)");
  assert.match(src, /SR-58/, "the wrapper no longer says which rule the file check serves");
});

test("already-applied is checked BEFORE the pending count, and that order is a fix", () => {
  // Once a migration is applied its journal `when` IS the last applied `when`,
  // so `pending` computes to 0 and the pending branch fires with the 0058
  // message - sending an operator to edit a journal entry that is correct.
  // Observed on the throwaway database before the order was swapped.
  const present = src.indexOf("if (before.present)");
  const pendingCheck = src.indexOf("if (pending.length !== expectedPending)");
  assert.ok(present > -1 && pendingCheck > -1);
  assert.ok(present < pendingCheck, "the already-applied check no longer precedes the pending check");
  assert.match(src, /the journal `when` is NOT the problem/);
});

test("the four historical causes are named in the file, so the next reader inherits them", () => {
  for (const cause of ["0038-0041", "0049", "0058", "POST-01", "SR-58"]) {
    assert.ok(src.includes(cause), `the wrapper no longer names ${cause}`);
  }
});

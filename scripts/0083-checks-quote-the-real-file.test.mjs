// 0083's pre-check and post-check must quote the sha256 of the file that is
// actually on disk, and the journal `when` that is actually in the journal.
//
// ===========================================================================
// WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL
// ===========================================================================
// IDENTITY IS THE FILE HASH. `drizzle.__drizzle_migrations.id` is a SERIAL and
// stopped matching the tag at the 0076/0077 gap, so the tag, the journal idx and
// the row id are three different numbers - and the hash is the only one that
// says "the file APPLIED is the file APPROVED".
//
// A HASH IS ALSO THE ONE THING IN THOSE FILES THAT GOES STALE SILENTLY. Edit one
// comment in the migration and the sha256 changes; the pre-check then reads
// "0083 is NOT yet applied" for the wrong reason and would keep reading it after
// a successful apply, and the post-check's "present by sha256 of the approved
// file" would report FAIL on a perfectly good production schema. Nothing else in
// the repository compares those two strings, and a person reading the diff
// cannot compute a sha256 by eye.
//
// THE SAME APPLIES TO THE `when`. The pre-check's 7.0b row - the one that
// catches a silent skip BEFORE the apply - hard-codes 1787701200000. If the
// journal entry is ever renumbered, that row starts asserting a threshold the
// migration no longer has, and it fails in the SAFE direction only by luck.
//
// AND TO 0082. 0083 queues behind it: the pre-check refuses to run until 0082 is
// applied, because applying 0083 first makes 0082 unapplyable for ever while
// printing success. That hash is checked against the 0082 FILE when it is on
// disk - it is not, while 0082 is still on its own branch - and the assertion
// says which case it is in rather than passing quietly over the gap.

import assert from "node:assert/strict";
import test from "node:test";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(REPO, "packages/db/migrations/0083_pack_switch_amount.sql");
const PRE = path.join(REPO, "scripts/0083-precheck.sql");
const POST = path.join(REPO, "scripts/0083-postcheck.sql");
const JOURNAL = path.join(REPO, "packages/db/migrations/meta/_journal.json");

const sha256 = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

test("all three files exist - the checks are not asserting over a missing migration", () => {
  for (const p of [MIGRATION, PRE, POST]) {
    assert.ok(fs.existsSync(p), `${path.relative(REPO, p)} is missing`);
  }
});

test("the pre-check and post-check quote the sha256 of 0083 AS IT IS ON DISK", () => {
  const hash = sha256(MIGRATION);
  for (const [label, file] of [["pre-check", PRE], ["post-check", POST]]) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(
      text.includes(hash),
      `the 0083 ${label} does not quote the migration's sha256.\n` +
        `  on disk: ${hash}\n` +
        "  Recompute with: shasum -a 256 packages/db/migrations/0083_pack_switch_amount.sql\n" +
        "  and replace the hash in both check files. Editing one comment in the migration " +
        "changes this value.",
    );
  }
});

test("neither check file quotes a DIFFERENT 64-hex string as 0083", () => {
  // A stale hash left beside the correct one is worse than a missing one: the
  // pre-check would test both and one of them would always be wrong.
  const hash = sha256(MIGRATION);
  const known = new Set([
    hash,
    // 0082, asserted separately below.
    "b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9",
  ]);
  for (const [label, file] of [["pre-check", PRE], ["post-check", POST]]) {
    const found = new Set(fs.readFileSync(file, "utf8").match(/\b[0-9a-f]{64}\b/g) ?? []);
    const unknown = [...found].filter((h) => !known.has(h));
    assert.deepEqual(unknown, [], `the 0083 ${label} quotes an unrecognised sha256: ${unknown}`);
  }
});

test("the 0082 hash is checked against the 0082 FILE, or the gap is named", () => {
  const expected = "b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9";
  const file = path.join(REPO, "packages/db/migrations/0082_patient_locale_grant.sql");
  if (!fs.existsSync(file)) {
    // THE STATE THIS BRANCH IS IN, AND IT IS DELIBERATE. 0082 is on
    // `db/0082-patient-locale-grant` and has not merged, so it is not on disk
    // here. The hash was taken from that branch. When 0082 merges, this test
    // stops skipping the comparison and starts making it - and if the branch was
    // amended in the meantime, THAT is when it reddens, which is the moment the
    // number actually matters.
    assert.ok(
      fs.readFileSync(PRE, "utf8").includes(expected),
      "the pre-check no longer names the 0082 hash, so nothing enforces the queue order",
    );
    return;
  }
  assert.equal(
    sha256(file),
    expected,
    "0082 has merged and its sha256 does not match the one the 0083 checks quote. " +
      "The queue row would report FAIL on a correctly applied 0082. Recompute and update both files.",
  );
});

test("the pre-check's 7.0b threshold is the journal's actual `when` for 0083", () => {
  const journal = JSON.parse(fs.readFileSync(JOURNAL, "utf8"));
  const entry = (journal.entries ?? []).find((e) => e.tag === "0083_pack_switch_amount");
  assert.ok(entry, "0083 has no journal entry");
  const pre = fs.readFileSync(PRE, "utf8");
  assert.ok(
    pre.includes(String(entry.when)),
    `the pre-check's silent-skip row does not use the journal's when (${entry.when}). ` +
      "It would assert a threshold the migration no longer has.",
  );
  // AND IT MUST BE GREATER THAN 0082's, which is what "queues behind" means at
  // the level drizzle actually decides: a `when` that is not greater is SKIPPED
  // and still prints success.
  assert.ok(
    entry.when > 1787601200000,
    `0083's when (${entry.when}) is not greater than 0082's (1787601200000); drizzle would skip one of them silently`,
  );
});

test("the CONTROL: the sha256 helper produces a different digest for a different file", () => {
  // Without this, a helper that returned a constant would make every assertion
  // above pass.
  assert.notEqual(sha256(MIGRATION), sha256(PRE));
  assert.match(sha256(MIGRATION), /^[0-9a-f]{64}$/);
});

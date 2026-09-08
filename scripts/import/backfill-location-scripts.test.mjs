// The two location backfills strategy ruled on 2026-09-08, and the counts read
// that gates them.
//
// ===========================================================================
// WHY A TEST FOR THREE .sql FILES
// ===========================================================================
// Two of them WRITE, against production, pasted by a person who does not read
// SQL. Their safety is not "every statement is a SELECT" - it cannot be - so it
// has to be something narrower and checkable:
//
//   A  inserts into ONE table, ON CONFLICT DO NOTHING, and never updates or
//      deletes anything.
//   B  updates ONE column, only where it is NULL, and only where the evidence
//      is UNANIMOUS. That last clause IS the ruling; a future edit that relaxes
//      it into "pick the most frequent" would be a different decision taken
//      silently.
//
// AND ONE ASSERTION HERE EXISTS BECAUSE A DRAFT GOT IT WRONG. B's first verify
// step asserted `disagrees_with_evidence = 0` over EVERY patient with unanimous
// appointments - including the ones B deliberately does not touch, because they
// already have a clinic somebody chose. On the rehearsal lane that read 2 before
// any backfill ran at all, so the assertion would have reported a FALSE FAIL on
// a correct production run. The check now lives inside the UPDATE statement,
// over its own RETURNING rows, and this file pins that shape.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

const COUNTS = "scripts/import/backfill-counts.sql";
const A = "scripts/import/backfill-A-patient-locations-from-primary.sql";
const B = "scripts/import/backfill-B-primary-location-from-appointments.sql";

const counts = read(COUNTS);
const a = read(A);
const b = read(B);

/** Statements only, comments stripped. Every header here quotes SQL as
 *  illustration, and a scan over the whole file reads the illustration. */
const stmts = (s) =>
  s
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const countsStmts = stmts(counts);
const aStmts = stmts(a);
const bStmts = stmts(b);

test("the counts read is READ ONLY - it is what gates the two that are not", () => {
  const scan = countsStmts.replace(/'(?:[^']|'')*'/g, "''");
  for (const word of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "DROP", "ALTER", "CREATE", "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "BEGIN", "COPY"]) {
    assert.equal(
      (scan.match(new RegExp(`\\b${word}\\b`, "gi")) ?? []).length,
      0,
      `${COUNTS} contains ${word}. It is the file strategy reads BEFORE authorising a write; it must never be one.`,
    );
  }
});

test("the CONTROL: the read-only scan can see a write", () => {
  const planted = "SELECT 1;\nUPDATE patients SET notes = 'x';\n";
  assert.equal((planted.match(/\bUPDATE\b/gi) ?? []).length, 1, "the scan cannot detect a write at all");
});

test("A inserts into ONE table and never updates or deletes", () => {
  const scan = aStmts.replace(/'(?:[^']|'')*'/g, "''");
  for (const word of ["UPDATE", "DELETE", "TRUNCATE", "DROP", "ALTER", "CREATE"]) {
    assert.equal(
      (scan.match(new RegExp(`\\b${word}\\b`, "gi")) ?? []).length,
      0,
      `backfill A contains ${word}. It is authorised as an idempotent INSERT and nothing else.`,
    );
  }
  const inserts = aStmts.match(/\bINSERT\s+INTO\s+([\w.]+)/gi) ?? [];
  assert.equal(inserts.length, 1, "backfill A has more than one INSERT");
  assert.match(inserts[0], /public\.patient_locations/i);
  assert.match(
    aStmts,
    /ON CONFLICT \(tenant_id, patient_id, location_id\) DO NOTHING/,
    "backfill A is no longer idempotent on the unique key; a second run would raise instead of no-op",
  );
});

test("A excludes soft-deleted and merged patients", () => {
  // A merged loser had its links MOVED to the survivor by merge_patients.
  // Re-creating one resurrects a link the merge removed on purpose.
  const insertStmt = aStmts.slice(aStmts.indexOf("INSERT INTO public.patient_locations"));
  assert.match(insertStmt, /deleted_at IS NULL/, "backfill A's INSERT no longer excludes deleted patients");
});

test("A takes tenant_id from the patient row, so the link cannot be hidden by its own RLS", () => {
  const insertStmt = aStmts.slice(aStmts.indexOf("INSERT INTO public.patient_locations"));
  assert.match(
    insertStmt,
    /SELECT\s+p\.tenant_id,\s*p\.id,\s*p\.primary_location_id/,
    "backfill A no longer takes the link's tenant from the patient row; a mismatched tenant is invisible " +
      "to the very policy that guards the table it was written into",
  );
});

test("B is the RULING: unanimous only, NULL only, never an overwrite", () => {
  // THE THREE CLAUSES ARE THE DECISION. Each one is a thing strategy ruled and
  // each one is a thing a later "simplification" could quietly drop.
  const updates = bStmts.match(/UPDATE\s+public\.patients/gi) ?? [];
  assert.equal(updates.length, 1, "backfill B has more than one UPDATE of patients");

  assert.match(
    bStmts,
    /HAVING count\(DISTINCT location_id\) = 1/,
    "backfill B no longer requires the appointment locations to be UNANIMOUS. That clause is the ruling: " +
      "without it this file picks a favourite instead of deriving a fact.",
  );
  assert.match(
    bStmts,
    /AND p\.primary_location_id IS NULL/,
    "backfill B no longer restricts itself to unplaced patients - it would now OVERWRITE a clinic a person chose",
  );
  assert.match(bStmts, /AND p\.deleted_at IS NULL/, "backfill B no longer excludes deleted patients");
  // Never a DELETE, and no schema change.
  for (const word of ["DELETE", "TRUNCATE", "DROP", "ALTER"]) {
    assert.equal(
      (bStmts.replace(/'(?:[^']|'')*'/g, "''").match(new RegExp(`\\b${word}\\b`, "gi")) ?? []).length,
      0,
      `backfill B contains ${word}`,
    );
  }
});

test("B counts the SECOND participant, because the visibility rule does", () => {
  // patientLocationScope and 0047's policy both count patient_2_id. A derivation
  // that ignored it would file people by a different rule than the one that
  // decides whether they can be seen.
  assert.match(
    bStmts,
    /a\.patient_2_id/,
    "backfill B no longer counts patient_2_id, so its notion of 'a patient's appointments' has drifted " +
      "from patientLocationScope's",
  );
});

test("B's write CHECKS ITSELF in the same statement, over its own RETURNING rows", () => {
  // ==========================================================================
  // THE ASSERTION THAT EXISTS BECAUSE A DRAFT GOT IT WRONG
  // ==========================================================================
  // A verify that runs AFTERWARDS can only see the final state, and the final
  // state cannot distinguish a row this file wrote from a row it deliberately
  // left alone. The first draft asserted 0 over both and would have false-FAILed
  // a correct run (the lane read 2 before anything ran). RETURNING gives the
  // check exactly the rows written - and it carries no number by hand between
  // two commands, which is SR-59 one file over.
  const step2 = bStmts.slice(bStmts.indexOf("WITH tenant"), bStmts.indexOf("-- STEP 3") >>> 0 || undefined);
  assert.match(b, /RETURNING p\.id, p\.primary_location_id/, "backfill B's UPDATE no longer returns what it wrote");
  assert.match(b, /wrote_wrong_location/, "backfill B's write no longer checks the location it wrote");
  assert.match(
    b,
    /FROM upd JOIN unanimous u ON u\.pid = upd\.id/,
    "backfill B's self-check no longer joins its RETURNING rows back to the evidence",
  );
  assert.ok(step2.length > 0);
});

test("B does NOT assert that already-filed patients agree with the evidence", () => {
  // The negative of the previous test, and the specific regression it guards.
  assert.match(
    b,
    /already_filed_elsewhere/,
    "the honest name for that column is gone; if it has been renamed back to a FAIL-shaped name, the " +
      "false-FAIL is back with it",
  );
  assert.ok(
    !/disagrees_with_evidence/.test(b),
    "backfill B has re-acquired `disagrees_with_evidence`, the column whose zero-assertion false-FAILed " +
      "a correct run on the rehearsal lane",
  );
});

test("all three follow the preview / write / verify order, and A and B say what number to expect", () => {
  for (const [name, src] of [["A", a], ["B", b]]) {
    const p = src.indexOf("STEP 1. PREVIEW");
    const w = src.search(/STEP 2\. THE (INSERT|UPDATE)/);
    const v = src.indexOf("STEP 3. VERIFY");
    assert.ok(p > -1 && w > -1 && v > -1, `backfill ${name} lost one of its three steps`);
    assert.ok(p < w && w < v, `backfill ${name}'s steps are out of order`);
    assert.match(src, /EXPECTED:/, `backfill ${name} no longer says what STEP 2 must report`);
    assert.match(src, /STOP\b/, `backfill ${name} no longer says when to stop`);
  }
});

test("the counts read prints the three counts B was ruled on, and a partition check", () => {
  for (const label of ["DERIVABLE", "AMBIGUOUS", "NO BASIS"]) {
    assert.ok(counts.includes(label), `the counts read no longer prints ${label}`);
  }
  // The three counts must PARTITION the population, or they do not describe the
  // set strategy is ruling on. Asserted as a printed verdict, not left to the
  // reader's arithmetic.
  assert.match(counts, /PARTITION CHECK/);
  assert.match(counts, /DO NOT RUN B/, "the counts read no longer says what to do when the partition fails");
  // Both bases printed: widening from primary-only to primary-or-secondary is a
  // judgement and the grid must show what it costs.
  assert.match(counts, /\[primary participant only\]/);
  assert.match(counts, /\[primary OR secondary\]/);
});

test("none of the three prints a patient", () => {
  // Standing rule 7. Locations are clinic names, not personal data; everything
  // else must be an integer or a label.
  for (const [name, src] of [["counts", counts], ["A", a], ["B", b]]) {
    const body = stmts(src);
    for (const col of ["full_name", "nif", "phone", "email", "\\.notes", "date_of_birth", "postal_code"]) {
      assert.ok(
        !new RegExp(col).test(body),
        `backfill ${name} selects ${col}; these files are pasted into a terminal and must print no person`,
      );
    }
  }
});

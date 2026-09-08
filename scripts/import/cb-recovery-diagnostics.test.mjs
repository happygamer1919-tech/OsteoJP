// The CB recovery diagnostics read: READ ONLY, and IT PRINTS NO PATIENT DATA.
//
// ===========================================================================
// WHY A TEST FOR A .sql FILE
// ===========================================================================
// The same two reasons cb-reconciliation.test.mjs gives - it is pasted into a
// production SQL console by a person who does not read SQL, and nobody runs it
// until the one morning it matters - plus a third that is specific to this file
// and is the reason it exists at all.
//
// THIS FILE READS `migration_staging_rows.raw`, WHICH IS THE FISIOZERO DELIVERY.
// One parsed CSV row per record: names, fiscal numbers, telephone numbers,
// addresses. CLAUDE.md's isolation rule is absolute for the final delivery, and
// the whole design of the diagnostics is that it answers every question as a
// LENGTH rather than as a value - `length(btrim(raw->>'nif'))`, never
// `raw->>'nif'`. That is a discipline held by hand in 400 lines of SQL, and a
// single well-meant edit adding the value "so we can see what it was" would put
// a NIF on a screen and into a chat paste. THE DISCIPLINE IS ASSERTED HERE.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SQL_PATH = path.join(REPO, "scripts/import/cb-recovery-diagnostics.sql");
const sql = fs.readFileSync(SQL_PATH, "utf8");
const schema = fs.readFileSync(path.join(REPO, "packages/db/src/schema.ts"), "utf8");

/** Statements only - comments stripped, because the header explains at length
 *  that this file performs no DELETE and no UPDATE. */
const statements = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

/** The same with string literals blanked, for the keyword scan: this report
 *  LABELS its output ('set', '(none)', 'NEVER COMMITTED or deleted...') and a
 *  keyword scan would read those labels as SQL. */
const keywordScan = statements.replace(/'(?:[^']|'')*'/g, "''");

test("it is READ ONLY - no DML, no DDL, no transaction control", () => {
  const forbidden = [
    "INSERT", "UPDATE", "DELETE", "TRUNCATE", "DROP", "ALTER", "CREATE",
    "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "BEGIN", "SET", "COPY", "VACUUM",
    "REFRESH", "CALL", "DO",
  ];
  for (const word of forbidden) {
    const hits = keywordScan.match(new RegExp(`\\b${word}\\b`, "gi")) ?? [];
    assert.equal(
      hits.length,
      0,
      `${SQL_PATH} contains the statement keyword ${word}. This script is pasted into a ` +
        "PRODUCTION console; it must only ever SELECT.",
    );
  }
});

test("the CONTROL: the scan can see a write when there is one", () => {
  // Without this the test above passes on an empty string and on a file that
  // failed to load.
  const planted = "SELECT 1;\nUPDATE patients SET full_name = 'x';\n";
  assert.equal((planted.match(/\bUPDATE\b/gi) ?? []).length, 1,
    "the read-only scan cannot detect a write at all");
});

test("IT PRINTS NO PATIENT DATA - every raw-> read is a LENGTH or a key comparison", () => {
  // ==========================================================================
  // THE RULE, AND IT IS THE ONE THING IN THIS FILE THAT IS NOT COSMETIC
  // ==========================================================================
  // `raw` is the delivery. Two uses of it are safe and there is no third:
  //
  //   length(btrim(raw->>'<field>'))   a MEASUREMENT. Answers "which field
  //                                    overflowed and by how much" without ever
  //                                    materialising the value.
  //   raw->>'id_paciente' IN (...)     a KEY COMPARISON against source_ids the
  //                                    owner already has. Produces a boolean.
  //
  // Anything else - a bare `raw->>'nif'` concatenated into `line`, a
  // `raw->>'nome'`, a `raw::text` - puts delivery content in the result grid.
  const uses = [...statements.matchAll(/[\w.]*raw\s*(->>|->|::)/g)];
  assert.ok(uses.length > 0, "this file no longer reads `raw` at all - section 2 and 3 are gone");

  for (const m of uses) {
    const at = m.index ?? 0;
    const before = statements.slice(Math.max(0, at - 40), at);
    const after = statements.slice(at, at + 120);
    const measured = /length\s*\(\s*btrim\s*\($/.test(before);
    const compared = /IN\s*\(\s*SELECT\s+source_id\s+FROM\s+subject\s*\)/.test(after);
    assert.ok(
      measured || compared,
      "cb-recovery-diagnostics.sql reads migration_staging_rows.raw somewhere that is neither " +
        "length(btrim(...)) nor a source_id comparison. `raw` IS the Fisiozero delivery and this " +
        `file must never print a value from it. Offending context: ...${after.slice(0, 80)}...`,
    );
  }
});

test("the CONTROL: the no-patient-data scan can see a bare read when there is one", () => {
  // The scan above passes trivially on a file with no `raw` in it, and it would
  // also pass if the regex stopped matching. Plant one and require a rejection.
  const planted = "SELECT 'nif=' || m.raw->>'nif' AS line FROM migration_staging_rows m";
  const uses = [...planted.matchAll(/[\w.]*raw\s*(->>|->|::)/g)];
  assert.equal(uses.length, 1, "the raw-read scan cannot see a bare read at all");
  const at = uses[0].index ?? 0;
  assert.ok(
    !/length\s*\(\s*btrim\s*\($/.test(planted.slice(Math.max(0, at - 40), at)),
    "the scan would have accepted a bare `raw->>` as a measurement",
  );
});

test("both RAW-PASSTHROUGH candidates are measured, and so are the two excluded by argument", () => {
  // ==========================================================================
  // WHY ALL FOUR AND NOT THE TWO THAT CAN ACTUALLY OVERFLOW
  // ==========================================================================
  // `patients` has five length-bounded columns. Only `nif` and `postal_code`
  // receive an untouched source value - the adapter writes `row['nif'].trim()`
  // and `row['codigo_postal'].trim()`. `sex` goes through SEX_MAP and `phone`
  // through normalizePhonePT, so neither CAN exceed its column; `phone_e164` is
  // GENERATED from `phone`.
  //
  // They are measured anyway, and that is the point of this assertion: a
  // candidate excluded by reading the adapter is excluded by an ARGUMENT, and
  // the argument is about code that can change. Measuring all four means the
  // report answers "which field" from the data instead of from this reasoning.
  for (const key of ["nif", "codigo_postal", "sexo", "telefone"]) {
    assert.ok(
      new RegExp(`length\\(btrim\\(m\\.raw->>'${key}'\\)\\)`).test(statements),
      `cb-recovery-diagnostics.sql no longer measures raw.${key}; section 2 can no longer say ` +
        "which field overflowed",
    );
  }
  // And the limits must be READ from the catalogue, not written down, or
  // section 2's arithmetic silently outlives a column widening.
  assert.match(
    statements,
    /character_maximum_length/,
    "section 1 no longer reads the column limits from information_schema; the thresholds in " +
      "section 2 would then be a hardcoded copy that can go stale",
  );
});

test("the four fates are all reachable, and MERGED is distinguished from lost", () => {
  // A patient that merge_patients (0005) retired is reported by
  // cb-reconciliation.sql section 5 as a missing target row, because that
  // section requires `deleted_at IS NULL`. It is NOT a loss - the history was
  // re-pointed onto the survivor. A diagnostics file that collapsed the four
  // fates into "gone" would send the owner re-importing a patient who is fine.
  for (const verdict of ["MERGED into", "SOFT DELETED", "HARD DELETED", "NEVER COMMITTED"]) {
    assert.ok(
      sql.includes(verdict),
      `the "${verdict}" verdict is gone from section 5; the fates are no longer distinguished`,
    );
  }
  assert.match(statements, /merged_into_id/, "section 5 no longer reads merged_into_id");
  assert.match(statements, /deleted_at/, "section 5 no longer reads deleted_at");
  // The survivor's history is the half that says nothing was lost.
  assert.match(statements, /a\.patient_id = p\.merged_into_id/,
    "section 5b no longer counts the SURVIVOR's history, so a merge cannot be told from a loss");
});

test("every section that can return nothing has a NONE branch", () => {
  // An empty result and a broken query look identical in a pasted grid, and
  // this file is read by someone who will act on what it says. Every findings
  // section prints a NONE line instead of nothing.
  for (const label of [
    "2. LENGTH  NONE",
    "3. DELIVERY-WIDE  NONE",
    "4. LEDGER  NONE",
    "5. FATE  NONE",
    "5c. AUDIT  NONE",
    "6. ORPHAN  NONE",
    "7. FAILURES  NONE",
  ]) {
    assert.ok(sql.includes(label), `the "${label}" branch is gone - an empty section is now silent`);
  }
});

test("every table it reads still exists in the schema", () => {
  const TABLES = [
    "tenants",
    "migration_staging_rows",
    "patients",
    "appointments",
    "clinical_records",
    "clinical_episodes",
    "auditLog",
  ];
  for (const t of TABLES) {
    const pgName = t === "auditLog" ? "audit_log" : t;
    assert.ok(
      new RegExp(`pgTable\\(\\s*"${pgName}"`).test(schema),
      `${pgName} is named by cb-recovery-diagnostics.sql but is not a table in packages/db/src/schema.ts`,
    );
    assert.ok(
      new RegExp(`\\b${pgName}\\b`).test(statements),
      `${pgName} is in this test's list but cb-recovery-diagnostics.sql does not read it`,
    );
  }
});

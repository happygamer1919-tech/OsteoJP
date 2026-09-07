// The CB reconciliation read: READ ONLY, and every table it names still exists.
//
// WHY A TEST FOR A .sql FILE. Two reasons, and the first is the one that would
// hurt.
//
// 1. IT IS PASTED INTO A PRODUCTION SQL CONSOLE BY A PERSON WHO DOES NOT READ
//    SQL. Its whole safety claim is "every statement is a SELECT", and that
//    claim is made in a comment 40 lines above 500 lines of query. A comment is
//    not a check. If a future edit adds a write - even a well-meant one that
//    stamps a flag on the rows it found - the person running it has no way to
//    notice, and the thing they are running is a diagnosis of a live clinic's
//    data. This asserts the claim mechanically.
//
// 2. NOBODY RUNS IT UNTIL THE ONE MORNING IT MATTERS, and by then a renamed
//    column is a failed query in the middle of a window somebody is waiting on.
//    Same argument cleanup-test-patients.test.mjs makes in its own header.
//
// AND ONE MORE THAT IS SPECIFIC TO THIS FILE: the artefact-name pattern in
// sections 11 and 13b is the only thing that finds reception's fake
// block-the-slot patients, and a regex that matches NOTHING looks exactly like
// a clinic that has none. The pattern's arms are asserted here so a future
// simplification cannot quietly narrow it to zero.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SQL_PATH = path.join(REPO, "scripts/import/cb-reconciliation.sql");
const sql = fs.readFileSync(SQL_PATH, "utf8");
const schema = fs.readFileSync(path.join(REPO, "packages/db/src/schema.ts"), "utf8");

/** Statements only, with STRING LITERALS BLANKED TOO.
 *
 *  Comments go first for the obvious reason: the header explains at length that
 *  this file performs no DELETE and no UPDATE, so a scan over the whole file
 *  fails on its own documentation.
 *
 *  LITERALS GO SECOND AND THAT IS NOT OBVIOUS. This report LABELS its output -
 *  `'set'`, `'(none)'`, `'no appointment'` - and a case-insensitive keyword scan
 *  reads `'set'` as the SET statement. Blanking quoted text is what makes the
 *  scan about SQL rather than about the words the report prints. It caught
 *  exactly that on the first run: three hits, all of them the string 'set'. */
const statements = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .filter((l) => !l.trimStart().startsWith("/*") && !l.trimStart().startsWith("*"))
  .join("\n");

/** The same, with STRING LITERALS BLANKED, for the keyword scan only.
 *
 *  This report LABELS its output - `'set'`, `'(none)'`, `'no appointment'` - and
 *  a case-insensitive keyword scan reads `'set'` as the SET statement. Blanking
 *  quoted text is what makes that scan about SQL rather than about the words the
 *  report prints; it caught exactly that on the first run, three hits, all of
 *  them the string 'set'.
 *
 *  IT IS A SECOND VARIABLE AND NOT A REPLACEMENT, because the artefact-name
 *  pattern LIVES INSIDE a string literal - it is a regex passed to `~*` - so the
 *  test that pins its arms must read the unblanked text. Blanking both would
 *  have made that test pass on an empty haystack, which is the failure this
 *  file's own header warns about one paragraph up. */
const keywordScan = statements.replace(/'(?:[^']|'')*'/g, "''");

test("it is READ ONLY - no DML, no DDL, no transaction control", () => {
  // Word-boundary matched, because `deleted_at` is a column this script reads
  // and `updated_at` is another, and a substring scan would reject both.
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
  // Without this, the test above passes on an empty string and on a file that
  // failed to load. Section 1.3 of PORTAL-REHYDRATE, applied to this test.
  const planted = "SELECT 1;\nUPDATE patients SET full_name = 'x';\n";
  const hits = planted.match(/\bUPDATE\b/gi) ?? [];
  assert.equal(hits.length, 1, "the read-only scan cannot detect a write at all");
});

test("every table it reads still exists in the schema", () => {
  const TABLES = [
    "tenants",
    "locations",
    "migration_staging_rows",
    "patients",
    "patient_locations",
    "appointments",
    "clinical_records",
    "clinical_episodes",
    "attachments",
    "service_packs",
    "service_pack_location_prices",
    "patient_pack_instances",
    "services",
    "service_location_prices",
    "guest_booking_requests",
  ];
  for (const t of TABLES) {
    assert.ok(
      new RegExp(`pgTable\\(\\s*"${t}"`).test(schema),
      `${t} is named by cb-reconciliation.sql but is not a table in packages/db/src/schema.ts`,
    );
  }
  // And it must actually name them, or this list is decoration.
  for (const t of TABLES) {
    assert.ok(
      new RegExp(`\\b${t}\\b`).test(statements),
      `${t} is in this test's list but cb-reconciliation.sql does not read it`,
    );
  }
});

test("it reads the columns the partial-arrival sections depend on", () => {
  // Each one is load-bearing for a specific section, and a RENAME would turn
  // that section into an empty result rather than into an error - which is the
  // failure mode this whole report exists to expose in the data.
  const REQUIRED = {
    imported_entity_id: "section 5 - the ledger claims imported and the row is gone",
    handled_at: "section 14 - which guest requests are still open",
    converted_patient_id: "section 14 - which of them became a patient",
    deleted_at: "sections 6, 8, 9, 10, 11 - a soft-deleted patient is gone to reception too",
    patient_number: "sections 8, 9, 10, 11 - the only id the owner can look up",
    error_detail: "section 4 - why a source row did not import",
    source_id: "sections 4, 5, 9 - the vendor key, to find the record in the Drive delivery",
  };
  for (const [col, why] of Object.entries(REQUIRED)) {
    assert.ok(
      statements.includes(col),
      `cb-reconciliation.sql no longer reads ${col}; ${why}`,
    );
  }
});

test("the guest-catalog rule is stated with ALL FOUR predicates plus the price grid", () => {
  // GUEST-08 is offered-only-where-priced, and the catalog route applies FOUR
  // service predicates on top of it. A section 12 that dropped one would report
  // a service as publicly bookable when it is not, or the reverse - and the
  // owner is using that column to decide whether "Diversos" is reachable.
  for (const clause of [
    "s.is_active",
    "s.internal_only",
    "s.patient_bookable",
    "service_location_prices",
  ]) {
    assert.ok(
      statements.includes(clause),
      `section 12 no longer applies ${clause}; PUBLIC_FORM_OFFERS would be wrong`,
    );
  }
});

test("the artefact-name pattern keeps every arm, and matches the spellings it was built for", () => {
  // The pattern lives in the SQL twice (sections 11 and 13b) and is asserted
  // here as a JS regex over the same alternations, so a narrowing edit fails
  // rather than silently returning nobody.
  const ARMS = [
    "n[aãáâ]o[[:space:]._-]*marcar",
    "bloque",
    "indispon",
    "almo[cç]o",
    "reuni[aã]o",
  ];
  for (const arm of ARMS) {
    const occurrences = statements.split(arm).length - 1;
    assert.ok(
      occurrences >= 2,
      `the artefact arm ${arm} appears ${occurrences} time(s); it must be in BOTH ` +
        "section 11 and section 13b, or the two lists disagree about what a fake patient is",
    );
  }

  // The spellings the owner actually has, and the near misses that must NOT
  // match. Proven against a live Postgres on a lane database; restated here in
  // JS so the property is gated without a database.
  const match = (n) =>
    /n[aãáâ]o[\s._-]*marcar/i.test(n) ||
    /^\s*(bloque|bloqu|reserv|indispon)/i.test(n) ||
    /\b(ferias|férias|almo[cç]o|pausa|reuni[aã]o|intervalo|feriado)\b/i.test(n) ||
    /^\s*(teste|test|x+|-+|\.+)\s*$/i.test(n) ||
    /\b(nao|não)\s+(usar|utilizar|mexer)\b/i.test(n);

  for (const n of [
    "NAO MARCAR", "NÃO MARCAR", "nao marcar", "NAOMARCAR", "Nao_Marcar", "NAO-MARCAR",
    "BLOQUEADO", "Bloquear horario", "RESERVADO", "INDISPONIVEL",
    "FERIAS", "Férias JP", "ALMOCO", "Almoço", "PAUSA", "REUNIAO", "Reunião equipa",
    "TESTE", "xxx", "---", "NAO USAR", "Não mexer",
  ]) {
    assert.ok(match(n), `the artefact pattern no longer matches ${JSON.stringify(n)}`);
  }

  // THE NEGATIVE ARM, and it is the half that makes this pattern safe to show a
  // human: these are real names a wider pattern would accuse.
  for (const n of [
    "Maria Marcarenhas", "Ana Marcar", "Joao Almocado", "Paula Reservada Silva", "Marco Pausini",
  ]) {
    assert.ok(!match(n), `the artefact pattern now falsely matches the real name ${JSON.stringify(n)}`);
  }
});

test("it says out loud that the lane could not run it, and why", () => {
  // The one thing a reader must not conclude is that a lane declined to run
  // this out of caution while SR-50 permitted it. The refusal is the harness's.
  assert.match(sql, /SR-50/);
  assert.match(sql, /new-prod\.env/);
  assert.match(sql, /READ ONLY/);
});

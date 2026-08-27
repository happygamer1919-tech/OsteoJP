// The backfill repairs one thing and must be incapable of doing anything else.
//
// WHAT MAKES THIS FILE DANGEROUS is not the INSERT - it is that it lives beside
// cleanup-test-patients.sql, runs in the same SQL editor, against the same
// production tenant, on the same night. A DELETE, an UPDATE, or a missing
// tenant predicate that arrives here later would be pasted with the same
// confidence as the statement reviewed today. These assertions are what stops
// that, and they are cheap precisely because the file is small.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = path.join(REPO, "scripts/import/backfill-patient-locations.sql");
const text = fs.readFileSync(FILE, "utf8");

/** The file minus every `--` comment line, which is where the prose lives. */
const sql = text
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const TENANT = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

test("it exists, and it is a script rather than a stub", () => {
  assert.ok(text.length > 2000);
  assert.match(sql, /insert into patient_locations/i);
});

/* ---------------- it can only ever insert -------------------------------- */

test("no DELETE, no UPDATE, no TRUNCATE, anywhere in the statements", () => {
  // Not "no delete from patient_locations" - NO DELETE AT ALL. This file runs
  // after the import, on production, where there is no undo.
  assert.ok(!/\bdelete\b/i.test(sql), "the backfill must never delete");
  assert.ok(!/\bupdate\b/i.test(sql), "the backfill must never update");
  assert.ok(!/\btruncate\b/i.test(sql), "the backfill must never truncate");
});

test("no DDL: it is data only, exactly like the other two SQL files", () => {
  for (const ddl of ["create table", "alter table", "drop ", "create index", "create policy"]) {
    assert.ok(!new RegExp(ddl, "i").test(sql), `the backfill must contain no DDL: found ${ddl}`);
  }
});

test("it never names the staging ledger", () => {
  // migration_staging_rows is the only record of what was imported and this
  // file has no business reading or writing it.
  assert.ok(!/migration_staging_rows/i.test(text));
});

/* ---------------- tenant scoping ----------------------------------------- */

test("EVERY table reference is tenant-scoped, and to the one literal tenant", () => {
  // A tenant predicate that is present four times out of five is worse than
  // absent: the file reads as scoped.
  const refs = [...sql.matchAll(/\bfrom\s+(appointments|patients|patient_locations|locations)\b/gi)];
  assert.ok(refs.length >= 8, `expected several table references, found ${refs.length}`);
  const uuids = new Set([...text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map((m) => m[0]));
  assert.deepEqual([...uuids], [TENANT], "exactly one uuid may appear in this file, and it is the seed tenant");
  // Every statement carries the tenant. Split on `;` and check each one that
  // touches a table.
  for (const stmt of sql.split(";")) {
    if (!/\bfrom\s+\w|\binto\s+\w/i.test(stmt)) continue;
    assert.ok(stmt.includes(TENANT), `a statement touches a table without the tenant:\n${stmt.slice(0, 200)}`);
  }
});

test("tenant_id is SUPPLIED as the literal, never copied from the source row", () => {
  // Copying appointments.tenant_id would inherit the scope from a row the WHERE
  // clause failed to filter, which is the failure the literal exists to avoid.
  const insert = sql.slice(sql.search(/insert into patient_locations/i));
  // The SELECT LIST only - `where a.tenant_id = '<literal>'` below it is the
  // scoping predicate and is required.
  const selectList = insert.slice(insert.search(/select distinct/i), insert.search(/\bfrom\b/i));
  assert.match(selectList, new RegExp(`'${TENANT}'::uuid`));
  assert.ok(
    !/tenant_id/i.test(selectList),
    "the inserted tenant_id must be the literal, never a column read off the source row",
  );
});

/* ---------------- the shape the runbook promises ------------------------- */

test("the INSERT names every NOT NULL column it must supply, and only those", () => {
  const m = sql.match(/insert into patient_locations\s*\(([^)]*)\)/i);
  assert.ok(m, "the INSERT must name its columns explicitly");
  const cols = m[1].split(",").map((c) => c.trim());
  assert.deepEqual(cols, ["tenant_id", "patient_id", "location_id"]);
});

test("id and created_at are left to their defaults, and the file says which", () => {
  assert.match(text, /gen_random_uuid\(\)/, "the id default must be named, not assumed");
  assert.match(text, /DEFAULT now\(\)/i, "the created_at default must be named");
});

test("it is SELECT DISTINCT and ON CONFLICT DO NOTHING, so it is re-runnable", () => {
  assert.match(sql, /select distinct/i);
  assert.match(sql, /on conflict do nothing/i);
  // WITHOUT a conflict target: it must absorb every unique constraint on the
  // table, not the one named today.
  assert.ok(!/on conflict\s*\(/i.test(sql), "the conflict clause must not name a target");
});

test("the preview comes before the insert, and the verify after it", () => {
  const preview = text.indexOf("STEP 1. PREVIEW");
  const insert = text.search(/insert into patient_locations/i);
  const verify = text.indexOf("STEP 3. VERIFY");
  assert.ok(preview > -1 && insert > preview, "the preview must precede the insert");
  assert.ok(verify > insert, "the verify must follow the insert");
  assert.match(text, /rows_to_insert/);
  assert.match(text, /rows_still_missing/);
});

test("the preview's count and the insert's SELECT are the same query", () => {
  // If they drift, the number the owner authorises is not the number written.
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const preview = norm(sql.slice(sql.indexOf("select distinct a.patient_id"), sql.indexOf(") s)")));
  // THE INSERT STATEMENT ALONE, up to its terminating semicolon. Slicing to
  // end-of-file would let STEP 3's verify query satisfy every clause below,
  // which is exactly what happened the first time this was written: dropping
  // both filters from the INSERT left the test green.
  const insertStart = sql.search(/insert into patient_locations/i);
  const insert = norm(sql.slice(insertStart, sql.indexOf(";", insertStart)));
  for (const clause of [
    "p.deleted_at is null",
    "p.merged_into_id is null",
    "not exists",
    "pl.location_id = a.location_id",
  ]) {
    assert.ok(preview.includes(clause), `the preview lost: ${clause}`);
    assert.ok(insert.includes(clause), `the insert lost: ${clause}`);
  }
});

/* ---------------- it states its own conditions --------------------------- */

test("it says it runs only when block 13 reported shared ids", () => {
  assert.match(text, /cross-delivery\.mjs/);
  assert.match(text, /shared id_paciente/);
  assert.match(text, /PL-09/, "the cost of skipping it must be named");
});

test("it states why the import cannot do this itself", () => {
  assert.match(text, /already `?imported`?/i);
  assert.match(text, /SKIPPED/);
  assert.match(text, /sha256\(id_paciente\|inicio\|terapeuta\)/);
});

test("it states that appointment status is deliberately not filtered", () => {
  // Owner ruling B turns most of a decade of history into `cancelled`. A status
  // filter would drop exactly those rows.
  assert.match(text, /STATUS IS NOT CONSULTED/i);
  assert.match(text, /ruling B/i);
});

test("it states that primary_location_id is a different question", () => {
  assert.match(text, /primary_location_id/);
});

/* ---------------- the runbook and this file agree ------------------------ */

test("PROD-RUN.md names this file and cross-delivery.mjs", () => {
  const runbook = fs.readFileSync(path.join(REPO, "docs/import/PROD-RUN.md"), "utf8");
  assert.match(runbook, /backfill-patient-locations\.sql/);
  assert.match(runbook, /cross-delivery\.mjs/);
});

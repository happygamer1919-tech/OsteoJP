// The test-patient cleanup script: data-only, columns that still exist, the
// FK-safe order the schema actually implies, and the things it must never touch.
//
// WHY A TEST FOR A .sql FILE: nobody runs it until the one night it matters, and
// by then a renamed column or a new child table is a failed transaction in the
// middle of a production window. These assertions are the only thing standing
// between a schema change and that.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SQL_PATH = path.join(REPO, "scripts/import/cleanup-test-patients.sql");
const sql = fs.readFileSync(SQL_PATH, "utf8");
const schema = fs.readFileSync(path.join(REPO, "packages/db/src/schema.ts"), "utf8");

/** Statements only - the prose above carries words that false-positive every scan. */
const statements = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const TENANT = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

/** The delete order the script must use, deepest FK depth first. */
const DELETE_ORDER = [
  "ai_ingestion_requests",
  "attachments",
  "patient_form_submissions",
  "record_annulments",
  "appointment_notes",
  "clinical_records",
  "invoices",
  "appointments",
  "analytics_events",
  "clinical_episodes",
  "consultations",
  "patient_followup_contacts",
  "patient_followup_postponements",
  "patient_locations",
  "patient_note_revisions",
  "patient_pack_instances",
  "patient_terms_acceptances",
  "patient_trusted_devices",
  "patient_audit_log",
  "staff_notifications",
  "patients",
];

test("the script exists and targets the confirmed tenant", () => {
  assert.ok(fs.existsSync(SQL_PATH));
  assert.ok(statements.includes(TENANT));
});

/* ---------------- data only ---------------- */

test("DATA ONLY - no DDL, no schema change, no migration", () => {
  for (const ddl of [
    /\bcreate\s+(table|index|type|function|trigger|schema|extension|temp)\b/i,
    /\balter\s+table\b/i,
    /\bdrop\s+\w+/i,
    /\btruncate\b/i,
  ]) {
    assert.ok(!ddl.test(statements), `must not contain ${ddl}`);
  }
});

test("it never writes to the auth schema", () => {
  // Patients have no auth.users rows at all (see the file header), so there is
  // nothing to delete - and writing to auth from the SQL editor is out of scope
  // regardless.
  assert.ok(!/insert\s+into\s+auth\./i.test(statements));
  assert.ok(!/update\s+auth\./i.test(statements));
  assert.ok(!/delete\s+from\s+auth\./i.test(statements));
});

test("migration_staging_rows is NEVER in a delete or update", () => {
  // It is the import's audit trail AND its idempotency key. A run that deletes
  // from it makes the next import re-import everything it already did.
  assert.ok(!/delete\s+from\s+migration_staging_rows/i.test(statements));
  assert.ok(!/update\s+migration_staging_rows/i.test(statements));
  // It may only be READ, in the verification select.
  assert.match(statements, /count\(\*\)\s+from\s+migration_staging_rows/i);
});

test("`users` is never deleted from or updated - staff rows are untouchable", () => {
  // 28 real staff plus the two legacy import accounts.
  assert.ok(!/delete\s+from\s+users\b/i.test(statements));
  assert.ok(!/update\s+users\b/i.test(statements));
  assert.match(statements, /count\(\*\)\s+from\s+users/i, "it must VERIFY the staff count");
});

test("no table outside the patient graph is deleted from", () => {
  const deleted = [...statements.matchAll(/delete\s+from\s+([a-z_0-9]+)/gi)].map((m) => m[1]);
  const allowed = new Set(DELETE_ORDER);
  for (const t of deleted) {
    assert.ok(allowed.has(t), `${t} is deleted from but is not in the patient dependency graph`);
  }
  for (const forbidden of [
    "tenants", "locations", "services", "roles", "service_packs", "form_templates",
    "availability_templates", "time_off", "staff_locations", "therapist_services",
    "quick_notes", "audit_log", "patient_otp_codes", "action_token_consumptions",
    "rate_limit_counters", "service_location_prices", "service_pack_location_prices",
  ]) {
    assert.ok(!deleted.includes(forbidden), `${forbidden} must never be deleted`);
  }
});

/* ---------------- the graph ---------------- */

test("every table it deletes from still exists in schema.ts", () => {
  // A renamed or dropped table lands here as a red test rather than as a failed
  // transaction at 22:00.
  for (const t of DELETE_ORDER) {
    assert.ok(schema.includes(`"${t}"`), `${t} is deleted but is not in schema.ts`);
  }
});

test("every table with an FK path to patients is covered", () => {
  // Derived live from the migrations, across all five DDL forms this schema
  // uses. If a migration adds a new child of patients, this test fails until
  // the script covers it.
  const dir = path.join(REPO, "packages/db/migrations");
  const body = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const REF = String.raw`(?:"public"\.|public\.)?"?([a-z_0-9]+)"?`;
  const IDN = String.raw`"?([a-z_0-9]+)"?`;
  const edges = new Set();
  const add = (c, p) => edges.add(`${c}|${p}`);

  for (const m of body.matchAll(
    new RegExp(String.raw`ALTER TABLE\s+${REF}\s+ADD CONSTRAINT\s+${IDN}\s+FOREIGN KEY\s*\(\s*${IDN}\s*\)\s*REFERENCES\s+${REF}`, "gi"),
  )) add(m[1], m[4]);
  for (const m of body.matchAll(
    new RegExp(String.raw`ALTER TABLE\s+${REF}\s+ADD COLUMN\s+${IDN}\s+uuid\b[^;]*?REFERENCES\s+${REF}`, "gis"),
  )) add(m[1], m[3]);
  for (const m of body.matchAll(new RegExp(String.raw`CREATE TABLE\s+(?:IF NOT EXISTS\s+)?${REF}\s*\(([\s\S]*?)\n\);`, "gi"))) {
    const child = m[1];
    for (const fk of m[2].matchAll(new RegExp(String.raw`FOREIGN KEY\s*\(\s*${IDN}\s*\)\s*REFERENCES\s+${REF}`, "gi"))) add(child, fk[2]);
    for (const fk of m[2].matchAll(new RegExp(String.raw`^\s*${IDN}\s+uuid\b[^,\n]*?REFERENCES\s+${REF}\s*\(\s*"?id"?\s*\)`, "gim"))) add(child, fk[2]);
  }

  const kids = new Map();
  for (const e of edges) {
    const [c, p] = e.split("|");
    if (!kids.has(p)) kids.set(p, new Set());
    kids.get(p).add(c);
  }
  const reached = new Set();
  const walk = (t) => {
    for (const c of kids.get(t) ?? []) {
      if (c === t || reached.has(c)) continue;
      reached.add(c);
      walk(c);
    }
  };
  walk("patients");

  assert.ok(reached.size >= 18, `expected at least 18 patient-rooted tables, found ${reached.size}`);
  const covered = new Set(DELETE_ORDER);
  for (const t of reached) {
    assert.ok(covered.has(t), `${t} has an FK path to patients but the script never deletes from it`);
  }
});

test("the delete order is deepest-first, and appointments precede pack instances", () => {
  // Migration 0067 added appointments.pack_instance_id -> patient_pack_instances.
  // Getting this backwards aborts the whole transaction.
  const pos = (t) => statements.search(new RegExp(String.raw`delete\s+from\s+${t}\b`, "i"));
  for (const [earlier, later] of [
    ["attachments", "clinical_records"],
    ["record_annulments", "clinical_records"],
    ["ai_ingestion_requests", "clinical_records"],
    ["patient_form_submissions", "clinical_records"],
    ["appointment_notes", "appointments"],
    ["clinical_records", "appointments"],
    ["invoices", "appointments"],
    ["appointments", "patient_pack_instances"],
    ["appointment_notes", "clinical_episodes"],
    ["clinical_records", "clinical_episodes"],
  ]) {
    assert.ok(pos(earlier) > -1 && pos(later) > -1, `${earlier}/${later} missing`);
    assert.ok(pos(earlier) < pos(later), `${earlier} must be deleted before ${later}`);
  }
  // patients last of all.
  const last = pos("patients");
  for (const t of DELETE_ORDER.filter((t) => t !== "patients")) {
    assert.ok(pos(t) < last, `${t} must be deleted before patients`);
  }
});

test("the three FK-LESS patient columns are handled - they would not block", () => {
  // These do not abort the transaction, which is exactly why they are dangerous:
  // it succeeds and leaves rows pointing at patients that no longer exist.
  assert.match(statements, /delete\s+from\s+patient_audit_log/i);
  assert.match(statements, /delete\s+from\s+staff_notifications/i);
  assert.match(statements, /update\s+guest_booking_requests\s*\n?\s*set\s+converted_patient_id\s*=\s*null/i);
});

test("guest_booking_requests is NULLED, never deleted", () => {
  // It is not a patient-rooted row: it exists before any patient does. Deleting
  // it would exceed this script's stated scope.
  assert.ok(!/delete\s+from\s+guest_booking_requests/i.test(statements));
});

/* ---------------- shape and safety ---------------- */

test("the delete is transactional", () => {
  assert.match(statements, /^begin;$/m);
  assert.match(statements, /^commit;$/m);
  const begin = statements.search(/^begin;$/m);
  const commit = statements.search(/^commit;$/m);
  const firstDelete = statements.search(/delete\s+from/i);
  const lastDelete = statements.lastIndexOf("delete from");
  assert.ok(begin < firstDelete, "every delete must be inside the transaction");
  assert.ok(lastDelete < commit, "every delete must be inside the transaction");
});

test("a preview SELECT precedes the delete and a verify SELECT follows", () => {
  const firstSelect = statements.search(/select/i);
  const firstDelete = statements.search(/delete\s+from/i);
  const lastSelect = statements.lastIndexOf("select");
  assert.ok(firstSelect > -1 && firstSelect < firstDelete, "preview must precede the delete");
  assert.ok(lastSelect > statements.lastIndexOf("delete from"), "verify must follow the delete");
});

test("literal expected counts are stated, not described", () => {
  assert.match(sql, /`patients` = 33/);
  assert.match(sql, /DELETE 33/);
  assert.match(sql, /EVERY COLUMN 0/);
  assert.match(sql, /STOP IF `patients` IS NOT EXACTLY 33/);
});

test("every scoped delete is rooted in the tenant's patients, never a bare table", () => {
  // A `delete from appointments;` with no predicate would empty the clinic.
  for (const m of statements.matchAll(/delete\s+from\s+([a-z_0-9]+)([\s\S]*?);/gi)) {
    assert.match(m[2], /\bwhere\b/i, `delete from ${m[1]} has no WHERE clause`);
    assert.ok(
      m[2].includes(TENANT) || /in\s*\(\s*\n?\s*select/i.test(m[2]),
      `delete from ${m[1]} is not scoped to the tenant's patients`,
    );
  }
});

test("the verify step checks for ORPHANS, not just an empty patients table", () => {
  const verify = sql.slice(sql.indexOf("-- STEP 3. VERIFY"));
  assert.match(verify, /orphan_appointments/);
  assert.match(verify, /orphan_patient_audit_log/);
  assert.match(verify, /orphan_staff_notifications/);
  assert.match(verify, /orphan_guest_requests/);
  assert.match(verify, /staff_rows/);
});

/* ---------------- storage + the auth finding ---------------- */

test("storage paths are listed BEFORE the delete, while the rows still exist", () => {
  // Anchor on the section HEADERS. Plain `indexOf("STEP 2.")` matches the prose
  // near the top that says "only then run STEP 2." and inverts the comparison.
  const step1b = sql.indexOf("-- STEP 1b. STORAGE OBJECTS");
  const step2 = sql.indexOf("-- STEP 2. THE DELETE");
  assert.ok(step1b > -1 && step1b < step2, "the storage listing must precede the delete");
  assert.match(sql, /storage_path/);
  assert.match(sql, /path_count/);
  assert.match(sql, /DOES NOT DELETE THE OBJECT/i);
});

test("the auth.users finding is stated with its evidence", () => {
  // The answer decides whether a whole dashboard step exists. It must be
  // traceable, not asserted.
  assert.match(sql, /PATIENTS HAVE NO SUPABASE AUTH ROWS/i);
  assert.match(sql, /LOGIN-LESS/i);
  assert.match(sql, /patient_otp_codes/);
  assert.match(sql, /phone_hash/);
});

test("it points at the number preflight and the no-flag conclusion", () => {
  assert.match(sql, /preflight-patient-numbers\.sql/);
  assert.match(sql, /WITHOUT\*{0,2}\s*\n?--\s*`?--reassign-conflicting-patient-numbers/i);
});

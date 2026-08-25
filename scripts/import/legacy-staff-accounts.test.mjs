// The legacy staff account script (owner ruling A) is DATA-ONLY, targets columns
// that still exist, and cannot create a login.
//
// WHY A TEST FOR A .sql FILE: nobody runs it until the one night it matters, and
// by then a renamed column is a failed paste in the middle of a migration
// sitting. These assertions are the only thing standing between a schema change
// and that.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SQL_PATH = path.join(REPO, "scripts/import/legacy-staff-accounts.sql");
const sql = fs.readFileSync(SQL_PATH, "utf8");
const schema = fs.readFileSync(path.join(REPO, "packages/db/src/schema.ts"), "utf8");

/** Statements only - comments carry prose that would false-positive every scan. */
const statements = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const UUIDS = [
  "0c1a0000-0000-4000-8000-000000000001",
  "0c1a0000-0000-4000-8000-000000000002",
];

test("the script exists and inserts exactly two rows", () => {
  assert.ok(fs.existsSync(SQL_PATH));
  const inserts = statements.match(/insert\s+into\s+users/gi) ?? [];
  assert.equal(inserts.length, 1, "one INSERT statement");
  for (const u of UUIDS) assert.ok(statements.includes(u), `${u} is inserted`);
});

test("DATA ONLY - no DDL, no schema change, no migration", () => {
  // The dispatch is explicit: data-only, no migration. A CREATE/ALTER/DROP here
  // would be a schema change applied outside the migration journal, which is the
  // one thing the prod-apply discipline exists to prevent.
  for (const ddl of [
    /\bcreate\s+(table|index|type|function|trigger|schema|extension)\b/i,
    /\balter\s+table\b/i,
    /\bdrop\s+\w+/i,
    /\btruncate\b/i,
  ]) {
    assert.ok(!ddl.test(statements), `must not contain ${ddl}`);
  }
});

test("it never writes to auth.users - the accounts cannot get a credential", () => {
  // The whole ruling: no login, ever. auth.users may only be READ, in the
  // verification SELECT that proves no credential exists.
  assert.ok(!/insert\s+into\s+auth\./i.test(statements));
  assert.ok(!/update\s+auth\./i.test(statements));
  assert.ok(/exists\s*\(\s*select\s+1\s+from\s+auth\.users/i.test(statements),
    "the verify step must prove has_auth_user is false");
});

test("it updates and deletes nothing - only an INSERT", () => {
  assert.ok(!/\bupdate\s+users\b/i.test(statements));
  assert.ok(!/\bdelete\s+from\b/i.test(statements));
});

test("every column it writes still exists in schema.ts", () => {
  // THE ASSERTION THAT EARNS THIS FILE. A column rename lands here as a red
  // test rather than as a failed paste at 22:00 on import night.
  const cols = statements
    .match(/insert into users \(([^)]+)\)/i)[1]
    .split(",")
    .map((c) => c.trim());
  assert.deepEqual(cols, [
    "id",
    "tenant_id",
    "role_id",
    "email",
    "full_name",
    "is_active",
    "is_bookable",
    "must_set_password",
  ]);
  for (const c of cols) {
    assert.ok(
      schema.includes(`"${c}"`),
      `users.${c} is written by the script but is not in schema.ts`,
    );
  }
});

test("users.id still has NO foreign key to auth.users", () => {
  // The script only works because that FK does not exist. If a migration ever
  // adds it, these accounts become un-creatable and this test says so first.
  const migrations = fs
    .readdirSync(path.join(REPO, "packages/db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(REPO, "packages/db/migrations", f), "utf8"))
    .join("\n")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--") && !l.trimStart().startsWith("/*"))
    .join("\n");
  assert.ok(
    !/alter table\s+"?(public\.)?users"?\s+add constraint[^;]*references\s+auth\.users/i.test(
      migrations,
    ),
    "a FK from users.id to auth.users now exists - the script cannot work",
  );
});

test("the flags are the exclusion the ruling asks for", () => {
  // is_bookable=false is the one that keeps them out of the Terapeuta dropdown;
  // role_id=null drops them from every role-keyed INNER JOIN.
  const values = statements.slice(statements.search(/values/i));
  assert.equal((values.match(/\bnull\b/gi) ?? []).length, 2, "role_id null on both rows");
  assert.equal((values.match(/false/g) ?? []).length, 6, "3 false flags x 2 rows");
  assert.ok(!/\btrue\b/i.test(values), "no flag may be true");
});

test("the names carry their real accents, because the mapping matches EXACTLY", () => {
  // "Clinica" without the í leaves the vendor key unmapped and the runner
  // refuses the whole run.
  assert.ok(sql.includes("Clínica OsteoJP"), "the í is load-bearing");
  assert.ok(sql.includes("NESA"));
  assert.ok(!statements.includes("Clinica OsteoJP"), "an unaccented variant would not match");
});

test("the addresses are RFC 2606 .invalid, so no real mailbox can ever receive them", () => {
  const emails = statements.match(/'[^']*@[^']*'/g) ?? [];
  assert.ok(emails.length >= 2);
  for (const e of emails) {
    assert.ok(e.includes(".invalid'"), `${e} must be under the reserved .invalid TLD`);
  }
});

test("the uuids match what the mapping-config step tells Ivan to paste", () => {
  // Two places state these ids. If they ever disagree, the import fails on a
  // foreign key MID-RUN, which is the worst time to discover a typo.
  const step4 = sql.slice(sql.indexOf("STEP 4"));
  for (const u of UUIDS) assert.ok(step4.includes(u), `${u} must appear in the wiring step`);
});

test("a preview SELECT comes before the INSERT, and a verify SELECT after", () => {
  const firstSelect = statements.search(/select/i);
  const insertAt = statements.search(/insert into users/i);
  const lastSelect = statements.lastIndexOf("select");
  assert.ok(firstSelect > -1 && firstSelect < insertAt, "preview SELECT must precede the INSERT");
  assert.ok(lastSelect > insertAt, "verify SELECT must follow the INSERT");
});

test("the INSERT is transactional", () => {
  assert.ok(/^begin;$/m.test(statements));
  assert.ok(/^commit;$/m.test(statements));
});

test("literal expected counts are stated, not described", () => {
  // "the expected number" is not a check anybody can perform under pressure.
  assert.match(sql, /INSERT 0 2/);
  assert.match(sql, /EXACTLY 2 ROWS/);
  assert.match(sql, /already_present\s+0/);
});

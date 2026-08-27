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

/** PART A's INSERT (the two ruled rows) and PART B's (the parameterised list). */
const insertBlocks = () => {
  const at = [...statements.matchAll(/insert\s+into\s+users/gi)].map((m) => m.index);
  assert.equal(at.length, 2, "exactly two INSERT statements: PART A and PART B");
  return [statements.slice(at[0], at[1]), statements.slice(at[1])];
};

test("PART A still inserts exactly the two ruled rows", () => {
  assert.ok(fs.existsSync(SQL_PATH));
  const [partA] = insertBlocks();
  // PART A's own VALUES block. The slice up to PART B's INSERT also spans PART
  // B's preview SELECT, whose CTE carries a placeholder address - scoping to
  // the VALUES is what keeps this counting PART A's rows and not that.
  const values = partA.slice(partA.search(/values/i), partA.search(/on conflict/i));
  for (const u of UUIDS) assert.ok(values.includes(u), `${u} is inserted by PART A`);
  assert.equal((values.match(/@osteojp\.invalid/g) ?? []).length, 2, "two addresses, no third row");
});

test("PART B is PARAMETERISED and refuses its own placeholder", () => {
  // A template left half-edited must refuse rather than insert something
  // meaningless - the same discipline the mapping config's placeholder check
  // enforces. Here it is enforced twice: the preview flags it and the INSERT's
  // own WHERE excludes it, so an operator who skipped the preview still cannot
  // create a row called REPLACE-ME.
  const [, partB] = insertBlocks();
  assert.match(statements, /still_placeholder/, "the preview flags an unfilled list");
  assert.match(partB, /full_name\s*<>\s*'REPLACE-ME'/, "the INSERT excludes the placeholder");
});

test("PART B refuses a name that already has a row, in SQL and not only in prose", () => {
  // Two rows with the same full_name means the import attributes a decade of
  // history to whichever uuid was pasted, and nothing downstream can tell them
  // apart. The preview says so; this is the half that holds when nobody read it.
  const [, partB] = insertBlocks();
  assert.match(
    partB,
    /not exists\s*\(\s*select 1 from users u[\s\S]*?u\.full_name = n\.full_name/i,
    "the INSERT must skip a name that already exists",
  );
  assert.match(statements, /name_exists/, "and the preview must surface it");
});

test("PART B continues the uuid sequence rather than generating one", () => {
  // Generated uuids would have to be read back and hand-copied into the mapping
  // config under time pressure, where a typo is a foreign-key failure MID-RUN.
  assert.ok(statements.includes("0c1a0000-0000-4000-8000-000000000003"),
    "PART B starts at ...0003, the next number after PART A");
  assert.ok(!/gen_random_uuid|uuid_generate/i.test(statements),
    "no generated uuid anywhere in this file");
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

test("the flags are the exclusion the ruling asks for, in BOTH parts", () => {
  // is_bookable=false is the one that keeps them out of the Terapeuta dropdown;
  // role_id=null drops them from every role-keyed INNER JOIN.
  //
  // CHECKED PER INSERT, not over the whole file. A single count across both
  // would still pass if PART B wrote no flags at all and PART A wrote them
  // twice - which is exactly the shape a bad generalisation takes.
  const [partA, partB] = insertBlocks();

  const aValues = partA.slice(partA.search(/values/i));
  assert.equal((aValues.match(/\bnull\b/gi) ?? []).length, 2, "PART A: role_id null on both rows");
  assert.equal((aValues.match(/false/g) ?? []).length, 6, "PART A: 3 false flags x 2 rows");
  assert.ok(!/\btrue\b/i.test(aValues), "PART A: no flag may be true");

  // PART B writes one row per list entry from a SELECT, so the flags appear ONCE
  // and apply to every row the list carries.
  const bSelect = partB.slice(partB.search(/select n\.id/i));
  assert.equal((bSelect.match(/\bnull\b/gi) ?? []).length, 1, "PART B: role_id null");
  assert.equal((bSelect.match(/false/g) ?? []).length, 3,
    "PART B: is_active, is_bookable, must_set_password all false");
  assert.ok(!/\btrue\b/i.test(bSelect), "PART B: no flag may be true");
});

test("the names carry their real accents, because the mapping matches EXACTLY", () => {
  // "Clinica" without the í leaves the vendor key unmapped and the runner
  // refuses the whole run.
  assert.ok(sql.includes("Clínica OsteoJP"), "the í is load-bearing");
  assert.ok(sql.includes("NESA"));
  assert.ok(!statements.includes("Clinica OsteoJP"), "an unaccented variant would not match");
});

test("the addresses are RFC 2606 .invalid, so no real mailbox can ever receive them", () => {
  // Both parts. PART B's placeholder address is under .invalid too, so an
  // operator who edits the name and forgets the address still cannot reach a
  // real inbox.
  const emails = statements.match(/'[^']*@[^']*'/g) ?? [];
  assert.ok(emails.length >= 3);
  for (const e of emails) {
    assert.ok(e.includes(".invalid'"), `${e} must be under the reserved .invalid TLD`);
  }
});

test("the uuids match what the mapping-config step tells Ivan to paste", () => {
  // Two places state these ids. If they ever disagree, the import fails on a
  // foreign key MID-RUN, which is the worst time to discover a typo.
  const wiring = sql.slice(sql.indexOf("STEP 7"));
  for (const u of UUIDS) assert.ok(wiring.includes(u), `${u} must appear in the wiring step`);
  // ...and the wiring step must tell Ivan that PART B's uuids go in too. They
  // are created days later and nothing refuses a config that is merely
  // INCOMPLETE for a name the delivery has not been read for yet.
  assert.ok(wiring.includes("0c1a0000-0000-4000-8000-000000000003"),
    "the wiring step must show a PART B entry");
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

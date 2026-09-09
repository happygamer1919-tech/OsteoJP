// 0082 states its own end state, and the end state is EIGHT columns.
//
// ===========================================================================
// WHY THIS TEST EXISTS, AND IT IS NOT ABOUT LOCALE
// ===========================================================================
// SR-56 requires a privilege migration to STATE ITS OWN END STATE: revoke from
// every grantee that must not hold the privilege, then grant exactly what is
// intended. Its worked example is a TABLE grant.
//
// COPIED LITERALLY ONTO A COLUMN GRANT, THAT SHAPE BREAKS THE PORTAL. Measured
// on a real Postgres, not reasoned about:
//
//     REVOKE UPDATE ON TABLE public.patients FROM patient;
//     GRANT UPDATE (locale) ON public.patients TO patient;
//     -->  patient can update:  locale
//     -->  0 of the 0019 + 0020 seven survive
//
// A TABLE-LEVEL REVOKE TAKES THE COLUMN GRANTS WITH IT. That is a live 42501 on
// every profile save in the portal - the exact defect migration 0020 exists to
// fix, reintroduced by a rule written to prevent defects.
//
// So 0082 restates the COMPLETE list, and this test is what stops a later
// "simplification" from trimming it back to the one column the file is named
// after. The eight names are the assertion; a count would pass on the wrong
// eight.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(REPO, "packages/db/migrations/0082_patient_locale_grant.sql");
const MIRROR = path.join(REPO, "supabase/migrations/0082_patient_locale_grant.sql");
const POSTCHECK = path.join(REPO, "scripts/0082-postcheck.sql");
const PRECHECK = path.join(REPO, "scripts/0082-precheck.sql");

const sql = fs.readFileSync(MIGRATION, "utf8");
/** The migration with its /* ... *\/ comment blocks removed.
 *
 *  IT IS NOT COSMETIC. This file's header QUOTES the wrong shape as a worked
 *  counter-example - `GRANT UPDATE (a,b) ON t TO r;` above a `REVOKE`, to show
 *  what a table-level revoke does to column grants - and a scan over the whole
 *  file reads that illustration as the migration's own statements. The
 *  ordering test below failed on exactly that on its first run. */
const statements = sql.replace(/\/\*[\s\S]*?\*\//g, "");
const post = fs.readFileSync(POSTCHECK, "utf8");
const pre = fs.readFileSync(PRECHECK, "utf8");

/** 0019's six, 0020's one, and this file's one. The ORDER here is the file's;
 *  the post-check asserts them alphabetically, which is a different statement
 *  of the same set and is deliberate - two orderings cannot both drift the
 *  same way. */
const EIGHT = [
  "phone",
  "address",
  "postal_code",
  "city",
  "reminder_sms_enabled",
  "reminder_email_enabled",
  "updated_at",
  "locale",
];

test("the GRANT names all eight columns, not just locale", () => {
  const grant = statements.slice(statements.indexOf("GRANT UPDATE ("), statements.indexOf(") ON public.patients TO patient"));
  assert.ok(grant.length > 0, "0082 no longer contains a column-list GRANT");
  for (const col of EIGHT) {
    assert.ok(
      new RegExp(`(^|[\\s,(])${col}([\\s,)]|$)`, "m").test(grant),
      `0082's GRANT no longer names \`${col}\`. A table-level REVOKE drops every column ` +
        `grant, so a column missing from THIS list is a column the patient role loses - and ` +
        `for the 0019/0020 seven that is a 42501 on the portal's profile PATCH.`,
    );
  }
  // The list is EXACTLY eight: a ninth would be a widening nobody reviewed.
  const named = grant
    .split("\n")
    .map((l) => l.replace(/\/\*.*?\*\//g, "").trim().replace(/,$/, ""))
    .filter((l) => /^[a-z_]+$/.test(l));
  assert.deepEqual(
    named.slice().sort(),
    EIGHT.slice().sort(),
    "0082's GRANT list is not exactly the eight this migration was reviewed as",
  );
});

test("it REVOKES UPDATE and never REVOKE ALL - the patient keeps SELECT", () => {
  // `patient` holds SELECT from 0010, under patients_patient_selfscope. REVOKE
  // ALL would take it and the portal could no longer READ a patient's own row.
  assert.match(
    statements,
    /REVOKE\s+UPDATE\s+ON\s+TABLE\s+public\.patients\s+FROM\s+patient\s*;/,
    "0082 no longer revokes UPDATE before restating the list; the GRANT would then be additive " +
      "and the file would stop stating its own end state (SR-56)",
  );
  assert.ok(
    !/REVOKE\s+ALL\s+ON\s+(TABLE\s+)?public\.patients\s+FROM\s+patient/i.test(statements),
    "0082 revokes ALL from the patient role. That takes SELECT (0010) with it and the portal " +
      "can no longer read a patient's own row.",
  );
});

test("the REVOKE comes BEFORE the GRANT, in that order, in one file", () => {
  const r = statements.indexOf("REVOKE UPDATE ON TABLE public.patients FROM patient");
  const g = statements.indexOf("GRANT UPDATE (");
  assert.ok(r > -1 && g > -1, "one of the two statements is gone");
  assert.ok(
    r < g,
    "the GRANT precedes the REVOKE in 0082, which would revoke the grant it just made and leave " +
      "the patient role able to update nothing at all",
  );
});

test("the pre-check refuses an unexpected STARTING state, by set and not only by count", () => {
  // Seven of the wrong seven is still seven. If production's list has drifted,
  // the re-grant would SILENTLY NARROW it and the failure would arrive later as
  // a 42501 with nothing pointing back at this migration.
  assert.match(
    pre,
    /address,city,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at/,
    "the pre-check no longer pins the starting SET; a drifted production would be narrowed silently",
  );
  assert.match(pre, /DO NOT APPLY/, "the pre-check no longer says what to do when it fails");
});

test("the post-check asserts the SET, the survivors, and the identity fields", () => {
  assert.match(
    post,
    /address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at/,
    "the post-check no longer asserts the exact eight; a count passes on the wrong eight",
  );
  // The survivors. This is the assertion the whole revoke-and-restate shape
  // exists to be checked by.
  assert.match(post, /the 0019 \+ 0020 seven ALL survived the revoke/);
  // And the other direction: a re-grant that WIDENED the list.
  assert.match(post, /patient still CANNOT update the identity fields/);
  for (const col of ["full_name", "email", "nif", "auth_user_id"]) {
    assert.ok(post.includes(col), `the post-check no longer checks ${col} stayed unwritable`);
  }
  // SR-52 / SR-56: read the PRIVILEGE, not the acl.
  assert.match(
    post,
    /has_column_privilege/,
    "the post-check no longer reads has_column_privilege; an aclitem grep is what SR-52 exists about",
  );
});

test("the post-check pins 0082 by the sha256 of the file on disk", () => {
  // IDENTITY IS THE FILE HASH, NEVER `id`: drizzle's id is a SERIAL and stopped
  // matching the tag at the 0076/0077 gap. This is also the check that catches
  // an edit to the migration made after the post-check was written.
  const hash = createHash("sha256").update(fs.readFileSync(MIGRATION)).digest("hex");
  assert.ok(
    post.includes(hash),
    `scripts/0082-postcheck.sql does not carry the sha256 of the migration it verifies.\n` +
      `  on disk:   ${hash}\n` +
      `If 0082 was edited, re-run:  shasum -a 256 packages/db/migrations/0082_patient_locale_grant.sql\n` +
      `and update the post-check, or it will assert a file that no longer exists.`,
  );
  // 0081 must stay pinned too - a forward-only check cannot see a rewritten history.
  assert.ok(
    post.includes("127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481"),
    "the post-check no longer asserts 0081 is still present by hash",
  );
});

test("the supabase mirror is byte-identical below its generated header", () => {
  const mirror = fs.readFileSync(MIRROR, "utf8");
  assert.ok(mirror.includes("AUTO-GENERATED"), "the mirror lost its generated header");
  assert.ok(
    mirror.endsWith(sql),
    "supabase/migrations/0082_patient_locale_grant.sql has drifted from the drizzle source. " +
      "Edit the drizzle file and re-run: node scripts/sync-supabase-migrations.mjs",
  );
});

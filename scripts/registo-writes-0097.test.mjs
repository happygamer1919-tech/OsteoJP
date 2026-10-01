// 0097 (the clinical_records write policies follow the permission matrix,
// HELD; it was 0099 until the fifth renumbering, owner and lead, 2026-09-30,
// and this file was registo-writes-0099.test.mjs): the migration, its three
// check files and the app's claim agree with each other, byte for byte where
// it matters.
//
// WHAT THIS PROVES, statically, with no database:
//   * COMMENTS NEVER COUNT. Every rule that reads SQL reads its code with block
//     and line comments removed, so a pin parked in a comment satisfies no rule;
//   * the pre-check's "0097 is absent, by hash" and the post-check's "0097 is
//     present and newest, by hash" pin the sha256 of the migration as it
//     stands. A promotion changes no byte, so this is the hash the journal will
//     carry; an edit to the migration that forgets a check goes red here;
//   * the post-check pins the claim function's body md5 IN THE COMPARISON its
//     verdict makes, and that md5 is the body in the migration;
//   * the migration ALTERS exactly the three write policies of clinical_records
//     and creates, drops or alters no other policy; each therapist arm is the
//     ruled one (UPDATE USING and DELETE: the author only; INSERT and UPDATE
//     WITH CHECK: the author AND a patient they treat or created), and the
//     owner arm is 0045's;
//   * the migration never names the immutability trigger or its function;
//   * the claim function carries every guard section 4 of the migration lists,
//     is SECURITY DEFINER with search_path pinned, owned by postgres, revoked
//     from PUBLIC, anon and service_role and granted to authenticated only;
//   * the app's claim (apps/web/lib/clinical/review.ts) probes for and calls the
//     function by the exact signature the migration creates. THE APP HALF IS ITS
//     OWN PR and merges to main FIRST (owner ruling Q2 (b)), so until main is
//     merged in here review.ts is main's, which names the function nowhere: that
//     state is accepted only while the migration is still parked, only when the
//     file carries no trace of the function (never a half-built claim), and only
//     with the apply document's stage 0 refusing a head without the app half.
//     From the promotion on, the app half must be here;
//   * the pre-check's Q3 verdict (13) is the gate the owner ruled: OK only when
//     the real drafts read at risk 0 AND the six planted rows read exactly their
//     classes, through ONE classification shared by both; its "author writes"
//     arm spares a draft in an ACTIVE OWNER's name (the owner arm, which 0097
//     does not touch, still admits its author, so counting it would halt a
//     sitting over a draft its author can finish); and the transaction sets
//     row_security = off before any read, so a session that does not bypass row
//     level security errors instead of reading a filtered zero;
//   * the apply document runs the files it pins: every SHA0097, SHA, SHAPRE,
//     SHAPOST and SHABEHAVIOUR assignment in its blocks is the sha256 of the file
//     it names, and its sidecar is the sha256 of the document itself;
//   * the migration is read WHERE IT STANDS: parked in migrations-pending now,
//     or promoted into migrations/ as 0097. Both present, or neither, is red;
//   * THE FILES DESCRIBE THE DATABASE WITH 0097. The apply document, the
//     behaviour check and the DB-gated suite carry no BEFORE column, no
//     expected FAIL set before the apply, and no arm about the policies 0097
//     replaces.
//
// Each rule is a function of the texts it reads. The tests run it on the
// committed files; the CONTROLS run the SAME function on a planted copy and
// require it to go red with that rule's own message.
//
// WHAT IT DOES NOT PROVE: that any of it runs. That is the rehearsal's job
// (docs/migration-apply-0097.md), and the DB-gated suite's
// (packages/db/tests/clinical-records-write-matrix.db.test.ts).
//
// The ACTOR line of the behaviour check is C4's rule and is checked there:
// scripts/behaviour-checks-print-actor.test.mjs lists the file in FILES.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const PENDING_PATH = "packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_write_matrix.sql";
const PROMOTED_PATH = "packages/db/migrations/0097_clinical_records_write_matrix.sql";

/** Where the migration stands: exactly one of the two places. `exists` answers for a repo path. */
function locateMigration(exists) {
  const found = [PENDING_PATH, PROMOTED_PATH].filter((p) => exists(p));
  assert.equal(found.length, 1,
    `the 0097 migration must stand in exactly one of ${PENDING_PATH} and ${PROMOTED_PATH}; found ${found.length}`);
  return found[0];
}

const MIGRATION_PATH = locateMigration((p) => existsSync(join(ROOT, p)));
const PRE = "scripts/db/precheck-0097-registo-writes.sql";
const POST = "scripts/db/postcheck-0097-registo-writes.sql";
const BEHAVIOUR = "scripts/db/behaviour-registo-writes-readonly.sql";
const REVIEW = "apps/web/lib/clinical/review.ts";
const DOC = "docs/migration-apply-0097.md";
const SIDECAR = "docs/migration-apply-0097.sha256";
const DBTEST = "packages/db/tests/clinical-records-write-matrix.db.test.ts";

const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);
const review = read(REVIEW);
const doc = read(DOC);
const sidecar = read(SIDECAR);
const behaviour = read(BEHAVIOUR);
const dbtest = read(DBTEST);

const FN = "claim_ai_draft_authorship";
const ALTERED = ["clinical_records_insert", "clinical_records_update", "clinical_records_delete"];

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const md5 = (s) => createHash("md5").update(s).digest("hex");

/** A SQL text's code: its comment blocks and line comments removed (a `-->` breakpoint stays). */
const statementsOf = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n>][^\n]*/g, "");
/** Whitespace collapsed, for comparing expressions written across lines. */
const squash = (s) => s.replace(/\s+/g, " ").trim();

/** Every ALTER POLICY in a text: { name, body } (body up to the statement's `;`). */
function alteredPolicies(sql) {
  return [...sql.matchAll(/ALTER POLICY "([a-z_]+)" ON public\.clinical_records([\s\S]*?);--> statement-breakpoint/g)]
    .map((m) => ({ name: m[1], body: m[2] }));
}

/** The body between AS $$ and $$; of the claim function, as Postgres stores it in prosrc. */
function claimBody(sql) {
  const m = sql.match(new RegExp(`FUNCTION public\\.${FN}\\(p_record_id uuid\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`));
  return m ? m[1] : null;
}

// 0045's owner arm and tenant conjunct, as each ALTER restates them.
const OWNER_ARM = "tenant_id = (select public.jwt_tenant_id()) AND ( (select public.jwt_role()) = 'owner' OR (";
const AUTHOR = "(select public.jwt_role()) = 'therapist' AND practitioner_id = (select auth.uid()) ) ) )";
const AUTHOR_AND_SEES =
  "(select public.jwt_role()) = 'therapist' AND practitioner_id = (select auth.uid()) AND public.clinical_therapist_sees_patient(patient_id) ) ) )";

// ---------------------------------------------------------------------------
// THE RULES. Each throws an AssertionError with its own message.
// ---------------------------------------------------------------------------

function assertChecksPinMigrationHash(migrationText, preText, postText) {
  const want = sha256(migrationText);
  const prePins = [...statementsOf(preText).matchAll(/hash = '([0-9a-f]{64})'\)\s+AS has_0097/g)].map((m) => m[1]);
  assert.equal(prePins.length, 1, "the pre-check must pin 0097's hash exactly once");
  assert.equal(prePins[0], want, "the migration changed and the pre-check's has_0097 pin did not");
  const postCode = statementsOf(postText);
  const postPins = [
    ...postCode.matchAll(/hash = '([0-9a-f]{64})'\)\s+AS has_0097/g),
    ...postCode.matchAll(/newest_hash = '([0-9a-f]{64})'/g),
  ].map((m) => m[1]);
  assert.equal(postPins.length, 3, "the post-check must pin 0097's hash in has_0097 and twice in verdict 14");
  for (const p of postPins) assert.equal(p, want, "the migration changed and a post-check hash pin did not");
}

function assertPostCheckPinsClaimBody(migrationText, postText) {
  const body = claimBody(migrationText);
  assert.ok(body, "the claim function was not found in the migration");
  const pins = [...statementsOf(postText).matchAll(/AND nf_shape = '[^']*body=([0-9a-f]{32})'/g)].map((m) => m[1]);
  assert.equal(pins.length, 1, "post-check verdict 11 must compare the claim function's body md5 exactly once");
  assert.equal(pins[0], md5(body), `post-check verdict 11 does not pin the claim function's body md5 ${md5(body)}`);
}

function assertMigrationAltersExactlyTheThree(migrationText) {
  const code = statementsOf(migrationText);
  assert.ok(!/\b(CREATE|DROP) POLICY\b/.test(code), "the migration creates or drops a policy");
  const all = [...code.matchAll(/ALTER POLICY "([a-z_]+)" ON ([a-z_.]+)/g)].map((m) => `${m[2]}.${m[1]}`).sort();
  assert.deepEqual(all, ALTERED.map((n) => `public.clinical_records.${n}`).sort(),
    "the migration does not alter exactly the three write policies of clinical_records");
  const byName = Object.fromEntries(alteredPolicies(code).map((p) => [p.name, squash(p.body)]));
  const upd = `USING ( ${OWNER_ARM} ${AUTHOR} WITH CHECK ( ${OWNER_ARM} ${AUTHOR_AND_SEES}`;
  assert.equal(byName.clinical_records_update, upd,
    "clinical_records_update is not 0045's owner arm plus the author-only therapist arm (USING) and the author-AND-treats arm (WITH CHECK)");
  assert.equal(byName.clinical_records_delete, `USING ( ${OWNER_ARM} ${AUTHOR}`,
    "clinical_records_delete is not 0045's owner arm plus the author-only therapist arm");
  assert.equal(byName.clinical_records_insert, `WITH CHECK ( ${OWNER_ARM} ${AUTHOR_AND_SEES}`,
    "clinical_records_insert is not 0045's owner arm plus the author-AND-treats therapist arm");
}

function assertTriggerUntouched(migrationText) {
  const code = statementsOf(migrationText);
  assert.ok(!/enforce_clinical_record_immutability|clinical_records_enforce_immutability/.test(code),
    "the migration names the immutability trigger or its function");
  assert.ok(!/\bTRIGGER\b/i.test(code), "the migration touches a trigger");
}

const CLAIM_GUARDS = [
  ["the row's tenant", /c\.tenant_id = public\.jwt_tenant_id\(\)/],
  ["the therapist role", /public\.jwt_role\(\) = 'therapist'/],
  ["a caller", /auth\.uid\(\) IS NOT NULL/],
  ["an AI draft", /c\.source = 'ai_ingested'/],
  ["a draft", /c\.status = 'draft'/],
  ["an unclaimed one", /c\.ai_review_state = 'pending_review'/],
  ["no author yet", /c\.practitioner_id IS NULL/],
  ["a patient the caller treats or created", /public\.clinical_therapist_sees_patient\(c\.patient_id\)/],
];

function assertClaimFunctionIsNarrow(migrationText) {
  const code = statementsOf(migrationText);
  const body = claimBody(code);
  assert.ok(body, "the claim function was not found in the migration");
  const where = body.match(/WHERE c\.id = p_record_id([\s\S]*?);/);
  assert.ok(where, "the claim function has no UPDATE ... WHERE c.id = p_record_id");
  for (const [label, re] of CLAIM_GUARDS) assert.match(where[1], re, `the claim function does not require ${label}`);
  assert.ok(!/\bOR\b/i.test(where[1]), "the claim function's WHERE has an OR, so one guard could stand in for another");
  assert.match(body, /SET practitioner_id = auth\.uid\(\)\s+WHERE/, "the claim function sets something other than the author alone");
  const head = code.match(new RegExp(`FUNCTION public\\.${FN}\\(p_record_id uuid\\)([\\s\\S]*?)AS \\$\\$`));
  assert.ok(head, "the claim function's header was not found");
  for (const kw of ["RETURNS boolean", "SECURITY DEFINER", "SET search_path = public", "VOLATILE"]) {
    assert.ok(squash(head[1]).includes(kw), `the claim function is not ${kw}`);
  }
  assert.match(code, new RegExp(`ALTER FUNCTION public\\.${FN}\\(uuid\\) OWNER TO postgres;`), "the claim function is not owned by postgres");
  assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION public\\.${FN}\\(uuid\\) FROM PUBLIC, anon, service_role;`),
    "the claim function is not revoked from PUBLIC, anon and service_role by name");
  const grants = [...code.matchAll(new RegExp(`GRANT [A-Z ,]+ ON FUNCTION public\\.${FN}\\(uuid\\) TO ([a-z_, ]+);`, "g"))].map((m) => m[1]);
  assert.deepEqual(grants, ["authenticated"], "the claim function is granted to someone other than authenticated alone");
}

/**
 * Where the app half stands on this branch: "present" once main, which carries
 * it (Q2 (b)), is merged in; "absent" while review.ts is still main's from
 * before it. Any mention of the function counts as present, so a half-built
 * claim is judged by the full rule below and never passes as "absent".
 */
const appHalfState = (reviewText) => (reviewText.includes(FN) ? "present" : "absent");

/** The line stage 0 of the apply document carries, refusing a head without the app half. */
const STAGE0_APP_HALF =
  `grep -qF "to_regprocedure('public.${FN}(uuid)')" apps/web/lib/clinical/review.ts || { echo "STOP: the app half (Q2 (b)) is not on this head`;

function assertAppHalfWhereItMustBe(migrationPath, reviewText, docText) {
  const stage0 = docText.split("## STAGE 0")[1]?.split("\n## ")[0] ?? "";
  assert.ok(stage0.includes(STAGE0_APP_HALF),
    "the apply document's stage 0 does not refuse a head without the app half");
  if (appHalfState(reviewText) === "present") return;
  assert.notEqual(migrationPath, PROMOTED_PATH,
    "0097 is promoted but the app half is not on this branch: main, which carries it, is merged in before the promotion");
}

function assertAppCallsTheFunction(migrationText, reviewText) {
  assert.ok(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${FN}\\(p_record_id uuid\\)`).test(statementsOf(migrationText)),
    "the migration does not create the claim function the app calls");
  assert.ok(reviewText.includes(`to_regprocedure('public.${FN}(uuid)')`), "the app's claim does not probe for the function by its signature");
  assert.ok(reviewText.includes(`select public.${FN}(\${recordId}::uuid)`), "the app's claim does not call the function");
  assert.ok(/await takeAiDraftAuthorship\(tx, ctx, ref\.recordId\);\s+const updated = await tx\s+\.update\(clinicalRecords\)/.test(reviewText),
    "the app does not take authorship immediately before the claim's UPDATE, in the same transaction");
}

/** Each block variable the apply document assigns, and the file whose sha256 it must be. */
function assertDocPinsTheFiles(docText, texts) {
  const want = {
    SHA: sha256(texts.migration),
    SHA0097: sha256(texts.migration),
    SHAPRE: sha256(texts.pre),
    SHAPOST: sha256(texts.post),
    SHABEHAVIOUR: sha256(texts.behaviour),
  };
  for (const [name, hash] of Object.entries(want)) {
    const found = [...docText.matchAll(new RegExp(`^${name}=([^\\s]+)$`, "gm"))].map((m) => m[1]);
    assert.ok(found.length >= 1, `the apply document assigns no ${name}`);
    for (const f of found) assert.equal(f, hash, `the apply document's ${name} is not the sha256 of the file it runs`);
  }
}

/**
 * The files describe the database with 0097. Each pattern is a shape they must
 * not carry: a BEFORE or "Before 0097" column, an expected FAIL set or profile
 * before the apply, a mutation named as the replaced policy, an arm about the
 * policies 0097 replaces.
 */
const PRE_APPLY_PATTERNS = [
  [DOC, /\|\s*BEFORE\s*\|/, "a BEFORE column"],
  [DOC, /Before 0097\s*\|/, "a Before 0097 column"],
  [DOC, /\|\s*differs(\s|\|)/, "a differs cell"],
  [DOC, /XFAIL|failing on exactly/, "an expected FAIL set before the apply"],
  [DOC, /OR'ed back|0045's arm\)/, "a mutation named as the replaced policy"],
  [DOC, /[0-9]+ OK \/ [0-9]+ VACUOUS \/ [1-9][0-9]* FAIL/, "a profile with FAILs"],
  [BEHAVIOUR, /WITHOUT 0097/, "a profile without 0097"],
  [BEHAVIOUR, /[0-9]+ OK \/ [0-9]+ VACUOUS \/ [1-9][0-9]* FAIL/, "a profile with FAILs"],
  [DBTEST, /as 0045 left it/, "an arm asserting the replaced policies"],
  [DBTEST, /const want = w97 \? 0 : 1/, "an arm asserting the replaced policies"],
];

function assertNoPreApplyProfile(texts) {
  for (const [file, re, label] of PRE_APPLY_PATTERNS) {
    assert.ok(!re.test(texts[file]), `${file} publishes the pre-apply profile: ${label}`);
  }
}

/**
 * The owner exclusion in the pre-check's classification (the `k` CTE): a draft
 * whose author is an active owner of the draft's own tenant is one its author
 * still writes ("author writes"), never "author cannot write".
 */
const OWNER_EXCLUSION =
  /WHEN EXISTS \(\s*SELECT 1 FROM public\.users o\s+JOIN public\.roles ro ON ro\.id = o\.role_id AND ro\.slug = 'owner'\s+WHERE o\.id = d\.practitioner_id AND o\.tenant_id = d\.tenant_id AND o\.is_active\)/;

/** The pre-check's one classification: the `k` CTE, up to the `j` CTE. */
const classificationOf = (code) => code.match(/\), k AS \(([\s\S]*?)\), j AS \(/)?.[1] ?? null;

function assertAuthorCannotWriteSparesOwners(preText) {
  const k = classificationOf(statementsOf(preText));
  assert.ok(k, "the pre-check's classification (the k CTE) was not found");
  const writes = k.match(/THEN 'other'([\s\S]*?)THEN 'author writes'/);
  assert.ok(writes, "the pre-check's classification has no author writes arm after the unauthored ones");
  assert.match(writes[1], OWNER_EXCLUSION,
    "the pre-check's author cannot write counts a draft in an active owner's name, which its author still writes");
}

/** The six planted rows and the class each must read, as verdict 13 compares them. */
const Q3_CONTROL =
  "c_gone=author cannot write, c_other=other, c_owner=author writes, c_pending=ai pending, c_review=ai in review, c_treats=author writes";

/**
 * Q3, the owner's ruling: the sitting proceeds only when the at-risk count reads
 * 0, and the count is proven by a control. One classification (k) reads the real
 * drafts and the planted rows; the at-risk classes are exactly the three the
 * ruling names; the verdict is OK only on 0 at risk AND the exact control; and
 * row_security is off before the first read.
 */
function assertQ3GateAndControl(preText) {
  const code = statementsOf(preText);
  const d = code.match(/\), d AS \(([\s\S]*?)\), k AS \(/)?.[1];
  assert.ok(d, "the pre-check's row set (the d CTE) was not found");
  assert.match(d, /FROM public\.clinical_records c\s+WHERE c\.status = 'draft'/, "the pre-check's row set is not every unsigned registo");
  for (const kind of ["c_other", "c_review", "c_gone", "c_pending", "c_owner", "c_treats"]) {
    assert.ok(d.includes(`'${kind}'`), `the pre-check's control does not plant ${kind}`);
  }
  assert.ok(classificationOf(code)?.includes("FROM d"), "the classification does not read the row set the control rides in");
  assert.match(code, /WHERE kind = 'real' AND cls IN \('ai in review', 'other', 'author cannot write'\)\)\s+AS q3_at_risk/,
    "the at-risk count is not exactly the real drafts in the three at-risk classes");
  const verdict = code.match(/'13\. Q3:[\s\S]*?THEN 'OK' ELSE 'FAIL' END FROM j/)?.[0];
  assert.ok(verdict, "the pre-check has no verdict 13 (Q3)");
  assert.ok(verdict.includes(`CASE WHEN q3_at_risk = 0\n             AND q3_control = '${Q3_CONTROL}'`),
    "verdict 13 is not OK only on 0 at risk AND the exact planted control");
  const off = code.indexOf("SET LOCAL row_security = off;");
  assert.ok(off >= 0 && off > code.indexOf("BEGIN READ ONLY;") && off < code.indexOf("WITH pol AS"),
    "the pre-check does not turn row_security off inside its transaction before the first read");
}

function assertSidecarPinsDoc(docText, sidecarText) {
  assert.equal(sidecarText, `${sha256(docText)}  ${DOC}\n`, "the sidecar is not the sha256 of the apply document as it stands");
}

// ---------------------------------------------------------------------------
// THE RULES ON THE COMMITTED FILES.
// ---------------------------------------------------------------------------

test("the pre-check and the post-check pin the sha256 of the migration as it stands", () => {
  assertChecksPinMigrationHash(migration, pre, post);
});

test("post-check verdict 11 pins the claim function's body md5, and it is the body in the migration", () => {
  assertPostCheckPinsClaimBody(migration, post);
});

test("the migration alters exactly the three write policies, each to the ruled therapist arm with 0045's owner arm", () => {
  assertMigrationAltersExactlyTheThree(migration);
});

test("the migration never names the immutability trigger", () => {
  assertTriggerUntouched(migration);
});

test("the claim function carries every guard, is SECURITY DEFINER, owned by postgres and executable by authenticated alone", () => {
  assertClaimFunctionIsNarrow(migration);
});

test(`the app's claim probes for and calls the function the migration creates, right before its UPDATE [app half on this branch: ${appHalfState(review)}]`, () => {
  assertAppHalfWhereItMustBe(MIGRATION_PATH, review, doc);
  if (appHalfState(review) === "present") assertAppCallsTheFunction(migration, review);
});

test("the apply document's blocks pin the sha256 of every file they run, and its sidecar pins the document", () => {
  assertDocPinsTheFiles(doc, { migration, pre, post, behaviour });
  assertSidecarPinsDoc(doc, sidecar);
});

test("the pre-check's author cannot write leaves out a draft in an active owner's name", () => {
  assertAuthorCannotWriteSparesOwners(pre);
});

test("the pre-check's verdict 13 is the Q3 gate: 0 at risk AND the planted control, one classification, row_security off", () => {
  assertQ3GateAndControl(pre);
});

test("no pre-apply profile is published: the document, the behaviour check and the DB-gated suite describe only the database with 0097", () => {
  assertNoPreApplyProfile({ [DOC]: doc, [BEHAVIOUR]: behaviour, [DBTEST]: dbtest });
});

test("the promotion needs no edit here: with the parked file renamed into migrations/, the promoted file is the one read", () => {
  assert.equal(locateMigration((p) => p === PROMOTED_PATH), PROMOTED_PATH);
  assert.equal(locateMigration((p) => p === PENDING_PATH), PENDING_PATH);
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS: every rule above goes red, with its own message, on a
// planted copy fed through the same function.
// ---------------------------------------------------------------------------

/**
 * Replace `from` in `text`, and fail if the anchor is not there (a plant that
 * misses proves nothing). A string `from` is replaced literally, once: a `$$`
 * in SQL must not be read as a replacement pattern. A regex `from` keeps `$1`.
 */
function plant(text, from, to) {
  const out = typeof from === "string" ? text.replace(from, () => to) : text.replace(from, to);
  assert.notEqual(out, text, `the plant did not land: ${String(from).slice(0, 80)}`);
  return out;
}
const red = (fn, message) => assert.throws(fn, { name: "AssertionError", message });

test("CONTROL hash: a one-byte edit to the migration no longer matches the checks' pins", () => {
  const edited = plant(migration, "RETURN n = 1;", "RETURN n  = 1;");
  red(() => assertChecksPinMigrationHash(edited, pre, post), /pre-check's has_0097 pin did not/);
});

test("CONTROL hash: a stale post-check pin is red although the pre-check is current", () => {
  const current = sha256(migration);
  const stale = plant(post, `AND newest_hash = '${current}'`, `AND newest_hash = '${"0".repeat(64)}'`);
  red(() => assertChecksPinMigrationHash(migration, pre, stale), /a post-check hash pin did not/);
});

test("CONTROL hash: a pin parked in a comment does not count", () => {
  const current = sha256(migration);
  const parked = plant(pre, `WHERE hash = '${current}')  AS has_0097`, `WHERE hash = '${"0".repeat(64)}')  AS has_0097`)
    .replace("BEGIN READ ONLY;", `-- WHERE hash = '${current}')  AS has_0097\nBEGIN READ ONLY;`);
  red(() => assertChecksPinMigrationHash(migration, parked, post), /pre-check's has_0097 pin did not/);
});

test("CONTROL body: a changed claim body is red against the md5 the post-check pins", () => {
  const edited = plant(migration, "     AND c.practitioner_id IS NULL\n", "");
  red(() => assertPostCheckPinsClaimBody(edited, post), /does not pin the claim function's body md5/);
});

test("CONTROL policies: an UPDATE arm that keeps the treats-or-created term is red", () => {
  const edited = plant(migration, /(ALTER POLICY "clinical_records_update"[\s\S]*?AND practitioner_id = \(select auth\.uid\(\)\))/,
    "$1 OR public.clinical_therapist_sees_patient(patient_id)");
  red(() => assertMigrationAltersExactlyTheThree(edited), /clinical_records_update is not/);
});

test("CONTROL policies: an UPDATE WITH CHECK without the patient test is red", () => {
  const edited = plant(migration, /(ALTER POLICY "clinical_records_update"[\s\S]*?WITH CHECK[\s\S]*?AND practitioner_id = \(select auth\.uid\(\)\)\n)        AND public\.clinical_therapist_sees_patient\(patient_id\)\n/,
    "$1");
  red(() => assertMigrationAltersExactlyTheThree(edited), /clinical_records_update is not/);
});

test("CONTROL policies: an INSERT arm whose AND became OR is red", () => {
  const edited = plant(migration, "        AND public.clinical_therapist_sees_patient(patient_id)\n      )\n    )\n  );--> statement-breakpoint\n\n/* W2.",
    "        OR public.clinical_therapist_sees_patient(patient_id)\n      )\n    )\n  );--> statement-breakpoint\n\n/* W2.");
  red(() => assertMigrationAltersExactlyTheThree(edited), /clinical_records_insert is not/);
});

test("CONTROL policies: a DELETE arm without its role guard is red", () => {
  const edited = plant(migration, /(ALTER POLICY "clinical_records_delete"[\s\S]*?)\(select public\.jwt_role\(\)\) = 'therapist'\n        AND /,
    "$1");
  red(() => assertMigrationAltersExactlyTheThree(edited), /clinical_records_delete is not/);
});

test("CONTROL policies: a fourth policy altered, or one created, is red", () => {
  const extra = `${migration}\nALTER POLICY "clinical_records_select" ON public.clinical_records USING (true);--> statement-breakpoint\n`;
  red(() => assertMigrationAltersExactlyTheThree(extra), /does not alter exactly the three/);
  const created = `${migration}\nCREATE POLICY "x" ON public.clinical_records FOR SELECT USING (true);--> statement-breakpoint\n`;
  red(() => assertMigrationAltersExactlyTheThree(created), /creates or drops a policy/);
});

test("CONTROL trigger: a statement naming the immutability trigger is red", () => {
  const edited = `${migration}\nALTER TABLE public.clinical_records DISABLE TRIGGER clinical_records_enforce_immutability;--> statement-breakpoint\n`;
  red(() => assertTriggerUntouched(edited), /names the immutability trigger/);
});

test("CONTROL claim: each guard dropped from the claim function is red with its own message", () => {
  const lines = {
    "the row's tenant": "     AND c.tenant_id = public.jwt_tenant_id()\n",
    "the therapist role": "     AND public.jwt_role() = 'therapist'\n",
    "no author yet": "     AND c.practitioner_id IS NULL\n",
    "a patient the caller treats or created": "\n     AND public.clinical_therapist_sees_patient(c.patient_id)",
  };
  for (const [label, line] of Object.entries(lines)) {
    red(() => assertClaimFunctionIsNarrow(plant(migration, line, "")), new RegExp(`does not require ${label}`));
  }
});

test("CONTROL claim: an OR in the claim function's WHERE, an INVOKER header, or a grant to anon is red", () => {
  red(() => assertClaimFunctionIsNarrow(plant(migration, "     AND c.practitioner_id IS NULL", "     AND (c.practitioner_id IS NULL OR true)")),
    /has an OR/);
  red(() => assertClaimFunctionIsNarrow(plant(migration, "  SECURITY DEFINER\n  SET search_path = public\nAS $$\nDECLARE",
    "  SECURITY INVOKER\n  SET search_path = public\nAS $$\nDECLARE")), /is not SECURITY DEFINER/);
  red(() => assertClaimFunctionIsNarrow(plant(migration, `GRANT EXECUTE ON FUNCTION public.${FN}(uuid) TO authenticated;`,
    `GRANT EXECUTE ON FUNCTION public.${FN}(uuid) TO authenticated, anon;`)), /granted to someone other than authenticated alone/);
});

/**
 * The app half's claim as it merges from its own PR, planted onto whatever
 * review.ts this branch holds, so the controls below run on either side of
 * main being merged in. It is the probe, the call and the one line that calls
 * them before the claim's UPDATE, which is all the rule reads.
 */
const APP_HALF_CLAIM = [
  "async function takeAiDraftAuthorship(tx, ctx, recordId) {",
  "  if (ctx.role !== \"therapist\") return;",
  `  const probe = await tx.execute(sql\`select to_regprocedure('public.${FN}(uuid)') is not null as present\`);`,
  "  if (probe[0]?.present !== true) return;",
  `  await tx.execute(sql\`select public.${FN}(\${recordId}::uuid)\`);`,
  "}",
  "      await takeAiDraftAuthorship(tx, ctx, ref.recordId);",
  "      const updated = await tx",
  "        .update(clinicalRecords)",
].join("\n");
const withAppHalf = appHalfState(review) === "present" ? review : `${review}\n${APP_HALF_CLAIM}\n`;

test("CONTROL app: a claim that no longer takes authorship before its UPDATE is red", () => {
  assertAppCallsTheFunction(migration, withAppHalf);
  const edited = plant(withAppHalf, "      await takeAiDraftAuthorship(tx, ctx, ref.recordId);\n", "");
  red(() => assertAppCallsTheFunction(migration, edited), /does not take authorship immediately before/);
  const renamed = plant(withAppHalf, `select public.${FN}(\${recordId}::uuid)`, "select public.claim_something_else(${recordId}::uuid)");
  red(() => assertAppCallsTheFunction(migration, renamed), /does not call the function/);
});

test("CONTROL app half: promoted without it, or a stage 0 that does not refuse a head without it, is red", () => {
  const mainReview = review.split(FN).join("claim_function_named_nowhere");
  assert.equal(appHalfState(mainReview), "absent");
  assertAppHalfWhereItMustBe(PENDING_PATH, mainReview, doc);
  red(() => assertAppHalfWhereItMustBe(PROMOTED_PATH, mainReview, doc), /promoted but the app half is not on this branch/);
  const noGuard = plant(doc, STAGE0_APP_HALF, "true || { echo \"STOP: nothing");
  red(() => assertAppHalfWhereItMustBe(PENDING_PATH, withAppHalf, noGuard), /does not refuse a head without the app half/);
  const halfBuilt = `${mainReview}\n// calls public.${FN} somewhere\n`;
  assert.equal(appHalfState(halfBuilt), "present", "a half-built claim is judged by the full rule, never as absent");
  red(() => assertAppCallsTheFunction(migration, halfBuilt), /does not probe for the function/);
});

test("CONTROL owner drafts: an author cannot write count without the owner exclusion, or with an inactive owner spared, is red", () => {
  const bare = plant(pre, OWNER_EXCLUSION, "WHEN false");
  red(() => assertAuthorCannotWriteSparesOwners(bare), /counts a draft in an active owner's name/);
  const inactive = plant(pre, "AND o.tenant_id = d.tenant_id AND o.is_active)", "AND o.tenant_id = d.tenant_id)");
  red(() => assertAuthorCannotWriteSparesOwners(inactive), /counts a draft in an active owner's name/);
});

test("CONTROL Q3: a verdict that passes on a count alone, an at-risk class dropped, a planted row removed, or row_security left on, is red", () => {
  const noControl = plant(pre, `CASE WHEN q3_at_risk = 0\n             AND q3_control = '${Q3_CONTROL}'`, "CASE WHEN q3_at_risk = 0\n             AND true");
  red(() => assertQ3GateAndControl(noControl), /not OK only on 0 at risk AND the exact planted control/);
  const narrow = plant(pre, "cls IN ('ai in review', 'other', 'author cannot write'))", "cls IN ('author cannot write'))");
  red(() => assertQ3GateAndControl(narrow), /not exactly the real drafts in the three at-risk classes/);
  const noGone = plant(pre, /\s+\('c_gone',[^\n]*\n/, "\n");
  red(() => assertQ3GateAndControl(noGone), /does not plant c_gone/);
  const rlsOn = plant(pre, "SET LOCAL row_security = off;", "SET LOCAL row_security = on;");
  red(() => assertQ3GateAndControl(rlsOn), /does not turn row_security off/);
});

test("CONTROL pre-apply: a BEFORE column, an expected FAIL set, or a pre-0097 arm is red", () => {
  const texts = { [DOC]: doc, [BEHAVIOUR]: behaviour, [DBTEST]: dbtest };
  red(() => assertNoPreApplyProfile({ ...texts, [DOC]: `${doc}\n| Arm | BEFORE | AFTER |\n` }), /a BEFORE column/);
  red(() => assertNoPreApplyProfile({ ...texts, [DOC]: `${doc}\nXFAIL="U1 "\n` }), /an expected FAIL set/);
  red(() => assertNoPreApplyProfile({ ...texts, [BEHAVIOUR]: `${behaviour}\n--   WITHOUT 0097: x\n` }), /a profile without 0097/);
  red(() => assertNoPreApplyProfile({ ...texts, [DOC]: `${doc}\nreads 1 OK / 0 VACUOUS / 1 FAIL\n` }), /a profile with FAILs/);
  red(() => assertNoPreApplyProfile({ ...texts, [DBTEST]: `${dbtest}\n// reads as 0045 left it\n` }), /asserting the replaced policies/);
});

test("CONTROL doc: a stale block pin, or a stale sidecar, is red", () => {
  const stale = doc.replace(/^SHAPRE=[0-9a-f]{64}$/m, `SHAPRE=${"0".repeat(64)}`);
  assert.notEqual(stale, doc, "the plant did not land");
  red(() => assertDocPinsTheFiles(stale, { migration, pre, post, behaviour }), /SHAPRE is not the sha256/);
  const edited = `${doc}\n`;
  red(() => assertSidecarPinsDoc(edited, sidecar), /sidecar is not the sha256/);
  red(() => assertDocPinsTheFiles(doc, { migration: `${migration} `, pre, post, behaviour }), /SHA(0097)? is not the sha256/);
});

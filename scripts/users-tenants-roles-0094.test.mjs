// 0094 (users/tenants/roles policy split, HELD): the migration and its three
// check files agree with each other, byte for byte where it matters.
//
// WHAT THIS PROVES, statically, with no database:
//   * COMMENTS NEVER COUNT. Every rule that reads a check file reads its code
//     with block and line comments removed, so a verdict that is commented
//     out, or a pin parked in a comment, satisfies no rule;
//   * the pre-check's "0094 is absent, by hash" pins the sha256 of the pending
//     file as it stands. A promotion changes no byte, so this is the hash the
//     journal will carry; an edit to the migration that forgets the pre-check
//     goes red here;
//   * the guard function's body md5 is the md5 of the body in the migration
//     file IN THE COMPARISON EACH CHECK MAKES: post-check verdict 10's CASE
//     and the behaviour check's arm 9 read. The same md5 in a comment or an
//     expected column does not count;
//   * the eight policies the migration creates are the eight the pre-check's
//     verdict 4 expects absent, and each one has a post-check verdict that
//     compares its catalogue shape to a pinned value: command, permissive,
//     role, and a USING and a WITH CHECK md5 exactly where the migration
//     writes those clauses. A name that is merely MENTIONED in the post-check
//     (its "every other policy" exclusion list names all eight) does not
//     count, and neither does a commented-out verdict;
//   * the three policies it drops are the three the pre-check reads and pins
//     as FOR ALL in a verdict that is not commented out;
//   * the migration never drops, creates or alters the token hook's two read
//     policies;
//   * NO POLICY ON users READS users. users_tenant_select carries a sublink,
//     so a users policy that reads users makes Postgres refuse every UPDATE
//     of users ("infinite recursion detected in policy"). The first draft did
//     exactly that; the rehearsal's DB suite caught it. The rule refuses any
//     mention of the users table in a users policy's body, so a read through
//     FROM, a JOIN or a comma list is caught alike;
//   * the guard trigger's shape, where post-check verdict 12 and behaviour
//     arm 9 read it, pins more than tgtype: tgtype is 19 for a trigger with
//     an UPDATE OF column list or a WHEN clause too, and either one narrows
//     when the guard fires, so both reads also require tgattr empty and
//     tgqual NULL. Comments do not count;
//   * behaviour arm 10 counts staff rows naming another tenant's role over
//     EVERY tenant's rows, not only the actor's tenant, as its header says;
//   * the behaviour check reads every UPDATE on both sides: for each of the
//     three tables it reads the WITH CHECK apart from the USING and evaluates
//     it, and arm 12 evaluates the users one over candidate new rows given
//     every tenant and every role or none, compared with the rule by md5.
//     "Only an owner may make an owner" lives in that WITH CHECK;
//   * behaviour arm 13 evaluates every write expression the file reads over
//     phantom rows, each real row given a tenant id that no tenant has (and
//     checked to be no tenant's), and its verdict wants none admitted. That
//     is what tests a write's tenant predicate on a database with one
//     tenant, where no other tenant's row exists to test it with;
//   * the migration is read WHERE IT STANDS: parked in migrations-pending
//     now, or promoted into migrations/ as 0094. The promotion is a rename,
//     so it needs no edit here; both files present, or neither, is red;
//
// Each rule is a function of the texts it reads. The tests run it on the
// committed files; the CONTROLS run the SAME function on a planted copy and
// require it to go red with that rule's own message.
//
// WHAT IT DOES NOT PROVE: that any of it runs. That is the rehearsal's job
// (the PR body), and the DB suite's once the file is promoted.
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

/** The migration parked, and the same bytes after the promotion renames it. */
const PENDING_PATH = "packages/db/migrations-pending/NEXT-AFTER-0093_users_tenants_roles_policy_split.sql";
const PROMOTED_PATH = "packages/db/migrations/0094_users_tenants_roles_policy_split.sql";

/** Where the migration stands: exactly one of the two places. `exists` answers for a repo path. */
function locateMigration(exists) {
  const found = [PENDING_PATH, PROMOTED_PATH].filter((p) => exists(p));
  assert.equal(found.length, 1,
    `the 0094 migration must stand in exactly one of ${PENDING_PATH} and ${PROMOTED_PATH}; found ${found.length}`);
  return found[0];
}

const MIGRATION_PATH = locateMigration((p) => existsSync(join(ROOT, p)));
const PRE = "scripts/db/precheck-users-tenants-roles.sql";
const POST = "scripts/db/postcheck-users-tenants-roles.sql";
const BEHAVIOUR = "scripts/db/behaviour-users-tenants-roles-readonly.sql";

const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);
const behaviour = read(BEHAVIOUR);

const NEW_POLICIES = [
  "tenants_tenant_select",
  "tenants_manager_update",
  "roles_tenant_select",
  "users_tenant_select",
  "users_manager_insert",
  "users_manager_update",
  "users_self_update",
  "users_manager_delete",
];
const DROPPED = ["tenants_tenant_isolation", "roles_tenant_isolation", "users_tenant_isolation"];
/** pg_policy.polcmd for each FOR clause. */
const POLCMD = { SELECT: "r", INSERT: "a", UPDATE: "w", DELETE: "d", ALL: "\\*" };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const md5 = (s) => createHash("md5").update(s).digest("hex");

/** A SQL text's code: its comment blocks and line comments removed (a `-->` breakpoint stays). */
const statementsOf = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n>][^\n]*/g, "");

/** Every CREATE POLICY in a text: { name, table, body }. */
function createdPolicies(sql) {
  const out = [];
  const re = /CREATE POLICY "([a-z_]+)" ON public\.([a-z_]+)([\s\S]*?);--> statement-breakpoint/g;
  for (const m of sql.matchAll(re)) out.push({ name: m[1], table: m[2], body: m[3] });
  return out;
}

/** The body between AS $$ and $$; of the guard function, as Postgres stores it in prosrc. */
function guardBody(sql) {
  const m = sql.match(/FUNCTION public\.users_self_service_columns\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
  return m ? m[1] : null;
}

/**
 * The post-check's shape string for a created policy, as a regex source:
 * table.name=cmd/permissive/roles/using-md5/check-md5, where an md5 stands
 * exactly where the migration writes the clause and '-' where it does not.
 */
function shapePattern(p) {
  const head = p.body.match(/^\s*(?:AS\s+(PERMISSIVE|RESTRICTIVE)\s+)?FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+TO\s+([a-z_]+)\s/);
  assert.ok(head, `${p.name}: its FOR ... TO ... clause was not found`);
  const permissive = head[1] === "RESTRICTIVE" ? "false" : "true";
  const using = /\bUSING\s*\(/.test(p.body) ? "[0-9a-f]{32}" : "-";
  const check = /\bWITH CHECK\s*\(/.test(p.body) ? "[0-9a-f]{32}" : "-";
  return `${p.table}\\.${p.name}=${POLCMD[head[2]]}/${permissive}/${head[3]}/${using}/${check}`;
}

// ---------------------------------------------------------------------------
// THE RULES. Each throws an AssertionError with its own message.
// ---------------------------------------------------------------------------

function assertPreCheckPinsMigrationHash(migrationText, preText) {
  const pinned = [...statementsOf(preText).matchAll(/hash = '([0-9a-f]{64})'\)\s+AS has_0094/g)].map((m) => m[1]);
  assert.equal(pinned.length, 1, "the pre-check must pin 0094's hash exactly once");
  assert.equal(pinned[0], sha256(migrationText), "the migration changed and the pre-check's has_0094 pin did not");
}

/** Where each check COMPARES the guard body md5: the verdict's own test, not a comment or a display column. */
const GUARD_PIN = {
  [POST]: /CASE WHEN fn_shape = 'INVOKER\/plpgsql\/search_path=public\/postgres ([0-9a-f]{32})'/g,
  [BEHAVIOUR]: /AND md5\(f\.prosrc\) = '([0-9a-f]{32})'/g,
};

function assertChecksPinGuardBody(migrationText, pinningTexts) {
  const body = guardBody(migrationText);
  assert.ok(body, "the guard function was not found in the migration");
  const want = md5(body);
  for (const [name, text] of Object.entries(pinningTexts)) {
    assert.ok(GUARD_PIN[name], `no guard pin rule for ${name}`);
    const pins = [...statementsOf(text).matchAll(GUARD_PIN[name])].map((m) => m[1]);
    assert.equal(pins.length, 1, `${name} must compare the guard body md5 exactly once`);
    assert.equal(pins[0], want, `${name} does not pin the guard body md5 ${want}`);
  }
}

function assertChecksCoverThePolicies(migrationText, preRaw, postRaw) {
  const statements = statementsOf(migrationText);
  // A verdict that is commented out is not a verdict: read the checks' code only.
  const preText = statementsOf(preRaw);
  const postText = statementsOf(postRaw);
  const made = createdPolicies(statements);
  assert.deepEqual(made.map((p) => p.name).sort(), [...NEW_POLICIES].sort(),
    "the migration does not create exactly the eight policies the checks name");
  const dropped = [...statements.matchAll(/DROP POLICY IF EXISTS "([a-z_]+)"/g)].map((m) => m[1]);
  for (const d of DROPPED) assert.ok(dropped.includes(d), `the migration does not drop ${d}`);

  // Pre-check verdict 4: the list it counts is exactly the eight, and it must count 0.
  const listed = preText.match(/WHERE polname IN \(([^)]*)\)\)\s+AS new_pols/);
  assert.ok(listed, "the pre-check has no new_pols list");
  assert.deepEqual([...listed[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort(), [...NEW_POLICIES].sort(),
    "the pre-check's new_pols list is not exactly the eight policies the migration creates");
  assert.match(preText, /CASE WHEN new_pols = 0 THEN 'OK'/, "the pre-check does not expect the eight absent");

  // Post-check: a verdict compares each created policy's shape to a pinned value.
  for (const p of made) {
    assert.match(postText, new RegExp(`(?:= '|LIKE '%)${shapePattern(p)}(?:'|%')`),
      `the post-check has no verdict pinning the shape of ${p.table}.${p.name}`);
  }

  // Pre-check verdicts 1 to 3: each dropped policy is read and pinned as FOR ALL.
  for (const n of DROPPED) {
    const readAs = preText.match(new RegExp(`FROM pol WHERE polname = '${n}'\\)\\s+AS (old_[a-z]+)`));
    assert.ok(readAs, `the pre-check does not read ${n}`);
    assert.match(preText, new RegExp(`CASE WHEN ${readAs[1]} = '\\*/true/authenticated [0-9a-f]{32} [0-9a-f]{32}'`),
      `the pre-check does not pin ${n} as FOR ALL in a verdict`);
  }
}

function assertHookPoliciesUntouched(migrationText) {
  const statements = statementsOf(migrationText);
  for (const n of ["auth_admin_read_users", "auth_admin_read_roles"]) {
    assert.ok(!new RegExp(`(DROP|CREATE|ALTER) POLICY[^;]*${n}`).test(statements), `the migration touches ${n}`);
  }
}

/**
 * A users policy's body may not name the users table at all: FROM users, JOIN
 * users and `FROM roles r, users u` all read it. The body starts after
 * `ON public.users`, and a word boundary keeps users_* names out of the match.
 */
function assertNoUsersPolicyReadsUsers(migrationText) {
  const onUsers = createdPolicies(statementsOf(migrationText)).filter((p) => p.table === "users");
  assert.equal(onUsers.length, 5, "the migration does not create exactly five policies on users");
  for (const p of onUsers) {
    assert.ok(!/\b(?:public\.)?users\b/i.test(p.body), `${p.name} reads users`);
  }
}

/**
 * Where each check reads the guard trigger's catalogue row: post-check
 * verdict 12's trigger_ok count and behaviour arm 9's guard_ok EXISTS. Each
 * read, comments removed, must pin the whole firing shape.
 */
const TRIGGER_READ = {
  [POST]: /\(SELECT count\(\*\)::int FROM pg_trigger tg([\s\S]*?)AS trigger_ok,/,
  [BEHAVIOUR]: /SELECT \(EXISTS \(\s*SELECT 1 FROM pg_trigger tg([\s\S]*?)AS guard_ok \\gset/,
};
const TRIGGER_PINS = [
  ["tg.tgtype = 19", /\btg\.tgtype = 19\b/],
  ["tg.tgenabled = 'O'", /\btg\.tgenabled = 'O'/],
  ["tg.tgattr::text = ''", /\btg\.tgattr::text = ''/],
  ["tg.tgqual IS NULL", /\btg\.tgqual IS NULL\b/],
];

function assertChecksPinTriggerShape(texts) {
  for (const [name, text] of Object.entries(texts)) {
    assert.ok(TRIGGER_READ[name], `no trigger read rule for ${name}`);
    const m = text.match(TRIGGER_READ[name]);
    assert.ok(m, `${name}: the guard trigger read was not found`);
    const read = statementsOf(m[1]);
    for (const [label, re] of TRIGGER_PINS) {
      assert.match(read, re, `${name}: the guard trigger read does not pin ${label}`);
    }
  }
}

/** Behaviour arm 10's count: every tenant's rows, the one comparison the arm is about, and no tenant filter. */
function assertArm10CountsEveryTenant(behaviourText) {
  const m = behaviourText.match(/\(SELECT count\(\*\)::int FROM public\.users u JOIN public\.roles r ON r\.id = u\.role_id([\s\S]*?)\)\s+AS foreign_role_rows/);
  assert.ok(m, "the behaviour check has no foreign_role_rows count");
  const where = statementsOf(m[1]);
  assert.match(where, /\br\.tenant_id <> u\.tenant_id\b/, "arm 10 does not compare the role's tenant with the row's");
  assert.ok(!/actor_tenant|u\.tenant_id\s*=|r\.tenant_id\s*=/.test(where),
    "arm 10 counts only some tenants' rows, not every tenant's");
}

/**
 * Every UPDATE is measured on both sides, comments removed: for each table the
 * k list reads its WITH CHECK row, the USING read excludes that row, the
 * WITH CHECK read is set apart and evaluated in a WHERE. Arm 12's candidates
 * for users are every staff row given every tenant and every role or none,
 * and its verdict compares the admitted rows with the rule's by md5.
 */
function assertEveryUpdateCheckIsEvaluated(behaviourText) {
  const code = statementsOf(behaviourText);
  for (const t of ["users", "tenants", "roles"]) {
    assert.match(code, new RegExp(`\\('${t}', 'w', true\\)`), `the behaviour check does not read the ${t} UPDATE WITH CHECK`);
    assert.match(code, new RegExp(`FILTER \\(WHERE tbl = '${t}'\\s+AND cmd = 'w' AND NOT use_check\\) AS e_${t}_upd,`),
      `the ${t} UPDATE USING read does not exclude its WITH CHECK`);
    assert.match(code, new RegExp(`FILTER \\(WHERE tbl = '${t}'\\s+AND cmd = 'w' AND use_check\\)\\s+AS e_${t}_upd_chk,`),
      `the ${t} UPDATE WITH CHECK is not read apart from its USING`);
    // Over the table's own rows (arms 7 and 8) or arm 12's candidates; arm 13's
    // phantom rows (FROM ph_<table>) name the same expression and do not count.
    assert.match(code, new RegExp(`(?:FROM public\\.${t}|\\) AS ${t})\\s+WHERE :e_${t}_upd_chk\\b`),
      `the behaviour check never evaluates the ${t} UPDATE WITH CHECK`);
  }
  const m = code.match(/SELECT count\(\*\)::int AS a_chk_n[\s\S]*?WHERE :e_users_upd_chk \\gset/);
  assert.ok(m, "arm 12 does not evaluate the users UPDATE WITH CHECK over candidate rows");
  assert.match(m[0], /CROSS JOIN public\.tenants t\b/, "arm 12's candidates are not given every tenant");
  assert.match(m[0], /CROSS JOIN \(SELECT id FROM public\.roles UNION ALL SELECT NULL::uuid\) ro\b/,
    "arm 12's candidates are not given every role and none");
  assert.match(m[0], /jsonb_populate_record\(u, jsonb_build_object\('tenant_id', t\.id, 'role_id', ro\.id\)\)/,
    "arm 12's candidates do not carry the tenant and the role they are given");
  assert.match(code, /\(12, '12\. [\s\S]*?CASE WHEN :'a_chk_md5' <> :'r_chk_md5'/,
    "arm 12's verdict does not compare the admitted rows with the rule's");
}

/** Each table's tenant key, which arm 13's phantom rows replace. */
const PHANTOM_KEY = { users: "tenant_id", tenants: "id", roles: "tenant_id" };
const WRITE_EXPRESSIONS = ["upd", "upd_chk", "ins", "del"];

/**
 * Arm 13, comments removed: the phantom id is checked to be no tenant's; each
 * table's phantom rows are its real rows with the tenant key replaced by that
 * id; every write expression the file reads is evaluated over them; and the
 * verdict wants none admitted.
 */
function assertArm13EvaluatesEveryWriteOverAPhantomTenant(behaviourText) {
  const code = statementsOf(behaviourText);
  assert.match(code, /NOT EXISTS \(SELECT 1 FROM public\.tenants WHERE id = :'phantom_tenant'::uuid\)\)::text AS phantom_is_free \\gset/,
    "arm 13 does not check that no tenant has the phantom id");
  for (const [t, key] of Object.entries(PHANTOM_KEY)) {
    assert.match(code, new RegExp(`ph_${t} AS \\(SELECT nr\\.\\* FROM public\\.${t} x\\s+` +
      `CROSS JOIN LATERAL jsonb_populate_record\\(x, jsonb_build_object\\('${key}', :'phantom_tenant'\\)\\) nr\\)`),
      `arm 13's ${t} rows are not given the phantom tenant`);
    for (const e of WRITE_EXPRESSIONS) {
      assert.match(code, new RegExp(`\\(SELECT count\\(\\*\\)::int FROM ph_${t} AS ${t} WHERE :e_${t}_${e}\\)`),
        `arm 13 does not evaluate e_${t}_${e} over the phantom rows`);
    }
  }
  assert.match(code, /\(13, '13\. [\s\S]*?CASE WHEN :ph_admitted = 0 AND :ph_rows > 0 THEN 'OK' ELSE 'FAIL' END\)/,
    "arm 13's verdict does not require that no phantom row is admitted");
}

// ---------------------------------------------------------------------------
// THE RULES ON THE COMMITTED FILES.
// ---------------------------------------------------------------------------

test("the pre-check pins the sha256 of the pending migration as it stands", () => {
  assertPreCheckPinsMigrationHash(migration, pre);
});

test("the guard body md5 pinned in the post-check and the behaviour check is the body in the migration", () => {
  assertChecksPinGuardBody(migration, { [POST]: post, [BEHAVIOUR]: behaviour });
});

test("the migration creates exactly the eight policies, the pre-check expects them absent, the post-check pins each one's shape, and the three dropped are pinned present", () => {
  assertChecksCoverThePolicies(migration, pre, post);
});

test("the token hook's two read policies are never dropped, created or altered", () => {
  assertHookPoliciesUntouched(migration);
});

test("no policy on users reads users (Postgres would refuse every UPDATE of users with infinite recursion)", () => {
  assertNoUsersPolicyReadsUsers(migration);
});

test("post-check verdict 12 and behaviour arm 9 pin the guard trigger's whole firing shape (tgtype, enabled, no column list, no WHEN)", () => {
  assertChecksPinTriggerShape({ [POST]: post, [BEHAVIOUR]: behaviour });
});

test("behaviour arm 10 counts every tenant's staff rows, not only the actor's tenant", () => {
  assertArm10CountsEveryTenant(behaviour);
});

test("the behaviour check evaluates every UPDATE's WITH CHECK, and arm 12 the users one over candidate rows given every tenant and role", () => {
  assertEveryUpdateCheckIsEvaluated(behaviour);
});

test("behaviour arm 13 evaluates every write expression over phantom rows given a tenant id no tenant has, and wants none admitted", () => {
  assertArm13EvaluatesEveryWriteOverAPhantomTenant(behaviour);
});

test("the promotion needs no edit here: with the parked file renamed into migrations/, the promoted file is the one read", () => {
  assert.equal(locateMigration((p) => p === PROMOTED_PATH), PROMOTED_PATH);
  assert.equal(locateMigration((p) => p === PENDING_PATH), PENDING_PATH);
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS: every rule above goes red, with its own message, on a
// planted copy fed through the same function.
// ---------------------------------------------------------------------------

/** Replace `from` in `text`, and fail if the anchor is not there (a plant that misses proves nothing). */
function plant(text, from, to) {
  const out = text.replace(from, to);
  assert.notEqual(out, text, `the plant did not land: ${String(from).slice(0, 80)}`);
  return out;
}
const red = (fn, message) => assert.throws(fn, { name: "AssertionError", message });

test("CONTROL pin: a one-byte edit to the migration no longer matches the pre-check's pin", () => {
  const edited = plant(migration, "('owner', 'admin')", "('owner','admin')");
  red(() => assertPreCheckPinsMigrationHash(edited, pre), /has_0094 pin did not/);
});

test("CONTROL pin: a stale has_0094 pin is red even when the current hash sits elsewhere in the pre-check", () => {
  const current = sha256(migration);
  const stale = plant(pre, `hash = '${current}')`, `hash = '${"0".repeat(64)}')`);
  const parked = plant(stale, "BEGIN READ ONLY;", `-- hash = '${current}'\nBEGIN READ ONLY;`);
  red(() => assertPreCheckPinsMigrationHash(migration, parked), /has_0094 pin did not/);
});

test("CONTROL pin: a has_0094 read replaced by a constant is red, although a line comment still carries the pin", () => {
  const current = sha256(migration);
  const parked = plant(pre, `(SELECT count(*)::int FROM drizzle.__drizzle_migrations\n      WHERE hash = '${current}')`,
    `0 -- WHERE hash = '${current}')\n     `);
  red(() => assertPreCheckPinsMigrationHash(migration, parked), /must pin 0094's hash exactly once/);
});

test("CONTROL guard: a changed guard body is red against the md5 the checks pin", () => {
  const edited = plant(migration, "'full_name', 'must_set_password', 'updated_at'",
    "'full_name', 'must_set_password', 'updated_at', 'role_id'");
  red(() => assertChecksPinGuardBody(edited, { [POST]: post, [BEHAVIOUR]: behaviour }), /does not pin the guard body md5/);
});

test("CONTROL guard: a stale md5 in the behaviour check's arm 9 read is red, although its header comment still carries the current one", () => {
  const want = md5(guardBody(migration));
  const stale = plant(behaviour, `md5(f.prosrc) = '${want}'`, `md5(f.prosrc) = '${"0".repeat(32)}'`);
  assert.ok(stale.includes(want), "the plant must leave the header comment's md5 in place");
  red(() => assertChecksPinGuardBody(migration, { [POST]: post, [BEHAVIOUR]: stale }), /does not pin the guard body md5/);
});

test("CONTROL guard: a stale md5 in post-check verdict 10's CASE is red, although its expected column still carries the current one", () => {
  const want = md5(guardBody(migration));
  const stale = plant(post, `CASE WHEN fn_shape = 'INVOKER/plpgsql/search_path=public/postgres ${want}'`,
    `CASE WHEN fn_shape = 'INVOKER/plpgsql/search_path=public/postgres ${"0".repeat(32)}'`);
  assert.ok(stale.includes(want), "the plant must leave the expected column's md5 in place");
  red(() => assertChecksPinGuardBody(migration, { [POST]: stale, [BEHAVIOUR]: behaviour }), /does not pin the guard body md5/);
});

test("CONTROL guard: a behaviour arm 9 whose md5 comparison sits only in a line comment is red", () => {
  const want = md5(guardBody(migration));
  const edited = plant(behaviour, `AND NOT f.prosecdef AND md5(f.prosrc) = '${want}'))`,
    `AND NOT f.prosecdef\n             -- AND md5(f.prosrc) = '${want}'\n             ))`);
  red(() => assertChecksPinGuardBody(migration, { [POST]: post, [BEHAVIOUR]: edited }), /must compare the guard body md5 exactly once/);
});

/** Comment out every line of a matched block, as someone disabling a verdict would. */
const commentOut = (text, block) => plant(text, block, (m) => m.replace(/^(?=.)/gm, "-- "));

test("CONTROL policies: a post-check whose verdict 7 is commented out is red, although the comment still carries its shape pin", () => {
  const edited = commentOut(post, /UNION ALL SELECT '7\. users_self_update[\s\S]*?(?=UNION ALL SELECT '8\.)/);
  assert.match(edited, /-- .*= 'users\.users_self_update=w\//, "the plant must leave the shape pin in a comment");
  red(() => assertChecksCoverThePolicies(migration, pre, edited), /no verdict pinning the shape of users\.users_self_update/);
});

test("CONTROL policies: a pre-check whose verdict 4 is commented out is red, although the comment still carries new_pols = 0", () => {
  const edited = commentOut(pre, /UNION ALL SELECT '4\. none[\s\S]*?(?=UNION ALL SELECT '5\.)/);
  assert.match(edited, /-- .*CASE WHEN new_pols = 0 THEN 'OK'/, "the plant must leave the CASE in a comment");
  red(() => assertChecksCoverThePolicies(migration, edited, post), /does not expect the eight absent/);
});

test("CONTROL policies: a pre-check whose verdict 3 is commented out is red, although the comment still carries its FOR ALL pin", () => {
  const edited = commentOut(pre, /UNION ALL SELECT '3\. users_tenant_isolation[\s\S]*?(?=UNION ALL SELECT '4\.)/);
  assert.match(edited, /-- .*CASE WHEN old_users = '\*\/true\/authenticated /, "the plant must leave the FOR ALL pin in a comment");
  red(() => assertChecksCoverThePolicies(migration, edited, post), /does not pin users_tenant_isolation as FOR ALL/);
});

test("CONTROL policies: a post-check without verdict 7 is red, although the exclusion list still names users_self_update", () => {
  const without7 = plant(post, /UNION ALL SELECT '7\. users_self_update[\s\S]*?(?=UNION ALL SELECT '8\.)/, "");
  assert.ok(without7.includes("'users_self_update'"), "the plant must leave the exclusion list's mention in place");
  red(() => assertChecksCoverThePolicies(migration, pre, without7), /no verdict pinning the shape of users\.users_self_update/);
});

test("CONTROL policies: a migration whose self arm becomes FOR ALL no longer matches the post-check's pinned shape", () => {
  const edited = plant(migration, /(CREATE POLICY "users_self_update" ON public\.users\n  FOR )UPDATE/, "$1ALL");
  red(() => assertChecksCoverThePolicies(edited, pre, post), /no verdict pinning the shape of users\.users_self_update/);
});

test("CONTROL policies: a ninth policy in the migration is red", () => {
  const edited = plant(migration, 'DROP POLICY IF EXISTS "users_manager_delete"',
    'CREATE POLICY "roles_manager_insert" ON public.roles\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (true);--> statement-breakpoint\n' +
    'DROP POLICY IF EXISTS "users_manager_delete"');
  red(() => assertChecksCoverThePolicies(edited, pre, post), /does not create exactly the eight/);
});

test("CONTROL policies: a pre-check that no longer expects one of the eight absent is red", () => {
  const edited = plant(pre, "'users_self_update', ", "");
  red(() => assertChecksCoverThePolicies(migration, edited, post), /new_pols list is not exactly the eight/);
});

test("CONTROL policies: a pre-check without verdict 3 is red, although other_md5's exclusion list still names users_tenant_isolation", () => {
  const without3 = plant(pre, /UNION ALL SELECT '3\. users_tenant_isolation[\s\S]*?(?=UNION ALL SELECT '4\.)/, "");
  assert.ok(without3.includes("'users_tenant_isolation'"), "the plant must leave the exclusion list's mention in place");
  red(() => assertChecksCoverThePolicies(migration, without3, post), /does not pin users_tenant_isolation as FOR ALL/);
});

test("CONTROL hook: a migration that drops or alters a token-hook read policy is red", () => {
  const drops = plant(migration, 'DROP POLICY IF EXISTS "users_manager_delete"',
    'DROP POLICY IF EXISTS "auth_admin_read_users" ON public.users;--> statement-breakpoint\n' +
    'DROP POLICY IF EXISTS "users_manager_delete"');
  red(() => assertHookPoliciesUntouched(drops), /touches auth_admin_read_users/);
  const alters = plant(migration, 'DROP POLICY IF EXISTS "users_manager_delete"',
    'ALTER POLICY "auth_admin_read_roles" ON public.roles USING (false);--> statement-breakpoint\n' +
    'DROP POLICY IF EXISTS "users_manager_delete"');
  red(() => assertHookPoliciesUntouched(alters), /touches auth_admin_read_roles/);
});

test("CONTROL recursion: a users policy that reads users is red", () => {
  const edited = plant(migration,
    "AND id = (SELECT auth.uid())\n  )\n  WITH CHECK",
    "AND id = (SELECT u.id FROM public.users u WHERE u.id = (SELECT auth.uid()))\n  )\n  WITH CHECK",
  );
  red(() => assertNoUsersPolicyReadsUsers(edited), /users_self_update reads users/);
});

test("CONTROL recursion: a users policy that reads users through a JOIN is red", () => {
  const edited = plant(migration,
    "AND id = (SELECT auth.uid())\n  )\n  WITH CHECK",
    "AND id IN (SELECT u.id FROM public.roles r JOIN public.users u ON u.role_id = r.id WHERE u.id = (SELECT auth.uid()))\n  )\n  WITH CHECK",
  );
  red(() => assertNoUsersPolicyReadsUsers(edited), /users_self_update reads users/);
});

test("CONTROL recursion: a users policy that reads users through a comma list is red", () => {
  const edited = plant(migration,
    "AND id = (SELECT auth.uid())\n  )\n  WITH CHECK",
    "AND id IN (SELECT u.id FROM public.roles r, users u WHERE u.role_id = r.id AND u.id = (SELECT auth.uid()))\n  )\n  WITH CHECK",
  );
  red(() => assertNoUsersPolicyReadsUsers(edited), /users_self_update reads users/);
});

test("CONTROL trigger: a post-check verdict 12 that pins tgtype alone is red (an UPDATE OF list or a WHEN keeps tgtype 19)", () => {
  const edited = plant(post, " AND tg.tgattr::text = '' AND tg.tgqual IS NULL", "");
  red(() => assertChecksPinTriggerShape({ [POST]: edited, [BEHAVIOUR]: behaviour }), /does not pin tg\.tgattr::text = ''/);
});

test("CONTROL trigger: a behaviour arm 9 whose WHEN pin sits only in a comment is red", () => {
  const edited = plant(behaviour, "AND tg.tgattr::text = '' AND tg.tgqual IS NULL",
    "AND tg.tgattr::text = '' /* AND tg.tgqual IS NULL */");
  red(() => assertChecksPinTriggerShape({ [POST]: post, [BEHAVIOUR]: edited }), /does not pin tg\.tgqual IS NULL/);
});

test("CONTROL arm 10: a count limited to the actor's tenant is red", () => {
  const edited = plant(behaviour, "WHERE r.tenant_id <> u.tenant_id)",
    "WHERE u.tenant_id = :'actor_tenant'::uuid AND r.tenant_id <> u.tenant_id)");
  red(() => assertArm10CountsEveryTenant(edited), /counts only some tenants' rows/);
});

test("CONTROL update check: an arm 12 that evaluates the users UPDATE USING in its WITH CHECK's place is red", () => {
  const edited = plant(behaviour, "WHERE :e_users_upd_chk \\gset", "WHERE :e_users_upd \\gset");
  red(() => assertEveryUpdateCheckIsEvaluated(edited), /never evaluates the users UPDATE WITH CHECK/);
});

test("CONTROL update check: arm 12 candidates without the role-less choice are red", () => {
  const edited = plant(behaviour, "CROSS JOIN (SELECT id FROM public.roles UNION ALL SELECT NULL::uuid) ro",
    "CROSS JOIN (SELECT id FROM public.roles) ro");
  red(() => assertEveryUpdateCheckIsEvaluated(edited), /not given every role and none/);
});

test("CONTROL update check: arm 12 candidates that keep each row's own role are red", () => {
  const edited = plant(behaviour, "jsonb_build_object('tenant_id', t.id, 'role_id', ro.id)", "jsonb_build_object('tenant_id', t.id)");
  red(() => assertEveryUpdateCheckIsEvaluated(edited), /do not carry the tenant and the role/);
});

test("CONTROL update check: a tenants USING read that does not exclude its WITH CHECK row is red", () => {
  const edited = plant(behaviour, "AND cmd = 'w' AND NOT use_check) AS e_tenants_upd,", "AND cmd = 'w') AS e_tenants_upd,");
  red(() => assertEveryUpdateCheckIsEvaluated(edited), /tenants UPDATE USING read does not exclude its WITH CHECK/);
});

test("CONTROL update check: a roles WITH CHECK that is read but only named in a comment is red", () => {
  const edited = plant(behaviour, "(SELECT count(*)::int FROM public.roles WHERE :e_roles_upd_chk)     AS a_r_upd_chk,",
    "/* WHERE :e_roles_upd_chk */ 0 AS a_r_upd_chk,");
  red(() => assertEveryUpdateCheckIsEvaluated(edited), /never evaluates the roles UPDATE WITH CHECK/);
});

test("CONTROL phantom: arm 13 users rows that keep their own tenant are red", () => {
  const edited = plant(behaviour,
    "FROM public.users x\n                   CROSS JOIN LATERAL jsonb_populate_record(x, jsonb_build_object('tenant_id', :'phantom_tenant')) nr)",
    "FROM public.users x\n                   CROSS JOIN LATERAL jsonb_populate_record(x, '{}'::jsonb) nr)");
  red(() => assertArm13EvaluatesEveryWriteOverAPhantomTenant(edited), /arm 13's users rows are not given the phantom tenant/);
});

test("CONTROL phantom: a tenants UPDATE WITH CHECK that arm 13 names only in a comment is red", () => {
  const edited = plant(behaviour, "(SELECT count(*)::int FROM ph_tenants AS tenants WHERE :e_tenants_upd_chk)",
    "(SELECT 0 /* FROM ph_tenants AS tenants WHERE :e_tenants_upd_chk */)");
  red(() => assertArm13EvaluatesEveryWriteOverAPhantomTenant(edited), /does not evaluate e_tenants_upd_chk over the phantom rows/);
});

test("CONTROL phantom: an arm 13 that never checks the phantom id against the tenants is red", () => {
  const edited = plant(behaviour, "SELECT (NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = :'phantom_tenant'::uuid))::text AS phantom_is_free",
    "SELECT 'true' AS phantom_is_free");
  red(() => assertArm13EvaluatesEveryWriteOverAPhantomTenant(edited), /does not check that no tenant has the phantom id/);
});

test("CONTROL phantom: an arm 13 verdict that ignores what was admitted is red", () => {
  const edited = plant(behaviour, "CASE WHEN :ph_admitted = 0 AND :ph_rows > 0 THEN 'OK'", "CASE WHEN :ph_rows > 0 THEN 'OK'");
  red(() => assertArm13EvaluatesEveryWriteOverAPhantomTenant(edited), /verdict does not require that no phantom row is admitted/);
});

test("CONTROL locate: the migration in both places, or in neither, is red", () => {
  red(() => locateMigration(() => true), /must stand in exactly one of .*; found 2/);
  red(() => locateMigration(() => false), /must stand in exactly one of .*; found 0/);
});

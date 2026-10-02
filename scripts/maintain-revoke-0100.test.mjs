// 0100 (the MAINTAIN revoke from `authenticated`, the catalog-only pilot of the
// SET LOCAL gate): the migration, its two check files and its apply document agree
// with each other, byte for byte where it matters.
//
// WHAT THIS PROVES, statically, with no database:
//   * the migration stands in EXACTLY ONE place, parked in migrations-pending or
//     promoted to 0100, and its bytes are the pinned sha256 either way (the
//     promotion is a rename, so this test needs no edit when it happens);
//   * the migration is the four statements the document describes and nothing
//     else: `SET LOCAL lock_timeout = '5s';` and `SET LOCAL statement_timeout =
//     '60s';` FIRST (the lead's ruling (b) of 2026-10-01), a DO loop of REVOKE
//     MAINTAIN ... FROM authenticated over the ordinary and partitioned tables of
//     `public`, and one ALTER DEFAULT PRIVILEGES revoking MAINTAIN. It is
//     catalog-only: no INSERT, UPDATE, DELETE, TRUNCATE, COPY, MERGE, CREATE or
//     DROP anywhere in its code, no ALTER TABLE, no GRANT, no function (so the
//     SECURITY DEFINER count cannot move and no GATE-CHANGE is owed);
//   * the pre-check and the post-check compare the journal against the pinned
//     sha256 in CODE, not in a comment, and in the compares that decide a verdict:
//     has_0100's count in both files, and the post-check's verdict 11;
//   * the check files write nothing: no statement in their code begins with a
//     writing verb, and no string in them is a writing statement. The pre-check
//     opens READ ONLY itself, the post-check through the stage 2 block's
//     `begin read only`;
//   * both read a NULL relacl as acldefault() of the relation's own object type,
//     's' for a sequence (acldefault's 'S' is a FOREIGN SERVER);
//   * the verdict counts the blocks require are the counts the files print: 13 in
//     the pre-check (the earlier sitting and stage 1), 12 in the post-check;
//   * every sha256 the document pins for a check file or the migration is that
//     file's real sha256, in every block and in the fact table; every pin of a
//     file this branch does not carry yet (the guard pair's new bytes, the reader,
//     verified-migrate, check-journal, 0099) is the value the build was given, in
//     every block; and the sidecar pins the document;
//   * every block that runs the target guard compares the guard AND its module
//     first, and the closing read compares the reader AND the module first;
//   * R9's daytime arm stands in stage 0 and stage 1, the same lines in both, and
//     stage 1 decides closed hours by the clock AND the clinics; its two R9 pins are
//     either a sha256 or the documented placeholder, which can never match one; a
//     filled SHAGATE is the gate file's real sha256 when the file is on this branch;
//     and its catalog-only check, RUN here as written in the document, is an exact
//     compare: it passes the real migration and the same text with whitespace runs
//     widened, and refuses every plant R4 rounds 1 to 3 used, a CR, a NUL, a
//     non-ASCII byte, a one-character change and a space added inside a literal;
//   * THE EARLIER PRE-CHECK SITTING runs from PR #1520's head as its dispatch names
//     it, never from main, and writes into its transcript the guard's verdict and
//     the summary line R9's proof 3 then requires;
//   * every carry the stage 2 block reads is a row the pre-check prints, and no
//     carry's name is a substring of another row's check text;
//   * the blocks carry no `#` line, no `!` but `test !`, and no backslash
//     continuation.
//
// Each rule is a function of the texts it reads. The tests run it on the committed
// files; the CONTROLS run the SAME function on a planted copy and require it to go
// red. Where a function holds several rules, a table gives each rule an input that
// ONLY that rule refuses, so dropping any one rule turns a test red (the mutation
// sweep of 2026-10-02 found 52 rules no test would miss).
//
// WHAT IT DOES NOT PROVE: that any of it runs. That is the rehearsal's job
// (docs/migration-apply-0100.md, "Rehearsal"), and CI's db-tests once the file is
// promoted. The SET LOCAL lines are also held by scripts/migration-timeouts.test.mjs
// (#1510) once it is on main; this file holds them for 0100 on its own meanwhile.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const MIGRATION_SHA = "80f85018e8ed35922ad546b8a28e96d80e894b04f2a1f09f201d00b601ff6106";
const PENDING_PATH = "packages/db/migrations-pending/NEXT-AFTER-0099_revoke_maintain.sql";
const PROMOTED_PATH = "packages/db/migrations/0100_revoke_maintain.sql";
const PRE = "scripts/db/precheck-0100-maintain-revoke.sql";
const POST = "scripts/db/postcheck-0100-maintain-revoke.sql";
const DOC = "docs/migration-apply-0100.md";
const SIDECAR = "docs/migration-apply-0100.sha256";
const GATE_FILE = "scripts/migration-timeouts.test.mjs";

/** The pins of files this branch does not own, as the build was given them and verified them. */
export const EXTERNAL_PINS = Object.freeze({
  SHAPREV: "fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b",
  SHAVM: "ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261",
  SHAGUARD: "6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96",
  SHAPTM: "e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c",
  SHAREADER: "825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387",
  SHACJ: "7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59",
});
/** The two R9 pins and the placeholder each carries until SOLO fills it. */
export const R9_PLACEHOLDERS = Object.freeze({
  SHAGATE: "PLACEHOLDER-UNTIL-1510-MERGES",
  PRECHECK_EARLIER: "PLACEHOLDER-UNTIL-THE-EARLIER-SITTING",
});

/** Where the migration stands: exactly one of the two places. */
export function locateMigration(exists) {
  const found = [PENDING_PATH, PROMOTED_PATH].filter((p) => exists(p));
  if (found.length !== 1) {
    throw new Error(`the 0100 migration must stand in exactly one of ${PENDING_PATH} and ${PROMOTED_PATH}; found ${found.length}`);
  }
  return found[0];
}

/** SQL code: block and line comments removed (a `-->` breakpoint stays). */
export const codeOf = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n>][^\n]*/g, "");

/** The migration's statements, split on drizzle's breakpoint, checked against the four the document names. */
export function migrationProblems(sql) {
  const problems = [];
  const code = codeOf(sql);
  const stmts = code.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  if (stmts.length !== 4) problems.push(`expected 4 statements, found ${stmts.length}`);
  const [lock, stmt, loop, def] = stmts;
  if (lock !== "SET LOCAL lock_timeout = '5s';") problems.push(`statement 1 is not exactly SET LOCAL lock_timeout = '5s'; it is ${lock}`);
  if (stmt !== "SET LOCAL statement_timeout = '60s';") problems.push(`statement 2 is not exactly SET LOCAL statement_timeout = '60s'; it is ${stmt}`);
  if (!/^DO \$\$/.test(loop ?? "")) problems.push("statement 3 is not the DO loop");
  if (!/relkind IN \('r', 'p'\)/.test(loop ?? "")) problems.push("the loop does not select ordinary and partitioned tables");
  if (!/n\.nspname = 'public'/.test(loop ?? "")) problems.push("the loop does not select schema public");
  if (!/'REVOKE MAINTAIN ON TABLE %s FROM authenticated'/.test(loop ?? "")) {
    problems.push("the loop does not revoke exactly MAINTAIN from authenticated");
  }
  if ((loop ?? "").match(/\bEXECUTE\b/gi)?.length !== 1) problems.push("the loop does not EXECUTE exactly one string");
  if (!/^ALTER DEFAULT PRIVILEGES IN SCHEMA public\s+REVOKE MAINTAIN ON TABLES FROM authenticated;$/.test(def ?? "")) {
    problems.push("statement 4 is not the ALTER DEFAULT PRIVILEGES revoke of MAINTAIN");
  }
  if (/FOR ROLE/i.test(code)) problems.push("the default privilege names a FOR ROLE; the document assumes the running role");
  if (/SECURITY\s+DEFINER/i.test(code)) problems.push("the migration names SECURITY DEFINER");
  if (/\bGRANT\b/i.test(code)) problems.push("the migration grants something");
  // CATALOG-ONLY: none of these words anywhere in the code, statements and EXECUTEd strings alike.
  for (const m of code.matchAll(/\b(INSERT|UPDATE|DELETE|TRUNCATE|COPY|MERGE|CREATE|DROP)\b|\bALTER\s+TABLE\b/gi)) {
    problems.push(`a writing or DDL word in the code: ${m[0]}`);
  }
  // Nothing after the top touches either bound, and no transaction control.
  for (const s of stmts.slice(2)) {
    if (/\b(lock_timeout|statement_timeout)\b/i.test(s)) problems.push("a later statement touches a bound");
    if (/^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE|RESET|DISCARD)\b/i.test(s)) problems.push("transaction control or RESET");
  }
  return problems;
}

/** A check file writes nothing: no code line begins with a writing verb, and no string is a writing statement. */
export function writeProblems(sql) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|SET|RESET)\b/i.test(t)) {
      problems.push(`a writing statement: ${t.slice(0, 80)}`);
    }
    for (const m of t.matchAll(/'([^']*)'/g)) {
      if (/^\s*(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|TRUNCATE\s|MERGE\s+INTO|COPY\s|REVOKE\s|GRANT\s|ALTER\s)/i.test(m[1])) {
        problems.push(`a writing statement in a string: '${m[1].slice(0, 60)}'`);
      }
    }
  }
  return problems;
}

/** A NULL relacl reads as acldefault() of the relation's own object type ('s' for a sequence; 'S' is a FOREIGN SERVER). */
export const REL_DEFAULT = `acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)`;
export function aclDefaultProblems(sql) {
  const problems = [];
  const code = codeOf(sql);
  if (/acldefault\(\s*'S'|THEN\s+'S'::"char"|'S'::"char"\s+ELSE/.test(code)) {
    problems.push("acldefault is given the FOREIGN SERVER code 'S' where a sequence's code is 's'");
  }
  if (!code.includes(REL_DEFAULT)) problems.push("rel_items does not read a NULL relacl as acldefault of its own object type");
  return problems;
}

/**
 * The journal compares that DECIDE a verdict name the pinned sha256 in code: has_0100's count, in
 * both files, and (post-check) verdict 11's newest-row compare. A display CASE naming the same hash
 * does not count: it decides nothing.
 */
export function journalPinProblems(sql, which) {
  const problems = [];
  const code = codeOf(sql);
  if (!new RegExp(`WHERE hash = '${MIGRATION_SHA}'\\)\\s+AS has_0100,`).test(code)) {
    problems.push("has_0100 does not count the pinned sha256");
  }
  if (which === "post" && !code.includes(`CASE WHEN has_0100 = 1 AND newest_hash = '${MIGRATION_SHA}' THEN 'OK' ELSE 'FAIL' END`)) {
    problems.push("verdict 11 does not compare the newest row with the pinned sha256");
  }
  return problems;
}

/** Verdicts a check file can print OK for. */
const okVerdicts = (sql) => (codeOf(sql).match(/THEN 'OK' ELSE 'FAIL' END(?: AS verdict)? FROM j/g) ?? []).length;

/** The fenced blocks of a markdown text. */
export const blocksOf = (md) => [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

/** The one block whose text carries `marker`. */
export function blockWith(md, marker) {
  const hits = blocksOf(md).filter((b) => b.includes(marker));
  if (hits.length !== 1) throw new Error(`expected exactly one block carrying ${marker}, found ${hits.length}`);
  return hits[0];
}

export function blockHazards(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (/^\s*#/.test(line)) out.push(`a # line: ${line.trim()}`);
    if (line.replace(/test !/g, "").includes("!")) out.push(`a !: ${line.trim().slice(0, 80)}`);
    if (/\\\s*$/.test(line)) out.push(`a backslash continuation: ${line.trim().slice(0, 80)}`);
  }
  return out;
}

const PIN_NAMES = ["SHA0100", "SHAPRE", "SHAPOST", ...Object.keys(EXTERNAL_PINS), ...Object.keys(R9_PLACEHOLDERS)];
const PIN_LINE = new RegExp(`^(${PIN_NAMES.join("|")})=(\\S+)$`, "gm");

/** Every `NAME=<value>` pin line in the document's blocks, as [name, value] pairs. */
export const pinLines = (md) => blocksOf(md).flatMap((b) => [...b.matchAll(PIN_LINE)].map((m) => [m[1], m[2]]));

/** Every pin the document gives is the file's real sha256, the given external value, or an R9 placeholder. */
export function pinProblems(md, actual) {
  const problems = [];
  const own = { SHA0100: actual.migration, SHAPRE: actual[PRE], SHAPOST: actual[POST] };
  for (const [name, value] of pinLines(md)) {
    if (name in own && value !== own[name]) problems.push(`${name} pins ${value}, the file is ${own[name]}`);
    if (name in EXTERNAL_PINS && value !== EXTERNAL_PINS[name]) problems.push(`${name} pins ${value}, the build was given ${EXTERNAL_PINS[name]}`);
    if (name in R9_PLACEHOLDERS && value !== R9_PLACEHOLDERS[name] && !/^[0-9a-f]{64}$/.test(value)) {
      problems.push(`${name} is neither a sha256 nor its documented placeholder: ${value}`);
    }
  }
  for (const name of Object.keys(R9_PLACEHOLDERS)) {
    const values = new Set(pinLines(md).filter(([n]) => n === name).map(([, v]) => v));
    if (values.size !== 1) problems.push(`${name} does not carry one value across the blocks: ${[...values].join(", ")}`);
  }
  for (const [file, sha] of [[PRE, actual[PRE]], [POST, actual[POST]]]) {
    const row = md.split("\n").find((l) => l.startsWith("| ") && l.includes(`\`${file}\``) && /sha256 `[0-9a-f]{64}`/.test(l));
    if (!row) problems.push(`the fact table gives no sha256 for ${file}`);
    else if (!row.includes(`sha256 \`${sha}\``)) problems.push(`the fact table's sha256 for ${file} is not ${sha}`);
  }
  const names = new Set(pinLines(md).map(([n]) => n));
  for (const n of PIN_NAMES) if (!names.has(n)) problems.push(`no block pins ${n}`);
  return problems;
}

/** A block that runs the guard or the reader compares it, and the module both import, BEFORE it runs it. */
export function compareFirstProblems(block) {
  const problems = [];
  const at = (s) => block.indexOf(s);
  const runs = [
    ["node scripts/assert-production-target.mjs", ['= "${SHAGUARD}" ]', '= "${SHAPTM}" ]']],
    ["${READER} 2>&1", ['= "${SHAREADER}" ]', '= "${SHAPTM}" ]']],
  ];
  for (const [run, compares] of runs) {
    if (at(run) < 0) continue;
    for (const c of compares) {
      if (at(c) < 0 || at(c) > at(run)) problems.push(`the block runs ${run} without comparing ${c} first`);
    }
  }
  return problems;
}

/** R9 proof 2 as the document writes it: the `node -e '...'` program of the `D2=yes` line. */
export function catalogOnlyProgram(block) {
  const line = block.split("\n").find((l) => l.startsWith("if node -e '") && l.endsWith(`' "\${MIG}"; then D2=yes; fi`));
  if (!line) throw new Error("the block carries no R9 proof 2 line");
  return line.slice("if node -e '".length, line.length - `' "\${MIG}"; then D2=yes; fi`.length);
}

/** Stage 1's R9 arm sits after the pre-check and before the apply. */
export function armPositionProblems(block) {
  const problems = [];
  const arm = block.indexOf("THE CLOCK AND THE CLINICS (R9)");
  if (!(arm > block.indexOf("precheck-0100-maintain-revoke.sql 2>&1"))) problems.push("the R9 arm does not follow the pre-check");
  if (!(arm < block.indexOf("node packages/db/scripts/verified-migrate.mjs"))) problems.push("the R9 arm does not precede the apply");
  return problems;
}

/** Every carry is a row the pre-check prints, and no other row's name contains it (stage 2's carry() matches with index()). */
export function carryProblems(carries, rowNames) {
  const problems = [];
  for (const c of carries) {
    const hits = rowNames.filter((r) => r.includes(c));
    if (!hits.includes(c)) problems.push(`the pre-check prints no row named ${c}`);
    else if (hits.length !== 1) problems.push(`carry ${c} is a substring of ${hits.join(", ")}`);
  }
  return problems;
}

const MIGRATION_PATH = locateMigration((p) => existsSync(join(ROOT, p)));
const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);
const doc = read(DOC);
const ACTUAL = { migration: sha256(migration), [PRE]: sha256(pre), [POST]: sha256(post) };
const EARLIER = "0100 EARLIER PRE-CHECK SITTING";
const STAGE0 = "0100 PROMOTION, NUMBER, FILES AND CLOCK VERIFIED";
const STAGE1 = "0100 APPLIED. Paste stage 2 now.";
const STAGE2 = "0100 POST-CHECK PASSED.";
const CLOSING = "CLOSING READ: the journal reads 98";

test("the migration stands in exactly one place, and its bytes are the pinned sha256", () => {
  assert.equal(sha256(migration), MIGRATION_SHA);
  assert.throws(() => locateMigration(() => true), /exactly one/);
  assert.throws(() => locateMigration(() => false), /exactly one/);
});

test("the migration is the four statements, the two SET LOCAL lines first, and it is catalog-only", () => {
  assert.deepEqual(migrationProblems(migration), []);
});

test("CONTROLS: a planted write, DDL, grant, bound change, or a missing or moved SET LOCAL line goes red", () => {
  const planted = [
    migration + "\nTRUNCATE public.patients;--> statement-breakpoint\n",
    migration + "\nDELETE FROM public.patients;--> statement-breakpoint\n",
    migration + "\nINSERT INTO public.patients DEFAULT VALUES;--> statement-breakpoint\n",
    migration + "\nCREATE INDEX x ON public.patients (id);--> statement-breakpoint\n",
    migration + "\nALTER TABLE public.patients ADD COLUMN x int;--> statement-breakpoint\n",
    migration + "\nGRANT SELECT ON public.patients TO anon;--> statement-breakpoint\n",
    migration + "\nSET LOCAL lock_timeout = '0';--> statement-breakpoint\n",
    migration + "\nCOMMIT;--> statement-breakpoint\n",
    migration.replace("'REVOKE MAINTAIN ON TABLE %s FROM authenticated'", "'TRUNCATE %s'"),
    migration.replace("REVOKE MAINTAIN ON TABLES FROM authenticated;", "REVOKE TRIGGER ON TABLES FROM authenticated;"),
    migration.replace("ALTER DEFAULT PRIVILEGES IN SCHEMA public\n  REVOKE", "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public\n  REVOKE"),
    migration.replace("SET LOCAL lock_timeout = '5s';--> statement-breakpoint\n", ""),
    migration.replace("SET LOCAL statement_timeout = '60s';", "SET LOCAL statement_timeout = '600s';"),
    migration.replace(
      "SET LOCAL lock_timeout = '5s';--> statement-breakpoint\nSET LOCAL statement_timeout = '60s';",
      "SET LOCAL statement_timeout = '60s';--> statement-breakpoint\nSET LOCAL lock_timeout = '5s';",
    ),
  ];
  for (const p of planted) {
    assert.notEqual(p, migration, "a plant did not change the file");
    assert.notDeepEqual(migrationProblems(p), [], p.slice(-160));
  }
  // A word in a comment is not code, and does not go red.
  assert.deepEqual(migrationProblems(migration + "\n/* DELETE, TRUNCATE and CREATE TABLE are not here */\n"), []);
});

/** The migration with one line added inside the DO loop, before END LOOP. */
const inLoop = (line) => {
  assert.equal(migration.split("  END LOOP;").length, 2);
  return migration.replace("  END LOOP;", `${line}\n  END LOOP;`);
};
/** The migration with one more condition on the loop's query, which changes no rule's anchor. */
const inWhere = (cond) => {
  assert.equal(migration.split("c.relkind IN ('r', 'p')").length, 2);
  return migration.replace("c.relkind IN ('r', 'p')", `c.relkind IN ('r', 'p') AND ${cond}`);
};
/** The migration with one exact substring replaced; the substring must be there exactly once. */
const swap = (from, to) => {
  assert.equal(migration.split(from).length, 2, `not exactly once: ${from}`);
  return migration.replace(from, () => to);
};

test("CONTROLS, ONE RULE AT A TIME: each migrationProblems rule is the only one an input breaks", () => {
  const W = (w) => [`the word ${w}`, inWhere(`c.relname <> '${w}'`), new RegExp(`^a writing or DDL word in the code: ${w}$`)];
  const cases = [
    ["the four-statement count", migration + "\nSELECT 1;--> statement-breakpoint\n", /^expected 4 statements, found 5$/],
    ["statement 1, lock_timeout", swap("SET LOCAL lock_timeout = '5s';", "SET LOCAL lock_timeout = '50s';"), /^statement 1 is not exactly/],
    ["statement 2, statement_timeout", swap("SET LOCAL statement_timeout = '60s';", "SET LOCAL statement_timeout = '600s';"), /^statement 2 is not exactly/],
    ["statement 3 opens DO $$", swap("DO $$\n", "DO $x$\n").replace("END\n$$;", () => "END\n$x$;"), /^statement 3 is not the DO loop$/],
    ["the loop's relkind", swap("c.relkind IN ('r', 'p')", "c.relkind IN ('r')"), /^the loop does not select ordinary and partitioned tables$/],
    ["the loop's schema (R4 round 1's schema_any plant)", swap("WHERE n.nspname = 'public'", "WHERE true"), /^the loop does not select schema public$/],
    ["the loop's REVOKE string", swap("'REVOKE MAINTAIN ON TABLE %s FROM authenticated'", "'REVOKE MAINTAIN ON TABLE %s FROM anon'"), /^the loop does not revoke exactly MAINTAIN from authenticated$/],
    ["the EXECUTE count, none", swap("    EXECUTE format(", "    PERFORM format("), /^the loop does not EXECUTE exactly one string$/],
    ["the EXECUTE count, two", inLoop("    EXECUTE 'SELECT 1';"), /^the loop does not EXECUTE exactly one string$/],
    ["the EXECUTE count, a lowercase second (R4 round 2)", inLoop("    execute 'SELECT 1';"), /^the loop does not EXECUTE exactly one string$/],
    ["statement 4", swap("REVOKE MAINTAIN ON TABLES FROM authenticated;", "REVOKE TRIGGER ON TABLES FROM authenticated;"), /^statement 4 is not the ALTER DEFAULT PRIVILEGES revoke of MAINTAIN$/],
    ["FOR ROLE", inWhere("c.relname <> 'FOR ROLE'"), /^the default privilege names a FOR ROLE/],
    ["SECURITY DEFINER", inWhere("c.relname <> 'SECURITY DEFINER'"), /^the migration names SECURITY DEFINER$/],
    ["GRANT", inWhere("c.relname <> 'GRANT'"), /^the migration grants something$/],
    ...["INSERT", "UPDATE", "DELETE", "TRUNCATE", "COPY", "MERGE", "CREATE", "DROP", "ALTER TABLE"].map(W),
    ["a later statement names lock_timeout", inWhere("c.relname <> 'lock_timeout'"), /^a later statement touches a bound$/],
    ["a later statement names statement_timeout", inWhere("c.relname <> 'statement_timeout'"), /^a later statement touches a bound$/],
  ];
  for (const [name, input, want] of cases) {
    assert.notEqual(input, migration, `${name}: the input did not change the file`);
    const got = migrationProblems(input);
    assert.equal(got.length, 1, `${name}: expected exactly one problem, got ${JSON.stringify(got)}`);
    assert.match(got[0], want, name);
  }
  // Transaction control can only arrive as a fifth statement, so it always comes with the count;
  // the list it prints is still exact, so dropping the rule or any one of its words goes red.
  for (const kw of ["BEGIN", "COMMIT", "ROLLBACK", "END", "ABORT", "START TRANSACTION", "SAVEPOINT x", "RELEASE x", "RESET ALL", "DISCARD ALL"]) {
    assert.deepEqual(migrationProblems(`${migration}\n${kw};--> statement-breakpoint\n`), ["expected 4 statements, found 5", "transaction control or RESET"], kw);
  }
  // CONTROL: the same constructions with nothing a rule names pass.
  assert.deepEqual(migrationProblems(inWhere("c.relname <> 'x'")), []);
});

test("the pre-check and the post-check compare the journal with the pinned sha256 in code", () => {
  assert.deepEqual(journalPinProblems(pre, "pre"), []);
  assert.deepEqual(journalPinProblems(post, "post"), []);
  // CONTROLS, one rule at a time. The post-check also names the hash in a display CASE (verdict
  // 11's value column), which decides nothing, so a wrong hash in either deciding compare must go
  // red although that CASE still matches.
  const zeros = "00000000" + MIGRATION_SHA.slice(8);
  const one = (sql, from, to) => {
    assert.equal(sql.split(from).length, 2, `not exactly once: ${from}`);
    return sql.replace(from, () => to);
  };
  const v11 = `CASE WHEN has_0100 = 1 AND newest_hash = '${MIGRATION_SHA}' THEN 'OK'`;
  const has = `WHERE hash = '${MIGRATION_SHA}')          AS has_0100,`;
  assert.deepEqual(journalPinProblems(one(post, v11, v11.replace(MIGRATION_SHA, zeros)), "post"), ["verdict 11 does not compare the newest row with the pinned sha256"]);
  assert.deepEqual(journalPinProblems(one(post, has, has.replace(MIGRATION_SHA, zeros)), "post"), ["has_0100 does not count the pinned sha256"]);
  assert.deepEqual(journalPinProblems(one(pre, has, has.replace(MIGRATION_SHA, zeros)), "pre"), ["has_0100 does not count the pinned sha256"]);
  // CONTROL: the pin parked in a comment does not count.
  const commented = pre.replaceAll(`hash = '${MIGRATION_SHA}'`, "hash = 'x' /* 80f85018 */");
  assert.deepEqual(journalPinProblems(commented, "pre"), ["has_0100 does not count the pinned sha256"]);
});

test("the check files write nothing, and each opens READ ONLY", () => {
  assert.deepEqual(writeProblems(pre), []);
  assert.deepEqual(writeProblems(post), []);
  const preCode = codeOf(pre);
  assert.ok(preCode.indexOf("BEGIN READ ONLY;") > 0 && preCode.indexOf("BEGIN READ ONLY;") < preCode.indexOf("WITH t AS"));
  assert.ok(preCode.trimEnd().endsWith("ROLLBACK;"));
  assert.match(blockWith(doc, STAGE2), /-c "begin read only" -f scripts\/db\/postcheck-0100-maintain-revoke\.sql -c "rollback"/);
  // CONTROLS
  assert.notDeepEqual(writeProblems(pre + "\nDELETE FROM public.patients;\n"), []);
  assert.notDeepEqual(writeProblems(post + "\nREVOKE MAINTAIN ON public.patients FROM authenticated;\n"), []);
  assert.notDeepEqual(writeProblems(pre + "\nVACUUM public.patients;\n"), []);
  assert.notDeepEqual(writeProblems(pre + "\nSELECT 'GRANT MAINTAIN ON public.patients TO authenticated';\n"), []);
});

test("CONTROLS, ONE RULE AT A TIME: each writing verb and each writing string writeProblems names is refused alone", () => {
  const verbs = ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "COPY", "MERGE", "CALL", "VACUUM", "ANALYZE", "CLUSTER", "REINDEX", "REFRESH", "LOCK", "COMMIT", "SET", "RESET"];
  for (const v of verbs) {
    const got = writeProblems(`${v} x;`);
    assert.equal(got.length, 1, `${v}: ${JSON.stringify(got)}`);
    assert.match(got[0], /^a writing statement: /, v);
  }
  const strings = ["INSERT INTO x", "DELETE FROM x", "UPDATE x SET y = 1", "TRUNCATE x", "MERGE INTO x", "COPY x", "REVOKE x", "GRANT x", "ALTER x"];
  for (const s of strings) {
    const got = writeProblems(`SELECT '${s}';`);
    assert.equal(got.length, 1, `${s}: ${JSON.stringify(got)}`);
    assert.match(got[0], /^a writing statement in a string: /, s);
  }
  // CONTROLS: a plain read, a plain string and a writing word inside a string that is not a statement pass.
  assert.deepEqual(writeProblems("SELECT 1;"), []);
  assert.deepEqual(writeProblems("SELECT 'a plain string';"), []);
  assert.deepEqual(writeProblems("SELECT 'the INSERT INTO path';"), []);
});

test("the pre-check and the post-check read a NULL relacl as acldefault of its own object type ('s' for a sequence)", () => {
  assert.deepEqual(aclDefaultProblems(pre), []);
  assert.deepEqual(aclDefaultProblems(post), []);
  const foreignServer = (s) => s.replace(`THEN 's'::"char"`, `THEN 'S'::"char"`);
  assert.notDeepEqual(aclDefaultProblems(foreignServer(pre)), []);
  assert.notDeepEqual(aclDefaultProblems(foreignServer(post)), []);
  assert.notDeepEqual(aclDefaultProblems(pre.replace(REL_DEFAULT, "acldefault('r', c.relowner)")), []);
  // ONE RULE AT A TIME: with REL_DEFAULT present, each form of the FOREIGN SERVER code is refused
  // alone; without it, the presence rule is refused alone.
  const S_RULE = "acldefault is given the FOREIGN SERVER code 'S' where a sequence's code is 's'";
  assert.deepEqual(aclDefaultProblems(`${REL_DEFAULT}\nSELECT acldefault('S', c.relowner);`), [S_RULE]);
  assert.deepEqual(aclDefaultProblems(`${REL_DEFAULT}\nSELECT CASE WHEN x THEN 'S'::"char" END;`), [S_RULE]);
  assert.deepEqual(aclDefaultProblems(`${REL_DEFAULT}\nSELECT CASE WHEN 'S'::"char" ELSE y END;`), [S_RULE]);
  assert.deepEqual(aclDefaultProblems("SELECT acldefault('r', c.relowner);"), ["rel_items does not read a NULL relacl as acldefault of its own object type"]);
  assert.deepEqual(aclDefaultProblems(`SELECT ${REL_DEFAULT};`), []);
});

test("the verdict counts the blocks require are the counts the files print", () => {
  assert.equal(okVerdicts(pre), 13);
  assert.equal(okVerdicts(post), 12);
  assert.match(blockWith(doc, EARLIER), /\[ "\$\{OKS\}" = 13 \]/);
  assert.match(blockWith(doc, STAGE1), /\[ "\$\{OKS\}" = 13 \]/);
  assert.match(blockWith(doc, STAGE2), /\[ "\$\{OKS\}" = 12 \]/);
  // R9 proof 3 recounts the earlier transcript against the same 13, in both stages.
  for (const b of [blockWith(doc, STAGE0), blockWith(doc, STAGE1)]) {
    assert.ok(b.includes(`[ "$(grep -cE '\\|[[:space:]]*OK[[:space:]]*$' /tmp/0100-precheck-earlier.out)" = 13 ]`));
  }
});

test("blockWith finds exactly one block, and throws on none or two", () => {
  const fence = (body) => "```\n" + body + "\n```\n";
  assert.equal(blockWith(fence("a MARK") + fence("b"), "MARK"), "a MARK\n");
  assert.throws(() => blockWith(fence("a MARK") + fence("b MARK"), "MARK"), /found 2/);
  assert.throws(() => blockWith(fence("a") + fence("b"), "MARK"), /found 0/);
});

test("every pin is the real file, the given value or an R9 placeholder, and the sidecar pins the document", () => {
  assert.deepEqual(pinProblems(doc, ACTUAL), []);
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  // CONTROLS
  assert.notDeepEqual(pinProblems(doc.replace(`SHAPRE=${ACTUAL[PRE]}`, `SHAPRE=${"0".repeat(64)}`), ACTUAL), []);
  assert.notDeepEqual(pinProblems(doc, { ...ACTUAL, [POST]: "f".repeat(64) }), []);
  assert.notDeepEqual(pinProblems(doc.replace(`SHAGUARD=${EXTERNAL_PINS.SHAGUARD}`, `SHAGUARD=${"b".repeat(64)}`), ACTUAL), []);
  assert.notDeepEqual(pinProblems(doc.replace(`SHAGATE=${R9_PLACEHOLDERS.SHAGATE}`, "SHAGATE=TODO"), ACTUAL), []);
  assert.notDeepEqual(pinProblems(doc.replace(`SHAGATE=${R9_PLACEHOLDERS.SHAGATE}`, `SHAGATE=${"c".repeat(64)}`), ACTUAL), []);
});

test("R9: the placeholders can never match a sha256, and a filled SHAGATE is the gate file's real sha256", () => {
  for (const p of Object.values(R9_PLACEHOLDERS)) assert.doesNotMatch(p, /^[0-9a-f]{64}$/);
  const gate = pinLines(doc).find(([n]) => n === "SHAGATE")[1];
  if (/^[0-9a-f]{64}$/.test(gate) && existsSync(join(ROOT, GATE_FILE))) assert.equal(gate, sha256(read(GATE_FILE)));
});

test("R9: the daytime arm stands in stage 0 and stage 1, with the same proof lines in both", () => {
  const s0 = blockWith(doc, STAGE0);
  const s1 = blockWith(doc, STAGE1);
  const proofs = (b) => b.split("\n").filter((l) => /^D[123]=no$|^if .*then D[123]=yes; fi$/.test(l));
  assert.equal(proofs(s0).length, 6);
  assert.deepEqual(proofs(s1), proofs(s0));
  for (const b of [s0, s1]) {
    assert.match(b, /LT=\$\(TZ=Europe\/Lisbon date \+%H%M\)/);
    assert.match(b, /\(t \+ 0\) < 800 \|\| \(t \+ 0\) >= 2100/);
    assert.match(b, /\[ "\$\{D1\}\$\{D2\}\$\{D3\}" = yesyesyes \]/);
  }
  // Closed hours: stage 0 decides by the clock, which is all it can read; stage 1 by the clock AND
  // every active clinic's own row, so a weakening to the clock half alone goes red.
  const decision = (b) => b.split("\n").filter((l) => l.startsWith('if [ "${CLOCK}'));
  assert.equal(decision(s0).length, 1);
  assert.equal(decision(s1).length, 1);
  assert.ok(decision(s0)[0].startsWith('if [ "${CLOCK}" = closed ]; then echo "R9: closed hours by the clock.'));
  assert.ok(decision(s1)[0].startsWith('if [ "${CLOCK}${CLINICS}" = closedclosed ]; then echo "R9: closed hours, by the clock and by every active clinic'));
  // Stage 1 also reads the clinics' own rows, and the arm sits after the pre-check and before the apply.
  assert.match(s1, /from public\.locations/);
  assert.deepEqual(armPositionProblems(s1), []);
  // CONTROLS, one rule at a time: the arm moved before the pre-check, or after the apply.
  const PRE_RUN = "precheck-0100-maintain-revoke.sql 2>&1";
  const ARM = "THE CLOCK AND THE CLINICS (R9)";
  const APPLY = "node packages/db/scripts/verified-migrate.mjs";
  assert.deepEqual(armPositionProblems([PRE_RUN, ARM, APPLY].join("\n")), []);
  assert.deepEqual(armPositionProblems([ARM, PRE_RUN, APPLY].join("\n")), ["the R9 arm does not follow the pre-check"]);
  assert.deepEqual(armPositionProblems([PRE_RUN, APPLY, ARM].join("\n")), ["the R9 arm does not precede the apply"]);
  // No date is written into an arm: no 2026 date in either block's code lines.
  for (const b of [s0, s1]) assert.doesNotMatch(b, /\b2026[01]\d[0-3]\d\b/);
});

test("THE EARLIER PRE-CHECK SITTING runs from PR #1520's named head, never main, and records what R9's proof 3 requires", () => {
  const e = blockWith(doc, EARLIER);
  // The head comes from the dispatch's record, is checked against GitHub's PR ref, and is checked out.
  const at = (s) => e.indexOf(s);
  for (const s of [
    "PRHEAD=$(cat /tmp/0100-earlier-head.sha)",
    "PRNOW=$(git ls-remote origin refs/pull/1520/head | cut -f1)",
    '[ "${PRNOW}" = "${PRHEAD}" ] ||',
    "git checkout -q --detach ${PRHEAD}",
  ]) assert.ok(at(s) > 0, `the earlier block does not carry: ${s}`);
  assert.ok(at('[ "${PRNOW}" = "${PRHEAD}" ] ||') < at("git checkout -q --detach ${PRHEAD}"));
  assert.doesNotMatch(e, /origin\/main|merge-base/);
  // What the transcript holds is what proof 3 reads: the guard's verdict line and the summary.
  assert.ok(at("node scripts/assert-production-target.mjs 2>&1 | tee -a /tmp/0100-precheck-earlier.new") > 0);
  const summary = e.match(/^echo "(earlier pre-check summary: [^"]+)" \| tee -a \/tmp\/0100-precheck-earlier\.new$/m)?.[1];
  assert.equal(summary, "earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL");
  for (const b of [blockWith(doc, STAGE0), blockWith(doc, STAGE1)]) {
    const d3 = b.split("\n").find((l) => l.endsWith("then D3=yes; fi"));
    assert.ok(d3.includes("grep -qxF 'target verified: production, session pooler.' /tmp/0100-precheck-earlier.out"));
    assert.ok(d3.includes(`grep -qxF '${summary}' /tmp/0100-precheck-earlier.out`));
    assert.ok(d3.includes(`[ "$(grep -cE '\\|[[:space:]]*FAIL[[:space:]]*$' /tmp/0100-precheck-earlier.out)" = 0 ]`));
  }
});

test("R9 proof 2, run as the document writes it, passes the reviewed text, whitespace aside, and refuses anything else", () => {
  const program = catalogOnlyProgram(blockWith(doc, STAGE0));
  assert.equal(program, catalogOnlyProgram(blockWith(doc, STAGE1)));
  // It fits the block's single quotes and its no-! rule: no apostrophe and no ! anywhere in it.
  assert.doesNotMatch(program, /['!]/);
  const dir = mkdtempSync(join(tmpdir(), "r9-catalog-only-"));
  try {
    const runOn = (text) => {
      const f = join(dir, "m.sql");
      writeFileSync(f, text);
      return spawnSync(process.execPath, ["-e", program, f], { encoding: "utf8" });
    };
    const normalized = migration.replace(/[ \t\n]+/g, " ").trim();
    const PASS = /^catalog-only: equal to the reviewed text, whitespace aside: CATALOG-ONLY$/m;
    const DIFF_AT = (k) => new RegExp(`^catalog-only: differs from the reviewed text at normalized offset ${k} \\(\\d+ characters against ${normalized.length}\\): NOT PROVEN$`, "m");
    const DIFF = new RegExp(`^catalog-only: differs from the reviewed text at normalized offset \\d+ \\(\\d+ characters against ${normalized.length}\\): NOT PROVEN$`, "m");
    const BYTE = (hex, at) => new RegExp(`^catalog-only: a byte outside printable ASCII, TAB and LF, 0x${hex} at offset ${at}: NOT PROVEN$`, "m");
    /** `text` with `from` replaced by `to`; `from` must occur exactly once. */
    const one = (text, from, to) => {
      assert.equal(text.split(from).length, 2, `not exactly once: ${from}`);
      return text.replace(from, () => to);
    };
    const at = (text, k, insert) => text.slice(0, k) + insert + text.slice(k);

    // PASSING CONTROLS: the real file; extra spaces, TABs and blank lines where whitespace already
    // runs between tokens; and a run widened inside the EXECUTEd string, still whitespace to its SQL.
    let spaced = one(migration, "SET LOCAL lock_timeout = '5s';--> statement-breakpoint\nSET LOCAL statement_timeout",
      "SET \t LOCAL\tlock_timeout   =\t'5s';--> statement-breakpoint\n\n\n\t SET  LOCAL\n statement_timeout");
    spaced = one(spaced, "  END LOOP;\nEND\n$$;", "\t\t END \t LOOP;\n\n END\n\n$$;");
    spaced = one(spaced, "ALTER DEFAULT PRIVILEGES IN SCHEMA public\n  REVOKE", "ALTER\tDEFAULT  PRIVILEGES IN SCHEMA public\n\n\t\tREVOKE");
    for (const [name, text] of [
      ["the real file", migration],
      ["extra spaces, TABs and blank lines between tokens", spaced],
      ["a widened run inside the EXECUTEd string", one(migration, "'REVOKE MAINTAIN ON TABLE %s FROM authenticated'", "'REVOKE MAINTAIN\t \tON TABLE %s FROM authenticated'")],
    ]) {
      if (name !== "the real file") assert.notEqual(text, migration, `${name}: the control did not change the file`);
      const r = runOn(text);
      assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, PASS, name);
    }

    // EVERY EARLIER PLANT, each refused. The first version's; R4 round 1's five and round 2's four
    // with EXECUTE 'SELECT 1'; the $$-in-a-comment plant and a second DO loop; comments the
    // earlier versions let through, which an exact compare does not; and R4 round 3's, which the
    // third version's scanner read differently from PostgreSQL.
    const plants = [
      migration + "\nDELETE FROM public.patients;--> statement-breakpoint\n",
      migration + "\nCREATE TABLE public.x (id int);--> statement-breakpoint\n",
      migration + "\nALTER TABLE public.patients ADD COLUMN x int;--> statement-breakpoint\n",
      migration + "\nUPDATE public.patients SET id = id;--> statement-breakpoint\n",
      migration + "\nGRANT SELECT ON public.patients TO anon;--> statement-breakpoint\n",
      swap("'REVOKE MAINTAIN ON TABLE %s FROM authenticated'", "'TRUNCATE %s'"),
      swap("SET LOCAL lock_timeout = '5s';", ""),
      inLoop("    LOCK TABLE public.appointments IN ACCESS EXCLUSIVE MODE;"),
      inLoop("    GRANT ALL ON public.appointments TO anon;"),
      inLoop("    ALTER POLICY p ON public.appointments USING (true);"),
      inLoop("    REVOKE SELECT ON public.appointments FROM authenticated;"),
      inLoop("    PERFORM pg_sleep(3600);"),
      inLoop("    execute 'DEL' || 'ETE FROM public.appointments';"),
      inLoop("    execute 'SELECT pg_sleep(3600)';"),
      inLoop("    RAISE NOTICE '/*'; DELETE FROM public.appointments; RAISE NOTICE '*/';"),
      inLoop("    RAISE NOTICE '--'; DELETE FROM public.appointments;"),
      inLoop("    EXECUTE 'SELECT 1';"),
      swap("END\n$$;", "END -- $$; SELECT pg_sleep(3600); DO $$ BEGIN\nEND\n$$;"),
      migration + "DO $$ BEGIN END $$;--> statement-breakpoint\n",
      migration + "/* DELETE, TRUNCATE and CREATE TABLE are not here */\n",
      inLoop("    -- it's not code: LOCK GRANT ALTER"),
      inLoop("    IF false THEN RAISE NOTICE '%', 1$q$ -- $q$; END IF; DELETE FROM public.appointments; --"),
      inLoop("    REASSIGN OWNED BY authenticated TO anon;"),
      inLoop("    SECURITY LABEL ON TABLE public.appointments IS 'x';"),
      inLoop("    LOAD 'auto_explain';"),
      inLoop("    NOTIFY ch, 'x';"),
      inLoop("    IMPORT FOREIGN SCHEMA s FROM SERVER srv INTO public;"),
      inLoop("    RAISE NOTICE '%', pg_catalog.pg_sleep(3600);"),
      inLoop("    IF pg_catalog.pg_terminate_backend(1) THEN NULL; END IF;"),
    ];
    for (const plant of plants) {
      assert.notEqual(plant, migration);
      const r = runOn(plant);
      assert.equal(r.status, 1, `not refused: ${plant.slice(-120)}\n${r.stdout}`);
      assert.match(r.stdout, DIFF, plant.slice(-120));
    }
    // R4 round 3's carriage-return plants: PostgreSQL ends a -- comment at a CR. Refused by the byte rule.
    for (const [text, from] of [
      [inLoop("    -- note\rDELETE FROM public.appointments;"), "    -- note\r"],
      [migration + "-- note\rDELETE FROM public.appointments;\n", "-- note\r"],
      [inLoop("    -- note\rx := pg_catalog.pg_sleep(3600);"), "    -- note\r"],
    ]) {
      const r = runOn(text);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, BYTE("0d", text.indexOf(from) + from.length - 1));
    }

    // ONE PLANT PER BYTE-CLASS REFUSAL, each at a known offset (the bytes before it are ASCII).
    const kCode = migration.indexOf("SET LOCAL lock_timeout");
    const kComment = migration.indexOf("Take MAINTAIN");
    for (const [name, text, hex, k] of [
      ["a CR", at(migration, kCode, "\r"), "0d", kCode],
      ["a NUL", at(migration, kCode, "\0"), "00", kCode],
      ["a non-ASCII byte, in a comment", at(migration, kComment, "é"), "c3", kComment],
    ]) {
      const r = runOn(text);
      assert.equal(r.status, 1, `${name}: ${r.stdout}`);
      assert.match(r.stdout, BYTE(hex, k), name);
    }

    // ONE CHARACTER, AND WHITESPACE INSIDE A LITERAL: each is a difference, at the offset expected.
    const k5 = normalized.indexOf("'5s'");
    const kSet = normalized.indexOf("SET LOCAL lock_timeout");
    for (const [name, text, k] of [
      ["one character changed: '5s' to '4s'", swap("'5s'", "'4s'"), k5 + 1],
      ["a space added inside a literal, where there was none: '5 s'", swap("'5s'", "'5 s'"), k5 + 2],
      ["a run of whitespace removed between two tokens", swap("SET LOCAL lock_timeout", "SETLOCAL lock_timeout"), kSet + 3],
    ]) {
      const r = runOn(text);
      assert.equal(r.status, 1, `${name}: ${r.stdout}`);
      assert.match(r.stdout, DIFF_AT(k), name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every block that runs the guard or the reader compares it, and its module, first", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(compareFirstProblems(b), []);
  assert.ok(blocksOf(doc).filter((b) => b.includes("node scripts/assert-production-target.mjs")).length >= 3);
  assert.ok(blockWith(doc, CLOSING).includes("${READER} 2>&1"));
  // CONTROLS: the comparison removed, or moved after the run, goes red.
  const s1 = blockWith(doc, STAGE1);
  const cmp = s1.split("\n").find((l) => l.includes('= "${SHAPTM}" ]'));
  assert.notDeepEqual(compareFirstProblems(s1.replace(cmp + "\n", "")), []);
  assert.notDeepEqual(compareFirstProblems(s1.replace(cmp + "\n", "") + "\n" + cmp + "\n"), []);
  const closing = blockWith(doc, CLOSING);
  assert.notDeepEqual(compareFirstProblems(closing.replace('[ "${MW}" = "${SHAPTM}" ]', '[ "${MW}" = "${MW}" ]')), []);
});

test("every carry stage 2 reads is a row the pre-check prints, and no carry name hides in another row", () => {
  const carries = [...blockWith(doc, STAGE2).matchAll(/\$\(carry ([a-z0-9_]+)\)/g)].map((m) => m[1]);
  assert.equal(carries.length, 10);
  const rowNames = [...codeOf(pre).matchAll(/SELECT '([^']+)'(?: AS check)?,/g)].map((m) => m[1]);
  assert.deepEqual(carryProblems(carries, rowNames), []);
  // CONTROLS, one rule at a time: a carry no row prints, and a carry hidden inside another row's name.
  assert.deepEqual(carryProblems(["tables_before"], ["tables_count_before"]), ["the pre-check prints no row named tables_before"]);
  assert.deepEqual(carryProblems(["policies_md5"], ["policies_md5", "INFO policies_md5 again"]), [
    "carry policies_md5 is a substring of policies_md5, INFO policies_md5 again",
  ]);
});

test("the five blocks are there, in order, and carry no # line, no ! but test !, and no backslash continuation", () => {
  const blocks = blocksOf(doc);
  assert.equal(blocks.length, 5);
  const order = [EARLIER, STAGE0, STAGE1, STAGE2, CLOSING].map((m) => blocks.findIndex((b) => b.includes(m)));
  assert.deepEqual(order, [0, 1, 2, 3, 4]);
  for (const b of blocks) assert.deepEqual(blockHazards(b), []);
  // CONTROLS
  assert.notDeepEqual(blockHazards("echo a\n# a comment\n"), []);
  assert.notDeepEqual(blockHazards("node -e \"process.exit(a !== b ? 1 : 0)\"\n"), []);
  assert.notDeepEqual(blockHazards("psql x \\\n  -f y\n"), []);
  assert.deepEqual(blockHazards("test ! -f x || exit 1\n"), []);
});

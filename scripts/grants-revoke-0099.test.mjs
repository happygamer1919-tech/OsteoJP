// 0099 (the TRUNCATE, TRIGGER, REFERENCES revoke from `authenticated`, HELD):
// the migration, its three check files and its apply document agree with each
// other, byte for byte where it matters.
//
// WHAT THIS PROVES, statically, with no database:
//   * the migration stands in EXACTLY ONE place, parked in migrations-pending or
//     promoted to 0099, and its bytes are the pinned sha256 either way (the
//     promotion is a rename, so this test needs no edit when it happens);
//   * the migration is the two statements the document describes and nothing
//     else: a DO loop of REVOKE TRUNCATE, TRIGGER, REFERENCES ... FROM
//     authenticated, and one ALTER DEFAULT PRIVILEGES revoking the same three.
//     It creates or alters no function (so the SECURITY DEFINER count cannot
//     move and no GATE-CHANGE is owed), no policy, no table, and it carries no
//     DELETE and no TRUNCATE STATEMENT. The word TRUNCATE in it is a privilege
//     name in a REVOKE list, and the rule reads it that way;
//   * the pre-check and the post-check compare the journal against the pinned
//     sha256 in CODE, not in a comment;
//   * the check files write nothing: no statement in their code begins with a
//     writing verb, and the only INSERT, UPDATE and DELETE text is inside the
//     behaviour check's EXPLAIN templates, which plan and never execute. Each
//     opens READ ONLY: the pre-check and the behaviour check themselves, the
//     post-check through the stage 2 block's `begin read only`;
//   * the verdict counts the blocks require are the counts the files print:
//     15 in the pre-check, 15 in the post-check, 7 arms in the behaviour check;
//   * every sha256 the document pins for a check file or the migration is that
//     file's real sha256, in every block and in the fact table, and the sidecar
//     pins the document;
//   * every carry the stage 2 block reads is a row the pre-check prints, and no
//     carry's name is a substring of another row's check text (carry() matches
//     column 1 with index());
//   * the blocks carry no `#` line, no `!` but `test !`, and no backslash
//     continuation.
//
// Each rule is a function of the texts it reads. The tests run it on the
// committed files; the CONTROLS run the SAME function on a planted copy and
// require it to go red.
//
// WHAT IT DOES NOT PROVE: that any of it runs. That is the rehearsal's job
// (docs/migration-apply-0099.md, "Rehearsal"), and CI's db-tests once the file
// is promoted.
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
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const MIGRATION_SHA = "fbc5e5458bb6ec3be6a5f2aeb558638b53ce2c49d5d58eca3a576cd231b0163b";
const PENDING_PATH = "packages/db/migrations-pending/NEXT-AFTER-0098_revoke_truncate_trigger_references.sql";
const PROMOTED_PATH = "packages/db/migrations/0099_revoke_truncate_trigger_references.sql";
const PRE = "scripts/db/precheck-0099-grants-revoke.sql";
const POST = "scripts/db/postcheck-0099-grants-revoke.sql";
const BEHAVIOUR = "scripts/db/behaviour-0099-grants-readonly.sql";
const DOC = "docs/migration-apply-0099.md";
const SIDECAR = "docs/migration-apply-0099.sha256";

/** Where the migration stands: exactly one of the two places. */
export function locateMigration(exists) {
  const found = [PENDING_PATH, PROMOTED_PATH].filter((p) => exists(p));
  if (found.length !== 1) {
    throw new Error(`the 0099 migration must stand in exactly one of ${PENDING_PATH} and ${PROMOTED_PATH}; found ${found.length}`);
  }
  return found[0];
}

/** SQL code: block and line comments removed (a `-->` breakpoint stays). */
export const codeOf = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n>][^\n]*/g, "");

/** The migration's statements, split on drizzle's breakpoint. */
export function migrationProblems(sql) {
  const problems = [];
  const code = codeOf(sql);
  const stmts = code.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  if (stmts.length !== 2) problems.push(`expected 2 statements, found ${stmts.length}`);
  const [loop, def] = stmts;
  if (!/^DO \$\$/.test(loop ?? "")) problems.push("statement 1 is not the DO loop");
  if (!/relkind IN \('r', 'p'\)/.test(loop ?? "")) problems.push("the loop does not select ordinary and partitioned tables");
  if (!/n\.nspname = 'public'/.test(loop ?? "")) problems.push("the loop does not select schema public");
  if (!/'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM authenticated'/.test(loop ?? "")) {
    problems.push("the loop does not revoke exactly TRUNCATE, TRIGGER, REFERENCES from authenticated");
  }
  if (!/^ALTER DEFAULT PRIVILEGES IN SCHEMA public\s+REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;$/.test(def ?? "")) {
    problems.push("statement 2 is not the ALTER DEFAULT PRIVILEGES revoke of the same three");
  }
  if (/FOR ROLE/i.test(code)) problems.push("the default privilege names a FOR ROLE; the document assumes the running role");
  if (/\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE|POLICY|TABLE|VIEW|TRIGGER)\b/i.test(code)) {
    problems.push("the migration creates, alters or drops a function, policy, table, view or trigger");
  }
  if (/SECURITY\s+DEFINER/i.test(code)) problems.push("the migration names SECURITY DEFINER");
  if (/\bGRANT\b/i.test(code)) problems.push("the migration grants something");
  // A DELETE or TRUNCATE STATEMENT: at the start of a statement, or at the start of an EXECUTEd string.
  for (const s of code.split(/;/)) {
    if (/^\s*(DELETE|TRUNCATE)\b/i.test(s)) problems.push(`a ${s.trim().split(/\s/)[0].toUpperCase()} statement`);
  }
  if (/'\s*(DELETE|TRUNCATE)\b/i.test(code)) problems.push("an EXECUTEd DELETE or TRUNCATE string");
  if (/\bDELETE\b/i.test(code)) problems.push("the word DELETE appears in the migration's code");
  // TRUNCATE may appear only as a privilege name right after REVOKE.
  const truncates = code.match(/\bTRUNCATE\b/gi) ?? [];
  const asPrivilege = code.match(/REVOKE TRUNCATE,/g) ?? [];
  if (truncates.length !== asPrivilege.length) problems.push("TRUNCATE appears in code other than as a REVOKE privilege name");
  return problems;
}

/** A check file writes nothing: no code line begins with a writing verb, EXPLAIN templates excepted. */
export function writeProblems(sql) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|CLUSTER|REINDEX|LOCK|COMMIT)\b/i.test(t)) {
      problems.push(`a writing statement: ${t.slice(0, 80)}`);
    }
    for (const m of t.matchAll(/'([^']*)'/g)) {
      if (/^\s*(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|TRUNCATE\s|MERGE\s+INTO|COPY\s)/i.test(m[1])) {
        problems.push(`a writing statement in a string that is not an EXPLAIN template: '${m[1].slice(0, 60)}'`);
      }
    }
  }
  return problems;
}

/** Verdicts a check file can print OK for. */
const okVerdicts = (sql) => (codeOf(sql).match(/THEN 'OK' ELSE 'FAIL' END(?: AS verdict)? FROM j/g) ?? []).length;

/** The fenced blocks of a markdown text. */
export const blocksOf = (md) => [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

export function blockHazards(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (/^\s*#/.test(line)) out.push(`a # line: ${line.trim()}`);
    if (line.replace(/test !/g, "").includes("!")) out.push(`a !: ${line.trim().slice(0, 80)}`);
    if (/\\\s*$/.test(line)) out.push(`a backslash continuation: ${line.trim().slice(0, 80)}`);
  }
  return out;
}

/** Every `NAME=<64 hex>` in the document's blocks, and every sha256 its fact table gives a file. */
export function pinProblems(md, actual) {
  const problems = [];
  const names = { SHA0099: "migration", SHAPRE: PRE, SHAPOST: POST, SHABEHAVIOUR: BEHAVIOUR };
  for (const block of blocksOf(md)) {
    for (const m of block.matchAll(/^(SHA0099|SHAPRE|SHAPOST|SHABEHAVIOUR)=([0-9a-f]{64})$/gm)) {
      if (m[2] !== actual[names[m[1]]]) problems.push(`${m[1]} pins ${m[2]}, the file is ${actual[names[m[1]]]}`);
    }
  }
  for (const [file, sha] of Object.entries(actual)) {
    if (file === "migration") continue;
    const row = md.split("\n").find((l) => l.startsWith("| ") && l.includes(`\`${file}\``) && /sha256 `[0-9a-f]{64}`/.test(l));
    if (!row) problems.push(`the fact table gives no sha256 for ${file}`);
    else if (!row.includes(`sha256 \`${sha}\``)) problems.push(`the fact table's sha256 for ${file} is not ${sha}`);
  }
  const counts = {};
  for (const block of blocksOf(md)) for (const m of block.matchAll(/^(SHA0099|SHAPRE|SHAPOST|SHABEHAVIOUR)=/gm)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  if (!counts.SHA0099 || !counts.SHAPRE || !counts.SHAPOST || !counts.SHABEHAVIOUR) problems.push(`a pin is missing from every block: ${JSON.stringify(counts)}`);
  return problems;
}

const MIGRATION_PATH = locateMigration((p) => existsSync(join(ROOT, p)));
const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);
const behaviour = read(BEHAVIOUR);
const doc = read(DOC);
const ACTUAL = { migration: sha256(migration), [PRE]: sha256(pre), [POST]: sha256(post), [BEHAVIOUR]: sha256(behaviour) };

test("the migration stands in exactly one place, and its bytes are the pinned sha256", () => {
  assert.equal(sha256(migration), MIGRATION_SHA);
  assert.throws(() => locateMigration(() => true), /exactly one/);
  assert.throws(() => locateMigration(() => false), /exactly one/);
});

test("the migration is the two statements, and carries no DELETE, no TRUNCATE statement and no function", () => {
  assert.deepEqual(migrationProblems(migration), []);
});

test("CONTROLS: a planted DELETE, TRUNCATE, function or third statement goes red", () => {
  const planted = [
    migration + "\nTRUNCATE public.patients;--> statement-breakpoint\n",
    migration + "\nDELETE FROM public.patients;--> statement-breakpoint\n",
    migration.replace("'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM authenticated'", "'TRUNCATE %s'"),
    migration + "\nCREATE FUNCTION public.x() RETURNS int LANGUAGE sql SECURITY DEFINER AS $f$ SELECT 1 $f$;--> statement-breakpoint\n",
    migration.replace("REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;", "REVOKE TRIGGER, REFERENCES ON TABLES FROM authenticated;"),
    migration.replace("ALTER DEFAULT PRIVILEGES IN SCHEMA public\n  REVOKE", "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public\n  REVOKE"),
  ];
  for (const p of planted) assert.notDeepEqual(migrationProblems(p), [], p.slice(-120));
  // A TRUNCATE in a comment is not code, and does not go red.
  assert.deepEqual(migrationProblems(migration + "\n/* TRUNCATE is a privilege here */\n"), []);
});

test("the pre-check and the post-check compare the journal with the pinned sha256 in code", () => {
  assert.match(codeOf(pre), new RegExp(`hash = '${MIGRATION_SHA}'`));
  assert.match(codeOf(post), new RegExp(`hash = '${MIGRATION_SHA}'`));
  assert.match(codeOf(post), new RegExp(`newest_hash = '${MIGRATION_SHA}'`));
  // CONTROL: the pin parked in a comment does not count.
  const commented = pre.replaceAll(`hash = '${MIGRATION_SHA}'`, "hash = 'x' /* fbc5e545 */");
  assert.doesNotMatch(codeOf(commented), new RegExp(`hash = '${MIGRATION_SHA}'`));
});

test("the check files write nothing, and each opens READ ONLY", () => {
  assert.deepEqual(writeProblems(pre), []);
  assert.deepEqual(writeProblems(post), []);
  assert.deepEqual(writeProblems(behaviour), []);
  const preCode = codeOf(pre);
  assert.ok(preCode.indexOf("BEGIN READ ONLY;") > 0 && preCode.indexOf("BEGIN READ ONLY;") < preCode.indexOf("WITH t AS"));
  const behCode = codeOf(behaviour);
  const begin = behCode.indexOf("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;");
  assert.ok(begin > 0 && begin < behCode.indexOf("DO $behaviour$"));
  assert.ok(behCode.trimEnd().endsWith("ROLLBACK;"));
  const stage2 = blocksOf(doc)[2];
  assert.match(stage2, /-c "begin read only" -f scripts\/db\/postcheck-0099-grants-revoke\.sql -c "rollback"/);
  // CONTROLS
  assert.notDeepEqual(writeProblems(pre + "\nDELETE FROM public.patients;\n"), []);
  assert.notDeepEqual(writeProblems(behaviour.replace("'EXPLAIN (COSTS OFF) DELETE FROM %s WHERE false'", "'DELETE FROM %s'")), []);
  assert.notDeepEqual(writeProblems(post + "\nREVOKE SELECT ON public.patients FROM authenticated;\n"), []);
});

test("the verdict counts the blocks require are the counts the files print", () => {
  assert.equal(okVerdicts(pre), 15);
  assert.equal(okVerdicts(post), 15);
  const armNumbers = new Set([...codeOf(behaviour).matchAll(/SELECT (\d+)(?: AS arm)?, '/g)].map((m) => Number(m[1])));
  assert.deepEqual([...armNumbers].sort((x, y) => x > y ? 1 : -1), [0, 1, 2, 3, 4, 5, 6, 99]);
  const [, stage1, stage2, stage3] = blocksOf(doc);
  assert.match(stage1, /\[ "\$\{OKS\}" = 15 \]/);
  assert.match(stage2, /\[ "\$\{OKS\}" = 15 \]/);
  assert.match(stage1, /\[ "\$\{NV\}" = 7 \]/);
  assert.match(stage3, /\[ "\$\{NV\}" = 7 \]/);
});

test("every pin the document gives a check file or the migration is its real sha256, and the sidecar pins the document", () => {
  assert.deepEqual(pinProblems(doc, ACTUAL), []);
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  // CONTROLS
  assert.notDeepEqual(pinProblems(doc.replace(`SHAPRE=${ACTUAL[PRE]}`, `SHAPRE=${"0".repeat(64)}`), ACTUAL), []);
  assert.notDeepEqual(pinProblems(doc, { ...ACTUAL, [POST]: "f".repeat(64) }), []);
});

test("every carry stage 2 reads is a row the pre-check prints, and no carry name hides in another row", () => {
  const stage2 = blocksOf(doc)[2];
  const carries = [...stage2.matchAll(/\$\(carry ([a-z0-9_]+)\)/g)].map((m) => m[1]);
  assert.equal(carries.length, 12);
  const rowNames = [...codeOf(pre).matchAll(/SELECT '([^']+)'(?: AS check)?,/g)].map((m) => m[1]);
  for (const c of carries) {
    assert.ok(rowNames.includes(c), `the pre-check prints no row named ${c}`);
    const hits = rowNames.filter((r) => r.includes(c));
    assert.deepEqual(hits, [c], `carry ${c} is a substring of ${hits.join(", ")}`);
  }
});

test("the blocks carry no # line, no ! but test !, and no backslash continuation", () => {
  const blocks = blocksOf(doc);
  assert.equal(blocks.length, 5);
  for (const b of blocks) assert.deepEqual(blockHazards(b), []);
  // CONTROLS
  assert.notDeepEqual(blockHazards("echo a\n# a comment\n"), []);
  assert.notDeepEqual(blockHazards("node -e \"process.exit(a !== b ? 1 : 0)\"\n"), []);
  assert.notDeepEqual(blockHazards("psql x \\\n  -f y\n"), []);
  assert.deepEqual(blockHazards("test ! -f x || exit 1\n"), []);
});

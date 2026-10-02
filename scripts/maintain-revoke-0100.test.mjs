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
//     sha256 in CODE, not in a comment;
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
//   * R9's daytime arm stands in stage 0 and stage 1, the same lines in both; its
//     two R9 pins are either a sha256 or the documented placeholder, which can never
//     match one; a filled SHAGATE is the gate file's real sha256 when the file is on
//     this branch; and its catalog-only check, RUN here as written in the document,
//     passes the real migration and refuses planted copies;
//   * every carry the stage 2 block reads is a row the pre-check prints, and no
//     carry's name is a substring of another row's check text;
//   * the blocks carry no `#` line, no `!` but `test !`, and no backslash
//     continuation.
//
// Each rule is a function of the texts it reads. The tests run it on the committed
// files; the CONTROLS run the SAME function on a planted copy and require it to go
// red.
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
  if ((loop ?? "").match(/\bEXECUTE\b/g)?.length !== 1) problems.push("the loop does not EXECUTE exactly one string");
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

test("the pre-check and the post-check compare the journal with the pinned sha256 in code", () => {
  assert.match(codeOf(pre), new RegExp(`hash = '${MIGRATION_SHA}'`));
  assert.match(codeOf(post), new RegExp(`hash = '${MIGRATION_SHA}'`));
  assert.match(codeOf(post), new RegExp(`newest_hash = '${MIGRATION_SHA}'`));
  // CONTROL: the pin parked in a comment does not count.
  const commented = pre.replaceAll(`hash = '${MIGRATION_SHA}'`, "hash = 'x' /* 80f85018 */");
  assert.doesNotMatch(codeOf(commented), new RegExp(`hash = '${MIGRATION_SHA}'`));
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

test("the pre-check and the post-check read a NULL relacl as acldefault of its own object type ('s' for a sequence)", () => {
  assert.deepEqual(aclDefaultProblems(pre), []);
  assert.deepEqual(aclDefaultProblems(post), []);
  const foreignServer = (s) => s.replace(`THEN 's'::"char"`, `THEN 'S'::"char"`);
  assert.notDeepEqual(aclDefaultProblems(foreignServer(pre)), []);
  assert.notDeepEqual(aclDefaultProblems(foreignServer(post)), []);
  assert.notDeepEqual(aclDefaultProblems(pre.replace(REL_DEFAULT, "acldefault('r', c.relowner)")), []);
});

test("the verdict counts the blocks require are the counts the files print", () => {
  assert.equal(okVerdicts(pre), 13);
  assert.equal(okVerdicts(post), 12);
  assert.match(blockWith(doc, EARLIER), /\[ "\$\{OKS\}" = 13 \]/);
  assert.match(blockWith(doc, STAGE1), /\[ "\$\{OKS\}" = 13 \]/);
  assert.match(blockWith(doc, STAGE2), /\[ "\$\{OKS\}" = 12 \]/);
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
  // Stage 1 also reads the clinics' own rows, and the arm sits after the pre-check and before the apply.
  assert.match(s1, /from public\.locations/);
  const arm = s1.indexOf("THE CLOCK AND THE CLINICS (R9)");
  assert.ok(arm > s1.indexOf("precheck-0100-maintain-revoke.sql 2>&1") && arm < s1.indexOf("node packages/db/scripts/verified-migrate.mjs"));
  // No date is written into an arm: no 2026 date in either block's code lines.
  for (const b of [s0, s1]) assert.doesNotMatch(b, /\b2026[01]\d[0-3]\d\b/);
});

test("R9 proof 2, run as the document writes it, passes the migration and refuses planted copies", () => {
  const program = catalogOnlyProgram(blockWith(doc, STAGE0));
  assert.equal(program, catalogOnlyProgram(blockWith(doc, STAGE1)));
  const dir = mkdtempSync(join(tmpdir(), "r9-catalog-only-"));
  try {
    const runOn = (text) => {
      const f = join(dir, "m.sql");
      writeFileSync(f, text);
      return spawnSync(process.execPath, ["-e", program, f], { encoding: "utf8" });
    };
    const real = runOn(migration);
    assert.equal(real.status, 0, real.stdout + real.stderr);
    assert.match(real.stdout, /CATALOG-ONLY$/m);
    for (const plant of [
      migration + "\nDELETE FROM public.patients;--> statement-breakpoint\n",
      migration + "\nCREATE TABLE public.x (id int);--> statement-breakpoint\n",
      migration + "\nALTER TABLE public.patients ADD COLUMN x int;--> statement-breakpoint\n",
      migration + "\nUPDATE public.patients SET id = id;--> statement-breakpoint\n",
      migration + "\nGRANT SELECT ON public.patients TO anon;--> statement-breakpoint\n",
      migration.replace("'REVOKE MAINTAIN ON TABLE %s FROM authenticated'", "'TRUNCATE %s'"),
      migration.replace("SET LOCAL lock_timeout = '5s';", ""),
    ]) {
      const r = runOn(plant);
      assert.equal(r.status, 1, `not refused: ${plant.slice(-100)}\n${r.stdout}`);
    }
    // A comment naming the words stays catalog-only.
    assert.equal(runOn(migration + "\n/* DELETE, TRUNCATE and CREATE TABLE */\n").status, 0);
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
  for (const c of carries) {
    assert.ok(rowNames.includes(c), `the pre-check prints no row named ${c}`);
    const hits = rowNames.filter((r) => r.includes(c));
    assert.deepEqual(hits, [c], `carry ${c} is a substring of ${hits.join(", ")}`);
  }
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

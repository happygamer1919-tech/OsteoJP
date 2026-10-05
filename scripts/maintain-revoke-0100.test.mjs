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
//     stage 1 decides closed hours by the clock AND the clinics; PRECHECK_EARLIER is
//     a sha256 or its documented placeholder, which can never match one; SHAGATE,
//     filled on 2026-10-02 after #1510 merged, must be a sha256, the gate file must be
//     on this branch, and SHAGATE must be its real sha256 (a missing file fails);
//     and its catalog-only check, RUN here as written in the document, is an exact
//     compare: it passes the real migration and the same text with whitespace runs
//     widened; it refuses the 35 plants this file carries from the first version
//     and R4 rounds 1 to 3 (32 that differ in text, and round 3's three CR plants),
//     a CR, a NUL, a non-ASCII byte, a one-character change,
//     a space added inside a literal and whitespace removed between two tokens; and
//     it PASSES R4 round 4's four whitespace-kind variants of the statement-breakpoint
//     markers, each of which hashes to something other than SHA0100, which is its
//     documented limit (SHA0100, not this check, proves the file is the reviewed file);
//   * THE EARLIER PRE-CHECK SITTING runs from PR #1520's head as its dispatch names
//     it, never from main, and writes into its transcript the guard's verdict and
//     the summary line R9's proof 3 then requires;
//   * every carry the stage 2 block reads is a row the pre-check prints, and no
//     carry's name is a substring of another row's check text;
//   * the blocks carry no `#` line, no `!` but `test !`, and no backslash
//     continuation;
//   * EVERY HALT IS EXPLICIT, AND A FAULT-INJECTION HARNESS PROVES IT (the R4 BLOCKER of
//     2026-10-02). GREEN's Bash tool runs a pasted block as `... && eval '<block>' < /dev/null
//     && pwd -P >| <file>`; the eval sits on the left of `&&`, so zsh ignores errexit inside it,
//     the block's `( ... )` subshell included, and `set -eo pipefail` stops nothing (pipefail
//     still sets a pipeline's status). So a static rule requires an explicit
//     `|| { echo "STOP: ..."; exit 1; }` on every command a later step relies on, and the
//     harness runs each block in that exact shape with every external command it calls (git,
//     psql, node, pnpm, shasum and the rest) replaced by a stub, makes each call fail in turn,
//     and requires the block to exit non-zero, print a STOP line and none of its pass lines,
//     and write none of its records after the failing point. Every clock read and every field
//     of the window record is also made to exit 0 with EMPTY output (in zsh `[ "" -le n ]` is
//     true), and the closed-hours runs of stages 0 and 1 hold a 13-hour-old applied marker, so
//     the marker-age line's find is faulted too. THE WINDOW FEED runs stage 1 whole on nine
//     run-window records and clocks (before the open, past the last start, at and past the
//     end, another sha, two malformed records, an empty clock, and a good record) and is run
//     again with the window-end lines removed, where it must go red. Its positive control is each
//     block with every stub succeeding, which must reach its last line. No stub touches a real
//     host, the secrets folder or a database: git, psql and the node programs never run for
//     real, and the block's cd, its /tmp/0100- paths and its env file are moved into a scratch
//     folder first;
//   * IN CI THE HARNESS RUNS UNDER bash, with errexit forced off as zsh has it inside the
//     tool's eval; under zsh, the exact shape, it runs wherever zsh is installed. zsh is not on
//     the CI runner (ubuntu-latest), and the repository's convention for that is
//     scripts/apply-lane/apply-lane-settings.test.mjs (the zsh sweeps are a recorded
//     rehearsal, "zsh is not on the CI runner"), so on the GitHub runner alone the zsh arm is
//     reported as a skip; anywhere else a missing zsh FAILS.
//
// Each rule is a function of the texts it reads. The tests run it on the committed
// files; the CONTROLS run the SAME function on a planted copy and require it to go
// red. Where a function holds several rules, a table gives each rule an input that
// ONLY that rule refuses, so dropping any one rule turns a test red (the mutation
// sweep of 2026-10-02 found 52 rules no test would miss).
//
// WHAT IT DOES NOT PROVE: that any of it runs against a database (the harness runs the blocks
// against stubs, which proves how they halt and nothing about what they read). That is the rehearsal's job
// (docs/migration-apply-0100.md, "Rehearsal"), and CI's db-tests once the file is
// promoted. The SET LOCAL lines are also held by scripts/migration-timeouts.test.mjs
// (#1510, on main since 2026-10-02), whose sha256 this document pins as SHAGATE.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { cpus, tmpdir } from "node:os";
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
    if (name === "SHAGATE" && !/^[0-9a-f]{64}$/.test(value)) {
      problems.push(`SHAGATE was filled on 2026-10-02 after #1510 merged; ${value} would undo the fill`);
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

/** Why SHAGATE fails, or [] when it is the sha256 of the gate file's text (null: the file is missing). */
export function gateProblems(gate, fileText) {
  if (!/^[0-9a-f]{64}$/.test(gate)) return [`SHAGATE is not a sha256: ${gate}`];
  if (fileText === null) return [`${GATE_FILE} is missing, so SHAGATE proves nothing`];
  return gate === sha256(fileText) ? [] : [`SHAGATE ${gate} is not the sha256 of ${GATE_FILE}`];
}

/**
 * Every clock read taken from `date` (NOWL) is checked as twelve digits before the next read or the
 * block's end. A static rule CI's bash arm can see: in zsh `[ "" -le N ]` is true, so a `date` that
 * exits 0 with empty output would pass a window check, and only the zsh arm (not on the CI runner)
 * catches a deleted format line by running it.
 */
export function clockParseProblems(md) {
  const problems = [];
  blocksOf(md).forEach((b, bi) => {
    const lines = b.split("\n");
    lines.forEach((l, i) => {
      if (!/^NOWL=\$\(TZ=Europe\/Lisbon date '\+%Y%m%d%H%M'\)/.test(l)) return;
      let ok = false;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^NOWL=/.test(lines[j])) break;
        if (/^echo "\$\{NOWL\}" \| grep -qxE '\[0-9\]\{12\}' \|\| \{ echo "STOP: /.test(lines[j])) { ok = true; break; }
      }
      if (!ok) problems.push(`block ${bi + 1}, line ${i + 1}: a clock read from date is not checked as twelve digits before the next read`);
    });
  });
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
  // The first SHAGATE line, whatever it holds: a value that is not a sha256, or one block
  // disagreeing with the other. (Since the fill of 2026-10-02 the placeholder itself is
  // refused too; see the both-lines control below.)
  const firstGate = /^SHAGATE=.*$/m;
  assert.match(doc, firstGate);
  assert.notDeepEqual(pinProblems(doc.replace(firstGate, "SHAGATE=TODO"), ACTUAL), []);
  assert.notDeepEqual(pinProblems(doc.replace(firstGate, `SHAGATE=${"c".repeat(64)}`), ACTUAL), []);
  // Both SHAGATE lines reverted to the placeholder (a bad merge): refused, though they agree.
  assert.notDeepEqual(pinProblems(doc.replace(/^SHAGATE=.*$/gm, `SHAGATE=${R9_PLACEHOLDERS.SHAGATE}`), ACTUAL), []);
});

test("R9: the placeholders can never match a sha256, and a filled SHAGATE is the gate file's real sha256", () => {
  for (const p of Object.values(R9_PLACEHOLDERS)) assert.doesNotMatch(p, /^[0-9a-f]{64}$/);
  const gate = pinLines(doc).find(([n]) => n === "SHAGATE")[1];
  // Filled since #1510 merged: the gate file must be on this branch and hash to it. A missing
  // subject is a failure, never a skip.
  assert.deepEqual(gateProblems(gate, existsSync(join(ROOT, GATE_FILE)) ? read(GATE_FILE) : null), []);
  // CONTROLS, each refused by exactly one rule, so dropping any one rule turns this red:
  // the placeholder, a missing file, and one changed byte.
  const text = read(GATE_FILE);
  assert.deepEqual(gateProblems(R9_PLACEHOLDERS.SHAGATE, text), [`SHAGATE is not a sha256: ${R9_PLACEHOLDERS.SHAGATE}`]);
  assert.deepEqual(gateProblems(gate, null), [`${GATE_FILE} is missing, so SHAGATE proves nothing`]);
  assert.deepEqual(gateProblems(gate, `${text} `), [`SHAGATE ${gate} is not the sha256 of ${GATE_FILE}`]);
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
  // No date is written into an arm (R9 replaced the dated overrides), with ONE exception: the owner's
  // override of 2026-10-03, reviewed under R8. It may stand on exactly two lines of each block, the
  // date test and the decision line, and the only date either may carry is 20261003.
  for (const b of [s0, s1]) {
    const dated = b.split("\n").filter((l) => /\b2026[01]\d[0-3]\d\b/.test(l));
    assert.equal(dated.length, 2, `dated lines: ${dated.length}`);
    assert.equal(dated[0], 'case "${OVRNOW}" in 20261003*) OVR=yes;; esac');
    assert.ok(dated[1].startsWith('if [ "${CLOCK}'), "the second dated line is the decision line");
    for (const l of dated) assert.deepEqual([...new Set(l.match(/\b2026[01]\d[0-3]\d\b/g))], ["20261003"]);
    // The override decides nothing unless it follows closed hours and the three proofs, and precedes the STOP.
    const d = dated[1];
    const at = (s) => d.indexOf(s);
    assert.ok(at("= yesyesyes ]") > 0 && at('elif [ "${OVR}" = yes ]') > at("= yesyesyes ]") && at('else echo "STOP: Lisbon') > at('elif [ "${OVR}" = yes ]'));
    assert.match(b, /^OVRNOW=\$\(TZ=Europe\/Lisbon date '\+%Y%m%d%H%M'\) \|\| \{ echo "STOP: /m);
    assert.match(b, /^echo "\$\{OVRNOW\}" \| grep -qxE '\[0-9\]\{12\}' \|\| \{ echo "STOP: /m);
    assert.match(b, /^OVR=no$/m);
    // Exactly one line can turn the override on, and exactly one `case` stands in the block: a
    // second date test of any spelling (a bracket pattern, another year) is refused.
    assert.equal(b.split("\n").filter((l) => l.includes("OVR=yes")).length, 1, "one OVR=yes line");
    assert.equal(b.split("\n").filter((l) => /(^|[;\s])case\s/.test(l)).length, 1, "one case line");
  }
  // CONTROL: a second date test with a bracket pattern, which the 8-digit rule alone cannot see.
  const sneaky = s1.replace('case "${OVRNOW}" in 20261003*) OVR=yes;; esac', 'case "${OVRNOW}" in 20261003*) OVR=yes;; esac\ncase "${OVRNOW}" in 2026101[0-9]*) OVR=yes;; esac');
  assert.notEqual(sneaky, s1);
  assert.equal(sneaky.split("\n").filter((l) => l.includes("OVR=yes")).length, 2);
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
  const summary = e.match(/^echo "(earlier pre-check summary: [^"]+)" >> \/tmp\/0100-precheck-earlier\.new \|\| \{ echo "STOP: /m)?.[1];
  assert.equal(summary, "earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL");
  // The transcript is hashed while it is still .new and moved to .out last, so a failure anywhere
  // before the move leaves no .out; and the summary is shown only after the move.
  assert.ok(at("PE=$(shasum -a 256 /tmp/0100-precheck-earlier.new") > 0);
  assert.ok(at("PE=$(shasum -a 256 /tmp/0100-precheck-earlier.new") < at("mv /tmp/0100-precheck-earlier.new /tmp/0100-precheck-earlier.out"));
  assert.ok(at("mv /tmp/0100-precheck-earlier.new /tmp/0100-precheck-earlier.out") < at(`echo "${summary}"\n`));
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

    // EVERY EARLIER PLANT, each refused: the first version's eight; R4 round 1's five loop plants;
    // round 2's four with EXECUTE 'SELECT 1'; the $$-in-a-comment plant and a second DO loop; two
    // comments the earlier versions let through, which an exact compare does not; round 3's eight
    // that hold no CR (its three CR plants follow); R4 round 1's sixth file, schema_any (`WHERE
    // true`); and round 3's `DOLOOP;` plant, the DO loop replaced by a literal DOLOOP statement.
    const plants = [
      migration + "\nDELETE FROM public.patients;--> statement-breakpoint\n",
      migration + "\nCREATE TABLE public.x (id int);--> statement-breakpoint\n",
      migration + "\nALTER TABLE public.patients ADD COLUMN x int;--> statement-breakpoint\n",
      migration + "\nUPDATE public.patients SET id = id;--> statement-breakpoint\n",
      migration + "\nGRANT SELECT ON public.patients TO anon;--> statement-breakpoint\n",
      migration + "\nCOPY public.patients FROM stdin;--> statement-breakpoint\n",
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
      swap("WHERE n.nspname = 'public'", "WHERE true"),
      migration.slice(0, migration.indexOf("DO $$\n")) + "DOLOOP;" + migration.slice(migration.indexOf("$$;--> statement-breakpoint") + 3),
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

test("R9 proof 2's documented limit: a whitespace-kind change at a statement-breakpoint marker passes it, and SHA0100 refuses it", () => {
  // R4 round 4's plants A to D. Each changes only the kind of whitespace (space, TAB, LF), never a
  // non-whitespace byte, so the exact compare passes it; each breaks one of the four markers drizzle
  // splits on, so a reviewed statement is dropped into a -- comment (A to C) or `statement-breakpoint`
  // is left as code (D). SHA0100, asserted before the arm in both stages, is what refuses them.
  const program = catalogOnlyProgram(blockWith(doc, STAGE0));
  const MARK = "--> statement-breakpoint";
  const markers = (t) => t.split(MARK).length - 1;
  const flat = (t) => t.replace(/\n/g, " ");
  const doMark = migration.indexOf("$$;" + MARK) + 3;
  const m2 = migration.indexOf("'60s';" + MARK) + "'60s';".length;
  const m4 = migration.indexOf("FROM authenticated;" + MARK) + "FROM authenticated;".length;
  const tab = (t) => t.replace(MARK, () => "-->\tstatement-breakpoint");
  const plants = {
    "A, marker 1 with a TAB: SET LOCAL statement_timeout falls into the comment": swap(
      "'5s';--> statement-breakpoint\nSET LOCAL statement_timeout = '60s';",
      "'5s';-->\tstatement-breakpoint SET LOCAL statement_timeout = '60s';",
    ),
    "B, marker 2 with a TAB, its LFs to the loop's end made spaces: the DO loop falls into the comment":
      migration.slice(0, m2) + flat(tab(migration.slice(m2, doMark))) + migration.slice(doMark),
    "C, marker 3 with a TAB, its LFs to the default made spaces: ALTER DEFAULT PRIVILEGES falls into the comment":
      migration.slice(0, doMark) + flat(tab(migration.slice(doMark, m4))) + migration.slice(m4),
    "D, an LF inside marker 1: statement-breakpoint is left as code": swap("'5s';--> statement-breakpoint\n", "'5s';-->\nstatement-breakpoint\n"),
  };
  assert.equal(markers(migration), 4);
  const dir = mkdtempSync(join(tmpdir(), "r9-catalog-only-limit-"));
  try {
    for (const [name, text] of Object.entries(plants)) {
      assert.notEqual(text, migration, name);
      assert.equal(text.replace(/[ \t\n]/g, ""), migration.replace(/[ \t\n]/g, ""), `${name}: a non-whitespace byte changed`);
      assert.equal(markers(text), 3, `${name}: drizzle would still find four markers`);
      const f = join(dir, "m.sql");
      writeFileSync(f, text);
      const r = spawnSync(process.execPath, ["-e", program, f], { encoding: "utf8" });
      assert.equal(r.status, 0, `${name}: the documented limit moved, proof 2 now refuses it: ${r.stdout}`);
      assert.match(r.stdout, /^catalog-only: equal to the reviewed text, whitespace aside: CATALOG-ONLY$/m, name);
      assert.notEqual(sha256(text), MIGRATION_SHA, `${name}: hashes to SHA0100`);
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

// =====================================================================================
// EVERY HALT IS EXPLICIT: the static rule, then the fault-injection harness that proves it.
// =====================================================================================

/** A command a later step relies on: its failure must halt the block by an explicit guard. */
const MUST_HALT = [
  /^cd /, /\bgit (fetch|checkout|status|ls-remote|rev-parse origin\/main)\b/, /^rm -f /, /^mv /, /^touch /, /\| tee /,
  /^node (scripts|packages)\//, /^node --env-file=/, /\bpsql /, /^(T99|W99|PRHEAD|REC|PE|NOWL)=\$\(/, />>? \/tmp\/0100-/, /^set -o allexport/,
];
const EXPLICIT_HALT = /\|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/;

/** The lines of a block that run a MUST_HALT command without an explicit `|| { echo "STOP: ..."; exit ...; }`. */
export function unguardedLines(block) {
  const out = [];
  block.split("\n").forEach((line, i) => {
    // R9's proof and decision lines read `no` or STOP on their own; a pure echo is output only.
    if (/^if /.test(line) || /^echo "[^"]*"$/.test(line)) return;
    if (MUST_HALT.some((re) => re.test(line)) && !EXPLICIT_HALT.test(line)) out.push(`${i + 1}: ${line.slice(0, 100)}`);
  });
  return out;
}

test("EVERY HALT IS EXPLICIT: each command a later step relies on carries its own || { echo \"STOP: ...\"; exit ...; }", () => {
  const blocks = blocksOf(doc);
  for (const b of blocks) assert.deepEqual(unguardedLines(b), [], b.slice(0, 120));
  // Not vacuous: the rule sees the commands the R4 BLOCKER named, in the blocks that run them.
  const s1 = blockWith(doc, STAGE1);
  const guardLine = s1.split("\n").find((l) => l.startsWith("node scripts/assert-production-target.mjs"));
  const vmLine = s1.split("\n").find((l) => l.startsWith("node packages/db/scripts/verified-migrate.mjs"));
  assert.ok(guardLine && vmLine);
  assert.match(vmLine, /\| tee \/tmp\/0100-apply\.out \|\| \{ RC=\$\?; echo "STOP: [^"]+"; exit \$\{RC\}; \}$/);
  // CONTROLS: each guard the BLOCKER named, removed, goes red; so does a planted fetch, cd or write.
  const strip = (line) => line.replace(/ \|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/, "");
  assert.deepEqual(unguardedLines(s1.replace(guardLine, strip(guardLine))).length, 1);
  assert.deepEqual(unguardedLines(s1.replace(vmLine, strip(vmLine))).length, 1);
  for (const planted of ["git fetch origin --prune", "cd /somewhere", 'echo "${MAIN}" > /tmp/0100-main.sha', "rm -f /tmp/0100-x", "touch /tmp/0100-applied.ok",
    "node scripts/assert-production-target.mjs", "set -o allexport && . /x.env && set +o allexport", 'NOWL=$(TZ=Europe/Lisbon date "+%Y%m%d%H%M")',
    'psql "${DATABASE_URL_DIRECT}" -f x.sql 2>&1 | tee /tmp/0100-x.out', "node scripts/x.mjs || { echo halt; exit 1; }"]) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
  // A pure echo and an R9 proof line are not commands a later step relies on.
  assert.deepEqual(unguardedLines('echo "--- the pre-check. READ ONLY"\nif node -e "x" m.sql; then D2=yes; fi'), []);
  assert.deepEqual(unguardedLines('git fetch origin --prune || { echo "STOP: the fetch failed. Nothing was applied"; exit 1; }'), []);
});

// ---- THE HARNESS. Nothing in it touches a real host, the secrets folder or a database. ----

const STUBBED = ["git", "psql", "node", "pnpm", "shasum", "tee", "mv", "rm", "touch", "cat", "find", "date", "grep", "cut", "awk", "head", "tail", "wc", "tr"];
/** Never run for real: their stubs answer from fixtures, and node runs for real only as `node -e`. */
const FAKED = new Set(["git", "psql", "pnpm"]);
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const FAKE_SHA = { MAIN: "1".repeat(40), PRHEAD: "2".repeat(40), BEFORE: "3".repeat(40) };

/** The real program behind a name, resolved by plain sh on the system PATH. A missing one FAILS the test. */
function realPath(name) {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", env: { PATH: SYSTEM_PATH } });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}, and it is not there`);
  return p;
}

/** A shell is present when `command -v` finds it on the system PATH. */
const hasShell = (name) => spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH } }).status === 0;

const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

/**
 * One POSIX sh stub. It numbers its own calls per name (no two calls of one name share a pipeline
 * in these blocks, so the numbering is the same in every run up to the fault), logs the call and
 * which records exist, fails when it is the call named by HARNESS_FAIL, and otherwise answers.
 */
function stubText(name, real) {
  const R = (n) => shq(real[n]);
  return `#!/bin/sh
n=${shq(name)}
d="$HARNESS_RUN"
k=0
if [ -f "$d/cnt.$n" ]; then read -r k < "$d/cnt.$n"; fi
k=$((k + 1))
echo "$k" > "$d/cnt.$n"
id="$n#$k"
if [ "$n" = tee ]; then ${R("sleep")} 0.05; fi
inp=
if [ "$n" = cut ]; then inp=$(${R("cat")}); fi
ex=
for m in $HARNESS_MARKERS; do if [ -f "$d/tmp/$m" ] && [ "$d/tmp/$m" -nt "$d/t0" ]; then ex="$ex $m"; fi; done
printf '%s\\n' "$@" > "$d/args.$id"
if [ -n "$inp" ]; then printf 'STDIN %s\\n' "$inp" >> "$d/args.$id"; fi
printf '%s|%s\\n' "$id" "$ex" >> "$d/log"
unexpected() { printf '%s %s\\n' "$id" "$*" >> "$d/unexpected"; echo "harness: unexpected call $id" >&2; exit 97; }
for a in "$@"; do case "$a" in *osteojp-secrets*|*osteojp-prod-apply*) unexpected "a real path";; esac; done
if [ "$HARNESS_FAIL" = "$id" ]; then
  echo "$id" > "$d/fired"
  if [ "$HARNESS_FAIL_MODE" = empty ]; then ${R("cat")} > /dev/null; exit 0; fi
  case "$n" in
    git) echo "fatal: unable to access 'https://github.invalid/': Could not resolve host (harness fault)" >&2; exit 128;;
    psql) echo "psql: error: connection to server at harness.invalid failed: FATAL: harness fault" >&2; exit 2;;
    node) case "$1" in
        scripts/assert-production-target.mjs) echo "REFUSE: harness fault, the target is not the production session pooler" >&2; exit 2;;
        packages/db/scripts/verified-migrate.mjs) echo "harness fault: verified-migrate exits \${HARNESS_FAIL_CODE:-3}"; exit "\${HARNESS_FAIL_CODE:-3}";;
        --env-file=*) echo "REFUSE: harness fault, the reader refuses the target" >&2; exit 2;;
        *) echo "Error: harness fault" >&2; exit 1;;
      esac;;
    tee) ${R("cat")}; echo "tee: harness fault: Permission denied" >&2; exit 1;;
    grep) ${R("cat")} > /dev/null; echo "grep: harness fault: Input/output error" >&2; exit 2;;
    cut|awk|head|tail|wc|tr|shasum) ${R("cat")} > /dev/null; echo "$n: harness fault: Input/output error" >&2; exit 1;;
    *) echo "$n: harness fault: Operation failed" >&2; exit 1;;
  esac
fi
case "$n" in
  git) case "$1" in
      status) exit 0;;
      fetch) exit 0;;
      rev-parse) if [ "$2" = origin/main ]; then echo "$HARNESS_MAIN"; exit 0; fi
        if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi;;
      cat-file) case "$3" in *[!0-9a-f]*) ;; *) if [ "\${#3}" -eq 40 ]; then echo commit; exit 0; fi;; esac
        echo "fatal: Not a valid object name $3" >&2; exit 128;;
      ls-remote) printf '%s\\trefs/pull/1520/head\\n' "$HARNESS_PRHEAD"; exit 0;;
      checkout) for a in "$@"; do last="$a"; done; echo "$last" > "$d/head"; exit 0;;
      show) exec ${R("cat")} "$d/apply/\${2#*:}";;
      ls-tree) for f in "$d/apply/$4"*; do echo "$4\${f##*/}"; done; exit 0;;
    esac
    unexpected "$@";;
  psql) if [ -z "$1" ]; then echo "psql: error: connection to server on socket failed: No such file or directory" >&2; exit 2; fi
    [ "$1" = "$HARNESS_DBURL" ] || unexpected "a database URL that is not the harness's";
    case "$*" in
      *precheck-0100-maintain-revoke.sql*) exec ${R("cat")} "$HARNESS_FIX/pre.out";;
      *postcheck-0100-maintain-revoke.sql*) exec ${R("cat")} "$HARNESS_FIX/post.out";;
      *public.locations*) printf 'BEGIN\\n%s\\n' "$HARNESS_CLINICS"; exit 0;;
      *"where hash = "*) printf 'BEGIN\\n1\\n'; exit 0;;
      *"limit 3"*) exec ${R("cat")} "$HARNESS_FIX/last3.out";;
      *"select count(*) from drizzle.__drizzle_migrations"*) printf 'BEGIN\\n%s\\n' "$HARNESS_ROWS"; exit 0;;
    esac
    unexpected "$@";;
  pnpm) unexpected "$@";;
  node) case "$1" in
      -e) exec ${R("node")} "$@";;
      scripts/check-journal.mjs) echo "check-journal: 98 .sql files match 98 journal entries in order (harness)"; exit 0;;
      scripts/assert-production-target.mjs) if [ -z "$DATABASE_URL_DIRECT" ]; then echo "REFUSE: DATABASE_URL_DIRECT is not set" >&2; exit 2; fi
        [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the guard ran with a URL that is not the harness's";
        printf 'host: harness.invalid\\nport: 5432\\nref: harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
      packages/db/scripts/verified-migrate.mjs) exec ${R("cat")} "$HARNESS_FIX/vm.out";;
      --env-file=*) f="\${1#--env-file=}"; [ -f "$f" ] || { echo "node: $f: not found" >&2; exit 9; }
        [ "$2" = packages/db/scripts/read-applied-migrations.mjs ] || unexpected "$@";
        printf 'journal rows on production: %s\\n  APPLIED  0099_revoke_truncate_trigger_references.sql\\n  APPLIED  0100_revoke_maintain.sql\\npending on this ref: 0\\njournal rows with no matching file on this ref: 0\\n' "$HARNESS_ROWS"; exit 0;;
    esac
    unexpected "$@";;
  date) for a in "$@"; do if [ "$a" = -j ]; then exec ${R("date")} "$@"; fi; done
    case "$1" in
      '+%Y-%m-%d %H:%M') echo "$HARNESS_YMD $HARNESS_HHMM_COLON";;
      '+%H%M') echo "$HARNESS_HHMM";;
      '+%Y%m%d%H%M') echo "$HARNESS_STAMP";;
      '+%Y%m%d%H%M %u') echo "$HARNESS_STAMP $HARNESS_DOW";;
      *) unexpected "$@";;
    esac; exit 0;;
  cut) if [ -n "$inp" ]; then printf '%s\\n' "$inp" | ${R("cut")} "$@"; exit $?; fi
    exec ${R("cut")} "$@" < /dev/null;;
esac
if [ "$HARNESS_HOOK_AFTER" = "$id" ]; then ${R(name)} "$@"; s=$?; ${R("mkdir")} -p "$HARNESS_HOOK_MKDIR"; exit $s; fi
exec ${R(name)} "$@"
`;
}

/** What the faked programs print: a 13-OK pre-check with its carries, a 12-OK post-check, verified-migrate's success. */
function harnessFixtures() {
  const md5 = (s) => createHash("md5").update(s).digest("hex");
  const row = (a, b, c) => ` ${a.padEnd(40)} | ${String(b).padEnd(30)} | ${c}`;
  const pre = [
    row("check", "value", "verdict"), "-".repeat(84),
    row("0 the transaction is READ ONLY", "on", "OK"), row("1 0100 absent by hash", "0; control 1", "OK"),
    row("2 0099 present, the newest row", "1", "OK"), row("journal_rows_before", 97, "OK"),
    row("4 the session is postgres", "postgres", "OK"), row("5 tables owned by the session", "48 of 48", "OK"),
    row("6 grantor is the session", "41 of 41", "OK"), row("7 the premise", "41 of 48; control 48 of 48", "OK"),
    row("8 own grant only", "41 41 0 0 false; control 1", "OK"), row("9 the default grants it", "yes", "OK"),
    row("10 no global default", "0", "OK"), row("11 the five roles", "5", "OK"), row("secdef_functions_before", 5, "OK"),
    row("tables_before", 48, "CARRY"), row("maintain_before", 41, "CARRY"),
    ...["policies_md5", "functions_md5", "relation_acl_md5", "column_acl_md5", "default_acl_md5", "dml_profile_md5"].map((k) => row(k, md5(k), "CARRY")),
    row("INFO other creator defaults", "supabase_admin", "INFO"), row("INFO views with MAINTAIN", 0, "INFO"),
    row("INFO TRUNCATE TRIGGER REFERENCES", "0, 0, 0", "INFO"), "(26 rows)", "",
  ].join("\n");
  const post = [row("check", "value", "verdict"), "-".repeat(84),
    ...Array.from({ length: 12 }, (_, i) => row(`${i} post-check verdict`, "harness", "OK")), "(12 rows)", ""].join("\n");
  const vm = [
    "file       0100_revoke_maintain.sql present, sha256 matches", "journal    97 row(s) applied, last when=1788502000000",
    "pending    1  [0100_revoke_maintain]", "--- drizzle-kit migrate --- (harness)", "journal    97 -> 98  (delta 1)",
    "0100_revoke_maintain present by sha256: yes", "OK: the journal moved by exactly the pending count and carries the approved sha256.", "",
  ].join("\n");
  const last3 = " id | hash | created_at\n 98 | 80f85018 | 1788502100000\n 97 | fbc5e545 | 1788502000000\n 96 | x | 1\n(3 rows)\n";
  return { "pre.out": pre, "post.out": post, "last3.out": last3, "vm.out": vm };
}

/** The repository files the blocks hash or read, copied into the fake apply worktree. */
const APPLY_FILES = [
  PROMOTED_PATH, "packages/db/migrations/0099_revoke_truncate_trigger_references.sql", "packages/db/migrations/meta/_journal.json",
  PRE, POST, "scripts/assert-production-target.mjs", "scripts/production-target.mjs", "scripts/check-journal.mjs", GATE_FILE,
  "packages/db/scripts/verified-migrate.mjs", "packages/db/scripts/read-applied-migrations.mjs",
];

/** The shared base of a sweep: the stubs, the fixtures, a fake env file, and a fake apply worktree holding `docText`. */
export function prepareHarness(base, docText) {
  for (const d of ["bin", "fix", "apply/docs"]) mkdirSync(join(base, d), { recursive: true });
  const real = Object.fromEntries([...STUBBED.filter((n) => !FAKED.has(n) && n !== "node"), "sleep", "mkdir"].map((n) => [n, realPath(n)]));
  real.node = process.execPath;
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, real));
    chmodSync(join(base, "bin", n), 0o755);
  }
  for (const [f, t] of Object.entries(harnessFixtures())) writeFileSync(join(base, "fix", f), t);
  writeFileSync(join(base, "fake-prod.env"), `DATABASE_URL_DIRECT=${FAKE_DB_URL}\nDATABASE_URL=${FAKE_DB_URL}\n`);
  for (const f of APPLY_FILES) {
    mkdirSync(dirname(join(base, "apply", f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(base, "apply", f));
  }
  // The apply tree's journal is the journal AS OF 0100: the live one, cut after 0100's entry. A copy of the live
  // journal moves the "newest entry" this document's stage 0 asserts the day a later migration is promoted.
  const live = JSON.parse(readFileSync(join(ROOT, "packages/db/migrations/meta/_journal.json"), "utf8"));
  const at = live.entries.findIndex((e) => e.tag === "0100_revoke_maintain");
  assert.ok(at >= 0, "the live journal no longer holds 0100");
  writeFileSync(join(base, "apply", "packages/db/migrations/meta/_journal.json"), `${JSON.stringify({ ...live, entries: live.entries.slice(0, at + 1) }, null, 2)}\n`);
  writeFileSync(join(base, "apply", DOC), docText);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(docText)}  ${DOC}\n`);
  return base;
}

/** The block with its real paths moved into the run folder. A block that still names one is refused unrun. */
export function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/0100-", join(run, "tmp/0100-"));
  const rest = out.replaceAll(join(run, "tmp/0100-"), "");
  for (const bad of ["/tmp/0100-", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return out;
}

/** GREEN's tool shape. zsh: exactly it. bash: the same, with errexit forced off, as zsh has it there. */
export function shellArgs(shell, text) {
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  if (shell === "zsh") return ["zsh", ["-f", "-c", tail]];
  if (shell === "bash") return ["bash", ["-c", `set() { builtin set "$@"; builtin set +e; }; ${tail}`]];
  throw new Error(`no shell ${shell}`);
}

function runShell(shell, text, env, cwd) {
  const [cmd, args] = shellArgs(shell, text);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (out += b));
    const t = setTimeout(() => p.kill("SIGKILL"), 60000);
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 128, out }); });
  });
}

/**
 * Run one block once. `fault`: { call, mode, code, hookAfter, hookMkdir, noApply, noEnv }, or null for the
 * positive control; mode "empty" makes the call exit 0 and print nothing. A record counts as written by
 * this run only if it is newer than the reference file t0, which is dated after every record the setup holds.
 */
export async function runOnce(cfg, runId, fault) {
  const run = join(cfg.base, "runs", runId);
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(run, "tmp"), { recursive: true });
  if (!fault?.noApply) symlinkSync(join(cfg.base, "apply"), join(run, "apply"));
  writeFileSync(join(run, "head"), `${cfg.initialHead ?? FAKE_SHA.BEFORE}\n`);
  cfg.setup?.(join(run, "tmp"));
  const t0 = Date.now() - 30000;
  writeFileSync(join(run, "t0"), "");
  utimesSync(join(run, "t0"), new Date(t0), new Date(t0));
  let text = localize(cfg.block, run, fault?.noEnv ? join(run, "no-such.env") : join(cfg.base, "fake-prod.env"));
  for (const [from, to] of cfg.substitute ?? []) text = text.replaceAll(from, to);
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL,
    HARNESS_MAIN: FAKE_SHA.MAIN, HARNESS_PRHEAD: FAKE_SHA.PRHEAD, HARNESS_MARKERS: cfg.markers.join(" "),
    HARNESS_ROWS: String(cfg.rows ?? 98), HARNESS_CLINICS: cfg.clock.clinics,
    HARNESS_YMD: cfg.clock.ymd, HARNESS_HHMM: cfg.clock.hhmm, HARNESS_HHMM_COLON: `${cfg.clock.hhmm.slice(0, 2)}:${cfg.clock.hhmm.slice(2)}`,
    HARNESS_STAMP: cfg.clock.stamp ?? cfg.clock.ymd.replaceAll("-", "") + cfg.clock.hhmm, HARNESS_DOW: String(cfg.clock.dow),
    HARNESS_FAIL: fault?.call ?? "", HARNESS_FAIL_CODE: String(fault?.code ?? 3), HARNESS_FAIL_MODE: fault?.mode ?? "",
    HARNESS_HOOK_AFTER: fault?.hookAfter ?? "", HARNESS_HOOK_MKDIR: fault?.hookMkdir ? join(run, "tmp", fault.hookMkdir) : "",
  };
  // The shell starts inside a second copy of the same tree, so a `cd` that fails leaves the block
  // where every relative path still resolves: the worst case, which only an explicit guard stops.
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const read = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = read("log").trim().split("\n").filter(Boolean).map((l, pos) => {
    const [id, ex] = l.split("|");
    return { id, pos, exists: ex.trim() ? ex.trim().split(" ") : [], args: read(`args.${id}`) };
  });
  const markersAtEnd = cfg.markers.filter((m) => {
    try { const st = statSync(join(run, "tmp", m)); return st.isFile() && st.mtimeMs > t0; } catch { return false; }
  });
  const result = { ...r, calls, markersAtEnd, unexpected: read("unexpected"), fired: read("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

/** A short, readable name for a call: its program and arguments, long ones cut in the middle. */
export function describeCall(call) {
  const lines = call.args.split("\n").filter((l) => l !== "");
  const stdin = lines.filter((l) => l.startsWith("STDIN ")).map((l) => l.slice(6));
  const args = lines.filter((l) => !l.startsWith("STDIN ")).map((a) => (a.length > 70 ? `${a.slice(0, 40)}...${a.slice(-25)}` : a));
  return `${call.id.split("#")[0]} ${args.join(" ")}${stdin.length ? `  <stdin: ${stdin.join(" ").slice(0, 70)}>` : ""}`;
}

/** Where the positive run first wrote each record: the last call position before it appeared. */
function writePoints(positive, markers) {
  const wp = {};
  for (const m of markers) {
    // A tee writes its file while its partner runs, so its write point is the pipeline's first slot.
    const tee = positive.calls.find((c) => c.id.startsWith("tee#") && c.args.includes(`/tmp/${m}`));
    const first = positive.calls.find((c) => c.exists.includes(m));
    wp[m] = Math.min(tee ? tee.pos - 1 : Infinity, first ? first.pos - 1 : Infinity);
  }
  return wp;
}

async function inPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/**
 * Sweep one block: the positive control, then every external call made to fail in turn, plus the
 * extra faults (a missing cd target, a missing env file, a write into a directory, other exit
 * codes). A fault must halt the block with (a) a non-zero exit and the tool chain stopped, (b) none
 * of its pass lines, (c) none of its records written after the failing point, and a STOP line;
 * cfg.mayContinue(call) names the few calls allowed not to halt, and why, and those must not halt.
 */
export async function sweep(cfg) {
  const positive = await runOnce(cfg, `${cfg.id}-positive`, null);
  const posProblems = [];
  if (positive.code !== 0) posProblems.push(`exit ${positive.code}`);
  if (!positive.out.includes(cfg.success[cfg.success.length - 1])) posProblems.push("its last line is missing");
  if (!positive.out.includes("TOOL-CHAIN-CONTINUED")) posProblems.push("the tool chain did not continue");
  if (positive.unexpected) posProblems.push(`unexpected calls: ${positive.unexpected}`);
  if (/^STOP: /m.test(positive.out)) posProblems.push("a STOP line");
  if (posProblems.length) return { positive, posProblems, rows: [] };
  const wp = writePoints(positive, cfg.markers);
  const faults = positive.calls.map((c) => ({ call: c.id, label: describeCall(c), pos: c.pos, at: c }));
  faults.push(...cfg.extraFaults(positive, wp));
  const rows = await inPool(faults, Math.max(2, cpus().length), async (f, i) => {
    const r = await runOnce(cfg, `${cfg.id}-f${i}`, f);
    const allowed = f.at ? cfg.mayContinue(f.at) : null;
    const id = f.mode === "empty" ? `${f.call}:empty` : f.call ?? f.kind;
    const halted = r.code !== 0 && !r.out.includes("TOOL-CHAIN-CONTINUED");
    const problems = [];
    if (f.call && r.fired !== f.call) problems.push(`the fault at ${f.call} never fired`);
    if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
    const row = { fault: f.label, call: id, halted, problems, calls: r.calls, code: r.code, out: r.out };
    if (allowed) {
      if (halted) problems.push(`expected to continue (${allowed}), but it halted`);
      return { ...row, result: `continues: ${allowed}` };
    }
    if (r.code === 0) problems.push("(a) exit 0");
    if (r.out.includes("TOOL-CHAIN-CONTINUED")) problems.push("(a) the tool chain continued");
    for (const s of cfg.success) if (r.out.includes(s)) problems.push(`(b) printed ${s}`);
    for (const m of r.markersAtEnd) if (wp[m] > f.pos) problems.push(`(c) wrote ${m}`);
    if (!/^STOP: /m.test(r.out)) problems.push("no STOP line");
    const stop = (r.out.match(/^STOP: .*$/m) ?? [""])[0];
    return { ...row, result: halted ? `halts, exit ${r.code}: ${stop.slice(0, 100)}` : `DOES NOT HALT, exit ${r.code}` };
  });
  return { positive, posProblems, rows };
}

// ---- The five blocks as the harness runs them. ----

const HARNESS_CLOCKS = {
  closed: { ymd: "2026-10-02", hhmm: "2230", dow: 5, window: "202610022200 202610022300 202610030000", clinics: "0 of 2" },
  day: { ymd: "2026-10-02", hhmm: "1200", dow: 5, window: "202610021100 202610021300 202610021400", clinics: "2 of 2" },
};

/** A valid earlier transcript, as THE EARLIER PRE-CHECK SITTING writes it (the day runs need proof 3 to read yes). */
function earlierTranscript() {
  const text = `earlier pre-check ${ACTUAL[PRE]}\nfrom PR #1520's head ${FAKE_SHA.PRHEAD}, before the merge, Lisbon 2026-10-02 09:00\n` +
    "host: harness.invalid\nport: 5432\nref: harness\ntarget verified: production, session pooler.\n" + harnessFixtures()["pre.out"] +
    "earlier pre-check summary: 13 of 13 verdicts OK, 0 FAIL\n";
  return { text, sha: sha256(text) };
}

const putRecord = (tmp, name, text, minutesAgo) => {
  const f = join(tmp, name);
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

/** Per block: its pass lines (the last is its last line), its records, and the records its inputs need. */
const HARNESS_BLOCKS = {
  earlier: {
    marker: EARLIER, markers: ["0100-precheck-earlier.new", "0100-precheck-earlier.out"],
    success: ["earlier pre-check summary:", "PRECHECK_EARLIER=", "0100 EARLIER PRE-CHECK RECORDED"],
    setup: () => (tmp) => putRecord(tmp, "0100-earlier-head.sha", `${FAKE_SHA.PRHEAD}\n`, 1),
    redirect: "0100-precheck-earlier.new", sources: true,
  },
  stage0: {
    marker: STAGE0, markers: ["0100-sitting.start", "0100-check-journal.out", "0100-main.sha"],
    success: ["running from origin/main", STAGE0],
    setup: (scn) => (tmp) => {
      // In closed hours a previous sitting's applied marker, 13 hours old, is held, so the marker-age
      // line runs its find (and the sweep faults it); inside clinic hours there is none.
      if (scn === "closed") putRecord(tmp, "0100-applied.ok", "", 780);
      if (scn === "day") putRecord(tmp, "0100-precheck-earlier.out", earlierTranscript().text, 120);
    },
    redirect: "0100-main.sha",
  },
  stage1: {
    marker: STAGE1, markers: ["0100-precheck.new", "0100-precheck.out", "0100-apply.out", "0100-applied.ok"],
    success: [STAGE1],
    setup: (scn) => (tmp) => {
      putRecord(tmp, "0100-main.sha", `${FAKE_SHA.MAIN}\n`, 10);
      putRecord(tmp, "0100-sitting.start", "", 60);
      putRecord(tmp, "0100-window.ok", `${FAKE_SHA.MAIN} ${HARNESS_CLOCKS[scn].window}\n`, 5);
      if (scn === "closed") putRecord(tmp, "0100-applied.ok", "", 780);
      if (scn === "day") putRecord(tmp, "0100-precheck-earlier.out", earlierTranscript().text, 120);
    },
    sources: true, vm: true,
  },
  stage2: {
    marker: STAGE2, markers: ["0100-postcheck.out", "0100-stage2.ok"], success: [STAGE2],
    setup: (scn) => (tmp) => {
      putRecord(tmp, "0100-main.sha", `${FAKE_SHA.MAIN}\n`, 20);
      putRecord(tmp, "0100-window.ok", `${FAKE_SHA.MAIN} ${HARNESS_CLOCKS[scn].window}\n`, 15);
      putRecord(tmp, "0100-precheck.out", harnessFixtures()["pre.out"], 6);
      putRecord(tmp, "0100-applied.ok", "", 5);
    },
    redirect: "0100-stage2.ok", sources: true,
  },
  closing: {
    marker: CLOSING, markers: ["0100-journal-after.out"], success: ["CLOSING READ:"], initialHead: FAKE_SHA.MAIN,
    setup: (scn) => (tmp) => {
      putRecord(tmp, "0100-main.sha", `${FAKE_SHA.MAIN}\n`, 30);
      putRecord(tmp, "0100-window.ok", `${FAKE_SHA.MAIN} ${HARNESS_CLOCKS[scn].window}\n`, 25);
      putRecord(tmp, "0100-applied.ok", "", 10);
      putRecord(tmp, "0100-stage2.ok", `${FAKE_SHA.MAIN}\n`, 1);
    },
    sources: true,
  },
};

/** The sweeps: every block in closed hours, and stages 0 and 1 again inside clinic hours with all three R9 proofs valid. */
const HARNESS_PLAN = [["earlier", "closed"], ["stage0", "closed"], ["stage0", "day"], ["stage1", "closed"], ["stage1", "day"], ["stage2", "closed"], ["closing", "closed"]];

/**
 * The calls whose failure may leave a block running, each with its reason; every other call must halt it.
 * A narration line's time; in closed hours, R9's proof lines (a failure reads `no`, and the proofs are
 * printed, not required); inside clinic hours, a failed clock or closed-clinics test, which reads open
 * and so demands every proof. Inside clinic hours every proof call must halt the block.
 */
export function mayContinue(name, scn) {
  return (call) => {
    const prog = call.id.split("#")[0];
    const a = call.args;
    if (prog === "date" && a.startsWith("+%Y-%m-%d %H:%M")) return "the time in a narration line";
    const r9 = name === "stage0" || name === "stage1";
    if (r9 && scn === "closed" && (a.includes(GATE_FILE) || a.includes("0100-precheck-earlier.out") || a.includes("catalog-only") || (prog === "grep" && a.includes("[0-9a-f]{64}")))) {
      return "an R9 proof reads no; in closed hours the proofs are printed, not required";
    }
    if (r9 && scn === "day" && prog === "awk" && a.includes("(t + 0) < 800")) return "a failed clock test reads open, which demands every proof";
    if (r9 && scn === "day" && prog === "awk" && a.includes('a[1] == "0"')) return "a failed closed-clinics test falls through to the open-clinics test";
    return null;
  };
}

/** The sweep configuration of one block in one scenario, on one shell. */
export function harnessConfig(md, name, scn, shell, base) {
  const spec = HARNESS_BLOCKS[name];
  return {
    id: `${shell}-${name}-${scn}`, shell, base, block: blockWith(md, spec.marker), markers: spec.markers, success: spec.success,
    setup: spec.setup(scn), initialHead: spec.initialHead, clock: HARNESS_CLOCKS[scn], mayContinue: mayContinue(name, scn),
    substitute: scn === "day" ? [[`PRECHECK_EARLIER=${R9_PLACEHOLDERS.PRECHECK_EARLIER}`, `PRECHECK_EARLIER=${earlierTranscript().sha}`]] : [],
    extraFaults: (positive, wp) => {
      const out = [{ kind: "cd", label: "cd: the apply worktree is not there", noApply: true, pos: -1 }];
      const guard = positive.calls.find((c) => c.id.startsWith("node#") && /assert-production-target|--env-file=/.test(c.args));
      // Sourced by `.`, the env file fails between two calls; read by `node --env-file`, it fails that call.
      if (spec.sources) out.push({ kind: "env", label: ". or --env-file: the env file is not there", noEnv: true, pos: guard.args.startsWith("--env-file=") ? guard.pos : guard.pos - 1 });
      // The failing point of a write into a directory is the write: where the positive run first wrote that file.
      if (spec.redirect) out.push({ kind: "redirect", label: `> ${spec.redirect}: the path is a directory`, hookAfter: "rm#1", hookMkdir: spec.redirect, pos: Math.min(wp[spec.redirect], positive.calls.length - 1) });
      if (spec.vm) {
        const vm = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
        for (const code of [2, 4, 5]) out.push({ kind: `vm-exit-${code}`, label: `node verified-migrate exits ${code}`, call: vm.id, code, pos: vm.pos, at: null });
      }
      // EXIT 0 WITH EMPTY OUTPUT, for every clock read and every field of the window record: their
      // output is compared with -ge, -le or -lt, and in zsh `[ "" -le n ]` is true.
      for (const c of positive.calls.filter((x) => x.id.startsWith("date#") || (x.id.startsWith("cut#") && x.args.includes("0100-window.ok")))) {
        out.push({ kind: "empty", label: `${describeCall(c)}: exits 0 with empty output`, call: c.id, mode: "empty", pos: c.pos, at: c });
      }
      return out;
    },
  };
}

/** Run every sweep of the plan on one shell, and fail with every problem row. */
async function sweepAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `fault-0100-${shell}-`));
  try {
    prepareHarness(base, doc);
    const bad = [];
    let faults = 0;
    for (const [name, scn] of HARNESS_PLAN) {
      const r = await sweep(harnessConfig(doc, name, scn, shell, base));
      assert.deepEqual(r.posProblems, [], `${shell} ${name} ${scn}: the positive control did not reach its last line\n${r.positive.out.slice(-2000)}`);
      // Not vacuous: every call of the positive run was made to fail, and all but the few named in
      // mayContinue halt the block.
      assert.ok(r.rows.length > r.positive.calls.length, `${shell} ${name} ${scn}: ${r.rows.length} faults`);
      const halts = r.rows.filter((x) => x.halted).length;
      assert.ok(r.rows.length - halts <= 7, `${shell} ${name} ${scn}: only ${halts} of ${r.rows.length} faults halt`);
      faults += r.rows.length;
      t.diagnostic(`${shell} ${name} (${scn}): positive reaches its last line; ${r.rows.length} faults, ${halts} halt, ${r.rows.length - halts} allowed to continue`);
      for (const row of r.rows) {
        if (process.env.FAULT_TABLE === "1") t.diagnostic(`  ${name} ${scn} | ${row.call} | ${row.fault.slice(0, 110)} | ${row.result}`);
        if (row.problems.length) bad.push(`${shell} ${name} ${scn} ${row.call} [${row.fault}]: ${row.problems.join("; ")}`);
      }
    }
    assert.deepEqual(bad, [], `fault rows that broke a rule:\n${bad.join("\n")}`);
    assert.ok(faults > 300, `only ${faults} faults across the five blocks`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** zsh is GREEN's shell. Absent on the GitHub runner by the repository's recorded convention; absent anywhere else, a failure. */
function zshOrSkip(t) {
  if (hasShell("zsh")) return true;
  if (process.env.GITHUB_ACTIONS === "true") {
    t.skip("zsh is not on the CI runner (ubuntu-latest); the convention is scripts/apply-lane/apply-lane-settings.test.mjs, whose zsh sweeps are a recorded rehearsal. The bash arm ran here instead");
    return false;
  }
  assert.fail("zsh is not on this machine, and the zsh arm of the fault-injection harness must run wherever it is not the GitHub runner");
}

test("EVERY CLOCK READ IS PARSED: each NOWL from date is checked as YYYYMMDDHHMM before the next read (static, so CI sees it)", () => {
  assert.deepEqual(clockParseProblems(doc), []);
  const reads = blocksOf(doc).join("\n").split("\n").filter((l) => l.startsWith("NOWL=$(TZ=Europe/Lisbon date"));
  assert.equal(reads.length, 4, "stage 1 twice, stage 2 and the closing read");
  // CONTROLS: drop each format line in turn; the rule names a problem every time.
  const lines = doc.split("\n");
  const checks = lines.map((l, i) => [l, i]).filter(([l]) => /^echo "\$\{NOWL\}" \| grep -qxE '\[0-9\]\{12\}' \|\|/.test(l));
  assert.equal(checks.length, 4);
  for (const [, i] of checks) {
    const cut = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n");
    assert.notDeepEqual(clockParseProblems(cut), [], `dropping line ${i + 1} must be caught`);
  }
});

test("every block parses under bash -n and zsh -n", (t) => {
  for (const b of blocksOf(doc)) {
    const r = spawnSync("bash", ["-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
  if (!zshOrSkip(t)) return;
  for (const b of blocksOf(doc)) {
    const r = spawnSync("zsh", ["-f", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `zsh -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
});

test("THE HARNESS IS ITS OWN CONTROL: in the tool's shape set -e stops nothing, and a block without its guards runs on", async (t) => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  for (const shell of shells) {
    // The shape itself: `set -eo pipefail` inside the eval stops nothing, and pipefail still sets a pipeline's status.
    const [cmd, args] = shellArgs(shell, "( set -eo pipefail; false; echo after-false; false | cat || echo pipefail-holds )");
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    assert.equal(r.status, 0, `${shell}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /after-false\npipefail-holds\nTOOL-CHAIN-CONTINUED/, shell);
  }
  const base = mkdtempSync(join(tmpdir(), "fault-0100-control-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      const cfg = harnessConfig(doc, "stage1", "closed", shell, base);
      const positive = await runOnce(cfg, `${shell}-control-positive`, null);
      assert.equal(positive.code, 0, positive.out.slice(-1500));
      const guardCall = positive.calls.find((c) => c.args.startsWith("scripts/assert-production-target.mjs"));
      const vmCall = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
      const s1 = cfg.block;
      const strip = (block, start) => {
        const line = block.split("\n").find((l) => l.startsWith(start));
        return block.replace(line, line.replace(/ \|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/, ""));
      };
      // THE NAMED NEGATIVE CONTROL: a refusing target guard stops stage 1 before psql runs the
      // pre-check and before verified-migrate, with no record written.
      const refused = await runOnce(cfg, `${shell}-control-guard`, { call: guardCall.id });
      assert.notEqual(refused.code, 0, refused.out);
      assert.match(refused.out, /^STOP: the target guard refused or failed/m);
      assert.ok(!refused.out.includes("TOOL-CHAIN-CONTINUED") && !refused.out.includes(STAGE1));
      assert.deepEqual(refused.calls.filter((c) => c.id.startsWith("psql#") || c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), []);
      assert.deepEqual(refused.markersAtEnd, []);
      // verified-migrate's own exit codes 3, 4 and 5 are the block's exit, with no applied marker.
      for (const code of [3, 4, 5]) {
        const r = await runOnce(cfg, `${shell}-control-vm-${code}`, { call: vmCall.id, code });
        assert.equal(r.code, code, r.out);
        assert.ok(!r.markersAtEnd.includes("0100-applied.ok") && !r.out.includes(STAGE1), r.out);
      }
      // CONTROLS: the same faults on the block with that one guard removed run on to the applied line,
      // so the harness can go red.
      const noGuard = await runOnce({ ...cfg, block: strip(s1, "node scripts/assert-production-target.mjs") }, `${shell}-control-noguard`, { call: guardCall.id });
      assert.equal(noGuard.code, 0, noGuard.out.slice(-800));
      assert.ok(noGuard.out.includes(STAGE1) && noGuard.calls.some((c) => c.id.startsWith("psql#")));
      const noVm = await runOnce({ ...cfg, block: strip(s1, "node packages/db/scripts/verified-migrate.mjs") }, `${shell}-control-novm`, { call: vmCall.id, code: 3 });
      assert.equal(noVm.code, 0, noVm.out.slice(-800));
      assert.ok(noVm.out.includes(STAGE1) && noVm.markersAtEnd.includes("0100-applied.ok"));
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("FAULT INJECTION, bash with errexit off (runs in CI): every external call of every block, made to fail, halts it", async (t) => {
  await sweepAll(t, "bash");
});

test("FAULT INJECTION, zsh in GREEN's exact shape: every external call of every block, made to fail, halts it", async (t) => {
  if (!zshOrSkip(t)) return;
  await sweepAll(t, "zsh");
});

/**
 * THE WINDOW FEED: stage 1 run whole, in the tool's shape, with one run-window record or clock each.
 * Every record that must refuse has to STOP before psql runs and write no applied marker; the good
 * record has to reach the applied line. Returns the cases that did not do what they must.
 */
export async function windowFeed(base, shell, block) {
  const M = FAKE_SHA.MAIN;
  const now = "202610022230"; // HARNESS_CLOCKS.closed
  const cases = [
    ["a good record", `${M} 202610022200 202610022300 202610030000`, null, null],
    ["now before the window opens", `${M} 202610022240 202610022300 202610030000`, null, /^STOP: Lisbon 202610022230 is before the run window opens at 202610022240/m],
    ["now past the last minute stage 1 may start", `${M} 202610022200 202610022220 202610030000`, null, /^STOP: Lisbon 202610022230 is past 202610022220, the last minute/m],
    ["now AT the window's end", `${M} 202610022200 202610022300 ${now}`, null, /^STOP: Lisbon 202610022230 is not before 202610022230, the run window's end/m],
    ["now PAST the window's end (the previous night's window, as a failed dispatch evening test records it)", `${M} 202610012100 202610022259 202610020800`, null, /^STOP: Lisbon 202610022230 is not before 202610020800, the run window's end/m],
    ["a record for another sha", `${"2".repeat(40)} 202610022200 202610022300 202610030000`, null, /^STOP: the run window was recorded for 2{40}, not for the sha stage 0 recorded/m],
    ["a malformed record: an 11-digit time", `${M} 20261002220 202610022300 202610030000`, null, /^STOP: the recorded run window did not parse/m],
    ["a malformed record: no end", `${M} 202610022200 202610022300`, null, /^STOP: the recorded run window did not parse/m],
    ["an empty clock", `${M} 202610022200 202610022300 202610030000`, "", /^STOP: /m],
  ];
  const failures = [];
  for (const [i, [name, record, stamp, stop]] of cases.entries()) {
    const cfg = harnessConfig(doc, "stage1", "closed", shell, base);
    const setup = cfg.setup;
    const r = await runOnce({
      ...cfg, block,
      clock: stamp === null ? cfg.clock : { ...cfg.clock, stamp },
      setup: (tmp) => { setup(tmp); putRecord(tmp, "0100-window.ok", `${record}\n`, 5); },
    }, `${shell}-feed-${i}`, null);
    const psql = r.calls.some((c) => c.id.startsWith("psql#"));
    const applied = r.markersAtEnd.includes("0100-applied.ok") || r.out.includes(STAGE1);
    if (stop === null) {
      if (r.code !== 0 || !applied || !r.out.includes("TOOL-CHAIN-CONTINUED")) failures.push(`${name}: did not reach the applied line (exit ${r.code})`);
    } else if (r.code === 0 || applied || psql || !stop.test(r.out)) {
      failures.push(`${name}: exit ${r.code}, applied ${applied}, psql ran ${psql}, STOP ${(r.out.match(/^STOP: .*$/m) ?? ["none"])[0].slice(0, 90)}`);
    }
  }
  return { cases: cases.length, failures };
}

/** Stage 1 without 2de0d186's two lines (the clock-format check and `now < end` after the first read). */
export function withoutWindowEnd(block) {
  const lines = block.split("\n");
  const drop = (pred) => {
    const hits = lines.filter(pred);
    assert.equal(hits.length, 1, "the line to remove is not there exactly once");
    lines.splice(lines.indexOf(hits[0]), 1);
  };
  drop((l) => l === `echo "\${NOWL}" | grep -qxE '[0-9]{12}' || { echo "STOP: the Lisbon clock did not read as YYYYMMDDHHMM. Nothing was applied"; exit 1; }`);
  drop((l) => l.startsWith('[ "${NOWL}" -lt "${WEND}" ] || { echo "STOP: Lisbon ${NOWL} is not before ${WEND}'));
  return lines.join("\n");
}

test("THE WINDOW FEED: stage 1 refuses every run-window record it must, before psql, and passes a good one", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0100-feed-"));
  try {
    prepareHarness(base, doc);
    const s1 = blockWith(doc, STAGE1);
    for (const shell of shells) {
      const real = await windowFeed(base, shell, s1);
      assert.equal(real.cases, 9);
      assert.deepEqual(real.failures, [], `${shell}: ${real.failures.join("\n")}`);
      // IT BITES: without the window-end lines, the two end cases run on to the applied line.
      const stripped = await windowFeed(base, shell, withoutWindowEnd(s1));
      assert.deepEqual(stripped.failures.map((f) => f.split(":")[0]), [
        "now AT the window's end",
        "now PAST the window's end (the previous night's window, as a failed dispatch evening test records it)",
      ], `${shell}: ${stripped.failures.join("\n")}`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("THE OWNER'S OVERRIDE OF 2026-10-03: stages 0 and 1 pass inside clinic hours on that Lisbon date only, with R9's placeholders as they stand", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0100-ovr-"));
  const M = FAKE_SHA.MAIN;
  // [Lisbon date, HHMM, scenario, what must happen]
  const cases = [
    ["2026-10-03", "1200", "day", "override"],
    ["2026-10-03", "0800", "day", "override"],
    ["2026-10-03", "2059", "day", "override"],
    ["2026-10-02", "1200", "day", "stop"],
    ["2026-10-04", "1200", "day", "stop"],
    ["2026-11-03", "1200", "day", "stop"],
    ["2027-10-03", "1200", "day", "stop"],
    ["2026-10-03", "2230", "closed", "closed"],
  ];
  const run = async (shell, name, [ymd, hhmm, scn], block) => {
    const cfg = harnessConfig(doc, name, scn, shell, base);
    const d = ymd.replaceAll("-", "");
    const hh = Number(hhmm.slice(0, 2));
    const win = `${d}${String(hh).padStart(2, "0")}00 ${d}${String(hh).padStart(2, "0")}59 ${d}2359`;
    return runOnce({
      ...cfg, block: block ?? cfg.block, substitute: [], clock: { ...cfg.clock, ymd, hhmm, stamp: undefined },
      setup: (tmp) => { cfg.setup(tmp); if (name === "stage1") putRecord(tmp, "0100-window.ok", `${M} ${win}\n`, 5); },
    }, `${shell}-${name}-ovr-${d}-${hhmm}${block ? "-mut" : ""}`, null);
  };
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      for (const name of ["stage0", "stage1"]) {
        const marker = name === "stage0" ? STAGE0 : STAGE1;
        for (const c of cases) {
          const r = await run(shell, name, c);
          const tag = `${shell} ${name} ${c[0]} ${c[1]}`;
          const applied = r.markersAtEnd.includes("0100-applied.ok");
          if (c[3] === "override") {
            assert.equal(r.code, 0, `${tag}: ${r.out.slice(-500)}`);
            assert.match(r.out, /^OWNER OVERRIDE 2026-10-03: Lisbon .*The three proofs are printed, not required\./m, tag);
            assert.match(r.out, /^owner's override of 2026-10-03 \(this Lisbon date only\): yes$/m, tag);
            assert.ok(r.out.includes(marker) && r.out.includes("TOOL-CHAIN-CONTINUED"), tag);
          } else if (c[3] === "stop") {
            assert.notEqual(r.code, 0, tag);
            assert.match(r.out, /^STOP: Lisbon 1200/m, tag);
            assert.match(r.out, /^owner's override of 2026-10-03 \(this Lisbon date only\): no$/m, tag);
            assert.doesNotMatch(r.out, /^OWNER OVERRIDE/m, tag);
            assert.ok(!applied && !r.out.includes(marker), `${tag}: it went on`);
          } else {
            assert.equal(r.code, 0, `${tag}: ${r.out.slice(-500)}`);
            assert.match(r.out, /^R9: closed hours/m, tag);
            assert.doesNotMatch(r.out, /^OWNER OVERRIDE/m, tag);
          }
        }
        // IT BITES: with the date test moved one day, 2026-10-03 at noon stops like any other day.
        const real = harnessConfig(doc, name, "day", shell, base).block;
        const moved = real.replace('in 20261003*) OVR=yes', 'in 20261004*) OVR=yes');
        assert.notEqual(moved, real);
        const m = await run(shell, name, cases[0], moved);
        assert.notEqual(m.code, 0, `${shell} ${name}: the moved date still passed`);
        assert.match(m.out, /^STOP: Lisbon 1200/m);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("THE APPLIED MARKER'S AGE: a marker from this sitting stops stages 0 and 1; one 13 hours old does not", async () => {
  const shells = ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];
  const base = mkdtempSync(join(tmpdir(), "fault-0100-marker-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      for (const name of ["stage0", "stage1"]) {
        const cfg = harnessConfig(doc, name, "closed", shell, base);
        for (const [age, stops] of [[719, true], [780, false]]) {
          const r = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0100-applied.ok", "", age); } }, `${shell}-${name}-age-${age}`, null);
          if (stops) {
            assert.notEqual(r.code, 0, `${shell} ${name} ${age}`);
            assert.match(r.out, /^STOP: stage 1 has ALREADY APPLIED 0100 in this sitting/m);
            assert.deepEqual(r.calls.filter((c) => c.id.startsWith("git#")), [], `${shell} ${name}: it ran git after the marker`);
          } else {
            assert.equal(r.code, 0, `${shell} ${name} ${age}: ${r.out.slice(-600)}`);
          }
        }
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// 0108 (the pack read function): the migration, its two check files and the apply document agree with
// each other, byte for byte where it matters; every halt in the document's six blocks is explicit, proven
// by fault injection; the document's clock is the weekday table and, in the two dispatch blocks,
// strategy's start windows; no apply window may end inside a repeated hour; and every block runs from
// the pull request's HELD head, never from main.
//
// This file is 0107's test (scripts/annulment-insert-policy-0107.test.mjs) with the number, the files,
// the pins, the journal position, the carries, the verdict profiles and the migration's shape changed,
// and the head the blocks run from moved from the merge commit on main to the held head of
// origin/db/0108-pack-read-function, because 0108 creates a SECURITY DEFINER function and cannot merge
// before its apply.
//
// WHAT THIS PROVES, statically, with no database:
//   * the migration stands in its one place, packages/db/migrations, written at its number with no
//     pending file before it, and the mirror carries the same statements;
//   * the migration's SHAPE: the two SET LOCAL lines first; 7 statements; one CREATE FUNCTION of
//     public.pack_instance_consuming_sessions(uuid), SECURITY DEFINER, STABLE, plpgsql, search_path
//     public, with every term of the patient rule; its owner pin; EXECUTE revoked from PUBLIC, anon,
//     authenticated, patient and service_role and granted to authenticated alone; its comment; no drop,
//     policy, table, trigger, sequence or row write;
//   * the pre-check and the post-check compare the journal with the pinned sha256 in code; they write
//     nothing and control no transaction of their own (each runs inside its block's begin read only);
//   * THE VERDICT PROFILE: every verdict prints OK or FAIL, and only the post-check's verdict 6 can read
//     VACUOUS; the profiles the blocks require are the ones the files print: 13 OK / 0 VACUOUS / 0 FAIL
//     before the apply, and after it 13 OK / 0 VACUOUS / 0 FAIL, or 12 OK / 1 VACUOUS / 0 FAIL when the
//     pre-check's probe_instances is 0;
//   * every sha256 the document pins is the real file, or the value read on this tree, and the
//     sidecar pins the document;
//   * THE ONLY WRITING COMMAND of the six blocks is verified-migrate, once, with the reviewed
//     arguments; every psql call is READ ONLY; and no CREATE or DROP FUNCTION stands in any block;
//   * THE CLOCK IS THE WEEKDAY TABLE in stage 0 and stage 1, and the weekday table AND strategy's
//     start windows in BEFORE YOU START and the CLOCK CHECK; R9's proof 2 is a fixed `yes` and proof 3
//     a fixed `no`, there is no daytime path, no override arm, and no block carries a date;
//   * THE HELD HEAD: every block names origin/db/0108-pack-read-function and none names origin/main;
//   * THE WINDOW'S END: both dispatch blocks STOP when WEND falls 01:00 to 01:59 on the last Sunday of
//     October, the hour the Lisbon clocks repeat, by arithmetic on the typed value (no clock read);
//   * EVERY CLOCK READ carries TZ=Europe/Lisbon and reads the zone's name in the same `date` call, and
//     the next line stops unless it is WET or WEST;
//   * EVERY STOP THAT CAN FIRE AFTER THE COMMIT says that 0108 is applied, that the write stands and that
//     nothing is run again; the five whose own read can contradict that say the state is UNKNOWN;
//   * the two dispatch blocks carry exactly their five (four) PENDING value lines and STOP on them
//     unfilled, before anything runs;
//   * the blocks carry no `#` line, no `!` but `test !`, no backslash continuation, never the apply
//     worktree's old place, and NO `set -e` AT ALL: line 2 of each is `set -o pipefail`;
//   * EVERY HALT IS EXPLICIT, and a fault-injection harness proves it: each block runs in GREEN's tool
//     shape with every external command a stub, each call made to fail in turn. In CI the harness runs
//     under bash with errexit forced off; under zsh wherever zsh is installed. HARNESS_POOL caps its
//     parallel runs.
//
// WHAT IT DOES NOT PROVE: that any of it runs against a database. That is the rehearsal
// (docs/migration-apply-0108.md, "Rehearsal" and "NOT REHEARSED").
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const md5 = (s) => createHash("md5").update(s).digest("hex");

const MIGRATION_SHA = "7f481ae4a61a7eb97f828414ae23e4ea3f9d30d32ae8539a6205d5b53ecfd6cb";
const TAG = "0108_pack_instance_consuming_sessions";
const PREV_TAG = "0107_record_annulments_insert_policy";
const MIGRATION_PATH = `packages/db/migrations/${TAG}.sql`;
const PREV_PATH = `packages/db/migrations/${PREV_TAG}.sql`;
const JOURNAL = "packages/db/migrations/meta/_journal.json";
const PRE = "scripts/db/precheck-0108-pack-instance-consuming-sessions.sql";
const POST = "scripts/db/postcheck-0108-pack-instance-consuming-sessions.sql";
const DOC = "docs/migration-apply-0108.md";
const SIDECAR = "docs/migration-apply-0108.sha256";
const GATE_FILE = "scripts/migration-timeouts.test.mjs";
const THIS_FILE = "scripts/pack-instance-consuming-sessions-0108.test.mjs";

/** The pins of files this branch does not own, as they read on main when the document was written. */
export const EXTERNAL_PINS = Object.freeze({
  SHAPREV: "56c310cd99add5a4d6dfa3df3ed1e49251988ce4bc0d4e291ac818bd0fef047a",
  SHAVM: "ea0902f839af6e72acd625dad8fc09f2297d7e6aa7d434538a277cc8f5893261",
  SHAGUARD: "6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96",
  SHAPTM: "e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c",
  SHAREADER: "825b7818c8e0f0f2c313a42a8a14ee6af7c2ee1e3ec101f90a20dd64e9a02387",
  SHACJ: "7f89e49a11bdeb0d6f8a6fa40d0edbb0f95082f972af040cccf5667f63b96c59",
});

/** SQL code: block and line comments removed (a `-->` breakpoint stays). */
export const codeOf = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n>][^\n]*/g, "");
/** The statements of the migration's code, split on drizzle's breakpoint, whitespace collapsed. */
export const statementsOf = (sql) =>
  codeOf(sql).split("--> statement-breakpoint").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const unquoted = (s) => s.replace(/'(?:[^']|'')*'/g, "''");

/** Every rule the migration's shape must keep, each with its own message. [] when it passes. */
export const FN = "public.pack_instance_consuming_sessions";
export const CREATE_HEAD = "CREATE FUNCTION public.pack_instance_consuming_sessions(p_pack_instance_id uuid) RETURNS TABLE (appointment_id uuid, starts_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$";
export const BODY_TERMS = Object.freeze([
  "#variable_conflict use_column",
  "RETURN QUERY SELECT a.id, a.starts_at FROM public.patient_pack_instances i",
  "JOIN public.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id",
  "JOIN public.appointments a ON a.pack_instance_id = i.id AND a.tenant_id = i.tenant_id",
  "WHERE i.id = p_pack_instance_id",
  "AND i.tenant_id = (SELECT public.jwt_tenant_id())",
  "AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception', 'therapist')",
  "AND a.status <> 'cancelled'",
  "p.created_by = (SELECT auth.uid())",
  "OR (SELECT public.jwt_role()) = 'owner'",
  "(SELECT public.jwt_role()) IN ('admin', 'reception')",
  "NOT (SELECT public.viewer_has_location_assignment())",
  "OR p.id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))",
  "(SELECT public.jwt_role()) = 'therapist'",
  "p.id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))",
  "OR p.id = ANY (coalesce((SELECT public.viewer_care_team_patient_ids_at_my_clinics()), '{}'::uuid[]))",
  "ORDER BY a.starts_at, a.id; END $fn$;",
]);
export const TAIL_STATEMENTS = Object.freeze([
  `ALTER FUNCTION ${"public.pack_instance_consuming_sessions"}(uuid) OWNER TO postgres;`,
  `REVOKE ALL ON FUNCTION ${"public.pack_instance_consuming_sessions"}(uuid) FROM PUBLIC, anon, authenticated, patient, service_role;`,
  `GRANT EXECUTE ON FUNCTION ${"public.pack_instance_consuming_sessions"}(uuid) TO authenticated;`,
]);
export function migrationProblems(sql) {
  const problems = [];
  const stmts = statementsOf(sql);
  if (stmts[0] !== "SET LOCAL lock_timeout = '5s';") problems.push("statement 1 is not exactly SET LOCAL lock_timeout = '5s';");
  if (stmts[1] !== "SET LOCAL statement_timeout = '60s';") problems.push("statement 2 is not exactly SET LOCAL statement_timeout = '60s';");
  if (stmts.slice(2).some((s) => /\b(lock_timeout|statement_timeout|idle_in_transaction_session_timeout)\b/i.test(s))) problems.push("a later statement names a bound");
  if (stmts.some((s) => /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE|RESET|DISCARD)\b/i.test(s))) problems.push("a statement is transaction control, RESET or DISCARD");
  if (stmts.length !== 7) problems.push(`${stmts.length} statements, not 7`);
  const create = stmts[2] ?? "";
  if (!create.startsWith(CREATE_HEAD)) problems.push("statement 3 is not the CREATE FUNCTION of public.pack_instance_consuming_sessions(uuid) as reviewed");
  for (const term of BODY_TERMS) if (!create.includes(term)) problems.push(`the body lacks the term ${term}`);
  TAIL_STATEMENTS.forEach((t, k) => { if (stmts[3 + k] !== t) problems.push(`statement ${4 + k} is not exactly ${t}`); });
  if (!(stmts[6] ?? "").startsWith(`COMMENT ON FUNCTION ${FN}(uuid) IS `)) problems.push("statement 7 is not the function's comment");
  const code = stmts.map(unquoted).join("\n");
  if (/\b(DROP|TRUNCATE|COPY|MERGE|SEQUENCE|TRIGGER|POLICY|FORCE|RESTRICTIVE|SECURITY INVOKER|OR REPLACE|ALTER TABLE|CREATE TABLE|CREATE INDEX|VOLATILE|IMMUTABLE)\b/i.test(code) || /\bDO \$/.test(code)
    || /\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET)\b/i.test(code)) {
    problems.push("a DROP, TRUNCATE, COPY, MERGE, SEQUENCE, TRIGGER, POLICY, FORCE, RESTRICTIVE, SECURITY INVOKER, OR REPLACE, table or index DDL, VOLATILE, IMMUTABLE, DO block or row write in the code");
  }
  if ((code.match(/\bCREATE\b/g) ?? []).length !== 1) problems.push("not exactly one CREATE");
  if ((code.match(/\bGRANT\b/g) ?? []).length !== 1) problems.push("not exactly one GRANT");
  if ((code.match(/\bREVOKE\b/g) ?? []).length !== 1) problems.push("not exactly one REVOKE");
  if ((code.match(/\bSECURITY DEFINER\b/g) ?? []).length !== 1) problems.push("not exactly one SECURITY DEFINER");
  return problems;
}

/** A check file writes nothing: no code line begins with a writing verb, and no string is a writing statement. */
export function writeProblems(sql) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    // The two session settings the post-check takes for its own read, inside its block's transaction: no write, no transaction control.
    if (/^SET LOCAL (row_security = off|search_path = public);$/.test(t)) continue;
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|ROLLBACK|SET|RESET|START)\b/i.test(t)) {
      problems.push(`a writing or transaction statement: ${t.slice(0, 80)}`);
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
  if (/acldefault\(\s*'S'|THEN\s+'S'::"char"|'S'::"char"\s+ELSE/.test(code)) problems.push("acldefault is given the FOREIGN SERVER code 'S' where a sequence's code is 's'");
  if (!code.includes(REL_DEFAULT)) problems.push("rel_items does not read a NULL relacl as acldefault of its own object type");
  return problems;
}

/** The journal reads that DECIDE a verdict name the pinned sha256s in code. */
export const JOURNAL_USING = `    USING '${MIGRATION_SHA}',\n          '${EXTERNAL_PINS.SHAPREV}';`;
export function journalPinProblems(sql, which) {
  const problems = [];
  const code = codeOf(sql);
  if (!code.includes(JOURNAL_USING)) problems.push("the journal count does not take the pinned sha256s of 0108 and 0107");
  const want = which === "pre"
    ? ["CASE WHEN journal_state = 'read' AND has_0108 = 0 AND has_0107 = 1 THEN 'OK' ELSE 'FAIL' END FROM j",
      `         CASE WHEN journal_state = 'read' AND newest_hash = '${EXTERNAL_PINS.SHAPREV}'\n                   AND newest_when = '1788502800000' THEN 'OK' ELSE 'FAIL' END FROM j`,
      "CASE WHEN journal_state = 'read' AND journal_rows = 105 THEN 'OK' ELSE 'FAIL' END FROM j"]
    : [`         CASE WHEN journal_state = 'read' AND has_0108 = 1 AND has_0107 = 1\n                   AND newest_hash = '${MIGRATION_SHA}'\n                   AND newest_when = '1788502900000' THEN 'OK' ELSE 'FAIL' END FROM j`,
      "CASE WHEN journal_state = 'read' AND journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j"];
  for (const w of want) if (!code.includes(w)) problems.push(`the ${which}-check does not decide its journal verdict as reviewed: ${w.trim().slice(0, 60)}`);
  return problems;
}

/**
 * The rows a check file prints, read off its final UNION: each row's name (the `check` column) and
 * every literal its last column can hold, in the order the CASE tests them.
 */
export function verdictRowsOf(sql) {
  const code = codeOf(sql);
  const a = code.indexOf("\n), r AS (\n");
  const b = code.indexOf("\n), s AS (", a);
  if (a < 0 || b < 0) return null;
  return code.slice(a + "\n), r AS (\n".length, b).split(/\n  UNION ALL SELECT /).map((chunk) => {
    const head = /^(?:SELECT )?(\d+)(?: AS n)?, '((?:[^']|'')+)'/.exec(chunk.trim());
    if (!head) throw new Error(`a row did not parse: ${chunk.slice(0, 80)}`);
    const results = [...chunk.matchAll(/(?:THEN|ELSE) '(OK|VACUOUS|FAIL|CARRY|INFO)'|'(CARRY|INFO)' FROM j\s*$/g)].map((x) => x[1] ?? x[2]);
    const name = head[2].replaceAll("''", "'");
    const num = /^(\d+)\. /.exec(name);
    return { n: num ? Number(num[1]) : name, name, results };
  });
}
const kindOf = (row) => (row.results.includes("OK") ? "verdict" : row.results.includes("CARRY") ? "carry" : row.results.includes("INFO") ? "info" : "none");

/**
 * A ZERO COMPARAND IS NOT A PASS. Every verdict prints OK, VACUOUS or FAIL and nothing else and can
 * read FAIL; a verdict that can read VACUOUS tests it before OK and never prints OK as its ELSE; and
 * the verdicts that can read VACUOUS are exactly `vacuous`.
 */
export function profileProblems(sql, wantVerdicts, vacuous) {
  const rows = verdictRowsOf(sql);
  if (rows === null) return ["the file has no final SELECT to read"];
  const problems = [];
  const verdicts = rows.filter((r) => kindOf(r) === "verdict");
  if (verdicts.length !== wantVerdicts) problems.push(`${verdicts.length} verdicts, not ${wantVerdicts}`);
  for (const r of rows) {
    if (kindOf(r) === "none") problems.push(`row ${r.n} prints no known last column`);
    if (kindOf(r) === "verdict" && r.results.some((x) => x === "CARRY" || x === "INFO")) problems.push(`row ${r.n} mixes a verdict with a carry or an info`);
    if (kindOf(r) === "verdict" && !r.results.includes("FAIL")) problems.push(`verdict ${r.n} cannot read FAIL`);
    if (kindOf(r) === "verdict" && r.results.at(-1) === "OK") problems.push(`verdict ${r.n} prints OK as its ELSE`);
    if (r.results.includes("VACUOUS") && !(r.results.indexOf("VACUOUS") < r.results.indexOf("OK"))) problems.push(`verdict ${r.n} can print OK before it has tested for VACUOUS`);
  }
  const can = rows.filter((r) => r.results.includes("VACUOUS")).map((r) => r.n);
  if (JSON.stringify(can) !== JSON.stringify(vacuous)) problems.push(`the verdicts that can read VACUOUS are ${can.join(",")}, not ${vacuous.join(",")}`);
  return problems;
}

/**
 * The fenced blocks of a markdown text that GREEN pastes: the fences whose opening line is exactly
 * three backticks. A fence that names a language (sql, text) is prose, never a block.
 */
export function blocksOf(md) {
  const out = [];
  let open = null;
  let body = [];
  for (const line of md.split("\n")) {
    if (open === null) {
      const m = /^```(\S*)$/.exec(line);
      if (m) { open = m[1]; body = []; }
    } else if (line === "```") {
      if (open === "") out.push(`${body.join("\n")}\n`);
      open = null;
    } else body.push(line);
  }
  if (open !== null) throw new Error("a fence is never closed");
  return out;
}

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
    if (/\/Users\/ivan\/Documents\b/.test(line)) out.push(`the apply worktree's old place: ${line.trim().slice(0, 80)}`);
    if (/\bset\s+-[a-z]*e/.test(line) || /\bset -o errexit\b/.test(line)) out.push(`a set -e: ${line.trim().slice(0, 80)}`);
  }
  return out;
}

const OWN_PINS = ["SHA0108", "SHAPRE", "SHAPOST"];
const PIN_NAMES = [...OWN_PINS, ...Object.keys(EXTERNAL_PINS), "SHAGATE"];
const PIN_LINE = new RegExp(`^(${PIN_NAMES.join("|")})=(\\S+)$`, "gm");

/** Every `NAME=<value>` pin line in the document's blocks, as [name, value] pairs. */
export const pinLines = (md) => blocksOf(md).flatMap((b) => [...b.matchAll(PIN_LINE)].map((m) => [m[1], m[2]]));

/** Why SHAGATE fails, or [] when it is the sha256 of the gate file's text (null: the file is missing). */
export function gateProblems(gate, fileText) {
  if (!/^[0-9a-f]{64}$/.test(gate)) return [`SHAGATE is not a sha256: ${gate}`];
  if (fileText === null) return [`${GATE_FILE} is missing, so SHAGATE proves nothing`];
  return gate === sha256(fileText) ? [] : [`SHAGATE ${gate} is not the sha256 of ${GATE_FILE}`];
}

/** Every pin the document gives is the file's real sha256 or the given external value. */
export function pinProblems(md, actual, gateText) {
  const problems = [];
  const own = { SHA0108: actual.migration, SHAPRE: actual[PRE], SHAPOST: actual[POST] };
  for (const [name, value] of pinLines(md)) {
    if (name in own && value !== own[name]) problems.push(`${name} pins ${value}, the file is ${own[name]}`);
    if (name in EXTERNAL_PINS && value !== EXTERNAL_PINS[name]) problems.push(`${name} pins ${value}, the document was given ${EXTERNAL_PINS[name]}`);
    if (name === "SHAGATE") problems.push(...gateProblems(value, gateText));
  }
  for (const [file, sha] of [[MIGRATION_PATH, actual.migration], [PRE, actual[PRE]], [POST, actual[POST]]]) {
    const row = md.split("\n").find((l) => l.startsWith("| ") && l.includes(`\`${file}\``) && /sha256 `[0-9a-f]{64}`/.test(l));
    if (!row) problems.push(`the fact table gives no sha256 for ${file}`);
    else if (!row.includes(`sha256 \`${sha}\``)) problems.push(`the fact table's sha256 for ${file} is not ${sha}`);
  }
  const names = new Set(pinLines(md).map(([n]) => n));
  for (const n of PIN_NAMES) if (!names.has(n)) problems.push(`no block pins ${n}`);
  return problems;
}

/** The file each pin stands for. SHAGATE is not here: it feeds R9 proof 1, which is printed and decides nothing. */
export const PIN_FILES = Object.freeze({
  SHA0108: MIGRATION_PATH, SHAPREV: PREV_PATH, SHAPRE: PRE, SHAPOST: POST, SHAVM: "packages/db/scripts/verified-migrate.mjs",
  SHAGUARD: "scripts/assert-production-target.mjs", SHAPTM: "scripts/production-target.mjs",
  SHAREADER: "packages/db/scripts/read-applied-migrations.mjs", SHACJ: "scripts/check-journal.mjs",
});
/** The pins a block assigns, SHAGATE left out. */
export const pinsOf = (block) => [...block.matchAll(PIN_LINE)].map((m) => m[1]).filter((n) => n in PIN_FILES);

/** A PIN THAT IS ASSIGNED IS COMPARED: in exactly one `= "${NAME}" ]` line of the same block, with its own halt. */
export function pinComparedProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  for (const name of pinsOf(block)) {
    const hits = lines.filter((l) => l.startsWith("[ ") && l.includes(`= "\${${name}}" ] || `) && EXPLICIT_HALT.test(l));
    if (hits.length !== 1) problems.push(`${name} is assigned and compared ${hits.length} times, not once`);
  }
  return problems;
}

/** A block that runs the guard or the reader compares it, and the module both import, BEFORE it runs it. */
export function compareFirstProblems(block) {
  const problems = [];
  const at = (s) => block.indexOf(s);
  for (const [run, compares] of [
    ["node scripts/assert-production-target.mjs", ['= "${SHAGUARD}" ]', '= "${SHAPTM}" ]']],
    ["${READER} 2>&1", ['= "${SHAREADER}" ]', '= "${SHAPTM}" ]']],
  ]) {
    if (at(run) < 0) continue;
    for (const c of compares) if (at(c) < 0 || at(c) > at(run)) problems.push(`the block runs ${run} without comparing ${c} first`);
  }
  return problems;
}

/** THE ONLY WRITE IS verified-migrate: it runs once, every psql call opens READ ONLY, and no block holds a SQL writing verb. */
export function onlyWriteProblems(blocks) {
  const problems = [];
  const lines = blocks.flatMap((b) => b.split("\n"));
  const vm = lines.filter((l) => l.includes("verified-migrate.mjs --"));
  if (vm.length !== 1) problems.push(`verified-migrate runs ${vm.length} times, not once`);
  for (const l of lines) {
    if (!/(^|[ (])psql "/.test(l)) continue;
    if (!l.includes('-c "begin read only"')) problems.push(`a psql call that is not READ ONLY: ${l.slice(0, 90)}`);
    if ((l.match(/(^|[ (])psql "/g) ?? []).length !== 1) problems.push(`two psql calls on one line: ${l.slice(0, 90)}`);
  }
  for (const l of lines) {
    const sqlWrite = /\b(GRANT|REVOKE|INSERT INTO|DELETE FROM|TRUNCATE|DROP|ALTER (TABLE|DEFAULT|ROLE|SEQUENCE|POLICY)|CREATE (TABLE|SEQUENCE|POLICY|FUNCTION|INDEX|ROLE))\b/.exec(l.replace(/echo "[^"]*"/g, ""));
    if (sqlWrite) problems.push(`a SQL writing statement in a block: ${sqlWrite[0]}`);
  }
  return problems;
}

// ---- THE WEEKDAY TABLE. Lisbon time. Weekday 1 is Monday, 7 is Sunday (date +%u). ----

export const WEEKDAY_TABLE = Object.freeze([[1, 5, 800, 2100], [6, 6, 800, 1300]]);
export const closedByTable = (d, t) => !WEEKDAY_TABLE.some(([a, b, open, close]) => d >= a && d <= b && t >= open && t < close);
/** Strategy's start windows: Monday to Saturday 21:00 to 22:29 or 00:00 to 06:29, Sunday any hour. */
export const inStartWindow = (d, t) => d === 7 || (t >= 2100 && t <= 2229) || t <= 629;

export const CLOCK_READ = "DTZ=$(TZ=Europe/Lisbon date '+%u%H%M %Z') || { echo \"STOP: the Lisbon clock could not be read. Nothing was applied\"; exit 1; }";
export const CLOCK_ZONE = "echo \"${DTZ}\" | grep -qxE '[1-7][0-2][0-9][0-5][0-9] (WET|WEST)' || { echo \"STOP: the Lisbon clock did not read as a weekday (1 to 7), HHMM and the zone WET or WEST, so the Lisbon zone may not have loaded [${DTZ}]. Nothing was applied\"; exit 1; }";
export const CLOCK_SPLIT = 'DT=$(echo "${DTZ}" | cut -c1-5)';
export const CLOCK_FORMAT = "echo \"${DT}\" | grep -qxE '[1-7][0-2][0-9][0-5][0-9]' || { echo \"STOP: the Lisbon weekday and time did not split out of the clock reading. Nothing was applied\"; exit 1; }";
export const CLOCK_AWK =
  "BEGIN { d = substr(s, 1, 1) + 0; t = substr(s, 2, 4) + 0; if (d == 7) exit 0; if (d >= 1 && d <= 5 && (t < 800 || t >= 2100)) exit 0; if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }";
export const CLOCK_DECIDE = `if awk -v s="\${DT}" '${CLOCK_AWK}'; then CLOCK=closed; else CLOCK=open; fi`;
/** The dispatch blocks decide the same table on `${DOW}${LT}`. */
export const DISPATCH_DECIDE = `if awk -v s="\${DOW}\${LT}" '${CLOCK_AWK}'; then CLOCK=closed; else CLOCK=open; fi`;
export const START_WINDOW_LINE = 'if [ "${DOW}" = 7 ]; then SOPEN=${DAY}0000; SSTART=${NEXT}0629; SEND=${NEXT}0800; elif awk -v t="${LT}" \'BEGIN { t += 0; if (t >= 2100 && t <= 2229) exit 0; exit 1 }\'; then SOPEN=${DAY}2100; SSTART=${DAY}2229; SEND=${NEXT}0800; elif awk -v t="${LT}" \'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }\'; then SOPEN=${PREV}2100; SSTART=${DAY}0629; SEND=${DAY}0800; fi';

/** THE WINDOW'S END (strategy, 2026-10-25): the hour the Lisbon clocks repeat is 01:00 to 01:59 on the last Sunday of October. */
export const WINDOW_END_AWK = "BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }";
export const windowEndLineStart = `if awk -v w="\${WEND}" '${WINDOW_END_AWK}'; then echo "window end:    \${WEND} happens once on the Lisbon clock`;
/** Whether a Lisbon wall time YYYYMMDDHHMM falls in the repeated hour, by the calendar: the last Sunday of October, 01:00 to 01:59. */
export function inRepeatedHour(w) {
  const y = Number(w.slice(0, 4)); const m = Number(w.slice(4, 6)); const d = Number(w.slice(6, 8)); const h = Number(w.slice(8, 10));
  if (m !== 10 || h !== 1) return false;
  const last = new Date(Date.UTC(y, 9, 31)); const lastSunday = 31 - last.getUTCDay();
  return d === lastSunday;
}
export const runWindowEnd = (program, w) => { const r = spawnSync("awk", ["-v", `w=${w}`, program], { encoding: "utf8" }); return r.status === 0 ? "once" : r.status === 1 ? "repeated" : `exit ${r.status}`; };

export const clockProgramOf = (block) => (/^if awk -v s="\$\{(?:DT|DOW\}\$\{LT)\}" '([^']+)'; then CLOCK=closed; else CLOCK=open; fi$/m.exec(block) ?? [])[1] ?? null;
export function runClock(program, reading) {
  const r = spawnSync("awk", ["-v", `s=${reading}`, program], { encoding: "utf8" });
  return r.status === 0 ? "closed" : r.status === 1 ? "open" : `exit ${r.status}`;
}

/** The arm of stage 0 or stage 1, which can pass only in closed hours by the weekday table. */
export function armProblems(block, stage) {
  const problems = [];
  const lines = block.split("\n");
  if (!lines.includes("D2=yes")) problems.push("no D2=yes line");
  if (!lines.includes("D3=no")) problems.push("no D3=no line");
  if ((block.match(/\bD2=/g) ?? []).length !== 1 || /D2=no/.test(block)) problems.push("something sets proof 2 a second time");
  if ((block.match(/\bD3=/g) ?? []).length !== 1 || /D3=yes/.test(block)) problems.push("something can turn proof 3 to yes");
  if (/yesyesyes|\$\{D1\}\$\{D2\}|\$\{D2\}\$\{D3\}/.test(block)) problems.push("a daytime path that opens on the proofs");
  if (/\bOVR\b|override/i.test(block)) problems.push("an override arm");
  if (!lines.includes(CLOCK_READ)) problems.push("the Lisbon weekday, time and zone are not read in one date call, with its halt");
  if (!lines.includes(CLOCK_ZONE)) problems.push("the clock reading is not refused unless its zone is WET or WEST");
  if (!lines.includes(CLOCK_FORMAT)) problems.push("the clock reading is not refused unless it is a weekday and HHMM");
  if (!lines.includes(CLOCK_DECIDE)) problems.push("closed is not decided by the weekday table");
  const at = lines.indexOf(CLOCK_READ);
  const five = [CLOCK_READ, CLOCK_ZONE, CLOCK_SPLIT, CLOCK_FORMAT, CLOCK_DECIDE];
  if (at >= 0 && five.some((l, k) => lines[at + k] !== l) && five.every((l) => lines.includes(l))) problems.push("the clock's five lines are not together and in order");
  if (lines.filter((l) => /CLOCK=closed/.test(l)).length !== 1) problems.push("more than one line can set CLOCK=closed");
  const decision = lines.filter((l) => l.startsWith('if [ "${CLOCK}'));
  const want = stage === 0
    ? /^if \[ "\$\{CLOCK\}" = closed \]; then echo "R9: closed hours by the weekday table\. [^"]*"; else echo "STOP: [^"]*"; exit 1; fi$/
    : /^if \[ "\$\{CLOCK\}\$\{CLINICS\}" = closedinside \]; then echo "R9: closed hours by the weekday table, and every active clinic's own hours lie inside it\. [^"]*"; else echo "STOP: [^"]*"; exit 1; fi$/;
  if (decision.length !== 1 || !want.test(decision[0])) problems.push("the decision is not closed hours or STOP");
  if (stage === 1) {
    if (!block.includes("(opens_at < time '08:00' or closes_at > time '21:00')")) problems.push("stage 1 does not hold the clinics' own rows against the table's widest row");
    if (!/from public\.locations/.test(block)) problems.push("stage 1 does not read the clinics' own rows");
    const arm = block.indexOf("THE CLOCK AND THE CLINICS (R9)");
    if (!(arm > block.indexOf(`-f ${PRE} -c "rollback" 2>&1`))) problems.push("the arm does not follow the pre-check");
    if (!(arm < block.indexOf("node packages/db/scripts/verified-migrate.mjs"))) problems.push("the arm does not precede the apply");
  }
  if (/\b20[0-9]{6}\b/.test(block)) problems.push("a date is written into the block");
  return problems;
}

/** The dispatch blocks' clock: the weekday table on the same reading, a STOP inside clinic hours, the start windows, and the night. */
export function dispatchClockProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  if (!lines.includes(DISPATCH_DECIDE)) problems.push("closed is not decided by the weekday table");
  if (!lines.some((l) => l.startsWith('[ "${CLOCK}" = closed ] || { echo "STOP: Lisbon ${NOWL}, weekday ${DOW}, is inside clinic hours') && EXPLICIT_HALT.test(l))) problems.push("the block does not STOP inside clinic hours");
  if (!lines.includes(START_WINDOW_LINE)) problems.push("the start windows are not strategy's");
  if (!lines.some((l) => l.startsWith('if [ "${SSTART}" = none ]; then echo "STOP: '))) problems.push("the block does not STOP outside the start windows");
  for (const s of ['[ "${SOPEN}" -ge "${WOPEN}" ] || ', '[ "${SSTART}" -le "${WSTART}" ] || ', '[ "${SEND}" -le "${WEND}" ] || ', '[ "${NOWL}" -le "${SSTART}" ] || ']) {
    if (!lines.some((l) => l.startsWith(s) && EXPLICIT_HALT.test(l))) problems.push(`the block lacks ${s.trim()}`);
  }
  if (/\bOVR\b|override\b(?! arm)/i.test(block.replace(/it has no override/g, ""))) problems.push("an override arm");
  if (/\b20[0-9]{6}\b/.test(block)) problems.push("a date is written into the block");
  return problems;
}

/** An explicit halt, as the last thing on a line. */
const EXPLICIT_HALT = /\|\| \{ (RC=\$\?; )?echo "STOP: [^"]+";( echo "\$\{STRAY\}";)? exit (1|\$\{RC\}); \}$/;

/** The sentence every STOP that can fire AFTER stage 1 committed must carry. */
export const WRITE_STANDS = "0108 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1";
const WRITE_STANDS_IF = `If stage 1 ended with its line 0108 APPLIED, then ${WRITE_STANDS}`;
const STOP_TEXT = /echo "STOP: ([^"]+)"/;
export const STATE_UNKNOWN = "Stage 1 recorded that it applied 0108, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report";
/** THE POST-CHECK'S OWN RUN: a run that did not complete. It names the case that is a contradiction, and never says 0108 is applied. */
export const POST_RUN_START = 'psql "${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before=';
export const POST_RUN_SENTENCE = "If psql's lines say a relation does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules";
export const CONTRADICTING_READS = Object.freeze({
  stage2: ['[ "${FAILS}" = 0 ] || ', '[ "${JA}" = "$((J + 1))" ] || ', '[ "${HN}" = 1 ] || '],
  closing: ["grep -qx 'journal rows on production: 106' ", "grep -qE '^[[:space:]]*APPLIED[[:space:]]+0108_pack_instance_consuming_sessions[.]sql$' "],
});
/** Every STOP of a block that runs after the commit says what stands; see 0107's test for the reasoning. */
export function postCommitProblems(block, markerLine, contradicting) {
  const problems = [];
  const lines = block.split("\n");
  const marker = lines.findIndex((l) => l.startsWith(markerLine));
  if (marker < 0) return ["the block never reads stage 1's applied marker"];
  for (const start of contradicting) {
    if (lines.filter((l) => l.startsWith(start) && STOP_TEXT.test(l)).length !== 1) problems.push(`the block has not exactly one STOP for the contradicting read ${start.slice(0, 40)}`);
  }
  lines.forEach((l, i) => {
    const m = STOP_TEXT.exec(l);
    if (!m) return;
    if (l.startsWith(POST_RUN_START)) {
      if (i <= marker) problems.push(`line ${i + 1}: the post-check runs before the block has read the applied marker`);
      else if (!m[1].endsWith(POST_RUN_SENTENCE)) problems.push(`line ${i + 1}: the post-check's own STOP does not say which outcome means what: ${m[1].slice(0, 60)}`);
      else if (m[1].includes("IS APPLIED")) problems.push(`line ${i + 1}: the post-check's own STOP says 0108 IS APPLIED though its read can contradict it`);
      return;
    }
    if (contradicting.some((start) => l.startsWith(start))) {
      if (i <= marker) problems.push(`line ${i + 1}: a contradicting read before the block has read the applied marker`);
      else if (!m[1].includes(STATE_UNKNOWN)) problems.push(`line ${i + 1}: a STOP whose own read can contradict the marker does not say the state is UNKNOWN: ${m[1].slice(0, 60)}`);
      else if (m[1].includes("IS APPLIED")) problems.push(`line ${i + 1}: a STOP says 0108 IS APPLIED while its own read says otherwise`);
      return;
    }
    if (m[1].includes("Treat the state as UNKNOWN")) problems.push(`line ${i + 1}: a STOP calls the state UNKNOWN though its own read contradicts nothing`);
    else if (!m[1].includes(WRITE_STANDS)) problems.push(`line ${i + 1}: a post-commit STOP that does not say the write stands: ${m[1].slice(0, 70)}`);
    else if (i <= marker && !m[1].includes(WRITE_STANDS_IF)) problems.push(`line ${i + 1}: a STOP says 0108 is applied before the block has read the applied marker`);
    else if (i > marker && m[1].includes(WRITE_STANDS_IF)) problems.push(`line ${i + 1}: a STOP is still conditional after the block has read the applied marker`);
  });
  return problems;
}

/** Stage 1's two STOPs after the apply command: the apply's own (uncertain) and the marker's (certain). */
export function stageOnePostApplyProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  const vm = lines.findIndex((l) => l.startsWith("node packages/db/scripts/verified-migrate.mjs"));
  if (vm < 0) return ["stage 1 does not run verified-migrate"];
  if (!/Do not read this as nothing applied: [^"]*Paste nothing else, not stage 1 again/.test(lines[vm])) problems.push("the apply's STOP does not say it may have applied and that nothing else is pasted");
  const after = lines.slice(vm + 1).filter((l) => STOP_TEXT.test(l));
  if (after.length !== 1 || !STOP_TEXT.exec(after[0])[1].includes(WRITE_STANDS)) problems.push("the STOP after a committed apply does not say the write stands and nothing is run again");
  return problems;
}

/** The variables a block holds a commit sha in. */
const SHA_VARS = ["TIP", "REC", "NOW", "HD", "WREC", "S2", "HELD", "START"];
const hexCheckOf = (v) => `echo "\${${v}}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: `;
/** The dispatch blocks hold the document's own sha256, not a commit sha, in DOC; they compare it with DOCSHA. */
const DISPATCH_MARKERS = ["BEFORE YOU START: every check passed", "CLOCK: closed hours by the weekday table, inside the run window"];

/** Two shas are compared only as VARIABLES, each already refused unless it is 40 hex characters; and every block asserts the document. */
export function shaCompareProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  lines.forEach((l, i) => {
    if (/\[ "\$\((git rev-parse|cat \/tmp\/|cut -d' ' -f1 \/tmp\/)/.test(l)) problems.push(`line ${i + 1}: a sha is compared inline, without being read into a variable and checked`);
    for (const m of l.matchAll(/\[ "\$\{(\w+)\}" = "\$\{(\w+)\}" \]/g)) {
      for (const v of [m[1], m[2]]) {
        if (!SHA_VARS.includes(v)) continue;
        const checked = lines.slice(0, i).some((x) => x.startsWith(hexCheckOf(v)) && EXPLICIT_HALT.test(x));
        if (!checked) problems.push(`line ${i + 1}: \${${v}} is compared before it is checked to be 40 hex characters`);
      }
    }
  });
  const dispatch = DISPATCH_MARKERS.some((m) => block.includes(m));
  const asserts = dispatch
    ? lines.some((l) => l.startsWith('[ "${DOC}" = "${DOCSHA}" ] || { echo "STOP: ') && EXPLICIT_HALT.test(l))
    : lines.some((l) => /^shasum -a 256 -c (\$\{DOCPIN\}|docs\/migration-apply-0108\.sha256) \|\| \{ echo "STOP: /.test(l));
  if (!asserts) problems.push("the block does not assert the document");
  return problems;
}

/** The date calls of the dispatch blocks that read no Lisbon wall clock: network time and day arithmetic. Named one by one. */
export const NETWORK_AND_DAY_DATE_LINES = Object.freeze([
  "TL=$(date -u '+%s') || TL=\"\"",
  "TE=\"\"; if printf '%s\\n' \"${TD}\" | grep -qxE '(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT'; then TE=$(LC_ALL=C date -j -u -f '%a, %d %b %Y %H:%M:%S GMT' \"${TD}\" '+%s' 2>/dev/null) || TE=\"\"; fi",
]);
export const DAY_LINE_STARTS = Object.freeze(["NEXT=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' \"${DAY}1200\" '+%Y%m%d') || { echo \"STOP: ", "PREV=$(TZ=Europe/Lisbon date -j -v-1d -f '%Y%m%d%H%M' \"${DAY}1200\" '+%Y%m%d') || { echo \"STOP: "]);

/** Every Lisbon clock read of a block reads the ZONE it read, and the next line refuses any zone but WET or WEST. */
export function dateProblems(block) {
  const problems = [];
  const lines = block.split("\n");
  lines.forEach((l, i) => {
    const calls = (l.match(/\bdate (?=['+-])/g) ?? []).length;
    if (calls === 0) return;
    if (NETWORK_AND_DAY_DATE_LINES.includes(l)) return;
    if (DAY_LINE_STARTS.some((s) => l.startsWith(s)) && EXPLICIT_HALT.test(l)) return;
    if ((l.match(/\bTZ=Europe\/Lisbon date (?=['+-])/g) ?? []).length !== calls) problems.push(`line ${i + 1}: a date call without TZ=Europe/Lisbon`);
    const m = /^(\w+)=\$\(TZ=Europe\/Lisbon date '\+[%A-Za-z ]+ %Z'\) \|\| \{ echo "STOP: /.exec(l);
    if (!m || calls !== 1) { problems.push(`line ${i + 1}: a date call that does not read the zone, alone on its line, into a variable, with its halt`); return; }
    const next = lines[i + 1] ?? "";
    if (!(next.startsWith(`echo "\${${m[1]}}" | grep -qxE '`) && /\(WET\|WEST\)' \|\| \{ echo "STOP: /.test(next) && EXPLICIT_HALT.test(next))) {
      problems.push(`line ${i + 1}: the zone \${${m[1]}} read is not required, on the next line, to be WET or WEST`);
    }
  });
  return problems;
}

/** Every carry is a row the pre-check prints, and no other row's name contains it. */
export function carryProblems(carries, rowNames) {
  const problems = [];
  for (const c of carries) {
    const hits = rowNames.filter((r) => r.includes(c));
    if (!hits.includes(c)) problems.push(`the pre-check prints no row named ${c}`);
    else if (hits.length !== 1) problems.push(`carry ${c} is a substring of ${hits.join(", ")}`);
  }
  return problems;
}

/** The eight carries the post-check takes: [the variable stage 2 holds it in, the pre-check row it reads, the post-check's -v name]. */
export const CARRY_MAP = Object.freeze([
  ["J", "journal_rows_before", "journal_rows_before"], ["PB", "policies_before", "policies_before"], ["PM", "policies_md5", "policies_md5"],
  ["FB", "functions_before", "functions_before"], ["FM", "functions_md5", "functions_md5"], ["S", "secdef_before", "secdef_before"],
  ["RM", "relation_acl_md5", "relation_acl_md5"], ["PI", "probe_instances", "probe_instances"],
]);
export const CARRY_FUNCTION = `carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \\t]+|[ \\t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \\t]+|[ \\t]+$/, "", b); print b; exit } }' /tmp/0108-precheck.out; }`;
export const NUM_VARS = Object.freeze(["J", "PB", "FB", "S", "PI"]);
export const MD5_VARS = Object.freeze(["PM", "FM", "RM"]);
const CARRY_CHECKS = [
  `${CARRY_MAP.map(([v]) => `[ -n "\${${v}}" ]`).join(" && ")} || `,
  `echo "${NUM_VARS.map((v) => `\${${v}}`).join(" ")}" | grep -qxE '[0-9]+( [0-9]+){4}' || `,
  `echo "${MD5_VARS.map((v) => `\${${v}}`).join(" ")}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){2}' || `,
];
export const PROFILE_LINES = Object.freeze(["WVAC=0", "WOK=13", 'if [ "${PI}" = 0 ]; then WVAC=1; WOK=12; fi']);

/** What stage 1 hands the pre-check and verified-migrate, and what stage 2 hands the post-check, read off the text. */
export function argumentProblems(s1, s2) {
  const problems = [];
  const l1 = s1.split("\n");
  const l2 = s2.split("\n");
  if (!l1.some((l) => l.startsWith(`psql "\${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f ${PRE} -c "rollback" 2>&1 | tee /tmp/0108-precheck.new || `))) {
    problems.push("stage 1 does not run the pre-check inside its own begin read only");
  }
  if (!l1.some((l) => l.startsWith(`node packages/db/scripts/verified-migrate.mjs --tag ${TAG} --sha256 \${SHA0108} --expect-pending 1 2>&1 | tee /tmp/0108-apply.out || `))) {
    problems.push(`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0108} --expect-pending 1`);
  }
  for (const [v, row] of CARRY_MAP) if (!l2.includes(`${v}=$(carry ${row})`)) problems.push(`stage 2 does not read \${${v}} from the row ${row}`);
  if (!l2.includes(CARRY_FUNCTION)) problems.push("stage 2's carry() does not match a row by its whole name");
  const want = `psql "\${DATABASE_URL_DIRECT}" -X -P pager=off -v ON_ERROR_STOP=1 ${CARRY_MAP.map(([v, , name]) => `-v ${name}="\${${v}}"`).join(" ")} -c "begin read only" -f ${POST} -c "rollback" 2>&1 | tee /tmp/0108-postcheck.out || `;
  if (!l2.some((l) => l.startsWith(want))) problems.push("stage 2 does not hand the post-check the eight carries, each under its own name, inside begin read only");
  for (const c of CARRY_CHECKS) if (!l2.some((l) => l.startsWith(c) && EXPLICIT_HALT.test(l))) problems.push(`stage 2 lacks the carry check ${c}`);
  const at = (start) => l2.findIndex((l) => l.startsWith(start));
  if (CARRY_CHECKS.some((c) => at(c) > at('psql "${DATABASE_URL_DIRECT}" -X -P pager=off'))) problems.push("a carry check follows the post-check it guards");
  return problems;
}

/** Stage 1 requires 13 OK, 0 VACUOUS, 0 FAIL of the pre-check; stage 2 requires 13 OK and 0 VACUOUS of the post-check, or 12 and 1 when probe_instances is 0, and 0 FAIL. */
export function profileBlockProblems(s1, s2) {
  const problems = [];
  const has = (b, start) => b.split("\n").some((l) => l.startsWith(start) && EXPLICIT_HALT.test(l));
  const count = (word, file) => `${word}=$(grep -cE '\\|[[:space:]]*${{ FAILS: "FAIL", VACS: "VACUOUS", OKS: "OK" }[word]}[[:space:]]*$' /tmp/0108-${file} || true)`;
  for (const w of ["FAILS", "VACS", "OKS"]) {
    if (!s1.split("\n").includes(count(w, "precheck.new"))) problems.push(`stage 1 does not count ${w} in the pre-check transcript`);
    if (!s2.split("\n").includes(count(w, "postcheck.out"))) problems.push(`stage 2 does not count ${w} in the post-check transcript`);
  }
  if (!has(s1, '[ "${FAILS}" = 0 ] || ')) problems.push("stage 1 does not require 0 FAIL");
  if (!has(s1, '[ "${VACS}" = 0 ] || ')) problems.push("stage 1 does not require 0 VACUOUS");
  if (!has(s1, '[ "${OKS}" = 13 ] || ')) problems.push("stage 1 does not require 13 OK");
  const l2 = s2.split("\n");
  const at = l2.indexOf(PROFILE_LINES[0]);
  if (at < 0 || l2[at + 1] !== PROFILE_LINES[1] || l2[at + 2] !== PROFILE_LINES[2]) problems.push("stage 2 does not fix the profile at 13 OK and 0 VACUOUS, or 12 and 1 when probe_instances is 0");
  if ((s2.match(/\bWOK=|\bWVAC=/g) ?? []).length !== 4) problems.push("the expected profile is set somewhere else as well");
  if (!has(s2, '[ "${FAILS}" = 0 ] || ')) problems.push("stage 2 does not require 0 FAIL");
  if (!has(s2, '[ "${VACS}" = "${WVAC}" ] || ')) problems.push("stage 2 does not require the VACUOUS count the profile names");
  if (!has(s2, '[ "${OKS}" = "${WOK}" ] || ')) problems.push("stage 2 does not require the OK count the profile names");
  return problems;
}

/** The five (four) value lines GREEN's dispatch fills, as this document carries them. */
export const PENDING_LINES = Object.freeze({
  HELD: "HELD='PENDING: set at the READY line'",
  DOCSHA: "DOCSHA='PENDING: set at the READY line'",
  WOPEN: "WOPEN='PENDING: set with the run window'",
  WSTART: "WSTART='PENDING: set with the run window'",
  WEND: "WEND='PENDING: set with the run window'",
});
/** The dispatch's copy of a block: the PENDING lines filled, nothing else changed. */
export function fillDispatch(block, v) {
  let out = block;
  for (const [name, line] of Object.entries(PENDING_LINES)) {
    if (out.includes(line)) out = out.replace(line, () => `${name}='${v[name]}'`);
  }
  return out;
}

const migration = read(MIGRATION_PATH);
const pre = read(PRE);
const post = read(POST);
const doc = read(DOC);
const gateText = existsSync(join(ROOT, GATE_FILE)) ? read(GATE_FILE) : null;
const ACTUAL = { migration: sha256(migration), [PRE]: sha256(pre), [POST]: sha256(post) };
const BYS = "BEFORE YOU START: every check passed, and the journal reads 105.";
const STAGE0 = "0108 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED";
const CLOCKCHK = "CLOCK: closed hours by the weekday table, inside the run window the dispatch names";
const STAGE1 = "0108 APPLIED. Paste stage 2 now.";
const STAGE2 = "0108 POST-CHECK PASSED.";
const CLOSING = "CLOSING READ: the journal reads 106";
const MARKERS_IN_ORDER = [BYS, STAGE0, CLOCKCHK, STAGE1, STAGE2, CLOSING];

/** `text` with `from` replaced by `to`; `from` must occur exactly once. */
const swap = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `not exactly once: ${from.slice(0, 80)}`);
  return text.replace(from, () => to);
};

// =====================================================================================
// STATIC
// =====================================================================================

test("the migration stands in its one place, written at its number: its bytes are the pinned sha256, no pending file names it, and the mirror carries the same statements", () => {
  assert.equal(sha256(migration), MIGRATION_SHA);
  assert.deepEqual(statementsOf(read(`supabase/migrations/${TAG}.sql`)), statementsOf(migration));
  const pendingDir = join(ROOT, "packages/db/migrations-pending");
  for (const f of readdirSync(pendingDir).filter((x) => x.endsWith(".sql"))) assert.ok(!readFileSync(join(pendingDir, f), "utf8").includes("pack_instance_consuming_sessions"), f);
  for (const [name, text] of [["migration", migration], ["pre", pre], ["post", post]]) assert.doesNotMatch(text, /[^\x09\x0a\x20-\x7e]/, name);
  const live = JSON.parse(read(JOURNAL));
  const e = live.entries.find((x) => x.tag === TAG);
  const p = live.entries.find((x) => x.tag === PREV_TAG);
  assert.deepEqual([e.idx, e.when, p.idx, p.when], [105, 1788502900000, 104, 1788502800000]);
});

test("the migration keeps every rule of its shape", () => {
  assert.deepEqual(migrationProblems(migration), []);
  assert.deepEqual(migrationProblems(`${migration}\n/* DROP TABLE x; DELETE FROM y; GRANT ALL TO anon; */\n`), []);
});

test("CONTROLS, ONE RULE AT A TIME: each migrationProblems rule refuses an input made for it", () => {
  const add = (s) => `${migration}\n${s}--> statement-breakpoint\n`;
  const n8 = /^8 statements, not 7$/;
  const words = /^a DROP, TRUNCATE, /;
  const cases = [
    ["statement 1", swap(migration, "SET LOCAL lock_timeout = '5s';", "SET LOCAL lock_timeout = '50s';"), [/^statement 1 is not exactly/]],
    ["statement 2", swap(migration, "SET LOCAL statement_timeout = '60s';", "SET LOCAL statement_timeout = '600s';"), [/^statement 2 is not exactly/]],
    ["a later bound", add("SELECT set_config('lock_timeout', '0', true);"), [/^a later statement names a bound$/, n8]],
    ["transaction control", add("COMMIT;"), [/^a statement is transaction control/, n8]],
    ["a second grant", add("GRANT EXECUTE ON FUNCTION public.pack_instance_consuming_sessions(uuid) TO anon;"), [n8, /^not exactly one GRANT$/]],
    ["a grant to anon", swap(migration, "TO authenticated;--> statement-breakpoint", "TO authenticated, anon;--> statement-breakpoint"), [/^statement 6 is not exactly GRANT/]],
    ["patient left out of the revoke", swap(migration, "FROM PUBLIC, anon, authenticated, patient, service_role;", "FROM PUBLIC, anon, authenticated, service_role;"), [/^statement 5 is not exactly REVOKE/]],
    ["the owner pin gone", swap(migration, "OWNER TO postgres;", "OWNER TO authenticated;"), [/^statement 4 is not exactly ALTER FUNCTION/]],
    ["a policy", add('ALTER POLICY "patients_select" ON public.patients USING (true);'), [n8, words]],
    ["a drop", add("DROP FUNCTION public.viewer_visible_patient_ids();"), [n8, words]],
    ["a row written", add("DELETE FROM public.appointments;"), [n8, words]],
    ["OR REPLACE", swap(migration, "CREATE FUNCTION public.pack_instance_consuming_sessions", "CREATE OR REPLACE FUNCTION public.pack_instance_consuming_sessions"), [/^statement 3 is not the CREATE FUNCTION/, words]],
    ["VOLATILE", swap(migration, "  STABLE\n", "  VOLATILE\n"), [/^statement 3 is not the CREATE FUNCTION/, words]],
    ["SECURITY INVOKER", swap(migration, "  SECURITY DEFINER\n", "  SECURITY INVOKER\n"), [/^statement 3 is not the CREATE FUNCTION/, words, /^not exactly one SECURITY DEFINER$/]],
    ["the search_path gone", swap(migration, "  SET search_path = public\n", ""), [/^statement 3 is not the CREATE FUNCTION/]],
    ["the cancelled filter gone", swap(migration, "     AND a.status <> 'cancelled'\n", ""), [/^the body lacks the term AND a\.status <> 'cancelled'$/]],
    ["the staff role gone", swap(migration, "     AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception', 'therapist')\n", ""), [/^the body lacks the term AND \(SELECT public\.jwt_role\(\)\) IN \('owner'/]],
    ["the care team term gone", swap(migration, "                OR p.id = ANY (coalesce((SELECT public.viewer_care_team_patient_ids_at_my_clinics()), '{}'::uuid[]))\n", ""), [/^the body lacks the term OR p\.id = ANY \(coalesce\(\(SELECT public\.viewer_care_team/]],
    ["the order gone", swap(migration, "   ORDER BY a.starts_at, a.id;\n", ";\n"), [/^the body lacks the term ORDER BY/]],
  ];
  for (const [name, input, want] of cases) {
    assert.notEqual(input, migration, `${name}: the input did not change the file`);
    const got = migrationProblems(input);
    assert.equal(got.length, want.length, `${name}: expected ${want.length} problem(s), got ${JSON.stringify(got)}`);
    for (const re of want) assert.ok(got.some((g) => re.test(g)), `${name}: no problem matching ${re}: ${JSON.stringify(got)}`);
  }
});

test("the pre-check and the post-check compare the journal with the pinned sha256s in code, and decide their journal verdicts as reviewed", () => {
  assert.deepEqual(journalPinProblems(pre, "pre"), []);
  assert.deepEqual(journalPinProblems(post, "post"), []);
  const zeros = `00000000${MIGRATION_SHA.slice(8)}`;
  assert.deepEqual(journalPinProblems(pre.replace(`    USING '${MIGRATION_SHA}',`, `    USING '${zeros}',`), "pre"), ["the journal count does not take the pinned sha256s of 0108 and 0107"]);
  assert.equal(journalPinProblems(swap(pre, "AND journal_rows = 105 THEN", "AND journal_rows >= 105 THEN"), "pre").length, 1);
  assert.equal(journalPinProblems(swap(post, "AND journal_rows = :journal_rows_before + 1 THEN", "AND journal_rows > :journal_rows_before THEN"), "post").length, 1);
  assert.equal(journalPinProblems(swap(post, "AND newest_when = '1788502900000' THEN", "THEN"), "post").length, 1);
  // Both files name the migration by its promoted path and its sha256.
  for (const f of [pre, post]) {
    assert.ok(f.replace(/\n-- */g, "").includes("packages/db/migrations/0108_pack_instance_consuming_sessions.sql"));
    assert.ok(f.includes(MIGRATION_SHA));
  }
  // The post-check pins what this migration creates: the signature, the result, the flags and the body's md5.
  for (const term of ["pack_instance_consuming_sessions(p_pack_instance_id uuid) returns TABLE(appointment_id uuid, starts_at timestamp with time zone)", "DEFINER/s/plpgsql/set/search_path=public/postgres ", "public.pack_instance_consuming_sessions(v_inst.id)"]) assert.ok(post.includes(term), term);
});

test("the check files write nothing and control no transaction of their own; each runs inside its block's begin read only", () => {
  assert.deepEqual(writeProblems(pre), []);
  assert.deepEqual(writeProblems(post), []);
  assert.deepEqual(aclDefaultProblems(pre), []);
  for (const [name, sql] of [["pre", pre], ["post", post]]) {
    assert.doesNotMatch(codeOf(sql), /\b(SET|RESET)\s+(LOCAL\s+|SESSION\s+)?(ROLE|SESSION\s+AUTHORIZATION)\b/i, name);
    assert.doesNotMatch(codeOf(sql), /^\s*(COMMIT|ROLLBACK|START\s+TRANSACTION|BEGIN\s*;)/im, name);
  }
  assert.match(blockWith(doc, STAGE1), /-c "begin read only" -f scripts\/db\/precheck-0108-pack-instance-consuming-sessions\.sql -c "rollback"/);
  assert.match(blockWith(doc, STAGE2), /-c "begin read only" -f scripts\/db\/postcheck-0108-pack-instance-consuming-sessions\.sql -c "rollback"/);
  // CONTROLS
  assert.notDeepEqual(writeProblems(`${pre}\nDELETE FROM public.patients;\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nBEGIN READ WRITE;\n`.replace("BEGIN", "START TRANSACTION;\nCOMMIT")), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET ROLE authenticated;\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET LOCAL row_security = on;\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET LOCAL default_transaction_read_only = off;\n`), []);
  assert.notDeepEqual(writeProblems(`${pre}\nSELECT 'ALTER POLICY p ON t WITH CHECK (true)';\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nCREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'select 1';\n`), []);
  assert.notDeepEqual(aclDefaultProblems(pre.replace(`THEN 's'::"char"`, `THEN 'S'::"char"`)), []);
});

test("THE VERDICT PROFILE: 13 verdicts, 7 more carries and 3 infos before; 13 verdicts after, of which only verdict 6 can read VACUOUS; and the blocks require exactly those", () => {
  assert.deepEqual(profileProblems(pre, 13, []), []);
  assert.deepEqual(profileProblems(post, 13, [6]), []);
  const preRows = verdictRowsOf(pre);
  const postRows = verdictRowsOf(post);
  const tally = (rows) => rows.map(kindOf).reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {});
  assert.deepEqual(tally(preRows), { verdict: 13, carry: 7, info: 3 });
  assert.deepEqual(tally(postRows), { verdict: 13 });
  assert.deepEqual(preRows.filter((r) => kindOf(r) === "verdict").map((r) => r.n), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, "journal_rows_before"]);
  assert.deepEqual(postRows.map((r) => r.n), Array.from({ length: 13 }, (_, i) => i));
  for (const r of preRows.filter((x) => kindOf(x) === "info")) assert.deepEqual([...r.results], ["INFO"], r.name);
  // The SUMMARY row of the post-check names the profile the carry allows.
  assert.ok(post.includes("CASE WHEN (:'probe_instances')::int = 0 THEN '12 OK / 1 VACUOUS / 0 FAIL' ELSE '13 OK / 0 VACUOUS / 0 FAIL' END, 'SUMMARY'"));
  // RED ARMS
  const v0 = "CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j";
  assert.ok(post.includes(v0));
  assert.deepEqual(profileProblems(swap(post, v0, "CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'VACUOUS' END AS verdict FROM j"), 13, [6]), ["verdict 0 cannot read FAIL", "verdict 0 can print OK before it has tested for VACUOUS", "the verdicts that can read VACUOUS are 0,6, not 6"]);
  assert.deepEqual(profileProblems(swap(post, v0, "CASE WHEN current_setting('transaction_read_only') <> 'on' THEN 'FAIL' ELSE 'OK' END AS verdict FROM j"), 13, [6]), ["verdict 0 prints OK as its ELSE"]);
  const v6 = "CASE WHEN probe_state = 'read' AND probe_n = 0 THEN 'VACUOUS'";
  assert.ok(post.includes(v6));
  assert.deepEqual(profileProblems(swap(post, v6, "CASE WHEN probe_state = 'read' AND probe_n = 0 THEN 'OK'"), 13, [6]), ["the verdicts that can read VACUOUS are , not 6"]);
  assert.deepEqual(profileProblems(pre, 12, []), ["13 verdicts, not 12"]);
  assert.deepEqual(profileProblems("SELECT 1;", 13, []), ["the file has no final SELECT to read"]);
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  assert.deepEqual(profileBlockProblems(s1, s2), []);
  assert.deepEqual(profileBlockProblems(swap(s1, '[ "${OKS}" = 13 ] || ', '[ "${OKS}" = 12 ] || '), s2), ["stage 1 does not require 13 OK"]);
  const vacLine = s1.split("\n").find((l) => l.startsWith('[ "${VACS}" = 0 ] || '));
  assert.deepEqual(profileBlockProblems(s1.replace(`${vacLine}\n`, ""), s2), ["stage 1 does not require 0 VACUOUS"]);
  const bad = "stage 2 does not fix the profile at 13 OK and 0 VACUOUS, or 12 and 1 when probe_instances is 0";
  assert.deepEqual(profileBlockProblems(s1, swap(s2, "\nWOK=13\n", "\nWOK=12\n")), [bad]);
  assert.deepEqual(profileBlockProblems(s1, swap(s2, "\nWVAC=0\n", "\nWVAC=2\n")), [bad]);
  assert.deepEqual(profileBlockProblems(s1, swap(s2, 'if [ "${PI}" = 0 ]; then WVAC=1; WOK=12; fi', 'if [ "${PI}" = 0 ]; then WVAC=1; WOK=13; fi')), [bad]);
  assert.deepEqual(profileBlockProblems(s1, swap(s2, '[ "${VACS}" = "${WVAC}" ] || ', '[ "${VACS}" -le "${WVAC}" ] || ')), ["stage 2 does not require the VACUOUS count the profile names"]);
  // The last line of stage 2 names the counted profile, never a typed one.
  assert.match(s2, /^echo "0108 POST-CHECK PASSED\. 13\/13 pre-check OK, post-check \$\{OKS\} OK \/ \$\{VACS\} VACUOUS \/ 0 FAIL, journal \$\{J\} to \$\{JA\}; /m);
});

test("blocksOf takes only the plain fences, and blockWith finds exactly one block", () => {
  assert.equal(blocksOf(doc).length, 6);
  const fence = (body, lang = "") => "```" + lang + "\n" + body + "\n```\n";
  assert.deepEqual(blocksOf(fence("a MARK") + fence("SELECT 1;", "sql") + fence("b")), ["a MARK\n", "b\n"]);
  assert.equal(blockWith(fence("a MARK") + fence("b"), "MARK"), "a MARK\n");
  assert.throws(() => blockWith(fence("a MARK") + fence("b MARK"), "MARK"), /found 2/);
  assert.throws(() => blockWith(fence("a") + fence("b MARK", "text"), "MARK"), /found 0/);
  assert.throws(() => blocksOf("```\nnever closed\n"), /never closed/);
});

test("every pin is the real file or the given value, and SHAGATE is the gate file's", () => {
  assert.deepEqual(pinProblems(doc, ACTUAL, gateText), []);
  for (const [name, file] of Object.entries(PIN_FILES)) {
    if (name in EXTERNAL_PINS) assert.equal(sha256(read(file)), EXTERNAL_PINS[name], `${name}: ${file}`);
  }
  assert.notDeepEqual(pinProblems(doc.replace(`SHAPRE=${ACTUAL[PRE]}`, `SHAPRE=${"0".repeat(64)}`), ACTUAL, gateText), []);
  assert.notDeepEqual(pinProblems(doc, { ...ACTUAL, [POST]: "f".repeat(64) }, gateText), []);
  assert.notDeepEqual(pinProblems(doc.replace(/^SHAGATE=.*$/m, "SHAGATE=TODO"), ACTUAL, gateText), []);
  assert.notDeepEqual(pinProblems(doc.replace(/^SHA0108=.*$/m, `SHA0108=${"a".repeat(64)}`), ACTUAL, gateText), []);
  const gate = pinLines(doc).find(([n]) => n === "SHAGATE")[1];
  assert.deepEqual(gateProblems(gate, gateText), []);
  assert.deepEqual(gateProblems(gate, null), [`${GATE_FILE} is missing, so SHAGATE proves nothing`]);
});

test("THE SIDECAR pins the document, byte for byte; the document is ASCII; and its banner carries no mark that ends in -PENDING", () => {
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  const bad = doc.split("\n").map((l, i) => (/[^\x09\x20-\x7e]/.test(l) ? `${i + 1}: ${l.slice(0, 60)}` : null)).filter(Boolean);
  assert.deepEqual(bad, []);
  const banner = doc.split("\n")[2];
  assert.ok(banner.startsWith("**NOT READY."), banner.slice(0, 40));
  assert.doesNotMatch(banner, /[A-Z]-PENDING/);
});

test("THE HALT RULE stands in the document word for word: 0094's rule with the number changed, and no exception", () => {
  const rule = [
    "THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any",
    "STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and",
    "nothing continues to the next block. After stage 1 has committed, a post-commit STOP",
    "still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the",
    "owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0",
    'with the line "0108 APPLIED. Paste stage 2 now." No block, and no dispatch',
    "step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:",
    "no closing read and no journal read. Whether and when a halted sitting starts again",
    "is the lead's call, never the runner's.",
  ].join("\n");
  assert.ok(doc.includes(`${rule}\n\n`), "the halt rule is not in the document word for word");
  assert.ok(!doc.includes("The one exception: a STOP line that begins"), "0108's exception came along");
  const r0094 = read("docs/migration-apply-0094.md");
  assert.ok(r0094.includes(rule.replaceAll("0108", "0094")), "the rule is no longer 0094's with the number changed");
});

test("THE ONLY WRITE IS verified-migrate, once; every psql call is READ ONLY; and no statement that would remove the tables stands in any block", () => {
  const blocks = blocksOf(doc);
  assert.deepEqual(onlyWriteProblems(blocks), []);
  // Six psql calls: the pre-check and the clinics' rows; the post-check, the journal count, the count by hash and the last three rows.
  assert.equal(blocks.flatMap((b) => b.split("\n")).filter((l) => /(^|[ (])psql "/.test(l)).length, 6);
  assert.ok(doc.includes("## Rollback") && doc.includes("GREEN never runs that statement from this document"));
  for (const b of blocks) for (const mark of ["ALTER POLICY", "CREATE FUNCTION", "DROP FUNCTION", "ALTER FUNCTION"]) assert.ok(!b.includes(mark), `${mark} stands in a block GREEN pastes`);
  for (const b of blocks) for (const mark of ["DROP TABLE", "DROP POLICY", "DROP INDEX", "DROP CONSTRAINT"]) assert.ok(!b.includes(mark), `${mark} stands in a block GREEN pastes`);
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  assert.deepEqual(onlyWriteProblems([s1, s1]), ["verified-migrate runs 2 times, not once"]);
  assert.match(onlyWriteProblems([s1, swap(s2, `-c "begin read only" -f ${POST} -c "rollback"`, `-f ${POST}`)])[0], /^a psql call that is not READ ONLY: psql /);
  assert.deepEqual(onlyWriteProblems([s1, `${s2}\npsql "\${DATABASE_URL_DIRECT}" -X -c "begin read only" -c "DROP TABLE public.patient_pack_instances"\n`]), ["a SQL writing statement in a block: DROP"]);
  assert.deepEqual(onlyWriteProblems([s1, `${s2}\npsql "\${DATABASE_URL_DIRECT}" -X -c "begin read only" -c "ALTER POLICY p ON t WITH CHECK (true)"\n`]), ["a SQL writing statement in a block: ALTER POLICY"]);
});

test("THE ARGUMENTS: what stage 1 hands the pre-check and verified-migrate, and what stage 2 hands the post-check, read off the text", () => {
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  assert.deepEqual(argumentProblems(s1, s2), []);
  assert.deepEqual([...NUM_VARS, ...MD5_VARS].sort(), CARRY_MAP.map(([v]) => v).sort());
  for (const [, , name] of CARRY_MAP) assert.ok(post.includes(`\\if :{?${name}}\n\\else\n  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v ${name} is missing`) && post.includes("This file refuses to guess."), name);
  assert.match(argumentProblems(s1, swap(s2, "PI=$(carry probe_instances)", "PI=$(carry policies_before)"))[0], /^stage 2 does not read \$\{PI\} from the row probe_instances$/);
  assert.ok(argumentProblems(s1, swap(s2, '-v policies_md5="${PM}" -v functions_before="${FB}" -v functions_md5="${FM}"', '-v policies_md5="${FM}" -v functions_before="${FB}" -v functions_md5="${PM}"')).length >= 1);
  assert.deepEqual(argumentProblems(s1, swap(s2, "grep -qxE '[0-9]+( [0-9]+){4}'", "grep -qxE '.*'")), [`stage 2 lacks the carry check ${CARRY_CHECKS[1]}`]);
  assert.deepEqual(argumentProblems(s1, swap(s2, "if (a == k) {", "if (index(a, k) > 0) {")), ["stage 2's carry() does not match a row by its whole name"]);
  assert.deepEqual(argumentProblems(swap(s1, "--expect-pending 1 ", "--expect-pending 2 "), s2), [`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0108} --expect-pending 1`]);
  assert.deepEqual(argumentProblems(swap(s1, `-c "begin read only" -f ${PRE}`, `-f ${PRE}`), s2), ["stage 1 does not run the pre-check inside its own begin read only"]);
  const adLine = s2.split("\n").find((l) => l.startsWith(CARRY_CHECKS[2]));
  assert.deepEqual(argumentProblems(s1, `${s2.replace(`${adLine}\n`, "")}${adLine}\n`), ["a carry check follows the post-check it guards"]);
  assert.ok(s1.split("\n").some((l) => l.startsWith("W107=$(node -e ") && l.includes(`p.tag==='${PREV_TAG}'?String(p.when):'none'`)));
});

test("THE WEEKDAY TABLE: the arm stands in stage 0 and stage 1, with no override and no date, and passes only in closed hours; the dispatch blocks decide the same table and strategy's start windows", () => {
  const s0 = blockWith(doc, STAGE0);
  const s1 = blockWith(doc, STAGE1);
  assert.deepEqual(armProblems(s0, 0), []);
  assert.deepEqual(armProblems(s1, 1), []);
  for (const m of [BYS, CLOCKCHK]) assert.deepEqual(dispatchClockProblems(blockWith(doc, m)), [], m);
  for (const m of [BYS, CLOCKCHK]) {
    const lines = blockWith(doc, m).split("\n");
    const at = lines.findIndex((l) => l.startsWith(windowEndLineStart));
    assert.ok(at > 0, `${m}: no window-end line`);
    assert.equal(lines.filter((l) => l.includes(WINDOW_END_AWK)).length, 1, m);
    assert.ok(lines[at - 1].startsWith('[ "${WSTART}" -lt "${WEND}" ] || '), `${m}: the window-end line does not follow the order check`);
    assert.match(lines[at], /; else echo "STOP: the run window's end \$\{WEND\} falls in the hour the Lisbon clocks repeat [^"]*"; exit 1; fi$/, m);
  }
  for (const m of [STAGE0, STAGE1, STAGE2, CLOSING]) assert.ok(!blockWith(doc, m).includes(WINDOW_END_AWK), m);
  const proofs = (b) => b.split("\n").filter((l) => /^D1=no$|^D2=yes$|^D3=no$|^if .*then D1=yes; fi$|^echo "R9 proof [123]/.test(l));
  assert.equal(proofs(s0).length, 7);
  assert.deepEqual(proofs(s1).map((l) => l.replace("${REC}", "${TIP}")), proofs(s0));
  for (const b of blocksOf(doc)) {
    assert.doesNotMatch(b, /\b20[0-9]{6}\b/, "a date in a block");
    assert.doesNotMatch(b.replace(/it has no override/g, ""), /\bOVR\b|override/i, "an override in a block");
  }
  const one = (b, stage, from, to) => armProblems(swap(b, from, to), stage);
  assert.deepEqual(one(s0, 0, "D3=no\n", "D3=no\nif true; then D3=yes; fi\n"), ["something can turn proof 3 to yes"]);
  assert.deepEqual(one(s0, 0, 'if [ "${CLOCK}" = closed ]; then', 'if [ "${CLOCK}" = closed ] || [ "${D1}${D2}${D3}" = yesyesyes ]; then'), ["a daytime path that opens on the proofs", "the decision is not closed hours or STOP"]);
  assert.deepEqual(one(s1, 1, 'if [ "${CLOCK}${CLINICS}" = closedinside ]; then', 'if [ "${CLOCK}" = closed ]; then'), ["the decision is not closed hours or STOP"]);
  for (const [from, to] of [["t >= 2100", "t >= 2000"], ["t >= 1300", "t >= 1200"], ["d == 7", "d >= 6"]]) {
    assert.deepEqual(one(s0, 0, from, to), ["closed is not decided by the weekday table"], from);
  }
  assert.deepEqual(one(s0, 0, "[0-5][0-9] (WET|WEST)' ||", "[0-5][0-9] (WET|WEST|UTC)' ||"), ["the clock reading is not refused unless its zone is WET or WEST"]);
  assert.deepEqual(armProblems(`${s0}\necho 20261019\n`, 0), ["a date is written into the block"]);
  const b = blockWith(doc, BYS);
  assert.deepEqual(dispatchClockProblems(swap(b, "t >= 2100 && t <= 2229", "t >= 2000 && t <= 2229")), ["the start windows are not strategy's"]);
  assert.deepEqual(dispatchClockProblems(swap(b, "if (d == 6 && (t < 800 || t >= 1300)) exit 0; exit 1 }'; then CLOCK=closed", "if (d == 6) exit 0; exit 1 }'; then CLOCK=closed")), ["closed is not decided by the weekday table"]);
  const nightLine = b.split("\n").find((l) => l.startsWith('[ "${SEND}" -le "${WEND}" ] || '));
  assert.deepEqual(dispatchClockProblems(b.replace(`${nightLine}\n`, "")), ['the block lacks [ "${SEND}" -le "${WEND}" ] ||']);
});

/** The six minutes the ruling names, then one green arm: [name, weekday, HHMM, closed]. */
export const RULED_POINTS = Object.freeze([
  ["Friday 20:59", 5, "2059", false], ["Friday 21:00", 5, "2100", true], ["Saturday 12:59", 6, "1259", false],
  ["Saturday 13:00", 6, "1300", true], ["Sunday 15:00", 7, "1500", true], ["Monday 07:59", 1, "0759", true],
  ["Tuesday 21:30 (the green arm)", 2, "2130", true],
]);

test("THE WEEKDAY TABLE, the arm's own program in every block that reads it: the six ruled minutes, and every boundary of every weekday", () => {
  for (const [name, d, hhmm, closed] of RULED_POINTS) assert.equal(closedByTable(d, Number(hhmm)), closed, name);
  for (const marker of [STAGE0, STAGE1, BYS, CLOCKCHK]) {
    const program = clockProgramOf(blockWith(doc, marker));
    assert.equal(program, CLOCK_AWK, marker);
    for (let d = 1; d <= 7; d += 1) {
      for (const hhmm of ["0000", "0629", "0630", "0759", "0800", "1259", "1300", "2059", "2100", "2229", "2230", "2359"]) {
        assert.equal(runClock(program, `${d}${hhmm}`), closedByTable(d, Number(hhmm)) ? "closed" : "open", `${marker.slice(0, 20)} weekday ${d} at ${hhmm}`);
      }
    }
  }
  assert.equal(runClock(CLOCK_AWK.replace("t >= 2100", "t > 2100"), "52100"), "open");
  assert.equal(runClock(CLOCK_AWK, "81200"), "open");
});

test("THE WINDOW'S END, its awk program against the calendar: every hour of the last days of October, ten years, and the March gap is not tested", () => {
  for (let y = 2026; y <= 2035; y += 1) {
    for (let d = 20; d <= 31; d += 1) {
      for (const hhmm of ["0000", "0059", "0100", "0130", "0159", "0200", "0230", "2359"]) {
        const w = `${y}10${String(d).padStart(2, "0")}${hhmm}`;
        assert.equal(runWindowEnd(WINDOW_END_AWK, w), inRepeatedHour(w) ? "repeated" : "once", w);
      }
    }
  }
  assert.equal(runWindowEnd(WINDOW_END_AWK, "202610250130"), "repeated");
  assert.equal(runWindowEnd(WINDOW_END_AWK, "202710310100"), "repeated");
  assert.equal(runWindowEnd(WINDOW_END_AWK, "202610250200"), "once");
  assert.equal(runWindowEnd(WINDOW_END_AWK, "202603290130"), "once");
  assert.equal(runWindowEnd(WINDOW_END_AWK, "209912310000"), "once");
  assert.equal(runWindowEnd(WINDOW_END_AWK.replace("z == 1", "z == 2"), "202610250130"), "once");
});

test("EVERY date CALL THAT READS THE WALL CLOCK READS LISBON TIME AND ITS ZONE; the network-time and day-arithmetic calls are named one by one", () => {
  let calls = 0;
  for (const b of blocksOf(doc)) {
    assert.deepEqual(dateProblems(b), [], b.slice(0, 80));
    calls += (b.match(/\bdate (?=['+-])/g) ?? []).length;
  }
  // Five in each dispatch block (the clock, network time twice, the next and the previous day), one in stage 0,
  // three in stage 1, one each in stage 2 and the closing read. The window-end test reads no clock: it is awk on the typed value.
  assert.equal(calls, 16);
  const s1 = blockWith(doc, STAGE1);
  const noTz = s1.replaceAll("NOWZ=$(TZ=Europe/Lisbon date ", "NOWZ=$(date ");
  assert.equal(dateProblems(noTz).length, 4);
  const b = blockWith(doc, BYS);
  assert.equal(dateProblems(swap(b, "NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z')", "NOW=$(date '+%Y%m%d%H%M %u %Z')")).length, 2);
  assert.equal(dateProblems(swap(b, "grep -qxE '[0-9]{12} [1-7] (WET|WEST)' ||", "grep -qxE '[0-9]{12} [1-7] [A-Z]+' ||")).length, 1);
  assert.equal(dateProblems(swap(b, "NEXT=$(TZ=Europe/Lisbon date -j", "NEXT=$(date -j")).length, 2);
});

test("A POST-COMMIT STOP SAYS WHAT STANDS: stage 2 and the closing read; UNKNOWN on the five whose own read contradicts the marker", () => {
  const s1 = blockWith(doc, STAGE1);
  const s2 = blockWith(doc, STAGE2);
  const cl = blockWith(doc, CLOSING);
  const M2 = '[ -n "$(find /tmp/0108-applied.ok -mmin -60 2>/dev/null)" ]';
  const M3 = "test -f /tmp/0108-applied.ok";
  assert.deepEqual(postCommitProblems(s2, M2, CONTRADICTING_READS.stage2), []);
  assert.deepEqual(postCommitProblems(cl, M3, CONTRADICTING_READS.closing), []);
  assert.deepEqual(stageOnePostApplyProblems(s1), []);
  assert.equal(s2.split(STATE_UNKNOWN).length - 1, 3);
  assert.equal(cl.split(STATE_UNKNOWN).length - 1, 2);
  for (const b of [blockWith(doc, STAGE0), s1, blockWith(doc, BYS), blockWith(doc, CLOCKCHK)]) assert.ok(!b.includes("Treat the state as UNKNOWN"));
  const postLine = s2.split("\n").find((l) => l.startsWith(POST_RUN_START));
  assert.ok(postLine.includes(`echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. ${POST_RUN_SENTENCE}"; exit 1; }`));
  assert.match(postCommitProblems(s2.replace(postLine, () => postLine.replace(POST_RUN_SENTENCE, () => `${WRITE_STANDS}; the lead rules`)), M2, CONTRADICTING_READS.stage2)[0], /the post-check's own STOP does not say which outcome means what/);
  // RED ARMS
  const bare = swap(s2, `STOP: a count carry is not a number. ${WRITE_STANDS}`, "STOP: a count carry is not a number");
  assert.match(postCommitProblems(bare, M2, CONTRADICTING_READS.stage2)[0], /a post-commit STOP that does not say the write stands/);
  assert.match(postCommitProblems(swap(cl, `STOP: the apply worktree is not there. If stage 1 ended with its line 0108 APPLIED, then ${WRITE_STANDS}`, `STOP: the apply worktree is not there. ${WRITE_STANDS}`), M3, CONTRADICTING_READS.closing)[0], /says 0108 is applied before the block has read the applied marker/);
  for (const [b, marker, set] of [[s2, M2, CONTRADICTING_READS.stage2], [cl, M3, CONTRADICTING_READS.closing]]) {
    for (const start of set) {
      const line = b.split("\n").find((l) => l.startsWith(start));
      assert.ok(line && line.includes(STATE_UNKNOWN), start);
      const flat = line.replace(/Stage 1 recorded that it applied 0108[^"]*/, () => `${WRITE_STANDS}; the lead rules`);
      const flatProblems = postCommitProblems(b.replace(line, () => flat), marker, set);
      assert.equal(flatProblems.length, 1, start);
      assert.match(flatProblems[0], /does not say the state is UNKNOWN/);
    }
  }
  assert.deepEqual(stageOnePostApplyProblems(swap(s1, "Do not read this as nothing applied: ", "")), ["the apply's STOP does not say it may have applied and that nothing else is pasted"]);
});

test("TWO SHAS ARE COMPARED ONLY AS CHECKED VARIABLES, and every block asserts the document", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(shaCompareProblems(b), [], b.slice(0, 80));
  const cl = blockWith(doc, CLOSING);
  const rm = (b, start) => { const line = b.split("\n").find((l) => l.startsWith(start)); assert.ok(line, start); return b.replace(`${line}\n`, ""); };
  assert.match(shaCompareProblems(`${cl}\n[ "$(git rev-parse HEAD)" = "\${REC}" ] || { echo "STOP: x"; exit 1; }`).at(-1), /a sha is compared inline/);
  assert.equal(shaCompareProblems(rm(cl, 'echo "${REC}" | grep -qxE')).filter((x) => x.includes("${REC} is compared before")).length, 4);
  const b = blockWith(doc, BYS);
  assert.match(shaCompareProblems(rm(b, 'echo "${HELD}" | grep -qxE'))[0], /\$\{HELD\} is compared before it is checked/);
  assert.deepEqual(shaCompareProblems(rm(b, '[ "${DOC}" = "${DOCSHA}" ] ||')), ["the block does not assert the document"]);
  assert.deepEqual(shaCompareProblems(rm(cl, "shasum -a 256 -c docs/migration-apply-0108.sha256")), ["the block does not assert the document"]);
  const c = blockWith(doc, CLOCKCHK);
  assert.match(shaCompareProblems(rm(c, 'echo "${START}" | grep -qxE'))[0], /\$\{START\} is compared before it is checked/);
});

test("THE DISPATCH BLOCKS carry exactly their PENDING value lines, and the dispatch's filled copy differs from them in those lines alone", () => {
  const b = blockWith(doc, BYS);
  const c = blockWith(doc, CLOCKCHK);
  const pendingIn = (x) => x.split("\n").filter((l) => /PENDING/.test(l) && /^\w+='PENDING/.test(l));
  assert.deepEqual(pendingIn(b), Object.values(PENDING_LINES));
  assert.deepEqual(pendingIn(c), [PENDING_LINES.DOCSHA, PENDING_LINES.WOPEN, PENDING_LINES.WSTART, PENDING_LINES.WEND]);
  for (const x of blocksOf(doc).filter((y) => y !== b && y !== c)) assert.ok(!/PENDING/.test(x), "a stage block carries PENDING");
  const v = { HELD: "a".repeat(40), DOCSHA: "b".repeat(64), WOPEN: "202610190000", WSTART: "202610192229", WEND: "202610200800" };
  for (const x of [b, c]) {
    const filled = fillDispatch(x, v);
    const diff = x.split("\n").filter((l, i) => l !== filled.split("\n")[i]);
    assert.deepEqual(diff, pendingIn(x));
    assert.ok(!/PENDING/.test(filled.split("\n").filter((l) => /^\w+='/.test(l)).join("\n")));
  }
});

test("every block that runs the guard or the reader compares it, and its module, first", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(compareFirstProblems(b), []);
  assert.equal(blocksOf(doc).filter((b) => b.includes("node scripts/assert-production-target.mjs")).length, 2);
  assert.equal(blocksOf(doc).filter((b) => b.includes("${READER} 2>&1")).length, 2);
  const s1 = blockWith(doc, STAGE1);
  const cmp = s1.split("\n").find((l) => l.includes('= "${SHAPTM}" ]'));
  assert.notDeepEqual(compareFirstProblems(`${s1.replace(`${cmp}\n`, "")}\n${cmp}\n`), []);
});

test("every carry stage 2 reads is a row the pre-check prints, and every -v the post-check requires is passed", () => {
  const carries = [...blockWith(doc, STAGE2).matchAll(/\$\(carry ([a-z0-9_]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(carries, CARRY_MAP.map(([, row]) => row));
  const rowNames = verdictRowsOf(pre).map((r) => r.name);
  assert.equal(rowNames.length, 23);
  assert.deepEqual(carryProblems(carries, rowNames), []);
  for (const banner of [...pre.matchAll(/^\\echo '([^']*)'$/gm)].map((m) => m[1])) for (const c of carries) assert.ok(!banner.includes(c), `${c} is in a banner`);
  const required = [...post.matchAll(/^\\if :\{\?(\w+)\}$/gm)].map((m) => m[1]).sort();
  const passed = [...blockWith(doc, STAGE2).matchAll(/-v (\w+)="\$\{[A-Z]+\}"/g)].map((m) => m[1]).sort();
  assert.deepEqual(passed, required);
  assert.equal(required.length, 8);
  const quoted = [...codeOf(post).matchAll(/(?<![:\w]):'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]);
  const bare = [...codeOf(post).replace(/(?<![:\w]):'[a-z_][a-z0-9_]*'/g, "V").replace(/'(?:[^']|'')*'/g, "''").matchAll(/(?<![:\w]):([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set([...quoted, ...bare])].sort(), required);
  assert.deepEqual(carryProblems(["policies_before"], ["policies_count_before"]), ["the pre-check prints no row named policies_before"]);
});

test("the six blocks are there, in order, and carry no # line, no ! but test !, no backslash continuation, no old path and no set -e", () => {
  const blocks = blocksOf(doc);
  assert.equal(blocks.length, 6);
  assert.deepEqual(MARKERS_IN_ORDER.map((m) => blocks.findIndex((b) => b.includes(m))), [0, 1, 2, 3, 4, 5]);
  for (const b of blocks) assert.deepEqual(blockHazards(b), []);
  assert.doesNotMatch(doc, /\/Users\/ivan\/Documents\b/);
  assert.notDeepEqual(blockHazards("git grep x -- ':!a'\n"), []);
  for (const planted of ["set -e", "set -eo pipefail", "set -o errexit"]) assert.equal(blockHazards(planted).length, 1, planted);
  assert.deepEqual(blockHazards("test ! -f x || exit 1\n"), []);
});

test("THE HELD HEAD: every block that reads a head names origin/db/0108-pack-read-function, none names origin/main, and the dispatch names the head as HELD", () => {
  const blocks = blocksOf(doc);
  for (const b of blocks) assert.ok(!b.includes("origin/main"), "a block names origin/main");
  const reading = blocks.filter((b) => b.includes("git rev-parse origin/db/0108-pack-read-function"));
  assert.equal(reading.length, 5, "BEFORE YOU START, stage 0, stage 1, stage 2 and the closing read resolve the held branch");
  assert.ok(!blockWith(doc, CLOCKCHK).includes("git rev-parse origin/"), "the CLOCK CHECK reads the two records, not the branch");
  for (const b of blocks) for (const l of b.split("\n").filter((x) => x.includes("git rev-parse origin/"))) assert.match(l, /git rev-parse origin\/db\/0108-pack-read-function\)/, l);
  const s1 = blockWith(doc, STAGE1).split("\n");
  assert.ok(s1.some((l) => l.startsWith('[ "${NOW}" = "${REC}" ] || { echo "STOP: the held head moved since stage 0: the branch was pushed to or updated during the sitting.') && EXPLICIT_HALT.test(l)));
  const bys = blockWith(doc, BYS).split("\n");
  assert.ok(bys.some((l) => l.startsWith('[ "${TIP}" = "${HELD}" ] || { echo "STOP: the held head is not the commit this block names') && EXPLICIT_HALT.test(l)));
});

/** A command a later step relies on: its failure must halt the block by an explicit guard. */
const MUST_HALT = [
  /^cd /, /\bgit (fetch|checkout|status|grep|show|rev-parse origin\/db\/0108-pack-read-function)\b/, /^rm -f /, /^mv /, /^touch /, /\| tee /,
  /^node (scripts|packages)\//, /^node --env-file=/, /^node -e /, /\bpsql /, />>? \/tmp\/0108-/, /^set -o allexport/,
  /^(T107|W107|REC|START|NOWZ|DTZ|NOW|NEXT|PREV|HD|S2|TIP|WAS|DOC|BAN|SIDE|SM|SP|SPRE|SPOST|SV|SG|SC|RW|MW|WREAD|STRAY)=\$\(/,
  /^test /, /^\[ /, /^shasum -a 256 -c /, /^grep -q/, /^echo "[^"]*" \| grep -q/,
];
export function unguardedLines(block) {
  const out = [];
  block.split("\n").forEach((line, i) => {
    if (/^if /.test(line) || /^echo "[^"]*"$/.test(line)) return;
    if (MUST_HALT.some((re) => re.test(line)) && !EXPLICIT_HALT.test(line)) out.push(`${i + 1}: ${line.slice(0, 100)}`);
  });
  return out;
}

test("EVERY HALT IS EXPLICIT: each command a later step relies on carries its own || { echo \"STOP: ...\"; exit ...; }, and no block carries set -e at all", () => {
  for (const b of blocksOf(doc)) {
    assert.deepEqual(unguardedLines(b), [], b.slice(0, 120));
    const sets = b.split("\n").map((l, i) => (/(^|[ (;])set [-+]/.test(l) ? `${i}: ${l.replace(/ \|\| \{.*$/, "").replace(/\/Users\/[^ ]+/, "ENV")}` : null)).filter(Boolean);
    assert.equal(sets[0], "1: set -o pipefail");
    for (const s of sets.slice(1)) assert.match(s, /^\d+: set -o allexport && \. ENV && set \+o allexport$/);
    for (const line of b.split("\n")) if (line.includes('echo "STOP: ')) assert.match(line, /echo "STOP: [^"]+";( echo "\$\{STRAY\}";)? exit (1|\$\{RC\}); (\}|fi)$/, line.slice(0, 120));
  }
  for (const planted of ["git fetch origin --prune", "git show x:y | shasum", "DOC=$(git show x:y | shasum -a 256 | cut -d' ' -f1)", 'W9=$(git grep -n x -- apps)', "touch /tmp/0108-applied.ok",
    "node scripts/assert-production-target.mjs", "set -o allexport && . /x.env && set +o allexport", "NEXT=$(TZ=Europe/Lisbon date -j -v+1d -f '%Y%m%d%H%M' x '+%Y%m%d')",
    "test -f docs/x.sha256", '[ "${NOW}" = "${REC}" ]', "grep -qx 'journal rows on production: 105' /tmp/0108-x.out"]) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
});

// =====================================================================================
// THE HARNESS. Nothing in it touches a real host, the secrets folder or a database.
// =====================================================================================

const STUBBED = ["git", "psql", "node", "pnpm", "sntp", "curl", "shasum", "tee", "mv", "rm", "touch", "cat", "find", "date", "grep", "cut", "awk", "sed", "head", "tail", "wc", "tr"];
const FAKED = new Set(["git", "psql", "pnpm", "sntp", "curl"]);
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const FAKE_SHA = { MAIN: "1".repeat(40), BEFORE: "3".repeat(40) };
const HARNESS_EPOCH = 1791315000;
const HARNESS_HTTPDATE = new Date(HARNESS_EPOCH * 1000).toUTCString();

function realPath(name) {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", env: { PATH: SYSTEM_PATH } });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}, and it is not there`);
  return p;
}
const hasShell = (name) => spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH } }).status === 0;
const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

/** One POSIX sh stub. It numbers its own calls per name, logs the call and which records exist, fails when it is the call named by HARNESS_FAIL, and otherwise answers. */
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
    sntp) echo "sntp: harness fault: no response" >&2; exit 1;;
    curl) exit 28;;
    node) case "$1" in
        scripts/assert-production-target.mjs) echo "REFUSE: harness fault, the target is not the production session pooler" >&2; exit 2;;
        packages/db/scripts/verified-migrate.mjs) echo "harness fault: verified-migrate exits \${HARNESS_FAIL_CODE:-3}"; exit "\${HARNESS_FAIL_CODE:-3}";;
        --env-file=*) echo "REFUSE: harness fault, the reader refuses the target" >&2; exit 2;;
        *) echo "Error: harness fault" >&2; exit 1;;
      esac;;
    tee) ${R("cat")}; echo "tee: harness fault: Permission denied" >&2; exit 1;;
    grep) ${R("cat")} > /dev/null; echo "grep: harness fault: Input/output error" >&2; exit 2;;
    cut|awk|sed|head|tail|wc|tr|shasum) ${R("cat")} > /dev/null; echo "$n: harness fault: Input/output error" >&2; exit 1;;
    *) echo "$n: harness fault: Operation failed" >&2; exit 1;;
  esac
fi
case "$n" in
  git) case "$1" in
      status) if [ -n "$HARNESS_STRAY" ]; then echo "$HARNESS_STRAY"; fi; exit 0;;
      fetch) exit 0;;
      rev-parse) if [ "$2" = origin/db/0108-pack-read-function ]; then echo "$HARNESS_MAIN"; exit 0; fi
        if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi;;
      cat-file) case "$3" in *[!0-9a-f]*) ;; *) if [ "\${#3}" -eq 40 ]; then echo commit; exit 0; fi;; esac
        echo "fatal: Not a valid object name $3" >&2; exit 128;;
      checkout) if [ "$HARNESS_CHECKOUT" = stuck ]; then exit 0; fi
        for a in "$@"; do last="$a"; done; echo "$last" > "$d/head"; exit 0;;
      show) spec="$2"; sha="\${spec%%:*}"; path="\${spec#*:}"
        [ "$sha" = "$HARNESS_MAIN" ] || { echo "fatal: bad revision '$sha'" >&2; exit 128; }
        [ -f "$path" ] || { echo "fatal: path '$path' does not exist in '$sha'" >&2; exit 128; }
        exec ${R("cat")} "$path";;
    esac
    unexpected "$@";;
  sntp) [ "$1" = time.apple.com ] || unexpected "$@"
    case "$HARNESS_SNTP" in
      far) echo "+42.000000 +/- 0.020000 time.apple.com 17.253.52.253"; exit 0;;
      down) echo "sntp: harness: no response" >&2; exit 1;;
      *) echo "+0.004421 +/- 0.023706 time.apple.com 17.253.52.253"; exit 0;;
    esac;;
  curl) case "$HARNESS_CURL" in
      down) exit 28;;
      *) printf 'HTTP/2 200\\r\\ndate: %s\\r\\nserver: harness\\r\\n\\r\\n' "$HARNESS_HTTPDATE"; exit 0;;
    esac;;
  psql) if [ -z "$1" ]; then echo "psql: error: connection to server on socket failed: No such file or directory" >&2; exit 2; fi
    [ "$1" = "$HARNESS_DBURL" ] || unexpected "a database URL that is not the harness's";
    case "$*" in
      *precheck-0108-pack-instance-consuming-sessions.sql*) ${R("cat")} "$HARNESS_FIX/\${HARNESS_PRE:-pre.out}"; exit "\${HARNESS_PRE_EXIT:-0}";;
      *postcheck-0108-pack-instance-consuming-sessions.sql*) ${R("cat")} "$HARNESS_FIX/\${HARNESS_POST:-post.out}"; exit "\${HARNESS_POST_EXIT:-0}";;
      *public.locations*) printf 'BEGIN\\n%s\\n' "$HARNESS_CLINICS"; exit 0;;
      *"where hash = "*) printf 'BEGIN\\n%s\\n' "\${HARNESS_HASHN:-1}"; exit 0;;
      *"limit 3"*) exec ${R("cat")} "$HARNESS_FIX/last3.out";;
      *"select count(*) from drizzle.__drizzle_migrations"*) printf 'BEGIN\\n%s\\n' "$HARNESS_ROWS"; exit 0;;
    esac
    unexpected "$@";;
  pnpm) unexpected "$@";;
  node) case "$1" in
      -e) exec ${R("node")} "$@";;
      scripts/check-journal.mjs) echo "check-journal: 106 .sql files match 106 journal entries in order (harness)"; exit 0;;
      scripts/assert-production-target.mjs) if [ -z "$DATABASE_URL_DIRECT" ]; then echo "REFUSE: DATABASE_URL_DIRECT is not set" >&2; exit 2; fi
        [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the guard ran with a URL that is not the harness's";
        printf 'host: harness.invalid\\nport: 5432\\nref: harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
      packages/db/scripts/verified-migrate.mjs) exec ${R("cat")} "$HARNESS_FIX/vm.out";;
      --env-file=*) f="\${1#--env-file=}"; [ -f "$f" ] || { echo "node: $f: not found" >&2; exit 9; }
        [ "$2" = packages/db/scripts/read-applied-migrations.mjs ] || unexpected "$@";
        st=APPLIED; pn=0; if [ "$HARNESS_ROWS" -lt 106 ]; then st=PENDING; pn=1; fi
        if [ "$HARNESS_READER" = without-0108 ]; then st=PENDING; pn=1; fi
        orph=0; if [ "$HARNESS_READER" = orphan-row ]; then orph=1; fi
        printf 'journal rows on production: %s\\n  APPLIED  0107_record_annulments_insert_policy.sql\\n  %s  0108_pack_instance_consuming_sessions.sql\\n' "$HARNESS_ROWS" "$st"
        if [ "$HARNESS_READER" = pending-later ]; then printf '  PENDING  0109_later.sql\\n'; pn=$((pn + 1)); fi
        printf 'pending on this ref: %s\\njournal rows with no matching file on this ref: %s\\n' "$pn" "$orph"; exit 0;;
    esac
    unexpected "$@";;
  date) nz=
    if [ "$1" = -u ]; then nz=1; fi
    if [ "$1" = -j ] && [ "$2" = -u ]; then nz=1; fi
    if [ -z "$nz" ]; then [ "$TZ" = Europe/Lisbon ] || unexpected "date ran without TZ=Europe/Lisbon [TZ=$TZ]"; fi
    z="$HARNESS_ZONE"
    s="$HARNESS_STAMP"
    if [ "$HARNESS_ZONE_AT" = "$id" ]; then z="$HARNESS_ZONE_BAD"; fi
    if [ -n "$HARNESS_STAMP_FROM" ] && [ "$k" -ge "$HARNESS_STAMP_FROM" ]; then s="$HARNESS_STAMP_LATER"; fi
    case "$1" in
      '+%u%H%M %Z') echo "$HARNESS_DHHMM $z";;
      '+%Y%m%d%H%M %Z') echo "$s $z";;
      '+%Y%m%d%H%M %u %Z') echo "$s $HARNESS_DOW $z";;
      -u) [ "$2" = '+%s' ] || unexpected "$@"; echo "$HARNESS_EPOCH";;
      -j) case "$2" in
          -u) [ "$5" = "$HARNESS_HTTPDATE" ] || { echo "date: harness: cannot parse $5" >&2; exit 1; }; echo "$HARNESS_EPOCH";;
          -v+1d) echo "$HARNESS_NEXT";;
          -v-1d) echo "$HARNESS_PREV";;
          *) unexpected "$@";;
        esac;;
      *) unexpected "$@";;
    esac; exit 0;;
  cut) if [ -n "$inp" ]; then printf '%s\\n' "$inp" | ${R("cut")} "$@"; exit $?; fi
    exec ${R("cut")} "$@" < /dev/null;;
esac
if [ "$HARNESS_HOOK_AFTER" = "$id" ]; then ${R(name)} "$@"; s=$?; ${R("mkdir")} -p "$HARNESS_HOOK_MKDIR"; exit $s; fi
exec ${R(name)} "$@"
`;
}

/** What the harness's pre-check prints for each carry. */
const COUNT_CARRIES = Object.freeze({ journal_rows_before: 105, policies_before: 108, functions_before: 262, secdef_before: 36, probe_instances: 3 });
const carryValue = (row) => COUNT_CARRIES[row] ?? md5(row);
const CARRY_ROWS = CARRY_MAP.map(([, row]) => row).filter((r) => r !== "journal_rows_before");

/** What the faked programs print. Four columns, as the real files print them; the verdict is the last. */
function harnessFixtures() {
  const row = (a, b, c, v) => ` ${a.padEnd(48)} | ${String(b).padEnd(34)} | ${String(c).padEnd(20)} | ${v}`;
  const table = (rows) => [row("check", "observed", "expected", "verdict"), "-".repeat(120), ...rows, `(${rows.length} rows)`, ""].join("\n");
  const preRows = [
    ...Array.from({ length: 12 }, (_, i) => row(`${i}. pre-check verdict`, "harness", "harness", "OK")),
    row("journal_rows_before", carryValue("journal_rows_before"), "105 (verdict 12)", "OK"),
    ...CARRY_ROWS.map((k) => row(k, carryValue(k), "a count", "CARRY")),
    row("INFO the server version", "17.6", "a profile", "INFO"),
    row("INFO the packs as they are (counts; no row is touched)", "instances 4; with a consuming visit 3", "a profile, never a verdict", "INFO"),
    row("INFO idle_in_transaction_session_timeout (0 is no limit)", "0", "a profile, never a verdict", "INFO"),
  ];
  const verdictOf = (rows, startsWith, to) => rows.map((r) => (r.trimStart().startsWith(startsWith) ? r.replace(/\| OK$/, `| ${to}`) : r));
  const postRows = (vacuousAt) => Array.from({ length: 13 }, (_, i) => row(`${i}. post-check verdict`, "harness", "harness", vacuousAt.includes(i) ? "VACUOUS" : "OK"));
  const vm = [
    `file       ${TAG}.sql present, sha256 matches`, "journal    105 row(s) applied, last when=1788502800000",
    `pending    1  [${TAG}]`, "--- drizzle-kit migrate --- (harness)", "journal    105 -> 106  (delta 1)",
    `${TAG} present by sha256: yes`, "OK: the journal moved by exactly the pending count and carries the approved sha256.", "",
  ].join("\n");
  const last3 = " id  | hash | created_at\n 106 | 7f481ae4 | 1788502900000\n 105 | 56c310cd | 1788502800000\n 104 | 2f309b8a | 1788502700000\n(3 rows)\n";
  return {
    "pre.out": table(preRows),
    "pre-vac.out": table(verdictOf(preRows, "8. pre-check verdict", "VACUOUS")),
    "pre-fail.out": table(verdictOf(preRows, "10. pre-check verdict", "FAIL")),
    "pre-short.out": table(preRows.filter((r) => !r.trimStart().startsWith("5. pre-check verdict"))),
    "post.out": table(postRows([])),
    "pre-probe0.out": table(preRows.map((r) => (r.trimStart().startsWith("probe_instances ") ? r.replace(/\| 3( +)\|/, "| 0$1|") : r))),
    "post-1vac.out": table(postRows([6])),
    "post-2vac.out": table(postRows([5, 6])),
    "post-fail.out": table(postRows([]).map((r) => (r.trimStart().startsWith("11. post-check verdict") ? r.replace(/\| OK$/, "| FAIL") : r))),
    "post-short.out": table(postRows([]).filter((r) => !r.trimStart().startsWith("9. post-check verdict"))),
    "last3.out": last3, "vm.out": vm,
  };
}

const APPLY_FILES = [
  PRE, POST, PREV_PATH, "scripts/assert-production-target.mjs", "scripts/production-target.mjs", "scripts/check-journal.mjs", GATE_FILE,
  "packages/db/scripts/verified-migrate.mjs", "packages/db/scripts/read-applied-migrations.mjs",
];

/** The fake apply worktree's journal, AS OF 0108: the live journal's entries up to and including 0107, then 0108's. */
export function journalAsOf0108(live) {
  const at = live.entries.findIndex((e) => e.tag === PREV_TAG);
  if (at < 0) throw new Error(`the live journal no longer holds ${PREV_TAG}`);
  const prev = live.entries[at];
  return { ...live, entries: [...live.entries.slice(0, at + 1), { idx: prev.idx + 1, version: prev.version, when: prev.when + 100000, tag: TAG, breakpoints: true }] };
}

/** The shared base of a sweep: the stubs, the fixtures, a fake env file, and a fake apply worktree holding `docText`. */
export function prepareHarness(base, docText) {
  for (const dir of ["bin", "fix", "apply/docs"]) mkdirSync(join(base, dir), { recursive: true });
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
  mkdirSync(join(base, "apply", "packages/db/migrations/meta"), { recursive: true });
  writeFileSync(join(base, "apply", MIGRATION_PATH), migration);
  writeFileSync(join(base, "apply", JOURNAL), `${JSON.stringify(journalAsOf0108(JSON.parse(read(JOURNAL))), null, 2)}\n`);
  writeFileSync(join(base, "apply", DOC), docText);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(docText)}  ${DOC}\n`);
}

/** The block with its real paths moved into the run folder. A block that still names one is refused unrun. */
export function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/0108-", join(run, "tmp/0108-"));
  const rest = out.replaceAll(join(run, "tmp/0108-"), "").replaceAll(join(run, "apply"), "").replaceAll(envFile, "");
  for (const bad of ["/tmp/0108-", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return out;
}

/** GREEN's tool shape. zsh: exactly it. bash: the same, with errexit forced off, as zsh has it there. */
export function shellArgs(shell, text) {
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  if (shell === "zsh") return ["zsh", ["-f", "-c", tail]];
  if (shell === "bash") return ["bash", ["--noprofile", "--norc", "-c", `set() { builtin set "$@"; builtin set +e; }; ${tail}`]];
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

/** Run one block once; `fault` null is the positive control. Mode "empty" makes the call exit 0 and print nothing. */
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
  const text = localize(cfg.block, run, fault?.noEnv ? join(run, "no-such.env") : join(cfg.base, "fake-prod.env"));
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL,
    HARNESS_MAIN: FAKE_SHA.MAIN, HARNESS_MARKERS: cfg.markers.join(" "),
    HARNESS_ROWS: String(cfg.rows ?? 106), HARNESS_CLINICS: cfg.clock.clinics,
    HARNESS_DHHMM: cfg.clock.dhhmm, HARNESS_DOW: cfg.clock.dow, HARNESS_STAMP: cfg.clock.stamp, HARNESS_ZONE: cfg.clock.zone ?? "WEST",
    HARNESS_NEXT: cfg.clock.next, HARNESS_PREV: cfg.clock.prev, HARNESS_EPOCH: String(HARNESS_EPOCH), HARNESS_HTTPDATE,
    HARNESS_SNTP: cfg.net?.sntp ?? "", HARNESS_CURL: cfg.net?.curl ?? "", 
    HARNESS_FAIL: fault?.call ?? "", HARNESS_FAIL_CODE: String(fault?.code ?? 3), HARNESS_FAIL_MODE: fault?.mode ?? "",
    HARNESS_HASHN: cfg.db?.hashN ?? "1", HARNESS_PRE: cfg.db?.pre ?? "pre.out", HARNESS_POST: cfg.db?.post ?? "post.out",
    HARNESS_PRE_EXIT: String(cfg.db?.preExit ?? 0), HARNESS_POST_EXIT: String(cfg.db?.postExit ?? 0), HARNESS_READER: cfg.db?.reader ?? "",
    HARNESS_HOOK_AFTER: fault?.hookAfter ?? "", HARNESS_HOOK_MKDIR: fault?.hookMkdir ? join(run, "tmp", fault.hookMkdir) : "",
    HARNESS_STRAY: cfg.git?.stray ?? "", HARNESS_CHECKOUT: cfg.git?.checkout ?? "",
    HARNESS_ZONE_AT: cfg.clock.zoneAt ?? "", HARNESS_ZONE_BAD: cfg.clock.zoneBad ?? "",
    HARNESS_STAMP_FROM: String(cfg.clock.laterFrom ?? ""), HARNESS_STAMP_LATER: cfg.clock.later ?? "",
  };
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").trim().split("\n").filter(Boolean).map((l, pos) => {
    const [id, ex] = l.split("|");
    return { id, pos, exists: ex.trim() ? ex.trim().split(" ") : [], args: readRun(`args.${id}`) };
  });
  const markersAtEnd = cfg.markers.filter((m) => {
    try { const st = statSync(join(run, "tmp", m)); return st.isFile() && st.mtimeMs > t0; } catch { return false; }
  });
  const result = { ...r, calls, markersAtEnd, unexpected: readRun("unexpected"), fired: readRun("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

export function describeCall(call) {
  const lines = call.args.split("\n").filter((l) => l !== "");
  const stdin = lines.filter((l) => l.startsWith("STDIN ")).map((l) => l.slice(6));
  const args = lines.filter((l) => !l.startsWith("STDIN ")).map((a) => (a.length > 70 ? `${a.slice(0, 40)}...${a.slice(-25)}` : a));
  return `${call.id.split("#")[0]} ${args.join(" ")}${stdin.length ? `  <stdin: ${stdin.join(" ").slice(0, 70)}>` : ""}`;
}

function writePoints(positive, markers) {
  const wp = {};
  for (const m of markers) {
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

/** Sweep one block: the positive control, then every external call made to fail in turn, plus the extra faults. */
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
  const allow = cfg.mayContinue(positive);
  const faults = positive.calls.map((c) => ({ call: c.id, label: describeCall(c), pos: c.pos, at: c }));
  faults.push(...cfg.extraFaults(positive, wp));
  const rows = await inPool(faults, Number(process.env.HARNESS_POOL) || Math.max(2, cpus().length), async (f, i) => {
    const r = await runOnce(cfg, `${cfg.id}-f${i}`, f);
    const allowed = f.at ? allow(f.at) : null;
    const id = f.mode === "empty" ? `${f.call}:empty` : f.call ?? f.kind;
    const halted = r.code !== 0 && !r.out.includes("TOOL-CHAIN-CONTINUED");
    const problems = [];
    if (f.call && r.fired !== f.call) problems.push(`the fault at ${f.call} never fired`);
    if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
    const row = { fault: f.label, call: id, halted, problems, code: r.code, out: r.out };
    if (allowed) {
      // Either outcome is right here: a source NOT READ goes on, a disagreement STOPs. A halt must still be a STOP.
      if (halted && !/^STOP: /m.test(r.out)) problems.push("it halted without a STOP line");
      return { ...row, result: halted ? `halts, as it may (${allowed})` : `continues, as it may (${allowed})` };
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

// ---- The seven blocks as the harness runs them. ----

/** The harness's dates: 2026-10-05 is a Monday, so Tuesday is the 6th and Sunday the 11th. */
const DAY_OF = { 1: "20261005", 2: "20261006", 3: "20261007", 4: "20261008", 5: "20261009", 6: "20261010", 7: "20261011" };
const ymdShift = (ymd, days) => {
  const t = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) + days);
  return new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
};
/** A clock at weekday `d`, `hhmm`, with a stage 1 window record and a dispatch fill that hold it, so a STOP is the block's own. */
export const clockAt = (d, hhmm, clinics = "0 of 2", zone = "WEST") => {
  const day = DAY_OF[d];
  return {
    dhhmm: `${d}${hhmm}`, dow: String(d), stamp: `${day}${hhmm}`, next: ymdShift(day, 1), prev: ymdShift(day, -1),
    window: `${day}0000 ${day}2359 209912310000`, clinics, zone,
    fill: { WOPEN: `${ymdShift(day, -1)}0000`, WSTART: `${ymdShift(day, 1)}2359`, WEND: "209912310000" },
  };
};
const CLOSED = clockAt(2, "2130");

test("the harness's dates are the weekdays it says they are, and its HTTP date parses as the blocks parse it", () => {
  for (const [d, ymd] of Object.entries(DAY_OF)) assert.equal(new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00Z`).getUTCDay() || 7, Number(d), ymd);
  assert.equal(ymdShift("20261011", 1), "20261012");
  assert.equal(ymdShift("20261005", -1), "20261004");
  assert.match(HARNESS_HTTPDATE, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/);
});

const putRecord = (tmp, name, text, minutesAgo) => {
  const f = join(tmp, name);
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

/** Per block: its pass lines (the last is its last line), its records, and the records its inputs need. */
const HARNESS_BLOCKS = {
  bys: {
    marker: BYS, markers: ["0108-journal-before.out", "0108-start-head.sha"], success: ["held head recorded for the CLOCK CHECK", BYS],
    setup: () => () => {}, fill: true, rows: 105, redirect: "0108-start-head.sha", sources: true, initialHead: FAKE_SHA.BEFORE,
  },
  stage0: {
    marker: STAGE0, markers: ["0108-check-journal.out", "0108-head.sha"], success: ["running from the held head", STAGE0],
    setup: () => (tmp) => putRecord(tmp, "0108-applied.ok", "", 780), redirect: "0108-head.sha",
  },
  clock: {
    marker: CLOCKCHK, markers: ["0108-window.ok"], success: ["run window recorded in", CLOCKCHK], fill: true, redirect: "0108-window.ok",
    setup: () => (tmp) => { putRecord(tmp, "0108-start-head.sha", `${FAKE_SHA.MAIN}\n`, 10); putRecord(tmp, "0108-head.sha", `${FAKE_SHA.MAIN}\n`, 5); },
  },
  stage1: {
    marker: STAGE1, markers: ["0108-precheck.new", "0108-precheck.out", "0108-apply.out", "0108-applied.ok"], success: [STAGE1],
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0108-head.sha", `${FAKE_SHA.MAIN}\n`, 10);
      putRecord(tmp, "0108-window.ok", `${FAKE_SHA.MAIN} ${clock.window}\n`, 5);
      putRecord(tmp, "0108-applied.ok", "", 780);
    },
    sources: true, vm: true,
  },
  stage2: {
    marker: STAGE2, markers: ["0108-postcheck.out", "0108-stage2.ok"], success: [STAGE2],
    setup: (clock, preRecord = "pre.out") => (tmp) => {
      putRecord(tmp, "0108-head.sha", `${FAKE_SHA.MAIN}\n`, 20);
      putRecord(tmp, "0108-window.ok", `${FAKE_SHA.MAIN} ${clock.window}\n`, 15);
      putRecord(tmp, "0108-precheck.out", harnessFixtures()[preRecord], 6);
      putRecord(tmp, "0108-applied.ok", "", 5);
    },
    redirect: "0108-stage2.ok", sources: true,
  },
  closing: {
    marker: CLOSING, markers: ["0108-journal-after.out"], success: ["CLOSING READ:"], initialHead: FAKE_SHA.MAIN,
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0108-head.sha", `${FAKE_SHA.MAIN}\n`, 30);
      putRecord(tmp, "0108-window.ok", `${FAKE_SHA.MAIN} ${clock.window}\n`, 25);
      putRecord(tmp, "0108-applied.ok", "", 10);
      putRecord(tmp, "0108-stage2.ok", `${FAKE_SHA.MAIN}\n`, 1);
    },
    sources: true,
  },
};
const HARNESS_PLAN = ["bys", "stage0", "clock", "stage1", "stage2", "closing"];

/**
 * The network-time calls of the dispatch blocks, each named by its program and its arguments, never by
 * where it falls: a command added among them later is not exempt by accident.
 */
export const NETWORK_CALLS = Object.freeze([
  ["sntp", (a) => a[0] === "time.apple.com" && a.length === 1],
  ["curl", (a) => a[0] === "-sI" && a[1] === "--max-time" && a[2] === "8" && /^https:\/\/(api\.github\.com|www\.cloudflare\.com)$/.test(a[3] ?? "")],
  ["date", (a) => (a[0] === "-u" && a[1] === "+%s") || (a[0] === "-j" && a[1] === "-u" && a[2] === "-f" && a[3] === "%a, %d %b %Y %H:%M:%S GMT")],
  ["awk", (a) => a[0] === '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }'],
  ["awk", (a) => a[0] === "-v" && /^o=/.test(a[1] ?? "") && a[2] === "BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }"],
  ["awk", (a) => a[0] === '{ sub(/\\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }'],
  ["grep", (a) => a[0] === "-qxE" && ["[+-][0-9]+[.][0-9]+", "[1-9][0-9]{8,10} [1-9][0-9]{8,10}"].includes(a[1])],
  ["grep", (a) => a[0] === "-qxE" && (a[1] ?? "").startsWith("(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|")],
]);
export const isNetworkCall = (call) => {
  const prog = call.id.split("#")[0];
  const args = call.args.split("\n").filter((l) => !l.startsWith("STDIN ")).slice(0, -1);
  return NETWORK_CALLS.some(([p, ok]) => p === prog && ok(args));
};

/** The calls whose failure may leave a block running, each with its reason. */
export function mayContinue(name) {
  return () => (call) => {
    const prog = call.id.split("#")[0];
    if ((name === "stage0" || name === "stage1") && (call.args.includes(GATE_FILE) || (prog === "grep" && call.args.includes("[0-9a-f]{64}")))) {
      return "an R9 proof 1 call: a failure reads no, and proof 1 decides nothing in a closed-hours-only arm";
    }
    if ((name === "bys" || name === "clock") && isNetworkCall(call)) {
      return "a network-time read: a source NOT READ goes on while another was read, and a disagreement STOPs";
    }
    return null;
  };
}

/** The sweep configuration of one block at one clock, on one shell. */
export function harnessConfig(md, name, clock, shell, base, opts = {}) {
  const spec = HARNESS_BLOCKS[name];
  const raw = blockWith(md, spec.marker);
  const block = spec.fill ? fillDispatch(raw, { HELD: FAKE_SHA.MAIN, DOCSHA: sha256(md), ...clock.fill, ...(opts.fill ?? {}) }) : raw;
  return {
    id: `${shell}-${name}`, shell, base, block, markers: spec.markers, success: spec.success, rows: spec.rows,
    setup: spec.setup(clock, opts.preRecord), initialHead: spec.initialHead, clock, mayContinue: mayContinue(name),
    extraFaults: (positive, wp) => {
      const out = [{ kind: "cd", label: "cd: the apply worktree is not there", noApply: true, pos: -1 }];
      const guard = positive.calls.find((c) => c.id.startsWith("node#") && /assert-production-target|--env-file=/.test(c.args));
      if (spec.sources) out.push({ kind: "env", label: ". or --env-file: the env file is not there", noEnv: true, pos: guard.args.startsWith("--env-file=") ? guard.pos : guard.pos - 1 });
      if (spec.redirect) out.push({ kind: "redirect", label: `> ${spec.redirect}: the path is a directory`, hookAfter: "rm#1", hookMkdir: spec.redirect, pos: Math.min(wp[spec.redirect], positive.calls.length - 1) });
      if (spec.vm) {
        const vm = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
        for (const code of [2, 4, 5]) out.push({ kind: `vm-exit-${code}`, label: `node verified-migrate exits ${code}`, call: vm.id, code, pos: vm.pos, at: null });
      }
      for (const c of positive.calls.filter((x) => x.id.startsWith("date#") || (x.id.startsWith("cut#") && x.args.includes("0108-window.ok")))) {
        out.push({ kind: "empty", label: `${describeCall(c)}: exits 0 with empty output`, call: c.id, mode: "empty", pos: c.pos, at: c });
      }
      return out;
    },
  };
}

async function sweepAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `fault-0108-${shell}-`));
  try {
    prepareHarness(base, doc);
    const bad = [];
    let faults = 0;
    for (const name of HARNESS_PLAN) {
      const r = await sweep(harnessConfig(doc, name, CLOSED, shell, base));
      assert.deepEqual(r.posProblems, [], `${shell} ${name}: the positive control did not reach its last line\n${r.positive.out.slice(-2500)}`);
      assert.ok(r.rows.length > r.positive.calls.length, `${shell} ${name}: ${r.rows.length} faults`);
      const halts = r.rows.filter((x) => x.halted).length;
      faults += r.rows.length;
      t.diagnostic(`${shell} ${name}: positive reaches its last line; ${r.rows.length} faults, ${halts} halt, ${r.rows.length - halts} allowed to continue`);
      for (const row of r.rows) {
        if (process.env.FAULT_TABLE === "1") t.diagnostic(`  ${name} | ${row.call} | ${row.fault.slice(0, 110)} | ${row.result}`);
        if (row.problems.length) bad.push(`${shell} ${name} ${row.call} [${row.fault}]: ${row.problems.join("; ")}\n${row.out.slice(-600)}`);
      }
    }
    assert.deepEqual(bad, [], `fault rows that broke a rule:\n${bad.join("\n")}`);
    assert.ok(faults > 280, `only ${faults} faults across the six blocks`);
    t.diagnostic(`${shell}: ${faults} faults across the six blocks`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function zshOrSkip(t) {
  if (hasShell("zsh")) return true;
  if (process.env.GITHUB_ACTIONS === "true") {
    t.skip("zsh is not on the CI runner (ubuntu-latest); the convention is scripts/apply-lane/apply-lane-settings.test.mjs. The bash arm ran here instead");
    return false;
  }
  assert.fail("zsh is not on this machine, and the zsh arm of the fault-injection harness must run wherever it is not the GitHub runner");
}
const shellsHere = () => ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];

test("every block parses under bash -n and zsh -n", (t) => {
  for (const b of blocksOf(doc)) {
    const r = spawnSync("bash", ["--noprofile", "--norc", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
  if (!zshOrSkip(t)) return;
  for (const b of blocksOf(doc)) {
    const r = spawnSync("zsh", ["-f", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `zsh -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
});

test("the harness's journal is the journal as of 0108, whatever lands later", () => {
  const live = JSON.parse(read(JOURNAL));
  const j = journalAsOf0108(live);
  const [p, e] = j.entries.slice(-2);
  assert.deepEqual([p.idx, p.tag, p.when, e.idx, e.tag, e.when, j.entries.length], [104, PREV_TAG, 1788502800000, 105, TAG, 1788502900000, 106]);
  assert.deepEqual(live.entries.find((x) => x.tag === TAG), e);
  const later = { ...live, entries: [...j.entries, { idx: 106, version: "7", when: 1788503000000, tag: "0109_later", breakpoints: true }] };
  assert.deepEqual(journalAsOf0108(later), j);
  assert.throws(() => journalAsOf0108({ ...live, entries: live.entries.filter((x) => x.tag !== PREV_TAG) }), /no longer holds/);
});

test("THE HARNESS IS ITS OWN CONTROL: in the tool's shape set -e stops nothing, and a block without its guards runs on", async () => {
  const shells = shellsHere();
  for (const shell of shells) {
    const [cmd, args] = shellArgs(shell, "( set -eo pipefail; false; echo after-false; false | cat || echo pipefail-holds )");
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    assert.equal(r.status, 0, `${shell}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /after-false\npipefail-holds\nTOOL-CHAIN-CONTINUED/, shell);
  }
  const base = mkdtempSync(join(tmpdir(), "fault-0108-control-"));
  try {
    prepareHarness(base, doc);
    for (const shell of shells) {
      const cfg = harnessConfig(doc, "stage1", CLOSED, shell, base);
      const positive = await runOnce(cfg, `${shell}-control-positive`, null);
      assert.equal(positive.code, 0, positive.out.slice(-1500));
      const guardCall = positive.calls.find((c) => c.args.startsWith("scripts/assert-production-target.mjs"));
      const vmCall = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
      assert.deepEqual(vmCall.args.trim().split("\n"), ["packages/db/scripts/verified-migrate.mjs", "--tag", TAG, "--sha256", MIGRATION_SHA, "--expect-pending", "1"]);
      const preCall = positive.calls.find((c) => c.id.startsWith("psql#") && c.args.includes(PRE));
      assert.ok(preCall.args.includes("begin read only\n-f\n"), preCall.args);
      const strip = (block, start) => {
        const line = block.split("\n").find((l) => l.startsWith(start));
        return block.replace(line, line.replace(/ \|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/, ""));
      };
      const refused = await runOnce(cfg, `${shell}-control-guard`, { call: guardCall.id });
      assert.notEqual(refused.code, 0, refused.out);
      assert.match(refused.out, /^STOP: the target guard refused or failed/m);
      assert.deepEqual(refused.calls.filter((c) => c.id.startsWith("psql#") || c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), []);
      for (const code of [3, 4]) {
        const r = await runOnce(cfg, `${shell}-control-vm-${code}`, { call: vmCall.id, code });
        assert.equal(r.code, code, r.out);
        assert.ok(!r.markersAtEnd.includes("0108-applied.ok") && !r.out.includes(STAGE1), r.out);
      }
      const noGuard = await runOnce({ ...cfg, block: strip(cfg.block, "node scripts/assert-production-target.mjs") }, `${shell}-control-noguard`, { call: guardCall.id });
      assert.equal(noGuard.code, 0, noGuard.out.slice(-800));
      assert.ok(noGuard.out.includes(STAGE1) && noGuard.calls.some((c) => c.id.startsWith("psql#")));
      const noVm = await runOnce({ ...cfg, block: strip(cfg.block, "node packages/db/scripts/verified-migrate.mjs") }, `${shell}-control-novm`, { call: vmCall.id, code: 3 });
      assert.equal(noVm.code, 0, noVm.out.slice(-800));
      assert.ok(noVm.out.includes(STAGE1) && noVm.markersAtEnd.includes("0108-applied.ok"));
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

/** One clean STOP: exit 1, exactly one STOP line and it matches, no pass line, the tool chain stopped, no call the stubs did not expect. */
function assertStops(r, name, stop, tag) {
  assert.equal(r.code, 1, `${tag}: exit ${r.code}\n${r.out.slice(-800)}`);
  const stops = r.out.split("\n").filter((l) => l.startsWith("STOP: "));
  assert.equal(stops.length, 1, `${tag}: ${stops.join(" | ")}`);
  assert.match(stops[0], stop, tag);
  assert.ok(!r.out.includes("TOOL-CHAIN-CONTINUED") && !HARNESS_BLOCKS[name].success.some((x) => r.out.includes(x)), tag);
  assert.equal(r.unexpected, "", tag);
}
const credentialCalls = (r) => r.calls.filter((c) => c.id.startsWith("psql#") || (c.id.startsWith("node#") && /^(packages\/db\/scripts\/verified-migrate|scripts\/assert-production-target|--env-file=)/.test(c.args)));

async function withHarness(fn, change = () => {}) {
  const base = mkdtempSync(join(tmpdir(), "fault-0108-arm-"));
  try {
    prepareHarness(base, doc);
    change(join(base, "apply"));
    return await fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("THE DISPATCH BLOCKS UNFILLED: as this document carries them, each STOPs at its first check, before anything runs", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [name, stop] of [["bys", /^STOP: HELD is not a filled-in sha, so this block is NOT READY/], ["clock", /^STOP: the document's sha256 in this block is still PENDING, so it is NOT READY/]]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const r = await runOnce({ ...cfg, block: blockWith(doc, HARNESS_BLOCKS[name].marker) }, `${shell}-unfilled-${name}`, null);
        assertStops(r, name, stop, `${shell} ${name} unfilled`);
        assert.deepEqual(r.calls.filter((c) => !c.id.startsWith("grep#")), [], `${shell} ${name}: something ran before the first check`);
      }
      // One value left PENDING at a time.
      for (const left of ["DOCSHA", "WOPEN", "WSTART", "WEND"]) {
        const cfg = harnessConfig(doc, "bys", CLOSED, shell, base);
        const half = fillDispatch(blockWith(doc, BYS), { HELD: FAKE_SHA.MAIN, DOCSHA: sha256(doc), ...CLOSED.fill, [left]: `PENDING: set ${left === "DOCSHA" ? "at the READY line" : "with the run window"}` });
        const r = await runOnce({ ...cfg, block: half }, `${shell}-half-${left}`, null);
        assertStops(r, "bys", left === "DOCSHA" ? /^STOP: a sha256 in this block is still PENDING/ : /^STOP: the run window in this block \(WOPEN, WSTART, WEND\) is still PENDING/, `${shell} ${left} left PENDING`);
      }
    }
  });
});

test("THE WINDOW'S END, both dispatch blocks whole: a window that ends in the repeated hour STOPS before anything else runs; one that ends after it passes", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        for (const wend of ["202610250100", "202610250159", "202710310130"]) {
          const r = await runOnce(harnessConfig(doc, name, CLOSED, shell, base, { fill: { WEND: wend } }), `${shell}-wend-${name}-${wend}`, null);
          assertStops(r, name, new RegExp(`^STOP: the run window's end ${wend} falls in the hour the Lisbon clocks repeat`), `${shell} ${name}, WEND ${wend}`);
          assert.deepEqual(r.calls.filter((c) => /^(git|sntp|curl|date)#/.test(c.id)), [], `${shell} ${name}: it went on after the window-end STOP`);
          assert.deepEqual(r.markersAtEnd, [], `${shell} ${name}`);
        }
        const ok = await runOnce(harnessConfig(doc, name, CLOSED, shell, base, { fill: { WEND: "202610250200" } }), `${shell}-wend-${name}-ok`, null);
        assert.equal(ok.code, 0, `${shell} ${name}: ${ok.out.slice(-600)}`);
        assert.match(ok.out, /^window end: {4}202610250200 happens once on the Lisbon clock/m);
      }
    }
  });
});

test("THE START WINDOWS, both dispatch blocks whole: closed hours inside a start window pass; closed hours outside one, clinic hours, and another night STOP", async () => {
  const points = [
    ["Tuesday 21:00", 2, "2100", "pass"], ["Tuesday 22:29", 2, "2229", "pass"], ["Wednesday 06:29", 3, "0629", "pass"], ["Sunday 15:00", 7, "1500", "pass"], ["Monday 00:00", 1, "0000", "pass"],
    ["Tuesday 22:30", 2, "2230", /is closed by the weekday table but outside strategy's start windows/],
    ["Wednesday 06:30", 3, "0630", /is closed by the weekday table but outside strategy's start windows/],
    ["Saturday 13:30", 6, "1330", /is closed by the weekday table but outside strategy's start windows/],
    ["Friday 20:59", 5, "2059", /is inside clinic hours by the weekday table/],
  ];
  for (const [, d, hhmm] of points) assert.equal(closedByTable(d, Number(hhmm)) && inStartWindow(d, Number(hhmm)), points.find((p) => p[1] === d && p[2] === hhmm)[3] === "pass");
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        for (const [label, d, hhmm, want] of points) {
          const r = await runOnce(harnessConfig(doc, name, clockAt(d, hhmm), shell, base), `${shell}-start-${name}-${d}${hhmm}`, null);
          const tag = `${shell} ${name} at ${label}`;
          if (want === "pass") {
            assert.equal(r.code, 0, `${tag}: ${r.out.slice(-700)}`);
            assert.ok(r.out.includes(HARNESS_BLOCKS[name].success.at(-1)), tag);
          } else {
            assertStops(r, name, want, tag);
            assert.deepEqual(credentialCalls(r), [], tag);
            assert.deepEqual(r.markersAtEnd, [], tag);
          }
        }
        // ANOTHER NIGHT: a run window the dispatch names for the night before.
        const c = clockAt(2, "2130");
        const r = await runOnce(harnessConfig(doc, name, c, shell, base, { fill: { WOPEN: "202610042100", WSTART: "202610042229", WEND: "202610050800" } }), `${shell}-night-${name}`, null);
        assertStops(r, name, /so this is not the night the dispatch names/, `${shell} ${name}, another night`);
        assert.deepEqual(r.markersAtEnd, [], `${shell} ${name}, another night`);
      }
      // The CLOCK CHECK records the start window, not the run window.
      const ok = await runOnce(harnessConfig(doc, "clock", clockAt(3, "0600"), shell, base), `${shell}-record-window`, null);
      assert.match(ok.out, new RegExp(`^run window recorded in [^:]*: ${FAKE_SHA.MAIN} 202610062100 202610070629 202610070800$`, "m"), ok.out.slice(-600));
    }
  });
});

test("NETWORK TIME, both dispatch blocks whole: one source read is enough, a source that disagrees STOPs, and none readable STOPs", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        const run = (net, id) => runOnce({ ...harnessConfig(doc, name, CLOSED, shell, base), net }, `${shell}-net-${name}-${id}`, null);
        const all = await run({}, "all");
        assert.equal(all.code, 0, all.out.slice(-600));
        // THE EXEMPTION IS BY NAME: every call between the first sntp and the Lisbon clock read is a named
        // network-time call, and no named one falls outside that span.
        const first = all.calls.find((c) => c.id.startsWith("sntp#")).pos;
        const lisbon = all.calls.find((c) => c.id.startsWith("date#") && c.args.split("\n")[0] === "+%Y%m%d%H%M %u %Z").pos;
        const span = all.calls.filter((c) => c.pos >= first && c.pos < lisbon).map((c) => c.id);
        assert.deepEqual(all.calls.filter(isNetworkCall).map((c) => c.id), span, `${shell} ${name}`);
        assert.equal(span.length, 16, `${shell} ${name}: ${span.join(" ")}`);
        assert.ok(!isNetworkCall({ id: "grep#99", args: "-qxE\n[0-9a-f]{64}\n" }) && !isNetworkCall({ id: "git#99", args: "fetch\norigin\n" }));
        assert.match(all.out, /^network time: {2}the machine's clock agrees with every source that could be read\. Read: sntp https:\/\/api\.github\.com https:\/\/www\.cloudflare\.com\. Not read: none\.$/m);
        const noSntp = await run({ sntp: "down" }, "nosntp");
        assert.equal(noSntp.code, 0, noSntp.out.slice(-600));
        assert.match(noSntp.out, /Not read: sntp\.$/m);
        assert.equal(noSntp.calls.filter((c) => c.id.startsWith("sntp#")).length, 3, "sntp is tried three times");
        const noCurl = await run({ curl: "down" }, "nocurl");
        assert.equal(noCurl.code, 0, noCurl.out.slice(-600));
        assert.match(noCurl.out, /Read: sntp\. Not read: {2}https:\/\/api\.github\.com https:\/\/www\.cloudflare\.com\.$|Read: sntp\. Not read: https:\/\/api\.github\.com https:\/\/www\.cloudflare\.com\.$/m);
        assertStops(await run({ sntp: "far" }, "far"), name, /^STOP: the machine's clock disagrees with network time, by more than the tolerance, at: sntp /, `${shell} ${name}, sntp 42 seconds off`);
        const none = await run({ sntp: "down", curl: "down" }, "none");
        assertStops(none, name, /^STOP: the machine's clock could not be held against network time: none of the three sources could be read/, `${shell} ${name}, nothing readable`);
        const lastNet = Math.max(...none.calls.filter((c) => /^(sntp|curl)#/.test(c.id)).map((c) => c.pos));
        assert.deepEqual(none.calls.filter((c) => c.pos > lastNet && (c.id.startsWith("git#") || (c.id.startsWith("date#") && c.args.startsWith("+%Y")))), [], `${shell} ${name}: it went on after the network`);
      }
    }
  });
});

test("THE WEEKDAY TABLE, stages 0 and 1 whole: Friday 20:59 open, Friday 21:00 closed, Saturday 12:59 open, Saturday 13:00 closed, Sunday 15:00 closed, Monday 07:59 closed, and one green arm", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [label, d, hhmm, closed] of RULED_POINTS) {
        for (const stage of ["stage0", "stage1"]) {
          const r = await runOnce(harnessConfig(doc, stage, clockAt(d, hhmm), shell, base), `${shell}-table-${stage}-${d}${hhmm}`, null);
          const tag = `${shell} ${stage} at ${label}`;
          assert.match(r.out, /^R9 proof 2, the migration is catalog-only or touches no table reception writes: yes, by construction /m, tag);
          if (closed) {
            assert.equal(r.code, 0, `${tag}: ${r.out.slice(-700)}`);
            assert.match(r.out, stage === "stage0" ? /^R9: closed hours by the weekday table\. 0108 runs in closed hours only$/m : /^R9: closed hours by the weekday table, and every active clinic's own hours lie inside it\. /m, tag);
          } else {
            assertStops(r, stage, stage === "stage0" ? /^STOP: Lisbon [1-7][0-9]{4} is inside clinic hours by the weekday table / : /^STOP: Lisbon [1-7][0-9]{4}, clock open, clinics inside\. /, tag);
            assert.deepEqual(r.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), [], tag);
            if (stage === "stage1") assert.ok(r.calls.some((c) => c.args.includes(PRE)), `${tag}: the pre-check did not run first`);
          }
        }
      }
    }
  });
});

test("THE CLINICS' ROWS: a clinic whose own hours reach outside the table, or no active clinic, stops stage 1 before the apply", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [label, clock, stop] of [
        ["one clinic's row outside 08:00 to 21:00", clockAt(2, "2130", "1 of 2"), /^STOP: Lisbon 22130, clock closed, clinics outside\. /],
        ["no active clinic at all", clockAt(2, "2130", "0 of 0"), /^STOP: the clinics' own hours did not read as <k> of <n> with at least one active clinic \[0 of 0\]/],
        ["a reading with a fourth field", clockAt(2, "2130", "0 of 2 x"), /^STOP: the clinics' own hours did not read as <k> of <n>/],
      ]) {
        const r = await runOnce(harnessConfig(doc, "stage1", clock, shell, base), `${shell}-clinics-${label.replace(/\W+/g, "-")}`, null);
        assertStops(r, "stage1", stop, `${shell} ${label}`);
        assert.deepEqual(r.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), [], label);
      }
    }
  });
});

test("THE VERDICT PROFILES, stages 1 and 2 whole: 13 OK before; after, 13 OK, or 12 OK and 1 VACUOUS when probe_instances is 0; and no other profile passes", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [fixture, exit, stop] of [
        ["pre.out", 0, null],
        ["pre-vac.out", 0, /^STOP: the pre-check printed \[1\] VACUOUS verdicts/],
        ["pre-fail.out", 0, /^STOP: the pre-check printed \[1\] FAIL verdicts/],
        ["pre-short.out", 0, /^STOP: the pre-check printed 12 OK verdicts, not 13\. Nothing was applied$/],
        ["pre.out", 3, /^STOP: the pre-check did not complete \(psql's lines are above\), or its transcript could not be written\. Nothing was applied$/],
      ]) {
        const cfg = harnessConfig(doc, "stage1", CLOSED, shell, base);
        const r = await runOnce({ ...cfg, db: { pre: fixture, preExit: exit } }, `${shell}-profile1-${fixture}-${exit}`, null);
        const tag = `${shell} stage 1 on ${fixture}, psql exit ${exit}`;
        if (stop === null) {
          assert.equal(r.code, 0, `${tag}: ${r.out.slice(-600)}`);
          assert.match(r.out, /^the pre-check profile: 13 OK \/ 0 VACUOUS \/ 0 FAIL\. /m, tag);
          continue;
        }
        assertStops(r, "stage1", stop, tag);
        assert.equal(r.calls.filter((c) => c.id.startsWith("psql#")).length, 1, tag);
        assert.ok(!r.markersAtEnd.includes("0108-precheck.out") && !r.markersAtEnd.includes("0108-applied.ok"), tag);
      }
      for (const [preRecord, fixture, stop, profile] of [
        ["pre.out", "post.out", null, "13 OK / 0 VACUOUS"],
        ["pre-probe0.out", "post-1vac.out", null, "12 OK / 1 VACUOUS"],
        ["pre.out", "post-1vac.out", /^STOP: the post-check printed \[1\] VACUOUS verdicts, not 0, the number probe_instances allows\. A VACUOUS verdict is not a pass\. 0108 IS APPLIED and the write stands\. /],
        ["pre-probe0.out", "post.out", /^STOP: the post-check printed \[0\] VACUOUS verdicts, not 1, the number probe_instances allows\. /],
        ["pre.out", "post-2vac.out", /^STOP: the post-check printed \[2\] VACUOUS verdicts, not 0, /],
        ["pre-probe0.out", "post-2vac.out", /^STOP: the post-check printed \[2\] VACUOUS verdicts, not 1, /],
        ["pre.out", "post-short.out", /^STOP: the post-check printed \[12\] OK verdicts, not 13\. A verdict that is missing prints no FAIL\. 0108 IS APPLIED /],
        ["pre.out", "post-fail.out", /^STOP: the post-check printed \[1\] FAIL verdicts, or its transcript could not be read\. Stage 1 recorded that it applied 0108, and this read does not agree\. Treat the state as UNKNOWN\. /],
      ]) {
        const r = await runOnce({ ...harnessConfig(doc, "stage2", CLOSED, shell, base, { preRecord }), db: { post: fixture } }, `${shell}-profile2-${preRecord}-${fixture}`, null);
        const tag = `${shell} stage 2 on ${preRecord} and ${fixture}`;
        if (stop === null) {
          assert.equal(r.code, 0, `${tag}: ${r.out.slice(-600)}`);
          assert.match(r.out, new RegExp(`^0108 POST-CHECK PASSED\\. 13/13 pre-check OK, post-check ${profile} / 0 FAIL, journal 105 to 106; `, "m"), tag);
          assert.ok(r.markersAtEnd.includes("0108-stage2.ok"), tag);
          continue;
        }
        assertStops(r, "stage2", stop, tag);
        assert.equal(r.calls.filter((c) => c.id.startsWith("psql#")).length, 1, tag);
        assert.ok(!r.markersAtEnd.includes("0108-stage2.ok"), tag);
      }
    }
  });
});

test("A ZONE THAT DID NOT LOAD: every block, run whole with a clock that answers UTC, GMT or no zone, STOPS with nothing run after it", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of HARNESS_PLAN) {
        const wet = await runOnce(harnessConfig(doc, name, clockAt(2, "2130", "0 of 2", "WET"), shell, base), `${shell}-zone-${name}-WET`, null);
        assert.equal(wet.code, 0, `${shell} ${name} WET: ${wet.out.slice(-500)}`);
        for (const zone of ["UTC", "GMT", "", "west"]) {
          const r = await runOnce(harnessConfig(doc, name, clockAt(2, "2130", "0 of 2", zone), shell, base), `${shell}-zone-${name}-${zone || "none"}`, null);
          const tag = `${shell} ${name} zone [${zone}]`;
          assertStops(r, name, /^STOP: the Lisbon clock did not read as [^\n]* and the zone WET or WEST[^\n]*so the Lisbon zone may not have loaded \[/, tag);
          assert.deepEqual(credentialCalls(r), [], tag);
          assert.deepEqual(r.markersAtEnd.filter((m) => m !== "0108-check-journal.out"), [], tag);
        }
      }
    }
  });
});

test("A RECORD THAT READS EMPTY OR SHORT, and a clock call without its zone: each block STOPS on it, and the harness itself sees a date call that lost TZ=Europe/Lisbon", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      const want = {
        clock: /^STOP: stage 0's record is not a full sha\./,
        stage1: /^STOP: stage 0's record did not read as a full 40-character sha \[/,
        stage2: /^STOP: stage 0's record did not read as a full 40-character sha \[/,
        closing: /^STOP: stage 0's record did not read as a full 40-character sha \[/,
      };
      for (const [name, stop] of Object.entries(want)) {
        for (const [label, text] of [["empty", ""], ["39 characters", `${"1".repeat(39)}\n`], ["not hex", `${"g".repeat(40)}\n`]]) {
          const cfg = harnessConfig(doc, name, CLOSED, shell, base);
          const r = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0108-head.sha", text, name === "clock" ? 5 : 10); } }, `${shell}-record-${name}-${label.replace(/\W+/g, "-")}`, null);
          assertStops(r, name, stop, `${shell} ${name}, the recorded sha ${label}`);
          assert.deepEqual(credentialCalls(r), [], `${shell} ${name} ${label}`);
        }
      }
      for (const name of HARNESS_PLAN) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const stripped = cfg.block.replaceAll("$(TZ=Europe/Lisbon date ", "$(date ");
        assert.notEqual(stripped, cfg.block);
        const r = await runOnce({ ...cfg, block: stripped }, `${shell}-notz-${name}`, null);
        assert.notEqual(r.code, 0, `${shell} ${name} without TZ: ${r.out.slice(-300)}`);
        assert.match(r.unexpected, /date ran without TZ=Europe\/Lisbon/, `${shell} ${name}`);
      }
    }
  });
});

test("A READ THAT CONTRADICTS THE MARKER: stage 2 and the closing read STOP saying the state is UNKNOWN and never that 0108 is applied; the post-check's own run says which outcome means what", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [name, db, rows, start] of [
        ["stage2", { hashN: "0" }, 106, "STOP: the sha256 of 0108 is in the journal 0 times, not once. "],
        ["stage2", { hashN: "2" }, 106, "STOP: the sha256 of 0108 is in the journal 2 times, not once. "],
        ["stage2", {}, 105, "STOP: the journal reads 105 rows, not 105 plus one. "],
        ["stage2", { post: "post-fail.out" }, 106, "STOP: the post-check printed [1] FAIL verdicts, or its transcript could not be read. "],
        ["closing", {}, 105, "STOP: the journal read after the apply does not say 106. "],
        ["closing", { reader: "without-0108" }, 106, "STOP: the journal read does not list 0108 as APPLIED. "],
      ]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const r = await runOnce({ ...cfg, rows, db }, `${shell}-contra-${name}-${JSON.stringify(db).replace(/\W+/g, "-")}-${rows}`, null);
        const tag = `${shell} ${name} ${JSON.stringify(db)} rows ${rows}`;
        assert.equal(r.code, 1, `${tag}: ${r.out.slice(-500)}`);
        const stop = r.out.split("\n").filter((l) => l.startsWith("STOP: "));
        assert.equal(stop.length, 1, tag);
        assert.ok(stop[0].startsWith(`${start}${STATE_UNKNOWN}`), `${tag}: ${stop[0]}`);
        assert.ok(!stop[0].includes("IS APPLIED"), tag);
      }
      const s2cfg = harnessConfig(doc, "stage2", CLOSED, shell, base);
      const positive = await runOnce(s2cfg, `${shell}-contra-positive`, null);
      const postCall = positive.calls.find((c) => c.id.startsWith("psql#") && c.args.includes(POST));
      for (const [, row, name] of CARRY_MAP) assert.ok(postCall.args.includes(`\n${name}=${carryValue(row)}\n`), `the post-check was not handed ${name}`);
      const failed = await runOnce(s2cfg, `${shell}-contra-psql-fails`, { call: postCall.id });
      const stops = failed.out.split("\n").filter((l) => l.startsWith("STOP: "));
      assert.deepEqual(stops, [`STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. ${POST_RUN_SENTENCE}`]);
      assert.deepEqual(failed.calls.filter((c) => c.id.startsWith("psql#") && c.pos > postCall.pos), []);
      assert.ok(!failed.markersAtEnd.includes("0108-stage2.ok"));
    }
  });
});

test("THE WINDOW FEED: stage 1 refuses every run-window record it must, before psql, and passes a good one and both edges", async () => {
  await withHarness(async (base) => {
    const M = FAKE_SHA.MAIN;
    const now = CLOSED.stamp;
    assert.equal(now, "202610062130");
    for (const shell of shellsHere()) {
      for (const [name, record, stop] of [
        ["a good record", `${M} 202610062100 202610062229 202610070800`, null],
        ["now before the window opens", `${M} 202610062140 202610062229 202610070800`, /^STOP: Lisbon 202610062130 is before the run window opens at 202610062140/],
        ["now past the last minute stage 1 may start", `${M} 202610062100 202610062120 202610070800`, /^STOP: Lisbon 202610062130 is past 202610062120, the last minute/],
        ["now AT the window's end", `${M} 202610062100 202610062229 ${now}`, /^STOP: Lisbon 202610062130 is not before 202610062130, the run window's end/],
        ["a record for another sha", `${"2".repeat(40)} 202610062100 202610062229 202610070800`, /^STOP: the run window was recorded for 2{40}, not for the sha stage 0 recorded/],
        ["an 11-digit time", `${M} 20261006210 202610062229 202610070800`, /^STOP: the recorded run window did not parse/],
        ["now AT the minute the window opens", `${M} ${now} 202610062229 202610070800`, null],
        ["now AT the last minute stage 1 may start", `${M} 202610062100 ${now} 202610070800`, null],
      ]) {
        const cfg = harnessConfig(doc, "stage1", CLOSED, shell, base);
        const r = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0108-window.ok", `${record}\n`, 5); } }, `${shell}-feed-${name.replace(/\W+/g, "-")}`, null);
        if (stop === null) {
          assert.equal(r.code, 0, `${shell} ${name}: ${r.out.slice(-500)}`);
          assert.ok(r.out.includes(STAGE1), name);
        } else {
          assertStops(r, "stage1", stop, `${shell} ${name}`);
          assert.deepEqual(r.calls.filter((c) => c.id.startsWith("psql#")), [], name);
        }
      }
    }
  });
});

test("THE APPLIED MARKER: one from this sitting stops stages 0 and 1 and the two dispatch blocks; one 13 hours old stops none of them", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["stage0", "stage1"]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        for (const [age, stops] of [[719, true], [780, false]]) {
          const r = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0108-applied.ok", "", age); } }, `${shell}-${name}-age-${age}`, null);
          if (stops) {
            assertStops(r, name, /^STOP: stage 1 has ALREADY APPLIED 0108 in this sitting/, `${shell} ${name} ${age}`);
            assert.deepEqual(r.calls.filter((c) => c.id.startsWith("git#")), []);
          } else assert.equal(r.code, 0, `${shell} ${name} ${age}: ${r.out.slice(-600)}`);
        }
        const fresh = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); rmSync(join(tmp, "0108-applied.ok"), { force: true }); } }, `${shell}-${name}-nomarker`, null);
        assert.equal(fresh.code, 0, `${shell} ${name}, no marker at all: ${fresh.out.slice(-500)}`);
      }
      for (const name of ["bys", "clock"]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const young = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0108-applied.ok", "", 719); } }, `${shell}-${name}-marker-719`, null);
        assertStops(young, name, /^STOP: 0108 was applied in this sitting \([^)]*0108-applied\.ok is there and under 12 hours old\), or its age could not be read\. /, `${shell} ${name}`);
        assert.deepEqual(young.calls.filter((c) => /^(git|sntp|curl)#/.test(c.id)), [], `${shell} ${name}: it went on after the marker`);
        const old = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0108-applied.ok", "", 780); } }, `${shell}-${name}-marker-780`, null);
        assert.equal(old.code, 0, `${shell} ${name}, a marker 13 hours old: ${old.out.slice(-500)}`);
      }
    }
  });
});

test("A PINNED FILE THAT DIFFERS OR IS NOT THERE: every pin a block assigns is compared, and the block STOPS on it before anything runs with credentials", async () => {
  for (const b of blocksOf(doc)) assert.deepEqual(pinComparedProblems(b), []);
  assert.deepEqual(HARNESS_PLAN.map((n) => pinsOf(blockWith(doc, HARNESS_BLOCKS[n].marker)).length), [9, 9, 0, 6, 4, 2]);
  const s1 = blockWith(doc, STAGE1);
  const preCompare = s1.split("\n").find((l) => l.includes('= "${SHAPRE}" ] || '));
  assert.deepEqual(pinComparedProblems(s1.replace(`${preCompare}\n`, "")), ["SHAPRE is assigned and compared 0 times, not once"]);
  const cases = HARNESS_PLAN.flatMap((name) => pinsOf(blockWith(doc, HARNESS_BLOCKS[name].marker)).flatMap((pin) => ["differs", "is missing"].map((kind) => ({ name, pin, kind }))));
  assert.equal(cases.length, 60);
  await inPool(cases, Number(process.env.HARNESS_POOL) || Math.max(2, Math.floor(cpus().length / 2)), async ({ name, pin, kind }) => {
    await withHarness(async (base) => {
      for (const shell of shellsHere()) {
        const tag = `${shell} ${name}: the file of ${pin} ${kind}`;
        const r = await runOnce(harnessConfig(doc, name, CLOSED, shell, base), `${shell}-pin-${name}-${pin}`, null);
        assertStops(r, name, /^STOP: /, tag);
        assert.deepEqual(credentialCalls(r), [], `${tag}: it ran something with credentials first`);
        assert.deepEqual(r.markersAtEnd, [], `${tag}: it wrote a record`);
      }
    }, (apply) => {
      const f = join(apply, PIN_FILES[pin]);
      if (kind === "differs") writeFileSync(f, `${readFileSync(f, "utf8")}\n`);
      else rmSync(f);
    });
  });
});

test("WHAT STAGES 0 AND 1 FIND ON DISK: a journal wrong in one fact, a second file under a number, a worktree that is not clean and a checkout that left HEAD where it was each STOP", async () => {
  const good = journalAsOf0108(JSON.parse(read(JOURNAL)));
  const edit = (fn) => { const j = structuredClone(good); fn(j.entries); return j; };
  const last = (e) => e[e.length - 1];
  const prev = (e) => e[e.length - 2];
  for (const [what, journal] of [
    ["107 entries", edit((e) => { e.unshift({ idx: -1, version: e[0].version, when: 0, tag: "0000_before", breakpoints: true }); })],
    ["the newest entry's idx", edit((e) => { last(e).idx = 106; })],
    ["the newest entry's tag", edit((e) => { last(e).tag = `${TAG}_other`; })],
    ["the newest entry's when", edit((e) => { last(e).when += 1; })],
    ["the tag of the entry before it", edit((e) => { prev(e).tag = "0107_other"; })],
    ["the when of the entry before it", edit((e) => { prev(e).when += 1; })],
  ]) {
    await withHarness(async (base) => {
      for (const shell of shellsHere()) {
        const r = await runOnce(harnessConfig(doc, "stage0", CLOSED, shell, base), `${shell}-journal`, null);
        assertStops(r, "stage0", /^STOP: the newest journal entry is not idx 105, tag 0108_pack_instance_consuming_sessions, when 1788502900000, of 106, after idx 104 tagged 0107_record_annulments_insert_policy at when 1788502800000$/, `${shell}: ${what}`);
        assert.deepEqual(r.calls.filter((c) => c.id.startsWith("date#") || c.args.startsWith("scripts/check-journal.mjs")), [], what);
      }
    }, (apply) => writeFileSync(join(apply, JOURNAL), `${JSON.stringify(journal, null, 2)}\n`));
  }
  for (const [extra, names] of [["0108_other.sql", ["stage0", "stage1"]], ["0107_other.sql", ["stage0"]]]) {
    await withHarness(async (base) => {
      for (const shell of shellsHere()) {
        for (const name of names) {
          const r = await runOnce(harnessConfig(doc, name, CLOSED, shell, base), `${shell}-second-${name}`, null);
          assertStops(r, name, new RegExp(`^STOP: 2 files claim migration number ${extra.slice(0, 4)}, not 1$`), `${shell} ${name} with ${extra}`);
          assert.deepEqual(credentialCalls(r), []);
        }
      }
    }, (apply) => writeFileSync(join(apply, "packages/db/migrations", extra), "SELECT 1;\n"));
  }
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "stage0", "stage1"]) {
        const cfg = harnessConfig(doc, name, CLOSED, shell, base);
        const dirty = await runOnce({ ...cfg, git: { stray: " M docs/migration-apply-0108.md" } }, `${shell}-dirty-${name}`, null);
        assertStops(dirty, name, /^STOP: the apply worktree is not clean/, `${shell} ${name}, a dirty worktree`);
        assert.match(dirty.out, /^ M docs\/migration-apply-0108\.md$/m);
      }
      for (const [name, stop] of [
        ["bys", /^STOP: the apply worktree is not on the held head after the checkout\. /],
        ["stage0", /^STOP: the worktree is not on the held head after the checkout\. Nothing was applied$/],
        ["stage1", /^STOP: the worktree is not on the recorded sha after the checkout\. Nothing was applied$/],
        ["stage2", /^STOP: the worktree is not on the recorded sha after the checkout\. 0108 IS APPLIED and the write stands\. /],
      ]) {
        const r = await runOnce({ ...harnessConfig(doc, name, CLOSED, shell, base), git: { checkout: "stuck" } }, `${shell}-stuck-${name}`, null);
        assertStops(r, name, stop, `${shell} ${name}, a checkout that did not move HEAD`);
        assert.deepEqual(credentialCalls(r), []);
      }
      for (const name of ["closing"]) {
        const r = await runOnce({ ...harnessConfig(doc, name, CLOSED, shell, base), initialHead: FAKE_SHA.BEFORE }, `${shell}-elsewhere-${name}`, null);
        assertStops(r, name, /the apply worktree is not on the sha stage 0 recorded\. 0108 IS APPLIED and the write stands\. /, `${shell} ${name}, HEAD elsewhere`);
        assert.deepEqual(credentialCalls(r), []);
      }
      // BEFORE YOU START and the CLOCK CHECK hold the held branch to the sha the dispatch names and to each other.
      const moved = await runOnce({ ...harnessConfig(doc, "bys", CLOSED, shell, base, { fill: { HELD: "2".repeat(40) } }) }, `${shell}-bys-moved`, null);
      assertStops(moved, "bys", /^STOP: the held head is not the commit this block names \(2{40}\): the branch was pushed to since the READY line, or it is gone\./, `${shell} BEFORE YOU START, another held head`);
      const c = harnessConfig(doc, "clock", CLOSED, shell, base);
      const split = await runOnce({ ...c, setup: (tmp) => { c.setup(tmp); putRecord(tmp, "0108-start-head.sha", `${"2".repeat(40)}\n`, 10); } }, `${shell}-clock-split`, null);
      assertStops(split, "clock", /^STOP: the held head moved between BEFORE YOU START and stage 0: the branch was pushed to during the sitting\. /, `${shell} CLOCK CHECK, two heads`);
      const order = await runOnce({ ...c, setup: (tmp) => { c.setup(tmp); putRecord(tmp, "0108-start-head.sha", `${FAKE_SHA.MAIN}\n`, 2); } }, `${shell}-clock-order`, null);
      assertStops(order, "clock", /^STOP: stage 0's record is not newer than BEFORE YOU START's/, `${shell} CLOCK CHECK, out of order`);
      const wrongDoc = await runOnce({ ...harnessConfig(doc, "clock", CLOSED, shell, base, { fill: { DOCSHA: "c".repeat(64) } }) }, `${shell}-clock-doc`, null);
      assertStops(wrongDoc, "clock", /^STOP: the document at the recorded sha is not the approved one\. /, `${shell} CLOCK CHECK, another document`);
      const wrongBys = await runOnce({ ...harnessConfig(doc, "bys", CLOSED, shell, base, { fill: { DOCSHA: "c".repeat(64) } }) }, `${shell}-bys-doc`, null);
      assertStops(wrongBys, "bys", /^STOP: the document at the held head is not the approved one\. /, `${shell} BEFORE YOU START, another document`);
      assert.deepEqual(credentialCalls(wrongBys), []);
    }
  });
});

test("BETWEEN THE STAGES: the window's end in stage 2 and the closing read; a clock that moved on during stage 1; and what stage 2 and the closing read are handed", async () => {
  await withHarness(async (base) => {
    const M = FAKE_SHA.MAIN;
    const now = CLOSED.stamp;
    const day = now.slice(0, 8);
    const fx = harnessFixtures();
    const rowOf = (name) => fx["pre.out"].split("\n").find((l) => l.trimStart().startsWith(`${name} `));
    for (const shell of shellsHere()) {
      const run = (name, id, over = {}) => {
        const cfg = harnessConfig(doc, name, over.clock ?? CLOSED, shell, base);
        const { records, ...rest } = over;
        return runOnce({ ...cfg, ...rest, setup: (tmp) => { cfg.setup(tmp); records?.(tmp); } }, `${shell}-between-${id}`, null);
      };
      const window = (text) => (tmp) => putRecord(tmp, "0108-window.ok", `${text}\n`, 15);
      for (const name of ["stage2", "closing"]) {
        const atEnd = await run(name, `${name}-end`, { records: window(`${M} ${day}2100 ${day}2229 ${now}`) });
        assertStops(atEnd, name, new RegExp(`Lisbon ${now} is at or past ${now}, the end of the run window\\. 0108 IS APPLIED and the write stands\\. `), `${shell} ${name}, now AT the window's end`);
        assert.deepEqual(credentialCalls(atEnd), [], name);
        const before = await run(name, `${name}-before-end`, { records: window(`${M} ${day}2100 ${day}2229 ${day}2131`) });
        assert.equal(before.code, 0, `${shell} ${name}, one minute before the end: ${before.out.slice(-400)}`);
      }
      const feed = window(`${M} ${day}2100 ${day}2200 209912310000`);
      const moved = await run("stage1", "moved", { clock: { ...CLOSED, laterFrom: 2, later: `${day}2201` }, records: feed });
      assertStops(moved, "stage1", new RegExp(`^STOP: Lisbon ${day}2201 is past ${day}2200 after the pre-check, so the apply does not start\\. Nothing was applied$`), `${shell}: the clock moved on`);
      assert.deepEqual(moved.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), []);
      const zone2 = await run("stage1", "zone2", { clock: { ...CLOSED, zoneAt: "date#2", zoneBad: "UTC" } });
      assertStops(zone2, "stage1", /again before the apply, so the Lisbon zone may not have loaded/, `${shell}: the second read in UTC`);
      const preOut = (text) => (tmp) => putRecord(tmp, "0108-precheck.out", text, 6);
      const swapRow = (name, fn) => { const row = rowOf(name); assert.ok(row, name); return fx["pre.out"].replace(`${row}\n`, () => { const to = fn(row); return to === "" ? "" : `${to}\n`; }); };
      const handed = [
        ["the applied marker 70 minutes old", { records: (tmp) => putRecord(tmp, "0108-applied.ok", "", 70) }, /^STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago\. If stage 1 ended with its line 0108 APPLIED, then /],
        ["the transcript 70 minutes old", { records: (tmp) => putRecord(tmp, "0108-precheck.out", fx["pre.out"], 70) }, /^STOP: stage 1's transcript is over an hour old; it is not this sitting's\. 0108 IS APPLIED and the write stands\. /],
        ["a count carry that is not a number", { records: preOut(swapRow("policies_before", (r) => r.replace("| 108", "| x08"))) }, /^STOP: a count carry is not a number\. 0108 IS APPLIED and the write stands\. /],
        ["an md5 carry one character short", { records: preOut(swapRow("policies_md5", (r) => r.replace(/\| ([0-9a-f]{31})[0-9a-f]/, "| $1"))) }, /^STOP: an md5 carry is not 32 hex characters\. 0108 IS APPLIED and the write stands\. /],
        ...CARRY_MAP.map(([, c]) => [`the carry row ${c} missing`, { records: preOut(swapRow(c, () => "")) }, /^STOP: a carry did not parse out of the transcript\. 0108 IS APPLIED and the write stands\. /]),
      ];
      for (const [what, over, stop] of handed) {
        const r = await run("stage2", `handed-${what.replace(/\W+/g, "-")}`, over);
        assertStops(r, "stage2", stop, `${shell} stage 2, ${what}`);
        assert.deepEqual(credentialCalls(r), [], what);
      }
      for (const [what, over, stop, readerRan] of [
        ["no applied marker", { records: (tmp) => rmSync(join(tmp, "0108-applied.ok")) }, /^STOP: stage 1 left no applied marker\. If stage 1 ended with its line 0108 APPLIED, then /, false],
        ["a pass mark older than the apply", { records: (tmp) => putRecord(tmp, "0108-stage2.ok", `${M}\n`, 20) }, /^STOP: stage 2's pass mark is older than the apply\. 0108 IS APPLIED and the write stands\. /, false],
        ["a later migration pending on the recorded sha", { db: { reader: "pending-later" } }, /^STOP: the journal read finds a migration pending on the recorded sha\. 0108 IS APPLIED /, true],
        ["a journal row with no matching file", { db: { reader: "orphan-row" } }, /^STOP: the journal holds a row with no matching file on the recorded sha\. 0108 IS APPLIED /, true],
      ]) {
        const r = await run("closing", `closing-${what.replace(/\W+/g, "-")}`, over);
        assertStops(r, "closing", stop, `${shell} closing, ${what}`);
        assert.equal(credentialCalls(r).length, readerRan ? 1 : 0, what);
      }
    }
  });
});

/** A `date` on PATH that is the REAL date at one fixed instant: GNU's `-d @epoch`, or BSD's `-r epoch`. It keeps the caller's TZ. */
function fixedDateDir(realDate) {
  const dir = mkdtempSync(join(tmpdir(), "real-date-0108-"));
  writeFileSync(join(dir, "date"), `#!/bin/sh\nif ${shq(realDate)} -d @0 +%s >/dev/null 2>&1; then exec ${shq(realDate)} -d "@$FIXED_EPOCH" "$@"; fi\nexec ${shq(realDate)} -r "$FIXED_EPOCH" "$@"\n`);
  chmodSync(join(dir, "date"), 0o755);
  return dir;
}

test("THE REAL date, at fixed instants, through the blocks' own clock lines: the Lisbon reading, summer and winter, and a zone that is not Lisbon's STOPS", () => {
  const dir = fixedDateDir(realPath("date"));
  try {
    const epoch = (iso) => String(Date.parse(iso) / 1000);
    const run = (script, iso) => spawnSync("bash", ["--noprofile", "--norc", "-c", script], { encoding: "utf8", env: { PATH: `${dir}:${SYSTEM_PATH}`, TZ: "Asia/Tokyo", FIXED_EPOCH: epoch(iso), LANG: "C" } });
    const s0 = blockWith(doc, STAGE0);
    const five = [CLOCK_READ, CLOCK_ZONE, CLOCK_SPLIT, CLOCK_FORMAT, CLOCK_DECIDE];
    for (const l of five) assert.ok(s0.split("\n").includes(l));
    const clock = `${five.join("\n")}\necho "READ \${DTZ} \${DT} \${CLOCK}"\n`;
    for (const [iso, want] of [
      ["2026-10-19T19:59:00Z", "READ 12059 WEST 12059 open"], ["2026-10-19T20:00:00Z", "READ 12100 WEST 12100 closed"],
      ["2026-10-24T11:59:00Z", "READ 61259 WEST 61259 open"], ["2026-10-24T12:00:00Z", "READ 61300 WEST 61300 closed"],
      ["2026-10-26T07:59:00Z", "READ 10759 WET 10759 closed"], ["2026-10-26T08:00:00Z", "READ 10800 WET 10800 open"],
    ]) {
      const r = run(clock, iso);
      assert.equal(r.status, 0, `${iso}: ${r.stdout}${r.stderr}`);
      assert.equal(r.stdout.trim(), want, iso);
    }
    const typo = run(clock.replace("TZ=Europe/Lisbon date", "TZ=Europe/Lisbonn date"), "2026-10-19T07:30:00Z");
    assert.equal(typo.status, 1, typo.stdout);
    assert.match(typo.stdout, /^STOP: the Lisbon clock did not read as a weekday \(1 to 7\), HHMM and the zone WET or WEST/m);
    // The dispatch blocks' one read: YYYYMMDDHHMM, the weekday and the zone, in one call.
    const b = blockWith(doc, BYS).split("\n");
    const at = b.findIndex((l) => l.startsWith("NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z')"));
    const four = `${b.slice(at, at + 4).join("\n")}\necho "READ \${NOWL} \${DOW}"\n`;
    assert.equal(run(four, "2026-10-19T20:30:00Z").stdout.trim(), "READ 202610192130 1");
    assert.equal(run(four, "2026-12-27T15:00:00Z").stdout.trim(), "READ 202612271500 7");
    const bad = run(four.replace("TZ=Europe/Lisbon date", "TZ=Europe/Lisbonn date"), "2026-10-19T20:30:00Z");
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST/m);
    for (const marker of [STAGE1, STAGE2, CLOSING]) {
      const lines = blockWith(doc, marker).split("\n");
      const i = lines.findIndex((l) => l.startsWith("NOWZ=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %Z')"));
      assert.ok(i > 0, marker);
      const reads = `${lines.slice(i, i + 4).join("\n")}\necho "READ \${NOWL}"\n`;
      assert.equal(run(reads, "2026-10-19T20:05:00Z").stdout.trim(), "READ 202610192105", marker);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

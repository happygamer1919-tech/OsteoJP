// 0111 (Sistemas and SubSistemas: the health_systems list and two fields on the patient): the migration, its two check files and the apply
// document agree with each other, byte for byte where it matters; every halt in the document's six GREEN
// blocks is explicit, proven by fault injection; the document's clock is the weekday table and, in the
// two dispatch blocks, strategy's start windows; no apply window may end inside a repeated hour; every
// GREEN block runs from the pull request's HELD head, never from main; and BEFORE YOU START refuses a copy
// of the document whose first line still says NOT READY.
//
// This file is 0109's test (scripts/location-saturday-hours-0109.test.mjs, #1682 at 2a32af7d) re-keyed by
// machine: the number, the files, the pins, the journal position, the carries and the verdict profiles
// changed, the held head moved to origin/db/RODICA-sistemas-subsistemas, and the parts that belong to one migration
// (its shape, its comments, the readings both check files share) written for this one. 0109 was written
// at its number; this migration is PROMOTED on the stack above #1704 (strategy's C3, 2026-11-05),
// so this file also holds the promotion's block A' (the stacked merge) to its pins and proves its halts by
// the same fault injection, and it holds THE CHAIN GATE: BEFORE YOU START refuses to start unless
// production's journal reads exactly the count this sitting expects, so a sitting cannot start after the
// previous one in the chain halted before its COMMIT (C1, C2).
//
// WHAT IT DOES NOT PROVE: that any of it runs against a database. That is the rehearsal
// (docs/migration-apply-0111.md, "What must happen first" and "NOT REHEARSED").
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
const md5 = (s) => createHash("md5").update(s).digest("hex");

const MIGRATION_SHA = "e9afe529bd29133cd22e7824c03ac20e639b958759a7e7f9697f50c15511c94f";
const TAG = "0111_sistemas_subsistemas";
const PREV_TAG = "0110_services_booking_type_fields";
const MIGRATION_PATH = `packages/db/migrations/${TAG}.sql`;
const PREV_PATH = `packages/db/migrations/${PREV_TAG}.sql`;
const JOURNAL = "packages/db/migrations/meta/_journal.json";
const PRE = "scripts/db/precheck-0111-sistemas-subsistemas.sql";
const POST = "scripts/db/postcheck-0111-sistemas-subsistemas.sql";
/** Removed before the rehearsal (the coordinator, 2026-10-31); a test holds it gone. */
const PROBE = "scripts/db/probe-0111-sistemas-subsistemas.sql";
const DOC = "docs/migration-apply-0111.md";
const SIDECAR = "docs/migration-apply-0111.sha256";
const GATE_FILE = "scripts/migration-timeouts.test.mjs";
const BRANCH = "origin/db/RODICA-sistemas-subsistemas";
/** The document's first line until SOLO's READY line removes it. */
export const NOT_READY_LINE = "NOT READY: awaiting the R4 re-check of the 2026-11-05 R4 fixes, the independent rehearsal of the whole chain on the final bytes (C3), and SOLO's READY line (block D). For 0111 that rehearsal is a HARD READY condition: it reads verdict 8's index definition on the final bytes, which only a builder's local apply has read so far. Done: the stacked promotion, the document set in the repository, the fault-injection script test, and the R4 of the chain-night changes (PASS).";

/** The pins of files this branch does not own, as they read on main when the document was written. */
export const EXTERNAL_PINS = Object.freeze({
  SHAPREV: "e0e4a9e8cb2de52b6888826c9fde4e64c62e2f83c11152af77fa6692832e627e",
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

/** The rules every migration of the chain keeps, each with its own message. [] when it passes. */
function commonShapeProblems(stmts, n, bounds) {
  const problems = [];
  if (stmts[0] !== "SET LOCAL lock_timeout = '5s';") problems.push("statement 1 is not exactly SET LOCAL lock_timeout = '5s';");
  if (stmts[1] !== "SET LOCAL statement_timeout = '60s';") problems.push("statement 2 is not exactly SET LOCAL statement_timeout = '60s';");
  if (bounds === 3 && stmts[2] !== "SET LOCAL idle_in_transaction_session_timeout = '15s';") problems.push("statement 3 is not exactly SET LOCAL idle_in_transaction_session_timeout = '15s';");
  if (stmts.slice(bounds).some((s) => /\b(lock_timeout|statement_timeout|idle_in_transaction_session_timeout)\b/i.test(s))) problems.push("a later statement names a bound");
  if (stmts.some((s) => /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE|RESET|DISCARD)\b/i.test(s))) problems.push("a statement is transaction control, RESET or DISCARD");
  if (stmts.length !== n) problems.push(`${stmts.length} statements, not ${n}`);
  return problems;
}
/** The text of each COMMENT, keyed by its target, its adjacent literals joined as Postgres joins them. */
export function commentsOf(sql) {
  const out = {};
  for (const m of sql.matchAll(/COMMENT ON (?:COLUMN|TABLE) ([\w.]+) IS\s*((?:'(?:[^']|'')*'\s*)+);/g)) {
    out[m[1]] = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replaceAll("''", "'")).join("");
  }
  return out;
}
/** 0111's shape: three bounds, the health_systems table with its index, comment, RLS, grants and FK, two patient columns and their comments, three policies. */
export const SHAPE_0111 = Object.freeze([
  /^CREATE TABLE public\.health_systems \( /, /^CREATE UNIQUE INDEX health_systems_tenant_name_key ON public\.health_systems /, /^COMMENT ON TABLE public\.health_systems IS '/,
  /^ALTER TABLE public\.health_systems ENABLE ROW LEVEL SECURITY;$/, /^REVOKE ALL ON TABLE public\.health_systems FROM PUBLIC, anon, authenticated, patient, service_role;$/,
  /^GRANT SELECT, INSERT ON TABLE public\.health_systems TO authenticated;$/, /^GRANT UPDATE \(name, active\) ON TABLE public\.health_systems TO authenticated;$/,
  /^ALTER TABLE public\.health_systems ADD CONSTRAINT health_systems_tenant_id_fkey FOREIGN KEY \(tenant_id\) REFERENCES /,
  /^ALTER TABLE public\.patients ADD COLUMN health_system_id uuid, ADD COLUMN health_system_number text, ADD CONSTRAINT /,
  /^COMMENT ON COLUMN public\.patients\.health_system_id IS '/, /^COMMENT ON COLUMN public\.patients\.health_system_number IS '/,
  /^CREATE POLICY health_systems_staff_select ON public\.health_systems AS PERMISSIVE FOR SELECT TO authenticated /,
  /^CREATE POLICY health_systems_manager_insert ON public\.health_systems AS PERMISSIVE FOR INSERT TO authenticated /,
  /^CREATE POLICY health_systems_manager_update ON public\.health_systems AS PERMISSIVE FOR UPDATE TO authenticated /,
]);
export function migrationProblems(sql) {
  const stmts = statementsOf(sql);
  const problems = commonShapeProblems(stmts, 17, 3);
  SHAPE_0111.forEach((re, i) => { if (!re.test(stmts[3 + i] ?? "")) problems.push(`statement ${4 + i} is not the one reviewed (${re.source.slice(1, 50)})`); });
  const code = stmts.map(unquoted).join("\n");
  if (/\b(DROP|TRUNCATE|COPY|MERGE|SEQUENCE|TRIGGER|FUNCTION|OWNER|SECURITY DEFINER)\b/i.test(code) || /\bDO \$/.test(code)
    || /\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET)\b/i.test(code)) problems.push("a DROP, TRUNCATE, COPY, MERGE, SEQUENCE, TRIGGER, FUNCTION, OWNER, SECURITY DEFINER, DO block or row write in the code");
  if ((code.match(/\bCREATE POLICY\b/g) ?? []).length !== 3) problems.push("not exactly three CREATE POLICY");
  if ((code.match(/\bGRANT\b/g) ?? []).length !== 2) problems.push("not exactly two GRANT");
  if (/\bTO (anon|patient|service_role|PUBLIC)\b/.test(code.replace(/FROM PUBLIC, anon, authenticated, patient, service_role/, ""))) problems.push("a grant or policy to a role other than authenticated");
  return problems;
}

/** A read-only check file writes nothing: no code line begins with a writing verb, and no string is a writing statement. */
export function writeProblems(sql) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    if (/^SET LOCAL (row_security = off|search_path = public);$/.test(t)) continue;
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET|RESET|START)\b/i.test(t)) {
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

/** The text between `start` and the line that opens `end`, used to hold the two files to the same reading. */
export function between(sql, start, end) {
  const a = sql.indexOf(start);
  const b = sql.indexOf(end, a);
  return a < 0 || b < 0 ? null : sql.slice(a, b);
}
/** The readings both files must make by the same text: [name, start, end]. */
export const SHARED_READINGS = Object.freeze([
  ["the shape of the altered table", "), shape_items AS (", "\n), "],
  ["every relation privilege", "    (SELECT md5(coalesce(string_agg(\n              rel || ':' || kind", "AS rel_md5"],
  ["the journal", "DO $journal$", "$journal$;"],
]);

/** The journal reads that DECIDE a verdict name the pinned sha256s in code. */
export const JOURNAL_USING = `    USING '${MIGRATION_SHA}',\n          '${EXTERNAL_PINS.SHAPREV}';`;
export function journalPinProblems(sql, which) {
  const problems = [];
  const code = codeOf(sql);
  if (!code.includes(JOURNAL_USING)) problems.push("the journal count does not take the pinned sha256s of 0111 and 0110");
  const want = which === "pre"
    ? ["CASE WHEN journal_state = 'read' AND has_new = 0 AND has_prev = 1 THEN 'OK' ELSE 'FAIL' END FROM j",
      `         CASE WHEN journal_state = 'read' AND newest_hash = '${EXTERNAL_PINS.SHAPREV}'\n                   AND newest_when = '1788503200000' THEN 'OK' ELSE 'FAIL' END FROM j`,
      "CASE WHEN journal_state = 'read' AND journal_rows = 108 THEN 'OK' ELSE 'FAIL' END FROM j"]
    : [`         CASE WHEN journal_state = 'read' AND has_new = 1 AND has_prev = 1\n                   AND newest_hash = '${MIGRATION_SHA}'\n                   AND newest_when = '1788503300000' THEN 'OK' ELSE 'FAIL' END FROM j`,
      "CASE WHEN journal_state = 'read' AND journal_rows = :journal_rows_before + 1 THEN 'OK' ELSE 'FAIL' END FROM j"];
  for (const w of want) if (!code.includes(w)) problems.push(`the ${which}-check does not decide its journal verdict as reviewed: ${w.trim().slice(0, 60)}`);
  return problems;
}

/** The rows a check file prints, read off its final UNION: each row's name and every literal its last column can hold. */
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

/** A ZERO COMPARAND IS NOT A PASS. See 0110's test for the reasoning. */
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

/** The fenced blocks GREEN pastes: the fences whose opening line is exactly three backticks. */
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

const OWN_PINS = ["SHA0111", "SHAPRE", "SHAPOST"];
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
  const own = { SHA0111: actual.migration, SHAPRE: actual[PRE], SHAPOST: actual[POST] };
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
  SHA0111: MIGRATION_PATH, SHAPREV: PREV_PATH, SHAPRE: PRE, SHAPOST: POST,
  SHAVM: "packages/db/scripts/verified-migrate.mjs", SHAGUARD: "scripts/assert-production-target.mjs",
  SHAPTM: "scripts/production-target.mjs", SHAREADER: "packages/db/scripts/read-applied-migrations.mjs", SHACJ: "scripts/check-journal.mjs",
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

/** THE ONLY WRITE IS verified-migrate: it runs once, every psql call opens READ ONLY, none commits, and no block holds a SQL writing verb. */
export function onlyWriteProblems(blocks) {
  const problems = [];
  const lines = blocks.flatMap((b) => b.split("\n"));
  const vm = lines.filter((l) => l.includes("verified-migrate.mjs --"));
  if (vm.length !== 1) problems.push(`verified-migrate runs ${vm.length} times, not once`);
  for (const l of lines) {
    if (!/(^|[ (])psql "/.test(l)) continue;
    if ((l.match(/(^|[ (])psql "/g) ?? []).length !== 1) problems.push(`two psql calls on one line: ${l.slice(0, 90)}`);
    if (/-c "(commit|end)"/i.test(l)) problems.push(`a psql call that commits: ${l.slice(0, 90)}`);
    if (!l.includes('-c "begin read only"')) problems.push(`a psql call that is not READ ONLY: ${l.slice(0, 90)}`);
  }
  for (const l of lines) {
    const sqlWrite = /\b(GRANT|REVOKE|INSERT INTO|DELETE FROM|UPDATE public|TRUNCATE|DROP|COMMIT|ALTER (TABLE|DEFAULT|ROLE|SEQUENCE|POLICY)|CREATE (TABLE|SEQUENCE|POLICY|FUNCTION|INDEX|ROLE))\b/.exec(l.replace(/echo "[^"]*"/g, ""));
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
export const DISPATCH_DECIDE = `if awk -v s="\${DOW}\${LT}" '${CLOCK_AWK}'; then CLOCK=closed; else CLOCK=open; fi`;
export const START_WINDOW_LINE = 'if [ "${DOW}" = 7 ]; then SOPEN=${DAY}0000; SSTART=${NEXT}0629; SEND=${NEXT}0800; elif awk -v t="${LT}" \'BEGIN { t += 0; if (t >= 2100 && t <= 2229) exit 0; exit 1 }\'; then SOPEN=${DAY}2100; SSTART=${DAY}2229; SEND=${NEXT}0800; elif awk -v t="${LT}" \'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }\'; then SOPEN=${PREV}2100; SSTART=${DAY}0629; SEND=${DAY}0800; fi';

export const WINDOW_END_AWK = "BEGIN { y = substr(w, 1, 4) + 0; m = substr(w, 5, 2) + 0; d = substr(w, 7, 2) + 0; h = substr(w, 9, 2) + 0; if (m < 10 || m > 10 || d < 25 || h < 1 || h > 1) exit 0; if (m < 3) { m += 12; y -= 1 } k = y % 100; j = int(y / 100); z = (d + int(13 * (m + 1) / 5) + k + int(k / 4) + int(j / 4) + 5 * j) % 7; if (z == 1) exit 1; exit 0 }";
export const windowEndLineStart = `if awk -v w="\${WEND}" '${WINDOW_END_AWK}'; then echo "window end:    \${WEND} happens once on the Lisbon clock`;
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
  if (!lines.includes("D2=no")) problems.push("no D2=no line");
  if (!lines.includes("D3=no")) problems.push("no D3=no line");
  if ((block.match(/\bD2=/g) ?? []).length !== 1 || /D2=yes/.test(block)) problems.push("something can turn proof 2 to yes");
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
    if (!block.includes("(opens_at < time '08:00' or closes_at > time '21:00' or opens_at is null or closes_at is null)")) problems.push("stage 1 does not hold the clinics' own rows against the table's widest row, counting a clinic whose hours are not set");
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
export const WRITE_STANDS = "0111 IS APPLIED and the write stands. Run nothing again, not stage 0 and not stage 1";
const WRITE_STANDS_IF = `If stage 1 ended with its line 0111 APPLIED, then ${WRITE_STANDS}`;
const STOP_TEXT = /echo "STOP: ([^"]+)"/;
export const STATE_UNKNOWN = "Stage 1 recorded that it applied 0111, and this read does not agree. Treat the state as UNKNOWN. Run nothing again, not stage 0 and not stage 1, and report";
export const POST_RUN_START = 'psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -v journal_rows_before=';
export const POST_RUN_SENTENCE = "If psql's lines say a relation or a column does not exist, this read does not agree with stage 1's marker and the state is UNKNOWN; otherwise this read confirmed nothing and contradicted nothing. Run nothing again, not stage 0 and not stage 1, and report this whole output; the lead rules";
export const CONTRADICTING_READS = Object.freeze({
  stage2: ['[ "${FAILS}" = 0 ] || ', '[ "${JA}" = "$((J + 1))" ] || ', '[ "${HN}" = 1 ] || '],
  closing: ["grep -qx 'journal rows on production: 109' ", "grep -qE '^[[:space:]]*APPLIED[[:space:]]+0111_sistemas_subsistemas[.]sql$' "],
});
/** Every STOP of a block that runs after the commit says what stands. */
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
      else if (m[1].includes("IS APPLIED")) problems.push(`line ${i + 1}: the post-check's own STOP says 0111 IS APPLIED though its read can contradict it`);
      return;
    }
    if (contradicting.some((start) => l.startsWith(start))) {
      if (i <= marker) problems.push(`line ${i + 1}: a contradicting read before the block has read the applied marker`);
      else if (!m[1].includes(STATE_UNKNOWN)) problems.push(`line ${i + 1}: a STOP whose own read can contradict the marker does not say the state is UNKNOWN: ${m[1].slice(0, 60)}`);
      else if (m[1].includes("IS APPLIED")) problems.push(`line ${i + 1}: a STOP says 0111 IS APPLIED while its own read says otherwise`);
      return;
    }
    if (m[1].includes("Treat the state as UNKNOWN")) problems.push(`line ${i + 1}: a STOP calls the state UNKNOWN though its own read contradicts nothing`);
    else if (!m[1].includes(WRITE_STANDS)) problems.push(`line ${i + 1}: a post-commit STOP that does not say the write stands: ${m[1].slice(0, 70)}`);
    else if (i <= marker && !m[1].includes(WRITE_STANDS_IF)) problems.push(`line ${i + 1}: a STOP says 0111 is applied before the block has read the applied marker`);
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

const SHA_VARS = ["TIP", "REC", "NOW", "HD", "WREC", "S2", "HELD", "START"];
const hexCheckOf = (v) => `echo "\${${v}}" | grep -qxE '[0-9a-f]{40}' || { echo "STOP: `;
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
    : lines.some((l) => /^shasum -a 256 -c (\$\{DOCPIN\}|docs\/migration-apply-0111\.sha256) \|\| \{ echo "STOP: /.test(l));
  if (!asserts) problems.push("the block does not assert the document");
  return problems;
}

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

/** The 10 carries the post-check takes: [the variable stage 2 holds it in, the pre-check row it reads, the post-check's -v name]. */
export const CARRY_MAP = Object.freeze([
  ["J", "journal_rows_before", "journal_rows_before"], ["PB", "policies_before", "policies_before"], ["PM", "policies_md5", "policies_md5"], ["RM", "relation_acl_md5", "relation_acl_md5"], ["TB", "tables_before", "tables_before"], ["PR", "patients_rows", "patients_rows"], ["PS", "patients_shape_md5", "patients_shape_md5"], ["NG", "nif_grants_md5", "nif_grants_md5"], ["PF", "patients_filenode", "patients_filenode"], ["TU", "tenants_users_shape_md5", "tenants_users_shape_md5"],
]);
export const CARRY_FUNCTION = `carry() { awk -F'|' -v k="$1" '{ a = $1; gsub(/^[ \\t]+|[ \\t]+$/, "", a); if (a == k) { b = $2; gsub(/^[ \\t]+|[ \\t]+$/, "", b); print b; exit } }' /tmp/0111-precheck.out; }`;
export const NUM_VARS = Object.freeze(["J", "PB", "TB", "PR", "PF"]);
export const MD5_VARS = Object.freeze(["PM", "RM", "PS", "NG", "TU"]);
const CARRY_CHECKS = [
  `${CARRY_MAP.map(([v]) => `[ -n "\${${v}}" ]`).join(" && ")} || `,
  `echo "${NUM_VARS.map((v) => `\${${v}}`).join(" ")}" | grep -qxE '[0-9]+( [0-9]+){${NUM_VARS.length - 1}}' || `,
  `echo "${MD5_VARS.map((v) => `\${${v}}`).join(" ")}" | grep -qxE '[0-9a-f]{32}( [0-9a-f]{32}){${MD5_VARS.length - 1}}' || `,
];

/** What stage 1 hands the pre-check and verified-migrate, and what stage 2 hands the post-check, read off the text. */
export function argumentProblems(s1, s2) {
  const problems = [];
  const l1 = s1.split("\n");
  const l2 = s2.split("\n");
  if (!l1.some((l) => l.startsWith(`psql "\${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 -c "begin read only" -f ${PRE} -c "rollback" 2>&1 | tee /tmp/0111-precheck.new || `))) {
    problems.push("stage 1 does not run the pre-check inside its own begin read only");
  }
  if (!l1.some((l) => l.startsWith(`node packages/db/scripts/verified-migrate.mjs --tag ${TAG} --sha256 \${SHA0111} --expect-pending 1 2>&1 | tee /tmp/0111-apply.out || `))) {
    problems.push(`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0111} --expect-pending 1`);
  }
  for (const [v, row] of CARRY_MAP) if (!l2.includes(`${v}=$(carry ${row})`)) problems.push(`stage 2 does not read \${${v}} from the row ${row}`);
  if (!l2.includes(CARRY_FUNCTION)) problems.push("stage 2's carry() does not match a row by its whole name");
  const want = `psql "\${DATABASE_URL_DIRECT:?}" -X -P pager=off -v ON_ERROR_STOP=1 ${CARRY_MAP.map(([v, , name]) => `-v ${name}="\${${v}}"`).join(" ")} -c "begin read only" -f ${POST} -c "rollback" 2>&1 | tee /tmp/0111-postcheck.out || `;
  if (!l2.some((l) => l.startsWith(want))) problems.push("stage 2 does not hand the post-check the 10 carries, each under its own name, inside begin read only");
  for (const c of CARRY_CHECKS) if (!l2.some((l) => l.startsWith(c) && EXPLICIT_HALT.test(l))) problems.push(`stage 2 lacks the carry check ${c}`);
  const at = (start) => l2.findIndex((l) => l.startsWith(start));
  if (CARRY_CHECKS.some((c) => at(c) > at('psql "${DATABASE_URL_DIRECT:?}" -X -P pager=off'))) problems.push("a carry check follows the post-check it guards");
  return problems;
}

/** Stage 1 requires 14 OK, 0 VACUOUS, 0 FAIL of the pre-check; stage 2 requires 25, 0, 0 of the post-check. */
export function profileBlockProblems(s1, s2) {
  const problems = [];
  const has = (b, start) => b.split("\n").some((l) => l.startsWith(start) && EXPLICIT_HALT.test(l));
  const count = (name, word, file) => `${name}=$(grep -cE '\\|[[:space:]]*${word}[[:space:]]*$' /tmp/0111-${file} || true)`;
  for (const [n, w] of [["FAILS", "FAIL"], ["VACS", "VACUOUS"], ["OKS", "OK"]]) {
    if (!s1.split("\n").includes(count(n, w, "precheck.new"))) problems.push(`stage 1 does not count ${n} in the pre-check transcript`);
    if (!s2.split("\n").includes(count(n, w, "postcheck.out"))) problems.push(`stage 2 does not count ${n} in the post-check transcript`);
  }
  if (!has(s1, '[ "${FAILS}" = 0 ] || ')) problems.push("stage 1 does not require 0 FAIL");
  if (!has(s1, '[ "${VACS}" = 0 ] || ')) problems.push("stage 1 does not require 0 VACUOUS");
  if (!has(s1, '[ "${OKS}" = 14 ] || ')) problems.push("stage 1 does not require 14 OK");
  if (!has(s2, '[ "${FAILS}" = 0 ] || ')) problems.push("stage 2 does not require 0 FAIL of the post-check");
  if (!has(s2, '[ "${VACS}" = 0 ] || ')) problems.push("stage 2 does not require 0 VACUOUS of the post-check");
  if (!has(s2, '[ "${OKS}" = 25 ] || ')) problems.push("stage 2 does not require 25 OK of the post-check");
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
/** GREEN's six blocks: everything from BEFORE YOU START on. The promotion blocks above it (A', B, C, D and the push) are SOLO's. */
const gdoc = doc.slice(doc.indexOf("\n## BEFORE YOU START"));
/** SOLO's promotion section: block A' (the stacked merge), block B, block C, block D and the push. */
const pdoc = doc.slice(doc.indexOf("\n## The promotion"), doc.indexOf("\n## Written at its number"));
/** The document as it reads after SOLO's READY line: the same bytes without the NOT READY line. */
const readyDoc = doc.startsWith(`${NOT_READY_LINE}\n`) ? doc.slice(NOT_READY_LINE.length + 1) : doc;
const gateText = existsSync(join(ROOT, GATE_FILE)) ? read(GATE_FILE) : null;
const ACTUAL = { migration: sha256(migration), [PRE]: sha256(pre), [POST]: sha256(post) };
const BYS = "BEFORE YOU START: every check passed, and the journal reads 108.";
const STAGE0 = "0111 HELD HEAD, NUMBER, FILES AND CLOCK VERIFIED";
const CLOCKCHK = "CLOCK: closed hours by the weekday table, inside the run window the dispatch names";
const STAGE1 = "0111 APPLIED. Paste stage 2 now.";
const STAGE2 = "0111 POST-CHECK PASSED.";
const CLOSING = "CLOSING READ: the journal reads 109";
const MARKERS_IN_ORDER = [BYS, STAGE0, CLOCKCHK, STAGE1, STAGE2, CLOSING];

const swap = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `not exactly once: ${from.slice(0, 80)}`);
  return text.replace(from, () => to);
};

// =====================================================================================
// STATIC
// =====================================================================================

test("the migration stands in its one place, promoted at its number: its bytes are the pinned sha256, the pending file is gone, and the mirror carries the same statements", () => {
  assert.equal(sha256(migration), MIGRATION_SHA);
  assert.ok(!existsSync(join(ROOT, "packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql")), "the pending file is still there");
  assert.deepEqual(statementsOf(read(`supabase/migrations/${TAG}.sql`)), statementsOf(migration));
  // The code is ASCII; a comment may carry Portuguese, and 0111's index folds accents by a literal list of them.
  for (const [name, text] of [["migration", migration], ["pre", pre], ["post", post]]) {
    const bad = codeOf(text).split("\n").filter((l) => /[^\x09\x20-\x7e]/.test(l) && !/translate\(/.test(l));
    assert.deepEqual(bad, [], name);
  }
  const live = JSON.parse(read(JOURNAL));
  const e = live.entries.find((x) => x.tag === TAG);
  const p = live.entries.find((x) => x.tag === PREV_TAG);
  assert.deepEqual([e.idx, e.when, p.idx, p.when], [108, 1788503300000, 107, 1788503200000]);
  assert.equal(sha256(read(PREV_PATH)), EXTERNAL_PINS.SHAPREV, "the previous migration on this branch is not the file the document pins");
});

test("the migration keeps every rule of its shape", () => {
  assert.deepEqual(migrationProblems(migration), []);
  assert.deepEqual(migrationProblems(`${migration}\n/* DROP TABLE x; DELETE FROM y; GRANT ALL TO anon; */\n`), []);
});

test("CONTROLS, ONE RULE AT A TIME: each migrationProblems rule refuses an input made for it", () => {
  const add = (s) => `${migration}\n${s}--> statement-breakpoint\n`;
  const more = /^18 statements, not 17$/;
  const words = /^a DROP, TRUNCATE, /;
  const cases = [
    ["statement 1", swap(migration, "SET LOCAL lock_timeout = '5s';", "SET LOCAL lock_timeout = '50s';"), [/^statement 1 is not exactly/]],
    ["statement 3", swap(migration, "SET LOCAL idle_in_transaction_session_timeout = '15s';", "SET LOCAL idle_in_transaction_session_timeout = '0';"), [/^statement 3 is not exactly/]],
    ["a later bound", add("SELECT set_config('lock_timeout', '0', true);"), [/^a later statement names a bound$/, more]],
    ["transaction control", add("COMMIT;"), [/^a statement is transaction control/, more]],
    ["a row written", add("DELETE FROM public.health_systems;"), [more, words]],
    ["a function", add("CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'select 1';"), [more, words]],
    ["a grant to anon", add("GRANT SELECT ON TABLE public.health_systems TO anon;"), [more, /^a grant or policy to a role other than authenticated$/, ...(true ? [/^not exactly two GRANT$/] : [])]],
  ];
  for (const [name, input, want] of cases) {
    assert.notEqual(input, migration, `${name}: the input did not change the file`);
    const got = migrationProblems(input);
    assert.equal(got.length, want.length, `${name}: expected ${want.length} problem(s), got ${JSON.stringify(got)}`);
    for (const re of want) assert.ok(got.some((g) => re.test(g)), `${name}: no problem matching ${re}: ${JSON.stringify(got)}`);
  }
});

test("THE POST-CHECK'S PINS FOLLOW FROM THE MIGRATION: every COMMENT's text stands in the post-check as the literal it compares", () => {
  const comments = commentsOf(migration);
  assert.ok(Object.keys(comments).length > 0);
  // Every run of adjacent SQL literals in the post-check's code, joined as Postgres joins them.
  const runs = new Set([...codeOf(post).matchAll(/(?:'(?:[^']|'')*'\s*)+/g)].map((m) => [...m[0].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replaceAll("''", "'")).join("")));
  for (const [target, text] of Object.entries(comments)) assert.ok(runs.has(text), `${target}: the post-check does not carry the comment's text as the literal it compares`);
  // RED ARM: one character more is not found.
  const [target, text] = Object.entries(comments)[0];
  assert.ok(!runs.has(`${text} `), target);
});

test("the pre-check and the post-check compare the journal with the pinned sha256s in code, and decide their journal verdicts as reviewed", () => {
  assert.deepEqual(journalPinProblems(pre, "pre"), []);
  assert.deepEqual(journalPinProblems(post, "post"), []);
  const zeros = `00000000${MIGRATION_SHA.slice(8)}`;
  assert.deepEqual(journalPinProblems(pre.replace(`    USING '${MIGRATION_SHA}',`, `    USING '${zeros}',`), "pre"), ["the journal count does not take the pinned sha256s of 0111 and 0110"]);
  assert.equal(journalPinProblems(swap(pre, "AND journal_rows = 108 THEN", "AND journal_rows >= 108 THEN"), "pre").length, 1);
  assert.equal(journalPinProblems(swap(post, "AND journal_rows = :journal_rows_before + 1 THEN", "AND journal_rows > :journal_rows_before THEN"), "post").length, 1);
  assert.equal(journalPinProblems(swap(post, "AND newest_when = '1788503300000' THEN", "THEN"), "post").length, 1);
  assert.ok(pre.replace(/\n-- */g, "").includes(MIGRATION_PATH));
  for (const f of [pre, post]) assert.ok(f.includes(MIGRATION_SHA));
});

test("THE SAME READING ON BOTH SIDES: the readings the pre-check and the post-check share are the same text in both files", () => {
  for (const [name, start, end] of SHARED_READINGS) {
    const a = between(pre, start, end);
    const b = between(post, start, end);
    assert.ok(a && a.length > 40, `${name}: not found in the pre-check`);
    assert.equal(b, a, `${name}: the post-check reads it differently`);
  }
  // CONTROL: a difference of one character is seen.
  const [name, start, end] = SHARED_READINGS[SHARED_READINGS.length - 1];
  const a = between(pre, start, end);
  const mid = Math.floor(a.length / 2);
  const changed = `${a.slice(0, mid)}${a[mid] === "x" ? "y" : "x"}${a.slice(mid + 1)}`;
  assert.notEqual(between(post.replace(a, () => changed), start, end), a, name);
});

test("the read-only check files write nothing and control no transaction of their own; each runs inside its block's begin read only", () => {
  for (const [name, sql] of [["pre", pre], ["post", post]]) {
    assert.deepEqual(writeProblems(sql), [], name);
    assert.deepEqual(aclDefaultProblems(sql), [], name);
    assert.doesNotMatch(codeOf(sql), /\b(SET|RESET)\s+(LOCAL\s+|SESSION\s+)?(ROLE|SESSION\s+AUTHORIZATION)\b/i, name);
    assert.doesNotMatch(codeOf(sql), /^\s*(COMMIT|ROLLBACK|START\s+TRANSACTION|BEGIN\s*;)/im, name);
  }
  assert.match(blockWith(gdoc, STAGE1), /-c "begin read only" -f scripts\/db\/precheck-0111-sistemas-subsistemas\.sql -c "rollback"/);
  assert.match(blockWith(gdoc, STAGE2), /-c "begin read only" -f scripts\/db\/postcheck-0111-sistemas-subsistemas\.sql -c "rollback"/);
  // CONTROLS
  assert.notDeepEqual(writeProblems(`${pre}\nUPDATE public.locations SET saturday_opens_at = NULL;\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET ROLE authenticated;\n`), []);
  assert.notDeepEqual(writeProblems(`${post}\nSET LOCAL default_transaction_read_only = off;\n`), []);
  assert.notDeepEqual(writeProblems(`${pre}\nSELECT 'ALTER TABLE public.locations DROP COLUMN x';\n`), []);
  assert.notDeepEqual(aclDefaultProblems(pre.replace(`THEN 's'::"char"`, `THEN 'S'::"char"`)), []);
});

test("NO BLOCK WRITES AFTER THE APPLY: there is no probe file, no GREEN block names one, and no psql call opens a read-write transaction", () => {
  assert.ok(!existsSync(join(ROOT, PROBE)), `${PROBE} is there`);
  for (const b of blocksOf(gdoc)) assert.doesNotMatch(b, /probe|-c "begin" /i, "a block names a probe or opens a read-write transaction");
  assert.doesNotMatch(codeOf(post), /probe/i);
  assert.ok(existsSync(join(ROOT, "packages/db/tests/health-systems-rls.db.test.ts")), "the suite that proves the refusals with a database is not on this branch");
  // RED ARM: a read-write psql call planted in stage 2 is seen.
  const planted = `psql "\${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -c "begin" -f ${PROBE} -c "rollback" || { echo "STOP: x"; exit 1; }`;
  assert.deepEqual(onlyWriteProblems([blockWith(gdoc, STAGE1), `${blockWith(gdoc, STAGE2)}${planted}\n`]), [`a psql call that is not READ ONLY: ${planted.slice(0, 90)}`]);
});

test("THE VERDICT PROFILES: 14 verdicts, 9 carries and 5 infos before; 25 verdicts after, of which only 15 can read VACUOUS; and the blocks require exactly those", () => {
  assert.deepEqual(profileProblems(pre, 14, []), []);
  assert.deepEqual(profileProblems(post, 25, [15]), []);
  const tally = (rows) => rows.map(kindOf).reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {});
  assert.deepEqual(tally(verdictRowsOf(pre)), {"verdict": 14, "carry": 9, "info": 5});
  assert.deepEqual(tally(verdictRowsOf(post)), { verdict: 25 });
  assert.deepEqual(verdictRowsOf(pre).filter((r) => kindOf(r) === "verdict").map((r) => r.n), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "journal_rows_before"]);
  assert.deepEqual(verdictRowsOf(post).map((r) => r.n), Array.from({ length: 25 }, (_, i) => i));
  for (const [file, profile] of [[pre, "14 OK / 0 VACUOUS / 0 FAIL"], [post, "25 OK / 0 VACUOUS / 0 FAIL"]]) assert.ok(file.includes(`'${profile}', 'SUMMARY'`), profile);
  // RED ARMS
  const vline = post.split("\n").find((l) => /THEN 'VACUOUS'/.test(l));
  assert.ok(vline, "the VACUOUS arm");
  assert.deepEqual(profileProblems(post.replace(vline, vline.replace("'VACUOUS'", "'OK'")), 25, [15]), ["the verdicts that can read VACUOUS are , not 15"]);
  const v0 = "CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j";
  assert.deepEqual(profileProblems(swap(pre, v0, "CASE WHEN current_setting('transaction_read_only') <> 'on' THEN 'FAIL' ELSE 'OK' END AS verdict FROM j"), 14, []), ["verdict 0 prints OK as its ELSE"]);
  assert.deepEqual(profileProblems(pre, 15, []), ["14 verdicts, not 15"]);
  const s1 = blockWith(gdoc, STAGE1);
  const s2 = blockWith(gdoc, STAGE2);
  assert.deepEqual(profileBlockProblems(s1, s2), []);
  assert.deepEqual(profileBlockProblems(swap(s1, '[ "${OKS}" = 14 ] || ', '[ "${OKS}" = 13 ] || '), s2), ["stage 1 does not require 14 OK"]);
  assert.deepEqual(profileBlockProblems(s1, swap(s2, '[ "${OKS}" = 25 ] || ', '[ "${OKS}" = 24 ] || ')), ["stage 2 does not require 25 OK of the post-check"]);
  assert.deepEqual(profileBlockProblems(s1, swap(s2, '[ "${VACS}" = 0 ] || ', '[ "${VACS}" -le 1 ] || ')), ["stage 2 does not require 0 VACUOUS of the post-check"]);
  assert.match(s2, /^echo "0111 POST-CHECK PASSED\. 14\/14 pre-check OK, post-check \$\{OKS\} OK \/ \$\{VACS\} VACUOUS \/ 0 FAIL, journal \$\{J\} to \$\{JA\}; /m);
});

test("blocksOf takes only the plain fences, and blockWith finds exactly one block", () => {
  assert.equal(blocksOf(gdoc).length, 6);
  const fence = (body, lang = "") => "```" + lang + "\n" + body + "\n```\n";
  assert.deepEqual(blocksOf(fence("a MARK") + fence("SELECT 1;", "sql") + fence("b")), ["a MARK\n", "b\n"]);
  assert.throws(() => blockWith(fence("a MARK") + fence("b MARK"), "MARK"), /found 2/);
  assert.throws(() => blocksOf("```\nnever closed\n"), /never closed/);
});

test("every pin is the real file or the given value, and SHAGATE is the gate file's", () => {
  assert.deepEqual(pinProblems(doc, ACTUAL, gateText), []);
  for (const [name, file] of Object.entries(PIN_FILES)) {
    if (name in EXTERNAL_PINS) assert.equal(sha256(read(file)), EXTERNAL_PINS[name], `${name}: ${file}`);
  }
  assert.notDeepEqual(pinProblems(gdoc.replace(`SHAPOST=${ACTUAL[POST]}`, `SHAPOST=${"0".repeat(64)}`), ACTUAL, gateText), []);
  assert.notDeepEqual(pinProblems(gdoc, { ...ACTUAL, [POST]: "f".repeat(64) }, gateText), []);
  assert.notDeepEqual(pinProblems(gdoc.replace(/^SHAGATE=.*$/m, "SHAGATE=TODO"), ACTUAL, gateText), []);
  const gate = pinLines(gdoc).find(([n]) => n === "SHAGATE")[1];
  assert.deepEqual(gateProblems(gate, gateText), []);
});

test("THE SIDECAR pins the document byte for byte; the document is ASCII; its first line is NOT READY until SOLO's READY line, and nothing else on it", () => {
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  // Every block GREEN or SOLO pastes is ASCII; the prose may carry Portuguese, and nothing carries a control character.
  const bad = blocksOf(doc).join("\n").split("\n").map((l, i) => (/[^\x09\x20-\x7e]/.test(l) ? `${i + 1}: ${l.slice(0, 60)}` : null)).filter(Boolean);
  assert.deepEqual(bad, []);
  assert.doesNotMatch(doc, /[\x00-\x08\x0b-\x1f\x7f]/);
  assert.ok(!doc.startsWith("NOT READY") || doc.startsWith(`${NOT_READY_LINE}\n`), "the first line begins NOT READY but is not exactly the NOT READY line");
  assert.ok(readyDoc.startsWith("# 0111: "), "after the NOT READY line comes the title");
  assert.doesNotMatch(readyDoc.split("\n")[0], /^NOT READY|[A-Z]-PENDING/);
});

test("THE HALT RULE stands in the document word for word: 0094's rule with the number changed", () => {
  const rule = [
    "THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any",
    "STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and",
    "nothing continues to the next block. After stage 1 has committed, a post-commit STOP",
    "still stops the sitting: the write stands, and stages 2 and 3 (READ ONLY) run only on the",
    "owner's or the lead's word. The only onward path from stage 1 to stage 2 is exit 0",
    'with the line "0111 APPLIED. Paste stage 2 now." No block, and no dispatch',
    "step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:",
    "no closing read and no journal read. Whether and when a halted sitting starts again",
    "is the lead's call, never the runner's.",
  ].join("\n");
  assert.ok(doc.includes(`${rule}\n\n`), "the halt rule is not in the document word for word");
  assert.ok(read("docs/migration-apply-0094.md").includes(rule.replaceAll("0111", "0094")), "the rule is no longer 0094's with the number changed");
  assert.ok(doc.includes("**Stage 2 is READ ONLY, every psql call of it"), "the document does not say stage 2 is READ ONLY");
});

test("THE ONLY WRITE IS verified-migrate, once; every psql call is READ ONLY; and no rollback statement stands in any block", () => {
  const blocks = blocksOf(gdoc);
  assert.deepEqual(onlyWriteProblems(blocks), []);
  assert.equal(blocks.flatMap((b) => b.split("\n")).filter((l) => /(^|[ (])psql "/.test(l)).length, 6);
  assert.ok(doc.includes("## Rollback") && doc.includes("GREEN never runs that statement from this document"));
  for (const b of blocks) for (const mark of ["DROP COLUMN", "DROP CONSTRAINT", "ALTER TABLE", "UPDATE public.locations", "DROP TABLE"]) assert.ok(!b.includes(mark), `${mark} stands in a block GREEN pastes`);
  const s1 = blockWith(gdoc, STAGE1);
  const s2 = blockWith(gdoc, STAGE2);
  assert.deepEqual(onlyWriteProblems([s1, s1, s2]), ["verified-migrate runs 2 times, not once"]);
  assert.match(onlyWriteProblems([s1, swap(s2, `-c "begin read only" -f ${POST} -c "rollback"`, `-c "begin" -f ${POST} -c "rollback"`)])[0], /^a psql call that is not READ ONLY: psql /);
  // Six psql calls: the pre-check and the clinics' rows; the post-check, the journal count, the count by hash and the last three rows.
  const committing = swap(s2, `-c "begin read only" -f ${POST} -c "rollback"`, `-c "begin" -f ${POST} -c "commit"`);
  const line = committing.split("\n").find((l) => l.includes(`-f ${POST} -c "commit"`)).slice(0, 90);
  assert.deepEqual(onlyWriteProblems([s1, committing]), [`a psql call that commits: ${line}`, `a psql call that is not READ ONLY: ${line}`]);
  assert.deepEqual(onlyWriteProblems([s1, `${s2}\npsql "\${DATABASE_URL_DIRECT}" -X -c "begin read only" -c "DROP TABLE public.locations"\n`]), ["a SQL writing statement in a block: DROP"]);
});

test("THE ARGUMENTS: what stage 1 hands the pre-check and verified-migrate, and what stage 2 hands the post-check, read off the text", () => {
  const s1 = blockWith(gdoc, STAGE1);
  const s2 = blockWith(gdoc, STAGE2);
  assert.deepEqual(argumentProblems(s1, s2), []);
  assert.deepEqual([...NUM_VARS, ...MD5_VARS].sort(), CARRY_MAP.map(([v]) => v).sort());
  assert.match(argumentProblems(s1, swap(s2, "TB=$(carry tables_before)", "TB=$(carry policies_before)"))[0], /^stage 2 does not read \$\{TB\} from the row tables_before$/);
  assert.ok(argumentProblems(s1, swap(s2, '-v policies_md5="${PM}" -v relation_acl_md5="${RM}"', '-v policies_md5="${RM}" -v relation_acl_md5="${PM}"')).length >= 1);
  assert.deepEqual(argumentProblems(s1, swap(s2, "grep -qxE '[0-9]+( [0-9]+){4}'", "grep -qxE '.*'")), [`stage 2 lacks the carry check ${CARRY_CHECKS[1]}`]);
  assert.deepEqual(argumentProblems(swap(s1, "--expect-pending 1 ", "--expect-pending 2 "), s2), [`stage 1 does not run verified-migrate with --tag ${TAG} --sha256 \${SHA0111} --expect-pending 1`]);
  assert.ok(s1.split("\n").some((l) => l.startsWith("W110=$(node -e ") && l.includes(`p.tag==='${PREV_TAG}'?String(p.when):'none'`)));
});

test("THE WEEKDAY TABLE: the arm stands in stage 0 and stage 1, with no override and no date, and passes only in closed hours; the dispatch blocks decide the same table and strategy's start windows", () => {
  const s0 = blockWith(gdoc, STAGE0);
  const s1 = blockWith(gdoc, STAGE1);
  assert.deepEqual(armProblems(s0, 0), []);
  assert.deepEqual(armProblems(s1, 1), []);
  for (const m of [BYS, CLOCKCHK]) assert.deepEqual(dispatchClockProblems(blockWith(gdoc, m)), [], m);
  for (const m of [BYS, CLOCKCHK]) {
    const lines = blockWith(gdoc, m).split("\n");
    const at = lines.findIndex((l) => l.startsWith(windowEndLineStart));
    assert.ok(at > 0, `${m}: no window-end line`);
    assert.ok(lines[at - 1].startsWith('[ "${WSTART}" -lt "${WEND}" ] || '), m);
  }
  const proofs = (b) => b.split("\n").filter((l) => /^D1=no$|^D2=no$|^D3=no$|^if .*then D1=yes; fi$|^echo "R9 proof [123]/.test(l));
  assert.equal(proofs(s0).length, 7);
  assert.deepEqual(proofs(s1).map((l) => l.replace("${REC}", "${TIP}")), proofs(s0));
  for (const b of blocksOf(gdoc)) {
    assert.doesNotMatch(b, /\b20[0-9]{6}\b/, "a date in a block");
    assert.doesNotMatch(b.replace(/it has no override/g, ""), /\bOVR\b|override/i, "an override in a block");
  }
  const one = (b, stage, from, to) => armProblems(swap(b, from, to), stage);
  assert.deepEqual(one(s0, 0, "D2=no\n", "D2=yes\n"), ["no D2=no line", "something can turn proof 2 to yes"]);
  assert.deepEqual(one(s0, 0, 'if [ "${CLOCK}" = closed ]; then', 'if [ "${CLOCK}" = closed ] || [ "${D1}${D2}${D3}" = yesyesyes ]; then'), ["a daytime path that opens on the proofs", "the decision is not closed hours or STOP"]);
  assert.deepEqual(one(s1, 1, " or opens_at is null or closes_at is null)", ")"), ["stage 1 does not hold the clinics' own rows against the table's widest row, counting a clinic whose hours are not set"]);
  for (const [from, to] of [["t >= 2100", "t >= 2000"], ["t >= 1300", "t >= 1200"], ["d == 7", "d >= 6"], ["(t < 800 || t >= 1300)", "(t < 900 || t >= 1300)"]]) {
    assert.deepEqual(one(s0, 0, from, to), ["closed is not decided by the weekday table"], from);
  }
  assert.deepEqual(armProblems(`${s0}\necho 20261101\n`, 0), ["a date is written into the block"]);
});

export const RULED_POINTS = Object.freeze([
  ["Friday 20:59", 5, "2059", false], ["Friday 21:00", 5, "2100", true], ["Saturday 08:30 (open by the 08:00 row, kept on purpose)", 6, "0830", false],
  ["Saturday 12:59", 6, "1259", false], ["Saturday 13:00", 6, "1300", true], ["Sunday 15:00", 7, "1500", true], ["Monday 07:59", 1, "0759", true],
  ["Tuesday 21:30 (the green arm)", 2, "2130", true],
]);

test("THE WEEKDAY TABLE, the arm's own program in every block that reads it: the ruled minutes, and every boundary of every weekday", () => {
  for (const [name, d, hhmm, closed] of RULED_POINTS) assert.equal(closedByTable(d, Number(hhmm)), closed, name);
  for (const marker of [STAGE0, STAGE1, BYS, CLOCKCHK]) {
    const program = clockProgramOf(blockWith(gdoc, marker));
    assert.equal(program, CLOCK_AWK, marker);
    for (let d = 1; d <= 7; d += 1) {
      for (const hhmm of ["0000", "0629", "0630", "0759", "0800", "0859", "0900", "1259", "1300", "2059", "2100", "2229", "2230", "2359"]) {
        assert.equal(runClock(program, `${d}${hhmm}`), closedByTable(d, Number(hhmm)) ? "closed" : "open", `${marker.slice(0, 20)} weekday ${d} at ${hhmm}`);
      }
    }
  }
  // The owner's Saturday (09:00 to 13:00) is inside the table's Saturday row: no minute the owner calls open reads closed.
  for (let t = 900; t < 1300; t += 1) if (t % 100 < 60) assert.equal(closedByTable(6, t), false, `Saturday ${t}`);
});

test("THE WINDOW'S END, its awk program against the calendar", () => {
  for (let y = 2026; y <= 2035; y += 1) {
    for (let d = 20; d <= 31; d += 1) {
      for (const hhmm of ["0000", "0059", "0100", "0130", "0159", "0200", "2359"]) {
        const w = `${y}10${String(d).padStart(2, "0")}${hhmm}`;
        assert.equal(runWindowEnd(WINDOW_END_AWK, w), inRepeatedHour(w) ? "repeated" : "once", w);
      }
    }
  }
  assert.equal(runWindowEnd(WINDOW_END_AWK, "202610250130"), "repeated");
  assert.equal(runWindowEnd(WINDOW_END_AWK, "202611020800"), "once");
});

test("EVERY date CALL THAT READS THE WALL CLOCK READS LISBON TIME AND ITS ZONE", () => {
  let calls = 0;
  for (const b of blocksOf(gdoc)) {
    assert.deepEqual(dateProblems(b), [], b.slice(0, 80));
    calls += (b.match(/\bdate (?=['+-])/g) ?? []).length;
  }
  assert.equal(calls, 16);
  const s1 = blockWith(gdoc, STAGE1);
  assert.equal(dateProblems(s1.replaceAll("NOWZ=$(TZ=Europe/Lisbon date ", "NOWZ=$(date ")).length, 4);
});

test("A POST-COMMIT STOP SAYS WHAT STANDS: stage 2 and the closing read; UNKNOWN on the five whose own read contradicts the marker", () => {
  const s1 = blockWith(gdoc, STAGE1);
  const s2 = blockWith(gdoc, STAGE2);
  const cl = blockWith(gdoc, CLOSING);
  const M2 = '[ -n "$(find /tmp/0111-applied.ok -mmin -60 2>/dev/null)" ]';
  const M3 = "test -f /tmp/0111-applied.ok";
  assert.deepEqual(postCommitProblems(s2, M2, CONTRADICTING_READS.stage2), []);
  assert.deepEqual(postCommitProblems(cl, M3, CONTRADICTING_READS.closing), []);
  assert.deepEqual(stageOnePostApplyProblems(s1), []);
  assert.equal(s2.split(STATE_UNKNOWN).length - 1, 3);
  assert.equal(cl.split(STATE_UNKNOWN).length - 1, 2);
  for (const b of [blockWith(gdoc, STAGE0), s1, blockWith(gdoc, BYS), blockWith(gdoc, CLOCKCHK)]) assert.ok(!b.includes("Treat the state as UNKNOWN"));
  const postLine = s2.split("\n").find((l) => l.startsWith(POST_RUN_START));
  assert.ok(postLine.includes(`echo "STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. ${POST_RUN_SENTENCE}"; exit 1; }`));
  // RED ARMS
  const bare = swap(s2, `STOP: a count carry is not a number. ${WRITE_STANDS}`, "STOP: a count carry is not a number");
  assert.match(postCommitProblems(bare, M2, CONTRADICTING_READS.stage2)[0], /a post-commit STOP that does not say the write stands/);
  for (const [b, marker, set] of [[s2, M2, CONTRADICTING_READS.stage2], [cl, M3, CONTRADICTING_READS.closing]]) {
    for (const start of set) {
      const line = b.split("\n").find((l) => l.startsWith(start));
      assert.ok(line && line.includes(STATE_UNKNOWN), start);
      const flat = line.replace(/Stage 1 recorded that it applied 0111[^"]*/, () => `${WRITE_STANDS}; the lead rules`);
      const flatProblems = postCommitProblems(b.replace(line, () => flat), marker, set);
      assert.equal(flatProblems.length, 1, start);
      assert.match(flatProblems[0], /does not say the state is UNKNOWN/);
    }
  }
});

test("TWO SHAS ARE COMPARED ONLY AS CHECKED VARIABLES, every block asserts the document, and BEFORE YOU START reads its first line", () => {
  for (const b of blocksOf(gdoc)) assert.deepEqual(shaCompareProblems(b), [], b.slice(0, 80));
  const b = blockWith(gdoc, BYS);
  const rm = (x, start) => { const line = x.split("\n").find((l) => l.startsWith(start)); assert.ok(line, start); return x.replace(`${line}\n`, ""); };
  assert.match(shaCompareProblems(rm(b, 'echo "${HELD}" | grep -qxE'))[0], /\$\{HELD\} is compared before it is checked/);
  assert.deepEqual(shaCompareProblems(rm(b, '[ "${DOC}" = "${DOCSHA}" ] ||')), ["the block does not assert the document"]);
  const lines = b.split("\n");
  assert.ok(lines.includes("BAN=$(git show ${TIP}:docs/migration-apply-0111.md | sed -n 1p) || { echo \"STOP: the document's first line could not be read. The journal read has not run\"; exit 1; }"));
  assert.ok(lines.some((l) => l.startsWith("echo \"${BAN}\" | grep -qvE '^NOT READY|[A-Z]-PENDING' || { echo \"STOP: ") && EXPLICIT_HALT.test(l)));
});

test("THE DISPATCH BLOCKS carry exactly their PENDING value lines, and the dispatch's filled copy differs from them in those lines alone", () => {
  const b = blockWith(gdoc, BYS);
  const c = blockWith(gdoc, CLOCKCHK);
  const pendingIn = (x) => x.split("\n").filter((l) => /^\w+='PENDING/.test(l));
  assert.deepEqual(pendingIn(b), Object.values(PENDING_LINES));
  assert.deepEqual(pendingIn(c), [PENDING_LINES.DOCSHA, PENDING_LINES.WOPEN, PENDING_LINES.WSTART, PENDING_LINES.WEND]);
  for (const x of blocksOf(gdoc).filter((y) => y !== b && y !== c)) assert.ok(!/PENDING/.test(x), "a stage block carries PENDING");
  const v = { HELD: "a".repeat(40), DOCSHA: "b".repeat(64), WOPEN: "202611012100", WSTART: "202611020629", WEND: "202611020800" };
  for (const x of [b, c]) {
    const filled = fillDispatch(x, v);
    const diff = x.split("\n").filter((l, i) => l !== filled.split("\n")[i]);
    assert.deepEqual(diff, pendingIn(x));
  }
});

test("every block that runs the guard or the reader compares it, and its module, first", () => {
  for (const b of blocksOf(gdoc)) assert.deepEqual(compareFirstProblems(b), []);
  assert.equal(blocksOf(gdoc).filter((b) => b.includes("node scripts/assert-production-target.mjs")).length, 2);
  assert.equal(blocksOf(gdoc).filter((b) => b.includes("${READER} 2>&1")).length, 2);
  assert.deepEqual(blocksOf(gdoc).filter((b) => b.includes("--env-file")).map((b) => b.slice(0, 80)), [], "a block loads the production environment file with node --env-file, which lets a variable already in the shell win over the file");
  assert.equal(blocksOf(gdoc).filter((b) => b.includes("set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport ||")).length, 4, "BEFORE YOU START, stage 1, stage 2 and the closing read each load the environment file by allexport and .");
  assert.deepEqual(unsetProblems(gdoc), [], "every load of the environment file is preceded, on the line before, by the unset of both database variables");
  assert.equal(blocksOf(gdoc).join("\n").split("\n").filter((l) => l.startsWith("unset ")).length, 4);
});

/** Each line that loads the environment file must follow, directly, the unset of DATABASE_URL and DATABASE_URL_DIRECT (fix round 3, 2026-11-04). */
export function unsetProblems(md) {
  const out = [];
  for (const b of blocksOf(md)) {
    const lines = b.split("\n");
    lines.forEach((l, i) => {
      if (!l.startsWith("set -o allexport")) return;
      if (!(lines[i - 1] ?? "").startsWith("unset DATABASE_URL DATABASE_URL_DIRECT || { echo \"STOP: ")) out.push(`${i + 1}: ${l.slice(0, 60)} is not preceded by the unset line`);
    });
  }
  return out;
}

test("STALE VARIABLES, statically: a load of the environment file without the unset line before it is refused", () => {
  const planted = gdoc.replace(/^unset DATABASE_URL DATABASE_URL_DIRECT \|\| .*\n(?=set -o allexport)/m, "");
  assert.notEqual(planted, gdoc);
  assert.equal(unsetProblems(planted).length, 1);
});

test("every carry stage 2 reads is a row the pre-check prints, and every variable the post-check reads is passed", () => {
  const carries = [...blockWith(gdoc, STAGE2).matchAll(/\$\(carry ([a-z0-9_]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(carries, CARRY_MAP.map(([, row]) => row));
  const rowNames = verdictRowsOf(pre).map((r) => r.name);
  assert.equal(rowNames.length, 28);
  assert.deepEqual(carryProblems(carries, rowNames), []);
  const passed = [...blockWith(gdoc, STAGE2).matchAll(/-v (\w+)="\$\{[A-Z]+\}"/g)].map((m) => m[1]).sort();
  assert.equal(passed.length, 10);
  const quoted = [...codeOf(post).matchAll(/(?<![:\w]):'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]);
  const bare = [...codeOf(post).replace(/(?<![:\w]):'[a-z_][a-z0-9_]*'/g, "V").replace(/'(?:[^']|'')*'/g, "''").matchAll(/(?<![:\w]):([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
  const used = [...new Set([...quoted, ...bare])].sort();
  for (const u of used) assert.ok(passed.includes(u), `the post-check reads :${u}, and stage 2 does not pass it`);
});

test("the six blocks are there, in order, and carry no # line, no ! but test !, no backslash continuation, no old path and no set -e", () => {
  const blocks = blocksOf(gdoc);
  assert.equal(blocks.length, 6);
  assert.deepEqual(MARKERS_IN_ORDER.map((m) => blocks.findIndex((b) => b.includes(m))), [0, 1, 2, 3, 4, 5]);
  for (const b of blocks) assert.deepEqual(blockHazards(b), []);
  assert.doesNotMatch(doc, /\/Users\/ivan\/Documents\b/);
});

test("THE HELD HEAD: every block that reads a head names origin/db/RODICA-sistemas-subsistemas, none names origin/main, and the dispatch names the head as HELD", () => {
  const blocks = blocksOf(gdoc);
  for (const b of blocks) assert.ok(!b.includes("origin/main"), "a block names origin/main");
  const reading = blocks.filter((b) => b.includes(`git rev-parse ${BRANCH}`));
  assert.equal(reading.length, 5);
  assert.ok(!blockWith(gdoc, CLOCKCHK).includes("git rev-parse origin/"));
  for (const b of blocks) for (const l of b.split("\n").filter((x) => x.includes("git rev-parse origin/"))) assert.ok(l.includes(`git rev-parse ${BRANCH})`), l);
});

/** A command a later step relies on: its failure must halt the block by an explicit guard. */
const MUST_HALT = [
  /^cd /, /\bgit (fetch|checkout|status|grep|show|rev-parse origin\/)\b/, /^rm -f /, /^mv /, /^touch /, /\| tee /,
  /^node (scripts|packages)\//, /^node --env-file=/, /^node -e /, /\bpsql /, />>? \/tmp\/0111-/, /^set -o allexport/, /^unset /,
  /^(T110|W110|REC|START|NOWZ|DTZ|NOW|NEXT|PREV|HD|S2|TIP|WAS|DOC|BAN|SIDE|SM|SP|SPRE|SPOST|SV|SG|SC|RW|MW|WREAD|STRAY|CIRUNS|CIN|CIS)=\$\(/,
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

test("EVERY HALT IS EXPLICIT: each command a later step relies on carries its own || { echo \"STOP: ...\"; exit ...; }, and no block carries set -e", () => {
  for (const b of blocksOf(gdoc)) {
    assert.deepEqual(unguardedLines(b), [], b.slice(0, 120));
    const sets = b.split("\n").map((l, i) => (/(^|[ (;])set [-+]/.test(l) ? `${i}: ${l.replace(/ \|\| \{.*$/, "").replace(/\/Users\/[^ ]+/, "ENV")}` : null)).filter(Boolean);
    assert.equal(sets[0], "1: set -o pipefail");
    for (const s of sets.slice(1)) assert.match(s, /^\d+: set -o allexport && \. ENV && set \+o allexport$/);
    for (const line of b.split("\n")) if (line.includes('echo "STOP: ')) assert.match(line, /echo "STOP: [^"]+";( echo "\$\{STRAY\}";)? exit (1|\$\{RC\}); (\}|fi)$/, line.slice(0, 120));
  }
  for (const planted of ["git fetch origin --prune", "touch /tmp/0111-applied.ok", "node scripts/assert-production-target.mjs", "test -f docs/x.sha256", '[ "${NOW}" = "${REC}" ]', "unset DATABASE_URL DATABASE_URL_DIRECT", 'CIRUNS=$(gh api "repos/x")']) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
});

// =====================================================================================
// THE HARNESS. Nothing in it touches a real host, the secrets folder or a database.
// =====================================================================================

const STUBBED = ["git", "gh", "psql", "node", "pnpm", "sntp", "curl", "shasum", "tee", "mv", "rm", "touch", "cat", "find", "date", "grep", "cut", "awk", "sed", "head", "tail", "wc", "tr"];
const FAKED = new Set(["git", "gh", "psql", "pnpm", "sntp", "curl"]);
/** The three check runs BEFORE YOU START requires on HELD, named as #1682's green head efc0f161 names them (fix round 3, 2026-11-04). */
export const REQUIRED_CHECK_RUNS = Object.freeze(["DB-gated tests (RLS isolation, seeded DB)", "Lint + typecheck + test", "Playwright E2E (seeded DB)"]);
const CHECK_RUNS_PATH = (sha) => `repos/happygamer1919-tech/OsteoJP/commits/${sha}/check-runs?filter=latest&per_page=100`;
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
/** A fake env file that defines DATABASE_URL only: a stale DATABASE_URL_DIRECT from the shell must not survive its load (fix round 3). */
const URL_ONLY_ENV = "fake-prod-url-only.env";
/** A URL the shell exports before any block runs, as the owner's shell profile may; only a block that loads the env file by allexport and . replaces it. */
const SHELL_DB_URL = "postgresql://postgres.shellprofile:x@shell-profile.invalid:5432/postgres";
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

/** One POSIX sh stub, as 0110's, with the held branch. */
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
        --env-file=*|packages/db/scripts/read-applied-migrations.mjs) echo "REFUSE: harness fault, the reader refuses the target" >&2; exit 2;;
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
      rev-parse) if [ "$2" = ${BRANCH} ]; then echo "$HARNESS_MAIN"; exit 0; fi
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
  gh) [ "$#" -eq 4 ] && [ "$1" = api ] && [ "$2" = "repos/happygamer1919-tech/OsteoJP/commits/$HARNESS_MAIN/check-runs?filter=latest&per_page=100" ] && [ "$3" = --jq ] || unexpected "$@"
    case "$HARNESS_GH" in
      down) echo "gh: harness: HTTP 502: Bad Gateway" >&2; exit 1;;
      none) exit 0;;
      pending) printf '%s\\n' 'DB-gated tests (RLS isolation, seeded DB)|completed|success' 'Lint + typecheck + test|completed|success' 'Playwright E2E (seeded DB)|in_progress|none' 'held-for-apply-blocks-merge|completed|failure';;
      failure) printf '%s\\n' 'DB-gated tests (RLS isolation, seeded DB)|completed|failure' 'Lint + typecheck + test|completed|success' 'Playwright E2E (seeded DB)|completed|success' 'held-for-apply-blocks-merge|completed|failure';;
      missing) printf '%s\\n' 'DB-gated tests (RLS isolation, seeded DB)|completed|success' 'Playwright E2E (seeded DB)|completed|success' 'held-for-apply-blocks-merge|completed|failure';;
      prefix) printf '%s\\n' 'DB-gated tests|completed|success' 'Lint + typecheck + test|completed|success' 'Playwright E2E|completed|success';;
      twice) printf '%s\\n' 'DB-gated tests (RLS isolation, seeded DB)|completed|success' 'DB-gated tests (RLS isolation, seeded DB)|completed|success' 'Lint + typecheck + test|completed|success' 'Playwright E2E (seeded DB)|completed|success';;
      *) printf '%s\\n' 'Playwright E2E (seeded DB)|completed|success' 'E2E shard (1)|completed|success' 'DB-gated tests (RLS isolation, seeded DB)|completed|success' 'Lint + typecheck + test|completed|success' 'held-for-apply-blocks-merge|completed|failure' 'sync|completed|success';;
    esac; exit 0;;
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
  psql) if [ -n "$HARNESS_SHELL_DBURL" ] && [ "$1" = "$HARNESS_SHELL_DBURL" ]; then unexpected "STALE: psql was handed the shell's DATABASE_URL_DIRECT, not the env file's"; fi
    if [ -z "$1" ]; then echo "psql: error: connection to server on socket failed: No such file or directory" >&2; exit 2; fi
    [ "$1" = "$HARNESS_DBURL" ] || unexpected "a database URL that is not the harness's";
    case "$*" in
      *precheck-0111-sistemas-subsistemas.sql*) ${R("cat")} "$HARNESS_FIX/\${HARNESS_PRE:-pre.out}"; exit "\${HARNESS_PRE_EXIT:-0}";;
      *postcheck-0111-sistemas-subsistemas.sql*) ${R("cat")} "$HARNESS_FIX/\${HARNESS_POST:-post.out}"; exit "\${HARNESS_POST_EXIT:-0}";;
      *public.locations*) printf 'BEGIN\\n%s\\n' "$HARNESS_CLINICS"; exit 0;;
      *"where hash = "*) printf 'BEGIN\\n%s\\n' "\${HARNESS_HASHN:-1}"; exit 0;;
      *"limit 3"*) exec ${R("cat")} "$HARNESS_FIX/last3.out";;
      *"select count(*) from drizzle.__drizzle_migrations"*) printf 'BEGIN\\n%s\\n' "$HARNESS_ROWS"; exit 0;;
    esac
    unexpected "$@";;
  pnpm) unexpected "$@";;
  node) u="\${DATABASE_URL_DIRECT-$DATABASE_URL}"
    case "$1" in scripts/assert-production-target.mjs|packages/db/scripts/verified-migrate.mjs|packages/db/scripts/read-applied-migrations.mjs)
      if [ -n "$HARNESS_SHELL_DBURL" ] && [ "$u" = "$HARNESS_SHELL_DBURL" ]; then unexpected "STALE: $1 read the shell's DATABASE_URL_DIRECT or DATABASE_URL, not the env file's"; fi;;
    esac
    case "$1" in
      -e) exec ${R("node")} "$@";;
      scripts/check-journal.mjs) echo "check-journal: 109 .sql files match 109 journal entries in order (harness)"; exit 0;;
      scripts/assert-production-target.mjs) if [ -z "$u" ]; then echo "REFUSE: neither DATABASE_URL_DIRECT nor DATABASE_URL is set" >&2; exit 2; fi
        [ "$u" = "$HARNESS_DBURL" ] || unexpected "the guard ran with a URL that is not the harness's";
        printf 'host: harness.invalid\\nport: 5432\\nref: harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
      packages/db/scripts/verified-migrate.mjs) exec ${R("cat")} "$HARNESS_FIX/vm.out";;
      --env-file=*|packages/db/scripts/read-applied-migrations.mjs)
        if [ "$1" = packages/db/scripts/read-applied-migrations.mjs ]; then
          [ "$#" -eq 1 ] || unexpected "$@";
          [ "$u" = "$HARNESS_DBURL" ] || unexpected "the reader ran without the sourced env file's URL";
        else
          f="\${1#--env-file=}"; [ -f "$f" ] || { echo "node: $f: not found" >&2; exit 9; }
          [ "$2" = packages/db/scripts/read-applied-migrations.mjs ] || unexpected "$@";
          [ -z "$HARNESS_SHELL_DBURL" ] || [ "$DATABASE_URL_DIRECT" != "$HARNESS_SHELL_DBURL" ] || unexpected "node --env-file ran while the shell already exported DATABASE_URL_DIRECT: the shell's value wins over the file's";
        fi
        st=APPLIED; pn=0; if [ "$HARNESS_ROWS" -lt 109 ]; then st="NOT APPLIED"; pn=1; fi
        if [ "$HARNESS_READER" = without-0111 ]; then st="NOT APPLIED"; pn=1; fi
        orph=0; if [ "$HARNESS_READER" = orphan-row ]; then orph=1; fi
        printf 'journal rows on production: %s\\n\\nevery migration file on this ref:\\n  APPLIED      0110_services_booking_type_fields.sql\\n  %s  0111_sistemas_subsistemas.sql\\n' "$HARNESS_ROWS" "$st"
        if [ "$HARNESS_READER" = pending-later ]; then printf '  NOT APPLIED  0112_later.sql\\n'; pn=$((pn + 1)); fi
        printf '\\npending on this ref: %s\\njournal rows with no matching file on this ref: %s\\n' "$pn" "$orph"; exit 0;;
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
const COUNT_CARRIES = Object.freeze({"journal_rows_before":  108, "policies_before":  110, "tables_before":  4, "patients_rows":  4, "patients_filenode":  4});
const carryValue = (row) => COUNT_CARRIES[row] ?? md5(row);
const CARRY_ROWS = CARRY_MAP.map(([, row]) => row).filter((r) => r !== "journal_rows_before");

/** What the faked programs print. Four columns, as the real files print them; the verdict is the last. */
function harnessFixtures() {
  const row = (a, b, c, v) => ` ${a.padEnd(48)} | ${String(b).padEnd(34)} | ${String(c).padEnd(20)} | ${v}`;
  const table = (rows) => [row("check", "observed", "expected", "verdict"), "-".repeat(120), ...rows, `(${rows.length} rows)`, ""].join("\n");
  const preRows = [
    ...Array.from({ length: 13 }, (_, i) => row(`${i}. pre-check verdict`, "harness", "harness", "OK")),
    row("journal_rows_before", carryValue("journal_rows_before"), "108 (verdict 13)", "OK"),
    ...CARRY_ROWS.map((k) => row(k, carryValue(k), "a count", "CARRY")),
    row("INFO the server version", "17.6", "a profile", "INFO"),
    row("INFO the clinics as they are (counts; no row is touched)", "rows 4; active 2", "a profile, never a verdict", "INFO"),
    row("INFO the opens_at grants, role:privilege:allowed", "anon:INSERT:false,...", "a profile, never a verdict", "INFO"),
    row("INFO locks other sessions hold on locations now", "0", "a profile, never a verdict", "INFO"),
    row("INFO idle_in_transaction_session_timeout (0 is no limit)", "0", "a profile, never a verdict", "INFO"),
  ];
  const verdictOf = (rows, startsWith, to) => rows.map((r) => (r.trimStart().startsWith(startsWith) ? r.replace(/\| OK$/, `| ${to}`) : r));
  const verdicts = (n, label) => Array.from({ length: n }, (_, i) => row(`${i}. ${label} verdict`, "harness", "harness", "OK"));
  const postRows = verdicts(25, "post-check");
  const vm = [
    `file       ${TAG}.sql present, sha256 matches`, "journal    108 row(s) applied, last when=1788503200000",
    `pending    1  [${TAG}]`, "--- drizzle-kit migrate --- (harness)", "journal    108 -> 109  (delta 1)",
    `${TAG} present by sha256: yes`, "OK: the journal moved by exactly the pending count and carries the approved sha256.", "",
  ].join("\n");
  const last3 = " id  | hash | created_at\n 109 | e9afe529 | 1788503300000\n 108 | e0e4a9e8 | 1788503200000\n 107 | harness0 | 1788503100000\n(3 rows)\n";
  return {
    "pre.out": table(preRows),
    "pre-vac.out": table(verdictOf(preRows, "8. pre-check verdict", "VACUOUS")),
    "pre-fail.out": table(verdictOf(preRows, "3. pre-check verdict", "FAIL")),
    "pre-short.out": table(preRows.filter((r) => !r.trimStart().startsWith("5. pre-check verdict"))),
    "post.out": table(postRows),
    "post-1vac.out": table(verdictOf(postRows, "7. post-check verdict", "VACUOUS")),
    "post-fail.out": table(verdictOf(postRows, "5. post-check verdict", "FAIL")),
    "post-short.out": table(postRows.filter((r) => !r.trimStart().startsWith("9. post-check verdict"))),
    "last3.out": last3, "vm.out": vm,
  };
}

const APPLY_FILES = [
  PRE, POST, PREV_PATH, "scripts/assert-production-target.mjs", "scripts/production-target.mjs", "scripts/check-journal.mjs", GATE_FILE,
  "packages/db/scripts/verified-migrate.mjs", "packages/db/scripts/read-applied-migrations.mjs",
];

/** The fake apply worktree's journal, AS OF 0111: the live journal's entries up to and including 0111's own. */
export function journalAsOf0111(live) {
  const at = live.entries.findIndex((e) => e.tag === TAG);
  if (at < 1 || live.entries[at - 1].tag !== PREV_TAG) throw new Error(`the live journal no longer holds ${PREV_TAG} then ${TAG}`);
  return { ...live, entries: live.entries.slice(0, at + 1) };
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
  writeFileSync(join(base, URL_ONLY_ENV), `DATABASE_URL=${FAKE_DB_URL}\n`);
  for (const f of APPLY_FILES) {
    mkdirSync(dirname(join(base, "apply", f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(base, "apply", f));
  }
  mkdirSync(join(base, "apply", "packages/db/migrations/meta"), { recursive: true });
  writeFileSync(join(base, "apply", MIGRATION_PATH), migration);
  writeFileSync(join(base, "apply", JOURNAL), `${JSON.stringify(journalAsOf0111(JSON.parse(read(JOURNAL))), null, 2)}\n`);
  writeFileSync(join(base, "apply", DOC), docText);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(docText)}  ${DOC}\n`);
}

/** The block with its real paths moved into the run folder. A block that still names one is refused unrun. */
export function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/0111-", join(run, "tmp/0111-"));
  const rest = out.replaceAll(join(run, "tmp/0111-"), "").replaceAll(join(run, "apply"), "").replaceAll(envFile, "");
  for (const bad of ["/tmp/0111-", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
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
  const text = localize(cfg.block, run, fault?.noEnv ? join(run, "no-such.env") : join(cfg.base, fault?.envFile ?? "fake-prod.env"));
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL,
    DATABASE_URL_DIRECT: SHELL_DB_URL, DATABASE_URL: SHELL_DB_URL, HARNESS_SHELL_DBURL: SHELL_DB_URL,
    HARNESS_MAIN: FAKE_SHA.MAIN, HARNESS_MARKERS: cfg.markers.join(" "),
    HARNESS_ROWS: String(cfg.rows ?? 109), HARNESS_CLINICS: cfg.clock.clinics,
    HARNESS_DHHMM: cfg.clock.dhhmm, HARNESS_DOW: cfg.clock.dow, HARNESS_STAMP: cfg.clock.stamp, HARNESS_ZONE: cfg.clock.zone ?? "WEST",
    HARNESS_NEXT: cfg.clock.next, HARNESS_PREV: cfg.clock.prev, HARNESS_EPOCH: String(HARNESS_EPOCH), HARNESS_HTTPDATE,
    HARNESS_SNTP: cfg.net?.sntp ?? "", HARNESS_CURL: cfg.net?.curl ?? "", HARNESS_GH: cfg.gh ?? "",
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

const putRecord = (tmp, name, text, minutesAgo) => {
  const f = join(tmp, name);
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

/** Per block: its pass lines (the last is its last line), its records, and the records its inputs need. */
const HARNESS_BLOCKS = {
  bys: {
    marker: BYS, markers: ["0111-journal-before.out", "0111-start-head.sha"], success: ["held head recorded for the CLOCK CHECK", BYS],
    setup: () => () => {}, fill: true, rows: 108, redirect: "0111-start-head.sha", sources: true, initialHead: FAKE_SHA.BEFORE,
  },
  stage0: {
    marker: STAGE0, markers: ["0111-check-journal.out", "0111-head.sha"], success: ["running from the held head", STAGE0],
    setup: () => (tmp) => putRecord(tmp, "0111-applied.ok", "", 780), redirect: "0111-head.sha",
  },
  clock: {
    marker: CLOCKCHK, markers: ["0111-window.ok"], success: ["run window recorded in", CLOCKCHK], fill: true, redirect: "0111-window.ok",
    setup: () => (tmp) => { putRecord(tmp, "0111-start-head.sha", `${FAKE_SHA.MAIN}\n`, 10); putRecord(tmp, "0111-head.sha", `${FAKE_SHA.MAIN}\n`, 5); },
  },
  stage1: {
    marker: STAGE1, markers: ["0111-precheck.new", "0111-precheck.out", "0111-apply.out", "0111-applied.ok"], success: [STAGE1],
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0111-head.sha", `${FAKE_SHA.MAIN}\n`, 10);
      putRecord(tmp, "0111-window.ok", `${FAKE_SHA.MAIN} ${clock.window}\n`, 5);
      putRecord(tmp, "0111-applied.ok", "", 780);
    },
    sources: true, vm: true,
  },
  stage2: {
    marker: STAGE2, markers: ["0111-postcheck.out", "0111-stage2.ok"], success: [STAGE2],
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0111-head.sha", `${FAKE_SHA.MAIN}\n`, 20);
      putRecord(tmp, "0111-window.ok", `${FAKE_SHA.MAIN} ${clock.window}\n`, 15);
      putRecord(tmp, "0111-precheck.out", harnessFixtures()["pre.out"], 6);
      putRecord(tmp, "0111-applied.ok", "", 5);
    },
    redirect: "0111-stage2.ok", sources: true,
  },
  closing: {
    marker: CLOSING, markers: ["0111-journal-after.out"], success: ["CLOSING READ:"], initialHead: FAKE_SHA.MAIN,
    setup: (clock) => (tmp) => {
      putRecord(tmp, "0111-head.sha", `${FAKE_SHA.MAIN}\n`, 30);
      putRecord(tmp, "0111-window.ok", `${FAKE_SHA.MAIN} ${clock.window}\n`, 25);
      putRecord(tmp, "0111-applied.ok", "", 10);
      putRecord(tmp, "0111-stage2.ok", `${FAKE_SHA.MAIN}\n`, 1);
    },
    sources: true,
  },
};
const HARNESS_PLAN = ["bys", "stage0", "clock", "stage1", "stage2", "closing"];

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

/** The sweep configuration of one block at one clock, on one shell. The document runs as it reads after the READY line. */
export function harnessConfig(md, name, clock, shell, base, opts = {}) {
  const spec = HARNESS_BLOCKS[name];
  const raw = blockWith(md, spec.marker);
  const block = spec.fill ? fillDispatch(raw, { HELD: FAKE_SHA.MAIN, DOCSHA: sha256(opts.docText ?? readyDoc), ...clock.fill, ...(opts.fill ?? {}) }) : raw;
  return {
    id: `${shell}-${name}`, shell, base, block, markers: spec.markers, success: spec.success, rows: spec.rows,
    setup: spec.setup(clock), initialHead: spec.initialHead, clock, mayContinue: mayContinue(name),
    extraFaults: (positive, wp) => {
      const out = [{ kind: "cd", label: "cd: the apply worktree is not there", noApply: true, pos: -1 }];
      const guard = positive.calls.find((c) => c.id.startsWith("node#") && /assert-production-target|--env-file=|read-applied-migrations/.test(c.args));
      if (spec.sources) out.push({ kind: "env", label: ". or --env-file: the env file is not there", noEnv: true, pos: guard.args.startsWith("--env-file=") ? guard.pos : guard.pos - 1 });
      if (spec.redirect) out.push({ kind: "redirect", label: `> ${spec.redirect}: the path is a directory`, hookAfter: "rm#1", hookMkdir: spec.redirect, pos: Math.min(wp[spec.redirect], positive.calls.length - 1) });
      if (spec.vm) {
        const vm = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
        for (const code of [2, 4, 5]) out.push({ kind: `vm-exit-${code}`, label: `node verified-migrate exits ${code}`, call: vm.id, code, pos: vm.pos, at: null });
      }
      for (const c of positive.calls.filter((x) => x.id.startsWith("date#") || x.id.startsWith("gh#") || (x.id.startsWith("cut#") && x.args.includes("0111-window.ok")))) {
        out.push({ kind: "empty", label: `${describeCall(c)}: exits 0 with empty output`, call: c.id, mode: "empty", pos: c.pos, at: c });
      }
      // An empty answer from psql: every read that decides something stops on it. The last three journal rows are printed for the report and decide nothing.
      for (const c of positive.calls.filter((x) => x.id.startsWith("psql#") && !x.args.includes("limit 3"))) {
        out.push({ kind: "empty", label: `${describeCall(c)}: exits 0 with empty output`, call: c.id, mode: "empty", pos: c.pos, at: c });
      }
      return out;
    },
  };
}

async function sweepAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `fault-0111-${shell}-`));
  try {
    prepareHarness(base, readyDoc);
    const bad = [];
    let faults = 0;
    for (const name of HARNESS_PLAN) {
      const r = await sweep(harnessConfig(gdoc, name, CLOSED, shell, base));
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
    assert.ok(faults > 300, `only ${faults} faults across the six blocks`);
    t.diagnostic(`${shell}: ${faults} faults across the six blocks`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function zshOrSkip(t) {
  if (hasShell("zsh")) return true;
  if (process.env.GITHUB_ACTIONS === "true") {
    t.skip("zsh is not on the CI runner (ubuntu-latest); the bash arm ran here instead");
    return false;
  }
  assert.fail("zsh is not on this machine, and the zsh arm of the fault-injection harness must run wherever it is not the GitHub runner");
}
const shellsHere = () => ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];

test("every block parses under bash -n and zsh -n", (t) => {
  for (const b of blocksOf(gdoc)) {
    const r = spawnSync("bash", ["--noprofile", "--norc", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
  if (!zshOrSkip(t)) return;
  for (const b of blocksOf(gdoc)) {
    const r = spawnSync("zsh", ["-f", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `zsh -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
});

test("the harness's journal is the journal as of 0111, whatever lands later", () => {
  const live = JSON.parse(read(JOURNAL));
  const j = journalAsOf0111(live);
  const [p, e] = j.entries.slice(-2);
  assert.deepEqual([p.idx, p.tag, p.when, e.idx, e.tag, e.when, j.entries.length], [107, PREV_TAG, 1788503200000, 108, TAG, 1788503300000, 109]);
  const later = { ...live, entries: [...j.entries, { idx: 109, version: "7", when: 1788503400000, tag: "0112_later", breakpoints: true }] };
  assert.deepEqual(journalAsOf0111(later), j);
});

test("THE HARNESS IS ITS OWN CONTROL: in the tool's shape set -e stops nothing, and a block without its guards runs on", async () => {
  const shells = shellsHere();
  for (const shell of shells) {
    const [cmd, args] = shellArgs(shell, "( set -eo pipefail; false; echo after-false; false | cat || echo pipefail-holds )");
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    assert.equal(r.status, 0, `${shell}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /after-false\npipefail-holds\nTOOL-CHAIN-CONTINUED/, shell);
  }
  const base = mkdtempSync(join(tmpdir(), "fault-0111-control-"));
  try {
    prepareHarness(base, readyDoc);
    for (const shell of shells) {
      const cfg = harnessConfig(gdoc, "stage1", CLOSED, shell, base);
      const positive = await runOnce(cfg, `${shell}-control-positive`, null);
      assert.equal(positive.code, 0, positive.out.slice(-1500));
      const guardCall = positive.calls.find((c) => c.args.startsWith("scripts/assert-production-target.mjs"));
      const vmCall = positive.calls.find((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs"));
      assert.deepEqual(vmCall.args.trim().split("\n"), ["packages/db/scripts/verified-migrate.mjs", "--tag", TAG, "--sha256", MIGRATION_SHA, "--expect-pending", "1"]);
      const strip = (block, start) => {
        const line = block.split("\n").find((l) => l.startsWith(start));
        return block.replace(line, line.replace(/ \|\| \{ (RC=\$\?; )?echo "STOP: [^"]+"; exit (1|\$\{RC\}); \}$/, ""));
      };
      const refused = await runOnce(cfg, `${shell}-control-guard`, { call: guardCall.id });
      assert.notEqual(refused.code, 0, refused.out);
      assert.match(refused.out, /^STOP: the target guard refused or failed/m);
      assert.deepEqual(refused.calls.filter((c) => c.id.startsWith("psql#") || c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), []);
      const noGuard = await runOnce({ ...cfg, block: strip(cfg.block, "node scripts/assert-production-target.mjs") }, `${shell}-control-noguard`, { call: guardCall.id });
      assert.equal(noGuard.code, 0, noGuard.out.slice(-800));
      assert.ok(noGuard.out.includes(STAGE1) && noGuard.calls.some((c) => c.id.startsWith("psql#")));
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
const credentialCalls = (r) => r.calls.filter((c) => c.id.startsWith("psql#") || (c.id.startsWith("node#") && /^(packages\/db\/scripts\/verified-migrate|packages\/db\/scripts\/read-applied-migrations|scripts\/assert-production-target|--env-file=)/.test(c.args)));

async function withHarness(fn, change = () => {}, docText = readyDoc) {
  const base = mkdtempSync(join(tmpdir(), "fault-0111-arm-"));
  try {
    prepareHarness(base, docText);
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
        const cfg = harnessConfig(gdoc, name, CLOSED, shell, base);
        const r = await runOnce({ ...cfg, block: blockWith(gdoc, HARNESS_BLOCKS[name].marker) }, `${shell}-unfilled-${name}`, null);
        assertStops(r, name, stop, `${shell} ${name} unfilled`);
        assert.deepEqual(r.calls.filter((c) => !c.id.startsWith("grep#")), [], `${shell} ${name}: something ran before the first check`);
      }
    }
  });
});

test("NOT READY: a dispatch filled at a head whose document still begins NOT READY STOPs at the first-line check, before the journal read", async () => {
  const notReady = `${NOT_READY_LINE}\n${readyDoc}`;
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      const r = await runOnce(harnessConfig(notReady, "bys", CLOSED, shell, base, { docText: notReady }), `${shell}-not-ready`, null);
      assertStops(r, "bys", /^STOP: the document's first line begins NOT READY or carries a mark that ends in -PENDING/, `${shell} NOT READY`);
      assert.deepEqual(credentialCalls(r), [], shell);
    }
  }, () => {}, notReady);
});

test("THE WINDOW'S END, both dispatch blocks whole: a window that ends in the repeated hour STOPS before anything else runs", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        for (const wend of ["202610250100", "202710310130"]) {
          const r = await runOnce(harnessConfig(gdoc, name, CLOSED, shell, base, { fill: { WEND: wend } }), `${shell}-wend-${name}-${wend}`, null);
          assertStops(r, name, new RegExp(`^STOP: the run window's end ${wend} falls in the hour the Lisbon clocks repeat`), `${shell} ${name}, WEND ${wend}`);
          assert.deepEqual(r.calls.filter((c) => /^(git|sntp|curl|date)#/.test(c.id)), [], `${shell} ${name}`);
        }
      }
    }
  });
});

test("THE START WINDOWS AND R39, both dispatch blocks whole: closed hours inside a start window pass; clinic hours, another night, and every minute of the Sunday R39 names STOP", async () => {
  const points = [
    ["Tuesday 21:00", 2, "2100", "pass"], ["Wednesday 06:29", 3, "0629", "pass"], ["Sunday 15:00", 7, "1500", "pass"],
    ["Tuesday 22:30", 2, "2230", /is closed by the weekday table but outside strategy's start windows/],
    ["Saturday 13:30", 6, "1330", /is closed by the weekday table but outside strategy's start windows/],
    ["Friday 20:59", 5, "2059", /is inside clinic hours by the weekday table/],
  ];
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        for (const [label, d, hhmm, want] of points) {
          const r = await runOnce(harnessConfig(gdoc, name, clockAt(d, hhmm), shell, base), `${shell}-start-${name}-${d}${hhmm}`, null);
          const tag = `${shell} ${name} at ${label}`;
          if (want === "pass") {
            assert.equal(r.code, 0, `${tag}: ${r.out.slice(-700)}`);
          } else {
            assertStops(r, name, want, tag);
            assert.deepEqual(credentialCalls(r), [], tag);
          }
        }
        // R39 on the harness's calendar: the Sunday is the 11th, the Monday the 12th. The dispatch names a window that
        // opens at 21:00 that Sunday, lets stage 1 start until 06:29 Monday and ends at 08:00 Monday.
        const r39 = { WOPEN: "202610112100", WSTART: "202610120629", WEND: "202610120800" };
        for (const hhmm of ["1500", "2259", "2330"]) {
          const r = await runOnce(harnessConfig(gdoc, name, clockAt(7, hhmm), shell, base, { fill: r39 }), `${shell}-r39-${name}-${hhmm}`, null);
          assertStops(r, name, /so this is not the night the dispatch names/, `${shell} ${name}, Sunday ${hhmm} under the R39 window`);
          assert.deepEqual(credentialCalls(r), [], `${shell} ${name} Sunday ${hhmm}`);
        }
        const monday = { ...clockAt(1, "0000"), stamp: "202610120000", prev: "20261011", next: "20261013" };
        const ok = await runOnce(harnessConfig(gdoc, name, monday, shell, base, { fill: r39 }), `${shell}-r39-${name}-monday`, null);
        assert.equal(ok.code, 0, `${shell} ${name}, Monday 00:00 under the R39 window: ${ok.out.slice(-700)}`);
      }
    }
  });
});

test("NETWORK TIME, both dispatch blocks whole: one source read is enough, a source that disagrees STOPs, and none readable STOPs", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        const run = (net, id) => runOnce({ ...harnessConfig(gdoc, name, CLOSED, shell, base), net }, `${shell}-net-${name}-${id}`, null);
        const noSntp = await run({ sntp: "down" }, "nosntp");
        assert.equal(noSntp.code, 0, noSntp.out.slice(-600));
        assertStops(await run({ sntp: "far" }, "far"), name, /^STOP: the machine's clock disagrees with network time/, `${shell} ${name}, sntp far`);
        assertStops(await run({ sntp: "down", curl: "down" }, "none"), name, /^STOP: the machine's clock could not be held against network time/, `${shell} ${name}, nothing readable`);
      }
    }
  });
});

test("CI ON HELD, BEFORE YOU START whole: the three required check runs must each conclude success on HELD; held-for-apply-blocks-merge is not read; none, a missing, an unfinished, a failed, a renamed or a doubled run, or no answer, STOPs before the journal read", async () => {
  const b = blockWith(gdoc, BYS);
  assert.equal(b.split("\n").filter((l) => l.startsWith("CIRUNS=$(gh api ")).length, 1);
  assert.ok(b.includes(`CIRUNS=$(gh api "${CHECK_RUNS_PATH("${HELD}")}" --jq `), "the check runs are read for HELD, latest per name");
  assert.ok(b.includes(`for CN in ${REQUIRED_CHECK_RUNS.map((n) => `'${n}'`).join(" ")}; do`), "the three names, exactly");
  assert.ok(!b.includes("held-for-apply-blocks-merge'"), "held-for-apply-blocks-merge is never a required name");
  assert.ok(b.indexOf("CIRUNS=$(gh api ") > b.indexOf("IS the commit this block names"), "the CI check runs after HELD is verified");
  assert.ok(b.indexOf("CIRUNS=$(gh api ") < b.indexOf("${READER} 2>&1"), "the CI check runs before the journal read");
  for (const blk of blocksOf(gdoc).filter((x) => x !== b)) assert.ok(!blk.includes("gh api"), "only BEFORE YOU START reads CI");
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      const run = (gh, id) => runOnce({ ...harnessConfig(gdoc, "bys", CLOSED, shell, base), gh }, `${shell}-ci-${id}`, null);
      const green = await run("", "green");
      assert.equal(green.code, 0, green.out.slice(-800));
      for (const n of REQUIRED_CHECK_RUNS) assert.ok(green.out.includes(`CI on HELD:    ${n}: completed, success`), `${shell}: ${n}`);
      assert.match(green.out, new RegExp(`^CI on HELD:    all three required check runs concluded success on ${FAKE_SHA.MAIN}$`, "m"));
      for (const [gh, why] of [["none", "no runs at all"], ["missing", "a required run missing"], ["pending", "a run not finished"], ["failure", "a run that failed"], ["prefix", "a run named short"], ["twice", "a name twice"]]) {
        const r = await run(gh, gh);
        assertStops(r, "bys", /^STOP: CI on the held head is not shown green: the check run .+ is missing, not finished, or did not conclude success/, `${shell} CI ${why}`);
        assert.deepEqual(credentialCalls(r), [], `${shell} CI ${why}: the journal read ran`);
      }
      const down = await run("down", "down");
      assertStops(down, "bys", /^STOP: the check runs on the held head could not be read from GitHub/, `${shell} CI unreadable`);
      assert.deepEqual(credentialCalls(down), [], `${shell} CI unreadable`);
    }
  });
});

test("STALE VARIABLES, the four blocks that load the env file, whole: a stale .invalid DATABASE_URL_DIRECT from the shell does not survive a file that defines only DATABASE_URL", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "stage1", "stage2", "closing"]) {
        const tag = `${shell} ${name}, env file with DATABASE_URL only`;
        const r = await runOnce(harnessConfig(gdoc, name, CLOSED, shell, base), `${shell}-stale-${name}`, { envFile: URL_ONLY_ENV });
        assert.equal(r.unexpected, "", `${tag}: ${r.unexpected}`);
        assert.ok(credentialCalls(r).length > 0, `${tag}: no program that reads the URL ran, so the run proves nothing: ${r.out.slice(-400)}`);
        assert.ok(!r.calls.some((c) => c.args.includes("shell-profile.invalid")), `${tag}: a program was handed the shell's URL`);
        if (blockWith(gdoc, HARNESS_BLOCKS[name].marker).includes("node scripts/assert-production-target.mjs || ")) {
          assert.match(r.out, /^target verified: production, session pooler\.$/m, `${tag}: the guard did not pass on the file's URL: ${r.out.slice(-600)}`);
        }
        if (r.code === 0) assert.ok(r.out.includes(HARNESS_BLOCKS[name].marker), `${tag}: ${r.out.slice(-600)}`);
        else assert.equal(r.out.split("\n").filter((l) => l.startsWith("STOP: ")).length, 1, `${tag}: ${r.out.slice(-600)}`);
      }
    }
  });
});

test("THE WEEKDAY TABLE, stages 0 and 1 whole: the ruled minutes, with proof 2 printed as not claimed", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [label, d, hhmm, closed] of RULED_POINTS) {
        for (const stage of ["stage0", "stage1"]) {
          const r = await runOnce(harnessConfig(gdoc, stage, clockAt(d, hhmm), shell, base), `${shell}-table-${stage}-${d}${hhmm}`, null);
          const tag = `${shell} ${stage} at ${label}`;
          assert.match(r.out, /^R9 proof 2, the migration is catalog-only or touches no table reception writes: no, not claimed /m, tag);
          if (closed) {
            assert.equal(r.code, 0, `${tag}: ${r.out.slice(-700)}`);
          } else {
            assertStops(r, stage, stage === "stage0" ? /^STOP: Lisbon [1-7][0-9]{4} is inside clinic hours by the weekday table / : /^STOP: Lisbon [1-7][0-9]{4}, clock open, clinics inside\. /, tag);
            assert.deepEqual(r.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), [], tag);
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
      ]) {
        const r = await runOnce(harnessConfig(gdoc, "stage1", clock, shell, base), `${shell}-clinics-${label.replace(/\W+/g, "-")}`, null);
        assertStops(r, "stage1", stop, `${shell} ${label}`);
        assert.deepEqual(r.calls.filter((c) => c.args.startsWith("packages/db/scripts/verified-migrate.mjs")), [], label);
      }
    }
  });
});

test("THE VERDICT PROFILES, stages 1 and 2 whole: 14 OK before; 25 OK after; and no other profile passes", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [fixture, exit, stop] of [
        ["pre.out", 0, null],
        ["pre-vac.out", 0, /^STOP: the pre-check printed \[1\] VACUOUS verdicts/],
        ["pre-fail.out", 0, /^STOP: the pre-check printed \[1\] FAIL verdicts/],
        ["pre-short.out", 0, /^STOP: the pre-check printed 13 OK verdicts, not 14\. Nothing was applied$/],
        ["pre.out", 3, /^STOP: the pre-check did not complete/],
      ]) {
        const cfg = harnessConfig(gdoc, "stage1", CLOSED, shell, base);
        const r = await runOnce({ ...cfg, db: { pre: fixture, preExit: exit } }, `${shell}-profile1-${fixture}-${exit}`, null);
        const tag = `${shell} stage 1 on ${fixture}, psql exit ${exit}`;
        if (stop === null) {
          assert.equal(r.code, 0, `${tag}: ${r.out.slice(-600)}`);
          assert.match(r.out, /^the pre-check profile: 14 OK \/ 0 VACUOUS \/ 0 FAIL\. /m, tag);
          continue;
        }
        assertStops(r, "stage1", stop, tag);
        assert.ok(!r.markersAtEnd.includes("0111-applied.ok"), tag);
      }
      for (const [db, stop] of [
        [{}, null],
        [{ post: "post-1vac.out" }, /^STOP: the post-check printed \[1\] VACUOUS verdicts, not 0\. A VACUOUS verdict is not a pass: [^\n]*\. 0111 IS APPLIED and the write stands\. /],
        [{ post: "post-short.out" }, /^STOP: the post-check printed \[24\] OK verdicts, not 25\. /],
        [{ post: "post-fail.out" }, /^STOP: the post-check printed \[1\] FAIL verdicts, or its transcript could not be read\. Stage 1 recorded that it applied 0111, and this read does not agree\. Treat the state as UNKNOWN\. /],
      ]) {
        const r = await runOnce({ ...harnessConfig(gdoc, "stage2", CLOSED, shell, base), db }, `${shell}-profile2-${JSON.stringify(db).replace(/\W+/g, "-")}`, null);
        const tag = `${shell} stage 2 on ${JSON.stringify(db)}`;
        if (stop === null) {
          assert.equal(r.code, 0, `${tag}: ${r.out.slice(-600)}`);
          assert.match(r.out, /^0111 POST-CHECK PASSED\. 14\/14 pre-check OK, post-check 25 OK \/ 0 VACUOUS \/ 0 FAIL, journal 108 to 109; /m, tag);
          assert.ok(r.markersAtEnd.includes("0111-stage2.ok"), tag);
          continue;
        }
        assertStops(r, "stage2", stop, tag);
        assert.ok(!r.markersAtEnd.includes("0111-stage2.ok"), tag);
      }
    }
  });
});

test("A ZONE THAT DID NOT LOAD: every block, run whole with a clock that answers UTC or no zone, STOPS with nothing run after it", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of HARNESS_PLAN) {
        const wet = await runOnce(harnessConfig(gdoc, name, clockAt(2, "2130", "0 of 2", "WET"), shell, base), `${shell}-zone-${name}-WET`, null);
        assert.equal(wet.code, 0, `${shell} ${name} WET: ${wet.out.slice(-500)}`);
        for (const zone of ["UTC", ""]) {
          const r = await runOnce(harnessConfig(gdoc, name, clockAt(2, "2130", "0 of 2", zone), shell, base), `${shell}-zone-${name}-${zone || "none"}`, null);
          const tag = `${shell} ${name} zone [${zone}]`;
          assertStops(r, name, /^STOP: the Lisbon clock did not read as [^\n]* and the zone WET or WEST[^\n]*so the Lisbon zone may not have loaded \[/, tag);
          assert.deepEqual(credentialCalls(r), [], tag);
        }
      }
    }
  });
});

test("A READ THAT CONTRADICTS THE MARKER: stage 2 and the closing read STOP saying the state is UNKNOWN and never that 0111 is applied", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [name, db, rows, start] of [
        ["stage2", { hashN: "0" }, 109, "STOP: the sha256 of 0111 is in the journal 0 times, not once. "],
        ["stage2", {}, 108, "STOP: the journal reads 108 rows, not 108 plus one. "],
        ["closing", {}, 108, "STOP: the journal read after the apply does not say 109. "],
        ["closing", { reader: "without-0111" }, 109, "STOP: the journal read does not list 0111 as APPLIED. "],
      ]) {
        const r = await runOnce({ ...harnessConfig(gdoc, name, CLOSED, shell, base), rows, db }, `${shell}-contra-${name}-${JSON.stringify(db).replace(/\W+/g, "-")}-${rows}`, null);
        const tag = `${shell} ${name} ${JSON.stringify(db)} rows ${rows}`;
        assert.equal(r.code, 1, `${tag}: ${r.out.slice(-500)}`);
        const stop = r.out.split("\n").filter((l) => l.startsWith("STOP: "));
        assert.equal(stop.length, 1, tag);
        assert.ok(stop[0].startsWith(`${start}${STATE_UNKNOWN}`), `${tag}: ${stop[0]}`);
      }
      const s2cfg = harnessConfig(gdoc, "stage2", CLOSED, shell, base);
      const positive = await runOnce(s2cfg, `${shell}-contra-positive`, null);
      const postCall = positive.calls.find((c) => c.id.startsWith("psql#") && c.args.includes(POST));
      for (const [, row, name] of CARRY_MAP) assert.ok(postCall.args.includes(`\n${name}=${carryValue(row)}\n`), `the post-check was not handed ${name}`);
      const failed = await runOnce(s2cfg, `${shell}-contra-psql-fails`, { call: postCall.id });
      assert.deepEqual(failed.out.split("\n").filter((l) => l.startsWith("STOP: ")), [`STOP: the post-check did not complete (psql's lines are above), or its transcript could not be written. ${POST_RUN_SENTENCE}`]);
      assert.deepEqual(failed.calls.filter((c) => c.id.startsWith("psql#") && c.pos > postCall.pos), []);
    }
  });
});

test("THE APPLIED MARKER: one from this sitting stops stages 0 and 1 and the two dispatch blocks; one 13 hours old stops none of them", async () => {
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["stage0", "stage1", "bys", "clock"]) {
        const cfg = harnessConfig(gdoc, name, CLOSED, shell, base);
        const young = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0111-applied.ok", "", 719); } }, `${shell}-${name}-age-719`, null);
        assertStops(young, name, /^STOP: (stage 1 has ALREADY APPLIED 0111 in this sitting|0111 was applied in this sitting)/, `${shell} ${name} 719`);
        const old = await runOnce({ ...cfg, setup: (tmp) => { cfg.setup(tmp); putRecord(tmp, "0111-applied.ok", "", 780); } }, `${shell}-${name}-age-780`, null);
        assert.equal(old.code, 0, `${shell} ${name} 780: ${old.out.slice(-600)}`);
      }
    }
  });
});

test("A PINNED FILE THAT DIFFERS OR IS NOT THERE: every pin a block assigns is compared, and the block STOPS on it before anything runs with credentials", async () => {
  for (const b of blocksOf(gdoc)) assert.deepEqual(pinComparedProblems(b), []);
  assert.deepEqual(HARNESS_PLAN.map((n) => pinsOf(blockWith(gdoc, HARNESS_BLOCKS[n].marker)).length), [9, 9, 0, 6, 4, 2]);
  const cases = HARNESS_PLAN.flatMap((name) => pinsOf(blockWith(gdoc, HARNESS_BLOCKS[name].marker)).flatMap((pin) => ["differs", "is missing"].map((kind) => ({ name, pin, kind }))));
  assert.equal(cases.length, 60);
  await inPool(cases, Number(process.env.HARNESS_POOL) || Math.max(2, Math.floor(cpus().length / 2)), async ({ name, pin, kind }) => {
    await withHarness(async (base) => {
      for (const shell of shellsHere()) {
        const tag = `${shell} ${name}: the file of ${pin} ${kind}`;
        const r = await runOnce(harnessConfig(gdoc, name, CLOSED, shell, base), `${shell}-pin-${name}-${pin}`, null);
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
  const good = journalAsOf0111(JSON.parse(read(JOURNAL)));
  const edit = (fn) => { const j = structuredClone(good); fn(j.entries); return j; };
  const last = (e) => e[e.length - 1];
  const prev = (e) => e[e.length - 2];
  for (const [what, journal] of [
    ["110 entries", edit((e) => { e.unshift({ idx: -1, version: e[0].version, when: 0, tag: "0000_before", breakpoints: true }); })],
    ["the newest entry's when", edit((e) => { last(e).when += 1; })],
    ["the tag of the entry before it", edit((e) => { prev(e).tag = "0110_other"; })],
  ]) {
    await withHarness(async (base) => {
      for (const shell of shellsHere()) {
        const r = await runOnce(harnessConfig(gdoc, "stage0", CLOSED, shell, base), `${shell}-journal`, null);
        assertStops(r, "stage0", /^STOP: the newest journal entry is not idx 108, tag 0111_sistemas_subsistemas, when 1788503300000, of 109, after idx 107 tagged 0110_services_booking_type_fields at when 1788503200000$/, `${shell}: ${what}`);
      }
    }, (apply) => writeFileSync(join(apply, JOURNAL), `${JSON.stringify(journal, null, 2)}\n`));
  }
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["stage0", "stage1"]) {
        const r = await runOnce(harnessConfig(gdoc, name, CLOSED, shell, base), `${shell}-second-${name}`, null);
        assertStops(r, name, /^STOP: 2 files claim migration number 0111, not 1$/, `${shell} ${name}`);
      }
    }
  }, (apply) => writeFileSync(join(apply, "packages/db/migrations/0111_other.sql"), "SELECT 1;\n"));
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "stage0", "stage1"]) {
        const dirty = await runOnce({ ...harnessConfig(gdoc, name, CLOSED, shell, base), git: { stray: " M docs/migration-apply-0111.md" } }, `${shell}-dirty-${name}`, null);
        assertStops(dirty, name, /^STOP: the apply worktree is not clean/, `${shell} ${name}, a dirty worktree`);
      }
      for (const [name, stop] of [
        ["stage1", /^STOP: the worktree is not on the recorded sha after the checkout\. Nothing was applied$/],
        ["stage2", /^STOP: the worktree is not on the recorded sha after the checkout\. 0111 IS APPLIED and the write stands\. /],
      ]) {
        const r = await runOnce({ ...harnessConfig(gdoc, name, CLOSED, shell, base), git: { checkout: "stuck" } }, `${shell}-stuck-${name}`, null);
        assertStops(r, name, stop, `${shell} ${name}, a checkout that did not move HEAD`);
        assert.deepEqual(credentialCalls(r), []);
      }
      const moved = await runOnce(harnessConfig(gdoc, "bys", CLOSED, shell, base, { fill: { HELD: "2".repeat(40) } }), `${shell}-bys-moved`, null);
      assertStops(moved, "bys", /^STOP: the held head is not the commit this block names \(2{40}\)/, `${shell} BEFORE YOU START, another held head`);
      const wrongDoc = await runOnce(harnessConfig(gdoc, "clock", CLOSED, shell, base, { fill: { DOCSHA: "c".repeat(64) } }), `${shell}-clock-doc`, null);
      assertStops(wrongDoc, "clock", /^STOP: the document at the recorded sha is not the approved one\. /, `${shell} CLOCK CHECK, another document`);
    }
  });
});

test("BETWEEN THE STAGES: the window's end in stage 2 and the closing read; a clock that moved on during stage 1; and what stage 2 is handed", async () => {
  await withHarness(async (base) => {
    const M = FAKE_SHA.MAIN;
    const now = CLOSED.stamp;
    const day = now.slice(0, 8);
    const fx = harnessFixtures();
    const rowOf = (name) => fx["pre.out"].split("\n").find((l) => l.trimStart().startsWith(`${name} `));
    for (const shell of shellsHere()) {
      const run = (name, id, over = {}) => {
        const cfg = harnessConfig(gdoc, name, over.clock ?? CLOSED, shell, base);
        const { records, ...rest } = over;
        return runOnce({ ...cfg, ...rest, setup: (tmp) => { cfg.setup(tmp); records?.(tmp); } }, `${shell}-between-${id}`, null);
      };
      const window = (text) => (tmp) => putRecord(tmp, "0111-window.ok", `${text}\n`, 15);
      for (const name of ["stage2", "closing"]) {
        const atEnd = await run(name, `${name}-end`, { records: window(`${M} ${day}2100 ${day}2229 ${now}`) });
        assertStops(atEnd, name, new RegExp(`Lisbon ${now} is at or past ${now}, the end of the run window\\. 0111 IS APPLIED and the write stands\\. `), `${shell} ${name}, now AT the window's end`);
        assert.deepEqual(credentialCalls(atEnd), [], name);
      }
      const moved = await run("stage1", "moved", { clock: { ...CLOSED, laterFrom: 2, later: `${day}2201` }, records: window(`${M} ${day}2100 ${day}2200 209912310000`) });
      assertStops(moved, "stage1", new RegExp(`^STOP: Lisbon ${day}2201 is past ${day}2200 after the pre-check, so the apply does not start\\. Nothing was applied$`), `${shell}: the clock moved on`);
      const preOut = (text) => (tmp) => putRecord(tmp, "0111-precheck.out", text, 6);
      const swapRow = (name, fn) => { const row = rowOf(name); assert.ok(row, name); return fx["pre.out"].replace(`${row}\n`, () => { const to = fn(row); return to === "" ? "" : `${to}\n`; }); };
      const handed = [
        ["the applied marker 70 minutes old", { records: (tmp) => putRecord(tmp, "0111-applied.ok", "", 70) }, /^STOP: stage 1 left no applied marker in this sitting, or left it over an hour ago\. If stage 1 ended with its line 0111 APPLIED, then /],
        ["a count carry that is not a number", { records: preOut(swapRow("policies_before", (r) => r.replace(`| ${COUNT_CARRIES.policies_before} `, "| x "))) }, /^STOP: a count carry is not a number\. 0111 IS APPLIED and the write stands\. /],
        ["an md5 carry one character short", { records: preOut(swapRow("policies_md5", (r) => r.replace(/\| ([0-9a-f]{31})[0-9a-f]/, "| $1"))) }, /^STOP: an md5 carry is not 32 hex characters\. 0111 IS APPLIED and the write stands\. /],
        ...CARRY_MAP.map(([, c]) => [`the carry row ${c} missing`, { records: preOut(swapRow(c, () => "")) }, /^STOP: a carry did not parse out of the transcript\. 0111 IS APPLIED and the write stands\. /]),
      ];
      for (const [what, over, stop] of handed) {
        const r = await run("stage2", `handed-${what.replace(/\W+/g, "-")}`, over);
        assertStops(r, "stage2", stop, `${shell} stage 2, ${what}`);
        assert.deepEqual(credentialCalls(r), [], what);
      }
      for (const [what, over, stop] of [
        ["a pass mark older than the apply", { records: (tmp) => putRecord(tmp, "0111-stage2.ok", `${M}\n`, 20) }, /^STOP: stage 2's pass mark is older than the apply\. 0111 IS APPLIED and the write stands\. /],
        ["a later migration pending on the recorded sha", { db: { reader: "pending-later" } }, /^STOP: the journal read finds a migration pending on the recorded sha\. 0111 IS APPLIED /],
        ["a journal row with no matching file", { db: { reader: "orphan-row" } }, /^STOP: the journal holds a row with no matching file on the recorded sha\. 0111 IS APPLIED /],
      ]) {
        const r = await run("closing", `closing-${what.replace(/\W+/g, "-")}`, over);
        assertStops(r, "closing", stop, `${shell} closing, ${what}`);
      }
    }
  });
});

/** A `date` on PATH that is the REAL date at one fixed instant: GNU's `-d @epoch`, or BSD's `-r epoch`. It keeps the caller's TZ. */
function fixedDateDir(realDate) {
  const dir = mkdtempSync(join(tmpdir(), "real-date-0111-"));
  writeFileSync(join(dir, "date"), `#!/bin/sh\nif ${shq(realDate)} -d @0 +%s >/dev/null 2>&1; then exec ${shq(realDate)} -d "@$FIXED_EPOCH" "$@"; fi\nexec ${shq(realDate)} -r "$FIXED_EPOCH" "$@"\n`);
  chmodSync(join(dir, "date"), 0o755);
  return dir;
}

test("THE REAL date, at fixed instants, through the blocks' own clock lines: the Lisbon reading, summer and winter, and Saturday morning", () => {
  const dir = fixedDateDir(realPath("date"));
  try {
    const epoch = (iso) => String(Date.parse(iso) / 1000);
    const run = (script, iso) => spawnSync("bash", ["--noprofile", "--norc", "-c", script], { encoding: "utf8", env: { PATH: `${dir}:${SYSTEM_PATH}`, TZ: "Asia/Tokyo", FIXED_EPOCH: epoch(iso), LANG: "C" } });
    const s0 = blockWith(gdoc, STAGE0);
    const five = [CLOCK_READ, CLOCK_ZONE, CLOCK_SPLIT, CLOCK_FORMAT, CLOCK_DECIDE];
    for (const l of five) assert.ok(s0.split("\n").includes(l));
    const clock = `${five.join("\n")}\necho "READ \${DTZ} \${DT} \${CLOCK}"\n`;
    for (const [iso, want] of [
      ["2026-10-19T19:59:00Z", "READ 12059 WEST 12059 open"], ["2026-10-19T20:00:00Z", "READ 12100 WEST 12100 closed"],
      ["2026-11-07T08:30:00Z", "READ 60830 WET 60830 open"], ["2026-11-07T13:00:00Z", "READ 61300 WET 61300 closed"],
      ["2026-11-01T22:59:00Z", "READ 72259 WET 72259 closed"], ["2026-11-02T08:00:00Z", "READ 10800 WET 10800 open"],
    ]) {
      const r = run(clock, iso);
      assert.equal(r.status, 0, `${iso}: ${r.stdout}${r.stderr}`);
      assert.equal(r.stdout.trim(), want, iso);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// =====================================================================================
// BLOCK A' (THE STACKED MERGE, strategy's C3 of 2026-11-05) AND THE CHAIN GATE (C1, C2)
// =====================================================================================

/** Block A', SOLO's: the one block of the promotion section that prints its stacked line. */
const APRIME = blockWith(pdoc, "BLOCK A DONE (stacked)");
const aval = (name) => (new RegExp(`^${name}=(\\S+)$`, "m").exec(APRIME) ?? [])[1];
const APRIME_SUCCESS = "BLOCK A DONE (stacked). Paste block B.";
/** The lines of block A' that a later step relies on, each of which must carry its own explicit halt. */
const APRIME_MUST_HALT = [
  /^git -C "\$\{REPO\}" (fetch|merge-base|show|worktree|diff)\b/, /^(PT|MP|MT|TIP|PS|MD|STRAY|LD|D1|D2)=\$\(/, /^\[ /, /^echo "\$\{\w+\}" \| grep -q/,
  /^cd /, /^node -e /, /\| node -e /, /^git merge-base --is-ancestor /, /^git merge --no-ff /,
];
export function aprimeUnguarded(block) {
  const out = [];
  const lines = block.split("\n");
  lines.forEach((line, i) => {
    if (/^(if|for|else|fi|done)( |$)/.test(line) || /^echo "[^"]*"$/.test(line)) return;
    // The merge carries its trailer on a second line, and the halt ends that line.
    const whole = /^git merge --no-ff .*"Co-Authored-By: [^"]*$/.test(line) ? lines[i + 1] ?? "" : line;
    if (APRIME_MUST_HALT.some((re) => re.test(line)) && !EXPLICIT_HALT.test(whole)) out.push(`${i + 1}: ${line.slice(0, 100)}`);
  });
  return out;
}
/** The git verb of a recorded call, past any -C <dir>. */
const gitVerb = (c) => { const a = c.args.split("\n"); return a[0] === "-C" ? a[2] : a[0]; };

test("BLOCK A' (THE STACKED MERGE): it reads no pull request's state; it pins the lower commit, the previous migration's sha256 and its journal entry, and they are this branch's facts", () => {
  assert.ok(!/(^|[\s(])gh /m.test(APRIME), "block A' runs gh");
  assert.ok(!APRIME.includes("MERGED"), "block A' still waits for MERGED");
  assert.ok(!/gh pr view/.test(pdoc), "the promotion section still reads a pull request's state");
  assert.equal(aval("BR"), BRANCH.replace(/^origin\//, ""));
  assert.equal(aval("PREVBR"), "db/RODICA-services-vat-colour");
  assert.match(aval("PREVHEAD") ?? "", /^[0-9a-f]{40}$/);
  assert.equal(aval("PREVMIG"), PREV_PATH);
  assert.equal(aval("SHAPREV"), EXTERNAL_PINS.SHAPREV);
  assert.equal(sha256(read(PREV_PATH)), aval("SHAPREV"), "the previous migration on this branch is not the one block A' pins");
  const live = JSON.parse(read(JOURNAL));
  const p = live.entries.find((e) => e.tag === PREV_TAG);
  assert.deepEqual([aval("PREVTAG"), aval("PREVIDX"), aval("PREVWHEN")], [PREV_TAG, String(p.idx), String(p.when)]);
  assert.equal(aval("SHA"), MIGRATION_SHA);
  assert.equal(aval("PEND"), `packages/db/migrations-pending/NEXT-AFTER-0109_${TAG.slice(5)}.sql`);
  assert.equal(aval("JOURNAL"), JOURNAL);
  // Merges, never a rebase, a reset, a force or a push.
  assert.ok(APRIME.includes('for R in origin/main "${PREVHEAD}"; do'), "it does not merge origin/main and then the lower commit");
  assert.ok(APRIME.includes('git merge --no-ff -m "Merge ${R} into ${BR}" -m "Co-Authored-By: '), "the merge is not a --no-ff merge with the trailer");
  const commands = APRIME.replace(/echo "[^"]*"/g, "").replace(/-m "[^"]*"/g, "");
  for (const bad of ["rebase", "--force", "push", "reset", "--no-verify", "checkout", "stash"]) assert.ok(!commands.includes(bad), `block A' runs ${bad}`);
  assert.deepEqual(blockHazards(APRIME), []);
  assert.deepEqual(aprimeUnguarded(APRIME), []);
  for (const line of APRIME.split("\n")) if (line.includes('echo "STOP: ')) assert.match(line, /echo "STOP: [^"]+";( echo "\$\{STRAY\}";)? exit 1; (\}|fi)$/, line.slice(0, 120));
  // Every check of the lower head and of the held head comes before anything is changed.
  const at = (s) => { const i = APRIME.indexOf(s); assert.ok(i >= 0, s); return i; };
  const wt = at('worktree add --detach "${WT}" "${TIP}"');
  for (const s of ['git -C "${REPO}" merge-base --is-ancestor "${PREVHEAD}" "${PT}" ||', '[ "${MP}" = "${SHAPREV}" ] ||', '[ "${MT}" = "${SHAPREV}" ] ||', '[ -z "${LD}" ] ||', '"${PREVIDX}" "${PREVTAG}" "${PREVWHEN}" ||', '[ "${PS}" = "${SHA}" ] ||']) assert.ok(at(s) < wt, s);
  // And after the merges, on disk: the previous migration's bytes, the journal's newest entry and the pending file.
  const done = at(APRIME_SUCCESS);
  for (const s of ['git merge-base --is-ancestor origin/main HEAD ||', 'git merge-base --is-ancestor "${PREVHEAD}" HEAD ||', '[ "${MD}" = "${SHAPREV}" ] ||', '"${PREVIDX}" "${PREVTAG}" "${PREVWHEN}" "${JOURNAL}" ||']) assert.ok(at(s) > at("\ndone\n") && at(s) < done, s);
  // Block B's README row speaks of the stack, not of a merge to main.
  const B = blockWith(pdoc, "PROMOTED at $(git rev-parse HEAD). Not pushed.");
  assert.ok(B.includes("Promoted on the stack above the held head of #1704"), "block B's row does not say the promotion is stacked");
  assert.ok(!B.includes("was applied and merged"), "block B's row still says the previous migration was merged");
  // RED ARMS
  assert.equal(aprimeUnguarded(APRIME.replace(/^(MT=\$\(.*?) \|\| \{ echo "STOP: [^"]+"; exit 1; \}$/m, "$1")).length, 1);
  assert.equal(aprimeUnguarded(`${APRIME}git -C "\${REPO}" fetch origin\n`).length, 1);
});

test("BLOCK A' parses under bash -n and zsh -n", (t) => {
  const r = spawnSync("bash", ["--noprofile", "--norc", "-n", "-c", APRIME], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  if (!zshOrSkip(t)) return;
  const z = spawnSync("zsh", ["-f", "-n", "-c", APRIME], { encoding: "utf8" });
  assert.equal(z.status, 0, z.stderr);
});

// ---- block A''s own harness: git is faked, node, shasum, cut and grep are the real programs behind a counting stub.

const A_STUBBED = ["git", "node", "shasum", "cut", "grep"];
const A_SHA = { PREVHEAD: "a".repeat(40), PT: "b".repeat(40), TIP: "c".repeat(40), MERGE1: "d".repeat(40), MERGE2: "e".repeat(40) };
const A_REPO = "/Users/ivan/Projects/GitHub/OsteoJP";
const A_WT = `/Users/ivan/Projects/GitHub/osteojp-solo-wt/promote-${TAG.slice(0, 4)}`;

function aStubText(name, real) {
  const R = (n) => shq(real[n]);
  return `#!/bin/sh
n=${shq(name)}
d="$AH_RUN"
k=0
if [ -f "$d/cnt.$n" ]; then read -r k < "$d/cnt.$n"; fi
k=$((k + 1))
echo "$k" > "$d/cnt.$n"
id="$n#$k"
printf '%s\\n' "$@" > "$d/args.$id"
echo "$id" >> "$d/log"
unexpected() { printf '%s %s\\n' "$id" "$*" >> "$d/unexpected"; echo "harness: unexpected call $id" >&2; exit 97; }
for a in "$@"; do case "$a" in *osteojp-secrets*|/Users/ivan/*) unexpected "a real path";; esac; done
if [ "$AH_FAIL" = "$id" ]; then
  echo "$id" > "$d/fired"
  if [ "$AH_FAIL_MODE" = empty ]; then exit 0; fi
  case "$n" in
    git) echo "fatal: harness fault" >&2; exit 128;;
    grep|cut|shasum) ${R("cat")} > /dev/null; echo "$n: harness fault" >&2; exit 2;;
    *) echo "$n: harness fault" >&2; exit 1;;
  esac
fi
if [ "$n" != git ]; then exec ${R(name)} "$@"; fi
if [ "$1" = -C ]; then shift 2; fi
case "$1" in
  fetch) exit 0;;
  rev-parse)
    if [ "$2" = "origin/$AH_PREVBR" ]; then echo "$AH_PT"; exit 0; fi
    if [ "$2" = "origin/$AH_BR" ]; then echo "$AH_TIP"; exit 0; fi
    if [ "$2" = HEAD ]; then ${R("cat")} "$d/head"; exit 0; fi
    if [ "$2" = -q ] && [ "$3" = --verify ] && [ "$4" = MERGE_HEAD ]; then [ -f "$d/mergehead" ] && exit 0; exit 1; fi
    if [ "$2" = -q ] && [ "$3" = --verify ] && [ "$4" = 'HEAD^2' ]; then [ -f "$d/ismerge" ] && exit 0; exit 1; fi
    unexpected "$@";;
  merge-base) [ "$2" = --is-ancestor ] || unexpected "$@"
    if [ "$3" = "$AH_PREVHEAD" ] && [ "$4" = "$AH_PT" ]; then [ "$AH_LOWER" = moved ] && exit 1; exit 0; fi
    if [ "$3" = "$AH_TIP" ] && [ "$4" = HEAD ]; then [ "$AH_TIPANC" = no ] && exit 1; exit 0; fi
    if [ "$3" = origin/main ] && [ "$4" = HEAD ]; then [ -f "$d/in.main" ] && exit 0; exit 1; fi
    if [ "$3" = "$AH_PREVHEAD" ] && [ "$4" = HEAD ]; then [ -f "$d/in.prev" ] && exit 0; exit 1; fi
    unexpected "$@";;
  show) spec="$2"; sha="\${spec%%:*}"; path="\${spec#*:}"
    case "$sha" in "$AH_PREVHEAD") dir=prevhead;; "$AH_PT") dir=pt;; "$AH_TIP") dir=tip;; *) echo "fatal: bad revision '$sha'" >&2; exit 128;; esac
    [ -f "$AH_FIX/$dir/$path" ] || { echo "fatal: path '$path' does not exist in '$sha'" >&2; exit 128; }
    exec ${R("cat")} "$AH_FIX/$dir/$path";;
  worktree) [ "$2" = add ] && [ "$3" = --detach ] && [ "$5" = "$AH_TIP" ] || unexpected "$@"
    ${R("mkdir")} -p "$4" && ${R("cp")} -R "$AH_FIX/wt/." "$4/" && echo "$5" > "$d/head"; exit 0;;
  status) [ "$2" = --porcelain ] || unexpected "$@"; exit 0;;
  diff) if [ "$2" = --name-only ]; then [ -n "$AH_LOWERDIFF" ] && printf '%s\\n' "$AH_LOWERDIFF"; exit 0; fi
    if [ "$AH_DIFF" = markers ]; then printf '+<<<<<<< HEAD\\n+>>>>>>> other\\n'; fi; exit 0;;
  merge) [ "$2" = --no-ff ] || unexpected "$@"
    for a in "$@"; do last="$a"; done
    case "$last" in origin/main) : > "$d/in.main"; echo "$AH_M1" > "$d/head";; "$AH_PREVHEAD") : > "$d/in.prev"; echo "$AH_M2" > "$d/head";; *) unexpected "$@";; esac
    : > "$d/ismerge"; exit 0;;
esac
unexpected "$@"
`;
}

/** The fixtures: the lower commit and the lower head carry the previous migration and its journal; the held head carries the pending file; the worktree is the stacked state. */
function aprimeFixtures(base, change = () => {}) {
  const prevJournal = (() => {
    const live = JSON.parse(read(JOURNAL));
    const at = live.entries.findIndex((e) => e.tag === PREV_TAG);
    return `${JSON.stringify({ ...live, entries: live.entries.slice(0, at + 1) }, null, 2)}\n`;
  })();
  const pend = aval("PEND");
  const files = {
    [`prevhead/${PREV_PATH}`]: read(PREV_PATH), [`prevhead/${JOURNAL}`]: prevJournal,
    [`pt/${PREV_PATH}`]: read(PREV_PATH), [`pt/${JOURNAL}`]: prevJournal,
    [`tip/${pend}`]: migration,
    [`wt/${PREV_PATH}`]: read(PREV_PATH), [`wt/${JOURNAL}`]: prevJournal, [`wt/${pend}`]: migration,
  };
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, "fix", f)), { recursive: true });
    writeFileSync(join(base, "fix", f), text);
  }
  change(join(base, "fix"));
  mkdirSync(join(base, "bin"), { recursive: true });
  const real = Object.fromEntries(["cat", "mkdir", "cp", "shasum", "cut", "grep"].map((n) => [n, realPath(n)]));
  real.node = process.execPath;
  for (const n of A_STUBBED) {
    writeFileSync(join(base, "bin", n), aStubText(n, real));
    chmodSync(join(base, "bin", n), 0o755);
  }
}

export function aprimeLocalize(block, run) {
  const out = block.replaceAll(A_WT, join(run, "wt")).replaceAll(A_REPO, join(run, "repo"));
  if (out.includes("/Users/ivan")) throw new Error("the localized block A' still names /Users/ivan");
  return out;
}

async function aprimeRun(base, shell, runId, opts = {}) {
  const run = join(base, "runs", runId);
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(run, "repo"), { recursive: true });
  opts.setup?.(run);
  const env = {
    PATH: `${join(base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    AH_RUN: run, AH_FIX: join(base, "fix"), AH_PREVBR: "db/RODICA-services-vat-colour", AH_BR: BRANCH.replace(/^origin\//, ""),
    AH_PREVHEAD: A_SHA.PREVHEAD, AH_PT: A_SHA.PT, AH_TIP: A_SHA.TIP, AH_M1: A_SHA.MERGE1, AH_M2: A_SHA.MERGE2,
    AH_FAIL: opts.fault?.call ?? "", AH_FAIL_MODE: opts.fault?.mode ?? "", AH_LOWER: opts.lower ?? "", AH_DIFF: opts.diff ?? "", AH_LOWERDIFF: opts.lowerDiff ?? "", AH_TIPANC: opts.tipAncestor ?? "",
  };
  const block = aprimeLocalize(APRIME.replace(`PREVHEAD=${aval("PREVHEAD")}`, `PREVHEAD=${A_SHA.PREVHEAD}`), run);
  const r = await runShell(shell, block, env, run);
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").trim().split("\n").filter(Boolean).map((id, pos) => ({ id, pos, args: readRun(`args.${id}`) }));
  const result = { ...r, calls, unexpected: readRun("unexpected"), fired: readRun("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

async function withAprime(fn, change) {
  const base = mkdtempSync(join(tmpdir(), "fault-0111-aprime-"));
  try {
    aprimeFixtures(base, change);
    return await fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** The calls whose failure may leave block A' running, each with its reason. */
export function aprimeMayContinue(positive) {
  return (call) => {
    const args = call.args.split("\n").filter(Boolean);
    const gitArgs = args[0] === "-C" ? args.slice(2) : args;
    if (!call.id.startsWith("git#")) return null;
    if (gitArgs[0] === "fetch") return null;
    if (gitArgs[0] === "rev-parse" && gitArgs[1] === "HEAD") return "a read of HEAD that is only printed for the report";
    if (gitArgs[0] === "rev-parse" && gitArgs[3] === "HEAD^2") return "the marker check of a merge at HEAD: false reads 'not a merge', and block B checks the merge's marker lines again";
    if (gitArgs[0] === "merge-base" && gitArgs[3] === "HEAD" && (gitArgs[2] === "origin/main" || gitArgs[2] === A_SHA.PREVHEAD)) {
      const next = positive.calls.find((c) => c.pos > call.pos && c.id.startsWith("git#"));
      if (next && next.args.split("\n")[0] === "merge") return "the loop's 'is it already in' read: false means merge it, which the positive run does anyway";
    }
    return null;
  };
}

async function aprimeSweep(base, shell) {
  const positive = await aprimeRun(base, shell, `${shell}-positive`);
  assert.equal(positive.code, 0, `${shell}: block A' positive: ${positive.out.slice(-1500)}`);
  assert.ok(positive.out.includes(APRIME_SUCCESS) && positive.out.includes("TOOL-CHAIN-CONTINUED"), positive.out.slice(-800));
  assert.equal(positive.unexpected, "", positive.unexpected);
  assert.doesNotMatch(positive.out, /^STOP: /m);
  assert.match(positive.out, /^merged: origin\/main at d{40}$/m);
  assert.match(positive.out, new RegExp(`^merged: a{40} at e{40}$`, "m"));
  const allow = aprimeMayContinue(positive);
  const faults = positive.calls.map((c) => ({ call: c.id, at: c }));
  // An empty answer that exits 0, for the git calls whose output decides something. Not for merge-base --is-ancestor: it prints nothing, and exit 0 is its yes.
  for (const c of positive.calls.filter((x) => x.id.startsWith("git#") && !/^(fetch|diff|status|merge-base)$/.test(gitVerb(x) ?? ""))) faults.push({ call: c.id, at: c, mode: "empty" });
  const bad = [];
  const rows = await inPool(faults, Number(process.env.HARNESS_POOL) || Math.max(2, cpus().length), async (f, i) => {
    const r = await aprimeRun(base, shell, `${shell}-f${i}`, { fault: f });
    const label = `${f.call}${f.mode ? ":empty" : ""} [${f.at.args.split("\n").filter(Boolean).join(" ").replace(/^-C \S+ /, "").slice(0, 90)}]`;
    const halted = r.code !== 0 && !r.out.includes("TOOL-CHAIN-CONTINUED");
    const problems = [];
    if (r.fired !== f.call) problems.push("the fault never fired");
    if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
    const allowed = allow(f.at);
    if (allowed) {
      if (halted && !/^STOP: /m.test(r.out)) problems.push("it halted without a STOP line");
    } else {
      if (r.code === 0) problems.push("exit 0");
      if (r.out.includes("TOOL-CHAIN-CONTINUED")) problems.push("the tool chain continued");
      if (r.out.includes(APRIME_SUCCESS)) problems.push("it printed its pass line");
      if (!/^STOP: /m.test(r.out)) problems.push("no STOP line");
    }
    if (problems.length) bad.push(`${shell} ${label}: ${problems.join("; ")}\n${r.out.slice(-500)}`);
    return { halted, allowed };
  });
  assert.deepEqual(bad, [], `block A' fault rows that broke a rule:\n${bad.join("\n")}`);
  return { calls: positive.calls.length, faults: rows.length, halts: rows.filter((x) => x.halted).length };
}

test("BLOCK A' FAULT INJECTION, bash with errexit off and zsh in GREEN's shape: every external call, made to fail, halts it", async (t) => {
  await withAprime(async (base) => {
    for (const shell of shellsHere()) {
      const s = await aprimeSweep(base, shell);
      assert.ok(s.faults > s.calls, `${shell}: ${s.faults} faults for ${s.calls} calls`);
      t.diagnostic(`${shell} block A': ${s.calls} calls, ${s.faults} faults, ${s.halts} halt, ${s.faults - s.halts} allowed to continue`);
    }
  });
});

test("BLOCK A', run whole: a lower commit that is gone, a stale lower copy, a lower journal with one more entry and a pending file that differs each STOP before the worktree is made", async () => {
  for (const [what, opts, change, stop] of [
    ["the lower commit is not on the lower branch", { lower: "moved" }, undefined, /^STOP: a{40} is not on origin\/db\/RODICA-services-vat-colour \(now b{40}\): the lower commit this document stacks on was rewritten or is gone\. Nothing was changed$/],
    ["the lower head carries other bytes", {}, (fix) => writeFileSync(join(fix, "pt", PREV_PATH), `${read(PREV_PATH)}\n`), /^STOP: the lower held head b{40} now carries other 0110 bytes \[[0-9a-f]{64}\], so this stack would hold a stale copy\. /],
    ["the lower journal carries one more entry", {}, (fix) => {
      const j = JSON.parse(readFileSync(join(fix, "prevhead", JOURNAL), "utf8"));
      j.entries.push({ ...j.entries[j.entries.length - 1], idx: j.entries.length, tag: "9999_later", when: 1 + j.entries[j.entries.length - 1].when });
      writeFileSync(join(fix, "prevhead", JOURNAL), `${JSON.stringify(j, null, 2)}\n`);
    }, /^STOP: the journal at a{40} does not end with 0110_\w+ at idx \d+, when \d+, of \d+ plus one entries\. Nothing was changed$/],
    ["the lower head changed a migration file after the pinned commit", { lowerDiff: "packages/db/migrations/meta/_journal.json" }, undefined, /^STOP: the lower held head b{40} changed a migration file, a mirror or a pending file after a{40} \[packages\/db\/migrations\/meta\/_journal\.json\], so this stack would hold a stale copy\. /],
    ["the pending file at the held head differs", {}, (fix) => writeFileSync(join(fix, "tip", aval("PEND")), `${migration}\n`), /^STOP: the pending file at the held head is not the approved body \[[0-9a-f]{64}\]\. Nothing was changed$/],
  ]) {
    await withAprime(async (base) => {
      for (const shell of shellsHere()) {
        const r = await aprimeRun(base, shell, `${shell}-whole`, opts);
        const tag = `${shell}: ${what}`;
        assert.equal(r.code, 1, `${tag}: ${r.out.slice(-600)}`);
        const stops = r.out.split("\n").filter((l) => l.startsWith("STOP: "));
        assert.equal(stops.length, 1, `${tag}: ${stops.join(" | ")}`);
        assert.match(stops[0], stop, tag);
        assert.equal(r.unexpected, "", tag);
        assert.deepEqual(r.calls.filter((c) => c.id.startsWith("git#") && /^(worktree|merge)$/.test(gitVerb(c) ?? "")), [], `${tag}: it changed something`);
      }
    }, change);
  }
});

test("BLOCK A', run again after a conflict: it resumes in the same worktree, refuses an unfinished merge or a merge committed with marker lines, and skips what is already merged", async () => {
  await withAprime(async (base) => {
    for (const shell of shellsHere()) {
      const seeded = (merge) => (run) => {
        mkdirSync(join(run, "wt"), { recursive: true });
        cpRecursive(join(base, "fix", "wt"), join(run, "wt"));
        writeFileSync(join(run, "head"), `${A_SHA.MERGE2}\n`);
        writeFileSync(join(run, "ismerge"), "");
        writeFileSync(join(run, "in.main"), "");
        if (merge !== "half") writeFileSync(join(run, "in.prev"), "");
        if (merge === "open") writeFileSync(join(run, "mergehead"), "");
      };
      const ok = await aprimeRun(base, shell, `${shell}-resume`, { setup: seeded("done") });
      assert.equal(ok.code, 0, ok.out.slice(-800));
      assert.match(ok.out, /^resuming in .* at e{40}, which descends from the held head c{40}$/m);
      assert.match(ok.out, /^already in: origin\/main$/m);
      assert.match(ok.out, /^already in: a{40}$/m);
      assert.ok(ok.out.includes(APRIME_SUCCESS));
      const half = await aprimeRun(base, shell, `${shell}-resume-half`, { setup: seeded("half") });
      assert.equal(half.code, 0, half.out.slice(-800));
      assert.match(half.out, /^already in: origin\/main$/m);
      assert.match(half.out, /^merged: a{40} at e{40}$/m);
      const open = await aprimeRun(base, shell, `${shell}-resume-open`, { setup: seeded("open") });
      assert.equal(open.code, 1, open.out);
      assert.match(open.out, /^STOP: a merge is still in progress in .*; resolve it by marker LINES and commit it, then paste this block again$/m);
      const stray = await aprimeRun(base, shell, `${shell}-resume-not-descending`, { setup: seeded("done"), tipAncestor: "no" });
      assert.equal(stray.code, 1, stray.out);
      assert.match(stray.out, /^STOP: .* is there and its HEAD does not descend from the held head c{40}\. Nothing was changed$/m);
      assert.ok(!stray.calls.some((c) => c.id.startsWith("git#") && gitVerb(c) === "merge"), "it merged after the STOP");
      const marked = await aprimeRun(base, shell, `${shell}-resume-markers`, { setup: seeded("done"), diff: "markers" });
      assert.equal(marked.code, 1, marked.out);
      assert.match(marked.out, /^STOP: the merge at HEAD added conflict marker lines against both of its parents, so a conflict was committed unresolved\. Nothing was promoted$/m);
    }
  });
});

function cpRecursive(from, to) {
  const r = spawnSync(realPath("cp"), ["-R", `${from}/.`, `${to}/`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

test("THE CHAIN GATE (strategy's C1 and C2): BEFORE YOU START, whole, refuses to start unless production's journal reads 108, so this sitting cannot start after the previous one halted before its COMMIT, nor run twice", async () => {
  const b = blockWith(gdoc, BYS);
  const gate = b.split("\n").find((l) => l.startsWith("grep -qx 'journal rows on production: 108' /tmp/0111-journal-before.out || "));
  assert.ok(gate && EXPLICIT_HALT.test(gate), "BEFORE YOU START does not hold the journal count");
  assert.ok(b.indexOf(gate) < b.indexOf('echo "${TIP}" > /tmp/0111-start-head.sha'), "the head is recorded before the journal count is checked");
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const [rows, why] of [[108 - 1, "the previous migration is not applied"], [108 + 1, "this migration is applied already"]]) {
        const r = await runOnce({ ...harnessConfig(gdoc, "bys", CLOSED, shell, base), rows }, `${shell}-chain-${rows}`, null);
        assertStops(r, "bys", /^STOP: the journal read does not say 108\. Nothing was applied$/, `${shell}: ${why}`);
        assert.ok(!r.markersAtEnd.includes("0111-start-head.sha"), `${shell}: ${why}: the head was recorded`);
      }
      const ok = await runOnce({ ...harnessConfig(gdoc, "bys", CLOSED, shell, base), rows: 108 }, `${shell}-chain-ok`, null);
      assert.equal(ok.code, 0, ok.out.slice(-600));
    }
  });
});

test("THE CARRIES ARE REQUIRED: the post-check refuses to guess a missing -v, before any verdict prints, for each carry stage 2 passes", () => {
  for (const [, , name] of CARRY_MAP) {
    assert.ok(post.includes(`\\if :{?${name}}\n\\else\n  DO $missing$ BEGIN RAISE EXCEPTION 'STOP: -v ${name} is missing`), `${name}: no missing-variable guard`);
  }
  const required = [...post.matchAll(/^\\if :\{\?(\w+)\}$/gm)].map((m) => m[1]).sort();
  const passed = [...blockWith(gdoc, STAGE2).matchAll(/-v (\w+)="\$\{[A-Z]+\}"/g)].map((m) => m[1]).sort();
  assert.deepEqual(passed, required);
  assert.ok(post.indexOf("\\endif") < post.indexOf("SET LOCAL row_security = off;"), "a guard comes after the first statement");
});

test("THE CHAIN NIGHT'S WINDOW, both dispatch blocks whole, on the real calendar: 202611080000 / 202611090629 / 202611090800 passes Sunday 14:00, 22:00 and 23:59 and Monday 00:00, 02:00 and 06:29, and STOPs Saturday 21:00 and Monday 06:30; Monday's fallback passes Monday 21:00 and Tuesday 06:29", async () => {
  const CHAIN = { WOPEN: "202611080000", WSTART: "202611090629", WEND: "202611090800" };
  const MONDAY = { WOPEN: "202611092100", WSTART: "202611100629", WEND: "202611100800" };
  const at = (d, ymd, hhmm) => ({ dhhmm: `${d}${hhmm}`, dow: String(d), stamp: `${ymd}${hhmm}`, next: ymdShift(ymd, 1), prev: ymdShift(ymd, -1), window: "", clinics: "0 of 2", zone: "WET", fill: {} });
  const points = [
    ["Sunday 14:00", at(7, "20261108", "1400"), CHAIN, "pass"], ["Sunday 22:00", at(7, "20261108", "2200"), CHAIN, "pass"], ["Sunday 23:59", at(7, "20261108", "2359"), CHAIN, "pass"],
    ["Monday 00:00", at(1, "20261109", "0000"), CHAIN, "pass"], ["Monday 02:00", at(1, "20261109", "0200"), CHAIN, "pass"], ["Monday 06:29", at(1, "20261109", "0629"), CHAIN, "pass"],
    ["Saturday 21:00", at(6, "20261107", "2100"), CHAIN, /so this is not the night the dispatch names/],
    ["Monday 06:30", at(1, "20261109", "0630"), CHAIN, /is closed by the weekday table but outside strategy's start windows/],
    ["Monday 21:00, the fallback", at(1, "20261109", "2100"), MONDAY, "pass"], ["Tuesday 06:29, the fallback", at(2, "20261110", "0629"), MONDAY, "pass"],
    ["Sunday 22:00 under the fallback", at(7, "20261108", "2200"), MONDAY, /so this is not the night the dispatch names/],
  ];
  await withHarness(async (base) => {
    for (const shell of shellsHere()) {
      for (const name of ["bys", "clock"]) {
        for (const [label, clock, fill, want] of points) {
          const r = await runOnce(harnessConfig(gdoc, name, clock, shell, base, { fill }), `${shell}-chain-window-${name}-${clock.stamp}-${fill.WOPEN}`, null);
          const tag = `${shell} ${name} at ${label}`;
          if (want === "pass") assert.equal(r.code, 0, `${tag}: ${r.out.slice(-700)}`);
          else {
            assertStops(r, name, want, tag);
            assert.deepEqual(credentialCalls(r), [], tag);
          }
        }
      }
    }
  });
});

// Q6 (strategy, 2026-11-04): the existing appointment types take 0% VAT and the exemption code M07.
// The document, its sidecar, its four SQL files and its four blocks agree with each other, the SQL
// has the shape the document claims, and every halt in every block is explicit, proven by fault
// injection.
//
// WHAT THIS PROVES, with no database (DATABASE_URL is never read):
//   * the sidecar pins the document; the first line reads NOT READY; the document carries its
//     Rehearsal and NOT REHEARSED sections (the blocks whole stay NOT REHEARSED until READY); no em dash in
//     any file of the op;
//   * the document pins the real four SQL files, the target guard and its module, in its table and
//     in every block that runs them;
//   * THE SQL: the write and the rollback open with BEGIN and the two SET LOCAL timeouts; each holds
//     exactly one UPDATE of public.services; the write's predicate is the tenant plus both VAT
//     fields NULL and its values are 0 and M07; every expected-count check sits before the COMMIT,
//     and so does the record of the ids; the rollback is keyed on the recorded ids; the two reads
//     write nothing and print only their own Q6 lines; no file names a uuid or a person's column.
//     Each shape rule is shown to catch its own seeded fault. Every refusal (IF ... THEN RAISE) of each
//     file is listed with its condition and message, and every WHERE and ON clause is listed, so a guard
//     turned off or a predicate widened fails the test;
//   * the blocks resolve the held head from refs/pull/1724/head, fetched explicitly, never from the
//     branch, which is deleted when the pull request merges;
//   * THE BLOCKS: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation, one psql
//     call each, its output to a file and never through tee, every halt one STOP and exit 1;
//   * EVERY HALT IS EXPLICIT: each block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`) under bash and zsh, every external command a stub,
//     and each call is made to fail in turn: each run ends non-zero with exactly one STOP line, no
//     pass line, and the tool chain stopped. In THE WRITE and THE ROLLBACK a fault before the psql
//     call says "Nothing was ..." and one after it never does;
//   * each refusal the document names (the clock, the night, the held head, the pins, a record
//     missing or stale, a written marker, each psql answer that is not the clean one) is a STOP.
//
// WHAT IT DOES NOT PROVE: that the SQL runs against a database. That is the rehearsal the document
// records under Rehearsal.
//
// Run: DATABASE_URL= node --test scripts/q6-service-types-vat-m07.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC = "docs/data-op-q6-service-types-vat-m07.md";
const SIDECAR = "docs/data-op-q6-service-types-vat-m07.sha256";
const PRE = "scripts/data/q6-vat-m07-1-precheck.sql";
const WRITE = "scripts/data/q6-vat-m07-2-write.sql";
const POST = "scripts/data/q6-vat-m07-3-postcheck.sql";
const UNDO = "scripts/data/q6-vat-m07-4-rollback.sql";
const GUARD = "scripts/assert-production-target.mjs";
const PTM = "scripts/production-target.mjs";
const SELF = "scripts/q6-service-types-vat-m07.test.mjs";
const PRREF = "refs/pull/1724/head";

const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const REC_DIR = "/Users/ivan/.osteojp-q6-vat-m07";

const doc = read(DOC);
const sql = { pre: read(PRE), write: read(WRITE), post: read(POST), undo: read(UNDO) };

/** The first fenced block under the `### <heading>` line. */
function blockUnder(md, heading) {
  const at = md.indexOf(`\n### ${heading}`);
  assert.ok(at >= 0, `the document has no section ### ${heading}`);
  const m = md.slice(at).match(/```\n([\s\S]*?)\n```/);
  assert.ok(m, `the section ${heading} has no fenced block`);
  return m[1];
}
const BLOCKS = {
  pre: blockUnder(doc, "THE PRE-CHECK:"),
  write: blockUnder(doc, "THE WRITE:"),
  post: blockUnder(doc, "THE POST-CHECK:"),
  undo: blockUnder(doc, "THE ROLLBACK:"),
};
const PINS = {
  pre: [["SHAPRE", PRE], ["SHAWRITE", WRITE], ["SHAPOST", POST], ["SHAUNDO", UNDO], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  write: [["SHAWRITE", WRITE], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  post: [["SHAPOST", POST], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  undo: [["SHAUNDO", UNDO], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
};
const SUCCESS = {
  pre: /^PRE-CHECK PASSED: 3 services of the tenant osteojp /m,
  write: /^THE WRITE: COMMITTED\. 3 services of the tenant osteojp read 0% and M07, with 3 audit rows\./m,
  post: /^POST-CHECK PASSED: the 3 recorded services /m,
  undo: /^THE ROLLBACK: COMMITTED\. The 3 recorded services /m,
};

/* ---- The document and its pins. ------------------------------------------------------------ */

test("the sidecar pins the document, and the document says NOT READY, records its rehearsal and what is NOT REHEARSED", () => {
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  assert.match(doc.split("\n")[0], /^NOT READY: /);
  assert.match(doc, /\n## Rehearsal\n/);
  assert.match(doc, /\n## NOT REHEARSED\n\n- \*\*The blocks whole\.\*\*/);
  assert.match(doc, /\*\*The target guard's production path\*\*/);
  for (const f of [DOC, PRE, WRITE, POST, UNDO, SELF]) {
    assert.ok(!read(f).includes(String.fromCharCode(0x2014)), `${f} carries an em dash`);
  }
});

test("the document pins the real SQL files, guard and module, in its table and in every block", () => {
  const head = doc.slice(0, doc.indexOf("\n### "));
  for (const p of [PRE, WRITE, POST, UNDO, GUARD, PTM]) {
    assert.ok(head.includes(`\`${p}\``) && head.includes(`sha256 \`${sha256(read(p))}\``), `the facts table does not pin ${p}`);
  }
  for (const [name, pins] of Object.entries(PINS)) {
    for (const [v, p] of pins) {
      assert.ok(BLOCKS[name].includes(`\n${v}=${sha256(read(p))}\n`), `block ${name}: ${v} is not the sha256 of ${p}`);
    }
  }
});

/* ---- The SQL's shape. ---------------------------------------------------------------------- */

const stripComments = (s) => s.replace(/--[^\n]*/g, "");
const maskStrings = (s) => s.replace(/'(?:[^']|'')*'/g, "''");
/** The text from `BEGIN;` on, comments out. */
const fromBegin = (s) => {
  const c = stripComments(s);
  const i = c.indexOf("\nBEGIN;\n");
  return i < 0 ? "" : c.slice(i + 1);
};

const TARGET_WHERE = "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL";

/** Every rule the write must keep; returns the breaches (empty when clean). */
function writeFindings(text) {
  const f = [];
  const body = fromBegin(text);
  if (!body.startsWith("BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n")) {
    f.push("the write does not open with BEGIN and the two SET LOCAL timeouts");
  }
  const updates = maskStrings(body).match(/\bUPDATE\b/g) || [];
  if (updates.length !== 1) f.push(`the write holds ${updates.length} UPDATE statements, not exactly one`);
  const u = /UPDATE public\.services s\n\s+SET ([^\n]*)\n\s+(WHERE [^\n]*)\n\s+RETURNING s\.id/.exec(body);
  if (!u) f.push("the UPDATE is not of public.services with a SET, a WHERE and RETURNING s.id");
  else {
    if (u[1] !== "vat_rate = c_rate, vat_exemption_code = c_code") f.push(`the UPDATE sets ${u[1]}`);
    if (u[2] !== TARGET_WHERE) f.push(`the UPDATE's predicate is ${u[2]}`);
  }
  if (!body.includes("c_rate     constant smallint := 0;")) f.push("c_rate is not the constant 0");
  if (!body.includes("c_code     constant text := 'M07';")) f.push("c_code is not the constant M07");
  const commit = body.indexOf("\nCOMMIT;\n");
  if (commit < 0) f.push("the write has no COMMIT");
  for (const check of [
    "IF v_target <> v_expect THEN",
    "IF v_md5 <> s_md5 THEN",
    "IF v_upd <> v_expect THEN",
    "IF v_aud <> v_expect THEN",
    "IF v_ok <> v_expect THEN",
    "IF v_other_a IS DISTINCT FROM v_other_b THEN",
    "IF v_rest_a IS DISTINCT FROM v_rest_b THEN",
    "\\o :idsfile\nSELECT w.id FROM q6_written w ORDER BY w.id;\n\\o\n",
  ]) {
    const at = body.indexOf(check);
    if (at < 0 || at > commit) f.push(`not before the COMMIT: ${check.split("\n")[0]}`);
  }
  if (body.indexOf("LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;") < 0) f.push("no SHARE ROW EXCLUSIVE lock on services");
  if (body.indexOf("IF v_upd <> v_expect THEN") > body.indexOf("INSERT INTO public.audit_log")) f.push("the audit rows are written before the UPDATE's count is checked");
  if (!/WHERE s\.tenant_id = v_tenant AND s\.vat_rate IS NULL AND s\.vat_exemption_code IS NULL;\n\s+IF v_target <> v_expect/.test(body)) {
    f.push("the target count does not read the same predicate as the UPDATE");
  }
  return f;
}

/** Every rule the rollback must keep. */
function undoFindings(text) {
  const f = [];
  const body = fromBegin(text);
  if (!body.startsWith("BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n")) {
    f.push("the rollback does not open with BEGIN and the two SET LOCAL timeouts");
  }
  const updates = maskStrings(body).match(/\bUPDATE\b/g) || [];
  if (updates.length !== 1) f.push(`the rollback holds ${updates.length} UPDATE statements, not exactly one`);
  const u = /UPDATE public\.services s\n\s+SET ([^\n]*)\n\s+(WHERE [^\n]*);/.exec(body);
  if (!u) f.push("the rollback's UPDATE is not of public.services");
  else {
    if (u[1] !== "vat_rate = NULL, vat_exemption_code = NULL") f.push(`the rollback sets ${u[1]}`);
    if (u[2] !== "WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'") {
      f.push(`the rollback's predicate is not keyed on the recorded ids: ${u[2]}`);
    }
  }
  const commit = body.indexOf("\nCOMMIT;\n");
  for (const check of ["IF v_upd <> v_expect THEN", "IF v_aud <> v_expect THEN", "IF v_other_a IS DISTINCT FROM v_other_b THEN", "still read 0 and M07"]) {
    const at = body.indexOf(check);
    if (at < 0 || commit < 0 || at > commit) f.push(`not before the COMMIT: ${check}`);
  }
  return f;
}

/** The two reads: no write, no transaction control, only their own lines printed. */
function readFindings(text, tag) {
  const f = [];
  const masked = maskStrings(stripComments(text));
  const w = masked.match(/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|lock|commit|rollback|savepoint|vacuum|analyze)\b/i);
  if (w) f.push(`a read carries the word ${w[0]}`);
  // BEGIN opens every DO body; outside the DO bodies it would be transaction control of the read's own.
  const outsideDo = masked.replace(/DO \$(\w*)\$[\s\S]*?\$\1\$;/g, "");
  const b = outsideDo.match(/\b(begin|start\s+transaction)\b/i);
  if (b) f.push(`a read carries the word ${b[0]} outside a DO body`);
  for (const lit of stripComments(text).match(/'Q6[A-Z]+ [^']*'/g) || []) {
    if (!lit.startsWith(`'${tag} `)) f.push(`a printed line is not a ${tag} line: ${lit}`);
  }
  // The top-level statements: DO blocks and psql meta lines out, then one statement per `;` line end.
  const topText = stripComments(text).replace(/DO \$(\w*)\$[\s\S]*?\$\1\$;/g, "").replace(/^\\[^\n]*$/gm, "");
  const tops = topText.split(/;\s*\n/).map((s) => s.trim()).filter((s) => /^(SELECT|WITH)\b/.test(s));
  if (tops.length < 3) f.push(`too few top-level selects found (${tops.length}): the reader did not parse the read`);
  for (const s of tops) {
    if (!new RegExp(`'${tag} `).test(s)) f.push(`a top-level select prints something other than a ${tag} line: ${s.slice(0, 60)}`);
  }
  return f;
}

/* ---- Every guard and every predicate, listed. A guard turned off (IF false), a condition loosened, a
   message moved to another check, or a WHERE / ON clause widened changes one of these lists. The
   lists are the review's statement of what each file refuses and which rows each query reads. ---- */

const sqlGuards = (t) => [...stripComments(t).matchAll(/\n\s*IF (.+?) THEN\n\s+RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => `IF ${m[1]} => ${m[2]}`);
const sqlPredicates = (t) => [...stripComments(t).matchAll(/\b(WHERE|ON)\b([\s\S]*?)(?=;|\bGROUP\b|\bORDER\b|\bRETURNING\b|\bUNION\b|\bJOIN\b)/g)]
  .map((m) => `${m[1]}${m[2]}`.replace(/\s+/g, " ").trim()).filter((x) => x !== "ON COMMIT DROP");

const EXPECTED_GUARDS = {
  pre: [
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_cols <> 2 => Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied",
    "IF v_cons <> 2 => Q6STOP: services carries % of the 2 CHECK constraints of 0110: 0110 is not applied as reviewed",
    "IF v_audit <> 0 => Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules",
    "IF v_target = 0 => Q6STOP: no service of the tenant has both VAT fields empty: there is nothing to write",
    "IF v_target > 60 => Q6STOP: % target rows, more than the ceiling of 60 the document names. Strategy rules",
  ],
  write: [
    "IF s_expect !~ '^[1-9][0-9]?$' => Q6STOP: -v expect must be a whole number from 1 to 60; received %",
    "IF v_expect > 60 => Q6STOP: -v expect % is above the ceiling of 60",
    "IF s_md5 !~ '^[0-9a-f]{32}$' => Q6STOP: -v target_md5 must be 32 lower-case hex characters",
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_cols <> 2 => Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied",
    "IF v_prior <> 0 => Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules",
    "IF v_target <> v_expect => Q6STOP: % target rows now, but THE PRE-CHECK counted %: the table moved. Paste THE PRE-CHECK again",
    "IF v_md5 <> s_md5 => Q6STOP: the target set is not the one THE PRE-CHECK read (same count, other rows). Paste THE PRE-CHECK again",
    "IF v_upd <> v_expect => Q6STOP: the UPDATE wrote % rows, expected exactly %",
    "IF v_aud <> v_expect => Q6STOP: wrote % audit rows, expected exactly %",
    "IF v_ok <> v_expect => Q6STOP: % written rows read 0 and M07, expected exactly %",
    "IF v_left <> 0 => Q6STOP: % rows of the tenant still have both VAT fields empty after the write",
    "IF v_other_a IS DISTINCT FROM v_other_b => Q6STOP: a services row outside the written set changed, and none may",
    "IF v_rest_a IS DISTINCT FROM v_rest_b => Q6STOP: a column other than the two VAT fields changed on a written row, and none may",
  ],
  post: [
    "IF s_expect !~ '^[1-9][0-9]?$' => Q6STOP: -v expect must be a whole number from 1 to 60; received %",
    "IF s_ids !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$' => Q6STOP: -v ids is not a comma separated list of lower-case uuids",
    "IF cardinality(v_ids) <> v_expect => Q6STOP: % ids recorded, expected %",
    "IF v_n <> v_expect => Q6STOP: the recorded ids hold a duplicate (% distinct of %)",
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services read 0 and M07 in the tenant",
    "IF v_n <> v_expect => Q6STOP: the tenant holds % audit rows of this op, expected exactly %",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services have their audit row",
    "IF v_n <> 0 => Q6STOP: % undo audit rows exist: the op was rolled back",
  ],
  undo: [
    "IF s_expect !~ '^[1-9][0-9]?$' => Q6STOP: -v expect must be a whole number from 1 to 60; received %",
    "IF s_ids !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$' => Q6STOP: -v ids is not a comma separated list of lower-case uuids",
    "IF cardinality(v_ids) <> v_expect => Q6STOP: % ids recorded, expected %",
    "IF v_n <> v_expect => Q6STOP: the recorded ids hold a duplicate (% distinct of %)",
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_n <> 0 => Q6STOP: % undo audit rows already exist: the rollback ran before",
    "IF v_n <> v_expect => Q6STOP: the tenant holds % audit rows of THE WRITE, but % ids are recorded: the file and the trail disagree. The lead rules",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded ids have an audit row of THE WRITE: the file and the trail disagree. The lead rules",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services still read 0 and M07: staff changed the others since THE WRITE. Nothing is written; the lead rules",
    "IF v_n <> 0 => Q6STOP: % service audit rows of another action sit on the recorded services from THE WRITE on: staff may have re-saved them. Nothing is written; the lead rules",
    "IF v_n <> 0 => Q6STOP: % recorded services were updated after THE WRITE: staff may have re-saved them. Nothing is written; the lead rules",
    "IF v_upd <> v_expect => Q6STOP: the UPDATE reset % rows, expected exactly %",
    "IF v_aud <> v_expect => Q6STOP: wrote % undo audit rows, expected exactly %",
    "IF v_other_a IS DISTINCT FROM v_other_b => Q6STOP: a services row outside the recorded ids changed, and none may",
  ],
};
const EXPECTED_PREDICATES = {
  pre: [
    "WHERE slug = 'osteojp'",
    "WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name = 'vat_rate'), 'absent')",
    "WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name = 'vat_exemption_code'), 'absent')",
    "WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_rate_allowed'",
    "WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_exemption_code_allowed'",
    "WHERE slug = 'osteojp'",
    "WHERE c.table_schema = 'public' AND c.table_name = 'services' AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint') OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'))",
    "WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname IN ('services_vat_rate_allowed', 'services_vat_exemption_code_allowed')",
    "WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.internal_only, sv.vat_rate, sv.vat_exemption_code FROM public.services sv",
    "ON t.id = sv.tenant_id ), a AS ( SELECT al.action FROM public.audit_log al",
    "ON t.id = al.tenant_id WHERE al.action IN ('service.vat_default_q6', 'service.vat_default_q6_undone') ) SELECT line FROM ( SELECT 1 AS k, 'Q6PRE services_total ' || count(*) AS line FROM s",
    "WHERE is_active) FROM s",
    "WHERE NOT is_active) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND is_active) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND NOT is_active) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND internal_only) FROM s",
    "WHERE (vat_rate IS NULL) <> (vat_exemption_code IS NULL)) FROM s",
    "WHERE vat_rate = 0 AND vat_exemption_code = 'M07') FROM s",
    "WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL AND NOT (vat_rate = 0 AND vat_exemption_code = 'M07')) FROM s",
    "WHERE action = 'service.vat_default_q6') FROM a",
    "WHERE action = 'service.vat_default_q6_undone') FROM a",
    "WHERE sv.tenant_id NOT IN (SELECT id FROM t) ) x",
    "WHERE slug = 'osteojp'",
    "WHERE tenant_id = v_tenant AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')",
    "WHERE tenant_id = v_tenant AND vat_rate IS NULL AND vat_exemption_code IS NULL",
    "ON t.id = s.tenant_id WHERE t.slug = 'osteojp' AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
  ],
  write: [
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE c.table_schema = 'public' AND c.table_name = 'services' AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint') OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'))",
    "WHERE tenant_id = v_tenant AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WHERE NOT (s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL)",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "ON w.id = s.id WHERE s.tenant_id = v_tenant AND s.vat_rate = c_rate AND s.vat_exemption_code = c_code",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WHERE s.id NOT IN (SELECT w.id FROM q6_written w)",
    "ON w.id = s.id",
    "ON t.id = al.tenant_id WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6'",
  ],
  post: [
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6_undone'",
    "WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.vat_rate, sv.vat_exemption_code FROM public.services sv",
    "ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6POST services_total ' || count(*) AS line FROM s",
    "WHERE vat_rate = 0 AND vat_exemption_code = 'M07') FROM s",
    "WHERE vat_rate = 0 AND vat_exemption_code = 'M07' AND is_active) FROM s",
    "WHERE vat_rate = 0 AND vat_exemption_code = 'M07' AND NOT is_active) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s",
    "WHERE (vat_rate IS NULL) <> (vat_exemption_code IS NULL)) FROM s",
    "WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL AND NOT (vat_rate = 0 AND vat_exemption_code = 'M07')) FROM s ) x",
  ],
  undo: [
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE al.tenant_id = v_tenant AND al.action = c_action",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'",
    "ON mine.tenant_id = later.tenant_id AND mine.entity_id = later.entity_id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE later.tenant_id = v_tenant AND later.entity_type = 'service' AND later.entity_id = ANY (v_ids) AND later.action LIKE 'service.%' AND later.action <> 'service.vat_default_q6' AND later.created_at > mine.created_at - interval '10 minutes'",
    "ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.updated_at > mine.created_at",
    "WHERE NOT (s.id = ANY (v_ids))",
    "WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'",
    "WHERE NOT (s.id = ANY (v_ids))",
    "ON t.id = al.tenant_id WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6_undone'",
  ],
};

/* ---- Every statement, in order (R4 round 2). The guards and predicates above name what each file
   refuses and reads; this list pins what FEEDS them: every assignment (`:=`, DECLARE initialisers
   included), every SELECT ... INTO, every GET DIAGNOSTICS, every md5 and its column list, every INSERT
   and UPDATE, and the order of every printed line against BEGIN and COMMIT. Comments and whitespace do
   not count; anything else that moves, is deleted or is added fails it. A statement ends at a `;` that
   ends a line, and each psql meta line (\if, \o, ...) is a statement of its own. ---- */

const sqlStatements = (t) => {
  const out = [];
  let buf = "";
  const flush = () => {
    for (const piece of buf.split(/;[ \t]*\n/)) {
      const n = piece.replace(/\s+/g, " ").trim();
      if (n) out.push(n);
    }
    buf = "";
  };
  for (const line of stripComments(t).split("\n")) {
    if (line.trim().startsWith("\\")) { flush(); out.push(line.trim()); } else buf += `${line}\n`;
  }
  flush();
  return out;
};

const EXPECTED_STATEMENTS = {
  pre: [
    "SELECT 'Q6PRE read_only ' || current_setting('transaction_read_only')",
    "SELECT 'Q6PRE tenant_slug_osteojp ' || count(*) FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT 'Q6PRE column_vat_rate ' || coalesce( (SELECT c.data_type FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name = 'vat_rate'), 'absent')",
    "SELECT 'Q6PRE column_vat_exemption_code ' || coalesce( (SELECT c.data_type FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name = 'vat_exemption_code'), 'absent')",
    "SELECT 'Q6PRE constraint_vat_rate ' || count(*) FROM pg_catalog.pg_constraint k WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_rate_allowed'",
    "SELECT 'Q6PRE constraint_vat_exemption_code ' || count(*) FROM pg_catalog.pg_constraint k WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_exemption_code_allowed'",
    "DO $q6pre1$ DECLARE v_tenants int",
    "v_cols int",
    "v_cons int",
    "BEGIN SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT count(*) INTO v_cols FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'services' AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint') OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'))",
    "IF v_cols <> 2 THEN RAISE EXCEPTION 'Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied', v_cols",
    "END IF",
    "SELECT count(*) INTO v_cons FROM pg_catalog.pg_constraint k WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname IN ('services_vat_rate_allowed', 'services_vat_exemption_code_allowed')",
    "IF v_cons <> 2 THEN RAISE EXCEPTION 'Q6STOP: services carries % of the 2 CHECK constraints of 0110: 0110 is not applied as reviewed', v_cons",
    "END IF",
    "END $q6pre1$",
    "WITH t AS ( SELECT id FROM public.tenants WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.internal_only, sv.vat_rate, sv.vat_exemption_code FROM public.services sv JOIN t ON t.id = sv.tenant_id ), a AS ( SELECT al.action FROM public.audit_log al JOIN t ON t.id = al.tenant_id WHERE al.action IN ('service.vat_default_q6', 'service.vat_default_q6_undone') ) SELECT line FROM ( SELECT 1 AS k, 'Q6PRE services_total ' || count(*) AS line FROM s UNION ALL SELECT 2, 'Q6PRE services_active ' || count(*) FILTER (WHERE is_active) FROM s UNION ALL SELECT 3, 'Q6PRE services_archived ' || count(*) FILTER (WHERE NOT is_active) FROM s UNION ALL SELECT 4, 'Q6PRE target_total ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 5, 'Q6PRE target_active ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND is_active) FROM s UNION ALL SELECT 6, 'Q6PRE target_archived ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND NOT is_active) FROM s UNION ALL SELECT 7, 'Q6PRE target_internal_only ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND internal_only) FROM s UNION ALL SELECT 8, 'Q6PRE partial_left_alone ' || count(*) FILTER (WHERE (vat_rate IS NULL) <> (vat_exemption_code IS NULL)) FROM s UNION ALL SELECT 9, 'Q6PRE already_0_m07 ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07') FROM s UNION ALL SELECT 10, 'Q6PRE other_values_left_alone ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL AND NOT (vat_rate = 0 AND vat_exemption_code = 'M07')) FROM s UNION ALL SELECT 11, 'Q6PRE audit_rows_q6 ' || count(*) FILTER (WHERE action = 'service.vat_default_q6') FROM a UNION ALL SELECT 12, 'Q6PRE audit_rows_q6_undone ' || count(*) FILTER (WHERE action = 'service.vat_default_q6_undone') FROM a UNION ALL SELECT 13, 'Q6PRE other_tenants_services_untouched ' || count(*) FROM public.services sv WHERE sv.tenant_id NOT IN (SELECT id FROM t) ) x ORDER BY k",
    "DO $q6pre2$ DECLARE v_tenant uuid",
    "v_audit int",
    "v_target int",
    "BEGIN SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT count(*) INTO v_audit FROM public.audit_log WHERE tenant_id = v_tenant AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')",
    "IF v_audit <> 0 THEN RAISE EXCEPTION 'Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules', v_audit",
    "END IF",
    "SELECT count(*) INTO v_target FROM public.services WHERE tenant_id = v_tenant AND vat_rate IS NULL AND vat_exemption_code IS NULL",
    "IF v_target = 0 THEN RAISE EXCEPTION 'Q6STOP: no service of the tenant has both VAT fields empty: there is nothing to write'",
    "END IF",
    "IF v_target > 60 THEN RAISE EXCEPTION 'Q6STOP: % target rows, more than the ceiling of 60 the document names. Strategy rules', v_target",
    "END IF",
    "END $q6pre2$",
    "SELECT 'Q6PRE PASS target ' || count(*) || ' ids_md5 ' || md5(coalesce(string_agg(s.id::text, ',' ORDER BY s.id), '')) FROM public.services s JOIN public.tenants t ON t.id = s.tenant_id WHERE t.slug = 'osteojp' AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
  ],
  write: [
    "\\if :{?expect}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v expect is missing. THE PRE-CHECK prints it; this file refuses to guess.'",
    "END $missing$",
    "\\endif",
    "\\if :{?target_md5}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v target_md5 is missing. THE PRE-CHECK prints it; this file refuses to guess.'",
    "END $missing$",
    "\\endif",
    "\\if :{?idsfile}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v idsfile is missing. The rollback keys on that file; this file refuses to write without it.'",
    "END $missing$",
    "\\endif",
    "BEGIN",
    "SET LOCAL lock_timeout = '5s'",
    "SET LOCAL statement_timeout = '60s'",
    "SELECT 'Q6WRITE carries ' || length(set_config('q6.expect', :'expect', true)) || ' ' || length(set_config('q6.target_md5', :'target_md5', true))",
    "LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE",
    "CREATE TEMP TABLE q6_written (id uuid PRIMARY KEY) ON COMMIT DROP",
    "DO $q6write$ DECLARE c_rate constant smallint := 0",
    "c_code constant text := 'M07'",
    "c_action constant text := 'service.vat_default_q6'",
    "s_expect text := current_setting('q6.expect')",
    "s_md5 text := current_setting('q6.target_md5')",
    "v_expect int",
    "v_tenants int",
    "v_tenant uuid",
    "v_cols int",
    "v_prior int",
    "v_target int",
    "v_md5 text",
    "v_other_b text",
    "v_other_a text",
    "v_rest_b text",
    "v_rest_a text",
    "v_upd int",
    "v_aud int",
    "v_ok int",
    "v_left int",
    "BEGIN IF s_expect !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Q6STOP: -v expect must be a whole number from 1 to 60; received %', s_expect",
    "END IF",
    "v_expect := s_expect::int",
    "IF v_expect > 60 THEN RAISE EXCEPTION 'Q6STOP: -v expect % is above the ceiling of 60', v_expect",
    "END IF",
    "IF s_md5 !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'Q6STOP: -v target_md5 must be 32 lower-case hex characters'",
    "END IF",
    "SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT count(*) INTO v_cols FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'services' AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint') OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'))",
    "IF v_cols <> 2 THEN RAISE EXCEPTION 'Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied', v_cols",
    "END IF",
    "SELECT count(*) INTO v_prior FROM public.audit_log WHERE tenant_id = v_tenant AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')",
    "IF v_prior <> 0 THEN RAISE EXCEPTION 'Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules', v_prior",
    "END IF",
    "SELECT count(*), md5(coalesce(string_agg(s.id::text, ',' ORDER BY s.id), '')) INTO v_target, v_md5 FROM public.services s WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "IF v_target <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % target rows now, but THE PRE-CHECK counted %: the table moved. Paste THE PRE-CHECK again', v_target, v_expect",
    "END IF",
    "IF v_md5 <> s_md5 THEN RAISE EXCEPTION 'Q6STOP: the target set is not the one THE PRE-CHECK read (same count, other rows). Paste THE PRE-CHECK again'",
    "END IF",
    "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), '')) INTO v_other_b FROM public.services s WHERE NOT (s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL)",
    "SELECT md5(coalesce(string_agg((to_jsonb(s) - 'vat_rate' - 'vat_exemption_code')::text, '|' ORDER BY s.id), '')) INTO v_rest_b FROM public.services s WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WITH u AS ( UPDATE public.services s SET vat_rate = c_rate, vat_exemption_code = c_code WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL RETURNING s.id ) INSERT INTO q6_written (id) SELECT u.id FROM u",
    "GET DIAGNOSTICS v_upd = ROW_COUNT",
    "IF v_upd <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the UPDATE wrote % rows, expected exactly %', v_upd, v_expect",
    "END IF",
    "INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) SELECT v_tenant, NULL, c_action, 'service', w.id, jsonb_build_object( 'card', 'Q6', 'source', 'psql_data_op', 'ruling', 'strategy-q6-2026-11-04', 'vat_rate_before', NULL, 'vat_exemption_code_before', NULL, 'vat_rate_after', c_rate, 'vat_exemption_code_after', c_code) FROM q6_written w",
    "GET DIAGNOSTICS v_aud = ROW_COUNT",
    "IF v_aud <> v_expect THEN RAISE EXCEPTION 'Q6STOP: wrote % audit rows, expected exactly %', v_aud, v_expect",
    "END IF",
    "SELECT count(*) INTO v_ok FROM public.services s JOIN q6_written w ON w.id = s.id WHERE s.tenant_id = v_tenant AND s.vat_rate = c_rate AND s.vat_exemption_code = c_code",
    "IF v_ok <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % written rows read 0 and M07, expected exactly %', v_ok, v_expect",
    "END IF",
    "SELECT count(*) INTO v_left FROM public.services s WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "IF v_left <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the tenant still have both VAT fields empty after the write', v_left",
    "END IF",
    "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), '')) INTO v_other_a FROM public.services s WHERE s.id NOT IN (SELECT w.id FROM q6_written w)",
    "IF v_other_a IS DISTINCT FROM v_other_b THEN RAISE EXCEPTION 'Q6STOP: a services row outside the written set changed, and none may'",
    "END IF",
    "SELECT md5(coalesce(string_agg((to_jsonb(s) - 'vat_rate' - 'vat_exemption_code')::text, '|' ORDER BY s.id), '')) INTO v_rest_a FROM public.services s JOIN q6_written w ON w.id = s.id",
    "IF v_rest_a IS DISTINCT FROM v_rest_b THEN RAISE EXCEPTION 'Q6STOP: a column other than the two VAT fields changed on a written row, and none may'",
    "END IF",
    "END $q6write$",
    "\\o :idsfile",
    "SELECT w.id FROM q6_written w ORDER BY w.id",
    "\\o",
    "SELECT 'Q6WRITE ready_to_commit ' || count(*) FROM q6_written",
    "COMMIT",
    "SELECT 'Q6WRITE COMMITTED ' || count(*) FROM public.audit_log al JOIN public.tenants t ON t.id = al.tenant_id WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6'",
  ],
  post: [
    "\\if :{?ids}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v ids is missing. THE WRITE recorded them in its file; this file refuses to guess.'",
    "END $missing$",
    "\\endif",
    "\\if :{?expect}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v expect is missing.'",
    "END $missing$",
    "\\endif",
    "SELECT 'Q6POST read_only ' || current_setting('transaction_read_only')",
    "SELECT 'Q6POST carries ' || length(set_config('q6.ids', :'ids', true)) || ' ' || length(set_config('q6.expect', :'expect', true))",
    "DO $q6post$ DECLARE s_ids text := current_setting('q6.ids')",
    "s_expect text := current_setting('q6.expect')",
    "v_ids uuid[]",
    "v_expect int",
    "v_tenants int",
    "v_tenant uuid",
    "v_n int",
    "BEGIN IF s_expect !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Q6STOP: -v expect must be a whole number from 1 to 60; received %', s_expect",
    "END IF",
    "v_expect := s_expect::int",
    "IF s_ids !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$' THEN RAISE EXCEPTION 'Q6STOP: -v ids is not a comma separated list of lower-case uuids'",
    "END IF",
    "v_ids := string_to_array(s_ids, ',')::uuid[]",
    "IF cardinality(v_ids) <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % ids recorded, expected %', cardinality(v_ids), v_expect",
    "END IF",
    "SELECT count(DISTINCT x) INTO v_n FROM unnest(v_ids) x",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the recorded ids hold a duplicate (% distinct of %)', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT count(*) INTO v_n FROM public.services s WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services read 0 and M07 in the tenant', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the tenant holds % audit rows of this op, expected exactly %', v_n, v_expect",
    "END IF",
    "SELECT count(DISTINCT al.entity_id) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services have their audit row', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6_undone'",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % undo audit rows exist: the op was rolled back', v_n",
    "END IF",
    "END $q6post$",
    "WITH t AS ( SELECT id FROM public.tenants WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.vat_rate, sv.vat_exemption_code FROM public.services sv JOIN t ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6POST services_total ' || count(*) AS line FROM s UNION ALL SELECT 2, 'Q6POST at_0_m07_total ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07') FROM s UNION ALL SELECT 3, 'Q6POST at_0_m07_active ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07' AND is_active) FROM s UNION ALL SELECT 4, 'Q6POST at_0_m07_archived ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code = 'M07' AND NOT is_active) FROM s UNION ALL SELECT 5, 'Q6POST target_left_now ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 6, 'Q6POST partial_left_alone ' || count(*) FILTER (WHERE (vat_rate IS NULL) <> (vat_exemption_code IS NULL)) FROM s UNION ALL SELECT 7, 'Q6POST other_values_left_alone ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL AND NOT (vat_rate = 0 AND vat_exemption_code = 'M07')) FROM s ) x ORDER BY k",
    "SELECT 'Q6POST PASS written ' || cardinality(string_to_array(current_setting('q6.ids'), ','))",
  ],
  undo: [
    "\\if :{?ids}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v ids is missing. THE WRITE recorded them in its file; this file refuses to guess.'",
    "END $missing$",
    "\\endif",
    "\\if :{?expect}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v expect is missing.'",
    "END $missing$",
    "\\endif",
    "BEGIN",
    "SET LOCAL lock_timeout = '5s'",
    "SET LOCAL statement_timeout = '60s'",
    "SELECT 'Q6UNDO carries ' || length(set_config('q6.ids', :'ids', true)) || ' ' || length(set_config('q6.expect', :'expect', true))",
    "LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE",
    "DO $q6undo$ DECLARE c_action constant text := 'service.vat_default_q6_undone'",
    "s_ids text := current_setting('q6.ids')",
    "s_expect text := current_setting('q6.expect')",
    "v_ids uuid[]",
    "v_expect int",
    "v_tenants int",
    "v_tenant uuid",
    "v_n int",
    "v_other_b text",
    "v_other_a text",
    "v_upd int",
    "v_aud int",
    "BEGIN IF s_expect !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Q6STOP: -v expect must be a whole number from 1 to 60; received %', s_expect",
    "END IF",
    "v_expect := s_expect::int",
    "IF s_ids !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$' THEN RAISE EXCEPTION 'Q6STOP: -v ids is not a comma separated list of lower-case uuids'",
    "END IF",
    "v_ids := string_to_array(s_ids, ',')::uuid[]",
    "IF cardinality(v_ids) <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % ids recorded, expected %', cardinality(v_ids), v_expect",
    "END IF",
    "SELECT count(DISTINCT x) INTO v_n FROM unnest(v_ids) x",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the recorded ids hold a duplicate (% distinct of %)', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT count(*) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = c_action",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % undo audit rows already exist: the rollback ran before', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the tenant holds % audit rows of THE WRITE, but % ids are recorded: the file and the trail disagree. The lead rules', v_n, v_expect",
    "END IF",
    "SELECT count(DISTINCT al.entity_id) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded ids have an audit row of THE WRITE: the file and the trail disagree. The lead rules', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services still read 0 and M07: staff changed the others since THE WRITE. Nothing is written; the lead rules', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log later JOIN public.audit_log mine ON mine.tenant_id = later.tenant_id AND mine.entity_id = later.entity_id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE later.tenant_id = v_tenant AND later.entity_type = 'service' AND later.entity_id = ANY (v_ids) AND later.action LIKE 'service.%' AND later.action <> 'service.vat_default_q6' AND later.created_at > mine.created_at - interval '10 minutes'",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % service audit rows of another action sit on the recorded services from THE WRITE on: staff may have re-saved them. Nothing is written; the lead rules', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s JOIN public.audit_log mine ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.updated_at > mine.created_at",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % recorded services were updated after THE WRITE: staff may have re-saved them. Nothing is written; the lead rules', v_n",
    "END IF",
    "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), '')) INTO v_other_b FROM public.services s WHERE NOT (s.id = ANY (v_ids))",
    "UPDATE public.services s SET vat_rate = NULL, vat_exemption_code = NULL WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = 0 AND s.vat_exemption_code = 'M07'",
    "GET DIAGNOSTICS v_upd = ROW_COUNT",
    "IF v_upd <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the UPDATE reset % rows, expected exactly %', v_upd, v_expect",
    "END IF",
    "INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) SELECT v_tenant, NULL, c_action, 'service', x.id, jsonb_build_object( 'card', 'Q6', 'source', 'psql_data_op', 'ruling', 'lead-word-rollback', 'vat_rate_before', 0, 'vat_exemption_code_before', 'M07', 'vat_rate_after', NULL, 'vat_exemption_code_after', NULL) FROM unnest(v_ids) AS x(id)",
    "GET DIAGNOSTICS v_aud = ROW_COUNT",
    "IF v_aud <> v_expect THEN RAISE EXCEPTION 'Q6STOP: wrote % undo audit rows, expected exactly %', v_aud, v_expect",
    "END IF",
    "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), '')) INTO v_other_a FROM public.services s WHERE NOT (s.id = ANY (v_ids))",
    "IF v_other_a IS DISTINCT FROM v_other_b THEN RAISE EXCEPTION 'Q6STOP: a services row outside the recorded ids changed, and none may'",
    "END IF",
    "END $q6undo$",
    "COMMIT",
    "SELECT 'Q6UNDO COMMITTED ' || count(*) FROM public.audit_log al JOIN public.tenants t ON t.id = al.tenant_id WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6_undone'",
  ],
};

test("every statement of the SQL, in order, is the reviewed one: the shape the document claims", () => {
  for (const [k, t] of Object.entries(sql)) {
    const got = sqlStatements(t);
    const want = EXPECTED_STATEMENTS[k];
    const at = got.findIndex((x, i) => x !== want[i]);
    assert.ok(at < 0 && got.length === want.length, `${k}: statement ${at < 0 ? want.length : at + 1} differs from the reviewed list\n  got:  ${got[at] ?? "(none)"}\n  want: ${want[at] ?? "(none)"}`);
  }
  for (const k of ["write", "undo"]) {
    const st = EXPECTED_STATEMENTS[k];
    const commit = st.indexOf("COMMIT");
    assert.ok(commit > 0 && st.indexOf("BEGIN") >= 0 && st.indexOf("BEGIN") < commit, `${k}: no BEGIN before its COMMIT`);
    for (const [i, x] of st.entries()) {
      if (/^SELECT 'Q6[A-Z]+ COMMITTED /.test(x)) assert.ok(i > commit, `${k}: the COMMITTED line is read before the COMMIT`);
      else if (/^SELECT 'Q6[A-Z]+ /.test(x)) assert.ok(i < commit, `${k}: a printed line other than COMMITTED sits after the COMMIT: ${x.slice(0, 50)}`);
    }
  }
  assert.ok(EXPECTED_STATEMENTS.post.at(-1).startsWith("SELECT 'Q6POST PASS written ' || cardinality(string_to_array(current_setting('q6.ids')"), "the post-check's PASS count is not taken from the ids");
});

test("every guard of the SQL is present with its condition and message: the shape the document claims", () => {
  for (const [k, t] of Object.entries(sql)) {
    assert.deepEqual(sqlGuards(t), EXPECTED_GUARDS[k], `${k}: the guards are not the reviewed list`);
    const raises = (stripComments(t).match(/RAISE EXCEPTION/g) || []).length;
    const missing = (t.match(/DO \$missing\$ BEGIN/g) || []).length;
    assert.equal(raises, EXPECTED_GUARDS[k].length + missing, `${k}: a RAISE that is not one of the listed guards`);
  }
});

test("every WHERE and ON clause of the SQL is the reviewed one: the shape the document claims", () => {
  for (const [k, t] of Object.entries(sql)) {
    assert.deepEqual(sqlPredicates(t), EXPECTED_PREDICATES[k], `${k}: the predicates are not the reviewed list`);
  }
});

test("the write has the shape the document claims", () => {
  assert.deepEqual(writeFindings(sql.write), []);
});

test("the rollback has the shape the document claims", () => {
  assert.deepEqual(undoFindings(sql.undo), []);
});

test("the two reads write nothing and print only their own lines", () => {
  assert.deepEqual(readFindings(sql.pre, "Q6PRE"), []);
  assert.deepEqual(readFindings(sql.post, "Q6POST"), []);
  assert.match(sql.pre, /current_setting\('transaction_read_only'\)/);
  assert.match(sql.post, /current_setting\('transaction_read_only'\)/);
});

test("no SQL file names a uuid, a person's column, a name or a price, and the tenant is found by slug", () => {
  for (const [k, s] of Object.entries(sql)) {
    const c = stripComments(s);
    assert.doesNotMatch(c, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, `${k} names a uuid`);
    assert.doesNotMatch(c, /\b(full_name|email|phone|nif|date_of_birth|price_cents|description)\b|\b[a-z]+\.name\b/i, `${k} names a column it must not read`);
    assert.match(c, /slug = 'osteojp'/, `${k} does not find the tenant by slug`);
  }
});

test("each shape rule catches its own seeded fault", () => {
  const w = sql.write;
  const u = sql.undo;
  const mutants = [
    ["write", "a wider predicate", w.replace("     WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL\n    RETURNING", "     WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL\n    RETURNING"), /the UPDATE's predicate/],
    ["write", "another tenant's rows", w.replace("     WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL\n    RETURNING", "     WHERE s.vat_rate IS NULL AND s.vat_exemption_code IS NULL\n    RETURNING"), /the UPDATE's predicate/],
    ["write", "another code", w.replace("c_code     constant text := 'M07';", "c_code     constant text := 'M09';"), /c_code is not the constant M07/],
    ["write", "another rate", w.replace("c_rate     constant smallint := 0;", "c_rate     constant smallint := 23;"), /c_rate is not the constant 0/],
    ["write", "the count check dropped", w.replace("IF v_upd <> v_expect THEN", "IF false THEN"), /not before the COMMIT: IF v_upd/],
    ["write", "the ids recorded after the COMMIT", w.replace("\\o :idsfile\nSELECT w.id FROM q6_written w ORDER BY w.id;\n\\o\n", "").replace("COMMIT;\n", "COMMIT;\n\\o :idsfile\nSELECT w.id FROM q6_written w ORDER BY w.id;\n\\o\n"), /not before the COMMIT: \\o :idsfile/],
    ["write", "no statement timeout", w.replace("SET LOCAL statement_timeout = '60s';\n", ""), /does not open with BEGIN/],
    ["write", "a second UPDATE", w.replace("COMMIT;\n", "UPDATE public.services SET color = NULL;\nCOMMIT;\n"), /2 UPDATE statements/],
    ["write", "no lock", w.replace("LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;", ""), /no SHARE ROW EXCLUSIVE lock/],
    ["undo", "a broad rollback", u.replace("SET vat_rate = NULL, vat_exemption_code = NULL\n   WHERE s.id = ANY (v_ids) AND ", "SET vat_rate = NULL, vat_exemption_code = NULL\n   WHERE "), /not keyed on the recorded ids/],
    ["undo", "the count check dropped", u.replace("IF v_upd <> v_expect THEN", "IF false THEN"), /not before the COMMIT: IF v_upd/],
  ];
  for (const [which, label, mutant, re] of mutants) {
    assert.notEqual(mutant, which === "write" ? w : u, `${label}: the mutation did not apply`);
    const f = which === "write" ? writeFindings(mutant) : undoFindings(mutant);
    assert.ok(f.some((x) => re.test(x)), `${label}: not caught; findings ${JSON.stringify(f)}`);
  }
  const pm = sql.pre.replace("SELECT 'Q6PRE read_only '", "UPDATE public.services SET color = NULL;\nSELECT 'Q6PRE read_only '");
  assert.ok(readFindings(pm, "Q6PRE").some((x) => /carries the word UPDATE/i.test(x)), "a write in the pre-check is not caught");
  const pn = sql.pre.replace("SELECT 'Q6PRE tenant_slug_osteojp ' || count(*) FROM public.tenants WHERE slug = 'osteojp';", "SELECT count(*) FROM public.tenants WHERE slug = 'osteojp';");
  assert.ok(readFindings(pn, "Q6PRE").some((x) => /top-level select prints something other/.test(x)), "an unlabelled select in the pre-check is not caught");
});

/* ---- The blocks' shape. -------------------------------------------------------------------- */

test("every block: pipefail on line 2, no set -e, no # line, no continuation, one psql to a file, explicit halts", () => {
  for (const [name, b] of Object.entries(BLOCKS)) {
    const lines = b.split("\n");
    assert.equal(lines[0], "(", name);
    assert.equal(lines[1], "set -o pipefail", name);
    assert.equal(lines.at(-1), ")", name);
    assert.doesNotMatch(b, /set -e|errexit/, name);
    assert.ok(!lines.some((l) => l.trimStart().startsWith("#")), `${name}: a # line`);
    assert.ok(!lines.some((l) => l.endsWith("\\")), `${name}: a backslash continuation`);
    const psql = lines.filter((l) => /\bpsql\b/.test(l) && !l.startsWith("echo "));
    assert.equal(psql.length, 1, `${name}: not exactly one psql line`);
    assert.match(psql[0], /^psql "\$\{DATABASE_URL_DIRECT\}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off /, name);
    assert.match(psql[0], / > \S+ 2>&1 \|\| \{ echo "STOP: /, `${name}: psql's output does not go to a file only`);
    assert.doesNotMatch(psql[0], /\btee\b/, name);
    if (name === "pre" || name === "post") {
      assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '60s'" -f \$\{(PRE|POST)\} -c "rollback"/, name);
    } else {
      assert.doesNotMatch(psql[0], /begin read only/, name);
    }
    for (const l of lines) {
      if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `${name}: a halt that is not one STOP and exit 1: ${l}`);
      assert.doesNotMatch(l, /^(echo|printf)\b.*\$\{?DATABASE_URL/, `${name}: a line prints the connection string`);
    }
    assert.doesNotMatch(b, /\b(cat|head|tail|less|more)\b[^\n]*(write|undo)\.out/, `${name}: a line prints a write transcript`);
    assert.doesNotMatch(b, /origin\/data\/|--prune/, `${name}: a block names the branch, which is deleted when the pull request merges`);
    if (name === "pre" || name === "undo") {
      assert.ok(lines.includes(`PRREF=${PRREF}`), `${name}: the head is not resolved from ${PRREF}`);
      assert.ok(b.includes("git fetch origin ${PRREF} || {") && b.includes("TIP=$(git rev-parse FETCH_HEAD) || {"), `${name}: the head is not fetched explicitly and read from FETCH_HEAD`);
      assert.ok(b.includes('[ "${TIP}" = "${HELD}" ] || {'), `${name}: the fetched head is not pinned to HELD`);
      assert.match(doc, new RegExp(`#${PRREF.split("/")[2]}\\b`), "the document does not name the pull request its blocks fetch");
    } else {
      assert.doesNotMatch(b, /git fetch/, `${name}: a block after THE PRE-CHECK fetches a head`);
    }
    const pending = lines.filter((l) => /='PENDING/.test(l));
    if (name === "pre" || name === "undo") {
      assert.deepEqual(pending.map((l) => l.split("=")[0]), name === "pre" ? ["HELD", "DOCSHA", "RUNDAY", "MIGNIGHT"] : ["HELD", "DOCSHA", "RUNDAY"], name);
      assert.deepEqual(lines.slice(2, 2 + pending.length), pending, `${name}: the PENDING lines are not the first value lines`);
    } else {
      assert.equal(pending.length, 0, name);
    }
  }
});

/* ---- THE HARNESS. Nothing in it touches a real host, the secrets folder or a database. ------ */

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const STUBBED = ["git", "node", "psql", "sntp", "date", "grep", "awk", "cut", "sed", "shasum", "rm", "cat", "find", "mkdir", "tee", "touch"];
const FAKED = new Set(["git", "node", "psql", "sntp", "date"]);
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const TIP = "1".repeat(40);
const MD5 = "0123456789abcdef0123456789abcdef";
const IDS = [
  "aaaaaaaa-0000-4000-8000-000000000001",
  "aaaaaaaa-0000-4000-8000-000000000002",
  "aaaaaaaa-0000-4000-8000-000000000003",
];

const realPath = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", env: { PATH: SYSTEM_PATH } });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

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
printf '%s\\n' "$id" >> "$d/log"
unexpected() { printf '%s %s\\n' "$id" "$*" >> "$d/unexpected"; echo "harness: unexpected call $id" >&2; exit 97; }
for a in "$@"; do case "$a" in *osteojp-secrets*|*osteojp-prod-apply*|/Users/ivan/*) unexpected "a real path";; esac; done
if [ "$HARNESS_FAIL" = "$id" ]; then
  case "$n" in
    grep) ${R("cat")} > /dev/null 2>&1; echo "grep: harness fault" >&2; exit 2;;
    awk|cut|sed|shasum|tee|cat) ${R("cat")} > /dev/null 2>&1; echo "$n: harness fault" >&2; exit 1;;
    git) echo "fatal: harness fault" >&2; exit 128;;
    *) echo "$n: harness fault" >&2; exit 1;;
  esac
fi
case "$n" in
  git) case "$1" in
      fetch) [ "$2" = origin ] && [ "$3" = refs/pull/1724/head ] && [ "$#" = 3 ] || unexpected "$@"; exit 0;;
      status) if [ -n "$HARNESS_STRAY" ]; then echo "$HARNESS_STRAY"; fi; exit 0;;
      rev-parse) if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi
        if [ "$2" = FETCH_HEAD ]; then echo "$HARNESS_TIP"; exit 0; fi;;
      checkout) for a in "$@"; do last="$a"; done; echo "$last" > "$d/head"; exit 0;;
      show) spec="$2"; sha="\${spec%%:*}"; path="\${spec#*:}"
        [ "$sha" = "$HARNESS_TIP" ] || { echo "fatal: bad revision" >&2; exit 128; }
        [ -f "$path" ] || { echo "fatal: no such path" >&2; exit 128; }
        exec ${R("cat")} "$path";;
    esac
    unexpected "$@";;
  sntp) [ "$1" = time.apple.com ] && [ "$#" = 1 ] || unexpected "$@"
    echo "\${HARNESS_SNTP:-+0.004421} +/- 0.023706 time.apple.com 17.253.52.253"; exit 0;;
  date) [ "$TZ" = Europe/Lisbon ] || unexpected "date without TZ=Europe/Lisbon"
    if [ "$1" = '+%Y%m%d%H%M %u %Z' ] && [ "$#" = 1 ]; then echo "$HARNESS_STAMP $HARNESS_DOW $HARNESS_ZONE"; exit 0; fi
    if [ "$1" = -j ] && [ "$2" = -v+1d ] && [ "$3" = -f ] && [ "$4" = '%Y%m%d%H%M' ] && [ "$6" = '+%Y%m%d' ]; then echo "$HARNESS_NEXT"; exit 0; fi
    unexpected "$@";;
  node) [ "$1" = ${GUARD} ] && [ "$#" = 1 ] || unexpected "$@"
    [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the guard ran without the harness environment"
    printf 'host: harness.invalid\\nport: 5432\\nref: harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
  psql) [ "$1" = "$HARNESS_DBURL" ] || unexpected "psql got a URL that is not the harness's"
    prev=; f=; idsf=
    for a in "$@"; do if [ "$prev" = -f ]; then f="$a"; fi; case "$a" in idsfile=*) idsf="\${a#idsfile=}";; esac; prev="$a"; done
    case "$f" in
      *-1-precheck.sql) kind=pre;; *-2-write.sql) kind=write;; *-3-postcheck.sql) kind=post;; *-4-rollback.sql) kind=undo;; *) unexpected "$@";;
    esac
    if [ "$kind" = write ] && [ "\${HARNESS_IDS:-ok}" != none ]; then [ -n "$idsf" ] || unexpected "no idsfile"; ${R("cat")} "$HARNESS_FIX/ids.\${HARNESS_IDS:-ok}" > "$idsf"; fi
    ${R("cat")} "$HARNESS_FIX/$kind.\${HARNESS_VARIANT:-ok}"; exit "\${HARNESS_PSQL_EXIT:-0}";;
esac
exec ${R(name)} "$@"
`;
}

const PRE_OK = [
  "Q6PRE read_only on", "Q6PRE tenant_slug_osteojp 1", "Q6PRE column_vat_rate smallint", "Q6PRE column_vat_exemption_code text",
  "Q6PRE constraint_vat_rate 1", "Q6PRE constraint_vat_exemption_code 1", "Q6PRE services_total 20", "Q6PRE services_active 17",
  "Q6PRE services_archived 3", "Q6PRE target_total 3", "Q6PRE target_active 2", "Q6PRE target_archived 1",
  "Q6PRE target_internal_only 1", "Q6PRE partial_left_alone 1", "Q6PRE already_0_m07 0", "Q6PRE other_values_left_alone 16",
  "Q6PRE audit_rows_q6 0", "Q6PRE audit_rows_q6_undone 0", "Q6PRE other_tenants_services_untouched 4",
  `Q6PRE PASS target 3 ids_md5 ${MD5}`,
].join("\n");
const POST_OK = [
  "Q6POST read_only on", "Q6POST carries 110 1", "Q6POST services_total 20", "Q6POST at_0_m07_total 3", "Q6POST at_0_m07_active 2",
  "Q6POST at_0_m07_archived 1", "Q6POST target_left_now 0", "Q6POST partial_left_alone 1", "Q6POST other_values_left_alone 16",
  "Q6POST PASS written 3",
].join("\n");
const FIX = {
  "pre.ok": PRE_OK,
  "pre.notro": PRE_OK.replace("Q6PRE read_only on", "Q6PRE read_only off"),
  "pre.extra": `${PRE_OK}\nERROR:  something the read did not expect`,
  "pre.nopass": PRE_OK.replace(/\nQ6PRE PASS[^\n]*/, ""),
  "pre.twopass": `${PRE_OK}\nQ6PRE PASS target 3 ids_md5 ${MD5}`,
  "pre.big": PRE_OK.replace("PASS target 3 ", "PASS target 61 "),
  "write.ok": "Q6WRITE carries 1 32\nQ6WRITE ready_to_commit 3\nQ6WRITE COMMITTED 3",
  "write.notready": "Q6WRITE carries 1 32\nQ6WRITE COMMITTED 3",
  "write.nocommit": "Q6WRITE carries 1 32\nQ6WRITE ready_to_commit 3\nQ6WRITE COMMITTED 2",
  "ids.ok": IDS.join("\n"),
  "ids.short": IDS.slice(0, 2).join("\n"),
  "ids.bad": [...IDS.slice(0, 2), "not-an-id"].join("\n"),
  "post.ok": POST_OK,
  "post.notro": POST_OK.replace("Q6POST read_only on", "Q6POST read_only off"),
  "post.extra": `${POST_OK}\nNOTICE:  something`,
  "post.nopass": POST_OK.replace("Q6POST PASS written 3", "Q6POST PASS written 2"),
  "undo.ok": "Q6UNDO carries 110 1\nQ6UNDO COMMITTED 3",
  "undo.nocommit": "Q6UNDO carries 110 1\nQ6UNDO COMMITTED 2",
};

/** The document as the READY line will leave it: only the first line changes. */
const withFirstLine = (line) => [line, ...doc.split("\n").slice(1)].join("\n");

function makeBase({ firstLine = "READY: the harness's copy" } = {}) {
  const base = mkdtempSync(join(tmpdir(), "q6-vat-harness-"));
  for (const dir of ["bin", "fix", "apply/docs", "apply/scripts/data", "runs"]) mkdirSync(join(base, dir), { recursive: true });
  const real = Object.fromEntries([...STUBBED.filter((n) => !FAKED.has(n)), "cat"].map((n) => [n, realPath(n)]));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, real));
    chmodSync(join(base, "bin", n), 0o755);
  }
  for (const [k, v] of Object.entries(FIX)) writeFileSync(join(base, "fix", k), `${v}\n`);
  writeFileSync(join(base, "fake-prod.env"), `DATABASE_URL_DIRECT=${FAKE_DB_URL}\nDATABASE_URL=${FAKE_DB_URL}\n`);
  for (const p of [PRE, WRITE, POST, UNDO, GUARD, PTM]) copyFileSync(join(ROOT, p), join(base, "apply", p));
  const text = withFirstLine(firstLine);
  writeFileSync(join(base, "apply", DOC), text);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(text)}  ${DOC}\n`);
  return { base, docsha: sha256(text) };
}

/** The block as GREEN pastes it: PENDING lines filled (pre and undo), real paths moved into the run. */
function localize(name, run, base, { docsha, envFile, fill = true, held = TIP, runday = "20261116", mignight = "20261111" } = {}) {
  let b = BLOCKS[name];
  if (fill && (name === "pre" || name === "undo")) {
    b = b.replace(/^HELD='PENDING[^\n]*$/m, `HELD='${held}'`)
      .replace(/^DOCSHA='PENDING[^\n]*$/m, `DOCSHA='${docsha}'`)
      .replace(/^RUNDAY='PENDING[^\n]*$/m, `RUNDAY='${runday}'`)
      .replace(/^MIGNIGHT='PENDING[^\n]*$/m, `MIGNIGHT='${mignight}'`);
  }
  b = b.replaceAll(PROD_APPLY, join(base, "apply"))
    .replaceAll(PROD_ENV, envFile ?? join(base, "fake-prod.env"))
    .replaceAll(REC_DIR, join(run, "rec"))
    .replaceAll("/tmp/q6-", join(run, "tmp", "q6-"));
  const rest = b.replaceAll(join(run, "tmp", "q6-"), "").replaceAll(join(run, "rec"), "").replaceAll(join(base, "apply"), "")
    .replaceAll(envFile ?? join(base, "fake-prod.env"), "");
  for (const bad of ["/tmp/q6", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return b;
}

function shellArgs(shell, text) {
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  return shell === "zsh" ? ["zsh", ["-f", "-c", tail]] : ["bash", ["--noprofile", "--norc", "-c", tail]];
}

function runShell(shell, text, env, cwd) {
  const [cmd, args] = shellArgs(shell, text);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (x) => (stdout += x));
    p.stderr.on("data", (x) => (stderr += x));
    const t = setTimeout(() => p.kill("SIGKILL"), 60000);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 128, stdout, out: stdout + stderr });
    });
  });
}

const fresh = (f, text, minutesAgo = 0) => {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

/** The records each block finds when the sitting has reached it. */
function setupFor(name, run, s) {
  const tmp = join(run, "tmp");
  const rec = join(run, "rec");
  if (name === "write" || name === "post") {
    if (!s.noHeadRecord) fresh(join(tmp, "q6-head.sha"), `${TIP}\n`);
    writeFileSync(join(run, "head"), `${s.head ?? TIP}\n`);
  } else {
    writeFileSync(join(run, "head"), `${"9".repeat(40)}\n`);
  }
  if (name === "write") {
    if (!s.noNight) fresh(join(tmp, "q6-night.ok"), "20261116 20261117\n");
    if (!s.noCarry) fresh(join(tmp, "q6-pre.ok"), `3 ${MD5}\n`, s.carryAge ?? 1);
  }
  if ((name === "post" || name === "undo") && !s.noIds) fresh(join(rec, "written-ids.txt"), `${IDS.join("\n")}\n`);
  if (s.idsExist) fresh(join(rec, "written-ids.txt"), `${IDS.join("\n")}\n`);
  if (s.undoneExists) fresh(join(rec, "undone.ok"), "");
}

async function runOnce(cfg, s = {}) {
  const run = mkdtempSync(join(cfg.base, "runs", "r-"));
  mkdirSync(join(run, "tmp"), { recursive: true });
  setupFor(cfg.name, run, s);
  const text = localize(cfg.name, run, cfg.base, {
    docsha: s.docsha ?? cfg.docsha,
    envFile: s.noEnv ? join(run, "no-such.env") : undefined,
    fill: s.fill ?? true,
    held: s.held,
    runday: s.runday,
    mignight: s.mignight,
  });
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL, HARNESS_TIP: s.tip ?? TIP,
    HARNESS_STAMP: s.stamp ?? "202611162130", HARNESS_DOW: s.dow ?? "1", HARNESS_ZONE: s.zone ?? "WET", HARNESS_NEXT: "20261117",
    HARNESS_SNTP: s.sntp ?? "", HARNESS_STRAY: s.stray ?? "", HARNESS_VARIANT: s.variant ?? "ok", HARNESS_IDS: s.ids ?? "ok",
    HARNESS_PSQL_EXIT: String(s.psqlExit ?? 0), HARNESS_FAIL: s.fail ?? "",
  };
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").split("\n").filter(Boolean);
  const result = { ...r, calls, unexpected: readRun("unexpected"), idsAfter: readRun("rec/written-ids.txt"), undoneAfter: existsSync(join(run, "rec/undone.ok")) };
  rmSync(run, { recursive: true, force: true });
  return result;
}

function assertPass(name, r, label) {
  assert.equal(r.code, 0, `${label}: exit ${r.code}\n${r.out}`);
  assert.match(r.stdout, SUCCESS[name], `${label}: no success line\n${r.out}`);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/, label);
  assert.doesNotMatch(r.stdout, /^STOP:/m, label);
  assert.equal(r.unexpected, "", `${label}: an unexpected call\n${r.unexpected}`);
}

function assertStop(name, r, re, label) {
  assert.notEqual(r.code, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, SUCCESS[name], `${label}: a success line after a fault`);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.equal(r.unexpected, "", `${label}: an unexpected call\n${r.unexpected}`);
  return stops[0];
}

async function inPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine, and the zsh arm must run wherever it is not the GitHub runner"));

/** The scenarios each block must STOP on, beyond the call-by-call faults. */
const SCENARIOS = {
  pre: [
    ["the clinic is open", { stamp: "202611161500" }, /inside clinic hours/],
    ["RUNDAY is the night 0110 was applied", { mignight: "20261116" }, /not a night after the night 0110 was applied/],
    ["RUNDAY is before the night 0110 was applied", { mignight: "20261117" }, /not a night after the night 0110 was applied/],
    ["MIGNIGHT left PENDING", { mignight: "PENDING" }, /MIGNIGHT is still PENDING/],
    ["Sunday, closed, but not the named night", { stamp: "202611151000", dow: "7" }, /outside the window/],
    ["the night after the window", { stamp: "202611170700", dow: "2" }, /outside the window/],
    ["the zone did not load", { zone: "UTC" }, /zone WET or WEST/],
    ["the clock is far from network time", { sntp: "+42.000000" }, /more than 5/],
    ["the held head moved", { tip: "2".repeat(40) }, /held head is not the commit/],
    ["the worktree is dirty", { stray: " M somefile" }, /not clean/],
    ["the ids file exists", { idsExist: true }, /already exists/],
    ["the dispatch names another document", { docsha: "c".repeat(64) }, /not the approved one/],
    ["the read is not read only", { variant: "notro" }, /READ ONLY/],
    ["the transcript holds another line", { variant: "extra" }, /not Q6PRE count lines/],
    ["no PASS line", { variant: "nopass" }, /no PASS line/],
    ["two PASS lines", { variant: "twopass" }, /not exactly one/],
    ["a target above the ceiling", { variant: "big" }, /above the ceiling of 60/],
    ["the read refused", { psqlExit: 3 }, /refused or failed/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
  write: [
    ["the clinic is open", { stamp: "202611161500" }, /inside clinic hours/],
    ["outside the recorded night", { stamp: "202611180100", dow: "3" }, /outside the night/],
    ["07:00 the morning after RUNDAY, past the 06:29 limit", { stamp: "202611170700", dow: "2" }, /outside the night/],
    ["the zone did not load", { zone: "UTC" }, /zone WET or WEST/],
    ["no head recorded", { noHeadRecord: true }, /recorded no head/],
    ["the worktree is on another head", { head: "2".repeat(40) }, /not on the head THE PRE-CHECK recorded/],
    ["the worktree is dirty", { stray: " M somefile" }, /not clean/],
    ["no night recorded", { noNight: true }, /recorded no night/],
    ["no carry", { noCarry: true }, /recorded no carry/],
    ["a stale carry", { carryAge: 31 }, /more than 30 minutes ago/],
    ["the ids file exists", { idsExist: true }, /already exists/],
    ["the write refused", { psqlExit: 3 }, /refused or failed/],
    ["no ready_to_commit line", { variant: "notready" }, /ready_to_commit 3/],
    ["COMMITTED does not read the count", { variant: "nocommit" }, /COMMITTED 3/],
    ["no ids file after the commit", { ids: "none" }, /ids file is not there/],
    ["a short ids file", { ids: "short" }, /holds 2 lines/],
    ["a line of the ids file is not an id", { ids: "bad" }, /are not ids/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
  post: [
    ["no ids file", { noIds: true }, /ids file of THE WRITE is not there/],
    ["the worktree is on another head", { head: "2".repeat(40) }, /not on the head THE PRE-CHECK recorded/],
    ["the read is not read only", { variant: "notro" }, /READ ONLY/],
    ["the transcript holds another line", { variant: "extra" }, /not Q6POST count lines/],
    ["PASS does not read the count", { variant: "nopass" }, /PASS written 3/],
    ["the read refused", { psqlExit: 3 }, /refused or failed/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
  undo: [
    ["the marker exists", { undoneExists: true }, /already run/],
    ["no ids file", { noIds: true }, /ids file of THE WRITE is not there/],
    ["the clinic is open", { stamp: "202611161500" }, /inside clinic hours/],
    ["07:00 the morning after RUNDAY, past the 06:29 limit", { stamp: "202611170700", dow: "2" }, /outside the window/],
    ["the clock is far from network time", { sntp: "-9.500000" }, /more than 5/],
    ["the held head moved", { tip: "2".repeat(40) }, /held head is not the commit/],
    ["the rollback refused", { psqlExit: 3 }, /refused or failed/],
    ["COMMITTED does not read the count", { variant: "nocommit" }, /COMMITTED 3/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
};

for (const shell of shells) {
  for (const name of Object.keys(BLOCKS)) {
    test(`${shell}: ${name}: passes clean, and every external call failed in turn is one clean STOP`, async () => {
      const { base, docsha } = makeBase();
      try {
        const cfg = { base, docsha, name, shell };
        const clean = await runOnce(cfg);
        assertPass(name, clean, `${shell} ${name} clean`);
        if (name === "write") assert.equal(clean.idsAfter, `${IDS.join("\n")}\n`, "the write's ids file is not the recorded ids");
        if (name === "undo") assert.ok(clean.undoneAfter, "the rollback left no marker");
        for (const n of STUBBED) {
          if (name === "post" && ["sntp", "sed", "find", "mkdir", "touch", "rm"].includes(n)) continue;
          if (name === "pre" && ["find", "mkdir", "touch", "cat"].includes(n)) continue;
          if (name === "write" && ["sntp", "sed", "touch"].includes(n)) continue;
          if (name === "undo" && ["find", "mkdir", "cat"].includes(n)) continue;
          assert.ok(clean.calls.some((c) => c.startsWith(`${n}#`)), `${name}: ${n} was never called, so its failure is not proven`);
        }
        const psqlAt = clean.calls.findIndex((c) => c.startsWith("psql#"));
        assert.ok(psqlAt > 0, `${name}: psql never ran in the clean run`);
        const results = await inPool(clean.calls, 8, (id) => runOnce(cfg, { fail: id }));
        clean.calls.forEach((id, i) => {
          const stop = assertStop(name, results[i], null, `${shell} ${name} fail ${id}`);
          if (name === "write" || name === "undo") {
            if (i < psqlAt) assert.match(stop, /Nothing was/, `${name} fail ${id}: a STOP before psql does not say nothing was done`);
            else assert.doesNotMatch(stop, /Nothing was/, `${name} fail ${id}: a STOP after psql says nothing was done`);
          }
          if (i < psqlAt) assert.ok(!results[i].calls.some((c) => c.startsWith("psql#")), `${name} fail ${id}: psql ran after the fault`);
        });
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });

    test(`${shell}: ${name}: each refusal the document names is one STOP`, async () => {
      const { base, docsha } = makeBase();
      try {
        const cfg = { base, docsha, name, shell };
        for (const [label, s, re] of SCENARIOS[name]) {
          const r = await runOnce(cfg, s);
          assertStop(name, r, re, `${shell} ${name}: ${label}`);
          if (s.noEnv) assert.ok(!r.calls.some((c) => /^(node|psql)#/.test(c)), `${name}: the guard or psql ran without the env file`);
          if (s.psqlExit === undefined && s.variant === undefined && s.ids === undefined) {
            assert.ok(!r.calls.some((c) => c.startsWith("psql#")), `${name}: ${label}: psql ran`);
          }
        }
        if (name === "pre" || name === "undo") {
          const r = await runOnce(cfg, { fill: false });
          assertStop(name, r, /HELD is not a filled-in sha, so this block is NOT READY/, `${shell} ${name}: the document's own copy`);
          assert.ok(!r.calls.some((c) => /^(git|node|psql|sntp|date|shasum|rm|mkdir|touch)#/.test(c)), `${name}: a command ran before the PENDING check: ${r.calls}`);
          const runday = await runOnce(cfg, { runday: "PENDING" });
          assertStop(name, runday, /RUNDAY is still PENDING/, `${shell} ${name}: RUNDAY left PENDING`);
        }
        for (const [p, re] of [[name === "pre" ? WRITE : name === "write" ? WRITE : name === "post" ? POST : UNDO, /not the approved file/], [GUARD, /target guard on disk/], [PTM, /module on disk/]]) {
          const f = join(base, "apply", p);
          const keep = readFileSync(f);
          writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
          assertStop(name, await runOnce(cfg), re, `${shell} ${name}: changed ${p}`);
          writeFileSync(f, keep);
        }
        assertPass(name, await runOnce(cfg), `${shell} ${name}: clean again after the scenarios`);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }

  test(`${shell}: pre and undo refuse a document whose first line still reads NOT READY`, async () => {
    const { base, docsha } = makeBase({ firstLine: doc.split("\n")[0] });
    try {
      for (const name of ["pre", "undo"]) {
        const r = await runOnce({ base, docsha, name, shell });
        assertStop(name, r, /still reads NOT READY/, `${shell} ${name}: NOT READY`);
        assert.ok(!r.calls.some((c) => /^(node|psql)#/.test(c)), `${name}: the guard or psql ran on a NOT READY document`);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}

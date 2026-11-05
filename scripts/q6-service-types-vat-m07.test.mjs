// Q6 (strategy, 2026-11-04; reworked for its rulings of 2026-11-05): the existing appointment types
// take the VAT rate and exemption code the accountant confirms TYPE BY TYPE, from a per-type list
// supplied at run time and never committed. The document, its sidecar, its five SQL files and its
// five blocks agree with each other, the SQL has the shape the document claims, every refusal of the
// list is in the SQL with its STOP text, and every halt in every block is explicit, proven by fault
// injection.
//
// WHAT THIS PROVES, with no database (DATABASE_URL is never read):
//   * the sidecar pins the document; the first line reads NOT READY; the document carries its
//     Rehearsal and NOT REHEARSED sections (the blocks whole stay NOT REHEARSED until READY); no em dash in
//     any file of the op;
//   * the document pins the real five SQL files, the target guard and its module, in its table and
//     in every block that runs them;
//   * THE SQL: the write and the rollback open with BEGIN and the two SET LOCAL timeouts; each holds
//     exactly one UPDATE of public.services; the write's UPDATE takes each row's rate and code from the
//     list (no single value for all is left), on the tenant plus both VAT fields NULL; the list is loaded
//     with `\copy ... FROM pstdin` and validated by one DO block, byte-identical in the pre-check and the
//     write, before the UPDATE; every expected-count check sits before the COMMIT, and so does the record
//     of the ids; the rollback is keyed on the recorded ids and restores the audit rows' before values;
//     the reads write nothing and print only their own Q6 lines; no file names a uuid or a person's
//     column. Each shape rule is shown to catch its own seeded fault. Every refusal (IF ... THEN RAISE)
//     of each file is listed with its condition and message, and every WHERE and ON clause and every
//     statement is listed, so a guard turned off or a predicate widened fails the test;
//   * the 33 exemption codes the SQL carries are the pinned 33, and the application's list and 0110's
//     CHECK wherever those files are on disk;
//   * the blocks resolve the held head from refs/pull/1724/head, fetched explicitly, never from the
//     branch, which is deleted when the pull request merges; THE PRE-CHECK checks the list's sha256
//     against the dispatch before it reads production, and THE WRITE and THE POST-CHECK against the
//     carry; psql reads the list on its standard input and no block prints it;
//   * THE BLOCKS: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation, one psql
//     call each, its output to a file and never through tee, every halt one STOP and exit 1;
//   * EVERY HALT IS EXPLICIT: each block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`) under bash and zsh, every external command a stub,
//     and each call is made to fail in turn: each run ends non-zero with exactly one STOP line, no
//     pass line, and the tool chain stopped. In THE WRITE and THE ROLLBACK a fault before the psql
//     call says "Nothing was ..." and one after it never does;
//   * each refusal the document names (the clock, the night, Q6-D's time, the list and its sha256, the
//     held head, the pins, a record missing or stale, a written marker, each psql answer that is not the
//     clean one) is a STOP.
//
// WHAT IT DOES NOT PROVE: that the SQL runs against a database. That is what the document records
// under Rehearsal.
//
// Run: DATABASE_URL= node --test scripts/q6-service-types-vat-m07.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC = "docs/data-op-q6-service-types-vat-m07.md";
const SIDECAR = "docs/data-op-q6-service-types-vat-m07.sha256";
const READ = "scripts/data/q6-vat-m07-0-readout.sql";
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
const HAND_DIR = "/Users/ivan/osteojp-handover";
const LIST_PATH = `${HAND_DIR}/q6-vat-list.csv`;

/** The 33 AT exemption codes (packages/db/src/service-type-fields.ts on #1704, and 0110's CHECK). */
const CODES33 = [
  "M01", "M02", "M04", "M05", "M06", "M07", "M09", "M10", "M11", "M12", "M13", "M14", "M15", "M16", "M19", "M20", "M21",
  "M25", "M26", "M30", "M31", "M32", "M33", "M34", "M35", "M40", "M41", "M42", "M43", "M44", "M45", "M46", "M99",
];
const LIST_HEADER = "service_id,vat_rate,vat_exemption_code";
const LIST_PARSE = "(SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l";
const COPY_LINE = "\\copy q6_list_raw (line) FROM pstdin";
const READ_TX = `-c "begin" -c "create temp table q6_list_raw (n bigint generated always as identity, line text) on commit drop" -c "set transaction read only" -c "set local statement_timeout = '60s'"`;
const SNAP_PATH = "/tmp/q6-list.csv";
const SRC1704 = "origin/db/RODICA-services-vat-colour";

const doc = read(DOC);
const sql = { readout: read(READ), pre: read(PRE), write: read(WRITE), post: read(POST), undo: read(UNDO) };

/** The first fenced block under the `### <heading>` (or `## <heading>`) line. */
function blockUnder(md, heading) {
  let at = md.indexOf(`\n### ${heading}`);
  if (at < 0) at = md.indexOf(`\n## ${heading}`);
  assert.ok(at >= 0, `the document has no section ${heading}`);
  const m = md.slice(at).match(/```\n(\([\s\S]*?\n\))\n```/);
  assert.ok(m, `the section ${heading} has no fenced block`);
  return m[1];
}
const BLOCKS = {
  readout: blockUnder(doc, "THE READ-OUT:"),
  pre: blockUnder(doc, "THE PRE-CHECK:"),
  write: blockUnder(doc, "THE WRITE:"),
  post: blockUnder(doc, "THE POST-CHECK:"),
  undo: blockUnder(doc, "THE ROLLBACK:"),
};
const PINS = {
  readout: [["SHAREAD", READ], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  pre: [["SHAPRE", PRE], ["SHAWRITE", WRITE], ["SHAPOST", POST], ["SHAUNDO", UNDO], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  write: [["SHAWRITE", WRITE], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  post: [["SHAPOST", POST], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
  undo: [["SHAUNDO", UNDO], ["SHAGUARD", GUARD], ["SHAPTM", PTM]],
};
const SUCCESS = {
  readout: /^READ-OUT DONE: 3 appointment types of the tenant osteojp are in \S+\/q6-service-types-202611192130\.csv, sha256 [0-9a-f]{64}\. Nothing was written to production\./m,
  pre: /^PRE-CHECK PASSED: 3 services of the tenant osteojp have both VAT fields empty, each with its row in the list, /m,
  write: /^THE WRITE: COMMITTED\. 3 services of the tenant osteojp carry their list row's VAT rate and code, with 3 audit rows\./m,
  post: /^POST-CHECK PASSED: the 3 recorded services of the tenant osteojp each equal their list row, /m,
  undo: /^THE ROLLBACK: COMMITTED\. The 3 recorded services /m,
};

/* ---- The document and its pins. ------------------------------------------------------------ */

test("the sidecar pins the document, and the document says NOT READY, records its rehearsal and what is NOT REHEARSED", () => {
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  assert.match(doc.split("\n")[0], /^NOT READY: reworked for the per-type list 2026-11-05, R4 [^\n]*?, the blocks whole NOT REHEARSED[^\n]*?, the night Thu 2026-11-19 conditional on Q6-D/);
  assert.match(doc, /\n## Rehearsal\n/);
  assert.match(doc, /\n### SQL checked by the author, 2026-11-05/);
  assert.match(doc, /\n## NOT REHEARSED\n\n- \*\*The blocks whole\.\*\*/);
  assert.match(doc, /\*\*The target guard's production path\*\*/);
  for (const f of [DOC, READ, PRE, WRITE, POST, UNDO, SELF]) {
    assert.ok(!read(f).includes(String.fromCharCode(0x2014)), `${f} carries an em dash`);
  }
});

test("the document quotes the rulings of 2026-11-05 and no longer asks them", () => {
  for (const q of [
    "**B9:** \"the night is Thu 2026-11-19, CONDITIONAL on the accountant's written confirmation (Q6-D) reaching the owner before Thu 11-19 12:00 Lisbon. Without it, the night is skipped and nothing is written.\"",
    "**Q6-A** = \"yes, include archived types.\"",
    "**Q6-B** = \"yes, include internal-only types.\"",
    "**Q6-C** = \"audit action service.vat_default_q6, accepted.\"",
    "**Q6-D** = \"the accountant confirms type by type. The op must accept a per-type list (exempt with code, or a stated rate), not one value for all.\"",
    "a Motivo/exemption code is only valid at 0%; any rate above 0% carries no code.",
  ]) assert.ok(doc.includes(q), `the document does not quote: ${q}`);
  assert.doesNotMatch(doc, /\n## Questions for strategy\n/, "the open questions are still in the document");
  assert.match(doc, /\nservice_id,vat_rate,vat_exemption_code\n/, "the document does not state the list's header");
});

test("the document pins the real SQL files, guard and module, in its table and in every block", () => {
  const head = doc.slice(0, doc.indexOf("\n## The rulings"));
  for (const p of [READ, PRE, WRITE, POST, UNDO, GUARD, PTM]) {
    assert.ok(head.includes(`\`${p}\``) && head.includes(`sha256 \`${sha256(read(p))}\``), `the facts table does not pin ${p}`);
  }
  for (const [name, pins] of Object.entries(PINS)) {
    for (const [v, p] of pins) {
      assert.ok(BLOCKS[name].includes(`\n${v}=${sha256(read(p))}\n`), `block ${name}: ${v} is not the sha256 of ${p}`);
    }
  }
});

test("the list is never committed: no list or read-out file is in the repository", () => {
  const seen = [];
  const walk = (d) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = d ? `${d}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!["node_modules", ".git", ".next", ".turbo"].includes(e.name)) walk(p); } else if (/q6-(vat-list|service-types-)/.test(e.name) && /\.csv$/i.test(e.name)) seen.push(p);
    }
  };
  for (const d of ["scripts", "docs"]) walk(d);
  assert.deepEqual(seen, [], "a Q6 list or read-out file is committed");
  for (const b of Object.values(BLOCKS)) {
    for (const l of b.split("\n").filter((x) => x.includes("${LIST}"))) {
      assert.match(l, /^(test -f \$\{LIST\} \|\||cp \$\{LIST\} \$\{SNAP\} \|\||echo "the list: )/, `a block line uses the list other than to test it or copy it to the snapshot: ${l}`);
    }
    for (const l of b.split("\n").filter((x) => x.includes("${SNAP}"))) {
      assert.match(l, /^(test -f \$\{SNAP\} \|\||cp \$\{LIST\} \$\{SNAP\} \|\||PERM=\$\(find \$\{SNAP\} -perm 600\) \|\||LS=\$\(shasum -a 256 \$\{SNAP\} \| cut -d' ' -f1\) \|\||BADC=\$\(awk '[^']*' \$\{SNAP\}\) \|\||echo "the list: |psql .* < \$\{SNAP\} > )/, `a block line uses the snapshot other than to test, copy, hash, scan or feed psql: ${l}`);
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

const WRITE_WHERE = "WHERE s.id = l.id AND s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL";
const CODES_LINE = /^\s*c_codes\s+constant text\[\] := ARRAY\[[^\n]*\];\n/m;

/** Every rule the write must keep; returns the breaches (empty when clean). */
function writeFindings(text) {
  const f = [];
  const body = fromBegin(text);
  if (!body.startsWith("BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n")) {
    f.push("the write does not open with BEGIN and the two SET LOCAL timeouts");
  }
  const updates = maskStrings(body).match(/\bUPDATE\b/g) || [];
  if (updates.length !== 1) f.push(`the write holds ${updates.length} UPDATE statements, not exactly one`);
  const u = /UPDATE public\.services s\n\s+SET ([^\n]*)\n\s+FROM ([^\n]*)\n\s+(WHERE [^\n]*)\n\s+RETURNING ([^\n]*)/.exec(body);
  if (!u) f.push("the UPDATE is not of public.services with a SET, a FROM the list, a WHERE and a RETURNING");
  else {
    if (u[1] !== "vat_rate = l.vat_rate, vat_exemption_code = l.vat_exemption_code") f.push(`the UPDATE sets ${u[1]}, not each row's list values`);
    if (u[2] !== LIST_PARSE) f.push(`the UPDATE does not read the list: FROM ${u[2]}`);
    if (u[3] !== WRITE_WHERE) f.push(`the UPDATE's predicate is ${u[3]}`);
    if (u[4] !== "s.id, s.vat_rate, s.vat_exemption_code") f.push(`the UPDATE returns ${u[4]}`);
  }
  if (/\bc_rate\b|\bc_code\b/.test(body)) f.push("a single value for all is left: c_rate or c_code");
  if (/'M[0-9]{2}'/.test(body.replace(CODES_LINE, ""))) f.push("a single value for all is left: the write names an exemption code outside the list of the 33");
  if (/SET vat_rate = [0-9]/.test(body)) f.push("a single value for all is left: a constant rate");
  const commit = body.indexOf("\nCOMMIT;\n");
  if (commit < 0) f.push("the write has no COMMIT");
  for (const check of [
    `${COPY_LINE}\n`,
    "DO $q6list$",
    "IF v_list <> s_list THEN",
    "IF v_dis <> s_dis::int THEN",
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
  const lock = body.indexOf("LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;");
  if (lock < 0) f.push("no SHARE ROW EXCLUSIVE lock on services");
  const order = [lock, body.indexOf(`\n${COPY_LINE}\n`), body.indexOf("\nDO $q6list$\n"), body.indexOf("\nDO $q6write$\n"), body.indexOf("UPDATE public.services s")];
  if (order.some((x) => x < 0) || order.some((x, i) => i > 0 && x < order[i - 1])) {
    f.push("not in order: the lock, the list loaded, the list validated, then the write and its UPDATE");
  }
  if (body.indexOf("IF v_upd <> v_expect THEN") > body.indexOf("INSERT INTO public.audit_log")) f.push("the audit rows are written before the UPDATE's count is checked");
  if (body.indexOf("IF v_dis <> s_dis::int THEN") < 0 || body.indexOf("IF v_dis <> s_dis::int THEN") > body.indexOf("UPDATE public.services s")) f.push("the disagreement count is not counted again before the UPDATE");
  if (body.indexOf("IF v_list <> s_list THEN") < 0 || body.indexOf("IF v_list <> s_list THEN") > body.indexOf("UPDATE public.services s")) f.push("the md5 of the loaded list is not compared before the UPDATE");
  if (!body.includes("SELECT md5(coalesce(string_agg(r.line, E'\\n' ORDER BY r.n), '')) INTO v_list FROM q6_list_raw r;")) f.push("the md5 of the loaded list is not the md5 of its lines in file order");
  if (!/WHERE s\.tenant_id = v_tenant AND s\.vat_rate IS NULL AND s\.vat_exemption_code IS NULL;\n\s+IF v_target <> v_expect/.test(body)) {
    f.push("the target count does not read the target predicate");
  }
  if (!body.includes("'vat_rate_after', w.vat_rate,\n           'vat_exemption_code_after', w.vat_exemption_code)")) f.push("the audit's after values are not the written row's");
  return f;
}

const UNDO_SET = "vat_rate = (mine.metadata ->> 'vat_rate_before')::smallint, vat_exemption_code = (mine.metadata ->> 'vat_exemption_code_before')";
const UNDO_WHERE = "WHERE mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' AND s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after')";

/** Every rule the rollback must keep. */
function undoFindings(text) {
  const f = [];
  const body = fromBegin(text);
  if (!body.startsWith("BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n")) {
    f.push("the rollback does not open with BEGIN and the two SET LOCAL timeouts");
  }
  const updates = maskStrings(body).match(/\bUPDATE\b/g) || [];
  if (updates.length !== 1) f.push(`the rollback holds ${updates.length} UPDATE statements, not exactly one`);
  const u = /UPDATE public\.services s\n\s+SET ([^\n]*)\n\s+FROM ([^\n]*)\n\s+(WHERE [^\n]*);/.exec(body);
  if (!u) f.push("the rollback's UPDATE is not of public.services with a SET, a FROM and a WHERE");
  else {
    if (u[1] !== UNDO_SET) f.push(`the rollback does not restore the audit rows' before values: it sets ${u[1]}`);
    if (u[2] !== "public.audit_log mine") f.push(`the rollback does not read THE WRITE's audit rows: FROM ${u[2]}`);
    if (!u[3].includes(" AND s.id = ANY (v_ids) AND ")) f.push(`the rollback's predicate is not keyed on the recorded ids: ${u[3]}`);
    else if (u[3] !== UNDO_WHERE) f.push(`the rollback's predicate is ${u[3]}`);
  }
  if (body.includes("q6_list_raw")) f.push("the rollback reads the list; it restores from the audit rows only");
  const commit = body.indexOf("\nCOMMIT;\n");
  for (const check of ["IF v_upd <> v_expect THEN", "IF v_aud <> v_expect THEN", "IF v_other_a IS DISTINCT FROM v_other_b THEN", "still read the values THE WRITE recorded", "record two empty before values"]) {
    const at = body.indexOf(check);
    if (at < 0 || commit < 0 || at > commit) f.push(`not before the COMMIT: ${check}`);
  }
  return f;
}

/** The reads: no write, no transaction control, only their own lines printed. */
function readFindings(text, tag) {
  const f = [];
  const masked = maskStrings(stripComments(text)).replace(`${COPY_LINE}\n`, "");
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

/** THE READ-OUT: a read whose one COPY goes to the handover file, reading tenants and services only. */
function readoutFindings(text) {
  const c = stripComments(text);
  const f = [];
  const copies = c.match(/\nCOPY \(\n[\s\S]*?\n\) TO STDOUT WITH \(FORMAT csv, HEADER true\);\n/g) || [];
  if (copies.length !== 1) f.push(`the read-out holds ${copies.length} COPY TO STDOUT statements, not exactly one`);
  else {
    const at = c.indexOf(copies[0]);
    const oOpen = c.lastIndexOf("\n\\o :outfile\n", at);
    const oClose = c.indexOf("\n\\o\n", at);
    if (oOpen < 0 || oClose !== at + copies[0].length - 1) f.push("the COPY does not sit between \\o :outfile and \\o");
  }
  f.push(...readFindings(copies.length === 1 ? text.replace(/\nCOPY \(\n[\s\S]*?\n\) TO STDOUT WITH \(FORMAT csv, HEADER true\);\n/, "\n") : text, "Q6READ"));
  const tables = new Set([...c.matchAll(/\bpublic\.(\w+)/g)].map((m) => m[1]));
  for (const t of tables) if (!["tenants", "services"].includes(t)) f.push(`the read-out reads public.${t}`);
  return f;
}

/* ---- Every guard and every predicate, listed. A guard turned off (IF false), a condition loosened, a
   message moved to another check, or a WHERE / ON clause widened changes one of these lists. The
   lists are the review's statement of what each file refuses and which rows each query reads. ---- */

const sqlGuards = (t) => [...stripComments(t).matchAll(/\n\s*IF (.+?) THEN\n\s+RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => `IF ${m[1]} => ${m[2]}`);
const sqlPredicates = (t) => [...stripComments(t).matchAll(/\b(WHERE|ON)\b([\s\S]*?)(?=;|\bGROUP\b|\bORDER\b|\bRETURNING\b|\bUNION\b|\bJOIN\b)/g)]
  .map((m) => `${m[1]}${m[2]}`.replace(/\s+/g, " ").trim()).filter((x) => x !== "ON COMMIT DROP");

/* ---- Every statement, in order (R4 round 2). The guards and predicates name what each file refuses and
   reads; this list pins what FEEDS them: every assignment (`:=`, DECLARE initialisers included), every
   SELECT ... INTO, every GET DIAGNOSTICS, every md5 and its column list, every INSERT and UPDATE, and the
   order of every printed line against BEGIN and COMMIT. Comments and whitespace do not count; anything
   else that moves, is deleted or is added fails it. A statement ends at a `;` that ends a line, and each
   psql meta line (\if, \o, \copy, ...) is a statement of its own. ---- */

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

const EXPECTED_GUARDS = {
  readout: [
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_n = 0 => Q6STOP: the tenant osteojp has no appointment type",
    "IF v_n > 60 => Q6STOP: the tenant osteojp has % appointment types, more than the ceiling of 60. Strategy rules",
  ],
  pre: [
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_cols <> 2 => Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied",
    "IF v_cons <> 2 => Q6STOP: services carries % of the 2 CHECK constraints of 0110: 0110 is not applied as reviewed",
    "IF v_audit <> 0 => Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules",
    "IF v_target = 0 => Q6STOP: no service of the tenant has both VAT fields empty: there is nothing to write",
    "IF v_target > 60 => Q6STOP: % target rows, more than the ceiling of 60 the document names. Strategy rules",
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_n <> cardinality(c_codes) => Q6STOP: the CHECK of 0110 names % exemption codes and this file names %: the two lists differ",
    "IF v_n <> 0 => Q6STOP: % exemption codes of this file are not in the CHECK of 0110: the two lists differ",
    "IF v_header IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code' => Q6STOP: the first line of the list is not the header service_id,vat_rate,vat_exemption_code",
    "IF v_rows = 0 => Q6STOP: the list holds no row under its header",
    "IF v_rows > 60 => Q6STOP: the list holds % rows, more than the ceiling of 60",
    "IF v_n <> 0 => Q6STOP: % rows of the list are malformed: each row is a lower-case service id, a rate and a code or nothing, joined by two commas",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry a rate other than 0, 6, 13 or 23",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry the rate 0 and no exemption code: a rate of 0 requires one",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry an exemption code with a rate above 0: a code is valid at 0 only (B10)",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry an exemption code that is not one of the 33 codes",
    "IF v_n <> 0 => Q6STOP: the list repeats a service id: % rows more than distinct ids",
    "IF v_n <> 0 => Q6STOP: % service ids of the list are not appointment types of the tenant osteojp",
    "IF v_n <> 0 => Q6STOP: % appointment types of the tenant with both VAT fields empty are missing from the list: every one must be listed",
  ],
  write: [
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_n <> cardinality(c_codes) => Q6STOP: the CHECK of 0110 names % exemption codes and this file names %: the two lists differ",
    "IF v_n <> 0 => Q6STOP: % exemption codes of this file are not in the CHECK of 0110: the two lists differ",
    "IF v_header IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code' => Q6STOP: the first line of the list is not the header service_id,vat_rate,vat_exemption_code",
    "IF v_rows = 0 => Q6STOP: the list holds no row under its header",
    "IF v_rows > 60 => Q6STOP: the list holds % rows, more than the ceiling of 60",
    "IF v_n <> 0 => Q6STOP: % rows of the list are malformed: each row is a lower-case service id, a rate and a code or nothing, joined by two commas",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry a rate other than 0, 6, 13 or 23",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry the rate 0 and no exemption code: a rate of 0 requires one",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry an exemption code with a rate above 0: a code is valid at 0 only (B10)",
    "IF v_n <> 0 => Q6STOP: % rows of the list carry an exemption code that is not one of the 33 codes",
    "IF v_n <> 0 => Q6STOP: the list repeats a service id: % rows more than distinct ids",
    "IF v_n <> 0 => Q6STOP: % service ids of the list are not appointment types of the tenant osteojp",
    "IF v_n <> 0 => Q6STOP: % appointment types of the tenant with both VAT fields empty are missing from the list: every one must be listed",
    "IF s_expect !~ '^[1-9][0-9]?$' => Q6STOP: -v expect must be a whole number from 1 to 60; received %",
    "IF v_expect > 60 => Q6STOP: -v expect % is above the ceiling of 60",
    "IF s_md5 !~ '^[0-9a-f]{32}$' => Q6STOP: -v target_md5 must be 32 lower-case hex characters",
    "IF s_list !~ '^[0-9a-f]{32}$' => Q6STOP: -v list_md5 must be 32 lower-case hex characters",
    "IF s_dis !~ '^(0|[1-9][0-9]?)$' => Q6STOP: -v disagree must be a whole number from 0 to 99; received %",
    "IF v_list <> s_list => Q6STOP: the list loaded now is not the list THE PRE-CHECK loaded. Paste THE PRE-CHECK again",
    "IF v_tenants <> 1 => Q6STOP: the slug osteojp names % tenants, not exactly 1",
    "IF v_cols <> 2 => Q6STOP: services carries % of the 2 columns of 0110 with their types: 0110 is not applied",
    "IF v_prior <> 0 => Q6STOP: % audit rows of this op are already in the tenant: it ran before, or was undone. The lead rules",
    "IF v_target <> v_expect => Q6STOP: % target rows now, but THE PRE-CHECK counted %: the table moved. Paste THE PRE-CHECK again",
    "IF v_md5 <> s_md5 => Q6STOP: the target set is not the one THE PRE-CHECK read (same count, other rows). Paste THE PRE-CHECK again",
    "IF v_dis <> s_dis::int => Q6STOP: % listed types staff set now differ from the list, and THE PRE-CHECK carried %: the table moved. The lead rules",
    "IF v_upd <> v_expect => Q6STOP: the UPDATE wrote % rows, expected exactly %",
    "IF v_aud <> v_expect => Q6STOP: wrote % audit rows, expected exactly %",
    "IF v_ok <> v_expect => Q6STOP: % written rows equal their list row, expected exactly %",
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
    "IF v_n <> 0 => Q6STOP: % lines of the list do not read as the list THE WRITE read",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services are in the list",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services equal their list row in the tenant",
    "IF v_n <> v_expect => Q6STOP: the tenant holds % audit rows of this op, expected exactly %",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services have their audit row",
    "IF v_n <> v_expect => Q6STOP: % of the % audit rows of this op record empty before values and their list row as after values",
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
    "IF v_n <> v_expect => Q6STOP: % of the % audit rows of THE WRITE record two empty before values. Nothing is written; the lead rules",
    "IF v_n <> v_expect => Q6STOP: % of the % recorded services still read the values THE WRITE recorded: staff changed the others since THE WRITE. Nothing is written; the lead rules",
    "IF v_n <> 0 => Q6STOP: % service audit rows of another action sit on the recorded services from 10 minutes before THE WRITE on: staff may have re-saved them. Nothing is written; the lead rules",
    "IF v_n <> 0 => Q6STOP: % recorded services were updated after THE WRITE: staff may have re-saved them. Nothing is written; the lead rules",
    "IF v_upd <> v_expect => Q6STOP: the UPDATE reset % rows, expected exactly %",
    "IF v_aud <> v_expect => Q6STOP: wrote % undo audit rows, expected exactly %",
    "IF v_other_a IS DISTINCT FROM v_other_b => Q6STOP: a services row outside the recorded ids changed, and none may",
  ],
};
const EXPECTED_PREDICATES = {
  readout: [
    "WHERE slug = 'osteojp'",
    "WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name IN ('vat_rate', 'vat_exemption_code')",
    "WHERE slug = 'osteojp'",
    "ON t.id = sv.tenant_id WHERE t.slug = 'osteojp'",
    "WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.internal_only, to_jsonb(sv) ->> 'vat_rate' AS vat_rate, to_jsonb(sv) ->> 'vat_exemption_code' AS vat_exemption_code FROM public.services sv",
    "ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6READ services_total ' || count(*) AS line FROM s",
    "WHERE is_active) FROM s",
    "WHERE NOT is_active) FROM s",
    "WHERE internal_only) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s",
    "WHERE vat_rate IS NOT NULL OR vat_exemption_code IS NOT NULL) FROM s ) x",
    "ON t.id = sv.tenant_id WHERE t.slug = 'osteojp'",
    "ON t.id = sv.tenant_id WHERE t.slug = 'osteojp'",
  ],
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
    "WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NULL) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NOT NULL) FROM s",
    "WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL) FROM s",
    "WHERE action = 'service.vat_default_q6') FROM a",
    "WHERE action = 'service.vat_default_q6_undone') FROM a",
    "WHERE sv.tenant_id NOT IN (SELECT id FROM t) ) x",
    "WHERE slug = 'osteojp'",
    "WHERE tenant_id = v_tenant AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')",
    "WHERE tenant_id = v_tenant AND vat_rate IS NULL AND vat_exemption_code IS NULL",
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_exemption_code_allowed'",
    "WHERE position('''' || c || '''' IN coalesce(v_def, '')) = 0",
    "WHERE r.n = 1",
    "WHERE r.n > 1",
    "WHERE r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},[0-9]+,[A-Z0-9]*$')",
    "WHERE r.n > 1 AND split_part(r.line, ',', 2) NOT IN ('0', '6', '13', '23')",
    "WHERE r.n > 1 AND split_part(r.line, ',', 2) = '0' AND split_part(r.line, ',', 3) = ''",
    "WHERE r.n > 1 AND split_part(r.line, ',', 2) <> '0' AND split_part(r.line, ',', 3) <> ''",
    "WHERE r.n > 1 AND split_part(r.line, ',', 3) <> '' AND NOT (split_part(r.line, ',', 3) = ANY (c_codes))",
    "WHERE r.n > 1",
    "WHERE r.n > 1 AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = split_part(r.line, ',', 1)::uuid AND s.tenant_id = v_tenant)",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL AND NOT EXISTS (SELECT 1 FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 1) = s.id::text)",
    "WHERE slug = 'osteojp' ), l AS ( SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1 ), j AS ( SELECT l.vat_rate, l.vat_exemption_code, (sv.vat_rate IS NULL AND sv.vat_exemption_code IS NULL) AS target, (sv.vat_rate IS DISTINCT FROM l.vat_rate OR sv.vat_exemption_code IS DISTINCT FROM l.vat_exemption_code) AS differs FROM l",
    "ON sv.id = l.id",
    "ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6PRE list_rows ' || count(*) AS line FROM j",
    "WHERE target) FROM j",
    "WHERE NOT target) FROM j",
    "WHERE NOT target AND differs) FROM j",
    "WHERE target AND vat_rate = 0) FROM j",
    "WHERE target AND vat_rate = 6) FROM j",
    "WHERE target AND vat_rate = 13) FROM j",
    "WHERE target AND vat_rate = 23) FROM j",
    "WHERE target AND vat_exemption_code = 'M07') FROM j",
    "WHERE target AND vat_exemption_code <> 'M07') FROM j ) x",
    "ON t.id = s.tenant_id WHERE t.slug = 'osteojp' AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
  ],
  write: [
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_exemption_code_allowed'",
    "WHERE position('''' || c || '''' IN coalesce(v_def, '')) = 0",
    "WHERE r.n = 1",
    "WHERE r.n > 1",
    "WHERE r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},[0-9]+,[A-Z0-9]*$')",
    "WHERE r.n > 1 AND split_part(r.line, ',', 2) NOT IN ('0', '6', '13', '23')",
    "WHERE r.n > 1 AND split_part(r.line, ',', 2) = '0' AND split_part(r.line, ',', 3) = ''",
    "WHERE r.n > 1 AND split_part(r.line, ',', 2) <> '0' AND split_part(r.line, ',', 3) <> ''",
    "WHERE r.n > 1 AND split_part(r.line, ',', 3) <> '' AND NOT (split_part(r.line, ',', 3) = ANY (c_codes))",
    "WHERE r.n > 1",
    "WHERE r.n > 1 AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = split_part(r.line, ',', 1)::uuid AND s.tenant_id = v_tenant)",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL AND NOT EXISTS (SELECT 1 FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 1) = s.id::text)",
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE c.table_schema = 'public' AND c.table_name = 'services' AND ((c.column_name = 'vat_rate' AND c.data_type = 'smallint') OR (c.column_name = 'vat_exemption_code' AND c.data_type = 'text'))",
    "WHERE tenant_id = v_tenant AND action IN ('service.vat_default_q6', 'service.vat_default_q6_undone')",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WHERE r.n > 1) l ON l.id = s.id WHERE s.tenant_id = v_tenant AND NOT (s.vat_rate IS NULL AND s.vat_exemption_code IS NULL) AND (s.vat_rate IS DISTINCT FROM l.vat_rate OR s.vat_exemption_code IS DISTINCT FROM l.vat_exemption_code)",
    "WHERE NOT (s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL)",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WHERE r.n > 1) l WHERE s.id = l.id AND s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "ON w.id = s.id",
    "WHERE r.n > 1) l ON l.id = s.id WHERE s.tenant_id = v_tenant AND s.vat_rate = l.vat_rate AND s.vat_exemption_code IS NOT DISTINCT FROM l.vat_exemption_code",
    "WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WHERE s.id NOT IN (SELECT w.id FROM q6_written w)",
    "ON w.id = s.id",
    "ON t.id = al.tenant_id WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6'",
  ],
  post: [
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE (r.n = 1 AND r.line IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code') OR (r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},(0|6|13|23),[A-Z0-9]*$'))",
    "WHERE r.n > 1 AND split_part(r.line, ',', 1)::uuid = ANY (v_ids)",
    "WHERE r.n > 1) l ON l.id = s.id WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = l.vat_rate AND s.vat_exemption_code IS NOT DISTINCT FROM l.vat_exemption_code",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "WHERE r.n > 1) l ON l.id = al.entity_id WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids) AND al.metadata -> 'vat_rate_before' = 'null'::jsonb AND al.metadata -> 'vat_exemption_code_before' = 'null'::jsonb AND al.metadata -> 'vat_rate_after' = to_jsonb(l.vat_rate) AND al.metadata -> 'vat_exemption_code_after' = coalesce(to_jsonb(l.vat_exemption_code), 'null'::jsonb)",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6_undone'",
    "WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.vat_rate, sv.vat_exemption_code FROM public.services sv",
    "ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6POST services_total ' || count(*) AS line FROM s",
    "WHERE vat_rate = 0 AND vat_exemption_code IS NOT NULL) FROM s",
    "WHERE vat_rate > 0) FROM s",
    "WHERE vat_exemption_code = 'M07') FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s",
    "WHERE vat_rate = 0 AND vat_exemption_code IS NULL) FROM s",
    "WHERE vat_rate IS NULL AND vat_exemption_code IS NOT NULL) FROM s ) x",
  ],
  undo: [
    "WHERE slug = 'osteojp'",
    "WHERE slug = 'osteojp'",
    "WHERE al.tenant_id = v_tenant AND al.action = c_action",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "WHERE mine.tenant_id = v_tenant AND mine.action = 'service.vat_default_q6' AND mine.entity_type = 'service' AND mine.entity_id = ANY (v_ids) AND mine.metadata -> 'vat_rate_before' = 'null'::jsonb AND mine.metadata -> 'vat_exemption_code_before' = 'null'::jsonb",
    "ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after')",
    "ON mine.tenant_id = later.tenant_id AND mine.entity_id = later.entity_id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE later.tenant_id = v_tenant AND later.entity_type = 'service' AND later.entity_id = ANY (v_ids) AND later.action LIKE 'service.%' AND later.action <> 'service.vat_default_q6' AND later.created_at > mine.created_at - interval '10 minutes'",
    "ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.updated_at > mine.created_at",
    "WHERE NOT (s.id = ANY (v_ids))",
    "WHERE mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' AND s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after')",
    "WHERE mine.tenant_id = v_tenant AND mine.action = 'service.vat_default_q6' AND mine.entity_type = 'service' AND mine.entity_id = ANY (v_ids)",
    "WHERE NOT (s.id = ANY (v_ids))",
    "ON t.id = al.tenant_id WHERE t.slug = 'osteojp' AND al.action = 'service.vat_default_q6_undone'",
  ],
};
const EXPECTED_STATEMENTS = {
  readout: [
    "\\if :{?outfile}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v outfile is missing. The block names the file under the handover folder; this file refuses to guess.'",
    "END $missing$",
    "\\endif",
    "SELECT 'Q6READ read_only ' || current_setting('transaction_read_only')",
    "SELECT 'Q6READ tenant_slug_osteojp ' || count(*) FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT 'Q6READ columns_of_0110 ' || count(*) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'services' AND c.column_name IN ('vat_rate', 'vat_exemption_code')",
    "DO $q6read$ DECLARE v_tenants int",
    "v_n int",
    "BEGIN SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services sv JOIN public.tenants t ON t.id = sv.tenant_id WHERE t.slug = 'osteojp'",
    "IF v_n = 0 THEN RAISE EXCEPTION 'Q6STOP: the tenant osteojp has no appointment type'",
    "END IF",
    "IF v_n > 60 THEN RAISE EXCEPTION 'Q6STOP: the tenant osteojp has % appointment types, more than the ceiling of 60. Strategy rules', v_n",
    "END IF",
    "END $q6read$",
    "WITH t AS ( SELECT id FROM public.tenants WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.internal_only, to_jsonb(sv) ->> 'vat_rate' AS vat_rate, to_jsonb(sv) ->> 'vat_exemption_code' AS vat_exemption_code FROM public.services sv JOIN t ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6READ services_total ' || count(*) AS line FROM s UNION ALL SELECT 2, 'Q6READ services_active ' || count(*) FILTER (WHERE is_active) FROM s UNION ALL SELECT 3, 'Q6READ services_archived ' || count(*) FILTER (WHERE NOT is_active) FROM s UNION ALL SELECT 4, 'Q6READ services_internal_only ' || count(*) FILTER (WHERE internal_only) FROM s UNION ALL SELECT 5, 'Q6READ vat_both_empty ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 6, 'Q6READ vat_any_set ' || count(*) FILTER (WHERE vat_rate IS NOT NULL OR vat_exemption_code IS NOT NULL) FROM s ) x ORDER BY k",
    "\\o :outfile",
    "COPY ( SELECT sv.id AS service_id, sv.name, CASE WHEN sv.is_active THEN 'active' ELSE 'archived' END AS status, CASE WHEN sv.internal_only THEN 'yes' ELSE 'no' END AS internal_only, to_jsonb(sv) ->> 'vat_rate' AS vat_rate_now, to_jsonb(sv) ->> 'vat_exemption_code' AS vat_exemption_code_now FROM public.services sv JOIN public.tenants t ON t.id = sv.tenant_id WHERE t.slug = 'osteojp' ORDER BY sv.is_active DESC, sv.name, sv.id ) TO STDOUT WITH (FORMAT csv, HEADER true)",
    "\\o",
    "SELECT 'Q6READ PASS rows ' || count(*) FROM public.services sv JOIN public.tenants t ON t.id = sv.tenant_id WHERE t.slug = 'osteojp'",
  ],
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
    "WITH t AS ( SELECT id FROM public.tenants WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.internal_only, sv.vat_rate, sv.vat_exemption_code FROM public.services sv JOIN t ON t.id = sv.tenant_id ), a AS ( SELECT al.action FROM public.audit_log al JOIN t ON t.id = al.tenant_id WHERE al.action IN ('service.vat_default_q6', 'service.vat_default_q6_undone') ) SELECT line FROM ( SELECT 1 AS k, 'Q6PRE services_total ' || count(*) AS line FROM s UNION ALL SELECT 2, 'Q6PRE services_active ' || count(*) FILTER (WHERE is_active) FROM s UNION ALL SELECT 3, 'Q6PRE services_archived ' || count(*) FILTER (WHERE NOT is_active) FROM s UNION ALL SELECT 4, 'Q6PRE target_total ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 5, 'Q6PRE target_active ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND is_active) FROM s UNION ALL SELECT 6, 'Q6PRE target_archived ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND NOT is_active) FROM s UNION ALL SELECT 7, 'Q6PRE target_internal_only ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL AND internal_only) FROM s UNION ALL SELECT 8, 'Q6PRE staff_set_rate_only ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 9, 'Q6PRE staff_set_code_only ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NOT NULL) FROM s UNION ALL SELECT 10, 'Q6PRE staff_set_both ' || count(*) FILTER (WHERE vat_rate IS NOT NULL AND vat_exemption_code IS NOT NULL) FROM s UNION ALL SELECT 11, 'Q6PRE audit_rows_q6 ' || count(*) FILTER (WHERE action = 'service.vat_default_q6') FROM a UNION ALL SELECT 12, 'Q6PRE audit_rows_q6_undone ' || count(*) FILTER (WHERE action = 'service.vat_default_q6_undone') FROM a UNION ALL SELECT 13, 'Q6PRE other_tenants_services_untouched ' || count(*) FROM public.services sv WHERE sv.tenant_id NOT IN (SELECT id FROM t) ) x ORDER BY k",
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
    "\\copy q6_list_raw (line) FROM pstdin",
    "DO $q6list$ DECLARE c_codes constant text[] := ARRAY['M01', 'M02', 'M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M19', 'M20', 'M21', 'M25', 'M26', 'M30', 'M31', 'M32', 'M33', 'M34', 'M35', 'M40', 'M41', 'M42', 'M43', 'M44', 'M45', 'M46', 'M99']",
    "v_tenants int",
    "v_tenant uuid",
    "v_def text",
    "v_header text",
    "v_rows int",
    "v_n int",
    "BEGIN SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT pg_get_constraintdef(k.oid) INTO v_def FROM pg_catalog.pg_constraint k WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_exemption_code_allowed'",
    "SELECT count(*) INTO v_n FROM regexp_matches(coalesce(v_def, ''), '''M[0-9]{2}''', 'g') m",
    "IF v_n <> cardinality(c_codes) THEN RAISE EXCEPTION 'Q6STOP: the CHECK of 0110 names % exemption codes and this file names %: the two lists differ', v_n, cardinality(c_codes)",
    "END IF",
    "SELECT count(*) INTO v_n FROM unnest(c_codes) c WHERE position('''' || c || '''' IN coalesce(v_def, '')) = 0",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % exemption codes of this file are not in the CHECK of 0110: the two lists differ', v_n",
    "END IF",
    "SELECT r.line INTO v_header FROM q6_list_raw r WHERE r.n = 1",
    "IF v_header IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code' THEN RAISE EXCEPTION 'Q6STOP: the first line of the list is not the header service_id,vat_rate,vat_exemption_code'",
    "END IF",
    "SELECT count(*) INTO v_rows FROM q6_list_raw r WHERE r.n > 1",
    "IF v_rows = 0 THEN RAISE EXCEPTION 'Q6STOP: the list holds no row under its header'",
    "END IF",
    "IF v_rows > 60 THEN RAISE EXCEPTION 'Q6STOP: the list holds % rows, more than the ceiling of 60', v_rows",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},[0-9]+,[A-Z0-9]*$')",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list are malformed: each row is a lower-case service id, a rate and a code or nothing, joined by two commas', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 2) NOT IN ('0', '6', '13', '23')",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry a rate other than 0, 6, 13 or 23', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 2) = '0' AND split_part(r.line, ',', 3) = ''",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry the rate 0 and no exemption code: a rate of 0 requires one', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 2) <> '0' AND split_part(r.line, ',', 3) <> ''",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry an exemption code with a rate above 0: a code is valid at 0 only (B10)', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 3) <> '' AND NOT (split_part(r.line, ',', 3) = ANY (c_codes))",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry an exemption code that is not one of the 33 codes', v_n",
    "END IF",
    "SELECT count(*) - count(DISTINCT split_part(r.line, ',', 1)) INTO v_n FROM q6_list_raw r WHERE r.n > 1",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: the list repeats a service id: % rows more than distinct ids', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = split_part(r.line, ',', 1)::uuid AND s.tenant_id = v_tenant)",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % service ids of the list are not appointment types of the tenant osteojp', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL AND NOT EXISTS (SELECT 1 FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 1) = s.id::text)",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % appointment types of the tenant with both VAT fields empty are missing from the list: every one must be listed', v_n",
    "END IF",
    "END $q6list$",
    "WITH t AS ( SELECT id FROM public.tenants WHERE slug = 'osteojp' ), l AS ( SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1 ), j AS ( SELECT l.vat_rate, l.vat_exemption_code, (sv.vat_rate IS NULL AND sv.vat_exemption_code IS NULL) AS target, (sv.vat_rate IS DISTINCT FROM l.vat_rate OR sv.vat_exemption_code IS DISTINCT FROM l.vat_exemption_code) AS differs FROM l JOIN public.services sv ON sv.id = l.id JOIN t ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6PRE list_rows ' || count(*) AS line FROM j UNION ALL SELECT 2, 'Q6PRE list_to_write ' || count(*) FILTER (WHERE target) FROM j UNION ALL SELECT 3, 'Q6PRE list_skipped_staff_set ' || count(*) FILTER (WHERE NOT target) FROM j UNION ALL SELECT 4, 'Q6PRE list_disagrees_staff_set ' || count(*) FILTER (WHERE NOT target AND differs) FROM j UNION ALL SELECT 5, 'Q6PRE write_rate_0_with_code ' || count(*) FILTER (WHERE target AND vat_rate = 0) FROM j UNION ALL SELECT 6, 'Q6PRE write_rate_6 ' || count(*) FILTER (WHERE target AND vat_rate = 6) FROM j UNION ALL SELECT 7, 'Q6PRE write_rate_13 ' || count(*) FILTER (WHERE target AND vat_rate = 13) FROM j UNION ALL SELECT 8, 'Q6PRE write_rate_23 ' || count(*) FILTER (WHERE target AND vat_rate = 23) FROM j UNION ALL SELECT 9, 'Q6PRE write_code_m07 ' || count(*) FILTER (WHERE target AND vat_exemption_code = 'M07') FROM j UNION ALL SELECT 10, 'Q6PRE write_code_other ' || count(*) FILTER (WHERE target AND vat_exemption_code <> 'M07') FROM j ) x ORDER BY k",
    "SELECT 'Q6PRE PASS target ' || count(*) || ' ids_md5 ' || md5(coalesce(string_agg(s.id::text, ',' ORDER BY s.id), '')) || ' list_md5 ' || (SELECT md5(coalesce(string_agg(r.line, E'\\n' ORDER BY r.n), '')) FROM q6_list_raw r) FROM public.services s JOIN public.tenants t ON t.id = s.tenant_id WHERE t.slug = 'osteojp' AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
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
    "\\if :{?list_md5}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v list_md5 is missing. THE PRE-CHECK prints it; this file refuses to guess.'",
    "END $missing$",
    "\\endif",
    "\\if :{?disagree}",
    "\\else",
    "DO $missing$ BEGIN RAISE EXCEPTION 'Q6STOP: -v disagree is missing. THE PRE-CHECK carries it; this file refuses to guess.'",
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
    "SELECT 'Q6WRITE carries ' || length(set_config('q6.expect', :'expect', true)) || ' ' || length(set_config('q6.target_md5', :'target_md5', true)) || ' ' || length(set_config('q6.list_md5', :'list_md5', true)) || ' ' || length(set_config('q6.disagree', :'disagree', true))",
    "LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE",
    "CREATE TEMP TABLE q6_list_raw (n bigint GENERATED ALWAYS AS IDENTITY, line text) ON COMMIT DROP",
    "\\copy q6_list_raw (line) FROM pstdin",
    "CREATE TEMP TABLE q6_written (id uuid PRIMARY KEY, vat_rate smallint NOT NULL, vat_exemption_code text) ON COMMIT DROP",
    "DO $q6list$ DECLARE c_codes constant text[] := ARRAY['M01', 'M02', 'M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M19', 'M20', 'M21', 'M25', 'M26', 'M30', 'M31', 'M32', 'M33', 'M34', 'M35', 'M40', 'M41', 'M42', 'M43', 'M44', 'M45', 'M46', 'M99']",
    "v_tenants int",
    "v_tenant uuid",
    "v_def text",
    "v_header text",
    "v_rows int",
    "v_n int",
    "BEGIN SELECT count(*) INTO v_tenants FROM public.tenants WHERE slug = 'osteojp'",
    "IF v_tenants <> 1 THEN RAISE EXCEPTION 'Q6STOP: the slug osteojp names % tenants, not exactly 1', v_tenants",
    "END IF",
    "SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'osteojp'",
    "SELECT pg_get_constraintdef(k.oid) INTO v_def FROM pg_catalog.pg_constraint k WHERE k.conrelid = 'public.services'::regclass AND k.contype = 'c' AND k.conname = 'services_vat_exemption_code_allowed'",
    "SELECT count(*) INTO v_n FROM regexp_matches(coalesce(v_def, ''), '''M[0-9]{2}''', 'g') m",
    "IF v_n <> cardinality(c_codes) THEN RAISE EXCEPTION 'Q6STOP: the CHECK of 0110 names % exemption codes and this file names %: the two lists differ', v_n, cardinality(c_codes)",
    "END IF",
    "SELECT count(*) INTO v_n FROM unnest(c_codes) c WHERE position('''' || c || '''' IN coalesce(v_def, '')) = 0",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % exemption codes of this file are not in the CHECK of 0110: the two lists differ', v_n",
    "END IF",
    "SELECT r.line INTO v_header FROM q6_list_raw r WHERE r.n = 1",
    "IF v_header IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code' THEN RAISE EXCEPTION 'Q6STOP: the first line of the list is not the header service_id,vat_rate,vat_exemption_code'",
    "END IF",
    "SELECT count(*) INTO v_rows FROM q6_list_raw r WHERE r.n > 1",
    "IF v_rows = 0 THEN RAISE EXCEPTION 'Q6STOP: the list holds no row under its header'",
    "END IF",
    "IF v_rows > 60 THEN RAISE EXCEPTION 'Q6STOP: the list holds % rows, more than the ceiling of 60', v_rows",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},[0-9]+,[A-Z0-9]*$')",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list are malformed: each row is a lower-case service id, a rate and a code or nothing, joined by two commas', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 2) NOT IN ('0', '6', '13', '23')",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry a rate other than 0, 6, 13 or 23', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 2) = '0' AND split_part(r.line, ',', 3) = ''",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry the rate 0 and no exemption code: a rate of 0 requires one', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 2) <> '0' AND split_part(r.line, ',', 3) <> ''",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry an exemption code with a rate above 0: a code is valid at 0 only (B10)', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 3) <> '' AND NOT (split_part(r.line, ',', 3) = ANY (c_codes))",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % rows of the list carry an exemption code that is not one of the 33 codes', v_n",
    "END IF",
    "SELECT count(*) - count(DISTINCT split_part(r.line, ',', 1)) INTO v_n FROM q6_list_raw r WHERE r.n > 1",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: the list repeats a service id: % rows more than distinct ids', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = split_part(r.line, ',', 1)::uuid AND s.tenant_id = v_tenant)",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % service ids of the list are not appointment types of the tenant osteojp', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL AND NOT EXISTS (SELECT 1 FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 1) = s.id::text)",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % appointment types of the tenant with both VAT fields empty are missing from the list: every one must be listed', v_n",
    "END IF",
    "END $q6list$",
    "DO $q6write$ DECLARE c_action constant text := 'service.vat_default_q6'",
    "s_expect text := current_setting('q6.expect')",
    "s_md5 text := current_setting('q6.target_md5')",
    "s_list text := current_setting('q6.list_md5')",
    "s_dis text := current_setting('q6.disagree')",
    "v_list text",
    "v_dis int",
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
    "IF s_list !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'Q6STOP: -v list_md5 must be 32 lower-case hex characters'",
    "END IF",
    "IF s_dis !~ '^(0|[1-9][0-9]?)$' THEN RAISE EXCEPTION 'Q6STOP: -v disagree must be a whole number from 0 to 99; received %', s_dis",
    "END IF",
    "SELECT md5(coalesce(string_agg(r.line, E'\\n' ORDER BY r.n), '')) INTO v_list FROM q6_list_raw r",
    "IF v_list <> s_list THEN RAISE EXCEPTION 'Q6STOP: the list loaded now is not the list THE PRE-CHECK loaded. Paste THE PRE-CHECK again'",
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
    "SELECT count(*) INTO v_dis FROM public.services s JOIN (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l ON l.id = s.id WHERE s.tenant_id = v_tenant AND NOT (s.vat_rate IS NULL AND s.vat_exemption_code IS NULL) AND (s.vat_rate IS DISTINCT FROM l.vat_rate OR s.vat_exemption_code IS DISTINCT FROM l.vat_exemption_code)",
    "IF v_dis <> s_dis::int THEN RAISE EXCEPTION 'Q6STOP: % listed types staff set now differ from the list, and THE PRE-CHECK carried %: the table moved. The lead rules', v_dis, s_dis",
    "END IF",
    "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), '')) INTO v_other_b FROM public.services s WHERE NOT (s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL)",
    "SELECT md5(coalesce(string_agg((to_jsonb(s) - 'vat_rate' - 'vat_exemption_code')::text, '|' ORDER BY s.id), '')) INTO v_rest_b FROM public.services s WHERE s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL",
    "WITH u AS ( UPDATE public.services s SET vat_rate = l.vat_rate, vat_exemption_code = l.vat_exemption_code FROM (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l WHERE s.id = l.id AND s.tenant_id = v_tenant AND s.vat_rate IS NULL AND s.vat_exemption_code IS NULL RETURNING s.id, s.vat_rate, s.vat_exemption_code ) INSERT INTO q6_written (id, vat_rate, vat_exemption_code) SELECT u.id, u.vat_rate, u.vat_exemption_code FROM u",
    "GET DIAGNOSTICS v_upd = ROW_COUNT",
    "IF v_upd <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the UPDATE wrote % rows, expected exactly %', v_upd, v_expect",
    "END IF",
    "INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) SELECT v_tenant, NULL, c_action, 'service', w.id, jsonb_build_object( 'card', 'Q6', 'source', 'psql_data_op', 'ruling', 'strategy-q6-2026-11-05', 'vat_rate_before', NULL, 'vat_exemption_code_before', NULL, 'vat_rate_after', w.vat_rate, 'vat_exemption_code_after', w.vat_exemption_code) FROM q6_written w",
    "GET DIAGNOSTICS v_aud = ROW_COUNT",
    "IF v_aud <> v_expect THEN RAISE EXCEPTION 'Q6STOP: wrote % audit rows, expected exactly %', v_aud, v_expect",
    "END IF",
    "SELECT count(*) INTO v_ok FROM public.services s JOIN q6_written w ON w.id = s.id JOIN (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l ON l.id = s.id WHERE s.tenant_id = v_tenant AND s.vat_rate = l.vat_rate AND s.vat_exemption_code IS NOT DISTINCT FROM l.vat_exemption_code",
    "IF v_ok <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % written rows equal their list row, expected exactly %', v_ok, v_expect",
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
    "\\copy q6_list_raw (line) FROM pstdin",
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
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE (r.n = 1 AND r.line IS DISTINCT FROM 'service_id,vat_rate,vat_exemption_code') OR (r.n > 1 AND (r.line IS NULL OR r.line !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},(0|6|13|23),[A-Z0-9]*$'))",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % lines of the list do not read as the list THE WRITE read', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM q6_list_raw r WHERE r.n > 1 AND split_part(r.line, ',', 1)::uuid = ANY (v_ids)",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services are in the list', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s JOIN (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l ON l.id = s.id WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = l.vat_rate AND s.vat_exemption_code IS NOT DISTINCT FROM l.vat_exemption_code",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services equal their list row in the tenant', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6'",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the tenant holds % audit rows of this op, expected exactly %', v_n, v_expect",
    "END IF",
    "SELECT count(DISTINCT al.entity_id) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids)",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services have their audit row', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log al JOIN (SELECT split_part(r.line, ',', 1)::uuid AS id, split_part(r.line, ',', 2)::smallint AS vat_rate, nullif(split_part(r.line, ',', 3), '') AS vat_exemption_code FROM q6_list_raw r WHERE r.n > 1) l ON l.id = al.entity_id WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6' AND al.entity_type = 'service' AND al.entity_id = ANY (v_ids) AND al.metadata -> 'vat_rate_before' = 'null'::jsonb AND al.metadata -> 'vat_exemption_code_before' = 'null'::jsonb AND al.metadata -> 'vat_rate_after' = to_jsonb(l.vat_rate) AND al.metadata -> 'vat_exemption_code_after' = coalesce(to_jsonb(l.vat_exemption_code), 'null'::jsonb)",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % audit rows of this op record empty before values and their list row as after values', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log al WHERE al.tenant_id = v_tenant AND al.action = 'service.vat_default_q6_undone'",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % undo audit rows exist: the op was rolled back', v_n",
    "END IF",
    "END $q6post$",
    "WITH t AS ( SELECT id FROM public.tenants WHERE slug = 'osteojp' ), s AS ( SELECT sv.is_active, sv.vat_rate, sv.vat_exemption_code FROM public.services sv JOIN t ON t.id = sv.tenant_id ) SELECT line FROM ( SELECT 1 AS k, 'Q6POST services_total ' || count(*) AS line FROM s UNION ALL SELECT 2, 'Q6POST vat_rate_0_with_code ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code IS NOT NULL) FROM s UNION ALL SELECT 3, 'Q6POST vat_rate_above_0 ' || count(*) FILTER (WHERE vat_rate > 0) FROM s UNION ALL SELECT 4, 'Q6POST code_m07 ' || count(*) FILTER (WHERE vat_exemption_code = 'M07') FROM s UNION ALL SELECT 5, 'Q6POST target_left_now ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 6, 'Q6POST rate_0_without_code ' || count(*) FILTER (WHERE vat_rate = 0 AND vat_exemption_code IS NULL) FROM s UNION ALL SELECT 7, 'Q6POST code_without_rate ' || count(*) FILTER (WHERE vat_rate IS NULL AND vat_exemption_code IS NOT NULL) FROM s ) x ORDER BY k",
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
    "SELECT count(*) INTO v_n FROM public.audit_log mine WHERE mine.tenant_id = v_tenant AND mine.action = 'service.vat_default_q6' AND mine.entity_type = 'service' AND mine.entity_id = ANY (v_ids) AND mine.metadata -> 'vat_rate_before' = 'null'::jsonb AND mine.metadata -> 'vat_exemption_code_before' = 'null'::jsonb",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % audit rows of THE WRITE record two empty before values. Nothing is written; the lead rules', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s JOIN public.audit_log mine ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after')",
    "IF v_n <> v_expect THEN RAISE EXCEPTION 'Q6STOP: % of the % recorded services still read the values THE WRITE recorded: staff changed the others since THE WRITE. Nothing is written; the lead rules', v_n, v_expect",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.audit_log later JOIN public.audit_log mine ON mine.tenant_id = later.tenant_id AND mine.entity_id = later.entity_id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE later.tenant_id = v_tenant AND later.entity_type = 'service' AND later.entity_id = ANY (v_ids) AND later.action LIKE 'service.%' AND later.action <> 'service.vat_default_q6' AND later.created_at > mine.created_at - interval '10 minutes'",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % service audit rows of another action sit on the recorded services from 10 minutes before THE WRITE on: staff may have re-saved them. Nothing is written; the lead rules', v_n",
    "END IF",
    "SELECT count(*) INTO v_n FROM public.services s JOIN public.audit_log mine ON mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' WHERE s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.updated_at > mine.created_at",
    "IF v_n <> 0 THEN RAISE EXCEPTION 'Q6STOP: % recorded services were updated after THE WRITE: staff may have re-saved them. Nothing is written; the lead rules', v_n",
    "END IF",
    "SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), '')) INTO v_other_b FROM public.services s WHERE NOT (s.id = ANY (v_ids))",
    "UPDATE public.services s SET vat_rate = (mine.metadata ->> 'vat_rate_before')::smallint, vat_exemption_code = (mine.metadata ->> 'vat_exemption_code_before') FROM public.audit_log mine WHERE mine.tenant_id = s.tenant_id AND mine.entity_id = s.id AND mine.entity_type = 'service' AND mine.action = 'service.vat_default_q6' AND s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine.metadata ->> 'vat_rate_after')::smallint AND s.vat_exemption_code IS NOT DISTINCT FROM (mine.metadata ->> 'vat_exemption_code_after')",
    "GET DIAGNOSTICS v_upd = ROW_COUNT",
    "IF v_upd <> v_expect THEN RAISE EXCEPTION 'Q6STOP: the UPDATE reset % rows, expected exactly %', v_upd, v_expect",
    "END IF",
    "INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) SELECT v_tenant, NULL, c_action, 'service', mine.entity_id, jsonb_build_object( 'card', 'Q6', 'source', 'psql_data_op', 'ruling', 'lead-word-rollback', 'vat_rate_before', mine.metadata -> 'vat_rate_after', 'vat_exemption_code_before', mine.metadata -> 'vat_exemption_code_after', 'vat_rate_after', mine.metadata -> 'vat_rate_before', 'vat_exemption_code_after', mine.metadata -> 'vat_exemption_code_before') FROM public.audit_log mine WHERE mine.tenant_id = v_tenant AND mine.action = 'service.vat_default_q6' AND mine.entity_type = 'service' AND mine.entity_id = ANY (v_ids)",
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

/** Each refusal of the list (D19), by the STOP text the document names for it. */
const LIST_REFUSALS = [
  ["the CHECK of 0110 names fewer or more codes", "IF v_n <> cardinality(c_codes) => Q6STOP: the CHECK of 0110 names % exemption codes and this file names %: the two lists differ"],
  ["a code of the copy is not in the CHECK", "IF v_n <> 0 => Q6STOP: % exemption codes of this file are not in the CHECK of 0110: the two lists differ"],
  ["the header", `IF v_header IS DISTINCT FROM '${LIST_HEADER}' => Q6STOP: the first line of the list is not the header ${LIST_HEADER}`],
  ["no row", "IF v_rows = 0 => Q6STOP: the list holds no row under its header"],
  ["more than 60 rows", "IF v_rows > 60 => Q6STOP: the list holds % rows, more than the ceiling of 60"],
  ["a malformed row", "IF v_n <> 0 => Q6STOP: % rows of the list are malformed: each row is a lower-case service id, a rate and a code or nothing, joined by two commas"],
  ["a rate outside 0, 6, 13, 23", "IF v_n <> 0 => Q6STOP: % rows of the list carry a rate other than 0, 6, 13 or 23"],
  ["a code missing at 0", "IF v_n <> 0 => Q6STOP: % rows of the list carry the rate 0 and no exemption code: a rate of 0 requires one"],
  ["a code with a rate above 0 (B10)", "IF v_n <> 0 => Q6STOP: % rows of the list carry an exemption code with a rate above 0: a code is valid at 0 only (B10)"],
  ["a code not in the 33", "IF v_n <> 0 => Q6STOP: % rows of the list carry an exemption code that is not one of the 33 codes"],
  ["a key listed twice", "IF v_n <> 0 => Q6STOP: the list repeats a service id: % rows more than distinct ids"],
  ["a key that is not a service of the tenant", "IF v_n <> 0 => Q6STOP: % service ids of the list are not appointment types of the tenant osteojp"],
  ["a target type missing from the list", "IF v_n <> 0 => Q6STOP: % appointment types of the tenant with both VAT fields empty are missing from the list: every one must be listed"],
];

test("every refusal of the list is in the pre-check and the write, in one DO block byte-identical in both, before any write", () => {
  const listBlock = (t) => (t.match(/\nDO \$q6list\$\n[\s\S]*?\n\$q6list\$;\n/) || [])[0];
  assert.ok(listBlock(sql.pre), "the pre-check has no DO $q6list$ block");
  assert.equal(listBlock(sql.write), listBlock(sql.pre), "the write's list validation is not byte-identical to the pre-check's");
  const inBlock = sqlGuards(listBlock(sql.pre));
  for (const [label, g] of LIST_REFUSALS) {
    assert.ok(inBlock.includes(g), `the list refusal is missing (${label}): ${g}`);
    assert.ok(EXPECTED_GUARDS.pre.includes(g) && EXPECTED_GUARDS.write.includes(g), `the list refusal is not in both files (${label})`);
  }
  assert.equal(inBlock.length, LIST_REFUSALS.length + 1, "the list block holds a refusal this test does not name");
  for (const k of ["pre", "write", "post"]) {
    assert.equal(sql[k].split("\n").filter((l) => l === COPY_LINE).length, 1, `${k}: not exactly one ${COPY_LINE}`);
  }
  assert.ok(!sql.undo.includes("q6_list_raw") && !sql.readout.includes("q6_list_raw"), "the rollback or the read-out reads the list");
  assert.ok(sql.write.indexOf(COPY_LINE) < sql.write.indexOf("DO $q6list$") && sql.write.indexOf("$q6list$;") < sql.write.indexOf("DO $q6write$"), "the write does not load and validate the list before its write block");
  assert.ok(sql.pre.indexOf(COPY_LINE) < sql.pre.indexOf("DO $q6list$") && sql.pre.indexOf("$q6list$;") < sql.pre.indexOf("'Q6PRE PASS target '"), "the pre-check does not validate the list before its PASS line");
  assert.match(sql.write, /CREATE TEMP TABLE q6_list_raw \(n bigint GENERATED ALWAYS AS IDENTITY, line text\) ON COMMIT DROP;\n\\copy q6_list_raw \(line\) FROM pstdin\n/);
  assert.ok(EXPECTED_STATEMENTS.pre.at(-1).includes("|| ' list_md5 ' || (SELECT md5(coalesce(string_agg(r.line, E'\\n' ORDER BY r.n), '')) FROM q6_list_raw r)"), "the pre-check's PASS line does not carry the md5 of the loaded lines");
  assert.ok(EXPECTED_GUARDS.pre.every((g) => !g.includes("list_disagrees")) && sql.pre.includes("'Q6PRE list_disagrees_staff_set ' || count(*) FILTER (WHERE NOT target AND differs) FROM j"), "the pre-check does not count listed types staff set with other values");
  assert.ok(sql.post.indexOf(COPY_LINE) < sql.post.indexOf("DO $q6post$"), "the post-check does not load the list before it checks it");
});

test("the 33 exemption codes the SQL carries are the application's 33 and 0110's", () => {
  assert.equal(new Set(CODES33).size, 33);
  for (const k of ["pre", "write"]) {
    const m = sql[k].match(CODES_LINE);
    assert.ok(m, `${k} carries no c_codes array`);
    assert.deepEqual([...m[0].matchAll(/'(M[0-9]{2})'/g)].map((x) => x[1]), CODES33, `${k}: the codes are not the pinned 33`);
  }
  // From disk once #1704 has merged, else from #1704's branch. Either source missing is a FAILURE:
  // the comparison is never skipped (R4 on the rework, MINOR 4).
  const fromRef = (path) => {
    const r = spawnSync("git", ["show", `${SRC1704}:${path}`], { cwd: ROOT, encoding: "utf8" });
    return r.status === 0 ? { text: r.stdout, from: `${SRC1704}:${path}` } : null;
  };
  const appPath = "packages/db/src/service-type-fields.ts";
  const app = existsSync(join(ROOT, appPath)) ? { text: readFileSync(join(ROOT, appPath), "utf8"), from: appPath } : fromRef(appPath);
  const migDisk = [join(ROOT, "packages/db/migrations-pending"), join(ROOT, "packages/db/migrations")]
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((n) => /services_booking_type_fields\.sql$/.test(n)).map((n) => join(d, n)));
  const mig = migDisk.length === 1 ? { text: readFileSync(migDisk[0], "utf8"), from: migDisk[0] } : migDisk.length === 0 ? fromRef("packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql") : null;
  assert.ok(app, `the application's code list could not be read, from disk or from ${SRC1704} (git fetch origin db/RODICA-services-vat-colour)`);
  assert.ok(mig, `0110 could not be read (exactly one file), from disk or from ${SRC1704}`);
  assert.deepEqual([...app.text.matchAll(/\{ code: "(M[0-9]{2})"/g)].map((x) => x[1]), CODES33, `${app.from}: VAT_EXEMPTION_CODES differ from the 33 this op carries`);
  const c = mig.text.match(/services_vat_exemption_code_allowed CHECK \(([\s\S]*?)\n  \)/);
  assert.ok(c, `${mig.from}: no services_vat_exemption_code_allowed CHECK`);
  assert.deepEqual([...c[1].matchAll(/'(M[0-9]{2})'/g)].map((x) => x[1]), CODES33, `${mig.from}: 0110's CHECK differs from the 33 this op carries`);
});

test("the write has the shape the document claims: each row's list values, no single value for all", () => {
  assert.deepEqual(writeFindings(sql.write), []);
});

test("the rollback has the shape the document claims: keyed on the ids, the audit rows' before values", () => {
  assert.deepEqual(undoFindings(sql.undo), []);
});

test("the reads write nothing and print only their own lines", () => {
  assert.deepEqual(readFindings(sql.pre, "Q6PRE"), []);
  assert.deepEqual(readFindings(sql.post, "Q6POST"), []);
  assert.deepEqual(readoutFindings(sql.readout), []);
  for (const k of ["pre", "post", "readout"]) assert.match(sql[k], /current_setting\('transaction_read_only'\)/);
});

test("no SQL file names a uuid or a person's column, only the read-out names a type's name, and the tenant is found by slug", () => {
  for (const [k, s] of Object.entries(sql)) {
    const c = stripComments(s);
    assert.doesNotMatch(c, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, `${k} names a uuid`);
    assert.doesNotMatch(c, /\b(full_name|email|phone|nif|date_of_birth|price_cents|description)\b/i, `${k} names a column it must not read`);
    if (k === "readout") {
      assert.deepEqual([...new Set([...c.matchAll(/\b[a-z]+\.name\b/gi)].map((m) => m[0]))], ["sv.name"], "the read-out names a name other than the type's");
    } else {
      assert.doesNotMatch(c, /\b[a-z]+\.name\b/i, `${k} names a name`);
    }
    assert.match(c, /slug = 'osteojp'/, `${k} does not find the tenant by slug`);
  }
});

test("each shape rule catches its own seeded fault", () => {
  const w = sql.write;
  const u = sql.undo;
  const setLine = "       SET vat_rate = l.vat_rate, vat_exemption_code = l.vat_exemption_code\n";
  const listBlock = w.match(/\nDO \$q6list\$\n[\s\S]*?\n\$q6list\$;\n/)[0];
  const mutants = [
    ["write", "a wider predicate", w.replace(`     ${WRITE_WHERE}\n`, `     ${WRITE_WHERE.replace(" AND s.vat_exemption_code IS NULL", "")}\n`), /the UPDATE's predicate/],
    ["write", "another tenant's rows", w.replace(`     ${WRITE_WHERE}\n`, `     ${WRITE_WHERE.replace(" AND s.tenant_id = v_tenant", "")}\n`), /the UPDATE's predicate/],
    ["write", "a listed row staff already set is overwritten", w.replace(`     ${WRITE_WHERE}\n`, "     WHERE s.id = l.id AND s.tenant_id = v_tenant\n"), /the UPDATE's predicate/],
    ["write", "one value for all", w.replace(setLine, "       SET vat_rate = 0, vat_exemption_code = 'M07'\n"), /single value for all/],
    ["write", "the list not read", w.replace(`      FROM ${LIST_PARSE}\n`, "      FROM q6_written l\n"), /does not read the list/],
    ["write", "the list validated after the write", w.replace(listBlock, "\n").replace("\n$q6write$;\n", `\n$q6write$;\n${listBlock}`), /not in order/],
    ["write", "the list not loaded", w.replace(`${COPY_LINE}\n`, ""), /not before the COMMIT: \\copy|not in order/],
    ["write", "the count check dropped", w.replace("IF v_upd <> v_expect THEN", "IF false THEN"), /not before the COMMIT: IF v_upd/],
    ["write", "the list check dropped", w.replace("IF v_ok <> v_expect THEN", "IF false THEN"), /not before the COMMIT: IF v_ok/],
    ["write", "the disagreement recount dropped", w.replace("IF v_dis <> s_dis::int THEN", "IF false THEN"), /disagreement count is not counted again/],
    ["write", "the list md5 check dropped", w.replace("IF v_list <> s_list THEN", "IF false THEN"), /md5 of the loaded list is not compared/],
    ["write", "the ids recorded after the COMMIT", w.replace("\\o :idsfile\nSELECT w.id FROM q6_written w ORDER BY w.id;\n\\o\n", "").replace("COMMIT;\n", "COMMIT;\n\\o :idsfile\nSELECT w.id FROM q6_written w ORDER BY w.id;\n\\o\n"), /not before the COMMIT: \\o :idsfile/],
    ["write", "no statement timeout", w.replace("SET LOCAL statement_timeout = '60s';\n", ""), /does not open with BEGIN/],
    ["write", "a second UPDATE", w.replace("COMMIT;\n", "UPDATE public.services SET color = NULL;\nCOMMIT;\n"), /2 UPDATE statements/],
    ["write", "no lock", w.replace("LOCK TABLE public.services IN SHARE ROW EXCLUSIVE MODE;", ""), /no SHARE ROW EXCLUSIVE lock/],
    ["write", "the audit records a constant", w.replace("'vat_rate_after', w.vat_rate,", "'vat_rate_after', 0,"), /after values are not the written row's/],
    ["undo", "a broad rollback", u.replace(" AND s.id = ANY (v_ids) AND s.tenant_id = v_tenant AND s.vat_rate = (mine", " AND s.tenant_id = v_tenant AND s.vat_rate = (mine"), /not keyed on the recorded ids/],
    ["undo", "a constant restored", u.replace(UNDO_SET, "vat_rate = NULL, vat_exemption_code = NULL"), /does not restore the audit rows' before values/],
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
  const rp = sql.readout.replace("JOIN public.tenants t ON t.id = sv.tenant_id\n   WHERE t.slug = 'osteojp'\n   ORDER BY", "JOIN public.tenants t ON t.id = sv.tenant_id JOIN public.patients p ON p.tenant_id = t.id\n   WHERE t.slug = 'osteojp'\n   ORDER BY");
  assert.notEqual(rp, sql.readout, "the read-out mutation did not apply");
  assert.ok(readoutFindings(rp).some((x) => /reads public\.patients/.test(x)), "a read-out reading patients is not caught");
  const ro = sql.readout.replace("\\o :outfile\n", "");
  assert.ok(readoutFindings(ro).some((x) => /between \\o :outfile and \\o/.test(x)), "a read-out printing its rows to the transcript is not caught");
});

/* ---- The blocks' shape. -------------------------------------------------------------------- */

const PENDING_OF = {
  readout: ["HELD", "DOCSHA"],
  pre: ["HELD", "DOCSHA", "RUNDAY", "MIGNIGHT", "Q6DAT", "LISTSHA", "DISAGREEOK"],
  undo: ["HELD", "DOCSHA", "RUNDAY"],
};

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
      assert.ok(psql[0].includes(` ${READ_TX} -f ${name === "pre" ? "${PRE}" : "${POST}"} -c "rollback" < \${SNAP} > `), `${name}: the read does not create its temporary table inside the transaction before it turns read only, or does not read the snapshot`);
    } else if (name === "readout") {
      assert.match(psql[0], /-v outfile=\$\{OUTF\} -c "begin read only" -c "set local statement_timeout = '60s'" -f \$\{READ\} -c "rollback" > \/tmp\/q6-readout\.out 2>&1 /, name);
    } else if (name === "write") {
      assert.match(psql[0], / -v list_md5=\$\{L\} -v disagree=\$\{D\} -v idsfile=\$\{IDS\} -f \$\{WRITE\} < \$\{SNAP\} > \$\{WOUT\} 2>&1 /, name);
    } else {
      assert.doesNotMatch(psql[0], /begin read only|read only|< \$\{(LIST|SNAP)\}/, name);
    }
    for (const l of lines) {
      if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `${name}: a halt that is not one STOP and exit 1: ${l}`);
      assert.doesNotMatch(l, /^(echo|printf)\b.*\$\{?DATABASE_URL/, `${name}: a line prints the connection string`);
    }
    assert.doesNotMatch(b, /\b(cat|head|tail|less|more)\b[^\n]*(write|undo)\.out/, `${name}: a line prints a write transcript`);
    for (const l of lines.filter((x) => /\$\{(LIST|SNAP|OUTF)\}/.test(x))) {
      assert.doesNotMatch(l, /\b(cat|head|tail|less|more)\b/, `${name}: a line prints the list or the read-out file: ${l}`);
      if (/\bsed\b/.test(l)) assert.match(l, /^HDR=\$\(sed -n 1p \$\{OUTF\}\) \|\| \{/, `${name}: a sed reads more than the header of the read-out file: ${l}`);
    }
    assert.doesNotMatch(b, /origin\/data\/|--prune/, `${name}: a block names the branch, which is deleted when the pull request merges`);
    if (name === "pre" || name === "undo" || name === "readout") {
      assert.ok(lines.includes(`PRREF=${PRREF}`), `${name}: the head is not resolved from ${PRREF}`);
      assert.ok(b.includes("git fetch origin ${PRREF} || {") && b.includes("TIP=$(git rev-parse FETCH_HEAD) || {"), `${name}: the head is not fetched explicitly and read from FETCH_HEAD`);
      assert.ok(b.includes('[ "${TIP}" = "${HELD}" ] || {'), `${name}: the fetched head is not pinned to HELD`);
      assert.match(doc, new RegExp(`#${PRREF.split("/")[2]}\\b`), "the document does not name the pull request its blocks fetch");
    } else {
      assert.doesNotMatch(b, /git fetch/, `${name}: a block after THE PRE-CHECK fetches a head`);
    }
    const pending = lines.filter((l) => /='PENDING/.test(l));
    assert.deepEqual(pending.map((l) => l.split("=")[0]), PENDING_OF[name] ?? [], name);
    assert.deepEqual(lines.slice(2, 2 + pending.length), pending, `${name}: the PENDING lines are not the first value lines`);
    for (const l of pending) assert.doesNotMatch(l.slice(l.indexOf("'") + 1, -1), /'/, `${name}: a PENDING value carries a quote`);
  }
});

test("the list's sha256 is checked before production is read, and again before THE WRITE and THE POST-CHECK", () => {
  const pre = BLOCKS.pre;
  const at = (s) => pre.indexOf(s);
  assert.ok(pre.includes(`\nLIST=${LIST_PATH}\nSNAP=${SNAP_PATH}\n`), "the pre-check does not name the list file and its snapshot");
  const lines = pre.split("\n");
  const lastPending = lines.findLastIndex((l) => /^echo "\$\{(HELD|DOCSHA|RUNDAY|MIGNIGHT|Q6DAT|LISTSHA|DISAGREEOK)\}" \| grep -qxE /.test(l));
  assert.match(lines[lastPending + 1], /^rm -f \/tmp\/q6-head\.sha \/tmp\/q6-night\.ok \/tmp\/q6-pre\.ok \/tmp\/q6-pre\.out \/tmp\/q6-target-a\.out \/tmp\/q6-list\.csv \|\| \{/, "the last sitting's records are not cleared by the first command after the PENDING checks");
  for (const s of ["umask 077 || {", "cp ${LIST} ${SNAP} || {", '[ -n "${PERM}" ] || {', "LS=$(shasum -a 256 ${SNAP} | cut -d' ' -f1) || {", '[ "${LS}" = "${LISTSHA}" ] || {', "echo \"${LISTSHA}\" | grep -qxE '[0-9a-f]{64}' || {", '[ "${BADC}" = 0 ] || {']) {
    assert.ok(at(s) > 0, `the pre-check lacks: ${s}`);
    for (const later of ["\ncd /Users/ivan/Projects/GitHub/osteojp-prod-apply", "\nSN=$(sntp", "\ngit fetch", "\nnode ${GUARD}", "\npsql "]) {
      assert.ok(at(s) < at(later), `the pre-check checks the list after ${later.trim()}`);
    }
  }
  assert.ok(pre.indexOf("cp ${LIST} ${SNAP} || {") < pre.indexOf("LS=$(shasum -a 256 ${SNAP}") && pre.indexOf("umask 077 || {") < pre.indexOf("cp ${LIST} ${SNAP}"), "the snapshot is not made private before it is hashed");
  assert.ok(pre.includes('echo "${N} ${M} ${LISTSHA} ${L} ${DIS}" > /tmp/q6-pre.ok || {'), "the pre-check does not carry the list's sha256, its md5 and the disagreement count");
  assert.ok(pre.includes('[ "${DC}" = 1 ] || {') && pre.includes('[ "${DIS}" = "${DISAGREEOK}" ] || {'), "the pre-check does not hold exactly one disagreement count equal to DISAGREEOK");
  assert.ok(pre.indexOf('[ "${DIS}" = "${DISAGREEOK}" ] || {') < pre.indexOf("> /tmp/q6-pre.ok"), "the disagreement count is checked after the carry is written");
  assert.ok(pre.includes('[ "${Q6DAT}" -lt "${RUNDAY}1200" ] || {'), "the pre-check does not hold Q6-D's time before 12:00 on RUNDAY");
  assert.ok(at('[ "${Q6DAT}" -lt "${RUNDAY}1200" ] || {') < at("\ncd /Users/ivan/Projects/GitHub/osteojp-prod-apply"), "Q6-D's time is checked after the worktree is entered");
  for (const name of ["write", "post"]) {
    const b = BLOCKS[name];
    assert.ok(b.includes(`\nSNAP=${SNAP_PATH}\n`) && !b.includes("\nLIST="), `${name} does not read the snapshot only`);
    assert.ok(b.includes("LSHA=$(echo \"${CARRY}\" | cut -d' ' -f3) || {"), `${name} does not read the list's sha256 from the carry`);
    assert.ok(b.includes('[ "${LS}" = "${LSHA}" ] || {'), `${name} does not compare the list with the carry`);
    assert.ok(b.indexOf('[ "${LS}" = "${LSHA}" ] || {') < b.indexOf("\npsql "), `${name} compares the list after psql`);
  }
  assert.doesNotMatch(BLOCKS.undo, /LIST|SNAP/, "the rollback names the list");
  assert.ok(BLOCKS.write.includes("L=$(echo \"${CARRY}\" | cut -d' ' -f4) || {"), "the write does not read the list md5 from the carry");
  assert.ok(BLOCKS.write.includes("D=$(echo \"${CARRY}\" | cut -d' ' -f5) || {"), "the write does not read the disagreement count from the carry");
});

/* ---- THE HARNESS. Nothing in it touches a real host, the secrets folder or a database. ------ */

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const STUBBED = ["git", "node", "psql", "sntp", "date", "grep", "awk", "cut", "sed", "shasum", "rm", "cat", "cp", "find", "mkdir", "tee", "touch"];
const FAKED = new Set(["git", "node", "psql", "sntp", "date"]);
const NOT_CALLED = {
  readout: ["sntp", "find", "touch", "cat", "cp"],
  pre: ["mkdir", "touch", "cat"],
  write: ["sntp", "sed", "touch", "cp"],
  post: ["sntp", "sed", "find", "mkdir", "touch", "rm", "cp"],
  undo: ["find", "mkdir", "cat", "cp"],
};
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const TIP = "1".repeat(40);
const MD5 = "0123456789abcdef0123456789abcdef";
const IDS = [
  "aaaaaaaa-0000-4000-8000-000000000001",
  "aaaaaaaa-0000-4000-8000-000000000002",
  "aaaaaaaa-0000-4000-8000-000000000003",
];
const LIST_TEXT = `${LIST_HEADER}\n${IDS[0]},0,M07\n${IDS[1]},23,\n${IDS[2]},0,M10\n`;
const LIST_SHA = sha256(LIST_TEXT);
const STAMP = "202611192130";
const LMD5 = "fedcba9876543210fedcba9876543210";

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
for a in "$@"; do case "$a" in *osteojp-secrets*|*osteojp-prod-apply*|*osteojp-handover*|/Users/ivan/*) unexpected "a real path";; esac; done
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
    prev=; f=; idsf=; outf=
    for a in "$@"; do if [ "$prev" = -f ]; then f="$a"; fi; case "$a" in idsfile=*) idsf="\${a#idsfile=}";; outfile=*) outf="\${a#outfile=}";; esac; prev="$a"; done
    case "$f" in
      *-0-readout.sql) kind=readout;; *-1-precheck.sql) kind=pre;; *-2-write.sql) kind=write;; *-3-postcheck.sql) kind=post;; *-4-rollback.sql) kind=undo;; *) unexpected "$@";;
    esac
    ${R("cat")} > "$d/stdin.$kind"
    printf '%s\\n' "$@" > "$d/args.$kind"
    if [ "$kind" = write ] && [ "\${HARNESS_IDS:-ok}" != none ]; then [ -n "$idsf" ] || unexpected "no idsfile"; ${R("cat")} "$HARNESS_FIX/ids.\${HARNESS_IDS:-ok}" > "$idsf"; fi
    if [ "$kind" = readout ] && [ "\${HARNESS_RFILE:-ok}" != none ]; then [ -n "$outf" ] || unexpected "no outfile"; ${R("cat")} "$HARNESS_FIX/rfile.\${HARNESS_RFILE:-ok}" > "$outf"; fi
    ${R("cat")} "$HARNESS_FIX/$kind.\${HARNESS_VARIANT:-ok}"; exit "\${HARNESS_PSQL_EXIT:-0}";;
esac
exec ${R(name)} "$@"
`;
}

const PRE_OK = [
  "Q6PRE read_only on", "Q6PRE tenant_slug_osteojp 1", "Q6PRE column_vat_rate smallint", "Q6PRE column_vat_exemption_code text",
  "Q6PRE constraint_vat_rate 1", "Q6PRE constraint_vat_exemption_code 1", "Q6PRE services_total 20", "Q6PRE services_active 17",
  "Q6PRE services_archived 3", "Q6PRE target_total 3", "Q6PRE target_active 2", "Q6PRE target_archived 1",
  "Q6PRE target_internal_only 1", "Q6PRE staff_set_rate_only 1", "Q6PRE staff_set_code_only 0", "Q6PRE staff_set_both 16",
  "Q6PRE audit_rows_q6 0", "Q6PRE audit_rows_q6_undone 0", "Q6PRE other_tenants_services_untouched 4",
  "Q6PRE list_rows 3", "Q6PRE list_to_write 3", "Q6PRE list_skipped_staff_set 0", "Q6PRE list_disagrees_staff_set 0", "Q6PRE write_rate_0_with_code 2",
  "Q6PRE write_rate_6 0", "Q6PRE write_rate_13 0", "Q6PRE write_rate_23 1", "Q6PRE write_code_m07 1", "Q6PRE write_code_other 1",
  `Q6PRE PASS target 3 ids_md5 ${MD5} list_md5 ${LMD5}`,
].join("\n");
const POST_OK = [
  "Q6POST read_only on", "Q6POST carries 110 1", "Q6POST services_total 20", "Q6POST vat_rate_0_with_code 2", "Q6POST vat_rate_above_0 17",
  "Q6POST code_m07 1", "Q6POST target_left_now 0", "Q6POST rate_0_without_code 0", "Q6POST code_without_rate 0",
  "Q6POST PASS written 3",
].join("\n");
const READOUT_OK = [
  "Q6READ read_only on", "Q6READ tenant_slug_osteojp 1", "Q6READ columns_of_0110 2", "Q6READ services_total 3", "Q6READ services_active 2",
  "Q6READ services_archived 1", "Q6READ services_internal_only 1", "Q6READ vat_both_empty 3", "Q6READ vat_any_set 0", "Q6READ PASS rows 3",
].join("\n");
const RFILE_HEADER = "service_id,name,status,internal_only,vat_rate_now,vat_exemption_code_now";
const RFILE_OK = [RFILE_HEADER, `${IDS[0]},Tipo A,active,no,,`, `${IDS[1]},"Tipo B, sessao",active,yes,,`, `${IDS[2]},Tipo C,archived,no,,`].join("\n");
const FIX = {
  "pre.ok": PRE_OK,
  "pre.notro": PRE_OK.replace("Q6PRE read_only on", "Q6PRE read_only off"),
  "pre.extra": `${PRE_OK}\nERROR:  something the read did not expect`,
  "pre.nopass": PRE_OK.replace(/\nQ6PRE PASS[^\n]*/, ""),
  "pre.twopass": `${PRE_OK}\nQ6PRE PASS target 3 ids_md5 ${MD5} list_md5 ${LMD5}`,
  "pre.dis": PRE_OK.replace("Q6PRE list_disagrees_staff_set 0", "Q6PRE list_disagrees_staff_set 2"),
  "pre.nodis": PRE_OK.replace("\nQ6PRE list_disagrees_staff_set 0", ""),
  "pre.twodis": PRE_OK.replace("Q6PRE list_disagrees_staff_set 0", "Q6PRE list_disagrees_staff_set 0\nQ6PRE list_disagrees_staff_set 0"),
  "pre.nolmd5": PRE_OK.replace(` list_md5 ${LMD5}`, ""),
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
  "readout.ok": READOUT_OK,
  "readout.notro": READOUT_OK.replace("Q6READ read_only on", "Q6READ read_only off"),
  "readout.extra": `${READOUT_OK}\nERROR:  something`,
  "readout.nopass": READOUT_OK.replace("\nQ6READ PASS rows 3", ""),
  "rfile.ok": RFILE_OK,
  "rfile.short": RFILE_OK.split("\n").slice(0, 3).join("\n"),
  "rfile.badhdr": RFILE_OK.replace(RFILE_HEADER, "id,name"),
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
  for (const p of [READ, PRE, WRITE, POST, UNDO, GUARD, PTM]) copyFileSync(join(ROOT, p), join(base, "apply", p));
  const text = withFirstLine(firstLine);
  writeFileSync(join(base, "apply", DOC), text);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(text)}  ${DOC}\n`);
  return { base, docsha: sha256(text) };
}

/** The block as GREEN pastes it: PENDING lines filled, real paths moved into the run. */
function localize(name, run, base, { docsha, envFile, fill = true, held = TIP, runday = "20261119", mignight = "20261110", q6dat = "202611181000", listsha = LIST_SHA, disagreeok = "0" } = {}) {
  let b = BLOCKS[name];
  if (fill) {
    b = b.replace(/^HELD='PENDING[^\n]*$/m, `HELD='${held}'`)
      .replace(/^DOCSHA='PENDING[^\n]*$/m, `DOCSHA='${docsha}'`)
      .replace(/^RUNDAY='PENDING[^\n]*$/m, `RUNDAY='${runday}'`)
      .replace(/^MIGNIGHT='PENDING[^\n]*$/m, `MIGNIGHT='${mignight}'`)
      .replace(/^Q6DAT='PENDING[^\n]*$/m, `Q6DAT='${q6dat}'`)
      .replace(/^LISTSHA='PENDING[^\n]*$/m, `LISTSHA='${listsha}'`)
      .replace(/^DISAGREEOK='PENDING[^\n]*$/m, `DISAGREEOK='${disagreeok}'`);
  }
  b = b.replaceAll(PROD_APPLY, join(base, "apply"))
    .replaceAll(PROD_ENV, envFile ?? join(base, "fake-prod.env"))
    .replaceAll(REC_DIR, join(run, "rec"))
    .replaceAll(HAND_DIR, join(run, "hand"))
    .replaceAll("/tmp/q6-", join(run, "tmp", "q6-"));
  const rest = b.replaceAll(join(run, "tmp", "q6-"), "").replaceAll(join(run, "rec"), "").replaceAll(join(run, "hand"), "").replaceAll(join(base, "apply"), "")
    .replaceAll(envFile ?? join(base, "fake-prod.env"), "");
  for (const bad of ["/tmp/q6", "osteojp-secrets", "osteojp-prod-apply", "osteojp-handover", "/Users/ivan"]) {
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
  const hand = join(run, "hand");
  if (name === "write" || name === "post") {
    if (!s.noHeadRecord) fresh(join(tmp, "q6-head.sha"), `${TIP}\n`);
    writeFileSync(join(run, "head"), `${s.head ?? TIP}\n`);
  } else {
    writeFileSync(join(run, "head"), `${"9".repeat(40)}\n`);
  }
  if (name === "pre" && !s.noList) fresh(join(hand, "q6-vat-list.csv"), s.listText ?? LIST_TEXT);
  if (name === "pre" && s.staleCarry) {
    for (const f of ["q6-head.sha", "q6-night.ok", "q6-pre.ok", "q6-pre.out", "q6-list.csv"]) fresh(join(tmp, f), "an earlier pass\n");
  }
  if ((name === "write" || name === "post") && !s.noList) {
    fresh(join(tmp, "q6-list.csv"), s.listChanged ? `${LIST_TEXT}${IDS[2].replace(/3$/, "4")},6,\n` : LIST_TEXT);
  }
  if (name === "write") {
    if (!s.noNight) fresh(join(tmp, "q6-night.ok"), "20261119 20261120\n");
    if (!s.noCarry) fresh(join(tmp, "q6-pre.ok"), `${s.carry ?? `3 ${MD5} ${LIST_SHA} ${LMD5} 0`}\n`, s.carryAge ?? 1);
  }
  if (name === "post" && !s.noCarry) fresh(join(tmp, "q6-pre.ok"), `3 ${MD5} ${LIST_SHA} ${LMD5} 0\n`, 45);
  if (name === "readout" && s.outExists) fresh(join(hand, `q6-service-types-${s.stamp ?? STAMP}.csv`), "an earlier read-out\n");
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
    q6dat: s.q6dat,
    listsha: s.listsha,
    disagreeok: s.disagreeok,
  });
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL, HARNESS_TIP: s.tip ?? TIP,
    HARNESS_STAMP: s.stamp ?? STAMP, HARNESS_DOW: s.dow ?? "4", HARNESS_ZONE: s.zone ?? "WET", HARNESS_NEXT: "20261120",
    HARNESS_SNTP: s.sntp ?? "", HARNESS_STRAY: s.stray ?? "", HARNESS_VARIANT: s.variant ?? "ok", HARNESS_IDS: s.ids ?? "ok",
    HARNESS_RFILE: s.rfile ?? "ok", HARNESS_PSQL_EXIT: String(s.psqlExit ?? 0), HARNESS_FAIL: s.fail ?? "",
  };
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").split("\n").filter(Boolean);
  const result = {
    ...r, calls, unexpected: readRun("unexpected"), idsAfter: readRun("rec/written-ids.txt"), undoneAfter: existsSync(join(run, "rec/undone.ok")),
    stdin: readRun(`stdin.${cfg.name}`), args: readRun(`args.${cfg.name}`).split("\n"),
    preOk: readRun("tmp/q6-pre.ok"),
    tmpLeft: existsSync(join(run, "tmp")) ? readdirSync(join(run, "tmp")).filter((f) => ["q6-head.sha", "q6-night.ok", "q6-pre.ok", "q6-list.csv"].includes(f)) : [],
    snapMode: existsSync(join(run, "tmp", "q6-list.csv")) ? (statSync(join(run, "tmp", "q6-list.csv")).mode & 0o777) : null,
    readoutFile: readRun(`hand/q6-service-types-${s.stamp ?? STAMP}.csv`),
  };
  rmSync(run, { recursive: true, force: true });
  return result;
}

function assertPass(name, r, label) {
  assert.equal(r.code, 0, `${label}: exit ${r.code}\n${r.out}`);
  assert.match(r.stdout, SUCCESS[name], `${label}: no success line\n${r.out}`);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/, label);
  assert.doesNotMatch(r.stdout, /^STOP:/m, label);
  assert.equal(r.unexpected, "", `${label}: an unexpected call\n${r.unexpected}`);
  assert.ok(!r.stdout.includes(IDS[0]) && !r.stdout.includes("Tipo A"), `${label}: an id or a name reached the screen`);
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

/** The scenarios each block must STOP on, beyond the call-by-call faults. The night is Thu 2026-11-19. */
const SCENARIOS = {
  readout: [
    ["the zone did not load", { zone: "UTC" }, /zone WET or WEST/],
    ["the output file exists", { outExists: true }, /already exists/],
    ["the held head moved", { tip: "2".repeat(40) }, /held head is not the commit/],
    ["the worktree is dirty", { stray: " M somefile" }, /not clean/],
    ["the dispatch names another document", { docsha: "c".repeat(64) }, /not the approved one/],
    ["the read is not read only", { variant: "notro" }, /READ ONLY/],
    ["the transcript holds another line", { variant: "extra" }, /not Q6READ count lines/],
    ["no PASS line", { variant: "nopass" }, /no PASS line/],
    ["no file written", { rfile: "none" }, /was not written/],
    ["a file whose lines are not the rows", { rfile: "short" }, /not a header and 3 rows/],
    ["a file whose first line is not the header", { rfile: "badhdr" }, /not its header/],
    ["the read refused", { psqlExit: 3 }, /refused or failed/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
  pre: [
    ["the clinic is open", { stamp: "202611191500" }, /inside clinic hours/],
    ["RUNDAY is the night 0110 was applied", { mignight: "20261119" }, /not a night after the night 0110 was applied/],
    ["RUNDAY is before the night 0110 was applied", { mignight: "20261120" }, /not a night after the night 0110 was applied/],
    ["MIGNIGHT left PENDING", { mignight: "PENDING" }, /MIGNIGHT is still PENDING/],
    ["no written confirmation: Q6DAT left PENDING, the night is skipped", { q6dat: "PENDING" }, /Q6DAT is still PENDING.*the night is skipped and nothing is written/],
    ["the confirmation reached the owner at 12:00 on RUNDAY", { q6dat: "202611191200" }, /not before 20261119 12:00 Lisbon: the night is skipped and nothing is written/],
    ["the confirmation reached the owner after RUNDAY", { q6dat: "202611201000" }, /not before 20261119 12:00 Lisbon: the night is skipped/],
    ["LISTSHA left PENDING", { listsha: "PENDING" }, /LISTSHA is still PENDING/],
    ["the list is not there", { noList: true }, /the list \S+ is not there/],
    ["the list is not the one the dispatch names", { listsha: "d".repeat(64) }, /the list is not the one the dispatch names/],
    ["a line \\. in the list, which would end the load early", { listText: LIST_TEXT.replace(`${IDS[1]},23,\n`, `${IDS[1]},23,\n\\.\n`), listsha: sha256(LIST_TEXT.replace(`${IDS[1]},23,\n`, `${IDS[1]},23,\n\\.\n`)) }, /1 lines of the list hold a backslash or a control character/],
    ["a tab in the list", { listText: LIST_TEXT.replace(`${IDS[1]},23,`, `${IDS[1]},23,\t`), listsha: sha256(LIST_TEXT.replace(`${IDS[1]},23,`, `${IDS[1]},23,\t`)) }, /1 lines of the list hold a backslash or a control character/],
    ["an earlier pass's carry, and the confirmation after RUNDAY", { staleCarry: true, q6dat: "202611201000" }, /not before 20261119 12:00 Lisbon/],
    ["an earlier pass's carry, and the confirmation at 12:00", { staleCarry: true, q6dat: "202611191200" }, /not before 20261119 12:00 Lisbon/],
    ["an earlier pass's carry, and RUNDAY not after 0110", { staleCarry: true, mignight: "20261119" }, /not a night after the night 0110 was applied/],
    ["no list_disagrees_staff_set line", { variant: "nodis" }, /no list_disagrees_staff_set line/],
    ["two list_disagrees_staff_set lines", { variant: "twodis" }, /2 list_disagrees_staff_set lines, not exactly one/],
    ["DISAGREEOK left PENDING", { disagreeok: "PENDING" }, /DISAGREEOK is still PENDING/],
    ["2 listed types staff set disagree, and the dispatch accepts 0", { variant: "dis" }, /list_disagrees_staff_set is 2, and the dispatch accepts 0\. A non-zero count needs the lead's written ruling naming that count before the dispatch is filled/],
    ["none disagree, and the dispatch accepts 2", { disagreeok: "2", afterPsql: true }, /list_disagrees_staff_set is 0, and the dispatch accepts 2/],
    ["a PASS line without the list md5", { variant: "nolmd5" }, /no PASS line/],
    ["Sunday, closed, but not the named night", { stamp: "202611151000", dow: "7" }, /outside the window/],
    ["the night after the window", { stamp: "202611200700", dow: "5" }, /outside the window/],
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
    ["the clinic is open", { stamp: "202611191500" }, /inside clinic hours/],
    ["outside the recorded night", { stamp: "202611210100", dow: "6" }, /outside the night/],
    ["07:00 the morning after RUNDAY, past the 06:29 limit", { stamp: "202611200700", dow: "5" }, /outside the night/],
    ["the zone did not load", { zone: "UTC" }, /zone WET or WEST/],
    ["no head recorded", { noHeadRecord: true }, /recorded no head/],
    ["the worktree is on another head", { head: "2".repeat(40) }, /not on the head THE PRE-CHECK recorded/],
    ["the worktree is dirty", { stray: " M somefile" }, /not clean/],
    ["no night recorded", { noNight: true }, /recorded no night/],
    ["no carry", { noCarry: true }, /recorded no carry/],
    ["a stale carry", { carryAge: 31 }, /more than 30 minutes ago/],
    ["a carry without the list's sha256 (the one-value carry)", { carry: `3 ${MD5}` }, /did not read as a count, an md5, the list's sha256, the list md5 and the disagreement count/],
    ["a carry without the list md5", { carry: `3 ${MD5} ${LIST_SHA}` }, /did not read as a count, an md5, the list's sha256, the list md5 and the disagreement count/],
    ["a carry without the disagreement count", { carry: `3 ${MD5} ${LIST_SHA} ${LMD5}` }, /did not read as a count, an md5, the list's sha256, the list md5 and the disagreement count/],
    ["the snapshot is not there", { noList: true }, /the snapshot of the list \S+ is not there/],
    ["the snapshot changed since THE PRE-CHECK", { listChanged: true }, /the snapshot of the list changed since THE PRE-CHECK/],
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
    ["no carry, so the list is not known", { noCarry: true }, /recorded no carry/],
    ["the snapshot is not there", { noList: true }, /the snapshot of the list \S+ is not there/],
    ["the snapshot changed since THE PRE-CHECK", { listChanged: true }, /the snapshot of the list changed since THE PRE-CHECK/],
    ["the read is not read only", { variant: "notro" }, /READ ONLY/],
    ["the transcript holds another line", { variant: "extra" }, /not Q6POST count lines/],
    ["PASS does not read the count", { variant: "nopass" }, /PASS written 3/],
    ["the read refused", { psqlExit: 3 }, /refused or failed/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
  undo: [
    ["the marker exists", { undoneExists: true }, /already run/],
    ["no ids file", { noIds: true }, /ids file of THE WRITE is not there/],
    ["the clinic is open", { stamp: "202611191500" }, /inside clinic hours/],
    ["07:00 the morning after RUNDAY, past the 06:29 limit", { stamp: "202611200700", dow: "5" }, /outside the window/],
    ["the clock is far from network time", { sntp: "-9.500000" }, /more than 5/],
    ["the held head moved", { tip: "2".repeat(40) }, /held head is not the commit/],
    ["the rollback refused", { psqlExit: 3 }, /refused or failed/],
    ["COMMITTED does not read the count", { variant: "nocommit" }, /COMMITTED 3/],
    ["the environment file is missing", { noEnv: true }, /did not load/],
  ],
};
const STAGE_FILE = { readout: READ, pre: PRE, write: WRITE, post: POST, undo: UNDO };

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
        if (name === "readout") assert.equal(clean.readoutFile, `${RFILE_OK}\n`, "the read-out file is not the one psql wrote");
        if (name === "pre") assert.equal(clean.snapMode, 0o600, "the snapshot of the list is not mode 600");
        if (name === "write") assert.ok(clean.args.includes(`list_md5=${LMD5}`) && clean.args.includes("disagree=0"), "the write does not pass the carried list md5 and disagreement count to psql");
        assert.equal(clean.stdin, ["pre", "write", "post"].includes(name) ? LIST_TEXT : "", `${name}: psql's standard input is not ${["pre", "write", "post"].includes(name) ? "the list" : "empty"}`);
        for (const n of STUBBED) {
          if (NOT_CALLED[name].includes(n)) continue;
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
          if (["dis", "twodis", "nodis"].includes(s.variant) || s.afterPsql) assert.equal(r.preOk, "", `${name}: ${label}: the carry was written`);
          if (s.psqlExit === undefined && s.variant === undefined && s.ids === undefined && s.rfile === undefined && !s.afterPsql) {
            assert.ok(!r.calls.some((c) => c.startsWith("psql#")), `${name}: ${label}: psql ran`);
          }
          if (s.staleCarry) assert.deepEqual(r.tmpLeft, [], `${name}: ${label}: an earlier pass's records survived the STOP: ${r.tmpLeft}`);
          if (name === "pre" && (s.q6dat || s.listsha || s.noList)) {
            assert.ok(!r.calls.some((c) => /^(git|node|psql|sntp)#/.test(c)), `${name}: ${label}: a call reached git, the network or production first: ${r.calls}`);
          }
        }
        if (PENDING_OF[name]) {
          const r = await runOnce(cfg, { fill: false });
          assertStop(name, r, /HELD is not a filled-in sha, so this block is NOT READY/, `${shell} ${name}: the document's own copy`);
          assert.ok(!r.calls.some((c) => /^(git|node|psql|sntp|date|shasum|rm|mkdir|touch)#/.test(c)), `${name}: a command ran before the PENDING check: ${r.calls}`);
          if (name !== "readout") {
            const runday = await runOnce(cfg, { runday: "PENDING" });
            assertStop(name, runday, /RUNDAY is still PENDING/, `${shell} ${name}: RUNDAY left PENDING`);
          }
        }
        for (const [p, re] of [[STAGE_FILE[name], /not the approved file/], [GUARD, /target guard on disk/], [PTM, /module on disk/]]) {
          const f = join(base, "apply", p);
          const keep = readFileSync(f);
          writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
          assertStop(name, await runOnce(cfg), re, `${shell} ${name}: changed ${p}`);
          writeFileSync(f, keep);
        }
        if (name === "pre") {
          const crlf = LIST_TEXT.replaceAll("\n", "\r\n");
          assertPass(name, await runOnce(cfg, { listText: crlf, listsha: sha256(crlf) }), `${shell} pre: a CRLF list`);
          const dis = await runOnce(cfg, { variant: "dis", disagreeok: "2" });
          assertPass(name, dis, `${shell} pre: 2 disagree, and the dispatch accepts 2 (the lead's ruling)`);
          assert.match(dis.stdout, /list_disagrees_staff_set is 2, the count the dispatch accepts\./, `${shell} pre: the accepted count is not stated`);
          assert.equal(dis.preOk, `3 ${MD5} ${LIST_SHA} ${LMD5} 2\n`, `${shell} pre: the carry does not hold the accepted count`);
          const zero = await runOnce(cfg);
          assert.equal(zero.preOk, `3 ${MD5} ${LIST_SHA} ${LMD5} 0\n`, `${shell} pre: 0 against 0 does not carry 0`);
        }
        assertPass(name, await runOnce(cfg), `${shell} ${name}: clean again after the scenarios`);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }

  test(`${shell}: pre and undo refuse a document whose first line still reads NOT READY, and the read-out runs on it`, async () => {
    const { base, docsha } = makeBase({ firstLine: doc.split("\n")[0] });
    try {
      for (const name of ["pre", "undo"]) {
        const r = await runOnce({ base, docsha, name, shell });
        assertStop(name, r, /still reads NOT READY/, `${shell} ${name}: NOT READY`);
        assert.ok(!r.calls.some((c) => /^(node|psql)#/.test(c)), `${name}: the guard or psql ran on a NOT READY document`);
      }
      assertPass("readout", await runOnce({ base, docsha, name: "readout", shell }), `${shell} readout: on a NOT READY document`);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}

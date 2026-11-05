// Q6 (strategy, 2026-11-04): the existing appointment types take 0% VAT and the exemption code M07.
// The document, its sidecar, its four SQL files and its four blocks agree with each other, the SQL
// has the shape the document claims, and every halt in every block is explicit, proven by fault
// injection.
//
// WHAT THIS PROVES, with no database (DATABASE_URL is never read):
//   * the sidecar pins the document; the first line reads NOT READY; the document carries its
//     NOT YET REHEARSED section; no em dash in any file of the op;
//   * the document pins the real four SQL files, the target guard and its module, in its table and
//     in every block that runs them;
//   * THE SQL: the write and the rollback open with BEGIN and the two SET LOCAL timeouts; each holds
//     exactly one UPDATE of public.services; the write's predicate is the tenant plus both VAT
//     fields NULL and its values are 0 and M07; every expected-count check sits before the COMMIT,
//     and so does the record of the ids; the rollback is keyed on the recorded ids; the two reads
//     write nothing and print only their own Q6 lines; no file names a uuid or a person's column.
//     Each shape rule is shown to catch its own seeded fault;
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
// lists under NOT YET REHEARSED.
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
const BRANCH = "origin/data/Q6-service-types-vat-m07";

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

test("the sidecar pins the document, and the document says NOT READY and NOT YET REHEARSED", () => {
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
  assert.match(doc.split("\n")[0], /^NOT READY: /);
  assert.match(doc, /\n## NOT YET REHEARSED\n/);
  assert.match(doc, /Nothing in this document has run against a database/);
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
    const pending = lines.filter((l) => /='PENDING/.test(l));
    if (name === "pre" || name === "undo") {
      assert.deepEqual(pending.map((l) => l.split("=")[0]), ["HELD", "DOCSHA", "RUNDAY"], name);
      assert.deepEqual(lines.slice(2, 5), pending, `${name}: the PENDING lines are not lines 3 to 5`);
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
      fetch) exit 0;;
      status) if [ -n "$HARNESS_STRAY" ]; then echo "$HARNESS_STRAY"; fi; exit 0;;
      rev-parse) if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi
        if [ "$2" = ${BRANCH} ]; then echo "$HARNESS_TIP"; exit 0; fi;;
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
function localize(name, run, base, { docsha, envFile, fill = true, held = TIP, runday = "20261116" } = {}) {
  let b = BLOCKS[name];
  if (fill && (name === "pre" || name === "undo")) {
    b = b.replace(/^HELD='PENDING[^\n]*$/m, `HELD='${held}'`)
      .replace(/^DOCSHA='PENDING[^\n]*$/m, `DOCSHA='${docsha}'`)
      .replace(/^RUNDAY='PENDING[^\n]*$/m, `RUNDAY='${runday}'`);
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

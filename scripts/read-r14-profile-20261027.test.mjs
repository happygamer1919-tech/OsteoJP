// R14-PROFILE (2026-10-27): the read-only appointments profile, its document and its one block agree
// with each other, the read writes nothing and prints no personal data, and every halt in the block is
// explicit, proven by fault injection.
//
// WHAT THIS PROVES, with no database:
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing: no INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP, ALTER, CREATE, GRANT,
//     REVOKE, COPY, CALL, DO, SET or transaction control of its own; verdict 0 reads the transaction's
//     own setting;
//   * THE SELECT LISTS: no select list anywhere in the read names a personal column (a name, phone,
//     email, NIF, date of birth, note, address, job title, error text); no select list of a printed CTE
//     (r_*, v_*), and nothing in `out` or the final select, names an id column, outside count(...),
//     filter (...) and exists (...); `out` reads only r_* and v_* CTEs; `raw` is read only through
//     the keys `estado` and `tipo_servico`, `metadata` only through its named keys; no string literal
//     carries an at sign. Each of those rules is shown to catch its own seeded fault;
//   * every verdict 0 to 6 is in the read, the document lists every printed row number, and verdict 6
//     reads the printed rows for a uuid fragment, an at sign and nine digits in a row;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no backslash continuation; its
//     only psql call is `begin read only` ... `rollback`; it carries exactly its two PENDING value lines
//     and STOPs on them before anything runs; its transcript goes to the handover folder;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' < /dev/null
//     && echo TOOL-CHAIN-CONTINUED`), every external command a stub, and each call is made to fail in
//     turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool chain stopped;
//   * the block passes only on the profile 7 OK / 0 VACUOUS / 0 FAIL with an R12_FIRES row and a
//     transcript free of uuid fragments, at signs and nine-digit runs; each verdict read VACUOUS or FAIL
//     STOPs it, and so does each of those three in the transcript.
// Under bash always; under zsh wherever zsh is installed (it is not on the GitHub runner).
//
// WHAT IT DOES NOT PROVE: that the read runs against a database. That is the rehearsal in the document.
//
// Run: node --test scripts/read-r14-profile-20261027.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC_PATH = "docs/read-r14-profile-20261027.md";
const SIDECAR = "docs/read-r14-profile-20261027.sha256";
const READ_PATH = "scripts/db/read-r14-profile-20261027.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_FILE = "/Users/ivan/osteojp-handover/r14-profile-20261027.out";
const MERGED = "a".repeat(40);

const doc = read(DOC_PATH);
const sql = read(READ_PATH);

/** The one fenced block under "## THE BLOCK". */
function theBlock(md) {
  const at = md.indexOf("## THE BLOCK");
  assert.ok(at >= 0, "the document has no THE BLOCK section");
  const m = md.slice(at).match(/```\n([\s\S]*?)\n```/);
  assert.ok(m, "THE BLOCK section has no fenced block");
  return m[1];
}
const block = theBlock(doc);

// ---- The SQL reader: comments out, string literals masked, CTEs and select lists found by depth. ----

const PERSONAL = /\b(full_name|email|phone|phone_e164|nif|date_of_birth|notes|note|address|postal_code|city|job_title|last_error|body|name|audio_object_key|room|sex|profession)\b/i;
const IDS = /\b(id|patient_id|patient_2_id|practitioner_id|practitioner_2_id|user_id|doctor_id|entity_id|imported_entity_id|appointment_id|appt_id|location_id|service_id|source_id|actor_user_id|recipient_user_id|therapist_user_id|booking_group_id|batch_id|merged_into_id|created_by|tenant_id|auth_user_id)\b/i;
const RAW_KEYS = ["estado", "tipo_servico"];
const META_KEYS = ["startsAt", "fromStatus", "toStatus", "from_status", "to_status", "outcome", "allowConflict", "clonedFrom"];

const stripComments = (s) => s.replace(/--[^\n]*/g, "");
const maskStrings = (s) => s.replace(/'(?:[^']|'')*'/g, "''");

/** Index just past the paren that closes the one opening at `open`. */
function closeOf(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") { d--; if (d === 0) return i + 1; }
  }
  throw new Error(`unbalanced paren at ${open}`);
}

/** Top-level CTEs of the masked text: [{ name, body }], plus the final statement. */
function ctes(masked) {
  const out = [];
  const start = masked.search(/\bwith\b/i);
  let i = start + 4;
  for (;;) {
    const m = /^\s*([a-z_][a-z_0-9]*)\s+as\s*\(/i.exec(masked.slice(i));
    if (!m) break;
    const open = i + m[0].length - 1;
    const end = closeOf(masked, open);
    out.push({ name: m[1].toLowerCase(), body: masked.slice(open + 1, end - 1) });
    const comma = /^\s*,/.exec(masked.slice(end));
    if (!comma) { i = end; break; }
    i = end + comma[0].length;
  }
  return { list: out, final: masked.slice(i) };
}

/** Remove each balanced group whose opening matches `re` (a regex ending at its "("). */
function removeGroups(s, re) {
  let out = s;
  for (;;) {
    const m = re.exec(out);
    if (!m) return out;
    const open = m.index + m[0].lastIndexOf("(");
    out = out.slice(0, m.index) + " " + out.slice(closeOf(out, open));
  }
}

/** Every select list in a text: from `select` to `from` (or union, or the end of its group) at its depth. */
function selectLists(s) {
  const lists = [];
  const re = /\bselect\b/gi;
  const kw = /(from|union|where|group|order|having)\b/iy;
  let m;
  while ((m = re.exec(s))) {
    let d = 0;
    let j = m.index + m[0].length;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === "(") d++;
      else if (c === ")") { if (d === 0) break; d--; }
      else if (d === 0 && /\W/.test(s[j - 1])) { kw.lastIndex = j; if (kw.test(s)) break; }
    }
    lists.push(s.slice(m.index + m[0].length, j));
  }
  return lists;
}

/** The select lists at depth 0 of a text (a CTE's own output, union branches included). */
function topSelectLists(s) {
  const out = [];
  const re = /\bselect\b/gi;
  let m;
  while ((m = re.exec(s))) {
    let d = 0;
    for (let i = 0; i < m.index; i++) { if (s[i] === "(") d++; else if (s[i] === ")") d--; }
    if (d === 0) out.push(selectLists(s.slice(m.index))[0]);
  }
  return out;
}

/** What is left of a select list once subqueries (checked on their own), counts, filters, exists,
 * window specifications and DISTINCT ON keys go: none of them reaches an output column. */
function bare(list) {
  let s = removeGroups(list, /\(\s*(?=select\b)/i);
  s = removeGroups(s, /\bcount\s*\(/i);
  s = removeGroups(s, /\bfilter\s*\(/i);
  s = removeGroups(s, /\bexists\s*\(/i);
  s = removeGroups(s, /\bover\s*\(/i);
  s = removeGroups(s, /\bdistinct\s+on\s*\(/i);
  s = s.replace(/\b(raw|metadata)\s*->>\s*''/gi, " ").replace(/\bmetadata\s*\?\s*''/gi, " ");
  return s;
}

/** Every rule the read must keep; returns the list of breaches (empty when clean). */
function sqlFindings(text) {
  const found = [];
  const code = stripComments(text);
  const VERDICT_6_PATTERN = "'-[0-9a-f]{4}-[0-9a-f]{4}-|@|[0-9]{9}'";
  for (const lit of code.match(/'(?:[^']|'')*'/g) || []) {
    if (lit.includes("@") && lit !== VERDICT_6_PATTERN) found.push(`a string literal carries an at sign: ${lit}`);
  }
  const masked = maskStrings(code);
  const writes = masked.match(/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i);
  if (writes) found.push(`a statement word it must not carry: ${writes[0]}`);
  const idText = masked.match(/\b[a-z_0-9.]*id\s*::\s*(text|varchar|character varying)\b/i);
  if (idText) found.push(`an id is cast to text: ${idText[0]}`);
  for (const m of code.matchAll(/\braw\b(\s*->>?\s*'([^']*)')?/gi)) {
    if (!m[1] || !m[1].includes("->>") || !RAW_KEYS.includes(m[2])) found.push(`raw read other than through ${RAW_KEYS.join(", ")}: ${m[0]}`);
  }
  for (const m of code.matchAll(/\bmetadata\b(\s*(->>|\?)\s*'([^']*)')?/gi)) {
    if (!m[1] || !META_KEYS.includes(m[3])) found.push(`metadata read other than through a named key: ${m[0]}`);
  }
  const { list, final } = ctes(masked);
  if (list.length < 10) found.push(`too few CTEs found (${list.length}): the reader did not parse the read`);
  for (const l of selectLists(masked)) {
    const p = bare(l).match(PERSONAL);
    if (p) found.push(`a select list names a personal column: ${p[0]}`);
  }
  const printed = list.filter((c) => /^(r|v)_/.test(c.name));
  for (const c of printed) {
    for (const l of selectLists(c.body)) {
      const p = bare(l).match(IDS);
      if (p) found.push(`${c.name}: a select list names an id column: ${p[0]}`);
    }
  }
  // Every CTE a printed CTE reads must itself output no id column.
  const names = new Set(list.map((c) => c.name));
  const readers = new Map();
  for (const c of printed) {
    for (const m of c.body.matchAll(/\b(?:from|join)\s+([a-z_][a-z_0-9]*)\b/gi)) {
      const n = m[1].toLowerCase();
      if (names.has(n) && !/^(r|v)_/.test(n)) readers.set(n, [...(readers.get(n) || []), c.name]);
    }
  }
  if (readers.size < 10) found.push(`too few CTEs read by printed CTEs (${readers.size}): the reader did not parse the read`);
  for (const [n, by] of readers) {
    const c = list.find((x) => x.name === n);
    for (const l of topSelectLists(c.body)) {
      const p = bare(l).match(IDS);
      if (p) found.push(`${n} (read by ${by[0]}): a select list names an id column: ${p[0]}`);
    }
  }
  const outCte = list.find((c) => c.name === "out");
  if (!outCte) found.push("no out CTE");
  else {
    for (const part of [outCte.body, final]) {
      const p = part.match(IDS) || part.match(PERSONAL);
      if (p) found.push(`the printed rows name ${p[0]}`);
    }
    for (const m of outCte.body.matchAll(/\bfrom\s+([a-z_0-9]+)/gi)) {
      if (!/^(r|v)_/.test(m[1])) found.push(`out reads ${m[1]}, which is not an r_ or v_ CTE`);
    }
    for (const c of printed) {
      if (!["v_2_counts", "v_6"].includes(c.name) && !new RegExp(`\\bfrom\\s+${c.name}\\b`).test(outCte.body)) {
        found.push(`${c.name} is not printed by out`);
      }
    }
  }
  return found;
}

test("the sidecar pins the document", () => {
  const line = read(SIDECAR).trim();
  assert.equal(line, `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table, in the block and in the fallback", () => {
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(doc.slice(0, doc.indexOf("## THE BLOCK")).includes(s), `the pins table does not carry ${path}'s sha256`);
  }
  const fallback = doc.slice(doc.indexOf("## The owner's fallback"));
  assert.ok(fallback.includes(`"${sha256(sql)}"`), "the owner's copy step does not check the read's sha256");
  assert.doesNotMatch(doc, /SHAREAD_VALUE/, "a placeholder for the read's sha256 is left in the document");
});

test("the read is clean under every rule (writes, select lists, raw and metadata keys, printed CTEs)", () => {
  assert.deepEqual(sqlFindings(sql), []);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "verdict 0 must read the transaction's own setting");
});

test("each select-list rule catches its own seeded fault", () => {
  const mutants = [
    ["a patient name in a helper's select list", sql.replace("select p.id\n    from public.patients p\n   where p.deleted_at is null\n     and (p.full_name", "select p.id, p.full_name\n    from public.patients p\n   where p.deleted_at is null\n     and (p.full_name"), /personal column: full_name/],
    ["a NIF in a select list", sql.replace("select count(distinct p.id) as rows_in_group, count(distinct pc.location_id) as clinics\n    from public.patients p\n    left join pclin pc on pc.patient_id = p.id\n   where p.deleted_at is null and p.merged_into_id is null\n     and regexp_replace", "select count(distinct p.id) as rows_in_group, max(p.nif) as clinics\n    from public.patients p\n    left join pclin pc on pc.patient_id = p.id\n   where p.deleted_at is null and p.merged_into_id is null\n     and regexp_replace"), /personal column: nif/],
    ["an appointment id printed", sql.replace("count(*)::text || ', ' || to_char(min(starts_at", "min(id::text) || count(*)::text || ', ' || to_char(min(starts_at"), /r_10: a select list names an id column: id/],
    ["a patient id printed", sql.replace("'B5/P27 patients by year, clinic and origin of their FIRST completed visit: ' || yr::text", "'B5/P27 patients by year, clinic and origin of their FIRST completed visit: ' || max(patient_id::text) || yr::text"), /r_53: a select list names an id column: patient_id/],
    ["an id in a helper a printed CTE reads", sql.replace("  select ap.oc, ap.clinic, ap.status, ap.cstate, ap.starts_at,", "  select ap.patient_id, ap.oc, ap.clinic, ap.status, ap.cstate, ap.starts_at,"), /apx \(read by [a-z_0-9]+\): a select list names an id column: patient_id/],
    ["an id cast to text in a helper", sql.replace("  select distinct on (ap.patient_id) ap.yr, ap.clinic, ap.oc", "  select distinct on (ap.patient_id) ap.patient_id::text as k, ap.yr, ap.clinic, ap.oc"), /an id is cast to text: ap\.patient_id::text/],
    ["a patient id in the patients helper", sql.replace("  select x.linked_clinics, x.appt_clinics,", "  select x.linked_clinics, x.merged_into_id, x.appt_clinics,"), /pat_clinics \(read by r_5\d\): a select list names an id column: merged_into_id/],
    ["the cancel reason read", sql.replace("al.metadata->>'outcome' in", "al.metadata->>'reason' in"), /metadata read other than through a named key/],
    ["metadata read whole", sql.replace("(al.metadata ? 'clonedFrom') as cloned", "al.metadata::text as cloned"), /metadata read other than through a named key/],
    ["a source row key that is not allowed", sql.replace("lower(trim(m.raw->>'tipo_servico'))", "lower(trim(m.raw->>'nome'))"), /raw read other than through/],
    ["the source row whole", sql.replace("then lower(trim(m.raw->>'estado')) else 'other' end as estado", "then m.raw::text else 'other' end as estado"), /raw read other than through/],
    ["out reads a helper", sql.replace("union all select n, chk, obs, 'information', 'INFO' from r_10", "union all select 10, 'x', count(*)::text, 'information', 'INFO' from ap"), /out reads ap/],
    ["a printed row that out forgets", sql.replace("  union all select n, chk, obs, 'information', 'INFO' from r_62\n", ""), /r_62 is not printed by out/],
    ["an at sign in a label", sql.replace("'B6/P12 services: total,", "'B6/P12 services @ total,"), /at sign/],
    ["a write", sql.replace("select 0 as n,", "select 0 as n, (select 1 from (delete from public.audit_log returning 1) d) as w,"), /statement word it must not carry: delete/],
    ["a set statement", sql.replace("with\nlisbon as (", "set statement_timeout = 0;\nwith\nlisbon as ("), /statement word it must not carry: set/],
  ];
  for (const [label, mutant, re] of mutants) {
    assert.notEqual(mutant, sql, `${label}: the mutation did not apply`);
    const f = sqlFindings(mutant);
    assert.ok(f.some((x) => re.test(x)), `${label}: not caught; findings: ${JSON.stringify(f)}`);
  }
});

test("every verdict is in the read, verdict 6 reads every printed row, and the document lists every row", () => {
  const masked = maskStrings(stripComments(sql));
  const { list } = ctes(masked);
  for (let v = 0; v <= 6; v++) assert.ok(list.some((c) => c.name === `v_${v}`), `no verdict ${v}`);
  assert.ok(sql.includes("~* '-[0-9a-f]{4}-[0-9a-f]{4}-|@|[0-9]{9}'"), "verdict 6 does not read for a uuid fragment, an at sign and nine digits");
  assert.match(sql, /from out o\n\)/, "verdict 6 does not read the printed rows");
  assert.ok(sql.includes("'54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid") && sql.includes("'0c1a0000-0000-4000-8000-000000000001'::uuid"), "verdict 5 does not name the two JP rows");
  assert.ok(read("docs/data-op-staff-10-v2.md").includes("54d486e0-a9c3-4c82-acac-8b909ce5a2d0"), "the JP(cb) id is not the one on record");
  for (const c of list.filter((x) => /^r_\d+$/.test(x.name))) {
    const n = c.name.slice(2);
    assert.match(c.body, new RegExp(`^\\s*select ${n} as n,`), `${c.name} does not print n = ${n}`);
    assert.match(doc, new RegExp(`\\n\\| ${n} \\| `), `the document does not list row ${n}`);
  }
  for (let v = 0; v <= 6; v++) assert.match(doc, new RegExp(`\\n\\| ${v} \\| `), `the document does not list verdict ${v}`);
});

test("the block's shape: pipefail on line 2, no set -e, no # line, no continuation, one read-only psql", () => {
  const lines = block.split("\n");
  assert.equal(lines[0], "(");
  assert.equal(lines[1], "set -o pipefail");
  assert.equal(lines.at(-1), ")");
  assert.doesNotMatch(block, /set -e|errexit/);
  assert.ok(!lines.some((l) => l.trimStart().startsWith("#")), "a # line in the block");
  assert.ok(!lines.some((l) => l.endsWith("\\")), "a backslash continuation in the block");
  const psql = lines.filter((l) => /^psql /.test(l));
  assert.ok(!lines.some((l) => /(^|[;|&] *)psql /.test(l) && !/^psql /.test(l)), "a psql call that does not start its line");
  assert.equal(psql.length, 1);
  assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '300s'"/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback"/);
  assert.equal((block.match(/=PENDING$/gm) || []).length, 2, "exactly two PENDING value lines");
  assert.ok(lines[2] === "MERGED=PENDING" && lines[3] === "DOCSHA=PENDING");
  assert.ok(block.includes(`OUT=${OUT_FILE}\n`), "the transcript does not go to the handover folder");
  assert.ok(block.indexOf("PD=$(awk") < block.indexOf("CNT=$(awk"), "the transcript is not checked for personal data before the verdicts are counted");
  assert.doesNotMatch(block, /\btee\b/, "the block streams the transcript to the screen");
  assert.match(psql[0], / > \$\{OUT\} 2>&1 \|\| \{ echo "STOP: /, "psql's output does not go to the transcript file only");
  assert.doesNotMatch(block, /\b(cat|head|tail|sed|less|more|column)\b[^\n]*\$\{OUT\}/, "a line prints the transcript");
  const at = lines.findIndex((l) => /^psql /.test(l));
  const echoes = lines.slice(at + 1).filter((l) => /^echo /.test(l));
  assert.deepEqual(echoes, [
    'echo "personal-data scan: ${PD} lines carry a uuid fragment, an at sign or nine digits in a row"',
    'echo "verdicts (OK VACUOUS FAIL): ${CNT}"',
    'echo "R14-PROFILE PASSED: 7 OK / 0 VACUOUS / 0 FAIL. R12: ${L}"',
  ], "after psql the block echoes something other than the scan count, the verdict counts and the R12 line");
  const scan = lines.findIndex((l) => l.startsWith('[ "${PD}" = "0" ]'));
  assert.ok(scan > at && lines.slice(at + 1, scan).every((l) => !/^echo /.test(l)), "a line is echoed after psql before the personal-data scan passes");
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `a halt that is not one STOP and exit 1: ${l}`);
  }
});

// ---- The fault-injection harness. ----

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const realOf = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH }, encoding: "utf8" });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const STUBBED = ["git", "node", "psql", "grep", "awk", "cut", "shasum", "rm"];

const VERDICTS = [
  "  0 | 0. this transaction is READ ONLY | on | on | OK",
  "  1 | 1. every location is one of LV, CB, MN | LV 1, CB 1, MN 1, OTHER 0, AMBIGUOUS 0 | LV 1, CB 1 | OK",
  "  2 | 2. there is something to measure | 120, 40, 90, 150 | each > 0 | OK",
  "  3 | 3. the reschedule measure can see a move | 35 | > 0 | OK",
  "  4 | 4. schedule coverage has rows | 12, 3 | each > 0 | OK",
  "  5 | 5. the person-rows rule finds the known splits | JP rows grouped together: true; NESA rows 2, largest NESA group 2 | as stated | OK",
  "  6 | 6. no printed row carries a uuid fragment | 0 of 60 | 0 of N | OK",
];
const TABLE_OK = [
  "BEGIN", "SET",
  " profile_read_transaction ", "--------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...VERDICTS,
  " 10 | B1/P1 appointments by origin and clinic: imported, CB | 80, 2020-03-02, 2026-12-30 | information | INFO",
  " 70 | R12_FIRES | consultations_last_90_days=4 of_them_pending=1 of_them_sent=3 | pending, sent (fired), needs_attention | INFO",
  "(9 rows)", "", "ROLLBACK",
].join("\n");
const FIXTURES = {
  ok: TABLE_OK,
  noline: TABLE_OK.replace(/^ 70 \| R12_FIRES[^\n]*\n/m, ""),
  notreadonly: TABLE_OK.replace(" read only: on", " read only: off"),
  uuid: TABLE_OK.replace("80, 2020-03-02, 2026-12-30", "80, 2020-03-02, 0c1a0000-0000-4000-8000-000000000001"),
  at: TABLE_OK.replace("80, 2020-03-02, 2026-12-30", "80, someone@example.invalid"),
  digits: TABLE_OK.replace("80, 2020-03-02, 2026-12-30", "80, 912345678"),
};
VERDICTS.forEach((line, k) => {
  const bad = k === 0 || k === 1 || k === 6 ? "FAIL" : "VACUOUS";
  FIXTURES[`v${k}`] = TABLE_OK.replace(line, line.replace(/\| OK$/, `| ${bad}`));
});

function stubText(name, real) {
  return `#!/bin/sh
d="$HARNESS_DIR"
n=$(( $(cat "$d/count.${name}" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/count.${name}"
printf '%s:%s %s\\n' "${name}" "$n" "$*" >> "$d/calls"
if [ "$HARNESS_FAIL" = "${name}:$n" ]; then
  echo "${name}: harness fault" >&2
  ${name === "grep" || name === "awk" || name === "cut" || name === "shasum" ? `"${real}" "$@" > /dev/null 2>&1 < /dev/null` : ":"}
  exit ${name === "grep" ? 2 : 1}
fi
case "${name}" in
  git)
    case "$1" in
      status) [ "$HARNESS_DIRTY" = yes ] && echo " M somefile"; exit 0;;
      fetch) exit 0;;
      merge-base) [ "$HARNESS_ANCESTOR" = no ] && exit 1; exit 0;;
      checkout) exit 0;;
      rev-parse) echo "$HARNESS_HEAD"; exit 0;;
      *) echo "harness: unexpected git $*" >&2; exit 97;;
    esac;;
  node)
    [ "$1" = "scripts/assert-production-target.mjs" ] || { echo "harness: unexpected node $*" >&2; exit 97; }
    [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || { echo "harness: the guard ran without the env file's URL" >&2; exit 97; }
    printf 'host: harness.invalid\\nport: 5432\\nref:  harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
  psql)
    [ "$1" = "$HARNESS_DBURL" ] || { echo "harness: psql got a URL that is not the harness's" >&2; exit 97; }
    cat "$d/fix.$HARNESS_TABLE"; exit 0;;
  *) exec "${real}" "$@";;
esac
`;
}

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "r14profile-harness-"));
  mkdirSync(join(base, "bin"));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, ["git", "node", "psql"].includes(n) ? "" : realOf(n)));
    chmodSync(join(base, "bin", n), 0o755);
  }
  const wt = join(base, "apply");
  for (const p of [DOC_PATH, SIDECAR, READ_PATH, GUARD, MODULE]) {
    mkdirSync(dirname(join(wt, p)), { recursive: true });
    cpSync(join(ROOT, p), join(wt, p));
  }
  writeFileSync(join(base, "prod.env"), "DATABASE_URL_DIRECT=postgresql://postgres.harness:x@harness.invalid:5432/postgres\n");
  for (const [k, v] of Object.entries(FIXTURES)) writeFileSync(join(base, `fix.${k}`), v + "\n");
  return base;
}

/** The block as GREEN pastes it from its dispatch: the two value lines filled, paths pointed at the harness. */
function filled(base, { docsha } = {}) {
  return block
    .replace("MERGED=PENDING", `MERGED=${MERGED}`)
    .replace("DOCSHA=PENDING", `DOCSHA=${docsha ?? sha256(doc)}`)
    .replaceAll(APPLY_DIR, join(base, "apply"))
    .replaceAll(ENV_FILE, join(base, "prod.env"))
    .replaceAll(OUT_FILE, join(base, "out.txt"));
}

function runOnce(shell, base, text, env = {}) {
  rmSync(join(base, "calls"), { force: true });
  for (const n of STUBBED) rmSync(join(base, `count.${n}`), { force: true });
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  const args = shell === "zsh" ? ["-f", "-c", tail] : ["--noprofile", "--norc", "-c", tail];
  const r = spawnSync(shell, args, {
    cwd: base,
    encoding: "utf8",
    env: {
      PATH: `${join(base, "bin")}:${SYSTEM_PATH}`,
      HOME: base,
      HARNESS_DIR: base,
      HARNESS_HEAD: MERGED,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_TABLE: "ok",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertPass(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^R14-PROFILE PASSED: 7 OK \/ 0 VACUOUS \/ 0 FAIL\. R12: .*R12_FIRES/m);
  assertNoTable(r, "pass");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
}

/** Nothing of psql's table reaches the screen; only the R12 row may, inside the PASSED line. */
function assertNoTable(r, label) {
  for (const marker of ["BEGIN", "ROLLBACK", "read only: on", "0. this transaction", "B1/P1", "someone", "912345678", "0c1a0000-0000-4000"]) {
    assert.ok(!r.out.includes(marker), `${label}: the table reached the screen (${marker})\n${r.out}`);
  }
}

function assertStop(r, re, label) {
  assertNoTable(r, label);
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /R14-PROFILE PASSED/, `${label}: a pass line after a fault`);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.doesNotMatch(r.out, /harness: unexpected/, `${label}: an unexpected call`);
}

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine, and the zsh arm must run wherever it is not the GitHub runner"));

for (const shell of shells) {
  test(`${shell}: the document's own copy STOPs at its PENDING lines before anything runs`, () => {
    const base = makeBase();
    try {
      const text = block.replaceAll(APPLY_DIR, join(base, "apply")).replaceAll(OUT_FILE, join(base, "out.txt"));
      const r = runOnce(shell, base, text);
      assertStop(r, /still reads PENDING, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled block passes on the clean profile, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const clean = runOnce(shell, base, text);
      assertPass(clean);
      const calls = clean.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 16, `too few calls were stubbed: ${calls.length}`);
      for (const n of STUBBED) {
        assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called, so its failure is not proven`);
      }
      for (const id of calls) {
        const r = runOnce(shell, base, text, { HARNESS_FAIL: id });
        assertStop(r, null, `${shell} fail ${id}`);
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: each verdict, the R12 row, the transaction, personal data in the transcript, the pins, the worktree and the commit each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      for (let k = 0; k < VERDICTS.length; k++) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: `v${k}` }), /not 7 OK \/ 0 VACUOUS \/ 0 FAIL/, `verdict ${k}`);
      }
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "noline" }), /no R12_FIRES row/, "no R12_FIRES");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const k of ["uuid", "at", "digits"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: k }), /carry a uuid fragment, an at sign or nine digits in a row\. Do NOT open, print or paste the transcript/, `transcript ${k}`);
      }
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_ANCESTOR: "no" }), /is not on origin\/main/, "not on main");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "b".repeat(40) }), /not on the merge commit/, "head");
      assertStop(runOnce(shell, base, filled(base, { docsha: "c".repeat(64) })), /not the one the dispatch names/, "docsha");
      for (const [p, re] of [[READ_PATH, /read on disk is not the reviewed file/], [GUARD, /target guard on disk/], [MODULE, /module on disk/]]) {
        const f = join(base, "apply", p);
        const keep = readFileSync(f);
        writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
        assertStop(runOnce(shell, base, text), re, `changed ${p}`);
        writeFileSync(f, keep);
      }
      const r1 = runOnce(shell, base, filled(base).replaceAll(join(base, "apply"), join(base, "no-such-apply-dir")));
      assertStop(r1, /the apply worktree is not there/, "missing apply directory");
      assert.ok(!/^(git|node|psql|shasum|rm|awk|cut):/m.test(r1.calls), `a command ran after the cd failed: ${r1.calls}`);
      const r2 = runOnce(shell, base, filled(base).replaceAll(join(base, "prod.env"), join(base, "no-such.env")));
      assertStop(r2, /production environment file could not be loaded/, "missing env file");
      assert.ok(!/^(node|psql):/m.test(r2.calls), `the guard or psql ran without the env file: ${r2.calls}`);
      const f = join(base, "apply", DOC_PATH);
      const keep = readFileSync(f);
      writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
      assertStop(runOnce(shell, base, text), /not the one the dispatch names/, "changed document");
      writeFileSync(f, keep);
      assertPass(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
}

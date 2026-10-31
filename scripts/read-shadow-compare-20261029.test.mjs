// SHADOW-READ (2026-10-29): the read-only comparison of the reminder sweep's shadow with the sleeping
// job, its document and its one block agree with each other, the read writes nothing, every halt in
// the block is explicit (proven by fault injection), and, on a local database, every verdict flips on
// its own seeded fault.
//
// WHAT THIS PROVES, with no database:
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing: no INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP, ALTER, CREATE, GRANT,
//     REVOKE, COPY, CALL, DO, SET or transaction control of its own; verdict 0 reads the transaction's
//     setting; it reads the clock in exactly one place;
//   * the read prints no column that holds a person or a tenant;
//   * the document's verdict table names the 17 verdicts the read prints, in order;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; its only psql
//     call is `begin read only` ... `rollback`; it carries exactly its two PENDING value lines and STOPs
//     on them before anything runs; psql writes its transcript to the handover folder only, with
//     `> ${OUT} 2>&1` and no `tee`, and the block prints only the verdict counts and the R11 rows;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' < /dev/null
//     && echo TOOL-CHAIN-CONTINUED`), every external command a stub, and each call is made to fail in
//     turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool chain stopped;
//   * the block prints PASSED only on 17 OK / 0 VACUOUS / 0 FAIL, and REVIEW (exit 0, never PASSED)
//     when verdicts 0 to 10 are OK, nothing is FAIL or VACUOUS and an agreement verdict is REVIEW; it
//     STOPs on a REVIEW outside 11 to 16, a VACUOUS, a FAIL, a missing summary row, missing R11 rows, a transaction that is not
//     read only, a Lisbon clock before 2026-10-29 07:15 or in another zone, a pinned file that differs, a dirty worktree, a
//     merge commit that is not on origin/main, a missing apply directory, a missing handover folder
//     and a missing environment file.
// Under bash always; under zsh wherever zsh is installed (it is not on the GitHub runner).
//
// WITH A LOCAL DATABASE (SHADOW_READ_TEST_PGURL names one on 127.0.0.1 or localhost, whose `public`
// schema is the repository's): the read is run on a seeded throwaway per case, as the block runs it,
// with its one clock line set to a fixed instant, and every verdict is asserted per case: the clean
// profile, the empty window, the NULL window, each verdict's own fault, the explained categories, a
// negative arm per time-bounded category (a save a day later explains nothing), and two mutants. Any other host is refused. Without the variable those cases are skipped.
//
// Run: node --test scripts/read-shadow-compare-20261029.test.mjs

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

const DOC_PATH = "docs/read-shadow-compare-20261029.md";
const SIDECAR = "docs/read-shadow-compare-20261029.sha256";
const READ_PATH = "scripts/db/read-shadow-compare-20261029.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const MERGED = "a".repeat(40);
const CLOCK_LINE = "  select now() as t1";

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

/** The read with its comments removed and every string literal emptied. */
const code = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");

test("the sidecar pins the document", () => {
  const line = read(SIDECAR).trim();
  assert.equal(line, `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table, in the block and in the owner's copy step", () => {
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(doc.slice(0, doc.indexOf("## THE BLOCK")).includes(s), `the pins table does not carry ${path}'s sha256`);
  }
  const fallback = doc.slice(doc.indexOf("## The owner's fallback"));
  assert.ok(fallback.includes(`= "${sha256(sql)}" ] && pbcopy`), "the owner's copy step does not check the read's sha256");
  assert.doesNotMatch(doc, /SHAREAD_VALUE/, "a placeholder for the read's sha256 is left in the document");
});

test("the read writes nothing, controls no transaction, and reads the clock once", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "verdict 0 must read the transaction's own setting");
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.equal(sql.split("\n").filter((l) => l === CLOCK_LINE).length, 1, "the one clock line is not where a rehearsal replaces it");
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date)\b/i, "a second clock");
});

test("the read never names a column that holds a person, and prints no tenant id", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|practitioner_id|created_by|actor_user_id|provider_message_id|body|ip)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\|/, "the read prints a tenant id");
  assert.match(sql, /appointment_id::text \|\| ' \| ' \|\| category as observed/, "appointment ids are printed only in the mismatch list");
  assert.equal((code.match(/appointment_id::text/g) || []).length, 1, "an appointment id is printed outside the mismatch list");
  assert.match(sql, /where rk <= 500\n/, "the mismatch list is not capped at 500 a side");
});

test("the document's verdict table and the read agree on the 17 verdicts", () => {
  const nums = [...sql.matchAll(/^  select (\d+)(?: \+ [a-z.* +0-9]+)?,\s*$/gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums.filter((n) => n < 20), [1, 2, 3, 6, 7, 8, 9, 10, 11], "the read's verdict rows moved");
  assert.match(sql, /select 3 \+ v\.n,/);
  assert.match(sql, /select 11 \+ a\.dn \* 2 \+ a\.rn,/);
  for (const n of ["| 0 |", "| 1 |", "| 2 |", "| 3, 4, 5 |", "| 6 |", "| 7 |", "| 8 |", "| 9 |", "| 10 |", "| 11 to 16 |"]) {
    assert.ok(doc.includes(n), `the verdict table has no row ${n}`);
  }
  assert.match(doc, /17 OK \/ 0 VACUOUS \/ 0 FAIL/);
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
  assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '120s'"/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback"/);
  assert.match(psql[0], / > \$\{OUT\} 2>&1 \|\| \{/, "psql does not write its transcript straight to the file");
  assert.doesNotMatch(psql[0], /\btee\b/, "psql's output goes through tee, so the mismatch list would reach the terminal");
  assert.doesNotMatch(block, /\btee\b/, "the block uses tee");
  assert.doesNotMatch(block, /\bcat\b[^\n]*\$\{OUT\}/, "the block prints the transcript");
  assert.equal((block.match(/=PENDING$/gm) || []).length, 2, "exactly two PENDING value lines");
  assert.ok(lines[2] === "MERGED=PENDING" && lines[3] === "DOCSHA=PENDING");
  assert.ok(lines.includes(`OUT=${OUT_DIR}/shadow-read-20261029.out`), "the transcript does not go to the handover folder");
  assert.ok(!/(^|[^A-Za-z])\/tmp\//.test(block), "the block writes under /tmp");
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
const STUBBED = ["git", "node", "psql", "date", "grep", "awk", "cut", "shasum", "rm"];
const FAKED = ["git", "node", "psql", "date"];

const VERDICT_ROWS = Array.from({ length: 17 }, (_, n) => ` ${String(n).padStart(2)} | ${n}. a verdict | x | y | OK`);
const TABLE_OK = [
  "BEGIN", "SET",
  " shadow_read_transaction ", "-------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...VERDICT_ROWS,
  " 20 | window: first shadow heartbeat | 2026-10-25 15:30:03 | 2026-10-29 07:30:00 | 2026-10-29 07:15:03 | information | INFO",
  " 22 | passes on 2026-10-26 (R11) | 60, 60, 0, 1 to 1, 4 | information | INFO",
  " 22 | passes on 2026-10-27 (R11) | 60, 60, 0, 1 to 1, 4 | information | INFO",
  " 22 | passes on 2026-10-28 (R11) | 60, 60, 0, 1 to 1, 4 | information | INFO",
  " 40 | SHADOW_SUMMARY | full days 2026-10-26 to 2026-10-28: both=12 shadow_only=0 run_only=0 matched_share=100.0% | unexplained 0 | INFO",
  " 51 | run_only 2026-10-28 10:00 48h email | 00000000-0000-4000-8000-0000000000a9 | R4 never reminded | information | INFO",
  "(23 rows)", "", "ROLLBACK",
].join("\n");
const FIXTURES = {
  ok: TABLE_OK,
  vacuous: TABLE_OK.replace(" 11 | 11. a verdict | x | y | OK", " 11 | 11. a verdict | x | y | VACUOUS"),
  review: TABLE_OK.replace(" 12 | 12. a verdict | x | y | OK", " 12 | 12. a verdict | x | y | REVIEW"),
  reviewhead: TABLE_OK.replace("  5 | 5. a verdict | x | y | OK", "  5 | 5. a verdict | x | y | REVIEW"),
  fail: TABLE_OK.replace(" 14 | 14. a verdict | x | y | OK", " 14 | 14. a verdict | x | y | FAIL"),
  short: TABLE_OK.replace(/^ 16 \|[^\n]*\n/m, ""),
  nosummary: TABLE_OK.replace(/^ 40 \| SHADOW_SUMMARY[^\n]*\n/m, ""),
  nor11: TABLE_OK.replace(/^ 22 \|[^\n]*\n/gm, ""),
  notreadonly: TABLE_OK.replace(" read only: on", " read only: off"),
};

for (const [k, v] of Object.entries(FIXTURES)) {
  if (k !== "ok") assert.notEqual(v, TABLE_OK, `the fixture ${k} changed nothing`);
}

function stubText(name, real) {
  return `#!/bin/sh
d="$HARNESS_DIR"
n=$(( $(cat "$d/count.${name}" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/count.${name}"
printf '%s:%s %s\\n' "${name}" "$n" "$*" >> "$d/calls"
if [ "$HARNESS_FAIL" = "${name}:$n" ]; then
  echo "${name}: harness fault" >&2
  ${["grep", "awk", "cut", "shasum"].includes(name) ? `"${real}" "$@" > /dev/null 2>&1 < /dev/null` : ":"}
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
  date)
    [ "$TZ" = "Europe/Lisbon" ] || { echo "harness: date read without TZ=Europe/Lisbon" >&2; exit 97; }
    case "$1" in
      +%Z) echo "$HARNESS_ZONE"; exit 0;;
      +%Y%m%d%H%M) echo "$HARNESS_NOW"; exit 0;;
      *) echo "harness: unexpected date $*" >&2; exit 97;;
    esac;;
  *) exec "${real}" "$@";;
esac
`;
}

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "shadowread-harness-"));
  mkdirSync(join(base, "bin"));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, FAKED.includes(n) ? "" : realOf(n)));
    chmodSync(join(base, "bin", n), 0o755);
  }
  const wt = join(base, "apply");
  for (const p of [DOC_PATH, SIDECAR, READ_PATH, GUARD, MODULE]) {
    mkdirSync(dirname(join(wt, p)), { recursive: true });
    cpSync(join(ROOT, p), join(wt, p));
  }
  mkdirSync(join(base, "handover"));
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
    .replaceAll(OUT_DIR, join(base, "handover"));
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
      HARNESS_ZONE: "WET",
      HARNESS_NOW: "202610290745",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

const MISMATCH_ID = "00000000-0000-4000-8000-0000000000a9";

function assertPass(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^SHADOW-READ PASSED: 17 OK \/ 0 VACUOUS \/ 0 FAIL\. The whole table is in /m);
  assert.match(r.stdout, /^verdicts: 17 OK \/ 0 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.doesNotMatch(r.stdout, /SHADOW-READ REVIEW/, "an all-OK table printed REVIEW");
  assert.equal(r.stdout.split("\n").filter((l) => /^ 22 \| passes on 2026-10-2[678] \(R11\)/.test(l)).length, 3, "the R11 rows were not printed");
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id from the mismatch list reached the terminal");
  assert.doesNotMatch(r.out, /SHADOW_SUMMARY|read only: on/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
}

function assertReview(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^SHADOW-READ REVIEW: no FAIL, no VACUOUS, verdicts 0 to 10 OK, .*This is NOT a pass/m);
  assert.doesNotMatch(r.stdout, /SHADOW-READ PASSED/, "a REVIEW table printed PASSED");
  assert.match(r.stdout, /^verdicts: 16 OK \/ 1 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id from the mismatch list reached the terminal");
}

function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /SHADOW-READ PASSED/, `${label}: a pass line after a fault`);
  assert.ok(!r.out.includes(MISMATCH_ID), `${label}: an appointment id from the mismatch list reached the terminal`);
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
      const text = block.replaceAll(APPLY_DIR, join(base, "apply"));
      const r = runOnce(shell, base, text);
      assertStop(r, /still reads PENDING, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|date|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled block passes on the clean profile, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const clean = runOnce(shell, base, text);
      assertPass(clean);
      const out = readFileSync(join(base, "handover", "shadow-read-20261029.out"), "utf8");
      assert.match(out, /SHADOW_SUMMARY/, "the transcript is not in the handover folder");
      assert.ok(out.includes(MISMATCH_ID), "the mismatch list is not in the transcript");
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

  test(`${shell}: the profile, the transaction, the clock, the pins, the worktree and the commit each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const profile = /a FAIL or a VACUOUS verdict, verdicts 0 to 10 are not all OK, or a verdict is missing/;
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "vacuous" }), profile, "vacuous");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "fail" }), profile, "fail");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "short" }), profile, "a verdict missing");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "reviewhead" }), profile, "REVIEW on a verdict that must be OK");
      assertReview(runOnce(shell, base, text, { HARNESS_TABLE: "review" }));
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nosummary" }), /no SHADOW_SUMMARY row/, "no summary");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nor11" }), /no R11 rows/, "no R11 rows");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const now of ["202610290714", "202610290700", "202610282359", "202610260900"]) {
        const r = runOnce(shell, base, text, { HARNESS_NOW: now });
        assertStop(r, /earlier than 2026-10-29 07:15 Lisbon/, `clock ${now}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the clock check: ${r.calls}`);
      }
      assertPass(runOnce(shell, base, text, { HARNESS_NOW: "202610290715" }));
      assertStop(runOnce(shell, base, text, { HARNESS_NOW: "soon" }), null, "a clock that is not a number");
      for (const zone of ["EST", "EDT", "UTC", ""]) {
        assertStop(runOnce(shell, base, text, { HARNESS_ZONE: zone }), /not WET or WEST/, `zone ${zone}`);
      }
      assertPass(runOnce(shell, base, text, { HARNESS_ZONE: "WEST" }));
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
      const r3 = runOnce(shell, base, filled(base).replaceAll(join(base, "handover"), join(base, "no-such-handover")));
      assertStop(r3, /handover folder is not there/, "missing handover folder");
      assert.ok(!/^(git|node|psql):/m.test(r3.calls), `a command ran without the handover folder: ${r3.calls}`);
      const f = join(base, "apply", DOC_PATH);
      const keep = readFileSync(f);
      writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
      assertStop(runOnce(shell, base, text), /not the one the dispatch names/, "changed document");
      writeFileSync(f, keep);
      assertPass(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
}

// ---- The read on a local database: every verdict flips on its own seeded fault. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const at = (s) => `timestamptz '${s} Europe/Lisbon'`;

/**
 * The base: one synthetic tenant; 12 synthetic visits (Monday 10-26 to Saturday 10-31 at 10:00 and
 * 15:00 Lisbon, visit n in time order, so visit 5 starts Wednesday 10:00) each with an
 * `appointment.create` audit row; a heartbeat every 15 minutes from Sunday 15:30 to Thursday 07:15;
 * for every mark due in the window a sleeping-job claim (mark + 2 s) and a `sent` ledger row (mark +
 * 3 s), and a shadow row in the transaction of the first pass at or after the mark; each heartbeat's
 * counts equal its rows. The three appointment foreign keys to people and clinics are dropped in the
 * throwaway so no synthetic person or clinic is needed: the read reads none of those tables.
 */
const SEED = `
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic shadow tenant', 'synthetic-shadow');
create table seed_appt as
  select ('00000000-0000-4000-8000-' || lpad(to_hex(row_number() over (order by z.ts)::int), 12, '0'))::uuid as id, z.ts as starts_at
    from (select (d::date + t) at time zone 'Europe/Lisbon' as ts
            from generate_series(date '2026-10-26', date '2026-10-31', interval '1 day') d,
                 (values (time '10:00'), (time '15:00')) v(t)) z;
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  select id, '${TENANT}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
         starts_at, starts_at + interval '1 hour', 'scheduled', 'staff', ${at("2026-10-01 09:00")}, ${at("2026-10-01 09:00")}
    from seed_appt;
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  select '${TENANT}', 'appointment.create', 'appointment', id, '{}', ${at("2026-10-01 09:00")} from seed_appt;
create table seed_pass as
  select z.p as pass_at, z.p + interval '150 milliseconds' as created_at,
         'run-' || to_char(z.p at time zone 'UTC', 'YYYYMMDDHH24MI') as pass_id,
         case when (z.p at time zone 'Europe/Lisbon')::time >= time '21:45'
              then ((z.p at time zone 'Europe/Lisbon')::date + time '23:00') at time zone 'Europe/Lisbon' end as look_ahead_before
    from (select ((d::date + time '07:00') + make_interval(mins => 15 * n)) at time zone 'Europe/Lisbon' + interval '3 seconds' as p
            from generate_series(date '2026-10-25', date '2026-10-29', interval '1 day') d,
                 generate_series(0, 59) n) z
   where z.p >= ${at("2026-10-25 15:30:00")} and z.p <= ${at("2026-10-29 07:20:00")};
create table seed_mark as
  select a.id as appointment_id, rm.offset_id, rm.channel, a.starts_at, a.starts_at - make_interval(mins => rm.minutes) as due_at
    from seed_appt a cross join (values ('48h', 'email', 2880), ('24h', 'sms', 1440)) rm(offset_id, channel, minutes)
   where a.starts_at - make_interval(mins => rm.minutes) >= ${at("2026-10-25 15:30:03")}
     and a.starts_at - make_interval(mins => rm.minutes) <= ${at("2026-10-29 07:20:00")};
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  select '${TENANT}', appointment_id, 'claim', offset_id, channel, starts_at, due_at, 'run', false, 1, due_at + interval '2 seconds'
    from seed_mark;
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  select '${TENANT}', appointment_id, channel, 'reminder.' || offset_id || '.' || channel, 'sent', due_at + interval '3 seconds'
    from seed_mark;
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', m.appointment_id, 'shadow', m.offset_id, m.channel, m.starts_at, m.due_at,
         floor(extract(epoch from (p.pass_at - m.due_at)) / 60)::int, false, p.pass_id, p.created_at
    from seed_mark m
    cross join lateral (select * from seed_pass sp where sp.pass_at >= m.due_at order by sp.pass_at limit 1) p;
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  select '${TENANT}', p.pass_id, 'shadow', p.pass_at, p.look_ahead_before,
         (select count(*) from public.reminder_claims c where c.kind = 'shadow' and c.created_at = p.created_at),
         (select count(*) from public.reminder_claims c where c.kind = 'shadow' and c.created_at = p.created_at),
         false, 0, p.created_at
    from seed_pass p;
`;

/** A visit of the case's own, with or without its scheduling save. */
const visit = (id, start, { status = "scheduled", saved = true, created = "2026-10-01 09:00", updated = created } = {}) => `
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${id}', '${TENANT}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${at(start)}, ${at(start)} + interval '1 hour',
          '${status}', 'staff', ${at(created)}, ${at(updated)});
${saved ? `insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${TENANT}', 'appointment.create', 'appointment', '${id}', '{}', ${at(created)});` : ""}`;
const runClaim = (id, offset, channel, start, due, outcome = "sent", reason = null) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${id}', 'claim', '${offset}', '${channel}', ${at(start)}, ${at(due)}, 'run', false, 1, ${at(due)} + interval '2 seconds');
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
  values ('${TENANT}', '${id}', '${channel}', 'reminder.${offset}.${channel}', '${outcome}', ${reason ? `'${reason}'` : "null"}, ${at(due)} + interval '3 seconds');`;
/** An audit row on a visit (no person, metadata of labels only). */
const audit = (id, action, when, metadata = "{}") => `
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${TENANT}', '${action}', 'appointment', '${id}', '${metadata}', ${at(when)});`;
/**
 * A move: an `appointment.reschedule` save whose metadata names the new start, as actions.ts writes it.
 * Every date here is after 2026-10-25, when Lisbon is on WET (UTC+0), so the ISO instant is the Lisbon
 * wall time with a Z.
 */
const moved = (id, when, toStart) => audit(id, "appointment.reschedule", when, `{"startsAt":"${toStart.replace(" ", "T")}:00.000Z"}`);
/** A reminder ledger row of its own (no claim beside it). */
const ledger = (id, offset, channel, when) => `
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${id}', '${channel}', 'reminder.${offset}.${channel}', 'sent', ${at(when)});`;
/** A sleeping-job claim of another start, written at `when`, whose mark is past the read (so it pairs with nothing). */
const strayClaim = (id, start, due, when) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${id}', 'claim', '24h', 'sms', ${at(start)}, ${at(due)}, 'run', false, 1, ${at(when)});`;
/** A shadow row in the transaction of the pass at `pass`, and that heartbeat's counts raised by one. */
const shadowRow = (id, offset, channel, start, due, pass, saved = false) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', '${id}', 'shadow', '${offset}', '${channel}', ${at(start)}, ${at(due)}, 0, ${saved}, p.pass_id, p.created_at
    from public.reminder_sweep_passes p where p.pass_at = ${at(pass)} + interval '3 seconds';
update public.reminder_sweep_passes set due_count = due_count + 1, recorded_count = recorded_count + 1
 where pass_at = ${at(pass)} + interval '3 seconds';`;

const ALL = Array.from({ length: 17 }, (_, n) => n);
/** Every verdict OK except the ones named. */
const only = (faults) => Object.fromEntries(ALL.map((n) => [n, faults[n] ?? "OK"]));

const CASES = [
  { name: "clean", seed: "", want: only({}) },
  {
    name: "empty: no heartbeat and no claim at all",
    seed: "delete from public.reminder_sweep_passes; delete from public.reminder_claims;",
    want: { 0: "OK", 1: "OK", 2: "VACUOUS", 3: "FAIL", 4: "FAIL", 5: "FAIL", ...Object.fromEntries([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => [n, "VACUOUS"])) },
  },
  {
    name: "null window: every heartbeat removed, the claims and shadow rows left in place",
    seed: "delete from public.reminder_sweep_passes;",
    want: { 0: "OK", 1: "OK", 2: "VACUOUS", 3: "FAIL", 4: "FAIL", 5: "FAIL", ...Object.fromEntries([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => [n, "VACUOUS"])) },
  },
  {
    name: "shadow only: the sleeping job's claim for Tuesday's 24h SMS at 10:00 removed",
    seed: `delete from public.reminder_dispatches where appointment_id = '${appt(5)}' and channel = 'sms';
           delete from public.reminder_claims where appointment_id = '${appt(5)}' and kind = 'claim' and offset_id = '24h';`,
    want: only({ 14: "FAIL" }),
    info: [[50, new RegExp(`${appt(5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "run only: the shadow row for Wednesday's 48h email at 10:00 removed, its heartbeat lowered",
    seed: `with d as (delete from public.reminder_claims where appointment_id = '${appt(9)}' and kind = 'shadow' and offset_id = '48h' returning created_at)
           update public.reminder_sweep_passes p set due_count = due_count - 1, recorded_count = recorded_count - 1 from d where p.created_at = d.created_at;`,
    want: only({ 15: "FAIL" }),
    info: [[51, new RegExp(`${appt(9)} \\| UNEXPLAINED`)]],
  },
  {
    name: "missing heartbeat: Monday 12:00",
    seed: `delete from public.reminder_sweep_passes where pass_at = ${at("2026-10-26 12:00:03")};`,
    want: only({ 3: "FAIL" }),
  },
  {
    name: "labelled mismatches only (R1, R2, R4, R6, S3, S4, S5): their days read REVIEW, never OK",
    seed: [
      // R4: no scheduling save; the sleeping job claimed and sent; no shadow row.
      visit(appt(0xa1), "2026-10-27 12:00", { saved: false }),
      runClaim(appt(0xa1), "24h", "sms", "2026-10-27 12:00", "2026-10-26 12:00"),
      // R2: claimed, then suppressed `status`; cancelled now; no shadow row.
      visit(appt(0xa2), "2026-10-28 12:00", { status: "cancelled" }),
      runClaim(appt(0xa2), "24h", "sms", "2026-10-28 12:00", "2026-10-27 12:00", "suppressed", "status"),
      // R1: claimed at its old start (Tuesday 16:05) at Monday 16:05:02, moved to 17:00 at Monday 16:10,
      // before the next pass (16:15); shadow and claim at the new start.
      visit(appt(0xa3), "2026-10-27 17:00"),
      runClaim(appt(0xa3), "24h", "sms", "2026-10-27 16:05", "2026-10-26 16:05"),
      moved(appt(0xa3), "2026-10-26 16:10", "2026-10-27 17:00"),
      runClaim(appt(0xa3), "24h", "sms", "2026-10-27 17:00", "2026-10-26 17:00"),
      shadowRow(appt(0xa3), "24h", "sms", "2026-10-27 17:00", "2026-10-26 17:00", "2026-10-26 17:00"),
      // S5: moved in at Wednesday 12:05, after its mark (12:00), taken by the 12:15 pass, no claim.
      visit(appt(0xa4), "2026-10-29 12:00", { updated: "2026-10-28 12:05" }),
      moved(appt(0xa4), "2026-10-28 12:05", "2026-10-29 12:00"),
      shadowRow(appt(0xa4), "24h", "sms", "2026-10-29 12:00", "2026-10-28 12:00", "2026-10-28 12:15", true),
      // S3: taken ahead by Monday's 21:45 pass for a 22:30 mark, moved at 22:00, before the mark.
      visit(appt(0xa5), "2026-10-29 22:30"),
      shadowRow(appt(0xa5), "24h", "sms", "2026-10-27 22:30", "2026-10-26 22:30", "2026-10-26 21:45"),
      moved(appt(0xa5), "2026-10-26 22:00", "2026-10-29 22:30"),
      // R6: claimed and sent at its mark (Monday 13:05), cancelled at 13:08, before the 13:15 pass.
      visit(appt(0xa7), "2026-10-27 13:05", { status: "cancelled" }),
      runClaim(appt(0xa7), "24h", "sms", "2026-10-27 13:05", "2026-10-26 13:05"),
      audit(appt(0xa7), "appointment.cancel", "2026-10-26 13:08", '{"toStatus":"cancelled"}'),
      // S4: taken by the shadow, a ledger row with no claim of any start (the claim failed open).
      visit(appt(0xa8), "2026-10-27 14:00"),
      shadowRow(appt(0xa8), "24h", "sms", "2026-10-27 14:00", "2026-10-26 14:00", "2026-10-26 14:00"),
      ledger(appt(0xa8), "24h", "sms", "2026-10-26 14:00:03"),
    ].join("\n"),
    want: only({ 12: "REVIEW", 14: "REVIEW", 16: "REVIEW" }),
    info: [
      [31, /marks due 2026-10-26, 24h sms, run_only: R1 moved after the claim, before the next pass \| 1 \|/],
      [31, /marks due 2026-10-26, 24h sms, run_only: R6 made not remindable between its mark and the next pass \| 1 \|/],
      [31, /marks due 2026-10-26, 24h sms, shadow_only: S3 moved after the 21:45 pass took its mark ahead \| 1 \|/],
      [31, /marks due 2026-10-26, 24h sms, shadow_only: S4 a ledger row with no claim \(the claim failed open\) \| 1 \|/],
      [31, /marks due 2026-10-27, 24h sms, run_only: R2 suppressed by the sleeping job as not remindable \| 1 \|/],
      [31, /marks due 2026-10-26, 24h sms, run_only: R4 never reminded: no scheduling save \(switch off\) \| 1 \|/],
      [31, /marks due 2026-10-28, 24h sms, shadow_only: S5 saved after its mark, before the pass \| 1 \|/],
    ],
  },
  {
    name: "R1 negative: moved a day after its claim stays UNEXPLAINED",
    seed: [
      visit(appt(0xb1), "2026-10-30 16:05"),
      runClaim(appt(0xb1), "24h", "sms", "2026-10-27 16:05", "2026-10-26 16:05"),
      moved(appt(0xb1), "2026-10-27 16:10", "2026-10-30 16:05"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "S3 negative: taken ahead, moved a day after its mark, stays UNEXPLAINED",
    seed: [
      visit(appt(0xb3), "2026-10-30 22:30"),
      shadowRow(appt(0xb3), "24h", "sms", "2026-10-27 22:30", "2026-10-26 22:30", "2026-10-26 21:45"),
      moved(appt(0xb3), "2026-10-27 22:00", "2026-10-30 22:30"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xb3)} \\| UNEXPLAINED`)]],
  },
  {
    name: "S2 withdrawn: claimed at the old start, moved, the shadow at the new start: the shadow row stays UNEXPLAINED",
    seed: [
      visit(appt(0xa6), "2026-10-27 11:30"),
      runClaim(appt(0xa6), "24h", "sms", "2026-10-27 11:20", "2026-10-26 11:20"),
      moved(appt(0xa6), "2026-10-26 11:25", "2026-10-27 11:30"),
      shadowRow(appt(0xa6), "24h", "sms", "2026-10-27 11:30", "2026-10-26 11:30", "2026-10-26 11:30"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [
      [50, new RegExp(`${appt(0xa6)} \\| UNEXPLAINED`)],
      [51, new RegExp(`${appt(0xa6)} \\| R1 moved after the claim`)],
    ],
  },
  {
    name: "S1 withdrawn: an early claim of this start beside a shadow-only row stays UNEXPLAINED",
    seed: [
      visit(appt(0xc7), "2026-10-27 14:45"),
      shadowRow(appt(0xc7), "24h", "sms", "2026-10-27 14:45", "2026-10-26 14:45", "2026-10-26 14:45"),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xc7)}', 'claim', '24h', 'sms', ${at("2026-10-27 14:45")}, ${at("2026-10-26 14:45")}, 'run', true, 1, ${at("2026-10-26 10:00")});`,
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xc7)} \\| UNEXPLAINED`)], [34, /\| 1, 0 \|/]],
  },
  {
    name: "S4 negative: another start's claim before the ledger row stays UNEXPLAINED",
    seed: [
      visit(appt(0xc4), "2026-10-27 14:30"),
      shadowRow(appt(0xc4), "24h", "sms", "2026-10-27 14:30", "2026-10-26 14:30", "2026-10-26 14:30"),
      runClaim(appt(0xc4), "24h", "sms", "2026-10-27 14:25", "2026-10-26 14:25"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xc4)} \\| UNEXPLAINED`)]],
  },
  {
    name: "S3 negative: a same-start reschedule after the look-ahead is not a move",
    seed: [
      visit(appt(0xc3), "2026-10-30 22:50"),
      shadowRow(appt(0xc3), "24h", "sms", "2026-10-27 22:50", "2026-10-26 22:50", "2026-10-26 21:45"),
      moved(appt(0xc3), "2026-10-26 22:00", "2026-10-27 22:50"),
      moved(appt(0xc3), "2026-10-27 22:00", "2026-10-30 22:50"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xc3)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R1 negative: a same-start reschedule after the claim is not a move",
    seed: [
      visit(appt(0xc1), "2026-10-30 16:25"),
      runClaim(appt(0xc1), "24h", "sms", "2026-10-27 16:25", "2026-10-26 16:25"),
      moved(appt(0xc1), "2026-10-26 16:27", "2026-10-27 16:25"),
      moved(appt(0xc1), "2026-10-27 16:27", "2026-10-30 16:25"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "S5 negative: a hand-set Confirmada after the mark stays UNEXPLAINED",
    seed: [
      visit(appt(0xc5), "2026-10-29 13:30", { updated: "2026-10-28 13:35" }),
      audit(appt(0xc5), "appointment.update", "2026-10-28 13:35", '{"toStatus":"confirmed"}'),
      shadowRow(appt(0xc5), "24h", "sms", "2026-10-29 13:30", "2026-10-28 13:30", "2026-10-28 13:45", true),
    ].join("\n"),
    want: only({ 16: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xc5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R2 negative: set back to Agendada after the claim stays UNEXPLAINED",
    seed: [
      visit(appt(0xc2), "2026-10-28 12:20"),
      runClaim(appt(0xc2), "24h", "sms", "2026-10-28 12:20", "2026-10-27 12:20", "suppressed", "status"),
      audit(appt(0xc2), "appointment.update", "2026-10-27 12:30", '{"toStatus":"scheduled"}'),
    ].join("\n"),
    want: only({ 14: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xc2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R6 negative: cancelled, then set back to Agendada after the claim, stays UNEXPLAINED",
    seed: [
      visit(appt(0xc6), "2026-10-27 13:20"),
      runClaim(appt(0xc6), "24h", "sms", "2026-10-27 13:20", "2026-10-26 13:20"),
      audit(appt(0xc6), "appointment.cancel", "2026-10-26 13:22", '{"toStatus":"cancelled"}'),
      audit(appt(0xc6), "appointment.update", "2026-10-26 13:40", '{"toStatus":"scheduled"}'),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xc6)} \\| UNEXPLAINED`)]],
  },
  {
    name: "sent with neither: a reminder send with no claim (it failed open) and no shadow row FAILs its day",
    seed: [
      visit(appt(0xd1), "2026-10-28 15:30"),
      ledger(appt(0xd1), "24h", "sms", "2026-10-27 15:30:03"),
    ].join("\n"),
    want: only({ 10: "FAIL", 14: "FAIL" }),
    info: [[52, new RegExp(`${appt(0xd1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "sent with neither on a partial day: a send dated Thursday 01:00 for a Wednesday mark FAILs verdict 10",
    seed: [
      visit(appt(0xd6), "2026-10-29 22:00"),
      ledger(appt(0xd6), "24h", "sms", "2026-10-29 01:00"),
    ].join("\n"),
    want: only({ 10: "FAIL" }),
    info: [[52, new RegExp(`${appt(0xd6)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R7: a reminder claimed only early, with no shadow row, is never dropped and reads REVIEW",
    seed: [
      visit(appt(0xd2), "2026-10-27 15:40"),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xd2)}', 'claim', '24h', 'sms', ${at("2026-10-27 15:40")}, ${at("2026-10-26 15:40")}, 'run', true, 1, ${at("2026-10-26 09:00")});`,
      ledger(appt(0xd2), "24h", "sms", "2026-10-26 09:00:01"),
    ].join("\n"),
    want: only({ 12: "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xd2)} \\| R7 claimed early only`)]],
  },
  {
    name: "a malformed startsAt (month 13, a word) cannot stop the read",
    seed: [
      visit(appt(0xd3), "2026-10-27 18:00"),
      runClaim(appt(0xd3), "24h", "sms", "2026-10-27 17:40", "2026-10-26 17:40"),
      audit(appt(0xd3), "appointment.reschedule", "2026-10-26 17:42", '{"startsAt":"2026-13-27T18:00:00.000Z"}'),
      audit(appt(0xd3), "appointment.reschedule", "2026-10-26 17:43", '{"startsAt":"not a date"}'),
    ].join("\n"),
    want: only({ 12: "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xd3)} \\| R1 moved after the claim`)]],
  },
  {
    name: "a row in the window with an unknown reminder, written before t0, FAILs verdict 10",
    seed: [
      visit(appt(0xd4), "2026-10-28 11:40"),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xd4)}', 'claim', '48h', 'sms', ${at("2026-10-28 11:40")}, ${at("2026-10-26 11:40")}, 'run', false, 1, ${at("2026-10-20 09:00")});`,
    ].join("\n"),
    want: only({ 10: "FAIL" }),
  },
  {
    name: "a reminder send of an unknown reminder in the window FAILs verdict 10",
    seed: [visit(appt(0xd5), "2026-10-30 09:00"), ledger(appt(0xd5), "72h", "sms", "2026-10-27 09:00")].join("\n"),
    want: only({ 10: "FAIL" }),
  },
  {
    name: "S6 withdrawn: taken ahead, cancelled before its mark, stays UNEXPLAINED",
    seed: [
      visit(appt(0xb6), "2026-10-27 22:40", { status: "cancelled" }),
      shadowRow(appt(0xb6), "24h", "sms", "2026-10-27 22:40", "2026-10-26 22:40", "2026-10-26 21:45"),
      audit(appt(0xb6), "appointment.cancel", "2026-10-26 22:00", '{"toStatus":"cancelled"}'),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xb6)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R6 negative: a save with no status change between the mark and the next pass stays UNEXPLAINED",
    seed: [
      visit(appt(0xb7), "2026-10-27 13:05"),
      runClaim(appt(0xb7), "24h", "sms", "2026-10-27 13:05", "2026-10-26 13:05"),
      audit(appt(0xb7), "appointment.update", "2026-10-26 13:08"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb7)} \\| UNEXPLAINED`)]],
  },
  {
    name: "S5 negative: saved after its mark with no scheduling save stays UNEXPLAINED",
    seed: [
      visit(appt(0xb8), "2026-10-29 13:00", { updated: "2026-10-28 13:05" }),
      audit(appt(0xb8), "appointment.update", "2026-10-28 13:05"),
      shadowRow(appt(0xb8), "24h", "sms", "2026-10-29 13:00", "2026-10-28 13:00", "2026-10-28 13:15", true),
    ].join("\n"),
    want: only({ 16: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xb8)} \\| UNEXPLAINED`)]],
  },
  {
    name: "a claim of another start written a day after the shadow row explains nothing",
    seed: [
      visit(appt(0xb2), "2026-10-27 11:00"),
      shadowRow(appt(0xb2), "24h", "sms", "2026-10-27 11:00", "2026-10-26 11:00", "2026-10-26 11:00"),
      strayClaim(appt(0xb2), "2026-10-31 11:00", "2026-10-30 11:00", "2026-10-27 11:00:02"),
    ].join("\n"),
    want: only({ 12: "FAIL" }),
    info: [[50, new RegExp(`${appt(0xb2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R2 negative: suppressed unconfirmed stays UNEXPLAINED",
    seed: [
      visit(appt(0xb4), "2026-10-28 12:00"),
      runClaim(appt(0xb4), "24h", "sms", "2026-10-28 12:00", "2026-10-27 12:00", "suppressed", "unconfirmed"),
    ].join("\n"),
    want: only({ 14: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb4)} \\| UNEXPLAINED`)]],
  },
  {
    name: "a send heartbeat",
    seed: `insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
           values ('${TENANT}', 'run-send', 'send', ${at("2026-10-29 07:20:03")}, 0, 0, false, 0, ${at("2026-10-29 07:20:04")});`,
    want: only({ 6: "FAIL" }),
  },
  {
    name: "a claim by taker sweep",
    seed: `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
           values ('${TENANT}', '${appt(12)}', 'claim', '24h', 'sms', ${at("2026-10-31 15:00")}, ${at("2026-10-30 15:00")}, 'sweep', true, 1, ${at("2026-10-29 07:15:05")});`,
    want: only({ 6: "FAIL" }),
  },
  {
    name: "a pass over the ceiling on Tuesday",
    seed: `update public.reminder_sweep_passes set over_ceiling = true, due_count = recorded_count + 1 where pass_at = ${at("2026-10-27 12:00:03")};`,
    want: only({ 7: "FAIL" }),
  },
  {
    name: "a heartbeat whose recorded count is one short",
    seed: `update public.reminder_sweep_passes set recorded_count = recorded_count - 1 where pass_at = ${at("2026-10-26 10:00:03")};`,
    want: only({ 8: "FAIL" }),
  },
  {
    name: "a mark taken twice",
    seed: shadowRow(appt(3), "24h", "sms", "2026-10-27 10:00", "2026-10-26 10:00", "2026-10-26 10:15"),
    want: only({ 9: "FAIL" }),
  },
  {
    name: "a claim with no mark",
    seed: `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, taker, attempt, created_at)
           values ('${TENANT}', '${appt(6)}', 'claim', '72h', 'sms', ${at("2026-10-28 15:00")}, 'run', 1, ${at("2026-10-27 09:00")});`,
    want: only({ 10: "FAIL" }),
  },
  { name: "the read's clock before Thursday 07:15", seed: "", clock: "2026-10-29 07:10:00", want: only({ 1: "FAIL" }) },
  {
    name: "a window that starts late: every heartbeat before Monday 09:00 removed",
    seed: `delete from public.reminder_sweep_passes where pass_at < ${at("2026-10-26 09:00")};`,
    want: only({ 2: "FAIL", 3: "FAIL" }),
  },
  {
    name: "MUTANT: the shadow set is dead",
    seed: "",
    mutate: (s) => s.replace("from c_all where kind = 'shadow'\n", "from c_all where kind = 'shadow-dead'\n"),
    want: only({ 11: "FAIL", 12: "FAIL", 13: "FAIL", 14: "FAIL", 15: "FAIL", 16: "FAIL" }),
  },
  {
    name: "MUTANT: the slot count is dead",
    seed: "",
    mutate: (s) => s.replace("and h.slot::time >= time '07:00' and h.slot::time <= time '21:45') as slots", "and false) as slots"),
    want: only({ 3: "FAIL", 4: "FAIL", 5: "FAIL" }),
  },
];

const PGURL = process.env.SHADOW_READ_TEST_PGURL;

test("the read on a local database: every verdict flips on its own seeded fault", { skip: PGURL ? false : "SHADOW_READ_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: SHADOW_READ_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => {
    const r = spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input });
    assert.equal(r.status, 0, `psql failed: ${r.stderr}`);
    return r.stdout;
  };
  const admin = (statement) => psql(PGURL, ["-c", statement]);
  const BASE = "shadowread_test_base";
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "shadowread-db-"));
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    // The schema is loaded leniently (a role or extension the lane has may be missing here); the
    // tables the read and the seed use must then exist, which the seed proves by running strictly.
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout });
    psql(dbUrl(BASE), [], SEED);
    for (const c of CASES) {
      const db = "shadowread_test_case";
      admin(`drop database if exists ${db}`);
      admin(`create database ${db} template ${BASE}`);
      if (c.seed) psql(dbUrl(db), [], c.seed);
      let text = sql.replace(CLOCK_LINE, `  select timestamptz '${c.clock ?? "2026-10-29 07:30:00"} Europe/Lisbon' as t1`);
      assert.notEqual(text, sql, "the clock line was not replaced");
      if (c.mutate) {
        const mutated = c.mutate(text);
        assert.notEqual(mutated, text, `${c.name}: the mutant changed nothing`);
        text = mutated;
      }
      const file = join(work, "read.sql");
      writeFileSync(file, text);
      const out = psql(dbUrl(db), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", "-f", file, "-c", "rollback"]);
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f"));
      const verdicts = Object.fromEntries(rows.filter((r) => r[4] !== "INFO").map((r) => [Number(r[0]), r[4]]));
      assert.deepEqual(verdicts, c.want, `${c.name}: verdicts\n${out}`);
      for (const [n, re] of c.info ?? []) {
        assert.ok(rows.some((r) => Number(r[0]) === n && re.test(r.join(" | "))), `${c.name}: no INFO row ${n} matching ${re}\n${out}`);
      }
      admin(`drop database ${db}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});

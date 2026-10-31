// HOR-DEFAULT-READ (2026-10-31): the read-only measurement of who the Horarios clinic-hours default
// (pull request #1683) would affect. Its document and its one block agree with each other, the read
// writes nothing and prints no person, every halt in the block is explicit (proven by fault
// injection), and, on a local database, every count is exact on a seeded throwaway, every verdict
// flips on its own seeded fault, and the mutation sweep (MUTANTS, and every tenant condition found
// mechanically) is caught except for the listed equivalent survivors.
//
// WHAT THIS PROVES, with no database:
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing, controls no transaction, reads the clock in exactly one place;
//   * the read names no column that holds a person, prints no id, and prints no name but a clinic's;
//   * the document's verdict table names the ten verdicts the read prints;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; one psql
//     call, `begin read only` ... `rollback`, writing to the handover file only with `> ${OUT} 2>&1`;
//     it fetches `refs/pull/<N>/head` and checks the fetched head and the checkout by full sha;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`), every external command a stub, each call made to fail
//     in turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool chain
//     stopped. Under bash always; under zsh wherever zsh is installed (not on the GitHub runner);
//   * the block prints PASSED only on ten single OK verdicts (0 to 9), REVIEW (exit 0, never PASSED)
//     when verdict 5 alone reads REVIEW, and STOPs on a FAIL, a VACUOUS, a REVIEW elsewhere, a verdict
//     missing, doubled or extra, a missing summary row, a transaction that is not read only, a Lisbon
//     zone that is not WET or WEST, a pinned file that differs, a dirty worktree, a moved pull request
//     head, and a missing apply directory, handover folder or environment file.
//
// WITH A LOCAL DATABASE (HOR_READ_TEST_PGURL names one on 127.0.0.1 or localhost whose `public`
// schema is the repository's): the read runs on a seeded throwaway per case, as the block runs it,
// with its one clock line set to a fixed instant, and every case is asserted exactly. Then every
// mutant in MUTANTS and every tenant condition (TENANT_MUTANTS) is run against every case and must
// make at least one case's assertion fail, except TENANT_SURVIVORS, which must be exactly the
// survivors. Any other host is refused. Without the variable those cases are skipped.
//
// Run: node --test scripts/read-hor-default-20261031.test.mjs

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

const DOC_PATH = "docs/read-hor-default-20261031.md";
const SIDECAR = "docs/read-hor-default-20261031.sha256";
const READ_PATH = "scripts/db/read-hor-default-20261031.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const OUT_NAME = "hor-default-read-20261031.out";
const PRHEAD = "a".repeat(40);
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
const PRNUM = (block.match(/^PRNUM=([0-9]+)$/m) || [])[1];

/** The read with its comments removed and every string literal emptied. */
const code = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");

test("the sidecar pins the document", () => {
  assert.equal(read(SIDECAR).trim(), `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table, in the block and in the owner's copy step", () => {
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(doc.slice(0, doc.indexOf("## THE BLOCK")).includes(s), `the pins table does not carry ${path}'s sha256`);
  }
  const fallback = doc.slice(doc.indexOf("## The owner's fallback"));
  assert.ok(fallback.includes(`= "${sha256(sql)}" ] && pbcopy`), "the owner's copy step does not check the read's sha256");
  assert.doesNotMatch(doc, /SHAREAD_VALUE|PRNUM_VALUE|REHEARSAL_TABLE/, "a placeholder is left in the document");
  assert.ok(doc.includes(`refs/pull/${PRNUM}/head`), "the pins table names another pull request");
  assert.ok(!doc.includes("\u2014") && !sql.includes("\u2014"), "an em dash in the document or the read");
});

test("the read writes nothing, controls no transaction, and reads the clock once", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "verdict 0 must read the transaction's own setting");
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.equal(sql.split("\n").filter((l) => l === CLOCK_LINE).length, 1, "the one clock line is not where a rehearsal replaces it");
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date|current_time)\b/i, "a second clock");
});

test("the read never names a column that holds a person, prints no id, and no name but a clinic's", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|email|address|notes|nif|patient_id|practitioner_id|created_by|actor_user_id|job_title|slug|settings|body|ip|color)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /(id|tenant_id|user_id|location_id)::text|\b(id|tenant_id|user_id|location_id)\s*\|\|/, "the read prints an id");
  const names = code.match(/[a-z_]*\.?\bname\b/g) || [];
  assert.deepEqual(names, ["l.name"], "a name other than the clinic's is read");
  assert.equal((code.match(/to_jsonb\(/g) || []).length, 1, "to_jsonb is used more than once");
  assert.ok(sql.includes("to_jsonb(l) ->> 'saturday_closes_at' as saturday_closes_at"), "the row's JSON is used for anything but the Saturday value");
  assert.doesNotMatch(code, /\b(l|locations|ml|rl|rsl)\.saturday_closes_at\b/, "the Saturday column is selected by name (42703 when it is absent)");
});

test("the document's verdict table and the read agree on the ten verdicts", () => {
  const nums = [...sql.matchAll(/^ {2}select (\d+),\s*$/gm)].map((m) => Number(m[1])).filter((n) => n < 20);
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8, 9], "the read's verdict rows moved");
  assert.match(sql, /^ {2}select 0 as n,$/m);
  for (let n = 0; n <= 9; n++) assert.ok(doc.includes(`\n| ${n} | `), `the verdict table has no row ${n}`);
  assert.match(doc, /10 OK \/ 0 REVIEW \/ 0 VACUOUS \/ 0 FAIL/);
});

test("the block's shape: pipefail on line 2, no set -e, no # line, one read-only psql, the PR head by full sha", () => {
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
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback" > \$\{OUT\} 2>&1 \|\| \{/);
  assert.doesNotMatch(block, /\btee\b/, "the block uses tee");
  assert.doesNotMatch(block, /\b(cat|head|tail|less|more)\b[^\n]*\$\{OUT\}/, "the block prints the transcript");
  assert.equal((block.match(/=PENDING$/gm) || []).length, 2);
  assert.ok(lines[2] === "PRHEAD=PENDING" && lines[3] === "DOCSHA=PENDING");
  assert.match(lines[4], /^PRNUM=[1-9][0-9]*$/);
  assert.ok(lines.includes(`OUT=${OUT_DIR}/${OUT_NAME}`), "the transcript does not go to the handover folder");
  assert.ok(lines.includes('git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request\'s head could not be fetched. Nothing was read"; exit 1; }'));
  assert.ok(lines.some((l) => l.startsWith('[ "${FH}" = "${PRHEAD}" ] ||')), "the fetched head is not checked by full sha");
  assert.ok(lines.some((l) => l.startsWith('[ "${HD}" = "${PRHEAD}" ] ||')), "the checkout is not checked by full sha");
  assert.doesNotMatch(block, /origin\/main|merge-base/, "the block reads main");
  const envAt = lines.findIndex((l) => l.startsWith("set -o allexport && . "));
  const urlAt = lines.findIndex((l) => l.startsWith('[ -n "${DATABASE_URL_DIRECT}" ] || { echo "STOP: '));
  const guardAt = lines.findIndex((l) => l.startsWith("node scripts/assert-production-target.mjs || "));
  assert.ok(envAt > 0 && urlAt === envAt + 1 && guardAt === urlAt + 1, "the empty-URL check is not between the env file and the guard");
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

const vrow = (n, v = "OK") => ` ${String(n).padStart(2)} | ${n}. a verdict | x | y | ${v}`;
const VERDICTS = Array.from({ length: 10 }, (_, n) => vrow(n));
const SUMMARY = " 50 | HOR_SUMMARY | eligible=18 own=9 switch_runs=7 switch_refuses=2 zero_in_force=9 clinics_0=4 clinics_1=4 clinics_2plus=1 get_default=5 expired_only=2 expired_only_get_default=1 no_active_row=7 portal_visible=4 | counts only | INFO";
const CLINIC_NAME = "Clinic Harness Name";
const table = (rows) => [
  "BEGIN", "SET",
  " hor_read_transaction ", "----------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...rows,
  " 20 | the read's clock (Lisbon) | 2026-10-31 08:00, today 2026-10-31 | information | INFO",
  " 21 | tenant 1: eligible (active, bookable, not NESA) | 16 | information | INFO",
  ` 40 | tenant 1 / ${CLINIC_NAME}: hours | active, opens 08:00, closes 21:00, midday none, Saturday no column | information | INFO`,
  SUMMARY,
  "(14 rows)", "", "ROLLBACK",
].join("\n");
const TABLE_OK = table(VERDICTS);
const FIXTURES = {
  ok: TABLE_OK,
  review: table(VERDICTS.map((r, n) => (n === 5 ? vrow(5, "REVIEW") : r))),
  reviewelse: table(VERDICTS.map((r, n) => (n === 3 ? vrow(3, "REVIEW") : r))),
  vacuous: table(VERDICTS.map((r, n) => (n === 6 ? vrow(6, "VACUOUS") : r))),
  fail: table(VERDICTS.map((r, n) => (n === 7 ? vrow(7, "FAIL") : r))),
  short: table(VERDICTS.slice(0, 9)),
  doubled: table([...VERDICTS, vrow(4)]),
  doubledout: table([...VERDICTS.filter((_, n) => n !== 8), vrow(4)]),
  extra: table([...VERDICTS, vrow(12)]),
  nosummary: TABLE_OK.replace(`${SUMMARY}\n`, ""),
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
      fetch) [ "$2" = origin ] || { echo "harness: unexpected git $*" >&2; exit 97; }; [ "$3" = "refs/pull/$HARNESS_PRNUM/head" ] || { echo "fatal: couldn't find remote ref $3" >&2; exit 128; }; [ "$#" = 3 ] || { echo "harness: unexpected git $*" >&2; exit 97; }; exit 0;;
      checkout) exit 0;;
      rev-parse)
        case "$2" in
          FETCH_HEAD) echo "$HARNESS_FETCHED"; exit 0;;
          HEAD) echo "$HARNESS_HEAD"; exit 0;;
          *) echo "harness: unexpected git $*" >&2; exit 97;;
        esac;;
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
  const base = mkdtempSync(join(tmpdir(), "horread-harness-"));
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
    .replace("PRHEAD=PENDING", `PRHEAD=${PRHEAD}`)
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
      HARNESS_HEAD: PRHEAD,
      HARNESS_FETCHED: PRHEAD,
      HARNESS_PRNUM: PRNUM,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_TABLE: "ok",
      HARNESS_ZONE: "WET",
      HARNESS_NOW: "202610310800",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertPass(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^HOR-DEFAULT-READ PASSED: 10 OK \/ 0 REVIEW \/ 0 VACUOUS \/ 0 FAIL\. The whole table is in /m);
  assert.match(r.stdout, /^verdicts: 10 OK \/ 0 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.ok(r.stdout.split("\n").includes(SUMMARY), "the HOR_SUMMARY row was not echoed as printed");
  assert.doesNotMatch(r.stdout, /HOR-DEFAULT-READ REVIEW/, "an all-OK table printed REVIEW");
  assert.ok(!r.out.includes(CLINIC_NAME), "a clinic row reached the terminal");
  assert.doesNotMatch(r.out, /read only: on|tenant 1: eligible/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
}

function assertReview(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^HOR-DEFAULT-READ REVIEW: no FAIL, no VACUOUS, every verdict OK but verdict 5: .*This is NOT a pass/m);
  assert.doesNotMatch(r.stdout, /HOR-DEFAULT-READ PASSED/, "a REVIEW table printed PASSED");
  assert.match(r.stdout, /^verdicts: 9 OK \/ 1 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.ok(!r.out.includes(CLINIC_NAME), "a clinic row reached the terminal");
}

function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /HOR-DEFAULT-READ (PASSED|REVIEW)/, `${label}: a pass line after a fault`);
  assert.ok(!r.out.includes(CLINIC_NAME), `${label}: a clinic row reached the terminal`);
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
      const out = readFileSync(join(base, "handover", OUT_NAME), "utf8");
      assert.ok(out.includes(CLINIC_NAME), "the transcript is not in the handover folder");
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

  test(`${shell}: the profile, the transaction, the zone, the pins, the worktree and the head each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const profile = /a FAIL or a VACUOUS verdict, a REVIEW outside verdict 5, or a verdict missing, doubled or extra/;
      for (const t of ["vacuous", "fail", "short", "doubled", "doubledout", "extra", "reviewelse"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), profile, t);
      }
      assertReview(runOnce(shell, base, text, { HARNESS_TABLE: "review" }));
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nosummary" }), /no HOR_SUMMARY row/, "no summary");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const zone of ["EST", "EDT", "UTC", ""]) {
        const r = runOnce(shell, base, text, { HARNESS_ZONE: zone });
        assertStop(r, /not WET or WEST/, `zone ${zone}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the zone check: ${r.calls}`);
      }
      assertPass(runOnce(shell, base, text, { HARNESS_ZONE: "WEST" }));
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_FETCHED: "b".repeat(40) }), /the pull request's head is \[b{40}\]/, "moved head");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "c".repeat(40) }), /not on the head commit/, "checkout");
      assertStop(runOnce(shell, base, text, { HARNESS_PRNUM: "1" }), /could not be fetched/, "another pull request");
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
      for (const [label, body] of [["no DATABASE_URL_DIRECT", "OTHER_SETTING=x\n"], ["an empty DATABASE_URL_DIRECT", "DATABASE_URL_DIRECT=\n"]]) {
        writeFileSync(join(base, "prod-empty.env"), body);
        const r = runOnce(shell, base, filled(base).replaceAll(join(base, "prod.env"), join(base, "prod-empty.env")));
        assertStop(r, /set no DATABASE_URL_DIRECT/, label);
        assert.ok(!/^(node|psql):/m.test(r.calls), `${label}: the guard or psql ran: ${r.calls}`);
      }
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

// ---- The read on a local database: exact counts, every verdict's own fault, and a mutation sweep. ----

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const TA = id(0xa0001);
const TB = id(0xb0001);
const LV = id(0x1001);
const CB = id(0x1002);
const ARQ = id(0x1003);
const BL = id(0x1004);
const S = { S1: id(0x2001), S2: id(0x2002), S3: id(0x2003), S4: id(0x2004), S5: id(0x2005), SB: id(0x2006) };

/**
 * Synthetic people, by what each one tests. `t` is the tenant, `f` the flags (active, bookable,
 * shared), `m` the clinics they are members of (staff_locations), `r` their schedule rows
 * [clinic, valid_from, valid_until, is_active, row tenant], `s` their mapped services (a name, or
 * [name, row tenant]), `m` entries a clinic or [clinic, row tenant]. A row tenant other than the
 * person's own is a cross-tenant row: the application's tenant-scoped reads never see it. The clock is
 * 2026-10-31 10:00 Lisbon, so today is 2026-10-31 and the portal's horizon ends 2026-11-14.
 */
const P = {
  d1: { n: 0x101, t: TA, m: [LV] }, // no rows, one clinic: the default
  d2: { n: 0x102, t: TA, m: [LV, CB] }, // no rows, two clinics: the default at both
  d3: { n: 0x103, t: TA, m: [ARQ] }, // no rows, only an archived clinic: nothing
  d4: { n: 0x104, t: TA, m: [[BL, TB]] }, // no rows; its only membership row carries another tenant
  x1: { n: 0x105, t: TA, m: [LV], r: [[LV, null, "2026-10-30", true]], s: ["S1"] }, // only expired rows: newly the default
  x2: { n: 0x106, t: TA, m: [[BL, TB]], r: [[CB, null, "2026-10-30", true]] }, // only expired rows; its only membership row carries another tenant
  i1: { n: 0x107, t: TA, m: [LV], r: [[LV, null, null, false]], s: ["S1"] }, // only a switched-off row
  o1: { n: 0x108, t: TA, m: [LV], r: [[LV, null, null, true], [BL, null, null, true, TB]], s: ["S1"] }, // own, portal at LV; a row carrying another tenant at its clinic
  o2: { n: 0x109, t: TA, m: [CB, [BL, TB]], r: [[CB, null, "2026-10-31", true]], s: ["S2"] }, // own, ends today, portal at CB; a membership row carrying another tenant
  o3: { n: 0x10a, t: TA, m: [LV], r: [[CB, null, null, true], [LV, null, null, true, TB]], s: ["S1"] }, // rows at CB, member LV: refused; a row at LV carrying another tenant
  o4: { n: 0x10b, t: TA, m: [LV, ARQ], r: [[ARQ, null, null, true]], s: ["S1"] }, // rows at the archived clinic: refused
  o5: { n: 0x10c, t: TA, m: [LV], r: [[LV, "2026-12-01", null, true]], s: ["S1"] }, // starts after the horizon
  o6: { n: 0x10d, t: TA, m: [LV], r: [[LV, "2026-11-10", null, true]], s: ["S1"] }, // starts inside the horizon
  o7: { n: 0x10e, t: TA, m: [LV], r: [[LV, null, null, true]], s: ["S3", "S4", "S5"] }, // no portal service
  o8: { n: 0x10f, t: TA, m: [LV], r: [[LV, null, null, true]], s: ["S2"] }, // a service of another clinic
  o9: { n: 0x110, t: TA, m: [LV], r: [[LV, null, null, true], [CB, null, "2026-10-30", true]], s: [["SB", TA], ["SB", TB]] }, // an expired row elsewhere; two cross-tenant mappings
  o10: { n: 0x116, t: TA, m: [LV], r: [[LV, null, null, true], [BL, null, null, true, TA]] }, // a row at another tenant's clinic
  o11: { n: 0x117, t: TA, m: [LV], r: [[LV, null, null, true, TB]], s: ["S1"] }, // its only row carries another tenant
  n1: { n: 0x111, t: TA, f: [true, true, true], m: [LV] }, // NESA, no rows
  n2: { n: 0x112, t: TA, f: [true, true, true], m: [LV], r: [[LV, null, null, true]], s: ["S1"] }, // NESA with rows
  n3: { n: 0x115, t: TA, f: [true, false, true] }, // a shared resource that is not bookable
  r1: { n: 0x113, t: TA, f: [true, false, false], m: [LV], r: [[LV, null, null, true]], s: ["S1"] }, // not bookable
  r2: { n: 0x114, t: TA, f: [false, true, false], m: [LV], r: [[LV, null, null, true]], s: ["S1"] }, // inactive
  b1: { n: 0x201, t: TB, m: [BL] }, // tenant 2, the default
  b2: { n: 0x202, t: TB, m: [LV] }, // tenant 2, a membership row pointing at tenant 1's clinic
  b3: { n: 0x203, t: TB, r: [[LV, null, null, true, TA]], s: [["S1", TA]] }, // tenant 2, a row and a mapping at tenant 1
};

function seedSql() {
  const out = [];
  out.push(`insert into public.tenants (id, name, slug, created_at) values
    ('${TA}', 'Synthetic tenant A', 'synthetic-hor-a', timestamptz '2026-01-01 00:00 UTC'),
    ('${TB}', 'Synthetic tenant B', 'synthetic-hor-b', timestamptz '2026-02-01 00:00 UTC');`);
  out.push(`insert into public.locations (id, tenant_id, name, is_active, opens_at, closes_at, midday_closed_from, midday_closed_to) values
    ('${LV}', '${TA}', 'Clinic LV', true, '08:00', '21:00', null, null),
    ('${CB}', '${TA}', 'Clinic CB', true, '08:00', '20:00', '13:00', '14:00'),
    ('${ARQ}', '${TA}', 'Clinic ARQ', false, '09:00', '18:00', null, null),
    ('${BL}', '${TB}', 'Clinic BL', true, '08:00', '20:00', null, null);`);
  out.push(`insert into public.services (id, tenant_id, location_id, name, is_active, internal_only, patient_bookable) values
    ('${S.S1}', '${TA}', null, 'Synthetic S1', true, false, true),
    ('${S.S2}', '${TA}', '${CB}', 'Synthetic S2', true, false, true),
    ('${S.S3}', '${TA}', null, 'Synthetic S3', true, true, true),
    ('${S.S4}', '${TA}', null, 'Synthetic S4', false, false, true),
    ('${S.S5}', '${TA}', null, 'Synthetic S5', true, false, false),
    ('${S.SB}', '${TB}', null, 'Synthetic SB', true, false, true);`);
  for (const [k, p] of Object.entries(P)) {
    const [a, b, s] = p.f ?? [true, true, false];
    const uid = id(p.n);
    out.push(`insert into public.users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values ('${uid}', '${p.t}', 'synthetic-${k}@example.invalid', 'Synthetic ${k}', ${a}, ${b}, ${s});`);
    for (const m of p.m ?? []) {
      const [loc, rt] = Array.isArray(m) ? m : [m, p.t];
      out.push(`insert into public.staff_locations (tenant_id, user_id, location_id) values ('${rt}', '${uid}', '${loc}');`);
    }
    for (const [loc, from, until, active, rt] of p.r ?? []) {
      out.push(`insert into public.availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_from, valid_until, is_active)
        values ('${rt ?? p.t}', '${uid}', '${loc}', 1, '09:00', '17:00', ${from ? `'${from}'` : "null"}, ${until ? `'${until}'` : "null"}, ${active});`);
    }
    for (const sv of p.s ?? []) {
      const [name, rt] = Array.isArray(sv) ? sv : [sv, p.t];
      out.push(`insert into public.therapist_services (tenant_id, therapist_user_id, service_id) values ('${rt}', '${uid}', '${S[name]}');`);
    }
  }
  return out.join("\n");
}

const T1 = "tenant 1";
const T2 = "tenant 2";
const C = { LV: "tenant 1 / Clinic LV", CB: "tenant 1 / Clinic CB", ARQ: "tenant 1 / Clinic ARQ (archived)", BL: "tenant 2 / Clinic BL" };
/** The tenant rows 21 to 32 in order. */
const tenantRows = (scope, vals) => Object.fromEntries(vals.map((v, i) => [`${21 + i} ${scope}`, String(v)]));
/** The clinic rows 40 to 47 in order. */
const clinicRows = (scope, vals) => Object.fromEntries(vals.map((v, i) => [`${40 + i} ${scope}`, String(v)]));
const ALLOK = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [n, "OK"]));
const verdicts = (faults) => ({ ...ALLOK, ...faults });

const BASE_ROWS = {
  "20 the read's clock (Lisbon), and the day \"in force\" is measured from": "2026-10-31 10:00, today 2026-10-31",
  ...tenantRows(T1, [18, 10, 8, 2, 8, 3, 4, 1, 2, 1, 6, "2, 2, 1"]),
  ...tenantRows(T2, [3, 0, 0, 0, 3, 2, 1, 0, 0, 0, 3, "0, 0, 0"]),
  ...clinicRows(C.LV, ["active, opens 08:00, closes 21:00, midday none, Saturday no column", 14, 5, 1, 7, 0, 2, 2]),
  ...clinicRows(C.CB, ["active, opens 08:00, closes 20:00, midday 13:00 to 14:00, Saturday no column", 2, 1, 0, 2, 1, 0, 2]),
  ...clinicRows(C.ARQ, ["archived, opens 09:00, closes 18:00, midday none, Saturday no column", 0, 0, 0, 1, 1, 0, 0]),
  ...clinicRows(C.BL, ["active, opens 08:00, closes 20:00, midday none, Saturday no column", 1, 1, 0, 0, 0, 0, 0]),
  "50 HOR_SUMMARY": "eligible=21 own=10 switch_runs=8 switch_refuses=2 zero_in_force=11 clinics_0=5 clinics_1=5 clinics_2plus=1 get_default=6 expired_only=2 expired_only_get_default=1 no_active_row=9 portal_visible=4",
  "1 tenants": "2",
  "3 active clinics whose closes_at is not after opens_at (the default generates nothing there)": "0 of 3",
  "4 active clinics whose midday closure is half set, not ordered, or outside its hours": "0 of 3 (with a closure: 1)",
  "5 the column locations.saturday_closes_at (information_schema, pg_attribute)": "absent",
  "7 the groups add up": "21 = 8 + 2 + 11; 11 = 5 + 5 + 1; default 6, expired-only 2, recount 6",
  "8 the clinic counts add up": "per clinic 17 and 7, per therapist 17 and 7",
  "9 therapists the portal shows today with no own row in force (the default must never reach the portal)": "0 of 4",
};

const CASES = [
  { name: "base: every count exact, every verdict OK", seed: "", want: ALLOK, rows: BASE_ROWS, full: true },
  {
    name: "empty: no tenant at all",
    seed: `delete from public.therapist_services; delete from public.availability_templates; delete from public.staff_locations;
           delete from public.services; delete from public.users; delete from public.locations; delete from public.tenants;`,
    want: verdicts({ 1: "VACUOUS", 2: "VACUOUS", 3: "VACUOUS", 4: "VACUOUS", 6: "VACUOUS", 7: "VACUOUS", 8: "VACUOUS", 9: "VACUOUS" }),
    rows: { "50 HOR_SUMMARY": "eligible=0 own=0 switch_runs=0 switch_refuses=0 zero_in_force=0 clinics_0=0 clinics_1=0 clinics_2plus=0 get_default=0 expired_only=0 expired_only_get_default=0 no_active_row=0 portal_visible=0" },
  },
  {
    name: "nobody eligible: every user not bookable",
    seed: "update public.users set is_bookable = false;",
    want: verdicts({ 6: "VACUOUS", 7: "VACUOUS", 8: "VACUOUS", 9: "VACUOUS" }),
    rows: { [`32 ${T1}`]: "0, 22, 1", [`32 ${T2}`]: "0, 3, 0" },
  },
  {
    name: "no active clinic: every clinic archived",
    seed: "update public.locations set is_active = false;",
    want: verdicts({ 2: "VACUOUS", 3: "VACUOUS", 4: "VACUOUS", 8: "VACUOUS", 9: "VACUOUS" }),
    rows: { ...tenantRows(T1, [18, 10, 0, 10, 8, 8, 0, 0, 2, 0, 6, "2, 2, 1"]) },
  },
  {
    name: "a clinic that closes when it opens",
    seed: `alter table public.locations drop constraint locations_open_before_close;
           update public.locations set closes_at = opens_at where id = '${LV}';`,
    want: verdicts({ 3: "FAIL" }),
    rows: { "3 active clinics whose closes_at is not after opens_at (the default generates nothing there)": "1 of 3" },
  },
  {
    name: "a clinic that closes 30 seconds after it opens (the same minute; its CHECK still holds)",
    seed: `update public.locations set opens_at = '08:00:00', closes_at = '08:00:30' where id = '${LV}';`,
    want: verdicts({ 3: "FAIL" }),
    rows: { "3 active clinics whose closes_at is not after opens_at (the default generates nothing there)": "1 of 3" },
  },
  {
    name: "a midday closure half set",
    seed: `alter table public.locations drop constraint locations_midday_pair;
           update public.locations set midday_closed_to = null where id = '${CB}';`,
    want: verdicts({ 4: "FAIL" }),
  },
  {
    name: "a midday closure outside the clinic's hours",
    seed: `alter table public.locations drop constraint locations_midday_inside_hours;
           update public.locations set midday_closed_from = '07:00', midday_closed_to = '08:30' where id = '${CB}';`,
    want: verdicts({ 4: "FAIL" }),
  },
  {
    name: "a midday closure that ends before it starts",
    seed: `alter table public.locations drop constraint locations_midday_order;
           update public.locations set midday_closed_from = '14:00', midday_closed_to = '13:00' where id = '${CB}';`,
    want: verdicts({ 4: "FAIL" }),
  },
  {
    name: "the Saturday column exists (#1682 applied): REVIEW, its value printed, nothing else moves",
    seed: `alter table public.locations add column saturday_closes_at time;
           update public.locations set saturday_closes_at = '13:00' where id = '${CB}';`,
    want: verdicts({ 5: "REVIEW" }),
    rows: {
      ...BASE_ROWS,
      "5 the column locations.saturday_closes_at (information_schema, pg_attribute)": "present",
      [`40 ${C.LV}`]: "active, opens 08:00, closes 21:00, midday none, Saturday column present, no time",
      [`40 ${C.CB}`]: "active, opens 08:00, closes 20:00, midday 13:00 to 14:00, Saturday closes 13:00:00",
      [`40 ${C.ARQ}`]: "archived, opens 09:00, closes 18:00, midday none, Saturday column present, no time",
      [`40 ${C.BL}`]: "active, opens 08:00, closes 20:00, midday none, Saturday column present, no time",
    },
  },
  {
    name: "the Saturday column added and dropped again reads absent",
    seed: "alter table public.locations add column saturday_closes_at time; alter table public.locations drop column saturday_closes_at;",
    want: ALLOK,
    rows: BASE_ROWS,
  },
  {
    name: "today is the Lisbon date: at 00:30 WEST a row that ended the day before has expired",
    clock: "2026-08-16 00:30:00",
    seed: `insert into public.users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
             values ('${id(0x120)}', '${TA}', 'synthetic-e1@example.invalid', 'Synthetic e1', true, true, false);
           insert into public.staff_locations (tenant_id, user_id, location_id) values ('${TA}', '${id(0x120)}', '${LV}');
           insert into public.availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_until, is_active)
             values ('${TA}', '${id(0x120)}', '${LV}', 2, '09:00', '17:00', '2026-08-15', true);`,
    want: ALLOK,
    rows: {
      "20 the read's clock (Lisbon), and the day \"in force\" is measured from": "2026-08-16 00:30, today 2026-08-16",
      [`29 ${T1}`]: "1",
      [`30 ${T1}`]: "1",
    },
  },
];

/**
 * THE NAMED MUTANTS, one text change each (the tenant conditions are swept separately below). Each `from` must occur exactly once in
 * the read; the mutant must make at least one case above fail its assertions.
 */
const MUTANTS = [
  ["in force: today counts", "a.valid_until >= day.today) as in_force", "a.valid_until > day.today) as in_force"],
  ["in force: an open row counts", "(a.valid_until is null or a.valid_until >= day.today) as in_force", "(a.valid_until >= day.today) as in_force"],
  ["own rows: active only", "   where a.is_active = true\n),\nmember", "   where true\n),\nmember"],
  ["eligible: active", "(u.is_active = true and u.is_bookable", "(true and u.is_bookable"],
  ["eligible: bookable", "and u.is_bookable = true and u.is_shared_resource is distinct from true", "and true and u.is_shared_resource is distinct from true"],
  ["eligible: not NESA", " and u.is_shared_resource is distinct from true) as eligible", ") as eligible"],
  ["member: active clinic", "   where ml.is_active = true\n", "   where true\n"],
  ["has rows in force", "o2.user_id = p.user_id and o2.in_force", "o2.user_id = p.user_id"],
  ["refusal: rows in force only", "o3.user_id = p.user_id and o3.in_force", "o3.user_id = p.user_id"],
  ["refusal: membership of that clinic", "\n                                       and m2.location_id = o3.location_id", ""],
  ["refusal: archived clinics included", "rl.tenant_id = o3.tenant_id\n", "rl.tenant_id = o3.tenant_id and rl.is_active\n"],
  ["bucket: 0 clinics", "f.clinics = 0) as m0", "f.clinics <= 1) as m0"],
  ["bucket: 1 clinic", "f.clinics = 1) as m1", "f.clinics >= 1) as m1"],
  ["bucket: 2 or more", "f.clinics >= 2) as m2", "f.clinics > 2) as m2"],
  ["default: a member somewhere", "not f.in_force and f.clinics > 0) as dflt", "not f.in_force) as dflt"],
  ["expired-only: has active rows", "(where f.eligible and f.has_active_rows and not f.in_force) as expired_only", "(where f.eligible and not f.in_force) as expired_only"],
  ["expired-only default: a member", " and f.clinics > 0) as expired_default", ") as expired_default"],
  ["no active row", "not f.has_active_rows) as no_active_row", "not f.in_force) as no_active_row"],
  ["context: NESA", "f.is_active and f.is_bookable and f.is_shared_resource) as nesa", "f.is_active and f.is_shared_resource) as nesa"],
  ["today: Lisbon", "(clock.t1 at time zone 'Europe/Lisbon')::date as today", "(clock.t1 at time zone 'UTC')::date as today"],
  ["portal: horizon", "av.valid_from  <= day.today + 14", "av.valid_from  <= day.today + 365"],
  ["portal: not expired", "(av.valid_until is null or av.valid_until >= day.today)", "true"],
  ["portal: not NESA", "\n     and u.is_shared_resource = false", ""],
  ["portal: bookable", "\n     and u.is_bookable = true", ""],
  ["portal: active user", "\n     and u.is_active = true", ""],
  ["portal: active clinic", "   where c.is_active = true\n", "   where true\n"],
  ["portal: active template", "\n          and av.is_active = true", ""],
  ["portal: template at this clinic", "\n          and av.location_id = c.location_id", ""],
  ["portal: the therapist's own mapping", "\n          and ts.therapist_user_id = u.id", ""],
  ["portal: active service", "\n          and sv.is_active = true", ""],
  ["portal: not internal", "\n          and sv.internal_only = false", ""],
  ["portal: patient-bookable", "\n          and sv.patient_bookable = true", ""],
  ["portal: service at this clinic", "(sv.location_id is null or sv.location_id = c.location_id)", "true"],
  ["clinic: members eligible", "where cm.location_id = c.location_id and cf.eligible) as members", "where cm.location_id = c.location_id) as members"],
  ["clinic: default here", "cf.eligible and not cf.in_force) as default_here", "cf.eligible) as default_here"],
  ["clinic: expired here", "not cf.in_force and cf.has_active_rows) as expired_here", "not cf.in_force) as expired_here"],
  ["clinic: own here in force", "co.tenant_id = c.tenant_id and co.in_force and cf.eligible\n             and not exists", "co.tenant_id = c.tenant_id and cf.eligible\n             and not exists"],
  ["clinic: own here (row 44) in force", "co.tenant_id = c.tenant_id and co.in_force and cf.eligible) as own_here", "co.tenant_id = c.tenant_id and cf.eligible) as own_here"],
  ["clinic: refused here, membership of this clinic", "\n                                and cm.location_id = co.location_id)) as refused_here", ")) as refused_here"],
  ["clinic: elsewhere, rows here", "\n                                and co.location_id = cm.location_id and co.in_force)) as elsewhere_here", "\n                                and co.in_force)) as elsewhere_here"],
  ["clinic: portal here", "from portal pv where pv.location_id = c.location_id) as portal_here", "from portal pv where pv.tenant_id = c.tenant_id) as portal_here"],
  ["recount: in force", "\n                        and (ra.valid_until is null or ra.valid_until >= day.today))", ")"],
  ["recount: active clinic", "rs.user_id = ru.id and rsl.is_active)", "rs.user_id = ru.id)"],
  ["verdict 3: strictly after", "when count(*) filter (where is_active and not (date_trunc('minute', opens_at::interval) < date_trunc('minute', closes_at::interval))) > 0 then 'FAIL'", "when count(*) filter (where is_active and not (date_trunc('minute', opens_at::interval) <= date_trunc('minute', closes_at::interval))) > 0 then 'FAIL'"],
  ["verdict 3: whole minutes", "when count(*) filter (where is_active and not (date_trunc('minute', opens_at::interval) < date_trunc('minute', closes_at::interval))) > 0 then 'FAIL'", "when count(*) filter (where is_active and not (opens_at < closes_at)) > 0 then 'FAIL'"],
  ["verdict 4: both or neither", "or (midday_closed_from is not null and midday_closed_to is not null\n                    and midday_closed_from < midday_closed_to", "or (true\n                    and midday_closed_from < midday_closed_to"],
  ["verdict 4: ordered", "\n                    and midday_closed_from < midday_closed_to\n                    and midday_closed_from >= opens_at and midday_closed_to <= closes_at))) > 0", "\n                    and midday_closed_from >= opens_at and midday_closed_to <= closes_at))) > 0"],
  ["verdict 4: inside the hours", "\n                    and midday_closed_from >= opens_at and midday_closed_to <= closes_at))) > 0", "))) > 0"],
  ["verdict 5: information_schema probe", "ic.column_name = 'saturday_closes_at'", "ic.column_name = 'saturday_closes_x'"],
  ["verdict 5: pg_attribute probe", "pa.attname = 'saturday_closes_at'", "pa.attname = 'saturday_closes_x'"],
  ["verdict 5: present is REVIEW", "when by_info and by_catalog then 'REVIEW'", "when by_info and by_catalog then 'OK'"],
];

/**
 * THE TENANT SWEEP: every `a.tenant_id = b.tenant_id` condition of the read, found mechanically and
 * replaced by `true` one at a time. Named by its text and its occurrence among identical texts.
 */
const TENANT_RE = /\b\w+\.tenant_id = \w+\.tenant_id/g;
const TENANT_MUTANTS = (() => {
  const seen = new Map();
  return [...sql.matchAll(TENANT_RE)].map((m) => {
    const k = (seen.get(m[0]) ?? 0) + 1;
    seen.set(m[0], k);
    return [`tenant: ${m[0]} #${k}`, (s) => s.slice(0, m.index) + "true" + s.slice(m.index + m[0].length)];
  });
})();

/**
 * Tenant conditions no data can catch, each with its reason. The test asserts this list is exactly
 * the sweep's survivors, so a new survivor or a newly caught one both fail it.
 */
const TENANT_SURVIVORS = [
  ["tenant: m2.tenant_id = o3.tenant_id #1", "equivalent: a membership row's tenant is its clinic's (member), and so is the own row's (rl), so at one clinic the two always agree"],
  ["tenant: cm.tenant_id = co.tenant_id #1", "equivalent: the own row's tenant is the clinic's (co.tenant_id = c.tenant_id), and so is the membership row's (member)"],
  ["tenant: pf.tenant_id = pv.tenant_id #1", "equivalent: a portal row carries its user's own tenant (u.tenant_id = c.tenant_id), and a user id is unique across tenants"],
];

const PGURL = process.env.HOR_READ_TEST_PGURL;

test("the read on a local database: exact counts, every verdict's own fault, and the mutation sweep caught", { skip: PGURL ? false : "HOR_READ_TEST_PGURL is not set" }, (t) => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: HOR_READ_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psqlRun = (target, args, input) => spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input });
  const psql = (target, args, input) => {
    const r = psqlRun(target, args, input);
    assert.equal(r.status, 0, `psql failed: ${r.stderr}`);
    return r.stdout;
  };
  const admin = (statement) => psql(PGURL, ["-c", statement]);
  const BASE = "horread_test_base";
  const caseDb = (i) => `horread_test_case_${i}`;
  for (let i = 0; i < CASES.length; i++) admin(`drop database if exists ${caseDb(i)}`);
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "horread-db-"));
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    // Loaded leniently (a role or extension the lane has may be missing here); the seed then runs
    // strictly, which proves every table and column it and the read use exists.
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout });
    psql(dbUrl(BASE), [], seedSql());
    for (let i = 0; i < CASES.length; i++) {
      admin(`create database ${caseDb(i)} template ${BASE}`);
      if (CASES[i].seed) psql(dbUrl(caseDb(i)), [], CASES[i].seed);
    }

    /** Run a text of the read on case i; return the assertion failures (empty when the case holds). */
    const failures = (text, i) => {
      const c = CASES[i];
      const clocked = text.replace(CLOCK_LINE, `  select timestamptz '${c.clock ?? "2026-10-31 10:00:00"} Europe/Lisbon' as t1`);
      assert.notEqual(clocked, text, "the clock line was not replaced");
      const file = join(work, "read.sql");
      writeFileSync(file, clocked);
      const r = psqlRun(dbUrl(caseDb(i)), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", "-f", file, "-c", "rollback"]);
      if (r.status !== 0) return [`psql failed: ${r.stderr.trim()}`];
      const rows = r.stdout.split("\n").filter(Boolean).map((l) => l.split("\u001f"));
      const out = [];
      const got = Object.fromEntries(rows.filter((x) => x[4] !== "INFO").map((x) => [Number(x[0]), x[4]]));
      if (JSON.stringify(got) !== JSON.stringify(c.want)) out.push(`verdicts ${JSON.stringify(got)} want ${JSON.stringify(c.want)}`);
      const keyed = new Map();
      for (const x of rows) {
        const k = `${x[0]} ${x[1].includes(": ") ? x[1].slice(0, x[1].indexOf(": ")) : x[1]}`;
        keyed.set(k, keyed.has(k) ? null : x[2]);
      }
      for (const [k, v] of Object.entries(c.rows ?? {})) {
        const have = keyed.get(k);
        if (have !== v) out.push(`row ${k}: ${have} want ${v}`);
      }
      if (c.full) {
        const info = rows.filter((x) => x[4] === "INFO" && Number(x[0]) >= 21 && Number(x[0]) <= 47);
        const want = Object.keys(c.rows).filter((k) => { const n = Number(k.split(" ")[0]); return n >= 21 && n <= 47; });
        if (info.length !== want.length) out.push(`${info.length} tenant and clinic rows, want ${want.length}`);
      }
      return out;
    };

    for (let i = 0; i < CASES.length; i++) {
      const f = failures(sql, i);
      assert.deepEqual(f, [], `${CASES[i].name}:\n${f.join("\n")}`);
      t.diagnostic(`case as expected: ${CASES[i].name}`);
    }

    const sweep = (name, mutated) => {
      assert.notEqual(mutated, sql, `the mutant "${name}" changed nothing`);
      for (let i = 0; i < CASES.length; i++) {
        if (failures(mutated, i).length > 0) { t.diagnostic(`mutant killed: ${name} <- ${CASES[i].name}`); return true; }
      }
      t.diagnostic(`mutant SURVIVED: ${name}`);
      return false;
    };
    const survivors = [];
    for (const [name, from, to] of MUTANTS) {
      assert.equal(sql.split(from).length, 2, `the mutant "${name}" does not find its text exactly once`);
      if (!sweep(name, sql.replace(from, to))) survivors.push(name);
    }
    assert.deepEqual(survivors, [], `mutants no case caught: ${survivors.join("; ")}`);
    const tenantSurvivors = [];
    for (const [name, apply] of TENANT_MUTANTS) if (!sweep(name, apply(sql))) tenantSurvivors.push(name);
    assert.deepEqual(tenantSurvivors, TENANT_SURVIVORS.map(([n]) => n), "the tenant sweep's survivors are not the listed ones");
    t.diagnostic(`mutants: ${MUTANTS.length} named, ${TENANT_MUTANTS.length} tenant conditions, ${tenantSurvivors.length} tenant survivors`);
  } finally {
    rmSync(work, { recursive: true, force: true });
    for (let i = 0; i < CASES.length; i++) spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${caseDb(i)}`], { encoding: "utf8" });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});

// SHADOW-COMPARE (2026-10-31): R20's read-only comparison of the reminder sweep's shadow with the
// sleeping job, re-run over every Lisbon day from Monday 2026-10-26 to the read's clock, with R22's
// predicates naming one more run-only label (R8). Its document and its one block agree with each
// other, the read writes nothing, every halt in the block is explicit (proven by fault injection),
// and, on a local database, every verdict flips on its own seeded fault and R8 names exactly the
// shape R22 found.
//
// WHAT THIS PROVES, with no database:
//   * the read's copy of R20 (from `clock as (` to the end of `pc`) is R20's lines 145 to 444 with
//     exactly the two named substitutions and nothing else, compared exactly;
//   * the read's copy of R22 (from `off_min as (` to the end of `summ`) is byte for byte the span of
//     scripts/db/read-sweep-unexplained-20261030.sql lines 413 to 586 at 3a7a0686 (the head of
//     #1672, not on main): its sha256 is pinned here;
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing, controls no transaction, reads the clock once, names no column that
//     holds a person and prints no tenant id;
//   * the document's verdict table names the verdicts the read prints;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; one psql
//     call, `begin read only` ... `rollback`, writing to the handover file only with `> ${OUT} 2>&1`;
//     it fetches `refs/pull/<N>/head` and checks the fetched head and the checkout by full sha;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`), every external command a stub, each call made to
//     fail in turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool
//     chain stopped. Under bash always; under zsh wherever zsh is installed (not on the GitHub
//     runner);
//   * the block prints PASSED only when every verdict is OK over 4 or more full days, REVIEW (exit
//     0, never PASSED) when the only non-OK verdicts are agreement verdicts reading REVIEW, and
//     STOPs on a FAIL, a VACUOUS, a REVIEW outside 11 and 12, fewer than 4 full days, a day count
//     that differs between verdicts 3, 11 and 12, a missing or doubled single verdict, an extra
//     verdict, a missing summary row, missing R11 rows, a transaction that is not read only, a
//     Lisbon clock before 2026-10-30 07:15 or in another zone, a pinned file that differs, a dirty
//     worktree, a moved pull request head, and a missing apply directory, handover folder or
//     environment file.
//
// WITH A LOCAL DATABASE (SHADOW_COMPARE_1031_TEST_PGURL names one on 127.0.0.1 or localhost whose
// `public` schema is the repository's): the read runs on a seeded throwaway per case, as the block
// runs it, with its one clock line set to a fixed instant. Any other host is refused. Without the
// variable those cases are skipped.
//
// Run: node --test scripts/read-shadow-compare-20261031.test.mjs

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

const DOC_PATH = "docs/read-shadow-compare-20261031.md";
const SIDECAR = "docs/read-shadow-compare-20261031.sha256";
const READ_PATH = "scripts/db/read-shadow-compare-20261031.sql";
const R20_PATH = "scripts/db/read-shadow-compare-20261029.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const OUT_NAME = "shadow-compare-20261031.out";
const PRHEAD = "a".repeat(40);
const CLOCK_LINE = "  select now() as t1";
const R8_LABEL = "R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)";

/** R22's span: scripts/db/read-sweep-unexplained-20261030.sql lines 413 to 586 at 3a7a0686, joined by "\n". */
const R22_SPAN_LINES = 174;
const R22_SPAN_SHA256 = "c86ca78e7a86ffbe54173814c2bcaf9f7dce461337c8a5275689c3d3660a930d";

/** The only two substitutions the read makes in R20's span. */
const R20_SUBSTITUTIONS = [
  [
    "         timestamptz '2026-10-29 07:15:00 Europe/Lisbon' as closes\n",
    "         timestamptz '2026-10-30 07:15:00 Europe/Lisbon' as closes\n",
  ],
  [
    "full_day as (\n  select g.d::date as d, g.n\n    from (values (date '2026-10-26', 0), (date '2026-10-27', 1), (date '2026-10-28', 2)) as g(d, n)\n),\n",
    "full_day as (\n  select g.d::date as d, (g.d::date - date '2026-10-26') as n\n    from clock, generate_series(timestamp '2026-10-26 00:00:00', (((clock.t1 at time zone 'Europe/Lisbon') - interval '7 hours 15 minutes')::date - 1)::timestamp, interval '1 day') as g(d)\n),\n",
  ],
];

const doc = read(DOC_PATH);
const sql = read(READ_PATH);

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

test("the read's copy of R20 is R20's lines 145 to 444 with exactly the two named substitutions", () => {
  const r20 = read(R20_PATH).split("\n");
  assert.equal(r20[144], "clock as (", "R20's line 145 moved");
  assert.match(r20[444], /^agree as \($/, "R20's pc no longer ends at line 444");
  let span = r20.slice(144, 444).join("\n");
  for (const [from, to] of R20_SUBSTITUTIONS) {
    assert.equal(span.split(from).length, 2, `R20's span does not carry this line once: ${from}`);
    span = span.replace(from, to);
  }
  const mine = sql.split("\n");
  const start = mine.indexOf("clock as (");
  assert.equal(mine[start - 1], "with");
  const n = span.split("\n").length;
  assert.equal(mine.slice(start, start + n).join("\n"), span, "the copied span differs from R20's beyond the two substitutions");
  assert.equal(sql.split(span).length, 2, "the span appears more than once");
  assert.ok(doc.includes(`lines ${start + 1} to ${start + n} of the read`), "the document names the wrong lines for R20's copy");
});

test("the read's copy of R22 is byte for byte its lines 413 to 586 at 3a7a0686", () => {
  const mine = sql.split("\n");
  const start = mine.indexOf("off_min as (");
  assert.ok(start > 0, "the read has no off_min");
  const span = mine.slice(start, start + R22_SPAN_LINES);
  assert.equal(span.at(-1), "),");
  assert.equal(span.at(-4), "    from u", "the span does not end at the end of summ");
  assert.equal(sha256(span.join("\n")), R22_SPAN_SHA256, "the copied span differs from R22's");
  const r8At = mine.indexOf("r8 as (");
  assert.ok(r8At >= start + R22_SPAN_LINES, "r8 sits inside R22's span");
  assert.ok(mine.slice(start + R22_SPAN_LINES, r8At).every((l) => l.startsWith("--")), "something other than a comment sits between R22's span and r8");
  assert.ok(doc.includes(`lines ${start + 1} to ${start + R22_SPAN_LINES} of the read`), "the document names the wrong lines for R22's copy");
  // The as-of-the-pass bound the mutant removes is in the span.
  assert.ok(sql.includes("and e.same_tenant and e.scheduling\n                    and e.created_at <= h.created_at) as p7,"));
});

test("R8 is defined once, after R20's labels, and only on R20's run-only UNEXPLAINED marks", () => {
  assert.equal(sql.split(`'${R8_LABEL}'`).length, 2, "the R8 label is not written exactly once");
  assert.match(sql, /case when p\.side = 'run_only' and p\.category = 'UNEXPLAINED'\n/);
  for (const c of ["s.in_range > 0", "s.f7 = s.in_range", "s.f1 = 0", "s.f2 = 0 and s.u2 = 0", "s.f3 = 0 and s.u3 = 0", "s.f6 = 0", "s.f8 = 0"]) {
    assert.ok(sql.includes(c), `r8 lost its condition ${c}`);
  }
  assert.ok(doc.includes(R8_LABEL), "the document does not name the R8 label exactly");
  // Nothing after pcl reads pc directly: every verdict and row reads the labelled comparison.
  const after = sql.slice(sql.indexOf("\nagree as ("));
  assert.doesNotMatch(after.replace(/--[^\n]*/g, ""), /\bfrom pc\b|join pc\b/, "a verdict reads pc, not pcl");
});

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

test("the read never names a column that holds a person, prints no tenant id and no metadata text", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|patient_2_id|practitioner_id|created_by|actor_user_id|provider_message_id|body|ip|room|name)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\|/, "the read prints a tenant id");
  assert.doesNotMatch(sql, /\|\|\s*l\.metadata|metadata->>'[a-zA-Z]+'\s*\|\|/, "metadata text is printed");
  assert.match(sql, /appointment_id::text \|\| ' \| ' \|\| category as observed/, "appointment ids are printed only in the mismatch list");
  assert.equal((code.match(/appointment_id::text/g) || []).length, 1, "an appointment id is printed outside the mismatch list");
  assert.match(sql, /where rk <= 500\n/, "the mismatch list is not capped at 500 a side");
});

test("the document's verdict table and the read agree on the verdicts", () => {
  const nums = [...sql.matchAll(/^  select (\d+)(?: \+ [a-z.]+)?,\s*$/gm)].map((m) => Number(m[1])).filter((n) => n < 20);
  assert.deepEqual(nums, [1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 14], "the read's verdict rows moved");
  assert.match(sql, /^ {2}select 0 as n,$/m);
  assert.match(sql, /select 11 \+ a\.rn,/);
  for (const n of ["| 0 |", "| 1 |", "| 2 |", "| 3 |", "| 6 |", "| 7 |", "| 8 |", "| 9 |", "| 10 |", "| 11 |", "| 12 |", "| 13 |", "| 14 |"]) {
    assert.ok(doc.includes(n), `the verdict table has no row ${n}`);
  }
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
  assert.equal(psql.length, 1);
  assert.ok(!lines.some((l) => /(^|[;|&] *)psql /.test(l) && !/^psql /.test(l)), "a psql call that does not start its line");
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
  assert.ok(!/(^|[^A-Za-z])\/tmp\//.test(block), "the block writes under /tmp");
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `a halt that is not one STOP and exit 1: ${l}`);
  }
});

// ---- The fault-injection harness (R22's, with R20's REVIEW and R11 rows). ----

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const realOf = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH }, encoding: "utf8" });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const STUBBED = ["git", "node", "psql", "date", "grep", "awk", "cut", "shasum", "rm"];
const FAKED = ["git", "node", "psql", "date"];
const MISMATCH_ID = "00000000-0000-4000-8000-0000000000a9";
const DAYS4 = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];

const vrow = (n, text, v = "OK") => ` ${String(n).padStart(2)} | ${n}. ${text} | x | y | ${v}`;
function verdictRows(days) {
  return [
    vrow(0, "read only"), vrow(1, "the clock"), vrow(2, "the window"),
    ...days.map((d) => vrow(3, `heartbeats on ${d}`)),
    vrow(6, "sent nothing"), vrow(7, "ceiling"), vrow(8, "accounting"), vrow(9, "twice"), vrow(10, "nothing falls out"),
    ...days.map((d) => vrow(11, `agreement, marks due ${d}, 48h email`)),
    ...days.map((d) => vrow(12, `agreement, marks due ${d}, 24h sms`)),
    vrow(13, "no mark stays UNEXPLAINED"), vrow(14, "R8 explains at least the 10 marks"),
  ];
}
const table = (days) => [
  "BEGIN", "SET",
  " shadow_compare_transaction ", "----------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...verdictRows(days),
  " 20 | window: first shadow heartbeat | 2026-10-25 15:30:03 | 2026-10-30 08:00:00 | 2026-10-30 07:45:03 | 2026-10-26 to 2026-10-29 (4) | information | INFO",
  ...days.map((d) => ` 22 | passes on ${d} (R11) | 60, 60, 0, 1 to 1, 4 | information | INFO`),
  " 40 | SHADOW_SUMMARY | full days 2026-10-26 to 2026-10-29: both=16 shadow_only=0 run_only=0 matched_share=100.0% | unexplained 0 | INFO",
  ` 51 | run_only 2026-10-28 10:00 48h email | ${MISMATCH_ID} | ${R8_LABEL} | information | INFO`,
  "(31 rows)", "", "ROLLBACK",
].join("\n");
const TABLE_OK = table(DAYS4);
const FIXTURES = {
  ok: TABLE_OK,
  five: table([...DAYS4, "2026-10-30"]),
  three: table(DAYS4.slice(0, 3)),
  vacuous: TABLE_OK.replace(vrow(11, "agreement, marks due 2026-10-27, 48h email"), vrow(11, "agreement, marks due 2026-10-27, 48h email", "VACUOUS")),
  review: TABLE_OK.replace(vrow(12, "agreement, marks due 2026-10-28, 24h sms"), vrow(12, "agreement, marks due 2026-10-28, 24h sms", "REVIEW")),
  reviewhead: TABLE_OK.replace(vrow(3, "heartbeats on 2026-10-27"), vrow(3, "heartbeats on 2026-10-27", "REVIEW")),
  review13: TABLE_OK.replace(vrow(13, "no mark stays UNEXPLAINED"), vrow(13, "no mark stays UNEXPLAINED", "REVIEW")),
  fail: TABLE_OK.replace(vrow(13, "no mark stays UNEXPLAINED"), vrow(13, "no mark stays UNEXPLAINED", "FAIL")),
  fail14: TABLE_OK.replace(vrow(14, "R8 explains at least the 10 marks"), vrow(14, "R8 explains at least the 10 marks", "FAIL")),
  short: TABLE_OK.replace(vrow(12, "agreement, marks due 2026-10-29, 24h sms") + "\n", ""),
  no14: TABLE_OK.replace(vrow(14, "R8 explains at least the 10 marks") + "\n", ""),
  extra: TABLE_OK.replace(vrow(6, "sent nothing"), vrow(5, "a stray verdict") + "\n" + vrow(6, "sent nothing")),
  double13: TABLE_OK.replace(vrow(13, "no mark stays UNEXPLAINED"), vrow(13, "no mark stays UNEXPLAINED") + "\n" + vrow(13, "no mark stays UNEXPLAINED")),
  daydrift: TABLE_OK.replace(vrow(3, "heartbeats on 2026-10-29"), vrow(3, "heartbeats on 2026-10-29") + "\n" + vrow(3, "heartbeats on 2026-10-30")),
  nosummary: TABLE_OK.replace(/^ 40 \| SHADOW_SUMMARY[^\n]*\n/m, ""),
  nor11: TABLE_OK.replace(/^ 22 \|[^\n]*\n/gm, ""),
  notreadonly: TABLE_OK.replace(" read only: on", " read only: off"),
};
for (const [k, v] of Object.entries(FIXTURES)) if (k !== "ok") assert.notEqual(v, TABLE_OK, `the fixture ${k} changed nothing`);

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

const PRNUM = (block.match(/^PRNUM=([0-9]+)$/m) || [])[1];

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "shadowcompare1031-harness-"));
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

function assertPass(r, ok = 22, days = 4) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, new RegExp(`^SHADOW-COMPARE-1031 PASSED: ${ok} OK / 0 VACUOUS / 0 FAIL over ${days} full days\\. The whole table is in `, "m"));
  assert.match(r.stdout, new RegExp(`^verdicts: ${ok} OK / 0 REVIEW / 0 VACUOUS / 0 FAIL$`, "m"));
  assert.match(r.stdout, new RegExp(`^full days: ${days}$`, "m"));
  assert.doesNotMatch(r.stdout, /SHADOW-COMPARE-1031 REVIEW/, "an all-OK table printed REVIEW");
  assert.equal(r.stdout.split("\n").filter((l) => /^ 22 \| passes on 2026-1[01]-\d\d \(R11\)/.test(l)).length, days, "the R11 rows were not printed");
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id from the mismatch list reached the terminal");
  assert.doesNotMatch(r.out, /SHADOW_SUMMARY|read only: on|R8 no scheduling/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
}

function assertReview(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^SHADOW-COMPARE-1031 REVIEW: no FAIL, no VACUOUS, every verdict but the agreement verdicts OK, .*This is NOT a pass/m);
  assert.doesNotMatch(r.stdout, /SHADOW-COMPARE-1031 PASSED/, "a REVIEW table printed PASSED");
  assert.match(r.stdout, /^verdicts: 21 OK \/ 1 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id from the mismatch list reached the terminal");
}

function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /SHADOW-COMPARE-1031 (PASSED|REVIEW)/, `${label}: a pass or review line after a fault`);
  assert.ok(!r.out.includes(MISMATCH_ID), `${label}: an appointment id reached the terminal`);
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
      const r = runOnce(shell, base, block.replaceAll(APPLY_DIR, join(base, "apply")));
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
      assert.match(out, /SHADOW_SUMMARY/, "the transcript is not in the handover folder");
      assert.ok(out.includes(MISMATCH_ID), "the mismatch list is not in the transcript");
      const calls = clean.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 16, `too few calls were stubbed: ${calls.length}`);
      for (const n of STUBBED) assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called, so its failure is not proven`);
      for (const id of calls) assertStop(runOnce(shell, base, text, { HARNESS_FAIL: id }), null, `${shell} fail ${id}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the profile, the transaction, the clock, the zone, the pins, the worktree and the PR head each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const profile = /a FAIL or a VACUOUS verdict, a REVIEW outside the agreement verdicts, fewer than 4 full days, or a verdict missing, doubled or extra/;
      for (const t of ["vacuous", "fail", "fail14", "short", "no14", "extra", "double13", "daydrift", "three", "reviewhead", "review13"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), profile, t);
      }
      assertReview(runOnce(shell, base, text, { HARNESS_TABLE: "review" }));
      assertPass(runOnce(shell, base, text, { HARNESS_TABLE: "five" }), 25, 5);
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nosummary" }), /no SHADOW_SUMMARY row/, "no summary");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nor11" }), /no R11 rows/, "no R11 rows");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const now of ["202610300714", "202610300700", "202610292359", "202610290900"]) {
        const r = runOnce(shell, base, text, { HARNESS_NOW: now });
        assertStop(r, /earlier than 2026-10-30 07:15 Lisbon/, `clock ${now}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the clock check: ${r.calls}`);
      }
      assertPass(runOnce(shell, base, text, { HARNESS_NOW: "202610300715" }));
      assertStop(runOnce(shell, base, text, { HARNESS_NOW: "soon" }), null, "a clock that is not a number");
      for (const zone of ["EST", "EDT", "UTC", ""]) assertStop(runOnce(shell, base, text, { HARNESS_ZONE: zone }), /not WET or WEST/, `zone ${zone}`);
      assertPass(runOnce(shell, base, text, { HARNESS_ZONE: "WEST" }));
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_FETCHED: "b".repeat(40) }), /the pull request's head is \[b{40}\]/, "moved head");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "c".repeat(40) }), /not on the head commit/, "checkout");
      assertStop(runOnce(shell, base, text, { HARNESS_PRNUM: "1" }), /head could not be fetched/, "another pull request");
      assertStop(runOnce(shell, base, filled(base, { docsha: "d".repeat(64) })), /not the one the dispatch names/, "docsha");
      for (const [p, re] of [[READ_PATH, /read on disk is not the reviewed file/], [GUARD, /target guard on disk/], [MODULE, /module on disk/], [DOC_PATH, /not the one the dispatch names/]]) {
        const f = join(base, "apply", p);
        const keep = readFileSync(f);
        writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
        assertStop(runOnce(shell, base, text), re, `changed ${p}`);
        writeFileSync(f, keep);
      }
      const r1 = runOnce(shell, base, text.replaceAll(join(base, "apply"), join(base, "no-such-apply-dir")));
      assertStop(r1, /the apply worktree is not there/, "missing apply directory");
      assert.ok(!/^(git|node|psql|shasum|rm|awk|cut):/m.test(r1.calls), `a command ran after the cd failed: ${r1.calls}`);
      const r2 = runOnce(shell, base, text.replaceAll(join(base, "prod.env"), join(base, "no-such.env")));
      assertStop(r2, /production environment file could not be loaded/, "missing env file");
      assert.ok(!/^(node|psql):/m.test(r2.calls), `the guard or psql ran without the env file: ${r2.calls}`);
      const r3 = runOnce(shell, base, text.replaceAll(join(base, "handover"), join(base, "no-such-handover")));
      assertStop(r3, /handover folder is not there/, "missing handover folder");
      assert.ok(!/^(git|node|psql):/m.test(r3.calls), `a command ran without the handover folder: ${r3.calls}`);
      assertPass(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
}

// ---- The read on a local database: every verdict flips on its own seeded fault, R8 names R22's shape. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000f002";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const at = (s) => `timestamptz '${s} Europe/Lisbon'`;
const READ_CLOCK = "2026-10-31 08:00:00";
const FULL_DAYS = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];

/**
 * The base, R20's shape carried to Saturday 10-31 08:00 (the read's clock in every case, so Monday
 * 10-26 to Friday 10-30 are full days and Sunday 10-25 and Saturday 10-31 are partial): one synthetic
 * tenant (and a second with no visit of its own); 16 synthetic visits (Monday 10-26 to Tuesday 11-03
 * at 10:00 and 15:00 Lisbon), each with an `appointment.create` audit row dated 10-01; a shadow
 * heartbeat every 15 minutes from Sunday 15:30 to Saturday 07:45; for every mark due in the window a
 * sleeping-job claim (mark + 2 s), a `sent` ledger row (mark + 3 s) and a shadow row in the
 * transaction of the first pass at or after the mark; each heartbeat's counts equal its rows. The
 * three appointment foreign keys to people and clinics are dropped in the throwaway: no synthetic
 * person or clinic is made, and the read reads none of those tables.
 */
const SEED = `
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic tenant', 'synthetic-1031'),
                                                  ('${OTHER_TENANT}', 'Synthetic other tenant', 'synthetic-1031-other');
create table seed_appt as
  select ('00000000-0000-4000-8000-' || lpad(to_hex(row_number() over (order by z.ts)::int), 12, '0'))::uuid as id, z.ts as starts_at
    from (select (d::date + t) at time zone 'Europe/Lisbon' as ts
            from generate_series(date '2026-10-26', date '2026-11-02', interval '1 day') d,
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
            from generate_series(date '2026-10-25', date '2026-10-31', interval '1 day') d,
                 generate_series(0, 59) n) z
   where z.p >= ${at("2026-10-25 15:30:00")} and z.p <= ${at("2026-10-31 07:50:00")};
create table seed_mark as
  select a.id as appointment_id, rm.offset_id, rm.channel, a.starts_at, a.starts_at - make_interval(mins => rm.minutes) as due_at
    from seed_appt a cross join (values ('48h', 'email', 2880), ('24h', 'sms', 1440)) rm(offset_id, channel, minutes)
   where a.starts_at - make_interval(mins => rm.minutes) >= ${at("2026-10-25 15:30:03")}
     and a.starts_at - make_interval(mins => rm.minutes) <= ${at("2026-10-31 07:45:00")};
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
-- The sweep heartbeats every tenant: the second tenant's passes, with nothing due.
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  select '${OTHER_TENANT}', p.pass_id, 'shadow', p.pass_at, p.look_ahead_before, 0, 0, false, 0, p.created_at + interval '50 milliseconds'
    from seed_pass p;
`;

/** A visit of the case's own. `saved` writes its `appointment.create` row (with startsAt) at `created`. */
const visit = (id, start, { tenant = TENANT, status = "scheduled", saved = true, created = "2026-10-01 09:00", updated = created, bookedAt = start, saveTenant = tenant } = {}) => `
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${id}', '${tenant}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${at(start)}, ${at(start)} + interval '1 hour',
          '${status}', 'staff', ${at(created)}, ${at(updated)});
${saved ? `insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${saveTenant}', 'appointment.create', 'appointment', '${id}', '{"startsAt":"${bookedAt.replace(" ", "T")}:00.000Z"}', ${at(created)});` : ""}`;
/** The sleeping job's claim at the mark and its ledger row. No shadow row. */
const runClaim = (id, offset, channel, start, due, outcome = "sent", reason = null) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${id}', 'claim', '${offset}', '${channel}', ${at(start)}, ${at(due)}, 'run', false, 1, ${at(due)} + interval '2 seconds');
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
  values ('${TENANT}', '${id}', '${channel}', 'reminder.${offset}.${channel}', '${outcome}', ${reason ? `'${reason}'` : "null"}, ${at(due)} + interval '3 seconds');`;
/** The claim of one offset, its mark computed from the start. */
const claimFor = (id, offset, start) => {
  const mins = offset === "48h" ? 2880 : 1440;
  const due = new Date(Date.parse(`${start.replace(" ", "T")}:00Z`) - mins * 60000).toISOString().slice(0, 16).replace("T", " ");
  return runClaim(id, offset, offset === "48h" ? "email" : "sms", start, due);
};
/** An audit row on a visit (no person, metadata of labels only). */
const audit = (id, action, when, metadata = "{}", tenant = TENANT) => `
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${tenant}', '${action}', 'appointment', '${id}', '${metadata}', ${at(when)});`;
/** A move (every date here is after 2026-10-25, WET, so the ISO instant is the Lisbon wall time with a Z). */
const moved = (id, when, toStart) => audit(id, "appointment.reschedule", when, `{"startsAt":"${toStart.replace(" ", "T")}:00.000Z"}`);
/** A reminder ledger row of its own (no claim beside it). */
const ledger = (id, offset, channel, when) => `
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${id}', '${channel}', 'reminder.${offset}.${channel}', 'sent', ${at(when)});`;
/** A shadow row in the transaction of the pass at `pass`, and that heartbeat's counts raised by one. */
const shadowRow = (id, offset, channel, start, due, pass, saved = false) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', '${id}', 'shadow', '${offset}', '${channel}', ${at(start)}, ${at(due)}, 0, ${saved}, p.pass_id, p.created_at
    from public.reminder_sweep_passes p where p.tenant_id = '${TENANT}' and p.pass_at = ${at(pass)} + interval '3 seconds';
update public.reminder_sweep_passes set due_count = due_count + 1, recorded_count = recorded_count + 1
 where tenant_id = '${TENANT}' and pass_at = ${at(pass)} + interval '3 seconds';`;
/**
 * R22's shape, as production showed it: a staff visit with NO scheduling save until its only one, an
 * `appointment.update` from scheduled to confirmed on the visit's own day after the start (so after
 * every pass that could take the mark); the sleeping job claimed and sent each offset; no shadow row.
 */
const r8Visit = (id, start, offsets) => {
  const confirmAt = new Date(Date.parse(`${start.replace(" ", "T")}:00Z`) + 30 * 60000).toISOString().slice(0, 16).replace("T", " ");
  return [
    visit(id, start, { saved: false }),
    audit(id, "appointment.update", confirmAt, '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
    ...offsets.map((o) => claimFor(id, o, start)),
  ].join("\n");
};
/** R22's production profile: 8 marks over 6 visits Monday to Wednesday, 2 more on Thursday on two of them. */
const R22_PROFILE = [
  r8Visit(appt(0xa1), "2026-10-30 11:00", ["48h", "24h"]), // 48h Wed, 24h Thu
  r8Visit(appt(0xa2), "2026-10-30 12:00", ["48h", "24h"]), // 48h Wed, 24h Thu
  r8Visit(appt(0xa3), "2026-10-28 11:00", ["48h", "24h"]), // Mon, Tue
  r8Visit(appt(0xa4), "2026-10-29 11:00", ["48h", "24h"]), // Tue, Wed
  r8Visit(appt(0xa5), "2026-10-28 12:00", ["48h"]), // Mon
];
const R22_SIXTH = r8Visit(appt(0xa6), "2026-10-29 12:00", ["24h"]); // Wed

/**
 * Every verdict OK except the ones named. Keys: "n" for a single verdict; "n d" for the per-day
 * verdicts 3, 11 and 12 (d the Lisbon day in the check text).
 */
const KEYS = ["0", "1", "2", ...FULL_DAYS.map((d) => `3 ${d}`), "6", "7", "8", "9", "10",
  ...FULL_DAYS.map((d) => `11 ${d}`), ...FULL_DAYS.map((d) => `12 ${d}`), "13", "14"];
/** Verdict 14 FAILs wherever fewer than 10 R8 marks are seeded: that is its job. */
const only = (faults) => Object.fromEntries(KEYS.map((k) => [k, faults[k] ?? (k === "14" ? "FAIL" : "OK")]));
const allDays = (n, v) => Object.fromEntries(FULL_DAYS.map((d) => [`${n} ${d}`, v]));
const keyOf = (r) => {
  const n = Number(r[0]);
  if (n === 3 || n === 11 || n === 12) return `${n} ${(r[1].match(/\d{4}-\d{2}-\d{2}/) || ["?"])[0]}`;
  return String(n);
};

const EMPTY_WANT = { 0: "OK", 1: "OK", 2: "VACUOUS", ...allDays(3, "FAIL"), ...Object.fromEntries(["6", "7", "8", "9", "10", "13", "14"].map((k) => [k, "VACUOUS"])), ...allDays(11, "VACUOUS"), ...allDays(12, "VACUOUS") };
const R8_RE = R8_LABEL.replace(/[()]/g, "\\$&");

const CASES = [
  { name: "clean", seed: "", want: only({}), info: [[20, /2026-10-26 to 2026-10-30 \(5\)/], [40, /full days 2026-10-26 to 2026-10-30: both=\d+ .* run_r8=0 /]] },
  { name: "empty: no heartbeat and no claim at all", seed: "delete from public.reminder_sweep_passes; delete from public.reminder_claims;", want: EMPTY_WANT },
  { name: "null window: every heartbeat removed, the claims and shadow rows left in place", seed: "delete from public.reminder_sweep_passes;", want: EMPTY_WANT },
  {
    name: "R22's profile: 10 R8 marks, 8 Monday to Wednesday on 6 visits and 2 on Thursday; their days REVIEW, 13 and 14 OK",
    seed: [...R22_PROFILE, R22_SIXTH].join("\n"),
    want: only({
      "11 2026-10-26": "REVIEW", "12 2026-10-27": "REVIEW", "11 2026-10-27": "REVIEW", "11 2026-10-28": "REVIEW",
      "12 2026-10-28": "REVIEW", "12 2026-10-29": "REVIEW", 14: "OK",
    }),
    info: [
      [14, /R8 marks 10 over visits 6 \(of \d+ marks those days\); R8 marks due after 2026-10-29 0/],
      [13, /unexplained shadow only 0, run only 0, sent with neither 0/],
      [31, new RegExp(`marks due 2026-10-28, 48h email, run_only: ${R8_RE} \\| 2 \\|`)],
      [51, new RegExp(`${appt(0xa3)} \\| ${R8_RE}`)],
      [35, /2026-10-29 24h sms: 2/],
      [40, /run_unexplained=0 run_r8=10 /],
    ],
  },
  {
    name: "R22's profile with the sixth visit's mark on Friday: 9 Monday to Thursday, verdict 14 FAILs, Friday's R8 is printed only",
    seed: [...R22_PROFILE, r8Visit(appt(0xa6), "2026-10-31 07:00", ["24h"])].join("\n"),
    want: only({
      "11 2026-10-26": "REVIEW", "12 2026-10-27": "REVIEW", "11 2026-10-27": "REVIEW", "11 2026-10-28": "REVIEW",
      "12 2026-10-28": "REVIEW", "12 2026-10-29": "REVIEW", "12 2026-10-30": "REVIEW",
    }),
    info: [[14, /R8 marks 9 over visits 5 .*R8 marks due after 2026-10-29 1 \(not asserted\)/]],
  },
  {
    name: "R8, one mark: its day reads REVIEW, never OK, and 13 stays OK",
    seed: r8Visit(appt(0xb1), "2026-10-27 13:00", ["24h"]),
    want: only({ "12 2026-10-26": "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xb1)} \\| ${R8_RE}`)]],
  },
  {
    name: "R8 negative: the only scheduling save lies between the mark and the start, before passes that had the mark in range: UNEXPLAINED",
    seed: [
      visit(appt(0xb2), "2026-10-27 13:00", { saved: false }),
      audit(appt(0xb2), "appointment.update", "2026-10-27 09:00", '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
      claimFor(appt(0xb2), "24h", "2026-10-27 13:00"),
    ].join("\n"),
    want: only({ "12 2026-10-26": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 negative: P7 false, P3 false at every pass (cancelled, restored after the start): UNEXPLAINED",
    seed: [
      visit(appt(0xb3), "2026-10-27 13:00", { saved: false }),
      audit(appt(0xb3), "appointment.update", "2026-10-27 14:30", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
      claimFor(appt(0xb3), "24h", "2026-10-27 13:00"),
    ].join("\n"),
    want: only({ "12 2026-10-26": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb3)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 negative: P7 false, P3 unknown at every pass (cancelled now with no trail, updated after the start): UNEXPLAINED",
    seed: [
      visit(appt(0xb4), "2026-10-27 13:00", { saved: false, status: "cancelled", updated: "2026-10-27 14:00" }),
      audit(appt(0xb4), "appointment.update", "2026-10-27 14:30", '{"via":"portal_request_confirm"}'),
      claimFor(appt(0xb4), "24h", "2026-10-27 13:00"),
    ].join("\n"),
    want: only({ "12 2026-10-26": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb4)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 negative: P7 false, P2 false at every pass (booked at another start under another tenant, moved in after the start): UNEXPLAINED",
    seed: [
      visit(appt(0xb5), "2026-10-27 13:00", { bookedAt: "2026-11-20 13:00", saveTenant: OTHER_TENANT }),
      moved(appt(0xb5), "2026-10-27 14:30", "2026-10-27 13:00"),
      claimFor(appt(0xb5), "24h", "2026-10-27 13:00"),
    ].join("\n"),
    want: only({ "12 2026-10-26": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 negative: P7 false, P2 unknown at every pass (no booking row, moved in after the start): UNEXPLAINED",
    seed: [
      visit(appt(0xb6), "2026-10-27 13:00", { saved: false }),
      moved(appt(0xb6), "2026-10-27 14:30", "2026-10-27 13:00"),
      claimFor(appt(0xb6), "24h", "2026-10-27 13:00"),
    ].join("\n"),
    want: only({ "12 2026-10-26": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb6)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 negative: P7 false, P8 false at every pass (a live sweep claim of the key before the mark): UNEXPLAINED",
    seed: [
      r8Visit(appt(0xb7), "2026-10-27 13:00", ["24h"]),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xb7)}', 'claim', '24h', 'sms', ${at("2026-10-27 13:00")}, ${at("2026-10-26 13:00")}, 'sweep', false, 2, ${at("2026-10-26 12:00")});`,
    ].join("\n"),
    want: only({ 6: "FAIL", "12 2026-10-26": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb7)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 negative: no pass had the mark in range (the passes between the mark and the start removed): UNEXPLAINED",
    seed: [
      r8Visit(appt(0xb8), "2026-10-27 13:00", ["24h"]),
      `delete from public.reminder_sweep_passes where pass_at > ${at("2026-10-26 13:00")} and pass_at < ${at("2026-10-27 13:00")};`,
    ].join("\n"),
    want: only({ "3 2026-10-26": "FAIL", "3 2026-10-27": "FAIL", "12 2026-10-26": "FAIL", 8: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb8)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R4 keeps its place: a visit with no scheduling save at all reads R4, not R8",
    seed: [visit(appt(0xb9), "2026-10-27 13:00", { saved: false }), claimFor(appt(0xb9), "24h", "2026-10-27 13:00")].join("\n"),
    want: only({ "12 2026-10-26": "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xb9)} \\| R4 never reminded: no scheduling save \\(switch off\\)`)]],
  },
  {
    name: "labelled mismatches only (R1, R2, R4, R6, S3, S4, S5): their days read REVIEW, never OK; R20's labels unchanged",
    seed: [
      visit(appt(0xc1), "2026-10-27 12:00", { saved: false }),
      runClaim(appt(0xc1), "24h", "sms", "2026-10-27 12:00", "2026-10-26 12:00"),
      visit(appt(0xc2), "2026-10-28 12:00", { status: "cancelled" }),
      runClaim(appt(0xc2), "24h", "sms", "2026-10-28 12:00", "2026-10-27 12:00", "suppressed", "status"),
      visit(appt(0xc3), "2026-10-27 17:00"),
      runClaim(appt(0xc3), "24h", "sms", "2026-10-27 16:05", "2026-10-26 16:05"),
      moved(appt(0xc3), "2026-10-26 16:10", "2026-10-27 17:00"),
      runClaim(appt(0xc3), "24h", "sms", "2026-10-27 17:00", "2026-10-26 17:00"),
      shadowRow(appt(0xc3), "24h", "sms", "2026-10-27 17:00", "2026-10-26 17:00", "2026-10-26 17:00"),
      visit(appt(0xc4), "2026-10-29 12:00", { updated: "2026-10-28 12:05" }),
      moved(appt(0xc4), "2026-10-28 12:05", "2026-10-29 12:00"),
      shadowRow(appt(0xc4), "24h", "sms", "2026-10-29 12:00", "2026-10-28 12:00", "2026-10-28 12:15", true),
      visit(appt(0xc5), "2026-10-29 22:30"),
      shadowRow(appt(0xc5), "24h", "sms", "2026-10-27 22:30", "2026-10-26 22:30", "2026-10-26 21:45"),
      moved(appt(0xc5), "2026-10-26 22:00", "2026-10-29 22:30"),
      visit(appt(0xc7), "2026-10-27 13:05", { status: "cancelled" }),
      runClaim(appt(0xc7), "24h", "sms", "2026-10-27 13:05", "2026-10-26 13:05"),
      audit(appt(0xc7), "appointment.cancel", "2026-10-26 13:08", '{"toStatus":"cancelled"}'),
      visit(appt(0xc8), "2026-10-27 14:00"),
      shadowRow(appt(0xc8), "24h", "sms", "2026-10-27 14:00", "2026-10-26 14:00", "2026-10-26 14:00"),
      ledger(appt(0xc8), "24h", "sms", "2026-10-26 14:00:03"),
    ].join("\n"),
    want: only({ "12 2026-10-26": "REVIEW", "12 2026-10-27": "REVIEW", "12 2026-10-28": "REVIEW" }),
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
    name: "shadow only: the sleeping job's claim for Tuesday's 24h SMS at 10:00 removed",
    seed: `delete from public.reminder_dispatches where appointment_id = '${appt(5)}' and channel = 'sms';
           delete from public.reminder_claims where appointment_id = '${appt(5)}' and kind = 'claim' and offset_id = '24h';`,
    want: only({ "12 2026-10-27": "FAIL", 13: "FAIL" }),
    info: [[50, new RegExp(`${appt(5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "run only: the shadow row for Wednesday's 48h email at 10:00 removed (its visit was booked: P7 true, not R8)",
    seed: `with d as (delete from public.reminder_claims where appointment_id = '${appt(9)}' and kind = 'shadow' and offset_id = '48h' returning created_at)
           update public.reminder_sweep_passes p set due_count = due_count - 1, recorded_count = recorded_count - 1 from d where p.tenant_id = '${TENANT}' and p.created_at = d.created_at;`,
    want: only({ "11 2026-10-28": "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(9)} \\| UNEXPLAINED`)]],
  },
  {
    name: "run only on a partial day: Saturday 07:30, an UNEXPLAINED mark no agreement verdict covers FAILs verdict 13",
    seed: [visit(appt(0xd1), "2026-11-01 07:30"), claimFor(appt(0xd1), "24h", "2026-11-01 07:30")].join("\n"),
    want: only({ 13: "FAIL" }),
    info: [[13, /of them on partial days 1/], [51, new RegExp(`${appt(0xd1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "sent with neither: a reminder send with no claim and no shadow row FAILs verdict 10, its day and 13",
    seed: [visit(appt(0xd2), "2026-10-28 15:30"), ledger(appt(0xd2), "24h", "sms", "2026-10-27 15:30:03")].join("\n"),
    want: only({ 10: "FAIL", "12 2026-10-27": "FAIL", 13: "FAIL" }),
    info: [[52, new RegExp(`${appt(0xd2)} \\| UNEXPLAINED`)]],
  },
  { name: "missing heartbeat: Thursday 12:00", seed: `delete from public.reminder_sweep_passes where pass_at = ${at("2026-10-29 12:00:03")};`, want: only({ "3 2026-10-29": "FAIL" }) },
  {
    name: "a send heartbeat",
    seed: `insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
           values ('${TENANT}', 'run-send', 'send', ${at("2026-10-31 07:50:03")}, 0, 0, false, 0, ${at("2026-10-31 07:50:04")});`,
    want: only({ 6: "FAIL" }),
  },
  {
    name: "a pass over the ceiling on Friday",
    seed: `update public.reminder_sweep_passes set over_ceiling = true, due_count = recorded_count + 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-10-30 12:00:03")};`,
    want: only({ 7: "FAIL" }),
  },
  {
    name: "a heartbeat whose recorded count is one short",
    seed: `update public.reminder_sweep_passes set recorded_count = recorded_count - 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-10-26 10:00:03")};`,
    want: only({ 8: "FAIL" }),
  },
  { name: "a mark taken twice", seed: shadowRow(appt(3), "24h", "sms", "2026-10-27 10:00", "2026-10-26 10:00", "2026-10-26 10:15"), want: only({ 9: "FAIL" }) },
  {
    name: "a claim with no mark",
    seed: `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, taker, attempt, created_at)
           values ('${TENANT}', '${appt(6)}', 'claim', '72h', 'sms', ${at("2026-10-28 15:00")}, 'run', 1, ${at("2026-10-27 09:00")});`,
    want: only({ 10: "FAIL" }),
  },
  {
    name: "the read's clock at Friday 07:10: Thursday is not closed, verdict 1 FAILs and only Monday to Wednesday are full",
    seed: "",
    clock: "2026-10-30 07:10:00",
    want: Object.fromEntries(Object.entries(only({ 1: "FAIL" })).filter(([k]) => !/ 2026-10-(29|30)$/.test(k))),
  },
  {
    name: "a window that starts late: every heartbeat before Monday 09:00 removed",
    seed: `delete from public.reminder_sweep_passes where pass_at < ${at("2026-10-26 09:00")};`,
    want: only({ 2: "FAIL", "3 2026-10-26": "FAIL" }),
  },
  {
    name: "MUTANT (R20's): the shadow set is dead",
    seed: "",
    mutate: (s) => s.replace("from c_all where kind = 'shadow'\n", "from c_all where kind = 'shadow-dead'\n"),
    want: only({ ...allDays(11, "FAIL"), ...allDays(12, "FAIL"), 13: "FAIL" }),
  },
  {
    name: "MUTANT (R20's): the slot count is dead",
    seed: "",
    mutate: (s) => s.replace("and h.slot::time >= time '07:00' and h.slot::time <= time '21:45') as slots", "and false) as slots"),
    want: only({ ...allDays(3, "FAIL") }),
  },
  {
    name: "MUTANT: P7 without its as-of-the-pass bound, on R22's profile: every R8 mark falls back to UNEXPLAINED",
    seed: [...R22_PROFILE, R22_SIXTH].join("\n"),
    mutate: (s) => s.replace("and e.same_tenant and e.scheduling\n                    and e.created_at <= h.created_at) as p7,", "and e.same_tenant and e.scheduling) as p7,"),
    want: only({
      "11 2026-10-26": "FAIL", "12 2026-10-27": "FAIL", "11 2026-10-27": "FAIL", "11 2026-10-28": "FAIL",
      "12 2026-10-28": "FAIL", "12 2026-10-29": "FAIL", 13: "FAIL",
    }),
    info: [[14, /R8 marks 0 over visits 0/]],
    // The unmutated read's expectation for the same seed: the mutant must not meet it.
    kills: "R22's profile: 10 R8 marks",
  },
];

/**
 * The mutation sweep of r8's own conditions: each condition removed once, each run on the case that
 * must kill it. A condition no case can kill is listed in the document as a survivor, with why.
 */
const R8_MUTANTS = [
  ["s.in_range > 0", "R8 negative: no pass had the mark in range"],
  ["s.f7 = s.in_range", "R8 negative: the only scheduling save lies between the mark and the start"],
  ["s.f2 = 0 and s.u2 = 0", "R8 negative: P7 false, P2 false at every pass", "s.u2 = 0"],
  ["s.f2 = 0 and s.u2 = 0", "R8 negative: P7 false, P2 unknown at every pass", "s.f2 = 0"],
  ["s.f3 = 0 and s.u3 = 0", "R8 negative: P7 false, P3 false at every pass", "s.u3 = 0"],
  ["s.f3 = 0 and s.u3 = 0", "R8 negative: P7 false, P3 unknown at every pass", "s.f3 = 0"],
  ["s.f8 = 0", "R8 negative: P7 false, P8 false at every pass"],
];
for (const [cond, caseName, keep] of R8_MUTANTS) {
  const base = CASES.find((c) => c.name.startsWith(caseName));
  assert.ok(base, `no case named ${caseName}`);
  CASES.push({
    name: `MUTANT: r8 without ${keep ? cond.replace(` and ${keep}`, "").replace(`${keep} and `, "") : cond}, on "${caseName}": the mark reads R8 and the day REVIEW, so the case's FAIL catches it`,
    seed: base.seed,
    mutate: (s) => {
      assert.equal(s.split(`${cond}\n`).length, 2, `r8's condition ${cond} is not written exactly once`);
      return s.replace(`${cond}\n`, `${keep ?? "true"}\n`);
    },
    want: { ...base.want, 13: "OK", "12 2026-10-26": "REVIEW" },
    kills: caseName,
  });
}

const PGURL = process.env.SHADOW_COMPARE_1031_TEST_PGURL;

test("the read on a local database: every verdict flips on its own seeded fault, and R8 names R22's shape only", { skip: PGURL ? false : "SHADOW_COMPARE_1031_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: SHADOW_COMPARE_1031_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => {
    const r = spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, `psql failed: ${r.stderr}`);
    return r.stdout;
  };
  const admin = (statement) => psql(PGURL, ["-c", statement]);
  const BASE = "shadowcompare1031_test_base";
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "shadowcompare1031-db-"));
  const results = [];
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    // The schema is loaded leniently (a role or extension the lane has may be missing here); the
    // tables the read and the seed use must then exist, which the seed proves by running strictly.
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout, maxBuffer: 64 * 1024 * 1024 });
    psql(dbUrl(BASE), [], SEED);
    for (const c of CASES) {
      const db = "shadowcompare1031_test_case";
      admin(`drop database if exists ${db}`);
      admin(`create database ${db} template ${BASE}`);
      if (c.seed) psql(dbUrl(db), [], c.seed);
      let text = sql.replace(CLOCK_LINE, `  select timestamptz '${c.clock ?? READ_CLOCK} Europe/Lisbon' as t1`);
      assert.notEqual(text, sql, "the clock line was not replaced");
      if (c.mutate) {
        const mutated = c.mutate(text);
        assert.notEqual(mutated, text, `${c.name}: the mutant changed nothing`);
        text = mutated;
      }
      const file = join(work, "read.sql");
      writeFileSync(file, text);
      const out = psql(dbUrl(db), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", "-f", file, "-c", "rollback"]);
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f")).filter((r) => r.length === 5);
      const verdictRows = rows.filter((r) => r[4] !== "INFO");
      const verdicts = Object.fromEntries(verdictRows.map((r) => [keyOf(r), r[4]]));
      assert.equal(verdictRows.length, Object.keys(verdicts).length, `${c.name}: a verdict key printed twice\n${out}`);
      results.push(`${c.name}: ${verdictRows.map((r) => `${keyOf(r)}=${r[4]}`).filter((s) => !s.endsWith("=OK")).join(", ") || "all OK"}`);
      assert.deepEqual(verdicts, c.want, `${c.name}: verdicts\n${out}`);
      if (c.kills) {
        const unmutated = CASES.find((u) => u.name.startsWith(c.kills) && !u.mutate);
        assert.ok(unmutated, `${c.name}: no unmutated case ${c.kills}`);
        assert.notDeepStrictEqual(verdicts, unmutated.want, `${c.name}: the mutant SURVIVES: it meets the unmutated case's expectation`);
      }
      for (const [n, re] of c.info ?? []) {
        assert.ok(rows.some((r) => Number(r[0]) === n && re.test(r.slice(1).join(" | "))), `${c.name}: no row ${n} matching ${re}\n${out}`);
      }
      admin(`drop database ${db}`);
    }
  } finally {
    if (process.env.SHADOW_COMPARE_1031_TEST_REPORT) writeFileSync(process.env.SHADOW_COMPARE_1031_TEST_REPORT, results.join("\n") + "\n");
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", "drop database if exists shadowcompare1031_test_case"], { encoding: "utf8" });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});

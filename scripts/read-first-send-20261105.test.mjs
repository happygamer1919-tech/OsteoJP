// FIRST-SEND (2026-11-05, strategy's R47 and R36): the read of the reminder sweep's first sending
// passes. Its document and its one block agree with each other, the read writes nothing, every halt
// in the block is explicit (proven by fault injection), the code it mirrors is held to its bytes,
// and, on a local database, every verdict flips on its own seeded fault and every predicate has a
// mutant that dies.
//
// WHAT THIS PROVES, with no database:
//   * the code the read mirrors is #1678's, byte for byte: RE_ARMING_SAVES to the end of
//     reminder-population.ts, notSavedAfterMark and markOf in sweep.ts, the held-back retry in
//     sweep-send.ts, and that a sending pass writes its heartbeat after its marks;
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing, controls no transaction, reads the clock once, names no column that
//     holds a person and prints no tenant id; appointment ids only in the list of rows 50 to 54;
//   * the document's verdict table names the verdicts the read prints;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; one psql
//     call, read only, the switch time set inside it, writing to the handover file only;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape, every external command a stub,
//     each call made to fail in turn. Under bash always; under zsh wherever zsh is installed;
//   * a double send or a sweep-sent S5 closes on UNDO NOW whatever else the table holds; any other
//     FAIL or VACUOUS STOPs with no undo; else CLEAN or REVIEW.
//
// WITH A LOCAL DATABASE (FIRST_SEND_1105_TEST_PGURL names one on 127.0.0.1 or localhost whose
// `public` schema is the repository's): the read runs on a seeded throwaway per case. Any other host
// is refused. Without the variable those cases are skipped.
//
// Run: node --test scripts/read-first-send-20261105.test.mjs

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

const DOC_PATH = "docs/read-first-send-20261105.md";
const SIDECAR = "docs/read-first-send-20261105.sha256";
const READ_PATH = "scripts/db/read-first-send-20261105.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const OUT_NAME = "first-send-20261105.out";
const PRHEAD = "a".repeat(40);
const CLOCK_LINE = "  select now() as t1";
const GUC = "osteojp.r47_switched_at";

const MIRRORED = [
  { file: "apps/web/lib/reminders/reminder-population.ts", from: "export const RE_ARMING_SAVES = [", toEnd: true, sha: "12ddbfbf97406a216f2c59bcd98900c0de4c22ec3042d6b9edb95fabd799b8ca" },
  { file: "apps/web/lib/reminders/sweep.ts", from: "export function notSavedAfterMark(", sha: "dc8cdcc5dc5ec644a9e181ea6c1715ed29ed411c0e4878c5894d8854eb142e1c" },
  { file: "apps/web/lib/reminders/sweep.ts", from: "function markOf(", sha: "603114a10f12dafd7434c136a43556b480dbe2a52d0efb1e203dd3b302cb7970" },
  { file: "apps/web/lib/reminders/sweep-send.ts", from: "function notSavedAfterMarkBeforeItWasHandedOver(", sha: "e0b3be957a9b41c672a1f411d6cf557f0922e6e64d171276de397bcf29ba3eab" },
  { file: "apps/web/lib/reminders/sweep-send.ts", from: "function claimOfThisMark(", sha: "0024eef63ca71e6e4ceabfbf1c290ee98ac1cb3075fde0632bb0691c0e9c0da2" },
];
const CLAUSES = ["booked", "moved", "accepted_in_pedidos", "accepted_with_estado", "brought_back", "accepted_in_sms_review", "accepted_by_sms_reply"];

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

test("the code the read mirrors is #1678's, and a sending pass writes its heartbeat after its marks", () => {
  for (const m of MIRRORED) {
    const text = read(m.file);
    const at = text.indexOf(m.from);
    assert.ok(at >= 0, `${m.file} has no ${m.from}`);
    const span = m.toEnd ? text.slice(at) : text.slice(at, text.indexOf("\n}\n", at) + 3);
    assert.equal(sha256(span), m.sha, `${m.file} ${m.from} is not #1678's: the read's mirror must be re-derived and re-reviewed`);
  }
  const send = read("apps/web/lib/reminders/sweep-send.ts");
  assert.match(send, /^export const SWEEP_RETRY_AFTER_SAVE_LIMIT_MS = 3 \* 60 \* 60_000;$/m);
  const pass = send.slice(send.indexOf("export async function sweepTenantSending("));
  assert.ok(pass.indexOf("sweep-select-") < pass.indexOf("sweep-send-") && pass.indexOf("sweep-send-") < pass.indexOf("sweep-heartbeat-"), "the order of a pass moved");
  assert.match(pass, /passAt: at,/, "the heartbeat's pass_at is no longer the selection's clock");
  const dispatch = read("apps/web/lib/reminders/dispatch.ts");
  assert.match(dispatch, /sms: 3 \* 60 \* 60_000,\n {2}email: 12 \* 60 \* 60_000,/, "the late limit moved");
  const pop = read("apps/web/lib/reminders/reminder-population.ts");
  const table = pop.slice(pop.indexOf("export const RE_ARMING_SAVES = ["), pop.indexOf("] as const;", pop.indexOf("export const RE_ARMING_SAVES = [")));
  assert.deepEqual([...table.matchAll(/clause: "([a-z_]+)"/g)].map((m) => m[1]), CLAUSES);
  for (const c of CLAUSES) assert.equal(sql.split(`then '${c}'`).length, 2, `the clause ${c} is not named exactly once`);
  assert.match(read("apps/web/lib/reminders/inngest/backstop.ts"), /SWEEP_HEAD_START_MS = 20 \* 60_000/);
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
  assert.ok(fallback.includes(`set local ${GUC} = '`), "the owner's first line does not set the switch time");
  assert.doesNotMatch(doc, /SHAREAD_VALUE|REHEARSAL_TABLE|BLOCK_HERE/, "a placeholder is left in the document");
});

test("the read writes nothing, controls no transaction, and reads the clock once", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"));
  assert.equal((sql.match(/current_setting\('osteojp\.r47_switched_at'\)/g) || []).length, 1, "the switch time is read other than once");
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.equal(sql.split("\n").filter((l) => l === CLOCK_LINE).length, 1);
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date)\b/i, "a second clock");
});

test("the read never names a column that holds a person, prints no tenant id and no metadata text", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|patient_2_id|practitioner_id|created_by|actor_user_id|provider_message_id|body|ip|room|name)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\|/, "the read prints a tenant id");
  assert.doesNotMatch(sql, /\|\|\s*l\.metadata|metadata->>'[a-zA-Z]+'\s*\|\||\|\|\s*[a-z]+\.(from_start|to_start|start_at_mark|start_text)/, "metadata text is printed");
  assert.match(sql, /i\.appointment_id::text \|\| ' \| ' \|\| i\.category as observed/);
  assert.equal((code.match(/appointment_id::text/g) || []).length, 1, "an appointment id is printed outside the list");
  assert.match(sql, /where rk <= 500\n/);
  const out = sql.slice(sql.indexOf('\nselect n, "check", observed, expected, verdict from ('));
  assert.doesNotMatch(out, /\.id::text/, "an id reaches the printed rows");
});

test("the document's verdict table and the read agree on the verdicts", () => {
  const nums = [...sql.matchAll(/^ {2}select (\d+),\s*$/gm)].map((m) => Number(m[1])).filter((n) => n < 20);
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.match(sql, /^ {2}select 0 as n,$/m);
  for (let n = 0; n <= 11; n++) assert.ok(doc.includes(`| ${n} |`), `the verdict table has no row ${n}`);
});

test("the block's shape: pipefail on line 2, no set -e, no # line, one read-only psql, the switch inside it, the PR head by full sha", () => {
  const lines = block.split("\n");
  assert.equal(lines[0], "(");
  assert.equal(lines[1], "set -o pipefail");
  assert.equal(lines.at(-1), ")");
  assert.doesNotMatch(block, /set -e|errexit/);
  assert.ok(!lines.some((l) => l.trimStart().startsWith("#")));
  assert.ok(!lines.some((l) => l.endsWith("\\")));
  const psql = lines.filter((l) => /^psql /.test(l));
  assert.equal(psql.length, 1);
  assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp\.r47_switched_at = '\$\{SWITCHED_AT\}'" -c "select 'read only: '/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback" > \$\{OUT\} 2>&1 \|\| \{/);
  assert.doesNotMatch(block, /\btee\b/);
  assert.doesNotMatch(block, /\b(cat|head|tail|less|more)\b[^\n]*\$\{OUT\}/);
  assert.deepEqual(lines.slice(2, 6), ["PRHEAD=PENDING", "DOCSHA=PENDING", "PRNUM=PENDING", "SWITCHED_AT=PENDING"]);
  assert.equal((block.match(/=PENDING$/gm) || []).length, 4);
  assert.ok(lines[13].startsWith('echo "${PRHEAD} ${DOCSHA} ${PRNUM} ${SWITCHED_AT}" | grep -qxE'), "the PENDING check is not the first command");
  assert.ok(lines.includes(`OUT=${OUT_DIR}/${OUT_NAME}`));
  assert.ok(lines.some((l) => l.startsWith('[ "${FH}" = "${PRHEAD}" ] ||')));
  assert.ok(lines.some((l) => l.startsWith('[ "${HD}" = "${PRHEAD}" ] ||')));
  assert.doesNotMatch(block, /origin\/main|merge-base/);
  assert.ok(!/(^|[^A-Za-z])\/tmp\//.test(block));
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `a halt that is not one STOP and exit 1: ${l}`);
  }
});

// ---- The fault-injection harness (the 2026-11-04 read's). ----

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const realOf = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH }, encoding: "utf8" });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const STUBBED = ["git", "node", "psql", "date", "grep", "awk", "cut", "shasum", "rm"];
const FAKED = ["git", "node", "psql", "date"];
const LIST_ID = "00000000-0000-4000-8000-0000000000a9";
const HARNESS_SWITCHED = "2026-11-04T22:10:05Z";
const HARNESS_PRNUM = "4242";

const vrow = (n, v = "OK") => ` ${String(n).padStart(2)} | ${n}. verdict ${n} | x | y | ${v}`;
const NUMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const table = (over = {}, skip = [], extra = []) => [
  "BEGIN", "SET", "SET", "SET",
  " first_send_transaction ", "----------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...NUMS.filter((n) => !skip.includes(n)).map((n) => vrow(n, over[n] ?? "OK")),
  ...extra,
  " 20 | window | 2026-11-04 22:10:05 | 2026-11-05 07:00:03 | 2026-11-05 09:15:03 | 2026-11-05 09:20:00 | information | INFO",
  " 40 | FIRST_SEND_SUMMARY | since the switch: sent_by_sweep=8 sent_by_job=0 sent_no_claim=0 double_sends=0 sweep_sent_s5=0 missed=0 | double sends must be 0 | INFO",
  ` 51 | issue 2026-11-05 08:00 24h sms | ${LIST_ID} | missed | information | INFO`,
  "(25 rows)", "", "ROLLBACK",
].join("\n");
const FIXTURES = {
  ok: table(),
  review: table({ 7: "REVIEW" }),
  review4: table({ 4: "REVIEW", 6: "REVIEW" }),
  review10: table({ 10: "REVIEW" }),
  review11: table({ 11: "REVIEW" }),
  double: table({ 5: "FAIL" }),
  s5: table({ 10: "FAIL" }),
  doubleandmore: table({ 5: "FAIL", 3: "FAIL", 7: "VACUOUS" }, [8]),
  gap: table({ 3: "FAIL" }),
  shadow: table({ 2: "FAIL" }),
  late: table({ 8: "FAIL" }),
  off: table({ 9: "FAIL" }),
  vacuous4: table({ 4: "VACUOUS" }),
  vacuous5: table({ 5: "VACUOUS" }),
  vacuous10: table({ 10: "VACUOUS" }),
  review5: table({ 5: "REVIEW" }),
  review3: table({ 3: "REVIEW" }),
  short: table({}, [11]),
  no5: table({}, [5]),
  extra: table({}, [], [vrow(12)]),
  double9: table({}, [], [vrow(9)]),
  nosummary: table().replace(/^ 40 \| FIRST_SEND_SUMMARY[^\n]*\n/m, ""),
  notreadonly: table().replace(" read only: on", " read only: off"),
};
const STUB_TEXT = `#!/bin/sh
d="$HARNESS_DIR"
n=$(( $(cat "$d/count.@@NAME@@" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/count.@@NAME@@"
printf '%s:%s %s\\n' "@@NAME@@" "$n" "$*" >> "$d/calls"
if [ "$HARNESS_FAIL" = "@@NAME@@:$n" ]; then
  echo "@@NAME@@: harness fault" >&2
  @@FAILREAL@@
  exit @@FAILCODE@@
fi
case "@@NAME@@" in
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
    case "$*" in
      *"-c set local osteojp.r47_switched_at = '$HARNESS_SWITCHED' -c "*) ;;
      *) echo "harness: psql was not handed the switch time" >&2; exit 97;;
    esac
    cat "$d/fix.$HARNESS_TABLE"; exit 0;;
  date)
    [ "$TZ" = "Europe/Lisbon" ] || { echo "harness: date read without TZ=Europe/Lisbon" >&2; exit 97; }
    case "$1" in
      +%Z) echo "$HARNESS_ZONE"; exit 0;;
      +%Y%m%d%H%M) echo "$HARNESS_NOW"; exit 0;;
      *) echo "harness: unexpected date $*" >&2; exit 97;;
    esac;;
  *) exec "@@REAL@@" "$@";;
esac
`;

function stubText(name, real) {
  return STUB_TEXT.replaceAll("@@NAME@@", name)
    .replaceAll("@@FAILREAL@@", ["grep", "awk", "cut", "shasum"].includes(name) ? `"${real}" "$@" > /dev/null 2>&1 < /dev/null` : ":")
    .replaceAll("@@FAILCODE@@", name === "grep" ? "2" : "1")
    .replaceAll("@@REAL@@", real);
}

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "firstsend1105-harness-"));
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

function filled(base, { docsha, switched, prnum } = {}) {
  return block
    .replace("PRHEAD=PENDING", `PRHEAD=${PRHEAD}`)
    .replace("DOCSHA=PENDING", `DOCSHA=${docsha ?? sha256(doc)}`)
    .replace("PRNUM=PENDING", `PRNUM=${prnum ?? HARNESS_PRNUM}`)
    .replace("SWITCHED_AT=PENDING", `SWITCHED_AT=${switched ?? HARNESS_SWITCHED}`)
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
      HARNESS_PRNUM,
      HARNESS_SWITCHED,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_TABLE: "ok",
      HARNESS_ZONE: "WET",
      HARNESS_NOW: "202611050930",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertGood(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^ 40 \| FIRST_SEND_SUMMARY \| since the switch: sent_by_sweep=8 /m, "the summary line was not printed");
  assert.ok(!r.out.includes(LIST_ID), "an appointment id from the list reached the terminal");
  assert.doesNotMatch(r.out, /read only: on|issue 2026/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
  assert.equal(r.stdout.split("\n").filter((l) => l.startsWith("FIRST-SEND-1105 ")).length, 1, "not exactly one closing line");
}
function assertClean(r) {
  assertGood(r);
  assert.match(r.stdout, /^verdicts: 12 OK \/ 0 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.match(r.stdout, /^FIRST-SEND-1105 CLEAN: 12 OK; no double send.*SOLO reports to strategy$/m);
}
function assertReview(r) {
  assertGood(r);
  assert.match(r.stdout, /^FIRST-SEND-1105 REVIEW: no double send.*SOLO reads rows .* and reports to strategy$/m);
}
function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /FIRST-SEND-1105 (CLEAN|REVIEW)/, `${label}: a closing line after a fault`);
  assert.ok(!r.out.includes(LIST_ID), `${label}: an appointment id reached the terminal`);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.doesNotMatch(r.out, /harness: unexpected/, `${label}: an unexpected call`);
}
const UNDO = /^STOP: UNDO NOW: the owner follows the undo section of owner-switch-steps-1104\.md\..*Then SOLO reports to strategy$/;

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine, and the zsh arm must run wherever it is not the GitHub runner"));

for (const shell of shells) {
  test(`${shell}: the document's own copy STOPs at its PENDING lines before anything runs`, () => {
    const base = makeBase();
    try {
      const r = runOnce(shell, base, block.replaceAll(APPLY_DIR, join(base, "apply")));
      assertStop(r, /NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|date|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
      for (const [k, v] of [["switched", "PENDING"], ["switched", "2026-11-05 06:00:00"], ["switched", "2026-11-03T22:00:00Z"], ["switched", "2026-11-05T06:00:00Z'; drop table x; '"], ["prnum", "PENDING"], ["docsha", "PENDING"]]) {
        const p = runOnce(shell, base, filled(base, { [k]: v }));
        assertStop(p, /NOT READY/, `${k} ${v}`);
        assert.ok(!/^(git|node|psql|date):/m.test(p.calls), `a command ran before the PENDING check (${k} ${v}): ${p.calls}`);
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled block closes CLEAN on the clean profile, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const clean = runOnce(shell, base, text);
      assertClean(clean);
      const out = readFileSync(join(base, "handover", OUT_NAME), "utf8");
      assert.ok(out.includes(LIST_ID), "the list is not in the transcript");
      const calls = clean.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 16, `too few calls were stubbed: ${calls.length}`);
      for (const n of STUBBED) assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called`);
      for (const id of calls) assertStop(runOnce(shell, base, text, { HARNESS_FAIL: id }), null, `${shell} fail ${id}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: UNDO NOW outranks all, each other profile STOPs, the guards each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      for (const t of ["double", "s5", "doubleandmore"]) assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), UNDO, t);
      const profile = /a FAIL, a VACUOUS verdict, a REVIEW outside verdicts 4, 6, 7, 10 and 11, or a verdict missing, doubled or extra.*No undo by this line: SOLO reports to strategy$/;
      for (const t of ["gap", "shadow", "late", "off", "vacuous4", "vacuous5", "vacuous10", "review5", "review3", "short", "no5", "extra", "double9"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), profile, t);
      }
      for (const t of ["review", "review4", "review10", "review11"]) assertReview(runOnce(shell, base, text, { HARNESS_TABLE: t }));
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nosummary" }), /no FIRST_SEND_SUMMARY row/, "no summary");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const now of ["202611050914", "202611050700", "202611042359"]) {
        const r = runOnce(shell, base, text, { HARNESS_NOW: now });
        assertStop(r, /earlier than 2026-11-05 09:15 Lisbon/, `clock ${now}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the clock check: ${r.calls}`);
      }
      assertClean(runOnce(shell, base, text, { HARNESS_NOW: "202611050915" }));
      assertStop(runOnce(shell, base, text, { HARNESS_NOW: "soon" }), null, "a clock that is not a number");
      for (const zone of ["EST", "UTC", ""]) assertStop(runOnce(shell, base, text, { HARNESS_ZONE: zone }), /not WET or WEST/, `zone ${zone}`);
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_FETCHED: "b".repeat(40) }), /the pull request's head is \[b{40}\]/, "moved head");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "c".repeat(40) }), /not on the head commit/, "checkout");
      assertStop(runOnce(shell, base, text, { HARNESS_PRNUM: "1" }), /head could not be fetched/, "another pull request");
      assertStop(runOnce(shell, base, text, { HARNESS_SWITCHED: "2026-11-04T22:10:06Z" }), /the read did not complete/, "psql handed another switch time");
      assertStop(runOnce(shell, base, filled(base, { docsha: "d".repeat(64) })), /not the one the dispatch names/, "docsha");
      for (const [p, re] of [[READ_PATH, /read on disk is not the reviewed file/], [GUARD, /target guard on disk/], [MODULE, /module on disk/], [DOC_PATH, /not the one the dispatch names/]]) {
        const f = join(base, "apply", p);
        const keep = readFileSync(f);
        writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
        assertStop(runOnce(shell, base, text), re, `changed ${p}`);
        writeFileSync(f, keep);
      }
      assertStop(runOnce(shell, base, text.replaceAll(join(base, "apply"), join(base, "no-such-apply-dir"))), /the apply worktree is not there/, "missing apply directory");
      const r2 = runOnce(shell, base, text.replaceAll(join(base, "prod.env"), join(base, "no-such.env")));
      assertStop(r2, /production environment file could not be loaded/, "missing env file");
      assert.ok(!/^(node|psql):/m.test(r2.calls), `the guard or psql ran without the env file: ${r2.calls}`);
      assertStop(runOnce(shell, base, text.replaceAll(join(base, "handover"), join(base, "no-such-handover"))), /handover folder is not there/, "missing handover folder");
      assertClean(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
}

// ---- The read on a local database: every verdict flips on its own seeded fault, every predicate has its mutant. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000f002";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const cid = (n) => `00000000-0000-4000-9000-${n.toString(16).padStart(12, "0")}`;
const at = (s) => `timestamptz '${s} Europe/Lisbon'`;
const READ_CLOCK = "2026-11-05 13:00:00";
const SWITCHED = "2026-11-04T22:00:00Z";
const WED = "2026-11-04";
const THU = "2026-11-05";
const iso = (s) => `${s.replace(" ", "T")}:00.000Z`;
const dueOf = (start, offset) => new Date(Date.parse(`${start.replace(" ", "T")}:00Z`) - (offset === "48h" ? 2880 : 1440) * 60000).toISOString().slice(0, 16).replace("T", " ");
const channelOf = (offset) => (offset === "48h" ? "email" : "sms");

const SEED = `
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic tenant', 'synthetic-1105'),
                                                  ('${OTHER_TENANT}', 'Synthetic other tenant', 'synthetic-1105-other');
create table seed_pass as
  select z.p as pass_at, z.mode, 'run-' || to_char(z.p at time zone 'UTC', 'YYYYMMDDHH24MI') as pass_id,
         case when z.mode = 'send' then z.p + interval '10 seconds' else z.p + interval '150 milliseconds' end as created_at
    from (select ((d::date + time '07:00') + make_interval(mins => 15 * n)) at time zone 'Europe/Lisbon' + interval '3 seconds' as p,
                 case when d::date = date '2026-11-05' then 'send' else 'shadow' end as mode
            from generate_series(date '2026-11-04', date '2026-11-05', interval '1 day') d,
                 generate_series(0, 59) n) z
   where z.p <= ${at("2026-11-05 12:50:00")};
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  select t.id, p.pass_id, p.mode, p.pass_at, 0, 0, false, case when p.mode = 'send' then 0 else 5 end, p.created_at
    from seed_pass p cross join (values ('${TENANT}'::uuid), ('${OTHER_TENANT}'::uuid)) as t(id);
`;

const visit = (id, start, { status = "scheduled", saved = true, created = "2026-10-01 09:00", updated = created, bookedAt = start, origin = "staff" } = {}) => `
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${id}', '${TENANT}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${at(start)}, ${at(start)} + interval '1 hour',
          '${status}', '${origin}', ${at(created)}, ${at(updated)});
${saved ? `insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${TENANT}', 'appointment.create', 'appointment', '${id}', '{"startsAt":"${iso(bookedAt)}"}', ${at(created)});` : ""}`;
/** A claim, with an id when `n` is given. */
const claim = (id, offset, start, when, { taker = "sweep", attempt = 1, n = null, early = false } = {}) => `
insert into public.reminder_claims (${n === null ? "" : "id, "}tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values (${n === null ? "" : `'${cid(n)}', `}'${TENANT}', '${id}', 'claim', '${offset}', '${channelOf(offset)}', ${at(start)}, ${at(dueOf(start, offset))}, '${taker}', ${early}, ${attempt}, ${at(when)});`;
const release = (n, id, offset, when) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id, created_at)
  values ('${TENANT}', '${id}', 'release', '${offset}', '${channelOf(offset)}', '${cid(n)}', ${at(when)});`;
const ledger = (id, offset, when, outcome = "sent", reason = null) => `
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
  values ('${TENANT}', '${id}', '${channelOf(offset)}', 'reminder.${offset}.${channelOf(offset)}', '${outcome}', ${reason ? `'${reason}'` : "null"}, ${at(when)});`;
const audit = (id, action, when, metadata = "{}") => `
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${TENANT}', '${action}', 'appointment', '${id}', '${metadata}', ${at(when)});`;
const moved = (id, when, toStart, fromStart) => audit(id, "appointment.reschedule", when, JSON.stringify({
  ...(fromStart === undefined ? {} : { fromStartsAt: iso(fromStart) }),
  startsAt: iso(toStart),
}));
/** The sweep's pass of slot `slot` took it: a claim 2 seconds after the pass's clock, the `sent` row a second later. */
const taken = (id, offset, start, slot = dueOf(start, offset), opts = {}) =>
  claim(id, offset, start, `${slot}:05`, opts) + ledger(id, offset, `${slot}:06`);

const BASE = [
  visit(appt(1), "2026-11-06 08:00"), taken(appt(1), "24h", "2026-11-06 08:00"),
  visit(appt(2), "2026-11-06 09:00"), taken(appt(2), "24h", "2026-11-06 09:00"),
  visit(appt(3), "2026-11-07 08:30"), taken(appt(3), "48h", "2026-11-07 08:30"),
].join("\n");

const KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const only = (faults) => Object.fromEntries(KEYS.map((k) => [k, String(faults[k] ?? "OK")]));

const V = appt(0xa1);
const PEDIDO = '{"via":"portal_request_confirm"}';
/** An online request for Friday 10:00, 24h mark Thursday 10:00, sent by the 11:00 pass. */
const R34_SHAPE = ({ c0 = "2026-11-05 10:00:05", save = "2026-11-05 10:20", start = "2026-11-06 10:00", slot = "2026-11-05 11:00", offset = "24h" } = {}) => [
  visit(V, start, { origin: "patient_portal" }),
  c0 ? claim(V, offset, start, c0, { n: 1 }) + ledger(V, offset, c0.replace(/:05$/, ":06"), "suppressed", "channels_off") + release(1, V, offset, c0.replace(/:05$/, ":07")) : "",
  save ? audit(V, "appointment.update", save, PEDIDO) : "",
  claim(V, offset, start, `${slot}:05`, { attempt: c0 ? 2 : 1 }), ledger(V, offset, `${slot}:06`),
].join("\n");
const TWO_TAKERS = (second = true) => [
  visit(V, second ? "2026-11-06 09:30" : "2026-11-06 08:15"),
  claim(V, "24h", "2026-11-06 08:15", "2026-11-05 08:10", { taker: "run", attempt: 1 }),
  claim(V, "24h", "2026-11-06 08:15", "2026-11-05 08:15:05", { attempt: 2 }),
  ledger(V, "24h", "2026-11-05 08:15:06"),
  second ? moved(V, "2026-11-05 08:40", "2026-11-06 09:30", "2026-11-06 08:15") + taken(V, "24h", "2026-11-06 09:30") : "",
].join("\n");
const NO_ROWS = `delete from public.reminder_dispatches; delete from public.reminder_claims;`;

const CASES = [
  {
    name: "clean",
    seed: "",
    want: only({}),
    info: [
      [20, /2026-11-04 22:00:00 \| 2026-11-05 07:00:03 \| 2026-11-05 12:45:03 \| 2026-11-05 13:00:00/],
      [3, /slots expected 24 for tenants 2; missing 0;/],
      [7, /marks 3; sent 3; a recorded reason 0; kept out by R24 0; a claim with nothing after it 0; missed 0/],
      [10, /sweep-sent rows 3; after such a save 0, R34 0, sweep-sent S5 0; with no selecting pass yet 0/],
      [36, /\| 0 \|/],
      [40, /sent_by_sweep=3 sent_by_job=0 sent_no_claim=0 double_sends=0 sweep_sent_s5=0 missed=0/],
      [30, /sweep, 24h sms \| 2 \|/],
      [33, /\| 0 \|/],
    ],
  },
  {
    name: "empty: no heartbeat, no claim, no ledger row",
    seed: "delete from public.reminder_sweep_passes; delete from public.reminder_dispatches; delete from public.reminder_claims;",
    want: only({ 2: "VACUOUS", 3: "FAIL", 4: "VACUOUS", 5: "VACUOUS", 6: "VACUOUS", 7: "VACUOUS", 8: "VACUOUS", 9: "VACUOUS", 10: "VACUOUS", 11: "VACUOUS" }),
  },
  {
    name: "no send at all since 07:00 on a working Thursday, the marks due: VACUOUS, never OK, and every mark reads missed",
    seed: NO_ROWS,
    want: only({ 4: "VACUOUS", 5: "VACUOUS", 6: "VACUOUS", 7: "REVIEW", 8: "VACUOUS", 10: "VACUOUS", 11: "VACUOUS" }),
    info: [[40, /missed=3/], [51, new RegExp(`${appt(1)} \\| missed`)]],
  },
  {
    name: "a shadow heartbeat after the switch",
    seed: `insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
           values ('${TENANT}', 'run-shadow', 'shadow', ${at("2026-11-05 12:50:03")}, 0, 0, false, 0, ${at("2026-11-05 12:50:04")});`,
    want: only({ 2: "FAIL" }),
  },
  { name: "a gap: the 07:30 pass of every tenant missing", seed: `delete from public.reminder_sweep_passes where pass_at = ${at("2026-11-05 07:30:03")};`, want: only({ 3: "FAIL" }), info: [[3, /missing 2;/]] },
  { name: "the switch at Thursday 08:20: the slots run from 08:30, the floor is that pass", seed: "", switched: "2026-11-05T08:20:00Z", want: only({}), info: [[3, /slots expected 18 /], [7, /marks 1; sent 1;/]] },
  {
    name: "only the sleeping job sent: REVIEW on 4 and 6, no sweep-sent row",
    seed: `update public.reminder_claims set taker = 'run';`,
    want: only({ 4: "REVIEW", 6: "REVIEW", 10: "VACUOUS" }),
    info: [[40, /sent_by_sweep=0 sent_by_job=3/], [53, new RegExp(`${appt(1)} \\| sent by the sleeping job`)]],
  },
  {
    name: "DOUBLE SEND: one start, two sent rows",
    seed: ledger(appt(1), "24h", "2026-11-05 08:30:00"),
    want: only({ 5: "FAIL" }),
    info: [[5, /one start sent twice 1; two takers, each followed by a send 0/], [40, /double_sends=1/], [50, new RegExp(`${appt(1)} \\| one start sent twice`)]],
  },
  {
    name: "DOUBLE SEND across the switch: the job sent on Wednesday, the sweep on Thursday, one start",
    seed: claim(appt(1), "24h", "2026-11-06 08:00", "2026-11-04 20:00", { taker: "run", attempt: 2, early: true }) + ledger(appt(1), "24h", "2026-11-04 20:00:01"),
    want: only({ 5: "FAIL" }),
    info: [[5, /one start sent twice 1;/]],
  },
  {
    name: "two sent rows of one start, both before the switch: not this read's",
    seed: [
      visit(V, "2026-11-06 10:15"), taken(V, "24h", "2026-11-06 10:15"),
      claim(V, "48h", "2026-11-06 10:15", "2026-11-04 10:15:02", { taker: "run" }), ledger(V, "48h", "2026-11-04 10:15:03"), ledger(V, "48h", "2026-11-04 10:15:09"),
    ].join("\n"),
    want: only({}),
  },
  { name: "DOUBLE SEND: two live claims of different takers, each followed by a send, the second row read against a moved start", seed: TWO_TAKERS(true), want: only({ 5: "FAIL" }), info: [[5, /one start sent twice 0; two takers, each followed by a send 1/], [33, /\| 1 \|/]] },
  { name: "two live claims of different takers, ONE send: printed, not a double send", seed: TWO_TAKERS(false), want: only({}), info: [[34, /\| 1 \|/]] },
  {
    name: "one reminder sent for two starts, a re-plan: INFO, no FAIL",
    seed: [
      visit(V, "2026-11-06 09:30"),
      taken(V, "24h", "2026-11-06 08:15"),
      moved(V, "2026-11-05 08:40", "2026-11-06 09:30", "2026-11-06 08:15"),
      taken(V, "24h", "2026-11-06 09:30"),
    ].join("\n"),
    want: only({}),
    info: [[33, /\| 1 \|/], [40, /double_sends=0/]],
  },
  { name: "a missed reminder: due, no send, no reason", seed: visit(V, "2026-11-06 08:30"), want: only({ 7: "REVIEW" }), info: [[7, /missed 1/], [51, new RegExp(`${V} \\| missed`)], [40, /missed=1/]] },
  { name: "a claim with nothing after it", seed: visit(V, "2026-11-06 08:30") + claim(V, "24h", "2026-11-06 08:30", "2026-11-05 08:30:05"), want: only({ 7: "REVIEW" }), info: [[7, /a claim with nothing after it 1; missed 0/]] },
  {
    name: "a recorded reason: held back, its claim given up",
    seed: visit(V, "2026-11-06 08:30") + claim(V, "24h", "2026-11-06 08:30", "2026-11-05 08:30:05", { n: 2 }) + ledger(V, "24h", "2026-11-05 08:30:06", "suppressed", "channels_off") + release(2, V, "24h", "2026-11-05 08:30:07"),
    want: only({}),
    info: [[7, /a recorded reason 1;/], [32, /24h sms, suppressed \(channels_off\) \| 1 \|/]],
  },
  {
    name: "R24 kept it out: moved after its mark to this start, no row on either side",
    seed: visit(V, "2026-11-06 08:05", { bookedAt: "2026-11-06 11:00" }) + moved(V, "2026-11-05 08:10", "2026-11-06 08:05", "2026-11-06 11:00"),
    want: only({}),
    info: [[7, /kept out by R24 1;/]],
  },
  { name: "a move that keeps the start, after the mark, no row: not R24's, missed", seed: visit(V, "2026-11-06 08:05") + moved(V, "2026-11-05 08:10", "2026-11-06 08:05", "2026-11-06 08:05"), want: only({ 7: "REVIEW" }), info: [[7, /missed 1/]] },
  { name: "not a mark to take: the visit is cancelled", seed: visit(V, "2026-11-06 08:30", { status: "cancelled" }), want: only({}) },
  { name: "not a mark to take: the visit was created after its mark", seed: visit(V, "2026-11-06 08:30", { created: "2026-11-05 09:00", saved: false }), want: only({}) },
  { name: "not a mark to take: due before the floor, the job's", seed: visit(V, "2026-11-06 07:00"), want: only({}) },
  { name: "not a mark to take yet: due after the last finished pass", seed: visit(V, "2026-11-06 12:50"), want: only({}) },
  {
    name: "the job sent a mark from before the floor: by design",
    seed: visit(V, "2026-11-06 07:00") + claim(V, "24h", "2026-11-06 07:00", "2026-11-05 07:20", { taker: "run" }) + ledger(V, "24h", "2026-11-05 07:20:01"),
    want: only({}),
    info: [[6, /marks since the floor 0; marks before it, by design 1/]],
  },
  {
    name: "the job sent a mark from since the floor: the sweep missed it, REVIEW",
    seed: visit(V, "2026-11-06 08:40") + claim(V, "24h", "2026-11-06 08:40", "2026-11-05 09:00", { taker: "run" }) + ledger(V, "24h", "2026-11-05 09:00:01"),
    want: only({ 6: "REVIEW" }),
    info: [[53, new RegExp(`${V} \\| sent by the sleeping job`)]],
  },
  { name: "the late limit: an SMS 3 hours 5 minutes after its mark", seed: visit(V, "2026-11-06 04:00") + claim(V, "24h", "2026-11-06 04:00", "2026-11-05 07:05", { taker: "run" }) + ledger(V, "24h", "2026-11-05 07:05:01"), want: only({ 8: "FAIL" }), info: [[8, /over the limit 1;/]] },
  { name: "the late limit: an SMS 3 hours 59 seconds after its mark, inside the minute", seed: visit(V, "2026-11-06 04:00") + claim(V, "24h", "2026-11-06 04:00", "2026-11-05 07:00:58", { taker: "run" }) + ledger(V, "24h", "2026-11-05 07:00:59"), want: only({}) },
  { name: "the late limit: an email 12 hours 30 minutes after its mark", seed: visit(V, "2026-11-06 20:00") + claim(V, "48h", "2026-11-06 20:00", "2026-11-05 08:30", { taker: "run" }) + ledger(V, "48h", "2026-11-05 08:30:01"), want: only({ 8: "FAIL" }) },
  { name: "the late limit: an email 10 hours 30 minutes after its mark", seed: visit(V, "2026-11-06 22:30") + claim(V, "48h", "2026-11-06 22:30", "2026-11-05 09:00", { taker: "run" }) + ledger(V, "48h", "2026-11-05 09:00:01"), want: only({}) },
  { name: "the second switch reads off: a pass left a visit out", seed: `update public.reminder_sweep_passes set excluded_count = 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-11-05 08:00:03")};`, want: only({ 9: "FAIL" }) },
  { name: "a never-reminded visit taken and sent: counted", seed: visit(V, "2026-11-06 11:00", { saved: false }) + taken(V, "24h", "2026-11-06 11:00"), want: only({}), info: [[9, /never-reminded visits taken 1/], [35, /\| 1; 1; 1 \|/]] },
  { name: "R34: handed over and held back before the save, tried again inside 3 hours: its label", seed: R34_SHAPE(), want: only({}), info: [[10, /after such a save 1, R34 1, sweep-sent S5 0/]] },
  { name: "SWEEP-SENT S5: a save after the mark, no claim before it", seed: R34_SHAPE({ c0: null }), want: only({ 10: "FAIL" }), info: [[10, /sweep-sent S5 1/], [52, new RegExp(`${V} \\| sweep-sent S5`)], [40, /sweep_sent_s5=1/]] },
  { name: "SWEEP-SENT S5: the only earlier claim came after the save", seed: R34_SHAPE({ c0: "2026-11-05 10:15:05", save: "2026-11-05 10:10" }), want: only({ 10: "FAIL" }) },
  { name: "SWEEP-SENT S5: past R34's cap, an email (the SMS late rule would refuse it), the selecting pass 3 hours 10 minutes after the mark", seed: R34_SHAPE({ offset: "48h", start: "2026-11-07 07:05", c0: "2026-11-05 07:15:05", save: "2026-11-05 07:20", slot: "2026-11-05 10:15" }), want: only({ 10: "FAIL" }) },
  { name: "R34: inside the cap, an email, the selecting pass 2 hours 55 minutes after the mark", seed: R34_SHAPE({ offset: "48h", start: "2026-11-07 07:05", c0: "2026-11-05 07:15:05", save: "2026-11-05 07:20", slot: "2026-11-05 10:00" }), want: only({}), info: [[10, /R34 1,/]] },
  { name: "SWEEP-SENT S5: a save between the previous pass and the selecting pass: the gate could read it", seed: R34_SHAPE({ c0: null, save: "2026-11-05 10:50" }), want: only({ 10: "FAIL" }) },
  { name: "a save between the selection and the send: not the gate's to see, printed, no S5", seed: R34_SHAPE({ c0: null, save: "2026-11-05 11:00:04" }), want: only({}), info: [[36, /\| 1 \|/]] },
  { name: "a sweep-sent row whose pass has not written its heartbeat: REVIEW, not FAIL", seed: visit(V, "2026-11-06 12:46") + taken(V, "24h", "2026-11-06 12:46", "2026-11-05 12:50"), want: only({ 10: "REVIEW" }), info: [[10, /with no selecting pass yet 1/]] },
  { name: "SWEEP-SENT S5: moved to this start after its mark, then taken", seed: visit(V, "2026-11-06 08:05", { bookedAt: "2026-11-06 11:00" }) + moved(V, "2026-11-05 08:10", "2026-11-06 08:05", "2026-11-06 11:00") + taken(V, "24h", "2026-11-06 08:05", "2026-11-05 08:15"), want: only({ 10: "FAIL" }) },
  { name: "a move that keeps the start, after the mark, then taken: no S5", seed: visit(V, "2026-11-06 08:05") + moved(V, "2026-11-05 08:10", "2026-11-06 08:05", "2026-11-06 08:05") + taken(V, "24h", "2026-11-06 08:05", "2026-11-05 08:15"), want: only({}) },
  { name: "a booked visit confirmed by hand after its mark, then taken: no S5", seed: visit(V, "2026-11-06 08:05") + audit(V, "appointment.update", "2026-11-05 08:10", '{"fromStatus":"scheduled","toStatus":"confirmed"}') + taken(V, "24h", "2026-11-06 08:05", "2026-11-05 08:15"), want: only({}) },
  { name: "a sent row with no claim: REVIEW", seed: visit(V, "2026-11-06 08:20") + ledger(V, "24h", "2026-11-05 08:20:30"), want: only({ 11: "REVIEW" }), info: [[54, new RegExp(`${V} \\| sent with no claim`)], [40, /sent_no_claim=1/]] },
  { name: "the read's clock at Thursday 09:10", seed: "", clock: "2026-11-05 09:10:00", want: only({ 1: "FAIL" }) },
];

/** Each predicate changed once, on the case that must kill it. `info` kills on a row, not a verdict. */
const MUTANTS = [
  ["no FAIL on another mode", "when s.other_beats > 0 then 'FAIL' when", "when false then 'FAIL' when", "a shadow heartbeat after the switch"],
  ["no FAIL on a gap", "when gaps > 0 then 'FAIL'", "when false then 'FAIL'", "a gap"],
  ["a zero send is not VACUOUS", "when since_first_slot = 0 then 'VACUOUS'", "when false then 'VACUOUS'", "no send at all"],
  ["only the job is not REVIEW", "when sweep_since_first_slot = 0 then 'REVIEW'", "when false then 'REVIEW'", "only the sleeping job"],
  ["the double send's count", "having count(*) > 1 and bool_or(s.since_switch)", "having count(*) > 2 and bool_or(s.since_switch)", "DOUBLE SEND: one start, two sent rows"],
  ["a double before the switch counts", "having count(*) > 1 and bool_or(s.since_switch)", "having count(*) > 1", "two sent rows of one start, both before the switch"],
  ["the double send's FAIL dead", "when (select count(*) from same_start) > 0 or (select count(*) from two_takers where each_sent) > 0 then 'FAIL'", "when false then 'FAIL'", "DOUBLE SEND: one start, two sent rows"],
  ["two claims of one taker", "and b.taker <> a.taker and", "and b.taker = a.taker and", "DOUBLE SEND: two live claims"],
  ["one send serves both claims", "join sent y on y.id <> x.id\n", "join sent y on true\n", "two live claims of different takers, ONE send"],
  ["the job on any mark is the sweep's miss", "count(*) filter (where s.taker = 'run' and s.due_at >= f.floor_at) as job_after_floor", "count(*) filter (where s.taker = 'run') as job_after_floor", "the job sent a mark from before the floor"],
  ["the job's REVIEW dead", "when job_after_floor > 0 then 'REVIEW'", "when false then 'REVIEW'", "the job sent a mark from since the floor"],
  ["marks before the floor are read", "     and a.starts_at - make_interval(mins => rm.minutes) >= f.floor_at\n", "", "not a mark to take: due before the floor"],
  ["marks after the last pass are read", "     and a.starts_at - make_interval(mins => rm.minutes) <= f.last_pass\n", "", "not a mark to take yet"],
  ["cancelled visits are read", "where a.status::text in ('scheduled', 'confirmed')\n     and a.starts_at", "where true\n     and a.starts_at", "not a mark to take: the visit is cancelled"],
  ["visits created after the mark are read", "     and a.created_at < a.starts_at - make_interval(mins => rm.minutes)\n", "", "not a mark to take: the visit was created after its mark"],
  ["R24's keeping out is missed", "when m.kept then 'kept out by R24'", "when false then 'kept out by R24'", "R24 kept it out"],
  ["a recorded reason is missed", "when m.has_reason then 'a recorded reason'", "when false then 'a recorded reason'", "a recorded reason"],
  ["missed's REVIEW dead", "when count(*) filter (where became in ('missed', 'a claim with nothing after it')) > 0 then 'REVIEW'", "when false then 'REVIEW'", "a missed reminder"],
  ["the late limit has no minute", "s.due_at + rm.late_limit + interval '1 minute')", "s.due_at + rm.late_limit)", "the late limit: an SMS 3 hours 59 seconds"],
  ["the SMS limit at 4 hours", "interval '3 hours')) as v(", "interval '4 hours')) as v(", "the late limit: an SMS 3 hours 5 minutes"],
  ["the email limit at 13 hours", "interval '12 hours'), (", "interval '13 hours'), (", "the late limit: an email 12 hours 30 minutes"],
  ["the email limit at 10 hours", "interval '12 hours'), (", "interval '10 hours'), (", "the late limit: an email 10 hours 30 minutes"],
  ["the second switch's FAIL dead", "(select count(*) from hb where mode = 'send' and excluded_count > 0) > 0 then 'FAIL'", "false then 'FAIL'", "the second switch reads off"],
  ["the S5 FAIL dead", "when (select count(*) from r34 where rearmed and not is_r34) > 0 then 'FAIL'", "when false then 'FAIL'", "SWEEP-SENT S5: a save after the mark"],
  ["R34's cap at 5 hours", "s.selected_at <= s.due_at + interval '3 hours'", "s.selected_at <= s.due_at + interval '5 hours'", "SWEEP-SENT S5: past R34's cap"],
  ["R34's cap at 2 hours", "s.selected_at <= s.due_at + interval '3 hours'", "s.selected_at <= s.due_at + interval '2 hours'", "R34: inside the cap"],
  ["R34 needs no claim before the first save", "and c0.id <> s.claim_id and c0.created_at <= e.first_rearm_at)", "and c0.id <> s.claim_id)", "SWEEP-SENT S5: the only earlier claim"],
  ["R34 needs no earlier claim at all", "and c0.id <> s.claim_id and c0.created_at <= e.first_rearm_at)", "and c0.created_at <= s.claimed_at)", "SWEEP-SENT S5: a save after the mark"],
  ["THE OLD ERROR: the selecting pass is the last heartbeat before the claim", "and h.created_at >= c.created_at and h.pass_at <= c.created_at\n       order by h.created_at, h.pass_at desc limit 1", "and h.created_at <= c.created_at\n       order by h.created_at desc limit 1", "SWEEP-SENT S5: a save between the previous pass"],
  ["THE OLD ERROR: saves are read up to the claim", "s.selected_at as upto\n", "s.claimed_at as upto\n", "a save between the selection and the send"],
  ["no REVIEW for a row with no selecting pass", "when (select count(*) from swept where selected_at is null) > 0 then 'REVIEW'", "when false then 'REVIEW'", "a sweep-sent row whose pass has not written"],
  ["every move counts", "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)", "and true", "a move that keeps the start, after the mark, then taken"],
  ["a confirmation by hand counts", "and l.metadata->>'toStatus' = 'confirmed' and a.origin = 'patient_portal'\n", "and l.metadata->>'toStatus' = 'confirmed'\n", "a booked visit confirmed by hand"],
  ["no REVIEW for a row with no claim", "when total = 0 then 'VACUOUS' when no_claim > 0 then 'REVIEW'", "when total = 0 then 'VACUOUS' when false then 'REVIEW'", "a sent row with no claim"],
  ["the row belongs to the earliest claim", "order by c.created_at desc, c.attempt desc limit 1", "order by c.created_at, c.attempt limit 1", "R34: handed over and held back", null, [10, /R34 1,/]],
  ["a claim with nothing after it reads missed", "when m.has_live_claim then 'a claim with nothing after it'", "when false then 'a claim with nothing after it'", "a claim with nothing after it", null, [7, /a claim with nothing after it 1; missed 0/]],
];
for (const [what, from, to, caseName, more, infoKill] of MUTANTS) {
  const base = CASES.find((c) => c.name.startsWith(caseName) && !c.mutate);
  assert.ok(base, `no case named ${caseName}`);
  CASES.push({
    name: `MUTANT: ${what}, on "${caseName}"`,
    seed: base.seed,
    switched: base.switched,
    clock: base.clock,
    mutate: (s) => {
      assert.equal(s.split(from).length, 2, `the mutated text is not written exactly once: ${from}`);
      return s.replace(from, () => to);
    },
    kills: infoKill ? undefined : base.name,
    killsInfo: infoKill,
  });
}

const PGURL = process.env.FIRST_SEND_1105_TEST_PGURL;

test("the read on a local database: every verdict flips on its own seeded fault, every mutant dies", { skip: PGURL ? false : "FIRST_SEND_1105_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: FIRST_SEND_1105_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  const ok = (r) => { assert.equal(r.status, 0, `psql failed: ${r.stderr}`); return r.stdout; };
  const admin = (statement) => ok(psql(PGURL, ["-c", statement]));
  const BASE_DB = "firstsend1105_test_base";
  const CASE_DB = "firstsend1105_test_case";
  admin(`drop database if exists ${BASE_DB}`);
  admin(`create database ${BASE_DB}`);
  const work = mkdtempSync(join(tmpdir(), "firstsend1105-db-"));
  const results = [];
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    spawnSync("psql", [dbUrl(BASE_DB), "-X", "-q"], { encoding: "utf8", input: dump.stdout, maxBuffer: 64 * 1024 * 1024 });
    ok(psql(dbUrl(BASE_DB), [], SEED + BASE));
    const runRead = (db, text, switched) => {
      const file = join(work, "read.sql");
      writeFileSync(file, text);
      const set = switched === null ? [] : ["-c", `set local ${GUC} = '${switched}'`];
      return psql(dbUrl(db), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", ...set, "-f", file, "-c", "rollback"]);
    };
    const withClock = (clock) => {
      const t = sql.replace(CLOCK_LINE, `  select timestamptz '${clock} Europe/Lisbon' as t1`);
      assert.notEqual(t, sql, "the clock line was not replaced");
      return t;
    };
    {
      const r = runRead(BASE_DB, withClock(READ_CLOCK), null);
      assert.notEqual(r.status, 0, "the read ran without the switch time");
      assert.match(r.stderr, /unrecognized configuration parameter "osteojp\.r47_switched_at"/);
      results.push("the switch time unset: the read stops with an error, no table");
    }
    for (const c of CASES) {
      admin(`drop database if exists ${CASE_DB}`);
      admin(`create database ${CASE_DB} template ${BASE_DB}`);
      if (c.seed) ok(psql(dbUrl(CASE_DB), [], c.seed));
      let text = withClock(c.clock ?? READ_CLOCK);
      if (c.mutate) {
        const mutated = c.mutate(text);
        assert.notEqual(mutated, text, `${c.name}: the mutant changed nothing`);
        text = mutated;
      }
      const out = ok(runRead(CASE_DB, text, c.switched ?? SWITCHED));
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f")).filter((r) => r.length === 5);
      const verdictRows = rows.filter((r) => r[4] !== "INFO");
      const verdicts = Object.fromEntries(verdictRows.map((r) => [String(Number(r[0])), r[4]]));
      assert.equal(verdictRows.length, Object.keys(verdicts).length, `${c.name}: a verdict printed twice\n${out}`);
      results.push(`${c.name}: ${verdictRows.map((r) => `${Number(r[0])}=${r[4]}`).filter((s) => !s.endsWith("=OK")).join(", ") || "all OK"}`);
      if (c.want) assert.deepEqual(verdicts, c.want, `${c.name}: verdicts\n${out}`);
      if (c.kills) {
        const unmutated = CASES.find((u) => u.name === c.kills);
        assert.notDeepStrictEqual(verdicts, unmutated.want, `${c.name}: the mutant SURVIVES`);
      }
      if (c.killsInfo) {
        const [n, rx] = c.killsInfo;
        assert.ok(!rows.some((r) => Number(r[0]) === n && rx.test(r.slice(1).join(" | "))), `${c.name}: the mutant SURVIVES: row ${n} still reads ${rx}`);
      }
      for (const [n, rx] of c.info ?? []) {
        assert.ok(rows.some((r) => Number(r[0]) === n && rx.test(r.slice(1).join(" | "))), `${c.name}: no row ${n} matching ${rx}\n${out}`);
      }
      admin(`drop database ${CASE_DB}`);
    }
  } finally {
    if (process.env.FIRST_SEND_1105_TEST_REPORT) writeFileSync(process.env.FIRST_SEND_1105_TEST_REPORT, results.join("\n") + "\n");
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${CASE_DB}`], { encoding: "utf8" });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE_DB}`], { encoding: "utf8" });
  }
});

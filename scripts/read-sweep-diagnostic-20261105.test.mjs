// SWEEP DIAGNOSTIC (2026-11-05, strategy's A1 of 2026-11-04): one read-only read of the reminder
// sweep's heartbeats of Tuesday 2026-11-03, the heartbeats whose counts differ, and the history of
// one shadow-only mark. Its document and its one block agree with each other, the read writes
// nothing and prints no patient field, every halt in the block is explicit (proven by fault
// injection), and, on a local database, the read reports each seeded shape exactly.
//
// WHAT THIS PROVES, with no database:
//   * the document pins the real read, guard and module, and the sidecar pins the document; the
//     document's first line is its NOT READY line until R4 has read it;
//   * the read writes nothing, controls no transaction, reads the clock once and the appointment id
//     once, names no column that holds a person, prints no tenant id, and names no appointment;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; both
//     database variables are unset, each with its own halt, before the credential load; one psql
//     call, `begin read only` ... `rollback`, the appointment id set inside it, writing to the
//     handover file only with `> ${OUT} 2>&1`; it fetches `refs/pull/<N>/head` and checks the
//     fetched head and the checkout by full sha; it reads the Lisbon clock with TZ=Europe/Lisbon;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`), every external command a stub, each call made to
//     fail in turn: each run ends with exit 1, exactly one STOP line, no closing line, and the tool
//     chain stopped. Under bash always; under zsh wherever zsh is installed (not on the GitHub
//     runner);
//   * the block prints its closing line only on a well-formed table, prints only counts, times,
//     verdict words and finding words, and never an appointment id or a pass id.
//
// WITH A LOCAL DATABASE (SWEEP_DIAG_1105_TEST_PGURL names one on 127.0.0.1 or localhost whose
// `public` schema is the repository's): the read runs on a seeded throwaway per case, as the block
// runs it, with the appointment id set as the block sets it. Any other host is refused. Without the
// variable those cases are skipped.
//
// Run: node --test scripts/read-sweep-diagnostic-20261105.test.mjs

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

const DOC_PATH = "docs/read-sweep-diagnostic-20261105.md";
const SIDECAR = "docs/read-sweep-diagnostic-20261105.sha256";
const READ_PATH = "scripts/db/read-sweep-diagnostic-20261105.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const OUT_NAME = "sweep-diagnostic-20261105.out";
const PRHEAD = "a".repeat(40);
const GUC = "osteojp.diag_appointment_id";
const CLOSING = "SWEEP-DIAGNOSTIC-1105 READ: ";

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

test("the document reads NOT READY until R4 has read it, and the sidecar pins it", () => {
  assert.equal(doc.split("\n")[0], "NOT READY: awaiting R4 review");
  assert.equal(read(SIDECAR).trim(), `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table and in the block", () => {
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(doc.slice(0, doc.indexOf("## THE BLOCK")).includes(s), `the pins table does not carry ${path}'s sha256`);
  }
  // The guard and its module are the bytes #1691 pins (the 2026-10-31 read's).
  assert.equal(sha256(read(GUARD)), "6c9a481c7f1bb73014639799d1be33702d9742da8fac8c32ed6d5650e0fffc96");
  assert.equal(sha256(read(MODULE)), "e037104dfbfa698e8a64869b08db6ba5324e35155459f790cdd66fa06a26051c");
});

test("the read writes nothing, controls no transaction, reads the clock once and the appointment id once", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "row 0 must read the transaction's own setting");
  assert.equal((sql.match(/current_setting\('osteojp\.diag_appointment_id'\)/g) || []).length, 1, "the appointment id is read other than once");
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date)\b/i, "a second clock");
  // No commit-time probe: EXECUTE is checked when the plan starts, even in a branch that never runs.
  assert.doesNotMatch(sql, /pg_xact_commit_timestamp|track_commit_timestamp|\bxmin\b/, "a commit-time probe or its setting");
});

test("the read names no appointment, no column that holds a person, no tenant id and no metadata text", () => {
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "the read names a uuid");
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|patient_2_id|practitioner_id|created_by|provider_message_id|body|body_length|ip|room|name|description|payload)\b/i, "the read names a personal column");
  // actor_user_id is joined on to read a role slug, and never printed.
  for (const line of code.split("\n").filter((l) => /actor_user_id/.test(l))) {
    assert.doesNotMatch(line, /actor_user_id::text|\|\|\s*l\.actor_user_id|actor_user_id\s*\|\|/, `the actor's id is printed: ${line}`);
  }
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\||\|\|\s*[a-z]+\.tenant_id/, "the read prints a tenant id");
  assert.doesNotMatch(sql, /\|\|\s*l\.metadata|metadata->>'[a-zA-Z]+'\s*\|\||\|\|\s*\(?l\.metadata/, "metadata text is printed");
  // The subject's id is passed in and compared, never printed.
  assert.doesNotMatch(code, /subject::text|k\.subject\s*\|\||\bs\.id::text|\bsj\.id::text/, "the subject's id is printed");
  // No appointment id is printed at all: rows 22 to 24 name visits by an ordinal of the read.
  assert.doesNotMatch(code, /appointment_id::text|appointment_id\s*\|\||\|\|\s*[a-z]+\.appointment_id/, "an appointment id is printed");
  assert.equal((sql.match(/else 'visit ' \|\| \(select v\.vn from vis v where v\.appointment_id = [cu]\.appointment_id\)::text/g) || []).length, 3, "rows 22 to 24 do not name visits by ordinal");
  assert.equal((sql.match(/\) z where z\.rk <= 100\n/g) || []).length, 3, "the id lists are not capped at 100 each");
});

test("the read's verdict rows, finding rows and the document's tables agree", () => {
  const nums = [...sql.matchAll(/^  select (\d+)(?: as n)?, /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, [0, 1, 2, 3, 10, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 40, 41, 42, 43], "the read's rows moved");
  // F1 is never REFUTED (its run time's meaning is NOT VERIFIED).
  const f1 = sql.slice(sql.indexOf("  select 30, 0,"), sql.indexOf("  select 31, 0,"));
  assert.doesNotMatch(f1, /then 'REFUTED'/, "F1 can read REFUTED");
  assert.match(block, /F1 \(CONFIRMED\|CONSISTENT\|UNDECIDED\|NO_SUBJECT\) F2 \(CONFIRMED\|REFUTED\|NO_SUBJECT\) /, "the block accepts another F1 or F2 word");
  for (const n of ["| 0 |", "| 2 |", "| 3 |", "| 20 |", "| 40 |", "| 30 |", "| 31 |", "| 32 |", "| 33 |"]) {
    assert.ok(doc.includes(n), `the document's tables have no row ${n}`);
  }
  for (const w of ["CONFIRMED", "CONSISTENT", "REFUTED", "UNDECIDED", "NO_SUBJECT", "EVIDENCED", "DOOR_ONLY", "NO_EVIDENCE"]) {
    assert.ok(sql.includes(`'${w}'`), `the read never prints ${w}`);
    assert.ok(block.includes(w), `the block does not accept ${w}`);
  }
});

test("the block's shape: pipefail on line 2, no set -e, no # line, both URLs unset before the env file, one read-only psql", () => {
  const lines = block.split("\n");
  assert.equal(lines[0], "(");
  assert.equal(lines[1], "set -o pipefail");
  assert.equal(lines.at(-1), ")");
  assert.doesNotMatch(block, /set -e|errexit/);
  assert.ok(!lines.some((l) => l.trimStart().startsWith("#")), "a # line in the block");
  assert.ok(!lines.some((l) => l.endsWith("\\")), "a backslash continuation in the block");
  assert.deepEqual(lines.slice(2, 6), ["PRHEAD=PENDING", "DOCSHA=PENDING", "PRNUM=PENDING", "APPT_ID=PENDING"]);
  assert.equal((block.match(/=PENDING$/gm) || []).length, 4);
  const pending = lines.findIndex((l) => l.startsWith('echo "${PRHEAD} ${DOCSHA} ${PRNUM} ${APPT_ID}" | grep -qxE'));
  assert.ok(pending > 0 && lines.slice(0, pending).every((l) => l === "(" || l === "set -o pipefail" || /^[A-Z_]+=\S+$/.test(l)), "the PENDING check is not the first command");
  const u1 = lines.indexOf('unset DATABASE_URL || { echo "STOP: DATABASE_URL could not be unset. Nothing was read"; exit 1; }');
  const u2 = lines.indexOf('unset DATABASE_URL_DIRECT || { echo "STOP: DATABASE_URL_DIRECT could not be unset. Nothing was read"; exit 1; }');
  const load = lines.findIndex((l) => l.includes(`. ${ENV_FILE}`));
  const guard = lines.findIndex((l) => l.startsWith("node scripts/assert-production-target.mjs ||"));
  assert.ok(u1 > 0 && u2 > u1 && load > u2 && guard > load, "the two unsets, each with its halt, do not come before the credential load and the guard");
  const psql = lines.filter((l) => /^psql /.test(l));
  assert.equal(psql.length, 1);
  assert.ok(lines.indexOf(psql[0]) > guard, "psql runs before the guard");
  assert.ok(!lines.some((l) => /(^|[;|&] *)psql /.test(l) && !/^psql /.test(l)), "a psql call that does not start its line");
  assert.match(psql[0], /^psql "\$\{DATABASE_URL_DIRECT\}" -X -v ON_ERROR_STOP=1 -P pager=off -c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp\.diag_appointment_id = '\$\{APPT_ID\}'" -c "select 'read only: '/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback" > \$\{OUT\} 2>&1 \|\| \{/);
  assert.doesNotMatch(block, /\btee\b/, "the block uses tee");
  assert.doesNotMatch(block, /\b(cat|head|tail|less|more)\b[^\n]*\$\{OUT\}/, "the block prints the transcript");
  assert.ok(lines.includes(`OUT=${OUT_DIR}/${OUT_NAME}`), "the transcript does not go to the handover folder");
  assert.ok(lines.includes('git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request\'s head could not be fetched. Nothing was read"; exit 1; }'));
  assert.ok(lines.some((l) => l.startsWith('[ "${FH}" = "${PRHEAD}" ] ||')), "the fetched head is not checked by full sha");
  assert.ok(lines.some((l) => l.startsWith('[ "${HD}" = "${PRHEAD}" ] ||')), "the checkout is not checked by full sha");
  assert.ok(lines.some((l) => l.startsWith("NOW=$(TZ=Europe/Lisbon date ")), "the Lisbon clock is not read with TZ=Europe/Lisbon");
  assert.ok(lines.some((l) => l.startsWith('echo "lisbon now: ')), "the Lisbon clock is not printed");
  assert.doesNotMatch(block, /origin\/main|merge-base/, "the block reads main");
  assert.ok(!/(^|[^A-Za-z])\/tmp\//.test(block), "the block writes under /tmp");
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `a halt that is not one STOP and exit 1: ${l}`);
  }
  // Every echo prints a fixed sentence, a count, a hash, a clock, a verdict line or the findings.
  // (The PENDING check pipes the id into `grep -q`, which prints nothing.)
  for (const l of lines.filter((x) => !/^echo "[^"]*" \| grep -qxE /.test(x))) {
    for (const m of l.matchAll(/echo "([^"]*)"/g)) {
      assert.doesNotMatch(m[1], /\$\{(APPT_ID|DATABASE_URL|DATABASE_URL_DIRECT)\}/, `an echo prints the appointment id or a URL: ${l}`);
    }
  }
  assert.equal(lines.filter((l) => l.includes("${APPT_ID}")).length, 2, "the appointment id is used other than in the PENDING check and the psql setting");
});

// ---- The fault-injection harness (#1691's, with the appointment id and this read's table). ----

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const realOf = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH }, encoding: "utf8" });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const STUBBED = ["git", "node", "psql", "date", "grep", "awk", "cut", "shasum", "rm"];
const FAKED = ["git", "node", "psql", "date"];
const HARNESS_APPT = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ID = "00000000-0000-4000-8000-0000000000a9";
const PASS_ID = "01KA1B2C3D4E5F6G7H8J9KMNPQ";
const HARNESS_PRNUM = "4242";

const vrow = (n, text, observed, v) => ` ${String(n).padStart(2)} | ${text} | ${observed} | x | ${v}`;
const TABLE_OK = [
  "BEGIN", "SET", "SET", "SET",
  " sweep_diagnostic_transaction ", "------------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  vrow(0, "0. this transaction is READ ONLY", "on", "OK"),
  vrow(1, "the heartbeat table", "id, tenant_id, pass_id", "INFO"),
  vrow(2, "2. heartbeats on 2026-11-03", "heartbeats 60, tenants 1, shadow 60, send 0, distinct pass ids 60, with no pass id 0", "OK"),
  vrow(3, "3. tenant 1, slots on 2026-11-03", "heartbeats 60 (shadow 60), pass ids 60, slots 59; doubled 10:15; missing 10:00; outside none; counts that differ 2", "REVIEW"),
  ` 10 | heartbeat on 2026-11-03, tenant 1, slot 10:15 | pass id ${PASS_ID}; run created 10:00:00.500 | flags: slot doubled | INFO`,
  vrow(20, "20. shadow heartbeats whose recorded count is not", "heartbeats 180; counts that differ 2; rows short in all 2, rows over in all 0; of them on 2026-11-03 2; at 2026-11-03 12:15 tenant 1 short 1, 2026-11-03 16:30 tenant 1 short 1", "REVIEW"),
  ` 21 | count differs: 2026-11-03 12:15, tenant 1 | pass id ${PASS_ID} | flags: count differs | INFO`,
  ` 22 | counted, no row (a hard-deleted visit) | ${OTHER_ID}, 48h email | a candidate | INFO`,
  vrow(30, "F1 a late pass", "late 1", "CONFIRMED"),
  vrow(31, "F2 a mark re-selected", "marks 0", "REFUTED"),
  vrow(32, "F3 rows that went with a hard-deleted visit", "differ 2", "CONFIRMED"),
  vrow(33, "F4 a scheduling event", "doors 2", "EVIDENCED"),
  vrow(40, "40. the appointment passed in", "status scheduled", "OK"),
  ` 41 | audit row 1: appointment.create | written 2026-10-26 09:00:00.000; by staff, role reception | information | INFO`,
  // A decoy whose number contains 3: a block matching row 3 or 30 as a substring reads it too.
  " 300 | a decoy row whose number contains 3 and 30 | CONFIRMED REVIEW | x | INFO",
  "(16 rows)", "", "ROLLBACK",
].join("\n");
const swapV = (t, n, from, to) => {
  const lines = t.split("\n");
  const i = lines.findIndex((l) => l.startsWith(` ${String(n).padStart(2)} | `) && l.endsWith(`| ${from}`));
  assert.ok(i >= 0, `no row ${n} reading ${from}`);
  lines[i] = lines[i].slice(0, -from.length) + to;
  return lines.join("\n");
};
const drop = (t, n) => t.split("\n").filter((l) => !l.startsWith(` ${String(n).padStart(2)} | `)).join("\n");
const twice = (t, n) => t.split("\n").flatMap((l) => (l.startsWith(` ${String(n).padStart(2)} | `) ? [l, l] : [l])).join("\n");
const FIXTURES = {
  ok: TABLE_OK,
  control: swapV(swapV(swapV(swapV(TABLE_OK, 3, "REVIEW", "OK"), 20, "REVIEW", "OK"), 30, "CONFIRMED", "NO_SUBJECT"), 32, "CONFIRMED", "NO_SUBJECT"),
  undecided: swapV(swapV(TABLE_OK, 30, "CONFIRMED", "UNDECIDED"), 33, "EVIDENCED", "DOOR_ONLY"),
  consistent: swapV(swapV(TABLE_OK, 30, "CONFIRMED", "CONSISTENT"), 31, "REFUTED", "NO_SUBJECT"),
  noevidence: swapV(TABLE_OK, 33, "EVIDENCED", "NO_EVIDENCE"),
  twotenants: TABLE_OK.replace(vrow(3, "3. tenant 1, slots on 2026-11-03", "heartbeats 60 (shadow 60), pass ids 60, slots 59; doubled 10:15; missing 10:00; outside none; counts that differ 2", "REVIEW"),
    `${vrow(3, "3. tenant 1, slots on 2026-11-03", "heartbeats 60 (shadow 60), pass ids 60, slots 59; doubled 10:15; missing 10:00; outside none; counts that differ 2", "REVIEW")}\n${vrow(3, "3. tenant 2, slots on 2026-11-03", "heartbeats 60 (shadow 60), pass ids 60, slots 60; doubled none; missing none; outside none; counts that differ 0", "OK")}`),
  notreadonly: TABLE_OK.replace(" read only: on", " read only: off"),
  fail0: swapV(TABLE_OK, 0, "OK", "FAIL"),
  vac2: swapV(TABLE_OK, 2, "OK", "VACUOUS"),
  vac20: swapV(TABLE_OK, 20, "REVIEW", "VACUOUS"),
  vac40: swapV(TABLE_OK, 40, "OK", "VACUOUS"),
  review2: swapV(TABLE_OK, 2, "OK", "REVIEW"),
  review40: swapV(TABLE_OK, 40, "OK", "REVIEW"),
  fail3: swapV(TABLE_OK, 3, "REVIEW", "FAIL"),
  no0: drop(TABLE_OK, 0), no2: drop(TABLE_OK, 2), no3: drop(TABLE_OK, 3), no20: drop(TABLE_OK, 20), no40: drop(TABLE_OK, 40),
  double2: twice(TABLE_OK, 2), double20: twice(TABLE_OK, 20), double40: twice(TABLE_OK, 40),
  stray: TABLE_OK.replace(vrow(40, "40. the appointment passed in", "status scheduled", "OK"), `${vrow(40, "40. the appointment passed in", "status scheduled", "OK")}\n${vrow(44, "a stray verdict", "x", "OK")}`),
  no30: drop(TABLE_OK, 30), no33: drop(TABLE_OK, 33), double31: twice(TABLE_OK, 31),
  bad30: swapV(TABLE_OK, 30, "CONFIRMED", "MAYBE"),
  bad33: swapV(TABLE_OK, 33, "EVIDENCED", "CONFIRMED"),
  bad31: swapV(TABLE_OK, 31, "REFUTED", "UNDECIDED"),
  refuted30: swapV(TABLE_OK, 30, "CONFIRMED", "REFUTED"),
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
    printf 'DIRECT=%s POOL=%s\n' "$DATABASE_URL_DIRECT" "$DATABASE_URL" >> "$d/guard.seen"
    # As scripts/assert-production-target.mjs:49 reads it: DATABASE_URL_DIRECT, else DATABASE_URL.
    seen="\${DATABASE_URL_DIRECT:-$DATABASE_URL}"
    [ -n "$seen" ] || { echo "REFUSING: neither DATABASE_URL_DIRECT nor DATABASE_URL is set." >&2; exit 2; }
    [ "$seen" = "$HARNESS_DBURL" ] || { echo "REFUSING: not the production session pooler." >&2; exit 2; }
    printf 'host: harness.invalid\\nport: 5432\\nref:  harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
  psql)
    [ "$1" = "$HARNESS_DBURL" ] || { echo "harness: psql got a URL that is not the harness's" >&2; exit 97; }
    case "$*" in
      *"-c set local ${GUC} = '$HARNESS_APPT' -c "*) ;;
      *) echo "harness: psql was not handed the appointment id" >&2; exit 97;;
    esac
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

function makeBase({ envFile } = {}) {
  const base = mkdtempSync(join(tmpdir(), "sweepdiag1105-harness-"));
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
  writeFileSync(join(base, "prod.env"), envFile ?? "DATABASE_URL=postgresql://postgres.harness:x@harness.invalid:6543/postgres\nDATABASE_URL_DIRECT=postgresql://postgres.harness:x@harness.invalid:5432/postgres\n");
  for (const [k, v] of Object.entries(FIXTURES)) writeFileSync(join(base, `fix.${k}`), v + "\n");
  return base;
}

/** The block as GREEN pastes it from its dispatch: the four value lines filled, paths pointed at the harness. */
function filled(base, { docsha, appt, prnum } = {}) {
  return block
    .replace("PRHEAD=PENDING", `PRHEAD=${PRHEAD}`)
    .replace("DOCSHA=PENDING", `DOCSHA=${docsha ?? sha256(doc)}`)
    .replace("PRNUM=PENDING", `PRNUM=${prnum ?? HARNESS_PRNUM}`)
    .replace("APPT_ID=PENDING", `APPT_ID=${appt ?? HARNESS_APPT}`)
    .replaceAll(APPLY_DIR, join(base, "apply"))
    .replaceAll(ENV_FILE, join(base, "prod.env"))
    .replaceAll(OUT_DIR, join(base, "handover"));
}

function runOnce(shell, base, text, env = {}) {
  rmSync(join(base, "calls"), { force: true });
  rmSync(join(base, "guard.seen"), { force: true });
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
      HARNESS_APPT,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_POOLURL: "postgresql://postgres.harness:x@harness.invalid:6543/postgres",
      HARNESS_TABLE: "ok",
      HARNESS_ZONE: "WET",
      HARNESS_NOW: "202611051030",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  let seen = "";
  try { seen = readFileSync(join(base, "guard.seen"), "utf8"); } catch { /* the guard never ran */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls, seen };
}

function assertNoIds(r, label) {
  for (const id of [HARNESS_APPT, OTHER_ID, PASS_ID]) assert.ok(!r.out.includes(id), `${label}: an id reached the terminal (${id})`);
  assert.doesNotMatch(r.out, /postgresql:\/\//, `${label}: a URL reached the terminal`);
}
function assertRead(r, findings, counts) {
  assert.equal(r.status, 0, r.out);
  assertNoIds(r, "read");
  assert.match(r.stdout, /^lisbon now: {2}\d{12} WES?T$/m);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
  assert.match(r.stdout, new RegExp(`^verdicts: ${counts}$`, "m"));
  assert.match(r.stdout, new RegExp(`^findings: ${findings}$`, "m"));
  const closing = r.stdout.split("\n").filter((l) => l.startsWith(CLOSING));
  assert.equal(closing.length, 1, "not exactly one closing line");
  assert.match(closing[0], new RegExp(`^${CLOSING}${counts}; findings ${findings}\\. The table is in .*sweep-diagnostic-20261105\\.out; GREEN does not open it\\. SOLO reads it$`));
  // Rows 2, 3 and 20 are echoed whole (counts and times only); no INFO row is.
  assert.match(r.stdout, /^ {2}2 \| 2\. heartbeats on 2026-11-03/m);
  assert.match(r.stdout, /^ {2}3 \| 3\. tenant 1, slots on 2026-11-03/m);
  assert.match(r.stdout, /^ 20 \| 20\. shadow heartbeats whose recorded count/m);
  assert.doesNotMatch(r.stdout, /\| INFO$|read only: on|audit row|F[1-4] a /m, "a row other than 2, 3 and 20 reached the terminal");
}
function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, new RegExp(CLOSING), `${label}: a closing line after a fault`);
  assertNoIds(r, label);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.doesNotMatch(r.out, /harness: unexpected/, `${label}: an unexpected call`);
}

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine, and the zsh arm must run wherever it is not the GitHub runner"));

const OK_FINDINGS = "F1 CONFIRMED F2 REFUTED F3 CONFIRMED F4 EVIDENCED";
const OK_COUNTS = "3 OK / 2 REVIEW / 0 VACUOUS / 0 FAIL";

for (const shell of shells) {
  test(`${shell}: the document's own copy STOPs at its PENDING lines before anything runs`, () => {
    const base = makeBase();
    try {
      const r = runOnce(shell, base, block.replaceAll(APPLY_DIR, join(base, "apply")));
      assertStop(r, /still reads PENDING or is not in its form, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|date|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
      for (const [k, v] of [["appt", "PENDING"], ["appt", HARNESS_APPT.toUpperCase()], ["appt", HARNESS_APPT.slice(0, -1)], ["appt", `${HARNESS_APPT}'; select 1; '`], ["prnum", "PENDING"], ["prnum", "0"], ["docsha", "PENDING"]]) {
        const p = runOnce(shell, base, filled(base, { [k]: v }));
        assertStop(p, /NOT READY/, `${k} ${v}`);
        assert.ok(!/^(git|node|psql|date):/m.test(p.calls), `a command ran before the PENDING check (${k} ${v}): ${p.calls}`);
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled block reads on the full profile, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const good = runOnce(shell, base, text);
      assertRead(good, OK_FINDINGS, OK_COUNTS);
      const out = readFileSync(join(base, "handover", OUT_NAME), "utf8");
      assert.ok(out.includes(OTHER_ID) && out.includes(PASS_ID), "the ids are not in the transcript");
      const calls = good.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 16, `too few calls were stubbed: ${calls.length}`);
      for (const n of STUBBED) assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called, so its failure is not proven`);
      for (const id of calls) assertStop(runOnce(shell, base, text, { HARNESS_FAIL: id }), null, `${shell} fail ${id}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the table, the transaction, the zone, the pins, the worktree, the URLs and the PR head each STOP; every finding word reads`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      assertRead(runOnce(shell, base, text, { HARNESS_TABLE: "control" }), "F1 NO_SUBJECT F2 REFUTED F3 NO_SUBJECT F4 EVIDENCED", "5 OK / 0 REVIEW / 0 VACUOUS / 0 FAIL");
      assertRead(runOnce(shell, base, text, { HARNESS_TABLE: "consistent" }), "F1 CONSISTENT F2 NO_SUBJECT F3 CONFIRMED F4 EVIDENCED", OK_COUNTS);
      assertRead(runOnce(shell, base, text, { HARNESS_TABLE: "undecided" }), "F1 UNDECIDED F2 REFUTED F3 CONFIRMED F4 DOOR_ONLY", OK_COUNTS);
      assertRead(runOnce(shell, base, text, { HARNESS_TABLE: "noevidence" }), "F1 CONFIRMED F2 REFUTED F3 CONFIRMED F4 NO_EVIDENCE", OK_COUNTS);
      assertRead(runOnce(shell, base, text, { HARNESS_TABLE: "twotenants" }), OK_FINDINGS, "4 OK / 2 REVIEW / 0 VACUOUS / 0 FAIL");
      const shape = /a FAIL, a VACUOUS, a REVIEW outside rows 3 and 20, or a verdict row missing, doubled or extra/;
      for (const t of ["fail0", "vac2", "vac20", "vac40", "review2", "review40", "fail3", "no0", "no2", "no3", "no20", "no40", "double2", "double20", "double40", "stray"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), shape, t);
      }
      for (const t of ["no30", "no33", "double31", "bad30", "bad33", "bad31", "refuted30"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), /the findings \(rows 30 to 33\) are missing, doubled or not one of their words/, t);
      }
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const zone of ["EST", "EDT", "UTC", ""]) assertStop(runOnce(shell, base, text, { HARNESS_ZONE: zone }), /not WET or WEST/, `zone ${zone}`);
      assertRead(runOnce(shell, base, text, { HARNESS_ZONE: "WEST" }), OK_FINDINGS, OK_COUNTS);
      // Read-only, any hour: no clock bound, but the clock must read as a clock.
      assertRead(runOnce(shell, base, text, { HARNESS_NOW: "202611050300" }), OK_FINDINGS, OK_COUNTS);
      assertStop(runOnce(shell, base, text, { HARNESS_NOW: "soon" }), /Lisbon clock reads/, "a clock that is not a number");
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_FETCHED: "b".repeat(40) }), /the pull request's head is \[b{40}\]/, "moved head");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "c".repeat(40) }), /not on the head commit/, "checkout");
      assertStop(runOnce(shell, base, text, { HARNESS_PRNUM: "1" }), /head could not be fetched/, "another pull request");
      assertStop(runOnce(shell, base, text, { HARNESS_APPT: "00000000-0000-4000-8000-0000000000ab" }), /the read did not complete/, "psql handed another appointment id");
      assertStop(runOnce(shell, base, filled(base, { docsha: "d".repeat(64) })), /not the one the dispatch names/, "docsha");
      for (const [p, re] of [[READ_PATH, /read on disk is not the reviewed file/], [GUARD, /target guard on disk/], [MODULE, /module on disk/], [DOC_PATH, /not the one the dispatch names/]]) {
        const f = join(base, "apply", p);
        const keep = readFileSync(f);
        writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
        assertStop(runOnce(shell, base, text), re, `changed ${p}`);
        writeFileSync(f, keep);
      }
      // A URL already in the shell (a profile that exports one) never reaches the guard or psql:
      // both are unset before the env file. The proof is behavioural: the guard stub records what
      // it saw, and the same runs with the two unset lines removed show the stale URL reaching it.
      const stale = "postgresql://postgres.stale:x@stale.invalid:5432/postgres";
      const staleEnv = { DATABASE_URL: stale, DATABASE_URL_DIRECT: stale };
      const unsetLines = /^unset DATABASE_URL(_DIRECT)? \|\| [^\n]*\n/gm;
      const r0 = runOnce(shell, base, text, staleEnv);
      assertRead(r0, OK_FINDINGS, OK_COUNTS);
      assert.ok(r0.seen && !r0.seen.includes("stale"), `a stale URL reached the guard: ${r0.seen}`);
      for (const [envFile, label] of [
        ["DATABASE_URL=postgresql://postgres.harness:x@harness.invalid:6543/postgres\n", "an env file with only the transaction pooler"],
        ["SOMETHING_ELSE=1\n", "an env file with neither URL"],
      ]) {
        const b2 = makeBase({ envFile });
        try {
          // The guard falls back to DATABASE_URL (6543) or finds neither, and refuses: the stale
          // DATABASE_URL_DIRECT never reaches it, and psql never runs.
          const r = runOnce(shell, b2, filled(b2), staleEnv);
          assertStop(r, /the target guard refused or failed/, label);
          assert.ok(!r.seen.includes("stale"), `${label}: a stale URL reached the guard: ${r.seen}`);
          assert.ok(!/^psql:/m.test(r.calls), `${label}: psql ran: ${r.calls}`);
          // The kill: without the two unset lines the stale URL reaches the guard.
          const removed = filled(b2).replace(unsetLines, "");
          assert.notEqual(removed, filled(b2), "the unset lines were not found");
          const m = runOnce(shell, b2, removed, staleEnv);
          assert.ok(m.seen.includes("stale"), `${label}: with the unset lines removed the stale URL did not reach the guard, so the test proves nothing: ${m.seen}`);
        } finally { rmSync(b2, { recursive: true, force: true }); }
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
      assertRead(runOnce(shell, base, text), OK_FINDINGS, OK_COUNTS);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
}

// ---- The read on a local database: each seeded shape is reported exactly. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000f002";
const STAFF = "00000000-0000-4000-8000-00000000e001";
const ROLE = "00000000-0000-4000-8000-00000000e101";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const SUBJECT = appt(0x500);
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** A ULID whose time part is `ms`, its random part fixed by `seq`. */
const ulid = (ms, seq) => {
  let t = "";
  let v = BigInt(ms);
  for (let i = 0; i < 10; i++) { t = ALPHABET[Number(v % 32n)] + t; v /= 32n; }
  let r = "";
  let s = BigInt(seq) * 7919n + 12345n;
  for (let i = 0; i < 16; i++) { r += ALPHABET[Number(s % 32n)]; s = s / 32n + BigInt(i + 3) * 97n; }
  return t + r;
};
assert.equal(ulid(0, 0).slice(0, 10), "0000000000");
assert.equal(ulid(Date.parse("2026-11-03T10:00:00.500Z"), 1).length, 26);
// Every instant here is after 2026-10-25, so Lisbon (WET) is UTC: a Lisbon wall time is its instant.
const ms = (lisbon) => Date.parse(`${lisbon.replace(" ", "T")}Z`);
const ts = (t) => `timestamptz '${new Date(t).toISOString()}'`;
const isoOf = (lisbon) => new Date(ms(lisbon)).toISOString();
const MIN = 60_000;
const OFFSETS = [["48h", "email", 2880], ["24h", "sms", 1440]];

/** The heartbeats of one tenant: every slot 07:00 to 21:45 from Monday 11-02 07:00 to Wednesday 11-04 07:45. */
function beatsOf(tenant, extraMs, { ulids = true } = {}) {
  const out = [];
  let seq = tenant === TENANT ? 0 : 10_000;
  for (const day of ["2026-11-02", "2026-11-03", "2026-11-04"]) {
    for (let n = 0; n < 60; n++) {
      const slot = ms(`${day} 07:00:00`) + n * 15 * MIN;
      if (slot > ms("2026-11-04 07:45:00")) continue;
      seq += 1;
      const run = slot + 500;
      out.push({ tenant, slot, runAt: run, passAt: slot + 2000, createdAt: slot + 2000 + 150 + extraMs, passId: ulids ? ulid(run, seq) : `run-${seq}`, recordedPlus: 0 });
    }
  }
  return out;
}
const at = (beats, lisbonSlot) => {
  const b = beats.find((x) => x.slot === ms(lisbonSlot));
  assert.ok(b, `no heartbeat in slot ${lisbonSlot}`);
  return b;
};

/** The visits every case shares, with no subject: id, start (Lisbon), and whether the sleeping job claimed each mark. */
const VISITS = [
  { id: appt(0x101), start: "2026-11-04 09:05" },
  { id: appt(0x102), start: "2026-11-04 12:40" },
  { id: appt(0x103), start: "2026-11-05 10:05" },
  { id: appt(0x104), start: "2026-11-05 10:10" },
  { id: appt(0x105), start: "2026-11-05 10:17" },
  { id: appt(0x106), start: "2026-11-05 12:10" },
  { id: appt(0x107), start: "2026-11-04 16:25" },
  { id: appt(0x108), start: "2026-11-05 15:20" },
  { id: appt(0x109), start: "2026-11-04 18:00" },
];

/**
 * A case: its heartbeats (changed by `beats`), its visits (`extraVisits`, `deleted`), and SQL run
 * after the generic rows (`after`). Each mark due in the window gets a sleeping-job claim (mark +
 * 2 s) and a `sent` ledger row (mark + 3 s), unless `runSkips` names it, and a shadow row in the
 * transaction of the first heartbeat whose pass clock is at or after it (the sweep's own rule,
 * with no mark in the 21:45 look-ahead). The heartbeat counts are its rows', then `recordedPlus`.
 */
function buildSeed({ beats: change, extraVisits = [], deleted = [], subject = true, subjectRun = true, after = "", ulids = true } = {}) {
  const tBeats = beatsOf(TENANT, 0, { ulids });
  const oBeats = beatsOf(OTHER_TENANT, 50, { ulids });
  if (change) change(tBeats);
  // A visit of `extraVisits` with the id of a shared one replaces it.
  const visits = [...VISITS.map((v) => extraVisits.find((e) => e.id === v.id) ?? v), ...extraVisits.filter((e) => !VISITS.some((v) => v.id === e.id)), ...deleted];
  if (subject) visits.push({ id: SUBJECT, start: "2026-11-05 10:00", subject: true });
  const sqlParts = [];
  sqlParts.push(`
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic tenant', 'synthetic-1105'),
                                                  ('${OTHER_TENANT}', 'Synthetic other tenant', 'synthetic-1105-other');
insert into public.roles (id, tenant_id, slug, name) values ('${ROLE}', '${TENANT}', 'reception', 'Synthetic role');
insert into public.users (id, tenant_id, role_id, email, full_name) values ('${STAFF}', '${TENANT}', '${ROLE}', 'synthetic@example.invalid', 'Synthetic');`);
  for (const v of visits) {
    sqlParts.push(`insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${v.id}', '${TENANT}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${ts(ms(v.start))}, ${ts(ms(v.start) + 60 * MIN)}, 'scheduled', 'staff', ${ts(ms("2026-10-26 09:00:00"))}, ${ts(ms("2026-10-26 09:00:00"))});`);
  }
  const allBeats = [...tBeats, ...oBeats];
  for (const b of allBeats) {
    sqlParts.push(`insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  values ('${b.tenant}', '${b.passId}', 'shadow', ${ts(b.passAt)}, null, 0, 0, false, 0, ${ts(b.createdAt)});`);
  }
  const sorted = [...tBeats].sort((a, b) => a.passAt - b.passAt);
  for (const v of visits) {
    for (const [offset, channel, minutes] of OFFSETS) {
      const due = ms(v.start) - minutes * MIN;
      const by = v.takenAt && offset === "48h" ? at(tBeats, v.takenAt) : sorted.find((b) => b.passAt >= due);
      if (!by) continue;
      const skipRun = (v.subject && offset === "48h") || (v.subject && !subjectRun);
      if (!skipRun) {
        sqlParts.push(`insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${v.id}', 'claim', '${offset}', '${channel}', ${ts(ms(v.start))}, ${ts(due)}, 'run', false, 1, ${ts(due + 2000)});
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${v.id}', '${channel}', 'reminder.${offset}.${channel}', 'sent', ${ts(due + 3000)});`);
      }
      for (const holder of [...(v.noShadow ? [] : [by]), ...(v.alsoTakenBy ?? []).filter((x) => x.offset === offset).map((x) => at(tBeats, x.slot))]) {
        sqlParts.push(`insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  values ('${TENANT}', '${v.id}', 'shadow', '${offset}', '${channel}', ${ts(ms(v.start))}, ${ts(due)}, ${Math.floor((holder.passAt - due) / MIN)}, false, '${holder.passId}', ${ts(holder.createdAt)});`);
      }
    }
  }
  sqlParts.push(`update public.reminder_sweep_passes p
   set recorded_count = (select count(*) from public.reminder_claims c where c.kind = 'shadow' and c.tenant_id = p.tenant_id and c.created_at = p.created_at),
       due_count = (select count(*) from public.reminder_claims c where c.kind = 'shadow' and c.tenant_id = p.tenant_id and c.created_at = p.created_at);`);
  for (const b of tBeats.filter((x) => x.recordedPlus)) {
    sqlParts.push(`update public.reminder_sweep_passes set recorded_count = recorded_count + ${b.recordedPlus}, due_count = due_count + ${b.recordedPlus}
 where tenant_id = '${TENANT}' and created_at = ${ts(b.createdAt)};`);
  }
  // The subject's trail: booked by reception on 10-26 on 11-05, moved at 11-03 09:30 to
  // 10:00 (its 48h mark, 11-03 10:00, still ahead), confirmed by hand at 11-03 11:00 (a status-only
  // save). The sleeping job claimed and sent the OLD start's 48h mark (11-03 09:00), claimed the old
  // start's 24h reminder and released it at the move, and sent the move's confirmation. No claim of
  // the new start's 48h mark: the shadow row alone, a shadow-only mark.
  if (subject) {
    sqlParts.push(`
insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at) values
  ('${TENANT}', '${STAFF}', 'appointment.create', 'appointment', '${SUBJECT}', '{"startsAt":"${isoOf("2026-11-05 09:00:00")}","note":"MUST-NOT-PRINT"}', ${ts(ms("2026-10-26 09:00:00"))}),
  ('${TENANT}', '${STAFF}', 'appointment.reschedule', 'appointment', '${SUBJECT}', '{"fromStartsAt":"${isoOf("2026-11-05 09:00:00")}","startsAt":"${isoOf("2026-11-05 10:00:00")}"}', ${ts(ms("2026-11-03 09:30:00"))}),
  ('${TENANT}', null, 'appointment.update', 'appointment', '${SUBJECT}', '{"fromStatus":"scheduled","toStatus":"confirmed"}', ${ts(ms("2026-11-03 11:00:00"))});
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', '${SUBJECT}', 'shadow', '48h', 'email', ${ts(ms("2026-11-05 09:00:00"))}, ${ts(ms("2026-11-03 09:00:00"))}, 0, false, p.pass_id, p.created_at
    from public.reminder_sweep_passes p where p.tenant_id = '${TENANT}' and p.pass_at = ${ts(ms("2026-11-03 09:00:02"))};
update public.reminder_sweep_passes set recorded_count = recorded_count + 1, due_count = due_count + 1
 where tenant_id = '${TENANT}' and pass_at = ${ts(ms("2026-11-03 09:00:02"))};
${subjectRun ? `insert into public.reminder_claims (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at) values
  ('${appt(0x5c1)}', '${TENANT}', '${SUBJECT}', 'claim', '48h', 'email', ${ts(ms("2026-11-05 09:00:00"))}, ${ts(ms("2026-11-03 09:00:00"))}, 'run', false, 1, ${ts(ms("2026-11-03 09:00:02"))}),
  ('${appt(0x5c2)}', '${TENANT}', '${SUBJECT}', 'claim', '24h', 'sms', ${ts(ms("2026-11-05 09:00:00"))}, null, 'run', null, 1, ${ts(ms("2026-11-03 09:30:03"))});
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id, created_at)
  values ('${TENANT}', '${SUBJECT}', 'release', '24h', 'sms', '${appt(0x5c2)}', ${ts(ms("2026-11-03 09:30:04"))});
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at) values
  ('${TENANT}', '${SUBJECT}', 'email', 'reminder.48h.email', 'sent', ${ts(ms("2026-11-03 09:00:03"))}),
  ('${TENANT}', '${SUBJECT}', 'email', 'confirmation.email', 'sent', ${ts(ms("2026-11-03 09:30:05"))});` : ""}`);
  }
  // Hard-deleted visits: the rows go with them (ON DELETE CASCADE), the audit row stays.
  for (const v of deleted) {
    sqlParts.push(`delete from public.appointments where id = '${v.id}';
insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
  values ('${TENANT}', '${STAFF}', 'appointment.hard_delete', 'appointment', '${v.id}', '{"startsAt":"${v.badStart ? "2026-11-05 at noon" : isoOf(`${v.start}:00`)}","status":"scheduled"}', ${ts(ms(v.deletedAt))});`);
  }
  sqlParts.push(after);
  return sqlParts.join("\n");
}

/** The 10:00 run of 11-03 starts late, at 10:16:30, so its heartbeat sits in the 10:15 slot; the 10:15 run follows at 10:17:10. */
const LATE = (b) => {
  const l = at(b, "2026-11-03 10:00:00");
  l.passAt = ms("2026-11-03 10:16:30"); l.createdAt = l.passAt + 150;
  const n = at(b, "2026-11-03 10:15:00");
  n.passAt = ms("2026-11-03 10:17:10"); n.createdAt = n.passAt + 150;
};
/** SOLO's hypothesis as counts: the 10:15 pass counted the two marks the late pass wrote (10:05 and 10:10), with no row of its own for them. */
const RESELECT_BY_COUNT = (b) => { LATE(b); at(b, "2026-11-03 10:15:00").recordedPlus = 2; };
/** The same two marks re-selected as the schema would record it: a second shadow row each, by the 10:15 pass. */
const RESELECTED = [
  { ...VISITS[2], alsoTakenBy: [{ offset: "48h", slot: "2026-11-03 10:15:00" }] },
  { ...VISITS[3], alsoTakenBy: [{ offset: "48h", slot: "2026-11-03 10:15:00" }] },
];
/** Two visits hard-deleted after their 11-03 48h marks were taken: 11-05 12:05 (the 12:15 pass) and 11-05 16:20 (the 16:30 pass); their 24h marks fall after the window. */
const DELETED = [
  { id: appt(0x201), start: "2026-11-05 12:05", deletedAt: "2026-11-03 13:00:00" },
  { id: appt(0x202), start: "2026-11-05 16:20", deletedAt: "2026-11-03 17:00:00" },
];

const F = (f1, f2, f3, f4) => ({ 30: f1, 31: f2, 32: f3, 33: f4 });
const V = (v3, v20, v40 = "OK", v2 = "OK") => ({ 0: "OK", 2: v2, "3:1": v3, "3:2": "OK", 20: v20, 40: v40 });
const keyOf = (r) => (r[0] === "3" ? `3:${r[1].match(/tenant (\d+)/)[1]}` : r[0]);

const PGURL = process.env.SWEEP_DIAG_1105_TEST_PGURL;

const CASES = [
  {
    name: "CONTROL: nothing late, every count equal, the subject's mark shadow only",
    seed: buildSeed(),
    want: { ...V("OK", "OK"), ...F("NO_SUBJECT", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [
      [10, /slot 07:00 \| .*; end not recorded in the database, upper bound \(only when passes do not overlap\) the next heartbeat's transaction start 07:15:02\.150;/],
      [3, /^3\. tenant 1, .* \| heartbeats 60 \(shadow 60\), pass ids 60, slots 60; doubled none; missing none; outside none; counts that differ 0 \|/],
      [20, /counts that differ 0;/],
      [40, /status scheduled; starts 2026-11-05 10:00; origin staff; .*48h mark 2026-11-03 10:00, 24h mark 2026-11-04 10:00; audit rows 3, claim store rows 5, ledger rows 2/],
      [41, /appointment\.create \| written 2026-10-26 09:00:00\.000; by staff, role reception; clause booked; a scheduling save yes/],
      [41, /appointment\.reschedule \| written 2026-11-03 09:30:00\.000; by staff, role reception; clause moved; a scheduling save yes/],
      [41, /appointment\.update \| written 2026-11-03 11:00:00\.000; by no user; clause none \(re-arms nothing\); a scheduling save yes/],
      [42, /shadow, 48h email \| written 2026-11-03 10:00:02\.150; start 2026-11-05 10:00; mark 2026-11-03 10:00; .*its heartbeat \(by transaction\) 2026-11-03 10:00, pass id matches yes/],
      [42, /claim by run, 24h sms \| .*early none; attempt 1; released yes/],
      [42, /release, 24h sms \| written 2026-11-03 09:30:04\.000; .*releases the claim written 2026-11-03 09:30:03\.000/],
      [43, /confirmation\.email \| written 2026-11-03 09:30:05\.000; channel email; outcome sent/],
      [33, /door audit rows \(RE_ARMING_SAVES\) 2, first 2026-10-26 09:00:00, last 2026-11-03 09:30:00; scheduling saves 3; confirmations in the ledger 1; sleeping-job claims, any start 2, of its start now 0, of the marks its shadow rows hold 1/],
      [25, /reminder_claims_claim_attempt_key, reminder_claims_pkey, reminder_claims_release_claim_key, reminder_claims_release_target_key/],
    ],
    every10: /\| flags: none \| INFO$/,
    count10: 120,
  },
  {
    name: "SOLO's hypothesis: the 10:00 pass late into 10:15 (10:00 missing), the 10:15 pass counting the late pass's two marks with no row of its own",
    seed: buildSeed({ beats: RESELECT_BY_COUNT }),
    want: { ...V("REVIEW", "REVIEW"), ...F("CONFIRMED", "REFUTED", "REFUTED", "EVIDENCED") },
    info: [
      [3, /^3\. tenant 1, .* \| heartbeats 60 \(shadow 60\), pass ids 60, slots 59; doubled 10:15; missing 10:00; outside none; counts that differ 1 \|/],
      [10, /slot 10:15 \| pass_at 10:16:30\.000 \(90\.0 s into its slot\); .*run time \(pass id as a ULID, NOT VERIFIED as the cron tick\) 10:00:00\.500 \(slot 10:00\).*due 3, recorded 3, shadow rows of its transaction 3, .* \| flags: slot doubled \(1 of 2\), late: run time in slot 10:00 \| INFO$/],
      [10, /slot 10:15 \| pass_at 10:17:10\.000 .*run time \(pass id as a ULID, NOT VERIFIED as the cron tick\) 10:15:00\.500 \(slot 10:15\).*due 3, recorded 3, shadow rows of its transaction 1, .* \| flags: slot doubled \(2 of 2\), count differs \| INFO$/],
      [20, /counts that differ 1; rows short in all 2, rows over in all 0; of them on 2026-11-03 1; at 2026-11-03 10:15 tenant 1 short 2/],
      [21, /count differs: 2026-11-03 10:15, tenant 1 \| mode shadow; recorded 3, .*shadow rows of its transaction 1, naming its pass id 1; short by 2; .*hard-deleted visits given to this pass 0, marks a neighbouring heartbeat's row holds 3/],
      [23, new RegExp(`visit 1, 48h email, start 2026-11-05 10:05, mark 2026-11-03 10:05; held by the previous heartbeat \\(slot 2026-11-03 10:15\\); rows of this mark from 11-02 1`)],
      [23, new RegExp(`visit 2, 48h email, start 2026-11-05 10:10, mark 2026-11-03 10:10; held by the previous heartbeat`)],
      [23, /the appointment passed in, 48h email, start 2026-11-05 10:00, mark 2026-11-03 10:00; held by the previous heartbeat/],
      [30, /heartbeats in a doubled slot or after 21:45 2, of them with the slot before missing 2; late by their run time 1, of them from a missing slot 1/],
      [42, /shadow, 48h email \| written 2026-11-03 10:16:30\.150; start 2026-11-05 10:00; .*its heartbeat \(by transaction\) 2026-11-03 10:15, pass id matches yes/],
    ],
    count10: 60 * 2,
  },
  {
    name: "a mark re-selected as the schema records it: the late pass and the 10:15 pass each wrote a row for the 10:05 and 10:10 marks",
    seed: buildSeed({ beats: LATE, extraVisits: RESELECTED }),
    want: { ...V("REVIEW", "OK"), ...F("CONFIRMED", "CONFIRMED", "NO_SUBJECT", "EVIDENCED") },
    info: [
      [24, new RegExp(`visit 1, 48h email, start 2026-11-05 10:05; its heartbeats \\(slots\\) 2026-11-03 10:15, 2026-11-03 10:15`)],
      [24, new RegExp(`visit 2, 48h email, start 2026-11-05 10:10;`)],
      [31, /marks with more than one shadow row 2, of them with a row written on 2026-11-03 2/],
    ],
  },
  {
    name: "rows that went with two hard-deleted visits: the 12:15 and 16:30 passes each short by one, nothing late",
    seed: buildSeed({ deleted: DELETED }),
    want: { ...V("OK", "REVIEW"), ...F("NO_SUBJECT", "REFUTED", "CONFIRMED", "EVIDENCED") },
    info: [
      [20, /counts that differ 2; rows short in all 2, rows over in all 0; of them on 2026-11-03 2; at 2026-11-03 12:15 tenant 1 short 1, 2026-11-03 16:30 tenant 1 short 1/],
      [22, new RegExp(`visit 1 \\(hard-deleted\\), 48h email, start 2026-11-05 12:05, mark 2026-11-03 12:05, deleted 2026-11-03 13:00:00; fits 1 heartbeat\\(s\\) whose count differs, given to the earliest; another heartbeat's row holds it: no \\(a visit's rows go with it\\)`)],
      [22, new RegExp(`visit 2 \\(hard-deleted\\), 48h email, start 2026-11-05 16:20, mark 2026-11-03 16:20, deleted 2026-11-03 17:00:00`)],
      [32, /shadow heartbeats whose count differs 2, of them over \(more rows than recorded\) 0; with a hard-deleted candidate 2, short by exactly their candidates 2; candidates in all 2, fitting two or more heartbeats 0; hard-deleted visits from 11-02 2, of them with a start this read cannot place 0, marks of them due before 11-02 with the visit ahead then 0/],
    ],
  },
  {
    name: "the production picture: the 10:00 pass late into 10:15 AND two hard-deleted visits",
    seed: buildSeed({ beats: LATE, deleted: DELETED }),
    want: { ...V("REVIEW", "REVIEW"), ...F("CONFIRMED", "REFUTED", "CONFIRMED", "EVIDENCED") },
    info: [[3, /slots 59; doubled 10:15; missing 10:00; outside none; counts that differ 2 \|/]],
  },
  {
    name: "a heartbeat short by 2 with one hard-deleted candidate, and a visit deleted before its pass: UNDECIDED",
    seed: buildSeed({
      deleted: [DELETED[0], { id: appt(0x203), start: "2026-11-05 12:07", deletedAt: "2026-11-03 12:14:00", noShadow: true }],
      after: `update public.reminder_sweep_passes set recorded_count = recorded_count + 1, due_count = due_count + 1
 where tenant_id = '${TENANT}' and pass_at = ${ts(ms("2026-11-03 12:15:02"))};`,
    }),
    want: { ...V("OK", "REVIEW"), ...F("NO_SUBJECT", "REFUTED", "UNDECIDED", "EVIDENCED") },
    info: [[21, /short by 2; .*hard-deleted visits given to this pass 1,/]],
  },
  {
    name: "the 21:45 pass of 11-03 late past 22:00: 21:45 missing, a slot outside",
    seed: buildSeed({ beats: (b) => { const l = at(b, "2026-11-03 21:45:00"); l.passAt = ms("2026-11-03 22:00:30"); l.createdAt = l.passAt + 150; } }),
    want: { ...V("REVIEW", "OK"), ...F("CONFIRMED", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [[3, /slots 59; doubled none; missing 21:45; outside 22:00;/]],
  },
  {
    name: "a late pass whose run's slot still has a heartbeat (an extra run at 10:05): F1 cannot decide",
    seed: buildSeed({ beats: (b) => {
      LATE(b);
      const run = ms("2026-11-03 10:05:00");
      b.push({ tenant: TENANT, slot: ms("2026-11-03 10:00:00"), runAt: run, passAt: run + 2000, createdAt: run + 2150, passId: ulid(run, 99_999), recordedPlus: 0 });
    } }),
    want: { ...V("REVIEW", "OK"), ...F("UNDECIDED", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [[3, /heartbeats 61 \(shadow 61\), pass ids 61, slots 60; doubled 10:15; missing none;/]],
  },
  {
    name: "a pass of 11-03 failed (no heartbeat at 13:00): a missing slot, nothing late",
    seed: buildSeed({ after: `delete from public.reminder_sweep_passes where tenant_id = '${TENANT}' and pass_at = ${ts(ms("2026-11-03 13:00:02"))};` }),
    want: { ...V("REVIEW", "OK"), ...F("UNDECIDED", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [[3, /heartbeats 59 \(shadow 59\), pass ids 59, slots 59; doubled none; missing 13:00; outside none;/]],
  },
  {
    name: "the 10:00 pass late into 10:15, its run time stamped late too (10:16:29): the slots fit, the run time does not confirm, CONSISTENT",
    seed: buildSeed({ beats: (b) => { LATE(b); const l = at(b, "2026-11-03 10:00:00"); l.runAt = l.passAt - 1000; l.passId = ulid(l.runAt, 88_888); } }),
    want: { ...V("REVIEW", "OK"), ...F("CONSISTENT", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [[30, /of them with the slot before missing 2; late by their run time 0, of them from a missing slot 0/]],
  },
  {
    name: "the 10:00 pass late into 10:15 with pass ids that are not ULIDs: CONSISTENT",
    seed: buildSeed({ beats: LATE, ulids: false }),
    want: { ...V("REVIEW", "OK"), ...F("CONSISTENT", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
  },
  {
    name: "send heartbeats (11-02 and 11-03 12:07, recorded 2, no shadow row): not compared, no count differs",
    seed: buildSeed({ after: ["2026-11-02 12:07:00", "2026-11-03 12:07:00"].map((t, i) => `
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  values ('${TENANT}', '${ulid(ms(t) - 1000, 77_000 + i)}', 'send', ${ts(ms(t))}, null, 2, 2, false, 0, ${ts(ms(t) + 5000)});`).join("") }),
    want: { ...V("REVIEW", "OK"), ...F("UNDECIDED", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [
      [20, /heartbeats 250, shadow 248, send 2 \(not compared: a send heartbeat records claims, not shadow rows\); .*counts that differ 0;/],
      [10, /slot 12:00 \| pass_at 12:07:00\.000 .*mode send; .*due 2, recorded 2, shadow rows of its transaction 0, shadow rows naming its pass id 0 \(a send heartbeat: its recorded count is claims taken, not compared\), .* \| flags: slot doubled \(2 of 2\) \| INFO$/],
      [3, /doubled 12:00; missing none; outside none; counts that differ 0 \|/],
    ],
  },
  {
    name: "a catch-up: a hard-deleted visit's 11-03 12:05 mark taken by the 14:15 pass, deleted at 15:00: CONFIRMED",
    seed: buildSeed({ deleted: [{ id: appt(0x204), start: "2026-11-05 12:05", takenAt: "2026-11-03 14:15:00", deletedAt: "2026-11-03 15:00:00" }] }),
    want: { ...V("OK", "REVIEW"), ...F("NO_SUBJECT", "REFUTED", "CONFIRMED", "EVIDENCED") },
    info: [[22, new RegExp(`counted, no row \\(a hard-deleted visit\\): 2026-11-03 14:15, tenant 1 \\| visit 1 \\(hard-deleted\\), 48h email, start 2026-11-05 12:05, mark 2026-11-03 12:05`)]],
  },
  {
    name: "a hard-deleted visit whose start the read cannot place, its pass short by one: UNDECIDED, not REFUTED",
    seed: buildSeed({ deleted: [{ ...DELETED[0], badStart: true }] }),
    want: { ...V("OK", "REVIEW"), ...F("NO_SUBJECT", "REFUTED", "UNDECIDED", "EVIDENCED") },
    info: [[32, /hard-deleted visits from 11-02 1, of them with a start this read cannot place 1,/]],
  },
  {
    name: "the subject's approval SMS in the ledger, no claim: EVIDENCED",
    seed: buildSeed({ subjectRun: false, after: `insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${SUBJECT}', 'sms', 'booking_approved.sms', 'sent', ${ts(ms("2026-11-03 09:30:05"))});` }),
    want: { ...V("OK", "OK"), ...F("NO_SUBJECT", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
  },
  {
    name: "pass ids that are not ULIDs, nothing late: no slot anomaly, NO_SUBJECT",
    seed: buildSeed({ ulids: false }),
    want: { ...V("OK", "OK"), ...F("NO_SUBJECT", "REFUTED", "NO_SUBJECT", "EVIDENCED") },
    info: [[10, /run time \(pass id as a ULID, NOT VERIFIED as the cron tick\) not decoded \(not a ULID\)/]],
  },
  {
    name: "the subject's door rows only (no claim, no confirmation): DOOR_ONLY",
    seed: buildSeed({ subjectRun: false }),
    want: { ...V("OK", "OK"), ...F("NO_SUBJECT", "REFUTED", "NO_SUBJECT", "DOOR_ONLY") },
  },
  {
    name: "the subject hard-deleted: no row, its audit rows remain",
    seed: buildSeed({ after: `delete from public.appointments where id = '${SUBJECT}';
insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
  values ('${TENANT}', '${STAFF}', 'appointment.hard_delete', 'appointment', '${SUBJECT}', '{"startsAt":"${isoOf("2026-11-05 10:00:00")}"}', ${ts(ms("2026-11-04 07:50:00"))});` }),
    // Its rows went with it: the 10:00 pass (its new start's mark, placed by the delete's start) and
    // the 09:00 pass (its old start's mark, which the delete's start cannot place) are short by one.
    want: { ...V("OK", "REVIEW"), ...F("NO_SUBJECT", "REFUTED", "UNDECIDED", "DOOR_ONLY") },
    info: [
      [40, /no row; hard-delete audit rows 1; audit rows 4, claim store rows 0, ledger rows 0/],
      [22, /the appointment passed in, 48h email, start 2026-11-05 10:00, mark 2026-11-03 10:00, deleted 2026-11-04 07:50:00/],
    ],
  },
  {
    name: "an id that names nothing: row 40 VACUOUS",
    seed: buildSeed(),
    subject: appt(0x999),
    want: { ...V("OK", "OK", "VACUOUS"), ...F("NO_SUBJECT", "REFUTED", "NO_SUBJECT", "NO_EVIDENCE") },
  },
  {
    name: "no heartbeat at all: rows 2 and 20 VACUOUS, no row 3",
    seed: buildSeed({ after: "delete from public.reminder_claims where kind = 'shadow';\ndelete from public.reminder_sweep_passes;" }),
    want: { 0: "OK", 2: "VACUOUS", 20: "VACUOUS", 40: "OK", ...F("NO_SUBJECT", "NO_SUBJECT", "NO_SUBJECT", "EVIDENCED") },
  },
];

/** Each mutant is killed by its case: the mutated read does not meet that case's expectation. */
const MUTANTS = [
  ["the late flag reversed", "(h.run_slot is not null and h.run_slot < h.slot) as f_late", "(h.run_slot is not null and h.run_slot > h.slot) as f_late", "SOLO's hypothesis"],
  ["F1 confirms a late pass without a missing run slot", "and not exists (select 1 from hbf x where x.tenant_id = h.tenant_id and x.slot = h.run_slot)) as late_from_missing", "and true) as late_from_missing", "a late pass whose run's slot still has a heartbeat"],
  ["F1 without the outside arm", "where (h.f_doubled or h.f_outside) and h.f_late", "where h.f_doubled and h.f_late", "the 21:45 pass of 11-03 late past 22:00"],
  ["F1 confirms on the slots alone", "when f1.late_from_missing > 0 then 'CONFIRMED'", "when f1.late_from_missing > 0 or f1.slot_fit > 0 then 'CONFIRMED'", "the 10:00 pass late into 10:15, its run time stamped late too"],
  ["CONSISTENT without the missing slot before", "and not exists (select 1 from hbf x where x.tenant_id = h.tenant_id and x.slot = h.slot - interval '15 minutes')) as slot_fit", "and true) as slot_fit", "a late pass whose run's slot still has a heartbeat"],
  ["send heartbeats compared with shadow rows", "(h.mode = 'shadow' and h.rows_tx <> h.recorded_count) as f_differs", "(h.rows_tx <> h.recorded_count) as f_differs", "send heartbeats"],
  ["F3 needs a first-due mark (no catch-up)", "     and m.due_at >= k.since\n", "     and m.due_at > d.pass_at - interval '15 minutes'\n", "a catch-up"],
  ["F3 refutes with a start it cannot place", "when f3.with_candidates = 0 and f3.unplaced = 0 and f3.early_marks = 0 then 'REFUTED'", "when f3.with_candidates = 0 and f3.early_marks = 0 then 'REFUTED'", "a hard-deleted visit whose start the read cannot place"],
  ["F2 refutes with no shadow row", "              when (select count(*) from shadow) = 0 then 'NO_SUBJECT'\n", "              when false then 'NO_SUBJECT'\n", "no heartbeat at all"],
  ["F4 without the approval SMS", "in ('booking_approved.email', 'booking_approved.sms')) as confirmations", "in ('booking_approved.email')) as confirmations", "the subject's approval SMS"],
  ["F3 matches any shortfall", "where d.short > 0 and d.short = (select count(*) from cand_deleted c where c.hb_id = d.id)) as matched", "where d.short > 0) as matched", "a heartbeat short by 2 with one hard-deleted candidate"],
  ["a candidate deleted before the pass counts", "   where m.deleted_at > d.created_at\n", "   where true\n", "a heartbeat short by 2 with one hard-deleted candidate"],
  ["F2 counts single rows", "  having count(*) > 1\n", "  having count(*) > 0\n", "CONTROL"],
  ["F4 evidenced by a door alone", "case when e.confirmations > 0 or e.run_claims > 0 then 'EVIDENCED'", "case when e.confirmations > 0 or e.run_claims > 0 or e.doors > 0 then 'EVIDENCED'", "the subject's door rows only"],
  ["row 40 never VACUOUS", "                   and (select count(*) from subj_ledger) = 0 then 'VACUOUS'", "                   and false then 'VACUOUS'", "an id that names nothing"],
  ["row 3 blind to a missing slot", "when s.beats = 60 and s.in_slots = 60 and s.doubled is null and s.missing is null and s.outside is null", "when s.doubled is null and s.outside is null", "a pass of 11-03 failed"],
  ["neighbours: the next heartbeat only", "and (s.created_at = d.prev_created or s.created_at = d.next_created)", "and (s.created_at = d.next_created)", "SOLO's hypothesis", null, [23, /visit 1, 48h email, start 2026-11-05 10:05/]],
];
for (const [what, from, to, caseName, more, infoKill] of MUTANTS) {
  const base = CASES.find((c) => c.name.startsWith(caseName) && !c.mutate);
  assert.ok(base, `no case named ${caseName}`);
  CASES.push({
    name: `MUTANT: ${what}, on "${caseName}"`,
    seed: base.seed,
    subject: base.subject,
    mutate: (s) => {
      assert.equal(s.split(from).length, 2, `the mutated text is not written exactly once: ${from}`);
      const m = s.replace(from, to);
      return more ? more(m) : m;
    },
    kills: infoKill ? undefined : base.name,
    killsInfo: infoKill,
  });
}


test("the read on a local database: each seeded shape is reported exactly, and every mutant dies", { skip: PGURL ? false : "SWEEP_DIAG_1105_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: SWEEP_DIAG_1105_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  const ok = (r) => { assert.equal(r.status, 0, `psql failed: ${r.stderr}`); return r.stdout; };
  const admin = (statement) => ok(psql(PGURL, ["-c", statement]));
  const BASE = "sweepdiag1105_test_base";
  const CASE_DB = "sweepdiag1105_test_case";
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "sweepdiag1105-db-"));
  const results = [];
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    // Loaded leniently (a role or extension the lane has may be missing here); the seed then runs strictly.
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout, maxBuffer: 64 * 1024 * 1024 });
    const runRead = (db, text, subject) => {
      const file = join(work, "read.sql");
      writeFileSync(file, text);
      const set = subject === null ? [] : ["-c", `set local ${GUC} = '${subject}'`];
      return psql(dbUrl(db), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", ...set, "-f", file, "-c", "rollback"]);
    };
    // Without the appointment id the read stops with an error and prints no table.
    {
      const r = runRead(BASE, sql, null);
      assert.notEqual(r.status, 0, "the read ran without the appointment id");
      assert.match(r.stderr, /unrecognized configuration parameter "osteojp\.diag_appointment_id"/);
      assert.doesNotMatch(r.stdout, /\u001f(OK|FAIL|VACUOUS|REVIEW)$/m, "a verdict printed without the appointment id");
      results.push("the appointment id unset: the read stops with an error, no table");
    }
    // On the empty schema every column and join resolves.
    {
      const out = ok(runRead(BASE, sql, SUBJECT));
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f")).filter((r) => r.length === 5);
      const v = Object.fromEntries(rows.filter((r) => r[4] !== "INFO").map((r) => [keyOf(r), r[4]]));
      assert.deepEqual(v, { 0: "OK", 2: "VACUOUS", 20: "VACUOUS", 40: "VACUOUS", ...F("NO_SUBJECT", "NO_SUBJECT", "NO_SUBJECT", "NO_EVIDENCE") }, out);
      results.push(`the empty schema: ${Object.entries(v).map(([k, x]) => `${k}=${x}`).join(", ")}`);
    }
    for (const c of CASES) {
      admin(`drop database if exists ${CASE_DB}`);
      admin(`create database ${CASE_DB} template ${BASE}`);
      ok(psql(dbUrl(CASE_DB), [], c.seed));
      let text = sql;
      if (c.mutate) {
        const mutated = c.mutate(text);
        assert.notEqual(mutated, text, `${c.name}: the mutant changed nothing`);
        text = mutated;
      }
      const out = ok(runRead(CASE_DB, text, c.subject ?? SUBJECT));
      assert.ok(!out.includes(c.subject ?? SUBJECT), `${c.name}: the subject's id was printed`);
      assert.ok(!out.includes("MUST-NOT-PRINT") && !out.includes("synthetic@example.invalid") && !out.includes("Synthetic"), `${c.name}: metadata or a person's field was printed`);
      for (const t of [TENANT, OTHER_TENANT, STAFF, ROLE]) assert.ok(!out.includes(t), `${c.name}: a tenant, user or role id was printed`);
      assert.doesNotMatch(out, /00000000-0000-4000-[89]000-[0-9a-f]{12}/, `${c.name}: an appointment or claim id was printed`);
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f")).filter((r) => r.length === 5);
      assert.equal(rows.length, out.split("\n").filter(Boolean).length, `${c.name}: a printed value holds the field separator or a newline`);
      const verdictRows = rows.filter((r) => r[4] !== "INFO");
      const verdicts = Object.fromEntries(verdictRows.map((r) => [keyOf(r), r[4]]));
      assert.equal(verdictRows.length, Object.keys(verdicts).length, `${c.name}: a verdict key printed twice\n${out}`);
      results.push(`${c.name}: ${verdictRows.map((r) => `${keyOf(r)}=${r[4]}`).join(", ")}`);
      // The report also carries the rows that name what was found (synthetic ids only), never a mutant's.
      if (!c.mutate) {
        for (const r of rows) {
          if (["3", "20", "21", "22", "23", "24", "30", "31", "32", "33", "40"].includes(r[0]) || (r[0] === "10" && !/flags: none$/.test(r[3]))) results.push(`    ${r.join(" | ")}`);
        }
      }
      if (c.want) assert.deepEqual(verdicts, c.want, `${c.name}: verdicts\n${out}`);
      if (c.kills) {
        const unmutated = CASES.find((u) => u.name === c.kills);
        assert.notDeepStrictEqual(verdicts, unmutated.want, `${c.name}: the mutant SURVIVES: it meets the unmutated case's expectation`);
      }
      if (c.killsInfo) {
        const [n, rx] = c.killsInfo;
        assert.ok(!rows.some((r) => Number(r[0]) === n && rx.test(r.slice(1).join(" | "))), `${c.name}: the mutant SURVIVES: row ${n} still reads ${rx}`);
      }
      for (const [n, rx] of c.info ?? []) {
        assert.ok(rows.some((r) => Number(r[0]) === n && rx.test(r.slice(1).join(" | "))), `${c.name}: no row ${n} matching ${rx}\n${out}`);
      }
      if (c.count10 !== undefined) assert.equal(rows.filter((r) => r[0] === "10").length, c.count10, `${c.name}: not ${c.count10} heartbeat rows`);
      if (c.every10) for (const r of rows.filter((x) => x[0] === "10")) assert.match(r.slice(1).join(" | "), c.every10, `${c.name}: a heartbeat flagged`);
      admin(`drop database ${CASE_DB}`);
    }
  } finally {
    if (process.env.SWEEP_DIAG_1105_TEST_REPORT) writeFileSync(process.env.SWEEP_DIAG_1105_TEST_REPORT, results.join("\n") + "\n");
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${CASE_DB}`], { encoding: "utf8" });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});

// R22 READ (2026-10-30): the read-only per-mark detail of the reminders the sleeping job claimed and
// the sweep's shadow never took (R20's run-only UNEXPLAINED rows). Its document and its one block
// agree with each other, the read writes nothing, every halt in the block is explicit (proven by
// fault injection), and, on a local database, each predicate of the sweep's selection is printed as
// the one that was false when it is the one seeded false.
//
// WHAT THIS PROVES, with no database:
//   * the read's copy of R20 (from `clock as (` to the end of `pc`) is byte-identical to R20's file;
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing, controls no transaction, reads the clock once, and names no column
//     that holds a person; it prints no tenant id and no metadata text;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; one psql call,
//     `begin read only` ... `rollback`, writing to the handover file only with `> ${OUT} 2>&1`; it
//     fetches `refs/pull/<N>/head` and checks the fetched head and the checkout by full sha;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`), every external command a stub, each call made to
//     fail in turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool chain
//     stopped. Under bash always; under zsh wherever zsh is installed (not on the GitHub runner).
//
// WITH A LOCAL DATABASE (R22_READ_TEST_PGURL names one on 127.0.0.1 or localhost whose `public`
// schema is the repository's): the read runs on a seeded throwaway per case, as the block runs it,
// with its one clock line set to a fixed instant. Any other host is refused. Without the variable
// those cases are skipped.
//
// Run: node --test scripts/read-sweep-unexplained-20261030.test.mjs

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

const DOC_PATH = "docs/read-sweep-unexplained-20261030.md";
const SIDECAR = "docs/read-sweep-unexplained-20261030.sha256";
const READ_PATH = "scripts/db/read-sweep-unexplained-20261030.sql";
const R20_PATH = "scripts/db/read-shadow-compare-20261029.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const PRHEAD = "a".repeat(40);
const CLOCK_LINE = "  select now() as t1";

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

test("the read's copy of R20 is byte-identical to R20's lines 145 to 444, and the document says where it sits", () => {
  const r20 = read(R20_PATH).split("\n");
  assert.equal(r20[144], "clock as (", "R20's line 145 moved");
  assert.equal(r20[443], "),", "R20's line 444 moved");
  assert.match(r20[444], /^agree as \($/, "R20's pc no longer ends at line 444");
  const span = r20.slice(144, 444).join("\n");
  const mine = sql.split("\n");
  const start = mine.indexOf("clock as (");
  assert.equal(mine[start - 1], "with");
  assert.equal(mine.slice(start, start + 300).join("\n"), span, "the copied span differs from R20's");
  assert.equal(sql.split(span).length, 2, "the span appears more than once");
  assert.ok(doc.includes(`Lines ${start + 1} to ${start + 300} of the read`), "the document names the wrong lines for the copy");
});

test("the sidecar pins the document", () => {
  assert.equal(read(SIDECAR).trim(), `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table and in the block", () => {
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(doc.slice(0, doc.indexOf("## THE BLOCK")).includes(s), `the pins table does not carry ${path}'s sha256`);
  }
  assert.doesNotMatch(doc, /PRNUM_VALUE|REHEARSAL_TABLE/, "a placeholder is left in the document");
});

test("the read writes nothing, controls no transaction, and reads the clock once", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"));
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.equal(sql.split("\n").filter((l) => l === CLOCK_LINE).length, 1);
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date)\b/i);
});

test("the read never names a column that holds a person, prints no tenant id and no metadata text", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|patient_2_id|practitioner_id|created_by|actor_user_id|provider_message_id|body|ip|room)\b/i);
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\|/, "the read prints a tenant id");
  // Every metadata field it reads is compared or reduced to a fixed word; none is concatenated raw.
  for (const m of code.matchAll(/metadata->>''/g)) assert.ok(m, "unreachable");
  assert.doesNotMatch(sql, /\|\|\s*l\.metadata|metadata->>'[a-zA-Z]+'\s*\|\|/, "metadata text is printed");
  assert.match(sql, /then l\.metadata->>'toStatus'\n/, "toStatus is printed only from the enum list");
});

test("the document's verdict table and the read agree on the 5 verdicts", () => {
  for (const n of [0, 1, 2, 3, 4]) assert.ok(sql.includes(`'${n}. `), `the read has no verdict ${n}`);
  for (const n of ["| 0 |", "| 1 |", "| 2 |", "| 3 |", "| 4 |"]) assert.ok(doc.includes(n), `the verdict table has no row ${n}`);
  assert.match(doc, /5 OK \/ 0 VACUOUS \/ 0 FAIL/);
});

test("the block's shape: pipefail on line 2, no set -e, no # line, one read-only psql, the PR head by full sha", () => {
  const lines = block.split("\n");
  assert.equal(lines[0], "(");
  assert.equal(lines[1], "set -o pipefail");
  assert.equal(lines.at(-1), ")");
  assert.doesNotMatch(block, /set -e|errexit/);
  assert.ok(!lines.some((l) => l.trimStart().startsWith("#")));
  assert.ok(!lines.some((l) => l.endsWith("\\")));
  const psql = lines.filter((l) => /^psql /.test(l));
  assert.equal(psql.length, 1);
  assert.ok(!lines.some((l) => /(^|[;|&] *)psql /.test(l) && !/^psql /.test(l)));
  assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '120s'"/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback" > \$\{OUT\} 2>&1 \|\| \{/);
  assert.doesNotMatch(block, /\btee\b/);
  assert.doesNotMatch(block, /\b(cat|head|tail|less|more)\b[^\n]*\$\{OUT\}/, "the block prints the transcript");
  assert.equal((block.match(/=PENDING$/gm) || []).length, 2);
  assert.ok(lines[2] === "PRHEAD=PENDING" && lines[3] === "DOCSHA=PENDING");
  assert.match(lines[4], /^PRNUM=[1-9][0-9]*$/);
  assert.ok(lines.includes(`OUT=${OUT_DIR}/r22-unexplained-read-20261030.out`));
  assert.ok(lines.includes('git fetch origin "refs/pull/${PRNUM}/head" || { echo "STOP: the pull request\'s head could not be fetched. Nothing was read"; exit 1; }'));
  assert.ok(lines.some((l) => l.startsWith('[ "${FH}" = "${PRHEAD}" ] ||')), "the fetched head is not checked by full sha");
  assert.ok(lines.some((l) => l.startsWith('[ "${HD}" = "${PRHEAD}" ] ||')), "the checkout is not checked by full sha");
  assert.doesNotMatch(block, /origin\/main|merge-base/, "the block reads main");
  assert.ok(!/(^|[^A-Za-z])\/tmp\//.test(block));
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `a halt that is not one STOP and exit 1: ${l}`);
  }
});

// ---- The fault-injection harness (R20's, with the PR-head fetch). ----

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

const VERDICT_ROWS = Array.from({ length: 5 }, (_, n) => `  ${n} | ${n}. a verdict | x | y | OK`);
const TABLE_OK = [
  "BEGIN", "SET",
  " r22_read_transaction ", "----------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...VERDICT_ROWS,
  " 10 | NOW: policies | appointments: appointments_rls ALL PERMISSIVE | NOW | INFO",
  ` 20 | U001 the mark | appointment ${MISMATCH_ID} | day 2026-10-26 | Lisbon times | INFO`,
  " 27 | U001 summary | false at EVERY pass in range: P7 scheduling | the cause | INFO",
  "(8 rows)", "", "ROLLBACK",
].join("\n");
const FIXTURES = {
  ok: TABLE_OK,
  vacuous: TABLE_OK.replace("  1 | 1. a verdict | x | y | OK", "  1 | 1. a verdict | x | y | VACUOUS"),
  fail: TABLE_OK.replace("  2 | 2. a verdict | x | y | OK", "  2 | 2. a verdict | x | y | FAIL"),
  short: TABLE_OK.replace(/^ {2}4 \|[^\n]*\n/m, ""),
  extra: TABLE_OK.replace("  4 | 4. a verdict | x | y | OK", "  4 | 4. a verdict | x | y | OK\n  5 | 5. a verdict | x | y | OK"),
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
  const base = mkdtempSync(join(tmpdir(), "r22read-harness-"));
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
      HARNESS_NOW: "202610302130",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertPass(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^R22-READ PASSED: 5 OK \/ 0 VACUOUS \/ 0 FAIL\. The whole table is in /m);
  assert.match(r.stdout, /^verdicts: 5 OK \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id reached the terminal");
  assert.doesNotMatch(r.out, /read only: on|U001/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
}

function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /R22-READ PASSED/, `${label}: a pass line after a fault`);
  assert.ok(!r.out.includes(MISMATCH_ID), `${label}: an appointment id reached the terminal`);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.doesNotMatch(r.out, /harness: unexpected/, `${label}: an unexpected call`);
}

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine"));

for (const shell of shells) {
  test(`${shell}: the document's own copy STOPs at its PENDING lines before anything runs`, () => {
    const base = makeBase();
    try {
      const r = runOnce(shell, base, block.replaceAll(APPLY_DIR, join(base, "apply")));
      assertStop(r, /still reads PENDING, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|date|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled block passes on 5 OK, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const clean = runOnce(shell, base, text);
      assertPass(clean);
      const out = readFileSync(join(base, "handover", "r22-unexplained-read-20261030.out"), "utf8");
      assert.ok(out.includes(MISMATCH_ID), "the detail is not in the transcript");
      const calls = clean.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 16, `too few calls were stubbed: ${calls.length}`);
      for (const n of STUBBED) assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called`);
      for (const id of calls) assertStop(runOnce(shell, base, text, { HARNESS_FAIL: id }), null, `${shell} fail ${id}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the profile, the transaction, the zone, the pins, the worktree and the PR head each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const profile = /a FAIL or a VACUOUS verdict, or a verdict is missing/;
      for (const t of ["vacuous", "fail", "short", "extra"]) assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), profile, t);
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
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

// ---- The read on a local database: each predicate printed as the false one when seeded false. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000f002";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const at = (s) => `timestamptz '${s} Europe/Lisbon'`;
const READ_CLOCK = "2026-10-30 19:00:00";

/**
 * The base, R20's shape carried to Friday: one synthetic tenant (and a second one with no visit of
 * its own); 14 synthetic visits (Monday 10-26 to Sunday 11-01 at 10:00 and 15:00 Lisbon), each with
 * an `appointment.create` audit row; a shadow heartbeat every 15 minutes from Sunday 15:30 to Friday
 * 18:45; for every mark due in the window a sleeping-job claim (mark + 2 s), a `sent` ledger row
 * (mark + 3 s) and a shadow row in the transaction of the first pass at or after the mark. Every
 * base mark is taken by both sides, so the base's unexplained set is empty. The three appointment
 * foreign keys to people and clinics are dropped in the throwaway: no synthetic person is made. One
 * synthetic clinic row (location) is made so the location name column is exercised.
 */
const SEED = `
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic tenant', 'synthetic-r22'),
                                                  ('${OTHER_TENANT}', 'Synthetic other tenant', 'synthetic-r22-other');
insert into public.locations (id, tenant_id, name) values ('00000000-0000-4000-8000-00000000c001', '${TENANT}', 'Synthetic clinic');
create table seed_appt as
  select ('00000000-0000-4000-8000-' || lpad(to_hex(row_number() over (order by z.ts)::int), 12, '0'))::uuid as id, z.ts as starts_at
    from (select (d::date + t) at time zone 'Europe/Lisbon' as ts
            from generate_series(date '2026-10-26', date '2026-11-01', interval '1 day') d,
                 (values (time '10:00'), (time '15:00')) v(t)) z;
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  select id, '${TENANT}', gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-00000000c001',
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
            from generate_series(date '2026-10-25', date '2026-10-30', interval '1 day') d,
                 generate_series(0, 59) n) z
   where z.p >= ${at("2026-10-25 15:30:00")} and z.p <= ${at("2026-10-30 18:50:00")};
create table seed_mark as
  select a.id as appointment_id, rm.offset_id, rm.channel, a.starts_at, a.starts_at - make_interval(mins => rm.minutes) as due_at
    from seed_appt a cross join (values ('48h', 'email', 2880), ('24h', 'sms', 1440)) rm(offset_id, channel, minutes)
   where a.starts_at - make_interval(mins => rm.minutes) >= ${at("2026-10-25 15:30:03")}
     and a.starts_at - make_interval(mins => rm.minutes) <= ${at("2026-10-30 18:45:00")};
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

/** A visit of the case's own. `saved` writes its `appointment.create` row (with startsAt) at `created`. */
const visit = (id, start, { tenant = TENANT, status = "scheduled", saved = true, created = "2026-10-01 09:00", updated = created, bookedAt = start } = {}) => `
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${id}', '${tenant}', gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-00000000c001', ${at(start)}, ${at(start)} + interval '1 hour',
          '${status}', 'staff', ${at(created)}, ${at(updated)});
${saved ? `insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${tenant}', 'appointment.create', 'appointment', '${id}', '{"startsAt":"${bookedAt.replace(" ", "T")}:00.000Z"}', ${at(created)});` : ""}`;
/** The sleeping job's claim at the mark and its `sent` row, under the base tenant. No shadow row. */
const runClaim = (id, offset, start) => {
  const mins = offset === "48h" ? 2880 : 1440;
  const channel = offset === "48h" ? "email" : "sms";
  return `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${id}', 'claim', '${offset}', '${channel}', ${at(start)}, ${at(start)} - interval '${mins} minutes', 'run', false, 1,
          ${at(start)} - interval '${mins} minutes' + interval '2 seconds');
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${id}', '${channel}', 'reminder.${offset}.${channel}', 'sent', ${at(start)} - interval '${mins} minutes' + interval '3 seconds');`;
};
const audit = (id, action, when, metadata = "{}", tenant = TENANT) => `
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${tenant}', '${action}', 'appointment', '${id}', '${metadata}', ${at(when)});`;
/** A run-only mark the sweep should have taken: every predicate holds. */
const lost = (id, start, offsets) => [visit(id, start), ...offsets.map((o) => runClaim(id, o, start))].join("\n");

const CASES = [
  {
    name: "clean: every mark taken by both, the unexplained set is empty",
    seed: "",
    want: { 0: "OK", 1: "VACUOUS", 2: "VACUOUS", 3: "VACUOUS", 4: "VACUOUS" },
    absent: [appt(3)],
  },
  {
    name: "R20's profile: 8 marks on 6 visits Monday to Wednesday, 2 on Thursday on two of them; every predicate holds (lost by the sweep)",
    seed: [
      lost(appt(0xa1), "2026-10-30 11:00", ["48h", "24h"]), // 48h Wed, 24h Thu
      lost(appt(0xa2), "2026-10-30 12:00", ["48h", "24h"]), // 48h Wed, 24h Thu
      lost(appt(0xa3), "2026-10-28 11:00", ["48h", "24h"]), // Mon, Tue
      lost(appt(0xa4), "2026-10-29 11:00", ["48h", "24h"]), // Tue, Wed
      lost(appt(0xa5), "2026-10-28 12:00", ["48h"]), // Mon
      lost(appt(0xa6), "2026-10-29 12:00", ["24h"]), // Wed
    ].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "OK", 3: "OK", 4: "OK" },
    info: [
      [27, new RegExp(`^U001 summary \\| .*false at EVERY pass in range: none \\| every predicate held at [1-9][0-9]* passes, first 2026-10-26 11:00:03`)],
      [20, new RegExp(`appointment ${appt(0xa3)} \\| day 2026-10-26 \\(full day\\) \\| mark 2026-10-26 11:00:00 48h email`)],
      [21, /status scheduled \| origin staff \| location 00000000-0000-4000-8000-00000000c001 Synthetic clinic \| start now 2026-10-28 11:00:00 \(the claimed start\) \| created 2026-10-01 09:00:00 \| created minus mark -36\d{3} min/],
      [23, /reminder\.48h\.email \| email \| outcome sent \| reason none/],
      [24, /audit 2026-10-01 09:00:00 appointment\.create \| the visit's tenant \| toStatus none \| fromStatus none \| startsAt this start \| via none \| scheduling save yes \(create or reschedule\)/],
      [26, /pass 2026-10-26 11:00:03 \| P1 tenant T \| P2 start T \| P3 status T \(scheduled\) \| P4 ahead T \| P5 due T \| P6 created T \| P7 scheduling T \(any tenant T\) \| P8 not taken T \| EVERY T/],
      [26, /pass 2026-10-26 10:45:03 \| .*P5 due F .*EVERY F/],
    ],
  },
  {
    name: "P1 tenant: the visit row belongs to another tenant than the claim",
    seed: [visit(appt(0xb1), "2026-10-28 13:00", { tenant: OTHER_TENANT }), runClaim(appt(0xb1), "24h", "2026-10-28 13:00")].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "FAIL" },
    info: [
      [21, /no visit row for this appointment under the claim's tenant/],
      [27, /false at EVERY pass in range: P1 tenant/],
    ],
  },
  {
    name: "P2 start: at every pass the visit had another start; moved to the claimed start after it",
    seed: [
      visit(appt(0xb2), "2026-10-28 13:00", { bookedAt: "2026-11-20 13:00" }),
      audit(appt(0xb2), "appointment.reschedule", "2026-10-28 14:30", `{"startsAt":"2026-10-28T13:00:00.000Z"}`),
      runClaim(appt(0xb2), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [
      [27, /false at EVERY pass in range: P2 start \|/],
      [24, /appointment\.reschedule \| the visit's tenant \| .*startsAt this start .*after the mark/],
    ],
  },
  {
    name: "P3 status: cancelled at every pass, set back to Agendada after the start",
    seed: [
      visit(appt(0xb3), "2026-10-28 13:00"),
      audit(appt(0xb3), "appointment.update", "2026-10-28 14:30", `{"fromStatus":"cancelled","toStatus":"scheduled"}`),
      runClaim(appt(0xb3), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [
      [27, /false at EVERY pass in range: P3 status \|/],
      [26, /P3 status F \(cancelled\)/],
    ],
  },
  {
    name: "P4 and P5 range: no pass of the sweep between the mark and the start",
    seed: [
      lost(appt(0xb4), "2026-10-28 13:00", ["24h"]),
      `delete from public.reminder_sweep_passes where pass_at > ${at("2026-10-27 13:00")} and pass_at < ${at("2026-10-28 13:00")};`,
    ].join("\n"),
    // Verdict 4 OK: the passes before the mark (inside its 75 minutes) are evaluated, with P5 false.
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [
      [27, /passes [1-9]\d*, of them with the mark in range \(P4 and P5\) 0 .*false at EVERY pass in range: no pass had the mark in range/],
    ],
  },
  {
    name: "P6 created: created after its mark; R20 labels it R3, so it is NOT in the set",
    seed: [
      visit(appt(0xb6), "2026-10-28 13:00", { created: "2026-10-27 13:30" }),
      runClaim(appt(0xb6), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    want: { 0: "OK", 1: "VACUOUS", 2: "VACUOUS", 3: "VACUOUS", 4: "VACUOUS" },
    absent: [appt(0xb6)],
  },
  {
    name: "P7 scheduling: no scheduling save until after the start",
    seed: [
      visit(appt(0xb7), "2026-10-28 13:00", { saved: false }),
      audit(appt(0xb7), "appointment.update", "2026-10-28 14:30", `{"fromStatus":"scheduled","toStatus":"confirmed"}`),
      runClaim(appt(0xb7), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [
      [27, /false at EVERY pass in range: P7 scheduling \|/],
      [26, /P7 scheduling F \(any tenant F\)/],
    ],
  },
  {
    name: "P7 scheduling, another tenant: the only scheduling save is under another tenant; R20 labels it R4 (its saves are tenant-matched), so it is NOT in the set",
    seed: [
      visit(appt(0xb8), "2026-10-28 13:00", { saved: false }),
      audit(appt(0xb8), "appointment.create", "2026-10-01 09:00", "{}", OTHER_TENANT),
      runClaim(appt(0xb8), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    want: { 0: "OK", 1: "VACUOUS", 2: "VACUOUS", 3: "VACUOUS", 4: "VACUOUS" },
    absent: [appt(0xb8)],
  },
  {
    name: "P8 not taken: a live claim of taker sweep of the same key, written before the mark",
    seed: [
      lost(appt(0xb9), "2026-10-28 13:00", ["24h"]),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xb9)}', 'claim', '24h', 'sms', ${at("2026-10-28 13:00")}, ${at("2026-10-27 13:00")}, 'sweep', false, 2, ${at("2026-10-27 12:00")});`,
    ].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [
      [27, /false at EVERY pass in range: P8 not taken \|/],
      [22, /claim taker sweep attempt 2 \| 24h sms .*\(this start\)/],
    ],
  },
  {
    name: "the ceiling: every predicate holds, every pass in range over the ceiling",
    seed: [
      lost(appt(0xba), "2026-10-28 13:00", ["24h"]),
      `update public.reminder_sweep_passes set over_ceiling = true, due_count = recorded_count + 1
        where pass_at >= ${at("2026-10-27 13:00")} and pass_at < ${at("2026-10-28 13:00")};`,
    ].join("\n"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [[27, /over the ceiling [1-9]\d* \| false at EVERY pass in range: none \| every predicate held at [1-9]\d* passes/]],
  },
  {
    name: "MUTANT: P7 without its as-of-the-pass bound (a save after the start counts)",
    seed: [
      visit(appt(0xbb), "2026-10-28 13:00", { saved: false }),
      audit(appt(0xbb), "appointment.update", "2026-10-28 14:30", `{"fromStatus":"scheduled","toStatus":"confirmed"}`),
      runClaim(appt(0xbb), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    mutate: (s) => s.replace("and e.same_tenant and e.scheduling\n                    and e.created_at <= h.created_at) as p7,", "and e.same_tenant and e.scheduling) as p7,"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [[27, /false at EVERY pass in range: none \| every predicate held at [1-9]\d* passes/]],
  },
  {
    name: "MUTANT: P3 reads the status now (no reconstruction)",
    seed: [
      visit(appt(0xbc), "2026-10-28 13:00"),
      audit(appt(0xbc), "appointment.update", "2026-10-28 14:30", `{"fromStatus":"cancelled","toStatus":"scheduled"}`),
      runClaim(appt(0xbc), "24h", "2026-10-28 13:00"),
    ].join("\n"),
    mutate: (s) => s.replace("and e.created_at > h.created_at\n                           order by e.created_at, e.id limit 1), a.status::text)", "and false\n                           order by e.created_at, e.id limit 1), a.status::text)"),
    want: { 0: "OK", 1: "OK", 2: "FAIL", 3: "FAIL", 4: "OK" },
    info: [[27, /false at EVERY pass in range: none \| every predicate held at [1-9]\d* passes/]],
  },
];

const PGURL = process.env.R22_READ_TEST_PGURL;

test("the read on a local database: each predicate is printed false when it is the one seeded false", { skip: PGURL ? false : "R22_READ_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: R22_READ_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => {
    const r = spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, `psql failed: ${r.stderr}`);
    return r.stdout;
  };
  const admin = (statement) => psql(PGURL, ["-c", statement]);
  const BASE = "r22read_test_base";
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "r22read-db-"));
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout, maxBuffer: 64 * 1024 * 1024 });
    psql(dbUrl(BASE), [], SEED);
    const results = [];
    for (const c of CASES) {
      const db = "r22read_test_case";
      admin(`drop database if exists ${db}`);
      admin(`create database ${db} template ${BASE}`);
      if (c.seed) psql(dbUrl(db), [], c.seed);
      let text = sql.replace(CLOCK_LINE, `  select timestamptz '${READ_CLOCK} Europe/Lisbon' as t1`);
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
      const verdicts = Object.fromEntries(rows.filter((r) => r.length === 5 && r[4] !== "INFO").map((r) => [Number(r[0]), r[4]]));
      assert.deepEqual(verdicts, c.want, `${c.name}: verdicts\n${out}`);
      for (const [n, re] of c.info ?? []) {
        assert.ok(rows.some((r) => Number(r[0]) === n && re.test(r.slice(1).join(" | "))), `${c.name}: no INFO row ${n} matching ${re}\n${out}`);
      }
      for (const id of c.absent ?? []) assert.ok(!out.includes(id), `${c.name}: ${id} is printed\n${out}`);
      const summaries = rows.filter((r) => Number(r[0]) === 27).map((r) => r[2]);
      results.push(`${c.name}: ${JSON.stringify(c.want)} ${summaries.join(" || ")}`);
      admin(`drop database ${db}`);
    }
    if (process.env.R22_READ_TEST_REPORT) writeFileSync(process.env.R22_READ_TEST_REPORT, results.join("\n") + "\n");
  } finally {
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});

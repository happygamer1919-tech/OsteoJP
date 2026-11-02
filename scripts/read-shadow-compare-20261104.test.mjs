// SHADOW-COMPARE (2026-11-04, strategy's R47): the reminder sweep's shadow against the sleeping job
// over Monday 2026-11-02 and Tuesday 2026-11-03, under #1678's code (R24, R33, R34). Its document
// and its one block agree with each other, the read writes nothing, every halt in the block is
// explicit (proven by fault injection), the read's copy of #1678's re-arming saves is held to the
// code it mirrors, and, on a local database, every verdict flips on its own seeded fault and every
// label predicate names exactly its shape.
//
// WHAT THIS PROVES, with no database:
//   * the read's copy of R20 (from `clock as (` to the end of `pc`) is R20's lines 145 to 444 on
//     main with exactly the two named substitutions and nothing else, compared exactly;
//   * the read's copy of R22 (from `off_min as (` to the end of `summ`) is byte for byte
//     scripts/db/read-sweep-unexplained-20261030.sql lines 413 to 586 on main, and its sha256 is the
//     one the 2026-10-31 read pinned;
//   * the code the read mirrors is #1678's at 1bd32c06, byte for byte: RE_ARMING_SAVES to the end of
//     reminder-population.ts, notSavedAfterMark and markOf in sweep.ts, and the held-back retry's
//     function and its 3-hour constant in sweep-send.ts. On a base without #1678 this FAILS, by
//     design: the read is for #1678's code and nothing else;
//   * the read's clause list is RE_ARMING_SAVES' clause list;
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing, controls no transaction, reads the clock once, names no column that
//     holds a person and prints no tenant id; appointment ids only in the mismatch list;
//   * the document's verdict table names the verdicts the read prints;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no continuation; one psql
//     call, `begin read only` ... `rollback`, the deploy time set inside it, writing to the
//     handover file only with `> ${OUT} 2>&1`; it fetches `refs/pull/<N>/head` and checks the
//     fetched head and the checkout by full sha;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' <
//     /dev/null && echo TOOL-CHAIN-CONTINUED`), every external command a stub, each call made to
//     fail in turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool
//     chain stopped. Under bash always; under zsh wherever zsh is installed (not on the GitHub
//     runner);
//   * the block prints PASSED only when every verdict is OK; REVIEW, CLEAN UNDER R32 (exit 0) when
//     the only non-OK verdicts are agreement verdicts reading REVIEW; REVIEW, LABELS OUTSIDE R32's
//     SET (exit 0) when verdict 16 reads REVIEW; and STOPs on anything else.
//
// WITH A LOCAL DATABASE (SHADOW_COMPARE_1104_TEST_PGURL names one on 127.0.0.1 or localhost whose
// `public` schema is the repository's): the read runs on a seeded throwaway per case, as the block
// runs it, with its one clock line set to a fixed instant and the deploy time set as the block sets
// it. Any other host is refused. Without the variable those cases are skipped.
//
// Run: node --test scripts/read-shadow-compare-20261104.test.mjs

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

const DOC_PATH = "docs/read-shadow-compare-20261104.md";
const SIDECAR = "docs/read-shadow-compare-20261104.sha256";
const READ_PATH = "scripts/db/read-shadow-compare-20261104.sql";
const R20_PATH = "scripts/db/read-shadow-compare-20261029.sql";
const R22_PATH = "scripts/db/read-sweep-unexplained-20261030.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const OUT_DIR = "/Users/ivan/osteojp-handover";
const OUT_NAME = "shadow-compare-20261104.out";
const PRHEAD = "a".repeat(40);
const CLOCK_LINE = "  select now() as t1";
const GUC = "osteojp.r47_deployed_at";
const R8_LABEL = "R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)";
const R9_LABEL = "R9 kept out by R24: a re-arming save after its mark at every pass that could otherwise take it";

/** R8's eighth condition (the 2026-10-31 read's): every in-range pass recorded a visit left out. */
const R8_EXCLUDED = "not exists (select 1 from pr where pr.uk = u.uk and pr.in_range and coalesce(pr.excluded_count, 0) = 0)";

/** R22's span: lines 413 to 586 on main (#1672), joined by "\n"; the sha256 the 2026-10-31 read pinned. */
const R22_FIRST = 413;
const R22_SPAN_LINES = 174;
const R22_SPAN_SHA256 = "c86ca78e7a86ffbe54173814c2bcaf9f7dce461337c8a5275689c3d3660a930d";

/** The only two substitutions the read makes in R20's span. */
const R20_SUBSTITUTIONS = [
  [
    "  select timestamptz '2026-10-25 15:15:19 Europe/Lisbon' as resync,\n         timestamptz '2026-10-26 07:00:00 Europe/Lisbon' as first_full_pass,\n         timestamptz '2026-10-29 07:15:00 Europe/Lisbon' as closes\n",
    `  select current_setting('${GUC}')::timestamptz as resync,\n         timestamptz '2026-11-02 07:00:00 Europe/Lisbon' as first_full_pass,\n         timestamptz '2026-11-04 07:15:00 Europe/Lisbon' as closes\n`,
  ],
  [
    "    from (values (date '2026-10-26', 0), (date '2026-10-27', 1), (date '2026-10-28', 2)) as g(d, n)\n",
    "    from (values (date '2026-11-02', 0), (date '2026-11-03', 1)) as g(d, n)\n",
  ],
];

/**
 * #1678's code at its head 1bd32c06, which the read mirrors: each a span of a file, from a start
 * marker (inclusive) to the end of the function (`\n}\n`) or of the file, and its sha256 there.
 */
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

test("the read's copy of R20 is R20's lines 145 to 444 with exactly the two named substitutions", () => {
  const r20 = read(R20_PATH).split("\n");
  assert.equal(r20[144], "clock as (", "R20's line 145 moved");
  assert.match(r20[444], /^agree as \($/, "R20's pc no longer ends at line 444");
  let span = r20.slice(144, 444).join("\n");
  for (const [from, to] of R20_SUBSTITUTIONS) {
    assert.equal(span.split(from).length, 2, `R20's span does not carry this text once: ${from}`);
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

test("the read's copy of R22 is byte for byte its lines 413 to 586 on main", () => {
  const r22 = read(R22_PATH).split("\n").slice(R22_FIRST - 1, R22_FIRST - 1 + R22_SPAN_LINES);
  assert.equal(r22[0], "off_min as (");
  assert.equal(sha256(r22.join("\n")), R22_SPAN_SHA256, "R22's span on main is not the span the 2026-10-31 read pinned");
  const mine = sql.split("\n");
  const start = mine.indexOf("off_min as (");
  assert.ok(start > 0, "the read has no off_min");
  const span = mine.slice(start, start + R22_SPAN_LINES);
  assert.deepEqual(span, r22, "the copied span differs from R22's");
  const r8At = mine.indexOf("r8 as (");
  assert.ok(mine.slice(start + R22_SPAN_LINES, r8At).every((l) => l.startsWith("--")), "something other than a comment sits between R22's span and r8");
  assert.ok(doc.includes(`lines ${start + 1} to ${start + R22_SPAN_LINES} of the read`), "the document names the wrong lines for R22's copy");
});

test("the code the read mirrors is #1678's at 1bd32c06 (FAILS on a base without #1678, by design)", () => {
  for (const m of MIRRORED) {
    const text = read(m.file);
    const at = text.indexOf(m.from);
    assert.ok(at >= 0, `${m.file} has no ${m.from}: #1678 (reminders/r24-s5-no-grace) is not on this base, and this read is for its code`);
    const span = m.toEnd ? text.slice(at) : text.slice(at, text.indexOf("\n}\n", at) + 3);
    assert.equal(sha256(span), m.sha, `${m.file} ${m.from} is not #1678's at 1bd32c06: the read's mirror must be re-derived and re-reviewed`);
  }
  assert.match(read("apps/web/lib/reminders/sweep-send.ts"), /^export const SWEEP_RETRY_AFTER_SAVE_LIMIT_MS = 3 \* 60 \* 60_000;$/m);
  assert.match(read("apps/web/lib/reminders/sweep.ts"), /\n {6}notSavedAfterMark\(tx, offset\),\n {6}notTakenBySweep\(/, "selectDueMarks does not apply R24");
  const pop = read("apps/web/lib/reminders/reminder-population.ts");
  const table = pop.slice(pop.indexOf("export const RE_ARMING_SAVES = ["), pop.indexOf("] as const;", pop.indexOf("export const RE_ARMING_SAVES = [")));
  assert.deepEqual([...table.matchAll(/clause: "([a-z_]+)"/g)].map((m) => m[1]), CLAUSES, "RE_ARMING_SAVES' clauses are not the read's");
});

test("the read's re-arming saves name every clause once, with the conditions of reArmingClause", () => {
  const rearm = sql.slice(sql.indexOf("\nrearm_rows as ("), sql.indexOf("\nprobe_eval as ("));
  for (const c of CLAUSES) assert.equal(rearm.split(`then '${c}'`).length, 2, `the clause ${c} is not named exactly once`);
  for (const piece of [
    "when l.action = 'appointment.create' then 'booked'",
    "when l.action = 'appointment.reschedule' then 'moved'",
    "when l.action = 'appointment.update' and l.metadata->>'via' = 'portal_request_confirm'",
    "when l.action = 'appointment.update' and l.metadata->>'fromStatus' = 'scheduled'\n                  and l.metadata->>'toStatus' = 'confirmed' and a.origin = 'patient_portal'",
    "when l.action = 'appointment.update' and l.metadata->>'fromStatus' = 'cancelled'\n                  and (l.metadata->>'toStatus' = 'confirmed'\n                       or (l.metadata->>'toStatus' = 'scheduled' and a.origin <> 'patient_portal'))",
    "when l.action = 'appointment.sms_reply_reviewed' and l.metadata->>'resolution' = 'confirmed'\n                  and l.metadata->>'applied' = 'true' and a.origin = 'patient_portal'",
    "when l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' = 'confirmed'\n                  and a.origin = 'patient_portal'",
    "join public.appointments a on a.id = l.entity_id and a.tenant_id = l.tenant_id",
  ]) assert.ok(rearm.includes(piece), `rearm_rows lost: ${piece}`);
  const ev = sql.slice(sql.indexOf("\nprobe_eval as ("), sql.indexOf("\nr9 as ("));
  for (const piece of [
    "and n.clause = 'moved' and n.created_at > p.mark and n.created_at <= p.upto\n                 order by n.created_at, n.id limit 1",
    "and b.clause in ('booked', 'moved') and b.created_at <= p.mark\n                 order by b.created_at desc, b.id desc limit 1",
    "and r.created_at > p.mark and r.created_at <= p.upto\n",
    "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)",
  ]) assert.ok(ev.includes(piece), `probe_eval lost: ${piece}`);
});

test("R8 is the 2026-10-31 read's, R9 and the labels sit after R20's, and no kept-start label exists", () => {
  for (const label of [R8_LABEL, R9_LABEL]) assert.equal(sql.split(`'${label}'`).length, 2, `the label is not written exactly once: ${label}`);
  for (const c of ["s.in_range > 0", "s.f7 = s.in_range", "s.f1 = 0", "s.f2 = 0 and s.u2 = 0", "s.f3 = 0 and s.u3 = 0", "s.f6 = 0", "s.f8 = 0", R8_EXCLUDED]) {
    assert.ok(sql.includes(c), `r8 lost its condition ${c}`);
  }
  assert.equal((sql.match(/case when p\.side = 'run_only' and p\.category = 'UNEXPLAINED'\n/g) || []).length, 1);
  assert.equal((sql.match(/when p\.side = 'run_only' and p\.category = 'UNEXPLAINED'\n/g) || []).length, 2);
  assert.doesNotMatch(code, /kept/i, "a kept-start label in the read");
  assert.ok(doc.includes(R8_LABEL) && doc.includes(R9_LABEL), "the document does not name R8 and R9 exactly");
  const after = sql.slice(sql.indexOf("\nagree as ("));
  assert.doesNotMatch(after.replace(/--[^\n]*/g, ""), /\bfrom pc\b|join pc\b/, "a verdict reads pc, not pcl");
  // R32's accepted set, as verdict 16 reads it.
  assert.equal((sql.match(/letter not in \('R2', 'R4', 'R8', 'S5'\)/g) || []).length, 2);
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
  assert.ok(fallback.includes(`set local ${GUC} = '`), "the owner's first line does not set the deploy time");
});

test("the read writes nothing, controls no transaction, and reads the clock once", () => {
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "verdict 0 must read the transaction's own setting");
  assert.equal((sql.match(/current_setting\('osteojp\.r47_deployed_at'\)/g) || []).length, 1, "the deploy time is read other than once");
  assert.equal((code.match(/\bnow\(\)/g) || []).length, 1, "the read must read now() exactly once");
  assert.equal(sql.split("\n").filter((l) => l === CLOCK_LINE).length, 1, "the one clock line is not where a rehearsal replaces it");
  assert.doesNotMatch(code, /\b(current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|current_date)\b/i, "a second clock");
});

test("the read never names a column that holds a person, prints no tenant id and no metadata text", () => {
  assert.doesNotMatch(code, /\b(full_name|first_name|last_name|phone|phone_e164|email|address|notes|nif|patient_id|patient_2_id|practitioner_id|created_by|actor_user_id|provider_message_id|body|ip|room|name)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /tenant_id::text|tenant_id\s*\|\|/, "the read prints a tenant id");
  assert.doesNotMatch(sql, /\|\|\s*l\.metadata|metadata->>'[a-zA-Z]+'\s*\|\||\|\|\s*[a-z]+\.(from_start|to_start|start_at_mark|start_text)/, "metadata text is printed");
  assert.match(sql, /appointment_id::text \|\| ' \| ' \|\| category as observed/, "appointment ids are printed only in the mismatch list");
  assert.equal((code.match(/appointment_id::text/g) || []).length, 1, "an appointment id is printed outside the mismatch list");
  assert.match(sql, /where rk <= 500\n/, "the mismatch list is not capped at 500 a side");
  // The ids `probe` carries (a claim's id, R22's key) are joined on, never printed.
  const out = sql.slice(sql.indexOf("\nselect n, \"check\", observed, expected, verdict from ("));
  assert.doesNotMatch(out, /\.id::text|\buk\b|\bk\b\s*\|\|/, "an id or key reaches the printed rows");
});

test("the document's verdict table and the read agree on the verdicts", () => {
  const nums = [...sql.matchAll(/^  select (\d+)(?: \+ [a-z.]+)?,\s*$/gm)].map((m) => Number(m[1])).filter((n) => n < 20);
  assert.deepEqual(nums, [1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 15, 16], "the read's verdict rows moved");
  assert.match(sql, /^ {2}select 0 as n,$/m);
  assert.match(sql, /select 11 \+ a\.rn,/);
  assert.doesNotMatch(sql, /^ {2}select 14,/m, "verdict 14's number is reused");
  for (const n of ["| 0 |", "| 1 |", "| 2 |", "| 3 |", "| 6 |", "| 7 |", "| 8 |", "| 9 |", "| 10 |", "| 11 |", "| 12 |", "| 13 |", "| 15 |", "| 16 |"]) {
    assert.ok(doc.includes(n), `the verdict table has no row ${n}`);
  }
});

test("the block's shape: pipefail on line 2, no set -e, no # line, one read-only psql, the deploy time inside it, the PR head by full sha", () => {
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
  assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '120s'" -c "set local osteojp\.r47_deployed_at = '\$\{DEPLOYED_AT\}'" -c "select 'read only: '/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback" > \$\{OUT\} 2>&1 \|\| \{/);
  assert.doesNotMatch(block, /\btee\b/, "the block uses tee");
  assert.doesNotMatch(block, /\b(cat|head|tail|less|more)\b[^\n]*\$\{OUT\}/, "the block prints the transcript");
  assert.equal((block.match(/=PENDING$/gm) || []).length, 4);
  assert.deepEqual(lines.slice(2, 6), ["PRHEAD=PENDING", "DOCSHA=PENDING", "PRNUM=PENDING", "DEPLOYED_AT=PENDING"]);
  assert.ok(lines.indexOf("echo \"${PRHEAD} ${DOCSHA} ${PRNUM} ${DEPLOYED_AT}\" | grep -qxE '[0-9a-f]{40} [0-9a-f]{64} [1-9][0-9]* 2026-11-0[12]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' || { echo \"STOP: the head commit, the document's sha256, the pull request number or the deploy time still reads PENDING or is not in its form, so it is NOT READY. Nothing was read\"; exit 1; }") === 13, "the PENDING check is not the first command");
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

// ---- The fault-injection harness (the 2026-10-31 read's, with the deploy time and R32's lines). ----

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
const DAYS2 = ["2026-11-02", "2026-11-03"];
const HARNESS_DEPLOYED = "2026-11-01T22:14:05Z";
const HARNESS_PRNUM = "4242";

const vrow = (n, text, v = "OK") => ` ${String(n).padStart(2)} | ${n}. ${text} | x | y | ${v}`;
function verdictRows(days) {
  return [
    vrow(0, "read only"), vrow(1, "the clock"), vrow(2, "the window"),
    ...days.map((d) => vrow(3, `heartbeats on ${d}`)),
    vrow(6, "sent nothing"), vrow(7, "ceiling"), vrow(8, "accounting"), vrow(9, "twice"), vrow(10, "nothing falls out"),
    ...days.map((d) => vrow(11, `agreement, marks due ${d}, 48h email`)),
    ...days.map((d) => vrow(12, `agreement, marks due ${d}, 24h sms`)),
    vrow(13, "no mark stays UNEXPLAINED"), vrow(15, "R24 held"), vrow(16, "every label in R32's set"),
  ];
}
const table = (days) => [
  "BEGIN", "SET", "SET", "SET",
  " shadow_compare_transaction ", "----------------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  ...verdictRows(days),
  " 20 | window: DEPLOYED_AT | 2026-11-01 22:14:05 | 2026-11-01 22:15:03 | 2026-11-04 08:00:00 | 2026-11-04 07:45:03 | 2026-11-02 to 2026-11-03 (2) | information | INFO",
  ...days.map((d) => ` 22 | passes on ${d} (R11) | 60, 60, 0, 1 to 1, 4 | information | INFO`),
  " 36 | R34, send mode only | 0, 0, 0, 0: 0 sweep-sent rows, as shadow sends nothing | information | INFO",
  " 40 | SHADOW_SUMMARY | full days 2026-11-02 to 2026-11-03: both=8 shadow_only=0 run_only=0 matched_share=100.0% | unexplained 0 | INFO",
  ` 51 | run_only 2026-11-02 10:00 48h email | ${MISMATCH_ID} | ${R8_LABEL} | information | INFO`,
  "(25 rows)", "", "ROLLBACK",
].join("\n");
const TABLE_OK = table(DAYS2);
const swap = (t, n, text, v) => t.replace(vrow(n, text), vrow(n, text, v));
const FIXTURES = {
  ok: TABLE_OK,
  clean: swap(TABLE_OK, 11, "agreement, marks due 2026-11-02, 48h email", "REVIEW"),
  labels: swap(swap(TABLE_OK, 12, "agreement, marks due 2026-11-03, 24h sms", "REVIEW"), 16, "every label in R32's set", "REVIEW"),
  labelsonly: swap(TABLE_OK, 16, "every label in R32's set", "REVIEW"),
  three: table([...DAYS2, "2026-11-04"]),
  one: table(DAYS2.slice(0, 1)),
  vacuous: swap(TABLE_OK, 11, "agreement, marks due 2026-11-03, 48h email", "VACUOUS"),
  vac15: swap(TABLE_OK, 15, "R24 held", "VACUOUS"),
  fail15: swap(TABLE_OK, 15, "R24 held", "FAIL"),
  review15: swap(TABLE_OK, 15, "R24 held", "REVIEW"),
  reviewhead: swap(TABLE_OK, 3, "heartbeats on 2026-11-03", "REVIEW"),
  review13: swap(TABLE_OK, 13, "no mark stays UNEXPLAINED", "REVIEW"),
  fail: swap(TABLE_OK, 13, "no mark stays UNEXPLAINED", "FAIL"),
  fail2: swap(TABLE_OK, 2, "the window", "FAIL"),
  fail16: swap(TABLE_OK, 16, "every label in R32's set", "FAIL"),
  short: TABLE_OK.replace(vrow(12, "agreement, marks due 2026-11-03, 24h sms") + "\n", ""),
  no15: TABLE_OK.replace(vrow(15, "R24 held") + "\n", ""),
  no16: TABLE_OK.replace(vrow(16, "every label in R32's set") + "\n", ""),
  extra: TABLE_OK.replace(vrow(6, "sent nothing"), vrow(14, "a stray verdict") + "\n" + vrow(6, "sent nothing")),
  double13: TABLE_OK.replace(vrow(13, "no mark stays UNEXPLAINED"), vrow(13, "no mark stays UNEXPLAINED") + "\n" + vrow(13, "no mark stays UNEXPLAINED")),
  daydrift: TABLE_OK.replace(vrow(3, "heartbeats on 2026-11-03"), vrow(3, "heartbeats on 2026-11-03") + "\n" + vrow(3, "heartbeats on 2026-11-04")),
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
    case "$*" in
      *"-c set local osteojp.r47_deployed_at = '$HARNESS_DEPLOYED' -c "*) ;;
      *) echo "harness: psql was not handed the deploy time" >&2; exit 97;;
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

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "shadowcompare1104-harness-"));
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

/** The block as GREEN pastes it from its dispatch: the four value lines filled, paths pointed at the harness. */
function filled(base, { docsha, deployed, prnum } = {}) {
  return block
    .replace("PRHEAD=PENDING", `PRHEAD=${PRHEAD}`)
    .replace("DOCSHA=PENDING", `DOCSHA=${docsha ?? sha256(doc)}`)
    .replace("PRNUM=PENDING", `PRNUM=${prnum ?? HARNESS_PRNUM}`)
    .replace("DEPLOYED_AT=PENDING", `DEPLOYED_AT=${deployed ?? HARNESS_DEPLOYED}`)
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
      HARNESS_DEPLOYED,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_TABLE: "ok",
      HARNESS_ZONE: "WET",
      HARNESS_NOW: "202611040800",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertGood(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^full days: 2$/m);
  assert.equal(r.stdout.split("\n").filter((l) => /^ 22 \| passes on 2026-11-0[23] \(R11\)/.test(l)).length, 2, "the R11 rows were not printed");
  assert.ok(!r.out.includes(MISMATCH_ID), "an appointment id from the mismatch list reached the terminal");
  assert.doesNotMatch(r.out, /SHADOW_SUMMARY|read only: on|R8 no scheduling/, "the table itself reached the terminal");
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
  assert.equal(r.stdout.split("\n").filter((l) => l.startsWith("SHADOW-COMPARE-1104 ")).length, 1, "not exactly one closing line");
}
function assertPass(r) {
  assertGood(r);
  assert.match(r.stdout, /^verdicts: 17 OK \/ 0 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.match(r.stdout, /^SHADOW-COMPARE-1104 PASSED: 17 OK \/ 0 VACUOUS \/ 0 FAIL over 2 full days\. The whole table is in /m);
}
function assertClean(r) {
  assertGood(r);
  assert.match(r.stdout, /^verdicts: 16 OK \/ 1 REVIEW \/ 0 VACUOUS \/ 0 FAIL$/m);
  assert.match(r.stdout, /^SHADOW-COMPARE-1104 REVIEW, CLEAN UNDER R32: .*This is NOT a pass by itself/m);
}
function assertLabels(r, reviews) {
  assertGood(r);
  assert.match(r.stdout, new RegExp(`^verdicts: ${17 - reviews} OK / ${reviews} REVIEW / 0 VACUOUS / 0 FAIL$`, "m"));
  assert.match(r.stdout, /^SHADOW-COMPARE-1104 REVIEW, LABELS OUTSIDE R32'S SET: .*strategy reads/m);
}

function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /SHADOW-COMPARE-1104 (PASSED|REVIEW)/, `${label}: a pass or review line after a fault`);
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
      assertStop(r, /still reads PENDING or is not in its form, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|date|shasum|rm|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
      for (const [k, v] of [["deployed", "PENDING"], ["deployed", "2026-11-02 06:00:00"], ["deployed", "2026-11-03T06:00:00Z"], ["deployed", "2026-11-02T06:00:00Z'; drop table x; '"], ["prnum", "PENDING"], ["prnum", "0"], ["docsha", "PENDING"]]) {
        const p = runOnce(shell, base, filled(base, { [k]: v }));
        assertStop(p, /NOT READY/, `${k} ${v}`);
        assert.ok(!/^(git|node|psql|date):/m.test(p.calls), `a command ran before the PENDING check (${k} ${v}): ${p.calls}`);
      }
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

  test(`${shell}: the profile, the transaction, the clock, the zone, the pins, the worktree and the PR head each STOP; R32's two REVIEW lines`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const profile = /a FAIL or a VACUOUS verdict, a REVIEW outside verdicts 11, 12 and 16, a full day count other than 2, or a verdict missing, doubled or extra/;
      for (const t of ["vacuous", "vac15", "fail15", "review15", "fail", "fail2", "fail16", "short", "no15", "no16", "extra", "double13", "daydrift", "three", "one", "reviewhead", "review13"]) {
        assertStop(runOnce(shell, base, text, { HARNESS_TABLE: t }), profile, t);
      }
      assertClean(runOnce(shell, base, text, { HARNESS_TABLE: "clean" }));
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labels" }), 2);
      assertLabels(runOnce(shell, base, text, { HARNESS_TABLE: "labelsonly" }), 1);
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nosummary" }), /no SHADOW_SUMMARY row/, "no summary");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "nor11" }), /no R11 rows/, "no R11 rows");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      for (const now of ["202611040714", "202611040700", "202611032359", "202611030900"]) {
        const r = runOnce(shell, base, text, { HARNESS_NOW: now });
        assertStop(r, /earlier than 2026-11-04 07:15 Lisbon/, `clock ${now}`);
        assert.ok(!/^(git|node|psql):/m.test(r.calls), `a command ran before the clock check: ${r.calls}`);
      }
      assertPass(runOnce(shell, base, text, { HARNESS_NOW: "202611040715" }));
      assertStop(runOnce(shell, base, text, { HARNESS_NOW: "soon" }), null, "a clock that is not a number");
      for (const zone of ["EST", "EDT", "UTC", ""]) assertStop(runOnce(shell, base, text, { HARNESS_ZONE: zone }), /not WET or WEST/, `zone ${zone}`);
      assertPass(runOnce(shell, base, text, { HARNESS_ZONE: "WEST" }));
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_FETCHED: "b".repeat(40) }), /the pull request's head is \[b{40}\]/, "moved head");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "c".repeat(40) }), /not on the head commit/, "checkout");
      assertStop(runOnce(shell, base, text, { HARNESS_PRNUM: "1" }), /head could not be fetched/, "another pull request");
      assertStop(runOnce(shell, base, text, { HARNESS_DEPLOYED: "2026-11-01T22:14:06Z" }), /the read did not complete/, "psql handed another deploy time");
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

// ---- The read on a local database: every verdict flips on its own seeded fault, every label names its shape. ----

const TENANT = "00000000-0000-4000-8000-00000000f001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000f002";
const appt = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const cid = (n) => `00000000-0000-4000-9000-${n.toString(16).padStart(12, "0")}`;
const at = (s) => `timestamptz '${s} Europe/Lisbon'`;
const READ_CLOCK = "2026-11-04 08:00:00";
const DEPLOYED = "2026-11-01T15:20:00Z";
const FULL_DAYS = ["2026-11-02", "2026-11-03"];
/** Every instant here is after 2026-10-25 (WET), so a Lisbon wall time with a Z is its ISO instant. */
const iso = (s) => `${s.replace(" ", "T")}:00.000Z`;
const dueOf = (start, offset) => new Date(Date.parse(`${start.replace(" ", "T")}:00Z`) - (offset === "48h" ? 2880 : 1440) * 60000).toISOString().slice(0, 16).replace("T", " ");
const channelOf = (offset) => (offset === "48h" ? "email" : "sms");

/**
 * The base, at the read's clock Wednesday 11-04 08:00 with DEPLOYED_AT Sunday 11-01 15:20 Lisbon:
 * two synthetic tenants (the second with no visit, heartbeating with nothing due); 10 synthetic
 * visits Monday 11-02 to Friday 11-06 at 10:00 and 15:00 Lisbon (appt(1) Monday 10:00 to appt(10)
 * Friday 15:00), each with an `appointment.create` row dated 10-01 carrying its start; a shadow
 * heartbeat every 15 minutes, 07:00 to 21:45, from Sunday 07:00 (before the deploy, so t0 is the
 * 15:30 pass) to Wednesday 07:45; for every mark due from Sunday 00:00 to Wednesday 07:45 a
 * sleeping-job claim (mark + 2 s), a `sent` ledger row (mark + 3 s) and a shadow row in the
 * transaction of the first pass at or after the mark; each heartbeat's counts equal its rows, and
 * each records 5 visits left out. The full days each carry 2 marks of each reminder; Sunday's 4
 * marks (10:00 and 15:00) fall before t0. Three appointment foreign keys to people and clinics are
 * dropped in the throwaway: no synthetic person or clinic is made, and the read reads none of
 * those tables.
 */
const SEED = `
alter table public.appointments
  drop constraint appointments_patient_id_patients_id_fk,
  drop constraint appointments_practitioner_id_users_id_fk,
  drop constraint appointments_location_id_locations_id_fk;
insert into public.tenants (id, name, slug) values ('${TENANT}', 'Synthetic tenant', 'synthetic-1104'),
                                                  ('${OTHER_TENANT}', 'Synthetic other tenant', 'synthetic-1104-other');
create table seed_appt as
  select ('00000000-0000-4000-8000-' || lpad(to_hex(row_number() over (order by z.ts)::int), 12, '0'))::uuid as id, z.ts as starts_at
    from (select (d::date + t) at time zone 'Europe/Lisbon' as ts
            from generate_series(date '2026-11-02', date '2026-11-06', interval '1 day') d,
                 (values (time '10:00'), (time '15:00')) v(t)) z;
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  select id, '${TENANT}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
         starts_at, starts_at + interval '1 hour', 'scheduled', 'staff', ${at("2026-10-01 09:00")}, ${at("2026-10-01 09:00")}
    from seed_appt;
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  select '${TENANT}', 'appointment.create', 'appointment', id,
         jsonb_build_object('startsAt', to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), ${at("2026-10-01 09:00")}
    from seed_appt;
create table seed_pass as
  select z.p as pass_at, z.p + interval '150 milliseconds' as created_at,
         'run-' || to_char(z.p at time zone 'UTC', 'YYYYMMDDHH24MI') as pass_id,
         case when (z.p at time zone 'Europe/Lisbon')::time >= time '21:45'
              then ((z.p at time zone 'Europe/Lisbon')::date + time '23:00') at time zone 'Europe/Lisbon' end as look_ahead_before
    from (select ((d::date + time '07:00') + make_interval(mins => 15 * n)) at time zone 'Europe/Lisbon' + interval '3 seconds' as p
            from generate_series(date '2026-11-01', date '2026-11-04', interval '1 day') d,
                 generate_series(0, 59) n) z
   where z.p <= ${at("2026-11-04 07:50:00")};
create table seed_mark as
  select a.id as appointment_id, rm.offset_id, rm.channel, a.starts_at, a.starts_at - make_interval(mins => rm.minutes) as due_at
    from seed_appt a cross join (values ('48h', 'email', 2880), ('24h', 'sms', 1440)) rm(offset_id, channel, minutes)
   where a.starts_at - make_interval(mins => rm.minutes) >= ${at("2026-11-01 00:00:00")}
     and a.starts_at - make_interval(mins => rm.minutes) <= ${at("2026-11-04 07:45:00")};
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
         false, 5, p.created_at
    from seed_pass p;
-- The sweep heartbeats every tenant: the second tenant's passes, with nothing due.
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  select '${OTHER_TENANT}', p.pass_id, 'shadow', p.pass_at, p.look_ahead_before, 0, 0, false, 0, p.created_at + interval '50 milliseconds'
    from seed_pass p;
`;

/** A visit of the case's own. `saved` writes its `appointment.create` row (with startsAt `bookedAt`) at `created`. */
const visit = (id, start, { tenant = TENANT, status = "scheduled", saved = true, created = "2026-10-01 09:00", updated = created, bookedAt = start, saveTenant = tenant, origin = "staff" } = {}) => `
insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
  values ('${id}', '${tenant}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${at(start)}, ${at(start)} + interval '1 hour',
          '${status}', '${origin}', ${at(created)}, ${at(updated)});
${saved ? `insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${saveTenant}', 'appointment.create', 'appointment', '${id}', '{"startsAt":"${iso(bookedAt)}"}', ${at(created)});` : ""}`;
/** The sleeping job's claim at the mark and its ledger row. No shadow row. */
const runClaim = (id, offset, start, due = dueOf(start, offset), outcome = "sent", reason = null) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${TENANT}', '${id}', 'claim', '${offset}', '${channelOf(offset)}', ${at(start)}, ${at(due)}, 'run', false, 1, ${at(due)} + interval '2 seconds');
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
  values ('${TENANT}', '${id}', '${channelOf(offset)}', 'reminder.${offset}.${channelOf(offset)}', '${outcome}', ${reason ? `'${reason}'` : "null"}, ${at(due)} + interval '3 seconds');`;
/** An audit row on a visit (no person, metadata of labels only). */
const audit = (id, action, when, metadata = "{}", tenant = TENANT) => `
insert into public.audit_log (tenant_id, action, entity_type, entity_id, metadata, created_at)
  values ('${tenant}', '${action}', 'appointment', '${id}', '${metadata}', ${at(when)});`;
/** A move as #1678 writes it: the start it left (`fromStartsAt`; null writes JSON null, undefined leaves the key out) and the new one. */
const moved = (id, when, toStart, fromStart) => audit(id, "appointment.reschedule", when, JSON.stringify({
  ...(fromStart === undefined ? {} : { fromStartsAt: fromStart === null ? null : iso(fromStart) }),
  startsAt: iso(toStart),
}));
/** A reminder ledger row of its own (no claim beside it). */
const ledger = (id, offset, when) => `
insert into public.reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, created_at)
  values ('${TENANT}', '${id}', '${channelOf(offset)}', 'reminder.${offset}.${channelOf(offset)}', 'sent', ${at(when)});`;
/** A shadow row in the transaction of the pass at `pass` (a 15-minute slot), and that heartbeat's counts raised by one. */
const shadowRow = (id, offset, start, pass, saved = false, due = dueOf(start, offset)) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, pass_id, created_at)
  select '${TENANT}', '${id}', 'shadow', '${offset}', '${channelOf(offset)}', ${at(start)}, ${at(due)}, 0, ${saved}, p.pass_id, p.created_at
    from public.reminder_sweep_passes p where p.tenant_id = '${TENANT}' and p.pass_at = ${at(pass)} + interval '3 seconds';
update public.reminder_sweep_passes set due_count = due_count + 1, recorded_count = recorded_count + 1
 where tenant_id = '${TENANT}' and pass_at = ${at(pass)} + interval '3 seconds';`;
/** Both sides took this offset: the claim at the mark, the shadow row at the pass `pass` (the mark's own slot by default). */
const both = (id, offset, start, pass = dueOf(start, offset)) => runClaim(id, offset, start) + shadowRow(id, offset, start, pass);
/** Remove a base shadow row and lower its heartbeat's counts. */
const dropShadow = (n, offset) => `
with d as (delete from public.reminder_claims where appointment_id = '${appt(n)}' and kind = 'shadow' and offset_id = '${offset}' returning created_at)
update public.reminder_sweep_passes p set due_count = due_count - 1, recorded_count = recorded_count - 1 from d where p.tenant_id = '${TENANT}' and p.created_at = d.created_at;`;

/**
 * R24's S5 shape under #1678 (R24 held): a visit booked for Wednesday 12:00 whose 48h mark (Monday
 * 12:00) both sides took, moved at Monday 13:00 to Wednesday 11:00. The new start's 48h mark
 * (Monday 11:00) is past at the move: the sleeping job's re-plan drops it, and the sweep must not
 * take it. The new start's 24h mark (Tuesday 11:00) both take.
 */
const R24_HELD = [
  visit(appt(0xa1), "2026-11-04 11:00", { bookedAt: "2026-11-04 12:00" }),
  both(appt(0xa1), "48h", "2026-11-04 12:00"),
  moved(appt(0xa1), "2026-11-02 13:00", "2026-11-04 11:00", "2026-11-04 12:00"),
  both(appt(0xa1), "24h", "2026-11-04 11:00"),
].join("\n");

/**
 * A move written after the mark that KEEPS the start (another therapist): written at 12:30:01, after
 * the mark at 12:30 and before the 12:30 pass (12:30:03). Under R33 it does not count, so the shadow
 * takes the mark and the pair reads `both`.
 */
const KEPT = (shadowTook = true) => [
  visit(appt(0xb1), "2026-11-04 12:30"),
  runClaim(appt(0xb1), "48h", "2026-11-04 12:30"),
  moved(appt(0xb1), "2026-11-02 12:30:01", "2026-11-04 12:30", "2026-11-04 12:30"),
  shadowTook ? shadowRow(appt(0xb1), "48h", "2026-11-04 12:30", "2026-11-02 12:30", true) : "",
  both(appt(0xb1), "24h", "2026-11-04 12:30"),
].join("\n");

/**
 * R9's shape: a staff visit for Tuesday 13:00 cancelled on Sunday after t0, so at its 24h mark
 * (Monday 13:00) the sleeping job claimed and suppressed it (status); brought back at Monday 13:20
 * (cancelled to scheduled, a re-arming save after the mark). Under #1678 the sweep never takes it.
 */
const R9_SHAPE = ({ origin = "staff", extra = "" } = {}) => [
  visit(appt(0xc1), "2026-11-03 13:00", { origin, updated: "2026-11-02 13:20" }),
  audit(appt(0xc1), "appointment.update", "2026-11-01 18:00", '{"fromStatus":"scheduled","toStatus":"cancelled"}'),
  runClaim(appt(0xc1), "24h", "2026-11-03 13:00", undefined, "suppressed", "status"),
  extra,
  audit(appt(0xc1), "appointment.update", "2026-11-02 13:20", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
].join("\n");

/** One clause of RE_ARMING_SAVES on a visit both sides took, written between the mark (Monday 16:30) and the pass (16:30:03). */
const CLAUSE_CASE = ({ origin = "staff", action, metadata, tenant = TENANT, when = "2026-11-02 16:30:01" }) => [
  visit(appt(0xd1), "2026-11-04 16:30", { origin }),
  runClaim(appt(0xd1), "48h", "2026-11-04 16:30"),
  audit(appt(0xd1), action, when, metadata, tenant),
  shadowRow(appt(0xd1), "48h", "2026-11-04 16:30", "2026-11-02 16:30", true),
  both(appt(0xd1), "24h", "2026-11-04 16:30"),
].join("\n");

/**
 * Send-mode rows on Sunday after t0 for R34's predicate (no full day is touched): three visits,
 * each with a re-arming save (an online request accepted in Pedidos) after its 24h mark, and one
 * plain send. e1: handed over at the mark and held back (claim, release), saved at +30 min, sent
 * by a pass at +1 h: R34. e2: the same, sent by a pass at +4 h: past R34's cap. e3: saved at
 * +10 min, first handed over at +20 min, sent at +45 min: no claim before the save. e4: sent at its
 * mark, no save.
 */
const sweepClaim = (cidN, id, start, when, attempt) => `
insert into public.reminder_claims (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
  values ('${cid(cidN)}', '${TENANT}', '${id}', 'claim', '24h', 'sms', ${at(start)}, ${at(dueOf(start, "24h"))}, 'sweep', false, ${attempt}, ${at(when)});`;
const release = (cidN, id, when) => `
insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id, created_at)
  values ('${TENANT}', '${id}', 'release', '24h', 'sms', '${cid(cidN)}', ${at(when)});`;
const sendBeat = (when) => `
insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
  values ('${TENANT}', 'send-${when.replace(/\D/g, "")}', 'send', ${at(when)}, 1, 1, false, 0, ${at(when)});`;
const R34_ROWS = [
  visit(appt(0xe1), "2026-11-02 18:00", { origin: "patient_portal" }),
  sweepClaim(1, appt(0xe1), "2026-11-02 18:00", "2026-11-01 18:00:02", 1), release(1, appt(0xe1), "2026-11-01 18:00:05"),
  audit(appt(0xe1), "appointment.update", "2026-11-01 18:30", '{"via":"portal_request_confirm"}'),
  sweepClaim(2, appt(0xe1), "2026-11-02 18:00", "2026-11-01 19:00:05", 2), ledger(appt(0xe1), "24h", "2026-11-01 19:00:06"),
  visit(appt(0xe2), "2026-11-02 16:00", { origin: "patient_portal" }),
  sweepClaim(3, appt(0xe2), "2026-11-02 16:00", "2026-11-01 16:00:02", 1), release(3, appt(0xe2), "2026-11-01 16:00:05"),
  audit(appt(0xe2), "appointment.update", "2026-11-01 16:30", '{"via":"portal_request_confirm"}'),
  sweepClaim(4, appt(0xe2), "2026-11-02 16:00", "2026-11-01 20:00:05", 2), ledger(appt(0xe2), "24h", "2026-11-01 20:00:06"),
  visit(appt(0xe3), "2026-11-02 17:00", { origin: "patient_portal" }),
  audit(appt(0xe3), "appointment.update", "2026-11-01 17:10", '{"via":"portal_request_confirm"}'),
  sweepClaim(5, appt(0xe3), "2026-11-02 17:00", "2026-11-01 17:20:02", 1), release(5, appt(0xe3), "2026-11-01 17:20:05"),
  sweepClaim(6, appt(0xe3), "2026-11-02 17:00", "2026-11-01 17:45:05", 2), ledger(appt(0xe3), "24h", "2026-11-01 17:45:06"),
  visit(appt(0xe4), "2026-11-02 19:30"),
  sweepClaim(7, appt(0xe4), "2026-11-02 19:30", "2026-11-01 19:30:05", 1), ledger(appt(0xe4), "24h", "2026-11-01 19:30:06"),
  sendBeat("2026-11-01 17:45:04"), sendBeat("2026-11-01 19:00:04"), sendBeat("2026-11-01 19:30:04"), sendBeat("2026-11-01 20:00:04"),
].join("\n");

/**
 * Every verdict OK except the ones named. Keys: "n" for a single verdict; "n d" for the per-day
 * verdicts 3, 11 and 12 (d the Lisbon day in the check text). Verdict 15 reads VACUOUS wherever no
 * mark had to be kept out by R24: that is its control.
 */
const KEYS = ["0", "1", "2", ...FULL_DAYS.map((d) => `3 ${d}`), "6", "7", "8", "9", "10",
  ...FULL_DAYS.map((d) => `11 ${d}`), ...FULL_DAYS.map((d) => `12 ${d}`), "13", "15", "16"];
const only = (faults) => Object.fromEntries(KEYS.map((k) => [k, faults[k] ?? (k === "15" ? "VACUOUS" : "OK")]));
const allDays = (n, v) => Object.fromEntries(FULL_DAYS.map((d) => [`${n} ${d}`, v]));
const keyOf = (r) => {
  const n = Number(r[0]);
  if (n === 3 || n === 11 || n === 12) return `${n} ${(r[1].match(/\d{4}-\d{2}-\d{2}/) || ["?"])[0]}`;
  return String(n);
};
const MON = "2026-11-02";
const TUE = "2026-11-03";
const EMPTY_WANT = { 0: "OK", 1: "OK", 2: "VACUOUS", ...allDays(3, "FAIL"), ...Object.fromEntries(["6", "7", "8", "9", "10", "13", "15", "16"].map((k) => [k, "VACUOUS"])), ...allDays(11, "VACUOUS"), ...allDays(12, "VACUOUS") };
const re = (s) => s.replace(/[()]/g, "\\$&");

const CASES = [
  {
    name: "clean",
    seed: "",
    want: only({}),
    info: [
      [20, /^window: .* \| 2026-11-01 15:20:00 \| 2026-11-01 15:30:03 \| 2026-11-04 08:00:00 \| 2026-11-04 07:45:03 \| 2026-11-02 to 2026-11-03 \(2\)/],
      [2, /Lisbon 2026-11-01 15:30:03; Monday marks due before it 0; moves written since it 0, of them without fromStartsAt 0/],
      [23, /\| 4, 0, 0 \|/],
      [36, /\| 0, 0, 0, 0: 0 sweep-sent rows, as shadow sends nothing \|/],
      [40, /full days 2026-11-02 to 2026-11-03: both=8 shadow_only=0 .* run_r8=0 run_r9=0 /],
      [11, /both 2; .*visits starting 2026-11-04 \|/],
    ],
  },
  { name: "empty: no heartbeat and no claim at all", seed: "delete from public.reminder_sweep_passes; delete from public.reminder_claims;", want: EMPTY_WANT },
  { name: "null window: every heartbeat removed, the claims and shadow rows left in place", seed: "delete from public.reminder_sweep_passes;", want: EMPTY_WANT },
  {
    name: "the deploy after Monday's 07:00 slot (08:00): verdict 2 FAILs, and Monday's heartbeats since the deploy are short",
    seed: "", deployed: "2026-11-02T08:00:00Z",
    want: only({ 2: "FAIL", [`3 ${MON}`]: "FAIL" }),
  },
  { name: "the deploy at Monday 06:50: t0 is the 07:00 pass, in the first slot, OK", seed: "", deployed: "2026-11-02T06:50:00Z", want: only({}), info: [[2, /Lisbon 2026-11-02 07:00:03; Monday marks due before it 0/]] },
  {
    name: "the deploy at Monday 06:50 and a Monday mark due at 03:00: Monday is not wholly under the new code, verdict 2 FAILs",
    seed: [visit(appt(0x90), "2026-11-03 03:00"), runClaim(appt(0x90), "24h", "2026-11-03 03:00"), shadowRow(appt(0x90), "24h", "2026-11-03 03:00", "2026-11-02 07:00")].join("\n"),
    deployed: "2026-11-02T06:50:00Z",
    want: only({ 2: "FAIL" }),
    info: [[2, /Monday marks due before it 2;/]],
  },
  {
    name: "a move written since t0 without fromStartsAt: the old code was still serving, verdict 2 FAILs",
    seed: moved(appt(3), "2026-11-02 09:00", "2026-11-03 10:00"),
    want: only({ 2: "FAIL" }),
    info: [[2, /moves written since it 1, of them without fromStartsAt 1/]],
  },
  {
    name: "R24 held: a visit moved after its 48h mark to a start whose mark is past; neither side takes it, the control counts it, verdict 15 OK",
    seed: R24_HELD,
    want: only({ 15: "OK" }),
    info: [[15, /S5 shadow-only rows 0; shadow rows taken after a re-arming save 0; marks saved after their mark by a re-arming save before the shadow took them 1 over visits 1/]],
  },
  {
    name: "R24 violated: the same, and the shadow took the new start's past mark after the move: S5, verdict 15 FAILs",
    seed: [R24_HELD, shadowRow(appt(0xa1), "48h", "2026-11-04 11:00", "2026-11-02 13:15", true)].join("\n"),
    want: only({ [`11 ${MON}`]: "REVIEW", 15: "FAIL" }),
    info: [[15, /S5 shadow-only rows 1; shadow rows taken after a re-arming save 1;/], [31, /marks due 2026-11-02, 48h email, shadow_only: S5 saved after its mark, before the pass \| 1 \|/]],
  },
  { name: "a move that keeps the start, after the mark and before the pass: it does not count (R33), the shadow takes it, `both`", seed: KEPT(true), want: only({}) },
  {
    name: "a move that keeps the start, after the mark, and NO shadow row: run only, UNEXPLAINED (no kept-start label, not R9)",
    seed: KEPT(false),
    want: only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xb1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "moved away and back after the mark: the start at the mark is the earliest move's fromStartsAt, kept, the shadow takes it",
    seed: [
      visit(appt(0xb2), "2026-11-04 13:30"),
      runClaim(appt(0xb2), "48h", "2026-11-04 13:30"),
      moved(appt(0xb2), "2026-11-02 13:30:01", "2026-11-04 14:30", "2026-11-04 13:30"),
      moved(appt(0xb2), "2026-11-02 13:30:02", "2026-11-04 13:30", "2026-11-04 14:30"),
      shadowRow(appt(0xb2), "48h", "2026-11-04 13:30", "2026-11-02 13:30", true),
      both(appt(0xb2), "24h", "2026-11-04 13:30"),
    ].join("\n"),
    want: only({}),
  },
  {
    name: "a kept-start move whose fromStartsAt is null: the start at the mark falls to the booking row's startsAt (rule 2), kept",
    seed: [
      visit(appt(0xb3), "2026-11-04 14:00"),
      runClaim(appt(0xb3), "48h", "2026-11-04 14:00"),
      moved(appt(0xb3), "2026-11-02 14:00:01", "2026-11-04 14:00", null),
      shadowRow(appt(0xb3), "48h", "2026-11-04 14:00", "2026-11-02 14:00", true),
      both(appt(0xb3), "24h", "2026-11-04 14:00"),
    ].join("\n"),
    want: only({}),
  },
  {
    name: "a re-arming save written AT the mark exactly does not count (strictly after): the shadow takes it",
    seed: CLAUSE_CASE({ action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"confirmed"}', when: "2026-11-02 16:30:00" }),
    want: only({}),
  },
  {
    name: "R9: cancelled at its mark (the sleeping job suppressed it), brought back after the mark; under R24 the sweep never takes it",
    seed: R9_SHAPE(),
    want: only({ [`12 ${MON}`]: "REVIEW", 15: "OK", 16: "REVIEW" }),
    info: [
      [51, new RegExp(`${appt(0xc1)} \\| ${re(R9_LABEL)}`)],
      [16, /with a label outside the set 1 \(R9 1\)/],
      [35, /R9 2026-11-02 24h sms: 1/],
      [40, /run_r9=1 /],
    ],
  },
  {
    name: "R9 negative: brought back to scheduled on an online request (not a re-arming save): UNEXPLAINED",
    seed: R9_SHAPE({ origin: "patient_portal" }),
    want: only({ [`12 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R9 negative: a pass with every old predicate true before any re-arming save (cancelled at 13:05, after the 13:00 pass; brought back at 13:20): UNEXPLAINED",
    seed: [
      visit(appt(0xc2), "2026-11-03 13:00", { updated: "2026-11-02 13:20" }),
      runClaim(appt(0xc2), "24h", "2026-11-03 13:00"),
      audit(appt(0xc2), "appointment.update", "2026-11-02 13:05", '{"fromStatus":"scheduled","toStatus":"cancelled"}'),
      audit(appt(0xc2), "appointment.update", "2026-11-02 13:20", '{"fromStatus":"cancelled","toStatus":"scheduled"}'),
    ].join("\n"),
    want: only({ [`12 ${MON}`]: "FAIL", 13: "FAIL", 15: "OK" }),
    info: [[51, new RegExp(`${appt(0xc2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R9 negative: an unknown status at a pass before the bring-back, with no save yet: UNEXPLAINED",
    seed: R9_SHAPE({ extra: audit(appt(0xc1), "appointment.update", "2026-11-02 13:10", '{"toStatus":"cancelled"}') }),
    want: only({ [`12 ${MON}`]: "FAIL", 13: "FAIL", 15: "OK" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R9 negative: no pass had every old predicate true (a live sweep claim of the key before the mark): UNEXPLAINED",
    seed: [
      R9_SHAPE(),
      `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt, created_at)
         values ('${TENANT}', '${appt(0xc1)}', 'claim', '24h', 'sms', ${at("2026-11-03 13:00")}, ${at("2026-11-02 13:00")}, 'sweep', false, 2, ${at("2026-11-02 12:00")});`,
    ].join("\n"),
    want: only({ 6: "FAIL", [`12 ${MON}`]: "FAIL", 13: "FAIL", 15: "OK" }),
    info: [[51, new RegExp(`${appt(0xc1)} \\| UNEXPLAINED`)]],
  },
  {
    name: "R8 is unchanged: a visit with no scheduling save before any pass; its day REVIEW, verdict 16 OK (R8 is in R32's set)",
    seed: [
      visit(appt(0xc5), "2026-11-03 13:00", { saved: false }),
      audit(appt(0xc5), "appointment.update", "2026-11-03 13:30", '{"fromStatus":"scheduled","toStatus":"confirmed"}'),
      runClaim(appt(0xc5), "24h", "2026-11-03 13:00"),
    ].join("\n"),
    want: only({ [`12 ${MON}`]: "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xc5)} \\| ${re(R8_LABEL)}`)], [16, /with a label outside the set 0;/]],
  },
  {
    name: "R2 is unchanged: cancelled at its mark, never brought back; its day REVIEW, verdict 16 OK",
    seed: [visit(appt(0xc6), "2026-11-03 13:00", { status: "cancelled" }), runClaim(appt(0xc6), "24h", "2026-11-03 13:00", undefined, "suppressed", "status")].join("\n"),
    want: only({ [`12 ${MON}`]: "REVIEW" }),
    info: [[51, new RegExp(`${appt(0xc6)} \\| R2 suppressed by the sleeping job as not remindable`)]],
  },
  {
    name: "R1 on a full day is outside R32's set: its day REVIEW, verdict 16 REVIEW naming it",
    seed: [
      visit(appt(0xc7), "2026-11-03 17:00", { bookedAt: "2026-11-03 16:05" }),
      runClaim(appt(0xc7), "24h", "2026-11-03 16:05"),
      moved(appt(0xc7), "2026-11-02 16:10", "2026-11-03 17:00", "2026-11-03 16:05"),
      both(appt(0xc7), "24h", "2026-11-03 17:00"),
    ].join("\n"),
    want: only({ [`12 ${MON}`]: "REVIEW", 15: "OK", 16: "REVIEW" }),
    info: [[16, /\(R1 1\)/], [31, /run_only: R1 moved after the claim, before the next pass \| 1 \|/]],
  },
  {
    name: "R5 on the partial Wednesday (a mark at 07:50, no pass since): printed, not judged by verdict 16",
    seed: [visit(appt(0xc8), "2026-11-05 07:50"), runClaim(appt(0xc8), "24h", "2026-11-05 07:50")].join("\n"),
    want: only({}),
    info: [[16, /with a label outside the set 0; window-edge labels on a partial day, not judged 1/]],
  },
  {
    name: "shadow only: the sleeping job's claim for Tuesday's 24h SMS at 10:00 removed",
    seed: `delete from public.reminder_dispatches where appointment_id = '${appt(5)}' and channel = 'sms';
           delete from public.reminder_claims where appointment_id = '${appt(5)}' and kind = 'claim' and offset_id = '24h';`,
    want: only({ [`12 ${TUE}`]: "FAIL", 13: "FAIL" }),
    info: [[50, new RegExp(`${appt(5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "run only: the shadow row for Monday's 48h email at 10:00 removed (a booked visit, no save after the mark: not R8, not R9)",
    seed: dropShadow(5, "48h"),
    want: only({ [`11 ${MON}`]: "FAIL", 13: "FAIL" }),
    info: [[51, new RegExp(`${appt(5)} \\| UNEXPLAINED`)]],
  },
  {
    name: "sent with neither: a reminder send with no claim and no shadow row FAILs verdict 10, its day and 13",
    seed: [visit(appt(0xd2), "2026-11-04 15:30"), ledger(appt(0xd2), "24h", "2026-11-03 15:30:03")].join("\n"),
    want: only({ 10: "FAIL", [`12 ${TUE}`]: "FAIL", 13: "FAIL" }),
    info: [[52, new RegExp(`${appt(0xd2)} \\| UNEXPLAINED`)]],
  },
  {
    name: "Tuesday has no 48h mark at all, its visits start on Thursday: VACUOUS, never OK",
    seed: [dropShadow(7, "48h"), dropShadow(8, "48h"),
      `delete from public.reminder_dispatches where appointment_id in ('${appt(7)}', '${appt(8)}') and channel = 'email';
       delete from public.reminder_claims where appointment_id in ('${appt(7)}', '${appt(8)}') and offset_id = '48h';`].join("\n"),
    want: only({ [`11 ${TUE}`]: "VACUOUS" }),
  },
  {
    name: "CALENDAR: the same, with the closed weekday pointed at Thursday: OK by the calendar",
    seed: [dropShadow(7, "48h"), dropShadow(8, "48h"),
      `delete from public.reminder_dispatches where appointment_id in ('${appt(7)}', '${appt(8)}') and channel = 'email';
       delete from public.reminder_claims where appointment_id in ('${appt(7)}', '${appt(8)}') and offset_id = '48h';`].join("\n"),
    mutate: (s) => s.replace("extract(isodow from fd.d + om.minutes / 1440) = 7 as closed_start", "extract(isodow from fd.d + om.minutes / 1440) = 4 as closed_start"),
    want: only({}),
    info: [[11, /both 0; .*visits starting 2026-11-05, a Sunday: the clinics are closed \|/]],
  },
  {
    name: "R34's predicate on seeded send-mode rows (Sunday, after t0): 4 sweep-sent, 3 after a re-arming save, 1 R34, 2 outside",
    seed: R34_ROWS,
    want: only({ 6: "FAIL", 15: "OK" }),
    info: [[36, /\| 4, 3, 1, 2 \|/]],
  },
  { name: "missing heartbeat: Tuesday 12:00", seed: `delete from public.reminder_sweep_passes where pass_at = ${at("2026-11-03 12:00:03")};`, want: only({ [`3 ${TUE}`]: "FAIL" }) },
  {
    name: "a send heartbeat",
    seed: `insert into public.reminder_sweep_passes (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count, created_at)
           values ('${TENANT}', 'run-send', 'send', ${at("2026-11-04 07:50:03")}, 0, 0, false, 0, ${at("2026-11-04 07:50:04")});`,
    want: only({ 6: "FAIL" }),
  },
  {
    name: "a pass over the ceiling on Monday",
    seed: `update public.reminder_sweep_passes set over_ceiling = true, due_count = recorded_count + 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-11-02 12:00:03")};`,
    want: only({ 7: "FAIL" }),
  },
  {
    name: "a heartbeat whose recorded count is one short",
    seed: `update public.reminder_sweep_passes set recorded_count = recorded_count - 1 where tenant_id = '${TENANT}' and pass_at = ${at("2026-11-02 10:00:03")};`,
    want: only({ 8: "FAIL" }),
  },
  { name: "a mark taken twice", seed: shadowRow(appt(3), "24h", "2026-11-03 10:00", "2026-11-02 10:15"), want: only({ 9: "FAIL" }) },
  {
    name: "a claim with no mark",
    seed: `insert into public.reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, starts_at, taker, attempt, created_at)
           values ('${TENANT}', '${appt(6)}', 'claim', '72h', 'sms', ${at("2026-11-04 15:00")}, 'run', 1, ${at("2026-11-02 09:00")});`,
    want: only({ 10: "FAIL" }),
  },
  { name: "the read's clock at Wednesday 07:10: Tuesday is not closed, verdict 1 FAILs", seed: "", clock: "2026-11-04 07:10:00", want: only({ 1: "FAIL" }) },
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
];

/**
 * Each clause of RE_ARMING_SAVES, on a visit both sides took, written after the mark and before the
 * pass: a clause that counts makes the shadow's row a violation (verdict 15 FAIL); its near miss,
 * which R33 says re-arms nothing, leaves the base as it was.
 */
const CLAUSE_CASES = [
  ["booked: a booking row after the mark", true, { action: "appointment.create", metadata: `{"startsAt":"${iso("2026-11-04 16:30")}"}` }],
  ["accepted_in_pedidos: an online request accepted in Pedidos", true, { action: "appointment.update", metadata: '{"via":"portal_request_confirm"}' }],
  ["near miss: an update by another way", false, { action: "appointment.update", metadata: '{"via":"agenda"}' }],
  ["accepted_with_estado: an online request set to Confirmada", true, { origin: "patient_portal", action: "appointment.update", metadata: '{"fromStatus":"scheduled","toStatus":"confirmed"}' }],
  ["near miss: a booked visit set to Confirmada by hand (status only)", false, { action: "appointment.update", metadata: '{"fromStatus":"scheduled","toStatus":"confirmed"}' }],
  ["brought_back: Cancelada to Confirmada", true, { action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"confirmed"}' }],
  ["brought_back: Cancelada to Agendada on a booked visit", true, { action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"scheduled"}' }],
  ["near miss: Cancelada to Agendada on an online request", false, { origin: "patient_portal", action: "appointment.update", metadata: '{"fromStatus":"cancelled","toStatus":"scheduled"}' }],
  ["accepted_in_sms_review: a review-queue confirmada applied on an online request", true, { origin: "patient_portal", action: "appointment.sms_reply_reviewed", metadata: '{"resolution":"confirmed","applied":true}' }],
  ["near miss: the same on a booked visit", false, { action: "appointment.sms_reply_reviewed", metadata: '{"resolution":"confirmed","applied":true}' }],
  ["near miss: the same on an online request, not applied", false, { origin: "patient_portal", action: "appointment.sms_reply_reviewed", metadata: '{"resolution":"confirmed","applied":false}' }],
  ["accepted_by_sms_reply: the patient's SMS confirmo on an online request", true, { origin: "patient_portal", action: "appointment.patient_sms_reply", metadata: '{"outcome":"confirmed"}' }],
  ["near miss: the patient's SMS confirmo on a booked visit", false, { action: "appointment.patient_sms_reply", metadata: '{"outcome":"confirmed"}' }],
  ["near miss: the patient's SMS cancel on an online request", false, { origin: "patient_portal", action: "appointment.patient_sms_reply", metadata: '{"outcome":"cancelled"}' }],
  ["near miss: a booking row written under another tenant", false, { action: "appointment.create", metadata: `{"startsAt":"${iso("2026-11-04 16:30")}"}`, tenant: OTHER_TENANT }],
];
for (const [name, counts, args] of CLAUSE_CASES) {
  CASES.push({
    name: `CLAUSE ${name}: ${counts ? "counts, the shadow's row after it FAILs verdict 15" : "re-arms nothing, the shadow takes the mark"}`,
    seed: CLAUSE_CASE(args),
    want: only(counts ? { 15: "FAIL" } : {}),
    info: counts ? [[15, /shadow rows taken after a re-arming save 1;/]] : [[15, /shadow rows taken after a re-arming save 0;/]],
  });
}

/**
 * The mutation sweep of this read's own predicates: each condition changed once, run on the case
 * that must kill it. `kills` names the unmutated case; the mutant must not meet its expectation, or
 * (for R34, whose result is a row and not a verdict) must not print its row.
 */
const MUTANTS = [
  ["every move counts (the start-at-the-mark rule dead)", "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)", "and true", "a move that keeps the start, after the mark and before the pass"],
  ["every move counts, on the run-only case: R9 would name a kept start", "and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)", "and true", "a move that keeps the start, after the mark, and NO shadow row"],
  ["rule 1 reads the LATEST move after the mark", "order by n.created_at, n.id limit 1", "order by n.created_at desc, n.id desc limit 1", "moved away and back after the mark"],
  ["rule 2 dead", "and b.clause in ('booked', 'moved') and b.created_at <= p.mark", "and false", "a kept-start move whose fromStartsAt is null"],
  ["a save AT the mark counts", "and r.created_at > p.mark and r.created_at <= p.upto\n", "and r.created_at >= p.mark and r.created_at <= p.upto\n", "a re-arming save written AT the mark exactly"],
  ["brought_back without its origin condition", "or (l.metadata->>'toStatus' = 'scheduled' and a.origin <> 'patient_portal'))", "or (l.metadata->>'toStatus' = 'scheduled'))", "R9 negative: brought back to scheduled on an online request"],
  ["accepted_with_estado without its origin condition", "and l.metadata->>'toStatus' = 'confirmed' and a.origin = 'patient_portal'\n               then 'accepted_with_estado'", "and l.metadata->>'toStatus' = 'confirmed'\n               then 'accepted_with_estado'", "CLAUSE near miss: a booked visit set to Confirmada by hand"],
  ["accepted_in_sms_review without applied", "and l.metadata->>'applied' = 'true' and a.origin = 'patient_portal'", "and a.origin = 'patient_portal'", "CLAUSE near miss: the same on an online request, not applied"],
  ["accepted_by_sms_reply without its origin condition", "and l.metadata->>'outcome' = 'confirmed'\n                  and a.origin = 'patient_portal'\n", "and l.metadata->>'outcome' = 'confirmed'\n", "CLAUSE near miss: the patient's SMS confirmo on a booked visit"],
  ["the visit's own tenant dropped", "join public.appointments a on a.id = l.entity_id and a.tenant_id = l.tenant_id\n     where l.entity_type = 'appointment'\n       and l.entity_id in (select appointment_id from probe)", "join public.appointments a on a.id = l.entity_id\n     where l.entity_type = 'appointment'\n       and l.entity_id in (select appointment_id from probe)", "CLAUSE near miss: a booking row written under another tenant", (s) => s.replace("where r.tenant_id = p.tenant_id and r.appointment_id = p.appointment_id\n", "where r.appointment_id = p.appointment_id\n")],
  ["R9 without a pass where every old predicate held", "where pr.uk = u.uk and pr.in_range and pr.every = 'T' and e.rearmed)", "where pr.uk = u.uk and pr.in_range)", "R9 negative: no pass had every old predicate true"],
  ["R9 lets a pass with every old predicate true and no save through", "pr.in_range and pr.every <> 'F' and not coalesce(e.rearmed, false))", "pr.in_range and pr.every <> 'F' and false)", "R9 negative: a pass with every old predicate true before any re-arming save"],
  ["R9 lets an unknown pass with no save through", "pr.in_range and pr.every <> 'F' and not coalesce(e.rearmed, false))", "pr.in_range and pr.every = 'T' and not coalesce(e.rearmed, false))", "R9 negative: an unknown status at a pass"],
  ["verdict 2 without the Monday-mark condition", " or w.monday_before_t0 > 0 or w.old_moves > 0 then 'FAIL'", " or w.old_moves > 0 then 'FAIL'", "the deploy at Monday 06:50 and a Monday mark due at 03:00"],
  ["verdict 2 without the old-code-move condition", " or w.monday_before_t0 > 0 or w.old_moves > 0 then 'FAIL'", " or w.monday_before_t0 > 0 then 'FAIL'", "a move written since t0 without fromStartsAt"],
  ["the calendar arm without its Sunday", "when a.closed_start and a.matched = 0 and a.shadow_only = 0 and a.run_only = 0 then 'OK'", "when a.matched = 0 and a.shadow_only = 0 and a.run_only = 0 then 'OK'", "Tuesday has no 48h mark at all"],
  ["verdict 16 judges the window-edge labels of a partial day", "and (full_day or letter not in ('R5', 'S7'))) as outside", "and true) as outside", "R5 on the partial Wednesday"],
  ["verdict 15's S5 count dead", "where p.side = 'shadow_only' and p.category like 'S5 %') as s5_rows", "where false) as s5_rows", "R24 violated", (s) => s.replace("(select count(*) from probe_eval e where e.src = 'shadow' and e.rearmed) as taken_after_save", "0 as taken_after_save")],
  ["verdict 15's control dead", "(select count(*) from subj) as subjects", "0 as subjects", "R24 held"],
  ["R34's cap at 5 hours", "<= s.due_at + interval '3 hours' as is_r34", "<= s.due_at + interval '5 hours' as is_r34", "R34's predicate", null, [36, /\| 4, 3, 1, 2 \|/]],
  ["R34 without the claim before the first save", "and c0.id <> s.id and c0.created_at <= e.first_rearm_at)", "and c0.id <> s.id)", "R34's predicate", null, [36, /\| 4, 3, 1, 2 \|/]],
];
for (const [what, from, to, caseName, more, infoKill] of MUTANTS) {
  const base = CASES.find((c) => c.name.startsWith(caseName) && !c.mutate);
  assert.ok(base, `no case named ${caseName}`);
  CASES.push({
    name: `MUTANT: ${what}, on "${caseName}"`,
    seed: base.seed,
    deployed: base.deployed,
    mutate: (s) => {
      assert.equal(s.split(from).length, 2, `the mutated text is not written exactly once: ${from}`);
      const m = s.replace(from, to);
      return more ? more(m) : m;
    },
    kills: infoKill ? undefined : base.name,
    killsInfo: infoKill,
  });
}

const PGURL = process.env.SHADOW_COMPARE_1104_TEST_PGURL;

test("the read on a local database: every verdict flips on its own seeded fault, every label names its shape, every mutant dies", { skip: PGURL ? false : "SHADOW_COMPARE_1104_TEST_PGURL is not set" }, () => {
  const url = new URL(PGURL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `REFUSE: SHADOW_COMPARE_1104_TEST_PGURL must name a database on this machine, not ${url.hostname}`);
  const dbUrl = (name) => { const u = new URL(PGURL); u.pathname = `/${name}`; return u.toString(); };
  const psql = (target, args, input) => {
    const r = spawnSync("psql", [target, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
    return r;
  };
  const ok = (r) => { assert.equal(r.status, 0, `psql failed: ${r.stderr}`); return r.stdout; };
  const admin = (statement) => ok(psql(PGURL, ["-c", statement]));
  const BASE = "shadowcompare1104_test_base";
  const CASE_DB = "shadowcompare1104_test_case";
  admin(`drop database if exists ${BASE}`);
  admin(`create database ${BASE}`);
  const work = mkdtempSync(join(tmpdir(), "shadowcompare1104-db-"));
  const results = [];
  try {
    const dump = spawnSync("pg_dump", [PGURL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(dump.status, 0, `pg_dump failed: ${dump.stderr}`);
    // The schema is loaded leniently (a role or extension the lane has may be missing here); the
    // tables the read and the seed use must then exist, which the seed proves by running strictly.
    spawnSync("psql", [dbUrl(BASE), "-X", "-q"], { encoding: "utf8", input: dump.stdout, maxBuffer: 64 * 1024 * 1024 });
    ok(psql(dbUrl(BASE), [], SEED));
    const runRead = (db, text, deployed) => {
      const file = join(work, "read.sql");
      writeFileSync(file, text);
      const set = deployed === null ? [] : ["-c", `set local ${GUC} = '${deployed}'`];
      return psql(dbUrl(db), ["-A", "-t", "-F", "\u001f", "-c", "begin read only", "-c", "set local statement_timeout = '120s'", ...set, "-f", file, "-c", "rollback"]);
    };
    const withClock = (clock) => {
      const t = sql.replace(CLOCK_LINE, `  select timestamptz '${clock} Europe/Lisbon' as t1`);
      assert.notEqual(t, sql, "the clock line was not replaced");
      return t;
    };
    // Without the deploy time the read stops with an error and prints no table.
    {
      const r = runRead(BASE, withClock(READ_CLOCK), null);
      assert.notEqual(r.status, 0, "the read ran without the deploy time");
      assert.match(r.stderr, /unrecognized configuration parameter "osteojp\.r47_deployed_at"/);
      assert.doesNotMatch(r.stdout, /\u001fOK$|\u001fFAIL$/m, "a verdict printed without the deploy time");
      results.push("the deploy time unset: the read stops with an error, no table");
    }
    for (const c of CASES) {
      admin(`drop database if exists ${CASE_DB}`);
      admin(`create database ${CASE_DB} template ${BASE}`);
      if (c.seed) ok(psql(dbUrl(CASE_DB), [], c.seed));
      let text = withClock(c.clock ?? READ_CLOCK);
      if (c.mutate) {
        const mutated = c.mutate(text);
        assert.notEqual(mutated, text, `${c.name}: the mutant changed nothing`);
        text = mutated;
      }
      const out = ok(runRead(CASE_DB, text, c.deployed ?? DEPLOYED));
      const rows = out.split("\n").filter(Boolean).map((l) => l.split("\u001f")).filter((r) => r.length === 5);
      const verdictRows = rows.filter((r) => r[4] !== "INFO");
      const verdicts = Object.fromEntries(verdictRows.map((r) => [keyOf(r), r[4]]));
      assert.equal(verdictRows.length, Object.keys(verdicts).length, `${c.name}: a verdict key printed twice\n${out}`);
      results.push(`${c.name}: ${verdictRows.map((r) => `${keyOf(r)}=${r[4]}`).filter((s) => !s.endsWith("=OK")).join(", ") || "all OK"}`);
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
      admin(`drop database ${CASE_DB}`);
    }
  } finally {
    if (process.env.SHADOW_COMPARE_1104_TEST_REPORT) writeFileSync(process.env.SHADOW_COMPARE_1104_TEST_REPORT, results.join("\n") + "\n");
    rmSync(work, { recursive: true, force: true });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${CASE_DB}`], { encoding: "utf8" });
    spawnSync("psql", [PGURL, "-X", "-q", "-c", `drop database if exists ${BASE}`], { encoding: "utf8" });
  }
});


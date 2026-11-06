// R36: docs/data-op-r36-weekly-fallback.md, the weekly fallback sittings while the sweep is in shadow.
//
// WHAT THIS PROVES, statically and with every external program a stub, with no database:
//   * the document's first line is NOT READY until SOLO's READY line, and its sidecar pins it;
//   * it has exactly four blocks (WEEKLY, BEFORE YOU START; THE WEEKLY CANARY; THE WEEKLY REST;
//     THE WEEKLY CLOSING DRY RUN), each parsing under bash -n and zsh -n, with no `#` line, no `!`
//     but `test !`, no continuation and no `set -e`;
//   * EVERY HALT IS EXPLICIT: every command a later step relies on carries its own STOP;
//   * every pin is the real file's sha256 on this tree, and the program is the one the R36
//     document pins (unchanged);
//   * NIGHTS is the same in every block, today 20261113 and 20261120 (ruled 2026-11-06), every
//     night a Monday to Friday, a 11-20 night passing every block and a 11-27 night refused, and
//     the window of a Friday night ends before Saturday's opening by the weekday table;
//   * the program runs with exactly the reviewed arguments: --max-days-ahead 28 everywhere,
//     --max 5 or 200, --second-pass only in the first block, --confirm only under caffeinate;
//   * the program's settled-marker refusals (--second-pass) hold at a week's distance: an empty
//     marker, a row of unknown outcome and a lock each refuse before any read;
//   * THE FAULT INJECTION: each block runs in GREEN's tool shape, in bash with errexit forced off and
//     in zsh, against the program's REAL output (a Wednesday sitting, its second pass and then a
//     weekly sitting, run in-process through the 2026-10-12 program's run() into a sink); its
//     positive control reaches its last line, and each external call made to fail in turn, and each
//     scenario, stops it with a STOP line, without its last line and without a record written past
//     the fault. HARNESS_POOL caps the parallel runs; FAULT_TABLE=1 prints every row.
// WHAT IT DOES NOT PROVE: anything on a database, on GitHub or on production. See the document,
// "Rehearsal".
//
// Run: node --test scripts/r36-weekly-fallback.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Halt, run as realRearm } from "../packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";
import { HORIZON_DAYS, MAX_PER_RUN, OWNER_FLAG, STALE_FLAG, SWEEP_OK_LINE, runFallback, splitArgs } from "../packages/db/scripts/r36-fallback-rearm-emit.mjs";
import { SITTING_SHA, SITTING_T0, SITTING_URL, wholeSitting } from "./r36-fallback-rearm-sitting.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC = "docs/data-op-r36-weekly-fallback.md";
const SIDECAR = "docs/data-op-r36-weekly-fallback.sha256";
const R36DOC = "docs/data-op-r36-fallback-rearm-20261104.md";
const WRAP = "packages/db/scripts/r36-fallback-rearm-emit.mjs";
const EMIT = "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";
const GUARD = "scripts/assert-production-target.mjs";
const PTM = "scripts/production-target.mjs";
const FIXSHA = "20a6d73151468d36c080bcfd6cfad528d3a69d2d";
const RULED_NIGHTS = ["20261113", "20261120"];
const doc = read(DOC);
const withFirstLine = (line) => doc.replace(/^[^\n]*\n/, `${line}\n`);

/** The fenced blocks GREEN pastes: fences whose opening line is exactly three backticks. */
function blocksOf(md) {
  const out = [];
  let open = null;
  let body = [];
  for (const line of md.split("\n")) {
    if (open === null) {
      const m = /^```(\S*)$/.exec(line);
      if (m) {
        open = m[1];
        body = [];
      }
    } else if (line === "```") {
      if (open === "") out.push(`${body.join("\n")}\n`);
      open = null;
    } else body.push(line);
  }
  if (open !== null) throw new Error("a fence is never closed");
  return out;
}

const SUCCESS = Object.freeze({
  wbys: "WEEKLY, BEFORE YOU START: every check passed.",
  wcanary: "WEEKLY CANARY SENT: 5 of 5, G4 yes, G3 0.",
  wrest: "WEEKLY REST: this run ended clean.",
  wclosing: "WEEKLY CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0",
});
const NAMES = Object.keys(SUCCESS);
const blockOf = (name) => {
  const hits = blocksOf(doc).filter((b) => b.includes(`echo "${SUCCESS[name]}`));
  if (hits.length !== 1) throw new Error(`expected exactly one block for ${name}, found ${hits.length}`);
  return hits[0];
};
const PR = (() => {
  const m = /^PR=([1-9][0-9]{0,5})$/m.exec(blockOf("wbys"));
  return m ? m[1] : null;
})();

/* ---- the document, statically ----------------------------------------------------------------- */

test("the first line is NOT READY until the READY line, or a READY line after it, and the sidecar pins the document", () => {
  const first = doc.split("\n")[0];
  assert.ok(/^NOT READY: /.test(first) || /^READY\b/.test(first), first);
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
});

test("no em dash in the document or this test", () => {
  const dash = String.fromCharCode(0x2014);
  for (const f of [DOC, SIDECAR, "scripts/r36-weekly-fallback.test.mjs"]) assert.ok(!read(f).includes(dash), `${f} carries an em dash`);
});

test("the document carries the sections the ruling asks for", () => {
  for (const h of [
    "## The rulings",
    "## What it re-arms, and why",
    "## How the weekly sitting uses the marker",
    "### Why the program does not change",
    "## The nights: which, and the window on a Friday",
    "## This op must NOT run if the sweep is in send mode",
    "## The order of the sitting",
    "### G2: the owner checks the canary",
    "### After the closing dry run: the owner's look at the re-plan (step 7)",
    "## The dispatch",
    "## If a block stops",
    "## Rollback",
    "## Replay",
    "## Rehearsal",
    "## What must happen before READY, in this order, and none of it by GREEN",
    "## Questions for strategy",
  ]) {
    assert.ok(doc.split("\n").includes(h), h);
  }
  assert.ok(doc.indexOf("1. **The owner's looks**") < doc.indexOf("2. **WEEKLY, BEFORE YOU START**"));
  assert.match(doc, /\*\*THE MERGE FREEZE, mandatory: no merge to `main` from the owner's first look of step 1 until GREEN reports\.\*\*/);
  assert.match(doc, /^THE HALT RULE\. /m);
  assert.match(doc, /\*\*Nobody presses Replay or Rerun on any event or run in the Inngest dashboard/);
  assert.match(doc, /^\*\*REHEARSED by a session that did not write this, on BLUE /m);
  assert.match(doc, /\*\*Since `3173a15c` only prose has changed, and one token in each block: the four blocks are byte-identical to the blocks rehearsed except their `NIGHTS` line\*\*/);
  assert.ok(doc.includes("That one-token delta is NOT REHEARSED on the throwaway"));
  assert.ok(doc.includes("- answered: Fri 11-20 added, ruled 2026-11-06; strategy rules on 11-27 after the 11-20 report."));
  assert.match(doc, /^\*\*NOT REHEARSED, said one by one:\*\*$/m);
  assert.ok(doc.includes("**Its pass branch is NOT REHEARSED.**"));
  assert.match(doc, /A script's own REFUSE or STOP line is a halt, the same as a harness refusal\. Never edit an env file, a URL, a flag, a label or a script to get past a guard\. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so\./);
  for (const f of ["`RUNDAY`", "`HELD`", "`DOCSHA`", "`STALEPATH`", "`LASTOK`", "`PRIORK`"]) assert.ok(doc.includes(`| ${f} |`), f);
  assert.match(doc, /\*\*SOLO's written statement of THE MERGE FREEZE\*\*/);
  assert.match(doc, /"Inngest auto-sync \(osteojp-reminders, osteojp-consultation\)"/);
  assert.match(read(".github/workflows/inngest-auto-sync.yml"), /^name: Inngest auto-sync \(osteojp-reminders, osteojp-consultation\)$/m);
  assert.match(doc, /Functions, `schedule-appointment-reminders`, Runs, from the minute `canary began` printed: none with the status Failed\*\*; and the same for \*\*`send-appointment-reminder`\*\*/);
  assert.match(doc, /\*\*Q-R36W-1\. Which nights after Friday 11-13\.\*\*/);
  assert.match(doc, /^- blocked_what: /m);
  assert.match(doc, /^- recommendation: /m);
  // R4 of 38345ed2: the cost as the pinned program counts it.
  assert.match(read(EMIT), /^export const EXECUTIONS_PER_EVENT = 26;$/m);
  assert.ok(doc.includes("G1 counts 26 executions for every appointment in scope") && 769 * 26 < 20000 && 770 * 26 >= 20000);
  assert.doesNotMatch(doc, /at most 8 executions|costs 8\b/);
  // Which G2 and which last line LASTOK rests on.
  assert.ok(doc.includes("the G2 of the last sitting that HAD a canary passed"));
  assert.ok(doc.includes("**Wednesday 11-04's G2** (the second pass has no canary)"));
  assert.ok(doc.includes("`SECOND PASS, CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the <K> appointments this operation sent. The second pass is over.`"));
  assert.ok(read(R36DOC).includes('echo "SECOND PASS, CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the ${K} appointments this operation sent. The second pass is over."'));
  assert.ok(read(R36DOC).includes('echo "CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the ${K} appointments this operation sent. The sends of the sitting are over."'));
  // A night halted on main moved: fail-closed, and PRIORK only from a printed total, on the lead's ruling.
  assert.ok(doc.includes("**The next night is fail-closed.** By its own rule LASTOK cannot be `yes` after such a night"));
  assert.ok(doc.includes("If no send block of the night ended clean, there is no such number: the lead rules, and nothing is pasted until he does."));
  // held-for-apply is required, not optional.
  assert.ok(doc.includes("with the label `held-for-apply` REQUIRED, on from before the READY line until the last weekly sitting's GREEN report."));
  assert.doesNotMatch(doc, /if SOLO wants it/);
  // The marker check, said exactly.
  assert.ok(doc.includes("A marker that is empty, or holds a different row count, stops the block."));
  assert.ok(doc.includes("is vacuous on a weekly night") && doc.includes("(`saved_again`)"));
  assert.match(read(EMIT), /return "saved_again";/);
});

test("exactly four blocks, each with its last line, each parsing under bash -n and zsh -n", (t) => {
  assert.equal(blocksOf(doc).length, 4);
  for (const name of NAMES) blockOf(name);
  for (const b of blocksOf(doc)) {
    const r = spawnSync("bash", ["--noprofile", "--norc", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
  if (!zshOrSkip(t)) return;
  for (const b of blocksOf(doc)) {
    const r = spawnSync("zsh", ["-f", "-n", "-c", b], { encoding: "utf8" });
    assert.equal(r.status, 0, `zsh -n: ${r.stderr}\n${b.slice(0, 120)}`);
  }
});

function blockHazards(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (/^\s*#/.test(line)) out.push(`a # line: ${line.trim()}`);
    if (line.replace(/test !/g, "").includes("!")) out.push(`a !: ${line.trim().slice(0, 80)}`);
    if (/\\\s*$/.test(line)) out.push(`a backslash continuation: ${line.trim().slice(0, 80)}`);
    if (/\bset\s+-[a-z]*e/.test(line) || /\bset -o errexit\b/.test(line)) out.push(`a set -e: ${line.trim().slice(0, 80)}`);
    if (/\$[A-Za-z_][A-Za-z0-9_]*:/.test(line)) out.push(`an unbraced parameter before a colon: ${line.trim().slice(0, 80)}`);
  }
  return out;
}

test("no block carries a # line, a !, a continuation, set -e or an unbraced parameter before a colon", () => {
  for (const b of blocksOf(doc)) assert.deepEqual(blockHazards(b), [], b.slice(0, 80));
  for (const planted of ["# x", "if ! true; then :; fi", "echo a \\", "set -e", "set -eo pipefail", "set -o errexit", "git show $TIP:x"]) {
    assert.equal(blockHazards(planted).length, 1, planted);
  }
});

const EXPLICIT_HALT = /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/;
const SEND_HALT = /\|\| \{ touch \/tmp\/r36w-last-send\.ok \|\| \{ echo "STOP: [^"]+"; exit 1; \}; echo "STOP: [^"]+"; exit 1; \}$/;
const STRAY_HALT = /\|\| \{ echo "STOP: [^"]+"; echo "\$\{STRAY\}"; exit 1; \}$/;
const MUST_HALT = [
  /^cd /, /\bgit /, /^rm /, /^touch /, /\| tee /, /\bnode /, /^set -o allexport/, /^shasum /,
  /^(REC|HD|STRAY|TIP|PRNOW|DOC|TOP|SIDE|SW|SE|SG|SM|NOW|RDOW|NIGHT|EC|N|K|KA|PK|MS|G3L|GA|G4L|SL|RECENT|BEGAN|BEGANT|MAINSHA|MREC|MNOW|HB|TCH|SR)=\$\(/, /^NEXTDAY=\$\(TZ=/,
  /^test /, /^\[ /, /^grep /, /^echo "[^"]*" \| grep /, /^echo .* > \/tmp\//,
];
function unguardedLines(block) {
  const out = [];
  block.split("\n").forEach((line, i) => {
    if (/^if /.test(line) || /^for /.test(line) || /^(TH|TL|TD|SN)=\$\(/.test(line) || /^TE=""; if /.test(line) || /^OFF=\$\(/.test(line)) return;
    if (/^echo "[^"]*"$/.test(line) || /^echo "[^"]*\$\{[^"]*"$/.test(line)) return;
    if (MUST_HALT.some((re) => re.test(line)) && !EXPLICIT_HALT.test(line) && !SEND_HALT.test(line) && !STRAY_HALT.test(line)) out.push(`${i + 1}: ${line.slice(0, 100)}`);
  });
  return out;
}

test("EVERY HALT IS EXPLICIT: each command a later step relies on carries its own STOP, and line 2 is set -o pipefail", () => {
  for (const b of blocksOf(doc)) {
    assert.deepEqual(unguardedLines(b), [], b.slice(0, 80));
    const lines = b.split("\n");
    assert.equal(lines[0], "(");
    assert.equal(lines[1], "set -o pipefail");
    assert.equal(lines.filter(Boolean).at(-1), ")");
    const sets = lines.filter((l) => /(^|[ (;])set [-+]/.test(l));
    assert.equal(sets[0], "set -o pipefail");
    for (const s of sets.slice(1)) {
      assert.equal(s.replace(/ \|\| \{.*$/, ""), "set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env 2>/dev/null && set +o allexport");
    }
    for (const line of lines) if (line.includes('echo "STOP: ')) assert.match(line, /exit 1; (\}|fi|\}; fi)$/, line.slice(0, 120));
    // The only arithmetic is on numbers a grep has already proven whole.
    for (const line of lines.filter((l) => l.includes("$(("))) assert.match(line, /^(KMIN=\$\(\( \$\{PK\} \+ 5 \)\)|TOTAL=\$\(\( \$\{PK\} \+ 5 \)\)|TOTAL=\$\(\( \$\{K\} \+ \$\{KA\} \)\)|TONIGHT=\$\(\( \$\{K\} - \$\{PK\} \)\)|.*TDIF=\$\(\( \$\{TL\} - \$\{TE\} \)\).*)$/, line.slice(0, 80));
  }
  for (const planted of ["git fetch origin --prune", "node x.mjs | tee /tmp/r36w-x.out", "PRNOW=$(git ls-remote origin x | cut -f1)", "PK=$(cat /tmp/r36w-priork.ok)", "GA=$(grep -xE x /tmp/r36w-rest-send.out)", "KA=$(echo x | sed -E y)", "test -f /tmp/r36w-head.sha", "[ a = b ]", "grep -qxF x /tmp/r36w-x.out", 'echo "${TIP}" > /tmp/r36w-head.sha', "touch /tmp/r36w-canary.ok", "shasum -a 256 -c x"]) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
});

test("every pin is the real file's sha256 on this tree, the program is the one the R36 document pins, and FIXSHA is the reminder fix", () => {
  const want = { SHAWRAP: sha256(read(WRAP)), SHAEMIT: sha256(read(EMIT)), SHAGUARD: sha256(read(GUARD)), SHAPTM: sha256(read(PTM)) };
  for (const b of blocksOf(doc)) {
    for (const [k, v] of Object.entries(want)) assert.match(b, new RegExp(`^${k}=${v}$`, "m"), `${k} in ${b.slice(0, 60)}`);
    assert.match(b, new RegExp(`^FIXSHA=${FIXSHA}$`, "m"));
  }
  // The program is unchanged: the weekly blocks pin the very file the R36 document pins and rehearsed.
  const r36 = read(R36DOC);
  for (const [k, v] of Object.entries(want)) assert.match(r36, new RegExp(`^${k}=${v}$`, "m"), `${k} differs from the R36 document`);
  assert.equal(want.SHAWRAP, "1795c035a45d7a318b2966eda3991423ee0d2c27c5bc1a78d1e811404459f454");
  assert.ok(doc.includes("`1795c035...f454`"));
});

test("PENDING lines: only WEEKLY, BEFORE YOU START carries them: HELD, DOCSHA, RUNDAY, STALEPATH, LASTOK and PRIORK", () => {
  const pend = (b) => b.split("\n").filter((l) => /^[A-Z]+='PENDING/.test(l)).map((l) => l.split("=")[0]);
  assert.deepEqual(pend(blockOf("wbys")), ["HELD", "DOCSHA", "RUNDAY", "STALEPATH", "LASTOK", "PRIORK"]);
  for (const name of ["wcanary", "wrest", "wclosing"]) assert.deepEqual(pend(blockOf(name)), [], name);
  for (const l of blockOf("wbys").split("\n").filter((x) => /^[A-Z]+='PENDING/.test(x))) assert.doesNotMatch(l.replace(/^[A-Z]+='/, "").replace(/'$/, ""), /'/, "an apostrophe inside a PENDING value");
});

test("the pull request number is filled in and is the same in the document's prose", () => {
  assert.ok(PR, "PR= in WEEKLY, BEFORE YOU START is not a number");
  assert.equal((blockOf("wbys").match(/^PR=/gm) ?? []).length, 1);
  for (const name of ["wcanary", "wrest", "wclosing"]) assert.doesNotMatch(blockOf(name), /refs\/pull|^PR=/m, name);
  assert.ok(doc.includes(`#${PR}`), `the document does not name #${PR}`);
});

/* ---- the nights and the window ------------------------------------------------------------------ */

const lisbonParts = (ms) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23", timeZoneName: "short" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
const lisbon = (ms) => {
  const p = lisbonParts(ms);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName === "GMT" ? "WET" : p.timeZoneName === "GMT+1" ? "WEST" : p.timeZoneName}`;
};
const ISO_DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
/** The weekday table of every block, the awk of WEEKLY, BEFORE YOU START, as a function. */
const closedByTable = (dow, hhmm) => dow === 7 || (dow >= 1 && dow <= 5 && (hhmm < 800 || hhmm >= 2100)) || (dow === 6 && (hhmm < 800 || hhmm >= 1300));

test("NIGHTS is the same in every block, today 20261113 and 20261120, both Fridays, and every ruled night is a Monday to Friday", () => {
  const lists = blocksOf(doc).map((b) => (/^NIGHTS='([0-9|]+)'$/m.exec(b) ?? [null, null])[1]);
  assert.deepEqual(lists, Array(4).fill(RULED_NIGHTS.join("|")));
  for (const n of RULED_NIGHTS) {
    const noon = Date.parse(`${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6, 8)}T12:00:00Z`);
    const dow = ISO_DOW[lisbonParts(noon).weekday];
    assert.ok(dow >= 1 && dow <= 5, `${n} is weekday ${dow}`);
    // Never a migration night of strategy's calendar, nor the 0113 night.
    assert.ok(!["20261109", "20261110", "20261111", "20261112", "20261118"].includes(n), n);
  }
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-11-13T12:00:00Z")).weekday], 5);
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-11-20T12:00:00Z")).weekday], 5);
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-11-27T12:00:00Z")).weekday], 5);
  assert.ok(doc.includes("`NIGHTS='20261113|20261120'` in every block") && doc.includes("**Today: `20261113` (Friday 2026-11-13) and `20261120` (Friday 2026-11-20, ruled 2026-11-06).**"));
  assert.ok(doc.includes("one of `NIGHTS` (today `20261113` or `20261120`)"));
  // The block's own test of RUNDAY against NIGHTS: a ruled night passes, any other fails, in grep's -x.
  for (const [day, ok] of [["20261113", true], ["20261120", true], ["20261127", false], ["20261106", false], ["2026111", false], ["202611130", false], ["2026112", false], ["202611200", false], ["2026111320261120", false]]) {
    const r = spawnSync("/bin/sh", ["-c", `echo "${day}" | grep -qxE '${RULED_NIGHTS.join("|")}'`]);
    assert.equal(r.status === 0, ok, day);
  }
  const two = spawnSync("/bin/sh", ["-c", `echo 20261120 | grep -qxE '20261113|20261120' && echo 2026111320261120 | grep -qxE '20261113|20261120'`]);
  assert.notEqual(two.status, 0, "-x must anchor every alternative");
});

test("the window of a Friday night, 21:00 to Saturday 06:29, reads closed by the weekday table at every minute, and ends before Saturday opening", () => {
  const start = Date.parse("2026-11-13T21:00:00Z");
  const end = Date.parse("2026-11-14T06:29:00Z");
  assert.equal(lisbon(start), "2026-11-13 21:00 WET");
  assert.equal(lisbon(end), "2026-11-14 06:29 WET");
  for (let t = start; t <= end; t += 60_000) {
    const p = lisbonParts(t);
    assert.ok(closedByTable(ISO_DOW[p.weekday], Number(`${p.hour}${p.minute}`)), lisbon(t));
  }
  assert.equal(closedByTable(6, 800), false, "Saturday 08:00 is open by the table");
  assert.ok(629 < 800 && 629 < 900, "06:29 is before the table's 08:00 and the owner's 09:00");
  assert.match(doc, /\*\*The window on a Friday night: Friday 21:00 to Saturday 06:29, Lisbon,\*\*/);
  // The blocks' window test is the R36 blocks': RUNDAY from 21:00, the next day to 06:29.
  for (const b of blocksOf(doc)) {
    assert.ok(b.includes(`if [ "\${DAY}" = "\${RUNDAY}" ] && awk -v t="\${LT}" 'BEGIN { if ((t + 0) >= 2100) exit 0; exit 1 }'; then WIN=yes; fi`));
    assert.ok(b.includes(`if [ "\${DAY}" = "\${NEXTDAY}" ] && awk -v t="\${LT}" 'BEGIN { if ((t + 0) <= 629) exit 0; exit 1 }'; then WIN=yes; fi`));
  }
  assert.ok(blockOf("wbys").includes("if (d == 6 && (t < 800 || t >= 1300)) exit 0;"));
});

test("the dates the document states are the arithmetic of the reach", () => {
  const D = 86_400_000;
  const H = 3_600_000;
  // Wednesday 11-04 21:00 plus 28 days; the first visits beyond, Thursday 12-03, their emails Tuesday 12-01.
  assert.equal(lisbon(Date.parse("2026-11-04T21:00:00Z") + 28 * D), "2026-12-02 21:00 WET");
  assert.equal(lisbon(Date.parse("2026-12-03T08:00:00Z") - 48 * H), "2026-12-01 08:00 WET");
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-12-01T12:00:00Z")).weekday], 2);
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-11-30T12:00:00Z")).weekday], 1);
  assert.ok(doc.includes("**Tuesday 2026-12-01 at 08:00**") && doc.includes("the night of Monday 2026-11-30 at the latest"));
  // Friday 11-13 21:00 plus 28 days: Friday 12-11 21:00; the first beyond, Saturday 12-12, emails Thursday 12-10.
  const fri = Date.parse("2026-11-13T21:00:00Z");
  assert.equal(lisbon(fri + 28 * D), "2026-12-11 21:00 WET");
  assert.equal(ISO_DOW[lisbonParts(fri + 28 * D).weekday], 5);
  assert.equal(lisbon(Date.parse("2026-12-12T08:00:00Z") - 48 * H), "2026-12-10 08:00 WET");
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-12-10T12:00:00Z")).weekday], 4);
  assert.ok(doc.includes("**Friday 2026-12-11 21:00**") && doc.includes("Thursday 2026-12-10 at 08:00") && doc.includes("the night of Wednesday 2026-12-09"));
  // The longest sleep: the SMS of a 20:59 visit on 12-11, under 27 days.
  assert.ok((Date.parse("2026-12-11T20:59:00Z") - 24 * H - fri) / D < 27);
  // Q-R36W-1: 11-20 reaches 12-18, whose emails fall on Wednesday 12-16.
  assert.equal(lisbon(Date.parse("2026-11-20T21:00:00Z") + 28 * D), "2026-12-18 21:00 WET");
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-12-18T12:00:00Z")).weekday], 5);
  assert.equal(ISO_DOW[lisbonParts(Date.parse("2026-12-16T12:00:00Z")).weekday], 3);
  assert.ok(doc.includes("reaches visits up to Friday 12-18") && doc.includes("the night of Wednesday 12-16"));
});

/* ---- the program's arguments, and its refusals at a week's distance ---------------------------- */

const wrapCalls = (block) =>
  block.split("\n").filter((l) => /^(caffeinate -i )?node \$\{WRAP\} /.test(l)).map((l) => {
    const m = /^(caffeinate -i )?node \$\{WRAP\} (.*?) 2>&1 \| tee /.exec(l);
    assert.ok(m, `an unexpected way to run the program: ${l.slice(0, 100)}`);
    return { caffeinate: Boolean(m[1]), args: m[2] };
  });

test("the program runs with exactly the reviewed arguments, and sends only in THE WEEKLY CANARY and THE WEEKLY REST", () => {
  const base = `--tenant-slug osteojp --max-days-ahead ${HORIZON_DAYS}`;
  const owner = `${OWNER_FLAG} ${STALE_FLAG} "\${SR}"`;
  const ownerA = `${OWNER_FLAG} ${STALE_FLAG} "\${STALEPATH}"`;
  const confirm = '--confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings';
  assert.deepEqual(wrapCalls(blockOf("wbys")), [{ caffeinate: false, args: `${base} --max 200 ${ownerA} --second-pass` }]);
  assert.deepEqual(wrapCalls(blockOf("wcanary")), [
    { caffeinate: false, args: `--tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 ${owner}` },
    { caffeinate: true, args: `--tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 ${owner} ${confirm}` },
  ]);
  assert.deepEqual(wrapCalls(blockOf("wrest")), [
    { caffeinate: false, args: `${base} --max 200 ${owner}` },
    { caffeinate: true, args: `${base} --max 200 ${owner} ${confirm}` },
  ]);
  assert.deepEqual(wrapCalls(blockOf("wclosing")), [{ caffeinate: false, args: `${base} --max 200 ${owner}` }]);
  for (const b of blocksOf(doc)) {
    assert.doesNotMatch(b, /--sink-file|--resend-attempted|inc-1007-rearm-reminders-emit\.mjs --|node \$\{EMIT\}/);
    assert.equal((b.match(/--confirm/g) ?? []).length, (b.match(/^caffeinate -i /gm) ?? []).length);
    for (const c of wrapCalls(b)) {
      const max = Number(/--max (\d+)/.exec(c.args)[1]);
      assert.ok(max <= MAX_PER_RUN, c.args);
      assert.match(c.args, /--max-days-ahead 28 /);
    }
  }
  assert.ok(!/\/tmp\/r36-|\/tmp\/r36p2-/.test(blocksOf(doc).join("\n")), "a block names a record of Wednesday or Thursday");
});

test("the program's ceilings stand: --max above 200 and --max-days-ahead above 28 are bad invocations before any read", () => {
  const code = (argv) => {
    try {
      splitArgs(argv);
      return 0;
    } catch (e) {
      assert.ok(e instanceof Halt);
      return e.code;
    }
  };
  const S = ["--tenant-slug", "osteojp"];
  assert.equal(code([...S, "--max-days-ahead", "28", "--max", "200", "--second-pass"]), 0);
  assert.equal(code([...S, "--max-days-ahead", "28", "--max", "201", "--second-pass"]), 2);
  assert.equal(code([...S, "--max-days-ahead", "29", "--max", "200", "--second-pass"]), 2);
  assert.equal(code([...S, "--max", "200", "--second-pass"]), 2, "--max-days-ahead missing");
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apptId = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(n).padStart(4, "0")}`;
/** A row as the 2026-10-12 program's read returns it, the shape of the shared sitting's rows. */
const dbRow = (n) => ({
  id: apptId(n),
  tenant_id: TENANT,
  starts_at: new Date(SITTING_T0 + (3 + n) * DAY + 10 * HOUR),
  status: n % 3 === 0 ? "confirmed" : "scheduled",
  unaccepted_request: false,
  last_emit_at: new Date(SITTING_T0 - 40 * DAY),
  emit_events: 1,
  t0: new Date(SITTING_T0),
});
/** A fake database: the rows that start after the read (the selection's own `starts_at > t0`), read at `t0`. */
function fakeReader(rows, t0 = SITTING_T0) {
  return async () => ({
    selection: async () => ({ tenantId: TENANT, t0: new Date(t0), rows: rows.filter((r) => r.starts_at.getTime() > t0) }),
    recheck: async (_t, id) => {
      const r = rows.find((x) => x.id === id);
      return { starts_at: r.starts_at, status: r.status, patient_deleted: false, unaccepted_request: false, last_emit_at: r.last_emit_at };
    },
    ledger: async () => ({ n: 0, handedOver: 0 }),
    close: async () => {},
  });
}
const shadowHeartbeat = async () => ({
  read: async () => ({ tenants: 1, latestMode: "shadow", latestAgeS: 600, shadowLast3h: 12, notShadowLast7d: 0 }),
  close: async () => {},
});
/** Friday 11-13 21:30 Lisbon: nine days after the first sending run's read. The weekly reads are made at it. */
const FRIDAY_NOW = SITTING_T0 + 9 * DAY;
/** A visit beyond Wednesday's 28 days, inside Friday's: 29 to 35 days after Wednesday's read, 20 to 26 after Friday's. */
const newRow = (m) => ({ ...dbRow(0), id: apptId(100 + m), starts_at: new Date(SITTING_T0 + (28 + m) * DAY + 10 * HOUR), status: "scheduled" });

/** One run of the program in-process against a sink, as a weekly block makes it. */
async function weeklyStep(sink, home, rows, extra) {
  const lines = [];
  let halt = null;
  try {
    await runFallback(["--tenant-slug", "osteojp", "--max-days-ahead", "28", OWNER_FLAG, "--sink-file", sink, ...extra], {
      env: { DATABASE_URL_DIRECT: SITTING_URL },
      out: (l) => lines.push(l),
      home,
      openHeartbeat: shadowHeartbeat,
      rearm: realRearm,
      openReader: fakeReader(rows, FRIDAY_NOW),
      sleep: async () => {},
      now: () => FRIDAY_NOW,
    });
  } catch (e) {
    if (!(e instanceof Halt)) throw e;
    halt = e;
  }
  return { lines, halt };
}

test("the settled-marker check at a week's distance: an empty marker, a row of unknown outcome and a lock each refuse before any read; the settled marker passes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "r36w-settled-"));
  try {
    const sink = join(dir, "sink.jsonl");
    const marker = `${sink}.marker.json`;
    const home = join(dir, "home");
    mkdirSync(home);
    const go = () => weeklyStep(sink, home, [dbRow(10)], ["--max", "200", "--second-pass"]);
    let r = await go();
    assert.equal(r.halt?.code, 1);
    assert.match(r.halt.message, /holds no sending run/);
    const entry = (state) => ({ readAt: new Date(SITTING_T0).toISOString(), marginMs: 690000, state: "done", rows: [{ id: apptId(10), startsAt: new Date(SITTING_T0 + 13 * DAY + 10 * HOUR).toISOString(), state }] });
    writeFileSync(marker, JSON.stringify({ history: [entry("attempted")] }));
    r = await go();
    assert.match(r.halt?.message ?? "", /1 row\(s\) of unknown outcome/);
    writeFileSync(marker, JSON.stringify({ history: [entry("sent")] }));
    writeFileSync(`${marker}.lock`, "{}");
    r = await go();
    assert.match(r.halt?.message ?? "", /lock is present/);
    rmSync(`${marker}.lock`);
    r = await go();
    assert.equal(r.halt, null, r.halt?.message);
    assert.ok(r.lines.includes("marker   the first sending run of this operation read the database at 2026-11-04T21:30:00.000Z, 216.0 hours ago (a second pass needs 25)"), r.lines.join("\n"));
    assert.ok(r.lines.includes("marker   second pass: the first sitting is settled (no row of unknown outcome, no lock)"));
    assert.ok(r.lines.includes("skipped: already sent by an earlier run (marker): 1"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Wednesday's sitting and Thursday's second pass (the shared whole sitting: 15 appointments in the
 * marker), then, read a real week later (Friday 11-13 21:30), a weekly sitting over the same 15 and
 * seven visits beyond Wednesday's reach: its first dry run, the canary's dry run and send, THE
 * REST's dry run and send, and the closing dry run. By Friday five of the 15 have started (the read
 * no longer returns them) and one starts within 24 hours.
 */
async function weeklySitting() {
  const { home, sink } = await wholeSitting();
  const rows = [...Array.from({ length: 15 }, (_, i) => dbRow(i + 1)), ...Array.from({ length: 7 }, (_, i) => newRow(i + 1))];
  const confirm = ["--confirm", "--fix-deployed-sha", SITTING_SHA, "--i-checked-inngest-settings"];
  const steps = {};
  const step = async (name, extra) => {
    const r = await weeklyStep(sink, home, rows, extra);
    if (r.halt) throw new Error(`the weekly step ${name} halted: ${r.halt.message}\n${r.lines.join("\n")}`);
    steps[name] = r.lines;
  };
  await step("wDry", ["--max", "200", "--second-pass"]);
  await step("wCanaryDry", ["--min-days-ahead", "3", "--max", "5"]);
  await step("wCanarySend", ["--min-days-ahead", "3", "--max", "5", ...confirm, "--expect", "7"]);
  await step("wRestDry", ["--max", "200"]);
  await step("wRestSend", ["--max", "200", ...confirm, "--expect", "2"]);
  await step("wClosing", ["--max", "200"]);
  const events = readFileSync(sink, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  rmSync(dirname(sink), { recursive: true, force: true });
  return { steps, events };
}

test("a weekly sitting through the REAL run(), read a week later: G3 still counts every earlier send, started visits included, nothing is sent twice, and the printed totals are the next G3 counts", async () => {
  const { steps, events } = await weeklySitting();
  // Five of the 15 visits sent on Wednesday and Thursday started between the sittings, one starts within 24 hours.
  assert.equal(Array.from({ length: 15 }, (_, i) => dbRow(i + 1)).filter((r) => r.starts_at.getTime() <= FRIDAY_NOW).length, 5);
  assert.equal(Array.from({ length: 15 }, (_, i) => dbRow(i + 1)).filter((r) => r.starts_at.getTime() > FRIDAY_NOW && r.starts_at.getTime() <= FRIDAY_NOW + DAY).length, 1);
  for (let m = 1; m <= 7; m++) assert.ok(newRow(m).starts_at.getTime() > SITTING_T0 + 28 * DAY && newRow(m).starts_at.getTime() <= FRIDAY_NOW + 28 * DAY, `new row ${m}`);
  const G3 = (k) => `G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: ${k}; handed to a provider: 0; not checkable: 0; expected 0)`;
  assert.ok(steps.wDry.includes(G3(15)), steps.wDry.join("\n"));
  assert.ok(steps.wDry.includes("ELIGIBLE: 7"));
  assert.ok(steps.wDry.includes("skipped: already sent by an earlier run (marker): 9"), "the nine still more than 24 hours ahead");
  assert.ok(steps.wDry.includes("marker   second pass: the first sitting is settled (no row of unknown outcome, no lock)"));
  assert.ok(steps.wCanaryDry.includes(G3(15)));
  assert.ok(steps.wCanaryDry.some((l) => l.startsWith("THIS RUN: 5 of 7")));
  assert.ok(steps.wCanarySend.some((l) => l.startsWith("SENT: 5 of 5  ")));
  assert.ok(steps.wCanarySend.includes("G3 AFTER THIS RUN: 0  (appointments checked: 5; handed to a provider: 0; expected 0)"));
  assert.ok(steps.wRestDry.includes(G3(20)) && steps.wRestDry.includes("ELIGIBLE: 2"));
  assert.ok(steps.wRestSend.some((l) => l.startsWith("SENT: 2 of 2  ")));
  assert.ok(steps.wClosing.includes(G3(22)) && steps.wClosing.includes("ELIGIBLE: 0"));
  // 12 on Wednesday, 3 on Thursday, 7 on Friday: each appointment once, the Friday seven only the new ones.
  const ids = events.map((e) => e.data.appointmentId);
  assert.equal(ids.length, 22);
  assert.equal(new Set(ids).size, 22);
  assert.deepEqual(ids.slice(15).sort(), Array.from({ length: 7 }, (_, i) => apptId(101 + i)).sort());
  // The totals the canary and THE REST print (PRIORK plus 5; the dry run's K plus this run's rows) are the next reads' G3 counts.
  const k = (lines) => Number(/appointments checked: (\d+);/.exec(lines.find((l) => l.startsWith("G3 LEDGER ROWS")))[1]);
  const after = (lines) => Number(/^G3 AFTER THIS RUN: 0 {2}\(appointments checked: (\d+);/.exec(lines.find((l) => l.startsWith("G3 AFTER THIS RUN")))[1]);
  assert.equal(15 + 5, k(steps.wRestDry));
  assert.equal(k(steps.wRestDry) + after(steps.wRestSend), k(steps.wClosing));
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const [k, v] of Object.entries(steps)) for (const l of v) assert.doesNotMatch(l, uuid, `${k}: ${l}`);
});

/* ---- THE HARNESS. Nothing in it touches a real host, the secrets folder or a database. ---------- */

const STUBBED = ["git", "node", "sntp", "curl", "caffeinate", "date", "shasum", "tee", "rm", "touch", "cat", "find", "grep", "cut", "awk", "sed"];
const FAKED = new Set(["git", "node", "sntp", "curl", "caffeinate"]);
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const FAKE_SHA = { MAIN: "1".repeat(40), OTHER: "2".repeat(40), BEFORE: "3".repeat(40) };
const HARNESS_EPOCH = 1794605400;
const HARNESS_HTTPDATE = new Date(HARNESS_EPOCH * 1000).toUTCString();
const RECORDS = ["r36w-head.sha", "r36w-night.ok", "r36w-canary.ok", "r36w-last-send.ok", "r36w-main.sha", "r36w-stale.ok", "r36w-priork.ok"];
const MAINLINE = "4".repeat(40);

function realPath(name) {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8", env: { PATH: SYSTEM_PATH } });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}, and it is not there`);
  return p;
}
const hasShell = (name) => spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH } }).status === 0;
const shq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

/** One POSIX sh stub: it numbers its calls per name, logs each call and the records present, fails when named by HARNESS_FAIL, and otherwise answers. */
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
if [ "$n" = tee ]; then ${R("sleep")} 0.05; fi
inp=
if [ "$n" = cut ]; then inp=$(${R("cat")}); fi
ex=
for m in ${RECORDS.join(" ")}; do if [ -f "$d/tmp/$m" ] && [ "$d/tmp/$m" -nt "$d/t0" ]; then ex="$ex $m"; fi; done
printf '%s\\n' "$@" > "$d/args.$id"
if [ -n "$inp" ]; then printf 'STDIN %s\\n' "$inp" >> "$d/args.$id"; fi
printf '%s|%s\\n' "$id" "$ex" >> "$d/log"
unexpected() { printf '%s %s\\n' "$id" "$*" >> "$d/unexpected"; echo "harness: unexpected call $id" >&2; exit 97; }
for a in "$@"; do case "$a" in *osteojp-secrets*|*osteojp-prod-apply*) unexpected "a real path";; esac; done
if [ "$HARNESS_FAIL" = "$id" ]; then
  echo "$id" > "$d/fired"
  if [ "$HARNESS_FAIL_MODE" = empty ]; then ${R("cat")} > /dev/null 2>&1 < /dev/null; exit 0; fi
  case "$n" in
    git) echo "fatal: harness fault" >&2; exit 128;;
    sntp) echo "sntp: harness fault: no response" >&2; exit 1;;
    curl) exit 28;;
    node) echo "FAILED: harness fault" >&2; exit 1;;
    caffeinate) echo "caffeinate: harness fault" >&2; exit 1;;
    tee) ${R("cat")}; echo "tee: harness fault: Permission denied" >&2; exit 1;;
    grep) ${R("cat")} > /dev/null; echo "grep: harness fault: Input/output error" >&2; exit 2;;
    cut|awk|sed|shasum|find) ${R("cat")} > /dev/null 2>&1; echo "$n: harness fault: Input/output error" >&2; exit 1;;
    *) echo "$n: harness fault: Operation failed" >&2; exit 1;;
  esac
fi
case "$n" in
  git) case "$1" in
      status) if [ -n "$HARNESS_STRAY" ]; then echo "$HARNESS_STRAY"; fi; exit 0;;
      fetch) if [ "$*" = "fetch origin --prune" ]; then exit 0; fi
        if [ "$*" = "fetch -q origin refs/pull/$HARNESS_PR/head" ]; then exit 0; fi;;
      ls-remote) [ "$2" = origin ] && [ "$3" = "refs/pull/$HARNESS_PR/head" ] && [ "$#" = 3 ] || unexpected "$@"
        if [ -z "$HARNESS_PRHEAD" ]; then exit 0; fi
        printf '%s\\trefs/pull/%s/head\\n' "$HARNESS_PRHEAD" "$HARNESS_PR"; exit 0;;
      rev-parse) if [ "$2" = FETCH_HEAD ]; then echo "$HARNESS_MAIN"; exit 0; fi
        if [ "$2" = origin/main ]; then echo "$HARNESS_MAINLINE"; exit 0; fi
        if [ "$2" = HEAD ]; then read -r h < "$d/head"; echo "$h"; exit 0; fi;;
      checkout) for a in "$@"; do last="$a"; done; echo "$last" > "$d/head"; exit 0;;
      merge-base) [ "$2" = --is-ancestor ] && [ "$3" = ${FIXSHA} ] || unexpected "$@"; exit "\${HARNESS_ANCESTOR:-0}";;
      show) spec="$2"; sha="\${spec%%:*}"; path="\${spec#*:}"
        [ "$sha" = "$HARNESS_MAIN" ] || { echo "fatal: bad revision '$sha'" >&2; exit 128; }
        [ -f "$path" ] || { echo "fatal: path '$path' does not exist in '$sha'" >&2; exit 128; }
        exec ${R("cat")} "$path";;
    esac
    unexpected "$@";;
  sntp) [ "$1" = time.apple.com ] || unexpected "$@"
    case "$HARNESS_SNTP" in
      far) echo "+42.000000 +/- 0.020000 time.apple.com 17.253.52.253"; exit 0;;
      *) echo "+0.004421 +/- 0.023706 time.apple.com 17.253.52.253"; exit 0;;
    esac;;
  curl) printf 'HTTP/2 200\\r\\ndate: %s\\r\\nserver: harness\\r\\n\\r\\n' "$HARNESS_HTTPDATE"; exit 0;;
  caffeinate) [ "$1" = -i ] || unexpected "$@"; shift; exec "$@";;
  node) case "$1" in
      ${GUARD}) [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the guard ran without the harness environment"
        printf 'host: harness.invalid\\nport: 5432\\nref: harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
      ${WRAP}) [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || unexpected "the program ran without the harness environment"
        all=" $* "
        case "$all" in
          *" --confirm "*) case "$all" in *" --max 5 "*) kind=wCanarySend;; *) kind=wRestSend;; esac;;
          *) case "$all" in *" --max 5 "*) kind=wCanaryDry;; *) kind="$HARNESS_DRY";; esac;;
        esac
        f="$HARNESS_FIX/$kind.out"; e=0
        if [ "$HARNESS_SWAP_KIND" = "$kind" ]; then f="$HARNESS_FIX/$HARNESS_SWAP_FILE"; e="\${HARNESS_SWAP_EXIT:-0}"; fi
        ${R("cat")} "$f"; exit "$e";;
    esac
    unexpected "$@";;
  date) case "$1" in -u) ;; -j) [ "$2" = -u ] || [ "$TZ" = Europe/Lisbon ] || unexpected "date -j without TZ=Europe/Lisbon";; *) [ "$TZ" = Europe/Lisbon ] || [ "$TZ" = America/Toronto ] || unexpected "date ran without a named zone [TZ=$TZ]";; esac
    z="$HARNESS_ZONE"
    case "$1" in
      '+%Y%m%d%H%M %u %Z') echo "$HARNESS_STAMP $HARNESS_DOW $z";;
      '+%Y-%m-%d %H:%M %Z') if [ "$TZ" = America/Toronto ]; then echo "2026-11-13 16:30 EST"; else echo "2026-11-13 21:30 $z"; fi;;
      -u) [ "$2" = '+%s' ] || unexpected "$@"; echo "$HARNESS_EPOCH";;
      -j) case "$2" in
          -u) [ "$5" = "$HARNESS_HTTPDATE" ] || { echo "date: harness: cannot parse $5" >&2; exit 1; }; echo "$HARNESS_EPOCH";;
          -v+1d) echo "$HARNESS_NEXT";;
          -f) [ "$5" = '+%u' ] || unexpected "$@"; echo "$HARNESS_RDOW";;
          *) unexpected "$@";;
        esac;;
      *) unexpected "$@";;
    esac; exit 0;;
  cut) printf '%s\\n' "$inp" | ${R("cut")} "$@"; exit $?;;
esac
exec ${R(name)} "$@"
`;
}

/** The program's real lines from a weekly sitting, with the target read as production, and the variants the scenarios swap in. */
async function fixtures() {
  const { steps } = await weeklySitting();
  const asProduction = (lines) =>
    lines
      .filter((l) => !l.startsWith("sink     "))
      .map((l) => (l === "target   NOT production (a strict local database)" ? "target   PRODUCTION" : l))
      .join("\n") + "\n";
  const f = Object.fromEntries(Object.entries(steps).map(([k, v]) => [`${k}.out`, asProduction(v)]));
  const swap = (text, from, to) => {
    assert.ok(text.includes(from), `the fixture lacks ${from}`);
    return text.replace(from, to);
  };
  f["wDryAttempted.out"] = swap(f["wDry.out"], "skipped: attempted by an earlier run, outcome unknown (marker): 0", "skipped: attempted by an earlier run, outcome unknown (marker): 1");
  f["wDryUnsettled.out"] = swap(f["wDry.out"], "marker   second pass: the first sitting is settled (no row of unknown outcome, no lock)\n", "");
  f["wDryEmpty.out"] = swap(f["wDry.out"], "appointments checked: 15; handed", "appointments checked: 0; handed");
  f["wDryG1no.out"] = swap(f["wDry.out"], "G1 UNDER THE LIMIT OF 20000: yes", "G1 UNDER THE LIMIT OF 20000: NO");
  f["wCanaryChanged.out"] = swap(f["wCanaryDry.out"], "appointments checked: 15; handed", "appointments checked: 16; handed");
  f["wCanaryFew.out"] = swap(swap(f["wCanaryDry.out"], "ELIGIBLE: 7", "ELIGIBLE: 3"), "THIS RUN: 5 of 7", "THIS RUN: 3 of 3");
  f["wCanarySend4.out"] = swap(f["wCanarySend.out"], "SENT: 5 of 5", "SENT: 4 of 5");
  f["wRestDryLow.out"] = swap(f["wRestDry.out"], "appointments checked: 20; handed", "appointments checked: 19; handed");
  f["wRestDryZero.out"] = swap(f["wRestDry.out"], "ELIGIBLE: 2", "ELIGIBLE: 0");
  f["wClosingLow.out"] = swap(f["wClosing.out"], "appointments checked: 22; handed", "appointments checked: 19; handed");
  f["refusedMarker.out"] = "FAILED: --second-pass: this operation's marker holds 1 row(s) of unknown outcome. The lead rules. Nothing was read and nothing was sent.\n";
  f["refused.out"] = "sweep    production's heartbeats: newest send, 3 minutes ago; shadow in the last 3 hours: 9; anything but shadow in the last 7 days: 1\nFAILED: the sweep's newest heartbeat is not shadow (it reads send): the sweep may be sending. This operation must not run while it is. Refusing. Nothing was sent.\n";
  return f;
}

const APPLY_FILES = [WRAP, EMIT, GUARD, PTM];

async function prepareHarness(base, docText) {
  for (const dir of ["bin", "fix", "apply/docs"]) mkdirSync(join(base, dir), { recursive: true });
  const real = Object.fromEntries([...STUBBED.filter((n) => !FAKED.has(n)), "sleep", "mkdir"].map((n) => [n, realPath(n)]));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, real));
    chmodSync(join(base, "bin", n), 0o755);
  }
  for (const [f, t] of Object.entries(await fixtures())) writeFileSync(join(base, "fix", f), t);
  writeFileSync(join(base, "fake-prod.env"), `DATABASE_URL_DIRECT=${FAKE_DB_URL}\nDATABASE_URL=${FAKE_DB_URL}\n`);
  for (const f of APPLY_FILES) {
    mkdirSync(dirname(join(base, "apply", f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(base, "apply", f));
  }
  writeFileSync(join(base, "apply", DOC), docText);
  writeFileSync(join(base, "apply", SIDECAR), `${sha256(docText)}  ${DOC}\n`);
  return sha256(docText);
}

const readyDoc = () => withFirstLine("READY: the harness's copy");

function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/r36w", join(run, "tmp/r36w"));
  const rest = out.replaceAll(join(run, "tmp/r36w"), "").replaceAll(join(run, "apply"), "").replaceAll(envFile, "");
  for (const bad of ["/tmp/r36", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return out;
}

/** GREEN's tool shape. zsh: exactly it. bash: the same, with errexit forced off, as zsh has it there. */
function shellArgs(shell, text) {
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  if (shell === "zsh") return ["zsh", ["-f", "-c", tail]];
  if (shell === "bash") return ["bash", ["--noprofile", "--norc", "-c", `set() { builtin set "$@"; builtin set +e; }; ${tail}`]];
  throw new Error(`no shell ${shell}`);
}

function runShell(shell, text, env, cwd) {
  const [cmd, args] = shellArgs(shell, text);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (out += b));
    const t = setTimeout(() => p.kill("SIGKILL"), 60000);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 128, out });
    });
  });
}

const putRecord = (tmp, name, text, minutesAgo) => {
  const f = join(tmp, name);
  writeFileSync(f, text);
  const t = new Date(Date.now() - minutesAgo * 60000);
  utimesSync(f, t, t);
};

async function runOnce(cfg, runId, fault) {
  const run = join(cfg.base, "runs", runId);
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(run, "tmp"), { recursive: true });
  if (!fault?.noApply) symlinkSync(join(cfg.base, cfg.applyDir ?? "apply"), join(run, "apply"));
  writeFileSync(join(run, "head"), `${cfg.initialHead}\n`);
  cfg.setup?.(join(run, "tmp"));
  const t0 = Date.now() - 30000;
  writeFileSync(join(run, "t0"), "");
  utimesSync(join(run, "t0"), new Date(t0), new Date(t0));
  const text = localize(cfg.block, run, fault?.noEnv ? join(run, "no-such.env") : join(cfg.base, "fake-prod.env"));
  const s = { ...(cfg.scenario ?? {}) };
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL, HARNESS_MAIN: s.main ?? FAKE_SHA.MAIN, HARNESS_MAINLINE: s.mainline ?? MAINLINE,
    HARNESS_PR: PR ?? "0", HARNESS_PRHEAD: "prhead" in s ? s.prhead : FAKE_SHA.MAIN,
    HARNESS_STAMP: s.stamp ?? "202611132130", HARNESS_DOW: s.dow ?? "5", HARNESS_ZONE: s.zone ?? "WET",
    HARNESS_RDOW: s.rdow ?? "5", HARNESS_NEXT: s.next ?? "20261114", HARNESS_EPOCH: String(HARNESS_EPOCH), HARNESS_HTTPDATE,
    HARNESS_SNTP: s.sntp ?? "", HARNESS_STRAY: s.stray ?? "", HARNESS_ANCESTOR: s.ancestor ?? "0",
    HARNESS_DRY: cfg.dry ?? "", HARNESS_SWAP_KIND: s.swapKind ?? "", HARNESS_SWAP_FILE: s.swapFile ?? "", HARNESS_SWAP_EXIT: String(s.swapExit ?? 0),
    HARNESS_FAIL: fault?.call ?? "", HARNESS_FAIL_MODE: fault?.mode ?? "",
  };
  const r = await runShell(cfg.shell, text, env, join(cfg.base, "apply"));
  const readRun = (f) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8") : "");
  const calls = readRun("log").trim().split("\n").filter(Boolean).map((l, pos) => {
    const [id, ex] = l.split("|");
    return { id, pos, exists: ex.trim() ? ex.trim().split(" ") : [], args: readRun(`args.${id}`) };
  });
  const recordsAtEnd = RECORDS.filter((m) => {
    try {
      const st = statSync(join(run, "tmp", m));
      return st.isFile() && st.mtimeMs > t0;
    } catch {
      return false;
    }
  });
  const recordText = Object.fromEntries(RECORDS.map((m) => [m, readRun(`tmp/${m}`)]));
  const result = { ...r, calls, recordsAtEnd, recordText, unexpected: readRun("unexpected"), fired: readRun("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

function describeCall(call) {
  const lines = call.args.split("\n").filter((l) => l !== "");
  const stdin = lines.filter((l) => l.startsWith("STDIN ")).map((l) => l.slice(6));
  const args = lines.filter((l) => !l.startsWith("STDIN ")).map((a) => (a.length > 70 ? `${a.slice(0, 40)}...${a.slice(-25)}` : a));
  return `${call.id.split("#")[0]} ${args.join(" ")}${stdin.length ? `  <stdin: ${stdin.join(" ").slice(0, 70)}>` : ""}`;
}

function writePoints(positive, records) {
  const wp = {};
  for (const m of records) {
    const first = positive.calls.find((c) => c.exists.includes(m));
    wp[m] = first ? first.pos - 1 : positive.calls.length;
    const send = positive.calls.filter((c) => c.id.startsWith("caffeinate#") || (c.id.startsWith("tee#") && /r36w-(canary|rest)-send\.out/.test(c.args)));
    if (m === "r36w-last-send.ok" && send.length) wp[m] = Math.min(...send.map((c) => c.pos));
  }
  return wp;
}

async function inPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const NETWORK_CALLS = Object.freeze([
  ["sntp", (a) => a[0] === "time.apple.com" && a.length === 1],
  ["curl", (a) => a[0] === "-sI" && a[1] === "--max-time" && a[2] === "8" && /^https:\/\/(api\.github\.com|www\.cloudflare\.com)$/.test(a[3] ?? "")],
  ["date", (a) => (a[0] === "-u" && a[1] === "+%s") || (a[0] === "-j" && a[1] === "-u" && a[2] === "-f" && a[3] === "%a, %d %b %Y %H:%M:%S GMT")],
  ["awk", (a) => a[0] === '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }'],
  ["awk", (a) => a[0] === "-v" && /^o=/.test(a[1] ?? "") && a[2] === "BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }"],
  ["awk", (a) => a[0] === '{ sub(/\\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }'],
  ["grep", (a) => a[0] === "-qxE" && ["[+-][0-9]+[.][0-9]+", "[1-9][0-9]{8,10} [1-9][0-9]{8,10}"].includes(a[1])],
  ["grep", (a) => a[0] === "-qxE" && (a[1] ?? "").startsWith("(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|")],
]);
const isNetworkCall = (call) => {
  const prog = call.id.split("#")[0];
  const args = call.args.split("\n").filter((l) => !l.startsWith("STDIN ")).slice(0, -1);
  return NETWORK_CALLS.some(([p, ok]) => p === prog && ok(args));
};

async function sweep(cfg) {
  const positive = await runOnce(cfg, `${cfg.id}-positive`, null);
  const posProblems = [];
  if (positive.code !== 0) posProblems.push(`exit ${positive.code}`);
  if (!positive.out.includes(SUCCESS[cfg.name])) posProblems.push("its last line is missing");
  if (!positive.out.includes("TOOL-CHAIN-CONTINUED")) posProblems.push("the tool chain did not continue");
  if (positive.unexpected) posProblems.push(`unexpected calls: ${positive.unexpected}`);
  if (/^STOP: /m.test(positive.out)) posProblems.push("a STOP line");
  if (posProblems.length) return { positive, posProblems, rows: [] };
  const wp = writePoints(positive, cfg.records);
  const faults = positive.calls.map((c) => ({ call: c.id, label: describeCall(c), pos: c.pos, at: c }));
  for (const c of positive.calls.filter((x) => x.id.startsWith("date#") || x.id.startsWith("cat#") || x.id.startsWith("cut#"))) {
    faults.push({ call: c.id, mode: "empty", label: `${describeCall(c)}: exits 0 with empty output`, pos: c.pos, at: c });
  }
  faults.push({ kind: "cd", label: "cd: the apply worktree is not there", noApply: true, pos: -1 });
  const envAt = positive.calls.find((c) => c.args.startsWith(`${GUARD}\n`));
  faults.push({ kind: "env", label: ". the env file is not there", noEnv: true, pos: envAt.pos - 1 });
  const rows = await inPool(faults, Number(process.env.HARNESS_POOL) || Math.max(2, cpus().length), async (f, i) => {
    const r = await runOnce(cfg, `${cfg.id}-f${i}`, f);
    const allowed = cfg.name === "wbys" && f.at && isNetworkCall(f.at) ? "a network-time read: a source NOT READ goes on while another was read" : null;
    const id = f.mode === "empty" ? `${f.call}:empty` : f.call ?? f.kind;
    const halted = r.code !== 0 && !r.out.includes("TOOL-CHAIN-CONTINUED");
    const problems = [];
    if (f.call && r.fired !== f.call) problems.push(`the fault at ${f.call} never fired`);
    if (r.unexpected) problems.push(`unexpected calls: ${r.unexpected.trim()}`);
    const row = { fault: f.label, call: id, halted, problems, code: r.code, out: r.out };
    if (allowed) {
      if (halted && !/^STOP: /m.test(r.out)) problems.push("it halted without a STOP line");
      return { ...row, result: halted ? `halts, as it may (${allowed})` : `continues, as it may (${allowed})` };
    }
    if (r.code === 0) problems.push("(a) exit 0");
    if (r.out.includes("TOOL-CHAIN-CONTINUED")) problems.push("(a) the tool chain continued");
    if (r.out.includes(SUCCESS[cfg.name])) problems.push("(b) printed its last line");
    for (const m of r.recordsAtEnd) if (wp[m] > f.pos) problems.push(`(c) wrote ${m}`);
    if (!/^STOP: /m.test(r.out)) problems.push("no STOP line");
    const stop = (r.out.match(/^STOP: .*$/m) ?? [""])[0];
    return { ...row, result: halted ? `halts, exit ${r.code}: ${stop.slice(0, 100)}` : `DOES NOT HALT, exit ${r.code}` };
  });
  return { positive, posProblems, rows };
}

const NIGHT_REC = "20261113 20261114\n";
const SETUPS = {
  wbys: (tmp) => {
    for (const m of RECORDS) putRecord(tmp, m, "stale\n", 600);
  },
  wcanary: (tmp) => {
    putRecord(tmp, "r36w-head.sha", `${FAKE_SHA.MAIN}\n`, 5);
    putRecord(tmp, "r36w-night.ok", NIGHT_REC, 5);
    putRecord(tmp, "r36w-main.sha", `${MAINLINE}\n`, 5);
    putRecord(tmp, "r36w-stale.ok", "no\n", 5);
    putRecord(tmp, "r36w-priork.ok", "15\n", 5);
  },
  wrest: (tmp) => {
    putRecord(tmp, "r36w-head.sha", `${FAKE_SHA.MAIN}\n`, 30);
    putRecord(tmp, "r36w-night.ok", NIGHT_REC, 30);
    putRecord(tmp, "r36w-main.sha", `${MAINLINE}\n`, 30);
    putRecord(tmp, "r36w-stale.ok", "no\n", 30);
    putRecord(tmp, "r36w-priork.ok", "15\n", 30);
    putRecord(tmp, "r36w-canary.ok", "", 20);
    putRecord(tmp, "r36w-last-send.ok", "", 20);
  },
  wclosing: (tmp) => {
    putRecord(tmp, "r36w-head.sha", `${FAKE_SHA.MAIN}\n`, 60);
    putRecord(tmp, "r36w-night.ok", NIGHT_REC, 60);
    putRecord(tmp, "r36w-main.sha", `${MAINLINE}\n`, 60);
    putRecord(tmp, "r36w-stale.ok", "no\n", 60);
    putRecord(tmp, "r36w-priork.ok", "15\n", 60);
    putRecord(tmp, "r36w-canary.ok", "", 50);
    putRecord(tmp, "r36w-last-send.ok", "", 20);
  },
};
const DRY_OF = { wbys: "wDry", wcanary: "", wrest: "wRestDry", wclosing: "wClosing" };
const RECORDS_OF = {
  wbys: ["r36w-head.sha", "r36w-night.ok", "r36w-main.sha", "r36w-stale.ok", "r36w-priork.ok"],
  wcanary: ["r36w-last-send.ok", "r36w-canary.ok"],
  wrest: ["r36w-last-send.ok"],
  wclosing: [],
};

/** WEEKLY, BEFORE YOU START as GREEN's dispatch fills it. */
const fillDispatch = (block, v) => {
  const out = block
    .replace("HELD='PENDING: set at the READY line'", `HELD=${v.HELD}`)
    .replace("DOCSHA='PENDING: set at the READY line'", `DOCSHA=${v.DOCSHA}`)
    .replace("RUNDAY='PENDING: the Lisbon date of the night the dispatch names, one of NIGHTS, YYYYMMDD'", `RUNDAY=${v.RUNDAY}`)
    .replace("STALEPATH='PENDING: no, or yes only on the ruling of Q-R36-F6'", `STALEPATH=${v.STALEPATH ?? "no"}`)
    .replace("LASTOK='PENDING: yes only when GREEN reported the last sitting ended clean, as the dispatch names it'", `LASTOK=${v.LASTOK ?? "yes"}`)
    .replace("PRIORK='PENDING: the count of appointments sent that the last closing line printed'", `PRIORK=${v.PRIORK ?? "15"}`);
  assert.ok(!/^[A-Z]+='PENDING/m.test(out), "a PENDING line was not filled");
  return out;
};

function harnessConfig(name, shell, base, docSha, opts = {}) {
  const raw = blockOf(name);
  const filled = name === "wbys" && !opts.raw;
  const block = filled ? fillDispatch(raw, { HELD: opts.held ?? FAKE_SHA.MAIN, DOCSHA: docSha, RUNDAY: opts.runday ?? "20261113", STALEPATH: opts.stalepath, LASTOK: opts.lastok, PRIORK: opts.priork }) : raw;
  return {
    id: `${shell}-${name}${opts.tag ? `-${opts.tag}` : ""}`, name, shell, base, block, dry: DRY_OF[name], records: RECORDS_OF[name],
    initialHead: opts.initialHead ?? (name === "wbys" ? FAKE_SHA.BEFORE : FAKE_SHA.MAIN), setup: opts.setup ?? SETUPS[name], scenario: opts.scenario, applyDir: opts.applyDir,
  };
}

function zshOrSkip(t) {
  if (hasShell("zsh")) return true;
  if (process.env.GITHUB_ACTIONS === "true") {
    t.skip("zsh is not on the CI runner (ubuntu-latest); the bash arm ran here instead");
    return false;
  }
  assert.fail("zsh is not on this machine, and the zsh arm of the fault-injection harness must run wherever it is not the GitHub runner");
}
const shellsHere = () => ["bash", ...(hasShell("zsh") ? ["zsh"] : [])];

async function sweepAll(t, shell) {
  const base = mkdtempSync(join(tmpdir(), `fault-r36w-${shell}-`));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    const bad = [];
    let faults = 0;
    for (const name of NAMES) {
      const r = await sweep(harnessConfig(name, shell, base, docSha));
      assert.deepEqual(r.posProblems, [], `${shell} ${name}: the positive control did not reach its last line\n${r.positive.out.slice(-3000)}`);
      assert.ok(r.rows.length > r.positive.calls.length, `${shell} ${name}: ${r.rows.length} faults`);
      const halts = r.rows.filter((x) => x.halted).length;
      faults += r.rows.length;
      t.diagnostic(`${shell} ${name}: positive reaches its last line; ${r.rows.length} faults, ${halts} halt, ${r.rows.length - halts} allowed to continue`);
      for (const row of r.rows) {
        if (process.env.FAULT_TABLE === "1") t.diagnostic(`  ${name} | ${row.call} | ${row.fault.slice(0, 110)} | ${row.result}`);
        if (row.problems.length) bad.push(`${shell} ${name} ${row.call} [${row.fault}]: ${row.problems.join("; ")}\n${row.out.slice(-700)}`);
      }
    }
    assert.deepEqual(bad, [], `fault rows that broke a rule:\n${bad.join("\n")}`);
    t.diagnostic(`${shell}: ${faults} faults across the four blocks`);
    assert.ok(faults >= 250, `only ${faults} faults across the four blocks`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("THE HARNESS IS ITS OWN CONTROL: in the tool's shape set -e stops nothing, and the stub of a failing call is what stops a block", async () => {
  for (const shell of shellsHere()) {
    const [cmd, args] = shellArgs(shell, "( set -eo pipefail; false; echo after-false; false | cat || echo pipefail-holds )");
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    assert.equal(r.status, 0, `${shell}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /after-false\npipefail-holds\nTOOL-CHAIN-CONTINUED/, shell);
  }
  const base = mkdtempSync(join(tmpdir(), "fault-r36w-control-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    for (const shell of shellsHere()) {
      const cfg = harnessConfig("wclosing", shell, base, docSha);
      const stripped = { ...cfg, id: `${shell}-stripped`, block: cfg.block.replace(/ \|\| \{ echo "STOP: the target guard refused[^\n]*\}/, "") };
      const positive = await runOnce(stripped, `${shell}-stripped-positive`, null);
      assert.equal(positive.code, 0, positive.out.slice(-1500));
      const guardCall = positive.calls.find((c) => c.args.startsWith(`${GUARD}\n`));
      const r = await runOnce(stripped, `${shell}-stripped-fault`, { call: guardCall.id });
      assert.equal(r.fired, guardCall.id);
      assert.ok(r.out.includes("TOOL-CHAIN-CONTINUED") || !/STOP: the target guard refused/.test(r.out), `${shell}: the stripped guard still stopped the block`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the positive controls: the program's calls carry exactly the arguments the blocks name, the held head is read from refs/pull, and the records chain", async () => {
  const base = mkdtempSync(join(tmpdir(), "fault-r36w-args-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    const W = [OWNER_FLAG, STALE_FLAG, "no"];
    const want = {
      wbys: [[WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", ...W, "--second-pass"]],
      wcanary: [
        [WRAP, "--tenant-slug", "osteojp", "--min-days-ahead", "3", "--max-days-ahead", "28", "--max", "5", ...W],
        [WRAP, "--tenant-slug", "osteojp", "--min-days-ahead", "3", "--max-days-ahead", "28", "--max", "5", ...W, "--confirm", "--expect", "7", "--fix-deployed-sha", FIXSHA, "--i-checked-inngest-settings"],
      ],
      wrest: [
        [WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", ...W],
        [WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", ...W, "--confirm", "--expect", "2", "--fix-deployed-sha", FIXSHA, "--i-checked-inngest-settings"],
      ],
      wclosing: [[WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", ...W]],
    };
    for (const name of NAMES) {
      const r = await runOnce(harnessConfig(name, "bash", base, docSha), `args-${name}`, null);
      assert.equal(r.code, 0, `${name}\n${r.out.slice(-1500)}`);
      const calls = r.calls.filter((c) => c.id.startsWith("node#") && c.args.startsWith(`${WRAP}\n`)).map((c) => c.args.trim().split("\n"));
      assert.deepEqual(calls, want[name], name);
      assert.equal(r.calls.filter((c) => c.id.startsWith("caffeinate#")).length, name === "wcanary" || name === "wrest" ? 1 : 0, name);
      if (name === "wbys") {
        const git = r.calls.filter((c) => c.id.startsWith("git#")).map((c) => c.args.trim().split("\n").join(" "));
        assert.deepEqual(git.slice(0, 4), ["fetch origin --prune", `ls-remote origin refs/pull/${PR}/head`, `fetch -q origin refs/pull/${PR}/head`, "rev-parse FETCH_HEAD"]);
        assert.ok(!git.some((g) => /data\/R36|origin\/data/.test(g)), "it read a branch by name");
        assert.deepEqual(r.recordText, { ...r.recordText, "r36w-head.sha": `${FAKE_SHA.MAIN}\n`, "r36w-night.ok": NIGHT_REC, "r36w-main.sha": `${MAINLINE}\n`, "r36w-stale.ok": "no\n", "r36w-priork.ok": "15\n" });
        assert.match(r.out, /^WEEKLY, BEFORE YOU START: every check passed\. ELIGIBLE 7 at this read\. THE WEEKLY CANARY next\.$/m);
        assert.match(r.out, /^the marker: {4}the earlier sittings sent 15 appointments, as the last closing line printed;/m);
      }
      if (name === "wcanary") assert.match(r.out, /^WEEKLY CANARY SENT: 5 of 5, G4 yes, G3 0\. The marker now holds 20 appointments this operation sent \(15 before this sitting, 5 in the canary\)\./m);
      if (name === "wrest") assert.match(r.out, /^WEEKLY REST: this run ended clean\. The marker now holds 22 appointments this operation sent \(20 before this run, 2 in it\)\./m);
      if (name === "wclosing") {
        assert.match(r.out, /^WEEKLY CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0 for the 22 appointments this operation sent, 7 of them in this sitting\. The sends of the sitting are over\. The next weekly dispatch's PRIORK is 22\.$/m);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/** Scenarios: each must STOP with its sentence, without its last line; a few end clean on another path. */
const SCENARIOS = [
  { name: "wbys", tag: "unfilled", raw: true, stop: /^STOP: HELD is not a filled-in sha, so this block is NOT READY/m },
  { name: "wbys", tag: "runday-not-ruled", runday: "20261127", scenario: { stamp: "202611272130", next: "20261128" }, stop: /^STOP: RUNDAY 20261127 is not a weekly night strategy has ruled \(this document lists 20261113\|20261120\)/m },
  { name: "wbys", tag: "runday-migration-night", runday: "20261112", scenario: { rdow: "4" }, stop: /^STOP: RUNDAY 20261112 is not a weekly night strategy has ruled/m },
  { name: "wbys", tag: "lastok-no", lastok: "no", stop: /^STOP: LASTOK is not yes/m },
  { name: "wbys", tag: "priork-unfilled", priork: "x", stop: /^STOP: PRIORK is still PENDING, or is not a whole number above 0/m },
  { name: "wbys", tag: "priork-low", priork: "4", stop: /^STOP: PRIORK is 4, fewer than a canary's five/m },
  { name: "wbys", tag: "stalepath-bad", stalepath: "maybe", stop: /^STOP: STALEPATH is still PENDING, or is not no or yes/m },
  { name: "wbys", tag: "open-hours", scenario: { stamp: "202611132059", dow: "5" }, stop: /^STOP: Lisbon 202611132059 is inside clinic hours/m },
  { name: "wbys", tag: "saturday-0630", scenario: { stamp: "202611140630", dow: "6" }, stop: /^STOP: Lisbon 202611140630 is outside the window of the night/m },
  { name: "wbys", tag: "saturday-0800", scenario: { stamp: "202611140800", dow: "6" }, stop: /^STOP: Lisbon 202611140800 is inside clinic hours/m },
  { name: "wbys", tag: "thursday-night", scenario: { stamp: "202611122130", dow: "4" }, stop: /^STOP: Lisbon 202611122130 is outside the window of the night/m },
  { name: "wbys", tag: "runday-saturday", scenario: { rdow: "6" }, stop: /^STOP: RUNDAY 20261113 is not a Monday to Friday/m },
  { name: "wbys", tag: "zone", scenario: { zone: "UTC" }, stop: /^STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST/m },
  { name: "wbys", tag: "clock-far", scenario: { sntp: "far" }, stop: /^STOP: the machine's clock disagrees with network time/m },
  { name: "wbys", tag: "pr-moved", scenario: { prhead: FAKE_SHA.OTHER }, stop: /^STOP: the head of pull request \d+ is not the commit this block names/m },
  { name: "wbys", tag: "pr-missing", scenario: { prhead: "" }, stop: /^STOP: the head of pull request \d+ did not read as a full 40-character sha \[\]/m },
  { name: "wbys", tag: "fetched-other", scenario: { main: FAKE_SHA.OTHER }, stop: /^STOP: the fetched head is not the commit this block names/m },
  { name: "wbys", tag: "stray", scenario: { stray: " M x" }, stop: /^STOP: the apply worktree is not clean/m },
  { name: "wbys", tag: "no-fix", scenario: { ancestor: "1" }, stop: /^STOP: the reminder fix of 2026-10-07/m },
  { name: "wbys", tag: "marker-refused", scenario: { swapKind: "wDry", swapFile: "refusedMarker.out", swapExit: 1 }, stop: /^STOP: the dry run failed or was refused; its lines are above\. A refusal that names the marker/m },
  { name: "wbys", tag: "sweep-refused", scenario: { swapKind: "wDry", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the dry run failed or was refused/m },
  { name: "wbys", tag: "unsettled", scenario: { swapKind: "wDry", swapFile: "wDryUnsettled.out" }, stop: /^STOP: the dry run does not show that this operation's marker is settled/m },
  { name: "wbys", tag: "attempted", scenario: { swapKind: "wDry", swapFile: "wDryAttempted.out" }, stop: /^STOP: this operation's marker holds attempted rows/m },
  { name: "wbys", tag: "marker-empty", scenario: { swapKind: "wDry", swapFile: "wDryEmpty.out" }, stop: /^STOP: the number of appointments checked did not read as a whole number above 0 \[0\]: this operation's marker is empty/m },
  { name: "wbys", tag: "priork-mismatch", priork: "14", stop: /^STOP: this operation's marker holds 15 sent appointments, not the 14 the last sitting's closing line printed/m },
  { name: "wbys", tag: "priork-larger", priork: "16", stop: /^STOP: this operation's marker holds 15 sent appointments, not the 16/m },
  { name: "wbys", tag: "g1-no", scenario: { swapKind: "wDry", swapFile: "wDryG1no.out" }, stop: /^STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes/m },
  { name: "wcanary", tag: "twice", setup: (tmp) => { SETUPS.wcanary(tmp); putRecord(tmp, "r36w-canary.ok", "", 3); }, stop: /^STOP: the weekly canary already ran in this sitting/m },
  { name: "wcanary", tag: "no-head", setup: (tmp) => putRecord(tmp, "r36w-night.ok", NIGHT_REC, 5), stop: /^STOP: WEEKLY, BEFORE YOU START recorded no head/m },
  { name: "wcanary", tag: "head-moved", setup: (tmp) => { SETUPS.wcanary(tmp); putRecord(tmp, "r36w-head.sha", `${FAKE_SHA.OTHER}\n`, 5); }, stop: /^STOP: the apply worktree is not on the head WEEKLY, BEFORE YOU START recorded/m },
  { name: "wcanary", tag: "night-not-ruled", setup: (tmp) => { SETUPS.wcanary(tmp); putRecord(tmp, "r36w-night.ok", "20261106 20261107\n", 5); }, stop: /^STOP: the recorded night 20261106 is not a weekly night strategy has ruled/m },
  { name: "wcanary", tag: "night-1127-not-ruled", scenario: { stamp: "202611272130", dow: "5" }, setup: (tmp) => { SETUPS.wcanary(tmp); putRecord(tmp, "r36w-night.ok", "20261127 20261128\n", 5); }, stop: /^STOP: the recorded night 20261127 is not a weekly night strategy has ruled \(this document lists 20261113\|20261120\)/m },
  { name: "wrest", tag: "night-1127-not-ruled", scenario: { stamp: "202611272130", dow: "5" }, setup: (tmp) => { SETUPS.wrest(tmp); putRecord(tmp, "r36w-night.ok", "20261127 20261128\n", 30); }, stop: /^STOP: the recorded night 20261127 is not a weekly night strategy has ruled/m },
  { name: "wclosing", tag: "night-1127-not-ruled", scenario: { stamp: "202611272130", dow: "5" }, setup: (tmp) => { SETUPS.wclosing(tmp); putRecord(tmp, "r36w-night.ok", "20261127 20261128\n", 60); }, stop: /^STOP: the recorded night 20261127 is not a weekly night strategy has ruled/m },
  { name: "wcanary", tag: "outside-window", scenario: { stamp: "202611140700", dow: "6" }, stop: /^STOP: Lisbon 202611140700 is outside the night WEEKLY, BEFORE YOU START recorded/m },
  { name: "wcanary", tag: "no-priork", setup: (tmp) => { SETUPS.wcanary(tmp); rmSync(join(tmp, "r36w-priork.ok")); }, stop: /^STOP: WEEKLY, BEFORE YOU START recorded no PRIORK in this sitting/m },
  { name: "wcanary", tag: "marker-changed", scenario: { swapKind: "wCanaryDry", swapFile: "wCanaryChanged.out" }, stop: /^STOP: this operation's marker holds 16 sent appointments, not the 15 WEEKLY, BEFORE YOU START found/m },
  { name: "wcanary", tag: "few", scenario: { swapKind: "wCanaryDry", swapFile: "wCanaryFew.out" }, stop: /^STOP: the canary's dry run found 3 eligible appointments/m },
  { name: "wcanary", tag: "sent-4", scenario: { swapKind: "wCanarySend", swapFile: "wCanarySend4.out" }, stop: /^STOP: the canary does not show SENT: 5 of 5/m, wrote: ["r36w-last-send.ok"] },
  { name: "wcanary", tag: "send-refused", scenario: { swapKind: "wCanarySend", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the canary failed or was refused/m, wrote: ["r36w-last-send.ok"] },
  { name: "wcanary", tag: "main-moved", scenario: { mainline: "5".repeat(40) }, stop: /^STOP: main moved during the sitting/m },
  { name: "wcanary", tag: "no-stale-record", setup: (tmp) => { SETUPS.wcanary(tmp); rmSync(join(tmp, "r36w-stale.ok")); }, stop: /^STOP: WEEKLY, BEFORE YOU START recorded no STALEPATH in this sitting/m },
  { name: "wrest", tag: "main-moved", scenario: { mainline: "5".repeat(40) }, stop: /^STOP: main moved during the sitting/m },
  { name: "wrest", tag: "no-canary", setup: (tmp) => SETUPS.wcanary(tmp), stop: /^STOP: the weekly canary has not run in this sitting, so THE WEEKLY REST does not run/m },
  { name: "wrest", tag: "marker-low", scenario: { swapKind: "wRestDry", swapFile: "wRestDryLow.out" }, stop: /^STOP: G3 checked 19 appointments, fewer than the 20 the earlier sittings and this canary sent \(PRIORK 15 plus 5\)/m },
  { name: "wrest", tag: "priork-bad", setup: (tmp) => { SETUPS.wrest(tmp); putRecord(tmp, "r36w-priork.ok", "fifteen\n", 30); }, stop: /^STOP: the recorded PRIORK did not read as a whole number above 0/m },
  { name: "wrest", tag: "send-refused", scenario: { swapKind: "wRestSend", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the run failed or was refused/m, wrote: ["r36w-last-send.ok"] },
  { name: "wrest", tag: "nothing-left", scenario: { swapKind: "wRestDry", swapFile: "wRestDryZero.out" }, clean: /^WEEKLY REST: ELIGIBLE 0 at this read, so nothing is left to send/m },
  { name: "wclosing", tag: "too-soon", setup: (tmp) => { SETUPS.wclosing(tmp); putRecord(tmp, "r36w-last-send.ok", "", 5); }, stop: /^STOP: the last send returned less than 12 minutes ago/m },
  { name: "wclosing", tag: "not-done", scenario: { swapKind: "wClosing", swapFile: "wRestDry.out" }, stop: /^STOP: the closing dry run does not read ELIGIBLE: 0/m },
  { name: "wclosing", tag: "marker-low", scenario: { swapKind: "wClosing", swapFile: "wClosingLow.out" }, stop: /^STOP: G3 checked 19 appointments, fewer than the 20/m },
  { name: "wclosing", tag: "refused", scenario: { swapKind: "wClosing", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the closing dry run failed or was refused/m },
  { name: "wclosing", tag: "no-canary", setup: (tmp) => { SETUPS.wclosing(tmp); rmSync(join(tmp, "r36w-canary.ok")); }, stop: /^STOP: the weekly canary has not run in this sitting/m },
];

test("every scenario stops its block with its own sentence, or ends clean on the path it names", async () => {
  const base = mkdtempSync(join(tmpdir(), "fault-r36w-scenarios-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    const notReady = join(base, "apply-not-ready");
    mkdirSync(join(notReady, "docs"), { recursive: true });
    for (const f of APPLY_FILES) {
      mkdirSync(dirname(join(notReady, f)), { recursive: true });
      copyFileSync(join(ROOT, f), join(notReady, f));
    }
    const notReadyDoc = withFirstLine("NOT READY: the harness's copy");
    writeFileSync(join(notReady, DOC), notReadyDoc);
    writeFileSync(join(notReady, SIDECAR), `${sha256(notReadyDoc)}  ${DOC}\n`);
    const all = [...SCENARIOS, { name: "wbys", tag: "doc-not-ready", applyDir: "apply-not-ready", docSha: sha256(notReadyDoc), stop: /^STOP: the document's first line at the held head still reads NOT READY/m }];
    for (const shell of shellsHere()) {
      for (const sc of all) {
        const cfg = harnessConfig(sc.name, shell, base, sc.docSha ?? docSha, sc);
        const r = await runOnce(cfg, `${shell}-${sc.name}-${sc.tag}`, null);
        const label = `${shell} ${sc.name} ${sc.tag}`;
        assert.equal(r.unexpected, "", `${label}: unexpected calls ${r.unexpected}`);
        assert.ok(!r.out.includes(SUCCESS[sc.name]), `${label}: printed its last line`);
        if (sc.clean) {
          assert.equal(r.code, 0, `${label}\n${r.out.slice(-1500)}`);
          assert.match(r.out, sc.clean, label);
          assert.ok(r.out.includes("TOOL-CHAIN-CONTINUED"), label);
          assert.deepEqual(r.calls.filter((c) => c.id.startsWith("caffeinate#")), [], `${label}: something was sent`);
          assert.deepEqual(r.recordsAtEnd, [], `${label}: a record was written`);
          continue;
        }
        assert.notEqual(r.code, 0, `${label}: exit 0\n${r.out.slice(-1500)}`);
        assert.ok(!r.out.includes("TOOL-CHAIN-CONTINUED"), `${label}: the tool chain continued`);
        assert.match(r.out, sc.stop, `${label}\n${r.out.slice(-1500)}`);
        assert.deepEqual(r.recordsAtEnd, sc.wrote ?? [], `${label}: records written`);
        if (sc.raw) assert.deepEqual(r.calls.map((c) => c.id.split("#")[0]), ["grep"], `${label}: it ran more than the first check`);
        if (!sc.wrote) assert.deepEqual(r.calls.filter((c) => c.id.startsWith("caffeinate#")), [], `${label}: something was sent`);
        if (sc.tag === "main-moved") {
          assert.deepEqual(r.calls.filter((c) => c.id.startsWith("node#") && c.args.startsWith(`${WRAP}\n`)), [], `${label}: the program ran after main moved`);
        }
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the window edges of a Friday night: 21:00 Friday and 06:29 Saturday pass WEEKLY, BEFORE YOU START", async () => {
  const base = mkdtempSync(join(tmpdir(), "fault-r36w-edges-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    for (const shell of shellsHere()) {
      for (const [stamp, dow] of [["202611132100", "5"], ["202611140629", "6"]]) {
        const r = await runOnce(harnessConfig("wbys", shell, base, docSha, { tag: stamp, scenario: { stamp, dow } }), `${shell}-edge-${stamp}`, null);
        assert.equal(r.code, 0, `${shell} ${stamp}\n${r.out.slice(-1500)}`);
        assert.ok(r.out.includes(SUCCESS.wbys), `${shell} ${stamp}`);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the second ruled night: a Friday 11-20 run window passes all four blocks, and 11-13 still passes, in every shell here", async () => {
  const base = mkdtempSync(join(tmpdir(), "fault-r36w-1120-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    const NIGHT_1120 = "20261120 20261121\n";
    const ages = { wcanary: 5, wrest: 30, wclosing: 60 };
    for (const shell of shellsHere()) {
      for (const [stamp, dow] of [["202611202100", "5"], ["202611202130", "5"], ["202611210629", "6"]]) {
        const sc = { stamp, dow, next: "20261121" };
        const w = await runOnce(harnessConfig("wbys", shell, base, docSha, { tag: `1120-${stamp}`, runday: "20261120", scenario: sc }), `${shell}-1120-wbys-${stamp}`, null);
        assert.equal(w.code, 0, `${shell} wbys ${stamp}\n${w.out.slice(-1500)}`);
        assert.ok(w.out.includes(SUCCESS.wbys), `${shell} wbys ${stamp}`);
        assert.match(w.out, /^the night: {5}RUNDAY 20261120, weekday 5, a ruled weekly night; the window runs from 20261120 21:00 to 20261121 06:29, Lisbon;.* inside: yes$/m);
        assert.equal(w.recordText["r36w-night.ok"], NIGHT_1120, `${shell} wbys ${stamp}: the night recorded`);
        for (const name of ["wcanary", "wrest", "wclosing"]) {
          const setup = (tmp) => { SETUPS[name](tmp); putRecord(tmp, "r36w-night.ok", NIGHT_1120, ages[name]); };
          const r = await runOnce(harnessConfig(name, shell, base, docSha, { tag: `1120-${stamp}`, setup, scenario: sc }), `${shell}-1120-${name}-${stamp}`, null);
          assert.equal(r.code, 0, `${shell} ${name} ${stamp}\n${r.out.slice(-1500)}`);
          assert.ok(r.out.includes(SUCCESS[name]), `${shell} ${name} ${stamp}`);
          assert.match(r.out, /the night recorded: 20261120 21:00 to 20261121 06:29; inside: yes$/m, `${shell} ${name} ${stamp}`);
        }
      }
      // 11-13 still passes, by the default scenario (Friday 11-13 21:30).
      const w13 = await runOnce(harnessConfig("wbys", shell, base, docSha, { tag: "1113" }), `${shell}-1113-wbys`, null);
      assert.equal(w13.code, 0, `${shell} wbys 1113\n${w13.out.slice(-1500)}`);
      assert.equal(w13.recordText["r36w-night.ok"], NIGHT_REC);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("EVERY HALT IS EXPLICIT, by fault injection, in bash: each external call of each block made to fail in turn", async (t) => {
  await sweepAll(t, "bash");
});

test("EVERY HALT IS EXPLICIT, by fault injection, in zsh: each external call of each block made to fail in turn", async (t) => {
  if (!zshOrSkip(t)) return;
  await sweepAll(t, "zsh");
});

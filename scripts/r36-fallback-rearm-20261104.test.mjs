// R36: docs/data-op-r36-fallback-rearm-20261104.md, the fallback re-arm of Wednesday 2026-11-04.
//
// WHAT THIS PROVES, statically and with every external program a stub, with no database:
//   * the document's first line is NOT READY until SOLO's READY line, and its sidecar pins it;
//   * it has exactly four blocks (BEFORE YOU START, THE CANARY, THE REST, THE CLOSING DRY RUN);
//     each parses under bash -n and zsh -n; no `#` line, no `!` but `test !`, no backslash
//     continuation, no `set -e`: line 2 is `set -o pipefail`, and the only other `set` loads the
//     environment file;
//   * EVERY HALT IS EXPLICIT: every command a later step relies on carries its own STOP;
//   * every pin in every block is the real file's sha256 on this tree, and FIXSHA is the reminder
//     fix of 2026-10-07 the 2026-10-12 document names;
//   * the program is run with exactly the reviewed arguments: --tenant-slug osteojp,
//     --max-days-ahead 28 and the owner's word on every call; --confirm only in THE CANARY and
//     THE REST, only under caffeinate -i, only with --expect, --fix-deployed-sha and
//     --i-checked-inngest-settings; never --sink-file and never --resend-attempted;
//   * no block prints, echoes or tests an environment variable (R42), and every clock read names
//     its zone and is checked;
//   * the dates the document states are the arithmetic of the 2026-10-12 record and the code;
//   * THE FAULT INJECTION: each block runs in GREEN's tool shape (`true && eval '<block>' ...`), in
//     bash with errexit forced off and in zsh, against the program's REAL output (the lines of a
//     whole sitting run in-process through the 2026-10-12 program's run(), see
//     scripts/r36-fallback-rearm-sitting.mjs). Its positive control reaches its last line; each
//     external call made to fail in turn, and each scenario below, stops it with a STOP line,
//     without its last line and without a record written past the fault. HARNESS_POOL caps the
//     parallel runs; FAULT_TABLE=1 prints every row.
// WHAT IT DOES NOT PROVE: anything on a database or on production. See the document, "Rehearsal".
//
// Run: pnpm test:scripts

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HORIZON_DAYS, OWNER_FLAG, SWEEP_OK_LINE } from "../packages/db/scripts/r36-fallback-rearm-emit.mjs";
import { wholeSitting } from "./r36-fallback-rearm-sitting.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC = "docs/data-op-r36-fallback-rearm-20261104.md";
const SIDECAR = "docs/data-op-r36-fallback-rearm-20261104.sha256";
const WRAP = "packages/db/scripts/r36-fallback-rearm-emit.mjs";
const EMIT = "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";
const GUARD = "scripts/assert-production-target.mjs";
const PTM = "scripts/production-target.mjs";
const BRANCH = "origin/data/R36-fallback-rearm-20261104";
const FIXSHA = "20a6d73151468d36c080bcfd6cfad528d3a69d2d";
const doc = read(DOC);

/** The fenced blocks GREEN pastes: fences whose opening line is exactly three backticks. A fence naming a language is prose. */
export function blocksOf(md) {
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
  bys: "BEFORE YOU START: every check passed.",
  canary: "CANARY SENT: 5 of 5, G4 yes, G3 0.",
  rest: "THE REST: this run ended clean.",
  closing: "CLOSING DRY RUN: ELIGIBLE 0, and G3 reads 0",
});
const NAMES = Object.keys(SUCCESS);
export const blockOf = (name) => {
  const hits = blocksOf(doc).filter((b) => b.includes(`echo "${SUCCESS[name]}`));
  if (hits.length !== 1) throw new Error(`expected exactly one block for ${name}, found ${hits.length}`);
  return hits[0];
};

/* ---- the document, statically ----------------------------------------------------------------- */

test("the first line is NOT READY until the READY line, and the sidecar pins the document", () => {
  assert.equal(doc.split("\n")[0], "NOT READY: awaiting R4 review");
  assert.equal(read(SIDECAR), `${sha256(doc)}  ${DOC}\n`);
});

test("no em dash in the document, its program, its tests or the shared sitting", () => {
  const dash = String.fromCharCode(0x2014);
  for (const f of [DOC, WRAP, "scripts/r36-fallback-rearm-20261104.test.mjs", "scripts/r36-fallback-rearm-emit.test.mjs", "scripts/r36-fallback-rearm-sitting.mjs"]) {
    assert.ok(!read(f).includes(dash), `${f} carries an em dash`);
  }
});

test("the document carries the sections the ruling asks for", () => {
  assert.match(doc, /^## What breaks on Friday 11-06 if neither the switch nor this fallback happens$/m);
  assert.match(doc, /^### In plain words$/m);
  assert.match(doc, /^### The predicate$/m);
  assert.match(doc, /^### The first affected dates$/m);
  assert.match(doc, /^## This op must NOT run if the sweep is in send mode$/m);
  assert.ok(doc.indexOf("### In plain words") < doc.indexOf("### The predicate"), "plain words come first");
  assert.match(doc, /^## The horizon: 28 days, and why$/m);
  assert.match(doc, /\*\*NOT REHEARSED\. Nothing in this document has run against any database\.\*\*/);
  assert.match(doc, /A script's own REFUSE or STOP line is a halt, the same as a harness refusal\. Never edit an env file, a URL, a flag, a label or a script to get past a guard\. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so\./);
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

export function blockHazards(block) {
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
const SEND_HALT = /\|\| \{ touch \/tmp\/r36-last-send\.ok \|\| \{ echo "STOP: [^"]+"; exit 1; \}; echo "STOP: [^"]+"; exit 1; \}$/;
const STRAY_HALT = /\|\| \{ echo "STOP: [^"]+"; echo "\$\{STRAY\}"; exit 1; \}$/;
/** A command a later step relies on: its failure must halt the block by an explicit guard. */
const MUST_HALT = [
  /^cd /, /\bgit /, /^rm /, /^touch /, /\| tee /, /\bnode /, /^set -o allexport/, /^shasum /,
  /^(REC|HD|STRAY|TIP|DOC|TOP|SIDE|SW|SE|SG|SM|NOW|RDOW|NIGHT|EC|N|K|G3L|G4L|SL|RECENT|BEGAN|BEGANT)=\$\(/, /^NEXTDAY=\$\(TZ=/,
  /^test /, /^\[ /, /^grep /, /^echo "[^"]*" \| grep /, /^echo .* > \/tmp\//,
];
export function unguardedLines(block) {
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
    for (const line of lines) if (line.includes('echo "STOP: ')) assert.match(line, /exit 1; \}$/, line.slice(0, 120));
  }
  for (const planted of ["git fetch origin --prune", "node x.mjs | tee /tmp/r36-x.out", "TIP=$(git rev-parse x)", "test -f /tmp/r36-head.sha", "[ a = b ]", "grep -qxF x /tmp/r36-x.out", 'echo "${TIP}" > /tmp/r36-head.sha', "touch /tmp/r36-canary.ok", "shasum -a 256 -c x"]) {
    assert.equal(unguardedLines(planted).length, 1, planted);
  }
});

test("every pin is the real file's sha256 on this tree, and FIXSHA is the reminder fix the 2026-10-12 document names", () => {
  const want = { SHAWRAP: sha256(read(WRAP)), SHAEMIT: sha256(read(EMIT)), SHAGUARD: sha256(read(GUARD)), SHAPTM: sha256(read(PTM)) };
  for (const b of blocksOf(doc)) {
    for (const [k, v] of Object.entries(want)) assert.match(b, new RegExp(`^${k}=${v}$`, "m"), `${k} in ${b.slice(0, 60)}`);
    assert.match(b, new RegExp(`^FIXSHA=${FIXSHA}$`, "m"));
  }
  assert.match(read("docs/data-op-inc-1007-rearm-reminders.md"), /PR #1562, on `main` as `20a6d731`/);
  assert.ok(FIXSHA.startsWith("20a6d731"));
  for (const [k, v] of Object.entries(want)) if (k !== "SHAWRAP") assert.ok(doc.includes(v), `${k} not in the document`);
});

test("PENDING lines: only BEFORE YOU START carries them, exactly HELD, DOCSHA and RUNDAY", () => {
  const pend = (b) => b.split("\n").filter((l) => l.includes("PENDING")).map((l) => l.split("=")[0]);
  assert.deepEqual(pend(blockOf("bys")).filter((x) => /^[A-Z]+$/.test(x)), ["HELD", "DOCSHA", "RUNDAY"]);
  for (const name of ["canary", "rest", "closing"]) assert.deepEqual(pend(blockOf(name)), [], name);
});

/** The program's invocations of a block, each as its argument list after the program's path. */
const wrapCalls = (block) =>
  block.split("\n").filter((l) => /^(caffeinate -i )?node \$\{WRAP\} /.test(l)).map((l) => {
    const m = /^(caffeinate -i )?node \$\{WRAP\} (.*?) 2>&1 \| tee /.exec(l);
    assert.ok(m, `an unexpected way to run the program: ${l.slice(0, 100)}`);
    return { caffeinate: Boolean(m[1]), args: m[2] };
  });

test("the program runs with exactly the reviewed arguments, and sends only in THE CANARY and THE REST", () => {
  const base = `--tenant-slug osteojp --max-days-ahead ${HORIZON_DAYS}`;
  const owner = OWNER_FLAG;
  const confirm = '--confirm --expect "${N}" --fix-deployed-sha "${FIXSHA}" --i-checked-inngest-settings';
  assert.deepEqual(wrapCalls(blockOf("bys")), [{ caffeinate: false, args: `${base} --max 200 ${owner}` }]);
  assert.deepEqual(wrapCalls(blockOf("canary")), [
    { caffeinate: false, args: `--tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 ${owner}` },
    { caffeinate: true, args: `--tenant-slug osteojp --min-days-ahead 3 --max-days-ahead 28 --max 5 ${owner} ${confirm}` },
  ]);
  assert.deepEqual(wrapCalls(blockOf("rest")), [
    { caffeinate: false, args: `${base} --max 200 ${owner}` },
    { caffeinate: true, args: `${base} --max 200 ${owner} ${confirm}` },
  ]);
  assert.deepEqual(wrapCalls(blockOf("closing")), [{ caffeinate: false, args: `${base} --max 200 ${owner}` }]);
  for (const b of blocksOf(doc)) {
    assert.doesNotMatch(b, /--sink-file|--resend-attempted|inc-1007-rearm-reminders-emit\.mjs --|node \$\{EMIT\}/);
    assert.equal((b.match(/--confirm/g) ?? []).length, (b.match(/^caffeinate -i /gm) ?? []).length);
  }
});

test("R42: no block prints, echoes or tests an environment variable, and none runs env, printenv, set or a trace", () => {
  for (const b of blocksOf(doc)) {
    assert.doesNotMatch(b, /\$\{?(HOME|INNGEST_[A-Z_]+|DATABASE_URL[A-Z_]*|REMINDERS_[A-Z_]+|PATH|USER)\b/);
    assert.doesNotMatch(b, /(^|[;&|(] *)(env|printenv|export -p|set -x|set -o xtrace)\b/m);
    assert.doesNotMatch(b, /(^|[;&|(] *)set *($|[;|&])/m);
  }
});

test("every clock read names its zone and is checked on the next line", () => {
  for (const b of blocksOf(doc)) {
    const lines = b.split("\n");
    lines.forEach((l, i) => {
      if (!/(^|[ (])date ['-]/.test(l) || /date -u '\+%s'|date -j -u -f/.test(l)) return;
      assert.match(l, /TZ=(Europe\/Lisbon|America\/Toronto) date /, l.slice(0, 100));
      if (/^(NOW|BEGAN|BEGANT|RDOW|NEXTDAY)=/.test(l)) assert.match(lines[i + 1], /\| grep -qx/, `the line after ${l.slice(0, 60)}`);
    });
    for (const l of lines.filter((x) => /^NOW=/.test(x))) assert.equal(l.split("||")[0].trim(), "NOW=$(TZ=Europe/Lisbon date '+%Y%m%d%H%M %u %Z')");
  }
  assert.ok(blocksOf(doc).every((b) => b.includes(`SWEEPOK="${SWEEP_OK_LINE}"`)), "SWEEPOK is not the program's guard line");
});

test("the dates the document states are the arithmetic of the 2026-10-12 record and of the code", () => {
  const D = 86_400_000;
  const H = 3_600_000;
  const lisbon = (ms) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName === "GMT" ? "WET" : p.timeZoneName === "GMT+1" ? "WEST" : p.timeZoneName}`;
  };
  // The 2026-10-12 sitting: 21:48 to 23:24 Lisbon (WEST), every run --max-days-ahead 28.
  const first = Date.parse("2026-10-12T20:48:00Z");
  assert.equal(lisbon(first), "2026-10-12 21:48 WEST");
  assert.equal(lisbon(first + 28 * D), "2026-11-09 20:48 WET");
  assert.equal(lisbon(Date.parse("2026-10-12T22:24:00Z") + 28 * D), "2026-11-09 22:24 WET");
  assert.ok(doc.includes("**2026-11-09 20:48 WET**") && doc.includes("at most 2026-11-09 22:24 WET"));
  // The first visit beyond it: Tuesday 2026-11-10 08:00; its email and SMS.
  const tue = Date.parse("2026-11-10T08:00:00Z");
  assert.equal(new Date(tue).getUTCDay(), 2);
  assert.equal(lisbon(tue - 48 * H), "2026-11-08 08:00 WET");
  assert.equal(new Date(tue - 48 * H).getUTCDay(), 0);
  assert.equal(lisbon(tue - 24 * H), "2026-11-09 08:00 WET");
  assert.ok(doc.includes("**From Sunday 2026-11-08 at 08:00 Lisbon (WET),**"));
  assert.equal(lisbon(tue - 48 * H - 30 * D), "2026-10-09 09:00 WEST");
  assert.equal(lisbon(tue - 24 * H - 30 * D), "2026-10-10 09:00 WEST");
  assert.ok(doc.includes("Friday 2026-10-09 09:00 WEST") && doc.includes("Saturday 2026-10-10 09:00 WEST"));
  // The fix's Resync, 2026-10-07 20:45 WEST, and 31.5 days to the first mark.
  const fix = Date.parse("2026-10-07T19:45:00Z");
  assert.equal(lisbon(fix), "2026-10-07 20:45 WEST");
  assert.equal(Math.round(((tue - 48 * H - fix) / D) * 10) / 10, 31.5);
  assert.ok(doc.includes("**2026-10-07 20:45 WEST**") && doc.includes("31.5 days later"));
  // The Monday edge: visits 20:48 to 20:59 on 11-09, their email on Saturday 11-07.
  assert.equal(lisbon(Date.parse("2026-11-09T20:48:00Z") - 48 * H), "2026-11-07 20:48 WET");
  assert.equal(new Date("2026-11-07T12:00:00Z").getUTCDay(), 6);
  // This fallback: Wednesday 2026-11-04 21:00, reach 12-02 21:00; the first visit beyond, Thursday 12-03.
  const T = Date.parse("2026-11-04T21:00:00Z");
  assert.equal(new Date(T).getUTCDay(), 3);
  assert.equal(lisbon(T + 28 * D), "2026-12-02 21:00 WET");
  const thu = Date.parse("2026-12-03T08:00:00Z");
  assert.equal(new Date(thu).getUTCDay(), 4);
  assert.equal(lisbon(thu - 48 * H), "2026-12-01 08:00 WET");
  assert.equal(new Date(thu - 48 * H).getUTCDay(), 2);
  assert.equal(new Date("2026-11-30T12:00:00Z").getUTCDay(), 1);
  assert.ok(doc.includes("**Tuesday 2026-12-01 from 08:00**") && doc.includes("the night of Monday 2026-11-30 at the latest"));
  // The longest sleep this sitting makes: the SMS of a 20:59 visit on 12-02, 27 days at most.
  assert.ok((Date.parse("2026-12-02T20:59:00Z") - 24 * H - T) / D < 27);
  assert.equal(new Date("2026-11-06T12:00:00Z").getUTCDay(), 5);
});

/* ---- THE HARNESS. Nothing in it touches a real host, the secrets folder or a database. ---------- */

const STUBBED = ["git", "node", "sntp", "curl", "caffeinate", "date", "shasum", "tee", "rm", "touch", "cat", "find", "grep", "cut", "awk", "sed"];
const FAKED = new Set(["git", "node", "sntp", "curl", "caffeinate"]);
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROD_APPLY = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const PROD_ENV = "/Users/ivan/osteojp-secrets/new-prod.env";
const FAKE_DB_URL = "postgresql://postgres.harness:x@harness.invalid:5432/postgres";
const FAKE_SHA = { MAIN: "1".repeat(40), OTHER: "2".repeat(40), BEFORE: "3".repeat(40) };
const HARNESS_EPOCH = 1793827800;
const HARNESS_HTTPDATE = new Date(HARNESS_EPOCH * 1000).toUTCString();
const RECORDS = ["r36-head.sha", "r36-night.ok", "r36-canary.ok", "r36-last-send.ok"];

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
      fetch) exit 0;;
      rev-parse) if [ "$2" = ${BRANCH} ]; then echo "$HARNESS_MAIN"; exit 0; fi
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
          *" --confirm "*) case "$all" in *" --max 5 "*) kind=canarySend;; *) kind=restSend;; esac;;
          *) case "$all" in *" --max 5 "*) kind=canaryDry;; *) kind="$HARNESS_DRY";; esac;;
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
      '+%Y-%m-%d %H:%M %Z') if [ "$TZ" = America/Toronto ]; then echo "2026-11-04 16:30 EST"; else echo "2026-11-04 21:30 $z"; fi;;
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

/** The program's real lines, as a sitting through the 2026-10-12 run() prints them, with the target read as production. */
async function fixtures() {
  const { steps } = await wholeSitting();
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
  f["g1no.out"] = swap(f["dryA.out"], "G1 UNDER THE LIMIT OF 20000: yes", "G1 UNDER THE LIMIT OF 20000: NO");
  f["canaryFew.out"] = swap(swap(f["canaryDry.out"], "ELIGIBLE: 12", "ELIGIBLE: 3"), "THIS RUN: 5 of 12", "THIS RUN: 3 of 3");
  f["canarySend4.out"] = swap(f["canarySend.out"], "SENT: 5 of 5", "SENT: 4 of 5");
  f["restDryZero.out"] = swap(f["restDry.out"], "ELIGIBLE: 7", "ELIGIBLE: 0");
  f["refused.out"] = "sweep    production's heartbeats: newest send, 3 minutes ago; shadow in the last 3 hours: 9; anything but shadow in the last 7 days: 1\nFAILED: the sweep's newest heartbeat is not shadow (it reads send): the sweep may be sending. This operation must not run while it is. Refusing. Nothing was sent.\n";
  return f;
}

const APPLY_FILES = [WRAP, EMIT, GUARD, PTM];

/** The shared base of a sweep: the stubs, the fixtures, a fake env file, and a fake apply worktree holding `docText`. */
export async function prepareHarness(base, docText) {
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

/** The document as SOLO's READY line will leave it: only the first line changes. */
const readyDoc = () => doc.replace(/^NOT READY: awaiting R4 review\n/, "READY: the harness's copy\n");

/** The block with its real paths moved into the run folder. A block that still names one is refused unrun. */
export function localize(block, run, envFile) {
  const out = block.replaceAll(PROD_APPLY, join(run, "apply")).replaceAll(PROD_ENV, envFile).replaceAll("/tmp/r36-", join(run, "tmp/r36-"));
  const rest = out.replaceAll(join(run, "tmp/r36-"), "").replaceAll(join(run, "apply"), "").replaceAll(envFile, "");
  for (const bad of ["/tmp/r36-", "osteojp-secrets", "osteojp-prod-apply", "/Users/ivan"]) {
    if (rest.includes(bad)) throw new Error(`the localized block still names ${bad}`);
  }
  return out;
}

/** GREEN's tool shape. zsh: exactly it. bash: the same, with errexit forced off, as zsh has it there. */
export function shellArgs(shell, text) {
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

/** Run one block once; `fault` null is the positive control. */
export async function runOnce(cfg, runId, fault) {
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
  const s = cfg.scenario ?? {};
  const env = {
    PATH: `${join(cfg.base, "bin")}:${SYSTEM_PATH}`, HOME: run, LANG: "C", LC_ALL: "C",
    HARNESS_RUN: run, HARNESS_FIX: join(cfg.base, "fix"), HARNESS_DBURL: FAKE_DB_URL, HARNESS_MAIN: s.main ?? FAKE_SHA.MAIN,
    HARNESS_STAMP: s.stamp ?? "202611042130", HARNESS_DOW: s.dow ?? "3", HARNESS_ZONE: s.zone ?? "WET",
    HARNESS_RDOW: s.rdow ?? "3", HARNESS_NEXT: "20261105", HARNESS_EPOCH: String(HARNESS_EPOCH), HARNESS_HTTPDATE,
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
  const result = { ...r, calls, recordsAtEnd, unexpected: readRun("unexpected"), fired: readRun("fired").trim() };
  rmSync(run, { recursive: true, force: true });
  return result;
}

export function describeCall(call) {
  const lines = call.args.split("\n").filter((l) => l !== "");
  const stdin = lines.filter((l) => l.startsWith("STDIN ")).map((l) => l.slice(6));
  const args = lines.filter((l) => !l.startsWith("STDIN ")).map((a) => (a.length > 70 ? `${a.slice(0, 40)}...${a.slice(-25)}` : a));
  return `${call.id.split("#")[0]} ${args.join(" ")}${stdin.length ? `  <stdin: ${stdin.join(" ").slice(0, 70)}>` : ""}`;
}

/** The position before which each record a block writes did not exist in its positive control. */
function writePoints(positive, records) {
  const wp = {};
  for (const m of records) {
    const first = positive.calls.find((c) => c.exists.includes(m));
    wp[m] = first ? first.pos - 1 : positive.calls.length;
    // A send leaves the record of the time it returned on purpose, even when it fails.
    const send = positive.calls.filter((c) => c.id.startsWith("caffeinate#") || (c.id.startsWith("tee#") && /r36-(canary|rest)-send\.out/.test(c.args)));
    if (m === "r36-last-send.ok" && send.length) wp[m] = Math.min(...send.map((c) => c.pos));
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

/** The network-time calls of BEFORE YOU START, by program and arguments: a source NOT READ goes on while another was read. */
export const NETWORK_CALLS = Object.freeze([
  ["sntp", (a) => a[0] === "time.apple.com" && a.length === 1],
  ["curl", (a) => a[0] === "-sI" && a[1] === "--max-time" && a[2] === "8" && /^https:\/\/(api\.github\.com|www\.cloudflare\.com)$/.test(a[3] ?? "")],
  ["date", (a) => (a[0] === "-u" && a[1] === "+%s") || (a[0] === "-j" && a[1] === "-u" && a[2] === "-f" && a[3] === "%a, %d %b %Y %H:%M:%S GMT")],
  ["awk", (a) => a[0] === '$1 ~ /^[+-][0-9]+[.][0-9]+$/ && $2 == "+/-" && $4 == "time.apple.com" { v = $1 } END { print v }'],
  ["awk", (a) => a[0] === "-v" && /^o=/.test(a[1] ?? "") && a[2] === "BEGIN { o += 0; if (o < 0) o = -o; if (o <= 5) exit 0; exit 1 }"],
  ["awk", (a) => a[0] === '{ sub(/\\r$/, "") } tolower($1) == "date:" { v = $0; sub(/^[^ ]+ +/, "", v) } END { print v }'],
  ["grep", (a) => a[0] === "-qxE" && ["[+-][0-9]+[.][0-9]+", "[1-9][0-9]{8,10} [1-9][0-9]{8,10}"].includes(a[1])],
  ["grep", (a) => a[0] === "-qxE" && (a[1] ?? "").startsWith("(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|")],
]);
export const isNetworkCall = (call) => {
  const prog = call.id.split("#")[0];
  const args = call.args.split("\n").filter((l) => !l.startsWith("STDIN ")).slice(0, -1);
  return NETWORK_CALLS.some(([p, ok]) => p === prog && ok(args));
};

/** Sweep one block: the positive control, then every external call made to fail in turn, plus empty answers and the extra faults. */
export async function sweep(cfg) {
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
    const allowed = cfg.name === "bys" && f.at && isNetworkCall(f.at) ? "a network-time read: a source NOT READ goes on while another was read" : null;
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

/** What each block finds on disk before it runs, written older than its start. */
const SETUPS = {
  bys: (tmp) => {
    for (const m of RECORDS) putRecord(tmp, m, "stale\n", 600);
  },
  canary: (tmp) => {
    putRecord(tmp, "r36-head.sha", `${FAKE_SHA.MAIN}\n`, 5);
    putRecord(tmp, "r36-night.ok", "20261104 20261105\n", 5);
  },
  rest: (tmp) => {
    putRecord(tmp, "r36-head.sha", `${FAKE_SHA.MAIN}\n`, 30);
    putRecord(tmp, "r36-night.ok", "20261104 20261105\n", 30);
    putRecord(tmp, "r36-canary.ok", "", 20);
    putRecord(tmp, "r36-last-send.ok", "", 20);
  },
  closing: (tmp) => {
    putRecord(tmp, "r36-head.sha", `${FAKE_SHA.MAIN}\n`, 60);
    putRecord(tmp, "r36-night.ok", "20261104 20261105\n", 60);
    putRecord(tmp, "r36-canary.ok", "", 50);
    putRecord(tmp, "r36-last-send.ok", "", 20);
  },
};
const DRY_OF = { bys: "dryA", canary: "", rest: "restDry", closing: "closing" };
const RECORDS_OF = { bys: ["r36-head.sha", "r36-night.ok"], canary: ["r36-last-send.ok", "r36-canary.ok"], rest: ["r36-last-send.ok"], closing: [] };

/** BEFORE YOU START as GREEN's dispatch fills it. */
export const fillDispatch = (block, v) =>
  block
    .replace("HELD='PENDING: set at the READY line'", `HELD=${v.HELD}`)
    .replace("DOCSHA='PENDING: set at the READY line'", `DOCSHA=${v.DOCSHA}`)
    .replace("RUNDAY='PENDING: the Lisbon date of the night the dispatch names, YYYYMMDD'", `RUNDAY=${v.RUNDAY}`);

function harnessConfig(name, shell, base, docSha, opts = {}) {
  const raw = blockOf(name);
  const block = name === "bys" && !opts.raw ? fillDispatch(raw, { HELD: opts.held ?? FAKE_SHA.MAIN, DOCSHA: docSha, RUNDAY: "20261104" }) : raw;
  return {
    id: `${shell}-${name}${opts.tag ? `-${opts.tag}` : ""}`, name, shell, base, block, dry: DRY_OF[name], records: RECORDS_OF[name],
    initialHead: name === "bys" ? FAKE_SHA.BEFORE : FAKE_SHA.MAIN, setup: opts.setup ?? SETUPS[name], scenario: opts.scenario, applyDir: opts.applyDir,
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
  const base = mkdtempSync(join(tmpdir(), `fault-r36-${shell}-`));
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
    assert.ok(faults >= 260, `only ${faults} faults across the four blocks (277 when this was written)`);
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
  const base = mkdtempSync(join(tmpdir(), "fault-r36-control-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    for (const shell of shellsHere()) {
      // A block with its guards stripped runs on past a failing call: the harness can see a missing halt.
      const cfg = harnessConfig("closing", shell, base, docSha);
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

test("the program's calls in the positive controls carry exactly the arguments the blocks name", async () => {
  const base = mkdtempSync(join(tmpdir(), "fault-r36-args-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    const want = {
      bys: [[WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", OWNER_FLAG]],
      canary: [
        [WRAP, "--tenant-slug", "osteojp", "--min-days-ahead", "3", "--max-days-ahead", "28", "--max", "5", OWNER_FLAG],
        [WRAP, "--tenant-slug", "osteojp", "--min-days-ahead", "3", "--max-days-ahead", "28", "--max", "5", OWNER_FLAG, "--confirm", "--expect", "12", "--fix-deployed-sha", FIXSHA, "--i-checked-inngest-settings"],
      ],
      rest: [
        [WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", OWNER_FLAG],
        [WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", OWNER_FLAG, "--confirm", "--expect", "7", "--fix-deployed-sha", FIXSHA, "--i-checked-inngest-settings"],
      ],
      closing: [[WRAP, "--tenant-slug", "osteojp", "--max-days-ahead", "28", "--max", "200", OWNER_FLAG]],
    };
    for (const name of NAMES) {
      const r = await runOnce(harnessConfig(name, "bash", base, docSha), `args-${name}`, null);
      assert.equal(r.code, 0, `${name}\n${r.out.slice(-1500)}`);
      const calls = r.calls.filter((c) => c.id.startsWith("node#") && c.args.startsWith(`${WRAP}\n`)).map((c) => c.args.trim().split("\n"));
      assert.deepEqual(calls, want[name], name);
      const caf = r.calls.filter((c) => c.id.startsWith("caffeinate#"));
      assert.equal(caf.length, name === "canary" || name === "rest" ? 1 : 0, name);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/** Scenarios: each must STOP with its sentence, without its last line; a few must end clean on another path. */
const SCENARIOS = [
  { name: "bys", tag: "unfilled", raw: true, stop: /^STOP: HELD is not a filled-in sha, so this block is NOT READY/m },
  { name: "bys", tag: "open-hours", scenario: { stamp: "202611042059", dow: "3" }, stop: /^STOP: Lisbon 202611042059 is inside clinic hours/m },
  { name: "bys", tag: "saturday", scenario: { stamp: "202611072130", dow: "6" }, stop: /^STOP: Lisbon 202611072130 is outside the window of the night/m },
  { name: "bys", tag: "runday-saturday", scenario: { rdow: "6" }, stop: /^STOP: RUNDAY 20261104 is not a Monday to Friday/m },
  { name: "bys", tag: "zone", scenario: { zone: "UTC" }, stop: /^STOP: the Lisbon clock did not read as YYYYMMDDHHMM, a weekday and the zone WET or WEST/m },
  { name: "bys", tag: "clock-far", scenario: { sntp: "far" }, stop: /^STOP: the machine's clock disagrees with network time/m },
  { name: "bys", tag: "held-moved", scenario: { main: FAKE_SHA.OTHER }, stop: /^STOP: the held head is not the commit this block names/m },
  { name: "bys", tag: "stray", scenario: { stray: " M x" }, stop: /^STOP: the apply worktree is not clean/m },
  { name: "bys", tag: "no-fix", scenario: { ancestor: "1" }, stop: /^STOP: the reminder fix of 2026-10-07/m },
  { name: "bys", tag: "marker-not-fresh", scenario: { swapKind: "dryA", swapFile: "restDry.out" }, stop: /^STOP: this operation's marker already holds sent rows/m },
  { name: "bys", tag: "g1-no", scenario: { swapKind: "dryA", swapFile: "g1no.out" }, stop: /^STOP: the dry run does not show G1 UNDER THE LIMIT OF 20000: yes/m },
  { name: "bys", tag: "refused", scenario: { swapKind: "dryA", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the dry run failed or was refused/m },
  { name: "canary", tag: "twice", setup: (tmp) => { SETUPS.canary(tmp); putRecord(tmp, "r36-canary.ok", "", 3); }, stop: /^STOP: the canary already ran in this sitting/m },
  { name: "canary", tag: "no-head", setup: (tmp) => putRecord(tmp, "r36-night.ok", "20261104 20261105\n", 5), stop: /^STOP: BEFORE YOU START recorded no head/m },
  { name: "canary", tag: "head-moved", setup: (tmp) => { SETUPS.canary(tmp); putRecord(tmp, "r36-head.sha", `${FAKE_SHA.OTHER}\n`, 5); }, stop: /^STOP: the apply worktree is not on the head BEFORE YOU START recorded/m },
  { name: "canary", tag: "other-night", setup: (tmp) => { SETUPS.canary(tmp); putRecord(tmp, "r36-night.ok", "20261102 20261103\n", 5); }, stop: /^STOP: Lisbon 202611042130 is outside the night BEFORE YOU START recorded/m },
  { name: "canary", tag: "few", scenario: { swapKind: "canaryDry", swapFile: "canaryFew.out" }, stop: /^STOP: the canary's dry run found 3 eligible appointments/m },
  { name: "canary", tag: "sent-4", scenario: { swapKind: "canarySend", swapFile: "canarySend4.out" }, stop: /^STOP: the canary does not show SENT: 5 of 5/m, wrote: ["r36-last-send.ok"] },
  { name: "canary", tag: "send-refused", scenario: { swapKind: "canarySend", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the canary failed or was refused/m, wrote: ["r36-last-send.ok"] },
  { name: "rest", tag: "no-canary", setup: (tmp) => { SETUPS.canary(tmp); }, stop: /^STOP: the canary has not run in this sitting, so THE REST does not run/m },
  { name: "rest", tag: "marker-empty", scenario: { swapKind: "restDry", swapFile: "dryA.out" }, stop: /^STOP: the number of appointments checked did not read as a whole number above 0 \[0\]/m },
  { name: "rest", tag: "send-refused", scenario: { swapKind: "restSend", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the run failed or was refused/m, wrote: ["r36-last-send.ok"] },
  { name: "rest", tag: "nothing-left", scenario: { swapKind: "restDry", swapFile: "restDryZero.out" }, clean: /^THE REST: ELIGIBLE 0 at this read, so nothing is left to send/m },
  { name: "closing", tag: "too-soon", setup: (tmp) => { SETUPS.closing(tmp); putRecord(tmp, "r36-last-send.ok", "", 5); }, stop: /^STOP: the last send returned less than 12 minutes ago/m },
  { name: "closing", tag: "not-done", scenario: { swapKind: "closing", swapFile: "restDry.out" }, stop: /^STOP: the closing dry run does not read ELIGIBLE: 0/m },
  { name: "closing", tag: "refused", scenario: { swapKind: "closing", swapFile: "refused.out", swapExit: 1 }, stop: /^STOP: the closing dry run failed or was refused/m },
];

test("every scenario stops its block with its own sentence, or ends clean on the path it names", async () => {
  const base = mkdtempSync(join(tmpdir(), "fault-r36-scenarios-"));
  try {
    const docSha = await prepareHarness(base, readyDoc());
    // The document as it stands, first line NOT READY, in an apply folder of its own.
    const notReady = join(base, "apply-not-ready");
    mkdirSync(join(notReady, "docs"), { recursive: true });
    for (const f of APPLY_FILES) {
      mkdirSync(dirname(join(notReady, f)), { recursive: true });
      copyFileSync(join(ROOT, f), join(notReady, f));
    }
    writeFileSync(join(notReady, DOC), doc);
    writeFileSync(join(notReady, SIDECAR), `${sha256(doc)}  ${DOC}\n`);
    const all = [...SCENARIOS, { name: "bys", tag: "doc-not-ready", applyDir: "apply-not-ready", docSha: sha256(doc), stop: /^STOP: the document's first line at the held head still reads NOT READY/m }];
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
      }
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

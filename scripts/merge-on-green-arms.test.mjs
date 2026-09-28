// scripts/merge-on-green.sh ARMS a pull request, and refuses the ones an agent
// must never arm.
//
// WHY THIS EXISTS. /ship (.claude/commands/ship.md, step 4) runs
// scripts/merge-on-green.sh <PR>. Until this test's PR the script polled
// `gh pr checks`, exited 1 on the first red required check and never armed.
// The CI-minutes change (#1446) makes the required E2E check RED on every
// unarmed ordinary PR until the PR is armed, because arming is what starts the
// E2E run. A script that waits for green before merging, and never arms, can
// then only ever read red: /ship would fail on every ordinary PR. The fix is to
// arm (`gh pr merge <PR> --auto --squash`) and let GitHub merge on green, which
// is also what rule R2 in CLAUDE.md asks of every PR.
//
// Arming is also a way to merge something by accident, so the script refuses,
// with a distinct exit code and no merge call, a PR that is not OPEN, a draft,
// a PR labelled held-for-apply, and a PR titled GATE-CHANGE. A held or
// GATE-CHANGE PR that is armed ALREADY gets its own code (8) and says so,
// because GitHub merges it on green whatever its label. A re-read after the
// arm call that fails proves nothing either way, so it is UNKNOWN (9), never
// "not armed".
//
// HOW IT RUNS THE SCRIPT. The shipped shell script is executed with a FAKE `gh`
// first on PATH. The fake answers from canned JSON per case and records every
// invocation to a file, so each case asserts on exactly what the script asked
// GitHub to do. No network: the fake is the only `gh` the script can reach.
// `--jq` is evaluated with the real `jq`, standing in for the jq that is built
// into `gh`, so the script's own jq expressions are what get tested, against a
// PR object cut down to the fields the script asked for.
//
// The fake world is the one #1446 creates: branch protection requires four
// checks and, on an unarmed PR, the E2E one reads fail. The fake answers the
// calls the OLD script made too (repo view, the protection read, pr checks), so
// pointing this file at the old script reproduces the gap itself: it reads the
// red E2E check and exits 1 without arming.
//
// POINTING IT AT ANOTHER COPY. MERGE_ON_GREEN_SCRIPT=/path/to/copy.sh runs
// every case against that file instead of the shipped one. That is how the
// seeded failures in the PR were measured (the script from origin/main before
// this change, and a copy with `--auto` removed). The in-file negative control
// at the bottom always mutates the SHIPPED script, whatever the variable says.
//
// THE DOCUMENTS. The last tests read .claude/commands/ship.md and the
// conventions skill, the two files that tell an agent to run this script, and
// check they do not contradict it: no arm claim in a PR body written before the
// arm, no copied list of required checks, no merge that waits on Vercel, and
// ship.md's exit-code table lists the codes the script's header lists. The
// variable above does not affect them.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = join(ROOT, "scripts/merge-on-green.sh");
const SCRIPT = process.env.MERGE_ON_GREEN_SCRIPT || SHIPPED;
const PR = "1234";

// Exit codes documented at the top of scripts/merge-on-green.sh.
const EXIT = {
  ok: 0,
  notArmed: 1,
  usage: 3,
  notOpen: 4,
  draft: 5,
  held: 6,
  gateChange: 7,
  alreadyArmed: 8,
  unknown: 9,
};

// ---------------------------------------------------------------------------
// The fake `gh`.
// ---------------------------------------------------------------------------

const FAKE_GH_JS = String.raw`
const fs = require("fs");
const { spawnSync } = require("child_process");
const c = JSON.parse(fs.readFileSync(process.env.FAKE_GH_CASE, "utf8"));
const logFile = process.env.FAKE_GH_LOG;
const args = process.argv.slice(2);

const prior = fs.existsSync(logFile)
  ? fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
fs.appendFileSync(logFile, JSON.stringify(args) + "\n");
const mergeCalled = prior.some((a) => a[0] === "pr" && a[1] === "merge");

function after(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}
function out(s) { if (s) process.stdout.write(s); }
function die(msg, code) { process.stderr.write(msg + "\n"); process.exit(code); }

// gh --json FIELDS: only those fields come back; an unknown one is an error.
// gh --jq EXPR: raw output, like jq -r.
function answer(source, fields) {
  if (source === null || source === undefined) die("fake gh: could not resolve to a PullRequest", 1);
  let obj = source;
  if (fields) {
    obj = {};
    for (const f of fields.split(",")) {
      if (!(f in source)) die("fake gh: Unknown JSON field: " + JSON.stringify(f), 1);
      obj[f] = source[f];
    }
  }
  const jq = after("--jq");
  if (!jq) { out(JSON.stringify(obj) + "\n"); process.exit(0); }
  const r = spawnSync("jq", ["-r", jq], { input: JSON.stringify(obj), encoding: "utf8" });
  if (r.error) die("fake gh: jq is not runnable: " + r.error.message, 98);
  out(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status === null ? 98 : r.status);
}

if (args[0] === "auth" && args[1] === "status") {
  process.exit(c.authExit ?? 0);
}
if (args[0] === "pr" && args[1] === "view") {
  answer(mergeCalled ? c.after : c.before, after("--json"));
}
if (args[0] === "pr" && args[1] === "merge") {
  out(c.mergeOut ?? "");
  if (c.mergeErr) process.stderr.write(c.mergeErr);
  process.exit(c.mergeExit ?? 0);
}
if (args[0] === "pr" && args[1] === "checks") {
  out(c.checks.map(([name, state]) => name + "\t" + state + "\t1m\thttps://example.invalid/run\t\n").join(""));
  process.exit(0);
}
if (args[0] === "repo" && args[1] === "view") {
  answer({ nameWithOwner: "example-owner/example-repo" }, after("--json"));
}
if (args[0] === "api") {
  answer({ required_status_checks: { contexts: c.checks.map(([name]) => name) } }, undefined);
}
die("fake gh: unexpected call: gh " + args.join(" "), 99);
`;

const REQUIRED = [
  "DB-gated tests (RLS isolation, seeded DB)",
  "Lint + typecheck + test",
  "Playwright E2E (seeded DB)",
  "Validate spec + drift check",
];
/** The world after #1446: an unarmed ordinary PR's E2E check reads fail. */
const CHECKS_UNARMED = REQUIRED.map((n) => [n, n.startsWith("Playwright") ? "fail" : "pass"]);
const CHECKS_GREEN = REQUIRED.map((n) => [n, "pass"]);

const ARMED_REQUEST = { enabledAt: "2026-01-01T00:00:00Z", mergeMethod: "SQUASH" };

/** A PR as `gh pr view --json` would describe it. Only asked-for fields go out. */
function pr(over = {}) {
  return {
    number: Number(PR),
    state: "OPEN",
    isDraft: false,
    title: "AGENDA-EXAMPLE: an ordinary change",
    labels: [{ name: "area:agenda" }],
    autoMergeRequest: null,
    baseRefName: "main",
    ...over,
  };
}

/**
 * Run a copy of merge-on-green.sh against the fake world `world`.
 * Returns the exit status, both streams, and every recorded `gh` call as argv.
 */
function run(world, { script = SCRIPT, args = [PR] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "merge-on-green-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(dir, "fake-gh.cjs"), FAKE_GH_JS);
  const gh = join(bin, "gh");
  writeFileSync(gh, `#!/bin/sh\nexec "${process.execPath}" "${join(dir, "fake-gh.cjs")}" "$@"\n`);
  chmodSync(gh, 0o755);
  const caseFile = join(dir, "case.json");
  const logFile = join(dir, "calls.log");
  writeFileSync(caseFile, JSON.stringify({ checks: CHECKS_UNARMED, ...world }));

  const r = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    // The old script polls with `sleep 20` when a check is pending. No case
    // leaves one pending, but a hang must fail the case, not the suite.
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_GH_CASE: caseFile,
      FAKE_GH_LOG: logFile,
      GH_TOKEN: "",
      GH_PROMPT_DISABLED: "1",
    },
  });
  const calls = existsSync(logFile)
    ? readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, calls };
}

const isMerge = (a) => a[0] === "pr" && a[1] === "merge";
const isChecks = (a) => a[0] === "pr" && a[1] === "checks";
const isView = (a) => a[0] === "pr" && a[1] === "view";
const show = (r) =>
  `\nexit ${r.status}${r.signal ? ` (signal ${r.signal})` : ""}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}\ncalls:\n` +
  r.calls.map((a) => "  gh " + a.join(" ")).join("\n");

/** Every `gh` call any case made, for the never-without-`--auto` sweep. */
const ALL_CALLS = [];
function record(r) {
  ALL_CALLS.push(...r.calls);
  return r;
}

/**
 * What is wrong with an arming run. Returns a list rather than throwing, so the
 * negative control at the bottom can show a mutant produces a non-empty one.
 */
function armProblems(r, { wantMerged = false } = {}) {
  const p = [];
  if (r.status !== EXIT.ok) p.push(`exit ${r.status}, wanted ${EXIT.ok}`);
  const merges = r.calls.filter(isMerge);
  if (merges.length !== 1) p.push(`${merges.length} gh pr merge call(s), wanted exactly 1`);
  for (const m of merges) {
    if (JSON.stringify(m) !== JSON.stringify(["pr", "merge", PR, "--auto", "--squash"])) {
      p.push(`merge call was "gh ${m.join(" ")}", wanted exactly "gh pr merge ${PR} --auto --squash"`);
    }
  }
  if (r.calls.some(isChecks)) p.push("it polled gh pr checks");
  const mergeAt = r.calls.findIndex(isMerge);
  if (mergeAt !== -1 && !r.calls.slice(mergeAt + 1).some(isView)) {
    p.push("no re-read of the PR after the arm call");
  }
  const said = wantMerged ? /MERGED/ : /ARMED/;
  if (!said.test(r.stdout)) p.push(`stdout does not say ${said}`);
  return p;
}

/** A refusal: the documented code, a reason on stderr, and no merge call. */
function assertRefused(r, code, reason) {
  assert.equal(r.status, code, `wanted exit ${code}` + show(r));
  assert.match(r.stderr, reason, show(r));
  assert.equal(r.calls.filter(isMerge).length, 0, "a refusal must make no gh pr merge call" + show(r));
  assert.ok(!r.calls.some(isChecks), "a refusal must not poll checks" + show(r));
}

// ---------------------------------------------------------------------------
// The cases.
// ---------------------------------------------------------------------------

test("the fake gh can evaluate --jq (real jq stands in for gh's built-in one)", () => {
  const r = spawnSync("jq", ["-r", ".a"], { input: '{"a":"ok"}', encoding: "utf8" });
  assert.ok(!r.error, `jq is not runnable here (${r.error && r.error.message}); the fake gh needs it`);
  assert.equal(r.stdout.trim(), "ok");
});

test("an ordinary OPEN PR is armed with exactly --auto --squash, re-read, exit 0", () => {
  const r = record(run({ before: pr(), after: pr({ autoMergeRequest: ARMED_REQUEST }) }));
  assert.deepEqual(armProblems(r), [], show(r));
  // The exact conversation: auth, one read, one arm, one re-read. Nothing else.
  assert.deepEqual(
    r.calls.map((a) => a.slice(0, 2).join(" ")),
    ["auth status", "pr view", "pr merge", "pr view"],
    show(r),
  );
});

test("the verdict follows the re-read: the arm call exits non-zero, the read shows armed, exit 0", () => {
  const r = record(
    run({
      before: pr(),
      after: pr({ autoMergeRequest: ARMED_REQUEST }),
      mergeExit: 1,
      mergeErr: "a transient error printed by gh\n",
    }),
  );
  assert.deepEqual(armProblems(r), [], show(r));
});

test("checks already green: the arm merges at once, the read shows MERGED, exit 0", () => {
  const r = record(
    run({
      before: pr(),
      after: pr({ state: "MERGED" }),
      checks: CHECKS_GREEN,
      mergeOut: "Merged pull request #1234\n",
    }),
  );
  assert.deepEqual(armProblems(r, { wantMerged: true }), [], show(r));
});

test("the read after arming shows NOT armed: exit 1, even though the arm call exited 0", () => {
  const r = record(run({ before: pr(), after: pr() }));
  assert.equal(r.status, EXIT.notArmed, show(r));
  assert.match(r.stderr, /NOT ARMED/, show(r));
  assert.equal(r.calls.filter(isMerge).length, 1, "exactly one arm call, no retry" + show(r));
});

test("the read after arming shows CLOSED: exit 1", () => {
  const r = record(run({ before: pr(), after: pr({ state: "CLOSED" }) }));
  assert.equal(r.status, EXIT.notArmed, show(r));
});

test("the re-read after the arm call fails: exit 9 UNKNOWN, never NOT ARMED, and no second arm", () => {
  // `after: null` makes the fake's second `gh pr view` fail with no output, as
  // a network or API error would. The arm call itself may have taken (first
  // world) or reported an error (second); either way the read shows nothing.
  for (const world of [
    { before: pr(), after: null },
    { before: pr(), after: null, mergeExit: 1, mergeErr: "a transient error printed by gh\n" },
  ]) {
    const r = record(run(world));
    assert.equal(r.status, EXIT.unknown, show(r));
    assert.match(r.stderr, /UNKNOWN/, show(r));
    assert.match(r.stderr, /may be armed/, show(r));
    assert.doesNotMatch(r.stderr, /NOT ARMED|Nothing will merge/, "an unread re-read was reported as not armed" + show(r));
    assert.deepEqual(
      r.calls.map((a) => a.slice(0, 2).join(" ")),
      ["auth status", "pr view", "pr merge", "pr view"],
      "exactly one arm and one re-read, no retry" + show(r),
    );
  }
});

test("held-for-apply is refused (exit 6) with no merge call, in any case and among other labels", () => {
  for (const labels of [
    [{ name: "held-for-apply" }],
    [{ name: "area:db" }, { name: "Held-For-Apply" }],
  ]) {
    const r = record(run({ before: pr({ labels }), after: pr({ labels, autoMergeRequest: ARMED_REQUEST }) }));
    assertRefused(r, EXIT.held, /held-for-apply/);
  }
});

test("a GATE-CHANGE title is refused (exit 7) with no merge call, after leading spaces and in any case", () => {
  for (const title of ["GATE-CHANGE: a required check moves", "  gate-change: lower case, leading spaces"]) {
    const r = record(run({ before: pr({ title }), after: pr({ title, autoMergeRequest: ARMED_REQUEST }) }));
    assertRefused(r, EXIT.gateChange, /GATE-CHANGE/);
  }
});

test("a held-for-apply or GATE-CHANGE PR that is ALREADY armed: exit 8, says ALREADY ARMED and how to disarm, never 'unarmed'", () => {
  // Labels do not stop auto-merge: GitHub merges an armed PR on green whatever
  // it is labelled. A report of "unarmed" here would hide a merge ahead of the
  // owner. An armed draft is checked too: it must read as armed, not only as a
  // draft.
  for (const [over, reason] of [
    [{ labels: [{ name: "held-for-apply" }] }, /held-for-apply/],
    [{ labels: [{ name: "area:db" }, { name: "Held-For-Apply" }], isDraft: true }, /held-for-apply/],
    [{ title: "GATE-CHANGE: a required check moves" }, /GATE-CHANGE/],
    [{ title: "  gate-change: lower case", isDraft: true }, /GATE-CHANGE/],
  ]) {
    const armed = pr({ ...over, autoMergeRequest: ARMED_REQUEST });
    const r = record(run({ before: armed, after: armed }));
    assertRefused(r, EXIT.alreadyArmed, reason);
    assert.match(r.stderr, /ALREADY ARMED/, show(r));
    assert.match(r.stderr, /gh pr merge 1234 --disable-auto/, show(r));
    assert.doesNotMatch(r.stderr, /unarmed|nothing armed/i, "an armed PR was reported as unarmed" + show(r));
  }
});

test("CONTROL: the ALREADY ARMED refusal is not wider than held and GATE-CHANGE", () => {
  // An ordinary PR that is already armed is armed again and exits 0, and an
  // unarmed held PR still gets the plain refusal (6) that says it is unarmed.
  const armed = pr({ autoMergeRequest: ARMED_REQUEST });
  const r = record(run({ before: armed, after: armed }));
  assert.deepEqual(armProblems(r), [], show(r));

  const labels = [{ name: "held-for-apply" }];
  const held = record(run({ before: pr({ labels }), after: pr({ labels }) }));
  assertRefused(held, EXIT.held, /unarmed/);
  assert.doesNotMatch(held.stderr, /ALREADY ARMED/, show(held));
});

test("CONTROL: a title that only MENTIONS GATE-CHANGE, and a label that only contains held, are armed", () => {
  // Without this arm the refusals could be widened to "everything" and every
  // case above would still pass.
  const title = "docs: explain what a GATE-CHANGE pull request is";
  const labels = [{ name: "held-for-apply-docs" }];
  const r = record(run({ before: pr({ title, labels }), after: pr({ title, labels, autoMergeRequest: ARMED_REQUEST }) }));
  assert.deepEqual(armProblems(r), [], show(r));
});

test("a draft is refused (exit 5) with no merge call", () => {
  const r = record(run({ before: pr({ isDraft: true }), after: pr({ isDraft: true }) }));
  assertRefused(r, EXIT.draft, /draft/);
});

test("a PR that is CLOSED or already MERGED before the start is refused (exit 4) with no merge call", () => {
  for (const state of ["CLOSED", "MERGED"]) {
    const r = record(run({ before: pr({ state }), after: pr({ state }) }));
    assertRefused(r, EXIT.notOpen, new RegExp(`${state}, not OPEN`));
  }
});

test("gh not authenticated gives the usage exit (3) and makes no other call", () => {
  const r = record(run({ authExit: 1, before: pr(), after: pr({ autoMergeRequest: ARMED_REQUEST }) }));
  assert.equal(r.status, EXIT.usage, show(r));
  assert.match(r.stderr, /not authenticated/, show(r));
  assert.deepEqual(r.calls, [["auth", "status"]], show(r));
});

test("a PR argument that is missing or not all digits is the usage exit (3), before any gh call", () => {
  for (const args of [[], [""], ["--admin"], ["12a"], ["-1"]]) {
    const r = record(run({ before: pr(), after: pr({ autoMergeRequest: ARMED_REQUEST }) }, { args }));
    assert.equal(r.status, EXIT.usage, `args ${JSON.stringify(args)}` + show(r));
    assert.match(r.stderr, /usage: merge-on-green\.sh <PR_NUMBER>/, show(r));
    assert.deepEqual(r.calls, [], `args ${JSON.stringify(args)} reached gh` + show(r));
  }
});

test("a PR that cannot be read is the usage exit (3) with no merge call", () => {
  const r = record(run({ before: null, after: null }));
  assert.equal(r.status, EXIT.usage, show(r));
  assert.equal(r.calls.filter(isMerge).length, 0, show(r));
});

// Registered after every case above, and node:test runs top-level tests in
// order, so ALL_CALLS holds every call by the time this runs.
test("across every case: never a gh pr merge without --auto, never --admin, never gh pr checks", () => {
  assert.ok(ALL_CALLS.length > 20, `the sweep saw only ${ALL_CALLS.length} calls, so the cases did not run`);
  const merges = ALL_CALLS.filter(isMerge);
  assert.ok(merges.length >= 4, `only ${merges.length} merge calls were made across the cases`);
  const bad = merges.filter((a) => !a.includes("--auto") || a.includes("--admin"));
  assert.deepEqual(bad, [], "a gh pr merge call without --auto, or with --admin");
  assert.deepEqual(ALL_CALLS.filter(isChecks), [], "the script polled gh pr checks");
});

// ---------------------------------------------------------------------------
// Negative control: the assertions above can tell a script that drops --auto
// from the shipped one. Always built from the SHIPPED file.
// ---------------------------------------------------------------------------

test("NEGATIVE CONTROL: the shipped script with --auto removed is caught", () => {
  const src = readFileSync(SHIPPED, "utf8");
  const line = 'gh pr merge "$PR" --auto --squash\n';
  assert.equal(src.split(line).length - 1, 1, "the arm call line is not where this control expects it");
  const dir = mkdtempSync(join(tmpdir(), "merge-on-green-mutant-"));
  const mutant = join(dir, "merge-on-green.sh");
  writeFileSync(mutant, src.replace(line, 'gh pr merge "$PR" --squash\n'));

  // The world a no-auto merge would hit on GitHub: the checks are not green,
  // so the plain merge is refused and the PR stays open and unarmed.
  const r = run(
    { before: pr(), after: pr(), mergeExit: 1, mergeErr: "Required status check is failing\n" },
    { script: mutant },
  );
  const problems = armProblems(r);
  assert.ok(problems.length > 0, "a script that drops --auto passed the arming assertions" + show(r));
  assert.ok(
    problems.some((m) => /wanted exactly "gh pr merge 1234 --auto --squash"/.test(m)),
    "the exact-argv assertion did not name the missing --auto: " + problems.join("; "),
  );
});

// ---------------------------------------------------------------------------
// The two documents that tell an agent to run this script must agree with it.
// An agent reads these, not the script, so a stale sentence in either one is
// how the old "wait for green, then merge" habit comes back. Each check is a
// function returning what is wrong, so the controls below can show it catches
// the text these documents carried before review round 1.
// ---------------------------------------------------------------------------

const SHIP_MD = join(ROOT, ".claude/commands/ship.md");
const SKILL_MD = join(ROOT, ".claude/skills/osteojp-conventions/SKILL.md");

/** Branch protection's required contexts, however a document spells them. */
const CHECK_NAME_PATTERNS = [/Lint ?\+ ?typecheck/i, /DB-gated tests/i, /Playwright E2E/i, /Validate spec/i];

/** Required-check names a document copies. A copied list drifts from branch protection. */
function copiedCheckNames(text) {
  return CHECK_NAME_PATTERNS.filter((re) => re.test(text)).map(String);
}

/** Prose sentences, with code spans removed (`merge-on-green.sh` is not the word green). */
function sentences(text) {
  return text
    .replace(/`[^`]*`/g, "")
    .replace(/\s+/g, " ")
    .split(/\.\s+/);
}

/** Sentences that make a merge wait on a Vercel deploy. Auto-merge never does. */
function vercelGreenConditions(text) {
  return sentences(text).filter((s) => /Vercel/.test(s) && /\bgreen\b/i.test(s));
}

/**
 * Anything the PR body says about arming. /ship writes the body in step 3,
 * before step 4 arms, and step 4 can refuse (exit 4 to 7) or fail to arm
 * (exit 1), so the body cannot know the outcome and must not state one.
 */
function armClaims(body) {
  return [/\barm(?:ed|ing|s)?\b/i, /auto-?merge/i].filter((re) => re.test(body)).map(String);
}

/** The PR body template in ship.md step 3: the heredoc of the `gh pr create` call. */
function prBodyTemplate(md) {
  const m = md.match(/gh pr create[^\n]*<<'EOF'\n([\s\S]*?)\nEOF\n/);
  return m ? m[1] : null;
}

/** The skill's "The gates and the merge policy" section, up to the next heading. */
function gatesSection(md) {
  const m = md.match(/\n## The gates and the merge policy\n([\s\S]*?)\n## /);
  return m ? m[1] : null;
}

test("ship.md: the PR body, written before step 4 arms, says nothing about arming", () => {
  const body = prBodyTemplate(readFileSync(SHIP_MD, "utf8"));
  assert.ok(body && /## Checks/.test(body), "the step 3 PR body template was not found in ship.md");
  assert.deepEqual(armClaims(body), [], `the PR body claims an arm outcome:\n${body}`);
});

test("ship.md: no copied list of required checks", () => {
  const md = readFileSync(SHIP_MD, "utf8");
  assert.match(md, /scripts\/merge-on-green\.sh <PR_NUMBER>/, "ship.md no longer runs the script");
  assert.deepEqual(copiedCheckNames(md), []);
});

test("ship.md: its exit-code table lists the same codes as the script's header table, 2 retired", () => {
  const codes = (re, text) => [...text.matchAll(re)].map((m) => Number(m[1])).sort((a, b) => a - b);
  const script = codes(/^#\s+(\d)\s{2}\S/gm, readFileSync(SHIPPED, "utf8"));
  const md = readFileSync(SHIP_MD, "utf8");
  assert.ok(script.includes(8) && script.includes(9), `the script header table was not parsed: ${script}`);
  assert.deepEqual(codes(/^\| (\d) \|/gm, md), script.filter((c) => c !== 2));
  assert.match(md, /Exit 2 \([^)]*\) is retired/);
});

test("conventions skill: the merge policy copies no check list and waits on no Vercel deploy", () => {
  const section = gatesSection(readFileSync(SKILL_MD, "utf8"));
  assert.ok(section && /merge-on-green\.sh/.test(section), "the gates section was not found, or no longer names the script");
  assert.deepEqual(copiedCheckNames(section), []);
  assert.deepEqual(vercelGreenConditions(section), []);
});

test("NEGATIVE CONTROL: the document checks catch the text carried before review round 1", () => {
  const oldBody =
    "## Summary\n- <bullet points from commit messages>\n\n## Checks\n" +
    "Armed at open: GitHub squash-merges this PR once every required check is green.\n" +
    "Vercel statuses are not required checks.\n";
  assert.ok(armClaims(oldBody).length > 0, "the arm claim in the old PR body was not caught");

  const oldRule =
    "- **Read required checks from the CHECKS API, never the PR banner.** GREEN\n" +
    "  self-merge only when EVERY required check (DB-gated tests, Lint+typecheck+test,\n" +
    "  Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform,\n" +
    "  osteojp-portal) are green. **Never `--admin`, never the bypass box.**\n";
  assert.equal(copiedCheckNames(oldRule).length, 3, "the three copied check names were not all caught");
  assert.equal(vercelGreenConditions(oldRule).length, 1, "the wait on the Vercel deploys was not caught");

  // And the checks are not so wide that the script's own name trips them.
  assert.deepEqual(vercelGreenConditions("The Vercel deploys do not gate `merge-on-green.sh`."), []);
});

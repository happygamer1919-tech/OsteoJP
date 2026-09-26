// E2E runs only on an armed PR, and an unarmed PR is RED, never skipped-green.
//
// WHY THIS EXISTS. On 2026-09-24 the owner ruled that the E2E suite (three
// Supabase stacks, a median 28 runner-minutes a run) runs only once a PR is
// armed, plus two exemptions: a GATE-CHANGE title and the held-for-apply label.
// The obvious way to build that, a job-level `if:` on the required job, is a
// SILENT PASS: GitHub reports a job skipped by `if:` as "Success", required
// check or not. So the required job always runs and turns an unarmed PR red,
// and this file is what keeps that true. A gate that quietly stops failing
// looks exactly like a gate that passes.
//
// IT RUNS THE SHIPPED SHELL, NOT A COPY. The eligibility step and the verdict
// step are extracted from .github/workflows/e2e.yml by step name and executed
// the way the runner does (`bash -e`), the eligibility step with a stub `gh`
// that feeds fixture JSON through the workflow's OWN `--jq` expression via the
// real `jq`. Same pattern as held-for-apply-blocks-merge.test.mjs and
// auto-update-prs-fails-on-404.test.mjs.
//
// SEEDED REAL FAILURES STILL FAIL (Tier B): an unarmed PR, an armed PR with a
// failed shard, shards skipped when they were meant to run, a failed
// eligibility job and an empty decision are each red. Exemptions, an
// unreadable state and an arming run whose read lags the arm RUN the suite.
// And disarmed copies of both blocks are shown to be caught, so a green run
// here is not a harness that cannot tell.
//
// It also pins the SHAPE the blocks depend on: the trigger types, the shards'
// one `if:`, the aggregate's `always()`, no required-context job with any other
// `if:`, DB Tests without push:main, and the concurrency blocks gated to
// pull_request so a run on main or a dispatch run is never cancelled.
//
// ONE LEVEL DOWN, TOO. A job whose only step is skipped by a step-level `if:`
// also concludes "Success", and `continue-on-error` turns a red step or job
// green. The in-job negative control sits inside the required step, so it
// cannot see its own step being skipped. So the required E2E job is pinned to
// exactly one step with no `if:` and no `continue-on-error`, no job in the four
// PR workflows sets `continue-on-error`, and every such edit is a seeded
// mutation below that must turn the pins red.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF = join(ROOT, ".github/workflows");
const read = (f) => readFileSync(join(WF, f), "utf8");
const E2E = read("e2e.yml");

const ELIGIBILITY_STEP = "Decide whether the E2E suite runs (live read of the PR)";
const VERDICT_STEP = "Verify the suite ran and every shard passed";

/** The four contexts branch protection requires (live read, 2026-09-25). */
const REQUIRED_CONTEXTS = [
  "DB-gated tests (RLS isolation, seeded DB)",
  "Lint + typecheck + test",
  "Playwright E2E (seeded DB)",
  "Validate spec + drift check",
];

// --------------------------------------------------------------------------
// Text helpers. No YAML dependency in this repo (standing rule 13), so these
// are textual and they THROW on a shape they do not recognise rather than
// testing the wrong text.
// --------------------------------------------------------------------------

/** The dedented `run: |` body of the step whose `- name:` is exactly `name`. */
function stepRun(text, name) {
  const lines = text.split("\n");
  const at = lines.flatMap((l, i) => (l.trimEnd() === `      - name: ${name}` ? [i] : []));
  assert.equal(at.length, 1, `expected exactly one step named "${name}", found ${at.length}`);
  let runAt = -1;
  for (let i = at[0] + 1; i < lines.length; i++) {
    if (/^ {6}- name:/.test(lines[i]) || /^ {0,4}\S/.test(lines[i])) break;
    if (/^ {8}run: \|\s*$/.test(lines[i])) {
      runAt = i;
      break;
    }
  }
  assert.notEqual(runAt, -1, `step "${name}" has no "        run: |" block`);
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (!line.startsWith(" ".repeat(10))) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

/** The top-level block at `^key:`, up to the next column-0 line, trailing blanks trimmed. */
function topBlock(text, key) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l === `${key}:`);
  if (at === -1) return null;
  const out = [lines[at]];
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").replace(/\n\s*$/, "");
}

/** Jobs of a workflow: { id, text, name, ifs (job-level `if:` lines) }. */
function jobs(text) {
  const block = topBlock(text, "jobs");
  assert.ok(block, "no top-level jobs: block");
  const lines = block.split("\n");
  const starts = lines.flatMap((l, i) => (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(l) ? [i] : []));
  return starts.map((s, n) => {
    const body = lines.slice(s, starts[n + 1] ?? lines.length);
    const jobLevel = body.filter((l) => /^ {4}\S/.test(l) && !/^ {4}#/.test(l));
    return {
      id: body[0].trim().replace(/:$/, ""),
      text: body.join("\n"),
      name: (jobLevel.find((l) => /^ {4}name:/.test(l)) ?? "").replace(/^ {4}name:\s*/, "").trim(),
      ifs: jobLevel.filter((l) => /^ {4}if:/.test(l)).map((l) => l.trim()),
      coe: jobLevel.filter((l) => /^ {4}continue-on-error:/.test(l)).map((l) => l.trim()),
      needs: (jobLevel.find((l) => /^ {4}needs:/.test(l)) ?? "").trim(),
    };
  });
}

const job = (text, id) => {
  const j = jobs(text).find((x) => x.id === id);
  assert.ok(j, `no job "${id}"`);
  return j;
};

/** Steps of one job's text: [{ name, keys }], keys being the step's own keys. */
function stepsOf(jobText) {
  const lines = jobText.split("\n");
  const at = lines.findIndex((l) => l === "    steps:");
  assert.notEqual(at, -1, `job has no "    steps:" line:\n${lines[0]}`);
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "" || /^ {0,6}#/.test(l)) continue;
    if (/^ {0,5}\S/.test(l)) break;
    const first = l.match(/^ {6}- ([A-Za-z0-9_-]+):(.*)$/);
    if (first) {
      out.push({ name: first[1] === "name" ? first[2].trim() : "", keys: [first[1]] });
      continue;
    }
    if (/^ {6}\S/.test(l)) throw new Error(`unrecognised line in a steps: list: ${l}`);
    const key = l.match(/^ {8}([A-Za-z0-9_-]+):(.*)$/);
    if (key) {
      assert.ok(out.length, `a step key before any step: ${l}`);
      const s = out[out.length - 1];
      s.keys.push(key[1]);
      if (key[1] === "name") s.name = key[2].trim();
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Running the shipped blocks.
// --------------------------------------------------------------------------

const ELIGIBILITY = stepRun(E2E, ELIGIBILITY_STEP);
const VERDICT = stepRun(E2E, VERDICT_STEP);

/** Is GNU coreutils timeout(1) on PATH? Every ubuntu runner has it; macOS does not. */
const HAS_TIMEOUT = spawnSync("timeout", ["5", "true"], { encoding: "utf8" }).status === 0;

// TEST-ONLY stand-in for timeout(1), installed into the stub bin ONLY on a
// machine that has none (a Mac), so the shipped block can run there at all.
// CI's quality job runs on ubuntu and uses the real one (pinned below). Same
// contract: run the command, exit 124 if it outlives the limit, else its code.
const TIMEOUT_SHIM = `#!/bin/sh
secs="$1"; shift
flag="\${TMPDIR:-/tmp}/timeout-shim-$$"
"$@" &
cmd=$!
(
  trap 'kill "$s" 2>/dev/null; exit 0' TERM
  sleep "$secs" & s=$!
  wait "$s"
  : > "$flag"
  kill -TERM "$cmd" 2>/dev/null
) </dev/null >/dev/null 2>&1 &
dog=$!
wait "$cmd"; rc=$?
kill "$dog" 2>/dev/null; wait "$dog" 2>/dev/null
if [ -e "$flag" ]; then rm -f "$flag"; exit 124; fi
exit "$rc"
`;

/** A stub `gh`: logs its argv, then answers per GH_STUB_MODE. */
function stubBin(dir) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  if (!HAS_TIMEOUT) {
    writeFileSync(join(bin, "timeout"), TIMEOUT_SHIM);
    chmodSync(join(bin, "timeout"), 0o755);
  }
  // `hang` never answers: `exec` so the stub's pid IS the sleep (a timeout
  // kills exactly it), stderr closed so an orphaned sleep holds no pipe.
  const gh = `#!/bin/sh
printf '%s' "$*" | tr '\\n' ' ' >> "$GH_STUB_LOG"; echo >> "$GH_STUB_LOG"
case "$GH_STUB_MODE" in
  error) echo "HTTP 502: stub gateway error" >&2; exit 1 ;;
  raw) printf '%s' "$GH_STUB_RAW"; exit 0 ;;
  hang) exec sleep "\${GH_STUB_SLEEP:-30}" 2>/dev/null ;;
esac
expr=""
while [ $# -gt 0 ]; do
  case "$1" in
    --jq|-q) expr="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -z "$expr" ]; then printf '%s\\n' "$GH_STUB_JSON"; exit 0; fi
printf '%s' "$GH_STUB_JSON" | jq -r "$expr"
`;
  writeFileSync(join(bin, "gh"), gh);
  chmodSync(join(bin, "gh"), 0o755);
  return bin;
}

/** The live read's ceiling, as the workflow's step env sets it. */
const READ_TIMEOUT_S = (() => {
  const m = job(E2E, "eligibility").text.match(/^ {10}GH_READ_TIMEOUT_S: "(\d+)"$/m);
  assert.ok(m, 'the eligibility step env no longer sets GH_READ_TIMEOUT_S: "<seconds>"');
  return m[1];
})();

/** Run the eligibility block; returns exit code, output, the run= value, gh calls. */
function eligibility({
  block = ELIGIBILITY,
  event = "pull_request",
  action,
  pr = "4242",
  mode = "json",
  json,
  raw,
  readTimeout = READ_TIMEOUT_S,
  sleep = "30",
  killAfterMs,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-eligibility-"));
  const bin = stubBin(dir);
  const script = join(dir, "step.sh");
  writeFileSync(script, block);
  const outputs = join(dir, "output");
  const summary = join(dir, "summary");
  const log = join(dir, "gh.log");
  writeFileSync(outputs, "");
  writeFileSync(summary, "");
  writeFileSync(log, "");
  const r = spawnSync("bash", ["-e", script], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_TOKEN: "stub-token-not-a-secret",
      EVENT: event,
      ACTION: action ?? (event === "pull_request" ? "opened" : ""),
      PR: pr,
      REPO: "owner/repo",
      GITHUB_OUTPUT: outputs,
      GITHUB_STEP_SUMMARY: summary,
      GH_STUB_LOG: log,
      GH_STUB_MODE: mode,
      GH_STUB_JSON: json === undefined ? "" : JSON.stringify(json),
      GH_STUB_RAW: raw ?? "",
      GH_STUB_SLEEP: sleep,
      GH_READ_TIMEOUT_S: readTimeout,
    },
    encoding: "utf8",
    ...(killAfterMs ? { timeout: killAfterMs, killSignal: "SIGTERM" } : {}),
  });
  const out = readFileSync(outputs, "utf8");
  const runs = out.split("\n").filter((l) => l.startsWith("run="));
  return {
    code: r.status,
    signal: r.signal,
    log: `${r.stdout}${r.stderr}`,
    runLines: runs,
    run: runs.length === 1 ? runs[0].slice(4) : `(${runs.length} run= lines)`,
    calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
    summary: readFileSync(summary, "utf8"),
  };
}

/** Run the verdict block with the three `needs` values GitHub would pass in. */
function verdict({ block = VERDICT, eligibility: elig, run, shards }) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-verdict-"));
  const script = join(dir, "step.sh");
  writeFileSync(script, block);
  const summary = join(dir, "summary");
  writeFileSync(summary, "");
  const r = spawnSync("bash", ["-e", script], {
    env: {
      ...process.env,
      ELIGIBILITY: elig,
      RUN: run,
      WHY: "seeded by the test",
      SHARDS: shards,
      GITHUB_STEP_SUMMARY: summary,
    },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, summary: readFileSync(summary, "utf8") };
}

const pr = (over = {}) => ({ autoMergeRequest: null, title: "feat: a change", labels: [], ...over });
const ARMED = { enabledAt: "2026-09-25T00:00:00Z", mergeMethod: "SQUASH" };
const label = (name) => ({ id: "L", name, description: "", color: "ededed" });

// --------------------------------------------------------------------------
// Preconditions: the tools the blocks call are here, so a missing one cannot
// pass as a decision.
// --------------------------------------------------------------------------

test("jq and bash are on PATH (the stub gh pipes through the real jq)", () => {
  assert.equal(spawnSync("jq", ["--version"], { encoding: "utf8" }).status, 0, "jq is required");
  assert.equal(spawnSync("bash", ["--version"], { encoding: "utf8" }).status, 0, "bash is required");
});

test("both blocks were extracted and read their inputs only from env", () => {
  assert.match(ELIGIBILITY, /gh pr view "\$PR" -R "\$REPO" --json autoMergeRequest,title,labels/);
  assert.match(VERDICT, /verdict\(\)/);
  for (const [n, b] of [["eligibility", ELIGIBILITY], ["verdict", VERDICT]]) {
    assert.ok(!b.includes("${{"), `the ${n} block interpolates \${{ }} into the script; move it to env: so this test runs what ships`);
  }
});

// --------------------------------------------------------------------------
// ELIGIBILITY: the live read, with a stub gh.
// --------------------------------------------------------------------------

const ELIGIBILITY_CASES = [
  { why: "an ordinary unarmed PR", json: pr(), run: "false" },
  { why: "an armed PR", json: pr({ autoMergeRequest: ARMED }), run: "true" },
  { why: "a GATE-CHANGE title, unarmed", json: pr({ title: "GATE-CHANGE: x" }), run: "true" },
  { why: "a GATE-CHANGE title after leading space", json: pr({ title: "  GATE-CHANGE: x" }), run: "true" },
  { why: "a gate-change title in lower case (too wide is the safe side)", json: pr({ title: "gate-change: x" }), run: "true" },
  { why: "GATE-CHANGE not at the start", json: pr({ title: "feat: not a GATE-CHANGE" }), run: "false" },
  { why: "the held-for-apply label", json: pr({ labels: [label("held-for-apply")] }), run: "true" },
  { why: "the label in another case", json: pr({ labels: [label("Held-For-Apply")] }), run: "true" },
  { why: "the label among others", json: pr({ labels: [label("bug"), label("held-for-apply"), label("ci")] }), run: "true" },
  { why: "a longer label name is another label", json: pr({ labels: [label("held-for-apply-later")] }), run: "false" },
  { why: "a prefixed label name is another label", json: pr({ labels: [label("not-held-for-apply")] }), run: "false" },
  { why: "armed, GATE-CHANGE and held at once", json: pr({ autoMergeRequest: ARMED, title: "GATE-CHANGE: x", labels: [label("held-for-apply")] }), run: "true" },
];

for (const c of ELIGIBILITY_CASES) {
  test(`eligibility: ${c.why} -> run=${c.run}`, () => {
    const r = eligibility({ json: c.json });
    assert.equal(r.code, 0, r.log);
    assert.equal(r.runLines.length, 1, `exactly one run= line expected:\n${r.log}`);
    assert.equal(r.run, c.run, r.log);
    assert.doesNotMatch(r.log, /::warning/, "a clean read must not warn");
    assert.match(r.summary, new RegExp(`E2E eligibility: run=${c.run}`));
  });
}

test("eligibility: it asks gh for exactly this PR, in this repo, and these fields", () => {
  const r = eligibility({ json: pr() });
  assert.equal(r.calls.length, 1, r.calls.join("\n"));
  assert.match(r.calls[0], /^pr view 4242 -R owner\/repo --json autoMergeRequest,title,labels --jq /);
});

// FAIL TOWARD RUNNING. Every one of these is a read that did not come back as
// a clean true/false triple, and every one must RUN the suite, with a warning.
const UNREADABLE = [
  { why: "gh exits non-zero", mode: "error" },
  { why: "gh answers garbage", mode: "raw", raw: "maybe" },
  { why: "gh answers nothing", mode: "raw", raw: "" },
  { why: "two words instead of three", mode: "raw", raw: "false false" },
  { why: "a fourth word", mode: "raw", raw: "false false false extra" },
  { why: "a second line", mode: "raw", raw: "false false false\nfalse false false" },
  { why: "a word that is not a boolean", mode: "raw", raw: "false null false" },
  { why: "the autoMergeRequest key is missing", json: { title: "feat: x", labels: [] } },
  { why: "labels is not an array", json: { autoMergeRequest: null, title: "feat: x", labels: null } },
  { why: "title is not a string", json: { autoMergeRequest: null, title: null, labels: [] } },
  { why: "the answer is not an object", json: [] },
];

for (const c of UNREADABLE) {
  test(`eligibility: ${c.why} -> the suite RUNS, with a warning`, () => {
    const r = eligibility({ mode: c.mode ?? "json", json: c.json, raw: c.raw });
    assert.equal(r.code, 0, r.log);
    assert.equal(r.run, "true", `an unreadable state must run the suite:\n${r.log}`);
    assert.match(r.log, /::warning title=E2E eligibility unread, the suite runs::/);
  });
}

test("eligibility: no usable PR number runs the suite and never calls gh", () => {
  for (const n of ["", "12a", "-1"]) {
    const r = eligibility({ pr: n, json: pr() });
    assert.equal(r.run, "true", `PR='${n}':\n${r.log}`);
    assert.equal(r.calls.length, 0, `PR='${n}' still called gh`);
  }
});

test("eligibility: a workflow_dispatch proving run always runs and never calls gh", () => {
  const r = eligibility({ event: "workflow_dispatch", pr: "", json: pr() });
  assert.equal(r.code, 0, r.log);
  assert.equal(r.run, "true", r.log);
  assert.equal(r.calls.length, 0, "a dispatch run has no PR to read");
});

test("eligibility: the step summary names the event and the action that started the run", () => {
  // THE POST-MERGE EVIDENCE. A never-armed GATE-CHANGE PR cannot show that
  // arming starts the suite; the first ordinary PR after the merge can, and
  // this line in its run summary is where that is read.
  const r = eligibility({ action: "auto_merge_enabled", json: pr({ autoMergeRequest: ARMED }) });
  assert.equal(r.run, "true", r.log);
  assert.match(r.summary, /- event: pull_request, action: auto_merge_enabled, PR: 4242/);
  assert.match(r.summary, /- reason: armed: auto-merge is enabled/);
  const d = eligibility({ event: "workflow_dispatch", action: "", pr: "" });
  assert.match(d.summary, /- event: workflow_dispatch, action: none, PR: none/);
});

test("eligibility: a disarmed copy is caught (an unread state skipping the suite)", () => {
  // The fall-through, patched to decide false. The harness must see it.
  const disarmed = ELIGIBILITY.replace(
    'decide true "state could not be read, so the suite runs. $1"',
    'decide false "state could not be read. $1"',
  );
  assert.notEqual(disarmed, ELIGIBILITY, "the disarm substitution did not apply");
  assert.equal(eligibility({ block: disarmed, mode: "error" }).run, "false");
  assert.equal(eligibility({ mode: "error" }).run, "true");
});

// ARMED BY THIS VERY EVENT, READ AS UNARMED. An auto_merge_enabled run whose
// read lags the arm (or races a disarm) would otherwise decide false, and no
// later event starts a run on that head: an armed PR red until someone re-runs
// it. So that one clean `false` runs the suite, with a warning, and only that
// one: every other action with the same read still skips.

test("eligibility: an arming run that reads a clean unarmed state RUNS, with a warning", () => {
  const r = eligibility({ action: "auto_merge_enabled", json: pr() });
  assert.equal(r.code, 0, r.log);
  assert.equal(r.runLines.length, 1, r.log);
  assert.equal(r.run, "true", `an arming run read as unarmed must run the suite:\n${r.log}`);
  assert.match(r.log, /^::warning title=E2E eligibility: started by arming, read as unarmed, the suite runs::/m);
  assert.match(r.summary, /- event: pull_request, action: auto_merge_enabled, PR: 4242/);
  assert.match(r.summary, /- reason: started by auto_merge_enabled although the live read says unarmed/);
});

test("eligibility: every other action with a clean unarmed read still SKIPS, without a warning", () => {
  for (const action of ["opened", "synchronize", "reopened", "", "auto_merge_disabled", "AUTO_MERGE_ENABLED"]) {
    const r = eligibility({ action, json: pr() });
    assert.equal(r.code, 0, `action='${action}':\n${r.log}`);
    assert.equal(r.run, "false", `action='${action}' ran the suite on an unarmed PR:\n${r.log}`);
    assert.doesNotMatch(r.log, /::warning/, `action='${action}' warned on a clean read`);
  }
});

test("eligibility: a disarmed copy (the arming rule removed) is caught: the arming run skips", () => {
  const disarmed = ELIGIBILITY.replace('if [ "${ACTION:-}" = "auto_merge_enabled" ]; then', "if false; then");
  assert.notEqual(disarmed, ELIGIBILITY, "the disarm substitution did not apply");
  assert.equal(eligibility({ block: disarmed, action: "auto_merge_enabled", json: pr() }).run, "false");
  assert.equal(eligibility({ action: "auto_merge_enabled", json: pr() }).run, "true");
});

// A READ THAT HANGS IS A READ THAT FAILED. Without its own ceiling, a hung
// `gh pr view` runs into the job's timeout-minutes, the job ends with no
// decision, and the required check is a red stall that needs "Re-run all
// jobs": fail-closed, where the ruling says an unread state RUNS the suite.

const READ_WRAPPER = 'timeout "${GH_READ_TIMEOUT_S:-60}" gh pr view';

test("eligibility: the live read carries its own ceiling, well inside the job's", () => {
  assert.ok(ELIGIBILITY.includes(READ_WRAPPER), `the live read is no longer wrapped in ${READ_WRAPPER}`);
  const m = job(E2E, "eligibility").text.match(/^ {4}timeout-minutes: (\d+)$/m);
  assert.ok(m, "the eligibility job has no timeout-minutes");
  assert.equal(READ_TIMEOUT_S, "60");
  assert.ok(Number(READ_TIMEOUT_S) * 2 <= Number(m[1]) * 60, `a ${READ_TIMEOUT_S}s read ceiling leaves no room inside a ${m[1]}-minute job`);
});

test("timeout(1): CI runs the shipped block on the REAL coreutils timeout, never the shim", (t) => {
  if (process.env.GITHUB_ACTIONS === "true") {
    assert.ok(HAS_TIMEOUT, "the CI runner has no timeout(1); the eligibility step would exit 127 on every PR and always run the suite");
  } else if (!HAS_TIMEOUT) {
    t.diagnostic("no timeout(1) on this machine: the eligibility arms ran on the test-only shim");
  }
});

test("eligibility: a read that hangs is cut off at the ceiling and the suite RUNS, with a warning", () => {
  const started = Date.now();
  const r = eligibility({ mode: "hang", readTimeout: "2", sleep: "30", json: pr() });
  const took = Date.now() - started;
  assert.equal(r.code, 0, r.log);
  assert.equal(r.run, "true", `a hung read must run the suite:\n${r.log}`);
  assert.match(r.log, /did not answer within 2s \(exit 124\)/);
  assert.match(r.log, /::warning title=E2E eligibility unread, the suite runs::/);
  assert.equal(r.calls.length, 1, "gh was not called");
  assert.ok(took < 20_000, `the hung read took ${took} ms; the ceiling did not cut it off`);
});

test("eligibility: a disarmed copy (no ceiling on the read) is caught: a hang leaves NO decision", () => {
  const disarmed = ELIGIBILITY.replace('timeout "${GH_READ_TIMEOUT_S:-60}" gh pr view', "gh pr view");
  assert.notEqual(disarmed, ELIGIBILITY, "the disarm substitution did not apply");
  // killAfterMs stands in for the job's timeout-minutes: the runner kills the
  // step, nothing is written to GITHUB_OUTPUT, and the verdict fails closed.
  const r = eligibility({ block: disarmed, mode: "hang", sleep: "20", killAfterMs: 3000, json: pr() });
  assert.equal(r.code, null, `the unwrapped read returned on its own:\n${r.log}`);
  assert.equal(r.runLines.length, 0, `a killed step still wrote a decision:\n${r.log}`);
  assert.equal(verdict({ eligibility: "failure", run: "", shards: "skipped" }).code, 1);
});

// --------------------------------------------------------------------------
// VERDICT: the required check. Seeded real failures must fail.
// --------------------------------------------------------------------------

const RED = [
  { why: "an unarmed PR (eligibility said false, shards skipped)", eligibility: "success", run: "false", shards: "skipped", says: /E2E did not run: arm the PR and the suite starts/ },
  { why: "an armed PR whose shard failed", eligibility: "success", run: "true", shards: "failure", says: /shard aggregate result is 'failure'/ },
  { why: "shards skipped although they were meant to run", eligibility: "success", run: "true", shards: "skipped", says: /shard aggregate result is 'skipped'/ },
  { why: "shards cancelled", eligibility: "success", run: "true", shards: "cancelled", says: /shard aggregate result is 'cancelled'/ },
  { why: "the eligibility job failed", eligibility: "failure", run: "", shards: "skipped", says: /eligibility job did not succeed \(result 'failure'\)/ },
  { why: "the eligibility job was cancelled", eligibility: "cancelled", run: "", shards: "skipped", says: /did not succeed \(result 'cancelled'\)/ },
  { why: "an empty decision, even with green shards", eligibility: "success", run: "", shards: "success", says: /gave no decision \(run=''\)/ },
  { why: "a decision that is not true or false", eligibility: "success", run: "maybe", shards: "success", says: /gave no decision \(run='maybe'\)/ },
];

for (const c of RED) {
  test(`verdict RED: ${c.why}`, () => {
    const r = verdict(c);
    assert.equal(r.code, 1, `a seeded failure PASSED the required check:\n${r.out}`);
    assert.match(r.out, c.says);
    assert.match(r.out, /^::error/m, "a red verdict must raise an ::error annotation");
  });
}

test("verdict: an unarmed PR says so out loud, in the annotations and the summary", () => {
  const r = verdict({ eligibility: "success", run: "false", shards: "skipped" });
  assert.match(r.out, /^::notice title=E2E DID NOT RUN::/m);
  assert.match(r.out, /^::error title=E2E did not run::E2E did not run: arm the PR and the suite starts/m);
  assert.match(r.summary, /DID NOT RUN, and this check is red on purpose/);
});

test("verdict GREEN: meant to run, all three shards succeeded", () => {
  const r = verdict({ eligibility: "success", run: "true", shards: "success" });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /All three E2E shards succeeded\./);
});

test("verdict: the in-job negative control runs on every verdict, green included", () => {
  const r = verdict({ eligibility: "success", run: "true", shards: "success" });
  for (const l of ["unarmed PR, shards skipped", "armed PR, a shard failed", "armed PR, all shards green"]) {
    assert.match(r.out, new RegExp(`negative control OK: '${l.replace(/[()]/g, "\\$&")}'`), r.out);
  }
  // The control quotes the seeded verdict's lines behind a prefix, so a green
  // run carries NO ::error annotation from them.
  assert.doesNotMatch(r.out, /^::error/m, `a green verdict raised an annotation:\n${r.out}`);
  assert.doesNotMatch(r.out, /^::notice/m);
});

test("verdict: a disarmed verdict is caught by the IN-JOB control, even on real green inputs", () => {
  // Patch the unarmed branch to pass. The control must now fail the step
  // before the real verdict is reached.
  const unarmedPasses = VERDICT.replace(
    /(E2E did not run: arm the PR and the suite starts[^\n]*\n\s*)return 1/,
    "$1return 0",
  );
  assert.notEqual(unarmedPasses, VERDICT, "the unarmed disarm did not apply");
  let r = verdict({ block: unarmedPasses, eligibility: "success", run: "true", shards: "success" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /NEGATIVE CONTROL FAILED::verdict\(success false skipped\)/);

  // Patch the shard check out. Same: the control catches it.
  const shardsIgnored = VERDICT.replace('if [ "$3" != "success" ]; then', 'if false; then');
  assert.notEqual(shardsIgnored, VERDICT, "the shard disarm did not apply");
  r = verdict({ block: shardsIgnored, eligibility: "success", run: "true", shards: "success" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /NEGATIVE CONTROL FAILED::verdict\(success true failure\)/);
});

test("verdict: the harness itself can see a disarmed verdict when the control is removed too", () => {
  // Without this, "every red case above is red" could be a harness that
  // cannot run the block at all.
  const noControl = VERDICT.replace(/^control "[^\n]*\n/gm, "").replace(
    /(E2E did not run: arm the PR and the suite starts[^\n]*\n\s*)return 1/,
    "$1return 0",
  );
  assert.doesNotMatch(noControl, /^control "/m, "the control lines were not removed");
  assert.equal(verdict({ block: noControl, eligibility: "success", run: "false", shards: "skipped" }).code, 0);
  assert.equal(verdict({ eligibility: "success", run: "false", shards: "skipped" }).code, 1);
});

// --------------------------------------------------------------------------
// END TO END: the eligibility answer feeds the verdict exactly as GitHub would.
// The shards run iff run == 'true' (the pinned `if:` below); otherwise GitHub
// reports them `skipped`.
// --------------------------------------------------------------------------

for (const c of [
  { why: "unarmed PR", json: pr(), shardOutcome: "success", code: 1 },
  { why: "armed PR, shards green", json: pr({ autoMergeRequest: ARMED }), shardOutcome: "success", code: 0 },
  { why: "armed PR, a shard red", json: pr({ autoMergeRequest: ARMED }), shardOutcome: "failure", code: 1 },
  { why: "GATE-CHANGE PR, shards green", json: pr({ title: "GATE-CHANGE: x" }), shardOutcome: "success", code: 0 },
  { why: "held-for-apply PR, a shard red", json: pr({ labels: [label("held-for-apply")] }), shardOutcome: "failure", code: 1 },
  { why: "arming run read as unarmed (lag), shards green", action: "auto_merge_enabled", json: pr(), shardOutcome: "success", code: 0 },
  { why: "arming run read as unarmed (lag), a shard red", action: "auto_merge_enabled", json: pr(), shardOutcome: "failure", code: 1 },
  { why: "a push to an unarmed PR", action: "synchronize", json: pr(), shardOutcome: "success", code: 1 },
]) {
  test(`end to end: ${c.why} -> required check exits ${c.code}`, () => {
    const e = eligibility({ action: c.action, json: c.json });
    const shards = e.run === "true" ? c.shardOutcome : "skipped";
    const v = verdict({ eligibility: e.code === 0 ? "success" : "failure", run: e.run, shards });
    assert.equal(v.code, c.code, `${e.log}\n${v.out}`);
  });
}

// --------------------------------------------------------------------------
// STRUCTURE PINS: the shape the blocks above depend on.
// --------------------------------------------------------------------------

test("e2e.yml: pull_request types are the three defaults plus auto_merge_enabled", () => {
  const on = topBlock(E2E, "on");
  const m = on.match(/^ {4}types: \[([^\]]*)\]$/m);
  assert.ok(m, "pull_request types list not found");
  const types = m[1].split(",").map((s) => s.trim());
  for (const t of ["opened", "synchronize", "reopened", "auto_merge_enabled"]) {
    assert.ok(types.includes(t), `pull_request type ${t} is missing; declaring types REPLACES the defaults`);
  }
  assert.match(on, /^ {2}pull_request:\n {4}branches: \[main\]$/m);
  assert.match(on, /^ {2}workflow_dispatch:$/m, "the workflow_dispatch proving runs are gone");
  for (const input of ["grep", "retries", "unquarantine"]) {
    assert.match(on, new RegExp(`^ {6}${input}:$`, "m"), `dispatch input ${input} is gone`);
  }
});

test("e2e.yml: the eligibility job always runs, reads only the PR, and exports run", () => {
  const j = job(E2E, "eligibility");
  assert.equal(j.name, "E2E eligibility");
  assert.deepEqual(j.ifs, [], "the eligibility job must never be skipped");
  assert.match(j.text, /^ {4}permissions:\n {6}pull-requests: read$/m);
  assert.match(j.text, /^ {6}run: \$\{\{ steps\.decide\.outputs\.run \}\}$/m);
  assert.match(j.text, /^ {10}PR: \$\{\{ github\.event\.pull_request\.number \}\}$/m);
  assert.match(j.text, /^ {10}EVENT: \$\{\{ github\.event_name \}\}$/m);
  assert.match(j.text, /^ {10}ACTION: \$\{\{ github\.event\.action \}\}$/m);
  assert.match(j.text, /^ {10}REPO: \$\{\{ github\.repository \}\}$/m);
});

test("e2e.yml: the shards' ONLY job-level if: is exactly the eligibility output", () => {
  const j = job(E2E, "shard");
  assert.equal(j.needs, "needs: [eligibility]");
  assert.deepEqual(j.ifs, ["if: needs.eligibility.outputs.run == 'true'"]);
});

test("e2e.yml: the required aggregate needs both jobs and keeps if: always()", () => {
  const j = job(E2E, "playwright");
  assert.equal(j.name, "Playwright E2E (seeded DB)");
  assert.equal(j.needs, "needs: [eligibility, shard]");
  assert.deepEqual(j.ifs, ["if: always()"]);
  assert.match(j.text, /ELIGIBILITY: \$\{\{ needs\.eligibility\.result \}\}/);
  assert.match(j.text, /RUN: \$\{\{ needs\.eligibility\.outputs\.run \}\}/);
  assert.match(j.text, /SHARDS: \$\{\{ needs\.shard\.result \}\}/);
});

// THE COMMENTS COUNT THEM, SO THE COUNT IS PINNED. e2e.yml relies on its
// comments to stop the next editor adding a job-level `if:`. A comment that
// calls the shards' `if:` the file's only one misstates the aggregate's
// `always()`, the one `if:` that must never change.
test("e2e.yml: its job-level if: lines are the shards' and the aggregate's, and no comment says there is one", () => {
  const all = jobs(E2E).flatMap((j) => j.ifs.map((i) => `${j.id} ${i}`));
  assert.deepEqual(all, ["shard if: needs.eligibility.outputs.run == 'true'", "playwright if: always()"]);
  const lines = E2E.split("\n");
  const miscount = lines.filter(
    (l) => /^\s*#/.test(l) && /\b(ONE|ONLY|SINGLE)\s+JOB-LEVEL\s+`?if:?`?\s+IN THIS FILE\b(?!\s+OTHER THAN)/i.test(l),
  );
  assert.deepEqual(miscount, [], "a comment claims e2e.yml has a single job-level if:, but it has two");
  const at = lines.indexOf("    if: needs.eligibility.outputs.run == 'true'");
  assert.notEqual(at, -1, "the shards' if: line was not found");
  const above = [];
  for (let i = at - 1; i >= 0 && /^ {4}#/.test(lines[i]); i--) above.unshift(lines[i]);
  assert.match(above.join("\n"), /always\(\)/, "the comment on the shards' if: must name the aggregate's always() as the other one");
});

test("no job carrying a REQUIRED context has any job-level if: other than always()", () => {
  // A job skipped by `if:` reports Success to branch protection. On a required
  // context that is a pass nobody earned.
  const seen = new Set();
  for (const f of readdirSync(WF).filter((x) => /\.ya?ml$/.test(x))) {
    for (const j of jobs(read(f))) {
      if (!REQUIRED_CONTEXTS.includes(j.name)) continue;
      seen.add(j.name);
      for (const i of j.ifs) {
        assert.equal(i, "if: always()", `${f} job ${j.id} ("${j.name}") has "${i}"; a skipped required job reads as a pass`);
      }
    }
  }
  assert.deepEqual([...seen].sort(), [...REQUIRED_CONTEXTS].sort(), "a required context's job was not found");
});

// ONE LEVEL DOWN. The job-level pins above are not enough on their own: a
// step-level `if:` that skips the required job's only step, or any
// `continue-on-error`, reads green as surely as a skipped job does.

/** The four PR workflows whose jobs feed a required context. */
const PR_WORKFLOWS = ["ci.yml", "db-tests.yml", "e2e.yml", "openapi-drift.yml"];

/** [file, job id, step name]: the only step-level continue-on-error allowed. */
const ALLOWED_STEP_CONTINUE_ON_ERROR = [["e2e.yml", "shard", "Set up Supabase CLI"]];

/** Every way the given workflow texts could turn a red required check green. */
function silentPassHoles(files) {
  const holes = [];
  for (const [f, text] of Object.entries(files)) {
    for (const j of jobs(text)) {
      const required = REQUIRED_CONTEXTS.includes(j.name);
      for (const c of j.coe) holes.push(`${f} job ${j.id} sets job-level "${c}"`);
      if (required) {
        for (const i of j.ifs) {
          if (i !== "if: always()") holes.push(`${f} required job ${j.id} has "${i}"`);
        }
      }
      for (const st of stepsOf(j.text)) {
        if (!st.keys.includes("continue-on-error")) continue;
        const ok = ALLOWED_STEP_CONTINUE_ON_ERROR.some(([af, aj, as]) => af === f && aj === j.id && as === st.name);
        if (!ok) holes.push(`${f} job ${j.id} step "${st.name}" sets continue-on-error`);
      }
    }
  }
  const pw = job(files["e2e.yml"], "playwright");
  const st = stepsOf(pw.text);
  if (st.length !== 1) holes.push(`the required E2E job has ${st.length} steps; it must have exactly one`);
  if (st[0] && st[0].name !== VERDICT_STEP) holes.push(`the required E2E job's step is "${st[0].name}", not the verdict`);
  for (const k of ["if", "continue-on-error"]) {
    if (st.some((x) => x.keys.includes(k))) holes.push(`the required E2E job's step sets "${k}:"`);
  }
  if (pw.ifs.join(" | ") !== "if: always()") holes.push(`the required E2E job's job-level if: is "${pw.ifs.join(" | ")}"`);
  return holes;
}

const SHIPPED = Object.fromEntries(PR_WORKFLOWS.map((f) => [f, read(f)]));

test("the required E2E job is one step, with no if: and no continue-on-error, and no job sets continue-on-error", () => {
  assert.deepEqual(silentPassHoles(SHIPPED), []);
  const pw = stepsOf(job(E2E, "playwright").text);
  assert.deepEqual(pw.map((x) => x.name), [VERDICT_STEP]);
  // The allowlisted step still exists, so the allowlist is not a dead entry.
  assert.ok(
    stepsOf(job(E2E, "shard").text).some((x) => x.name === "Set up Supabase CLI" && x.keys.includes("continue-on-error")),
    "the allowlisted continue-on-error step is gone; drop it from ALLOWED_STEP_CONTINUE_ON_ERROR",
  );
});

/** Insert `add` right after the one line equal to `anchor` in `text`. */
function insertAfter(text, anchor, add) {
  const lines = text.split("\n");
  const at = lines.flatMap((l, i) => (l === anchor ? [i] : []));
  assert.equal(at.length, 1, `anchor "${anchor}" found ${at.length} times`);
  lines.splice(at[0] + 1, 0, ...add.split("\n"));
  return lines.join("\n");
}

const VERDICT_LINE = `      - name: ${VERDICT_STEP}`;
const SILENT_PASS_MUTATIONS = [
  {
    why: "a step-level if: on the verdict (an unarmed PR's only step skipped, the job green)",
    file: "e2e.yml",
    edit: (t) => insertAfter(t, VERDICT_LINE, "        if: needs.eligibility.outputs.run == 'true'"),
    says: /required E2E job's step sets "if:"/,
  },
  {
    why: "continue-on-error on the verdict step",
    file: "e2e.yml",
    edit: (t) => insertAfter(t, VERDICT_LINE, "        continue-on-error: true"),
    says: /step "Verify the suite ran and every shard passed" sets continue-on-error/,
  },
  {
    why: "job-level continue-on-error on the required playwright job",
    file: "e2e.yml",
    edit: (t) => insertAfter(t, "    name: Playwright E2E (seeded DB)", "    continue-on-error: true"),
    says: /e2e\.yml job playwright sets job-level "continue-on-error: true"/,
  },
  {
    why: "job-level continue-on-error on the shard job",
    file: "e2e.yml",
    edit: (t) => insertAfter(t, "    name: E2E shard", "    continue-on-error: true"),
    says: /e2e\.yml job shard sets job-level "continue-on-error: true"/,
  },
  {
    why: "a second step in the required job",
    file: "e2e.yml",
    edit: (t) => insertAfter(t, '          echo "All three E2E shards succeeded."', "\n      - name: Post a note\n        run: echo done"),
    says: /has 2 steps; it must have exactly one/,
  },
  {
    why: "continue-on-error on a shard's Playwright step (a red spec, a green shard)",
    file: "e2e.yml",
    edit: (t) => insertAfter(t, "      - name: Run Playwright E2E (Chromium, shard ${{ matrix.shard }}/3)", "        continue-on-error: ${{ github.event_name == 'pull_request' }}"),
    says: /step "Run Playwright E2E \(Chromium, shard \$\{\{ matrix\.shard \}\}\/3\)" sets continue-on-error/,
  },
  {
    why: "the aggregate's if: narrowed to the eligibility output",
    file: "e2e.yml",
    edit: (t) => t.replace("\n    if: always()\n", "\n    if: always() && needs.eligibility.outputs.run == 'true'\n"),
    says: /required job playwright has "if: always\(\) && needs\.eligibility\.outputs\.run == 'true'"/,
  },
  {
    why: "job-level continue-on-error on the required DB Tests job",
    file: "db-tests.yml",
    edit: (t) => insertAfter(t, "    name: DB-gated tests (RLS isolation, seeded DB)", "    continue-on-error: true"),
    says: /db-tests\.yml job rls sets job-level "continue-on-error: true"/,
  },
];

for (const m of SILENT_PASS_MUTATIONS) {
  test(`silent-pass pin catches a disarmed copy: ${m.why}`, () => {
    const mutated = m.edit(SHIPPED[m.file]);
    assert.notEqual(mutated, SHIPPED[m.file], "the mutation did not apply");
    const holes = silentPassHoles({ ...SHIPPED, [m.file]: mutated });
    assert.ok(holes.length > 0, `a disarmed ${m.file} passed the pins`);
    assert.ok(holes.some((h) => m.says.test(h)), `caught, but not for the named reason:\n${holes.join("\n")}`);
  });
}

test("db-tests.yml: no push trigger, and a non-PR event still counts as code", () => {
  const src = read("db-tests.yml");
  const on = topBlock(src, "on");
  assert.ok(on, "db-tests.yml has no on: block");
  assert.match(on, /^ {2}pull_request:$/m);
  assert.doesNotMatch(on, /^ {2}push:/m, "DB Tests runs on push again; the ruling removed it");
  assert.match(
    src,
    /if \[ "\$\{\{ github\.event_name \}\}" != "pull_request" \]; then\n\s*echo "code=true" >> "\$GITHUB_OUTPUT"/,
    "the detect step no longer treats a non-PR event as code",
  );
});

const CONCURRENCY =
  "concurrency:\n" +
  "  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}\n" +
  "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}";

for (const f of ["ci.yml", "db-tests.yml", "e2e.yml", "openapi-drift.yml"]) {
  test(`${f}: superseded PR runs cancel, a run on main or a dispatch run never does`, () => {
    const src = read(f);
    assert.equal(topBlock(src, "concurrency"), CONCURRENCY, `${f}'s workflow-level concurrency block is not the gated one`);
    assert.equal(src.split("\n").filter((l) => /^\s*concurrency:/.test(l)).length, 1, `${f} has a second concurrency block`);
  });
}

test("the workflows this change leaves alone keep their own concurrency rules", () => {
  // Cancelling a label-event run of held-for-apply-blocks-merge could leave a
  // stale red; prod-migrate must never be cancelled mid-apply.
  assert.doesNotMatch(read("held-for-apply-blocks-merge.yml"), /concurrency:/);
  const pm = read("prod-migrate.yml");
  assert.match(pm, /cancel-in-progress: false/);
  assert.doesNotMatch(pm, /cancel-in-progress: (true|\$\{\{)/);
});

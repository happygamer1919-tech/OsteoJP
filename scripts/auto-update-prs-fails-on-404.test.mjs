// The auto-update pass must FAIL when a branch update fails.
//
// WHY THIS EXISTS. Between at least 2026-09-05 and 2026-09-06 this workflow
// failed EVERY branch update with HTTP 404 - every PR, every run - and the runs
// list showed three green ticks. The update arm printed the code and continued;
// nothing set a non-zero exit. Four PRs were serialised through manual Update
// branch presses before anyone read the logs, because there was nothing to read
// them FOR: the workflow said it had succeeded.
//
// A PROSE COMMENT WOULD NOT HAVE CAUGHT IT, which is why this is mechanical. The
// failure was already printed, in full, on every run. It was read past because
// the run was green.
//
// IT RUNS THE SHIPPED SHELL, NOT A COPY. The `run:` block is extracted from
// .github/workflows/auto-update-prs.yml and executed with a stub `curl` on PATH.
// A restated copy would drift from the workflow the day somebody edits one and
// not the other - the same argument handover-counts-match-the-render.test.mjs
// makes for pinning the renderer's source.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(ROOT, ".github/workflows/auto-update-prs.yml");

/**
 * Pull the step's `run: |` block out of the workflow and dedent it.
 *
 * Hand-rolled rather than via a YAML parser because this repo has no YAML
 * dependency and one block scalar does not justify adding a third-party package
 * to a test. The shape is pinned by the assertion below: if the step is ever
 * re-indented or a second `run:` block appears, this throws rather than silently
 * testing the wrong text.
 */
function extractRunBlock() {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const starts = lines.reduce(
    (acc, l, i) => (/^ {8}run: \|\s*$/.test(l) ? [...acc, i] : acc),
    [],
  );
  assert.equal(
    starts.length,
    1,
    `expected exactly one "        run: |" line in ${WORKFLOW}, found ${starts.length}. ` +
      "The workflow's shape changed; this extractor must be updated with it.",
  );
  const body = [];
  for (let i = starts[0] + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (!line.startsWith(" ".repeat(10))) break;
    body.push(line.slice(10));
  }
  assert.ok(
    body.join("\n").includes("update-branch"),
    "extracted block is not the update step",
  );
  return body.join("\n");
}

/**
 * Run the extracted shell with a fake `curl` that answers by URL.
 *
 * The real `api()` calls `curl -sS -w '\n%{http_code}'`, so every stub reply is
 * BODY, newline, HTTP CODE - the exact contract the script parses with
 * `sed '$d'` and `tail -n1`.
 */
const ARMED_42 = {
  number: 42,
  draft: false,
  base: { ref: "main" },
  head: { ref: "feat/x", label: "o:feat/x" },
  auto_merge: { merge_method: "squash" },
};

function runPass({ updateCode = 202, prs = [ARMED_42], onlyPr = "", base = "main", script = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "auto-update-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);

  const list = JSON.stringify(prs);
  // Every update-branch call is logged, so a test can say WHICH PRs were updated,
  // not only whether the pass exited 0.
  const calls = join(dir, "update-calls");
  writeFileSync(calls, "");
  const curl = `#!/bin/sh
for a in "$@"; do
  case "$a" in
    *"/pulls?state=open"*) printf '%s\\n200\\n' '${list}'; exit 0 ;;
    *"/compare/"*)         printf '%s\\n200\\n' '{"behind_by":1}'; exit 0 ;;
    *"/update-branch"*)    printf '%s\\n' "$a" >> '${calls}'; printf '%s\\n${updateCode}\\n' '{"message":"stub"}'; exit 0 ;;
  esac
done
printf 'unexpected curl call\\n500\\n'; exit 0
`;
  const curlPath = join(bin, "curl");
  writeFileSync(curlPath, curl);
  chmodSync(curlPath, 0o755);

  const scriptPath = join(dir, "pass.sh");
  writeFileSync(scriptPath, script ?? extractRunBlock());

  const r = spawnSync("bash", [scriptPath], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AUTO_UPDATE_TOKEN: "stub-token-not-a-secret",
      REPO: "owner/repo",
      RUNNER_TEMP: dir,
      ONLY_PR: onlyPr,
      BASE: base,
    },
    encoding: "utf8",
  });
  const updated = readFileSync(calls, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((u) => Number(u.match(/\/pulls\/(\d+)\/update-branch/)[1]));
  return { status: r.status, out: `${r.stdout}${r.stderr}`, updated };
}

test("a 404 on update-branch FAILS the pass", () => {
  const { status, out } = runPass({ updateCode: 404 });
  assert.notEqual(
    status,
    0,
    "THE DEFECT IS BACK. update-branch returned 404 and the pass exited 0, which is " +
      "exactly the state this workflow shipped in for at least two days:\n" +
      out,
  );
  assert.match(out, /update failed \(HTTP 404\)/);
  assert.match(out, /AUTO_UPDATE_TOKEN cannot make this call/);
});

test("a 403 on update-branch FAILS the pass too", () => {
  // THE CODE THE WORKFLOW ACTUALLY FAILS WITH TODAY. Every run from 2026-09-16 20:24
  // onward returned 403 with {"message":"user doesn't have permission to update head
  // repository"}, not the 404 this file was written against. 403 reaches the same
  // `*)` arm, and this pins that rather than leaving it to inspection.
  const { status, out } = runPass({ updateCode: 403 });
  assert.notEqual(status, 0, `a 403 must fail the pass:\n${out}`);
  assert.match(out, /update failed \(HTTP 403\)/);
});

test("the remedy it prints asks for Contents: read AND WRITE", () => {
  // THIS ARM USED TO ASSERT THE EXACT OPPOSITE, and it was wrong. It required the
  // annotation to say "Pull requests: read and write" plus "Contents: read-only", and
  // it FAILED the pass if the string ever asked for Contents: write - on the reasoning
  // that "nothing in this workflow writes a file".
  //
  // THAT REASONING CONFUSED THE RUNNER WITH THE API. The job checks nothing out and
  // writes no file on disk. But `PUT /pulls/{n}/update-branch` "Updates the pull
  // request branch with the latest upstream changes by MERGING HEAD from the base
  // branch into the pull request branch" (GitHub REST reference), and the same page
  // adds: "If making a request on behalf of a GitHub App you must also have permissions
  // to write the contents of the head repository." It creates a commit. That is a
  // CONTENTS write, and the live 403 body names it exactly: "user doesn't have
  // permission to update head repository".
  //
  // So the previous version of this test PINNED A FALSE REMEDY. The owner acts on this
  // string; following it could not have cleared the 403, because it withheld the one
  // permission the failing call needs. The string is still pinned - pointing the right
  // way now.
  const { out } = runPass({ updateCode: 403 });
  assert.match(out, /Contents: read AND WRITE/);
  assert.match(out, /Pull requests: read/);
  assert.doesNotMatch(
    out,
    /Contents: read-only/,
    "the annotation is telling the owner Contents: read-only is enough. It is not: " +
      "update-branch merges the base branch into the head branch and needs Contents: write.",
  );
});

test("a 202 on update-branch keeps the pass green", () => {
  const { status, out } = runPass({ updateCode: 202 });
  assert.equal(status, 0, `a queued update must not fail the pass:\n${out}`);
  assert.match(out, /update queued/);
  assert.match(out, /Auto-update pass complete/);
});

test("a 422 is a human's merge conflict, not a broken pass", () => {
  const { status, out } = runPass({ updateCode: 422 });
  assert.equal(
    status,
    0,
    "422 means the branch genuinely conflicts and needs a human rebase. That is a " +
      `normal state of the world, not a broken workflow, and must stay green:\n${out}`,
  );
  assert.match(out, /Needs a human rebase/);
});

test("the failure is carried OUT of the loop's subshell", () => {
  // The loop is the right-hand side of a pipe, so it runs in a subshell and a
  // `failed=1` variable set inside it would be lost. This asserts the mechanism
  // that survives it, not just the exit code - so a future edit that swaps the
  // marker file for a variable fails HERE, with the reason, rather than silently
  // going green again.
  const block = extractRunBlock();
  assert.match(block, /failed_marker=/, "the failure marker is gone");
  assert.match(
    block,
    /: > "\$\{failed_marker\}"/,
    "nothing writes the failure marker",
  );
  assert.match(
    block,
    /if \[ -e "\$\{failed_marker\}" \]/,
    "nothing reads the failure marker",
  );
});

// ==========================================================================
// R1, STRATEGY 2026-10-25, OPTION (b): ONLY ARMED PRs ARE UPDATED
// ==========================================================================
// Before R1 every merge to main merged main into every open PR and started all
// their CI. Now a push updates only PRs armed for auto-merge, and arming a PR
// (pull_request_target, auto_merge_enabled) updates that one PR. Each case runs
// the shipped block and reads the update-branch calls it actually made.

const pr = (number, extra = {}) => ({
  number,
  draft: false,
  base: { ref: "main" },
  head: { ref: `feat/${number}`, label: `o:feat/${number}` },
  ...extra,
});
const ARMED = { auto_merge: { merge_method: "squash" } };

test("R1: a pass updates the armed PR and leaves the unarmed one BEHIND", () => {
  const { status, out, updated } = runPass({ prs: [pr(7, ARMED), pr(8), pr(9, { auto_merge: null })] });
  assert.equal(status, 0, out);
  assert.deepEqual(updated, [7], `only #7 is armed:\n${out}`);
  assert.match(out, /PR #8 \(feat\/8\): not armed for auto-merge - not updated, by rule \(R1\)/);
  assert.match(out, /PR #9 \(feat\/9\): not armed/);
});

test("R1: a PR object with no auto_merge field reads as unarmed, never as armed", () => {
  const { updated, out } = runPass({ prs: [pr(11)] });
  assert.deepEqual(updated, [], out);
});

test("R1: held-for-apply wins over armed", () => {
  const { updated, out } = runPass({ prs: [pr(12, { ...ARMED, labels: [{ name: "held-for-apply" }] })] });
  assert.deepEqual(updated, [], out);
  assert.match(out, /labelled held-for-apply - not updated, by rule/);
});

test("R1: arming (ONLY_PR) updates that PR and no other armed PR", () => {
  const { status, updated, out } = runPass({ prs: [pr(20, ARMED), pr(21, ARMED)], onlyPr: "21" });
  assert.equal(status, 0, out);
  assert.deepEqual(updated, [21], out);
  assert.match(out, /Only PR #21 is considered/);
});

test("R1: arming an unarmed PR number updates nothing (the PR is re-read, not trusted from the event)", () => {
  const { updated, out } = runPass({ prs: [pr(30), pr(31, ARMED)], onlyPr: "30" });
  assert.deepEqual(updated, [], out);
});

test("R1: an ONLY_PR that is not a number STOPS the pass rather than widening it", () => {
  const { status, updated, out } = runPass({ prs: [pr(40, ARMED)], onlyPr: "40 || true" });
  assert.notEqual(status, 0, out);
  assert.deepEqual(updated, [], out);
  assert.match(out, /ONLY_PR is not a PR number/);
});

test("R1: a PR into another base is never updated, armed or not", () => {
  const { updated, out } = runPass({ prs: [pr(50, { ...ARMED, base: { ref: "tmp/x" } })] });
  assert.deepEqual(updated, [], out);
});

test("R1: SEEDED FAILURE - a copy with the armed filter removed is caught by the cases above", () => {
  const disarmed = extractRunBlock().replace(
    /if \[ "\$\{armed\}" != "true" \]; then[\s\S]*?continue\n\s*fi\n/,
    "",
  );
  assert.notEqual(disarmed, extractRunBlock(), "the seeded mutation did not apply; the block's shape changed");
  const { updated } = runPass({ prs: [pr(7, ARMED), pr(8)], script: disarmed });
  assert.deepEqual(updated, [7, 8], "the harness cannot tell an armed-only pass from an update-everything pass");
});

// THE TRIGGERS. The block above cannot see how it is started, so the YAML is
// pinned: a push to main runs the pass; arming runs it for one PR; the default
// token holds no permission; arming never cancels a pass.
test("R1: the triggers, the permissions and the concurrency groups", () => {
  const text = readFileSync(WORKFLOW, "utf8");
  assert.match(text, /\non:\n  push:\n    branches: \[main\]\n  pull_request_target:\n    types: \[auto_merge_enabled\]\n  workflow_dispatch:/);
  assert.match(text, /\npermissions: \{\}\n/);
  assert.match(text, /ONLY_PR: \$\{\{ github\.event\.pull_request\.number \|\| inputs\.pr \|\| '' \}\}/);
  assert.match(text, /BASE: \$\{\{ github\.event\.pull_request\.base\.ref \|\| inputs\.base \|\| 'main' \}\}/);
  assert.match(text, /group: \$\{\{ github\.event_name == 'pull_request_target' && format\('auto-update-pr-\{0\}', github\.event\.pull_request\.number\) \|\| 'auto-update-prs' \}\}/);
  // pull_request_target runs with secrets: nothing of the PR may be checked out.
  assert.doesNotMatch(text, /actions\/checkout/);
  assert.doesNotMatch(text, /github\.event\.pull_request\.(head|title|body)/);
});

test("R1: with BASE set to a throwaway base, only its armed PRs are updated, against that base", () => {
  const { status, updated, out } = runPass({
    prs: [pr(60, { ...ARMED, base: { ref: "tmp/r1-base" } }), pr(61, { base: { ref: "tmp/r1-base" } }), pr(62, ARMED)],
    base: "tmp/r1-base",
  });
  assert.equal(status, 0, out);
  assert.deepEqual(updated, [60], `#61 is unarmed and #62 is into main:\n${out}`);
  assert.match(out, /Base branch: tmp\/r1-base \(not main\)/);
});

test("R1: a BASE that is not a branch name STOPS the pass", () => {
  const { status, updated, out } = runPass({ prs: [pr(70, ARMED)], base: "main; true" });
  assert.notEqual(status, 0, out);
  assert.deepEqual(updated, [], out);
  assert.match(out, /BASE is not a branch name/);
});

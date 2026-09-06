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
function runPass({ updateCode }) {
  const dir = mkdtempSync(join(tmpdir(), "auto-update-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);

  const list = JSON.stringify([
    {
      number: 42,
      draft: false,
      base: { ref: "main" },
      head: { ref: "feat/x", label: "o:feat/x" },
    },
  ]);
  const curl = `#!/bin/sh
for a in "$@"; do
  case "$a" in
    *"/pulls?state=open"*) printf '%s\\n200\\n' '${list}'; exit 0 ;;
    *"/compare/"*)         printf '%s\\n200\\n' '{"behind_by":1}'; exit 0 ;;
    *"/update-branch"*)    printf '%s\\n${updateCode}\\n' '{"message":"stub"}'; exit 0 ;;
  esac
done
printf 'unexpected curl call\\n500\\n'; exit 0
`;
  const curlPath = join(bin, "curl");
  writeFileSync(curlPath, curl);
  chmodSync(curlPath, 0o755);

  const script = join(dir, "pass.sh");
  writeFileSync(script, extractRunBlock());

  const r = spawnSync("bash", [script], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AUTO_UPDATE_TOKEN: "stub-token-not-a-secret",
      REPO: "owner/repo",
      RUNNER_TEMP: dir,
    },
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
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
  assert.match(out, /AUTO_UPDATE_TOKEN has lost its permissions/);
});

test("the remedy it prints asks for Pull requests write and NOT Contents write", () => {
  // The first version of this annotation asked for `contents: write`. No call this
  // workflow makes needs it - LIST and UPDATE-BRANCH are Pull requests (read, then
  // write) and COMPARE is Contents READ - so granting it would hand a job that only
  // merges main into a PR branch write access to the source of a clinical system.
  // The owner acts on this string, so the string is pinned.
  const { out } = runPass({ updateCode: 404 });
  assert.match(out, /Pull requests: read and write/);
  assert.match(out, /Contents: read-only/);
  assert.doesNotMatch(
    out,
    /contents: write/i,
    "the annotation is asking for Contents: WRITE again. Nothing in this workflow " +
      "writes a file; PUT .../update-branch needs Pull requests: write.",
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

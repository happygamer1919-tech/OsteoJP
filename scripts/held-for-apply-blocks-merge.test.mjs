// A PR labelled held-for-apply must FAIL the held-for-apply-blocks-merge check.
//
// WHY THIS EXISTS. On 2026-09-23 #1399 was merged while its migration was
// still unapplied. The label was on it, and the label was prose: nothing that
// decides a merge read it. .github/workflows/held-for-apply-blocks-merge.yml
// turns it into a check. This test is what keeps that check honest: a job that
// silently stops failing looks exactly like a job that passes.
//
// IT RUNS THE SHIPPED SHELL, NOT A COPY. The `run:` block is extracted from the
// workflow and executed with the label list the Actions expression
// `toJSON(github.event.pull_request.labels.*.name)` would put in LABELS, the
// same way auto-update-prs-fails-on-404.test.mjs runs its workflow.
//
// IT PROVES IT CAN SEE A FAILURE. The last test disarms a copy of the block (the
// labelled branch exits 0) and asserts the labelled case is then reported as
// passing, so a green run here is not a harness that cannot tell.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(ROOT, ".github/workflows/held-for-apply-blocks-merge.yml");
const TEXT = readFileSync(WORKFLOW, "utf8");

/**
 * Pull the step's `run: |` block out of the workflow and dedent it.
 *
 * Hand-rolled for the same reason as the auto-update test: no YAML dependency
 * in this repo. If the step is re-indented or a second `run:` block appears,
 * this throws rather than testing the wrong text.
 */
function extractRunBlock() {
  const lines = TEXT.split("\n");
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
  const block = body.join("\n");
  assert.ok(block.includes("held-for-apply"), "extracted block is not the label step");
  return block;
}

/**
 * Run a block the way the Actions runner does on ubuntu-latest when a step
 * names no shell: `bash -e {0}`.
 */
function runBlock(block, labels) {
  const dir = mkdtempSync(join(tmpdir(), "held-for-apply-test-"));
  const script = join(dir, "step.sh");
  writeFileSync(script, block);
  const r = spawnSync("bash", ["-e", script], {
    env: { ...process.env, LABELS: labels, PR_NUMBER: "4242" },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const BLOCK = extractRunBlock();

test("jq is on PATH, so a missing jq cannot pass as 'not labelled'", () => {
  const r = spawnSync("jq", ["--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, "jq is required by the workflow step and by this test");
});

test("the job is named for branch protection and needs no token", () => {
  assert.match(TEXT, /^ {4}name: held-for-apply-blocks-merge$/m);
  assert.match(TEXT, /^permissions: \{\}$/m);
  assert.match(
    TEXT,
    /LABELS: \$\{\{ toJSON\(github\.event\.pull_request\.labels\.\*\.name\) \}\}/,
  );
});

test("it re-runs when the label is added or removed, and on every new head", () => {
  const m = TEXT.match(/^ {4}types: \[([^\]]*)\]$/m);
  assert.ok(m, "pull_request types list not found");
  const types = m[1].split(",").map((s) => s.trim());
  for (const t of ["opened", "reopened", "synchronize", "labeled", "unlabeled"]) {
    assert.ok(types.includes(t), `pull_request type ${t} is missing`);
  }
});

const CASES = [
  { labels: "[]", code: 0, why: "no labels" },
  { labels: '["held-for-apply"]', code: 1, why: "the label alone" },
  { labels: '["bug","held-for-apply","ci"]', code: 1, why: "the label among others" },
  { labels: '["Held-For-Apply"]', code: 1, why: "the label in another case" },
  { labels: '["held-for-apply-later"]', code: 0, why: "a longer name is another label" },
  { labels: '["not-held-for-apply"]', code: 0, why: "a prefixed name is another label" },
  { labels: '["ci","docs"]', code: 0, why: "unrelated labels" },
  { labels: "null", code: 0, why: "no labels array at all" },
  { labels: "{", code: 1, why: "an unreadable list fails closed" },
  { labels: "", code: 1, why: "an empty payload fails closed" },
];

for (const c of CASES) {
  test(`LABELS=${JSON.stringify(c.labels)} (${c.why}) exits ${c.code}`, () => {
    const r = runBlock(BLOCK, c.labels);
    assert.equal(r.code, c.code, r.out);
    if (c.code === 1) assert.match(r.out, /::error::/);
  });
}

test("a disarmed copy is caught: the harness can see the block stop failing", () => {
  const disarmed = BLOCK.replace(
    /(0\)\n\s*echo "::error::[^\n]*\n\s*)exit 1/,
    "$1exit 0",
  );
  assert.notEqual(disarmed, BLOCK, "the disarm substitution did not apply");
  assert.equal(runBlock(disarmed, '["held-for-apply"]').code, 0);
  assert.equal(runBlock(BLOCK, '["held-for-apply"]').code, 1);
});

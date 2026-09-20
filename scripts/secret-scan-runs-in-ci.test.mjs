import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE SECRET SCANNER MUST RUN SOMEWHERE THE REPOSITORY CONTROLS.
 *
 * ==========================================================================
 * WHAT WAS TRUE BEFORE THIS FILE, MEASURED
 * ==========================================================================
 * `scripts/secret-scan.mjs` has existed since 2026-09-14, with twelve patterns
 * each proven against its own positive and negative sample, and a test suite of
 * its own. It ran in exactly one place: `scripts/git-hooks/pre-push`.
 *
 * A hook is not a control the repository owns. Git only runs it when
 * `core.hooksPath` points at it, which is a PER-MACHINE setting made by hand,
 * per clone. On 2026-09-20 `core.hooksPath` on this machine pointed at a
 * directory OUTSIDE the repository. Nothing anywhere verifies that any
 * contributor has configured it, and a push from a machine that has not is
 * scanned by nothing at all.
 *
 * `grep -rn secret-scan .github/` returned NOTHING on 2026-09-20: the scanner
 * was in no workflow.
 *
 * ==========================================================================
 * WHY THE STEP GOES IN AN EXISTING JOB
 * ==========================================================================
 * Branch protection requires four contexts by name. A new job is a new context,
 * which is not required until somebody adds it in the GitHub UI - so a new job
 * would be a gate that cannot block anything until an owner clicks, and would
 * look like protection in the meantime. Adding a STEP to a job that is already
 * required needs no click and blocks the merge the moment it is red.
 *
 * `Lint + typecheck + test` is the right host: it already checks out with
 * `fetch-depth: 0`, which the scanner needs to diff against the base.
 *
 * ==========================================================================
 * WHAT THIS ASSERTS, AND WHAT IT DOES NOT
 * ==========================================================================
 * It asserts the WIRING - that the required job invokes the scanner, and that
 * the invocation cannot silently pass. It does not re-test the scanner's
 * patterns; `scripts/secret-scan.test.mjs` owns those, and this file would
 * duplicate them badly.
 *
 * It also does not assert anything about the pre-push hook. The hook stays: it
 * is faster feedback and it stops a value reaching GitHub at all. This is the
 * backstop for when the hook is not installed.
 */

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CI = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

/** The job wired to the required branch-protection context. */
const REQUIRED_JOB_NAME = "Lint + typecheck + test";

test("the scan is not vacuous: ci.yml is readable and holds the required job", () => {
  assert.ok(CI.length > 500, "ci.yml is implausibly short - the read is wrong");
  assert.ok(
    CI.includes(`name: ${REQUIRED_JOB_NAME}`),
    `ci.yml no longer declares a job named "${REQUIRED_JOB_NAME}". If it was renamed, the ` +
      "branch-protection context stopped reporting and this file is the least of it.",
  );
});

test("the REQUIRED quality job runs scripts/secret-scan.mjs", () => {
  assert.match(
    CI,
    /run:\s*node scripts\/secret-scan\.mjs/,
    "ci.yml does not invoke scripts/secret-scan.mjs. The scanner then runs only from a " +
      "per-machine git hook, so a push from a machine that has not configured core.hooksPath " +
      "is scanned by nothing.",
  );
});

test("the scanner step is inside the required job, not a job of its own", () => {
  // A new job would be a new check name, and a new check name is not in the
  // REQUIRED set until somebody adds it in the GitHub UI.
  const jobs = CI.split(/\n {2}(?=[A-Za-z0-9_-]+:\n)/);
  const host = jobs.find((j) => j.includes(`name: ${REQUIRED_JOB_NAME}`));
  assert.ok(host, "could not isolate the required job from ci.yml");
  assert.match(
    host,
    /node scripts\/secret-scan\.mjs/,
    `the secret-scan step is not inside "${REQUIRED_JOB_NAME}". A step in any other job is ` +
      "not covered by branch protection and cannot block a merge.",
  );
});

test("the step cannot soft-pass: it is not piped, chained or forced green", () => {
  const line = CI.split("\n").find((l) => l.includes("node scripts/secret-scan.mjs"));
  assert.ok(line, "no secret-scan invocation line found");
  assert.ok(
    !/\|\|/.test(line),
    `the invocation is guarded with "||", which swallows its exit code: ${line.trim()}`,
  );
  assert.ok(
    !/\|\s*(tee|head|cat)\b/.test(line),
    "the invocation is piped, so the pipeline's exit code is the last command's, not the " +
      "scanner's. This exact shape soft-passed a red suite once before (see db-tests.yml's " +
      `note on pipefail): ${line.trim()}`,
  );
  assert.ok(
    !/continue-on-error/.test(CI.slice(CI.indexOf(line), CI.indexOf(line) + 200)),
    "the step is marked continue-on-error, which makes it advisory rather than a gate",
  );
});

test("the checkout it depends on still fetches full history", () => {
  // The scanner diffs against the PR base. A depth-1 clone has one commit, so
  // the diff would be empty and the step would pass having scanned nothing -
  // the vacuous-green shape this repository keeps rediscovering.
  assert.match(
    CI,
    /fetch-depth:\s*0/,
    "ci.yml's checkout no longer sets fetch-depth: 0, so the scanner cannot diff against the " +
      "base and would pass having read nothing.",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CI-docs-only-required-checks-skip — A REQUIRED CHECK THAT ABSTAINS MUST SAY SO.
 *
 * ==========================================================================
 * THE OBSERVATION THIS GUARDS, measured rather than assumed.
 * ==========================================================================
 * On a docs-only PR, THREE of the four required checks finish in 4-7 seconds as
 * path-filter short-circuits and report `pass` without running anything. That is
 * correct - a database suite cannot be affected by a markdown diff, and the
 * alternative is a slow gate everyone learns to ignore.
 *
 * THE HAZARD IS PURELY IN HOW THE RESULT READS. A reviewer, or a stateless
 * session, sees four green required checks and infers four proofs. On a
 * docs-only PR it is ONE proof and THREE abstentions, and the only tell was the
 * DURATION - 6 seconds versus three minutes. Nobody reads durations, and a board
 * note recording it cannot be relied on to survive a context clear.
 *
 * ==========================================================================
 * WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT.
 * ==========================================================================
 * It asserts two things about the WORKFLOW FILES, both of which are facts a PR
 * can break:
 *
 *   1. every required branch-protection context still has a job declaring that
 *      exact `name:`. A rename makes the context NEVER REPORT, which does not
 *      look like a failure - it looks like a PR that will not merge, on every
 *      PR at once, with no red check to point at.
 *   2. every step that short-circuits such a job on a docs-only diff emits a
 *      workflow ANNOTATION on that path, so the abstention is visible without
 *      knowing to compare timings.
 *
 * IT DOES NOT ASSERT THAT THE CHECK RUNS. It cannot: whether a given PR's diff
 * is docs-only is a property of that PR. What it makes impossible is a silent
 * abstention.
 *
 * A GENUINE `neutral` CONCLUSION WOULD BE BETTER AND IS NOT AVAILABLE. GitHub
 * Actions has no supported way for a normal job to finish neutral (exit 78 was
 * removed), and reaching for a job-level `if:` skip instead would change how
 * branch protection sees the context - the one experiment on this repo that can
 * block every open PR at once if the assumption is wrong. Not attempted.
 *
 * ==========================================================================
 * TEXT, NOT YAML, AND THAT IS A CONSTRAINT RATHER THAN A CHOICE.
 * ==========================================================================
 * This repo has no YAML parser at the root and standing rule 13 forbids adding
 * a dependency to get one. The scan below is therefore textual. It is honest
 * about its own reach: it finds a step by its `- name:` line and reads to the
 * next one at the same indent, which is exactly how these files are written and
 * would need a deliberately unusual layout to defeat.
 */

const WORKFLOW_DIR = ".github/workflows";

/**
 * The four required contexts, READ FROM LIVE BRANCH PROTECTION on 2026-08-20:
 *   gh api repos/happygamer1919-tech/OsteoJP/branches/main/protection \
 *     --jq '.required_status_checks.contexts'
 *
 * PINNED HERE RATHER THAN FETCHED, deliberately. This test runs inside
 * `pnpm test:scripts`, in CI, where an API call would need a token scope the job
 * does not have and would make the guard fail for network reasons. A pinned list
 * that drifts from reality is caught the other way round: if protection gains a
 * context this list does not know about, that context's job is simply not
 * checked here, and if protection LOSES one, this test keeps asserting a job
 * name that is still perfectly valid. Neither failure mode is silent damage.
 */
const REQUIRED_CONTEXTS = [
  "DB-gated tests (RLS isolation, seeded DB)",
  "Lint + typecheck + test",
  "Playwright E2E (seeded DB)",
  "Validate spec + drift check",
];

function workflowFiles() {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => ({ name: f, path: join(WORKFLOW_DIR, f), src: readFileSync(join(WORKFLOW_DIR, f), "utf8") }));
}

/**
 * The steps of a workflow file, as raw text blocks.
 *
 * A step starts at a line matching `- name:` and ends at the next line with the
 * SAME indent that also starts a list item. Comment lines above a `- name:`
 * belong to the step that follows, which is how these files are written and is
 * why the block is taken from the `- name:` line rather than from the comment.
 */
function steps(src) {
  const lines = src.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)- name:/.exec(lines[i]);
    if (m) starts.push({ i, indent: m[1].length });
  }
  return starts.map((s, n) => {
    const next = starts[n + 1]?.i ?? lines.length;
    return { header: lines[s.i], text: lines.slice(s.i, next).join("\n") };
  });
}

/** A step gated on a change-detection output being false - the abstention path. */
function isShortCircuitStep(text) {
  return /if:\s*steps\.[A-Za-z0-9_-]+\.outputs\.[A-Za-z0-9_-]+\s*(==\s*'false'|!=\s*'true')/.test(text);
}

/** A GitHub Actions workflow annotation, which is what surfaces on the check. */
function emitsAnnotation(text) {
  return /::(notice|warning)\b/.test(text);
}

test("the workflow scan is not vacuous", () => {
  // LEARNINGS entry 5. A glob that matched nothing would make every assertion
  // below pass over zero files - the exact shape that once reported "0 test
  // files scanned, 0 violations" and read as clean.
  const files = workflowFiles();
  assert.ok(files.length >= 5, `expected at least 5 workflow files, found ${files.length}`);
  const totalSteps = files.reduce((n, f) => n + steps(f.src).length, 0);
  assert.ok(totalSteps >= 40, `expected at least 40 parsed steps, found ${totalSteps}`);
});

test("every required branch-protection context still has a job declaring that name", () => {
  // A RENAME DOES NOT LOOK LIKE A FAILURE. The context simply never reports, so
  // every open PR sits waiting on a check that will never arrive, with nothing
  // red to point at. That has to be caught here, before the rename merges.
  const all = workflowFiles().map((f) => f.src).join("\n");
  for (const context of REQUIRED_CONTEXTS) {
    assert.ok(
      all.includes(`name: ${context}`),
      `required check "${context}" has no job with that exact name in ${WORKFLOW_DIR}. ` +
        `Branch protection waits on the STRING; renaming the job makes the context never report.`,
    );
  }
});

test("a step that short-circuits a workflow on a docs-only diff ANNOUNCES the abstention", () => {
  const offenders = [];
  let found = 0;
  for (const f of workflowFiles()) {
    for (const s of steps(f.src)) {
      if (!isShortCircuitStep(s.text)) continue;
      found++;
      if (!emitsAnnotation(s.text)) {
        offenders.push(`${f.name}: ${s.header.trim()}`);
      }
    }
  }

  // THE POSITIVE CONTROL, and it is the assertion that makes the next one mean
  // anything. If the step-detection regex ever stopped matching, `offenders`
  // would be empty and this test would go green over workflows that abstain in
  // total silence - passing for the exact reason it exists to prevent.
  assert.ok(
    found >= 2,
    `expected at least 2 short-circuit steps across ${WORKFLOW_DIR}, found ${found}. ` +
      `If the workflows really no longer short-circuit, delete this guard deliberately; ` +
      `do not let it pass by matching nothing.`,
  );

  assert.deepEqual(
    offenders,
    [],
    `these steps let a REQUIRED check report green without running and say nothing about it:\n` +
      offenders.map((o) => `  - ${o}`).join("\n") +
      `\nEmit a ::notice:: or ::warning:: on the skip path. A green that is an ` +
      `abstention must not be indistinguishable from a green that is a proof.`,
  );
});

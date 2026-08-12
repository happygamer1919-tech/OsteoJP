#!/usr/bin/env node
/**
 * assert-e2e-executed.mjs — skip-guard for the E2E gate.
 *
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL
 *   On 2026-08-12 `sync-portal-agenda.spec.ts` SKIPPED its DIRECTION A test on
 *   two consecutive CI runs. Both runs were GREEN. PR #879 merged on four green
 *   required checks with PG8's central direction never executed, and the only
 *   reason anyone noticed was a `console.log` added by hand the run before.
 *
 *   A SKIP INSIDE A PASSING SHARD IS A GUARD THAT CANNOT FAIL. Playwright counts
 *   it as "not a failure", the shard is green, the aggregate job is green, and
 *   branch protection is satisfied by a test that did nothing. This is the exact
 *   shape `assert-rls-executed.mjs` was written for on the DB-gated side, where
 *   `describe.skipIf(!live)` silently skipped the RLS proofs on every PR.
 *
 *   This is that guard for Playwright.
 *
 * WHAT IT ASSERTS, per shard
 *   1. Every HARD_REQUIRED spec file still EXISTS. A renamed or deleted spec
 *      would otherwise vanish from every report and be caught by nothing — the
 *      failure mode that is invisible precisely because there is no evidence.
 *   2. For any HARD_REQUIRED test PRESENT in this shard's report, its status is
 *      `passed`. `skipped` is RED.
 *
 * WHY "PRESENT IN THIS SHARD" RATHER THAN "PRESENT SOMEWHERE"
 *   Playwright's `--shard` splits specs across runners, so a given test appears
 *   in exactly ONE shard's report and legitimately not in the other two. A guard
 *   demanding presence in every report would be red by construction. Check (1)
 *   is what covers deletion, which is the hole that "present in this shard"
 *   leaves open.
 *
 * USAGE
 *   node .github/scripts/assert-e2e-executed.mjs <report.json> [repoRoot]
 *
 * The report is Playwright's `json` reporter shape:
 *   { suites: [ { title, file, suites?, specs?: [ { title, tests: [ { results:
 *     [ { status } ], status? } ] } ] } ] }
 * Statuses seen in practice: passed | failed | skipped | timedOut | interrupted.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The tests that MUST run, not merely be present.
 *
 * ONE ENTRY PER GATE-BEARING OBSERVATION. This list records a DECISION, exactly
 * as `write-paths.test.ts`'s allowlist does: a test is here because a launch
 * gate rests on it and a skip would be indistinguishable from a pass. Do not add
 * a test here for being important; add it for being LOAD-BEARING ON A GATE.
 */
const HARD_REQUIRED = [
  {
    file: "apps/web/e2e/sync-portal-agenda.spec.ts",
    // Substring match on the test title, so a rename of the enclosing describe
    // does not silently disarm the guard.
    titleContains: "DIRECTION A",
    why: "PG8 SYNC. The portal->agenda crossing. Skipped green on two runs before this guard existed.",
  },
];

const reportPath = process.argv[2];
const repoRoot = process.argv[3] ?? process.cwd();

if (!reportPath) {
  console.error("assert-e2e-executed: no report path given");
  process.exit(2);
}

const failures = [];

// ---- check 1: the spec files still exist ----------------------------------
for (const req of HARD_REQUIRED) {
  if (!existsSync(join(repoRoot, req.file))) {
    failures.push(
      `HARD-REQUIRED SPEC IS MISSING: ${req.file}\n` +
        `  It was renamed or deleted. ${req.why}\n` +
        `  A missing spec appears in no report and is caught by nothing else.`,
    );
  }
}

// ---- check 2: any hard-required test in THIS report actually ran ----------
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  console.error(
    `assert-e2e-executed: could not read ${reportPath}: ${e instanceof Error ? e.message : e}\n` +
      `  The json reporter must be configured in playwright.config.ts for this gate to mean anything.`,
  );
  process.exit(2);
}

/** Walk the nested suite tree and yield every spec with its file and status. */
function* walk(node, file) {
  const f = node.file ?? file;
  for (const spec of node.specs ?? []) {
    const statuses = [];
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) statuses.push(r.status);
      if (t.status) statuses.push(t.status);
    }
    yield { file: f, title: spec.title, statuses, ok: spec.ok };
  }
  for (const child of node.suites ?? []) yield* walk(child, f);
}

const seen = [];
for (const suite of report.suites ?? []) {
  for (const spec of walk(suite, suite.file)) seen.push(spec);
}

// GUARD AGAINST A VACUOUS PASS. An empty or malformed report would make every
// assertion below trivially true, which is the failure this whole file exists to
// prevent - in its own implementation.
if (seen.length === 0) {
  failures.push(
    `THE REPORT CONTAINS NO SPECS AT ALL: ${reportPath}\n` +
      `  Either the run collected nothing or the report shape changed. Both make\n` +
      `  this guard vacuous, so it fails rather than passing on an empty set.`,
  );
}

for (const req of HARD_REQUIRED) {
  const matches = seen.filter(
    (s) => (s.file ?? "").endsWith(req.file.split("/").pop()) && s.title.includes(req.titleContains),
  );
  // Absent from THIS shard is legitimate — see the header. Present and not
  // passed is not.
  for (const m of matches) {
    const ran = m.statuses.some((s) => s === "passed");
    const skipped = m.statuses.every((s) => s === "skipped");
    if (skipped || !ran) {
      failures.push(
        `HARD-REQUIRED E2E TEST DID NOT RUN: ${m.title}\n` +
          `  file:     ${m.file}\n` +
          `  statuses: ${m.statuses.join(", ") || "(none)"}\n` +
          `  why it is hard-required: ${req.why}\n` +
          `  A skip inside a passing shard is a guard that cannot fail. This is red on purpose.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\nE2E SKIP-GUARD RED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log(
  `E2E skip-guard OK: ${HARD_REQUIRED.length} hard-required test(s) checked against ` +
    `${seen.length} spec(s) in ${reportPath}.`,
);

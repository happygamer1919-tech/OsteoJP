#!/usr/bin/env node
/**
 * assert-rls-executed.mjs — skip-guard for the DB-gated RLS isolation gate.
 *
 * WHY THIS EXISTS
 *   The six RLS isolation suites in packages/db all `describe.skipIf(!live)`
 *   where live = Boolean(DATABASE_URL). ci.yml runs vitest WITHOUT a DATABASE_URL,
 *   so they silently SKIP and report green — the RLS proofs ran on zero PRs. This
 *   guard runs after the DB-gated vitest pass and FAILS LOUDLY (exit 1) unless the
 *   suites genuinely executed. A real RLS execution must be provable, not assumed:
 *   a skip, a silent skip, a renamed/missing file, or zero tests collected on any
 *   of the six turns the job RED.
 *
 * NO EXCEPTIONS
 *   Every suite is hard-required: each gates ONLY on `!live` and runs
 *   non-privileged under the prod-equivalent `supabase db reset` this gate
 *   deliberately preserves. ANY skip — bare, silent, or otherwise — reddens
 *   the job.
 *
 *   Historical note: patient-form-intake-rls once carried a second gate
 *   (`!authReachable`, probing has_schema_privilege('patient','auth','USAGE'))
 *   and was permitted to skip with a documented reason, because migration 0010's
 *   `GRANT USAGE ON SCHEMA auth TO patient` no-ops under a non-privileged reset.
 *   That allowance is gone: migration 0012 redefined the helpers the patient
 *   policies call (jwt_patient_id/jwt_tenant_id) as SECURITY DEFINER, so the
 *   policies resolve without the `patient` role needing direct auth-schema USAGE.
 *   The stale probe was removed from the suite, which now runs non-privileged
 *   exactly like the others (proven by patient-rls-selfscope, which exercises the
 *   same `patient` role through the same helpers and has always been hard).
 *
 * INPUTS (positional, with defaults)
 *   argv[2]  path to the vitest JSON report (default: packages/db/rls-results.json)
 *   argv[3]  accepted but unused (was the run log for the now-removed skip-reason
 *            match); kept so the workflow invocation needs no change.
 *
 * The JSON report is the jest-compatible shape vitest's `json` reporter emits:
 *   { testResults: [ { name, assertionResults: [ { status } ] } ] }
 * where status ∈ passed | failed | skipped | todo (skipIf ⇒ skipped).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const RESULTS_PATH = process.argv[2] ?? "packages/db/rls-results.json";
// argv[3] (the run log) is accepted for backward compatibility with the
// workflow invocation but no longer read: with every suite hard-required there
// is no documented-skip reason to match against the log.

// The RLS suites this gate exists to prove. `hard: true` ⇒ MUST execute, zero
// skips tolerated — every suite here is now hard-required: all gate only on
// `!live` and run non-privileged under `supabase db reset`. Filenames are
// matched by basename against the report, so a rename that drops a suite from
// the run is caught as "missing".
const SUITES = [
  { file: "patient-rls-selfscope.test.ts", hard: true },
  { file: "cross-tenant-rls-isolation.test.ts", hard: true },
  { file: "adversarial-rls-escape.test.ts", hard: true },
  { file: "ai-ingestion-rls-isolation.test.ts", hard: true },
  { file: "patient-form-intake-rls.test.ts", hard: true },
  { file: "review-finalize-rls.test.ts", hard: true },
];

// A test counts as NOT executed for any of these statuses.
const NOT_RUN = new Set(["skipped", "todo", "pending", "disabled"]);

function loadJson(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    fail(`cannot read vitest JSON report at "${path}": ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`vitest JSON report at "${path}" is not valid JSON: ${err.message}`);
  }
}

const failures = [];
function fail(msg) {
  // Used for hard structural errors (missing/invalid report) — abort immediately.
  console.error(`[31mFATAL[0m ${msg}`);
  process.exit(1);
}

const report = loadJson(RESULTS_PATH);

if (!Array.isArray(report.testResults)) {
  fail(`vitest JSON report at "${RESULTS_PATH}" has no testResults array`);
}

// basename -> { passed, failed, notRun, total }
const byFile = new Map();
for (const tr of report.testResults) {
  const name = basename(tr.name ?? "");
  const counts = byFile.get(name) ?? { passed: 0, failed: 0, notRun: 0, total: 0 };
  for (const a of tr.assertionResults ?? []) {
    counts.total += 1;
    if (a.status === "passed") counts.passed += 1;
    else if (a.status === "failed") counts.failed += 1;
    else if (NOT_RUN.has(a.status)) counts.notRun += 1;
    else counts.notRun += 1; // unknown status ⇒ treat as not-run, never as a pass
  }
  byFile.set(name, counts);
}

const rows = [];
for (const suite of SUITES) {
  const c = byFile.get(suite.file);

  // Missing entirely, or collected zero tests ⇒ RED for every suite.
  if (!c || c.total === 0) {
    failures.push(
      `${suite.file}: ZERO tests collected (suite missing from the report or empty) — RLS proof did not run`,
    );
    rows.push([suite.file, c ? `${c.passed}/${c.total}` : "absent", "RED"]);
    continue;
  }

  if (c.failed > 0) {
    // vitest already fails on this, but assert it here too so the guard is total.
    failures.push(`${suite.file}: ${c.failed} test(s) FAILED`);
    rows.push([suite.file, `${c.passed}/${c.total} (${c.failed} failed)`, "RED"]);
    continue;
  }

  const executed = c.passed > 0 && c.notRun === 0;

  if (executed) {
    rows.push([suite.file, `${c.passed}/${c.total} executed`, "ok"]);
    continue;
  }

  // Not fully executed. Every suite is hard-required, so ANY skip ⇒ RED.
  if (c.notRun > 0) {
    failures.push(
      `${suite.file}: ${c.notRun}/${c.total} test(s) skipped — RLS proof did not fully run`,
    );
  } else {
    failures.push(`${suite.file}: did not execute any passing tests`);
  }
  rows.push([suite.file, `${c.passed}/${c.total}, ${c.notRun} not-run`, "RED"]);
}

// ── Report ────────────────────────────────────────────────────────────────
const w = Math.max(...SUITES.map((s) => s.file.length));
console.log("RLS isolation skip-guard — DB-gated execution check\n");
for (const [file, detail, status] of rows) {
  const tag = status === "RED" ? "[31mRED [0m" : `[32m${status === "ok" ? "RUN " : "SKIP"}[0m`;
  console.log(`  ${tag}  ${file.padEnd(w)}  ${detail}`);
}
console.log("");

if (failures.length > 0) {
  console.error(`[31m✗ ${failures.length} RLS gate violation(s):[0m`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nThe RLS isolation suites did not provably execute against the seeded DB. " +
      "See .github/scripts/assert-rls-executed.mjs for the contract.",
  );
  process.exit(1);
}

console.log("[32m✓ All six RLS suites executed non-privileged against the seeded DB.[0m");

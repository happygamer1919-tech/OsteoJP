#!/usr/bin/env node
/**
 * assert-rls-executed.mjs — skip-guard for the DB-gated RLS isolation gate.
 *
 * WHY THIS EXISTS
 *   The five RLS isolation suites in packages/db all `describe.skipIf(!live)`
 *   where live = Boolean(DATABASE_URL). ci.yml runs vitest WITHOUT a DATABASE_URL,
 *   so they silently SKIP and report green — the RLS proofs ran on zero PRs. This
 *   guard runs after the DB-gated vitest pass and FAILS LOUDLY (exit 1) unless the
 *   suites genuinely executed. A real RLS execution must be provable, not assumed:
 *   a skip, a silent skip, a renamed/missing file, or zero tests collected on any
 *   of the five turns the job RED.
 *
 * THE ONE PERMITTED EXCEPTION
 *   `patient-form-intake-rls` carries a second gate beyond `!live`:
 *   `!authReachable`, where authReachable probes
 *   has_schema_privilege('patient','auth','USAGE'). Under a NON-privileged
 *   `supabase db reset` (the prod-equivalent apply this gate deliberately
 *   preserves) that privilege is false — migration 0010's
 *   `GRANT USAGE ON SCHEMA auth TO patient` silently no-ops because the migration
 *   role (postgres) neither owns the auth schema nor is superuser. So this one
 *   suite skips with an EXPLICIT, documented reason. We permit that single skip,
 *   and ONLY when its exact reason string is present in the run log — never a bare
 *   skip, never a silent one.
 *
 *   This allowance is temporary. Migration 0012 already redefined the helpers the
 *   patient policies call (jwt_patient_id/jwt_tenant_id) as SECURITY DEFINER, so
 *   the patient_form_submissions policies RESOLVE without the `patient` role
 *   needing direct auth-schema USAGE. The suite's `authReachable` probe is a stale,
 *   over-conservative precondition left over from before 0012; once the test is
 *   refactored to drop that probe it will run non-privileged exactly like the other
 *   four, and this exception should be deleted so all five are hard-required.
 *
 * INPUTS (positional, with defaults)
 *   argv[2]  path to the vitest JSON report (default: packages/db/rls-results.json)
 *   argv[3]  path to the combined vitest run log (default: packages/db/rls-run.log)
 *
 * The JSON report is the jest-compatible shape vitest's `json` reporter emits:
 *   { testResults: [ { name, assertionResults: [ { status } ] } ] }
 * where status ∈ passed | failed | skipped | todo (skipIf ⇒ skipped).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const RESULTS_PATH = process.argv[2] ?? "packages/db/rls-results.json";
const LOG_PATH = process.argv[3] ?? "packages/db/rls-run.log";

// The five suites this gate exists to prove. `hard: true` ⇒ MUST execute, zero
// skips tolerated. The single `hard: false` suite may skip ONLY via its exact
// documented reason (see header). Filenames are matched by basename against the
// report, so a rename that drops a suite from the run is caught as "missing".
const SUITES = [
  { file: "patient-rls-selfscope.test.ts", hard: true },
  { file: "cross-tenant-rls-isolation.test.ts", hard: true },
  { file: "adversarial-rls-escape.test.ts", hard: true },
  { file: "ai-ingestion-rls-isolation.test.ts", hard: true },
  { file: "patient-form-intake-rls.test.ts", hard: false },
];

// The EXACT skip reason patient-form-intake-rls.test.ts emits (console.warn at
// module load) when the `patient` role lacks auth-schema USAGE. Matched verbatim
// (after whitespace normalization) — any deviation, or its absence, makes a skip
// of that suite count as silent and turns the job red.
const PERMITTED_SKIP_REASON =
  "[patient-form-intake-rls] SKIPPED: `patient` role lacks USAGE on schema " +
  "`auth` (local supabase db reset strips migration 0010's grant). Run on a " +
  "Supabase branch to exercise the behavioral boundary.";

// A test counts as NOT executed for any of these statuses.
const NOT_RUN = new Set(["skipped", "todo", "pending", "disabled"]);

const normalize = (s) => s.replace(/\s+/g, " ").trim();

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

function loadLog(path) {
  try {
    return normalize(readFileSync(path, "utf8"));
  } catch {
    return ""; // absence is handled where the reason is required
  }
}

const failures = [];
function fail(msg) {
  // Used for hard structural errors (missing/invalid report) — abort immediately.
  console.error(`[31mFATAL[0m ${msg}`);
  process.exit(1);
}

const report = loadJson(RESULTS_PATH);
const log = loadLog(LOG_PATH);

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

  // Not fully executed. Only patient-form-intake (hard: false) may be excused,
  // and only when fully skipped AND its exact documented reason is in the log.
  const fullySkipped = c.passed === 0 && c.failed === 0 && c.notRun === c.total;
  if (!suite.hard && fullySkipped && log.includes(normalize(PERMITTED_SKIP_REASON))) {
    rows.push([suite.file, `${c.notRun}/${c.total} skipped (documented)`, "skip-ok"]);
    continue;
  }

  // Everything else is a silent / unauthorized skip ⇒ RED.
  if (!suite.hard && fullySkipped) {
    failures.push(
      `${suite.file}: fully skipped WITHOUT its documented authReachable reason — ` +
        `silent skip not permitted`,
    );
  } else if (c.notRun > 0) {
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

console.log("[32m✓ All five RLS suites accounted for (four executed; intake skip documented or executed).[0m");

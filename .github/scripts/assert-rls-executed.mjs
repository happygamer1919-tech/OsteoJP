#!/usr/bin/env node
/**
 * assert-rls-executed.mjs — skip-guard for the DB-gated RLS isolation gate.
 *
 * WHY THIS EXISTS
 *   The DB-gated suites in packages/db (SUITES below) all `describe.skipIf(!live)`
 *   where live = Boolean(DATABASE_URL). ci.yml runs vitest WITHOUT a DATABASE_URL,
 *   so they silently SKIP and report green — the RLS proofs ran on zero PRs. This
 *   guard runs after the DB-gated vitest pass and FAILS LOUDLY (exit 1) unless the
 *   suites genuinely executed. A real RLS execution must be provable, not assumed:
 *   a skip, a silent skip, a renamed/missing file, or zero tests collected on any
 *   of them turns the job RED.
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

// MULTIPLE REPORTS, one guard. W13-01a added the first DB-gated suite OUTSIDE
// packages/db (apps/web/lib/reminders/redeem.db.test.ts, which needs a real
// Postgres to prove LOOP 1's transactional DoD lines and cannot live in
// packages/db without inverting the dependency direction). It runs as its own
// vitest invocation and emits its own JSON report, so this guard now accepts
// SEVERAL report paths and merges their testResults before checking SUITES.
//
// Every .json argument is a report. Non-json arguments are ignored, which keeps
// the historical `argv[3] = run log` invocation working untouched.
const RESULTS_PATHS = process.argv.slice(2).filter((a) => a.endsWith(".json"));
if (RESULTS_PATHS.length === 0) RESULTS_PATHS.push("packages/db/rls-results.json");
const RESULTS_PATH = RESULTS_PATHS.join(", ");
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
  { file: "migration-staging-rls.test.ts", hard: true },
  { file: "migration-upsert-idempotency.test.ts", hard: true },
  // W13-01a. Lives in apps/web, runs against the same Supabase stack from its
  // own vitest invocation. Hard-required for the same reason as every suite
  // above: it gates on `!live`, so without this entry a silent skip in the
  // DB-gated job would report green and LOOP 1's transactional DoD lines would
  // be proven by nothing at all.
  { file: "redeem.db.test.ts", hard: true },
  // W13-03. The second DB-gated suite outside packages/db, in apps/api, for the
  // same structural reason: the OTP claim lives in an app. It proves the three
  // LOOP 3 DoD lines that are claims about the DATABASE rather than about the
  // application - single use under two REAL concurrent transactions, the 30-day
  // trusted-device boundary as a SQL predicate, and the claim committing as one
  // transaction. Hard-required: a silent skip here would leave Decision D's
  // login proven by mocks agreeing with themselves.
  { file: "otp-claim.db.test.ts", hard: true },
  // SEC-otp-linkage-exact-phone-match, added 2026-08-13, and hard-required for a
  // reason the others do not have: ONE OF ITS TESTS PINS A LIVE DEFECT. It
  // asserts that a patient whose phone is stored the way a human writes it is
  // REFUSED at login, which is true today and must not be true at launch. A
  // silent skip would take that record out of CI and leave a launch-blocking
  // defect held only by a card - and the whole reason this file exists is that a
  // card can be missed while a red test cannot. It also replaces
  // patient-linkage.test.ts's mocked query-shape assertions with real rows: that
  // suite's fake select returns whatever the test set, so it proves the query is
  // ASSEMBLED correctly and cannot prove it FINDS anything.
  { file: "patient-linkage.db.test.ts", hard: true },
  // 0062, added 2026-08-13. THE PRICE OF THE GENERATED COLUMN. normalizePhonePT
  // and patients.phone_e164 compute the same thing in two languages, and two
  // implementations of one rule is a divergence waiting to happen. This suite
  // runs BOTH over one corpus and requires identical answers on every input, so
  // the day they disagree CI says so instead of a patient discovering it at a
  // login screen. A silent skip would leave the duplication unguarded, which is
  // the only reason the duplication was acceptable in the first place.
  { file: "phone-e164-parity.db.test.ts", hard: true },
  // ===================================================================== //
  // W13-06 / W13-07, added 2026-08-12. THE THREE SUITES A GATE DOCUMENT CITES.
  // ===================================================================== //
  //
  // THE RULE THEY ESTABLISH, and it now binds this file: ANY SUITE CITED AS A
  // GATE ENFORCEMENT POINT IS HARD-REQUIRED AT THE MOMENT IT IS CITED.
  //
  // WHY. On 2026-08-12 a sweep found 39 vitest suites that could skip inside a
  // passing required check with nothing reddening, and THREE of them were named
  // as enforcement points in this project's own gate documents. A citation
  // naming a suite that SKIPPED is worth exactly what a citation naming the
  // WRONG suite is worth - which is the defect the LOOP 6 citation audit spent a
  // session on, one layer down.
  //
  // ALL THREE WERE VERIFIED TO HAVE EXECUTED before being added, by reading CI
  // run 31615439501 on main @ 1cdb36f rather than by inferring from the code:
  //   portal-booking-slot-parity  6 tests,  501ms   PASSED
  //   slot-lock-concurrency       6 tests, 1595ms   PASSED
  //   otp-revoke.db               8 tests,  754ms   PASSED
  // So no gate was walked back. These entries stop the NEXT run from being the
  // one nobody checked.
  //
  // PG8. Cited in docs/recon/W13-07-sync-trace.md section 4 as "a booked window
  // drops out of the offered list" and "offered implies bookable". It is the
  // only proof that the list a patient is OFFERED and the check their booking is
  // VALIDATED against agree - the 2026-07-08 LV/Osteopatia incident.
  { file: "portal-booking-slot-parity.test.ts", hard: true },
  // PG8. Cited as the contention negative control: two writers on one window,
  // one survives, the loser REFUSED rather than silently overwritten. It also
  // carries its own A4_DISABLE_LOCK negative control in db-tests.yml, which is a
  // stronger guarantee than execution alone - but that step proves the suite
  // DETECTS the race, not that the ordinary run executed it. Both are needed.
  { file: "slot-lock-concurrency.test.ts", hard: true },
  // PG6. Cited in docs/recon/W13-06-exposure-matrix.md as the enforcement point
  // for MH-04, the trusted-device revoke - the endpoint LE-trusted-device-revoke
  // built so that signing out drops the device ROW and not merely the cookie.
  { file: "otp-revoke.db.test.ts", hard: true },
  // W13-04. Proves migration 0057's backfill reproduces the name allowlist
  // EXACTLY - the "must not change what any patient can book on the day it
  // applies" line. It compares a SQL expression against a TypeScript function,
  // which is the shape that drifts, so a silent skip here would let the two
  // diverge unnoticed.
  { file: "patient-bookable.db.test.ts", hard: true },
  // THE DOUBLE BOOKING, 2026-08-11. Hard-required, and this one has a live
  // production defect behind it rather than a hypothetical: a portal pedido and
  // a staff appointment both reached `confirmed` on the same practitioner and
  // window. The confirm path DOES re-check (actions.ts:1072) - what did not
  // exist was any test that ran the real predicate, because pedido-confirm.test.ts
  // mocks ./conflict wholesale and drives the mock's return value. A silent skip
  // here would restore exactly the state that let the defect ship: four green
  // tests asserting the orchestration around a check nothing ever executed.
  { file: "pedido-confirm.db.test.ts", hard: true },
  // 0061, INC-08. The EXCLUDE constraint that makes two overlapping CONFIRMED
  // appointments unreachable by ANY path. Hard-required because this suite is
  // the ONLY evidence for that claim: the application tests prove that specific
  // code paths refuse, which is precisely the kind of proof the incident showed
  // to be insufficient - three paths produced the state and two left no trace.
  // Only Postgres can demonstrate the state is unreachable, and only if the
  // suite actually ran.
  { file: "no-double-confirmed.test.ts", hard: true },
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

const report = { testResults: [] };
for (const path of RESULTS_PATHS) {
  const one = loadJson(path);
  if (!Array.isArray(one.testResults)) {
    fail(`vitest JSON report at "${path}" has no testResults array`);
  }
  report.testResults.push(...one.testResults);
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

console.log(`[32m✓ All ${SUITES.length} DB-gated suites executed non-privileged against the seeded DB.[0m`);

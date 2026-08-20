// LE-stale-auth-user-id-sweep. THE COLUMN IS DEAD AND THIS FILE KEEPS IT DEAD.
//
// WHAT THE TRAP IS. `patients.auth_user_id` is pre-Decision-D: migration 0010
// defined a patient as a Supabase auth user linked to one `patients` row through
// it. Decision D retired that model in the APPLICATION and nothing dropped the
// column from the DATABASE. A patient row carrying a non-null value is REFUSED
// by `resolvePatientByProvenPhone`, which requires `auth_user_id IS NULL` - and
// the refusal is deliberately the same single response a WRONG CODE produces,
// because that endpoint is unauthenticated and must not be a patient-list
// oracle. So such a patient can never log in, and their report is
// indistinguishable from a typo. It surfaces as "the portal does not work".
//
// WHY THIS IS A TEST AND NOT A SWEEP. The owner ran the read-only count against
// production on 2026-08-11: ZERO ROWS. The one affected row was a test patient,
// cleared by hand on 2026-08-09. There is nothing to sweep. What the card was
// actually protecting is the claim that made zero safe: "the rows are historical
// and cannot be re-created by anything running today." That claim was WALKED,
// once, by a human. Below it is ENFORCED.
//
// WHY NO RUNTIME DIAGNOSTIC WAS ADDED, since it is the obvious thing to reach
// for and it was considered and rejected. Telling a locked-out patient apart
// from a wrong code would mean either (a) a second query on every failed attempt
// at the one PRE-AUTHENTICATION endpoint an unauthenticated caller can reach -
// which is an amplification vector on the endpoint patient-linkage.ts spends
// paragraphs protecting - or (b) moving the `auth_user_id IS NULL` predicate out
// of SQL and into JS, which that file explicitly forbids: "ALL FOUR PREDICATES
// ARE IN THE QUERY, not applied afterwards in JS, so a future edit cannot
// accidentally widen the candidate set." Neither is proportionate to a
// zero-row population. Keeping the population at zero is.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Comments stripped before every assertion. This file's own subject is
 *  described at length in prose across the repo - patient-linkage.ts, the e2e
 *  seed, the board - and a predicate over raw text matches those descriptions
 *  and goes red on correct code. Same class #962 and #965 removed from five
 *  other guards; a guard that punishes documentation is worse than none. */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*#.*$/gm, " ");

const SEARCHED = [
  join(ROOT, "apps"),
  join(ROOT, "packages"),
  join(ROOT, "scripts"),
];

/** Every source file, minus build output and dependencies. */
function sources() {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === ".next" || e === "dist" || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js)$/.test(e)) files.push(full);
    }
  };
  for (const d of SEARCHED) walk(d);
  return files;
}

const rel = (f) => f.slice(ROOT.length + 1);

// The ONE file allowed to write the column, and the reason it is allowed:
// it builds the trusted-device fixture, which needs a CLAIMED patient row.
const SEED = join("apps", "web", "e2e", "seed", "seed-e2e.mjs");

// The schema DECLARES the column. Declaring is not writing.
const SCHEMA = join("packages", "db", "src", "schema.ts");

test("the source walk is not vacuous", () => {
  const files = sources();
  // A walk that found nothing would report a clean sweep for the wrong reason -
  // LEARNINGS.md entry 5. This number is a floor, not a count.
  assert.ok(files.length > 200, `expected a real source tree, walked ${files.length} files`);
});

test("nothing but the e2e seed WRITES patients.auth_user_id", () => {
  const offenders = [];
  for (const f of sources()) {
    const r = rel(f);
    if (r === SEED || r === SCHEMA) continue;
    if (/\.test\.(ts|tsx|mjs|js)$/.test(r)) continue; // tests may assert on it
    const src = stripComments(readFileSync(f, "utf8"));
    // A WRITE looks like an assignment or an object property, never a predicate.
    // `isNull(patients.authUserId)` is the read this card exists to protect and
    // must not be flagged.
    if (/\bauthUserId\s*:/.test(src) || /\bauth_user_id\s*:/.test(src)) offenders.push(r);
    else if (/\bauthUserId\s*=[^=]/.test(src)) offenders.push(r);
  }
  assert.deepEqual(
    offenders,
    [],
    "A source file writes patients.auth_user_id. A non-null value SILENTLY LOCKS " +
      "THAT PATIENT OUT of the portal for good, with a refusal indistinguishable " +
      "from a wrong code. The column is pre-Decision-D and is meant to stay dead. " +
      "See LE-stale-auth-user-id-sweep.",
  );
});

test("the lockout predicate is still in the SQL, where it cannot be widened away", () => {
  // The other direction. The test above keeps the column unwritten; this one
  // keeps the guard that makes an unwritten column matter. Dropping the
  // predicate would let a claimed row log in, which is the opposite failure and
  // just as quiet.
  const src = stripComments(
    readFileSync(join(ROOT, "apps", "api", "lib", "auth", "patient-linkage.ts"), "utf8"),
  );
  assert.match(
    src,
    /isNull\(\s*patients\.authUserId\s*\)/,
    "resolvePatientByProvenPhone no longer requires auth_user_id IS NULL in the query",
  );
});

test("the e2e seed still writes an EXPLICIT null for the OTP first-login fixture", () => {
  // That explicit null is load-bearing and easy to tidy away: it is what keeps
  // the OTP-login fixture eligible while the trusted-device fixture next to it
  // is deliberately claimed. Losing it turns a passing suite into one that
  // proves nothing about first login.
  const src = stripComments(readFileSync(join(ROOT, SEED), "utf8"));
  assert.match(src, /auth_user_id:\s*null/, "the OTP first-login fixture lost its explicit null");
});

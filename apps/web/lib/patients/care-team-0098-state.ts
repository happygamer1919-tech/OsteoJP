/**
 * TEST SUPPORT, imported only by the apps/web DB-gated suites (never by the app).
 *
 * CARE-02a (0098 v2): WHICH 0098 THE DATABASE UNDER TEST HAS, read from the
 * catalogue and never assumed, and whether the repository says it must have it.
 *
 * ==========================================================================
 * WHY THE "0098:" ARMS CHOOSE THEIR ASSERTION INSTEAD OF SKIPPING OR FAILING
 * ==========================================================================
 * 0098 is HELD: it sits in packages/db/migrations-pending until 0094 to 0097 are
 * promoted, applied and merged, and CI's DB-gated job builds its database from
 * supabase/migrations, which does not contain it until the promotion commit.
 * The held PR must stay green there, and its 0098 arms must still run:
 *
 *   - a SKIP is red: .github/scripts/assert-rls-executed.mjs fails the job on
 *     any not-run test outside PERMITTED_SKIPS, and that list is frozen;
 *   - asserting the 0098 answer unconditionally is red on every run until the
 *     promotion, which is what round 1 did.
 *
 * So each arm reads this state and asserts WHICHEVER ANSWER THE DATABASE OWES:
 * the 0098 profile when it is applied, and the pre-0098 profile (what main does
 * today, a real assertion, not a pass by absence) when it is not. That is the
 * repo's own pattern for an arm a held migration flips: SCHED-29.2's
 * nesa-both-roles-conflict.db.test.ts and therapist-cancel.db.test.ts choose
 * their arm from pg_policies and "assert whichever applies; it is never
 * skipped" (docs/design/DECISIONS.md, 2026-09-13 SCHED-29.2).
 *
 * ==========================================================================
 * WHAT MAKES IT MORE THAN A SWITCH
 * ==========================================================================
 * 1. NEVER HALF. The helper and the three SELECT policies that name it arrive
 *    in one migration. A database with the helper and not every policy naming
 *    it, or the reverse, is neither profile, and this THROWS: every arm fails.
 * 2. THE PROMOTION FLIPS IT BY ITSELF. Once any .sql file in
 *    packages/db/migrations defines the helper (the promotion is a rename into
 *    that directory), a database WITHOUT 0098 is no longer an acceptable
 *    answer: this THROWS, so from the promotion commit on every "0098:" arm is
 *    red on a database that lacks it. Nobody has to remember to delete the
 *    pre-0098 branch for the check to become strict; deleting it afterwards is
 *    tidying, not the safety.
 * 3. IT IS REPORTED, NEVER READ AS A PASS. Each suite prints `detail` once and
 *    carries a test that names the state it ran against, so a green run on a
 *    database without 0098 says so in the log and in the JSON report.
 *
 * The helper is asked about with `probeCareTeamClinicHelper`, the app's own
 * question (care-team-reads-gate.ts), so the suites and the app cannot disagree
 * about what "0098 is applied" means.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import {
  CARE_TEAM_CLINIC_HELPER,
  CARE_TEAM_CLINIC_HELPER_CALL,
  probeCareTeamClinicHelper,
} from "./care-team-reads-gate";

type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

export type Care0098State = {
  /** The helper exists and all three SELECT policies name it. */
  applied: boolean;
  /** A file in packages/db/migrations defines the helper: 0098 has been promoted. */
  promoted: boolean;
  /** One line for the log: which profile the "0098:" arms asserted, and why. */
  detail: string;
};

/** The three SELECT policies 0098 v2 joins the helper into. */
const POLICIES = [
  ["patients", "patients_select"],
  ["clinical_records", "clinical_records_select"],
  ["patient_care_team", "patient_care_team_select"],
] as const;

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "packages", "db", "migrations");

/** The promoted migration files that define the helper, if any. */
export function promotedFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes(CARE_TEAM_CLINIC_HELPER));
}

const rowsOf = (r: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;

export async function care0098State(db: SqlExecutor): Promise<Care0098State> {
  const helper = await probeCareTeamClinicHelper(db);
  const rows = rowsOf(
    await db.execute(sql`
      select tablename::text as tablename, policyname::text as policyname,
             strpos(coalesce(qual, ''), ${CARE_TEAM_CLINIC_HELPER}) > 0 as names_helper
        from pg_policies
       where schemaname = 'public'
         and ((tablename = 'patients' and policyname = 'patients_select')
           or (tablename = 'clinical_records' and policyname = 'clinical_records_select')
           or (tablename = 'patient_care_team' and policyname = 'patient_care_team_select'))
    `),
  );
  if (rows.length !== POLICIES.length) {
    throw new Error(
      `0098 STATE UNREADABLE: expected the ${POLICIES.length} SELECT policies ` +
        `${POLICIES.map(([t, p]) => `${t}.${p}`).join(", ")}, found ${rows.length}. Nothing was checked.`,
    );
  }
  const naming = rows.filter((r) => r.names_helper === true).map((r) => `${r.tablename}.${r.policyname}`);
  const files = promotedFiles();
  const promoted = files.length > 0;

  let applied: boolean;
  if (helper && naming.length === POLICIES.length) applied = true;
  else if (!helper && naming.length === 0) applied = false;
  else {
    throw new Error(
      `0098 IS HALF APPLIED: ${CARE_TEAM_CLINIC_HELPER_CALL} ${helper ? "exists" : "is absent"}, and ` +
        `${naming.length} of ${POLICIES.length} SELECT policies name it (${naming.join(", ") || "none"}). ` +
        "That is neither the pre-0098 profile nor 0098's; no arm can be asserted.",
    );
  }
  if (promoted && !applied) {
    throw new Error(
      `0098 IS PROMOTED (${files.join(", ")} defines ${CARE_TEAM_CLINIC_HELPER}) BUT THIS DATABASE DOES NOT HAVE IT. ` +
        "From the promotion on, the pre-0098 profile is no longer an acceptable answer.",
    );
  }
  const detail = applied
    ? `0098 APPLIED on this database (${CARE_TEAM_CLINIC_HELPER_CALL} exists, all ${POLICIES.length} SELECT policies name it): ` +
      `the "0098:" arms assert 0098's profile.${promoted ? ` Promoted as ${files.join(", ")}.` : ""}`
    : `0098 NOT APPLIED on this database (${CARE_TEAM_CLINIC_HELPER_CALL} absent, no SELECT policy names it) and not ` +
      'promoted: the "0098:" arms asserted the PRE-0098 profile. This run proves nothing about 0098 itself.';
  return { applied, promoted, detail };
}

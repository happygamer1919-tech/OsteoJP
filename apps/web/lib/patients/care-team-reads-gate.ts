import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { runScoped, type RequestContext } from "../auth/context";

/**
 * CARE-02a (0098 v2): IS THE CLINIC-LIMITED CARE-TEAM HELPER ON THIS DATABASE?
 *
 * ==========================================================================
 * THE NAME, AND WHERE IT COMES FROM
 * ==========================================================================
 * The owner ruled on 2026-09-27 that a care-team therapist reads the ficha and
 * the registos ONLY at their own clinics ("limit to their clinic only"). 0098
 * v2 puts that rule in ONE nullary SECURITY DEFINER helper, created in
 * packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql,
 * and joins it into the therapist arms of patients_select,
 * clinical_records_select and patient_care_team_select. The name below is the
 * name that file creates, spelled once here and read by the app scope
 * (scope.ts), by its unit tests and by the DB-gated suites, so the app, RLS and
 * the proof cannot drift apart on it.
 *
 * ==========================================================================
 * WHY THE APP ASKS BEFORE IT NAMES THE FUNCTION
 * ==========================================================================
 * The helper arrives with 0098, which sits in migrations-pending until it is
 * promoted, and CI's databases (the DB-gated job and E2E) are built from
 * supabase/migrations. A statement naming a function that does not exist does
 * not return zero rows: Postgres raises 42883 and, inside `runScoped`, the
 * whole read dies. Unguarded, the care-team arm would take down every
 * therapist's /patients list, ficha, registos and Documentos on any database
 * without 0098. Round 1 did not have this problem only because it used 0091's
 * `viewer_care_team_patient_ids()`, which is live; the clinic limit is new.
 *
 * So the app asks the schema first, the NESA-NAMES way
 * (packages/db/src/shared-resource.ts, `sharedResourceNamesFnPresent`), and
 * until the helper exists the READ scope is the narrow scope: exactly what the
 * app read before CARE-02a, and exactly what RLS admits before 0098. The app
 * half switches on at the moment the RLS half exists and not a moment before,
 * which the data enforces rather than the merge order.
 *
 * `to_regprocedure` IS THE QUESTION, ASKED EXACTLY: NULL for an absent routine
 * instead of an error, no privilege needed, matched on schema, name and
 * (empty) argument list. The DB-gated suites ask with the same call
 * (`probeCareTeamClinicHelper`), so the app and its proof cannot disagree about
 * what "0098 is applied" means.
 *
 * CACHED PER PROCESS AND ASYMMETRICALLY, as shared-resource.ts does: "present"
 * never becomes false again and is kept for the life of the process; "absent"
 * is asked again after a minute, so the apply takes effect on a running
 * deployment without a redeploy. The app half merges BEFORE 0098 is applied
 * (owner, 2026-09-27), so production answers "absent" until the apply and
 * "present" within a minute of it. The migration's PR merges after the apply.
 */
export const CARE_TEAM_CLINIC_HELPER = "viewer_care_team_patient_ids_at_my_clinics";

/** The helper as `to_regprocedure` and a policy expression name it. */
export const CARE_TEAM_CLINIC_HELPER_CALL = `public.${CARE_TEAM_CLINIC_HELPER}()`;

type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

const rowsOf = (r: unknown): ReadonlyArray<Record<string, unknown>> =>
  (Array.isArray(r) ? r : ((r as { rows?: unknown[] } | null)?.rows ?? [])) as ReadonlyArray<
    Record<string, unknown>
  >;

/**
 * The raw question, uncached: does the helper exist on the database `db` is
 * connected to. Used by `careTeamClinicHelperPresent` below and, unchanged, by
 * the DB-gated suites.
 */
export async function probeCareTeamClinicHelper(db: SqlExecutor): Promise<boolean> {
  const rows = rowsOf(
    await db.execute(sql`select to_regprocedure(${CARE_TEAM_CLINIC_HELPER_CALL}) is not null as present`),
  );
  return rows[0]?.present === true;
}

/**
 * Whether the clinic-limited care-team helper exists, asked under the caller's
 * own claims (its own short `runScoped`, so a caller can build its scope before
 * it opens the transaction the scope goes into, as every read-scope caller
 * does). Only therapists reach this: scope.ts returns before asking for every
 * other role.
 */
export async function careTeamClinicHelperPresent(ctx: RequestContext): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const found = await runScoped(ctx, (tx) => probeCareTeamClinicHelper(tx));
  if (found) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetCareTeamClinicHelperCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

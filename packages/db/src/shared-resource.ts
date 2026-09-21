import { sql, type SQL } from "drizzle-orm";

/**
 * SCHED-17 - IS THE SHARED-RESOURCE SCHEMA ON THIS DATABASE YET?
 *
 * `users.is_shared_resource` arrives with the NESA migration, 0086
 * (packages/db/migrations/0086_nesa_shared_resource.sql), which production gets
 * only after 0085.
 * The app-layer half of NESA reads that column. Shipped against a database that
 * does not have it, every query naming it would fail with 42703 - on production,
 * and in CI, whose database is built from supabase/migrations.
 *
 * So the app asks, once, whether the column exists, and the NESA paths are
 * INERT until it does: no shared resources, today's behaviour exactly. The same
 * migration creates the column AND widens appointments_rls, so the app half
 * switches on at the moment the RLS half exists and not a moment before. That is
 * the spec's own condition for shipping the two halves ("the app-layer half MUST
 * NOT ship alone"), enforced by the data rather than by merge order.
 *
 * CACHED PER PROCESS, AND ASYMMETRICALLY. "Present" never becomes false again,
 * so it is kept for the life of the process. "Absent" is re-asked after a
 * minute, so an apply takes effect on the running deployment without a redeploy.
 *
 * `information_schema.columns` lists columns the CALLING role can see, which is
 * any role with a privilege on `users`: `authenticated` (staff, via runScoped)
 * and the service role (apps/api) both qualify.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export async function sharedResourceSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'users'
         and column_name = 'is_shared_resource'
    ) as present
  `)) as unknown as ReadonlyArray<{ present: boolean }>;
  if (rows[0]?.present === true) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetSharedResourceSchemaCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

/**
 * NESA-NAMES - IS THE PATIENT-NAME FUNCTION ON THIS DATABASE YET?
 *
 * The same question SCHED-17 asks above, one migration later and about a
 * FUNCTION rather than a column. `shared_resource_appointment_patient_names()`
 * arrives with `NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql`, which
 * sits in `migrations-pending/` and therefore has no number yet - by
 * construction `drizzle-kit migrate` cannot see it, so CI's database is built at
 * main's level WITHOUT the function.
 *
 * WHY THIS EXISTS, AND IT IS NOT A PRECAUTION. A `select ... from a_function()`
 * naming a function that does not exist does NOT return zero rows: Postgres
 * raises 42883 `function ... does not exist`, which aborts the statement and,
 * inside `runScoped`, the whole read. So an unguarded overlay does not degrade
 * to "no names" - it takes `listAppointments` down with it, and with it the
 * agenda, Marcações and the dashboard. Measured 2026-09-17 on a database at
 * 0088: four arms of two suites that pass on main failed with
 * `Caused by: PostgresError: function public.shared_resource_appointment_patient_names() does not exist`.
 *
 * `to_regprocedure` IS THE QUESTION, ASKED EXACTLY. It returns NULL for an
 * absent routine instead of raising, needs no privilege, and matches on the
 * identity that matters (schema, name and argument types - the function is
 * nullary). `information_schema.routines` would need the same triple spelled out
 * across three columns and hides routines the calling role holds no privilege
 * on, which would read as "absent" for a reason that is not absence. The
 * DB-gated test for this migration asks with the same call, so the app and its
 * proof cannot disagree about what "applied" means.
 *
 * CACHED PER PROCESS AND ASYMMETRICALLY, exactly as above: "present" is kept for
 * the life of the process, "absent" is re-asked after a minute, so the apply
 * takes effect on the running deployment without a redeploy.
 */
const FN_QUALIFIED = "public.shared_resource_appointment_patient_names()";

let fnPresent = false;
let fnAbsentCheckedAt = -Infinity;

export async function sharedResourceNamesFnPresent(db: SqlExecutor): Promise<boolean> {
  if (fnPresent) return true;
  if (Date.now() - fnAbsentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select to_regprocedure(${FN_QUALIFIED}) is not null as present
  `)) as unknown as ReadonlyArray<{ present: boolean }>;
  if (rows[0]?.present === true) {
    fnPresent = true;
    return true;
  }
  fnAbsentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetSharedResourceNamesFnCache(): void {
  fnPresent = false;
  fnAbsentCheckedAt = -Infinity;
}

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

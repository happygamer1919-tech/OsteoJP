import { sql, type SQL } from "drizzle-orm";

/**
 * DATED CLINIC CLOSURES - IS THE CLOSURE TABLE ON THIS DATABASE YET?
 *
 * `public.location_closed_days` arrives with the PENDING migration
 * `packages/db/migrations-pending/NEXT-AFTER-0113_location_closed_days.sql`,
 * which has no number yet. Every database built before it is applied (CI's,
 * whose stack is built from supabase/migrations; a lane; production until the
 * sitting) has no such table, and a query naming it does not return zero rows:
 * Postgres raises 42P01 `relation ... does not exist`, which aborts the
 * statement and, inside `runScoped`, the whole read. An unguarded reader would
 * take every booking, the agenda and the patient portal's slot grid down with
 * it.
 *
 * SO EVERY READER AND WRITER ASKS THIS FIRST, and with the table absent each
 * reads as today: no dated closure exists, so none can refuse anything. That is
 * what lets the readers deploy before the sitting.
 *
 * SAME SHAPE AS weekly-blocks-schema.ts (#1708), shared-resource.ts and
 * rgpd-acceptance-schema.ts, deliberately. One question, cached per process and
 * ASYMMETRICALLY: "present" never becomes false again, so it is kept for the
 * life of the process; "absent" is re-asked after a minute, so the apply takes
 * effect on the running deployment without a redeploy.
 *
 * `to_regclass` IS THE QUESTION, ASKED EXACTLY. It returns NULL for an absent
 * relation instead of raising and needs no privilege on the table, so the
 * answer is the same for `authenticated` (staff, through runScoped) and for
 * apps/api's portal queries (getDbAdmin, the owning connection).
 * information_schema.tables would hide the table from a role holding no
 * privilege on it, which would read as "absent" for a reason that is not
 * absence.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export const LOCATION_CLOSED_DAYS_TABLE = "public.location_closed_days";

export async function locationClosedDaysSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select to_regclass(${LOCATION_CLOSED_DAYS_TABLE}) is not null as present
  `)) as unknown as ReadonlyArray<{ present: boolean }> | undefined;
  if (Array.isArray(rows) && rows[0]?.present === true) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetLocationClosedDaysSchemaCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

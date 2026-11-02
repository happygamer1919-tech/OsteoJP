import { sql, type SQL } from "drizzle-orm";

/**
 * BLOQUEIOS DE REPETICAO SEMANAL - IS THE WEEKLY BLOCK TABLE ON THIS DATABASE YET?
 *
 * `public.therapist_weekly_blocks` arrives with the PENDING migration
 * `packages/db/migrations-pending/NEXT-AFTER-0109_weekly_blocks.sql`, which has
 * no number yet. Every database built before it is applied (CI's, whose stack
 * is built from supabase/migrations; a lane; a preview; production until the
 * sitting) has no such table, and a query naming it does not return zero rows:
 * Postgres raises 42P01 `relation ... does not exist`, which aborts the
 * statement and, inside `runScoped`, the whole read. An unguarded reader would
 * take the agenda, every booking and the patient portal's slot grid down with
 * it (RGPD-01's e2e run measured exactly that shape on 2026-09-23).
 *
 * SO EVERY READER AND WRITER ASKS THIS FIRST, and with the table absent each
 * reads as today: no weekly rule exists, so none can block anything.
 *
 * SAME SHAPE AS shared-resource.ts AND rgpd-acceptance-schema.ts, deliberately.
 * One question, cached per process and ASYMMETRICALLY: "present" never becomes
 * false again, so it is kept for the life of the process; "absent" is re-asked
 * after a minute, so the apply takes effect on the running deployment without a
 * redeploy.
 *
 * `to_regclass` IS THE QUESTION, ASKED EXACTLY. It returns NULL for an absent
 * relation instead of raising and needs no privilege on the table, so the
 * answer is the same for `authenticated` (staff, through runScoped) and for the
 * service role (apps/api's portal queries). information_schema.tables would
 * hide the table from a role holding no privilege on it, which would read as
 * "absent" for a reason that is not absence.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export const WEEKLY_BLOCKS_TABLE = "public.therapist_weekly_blocks";

export async function weeklyBlocksSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select to_regclass(${WEEKLY_BLOCKS_TABLE}) is not null as present
  `)) as unknown as ReadonlyArray<{ present: boolean }>;
  if (rows[0]?.present === true) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetWeeklyBlocksSchemaCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

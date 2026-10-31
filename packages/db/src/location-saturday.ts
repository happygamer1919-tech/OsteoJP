import { sql, type SQL } from "drizzle-orm";

/**
 * HOR-01 - EACH CLINIC'S SATURDAY CLOSING TIME, IF THIS DATABASE HAS ONE YET.
 *
 * `locations.saturday_closes_at` arrives with its own migration (HOR-02), which
 * is held for the apply lane and a strategy ruling. The staff app's default
 * availability (apps/web/lib/scheduling/effective-availability.ts) reads it to
 * decide whether a therapist with no Horarios rows works on Saturday at a
 * clinic. Shipped against a database that does not have the column, a query
 * naming it would fail with 42703 and take every booking read down with it.
 *
 * So the column is NOT in the Drizzle schema on this branch, and it is read
 * here, by name, only after asking whether it exists - the same shape as
 * `sharedResourceSchemaPresent` (./shared-resource.ts). While it is absent every
 * clinic reads as "no Saturday closing time", which generates no Saturday rows:
 * exactly today's behaviour for Saturday.
 *
 * CACHED PER PROCESS, AND ASYMMETRICALLY, as there: "present" is kept for the
 * life of the process, "absent" is re-asked after a minute, so an apply takes
 * effect on the running deployment without a redeploy.
 *
 * `information_schema.columns` lists columns the CALLING role can see, which is
 * any role with a privilege on `locations`: `authenticated` (staff, via
 * runScoped) and the owning role both qualify.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export async function locationSaturdayColumnPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'locations'
         and column_name = 'saturday_closes_at'
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
export function resetLocationSaturdayColumnCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

/**
 * The Saturday closing time of each named clinic, as "HH:MM:SS", or null where
 * the clinic has none. Every id asked about is in the answer; an id the caller
 * cannot read, or every id while the column is absent, maps to null.
 *
 * Runs on the caller's executor, so on a tenant-scoped transaction RLS decides
 * which rows are visible, exactly as for any other read of `locations`.
 */
export async function readLocationSaturdayClosesAt(
  db: SqlExecutor,
  locationIds: readonly string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(locationIds)];
  for (const id of ids) out.set(id, null);
  if (ids.length === 0) return out;
  if (!(await locationSaturdayColumnPresent(db))) return out;
  const rows = (await db.execute(sql`
    select l.id::text as id, l.saturday_closes_at::text as saturday_closes_at
      from public.locations l
     where l.id in (${sql.join(
       ids.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
  `)) as unknown as ReadonlyArray<{ id: string; saturday_closes_at: string | null }>;
  for (const r of rows) out.set(r.id, r.saturday_closes_at ?? null);
  return out;
}

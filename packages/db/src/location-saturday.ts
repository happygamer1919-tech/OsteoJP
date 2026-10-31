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
type SqlExecutor = {
  execute: (query: SQL) => PromiseLike<unknown>;
  /** Present on a Drizzle transaction: a nested call is a SAVEPOINT. */
  transaction?: <T>(fn: (tx: SqlExecutor) => Promise<T>) => Promise<T>;
};

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
 * Tests only: behave as if the column had been seen, which is the state a
 * running process is in after the column existed once. Used to prove the
 * rollback path below on a database that does not have it.
 */
export function markLocationSaturdayColumnPresentForTests(): void {
  present = true;
}

/** Postgres 42703 (undefined_column), however a driver or ORM wraps it. */
function isUndefinedColumn(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && i < 5; i++) {
    if (typeof cur === "object" && (cur as { code?: unknown }).code === "42703") return true;
    cur = typeof cur === "object" ? (cur as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/**
 * The Saturday closing time of each named clinic, as "HH:MM:SS", or null where
 * the clinic has none. Every id asked about is in the answer; an id the caller
 * cannot read, or every id while the column is absent, maps to null.
 *
 * Runs on the caller's executor, so on a tenant-scoped transaction RLS decides
 * which rows are visible, exactly as for any other read of `locations`.
 *
 * IF THE COLUMN DISAPPEARS UNDER A RUNNING PROCESS (the migration rolled back
 * after "present" was cached), the read fails with 42703. It runs inside a
 * SAVEPOINT when the executor is a transaction, so that failure does not abort
 * the caller's transaction: the cache is cleared, and the answer is "no Saturday
 * hours", as if the column had never been seen. Booking keeps working without a
 * redeploy, and the next ask after a minute re-checks the catalogue.
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
  const query = sql`
    select l.id::text as id, l.saturday_closes_at::text as saturday_closes_at
      from public.locations l
     where l.id in (${sql.join(
       ids.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
  `;
  let rows: ReadonlyArray<{ id: string; saturday_closes_at: string | null }>;
  try {
    rows = (await (db.transaction
      ? db.transaction((sp) => Promise.resolve(sp.execute(query)))
      : db.execute(query))) as unknown as ReadonlyArray<{ id: string; saturday_closes_at: string | null }>;
  } catch (e) {
    if (!isUndefinedColumn(e)) throw e;
    present = false;
    absentCheckedAt = Date.now();
    return out;
  }
  for (const r of rows) out.set(r.id, r.saturday_closes_at ?? null);
  return out;
}

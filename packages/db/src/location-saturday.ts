import { sql, type SQL } from "drizzle-orm";

/**
 * HOR-01 - EACH CLINIC'S SATURDAY HOURS, IF THIS DATABASE HAS THEM YET.
 *
 * `locations.saturday_opens_at` and `locations.saturday_closes_at` arrive
 * together with their own migration (HOR-02), which is held for the apply lane.
 * The staff app's default availability
 * (apps/web/lib/scheduling/effective-availability.ts) reads them to decide
 * whether a therapist with no Horarios rows works on Saturday at a clinic.
 * Shipped against a database that does not have them, a query naming either
 * would fail with 42703 and take every booking read down with it.
 *
 * A SATURDAY HAS ITS OWN OPENING TIME, NOT THE WEEKDAY ONE (owner, 2026-10-31:
 * "Saturday hours per clinic: 9am to 1pm, sunday closed", while every clinic
 * opens at 08:00 on weekdays). So Saturday reads BOTH columns and never borrows
 * `opens_at`: a clinic with a Saturday closing time and no Saturday opening
 * time has no Saturday hours, rather than hours that start an hour early.
 *
 * So the columns are NOT in the Drizzle schema on this branch, and they are
 * read here, by name, only after asking whether BOTH exist - the same shape as
 * `sharedResourceSchemaPresent` (./shared-resource.ts). One column without the
 * other is not a state HOR-02 can leave behind (one migration adds both), and
 * it is read as "absent" rather than half-trusted. While they are absent every
 * clinic reads as "no Saturday hours", which generates no Saturday rows:
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

/** One clinic's Saturday, Lisbon wall clock "HH:MM:SS". Both ends, always. */
export type LocationSaturdayHours = { opensAt: string; closesAt: string };

const SATURDAY_COLUMNS = ["saturday_opens_at", "saturday_closes_at"] as const;

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

/**
 * True only when BOTH Saturday columns exist. One catalogue query, which names
 * the columns it found rather than answering yes or no, so "one of the two" is
 * a state this function sees and refuses instead of one a single EXISTS would
 * report as present.
 */
export async function locationSaturdayHoursPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select column_name::text as column_name from information_schema.columns
     where table_schema = 'public'
       and table_name = 'locations'
       and column_name in ('saturday_opens_at', 'saturday_closes_at')
  `)) as unknown as ReadonlyArray<{ column_name: string }>;
  const found = new Set(rows.map((r) => r.column_name));
  if (SATURDAY_COLUMNS.every((c) => found.has(c))) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetLocationSaturdayHoursCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

/**
 * Tests only: behave as if the columns had been seen, which is the state a
 * running process is in after they existed once. Used to prove the rollback
 * path below on a database that does not have them.
 */
export function markLocationSaturdayHoursPresentForTests(): void {
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
 * The Saturday hours of each named clinic, or null where the clinic has none.
 * A clinic has Saturday hours only when BOTH its opening and its closing time
 * are set; either one NULL reads as null, never as a half-day guessed from the
 * weekday hours. Every id asked about is in the answer; an id the caller cannot
 * read, or every id while the columns are absent, maps to null.
 *
 * Whether closing comes after opening is NOT decided here: the caller
 * (effective-availability-core.ts) applies the same forward-window rule to
 * Saturday that it applies to the weekday pair, and HOR-02's CHECK refuses a
 * backwards pair on the table itself.
 *
 * Runs on the caller's executor, so on a tenant-scoped transaction RLS decides
 * which rows are visible, exactly as for any other read of `locations`.
 *
 * IF A COLUMN DISAPPEARS UNDER A RUNNING PROCESS (the migration rolled back
 * after "present" was cached), the read fails with 42703. It runs inside a
 * SAVEPOINT when the executor is a transaction, so that failure does not abort
 * the caller's transaction: the cache is cleared, and the answer is "no Saturday
 * hours", as if the columns had never been seen. Booking keeps working without
 * a redeploy, and the next ask after a minute re-checks the catalogue.
 */
export async function readLocationSaturdayHours(
  db: SqlExecutor,
  locationIds: readonly string[],
): Promise<Map<string, LocationSaturdayHours | null>> {
  const out = new Map<string, LocationSaturdayHours | null>();
  const ids = [...new Set(locationIds)];
  for (const id of ids) out.set(id, null);
  if (ids.length === 0) return out;
  if (!(await locationSaturdayHoursPresent(db))) return out;
  type Row = { id: string; saturday_opens_at: string | null; saturday_closes_at: string | null };
  const query = sql`
    select l.id::text as id,
           l.saturday_opens_at::text as saturday_opens_at,
           l.saturday_closes_at::text as saturday_closes_at
      from public.locations l
     where l.id in (${sql.join(
       ids.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
  `;
  let rows: ReadonlyArray<Row>;
  try {
    rows = (await (db.transaction
      ? db.transaction((sp) => Promise.resolve(sp.execute(query)))
      : db.execute(query))) as unknown as ReadonlyArray<Row>;
  } catch (e) {
    if (!isUndefinedColumn(e)) throw e;
    present = false;
    absentCheckedAt = Date.now();
    return out;
  }
  for (const r of rows) {
    out.set(
      r.id,
      r.saturday_opens_at != null && r.saturday_closes_at != null
        ? { opensAt: r.saturday_opens_at, closesAt: r.saturday_closes_at }
        : null,
    );
  }
  return out;
}

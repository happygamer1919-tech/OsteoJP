import { sql, type SQL } from "drizzle-orm";

// Advisory locking for appointment slot writes (finding 2.9).
//
// WHY THIS EXISTS. createBooking did check-then-insert inside one transaction
// and a comment claimed that "closes the check-then-write race". It does not.
// Under READ COMMITTED two transactions both pass the `exists(...)` guard,
// because neither sees the other's uncommitted row, and both insert. A plain
// SELECT takes no lock. rescheduleOwn was worse: its conflict check ran in a
// separate statement entirely, outside any transaction.
//
// WHAT THIS DOES NOT DO. Read this before trusting it.
//
//  * It does NOT prevent deliberate double-booking. Staff overriding a conflict
//    ("Save anyway") is permitted product behaviour, asserted by
//    apps/web/e2e/agenda-cards.spec.ts:104. This orders writes; it forbids
//    nothing.
//  * It does NOT protect a writer that bypasses the choke point. This is an
//    APPLICATION guarantee with NO database backstop behind it: the partial
//    EXCLUDE constraint was cancelled once a DB-gated test proved created_by
//    cannot identify portal rows (packages/db/tests/appointments-created-by-
//    provenance.test.ts). write-paths.test.ts is the only thing keeping the set
//    of writers honest. If that test is weak, this protection is weak.
//  * It does NOT make the conflict guard redundant. The guard produces the
//    ordinary "slot taken" answer; the lock only closes the racing window
//    between the guard and the write.
//  * RLS does NOT back any of this up. The appointments policies scope
//    visibility and authorship, not concurrency. (0049's WITH CHECK is a
//    disjunction and constrains nothing on its own.)

/**
 * Slot bucket width. Two windows that OVERLAP must hash to a shared key or the
 * lock does not serialize the case it exists for: 09:00-10:00 and 09:30-10:30
 * overlap but share no `starts_at`. Bucketing to the clinic's booking
 * granularity makes them contend.
 */
export const SLOT_BUCKET_SECONDS = 15 * 60;

/**
 * Every 15-minute bucket a window touches, ASCENDING.
 *
 * Ascending order is not cosmetic: two transactions locking overlapping bucket
 * sets in opposite orders would deadlock. A consistent global order makes that
 * impossible.
 *
 * The window is half-open [startsAt, endsAt), matching the overlap predicate,
 * so an appointment ending exactly on a boundary does not claim the next
 * bucket. A zero-length or inverted window yields the single start bucket
 * rather than nothing, so a malformed input can never silently skip locking.
 */
export function slotBuckets(startsAt: Date, endsAt: Date): number[] {
  const startSec = Math.floor(startsAt.getTime() / 1000);
  const endSec = Math.floor(endsAt.getTime() / 1000);

  const first = Math.floor(startSec / SLOT_BUCKET_SECONDS);
  if (endSec <= startSec) return [first];

  // Half-open: an end landing exactly on a boundary belongs to the previous
  // bucket, so subtract one second before flooring.
  const last = Math.floor((endSec - 1) / SLOT_BUCKET_SECONDS);

  const buckets: number[] = [];
  for (let b = first; b <= last; b++) buckets.push(b);
  return buckets;
}

/**
 * The lock key input for one bucket. Tenant + therapist + bucket scoped, never
 * table-global: two bookings for different therapists must not contend.
 */
export function slotLockPayload(
  tenantId: string,
  practitionerId: string,
  bucket: number,
): string {
  return `${tenantId}:${practitionerId}:${bucket}`;
}

/**
 * SQL taking a transaction-scoped advisory lock for every bucket the window
 * touches, in ascending order.
 *
 * pg_advisory_xact_lock (transaction-scoped), NOT pg_advisory_lock: the
 * transaction variant releases at commit OR rollback. The session variant
 * leaks a lock on any error path and eventually wedges a pooled connection.
 *
 * hashtextextended(text, 0) -> bigint matches the single-argument signature. A
 * hash collision costs serialization between two unrelated slots, never a
 * correctness failure.
 */
export function acquireSlotLocks(
  tenantId: string,
  practitionerId: string,
  startsAt: Date,
  endsAt: Date,
): SQL {
  const payloads = slotBuckets(startsAt, endsAt).map((b) =>
    slotLockPayload(tenantId, practitionerId, b),
  );

  return sql`select ${sql.join(
    payloads.map((p) => sql`pg_advisory_xact_lock(hashtextextended(${p}, 0))`),
    sql`, `,
  )}`;
}

import { sql, type SQL } from "drizzle-orm";

// Staff-side mirror of apps/api/lib/appointments/slot-lock.ts (finding 2.9).
//
// WHY A MIRROR AND NOT AN IMPORT. apps/web and apps/api are separate Next
// builds; neither may import the other's source at runtime, and the shared
// package (packages/db) is a different lane. The repo already uses this pattern
// deliberately elsewhere (see the DUPLICATION NOTE in
// packages/db/tests/appointment-clone-rls.test.ts).
//
// The duplication is kept honest by slot-lock-parity.test.ts, which imports
// BOTH modules and asserts they produce identical buckets and identical lock
// payloads across a matrix of inputs. If either side drifts, that test fails.
// A comment claiming the two agree would be worth nothing; this repo has a
// documented history of exactly that kind of claim.
//
// WHAT THIS DOES NOT DO. Read before trusting it.
//
//  * It does NOT prevent deliberate double-booking, and it must not. Staff
//    overriding a conflict ("Save anyway") is permitted product behaviour,
//    asserted by apps/web/e2e/agenda-cards.spec.ts:104. Taking the lock only
//    ORDERS writes; every conflict decision stays exactly where it was.
//  * It does NOT cover staff RESCHEDULE. Only the four create/clone/batch
//    insert sites take the lock (the scope granted for this change). A staff
//    reschedule still moves an appointment without holding it.
//  * There is NO database backstop beneath this. The partial EXCLUDE constraint
//    was cancelled after a DB-gated test proved created_by cannot identify
//    portal rows. apps/api/lib/appointments/write-paths.test.ts is the only
//    thing keeping the set of writers complete.

/** MUST match apps/api/lib/appointments/slot-lock.ts. Pinned by the parity test. */
export const SLOT_BUCKET_SECONDS = 15 * 60;

/**
 * Every 15-minute bucket a window touches, ASCENDING.
 *
 * Ascending order prevents deadlock between two transactions locking
 * overlapping bucket sets. Half-open [startsAt, endsAt), so back-to-back
 * appointments do not contend. Never returns an empty set: a zero-length or
 * inverted window yields the start bucket, so a malformed input cannot
 * silently skip locking.
 */
export function slotBuckets(startsAt: Date, endsAt: Date): number[] {
  const startSec = Math.floor(startsAt.getTime() / 1000);
  const endSec = Math.floor(endsAt.getTime() / 1000);

  const first = Math.floor(startSec / SLOT_BUCKET_SECONDS);
  if (endSec <= startSec) return [first];

  const last = Math.floor((endSec - 1) / SLOT_BUCKET_SECONDS);

  const buckets: number[] = [];
  for (let b = first; b <= last; b++) buckets.push(b);
  return buckets;
}

/** Tenant + therapist + bucket scoped, never table-global. */
export function slotLockPayload(
  tenantId: string,
  practitionerId: string,
  bucket: number,
): string {
  return `${tenantId}:${practitionerId}:${bucket}`;
}

/**
 * Transaction-scoped advisory locks for every bucket the window touches.
 *
 * pg_advisory_xact_lock, NOT pg_advisory_lock: the transaction variant releases
 * at commit or rollback, so it cannot leak a lock on an error path and wedge a
 * pooled connection.
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

/**
 * Lock every distinct (therapist, window) pair a multi-row write touches, in a
 * deterministic global order.
 *
 * Batch and recurrence insert many rows in one transaction. Locking them in
 * arrival order would let two batches acquire overlapping sets in opposite
 * orders and deadlock. Sorting by the payload string gives every transaction
 * the same order, which is what makes that impossible.
 */
export function acquireSlotLocksForMany(
  tenantId: string,
  rows: { practitionerId: string; startsAt: Date; endsAt: Date }[],
): SQL | null {
  const payloads = new Set<string>();
  for (const r of rows) {
    for (const b of slotBuckets(r.startsAt, r.endsAt)) {
      payloads.add(slotLockPayload(tenantId, r.practitionerId, b));
    }
  }
  if (payloads.size === 0) return null;

  const ordered = [...payloads].sort();
  return sql`select ${sql.join(
    ordered.map((p) => sql`pg_advisory_xact_lock(hashtextextended(${p}, 0))`),
    sql`, `,
  )}`;
}

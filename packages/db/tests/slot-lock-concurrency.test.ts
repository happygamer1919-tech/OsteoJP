/**
 * slot-lock-concurrency.test.ts
 *
 * A4 — the double-booking workstream closes on an EXIT CODE, not on an argument.
 *
 * Everything else proving the advisory slot lock is construction plus unit
 * tests: the key derivation is unit-tested, the parity between the two mirrored
 * modules is asserted, and the set of write paths is guarded. None of that runs
 * two transactions against a real Postgres at the same time, and "proven by
 * construction" is the exact category of evidence that produced all four false
 * claims this workstream found.
 *
 * So this file contends TWO REAL SESSIONS for the same slot.
 *
 * HOW IT IS KEPT HONEST
 *   * The lock KEY logic is MIRRORED from apps/api (packages/db must not import
 *     apps/*, and the tsconfig rootDir boundary enforces that). The mirror is
 *     guarded: a test below reads the canonical source as text and asserts the
 *     bucket width and payload shape still match, so drift goes red here rather
 *     than silently locking the wrong keys.
 *   * Each arm has a NEGATIVE CONTROL: with the lock disabled the same scenario
 *     must produce a double-booking. A test that passes because nothing raced
 *     proves nothing, so the race is demonstrated before it is fixed.
 *   * Set A4_DISABLE_LOCK=1 to run the whole file with the lock removed. It
 *     must FAIL. That pair of exit codes is the deliverable.
 *
 * THE OFF-GRID CASE IS THE POINT. 09:00-10:00 and 09:30-10:30 overlap but share
 * no starts_at. A lock keyed on the instant would let both through while looking
 * like it worked. Bucketing is what makes them contend, so it is tested
 * explicitly rather than only at neat boundaries.
 *
 * GATING: needs a live DATABASE_URL with migrations applied. Skipped without
 * one. Local or CI Postgres only - never prod.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, live } from "./rls-harness";

// packages/db must NOT import apps/* - the tsconfig rootDir boundary enforces
// it, and that boundary is correct. So the two PURE key functions are mirrored
// here, exactly as packages/db/tests/appointment-clone-rls.test.ts mirrors the
// clone mapping for the same reason.
//
// The duplication is guarded: a test below reads the canonical source as TEXT
// and asserts the bucket width and payload shape still match. If apps/api
// changes either, this file goes red instead of silently locking wrong keys.
const CANONICAL = join(
  __dirname, "..", "..", "..", "apps", "api", "lib", "appointments", "slot-lock.ts",
);

const SLOT_BUCKET_SECONDS = 15 * 60;

function slotBuckets(startsAt: Date, endsAt: Date): number[] {
  const startSec = Math.floor(startsAt.getTime() / 1000);
  const endSec = Math.floor(endsAt.getTime() / 1000);
  const first = Math.floor(startSec / SLOT_BUCKET_SECONDS);
  if (endSec <= startSec) return [first];
  const last = Math.floor((endSec - 1) / SLOT_BUCKET_SECONDS);
  const out: number[] = [];
  for (let b = first; b <= last; b++) out.push(b);
  return out;
}

const slotLockPayload = (tenantId: string, practitionerId: string, bucket: number) =>
  `${tenantId}:${practitionerId}:${bucket}`;

/** Set to 1 to prove the race is real: the lock is skipped and assertions fail. */
const LOCK_DISABLED = process.env.A4_DISABLE_LOCK === "1";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  location: string;
  service: string;
  patientA: string;
  patientB: string;
};

const X: Ids = {
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patientA: randomUUID(),
  patientB: randomUUID(),
};

const at = (iso: string) => new Date(iso);

async function seed(sql: Sql): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${X.tenant}, 'Lock Gate', ${`lock-gate-${X.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${X.role}, ${X.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${X.user}, ${X.tenant}, ${X.role}, ${`l-${X.user}@example.pt`}, 'Seed Therapist')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${X.location}, ${X.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${X.service}, ${X.tenant}, ${X.location}, 'Consulta')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${X.patientA}, ${X.tenant}, 'Patient A')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${X.patientB}, ${X.tenant}, 'Patient B')`;
}

/** Take the slot lock for every bucket the window touches, ascending. */
async function acquire(tx: Sql, startsAt: Date, endsAt: Date): Promise<void> {
  if (LOCK_DISABLED) return;
  for (const bucket of slotBuckets(startsAt, endsAt)) {
    const payload = slotLockPayload(X.tenant, X.user, bucket);
    await tx`select pg_advisory_xact_lock(hashtextextended(${payload}, 0))`;
  }
}

/** The conflict guard, mirroring apptOverlapExists (half-open, cancelled/no_show free). */
async function hasConflict(tx: Sql, startsAt: Date, endsAt: Date): Promise<boolean> {
  const rows = await tx`
    select 1 from appointments a
    where a.tenant_id = ${X.tenant}
      and a.practitioner_id = ${X.user}
      and a.status not in ('cancelled', 'no_show')
      and a.starts_at < ${endsAt}
      and a.ends_at   > ${startsAt}
    limit 1`;
  return rows.length > 0;
}

async function insertAppointment(
  tx: Sql,
  patientId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<void> {
  await tx`
    insert into appointments
      (tenant_id, patient_id, practitioner_id, location_id, service_id,
       starts_at, ends_at, status)
    values
      (${X.tenant}, ${patientId}, ${X.user}, ${X.location}, ${X.service},
       ${startsAt}, ${endsAt}, 'scheduled')`;
}

async function bookedCount(sql: Sql, startsAt: Date, endsAt: Date): Promise<number> {
  const rows = await sql`
    select count(*)::int as n from appointments
    where tenant_id = ${X.tenant}
      and practitioner_id = ${X.user}
      and status not in ('cancelled', 'no_show')
      and starts_at < ${endsAt}
      and ends_at   > ${startsAt}`;
  return Number(rows[0]?.n ?? 0);
}

/** Resolvable barrier, so the test controls exactly when session A commits. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

/**
 * Two sessions attempt the same slot concurrently.
 *
 * A locks, sees a free slot and inserts, then HOLDS its transaction open.
 * B starts and tries to lock. With the lock it blocks; without it, B's guard
 * reads stale data (READ COMMITTED hides A's uncommitted row), sees "free", and
 * inserts too - which is the race, reproduced.
 */
async function raceTwoSessions(
  a: Sql,
  b: Sql,
  windowA: [Date, Date],
  windowB: [Date, Date],
): Promise<void> {
  const commitA = gate();
  const aInserted = gate();

  const sessionA = a.begin(async (tx) => {
    await acquire(tx as unknown as Sql, windowA[0], windowA[1]);
    if (!(await hasConflict(tx as unknown as Sql, windowA[0], windowA[1]))) {
      await insertAppointment(tx as unknown as Sql, X.patientA, windowA[0], windowA[1]);
    }
    aInserted.open();
    await commitA.promise; // hold the transaction open
  });

  await aInserted.promise;

  const sessionB = b.begin(async (tx) => {
    await acquire(tx as unknown as Sql, windowB[0], windowB[1]);
    if (!(await hasConflict(tx as unknown as Sql, windowB[0], windowB[1]))) {
      await insertAppointment(tx as unknown as Sql, X.patientB, windowB[0], windowB[1]);
    }
  });

  // Give B a moment to reach (and, when locking, block on) the lock.
  await new Promise((r) => setTimeout(r, 250));
  commitA.open();

  await Promise.all([sessionA, sessionB]);
}

describe.skipIf(!live)("A4 — two real sessions contending for one slot", () => {
  let a: Sql;
  let b: Sql;

  beforeAll(async () => {
    a = connect();
    b = connect(); // a SECOND connection: max:1 per pool, so this is a real 2nd session
    await seed(a);
  });

  afterAll(async () => {
    if (a) {
      await a`delete from tenants where id = ${X.tenant}`;
      await a.end();
    }
    if (b) await b.end();
  });

  beforeEach(async () => {
    await a`delete from appointments where tenant_id = ${X.tenant}`;
  });

  it("the mirrored key logic still matches apps/api (drift guard)", () => {
    const canonical = readFileSync(CANONICAL, "utf-8");

    // Bucket width. If apps/api changes it, this file would lock different keys
    // than production while still passing every assertion below.
    expect(
      canonical.includes("SLOT_BUCKET_SECONDS = 15 * 60"),
      "apps/api changed SLOT_BUCKET_SECONDS - update the mirror in this file.",
    ).toBe(true);

    // Payload shape, template-literal form.
    expect(
      canonical.includes("`${tenantId}:${practitionerId}:${bucket}`"),
      "apps/api changed the lock payload shape - update the mirror in this file.",
    ).toBe(true);

    // Half-open end handling, the subtlety that decides back-to-back contention.
    expect(
      canonical.includes("Math.floor((endSec - 1) / SLOT_BUCKET_SECONDS)"),
      "apps/api changed how the last bucket is derived - update the mirror.",
    ).toBe(true);
  });

  it("reports which mode it is running in", () => {
    // Printed so a green run cannot be mistaken for the disabled-lock arm.
    console.log(
      LOCK_DISABLED
        ? "A4: LOCK DISABLED (A4_DISABLE_LOCK=1) - assertions MUST fail"
        : "A4: lock ENABLED - assertions must pass",
    );
    expect(typeof LOCK_DISABLED).toBe("boolean");
  });

  it("IDENTICAL windows: only one booking survives", async () => {
    const w: [Date, Date] = [at("2026-11-02T09:00:00Z"), at("2026-11-02T10:00:00Z")];
    await raceTwoSessions(a, b, w, w);

    expect(
      await bookedCount(a, w[0], w[1]),
      "Two sessions both booked the same slot. The check-then-insert race is open.",
    ).toBe(1);
  });

  it("OFF-GRID overlap (09:00-10:00 vs 09:30-10:30): only one survives", async () => {
    // The load-bearing case. These overlap but share no starts_at, so a lock
    // keyed on the instant would let both through while appearing to work.
    const wA: [Date, Date] = [at("2026-11-03T09:00:00Z"), at("2026-11-03T10:00:00Z")];
    const wB: [Date, Date] = [at("2026-11-03T09:30:00Z"), at("2026-11-03T10:30:00Z")];

    // Sanity: the two windows must actually share a bucket, or this test is
    // asserting nothing about bucketing.
    const shared = slotBuckets(wA[0], wA[1]).filter((x) =>
      slotBuckets(wB[0], wB[1]).includes(x),
    );
    expect(shared.length, "windows do not share a bucket - fixture is wrong").toBeGreaterThan(0);

    await raceTwoSessions(a, b, wA, wB);

    expect(
      await bookedCount(a, wA[0], wA[1]),
      "Overlapping-but-offset windows both booked. Bucketing is not contending.",
    ).toBe(1);
  });

  it("NON-overlapping back-to-back windows both succeed (no over-locking)", async () => {
    // Positive control. If the lock serialized everything, the assertions above
    // would pass while the clinic could only ever book one appointment.
    const wA: [Date, Date] = [at("2026-11-04T10:00:00Z"), at("2026-11-04T11:00:00Z")];
    const wB: [Date, Date] = [at("2026-11-04T11:00:00Z"), at("2026-11-04T12:00:00Z")];

    await raceTwoSessions(a, b, wA, wB);

    expect(await bookedCount(a, wA[0], wA[1])).toBe(1);
    expect(await bookedCount(a, wB[0], wB[1])).toBe(1);
  });

  it("two concurrent OVERLAPPING batches do not deadlock", async () => {
    // Batch and recurrence lock many buckets in one transaction. Acquiring them
    // in opposite orders would deadlock; sorted acquisition is what prevents it.
    // Deliberately fed in OPPOSITE orders here.
    const slots: [Date, Date][] = [
      [at("2026-11-05T09:00:00Z"), at("2026-11-05T09:30:00Z")],
      [at("2026-11-05T10:00:00Z"), at("2026-11-05T10:30:00Z")],
      [at("2026-11-05T11:00:00Z"), at("2026-11-05T11:30:00Z")],
    ];

    const lockMany = async (tx: Sql, order: [Date, Date][]) => {
      const payloads = new Set<string>();
      for (const [s, e] of order) {
        for (const bucket of slotBuckets(s, e)) {
          payloads.add(slotLockPayload(X.tenant, X.user, bucket));
        }
      }
      for (const p of [...payloads].sort()) {
        if (LOCK_DISABLED) continue;
        await tx`select pg_advisory_xact_lock(hashtextextended(${p}, 0))`;
      }
    };

    const batchA = a.begin(async (tx) => {
      await lockMany(tx as unknown as Sql, slots);
      await new Promise((r) => setTimeout(r, 100));
      await insertAppointment(tx as unknown as Sql, X.patientA, slots[0]![0], slots[0]![1]);
    });
    const batchB = b.begin(async (tx) => {
      await lockMany(tx as unknown as Sql, [...slots].reverse());
      await new Promise((r) => setTimeout(r, 100));
      await insertAppointment(tx as unknown as Sql, X.patientB, slots[2]![0], slots[2]![1]);
    });

    // A deadlock surfaces as SQLSTATE 40P01 from one side. Neither may throw.
    await expect(Promise.all([batchA, batchB])).resolves.toBeDefined();
  });
});

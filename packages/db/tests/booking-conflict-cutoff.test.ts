/**
 * booking-conflict-cutoff.test.ts
 *
 * DB-gated proof of the two patient-booking safety rules that #132 implemented
 * in apps/api (lib/appointments/store.ts + cutoff.ts). Those modules live in the
 * app, so the db-tests gate never exercises them — yet both rules are ultimately
 * decided by Postgres against live rows, and a regression there lets a patient
 * double-book a therapist or slip past the 24h window. This suite runs the REAL
 * predicate shapes against a freshly-migrated database (supabase db reset), so a
 * break is caught in the db gate BEFORE patients book live.
 *
 * The two rules:
 *
 *   1. NO DOUBLE-BOOK — apptOverlapExists (store.ts). A therapist conflicts when
 *      an existing, non-cancelled appointment overlaps the requested window on a
 *      HALF-OPEN interval: a.starts_at < req.ends_at AND a.ends_at > req.starts_at.
 *      Cancelled appointments never conflict; an exactly-abutting window does not.
 *
 *   2. 24h SELF-SERVICE CUTOFF — isWithinCancellationCutoff (cutoff.ts). An
 *      appointment is inside the cutoff (self-cancel / self-reschedule REJECTED)
 *      when it is less than 24h away from `now`, or already started. Half-open at
 *      the boundary: exactly 24h out is still allowed.
 *
 * DUPLICATION NOTE (guardrail): apps/api must NOT be refactored into a shared
 * package this wave, so the two predicates below are duplicated MINIMALLY from
 * their canonical sources. They go red here if the SQL shape is wrong, but the
 * single-source guarantee waits on the WAVE B @osteojp/scheduling extraction.
 *   TODO(@osteojp/scheduling): when store.ts conflict + cutoff.ts move into a
 *   shared package, import them here and delete these local re-statements so the
 *   db gate tests the production code directly instead of a faithful mirror.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in CI without a DB — identical to the other packages/db suites.
 * The privileged connection is the faithful seam: real conflict detection runs
 * on service_role (getDbAdmin, BYPASSRLS) precisely so it can see EVERY tenant
 * appointment, not just the booking patient's.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

/* ---------------------------------------------------------------------- */
/* Fixture — one tenant, one therapist, one location/service/patient, and  */
/* a small set of that therapist's appointments to detect conflicts        */
/* against. Absolute timestamps + an explicit `now` make every boundary    */
/* assertion deterministic (no wall-clock drift).                          */
/* ---------------------------------------------------------------------- */

const F = {
  tenant: randomUUID(),
  role: randomUUID(),
  therapist: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
  authUser: randomUUID(),
  // The therapist's existing (occupied) booking — the one a double-book hits.
  occupied: randomUUID(),
  // A cancelled booking in the same slot family — must NEVER cause a conflict.
  cancelled: randomUUID(),
};

// A fixed clinic day. The occupied slot is 09:00–10:00; the cancelled one
// 12:00–13:00. The cutoff fixture references `NOW` below.
const OCCUPIED_START = "2026-04-06T09:00:00Z";
const OCCUPIED_END = "2026-04-06T10:00:00Z";
const CANCELLED_START = "2026-04-06T12:00:00Z";
const CANCELLED_END = "2026-04-06T13:00:00Z";

// Cutoff fixture: a fixed server clock and appointments at exact offsets from it.
const NOW = "2026-04-06T08:00:00Z";
const HOUR_MS = 60 * 60 * 1000;
const at = (offsetHours: number): string =>
  new Date(Date.parse(NOW) + offsetHours * HOUR_MS).toISOString();
const APPT_23H = at(23); // inside  the 24h cutoff → self-modify REJECTED
const APPT_24H = at(24); // exactly the boundary    → self-modify ALLOWED (half-open)
const APPT_25H = at(25); // outside the 24h cutoff → self-modify ALLOWED
const APPT_PAST = at(-1); // already started        → self-modify REJECTED

/* ---------------------------- real predicates --------------------------- */
/* Minimal duplications of the apps/api booking rules (see DUPLICATION NOTE). */

/**
 * NO DOUBLE-BOOK. Mirrors apptOverlapExists in apps/api/lib/appointments/store.ts:
 * a non-cancelled appointment for THIS therapist whose window overlaps [start,end)
 * on the half-open interval. Runs on the privileged connection, matching the real
 * service_role conflict path that must see every tenant appointment.
 *   TODO(@osteojp/scheduling): replace with the shared conflict predicate.
 */
async function hasConflict(
  sql: Sql,
  tenant: string,
  practitioner: string,
  startsAt: string,
  endsAt: string,
): Promise<boolean> {
  const rows = await sql<{ conflict: boolean }[]>`
    select exists (
      select 1 from appointments a
      where a.tenant_id = ${tenant}
        and a.practitioner_id = ${practitioner}
        and a.status <> 'cancelled'
        and a.starts_at < ${endsAt}::timestamptz
        and a.ends_at   > ${startsAt}::timestamptz
    ) as conflict
  `;
  return rows[0]!.conflict;
}

/**
 * 24h SELF-SERVICE CUTOFF. Mirrors isWithinCancellationCutoff in
 * apps/api/lib/appointments/cutoff.ts: true when `startsAt` is less than 24h from
 * `now` (or already past) → a patient self-cancel / self-reschedule is REJECTED.
 * Takes an explicit `now` exactly like the TS function, so the 24h boundary is
 * tested deterministically rather than against a moving wall clock.
 *   TODO(@osteojp/scheduling): replace with the shared cutoff predicate.
 */
async function isWithinCutoff(
  sql: Sql | TransactionSql,
  startsAt: string,
  now: string,
): Promise<boolean> {
  const rows = await sql<{ within: boolean }[]>`
    select (${startsAt}::timestamptz - ${now}::timestamptz) < interval '24 hours' as within
  `;
  return rows[0]!.within;
}

/* ------------------------------ seed / teardown ------------------------- */

async function seed(sql: Sql): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${F.tenant}, 'Booking Gate', ${`booking-gate-${F.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${F.role}, ${F.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${F.therapist}, ${F.tenant}, ${F.role}, ${`t-${F.therapist}@example.pt`}, 'Seed Therapist')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.location}, ${F.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${F.service}, ${F.tenant}, ${F.location}, 'Consulta')`;
  await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
            values (${F.patient}, ${F.tenant}, 'Seed Patient', ${F.authUser}, now())`;

  // The therapist's existing booking (scheduled) + a cancelled one.
  const appt = (id: string, start: string, end: string, status: string) =>
    sql`insert into appointments
          (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status)
        values (${id}, ${F.tenant}, ${F.patient}, ${F.therapist}, ${F.location}, ${F.service}, ${start}, ${end}, ${status})`;
  await appt(F.occupied, OCCUPIED_START, OCCUPIED_END, "scheduled");
  await appt(F.cancelled, CANCELLED_START, CANCELLED_END, "cancelled");
}

/* ---------------------------------------------------------------------- */

describe.skipIf(!live)("patient booking — DB-gated conflict + 24h cutoff", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  /* ===================== Rule 1: no double-book ====================== */
  describe("no double-book (apptOverlapExists half-open overlap)", () => {
    it("NEGATIVE CONTROL: the occupied appointment really exists", async () => {
      // Proves a later 'no conflict' result is a real false, not a vacuous one
      // because the fixture failed to seed.
      const rows = await sql<{ id: string }[]>`
        select id from appointments where id = ${F.occupied} and status <> 'cancelled'
      `;
      expect(rows.length).toBe(1);
    });

    it("REJECTS a window overlapping the occupied slot (09:30–10:30)", async () => {
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        "2026-04-06T09:30:00Z",
        "2026-04-06T10:30:00Z",
      );
      expect(conflict).toBe(true);
    });

    it("REJECTS an identical window (09:00–10:00)", async () => {
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        OCCUPIED_START,
        OCCUPIED_END,
      );
      expect(conflict).toBe(true);
    });

    it("REJECTS a window fully enclosing the occupied slot (08:30–10:30)", async () => {
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        "2026-04-06T08:30:00Z",
        "2026-04-06T10:30:00Z",
      );
      expect(conflict).toBe(true);
    });

    it("ALLOWS an exactly-abutting later window (10:00–11:00) — half-open boundary", async () => {
      // If the predicate ever loses its half-open shape (e.g. <= instead of <),
      // this flips to a false conflict. This is the assertion that goes RED if
      // the overlap rule is broken/removed.
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        OCCUPIED_END,
        "2026-04-06T11:00:00Z",
      );
      expect(conflict).toBe(false);
    });

    it("ALLOWS an exactly-abutting earlier window (08:00–09:00) — half-open boundary", async () => {
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        "2026-04-06T08:00:00Z",
        OCCUPIED_START,
      );
      expect(conflict).toBe(false);
    });

    it("ALLOWS a fully separate window (14:00–15:00)", async () => {
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        "2026-04-06T14:00:00Z",
        "2026-04-06T15:00:00Z",
      );
      expect(conflict).toBe(false);
    });

    it("a CANCELLED appointment NEVER conflicts (window over 12:00–13:00)", async () => {
      // Same window as the cancelled booking: the status <> 'cancelled' conjunct
      // is what keeps this false. Drop that conjunct and this goes RED.
      const conflict = await hasConflict(
        sql,
        F.tenant,
        F.therapist,
        CANCELLED_START,
        CANCELLED_END,
      );
      expect(conflict).toBe(false);
    });

    it("does NOT conflict with a DIFFERENT therapist's slot (per-therapist scope)", async () => {
      const otherTherapist = randomUUID();
      const conflict = await hasConflict(
        sql,
        F.tenant,
        otherTherapist,
        OCCUPIED_START,
        OCCUPIED_END,
      );
      expect(conflict).toBe(false);
    });
  });

  /* ================== Rule 2: 24h self-service cutoff ================= */
  describe("24h cutoff (isWithinCancellationCutoff)", () => {
    it("REJECTS an appointment 23h away (inside the window)", async () => {
      expect(await isWithinCutoff(sql, APPT_23H, NOW)).toBe(true);
    });

    it("REJECTS an appointment that already started (1h ago)", async () => {
      expect(await isWithinCutoff(sql, APPT_PAST, NOW)).toBe(true);
    });

    it("ALLOWS an appointment 25h away (outside the window)", async () => {
      // The assertion that goes RED if the 24h comparison is removed/relaxed.
      expect(await isWithinCutoff(sql, APPT_25H, NOW)).toBe(false);
    });

    it("ALLOWS an appointment exactly 24h away — half-open boundary", async () => {
      expect(await isWithinCutoff(sql, APPT_24H, NOW)).toBe(false);
    });

    it("applies to the STORED starts_at of a real row, not a client value", async () => {
      // Read the occupied appointment's persisted starts_at and run the cutoff
      // against it with a `now` 23h before it — the row-driven path the route uses.
      const rows = await sql<{ startsAt: string }[]>`
        select starts_at as "startsAt" from appointments where id = ${F.occupied}
      `;
      const startsAt = rows[0]!.startsAt;
      const now23hBefore = new Date(Date.parse(startsAt) - 23 * HOUR_MS).toISOString();
      expect(await isWithinCutoff(sql, startsAt, now23hBefore)).toBe(true);
    });
  });
});

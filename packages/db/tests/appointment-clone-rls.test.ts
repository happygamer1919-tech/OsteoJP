/**
 * appointment-clone-rls.test.ts
 *
 * DB-gated proof of the schedule-again clone endpoint (apps/web/lib/scheduling:
 * cloneAppointment + clone-core.ts buildClonedAppointment). That action lives in
 * the app, so the db-tests gate never exercises it directly — yet its two hard
 * guarantees are ultimately decided by Postgres against live rows:
 *
 *   1. FIELD MAPPING — a clone copies ONLY the clinical shape (patient,
 *      practitioner, service, location) and the duration, on a FRESH lifecycle
 *      (status=scheduled, confirmation_state=pending, receipt cleared). It copies
 *      NONE of: booking_group_id (0027), batch_id (0028), recurrence_rule /
 *      recurrence_parent_id, room, the inline notes column, or the append-only
 *      appointment_notes relation (0026). tenant_id + created_by come from the
 *      acting context, never the source.
 *
 *   2. CROSS-TENANT REJECTION — the source is read INSIDE the caller's tenant
 *      context, so RLS confines the lookup. A source id belonging to another
 *      tenant resolves to ZERO rows under the caller's JWT, so the clone is
 *      refused and no row is inserted.
 *
 * DUPLICATION NOTE (guardrail, same posture as booking-conflict-cutoff.test.ts):
 * packages/db must NOT import apps/web, so the clone mapping is duplicated
 * MINIMALLY here as one INSERT ... SELECT that mirrors buildClonedAppointment.
 * It goes red if the mapping's SQL shape drifts. The canonical mapping is
 * clone-core.ts, unit-tested field-by-field in clone-core.test.ts.
 *   TODO(@osteojp/scheduling): when the scheduling core moves into a shared
 *   package, import buildClonedAppointment here and delete this local mirror.
 *
 * CORRECTNESS: RLS is ENABLE-not-FORCE, so every isolation assertion runs on the
 * role-switched `authenticated` connection via asRole (never the owner, which
 * BYPASSes RLS). asRole always rolls back, so nothing this suite writes persists.
 * A negative control (owner sees tenant-B's source; authenticated+B does not)
 * makes a vacuous cross-tenant pass impossible.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in CI without a DB — identical to the other packages/db suites.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

/* ---------------------------------------------------------------------- */
/* Fixture — two full FK-satisfying tenant graphs. Tenant A owns the source */
/* appointment (with EVERY not-copied field set to a non-null value, so a   */
/* dropped field is a real drop and not a coincidental null). Tenant B is   */
/* the foreign tenant used for the cross-tenant rejection.                  */
/* ---------------------------------------------------------------------- */

type Ids = {
  tenant: string;
  role: string;
  user: string;
  location: string;
  service: string;
  patient: string;
  episode: string;
  appointment: string;
  bookingGroup: string;
  batch: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
  episode: randomUUID(),
  appointment: randomUUID(),
  bookingGroup: randomUUID(),
  batch: randomUUID(),
});

const A = newIds();
const B = newIds();

// Source window: a deliberately NON-ROUND 45-minute duration, so the duration
// assertion catches any off-by-interval error in the derive.
const SRC_START = "2026-08-06T09:00:00Z";
const SRC_END = "2026-08-06T09:45:00Z";
// The caller-supplied new start for the clone. endsAt must derive to 17:00.
const NEW_START = "2026-09-01T16:15:00Z";
const NEW_END = "2026-09-01T17:00:00Z";

async function seedTenant(sql: Sql, x: Ids, withSource: boolean): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Clone Gate', ${`clone-gate-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`t-${x.user}@example.pt`}, 'Seed Therapist')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${x.service}, ${x.tenant}, ${x.location}, 'Consulta')`;
  await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
            values (${x.patient}, ${x.tenant}, 'Seed Patient', ${randomUUID()}, now())`;
  await sql`insert into clinical_episodes (id, tenant_id, patient_id, title)
            values (${x.episode}, ${x.tenant}, ${x.patient}, 'Ep')`;

  if (!withSource) return;
  // The source appointment: every "not copied" field is set to a NON-NULL value
  // and the lifecycle is advanced (completed/confirmed) so the clone's reset is a
  // real reset. room + inline notes + booking group + batch + recurrence all set.
  await sql`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
       room, starts_at, ends_at, status, confirmation_state,
       confirmation_received_at, confirmation_channel,
       recurrence_rule, booking_group_id, batch_id, notes, created_by)
    values
      (${x.appointment}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service},
       'Sala 1', ${SRC_START}, ${SRC_END}, 'completed', 'confirmed',
       ${SRC_START}, 'sms',
       'FREQ=WEEKLY;COUNT=3', ${x.bookingGroup}, ${x.batch}, 'source inline note', ${x.user})`;
  // A per-visit appointment_notes row on the SOURCE (0026) — must NOT be cloned.
  await sql`insert into appointment_notes
      (tenant_id, appointment_id, patient_id, episode_id, author_user_id, body)
    values (${x.tenant}, ${x.appointment}, ${x.patient}, ${x.episode}, ${x.user}, 'source visit note')`;
}

/* ---------------------------------------------------------------------- */

describe.skipIf(!live)("schedule-again clone — DB-gated mapping + cross-tenant", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A, true);
    await seedTenant(sql, B, false);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  /* ============================ mapping ============================= */
  describe("field mapping (clone under the source's own tenant)", () => {
    it("NEGATIVE CONTROL: the source appointment really exists under tenant A", async () => {
      const rows = await sql<{ id: string }[]>`
        select id from appointments where id = ${A.appointment}`;
      expect(rows.length).toBe(1);
    });

    it("COPIES clinical shape + duration, RESETS lifecycle, DROPS grouping/series/per-visit", async () => {
      // The clone mirror: INSERT ... SELECT reads the source (RLS-scoped to the
      // acting tenant) and derives the new window from the source duration. Every
      // not-copied column is omitted → defaults to null. All inside a rolled-back
      // `authenticated` tx, so nothing persists.
      const clone = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) => {
        const inserted = await tx<
          {
            id: string;
            patient_id: string;
            practitioner_id: string;
            location_id: string;
            service_id: string | null;
            tenant_id: string;
            created_by: string | null;
            starts_at: string;
            ends_at: string;
            status: string;
            confirmation_state: string;
            confirmation_received_at: string | null;
            confirmation_channel: string | null;
            recurrence_rule: string | null;
            recurrence_parent_id: string | null;
            booking_group_id: string | null;
            batch_id: string | null;
            room: string | null;
            notes: string | null;
            duration_min: number;
          }[]
        >`
          insert into appointments
            (tenant_id, patient_id, practitioner_id, location_id, service_id,
             starts_at, ends_at, status, confirmation_state, created_by)
          select
            ${A.tenant}, patient_id, practitioner_id, location_id, service_id,
            ${NEW_START}::timestamptz,
            ${NEW_START}::timestamptz + (ends_at - starts_at),
            'scheduled', 'pending', ${A.user}
          from appointments
          where id = ${A.appointment}
          returning
            id, patient_id, practitioner_id, location_id, service_id,
            tenant_id, created_by, starts_at, ends_at, status, confirmation_state,
            confirmation_received_at, confirmation_channel,
            recurrence_rule, recurrence_parent_id, booking_group_id, batch_id,
            room, notes,
            (extract(epoch from (ends_at - starts_at)) / 60)::int as duration_min`;
        expect(inserted.length).toBe(1);
        const clone = inserted[0]!;

        // Confirm the source really carried the not-copied fields as non-null,
        // so the null assertions below prove a DROP, not a coincidence.
        const src = (
          await tx<
            {
              booking_group_id: string | null;
              batch_id: string | null;
              notes: string | null;
              room: string | null;
              recurrence_rule: string | null;
            }[]
          >`select booking_group_id, batch_id, notes, room, recurrence_rule
            from appointments where id = ${A.appointment}`
        )[0]!;
        expect(src.booking_group_id).toBe(A.bookingGroup);
        expect(src.batch_id).toBe(A.batch);
        expect(src.notes).toBe("source inline note");
        expect(src.room).toBe("Sala 1");
        expect(src.recurrence_rule).toBe("FREQ=WEEKLY;COUNT=3");

        // No appointment_notes row was created for the clone (0026 never copied).
        const noteRows = await tx<{ n: number }[]>`
          select count(*)::int as n from appointment_notes where appointment_id = ${clone.id}`;
        expect(noteRows[0]!.n).toBe(0);

        return clone;
      });

      // COPIED from source.
      expect(clone.patient_id).toBe(A.patient);
      expect(clone.practitioner_id).toBe(A.user);
      expect(clone.location_id).toBe(A.location);
      expect(clone.service_id).toBe(A.service);

      // DURATION preserved (45 min) and re-applied to the new start.
      expect(clone.duration_min).toBe(45);
      expect(new Date(clone.starts_at).toISOString()).toBe(new Date(NEW_START).toISOString());
      expect(new Date(clone.ends_at).toISOString()).toBe(new Date(NEW_END).toISOString());

      // FRESH lifecycle — BOTH axes reset, receipt cleared.
      expect(clone.status).toBe("scheduled");
      expect(clone.confirmation_state).toBe("pending");
      expect(clone.confirmation_received_at).toBeNull();
      expect(clone.confirmation_channel).toBeNull();

      // Context-derived, not from source.
      expect(clone.tenant_id).toBe(A.tenant);
      expect(clone.created_by).toBe(A.user);

      // NOT COPIED — grouping / series / per-visit all null on the clone.
      expect(clone.booking_group_id).toBeNull();
      expect(clone.batch_id).toBeNull();
      expect(clone.recurrence_rule).toBeNull();
      expect(clone.recurrence_parent_id).toBeNull();
      expect(clone.room).toBeNull();
      expect(clone.notes).toBeNull();
    });
  });

  /* ====================== cross-tenant rejection ==================== */
  describe("cross-tenant rejection (RLS confines the source read)", () => {
    it("NEGATIVE CONTROL: the owner (BYPASSRLS) CAN see tenant A's source", async () => {
      const rows = await sql<{ id: string }[]>`
        select id from appointments where id = ${A.appointment}`;
      expect(rows.map((r) => r.id)).toContain(A.appointment);
    });

    it("tenant B reading tenant A's source id gets ZERO rows → clone refused", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), async (tx) => {
        return tx<{ id: string }[]>`
          select id from appointments where id = ${A.appointment}`;
      });
      // The action's source lookup returns nothing for a foreign id, so it
      // returns not_found and never reaches the insert.
      expect(rows.length).toBe(0);
    });

    it("even an attempted cross-tenant clone INSERT...SELECT inserts NOTHING (source invisible)", async () => {
      const inserted = await asRole(sql, "authenticated", claimsFor(B.tenant), async (tx) => {
        // The SELECT source is tenant A's id; under tenant B's JWT it is invisible,
        // so the INSERT ... SELECT has no source row and writes zero rows. The
        // WITH CHECK (tenant_id = B) is moot because there is nothing to insert.
        return tx<{ id: string }[]>`
          insert into appointments
            (tenant_id, patient_id, practitioner_id, location_id, service_id,
             starts_at, ends_at, status, confirmation_state, created_by)
          select
            ${B.tenant}, patient_id, practitioner_id, location_id, service_id,
            ${NEW_START}::timestamptz,
            ${NEW_START}::timestamptz + (ends_at - starts_at),
            'scheduled', 'pending', ${B.user}
          from appointments
          where id = ${A.appointment}
          returning id`;
      });
      expect(inserted.length).toBe(0);
    });
  });
});

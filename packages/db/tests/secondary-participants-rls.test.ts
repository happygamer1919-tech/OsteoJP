/**
 * secondary-participants-rls.test.ts — DB-gated proof for W4-19 (migration 0032:
 * appointments.patient_2_id + practitioner_2_id, two nullable FK columns).
 *
 * Two guarantees decided by Postgres against live rows:
 *
 *   1. TENANT ISOLATION covers the new columns automatically — they live on the
 *      appointments row, so an appointment carrying a secondary pair is visible
 *      only inside its own tenant. A foreign tenant sees zero rows.
 *
 *   2. TENANT-MATCH of the secondary participants — a bare FK does NOT verify the
 *      referenced row's tenant, so the app (createAppointment) enforces it by
 *      looking the secondary id up UNDER the acting tenant's RLS before writing.
 *      This suite proves that lookup: tenant A's own patient/therapist resolve to
 *      one row under A, while a tenant-B id resolves to ZERO rows under A — so
 *      the app validation refuses a cross-tenant secondary and never writes it.
 *
 * RLS is ENABLE-not-FORCE, so every isolation assertion runs on the role-switched
 * `authenticated` connection via asRole (never the owner, which BYPASSes RLS).
 * asRole always rolls back, so nothing this suite writes persists. Negative
 * controls (owner sees the row; the primary lookups DO resolve) make a vacuous
 * pass impossible. Skipped when DATABASE_URL is absent (same as the sibling RLS
 * suites) so `vitest run` stays green without a DB.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  userTwo: string; // the secondary therapist (tenant A only)
  location: string;
  patient: string;
  patientTwo: string; // the secondary patient (tenant A only)
  appointment: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  userTwo: randomUUID(),
  location: randomUUID(),
  patient: randomUUID(),
  patientTwo: randomUUID(),
  appointment: randomUUID(),
});

const A = newIds();
const B = newIds();

const START = "2026-08-06T09:00:00Z";
const END = "2026-08-06T10:00:00Z";

async function seedTenant(sql: Sql, x: Ids, withAppointment: boolean): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Sec Gate', ${`sec-gate-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`t-${x.user}@example.pt`}, 'Primary Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.userTwo}, ${x.tenant}, ${x.role}, ${`t2-${x.userTwo}@example.pt`}, 'Secondary Therapist')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
            values (${x.patient}, ${x.tenant}, 'Primary Patient', ${randomUUID()}, now())`;
  await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
            values (${x.patientTwo}, ${x.tenant}, 'Secondary Patient', ${randomUUID()}, now())`;

  if (!withAppointment) return;
  // An appointment carrying BOTH secondary participants (0032), all in tenant A.
  await sql`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id,
       patient_2_id, practitioner_2_id, starts_at, ends_at, status, created_by)
    values
      (${x.appointment}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location},
       ${x.patientTwo}, ${x.userTwo}, ${START}, ${END}, 'scheduled', ${x.user})`;
}

describe.skipIf(!live)("secondary participants (0032) — DB-gated RLS", () => {
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

  describe("tenant isolation covers the new columns", () => {
    it("NEGATIVE CONTROL: owner (BYPASSRLS) sees the appointment with both secondary ids", async () => {
      const rows = await sql<{ patient_2_id: string | null; practitioner_2_id: string | null }[]>`
        select patient_2_id, practitioner_2_id from appointments where id = ${A.appointment}`;
      expect(rows.length).toBe(1);
      expect(rows[0]!.patient_2_id).toBe(A.patientTwo);
      expect(rows[0]!.practitioner_2_id).toBe(A.userTwo);
    });

    it("tenant A (authenticated) sees its own appointment's secondary pair", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ patient_2_id: string | null; practitioner_2_id: string | null }[]>`
          select patient_2_id, practitioner_2_id from appointments where id = ${A.appointment}`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]!.patient_2_id).toBe(A.patientTwo);
      expect(rows[0]!.practitioner_2_id).toBe(A.userTwo);
    });

    it("tenant B (authenticated) sees ZERO rows for tenant A's appointment", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
        tx<{ id: string }[]>`select id from appointments where id = ${A.appointment}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("tenant-match of the secondary participants (app-layer lookup mirror)", () => {
    it("tenant A resolves its own secondary patient + therapist (validation passes)", async () => {
      const [p, u] = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) => {
        const pRows = await tx<{ id: string }[]>`select id from patients where id = ${A.patientTwo}`;
        const uRows = await tx<{ id: string }[]>`select id from users where id = ${A.userTwo}`;
        return [pRows, uRows] as const;
      });
      expect(p.length).toBe(1);
      expect(u.length).toBe(1);
    });

    it("tenant A CANNOT resolve tenant B's patient/therapist ids → cross-tenant secondary refused", async () => {
      const [p, u] = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) => {
        const pRows = await tx<{ id: string }[]>`select id from patients where id = ${B.patientTwo}`;
        const uRows = await tx<{ id: string }[]>`select id from users where id = ${B.userTwo}`;
        return [pRows, uRows] as const;
      });
      // The createAppointment tenant-match lookup returns zero for a foreign id,
      // so it returns { ok:false, error:"validation" } and never writes the row.
      expect(p.length).toBe(0);
      expect(u.length).toBe(0);
    });
  });
});

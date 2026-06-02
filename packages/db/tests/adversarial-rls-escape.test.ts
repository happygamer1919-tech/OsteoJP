/**
 * adversarial-rls-escape.test.ts
 *
 * Adversarial extension of the per-table cross-tenant baseline already proven in
 * cross-tenant-rls-isolation.test.ts (#92) and ai-ingestion-rls-isolation.test.ts
 * (#89). Those assert the four-verb tenant denial for every tenant-scoped table;
 * this file attacks the angles they do NOT cover:
 *
 *   1. tenant_id RE-HOMING — under tenant A's JWT, UPDATE A's own row to set
 *      tenant_id = B. The UPDATE WITH CHECK must reject it (you cannot move a row
 *      into another tenant). Run for every standard FOR ALL tenant_id table.
 *   2. CLAIM INJECTION — a missing JWT (no claims) and a foreign tenant claim
 *      must both fail closed: 0 rows readable, writes rejected.
 *   3. clinical_records ROLE GATE on the write verbs #92 left untested —
 *      reception UPDATE/DELETE of an in-tenant record affect 0 rows (USING role
 *      gate excludes reception), and an unknown role reads nothing.
 *   4. CROSS-TENANT FK linkage — Postgres FK checks bypass RLS, so a row can
 *      reference another tenant's id. Probed here to confirm it leaks no PII.
 *
 * Reuses the shared harness (tests/rls-harness.ts) WITHOUT modifying it; seeds
 * its own self-contained A/B graph with random ids (own cleanup in afterAll).
 *
 * CORRECTNESS: RLS is ENABLE-not-FORCE, so every assertion runs on the
 * role-switched `authenticated` connection inside a rolled-back transaction —
 * never the owner (which bypasses RLS and would pass for the wrong reason).
 *
 * GATING: requires a live privileged DATABASE_URL with migrations applied;
 * skipped when DATABASE_URL is absent so CI stays green without a database.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  location: string;
  location2: string;
  service: string;
  patient: string;
  appointment: string;
  formTemplate: string;
  episode: string;
  record: string;
  attachment: string;
  invoice: string;
  patientLocation: string;
  availability: string;
  timeOff: string;
  servicePrice: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  location2: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
  appointment: randomUUID(),
  formTemplate: randomUUID(),
  episode: randomUUID(),
  record: randomUUID(),
  attachment: randomUUID(),
  invoice: randomUUID(),
  patientLocation: randomUUID(),
  availability: randomUUID(),
  timeOff: randomUUID(),
  servicePrice: randomUUID(),
});

const A = newIds();
const B = newIds();
const START = "2026-01-05T09:00:00Z";
const END = "2026-01-05T10:00:00Z";

async function seedTenant(p: Sql, x: Ids, label: string): Promise<void> {
  await p`insert into tenants (id, name, slug)
          values (${x.tenant}, ${`Adv ${label}`}, ${`adv-${label}-${x.tenant}`})`;
  await p`insert into roles (id, tenant_id, slug, name)
          values (${x.role}, ${x.tenant}, 'admin', 'Admin')`;
  await p`insert into users (id, tenant_id, role_id, email, full_name)
          values (${x.user}, ${x.tenant}, ${x.role}, ${`u-${x.user}@example.pt`}, 'Seed User')`;
  await p`insert into locations (id, tenant_id, name)
          values (${x.location}, ${x.tenant}, 'Loc 1'), (${x.location2}, ${x.tenant}, 'Loc 2')`;
  await p`insert into services (id, tenant_id, location_id, name)
          values (${x.service}, ${x.tenant}, ${x.location}, 'Service')`;
  await p`insert into patients (id, tenant_id, full_name)
          values (${x.patient}, ${x.tenant}, ${`Patient ${label}`})`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at)
          values (${x.appointment}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service}, ${START}, ${END})`;
  await p`insert into form_templates (id, tenant_id, key, title, schema)
          values (${x.formTemplate}, ${x.tenant}, 'osteopathy',
                  ${JSON.stringify({ pt: "Osteopatia", en: "Osteopathy" })}::jsonb,
                  ${JSON.stringify({ fields: [] })}::jsonb)`;
  await p`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title)
          values (${x.episode}, ${x.tenant}, ${x.patient}, ${x.user}, 'Episode')`;
  await p`insert into clinical_records (id, tenant_id, patient_id, episode_id, practitioner_id, status)
          values (${x.record}, ${x.tenant}, ${x.patient}, ${x.episode}, ${x.user}, 'draft')`;
  await p`insert into attachments (id, tenant_id, patient_id, storage_path, file_name)
          values (${x.attachment}, ${x.tenant}, ${x.patient}, ${`path/${x.attachment}`}, 'file.pdf')`;
  await p`insert into invoices (id, tenant_id, patient_id, amount_cents)
          values (${x.invoice}, ${x.tenant}, ${x.patient}, 1000)`;
  await p`insert into patient_locations (id, tenant_id, patient_id, location_id)
          values (${x.patientLocation}, ${x.tenant}, ${x.patient}, ${x.location})`;
  await p`insert into availability_templates (id, tenant_id, user_id, location_id, weekday, start_time, end_time)
          values (${x.availability}, ${x.tenant}, ${x.user}, ${x.location}, 1, '09:00', '17:00')`;
  await p`insert into time_off (id, tenant_id, user_id, starts_at, ends_at, reason)
          values (${x.timeOff}, ${x.tenant}, ${x.user}, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', 'vacation')`;
  await p`insert into service_location_prices (id, tenant_id, service_id, location_id, price_cents)
          values (${x.servicePrice}, ${x.tenant}, ${x.service}, ${x.location}, 5000)`;
}

// Standard FOR ALL `tenant_id = jwt_tenant_id()` tables + the own-row id whose
// tenant_id we attempt to flip to B. clinical_records also has a role gate, so
// the re-homing UPDATE runs under an admin JWT that satisfies the role part —
// isolating WITH CHECK (tenant_id) as the thing doing the rejection.
const REHOME_TARGETS: { table: string; ownRowId: string; role?: "admin" }[] = [
  { table: "roles", ownRowId: A.role },
  { table: "users", ownRowId: A.user },
  { table: "locations", ownRowId: A.location },
  { table: "services", ownRowId: A.service },
  { table: "patients", ownRowId: A.patient },
  { table: "appointments", ownRowId: A.appointment },
  { table: "form_templates", ownRowId: A.formTemplate },
  { table: "clinical_episodes", ownRowId: A.episode },
  { table: "clinical_records", ownRowId: A.record, role: "admin" },
  { table: "attachments", ownRowId: A.attachment },
  { table: "invoices", ownRowId: A.invoice },
  { table: "patient_locations", ownRowId: A.patientLocation },
  { table: "availability_templates", ownRowId: A.availability },
  { table: "time_off", ownRowId: A.timeOff },
  { table: "service_location_prices", ownRowId: A.servicePrice },
];

describe.skipIf(!live)("adversarial RLS escape attempts", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A, "A");
    await seedTenant(sql, B, "B");
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  /* ---- 1. tenant_id re-homing: UPDATE WITH CHECK blocks moving a row ---- */
  describe("re-homing: UPDATE own row to set tenant_id = B is rejected by WITH CHECK", () => {
    for (const t of REHOME_TARGETS) {
      it(`${t.table}: cannot move an own row into tenant B`, async () => {
        await expect(
          asRole(sql, "authenticated", claimsFor(A.tenant, t.role), (tx) =>
            tx.unsafe(`update ${t.table} set tenant_id = $1 where id = $2 returning id`, [
              B.tenant,
              t.ownRowId,
            ]),
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    }
  });

  /* ---- 2. claim injection: missing + foreign tenant claims fail closed -- */
  describe("claim injection fails closed", () => {
    it("no JWT claims at all: SELECT patients returns 0 rows", async () => {
      const rows = await asRole(sql, "authenticated", null, (tx) =>
        tx<{ id: string }[]>`select id from patients`,
      );
      expect(rows.length).toBe(0);
    });

    it("no JWT claims at all: INSERT is rejected (jwt_tenant_id() is NULL)", async () => {
      await expect(
        asRole(sql, "authenticated", null, (tx) =>
          tx`insert into patients (tenant_id, full_name) values (${A.tenant}, 'X')`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("foreign tenant claim (neither A nor B): sees no rows of A or B", async () => {
      const foreign = randomUUID();
      const rows = await asRole(sql, "authenticated", claimsFor(foreign), (tx) =>
        tx<{ id: string }[]>`select id from patients where id in (${A.patient}, ${B.patient})`,
      );
      expect(rows.length).toBe(0);
    });

    it("foreign tenant claim: INSERT pinned to A's tenant_id is rejected", async () => {
      const foreign = randomUUID();
      await expect(
        asRole(sql, "authenticated", claimsFor(foreign), (tx) =>
          tx`insert into patients (tenant_id, full_name) values (${A.tenant}, 'X')`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  /* ---- 3. clinical_records role gate on the write verbs #92 missed ----- */
  describe("clinical_records role gate — reception denied on every verb", () => {
    const reception = () => claimsFor(A.tenant, "reception");

    it("reception UPDATE of an in-tenant record affects 0 rows (USING role gate)", async () => {
      const updated = await asRole(sql, "authenticated", reception(), (tx) =>
        tx<{ id: string }[]>`update clinical_records set version = 1 where id = ${A.record} returning id`,
      );
      expect(updated.length).toBe(0);
    });

    it("reception DELETE of an in-tenant record affects 0 rows (USING role gate)", async () => {
      const deleted = await asRole(sql, "authenticated", reception(), (tx) =>
        tx<{ id: string }[]>`delete from clinical_records where id = ${A.record} returning id`,
      );
      expect(deleted.length).toBe(0);
    });

    it("an unknown/garbage role claim reads no clinical records (role gate fails closed)", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "intruder" as never), (tx) =>
        tx<{ id: string }[]>`select id from clinical_records`,
      );
      expect(rows.length).toBe(0);
    });
  });

  /* ---- 4. cross-tenant FK linkage leaks no PII ------------------------- */
  describe("cross-tenant FK linkage", () => {
    it("a tenant-B appointment referencing tenant-A's patient leaks no A PII to B", async () => {
      // Postgres FK validation bypasses RLS, so the DB permits a tenant-B row to
      // reference tenant-A's patient_id (a defense-in-depth caveat — see report).
      // The confidentiality wall that MUST hold: B still cannot read A's patient.
      const apptId = randomUUID();
      const leaked = await asRole(sql, "authenticated", claimsFor(B.tenant), async (tx) => {
        await tx`insert into appointments
          (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${apptId}, ${B.tenant}, ${A.patient}, ${B.user}, ${B.location}, ${START}, ${END})`;
        return tx<{ apptId: string; fullName: string | null }[]>`
          select a.id as "apptId", p.full_name as "fullName"
          from appointments a
          left join patients p on p.id = a.patient_id
          where a.id = ${apptId}`;
      });
      // The appointment row is B's own (visible); the joined A patient is not.
      expect(leaked.length).toBe(1);
      expect(leaked[0]?.fullName).toBeNull();
    });
  });
});

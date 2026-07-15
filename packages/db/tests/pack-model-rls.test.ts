/**
 * pack-model-rls.test.ts — DB-gated proof for W8-01a (migration 0037: the pack
 * model — service_packs + patient_pack_instances).
 *
 * Four guarantees decided by Postgres against live rows:
 *
 *   1. TENANT ISOLATION — service_packs: a pack is visible only inside its own
 *      tenant; a foreign tenant sees zero rows (owner/BYPASSRLS negative control).
 *   2. TENANT ISOLATION — patient_pack_instances: same, for a patient's purchase.
 *   3. OFFERED-ONLY-WHERE-PRICED — a service is "offered at location L" iff an
 *      ACTIVE service_location_prices row exists for (service, L). A service with
 *      a base price but no price row at L is NOT offered there (base price is a
 *      fallback amount, never an "offered everywhere" signal). Mirrors the
 *      services.isServiceOfferedAtLocation resolver's SQL semantic.
 *   4. RENAME-NOT-RECREATE — renaming a canonical service (UPDATE services.name)
 *      preserves historic appointments.service_id (no orphan, no delete-recreate).
 *
 * RLS is ENABLE-not-FORCE, so isolation assertions run on the role-switched
 * `authenticated` connection via asRole (never the owner, which BYPASSes RLS).
 * asRole always rolls back. Skipped when DATABASE_URL is absent.
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
  service: string; // priced at `location` -> offered there
  serviceUnpriced: string; // no price row -> NOT offered
  patient: string;
  pack: string;
  instance: string;
  appointment: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  serviceUnpriced: randomUUID(),
  patient: randomUUID(),
  pack: randomUUID(),
  instance: randomUUID(),
  appointment: randomUUID(),
});

const A = newIds();
const B = newIds();

const START = "2026-09-03T09:00:00Z";
const END = "2026-09-03T10:00:00Z";

async function seedTenant(sql: Sql, x: Ids, full: boolean): Promise<void> {
  await sql`insert into tenants (id, name, slug) values (${x.tenant}, 'Pack Gate', ${`pack-gate-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name) values (${x.role}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`t-${x.user}@example.pt`}, 'Therapist')`;
  await sql`insert into locations (id, tenant_id, name) values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  // Two services: one priced at the location (offered), one with a base price but
  // NO price row at the location (not offered).
  await sql`insert into services (id, tenant_id, name, price_cents) values (${x.service}, ${x.tenant}, 'Osteopatia', 7000)`;
  await sql`insert into services (id, tenant_id, name, price_cents) values (${x.serviceUnpriced}, ${x.tenant}, 'Fisioterapia', 5500)`;
  await sql`insert into service_location_prices (tenant_id, service_id, location_id, price_cents)
            values (${x.tenant}, ${x.service}, ${x.location}, 7000)`;
  await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
            values (${x.patient}, ${x.tenant}, 'Disposable Patient', ${randomUUID()}, now())`;

  if (!full) return;
  // A pack drawing down the priced service, and one patient instance (5 of 5).
  await sql`insert into service_packs (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
            values (${x.pack}, ${x.tenant}, ${x.service}, ${x.location}, 'Pacote 5 Osteopatia', 5, 32500)`;
  await sql`insert into patient_pack_instances (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining)
            values (${x.instance}, ${x.tenant}, ${x.patient}, ${x.pack}, 5, 5)`;
  // A historic appointment referencing the canonical service (for the rename proof).
  await sql`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status, created_by)
    values
      (${x.appointment}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service}, ${START}, ${END}, 'scheduled', ${x.user})`;
}

describe.skipIf(!live)("pack model (0037) — DB-gated RLS + semantics", () => {
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

  describe("tenant isolation — service_packs", () => {
    it("NEGATIVE CONTROL: owner (BYPASSRLS) sees tenant A's pack", async () => {
      const rows = await sql<{ id: string }[]>`select id from service_packs where id = ${A.pack}`;
      expect(rows.length).toBe(1);
    });
    it("tenant A (authenticated) sees its own pack", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`select id from service_packs where id = ${A.pack}`,
      );
      expect(rows.length).toBe(1);
    });
    it("tenant B sees ZERO rows for tenant A's pack", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
        tx<{ id: string }[]>`select id from service_packs where id = ${A.pack}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("tenant isolation — patient_pack_instances", () => {
    it("NEGATIVE CONTROL: owner sees tenant A's instance", async () => {
      const rows = await sql<{ id: string }[]>`select id from patient_pack_instances where id = ${A.instance}`;
      expect(rows.length).toBe(1);
    });
    it("tenant A sees its own instance", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`select id from patient_pack_instances where id = ${A.instance}`,
      );
      expect(rows.length).toBe(1);
    });
    it("tenant B sees ZERO rows for tenant A's instance", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
        tx<{ id: string }[]>`select id from patient_pack_instances where id = ${A.instance}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("offered-only-where-priced (service_location_prices presence)", () => {
    // Mirrors isServiceOfferedAtLocation: offered iff an ACTIVE price row exists.
    it("a service WITH an active price row at L IS offered there", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`
          select id from service_location_prices
          where service_id = ${A.service} and location_id = ${A.location} and is_active = true
          limit 1`,
      );
      expect(rows.length).toBe(1);
    });
    it("a service with a base price but NO price row at L is NOT offered there", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`
          select id from service_location_prices
          where service_id = ${A.serviceUnpriced} and location_id = ${A.location} and is_active = true
          limit 1`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("rename-not-recreate preserves historic serviceId", () => {
    it("UPDATE services.name keeps appointments.service_id intact (no orphan)", async () => {
      // Rename on the canonical row (owner BYPASS: a service-layer rename runs
      // tenant-scoped; here we assert the FK survives the UPDATE, a PG guarantee).
      await sql`update services set name = 'Osteopatia (renomeada)' where id = ${A.service}`;
      const appt = await sql<{ service_id: string | null }[]>`
        select service_id from appointments where id = ${A.appointment}`;
      expect(appt.length).toBe(1);
      expect(appt[0]!.service_id).toBe(A.service); // reference intact, not delete-recreated
      const svc = await sql<{ name: string }[]>`select name from services where id = ${A.service}`;
      expect(svc[0]!.name).toBe("Osteopatia (renomeada)");
    });
  });
});

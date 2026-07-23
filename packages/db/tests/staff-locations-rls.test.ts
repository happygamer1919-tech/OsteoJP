/**
 * staff-locations-rls.test.ts — DB-gated proof for W12-15 (migration 0038: the
 * staff_locations junction — the Equipa-overhaul foundation).
 *
 * staff_locations is the net-new many-to-many between staff (public.users) and
 * clinics (public.locations). It gives EVERY funcao (reception included, which
 * had none) an explicit, readable location scope, and carries the per-location
 * therapist colour. This suite pins the isolation + write matrix the migration
 * establishes, so the 0039 access-model tighten (R16 admin location-scoping +
 * therapist own-patients-only) builds on a proven base:
 *
 *   1. TENANT ISOLATION — a membership row is visible only inside its own
 *      tenant; a foreign tenant sees zero (owner/BYPASSRLS negative control).
 *   2. SELECT for EVERY in-tenant role — owner, admin, therapist AND reception
 *      all read their tenant's memberships. This is the whole point: reception
 *      gains a location scope it can resolve. (No role is denied SELECT.)
 *   3. WRITE gate = owner/admin only — INSERT/UPDATE/DELETE succeed for owner
 *      and admin, and are REJECTED by RLS for therapist and reception (managing
 *      team membership is a Manage-users action per the permission matrix).
 *   4. CROSS-TENANT WITH CHECK — an admin of tenant A cannot INSERT a row
 *      stamped with tenant B's id (fail-closed, no tenant-hopping writes).
 *   5. UNIQUE MEMBERSHIP — a duplicate (tenant, user, location) is rejected.
 *
 * RLS is ENABLE-not-FORCE, so every isolation/deny assertion runs on the
 * role-switched `authenticated` connection via asRole (never the owner, which
 * BYPASSes RLS). asRole always rolls back — nothing here persists. Skipped when
 * DATABASE_URL is absent (matches the other DB-gated suites).
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  user: string;
  location: string; // seeded membership: (user, location)
  location2: string; // a second clinic, used for INSERT tests (no seeded row)
  membership: string; // the seeded staff_locations row id
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  location2: randomUUID(),
  membership: randomUUID(),
});

const A = newIds();
const B = newIds();

async function seedTenant(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug) values (${x.tenant}, 'Staff Loc Gate', ${`staff-loc-${x.tenant}`})`;
  await sql`insert into users (id, tenant_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${`u-${x.user}@example.pt`}, 'Staff Member')`;
  await sql`insert into locations (id, tenant_id, name) values (${x.location}, ${x.tenant}, 'Castelo Branco')`;
  await sql`insert into locations (id, tenant_id, name) values (${x.location2}, ${x.tenant}, 'Linda-a-Velha')`;
  // One seeded membership: this staff member belongs to `location`.
  await sql`insert into staff_locations (id, tenant_id, user_id, location_id, color)
            values (${x.membership}, ${x.tenant}, ${x.user}, ${x.location}, '#45B9A7')`;
}

describe.skipIf(!live)("staff_locations (0038) — DB-gated RLS + write matrix", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A);
    await seedTenant(sql, B);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  describe("1. tenant isolation", () => {
    it("NEGATIVE CONTROL: owner (BYPASSRLS) sees tenant A's membership", async () => {
      const rows = await sql<{ id: string }[]>`select id from staff_locations where id = ${A.membership}`;
      expect(rows.length).toBe(1);
    });
    it("tenant A (authenticated) sees its own membership", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
        tx<{ id: string }[]>`select id from staff_locations where id = ${A.membership}`,
      );
      expect(rows.length).toBe(1);
    });
    it("tenant B sees ZERO rows for tenant A's membership", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "admin"), (tx) =>
        tx<{ id: string }[]>`select id from staff_locations where id = ${A.membership}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("2. SELECT is granted to every in-tenant role (reception included)", () => {
    for (const role of ["owner", "admin", "therapist", "reception"] as const) {
      it(`${role} reads tenant A's membership`, async () => {
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
          tx<{ id: string }[]>`select id from staff_locations where id = ${A.membership}`,
        );
        expect(rows.length).toBe(1);
      });
    }
  });

  describe("3. write matrix — INSERT/UPDATE/DELETE owner/admin only", () => {
    for (const role of ["owner", "admin"] as const) {
      it(`${role} CAN INSERT a new membership`, async () => {
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
          tx<{ id: string }[]>`insert into staff_locations (tenant_id, user_id, location_id)
             values (${A.tenant}, ${A.user}, ${A.location2}) returning id`,
        );
        expect(rows.length).toBe(1);
      });
      it(`${role} CAN UPDATE the per-location colour`, async () => {
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
          tx<{ color: string }[]>`update staff_locations set color = '#8B1863'
             where id = ${A.membership} returning color`,
        );
        expect(rows[0]?.color).toBe("#8B1863");
      });
      it(`${role} CAN DELETE a membership`, async () => {
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
          tx<{ id: string }[]>`delete from staff_locations where id = ${A.membership} returning id`,
        );
        expect(rows.length).toBe(1);
      });
    }

    for (const role of ["therapist", "reception"] as const) {
      it(`${role} is DENIED INSERT (RLS)`, async () => {
        await expect(
          asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
            tx`insert into staff_locations (tenant_id, user_id, location_id)
               values (${A.tenant}, ${A.user}, ${A.location2})`,
          ),
        ).rejects.toThrow(/row-level security/i);
      });
      it(`${role} is DENIED UPDATE (RLS no-op — zero rows affected)`, async () => {
        // A restrictive USING hides the row from the UPDATE rather than erroring:
        // the statement affects zero rows, so the colour is never changed.
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
          tx<{ id: string }[]>`update staff_locations set color = '#000000'
             where id = ${A.membership} returning id`,
        );
        expect(rows.length).toBe(0);
      });
      it(`${role} is DENIED DELETE (RLS no-op — zero rows affected)`, async () => {
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, role), (tx) =>
          tx<{ id: string }[]>`delete from staff_locations where id = ${A.membership} returning id`,
        );
        expect(rows.length).toBe(0);
      });
    }
  });

  describe("4. cross-tenant WITH CHECK — no tenant-hopping writes", () => {
    it("admin of tenant A CANNOT INSERT a row stamped tenant B", async () => {
      await expect(
        asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
          tx`insert into staff_locations (tenant_id, user_id, location_id)
             values (${B.tenant}, ${A.user}, ${A.location2})`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe("5. unique membership per (tenant, user, location)", () => {
    it("a duplicate (tenant, user, location) is rejected", async () => {
      await expect(
        asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
          tx`insert into staff_locations (tenant_id, user_id, location_id)
             values (${A.tenant}, ${A.user}, ${A.location})`,
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    });
  });
});

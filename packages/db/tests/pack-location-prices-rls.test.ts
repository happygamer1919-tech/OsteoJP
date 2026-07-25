/**
 * pack-location-prices-rls.test.ts — DB-gated proof for W12-20 (migration 0044:
 * service_pack_location_prices, the per-location PACK price override table — the
 * exact mirror of service_location_prices).
 *
 * Guarantees decided by Postgres against live rows:
 *
 *   1. TENANT ISOLATION (read) — a pack price override is visible only inside its
 *      own tenant; a foreign tenant sees ZERO rows (owner/BYPASSRLS negative
 *      control confirms the row exists at all).
 *   2. TENANT ISOLATION (write, WITH CHECK) — a tenant cannot INSERT a price
 *      override stamped with ANOTHER tenant's tenant_id; the fail-closed
 *      WITH CHECK predicate rejects it.
 *   3. OFFERED-ONLY-WHERE-PRICED — a pack is "offered at location L" iff an ACTIVE
 *      service_pack_location_prices row exists for (pack, L). A pack with a base
 *      price but no override row at L is NOT offered there (the base is a fallback
 *      amount, never an "offered everywhere" signal). Mirrors the pack layer's
 *      isPackOfferedAtLocation resolver SQL semantic.
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
  service: string; // base service the pack draws down
  pack: string; // priced at `location` -> offered there
  packUnpriced: string; // no override row -> NOT offered
  priceRow: string; // the service_pack_location_prices override row (isolation target)
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  pack: randomUUID(),
  packUnpriced: randomUUID(),
  priceRow: randomUUID(),
});

const A = newIds();
const B = newIds();

async function seedTenant(sql: Sql, x: Ids, full: boolean): Promise<void> {
  await sql`insert into tenants (id, name, slug) values (${x.tenant}, 'Pack Price Gate', ${`pack-price-gate-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name) values (${x.role}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`t-${x.user}@example.pt`}, 'Therapist')`;
  await sql`insert into locations (id, tenant_id, name) values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, name, price_cents) values (${x.service}, ${x.tenant}, 'Osteopatia', 7000)`;

  if (!full) return;
  // Two packs on the same base service: one WITH a per-location override at
  // `location` (offered there), one with only its base price and NO override row
  // (not offered there).
  await sql`insert into service_packs (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
            values (${x.pack}, ${x.tenant}, ${x.service}, ${x.location}, 'Pacote 5 Osteopatia', 5, 32500)`;
  await sql`insert into service_packs (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
            values (${x.packUnpriced}, ${x.tenant}, ${x.service}, null, 'Pacote 10 Osteopatia', 10, 60000)`;
  await sql`insert into service_pack_location_prices (id, tenant_id, pack_id, location_id, price_cents)
            values (${x.priceRow}, ${x.tenant}, ${x.pack}, ${x.location}, 30000)`;
}

describe.skipIf(!live)("service_pack_location_prices (0044) — DB-gated RLS + semantics", () => {
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

  describe("tenant isolation — read", () => {
    it("NEGATIVE CONTROL: owner (BYPASSRLS) sees tenant A's pack price override", async () => {
      const rows = await sql<{ id: string }[]>`
        select id from service_pack_location_prices where id = ${A.priceRow}`;
      expect(rows.length).toBe(1);
    });
    it("tenant A (authenticated) sees its own pack price override", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`select id from service_pack_location_prices where id = ${A.priceRow}`,
      );
      expect(rows.length).toBe(1);
    });
    it("tenant B sees ZERO rows for tenant A's pack price override", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
        tx<{ id: string }[]>`select id from service_pack_location_prices where id = ${A.priceRow}`,
      );
      expect(rows.length).toBe(0);
    });
    it("tenant B sees ZERO rows scanning the whole table for tenant A's pack", async () => {
      // Belt-and-braces: not just the row by id, but any row referencing A's pack.
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
        tx<{ id: string }[]>`select id from service_pack_location_prices where pack_id = ${A.pack}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("tenant isolation — write (WITH CHECK, fail-closed)", () => {
    it("tenant B CANNOT insert a price override stamped with tenant A's tenant_id", async () => {
      await expect(
        asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
          tx`insert into service_pack_location_prices (tenant_id, pack_id, location_id, price_cents)
             values (${A.tenant}, ${A.pack}, ${A.location}, 12345)`,
        ),
      ).rejects.toThrow();
    });
  });

  describe("offered-only-where-priced (service_pack_location_prices presence)", () => {
    // Mirrors isPackOfferedAtLocation: offered iff an ACTIVE price row exists.
    it("a pack WITH an active price row at L IS offered there", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`
          select id from service_pack_location_prices
          where pack_id = ${A.pack} and location_id = ${A.location} and is_active = true
          limit 1`,
      );
      expect(rows.length).toBe(1);
    });
    it("a pack with a base price but NO price row at L is NOT offered there", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ id: string }[]>`
          select id from service_pack_location_prices
          where pack_id = ${A.packUnpriced} and location_id = ${A.location} and is_active = true
          limit 1`,
      );
      expect(rows.length).toBe(0);
    });
  });
});

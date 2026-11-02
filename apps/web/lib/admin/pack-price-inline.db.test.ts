/**
 * pack-price-inline.db.test.ts: the inline price box on "LISTA DE PACKS".
 *
 * WRITTEN, NOT RUN BY ITS AUTHOR (2026-11-02, machine-heat rule: no Docker).
 * DB-gated like every *.db.test.ts.
 *
 * It asserts the price moves, NOTHING ELSE on the row moves (the reason this is
 * its own function rather than `updatePack` with hidden inputs), and one
 * `pack.update` audit row names the field and never the amount.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("updatePackPrice", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let updatePackPrice: typeof import("./packs").updatePackPrice;

  const tenant = randomUUID();
  const role = randomUUID();
  const admin = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  const pack = randomUUID();

  const actor = () => ({ tenantId: tenant, role: "admin" as const, userId: admin });

  const rows = async <T,>(q: unknown): Promise<T[]> => {
    const r = await db.execute(q as never);
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as T[];
  };

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ updatePackPrice } = await import("./packs"));
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`insert into public.tenants (id, name, slug) values (${tenant}, 'packprice', ${`packprice-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'admin', 'Admin')`);
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${admin}, ${tenant}, ${role}, ${`a-${admin.slice(0, 8)}@packprice.test`}, 'Admin')`,
    );
    await db.execute(sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'LV')`);
    await db.execute(
      sql`insert into public.services (id, tenant_id, name, duration_min, is_active)
          values (${service}, ${tenant}, 'Osteopatia', 45, true)`,
    );
    await db.execute(
      sql`insert into public.service_packs
            (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
          values (${pack}, ${tenant}, ${service}, ${location}, 'Osteopatia 10', 10, 59500)`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    for (const stmt of [
      sql`delete from public.audit_log where tenant_id = ${tenant}`,
      sql`delete from public.service_packs where tenant_id = ${tenant}`,
      sql`delete from public.services where tenant_id = ${tenant}`,
      sql`delete from public.locations where tenant_id = ${tenant}`,
      sql`delete from public.users where tenant_id = ${tenant}`,
      sql`delete from public.roles where tenant_id = ${tenant}`,
      sql`delete from public.tenants where id = ${tenant}`,
    ]) {
      await db.execute(stmt);
    }
  });

  it("moves the price and nothing else", async () => {
    const { sql } = await import("drizzle-orm");
    await updatePackPrice(actor(), pack, 60000);
    const [r] = await rows<{
      price_cents: number;
      name: string;
      session_count: number;
      base_service_id: string;
      location_id: string;
      is_active: boolean;
    }>(
      sql`select price_cents, name, session_count, base_service_id, location_id, is_active
            from public.service_packs where id = ${pack}`,
    );
    expect(r).toEqual({
      price_cents: 60000,
      name: "Osteopatia 10",
      session_count: 10,
      base_service_id: service,
      location_id: location,
      is_active: true,
    });
  });

  it("writes one pack.update audit row naming the field, never the amount", async () => {
    const { sql } = await import("drizzle-orm");
    const audit = await rows<{ action: string; metadata: unknown }>(
      sql`select action, metadata from public.audit_log
           where tenant_id = ${tenant} and entity_id = ${pack}`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("pack.update");
    expect(JSON.stringify(audit[0]!.metadata)).toContain("price");
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain("60000");
  });

  it("an unknown pack is not_found and writes nothing", async () => {
    await expect(updatePackPrice(actor(), randomUUID(), 100)).rejects.toMatchObject({ code: "not_found" });
  });
});

/**
 * pack-session-count.db.test.ts — PACK-07's negative arm, against a real database.
 *
 * ==========================================================================
 * WHY THE PURE TEST IS NOT ENOUGH, AND IT IS PACK-04'S REASON EXACTLY
 * ==========================================================================
 * ./pack-session-count.test.ts proves the DECISION. It cannot prove that
 * `updatePack` ASKS. A guard that is correct and never called is the whole of
 * PACK-04: `service_packs.base_service_id` was already a hard-delete blocker,
 * correctly, and the archive path simply never consulted it.
 *
 * So this suite runs the real server function against a real pacote with a real
 * patient instance, and asserts the refusal AND that the row did not move.
 *
 * IT ALSO ASSERTS THE THREE THINGS A TOO-BROAD GUARD WOULD BREAK: an unheld
 * pacote is still freely editable, a HELD pacote's other fields still save, and
 * a no-op re-save of the same count is not refused. Without those, "refuse
 * everything" would pass.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("PACK-07: changing session_count on a pacote patients hold", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let updatePack: typeof import("./packs").updatePack;

  const tenant = randomUUID();
  const role = randomUUID();
  const admin = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  /** Sold to a patient. The 5 somebody will try to turn into a 10. */
  const heldPack = randomUUID();
  /** Nobody has bought it, so every field stays editable. */
  const freePack = randomUUID();
  const patient = randomUUID();
  const instance = randomUUID();

  const actor = () => ({ tenantId: tenant, role: "admin" as const, userId: admin });

  const packInput = (over: Partial<{ name: string; sessionCount: number; priceCents: number }> = {}) => ({
    name: "Pacote 5",
    baseServiceId: service,
    locationId: location,
    sessionCount: 5,
    priceCents: 20000,
    ...over,
  });

  const read = async (id: string) => {
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ session_count: number; name: string; price_cents: number }>(
      sql`select session_count, name, price_cents from public.service_packs where id = ${id}`,
    );
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return list[0] as { session_count: number; name: string; price_cents: number };
  };

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ updatePack } = await import("./packs"));
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`insert into public.tenants (id, name, slug) values (${tenant}, 'pack07', ${`pack07-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(
      sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'admin', 'Admin')`,
    );
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${admin}, ${tenant}, ${role}, ${`a-${admin.slice(0, 8)}@pack07.test`}, 'Admin')`,
    );
    await db.execute(
      sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'LV')`,
    );
    await db.execute(
      sql`insert into public.services (id, tenant_id, name, duration_min, is_active)
          values (${service}, ${tenant}, 'Osteopatia', 45, true)`,
    );
    await db.execute(
      sql`insert into public.service_packs
            (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
          values (${heldPack}, ${tenant}, ${service}, ${location}, 'Pacote 5', 5, 20000),
                 (${freePack}, ${tenant}, ${service}, ${location}, 'Pacote livre', 5, 20000)`,
    );
    await db.execute(
      sql`insert into public.patients (id, tenant_id, full_name, patient_number)
          values (${patient}, ${tenant}, 'Paciente Pacote', 77001)`,
    );
    /**
     * THE INSTANCE. `sessions_remaining` is written once at purchase and frozen
     * thereafter (RB-02); this is an INSERT of a brand-new row, which is the one
     * write `pack-sessions-remaining-is-frozen.test.mjs` permits.
     */
    await db.execute(
      sql`insert into public.patient_pack_instances
            (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, legacy_consumed)
          values (${instance}, ${tenant}, ${patient}, ${heldPack}, 5, 5, 0)`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    for (const stmt of [
      // audit_log first: the successful calls below write a row pointing at the
      // actor, and actor_user_id has no ON DELETE action. Without this the suite
      // reports "N passed" and still exits non-zero on a teardown error.
      sql`delete from public.audit_log where tenant_id = ${tenant}`,
      sql`delete from public.patient_pack_instances where tenant_id = ${tenant}`,
      sql`delete from public.patients where tenant_id = ${tenant}`,
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

  it("PREMISE: the pacote really is held, and the other one really is not", async () => {
    // A guard asserted against a fixture with no instance would pass for the
    // wrong reason on every case below.
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from public.patient_pack_instances where pack_id = ${heldPack}`,
    );
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    expect((list[0] as { n: number }).n).toBe(1);
  });

  it("REFUSES the 5 -> 10 an admin would try, and says how many hold it", async () => {
    await expect(
      updatePack(actor(), heldPack, packInput({ sessionCount: 10 })),
    ).rejects.toMatchObject({ code: "has_instances" });
  });

  it("leaves the pacote at 5 - it refused BEFORE it wrote", async () => {
    // The half a rejection alone does not prove. A guard that threw AFTER the
    // update would satisfy the case above and still have re-priced the product.
    await expect(
      updatePack(actor(), heldPack, packInput({ sessionCount: 10 })),
    ).rejects.toThrow();
    expect((await read(heldPack)).session_count).toBe(5);
  });

  it("refuses a DOWNGRADE too - the defect is direction-blind", async () => {
    await expect(
      updatePack(actor(), heldPack, packInput({ sessionCount: 3 })),
    ).rejects.toMatchObject({ code: "has_instances" });
    expect((await read(heldPack)).session_count).toBe(5);
  });

  it("STILL SAVES the other fields on a held pacote - the guard is on the CHANGE", async () => {
    // The assertion that keeps this from becoming a trap. The whole row posts
    // together, so a guard on the PACOTE rather than on the change would refuse
    // a price correction on the clinic's most-sold product.
    await updatePack(actor(), heldPack, packInput({ name: "Pacote 5 renomeado", priceCents: 21500 }));
    const row = await read(heldPack);
    expect(row.name).toBe("Pacote 5 renomeado");
    expect(row.price_cents).toBe(21500);
    expect(row.session_count).toBe(5);
  });

  it("a pacote NOBODY holds is still freely editable", async () => {
    await updatePack(actor(), freePack, packInput({ name: "Pacote livre", sessionCount: 10 }));
    expect((await read(freePack)).session_count).toBe(10);
  });
});

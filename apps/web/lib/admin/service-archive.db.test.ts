/**
 * service-archive.db.test.ts - PACK-04's negative arm, against a real database.
 *
 * ==========================================================================
 * WHY THE PURE TEST IS NOT ENOUGH
 * ==========================================================================
 * ./service-archive.test.ts proves the DECISION. It cannot prove that
 * `setServiceActive` ASKS. A guard that is correct and never called is exactly
 * the defect PACK-04 is about - `service_packs.base_service_id` was already a
 * hard-delete blocker, correctly, and the archive path simply never consulted
 * it. So this suite runs the real server function against a real row and
 * asserts the refusal AND that the row did not move.
 *
 * IT ALSO ASSERTS THE THREE THINGS A TOO-BROAD GUARD WOULD BREAK: archiving a
 * service with no pacote still works, RESTORING a service is never refused
 * (production has three services stuck in the archived state right now and they
 * have to be able to come back), and the refusal names the pacote.
 *
 * REMOVE THE GUARD IN services.ts AND THIS FILE GOES RED - measured, not
 * assumed: with the `if (!active)` block deleted, "refuses" fails on the
 * rejection and "does not move the row" fails on is_active. That is the control
 * the owner's ruling asked for.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("PACK-04: archiving a service that carries a pacote", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let setServiceActive: typeof import("./services").setServiceActive;
  let schema: typeof import("@osteojp/db");

  const tenant = randomUUID();
  const role = randomUUID();
  const admin = randomUUID();
  const location = randomUUID();
  /** The service a pacote is bound to - the `7e3359a7` of this fixture. */
  const packedService = randomUUID();
  /** The service nothing points at, so the happy path is covered on the same run. */
  const looseService = randomUUID();
  const pack = randomUUID();

  const actor = () => ({
    tenantId: tenant,
    role: "admin" as const,
    userId: admin,
  });

  const isActive = async (id: string): Promise<boolean> => {
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ is_active: boolean }>(
      sql`select is_active from public.services where id = ${id}`,
    );
    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list[0] as { is_active: boolean }).is_active;
  };

  beforeAll(async () => {
    schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ setServiceActive } = await import("./services"));
    const { sql } = await import("drizzle-orm");
    // One statement per execute: postgres.js prepares each, and a prepared
    // statement cannot carry multiple commands.
    await db.execute(
      sql`insert into public.tenants (id, name, slug) values (${tenant}, 'pack04', ${`pack04-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(
      sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'admin', 'Admin')`,
    );
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${admin}, ${tenant}, ${role}, ${`a-${admin.slice(0, 8)}@pack04.test`}, 'Admin')`,
    );
    await db.execute(
      sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'LV')`,
    );
    await db.execute(
      sql`insert into public.services (id, tenant_id, name, duration_min, is_active)
          values (${packedService}, ${tenant}, 'Tratamento NESA', 45, true),
                 (${looseService}, ${tenant}, 'Servico sem pacote', 30, true)`,
    );
    await db.execute(
      sql`insert into public.service_packs
            (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
          values (${pack}, ${tenant}, ${packedService}, ${location}, 'Pacote 10 - NESA', 10, 39000)`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    for (const stmt of [
      // audit_log first: the two SUCCESSFUL calls below write an audit row
      // pointing at the actor, and audit_log.actor_user_id has no ON DELETE
      // action. Without this the suite reports "4 passed" and still exits
      // non-zero on a teardown error.
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

  it("REFUSES, and the refusal names the pacote", async () => {
    await expect(
      setServiceActive(actor(), packedService, false),
    ).rejects.toMatchObject({
      code: "has_packs",
      // The NAME, not a count. An admin who reads this knows which row to repoint.
      message: "Pacote 10 - NESA",
    });
  });

  /**
   * The half a rejection alone does not prove. A guard that threw AFTER the
   * update would satisfy the assertion above and still archive the service,
   * which is the entire damage.
   */
  it("leaves the service ACTIVE - it refused before it wrote", async () => {
    await expect(
      setServiceActive(actor(), packedService, false),
    ).rejects.toThrow();
    expect(await isActive(packedService)).toBe(true);
  });

  it("still archives a service no pacote is bound to", async () => {
    await setServiceActive(actor(), looseService, false);
    expect(await isActive(looseService)).toBe(false);
  });

  /**
   * RESTORING IS NEVER GUARDED, and this is the assertion that keeps the guard
   * from being widened into a trap. Production has three services archived with
   * a pacote bound to each; if restore consulted the same guard, not one of them
   * could be brought back and the only repair left would be a manual data write.
   */
  it("RESTORES a service that carries a pacote - the guard is one-directional", async () => {
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`update public.services set is_active = false where id = ${packedService}`,
    );
    await setServiceActive(actor(), packedService, true);
    expect(await isActive(packedService)).toBe(true);
  });
});

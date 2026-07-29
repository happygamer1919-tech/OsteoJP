/**
 * users-is-bookable-rls.test.ts — DB-gated isolation proof for PL-06b
 * (migration 0046: users.is_bookable).
 *
 * is_bookable is a column on the already-RLS-protected `users` table, whose
 * single policy `users_tenant_isolation` (0001) is FOR ALL TO authenticated,
 * keyed purely on tenant_id (USING + WITH CHECK). Role-gating of who may manage
 * staff is APP-layer (assertCan "users:manage" in editStaff), not RLS — so this
 * suite proves the ONE thing RLS owns for the new column: it is readable and
 * writable ONLY inside its own tenant, and a foreign tenant can neither see nor
 * flip it.
 *
 *   1. TENANT ISOLATION (read) — a user's is_bookable is visible only inside its
 *      own tenant; a foreign tenant sees zero rows.
 *   2. IN-TENANT WRITE — an in-tenant authenticated principal can flip the flag
 *      (the Equipa write path; app-layer assertCan gates WHO calls it).
 *   3. CROSS-TENANT WRITE BLOCKED — tenant B cannot flip tenant A's flag; the
 *      restrictive USING hides the row, so the UPDATE affects zero rows.
 *
 * RLS is ENABLE-not-FORCE, so every isolation assertion runs on the role-
 * switched `authenticated` connection via asRole (never the owner, which
 * BYPASSes RLS). asRole always rolls back — nothing here persists. Skipped when
 * DATABASE_URL is absent (matches the other DB-gated suites).
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = { tenant: string; user: string };

const newIds = (): Ids => ({ tenant: randomUUID(), user: randomUUID() });

const A = newIds();
const B = newIds();

async function seedTenant(sql: Sql, x: Ids, isBookable: boolean): Promise<void> {
  await sql`insert into tenants (id, name, slug) values (${x.tenant}, 'Is-Bookable Gate', ${`bookable-${x.tenant}`})`;
  await sql`insert into users (id, tenant_id, email, full_name, is_bookable)
            values (${x.user}, ${x.tenant}, ${`u-${x.user}@example.pt`}, 'Staff Member', ${isBookable})`;
}

describe.skipIf(!live)("users.is_bookable (0046) — DB-gated tenant isolation", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A, true); // tenant A: bookable practitioner
    await seedTenant(sql, B, false); // tenant B: a separate tenant's non-bookable user
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  describe("1. tenant isolation (read)", () => {
    it("NEGATIVE CONTROL: owner (BYPASSRLS) reads tenant A's is_bookable", async () => {
      const rows = await sql<{ isBookable: boolean }[]>`
        select is_bookable as "isBookable" from users where id = ${A.user}`;
      expect(rows[0]?.isBookable).toBe(true);
    });

    it("tenant A (authenticated) reads its own user's is_bookable = true", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
        tx<{ isBookable: boolean }[]>`
          select is_bookable as "isBookable" from users where id = ${A.user}`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]?.isBookable).toBe(true);
    });

    it("tenant B sees ZERO rows for tenant A's user", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "admin"), (tx) =>
        tx<{ id: string }[]>`select id from users where id = ${A.user}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("2. in-tenant write (the Equipa path)", () => {
    it("an in-tenant principal CAN flip is_bookable on its own tenant's user", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
        tx<{ isBookable: boolean }[]>`
          update users set is_bookable = false
          where id = ${A.user} returning is_bookable as "isBookable"`,
      );
      expect(rows[0]?.isBookable).toBe(false);
    });
  });

  describe("3. cross-tenant write blocked", () => {
    it("tenant B CANNOT flip tenant A's is_bookable (RLS no-op — zero rows)", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "admin"), (tx) =>
        tx<{ id: string }[]>`
          update users set is_bookable = true
          where id = ${A.user} returning id`,
      );
      expect(rows.length).toBe(0);
    });
  });
});

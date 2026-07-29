/**
 * viewer-locations-rls.test.ts — DB-gated proof for PL-09 Phase 0.
 *
 * resolveViewerLocationIds (apps/web/lib/auth/viewer-locations.ts) runs, under
 * RLS, `select location_id from staff_locations where user_id = <caller>`. This
 * suite pins that query's guarantees: it returns the CALLER's own assignment set
 * (multi-location safe) and is tenant-isolated — a foreign tenant resolves zero.
 * That is the foundation every later reception/admin location scope depends on.
 *
 * RLS is ENABLE-not-FORCE, so every scoped assertion runs on the role-switched
 * `authenticated` connection via asRole (never the owner, which BYPASSes RLS).
 * asRole always rolls back. Skipped when DATABASE_URL is absent.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = { tenant: string; u1: string; u2: string; loc1: string; loc2: string };
const newIds = (): Ids => ({
  tenant: randomUUID(),
  u1: randomUUID(),
  u2: randomUUID(),
  loc1: randomUUID(),
  loc2: randomUUID(),
});
const A = newIds();
const B = newIds();

// u1 belongs to BOTH loc1 + loc2 (multi-location); u2 belongs to loc2 only.
async function seedTenant(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug) values (${x.tenant}, 'Viewer Loc Gate', ${`vl-${x.tenant}`})`;
  await sql`insert into users (id, tenant_id, email, full_name) values (${x.u1}, ${x.tenant}, ${`u1-${x.u1}@example.pt`}, 'U1')`;
  await sql`insert into users (id, tenant_id, email, full_name) values (${x.u2}, ${x.tenant}, ${`u2-${x.u2}@example.pt`}, 'U2')`;
  await sql`insert into locations (id, tenant_id, name) values (${x.loc1}, ${x.tenant}, 'Loc1')`;
  await sql`insert into locations (id, tenant_id, name) values (${x.loc2}, ${x.tenant}, 'Loc2')`;
  await sql`insert into staff_locations (tenant_id, user_id, location_id) values (${x.tenant}, ${x.u1}, ${x.loc1})`;
  await sql`insert into staff_locations (tenant_id, user_id, location_id) values (${x.tenant}, ${x.u1}, ${x.loc2})`;
  await sql`insert into staff_locations (tenant_id, user_id, location_id) values (${x.tenant}, ${x.u2}, ${x.loc2})`;
}

const sorted = (rows: { location_id: string }[]) => rows.map((r) => r.location_id).sort();

describe.skipIf(!live)("resolveViewerLocationIds query — viewer own-location scope (PL-09 Phase 0)", () => {
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

  it("returns the caller's OWN multi-location assignment set", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception"), (tx) =>
      tx<{ location_id: string }[]>`select location_id from staff_locations where user_id = ${A.u1}`,
    );
    expect(sorted(rows)).toEqual([A.loc1, A.loc2].sort());
  });

  it("returns exactly one location for a single-membership user", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
      tx<{ location_id: string }[]>`select location_id from staff_locations where user_id = ${A.u2}`,
    );
    expect(sorted(rows)).toEqual([A.loc2]);
  });

  it("returns [] for a user with no membership", async () => {
    const unknown = randomUUID();
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception"), (tx) =>
      tx<{ location_id: string }[]>`select location_id from staff_locations where user_id = ${unknown}`,
    );
    expect(rows.length).toBe(0);
  });

  it("tenant B cannot resolve tenant A's user (tenant isolation → zero rows)", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "reception"), (tx) =>
      tx<{ location_id: string }[]>`select location_id from staff_locations where user_id = ${A.u1}`,
    );
    expect(rows.length).toBe(0);
  });

  it("NEGATIVE CONTROL: owner (BYPASSRLS) sees tenant A u1's two memberships", async () => {
    const rows = await sql<
      { location_id: string }[]
    >`select location_id from staff_locations where user_id = ${A.u1}`;
    expect(sorted(rows)).toEqual([A.loc1, A.loc2].sort());
  });
});

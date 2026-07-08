/**
 * patient-hard-delete-rls.test.ts — DB-gated proof for W5-08 (hardDeletePatient).
 *
 * The W5-08 hard-delete runs a real DELETE on public.patients inside the acting
 * tenant's RLS context. The security-critical guarantee is that the DELETE is
 * tenant-scoped: a caller can only ever remove a patient row in their OWN tenant,
 * and a cross-tenant id deletes NOTHING (RLS matches zero rows, so the action
 * returns not_found and never touches another tenant's data).
 *
 * patients_tenant_isolation (0001_rls.sql) is `FOR ALL … USING (tenant_id =
 * jwt_tenant_id())`, so DELETE is covered by the same predicate as SELECT. This
 * suite proves the destructive path against live rows:
 *
 *   1. Tenant B (authenticated) DELETE of tenant A's patient id → 0 rows removed;
 *      the row still exists (owner negative control confirms it survived).
 *   2. Tenant A (authenticated) DELETE of its OWN patient id → exactly 1 row
 *      removed (negative control: the delete actually works in-tenant, so the
 *      cross-tenant zero above is isolation, not a vacuous no-op).
 *
 * RLS is ENABLE-not-FORCE, so every isolation assertion runs on the role-switched
 * `authenticated` connection via asRole (never the owner, which BYPASSes RLS).
 * asRole ALWAYS rolls back, so nothing this suite deletes actually persists — the
 * in-tenant delete is observed inside the same tx via RETURNING, then rolled back.
 * Skipped when DATABASE_URL is absent (same as the sibling RLS suites).
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  patient: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  patient: randomUUID(),
});

const A = newIds();
const B = newIds();

async function seedTenant(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'HardDel Gate', ${`harddel-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'admin', 'Admin')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`a-${x.user}@example.pt`}, 'Admin User')`;
  // A reference-free patient (no clinical records / appointments / invoices) —
  // the only kind hardDeletePatient will ever remove.
  await sql`insert into patients (id, tenant_id, full_name, created_by)
            values (${x.patient}, ${x.tenant}, 'Deletable Patient', ${x.user})`;
}

describe.skipIf(!live)("W5-08 hardDeletePatient — DB-gated RLS on the destructive path", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A);
    await seedTenant(sql, B);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from patients where id in (${A.patient}, ${B.patient})`;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: owner (BYPASSRLS) sees tenant A's patient row", async () => {
    const rows = await sql<{ id: string }[]>`
      select id from patients where id = ${A.patient}`;
    expect(rows.length).toBe(1);
  });

  it("tenant B (authenticated) CANNOT delete tenant A's patient — 0 rows removed", async () => {
    const removed = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
      tx<{ id: string }[]>`delete from patients where id = ${A.patient} returning id`,
    );
    // RLS USING (tenant_id = jwt_tenant_id()) matched zero rows for tenant B, so
    // the cross-tenant DELETE is a no-op — exactly what makes hardDeletePatient
    // return not_found for a foreign id instead of touching another tenant.
    expect(removed.length).toBe(0);
  });

  it("tenant A's patient still exists after tenant B's attempted delete (owner control)", async () => {
    const rows = await sql<{ id: string }[]>`
      select id from patients where id = ${A.patient}`;
    expect(rows.length).toBe(1);
  });

  it("tenant A (authenticated) CAN delete its OWN patient — exactly 1 row removed (rolled back)", async () => {
    const removed = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
      tx<{ id: string }[]>`delete from patients where id = ${A.patient} returning id`,
    );
    // Negative control: the in-tenant delete genuinely works (so the zero above
    // is isolation, not a broken query). asRole rolled the tx back, so A.patient
    // is untouched for the afterAll cleanup.
    expect(removed.length).toBe(1);
    expect(removed[0]!.id).toBe(A.patient);
  });
});

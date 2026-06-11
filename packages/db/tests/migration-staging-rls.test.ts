/**
 * migration-staging-rls.test.ts
 *
 * Cross-tenant RLS isolation for `migration_staging_rows` (migration 0014) —
 * the staging table + idempotency ledger of the data-migration pipeline. The
 * policy under test:
 *
 *   CREATE POLICY "migration_staging_rows_tenant_isolation"
 *     ON public.migration_staging_rows
 *     FOR ALL TO authenticated
 *     USING      (tenant_id = (select public.jwt_tenant_id()))
 *     WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
 *
 * Staged rows carry RAW clinical source payloads, so tenant isolation here is
 * as load-bearing as on the live tables. Same harness and shape as the
 * ai-ingestion suite: every isolation assertion runs role-dropped to
 * `authenticated` (RLS is ENABLE, not FORCE — the owner connection would
 * bypass it and pass for the wrong reason), with a sanity assertion that a
 * known tenant-B row is invisible under tenant-A claims.
 *
 * GATING: requires a live, privileged DATABASE_URL with migrations applied.
 * Skipped when absent so `vitest run` stays green without a database.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

describe.skipIf(!live)("migration_staging_rows RLS tenant isolation (migration 0014)", () => {
  let sql: Sql;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const rowA = randomUUID();
  const rowB = randomUUID();
  const batchA = randomUUID();
  const batchB = randomUUID();

  beforeAll(async () => {
    sql = connect();
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantA}, 'Migration RLS Tenant A', ${`mig-a-${tenantA}`}),
             (${tenantB}, 'Migration RLS Tenant B', ${`mig-b-${tenantB}`})
    `;
    await sql`
      insert into migration_staging_rows (id, tenant_id, batch_id, source_system, entity_type, source_id, raw)
      values (${rowA}, ${tenantA}, ${batchA}, 'fisiozero', 'patient', ${`seed-a-${rowA}`}, '{"nome":"sintético A"}'::jsonb),
             (${rowB}, ${tenantB}, ${batchB}, 'fisiozero', 'patient', ${`seed-b-${rowB}`}, '{"nome":"sintético B"}'::jsonb)
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from migration_staging_rows where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
    await sql.end();
  });

  // --- SELECT (+ the RLS-is-really-on sanity assertion) --------------------
  it("SELECT under tenant-A JWT returns only tenant-A rows, never tenant-B's", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string; tenant_id: string }[]>`
        select id, tenant_id from migration_staging_rows
      `,
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(rowA);
    // SANITY: proves RLS is actually enforced (not bypassed by owner/role error).
    expect(ids).not.toContain(rowB);
  });

  // --- INSERT: WITH CHECK rejects cross-tenant, allows own-tenant ----------
  it("INSERT of a tenant-B row under tenant-A JWT is rejected by WITH CHECK", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
        tx`
          insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, raw)
          values (${tenantB}, ${batchA}, 'fisiozero', 'patient', ${`xtenant-${randomUUID()}`}, '{}'::jsonb)
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("INSERT of a tenant-A row under tenant-A JWT succeeds", async () => {
    const inserted = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string }[]>`
        insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, raw)
        values (${tenantA}, ${batchA}, 'fisiozero', 'patient', ${`own-${randomUUID()}`}, '{}'::jsonb)
        returning id
      `,
    );
    expect(inserted.length).toBe(1);
  });

  // --- UPDATE / DELETE: USING filters cross-tenant rows out SILENTLY -------
  it("UPDATE of a tenant-B row under tenant-A JWT affects 0 rows (no error)", async () => {
    const updated = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string }[]>`
        update migration_staging_rows set status = 'validated'
        where id = ${rowB}
        returning id
      `,
    );
    expect(updated.length).toBe(0);
  });

  it("DELETE of a tenant-B row under tenant-A JWT affects 0 rows (no error)", async () => {
    const deleted = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string }[]>`
        delete from migration_staging_rows where id = ${rowB} returning id
      `,
    );
    expect(deleted.length).toBe(0);
  });

  // --- Missing claims ⇒ fail-closed -----------------------------------------
  it("SELECT with NO JWT claims returns zero rows (fail-closed)", async () => {
    const rows = await asRole(sql, "authenticated", null, (tx) =>
      tx<{ id: string }[]>`select id from migration_staging_rows`,
    );
    expect(rows.length).toBe(0);
  });

  // --- Sanctioned exception: service_role (BYPASSRLS) crosses tenants ------
  it("service_role write into another tenant SUCCEEDS — the sanctioned bypass", async () => {
    // INTENTIONAL, NOT A GAP. ENABLE-not-FORCE, consistent with every other
    // domain table; the import pipeline itself runs as `authenticated` via
    // withTenantContext and never relies on this.
    const inserted = await asRole(sql, "service_role", claimsFor(tenantA), (tx) =>
      tx<{ id: string; tenant_id: string }[]>`
        insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id, raw)
        values (${tenantB}, ${batchB}, 'fisiozero', 'patient', ${`svc-${randomUUID()}`}, '{}'::jsonb)
        returning id, tenant_id
      `,
    );
    expect(inserted.length).toBe(1);
    expect(inserted[0]?.tenant_id).toBe(tenantB);
  });
});

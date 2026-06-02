/**
 * ai-ingestion-rls-isolation.test.ts
 *
 * Cross-tenant RLS isolation for `ai_ingestion_requests` (migration 0008) — the
 * table the Stream D ingestion endpoint writes to. The policy under test:
 *
 *   CREATE POLICY "ai_ingestion_requests_tenant_isolation"
 *     ON public.ai_ingestion_requests
 *     FOR ALL TO authenticated
 *     USING      (tenant_id = (select public.jwt_tenant_id()))
 *     WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
 *
 * jwt_tenant_id() resolves `auth.jwt() ->> 'tenant_id'`, i.e. the
 * `request.jwt.claims` GUC — which we set per transaction to simulate a tenant
 * (the same seam the app uses in packages/db/src/client.ts withTenantContext).
 *
 * CRITICAL CORRECTNESS NOTE
 * -------------------------
 * RLS on this table is ENABLE, not FORCE. The policy therefore applies to the
 * `authenticated` role but NOT to the table owner or any BYPASSRLS role
 * (service_role). Every isolation assertion below runs inside a transaction that
 * does `SET LOCAL ROLE authenticated` first, so the effective role is gated by
 * the policy. If these assertions ran on the owner/migration connection they
 * would pass for the WRONG reason (RLS silently bypassed). The SELECT case
 * includes a sanity assertion — a known tenant-B row id is NOT visible under a
 * tenant-A JWT — which fails loudly if RLS is not actually in effect.
 *
 * Scope: tenant isolation only. The unique (tenant_id, idempotency_key)
 * constraint and FK shape are NOT under test here.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase default
 * `postgres` owner role: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green without a database.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

describe.skipIf(!live)("ai_ingestion_requests RLS tenant isolation (migration 0008)", () => {
  // Constructed in beforeAll, not at module scope: the describe callback is
  // evaluated at collection time even when skipped, so connecting here (with a
  // possibly-undefined url) would throw. beforeAll only runs when NOT skipped.
  let sql: Sql;

  // Two tenants + one ai_ingestion_requests row each. Random ids so a previous
  // aborted run can't collide on the unique tenants.slug; cleaned up in afterAll.
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const rowA = randomUUID();
  const rowB = randomUUID();

  beforeAll(async () => {
    sql = connect();
    // Seed on the privileged (owner) connection — bypasses RLS by ownership.
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantA}, 'RLS Test Tenant A', ${`rls-a-${tenantA}`}),
             (${tenantB}, 'RLS Test Tenant B', ${`rls-b-${tenantB}`})
    `;
    await sql`
      insert into ai_ingestion_requests (id, tenant_id, idempotency_key, request_id, payload_hash)
      values (${rowA}, ${tenantA}, ${`seed-a-${rowA}`}, 'req-a', 'hash-a'),
             (${rowB}, ${tenantB}, ${`seed-b-${rowB}`}, 'req-b', 'hash-b')
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    // tenants cascade to ai_ingestion_requests, but be explicit + order-safe.
    await sql`delete from ai_ingestion_requests where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
    await sql.end();
  });

  // --- SELECT (+ the RLS-is-really-on sanity assertion) --------------------
  it("SELECT under tenant-A JWT returns only tenant-A rows, never tenant-B's", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string; tenant_id: string }[]>`
        select id, tenant_id from ai_ingestion_requests
      `,
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(rowA);
    // SANITY: proves RLS is actually enforced (not bypassed by owner/role error).
    // If RLS were off, the tenant-B seed row would be visible here.
    expect(ids).not.toContain(rowB);
  });

  // --- INSERT: WITH CHECK rejects cross-tenant, allows own-tenant ----------
  it("INSERT of a tenant-B row under tenant-A JWT is rejected by WITH CHECK", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
        tx`
          insert into ai_ingestion_requests (tenant_id, idempotency_key, request_id, payload_hash)
          values (${tenantB}, ${`xtenant-${randomUUID()}`}, 'r', 'h')
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("INSERT of a tenant-A row under tenant-A JWT succeeds", async () => {
    const inserted = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string }[]>`
        insert into ai_ingestion_requests (tenant_id, idempotency_key, request_id, payload_hash)
        values (${tenantA}, ${`own-${randomUUID()}`}, 'r', 'h')
        returning id
      `,
    );
    expect(inserted.length).toBe(1);
  });

  // --- UPDATE / DELETE: USING filters cross-tenant rows out SILENTLY -------
  it("UPDATE of a tenant-B row under tenant-A JWT affects 0 rows (no error)", async () => {
    const updated = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string }[]>`
        update ai_ingestion_requests set request_id = 'mutated'
        where id = ${rowB}
        returning id
      `,
    );
    expect(updated.length).toBe(0);
  });

  it("DELETE of a tenant-B row under tenant-A JWT affects 0 rows (no error)", async () => {
    const deleted = await asRole(sql, "authenticated", claimsFor(tenantA), (tx) =>
      tx<{ id: string }[]>`
        delete from ai_ingestion_requests where id = ${rowB} returning id
      `,
    );
    expect(deleted.length).toBe(0);
  });

  // --- Sanctioned exception: service_role (BYPASSRLS) crosses tenants ------
  it("service_role write into another tenant SUCCEEDS — the sanctioned ingestion bypass", async () => {
    // INTENTIONAL, NOT A GAP. RLS here is ENABLE-not-FORCE, so service_role
    // (BYPASSRLS) is not subject to the policy. The ingestion endpoint writes as
    // service_role and derives tenant_id from the patient it RESOLVED, never from
    // the request payload — so this bypass is the designed write path, and this
    // case is where it is acknowledged. Even with a mismatching tenant-A JWT set,
    // the tenant-B insert goes through.
    const inserted = await asRole(sql, "service_role", claimsFor(tenantA), (tx) =>
      tx<{ id: string; tenant_id: string }[]>`
        insert into ai_ingestion_requests (tenant_id, idempotency_key, request_id, payload_hash)
        values (${tenantB}, ${`svc-${randomUUID()}`}, 'r', 'h')
        returning id, tenant_id
      `,
    );
    expect(inserted.length).toBe(1);
    expect(inserted[0]?.tenant_id).toBe(tenantB);
  });
});

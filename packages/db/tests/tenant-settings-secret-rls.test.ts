/**
 * tenant-settings-secret-rls.test.ts — W3-05.
 *
 * A per-tenant server-only secret lives in `tenants.settings.secrets` (jsonb).
 * Its isolation IS the tenants-row isolation: `tenants_tenant_isolation`
 * (USING/WITH CHECK `id = jwt_tenant_id()`, 0001_rls). This pins that a tenant
 * can read its OWN secret and can never see another tenant's tenants row (hence
 * never its secret). Runs on the seeded DB (db-tests.yml); skipped when no live
 * DB is configured.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const A = randomUUID();
const B = randomUUID();
const HASH_A = "hash-A-" + A;
const HASH_B = "hash-B-" + B;

const secretBlob = (hash: string) => ({
  secrets: { appointmentDeletePasswordHash: hash },
});

describe.skipIf(!live)("tenants.settings.secrets tenant isolation (W3-05)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    // Owner connection bypasses RLS — seed two tenants each with a secret.
    // Bind the jsonb via `sql.json(obj)` (native jsonb param) — NOT
    // `${JSON.stringify(obj)}::jsonb`: under postgres.js the latter binds a text
    // value and the text→jsonb cast stores a jsonb *string scalar* (jsonb_typeof
    // 'string'), so `settings->'secrets'->>…` reads null. `sql.json` stores a
    // jsonb object, the way the app persists tenant settings.
    await sql`insert into tenants (id, name, slug, settings)
              values (${A}, 'Secret A', ${`sec-a-${A}`}, ${sql.json(secretBlob(HASH_A))})`;
    await sql`insert into tenants (id, name, slug, settings)
              values (${B}, 'Secret B', ${`sec-b-${B}`}, ${sql.json(secretBlob(HASH_B))})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A}, ${B})`;
    await sql.end();
  });

  it("a tenant reads its OWN secret from settings.secrets", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A), async (tx) =>
      tx<{ h: string | null }[]>`
        select settings->'secrets'->>'appointmentDeletePasswordHash' as h
        from tenants where id = ${A}`,
    );
    expect(rows[0]?.h).toBe(HASH_A);
  });

  it("a tenant CANNOT see another tenant's row (so never its secret)", async () => {
    const aSeesB = await asRole(sql, "authenticated", claimsFor(A), async (tx) =>
      tx<{ id: string }[]>`select id from tenants where id = ${B}`,
    );
    expect(aSeesB.length).toBe(0);

    const bSeesA = await asRole(sql, "authenticated", claimsFor(B), async (tx) =>
      tx<{ id: string }[]>`select id from tenants where id = ${A}`,
    );
    expect(bSeesA.length).toBe(0);
  });

  it("NEGATIVE CONTROL: the owner connection (RLS-bypassing) sees both secrets", async () => {
    const both = await sql<{ id: string; h: string }[]>`
      select id, settings->'secrets'->>'appointmentDeletePasswordHash' as h
      from tenants where id in (${A}, ${B}) order by id`;
    expect(both.map((r) => r.h).sort()).toEqual([HASH_A, HASH_B].sort());
  });
});

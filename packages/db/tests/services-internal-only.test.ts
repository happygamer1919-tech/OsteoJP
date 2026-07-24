/**
 * services-internal-only.test.ts — DB-gated proof for W12-26 (migration 0039:
 * services.internal_only).
 *
 * A service flagged internal_only is staff-bookable but must NEVER appear in the
 * patient-portal booking wizard. This pins the column default and the exact
 * filter semantics the two catalog queries use:
 *   - PORTAL (apps/api store.ts): is_active = true AND internal_only = false
 *     -> excludes the internal service.
 *   - STAFF (apps/web data.ts): is_active = true (no internal_only filter)
 *     -> includes the internal service.
 *
 * Owner/BYPASSRLS connection: this proves the column + the WHERE semantics, not
 * RLS (services are reference data the portal reads under a privileged context,
 * gated by the WHERE clause, not the patient role). Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

const T = randomUUID();
const SVC_NORMAL = randomUUID(); // is_active, internal_only=false
const SVC_INTERNAL = randomUUID(); // is_active, internal_only=true ("Diversos")
const SVC_DEFAULT = randomUUID(); // inserted WITHOUT internal_only -> default

describe.skipIf(!live)("services.internal_only (0039) — portal exclusion / staff inclusion", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${T}, 'Internal Only Gate', ${`int-only-${T}`})`;
    await sql`insert into services (id, tenant_id, name, is_active, internal_only)
              values (${SVC_NORMAL}, ${T}, 'Osteopatia', true, false)`;
    await sql`insert into services (id, tenant_id, name, is_active, internal_only)
              values (${SVC_INTERNAL}, ${T}, 'Diversos', true, true)`;
    await sql`insert into services (id, tenant_id, name, is_active)
              values (${SVC_DEFAULT}, ${T}, 'Fisioterapia', true)`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id = ${T}`;
    await sql.end();
  });

  it("internal_only defaults to false for a row that does not set it", async () => {
    const rows = await sql<{ internal_only: boolean }[]>`
      select internal_only from services where id = ${SVC_DEFAULT}`;
    expect(rows[0]?.internal_only).toBe(false);
  });

  it("PORTAL query (is_active + internal_only=false) EXCLUDES the internal service", async () => {
    const rows = await sql<{ id: string }[]>`
      select id from services
      where tenant_id = ${T} and is_active = true and internal_only = false
      order by name`;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(SVC_NORMAL);
    expect(ids).toContain(SVC_DEFAULT);
    expect(ids).not.toContain(SVC_INTERNAL); // "Diversos" never reaches the portal wizard
  });

  it("STAFF query (is_active, no internal_only filter) INCLUDES the internal service", async () => {
    const rows = await sql<{ id: string }[]>`
      select id from services where tenant_id = ${T} and is_active = true order by name`;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(SVC_INTERNAL); // staff CAN book "Diversos" internally
    expect(ids).toContain(SVC_NORMAL);
    expect(ids).toContain(SVC_DEFAULT);
  });
});

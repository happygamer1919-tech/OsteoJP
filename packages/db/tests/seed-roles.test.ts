/**
 * seed-roles.test.ts
 *
 * Covers the canonical-role seeder (packages/db/seed/roles.ts) used by the
 * tenant-create path. Two layers:
 *
 *   1. Always-on (no DB): the seeder's role set MUST match the permission
 *      matrix exactly — same slugs, no extras, no gaps. This is the "matrix
 *      intact" guarantee. CANONICAL_ROLES is keyed on `Role` so a drift is
 *      already a compile error; this asserts it at runtime too and guards the
 *      labels.
 *
 *   2. Live DB (gated on DATABASE_URL, like the RLS suites): a fresh tenant
 *      gets exactly the canonical role set, and re-running the seeder neither
 *      duplicates nor alters rows (idempotency). Skipped when DATABASE_URL is
 *      absent so `vitest run` stays green without a database. Seeds/cleans on a
 *      privileged connection (owner role, BYPASSRLS) — correct for the
 *      service-role seed path under test.
 */
import { randomUUID } from "node:crypto";
import { eq, sql as dsql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES, type Role } from "@osteojp/auth";
import { CANONICAL_ROLES, seedTenantRoles } from "../seed/roles";
import { roles } from "../src/schema";

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const quiet = () => {};

describe("CANONICAL_ROLES matches the permission matrix", () => {
  it("covers exactly the matrix roles — no gaps, no extras", () => {
    expect(Object.keys(CANONICAL_ROLES).sort()).toEqual([...ROLES].sort());
  });

  it("gives every role a non-empty name and description", () => {
    for (const slug of ROLES) {
      expect(CANONICAL_ROLES[slug].name.length).toBeGreaterThan(0);
      expect(CANONICAL_ROLES[slug].description.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!live)("seedTenantRoles (live DB)", () => {
  // Built in beforeAll, not at describe scope: the callback is evaluated at
  // collection time even when skipped, so connecting with a possibly-undefined
  // url would throw. beforeAll only runs when NOT skipped.
  let client: ReturnType<typeof postgres>;
  let db: PostgresJsDatabase;
  const tenantId = randomUUID();

  beforeAll(async () => {
    client = postgres(url!, { max: 1, prepare: false });
    db = drizzle(client);
    await db.execute(
      dsql`insert into tenants (id, name, slug) values (${tenantId}, 'Seed Roles Test', ${`seed-roles-${tenantId}`})`,
    );
  });

  afterAll(async () => {
    if (!client) return;
    // Cascade (roles.tenant_id ... on delete cascade) removes the seeded rows.
    await db.execute(dsql`delete from tenants where id = ${tenantId}`);
    await client.end({ timeout: 5 });
  });

  const rowsForTenant = () =>
    db
      .select({ slug: roles.slug, name: roles.name, description: roles.description })
      .from(roles)
      .where(eq(roles.tenantId, tenantId));

  it("inserts the full canonical set into a brand-new tenant", async () => {
    // Fresh tenant starts with no roles — proves the seeder is what creates
    // them and that they are scoped to this tenant.
    expect(await rowsForTenant()).toHaveLength(0);

    const result = await seedTenantRoles(db, tenantId, { log: quiet });
    expect(result.map((r) => r.slug).sort()).toEqual([...ROLES].sort());
    expect(result.every((r) => r.action === "inserted")).toBe(true);

    const rows = await rowsForTenant();
    expect(rows.map((r) => r.slug).sort()).toEqual([...ROLES].sort());
    for (const row of rows) {
      const slug = row.slug as Role;
      expect(row.name).toBe(CANONICAL_ROLES[slug].name);
      expect(row.description).toBe(CANONICAL_ROLES[slug].description);
    }
  });

  it("is idempotent — re-running adds nothing and alters nothing", async () => {
    const result = await seedTenantRoles(db, tenantId, { log: quiet });
    expect(result.every((r) => r.action === "unchanged")).toBe(true);

    const rows = await rowsForTenant();
    expect(rows).toHaveLength(ROLES.length);
  });
});

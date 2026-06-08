/**
 * provision-tenant.test.ts
 *
 * Live-DB coverage for the shared tenant onboarding entry point
 * (src/provision.ts → provisionTenant): a genuine create lands the tenant, its
 * canonical roles, AND a system-actor `tenant.create` audit row, all in one
 * transaction; a no-op re-run appends nothing. This is the #108 open item
 * (CLAUDE.md rule 6) closed and asserted.
 *
 * GATING: requires a privileged DATABASE_URL with migrations applied (incl.
 * 0009 tenant_status). Skipped when absent so `vitest run` stays green.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql as dsql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@osteojp/auth";
import { provisionTenant } from "../index";
import { auditLog, roles, tenants } from "../src/schema";

const url = process.env.DATABASE_URL;
const live = Boolean(url);

describe.skipIf(!live)("provisionTenant (live DB)", () => {
  let client: ReturnType<typeof postgres>;
  let db: PostgresJsDatabase;
  const slug = `prov-test-${randomUUID()}`;
  const operatorId = randomUUID();
  let tenantId: string;

  beforeAll(() => {
    client = postgres(url!, { max: 1, prepare: false });
    db = drizzle(client);
  });

  afterAll(async () => {
    if (!client) return;
    if (tenantId) {
      // Cascade removes roles + audit rows.
      await db.execute(dsql`delete from tenants where id = ${tenantId}`);
    }
    await client.end({ timeout: 5 });
  });

  const auditCreateRows = () =>
    db
      .select({
        actorUserId: auditLog.actorUserId,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.action, "tenant.create")));

  it("creates tenant + roles + a system-actor audit row", async () => {
    const result = await provisionTenant({
      name: "Provision Test Clinic",
      slug,
      nif: null,
      operatorId,
    });
    tenantId = result.tenantId;
    expect(result.created).toBe(true);
    expect(result.roles.map((r) => r.slug).sort()).toEqual([...ROLES].sort());

    const roleRows = await db
      .select({ slug: roles.slug })
      .from(roles)
      .where(eq(roles.tenantId, tenantId));
    expect(roleRows.map((r) => r.slug).sort()).toEqual([...ROLES].sort());

    const audit = await auditCreateRows();
    expect(audit).toHaveLength(1);
    const [row] = audit;
    if (!row) throw new Error("expected one tenant.create audit row");
    expect(row.actorUserId).toBeNull(); // system actor
    expect(row.entityType).toBe("tenant");
    expect(row.entityId).toBe(tenantId);
    expect(row.metadata).toMatchObject({ slug, operatorId });
  });

  it("is idempotent — re-running appends no second audit row", async () => {
    const again = await provisionTenant({ name: "Provision Test Clinic", slug, operatorId });
    expect(again.created).toBe(false);
    expect(again.tenantId).toBe(tenantId);

    const audit = await auditCreateRows();
    expect(audit).toHaveLength(1);
  });
});

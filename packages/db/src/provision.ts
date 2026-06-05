// packages/db/src/provision.ts
//
// Tenant onboarding entry point, shared by every app that creates tenants
// (the staff platform's bootstrap path and the superadmin app). It lives in
// @osteojp/db, not an app, because it depends only on db primitives —
// getDbAdmin + the canonical-role seeder + the audit_log schema — and must
// have ONE implementation so the tenant + roles + audit invariant can't drift
// between callers.
//
// Service-role path: a tenant being created has no JWT/user context yet, so
// this runs on the BYPASSRLS admin connection and scopes tenant_id explicitly
// on every write (the tenant row's id; the seeder on each role row; the audit
// row's tenant_id).

import { eq } from "drizzle-orm";

import { getDbAdmin } from "./client";
import { auditLog, tenants } from "./schema";
import { seedTenantRoles, type SeedRoleResult } from "../seed/roles";

export type ProvisionTenantResult = {
  tenantId: string;
  /** true when this call inserted the tenant; false on an idempotent re-run. */
  created: boolean;
  roles: SeedRoleResult[];
};

/**
 * Create a tenant and auto-provision its canonical role set so the tenant is
 * usable immediately — no manual role seeding before the first owner can be
 * bootstrapped.
 *
 * Idempotent: the tenant insert is keyed on its unique `slug` and the role seed
 * on (tenant_id, slug), both ON CONFLICT DO NOTHING — re-running with the same
 * slug never duplicates a tenant or its roles and never alters existing rows.
 *
 * Audit (CLAUDE.md rule 6): a `tenant.create` row is written ONLY on a genuine
 * create, in the SAME transaction as the tenant + role writes, so the tenant
 * never lands without its audit entry and a no-op re-run appends nothing. There
 * is no in-tenant actor at tenant-create time, so this is a SYSTEM actor:
 * `actor_user_id` is NULL and the row is written on the BYPASSRLS connection
 * (no JWT to satisfy the audit_log WITH CHECK). The optional `operatorId` (a
 * Supabase auth uid passed by the superadmin) is recorded in metadata for
 * attribution — a uuid, not PII; `nif`/`name` are never logged (rule 7).
 */
export async function provisionTenant(params: {
  name: string;
  slug: string;
  nif?: string | null;
  /** Supabase auth uid of the platform operator, for audit attribution. */
  operatorId?: string | null;
}): Promise<ProvisionTenantResult> {
  const db = getDbAdmin();

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tenants)
      .values({ name: params.name, slug: params.slug, nif: params.nif ?? null })
      .onConflictDoNothing({ target: tenants.slug })
      .returning({ id: tenants.id });

    let tenantId = inserted[0]?.id;
    const created = Boolean(tenantId);
    if (!tenantId) {
      const existing = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, params.slug));
      tenantId = existing[0]?.id;
    }
    if (!tenantId) {
      throw new Error(`provisionTenant: failed to resolve tenant id for slug '${params.slug}'`);
    }

    const roleResults = await seedTenantRoles(tx, tenantId);

    if (created) {
      await tx.insert(auditLog).values({
        tenantId,
        actorUserId: null, // system/platform actor — no in-tenant user exists
        action: "tenant.create",
        entityType: "tenant",
        entityId: tenantId,
        // PII-free: slug is a public handle; operatorId is a uuid. Never nif/name.
        metadata: { slug: params.slug, operatorId: params.operatorId ?? null },
      });
    }

    return { tenantId, created, roles: roleResults };
  });
}

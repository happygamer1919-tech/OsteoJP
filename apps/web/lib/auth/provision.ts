import "server-only";
import { and, eq } from "drizzle-orm";
import { assertCan, toClaims, type Role } from "@osteojp/auth";
import {
  getDbAdmin,
  withTenantContext,
  seedTenantRoles,
  roles,
  users,
  tenants,
  type SeedRoleResult,
} from "@osteojp/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/admin/audit";
import type { RequestContext } from "./context";

type NewStaff = { email: string; fullName: string; roleSlug: Role; password: string };

/**
 * Owner/admin invites a staff member. Capability-gated, RLS-scoped insert.
 * The staff.invite audit row is written in the SAME transaction as the users
 * insert, so the new staff row never lands without its audit entry.
 */
export async function provisionStaffUser(
  actor: RequestContext,
  staff: NewStaff,
): Promise<{ userId: string }> {
  assertCan(actor.role, "users:manage");

  const roleId = await withTenantContext(toClaims(actor), async (tx) => {
    const r = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.tenantId, actor.tenantId), eq(roles.slug, staff.roleSlug)));
    return r[0]?.id ?? null;
  });
  if (!roleId) {
    throw new Error(`provisionStaffUser: role '${staff.roleSlug}' not found in tenant ${actor.tenantId}`);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: staff.email,
    password: staff.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`provisionStaffUser: auth user creation failed: ${error?.message ?? "unknown"}`);
  }
  const userId = data.user.id;

  try {
    await withTenantContext(toClaims(actor), async (tx) => {
      await tx.insert(users).values({
        id: userId,
        tenantId: actor.tenantId,
        roleId,
        email: staff.email,
        fullName: staff.fullName,
      });
      await writeAudit(tx, actor, {
        action: "staff.invite",
        entityType: "user",
        entityId: userId,
        // PII-free: role slug only, never the email/name.
        metadata: { role: staff.roleSlug },
      });
    });
  } catch (e) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw e;
  }

  return { userId };
}

/**
 * Generate a single-use, expiring set-password link for an already-created
 * staff auth user, via Supabase's recovery flow. Single-use and expiry are
 * enforced by Supabase Auth (the project's OTP expiry config) — we do not mint
 * or track the token ourselves.
 *
 * Returns null (never throws) on any failure, so the invite path can fall back
 * to the temporary-password hand-off rather than failing the whole invite.
 *
 * The link verifies at Supabase, then redirects to STAFF_INVITE_REDIRECT_URL,
 * where the staff member sets their password. NOTE: that landing page is not
 * part of this change's files; without it the redirect has nowhere to land —
 * see the PR notes. When the env var is unset, Supabase uses the project's
 * configured Site URL.
 */
export async function generateSetPasswordLink(email: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const redirectTo = process.env.STAFF_INVITE_REDIRECT_URL;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    if (error || !data?.properties?.action_link) return null;
    return data.properties.action_link;
  } catch {
    return null;
  }
}

/**
 * Create a tenant and auto-provision its canonical role set so the tenant is
 * usable immediately — no manual role seeding before the first owner can be
 * bootstrapped. This is the tenant-create path; `bootstrapTenantOwner` below
 * assumes the 'owner' role this produces already exists.
 *
 * Uses the RLS-bypassing admin handle: a tenant being created has no JWT/user
 * context yet, so there is no tenant claim to scope through withTenantContext.
 * Both writes scope `tenant_id` explicitly (tenant id on the tenant row; the
 * seeder sets it on every role row) per the service-role rule.
 *
 * Idempotent: the tenant insert is keyed on its unique `slug` and the role
 * seed on (tenant_id, slug), both ON CONFLICT DO NOTHING — re-running with the
 * same slug never duplicates a tenant or its roles and never alters an
 * existing tenant's rows.
 *
 * NOTE: no audit row is written here, matching `bootstrapTenantOwner`. Tenant
 * creation is a system/superadmin action with no in-tenant actor to attribute,
 * and the audit module is out of this change's scope. Flagged for the audit
 * stream / owner: decide whether tenant lifecycle needs an audit trail.
 */
export async function provisionTenant(params: {
  name: string;
  slug: string;
  nif?: string | null;
}): Promise<{ tenantId: string; created: boolean; roles: SeedRoleResult[] }> {
  const db = getDbAdmin();

  const inserted = await db
    .insert(tenants)
    .values({ name: params.name, slug: params.slug, nif: params.nif ?? null })
    .onConflictDoNothing({ target: tenants.slug })
    .returning({ id: tenants.id });

  let tenantId = inserted[0]?.id;
  const created = Boolean(tenantId);
  if (!tenantId) {
    const existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, params.slug));
    tenantId = existing[0]?.id;
  }
  if (!tenantId) {
    throw new Error(`provisionTenant: failed to resolve tenant id for slug '${params.slug}'`);
  }

  const roleResults = await seedTenantRoles(db, tenantId);
  return { tenantId, created, roles: roleResults };
}

/** One-time first-owner bootstrap. Requires tenant + 'owner' role already seeded. */
export async function bootstrapTenantOwner(params: {
  tenantSlug: string;
  email: string;
  fullName: string;
  password: string;
}): Promise<{ userId: string; tenantId: string }> {
  const db = getDbAdmin();

  const t = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, params.tenantSlug));
  const tenantId = t[0]?.id;
  if (!tenantId) throw new Error(`bootstrapTenantOwner: tenant '${params.tenantSlug}' not found. Seed it first.`);

  const r = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.slug, "owner")));
  const roleId = r[0]?.id;
  if (!roleId) throw new Error(`bootstrapTenantOwner: 'owner' role missing for tenant ${tenantId}. Seed roles first.`);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`bootstrapTenantOwner: auth user creation failed: ${error?.message ?? "unknown"}`);
  }
  const userId = data.user.id;

  try {
    await db.insert(users).values({
      id: userId,
      tenantId,
      roleId,
      email: params.email,
      fullName: params.fullName,
    });
  } catch (e) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw e;
  }

  return { userId, tenantId };
}

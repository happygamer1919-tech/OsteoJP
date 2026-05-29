import "server-only";
import { and, eq } from "drizzle-orm";
import { assertCan, toClaims, type Role } from "@osteojp/auth";
import { getDbAdmin, withTenantContext, roles, users, tenants } from "@osteojp/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/admin/audit";
import type { Actor } from "./context";

type NewStaff = { email: string; fullName: string; roleSlug: Role; password: string };

/**
 * Owner/admin invites a staff member. Capability-gated, RLS-scoped insert.
 * The staff.invite audit row is written in the SAME transaction as the users
 * insert, so the new staff row never lands without its audit entry.
 */
export async function provisionStaffUser(
  actor: Actor,
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

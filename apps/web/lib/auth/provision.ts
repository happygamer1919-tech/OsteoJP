import "server-only";
import { and, eq } from "drizzle-orm";
import { assertCan, toClaims, type Role } from "@osteojp/auth";
import { getDbAdmin, withTenantContext, roles, users, tenants } from "@osteojp/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/admin/audit";
import { AdminError } from "@/lib/admin/errors";
import type { RequestContext } from "./context";

// Tenant onboarding (tenant + roles + audit) now lives in @osteojp/db so the
// superadmin app can call the same implementation. Re-exported here to keep the
// staff-platform import path (#1) stable.
export { provisionTenant, type ProvisionTenantResult } from "@osteojp/db";

type NewStaff = { email: string; fullName: string; roleSlug: Role; password: string };

/**
 * Supabase auth error codes meaning "this login email is already registered".
 * Auth emails are unique PLATFORM-WIDE, not per-tenant, so the invite's
 * tenant-scoped pre-check cannot see them (W7-01 root cause).
 */
const AUTH_EMAIL_TAKEN_CODES = new Set(["email_exists", "user_already_exists"]);

/**
 * Classify a Supabase auth error as "email already registered". Reads the
 * structured `code` (auth-js sets it on every HTTP-borne error) and falls back
 * to the 422 status only when no code is present, so the rule never depends on
 * matching provider message TEXT. Pure + exported for unit testing.
 */
export function isAuthEmailTaken(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.code) return AUTH_EMAIL_TAKEN_CODES.has(error.code);
  return error.status === 422;
}

/**
 * Owner/admin invites a staff member. Capability-gated, RLS-scoped insert.
 * The staff.invite audit row is written in the SAME transaction as the users
 * insert, so the new staff row never lands without its audit entry.
 *
 * Every failure mode leaves here as a typed AdminError (W7-01). A raw Error
 * would be masked by inviteAction as the generic "A operação falhou" with no
 * temporary password, stranding the admin with no recovery path. Messages carry
 * no email, name, or env value (rule 7).
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
    throw new AdminError("provisioning_unavailable", `role '${staff.roleSlug}' not seeded in tenant`);
  }

  // Guarded: createSupabaseAdminClient() throws when the service-role env is
  // absent. Unguarded, that throw was the generic-failure path (W7-01).
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    throw new AdminError("provisioning_unavailable", "supabase admin client unavailable");
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: staff.email,
    password: staff.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (isAuthEmailTaken(error)) throw new AdminError("auth_email_taken");
    // Never echo error.message: it is provider text and may carry the address.
    throw new AdminError("provisioning_unavailable", "auth user creation failed");
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
 * Sync a staff member's Supabase auth login email to a new address, via the
 * service-role admin API. This is the auth half of an email edit; the public.users
 * half lives in editStaff (apps/web/lib/admin/staff.ts), which calls this INSIDE
 * its RLS transaction so a failure here rolls back the paired public.users write
 * and both stores stay on the old email.
 *
 * `email_confirm: true`: an admin-initiated change is trusted, so the new address
 * is marked confirmed immediately — no confirmation round-trip that would strand
 * the staff member behind an email they may not control yet (placeholder → real).
 *
 * Throws on any auth failure (unlike generateSetPasswordLink, this MUST surface
 * so the caller can abort). A globally-taken auth email (Supabase auth emails are
 * unique platform-wide, not per-tenant) surfaces here as an error.
 */
export async function updateStaffAuthEmail(userId: string, email: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`updateStaffAuthEmail: auth email update failed: ${error.message}`);
  }
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

import "server-only";
import { withTenantContext, type DbTx } from "@osteojp/db";

// Tenant context for reminder background jobs.
//
// Jobs run OUTSIDE a request: there is no Supabase session, no cookie, no
// RequestContext. We therefore set the tenant claims explicitly per job and go
// through the SAME sanctioned seam request code uses (withTenantContext →
// `set local role authenticated` + request.jwt.claims). We never use
// supabase-js for data, never getDbAdmin (which would bypass RLS), and never
// read a cookie.
//
// Role: reminder dispatch only READS appointment/patient/tenant rows already
// scoped to the tenant by RLS. There is no dedicated "system" role slug, so we
// run as "admin" — a valid in-tenant role whose reads RLS already permits. The
// claim still keys RLS isolation on tenant_id, so cross-tenant access remains
// impossible regardless of the role chosen here.
export const REMINDER_JOB_ROLE = "admin" as const;

/**
 * Run `fn` inside a tenant-scoped, RLS-enforced transaction for a background
 * job. The tenantId comes from the job payload (which itself originated from a
 * tenant-scoped enqueue), never from ambient state.
 */
export function withReminderTenantContext<T>(
  tenantId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return withTenantContext(
    { tenant_id: tenantId, user_role: REMINDER_JOB_ROLE },
    fn,
  );
}

/**
 * A context with NO TENANT, for the one call that has to run before the tenant
 * is known: resolving a Twilio MessageSid to the tenant that owns its dispatch
 * row (0075's `reminder_dispatch_tenant`, SECURITY DEFINER).
 *
 * ==========================================================================
 * NO TENANT CLAIM IS THE POINT, NOT AN OMISSION
 * ==========================================================================
 * `public.jwt_tenant_id()` returns NULL without the claim, so EVERY
 * tenant-scoped policy in the system evaluates FALSE and this transaction can
 * read nothing at all through RLS. The only thing it can reach is a SECURITY
 * DEFINER function, which does its own privileged work and, in this case,
 * consults no tenant.
 *
 * That is stronger than passing a placeholder tenant, which would grant real
 * visibility into whichever tenant the placeholder named. The status callback
 * arrives unauthenticated from the public internet; the least it should be able
 * to see, before its signature has bought it anything, is nothing.
 */
export function withReminderResolverContext<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return withTenantContext({ user_role: REMINDER_JOB_ROLE } as never, fn);
}

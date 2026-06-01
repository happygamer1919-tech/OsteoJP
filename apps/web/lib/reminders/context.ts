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

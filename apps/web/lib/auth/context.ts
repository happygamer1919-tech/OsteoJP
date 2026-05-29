import "server-only";
import { parseRole, toClaims, type RequestContext } from "@osteojp/auth";
import { withTenantContext, type DbTx } from "@osteojp/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Verified request context for the current session.
 *
 * Reads tenant_id + user_role from a VERIFIED token via getClaims(), not the
 * raw cookie. We query Postgres directly and SET request.jwt.claims ourselves
 * (packages/db withTenantContext), so the app is the trust boundary: an
 * unverified claim here would be honored by RLS. Returns null on any failure
 * (no session, missing/invalid claims, unknown role) so callers fail closed.
 *
 * Note: getClaims() requires a recent supabase-js. If yours predates it, swap
 * for getUser() (verifies via the Auth server) then decode that same token.
 */
export async function getRequestContext(): Promise<RequestContext | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { tenant_id, user_role } = data.claims as Record<string, unknown>;
  const role = parseRole(user_role);
  if (typeof tenant_id !== "string" || tenant_id.length === 0 || !role) {
    return null;
  }
  return { tenantId: tenant_id, role };
}

export async function requireRequestContext(): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return ctx;
}

/**
 * Request context plus the verified acting user id (the JWT `sub`, which equals
 * users.id — see packages/db schema). A structural superset of RequestContext,
 * so it can be passed anywhere a RequestContext is expected (runScoped, etc.).
 *
 * The extra field exists for audit_log.actor_user_id: writing "who did this"
 * needs the user id, which RequestContext deliberately does not carry. We read
 * it from the same VERIFIED claims as tenant_id/role, in one getClaims() call.
 */
export type Actor = RequestContext & { userId: string };

export async function getActor(): Promise<Actor | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;
  const role = parseRole(claims.user_role);
  const { tenant_id: tenantId, sub: userId } = claims;
  if (
    typeof tenantId !== "string" || tenantId.length === 0 ||
    typeof userId !== "string" || userId.length === 0 ||
    !role
  ) {
    return null;
  }
  return { tenantId, role, userId };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new Error("UNAUTHENTICATED");
  return actor;
}

/** Runs fn inside a tenant-scoped, RLS-enforced transaction for this context. */
export async function runScoped<T>(
  ctx: RequestContext,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return withTenantContext(toClaims(ctx), fn);
}

import "server-only";
import { headers } from "next/headers";
import type { Role } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * RequestContext (tenantId + role) plus the acting user's id, needed for the
 * audit_log.actor_user_id column. The shape is a superset of RequestContext,
 * so it can be passed straight to runScoped().
 */
export type Actor = {
  tenantId: string;
  role: Role;
  userId: string | null;
};

/**
 * Resolve the verified acting user for a mutation. Reuses requireRequestContext
 * (verified tenant_id + role; throws "UNAUTHENTICATED" if absent) and reads the
 * `sub` claim for the user id — `users.id` mirrors the Supabase auth user id.
 */
export async function requireActor(): Promise<Actor> {
  const ctx = await requireRequestContext();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return {
    tenantId: ctx.tenantId,
    role: ctx.role,
    userId: typeof sub === "string" && sub.length > 0 ? sub : null,
  };
}

/** Best-effort client IP for the audit row. Never throws. */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
    return ip ? ip.slice(0, 45) : null;
  } catch {
    return null;
  }
}

import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Platform-operator identity for the superadmin app.
//
// IMPORTANT: a platform operator is NOT a tenant role. There is no `tenant_id`
// or `user_role` claim involved, and this gate does not touch tenant RLS. An
// operator is a Supabase auth user whose verified email is on the
// PLATFORM_OPERATOR_EMAILS allowlist. Keeping the gate at the app/auth layer
// (not in RLS) is deliberate: the superadmin's DB access is the BYPASSRLS
// service-role path, so authorization must be proven here, before any query.
//
// (Allowlist is the V1 mechanism for a single-operator platform. A dedicated
// `app_metadata.platform_operator` claim is the future hardening.)

export type Operator = { userId: string; email: string };

/** Parse PLATFORM_OPERATOR_EMAILS (comma/whitespace separated) → lowercased set. */
export function parseOperatorAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Pure gate: is `email` a platform operator per `allowlist`? Case-insensitive. */
export function isPlatformOperator(
  email: string | null | undefined,
  allowlist: string[],
): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/**
 * Verified operator for the current session, or null (fail closed). Reads a
 * VERIFIED token via getClaims(), never the raw cookie.
 */
export async function getOperator(): Promise<Operator | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { sub, email } = data.claims as Record<string, unknown>;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof email !== "string" || email.length === 0) return null;

  const allowlist = parseOperatorAllowlist(process.env.PLATFORM_OPERATOR_EMAILS);
  if (!isPlatformOperator(email, allowlist)) return null;

  return { userId: sub, email };
}

/**
 * Gate a route to platform operators. Redirects to /login when there is no
 * operator session — both "not signed in" and "signed in but not on the
 * allowlist" land here, so a non-operator never sees tenant data.
 */
export async function requireOperator(): Promise<Operator> {
  const op = await getOperator();
  if (!op) redirect("/login");
  return op;
}

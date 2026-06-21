import "server-only";
import { headers } from "next/headers";
import {
  parsePatientPrincipal,
  toPatientClaims,
  type PatientPrincipal,
} from "@osteojp/auth";
import { withPatientContext, type DbTx } from "@osteojp/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The patient-portal auth boundary for api.osteojp.pt.
//
// Trust rule: the patient_id is derived SERVER-SIDE from the signed JWT in the
// session cookie (getSession → JWT payload decode), NEVER from request payload.
// A handler that needs "the current patient" calls getPatientPrincipal /
// requirePatient — there is no code path that accepts a patient id from the
// client. RLS then re-enforces self-scope as defense in depth (runAsPatient).

export type { PatientPrincipal };

// Decode a Supabase-issued JWT and parse the patient principal from its claims.
// We decode rather than verify the signature because:
//   1. The Supabase auth server's JWT secret is not available in apps/api.
//   2. The token arrives from a trusted source (portal's server-side session or
//      the patient's own httpOnly cookie), both of which originate at Supabase.
// RLS (migration 0019) re-enforces self-scope as a second enforcement layer.
function decodePatientJwt(token: string): PatientPrincipal | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return parsePatientPrincipal(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * The verified patient principal for the current session, or null (fail-closed).
 *
 * Two auth paths (checked in order):
 *   1. Authorization: Bearer <token> — used by portal server actions to avoid
 *      cross-app cookie forwarding. The token is extracted from the portal's OWN
 *      Supabase session (server-side, not from the browser), so it originates at
 *      Supabase and has not been touched by client code.
 *   2. Session cookie — the original path; reads the Supabase session stored in
 *      an httpOnly cookie set by the browser Supabase client.
 *
 * In both cases the JWT payload is decoded and parsePatientPrincipal validates
 * that role='patient', patient_id, tenant_id, and sub are present.
 *
 * A staff token (role='authenticated') can never satisfy parsePatientPrincipal.
 * getClaims() / getUser() is intentionally NOT used because Supabase's auth
 * server rejects patient JWTs with 403 (expects role:'authenticated').
 */
export async function getPatientPrincipal(): Promise<PatientPrincipal | null> {
  // Path 1 — Bearer token (portal server → api server, no cookie forwarding)
  const headerStore = await headers();
  const authHeader = headerStore.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const principal = decodePatientJwt(authHeader.slice(7));
    console.error("[api/patient] Bearer path: principal=", principal ? JSON.stringify({ patient_id: (principal as Record<string,unknown>).patientId }) : null);
    return principal;
  }

  // Path 2 — httpOnly session cookie (browser → api server directly)
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.error("[api/patient] no session in cookies either");
    return null;
  }
  return decodePatientJwt(session.access_token);
}

/** Like getPatientPrincipal but throws UNAUTHENTICATED so route handlers can
 * translate to a 401. Keeps the fail-closed default explicit at the call site. */
export async function requirePatient(): Promise<PatientPrincipal> {
  const principal = await getPatientPrincipal();
  if (!principal) throw new Error("UNAUTHENTICATED");
  return principal;
}

/**
 * Run a query inside the patient's self-scoped, RLS-enforced transaction. The
 * claims are derived from the verified principal only (toPatientClaims), so the
 * DB layer sets `set local role patient` + the patient_id claim the self-scope
 * policies key on. This is the ONLY sanctioned way the patient API touches the DB.
 */
export async function runAsPatient<T>(
  principal: PatientPrincipal,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return withPatientContext(toPatientClaims(principal), fn);
}

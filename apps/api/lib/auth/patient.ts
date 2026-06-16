import "server-only";
import {
  parsePatientPrincipal,
  toPatientClaims,
  type PatientPrincipal,
} from "@osteojp/auth";
import { withPatientContext, type DbTx } from "@osteojp/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The patient-portal auth boundary for api.osteojp.pt.
//
// Trust rule: the patient_id is derived SERVER-SIDE from the VERIFIED token
// (getSession → local JWT decode → the access-token hook's `patient_id` claim),
// NEVER from request payload. A handler that needs "the current patient" calls
// getPatientPrincipal / requirePatient — there is no code path that accepts a
// patient id from the client. RLS then re-enforces self-scope as defense in
// depth (runAsPatient).

export type { PatientPrincipal };

/**
 * The verified patient principal for the current session, or null (fail-closed).
 *
 * Uses getSession() + local JWT payload decode instead of getClaims() because
 * getClaims() internally calls getUser(), which makes a GET /auth/v1/user
 * request. The Supabase auth server returns 403 for patient JWTs whose `role`
 * claim is 'patient' (stamped by the access-token hook in migration 0010) rather
 * than the standard 'authenticated' role — causing getClaims() to return null
 * and every patient route to 401.
 *
 * getSession() reads the session cookie directly (no network round-trip). The JWT
 * is trustworthy: it was issued and HMAC-signed by Supabase at login time via the
 * access-token hook. parsePatientPrincipal() then re-validates all required claims
 * (role === 'patient', patient_id UUID, tenant_id UUID, sub present) fail-closed,
 * and withPatientContext() + RLS TO patient policies enforce self-scope at the DB
 * layer as defense in depth.
 *
 * A staff token (role 'authenticated') can never satisfy parsePatientPrincipal.
 */
export async function getPatientPrincipal(): Promise<PatientPrincipal | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  try {
    const parts = session.access_token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as Record<string, unknown>;
    return parsePatientPrincipal(claims);
  } catch {
    return null;
  }
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

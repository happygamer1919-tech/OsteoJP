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
// Trust rule: the patient_id is derived SERVER-SIDE from the signed JWT in the
// session cookie (getSession → JWT payload decode), NEVER from request payload.
// A handler that needs "the current patient" calls getPatientPrincipal /
// requirePatient — there is no code path that accepts a patient id from the
// client. RLS then re-enforces self-scope as defense in depth (runAsPatient).

export type { PatientPrincipal };

/**
 * The verified patient principal for the current session, or null (fail-closed).
 *
 * Reads claims from the Supabase-signed JWT in the session cookie WITHOUT a
 * network round-trip. getClaims() proxies to /auth/v1/user, which rejects the
 * patient JWT with 403 because Supabase's auth server expects role:'authenticated'
 * but the access-token hook (migration 0010) stamps role:'patient'. getSession()
 * reads the cookie directly (no network call) and the payload is trustworthy
 * because it is signed by Supabase's JWT secret and stored in an httpOnly cookie.
 * RLS self-scope (migration 0010/0012) is a second enforcement layer.
 *
 * A staff token can never satisfy parsePatientPrincipal (role check fails).
 */
export async function getPatientPrincipal(): Promise<PatientPrincipal | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const parts = session.access_token.split(".");
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

import "server-only";
import { headers } from "next/headers";
import {
  parsePatientPrincipal,
  toPatientClaims,
  type PatientPrincipal,
} from "@osteojp/auth";
import { withPatientContext, type DbTx } from "@osteojp/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifySupabaseJwt } from "@/lib/auth/jwt";
import { readSessionToken, verifyPatientSession } from "@/lib/auth/patient-session";

// The patient-portal auth boundary for api.osteojp.pt.
//
// Trust rule: the patient_id is derived SERVER-SIDE from a CRYPTOGRAPHICALLY
// VERIFIED JWT, NEVER from request payload. A handler that needs "the current
// patient" calls getPatientPrincipal / requirePatient — there is no code path
// that accepts a patient id from the client.
//
// This boundary is load-bearing and alone. RLS does NOT back it up: the patient
// self-scope policies key on jwt_patient_id(), which reads request.jwt.claims,
// which runAsPatient sets from the principal produced here. A principal built
// from an unverified token would be handed to the policy as its own input, and
// the policy would compare the forged id to itself and pass. RLS defends
// against a handler passing the WRONG id; only signature verification defends
// against a caller CHOOSING one.

export type { PatientPrincipal };

// Verify a Supabase-issued JWT, then parse the patient principal from the
// claims it actually carried. Verification covers signature, exp (required),
// nbf, issuer, and audience — see lib/auth/jwt.ts. Fail-closed at every step.
async function verifyPatientJwt(
  token: string,
): Promise<PatientPrincipal | null> {
  const claims = await verifySupabaseJwt(token);
  if (!claims) return null;
  return parsePatientPrincipal(claims as Record<string, unknown>);
}

/**
 * The verified patient principal for the current session, or null (fail-closed).
 *
 * THREE auth paths (checked in order):
 *   0. Our own signed session cookie (W13-03a). The only credential an
 *      OTP-authenticated patient can hold, because they have no Supabase auth
 *      user by design. Signed and verified by this app with a secret only this
 *      app has; see lib/auth/patient-session.ts.
 *   1. Authorization: Bearer <token> — used by portal server actions to avoid
 *      cross-app cookie forwarding. The token is extracted from the portal's OWN
 *      Supabase session (server-side, not from the browser), so it originates at
 *      Supabase and has not been touched by client code.
 *   2. Session cookie — the original path; reads the Supabase session stored in
 *      an httpOnly cookie set by the browser Supabase client.
 *
 * In both cases the JWT is verified against the project's signing key and
 * parsePatientPrincipal then validates that role='patient', patient_id,
 * tenant_id, and sub are present.
 *
 * Neither path is trusted on provenance. Path 1 in particular reads a header an
 * arbitrary client can set, so "it came from the portal" is not an assumption
 * this function is allowed to make — the signature is what establishes that.
 *
 * A staff token (role='authenticated') can never satisfy parsePatientPrincipal.
 * getClaims() / getUser() is intentionally NOT used because Supabase's auth
 * server rejects patient JWTs with 403 (expects role:'authenticated').
 */
export async function getPatientPrincipal(): Promise<PatientPrincipal | null> {
  const headerStore = await headers();

  // Path 0 (W13-03a, owner ruling Option B) — OUR OWN signed session cookie.
  //
  // Tried FIRST because it is the portal's own credential and the only one an
  // OTP-authenticated patient can ever have: they have no Supabase auth user, by
  // design, since WF-07 refuses any patient row that is already linked to one.
  //
  // AN INVALID COOKIE FALLS THROUGH, it does not short-circuit. A forged or
  // expired session must not authenticate anything, and it must equally not lock
  // out a caller holding a legitimate Supabase token — so a bad cookie is simply
  // not a credential, and the remaining paths get their turn. It can never
  // UPGRADE a request: verifyPatientSession returns a principal or null, never a
  // partially-trusted anything.
  const cookieHeader = headerStore.get("cookie");
  if (cookieHeader) {
    const token = readSessionToken(
      new Request("https://api.invalid/", { headers: { cookie: cookieHeader } }),
    );
    if (token) {
      const principal = await verifyPatientSession(token);
      if (principal) return principal;
    }
  }

  // Path 1 — Bearer token (portal server → api server, no cookie forwarding)
  const authHeader = headerStore.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyPatientJwt(authHeader.slice(7));
  }

  // Path 2 — httpOnly session cookie (browser → api server directly)
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return verifyPatientJwt(session.access_token);
}

/** Like getPatientPrincipal but throws UNAUTHENTICATED so route handlers can
 * translate to a 401. Keeps the fail-closed default explicit at the call site. */
export async function requirePatient(): Promise<PatientPrincipal> {
  const principal = await getPatientPrincipal();
  if (!principal) throw new Error("UNAUTHENTICATED");
  return principal;
}

/**
 * Run a query inside the patient's self-scoped transaction. The claims are
 * derived from the verified principal only (toPatientClaims), so the DB layer
 * sets `set local role patient` + the patient_id claim the self-scope policies
 * key on. This is the ONLY sanctioned way the patient API touches the DB.
 *
 * Note what this does and does not buy: because the policies key on the claim
 * set here, RLS confines a query to WHICHEVER patient the principal names. It
 * turns a handler bug into a no-op, and it is worth having for that. It is not
 * a second opinion on WHO the caller is — that question is settled upstream, by
 * signature verification, and nowhere else.
 */
export async function runAsPatient<T>(
  principal: PatientPrincipal,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return withPatientContext(toPatientClaims(principal), fn);
}

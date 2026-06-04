// Patient principal — the patient-portal identity, DELIBERATELY SEPARATE from
// the staff permission matrix (permissions.ts).
//
// A patient is NOT a Role and has NO capabilities in the staff matrix. There is
// no overlap by design: staff are authorized by {tenant_id, user_role} and the
// PERMISSIONS table; a patient is authorized purely by being themselves —
// self-scope on their own patient_id. Keeping this in its own module (not a new
// member of `Role`) is what stops the two trust domains from leaking into each
// other.
//
// Pure module: no framework/session/DB. The app layer reads a VERIFIED token and
// feeds the claims here; these functions never trust request payload.

/** RESERVED `role` claim value the access-token hook stamps for patients
 * (migration 0010). PostgREST SET ROLEs to it; our Drizzle layer matches it. */
export const PATIENT_ROLE_CLAIM = "patient" as const;

/**
 * The resolved patient identity for a request. `patientId` is the self-scope key
 * (RLS confines every read to it). `userId` is the Supabase auth user id (the
 * verified `sub`) — useful for audit/logging, never an RLS key.
 */
export type PatientPrincipal = {
  tenantId: string;
  patientId: string;
  userId: string;
};

// uuid v4-ish shape check — claims are server-issued, but validating keeps a
// malformed token from ever reaching a query as a bogus self-scope key.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse + validate a patient principal from verified JWT claims. Returns null
 * (fail-closed) unless ALL hold:
 *   - role claim === 'patient'        (it is a patient token, not a staff one)
 *   - patient_id is a uuid            (the self-scope key)
 *   - tenant_id is a uuid             (OsteoJP's tenant)
 *   - sub is present                  (the auth user / audit actor)
 *
 * The role check is what guarantees a staff token (role 'authenticated', carrying
 * user_role) can NEVER be mistaken for a patient — and vice-versa.
 */
export function parsePatientPrincipal(
  claims: Record<string, unknown> | null | undefined,
): PatientPrincipal | null {
  if (!claims) return null;

  const { role, patient_id, tenant_id, sub } = claims as Record<string, unknown>;

  if (role !== PATIENT_ROLE_CLAIM) return null;
  if (typeof patient_id !== "string" || !UUID_RE.test(patient_id)) return null;
  if (typeof tenant_id !== "string" || !UUID_RE.test(tenant_id)) return null;
  if (typeof sub !== "string" || sub.length === 0) return null;

  return { tenantId: tenant_id, patientId: patient_id, userId: sub };
}

/** Type guard: are these claims a valid patient principal? */
export function isPatientPrincipal(
  claims: Record<string, unknown> | null | undefined,
): boolean {
  return parsePatientPrincipal(claims) !== null;
}

/**
 * Map a PatientPrincipal to the claim shape packages/db withPatientContext / the
 * RLS helpers consume. Same role as toClaims() for staff — one canonical mapping
 * so the app and DB layers can't drift. patient_id here comes ONLY from the
 * verified principal.
 */
export function toPatientClaims(p: PatientPrincipal): {
  tenant_id: string;
  patient_id: string;
} {
  return { tenant_id: p.tenantId, patient_id: p.patientId };
}

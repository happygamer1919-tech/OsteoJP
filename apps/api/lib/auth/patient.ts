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
// (getClaims → the access-token hook's `patient_id` claim), NEVER from request
// payload. A handler that needs "the current patient" calls getPatientPrincipal
// / requirePatient — there is no code path that accepts a patient id from the
// client. RLS then re-enforces self-scope as defense in depth (runAsPatient).

export type { PatientPrincipal };

/**
 * The verified patient principal for the current session, or null (fail-closed).
 * Reads a VERIFIED token via getClaims() — never the raw cookie — and validates
 * it is genuinely a patient token (role claim 'patient' + patient_id + tenant_id
 * + sub) via @osteojp/auth. A staff token can never satisfy this.
 */
export async function getPatientPrincipal(): Promise<PatientPrincipal | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return parsePatientPrincipal(data.claims as Record<string, unknown>);
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

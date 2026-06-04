import "server-only";
import { and, eq } from "drizzle-orm";
import { patients } from "@osteojp/db";
import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";

// Patient-portal PROFILE read. Self-scope only: the patient reads their OWN row
// and nothing else. Two independent layers enforce this:
//   1. RLS — runAsPatient drops to the `patient` role with the verified
//      {tenant_id, patient_id} claims; the patients_patient_selfscope policy
//      confines the result to id == jwt_patient_id() AND tenant match.
//   2. An explicit server-side guard here — the query filters on
//      principal.patientId/tenantId, and we re-verify the returned row's id
//      before mapping. patient_id comes ONLY from the verified principal, never
//      from request payload (there is no field that accepts one).
//
// Fields are a PORTAL whitelist: name, contacts, location. Deliberately EXCLUDED:
//   - nif  → fiscal data (Phase 4 only; never exposed to the portal this wave);
//   - notes, auth/merge/audit columns → internal/clinical, not the patient's view.

/** The patient's own portal-appropriate profile. No fiscal/internal fields. */
export type PatientProfile = {
  id: string;
  fullName: string;
  /** Contacts. */
  email: string | null;
  phone: string | null;
  /** Location — the patient's own address/locality (NOT a clinic location). */
  address: string | null;
  postalCode: string | null;
  city: string | null;
};

/** Row shape the query selects — already the whitelist, so nothing extra loads. */
type ProfileRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
};

/** Pure projection of a selected row to the portal DTO. Exported for tests. */
export function toProfileDTO(row: ProfileRow): PatientProfile {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    postalCode: row.postalCode,
    city: row.city,
  };
}

/**
 * The authenticated patient's own profile, or null if it cannot be resolved.
 * Reads strictly self-scoped (RLS + explicit principal filter + post-fetch id
 * re-check). Never accepts a patient id from anywhere but the verified principal.
 */
export async function getOwnProfile(
  principal: PatientPrincipal,
): Promise<PatientProfile | null> {
  return runAsPatient(principal, async (tx) => {
    const rows = await tx
      .select({
        id: patients.id,
        fullName: patients.fullName,
        email: patients.email,
        phone: patients.phone,
        address: patients.address,
        postalCode: patients.postalCode,
        city: patients.city,
      })
      .from(patients)
      .where(
        // Explicit self-scope guard, on top of RLS: own patient_id + tenant.
        and(
          eq(patients.id, principal.patientId),
          eq(patients.tenantId, principal.tenantId),
        ),
      )
      .limit(1);

    const row = rows[0];
    // Defense in depth: even if a row came back, never return one that is not
    // exactly the principal's own (an RLS regression must still fail closed).
    if (!row || row.id !== principal.patientId) return null;
    return toProfileDTO(row);
  });
}

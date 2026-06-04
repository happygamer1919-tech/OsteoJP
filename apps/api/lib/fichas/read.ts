import "server-only";
import { desc, inArray } from "drizzle-orm";
import { clinicalRecords } from "@osteojp/db";
import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";
import { redactRecordForPatient, type PatientFicha } from "./redaction";

// Read layer for the patient fichas endpoint. Two guards stack:
//   1. SELF-SCOPE — every query runs through runAsPatient (set local role
//      patient + the verified patient_id claim), so RLS (migration 0010)
//      confines rows to THIS patient. We never filter patient_id by hand and
//      never use getDbAdmin.
//   2. FINALIZED-ONLY — a patient sees only locked/signed records, never a
//      therapist's in-progress draft (or an AI/patient submission still in
//      review). This is the draft-gating Wave A deferred to "the Wave B endpoint
//      layer".
//   3. REDACTION — every row leaves through redactRecordForPatient (the single
//      chokepoint), so therapist-private fields are never serialized.

/** record_status values a patient may read: the finalized ones. */
export const PATIENT_VISIBLE_STATUSES = ["locked", "signed"] as const;

/**
 * List the patient's OWN finalized fichas, redacted. patientId is implicit in
 * the principal/RLS — there is no parameter to pass another patient's id.
 */
export async function listOwnFichas(principal: PatientPrincipal): Promise<PatientFicha[]> {
  return runAsPatient(principal, async (tx) => {
    const rows = await tx
      .select({
        id: clinicalRecords.id,
        status: clinicalRecords.status,
        version: clinicalRecords.version,
        episodeId: clinicalRecords.episodeId,
        createdAt: clinicalRecords.createdAt,
        signedAt: clinicalRecords.signedAt,
        data: clinicalRecords.data,
      })
      .from(clinicalRecords)
      .where(inArray(clinicalRecords.status, [...PATIENT_VISIBLE_STATUSES]))
      .orderBy(desc(clinicalRecords.createdAt));

    // Redaction is the single chokepoint: `data` is fetched but stripped to the
    // (currently empty) patient allow-list, so private fields never escape.
    return rows.map(redactRecordForPatient);
  });
}

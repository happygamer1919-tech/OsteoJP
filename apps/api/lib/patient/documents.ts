import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { attachments } from "@osteojp/db";
import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";

// Patient-portal DOCUMENTS reads (documents & declarations). Self-scope only.
//
// "Documents and declarations" are the patient-scoped rows in `attachments`
// (the only patient-document store this wave; there is no separate declarations
// table). Self-scope is enforced on two layers exactly as in profile.ts:
//   1. RLS — attachments_patient_selfscope confines rows to patient_id ==
//      jwt_patient_id() AND tenant match, under the `patient` role.
//   2. Explicit server-side guard — every query filters on
//      principal.patientId/tenantId, and results are re-checked against the
//      principal before they leave this module. patient_id is ALWAYS the verified
//      principal's, never request payload.
//
// The list DTO is a whitelist: id + display metadata. Deliberately EXCLUDED:
//   - storagePath → internal Storage location (never to the client; the download
//     endpoint signs it server-side);
//   - clinicalRecordId, uploadedBy, tenantId, patientId → internal linkage.
// No fiscal data is present in attachments.

/** A patient-visible document (or declaration) — display metadata only. */
export type PatientDocument = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

type DocumentRow = {
  id: string;
  patientId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
};

/** Pure projection to the portal DTO — drops every internal field. For tests. */
export function toDocumentDTO(row: DocumentRow): PatientDocument {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Internal location of an own document, resolved for the download endpoint. */
export type OwnDocumentLocation = { storagePath: string; fileName: string };

/**
 * List the authenticated patient's own documents, newest first. Strictly
 * self-scoped (RLS + explicit principal filter + post-fetch ownership re-check).
 */
export async function listOwnDocuments(
  principal: PatientPrincipal,
): Promise<PatientDocument[]> {
  return runAsPatient(principal, async (tx) => {
    const rows = await tx
      .select({
        id: attachments.id,
        patientId: attachments.patientId,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.patientId, principal.patientId),
          eq(attachments.tenantId, principal.tenantId),
        ),
      )
      .orderBy(desc(attachments.createdAt));

    // Defense in depth: drop anything not owned by the principal before it
    // leaves the module, even if RLS or the filter regressed.
    return rows
      .filter((r) => r.patientId === principal.patientId)
      .map(toDocumentDTO);
  });
}

/**
 * Resolve the Storage location of ONE of the patient's own documents, or null if
 * it is not theirs / does not exist. The id is matched under self-scope; the
 * returned storagePath is for server-side signing only and never exposed.
 */
export async function getOwnDocumentLocation(
  principal: PatientPrincipal,
  documentId: string,
): Promise<OwnDocumentLocation | null> {
  return runAsPatient(principal, async (tx) => {
    const rows = await tx
      .select({
        id: attachments.id,
        patientId: attachments.patientId,
        tenantId: attachments.tenantId,
        storagePath: attachments.storagePath,
        fileName: attachments.fileName,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.id, documentId),
          eq(attachments.patientId, principal.patientId),
          eq(attachments.tenantId, principal.tenantId),
        ),
      )
      .limit(1);

    const row = rows[0];
    // Re-verify ownership explicitly before handing back a path to sign.
    if (
      !row ||
      row.patientId !== principal.patientId ||
      row.tenantId !== principal.tenantId
    ) {
      return null;
    }
    return { storagePath: row.storagePath, fileName: row.fileName };
  });
}

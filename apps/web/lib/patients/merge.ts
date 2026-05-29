// Patient-merge mechanics: pre-flight guard + dependent-row repointing.
// Kept separate from the server action so the table coverage is auditable and
// testable. Callers run these inside the same scoped tx as the soft-delete.

import { and, eq, inArray } from "drizzle-orm";
import {
  appointments,
  attachments,
  clinicalEpisodes,
  clinicalRecords,
  invoices,
} from "@osteojp/db";
import type { DbTx } from "@osteojp/db";
import { PatientMergeBlockedError } from "./errors";

// clinical_records in these states are immutable (BEFORE UPDATE trigger), so
// their patient_id cannot be reassigned from the app layer.
export const FINALIZED_RECORD_STATUSES = ["locked", "signed"] as const;

export type MergeRepointCounts = {
  appointments: number;
  clinicalEpisodes: number;
  clinicalRecords: number;
  invoices: number;
  attachments: number;
};

/**
 * Aborts the merge if the loser owns any finalized (locked/signed) clinical
 * record. Run BEFORE any repoint so the whole transaction rolls back cleanly
 * and never half-merges. See PatientMergeBlockedError for the why.
 */
export async function assertNoFinalizedRecords(
  tx: DbTx,
  loserId: string,
): Promise<void> {
  const finalized = await tx
    .select({ id: clinicalRecords.id })
    .from(clinicalRecords)
    .where(
      and(
        eq(clinicalRecords.patientId, loserId),
        inArray(clinicalRecords.status, [...FINALIZED_RECORD_STATUSES]),
      ),
    );
  if (finalized.length > 0) {
    throw new PatientMergeBlockedError(finalized.length);
  }
}

/**
 * Repoints every dependent row from `loserId` to `survivorId`. Returns the
 * per-table counts (for the audit metadata — counts only, never PII).
 */
export async function repointDependents(
  tx: DbTx,
  loserId: string,
  survivorId: string,
): Promise<MergeRepointCounts> {
  const appts = await tx
    .update(appointments)
    .set({ patientId: survivorId })
    .where(eq(appointments.patientId, loserId))
    .returning({ id: appointments.id });

  const episodes = await tx
    .update(clinicalEpisodes)
    .set({ patientId: survivorId })
    .where(eq(clinicalEpisodes.patientId, loserId))
    .returning({ id: clinicalEpisodes.id });

  // Safe: assertNoFinalizedRecords ran first, so only draft records remain and
  // the immutability trigger will not fire.
  const records = await tx
    .update(clinicalRecords)
    .set({ patientId: survivorId })
    .where(eq(clinicalRecords.patientId, loserId))
    .returning({ id: clinicalRecords.id });

  const invoiceRows = await tx
    .update(invoices)
    .set({ patientId: survivorId })
    .where(eq(invoices.patientId, loserId))
    .returning({ id: invoices.id });

  const attachmentRows = await tx
    .update(attachments)
    .set({ patientId: survivorId })
    .where(eq(attachments.patientId, loserId))
    .returning({ id: attachments.id });

  return {
    appointments: appts.length,
    clinicalEpisodes: episodes.length,
    clinicalRecords: records.length,
    invoices: invoiceRows.length,
    attachments: attachmentRows.length,
  };
}

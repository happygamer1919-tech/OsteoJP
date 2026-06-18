// packages/db/src/migration/batch-validate.ts
//
// Batch-level validation for MigrationRecord arrays. Per-record shape
// validation lives in validate.ts; this layer adds cross-record edge cases:
// duplicate source ids within a batch and orphan appointment references.
//
// detectBatchIssues is pure (no DB) — it flags:
//   1. Duplicate (sourceId, entityType) pairs within the batch.
//   2. Missing/invalid required fields (delegates to validateMigrationRecord).
//   3. Appointments whose patientSourceId is not in the same batch.
//      The ledger check in applyBatchValidation clears false positives where
//      the patient was imported in a prior batch.
//
// applyBatchValidation is the DB layer: runs the pure checks, resolves
// candidate orphans against the staging ledger, then marks each staged row
// validated or failed — calling staging.ts primitives, never rewriting the
// status machine logic.

import { and, eq, inArray } from "drizzle-orm";

import type { DbTx } from "../client";
import { migrationStagingRows } from "../schema";
import { markFailed, markValidated, type StagedRow } from "./staging";
import { validateMigrationRecord } from "./validate";
import type { MigrationEntityType, MigrationErrorDetail, MigrationRecord } from "./types";

/** One validation failure for a record in the batch. */
export type BatchValidationIssue = {
  sourceId: string;
  entityType: MigrationEntityType;
  detail: MigrationErrorDetail;
};

/**
 * Pure batch-level validation — no DB required.
 *
 * Returns a map keyed by `${entityType}:${sourceId}`. The key is stable and
 * matches what applyBatchValidation uses to look up staged rows.
 *
 * Issues detected:
 *   - Duplicate (sourceId, entityType) within the batch — the second occurrence
 *     is failed; the first is still validated on its own merits.
 *   - Missing / invalid required fields per entity type.
 *   - Appointments whose patientSourceId is absent from the same batch (the DB
 *     layer clears these for patients already imported in prior batches).
 */
export function detectBatchIssues(records: MigrationRecord[]): Map<string, BatchValidationIssue> {
  const issues = new Map<string, BatchValidationIssue>();
  const seen = new Set<string>(); // `${entityType}:${sourceId}`

  const batchPatientIds = new Set<string>();
  for (const rec of records) {
    if (rec.entityType === "patient") batchPatientIds.add(rec.data.sourceId);
  }

  for (const rec of records) {
    const key = `${rec.entityType}:${rec.data.sourceId}`;

    // 1. Duplicate detection
    if (seen.has(key)) {
      issues.set(key, {
        sourceId: rec.data.sourceId,
        entityType: rec.entityType,
        detail: {
          code: "validation_failed",
          message: "duplicate source_id + entity_type within batch",
          fields: ["sourceId"],
        },
      });
      continue;
    }
    seen.add(key);

    // 2. Per-record shape validation
    const shapeErr = validateMigrationRecord(rec);
    if (shapeErr) {
      issues.set(key, { sourceId: rec.data.sourceId, entityType: rec.entityType, detail: shapeErr });
      continue;
    }

    // 3. In-batch orphan check for appointments
    if (rec.entityType === "appointment" && !batchPatientIds.has(rec.data.patientSourceId)) {
      issues.set(key, {
        sourceId: rec.data.sourceId,
        entityType: rec.entityType,
        detail: {
          code: "unresolved_reference",
          message: "appointment references a patient not present in this batch",
          fields: ["patientSourceId"],
        },
      });
    }
  }

  return issues;
}

export type BatchValidationResult = { validated: number; failed: number };

/**
 * Validate a staged batch: runs detectBatchIssues, resolves candidate orphan
 * appointments against the staging ledger, then writes validated / failed on
 * each staged row.
 *
 * Only rows present in `stagedRows` are acted on. Records in `records` with no
 * corresponding staged row are silently skipped — staging and validation are
 * separate steps. Duplicate records in the `records` array are deduplicated
 * by key so each staged row is touched exactly once.
 */
export async function applyBatchValidation(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  records: MigrationRecord[],
  stagedRows: StagedRow[],
): Promise<BatchValidationResult> {
  const stagedByKey = new Map<string, StagedRow>(
    stagedRows.map((r) => [`${r.entityType}:${r.sourceId}`, r]),
  );

  const issues = detectBatchIssues(records);

  // Resolve candidate orphan appointments: if the patient was imported in a
  // prior batch it is already in the staging ledger as 'imported'. Look those
  // up and clear the false-positive orphan issue for each one found.
  const orphanAppointments = records.filter(
    (rec): rec is Extract<MigrationRecord, { entityType: "appointment" }> => {
      if (rec.entityType !== "appointment") return false;
      const issue = issues.get(`appointment:${rec.data.sourceId}`);
      return (
        issue?.detail.code === "unresolved_reference" &&
        (issue.detail.fields ?? []).includes("patientSourceId")
      );
    },
  );

  if (orphanAppointments.length > 0) {
    const patientSourceIds = [...new Set(orphanAppointments.map((r) => r.data.patientSourceId))];
    const imported = await tx
      .select({ sourceId: migrationStagingRows.sourceId })
      .from(migrationStagingRows)
      .where(
        and(
          eq(migrationStagingRows.tenantId, tenantId),
          eq(migrationStagingRows.sourceSystem, sourceSystem),
          eq(migrationStagingRows.entityType, "patient"),
          eq(migrationStagingRows.status, "imported"),
          inArray(migrationStagingRows.sourceId, patientSourceIds),
        ),
      );
    const importedIds = new Set(imported.map((r) => r.sourceId));
    for (const rec of orphanAppointments) {
      if (importedIds.has(rec.data.patientSourceId)) {
        issues.delete(`appointment:${rec.data.sourceId}`);
      }
    }
  }

  let validated = 0;
  let failed = 0;
  const processed = new Set<string>();

  for (const rec of records) {
    const key = `${rec.entityType}:${rec.data.sourceId}`;
    if (processed.has(key)) continue;
    processed.add(key);

    const staged = stagedByKey.get(key);
    if (!staged) continue;

    const issue = issues.get(key);
    if (issue) {
      await markFailed(tx, tenantId, staged.id, issue.detail);
      failed++;
    } else {
      await markValidated(tx, tenantId, staged.id);
      validated++;
    }
  }

  return { validated, failed };
}

// packages/db/src/migration — source-agnostic data migration pipeline
// foundation (Phase 5). See types.ts for the intermediate shapes, staging.ts
// for the staging table + idempotency ledger, upsert.ts for the importer, and
// source.ts for the (deliberately unimplemented) Fisiozero adapter seam.

export type {
  MigrationAppointment,
  MigrationAttachment,
  MigrationClinicalEpisode,
  MigrationClinicalRecord,
  MigrationEntityType,
  MigrationErrorDetail,
  MigrationPatient,
  MigrationRecord,
  MigrationResolvers,
  MigrationStagingStatus,
} from "./types";

export type { FisiozeroSource, SourceRecord } from "./source";

export {
  batchStatusCounts,
  markFailed,
  markImported,
  markValidated,
  MigrationStagingError,
  resolveImportedIds,
  stageRows,
  type StagedRow,
  type StageRowInput,
} from "./staging";

export { validateMigrationRecord } from "./validate";

export {
  generateReconciliationReport,
  reportToJson,
  reportToMarkdown,
  type ReconciliationFailedRow,
  type ReconciliationReport,
} from "./reconciliation";

export {
  applyBatchValidation,
  detectBatchIssues,
  type BatchValidationIssue,
  type BatchValidationResult,
} from "./batch-validate";

export {
  importRecords,
  mergeImportedPatient,
  type ImportAction,
  type ImportSummary,
} from "./upsert";

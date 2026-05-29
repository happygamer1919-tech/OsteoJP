// Domain errors for patient operations. Names are stable discriminators so
// route/action error handlers can branch without relying on instanceof across
// bundling boundaries. Messages never contain PII.

export class PatientNotFoundError extends Error {
  override readonly name = "PatientNotFoundError";
  constructor() {
    super("Patient not found");
  }
}

export class InvalidMergeError extends Error {
  override readonly name = "InvalidMergeError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Raised when a merge would have to repoint a `locked`/`signed` clinical record
 * from the loser to the survivor. The clinical_records immutability trigger
 * (packages/db/migrations/0001_rls.sql) blocks ANY update to finalized records
 * — even a patient_id reassignment, even for service_role — so the app layer
 * cannot perform this merge. Lifting this requires a DB-level merge function
 * (proposed in the PR for sign-off), not an app change.
 */
export class PatientMergeBlockedError extends Error {
  override readonly name = "PatientMergeBlockedError";
  readonly finalizedRecordCount: number;
  constructor(finalizedRecordCount: number) {
    super(
      `Cannot merge: the duplicate has ${finalizedRecordCount} finalized ` +
        `clinical record(s) that are immutable and cannot be reassigned from ` +
        `the application layer.`,
    );
    this.finalizedRecordCount = finalizedRecordCount;
  }
}

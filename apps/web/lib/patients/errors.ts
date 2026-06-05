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

// NOTE: merges with finalized (locked/signed) clinical records are no longer
// blocked at the app layer. merge_patients() (packages/db/migrations/0005)
// re-parents them through the re-parent-aware immutability trigger, which still
// forbids any change to clinical content. The former PatientMergeBlockedError
// is gone — there is one merge path now.

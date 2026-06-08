import "server-only";

export type ClinicalErrorCode =
  | "not_found"
  | "finalized" // record is locked/signed and immutable
  | "not_printable" // record is not finalized (draft / under AI review) — cannot print
  | "validation" // required fields missing
  | "invalid"
  // --- review / finalize write path ---
  | "not_reviewable" // item is not an AI/patient review-queue item
  | "not_under_review" // must be claimed (in_review) before edit/finalize
  | "already_reviewed" // review decision is terminal (approved/rejected)
  | "not_narrative_field"; // edit touched a coded/safety field (narrative-only)

export class ClinicalError extends Error {
  override readonly name = "ClinicalError";
  readonly code: ClinicalErrorCode;
  /** Per-field errors, present when code === "validation". */
  readonly fieldErrors?: Record<string, string>;
  constructor(code: ClinicalErrorCode, fieldErrors?: Record<string, string>) {
    super(code);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isClinicalError(e: unknown): e is ClinicalError {
  return e instanceof Error && e.name === "ClinicalError";
}

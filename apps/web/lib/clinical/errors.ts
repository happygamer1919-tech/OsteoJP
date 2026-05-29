import "server-only";

export type ClinicalErrorCode =
  | "not_found"
  | "finalized" // record is locked/signed and immutable
  | "validation" // required fields missing
  | "invalid";

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

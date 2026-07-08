import "server-only";

/**
 * Domain errors for admin actions. Each carries a stable `code` so server
 * actions can map them to an i18n message without relying on `instanceof`
 * across bundling boundaries.
 */
export type AdminErrorCode =
  | "last_owner" // would remove/demote/deactivate the last active owner
  | "owner_tier" // non-owner tried to assign or change the owner role
  | "email_taken" // edited email collides with another user in the tenant
  | "already_invited" // invite target email already belongs to a staff member in the tenant
  | "has_appointments" // location delete refused: appointments still reference it (W3-07)
  | "has_references" // service delete refused: appointments/mappings/prices/analytics reference it (W4-15)
  | "password" // wrong delete password (W4-01 staff delete)
  | "has_activity" // staff delete refused: therapist has appointments/records/audit (W4-01)
  | "has_clinical_records" // patient hard-delete refused: clinical records reference the patient (W5-08)
  | "not_found"
  | "invalid";

export class AdminError extends Error {
  override readonly name = "AdminError";
  readonly code: AdminErrorCode;
  constructor(code: AdminErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function isAdminError(e: unknown): e is AdminError {
  return e instanceof Error && e.name === "AdminError";
}

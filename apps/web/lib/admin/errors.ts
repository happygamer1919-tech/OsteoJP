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
  | "auth_email_taken" // invite target email is already a Supabase auth login (auth emails are unique platform-wide, not per-tenant)
  | "provisioning_unavailable" // the privileged auth path could not create the user (admin-client env absent, role missing, auth API failure)
  | "has_appointments" // location delete refused: appointments still reference it (W3-07)
  | "has_references" // service delete refused: appointments/mappings/prices/analytics reference it (W4-15)
  // PACK-04: service ARCHIVE refused because a pacote is bound to it. Distinct
  // from `has_references`, which is about DELETING: a service carrying a pacote
  // was already delete-blocked, so the only door left open was the archive, and
  // an admin told "cannot delete" while the archive silently succeeded would be
  // told the opposite of what happened. The message names the pacotes.
  | "has_packs"
  // PACK-07: a pacote's SESSION COUNT change refused because patients already
  // hold instances of it. Distinct from `has_references`, which is about
  // DELETING the pacote, and from `has_packs`, which is about a SERVICE. The
  // three refusals point at three different repairs and an admin told the wrong
  // one goes and does the wrong thing.
  | "has_instances"
  | "password" // wrong delete password (W4-01 staff delete)
  | "has_activity" // staff delete refused: therapist has appointments/records/audit (W4-01)
  | "has_clinical_records" // patient hard-delete refused: clinical records reference the patient (W5-08)
  | "not_found"
  // ITEM 3: the actor may not act on THIS target, and saying so discloses
  // nothing. Deliberately distinct from `not_found`, which exists to keep a
  // located receptionist from learning another clinic's roster. A therapist
  // already knows their colleagues exist, so concealment would buy nothing and
  // cost them a comprehensible message.
  | "forbidden"
  // P0 2026-09-08: the weekly editor refused because a DATE-SPECIFIC row already
  // covers that weekday, which is a real conflict with a real repair - and
  // `invalid` pointed at neither. The weekly editor cannot express "the ordinary
  // week, except those dates"; only Definir dia a dia can, so the screen has to
  // be able to say so. Distinct from `invalid`, which stays the answer for a
  // malformed or self-overlapping day.
  | "dated_conflict"
  // SCHED-25: a schedule block was written with no note. Deliberately NOT
  // `invalid`, which is where a missing date or a backwards hour range lands:
  // the two point at different boxes on the same form, and an operator told
  // "invalid" when the dates are fine goes and re-checks the dates. The agenda
  // dialog has had its own distinct `note_required` since SCHED-18 for exactly
  // this reason; this is the same refusal reaching the Equipa modal.
  | "note_required"
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

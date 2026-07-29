// PL-06b - who belongs in the Terapeuta dropdown (Pre-Launch, owner ruling
// 2026-07-28). SUPERSEDES the PL-05 predicate.
//
// The booking drawer and the agenda toolbar read the SAME reference list
// (fetchStableAgendaRef.therapistRows in ./data.ts). PL-05 made "bookable" a
// DERIVED signal: `roleSlug === 'therapist' OR serviceCount > 0`. That derivation
// DROPPED the practising owner JP on prod (role != therapist, zero service
// mappings -> both arms false -> out of the dropdown = a live defect), and it
// conflated three separate concerns. PL-06 splits them cleanly:
//   - role governs AUTHORISATION,
//   - the service mapping governs DEFAULT PRESELECTION (PL-06a),
//   - an explicit `users.is_bookable` flag governs DROPDOWN PRESENCE (this).
//
// "Bookable" is therefore NO LONGER inferred from role or mappings. It is the
// explicit `is_bookable` boolean (migration 0046), which admins set per staff
// row in Equipa. Role sets rot at every hire (the exact failure that produced
// the JP defect); the flag is the only signal that survives dual-role
// practitioners without hand-curation. The DB read lives in ./data.ts; this
// module is the pure decision so the rule stays unit-testable without a DB,
// mirroring ./therapist-location-filter.ts.

/** The minimum signal the bookable rule needs from each candidate row. */
export interface BookableSignal {
  /** The explicit is_bookable flag (users.is_bookable, migration 0046). */
  isBookable: boolean;
}

/**
 * True when a user belongs in the Terapeuta dropdown: exactly when their
 * `is_bookable` flag is set. Keeps the practising owner (JP, flag true even
 * though role != therapist and zero mappings); drops the operator owner, the
 * admin, and reception (flag false).
 */
export function isBookableTherapist(row: BookableSignal): boolean {
  return row.isBookable;
}

/** Narrow a candidate list to bookable practitioners. Input order is preserved. */
export function filterBookableTherapists<T extends BookableSignal>(rows: readonly T[]): T[] {
  return rows.filter(isBookableTherapist);
}

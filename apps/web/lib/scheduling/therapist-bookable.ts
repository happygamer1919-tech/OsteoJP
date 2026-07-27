// PL-05 - who belongs in the Terapeuta dropdown (Pre-Launch, Claude-found 2026-07-27).
//
// The booking drawer and the agenda toolbar read the SAME reference list
// (fetchStableAgendaRef.therapistRows in ./data.ts). Before this loop that query
// was `is_active AND role != 'reception'`, so it let the owner and the admin
// through as selectable "therapists" - the CB screenshot showed "Ivan M" (owner)
// and "Lurdes Cruz" (admin) as Terapeuta options.
//
// The fix is NOT a naive `role = 'therapist'`: the practising owner (JP) is a
// clinician who takes appointments while carrying role=owner, so a raw role
// filter would wrongly drop him. The distinguishing signal is the
// therapist->service mapping (`therapist_services`, migration 0023):
// practitioners carry mappings, non-practitioners (the developer/operator owner,
// the admin) do not.
//
// "Bookable" therefore = the user is a therapist (kept even with zero mappings
// yet - that is a data-entry gap, not a reason to hide a real therapist) OR the
// user has at least one service mapping (which keeps the practising owner). The
// DB read lives in ./data.ts; this module is the pure decision so the rule is
// unit-testable without a DB, mirroring ./therapist-location-filter.ts.

/** The minimum signal the bookable rule needs from each candidate row. */
export interface BookableSignal {
  /** The user's role slug: owner | admin | therapist | reception. */
  roleSlug: string;
  /** How many therapist_services rows the user has (0 for a non-practitioner). */
  serviceCount: number;
}

/**
 * True when a user belongs in the Terapeuta dropdown: any therapist, or anyone
 * (of any role) mapped to deliver at least one service. Keeps the practising
 * owner (role=owner WITH mappings); drops the operator owner and the admin (no
 * mappings); drops reception (no mappings, not a therapist).
 */
export function isBookableTherapist(row: BookableSignal): boolean {
  return row.roleSlug === "therapist" || row.serviceCount > 0;
}

/** Narrow a candidate list to bookable practitioners. Input order is preserved. */
export function filterBookableTherapists<T extends BookableSignal>(rows: readonly T[]): T[] {
  return rows.filter(isBookableTherapist);
}

// W9-02 - agenda therapist-by-location filter (owner ruling, Ivan 2026-07-17).
//
// Selecting a location in the agenda must narrow the therapist dropdown to the
// therapists ASSIGNED to that location. Before this loop no such predicate
// existed at all: the therapist list was every active non-reception user,
// tenant-wide, regardless of the selected location (W9-01 finding (f),
// docs/recon/W9-01-findings.md). That is why Castelo Branco showed
// Linda-a-Velha therapists (CB QA item 1). The feature was ABSENT, not broken.
//
// OWNER RULING (2026-07-17), encoded here verbatim:
//   Filter therapists by assigned location. Therapists with NO location
//   assignment appear ONLY under "Todas as localizações", never inside a
//   specific location view. A thin list short-term is accepted; owner data
//   entry populates it.
//
// Both cases fall out of ONE predicate - "the therapist's assigned-location set
// contains the selected location" - because an unassigned therapist has an
// empty set and so matches no specific location. The ruling is deliberate and
// its cost is known: at ruling time only 3 of 18 active therapists had any
// availability row, so a specific-location view is thin until the roster is
// filled in. That is accepted; it is a data-entry gap surfacing honestly rather
// than a filter that quietly shows the wrong clinic's staff.
//
// Assignment is DERIVED from availability_templates (the clinics where a
// therapist has working hours) - there is no therapist_locations join table.
// The read + its exact semantics live in ./therapist-locations.ts; this module
// is the pure decision so the ruling is unit-testable without a DB.

/**
 * Therapist id -> the ACTIVE location ids that therapist is assigned to.
 * A therapist with no assignment is either absent from the map or maps to an
 * empty list; the two are equivalent here.
 */
export type TherapistLocationAssignments = ReadonlyMap<string, readonly string[]>;

/** The minimum shape this filter needs - matches `Option` from ./types. */
interface TherapistLike {
  id: string;
}

/**
 * Narrow a therapist list to those assigned to `locationId`.
 *
 * `locationId = null` means "Todas as localizações" and returns the list
 * unchanged - the ONLY view in which an unassigned therapist appears.
 * Order is preserved (the caller sorts by name).
 */
export function filterTherapistsByLocation<T extends TherapistLike>(
  therapists: readonly T[],
  assignments: TherapistLocationAssignments,
  locationId: string | null,
): T[] {
  if (!locationId) return [...therapists];
  return therapists.filter((t) => (assignments.get(t.id) ?? []).includes(locationId));
}

/**
 * PL-14 - narrow a roster to the VIEWER's clinics (owner CR 2026-07-30). This is
 * a different question from `filterTherapistsByLocation` above: that one answers
 * "who works at the clinic the toolbar selected", this one answers "whose names
 * may this viewer see at all". An LV-only admin was being shown all 16 staff,
 * including CB-only therapists, because no such predicate existed.
 *
 * `scope = null` (owner, or an unassigned staffer) returns the list unchanged.
 * A therapist with NO assignment anywhere is KEPT: they belong to no clinic, so
 * dropping them would silently hide a real colleague behind a data-entry gap
 * rather than isolate anything. Order preserved.
 */
export function filterRosterByViewerScope<T extends TherapistLike>(
  therapists: readonly T[],
  assignments: TherapistLocationAssignments,
  scope: readonly string[] | null,
): T[] {
  if (!scope) return [...therapists];
  return therapists.filter((t) => {
    const assigned = assignments.get(t.id) ?? [];
    return assigned.length === 0 || assigned.some((l) => scope.includes(l));
  });
}

/**
 * W12-23 - the therapist options for the BOOKING drawer's dropdown: the location
 * team (same predicate as above), plus the currently-selected therapist kept in
 * the list even if they are not assigned to the chosen location, so editing an
 * existing appointment (or a location change) never drops the current value from
 * the Select. `locationId = null` returns the full list unchanged.
 */
export function therapistOptionsForBooking<T extends TherapistLike>(
  therapists: readonly T[],
  assignments: TherapistLocationAssignments,
  locationId: string | null,
  keepId?: string | null,
): T[] {
  const scoped = filterTherapistsByLocation(therapists, assignments, locationId);
  if (!locationId || !keepId || scoped.some((t) => t.id === keepId)) return scoped;
  const kept = therapists.find((t) => t.id === keepId);
  return kept ? [...scoped, kept] : scoped;
}

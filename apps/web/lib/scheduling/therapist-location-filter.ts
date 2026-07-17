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

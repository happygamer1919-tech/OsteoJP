import { isWithinValidity } from "@/lib/scheduling/availability";

/**
 * STAFF-12 — "which clinics does this member work at", for the Equipa card
 * chips and the Equipa clinic filter.
 *
 * W5-32 derived the set from working hours alone. PL-14 widened it to hours
 * UNION `staff_locations` membership, because an hours-only set filtered out
 * most of a real team. Both of those are kept. What this adds is the missing
 * third of the rule:
 *
 *   A WORKING-HOURS ROW ONLY COUNTS WHILE IT IS IN FORCE.
 *
 * `listAvailabilityTemplates` filters `is_active = true` and NOTHING else, so a
 * day-defined row whose `valid_until` passed last month is still "active" and
 * still contributed a clinic chip. Every other consumer of the same rows already
 * applies the window: the schedule editor on this very page goes through
 * `isWithinValidity(today, …)` in `schedule-days.ts`, and the portal's bookable
 * list uses the same predicate. The chips were the last reader that did not.
 *
 * MEASURED, production, 2026-09-22 (owner dispatch ITEM 0, the JP divide):
 * JP(cb) is a member of Castelo Branco and of nothing else — one
 * `staff_locations` row, and `viewer_location_ids()` returns Castelo Branco
 * alone — yet his card read "OsteoJP (LV), OsteoJP (CB)", because 21 of his 50
 * Linda-a-Velha schedule rows are still `is_active` with windows that closed.
 * The Gerir modal, which reads membership alone, showed Castelo Branco only.
 * One Portuguese word, "Localizações", labels both, so the two disagreed in
 * public. With the window applied the chip reads Castelo Branco, which is what
 * the owner ruled and what the database already said.
 *
 * THE MEMBERSHIP LEG IS NEVER WINDOWED. `staff_locations` carries no dates: it
 * is the standing answer to "where is this person installed", and it is what
 * the platform's own scope reads. So the set can only ever SHRINK by the amount
 * of hours that expired, and a member with a membership row keeps their chip
 * whatever their schedule says.
 *
 * Pure, and it takes `today` rather than reading a clock, so the boundary days
 * are testable without freezing time.
 */

/** The fields this derivation reads from a working-hours row. */
export type AssignedHoursRow = {
  userId: string;
  locationId: string;
  validFrom: string | null;
  validUntil: string | null;
};

/** The fields it reads from a `staff_locations` membership. */
export type AssignedMembership = { locationId: string };

/**
 * Clinic ids per member: `staff_locations` memberships, plus the clinics of the
 * working-hours rows that are in force on `today` (a Lisbon calendar date,
 * "YYYY-MM-DD").
 */
export function buildAssignedLocations(
  hours: readonly AssignedHoursRow[],
  membershipsByUser: ReadonlyMap<string, readonly AssignedMembership[]>,
  today: string,
): Map<string, Set<string>> {
  const assigned = new Map<string, Set<string>>();
  const add = (userId: string, locationId: string) => {
    const set = assigned.get(userId) ?? new Set<string>();
    set.add(locationId);
    assigned.set(userId, set);
  };
  for (const row of hours) {
    if (!isWithinValidity(today, row.validFrom, row.validUntil)) continue;
    add(row.userId, row.locationId);
  }
  for (const [userId, memberships] of membershipsByUser) {
    for (const membership of memberships) add(userId, membership.locationId);
  }
  return assigned;
}

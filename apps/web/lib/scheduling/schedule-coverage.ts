import { isWithinValidity } from "./availability";
import { timesOverlap } from "@/lib/admin/availability-core";

/**
 * ITEM 5 - the COVERAGE INVARIANT for availability templates.
 *
 * Layer 1 is the weekly recurring schedule and stays the default, untouched.
 * Layer 2 is date-specific work, expressed as templates carrying `valid_from` /
 * `valid_until` - the SAME table, the same columns every consumer already reads
 * (day-availability-core.ts via isWithinValidity, and the portal booking guard
 * in SQL at apps/api/lib/appointments/store.ts). That is why layer 2 needs no
 * migration and no consumer change.
 *
 * THE PROBLEM LAYER 2 CREATES, AND THE ONE THING THIS FILE EXISTS FOR.
 * If an unbounded Monday row at LV and a dated Monday row at CB both cover
 * 2026-09-07, then on that date the therapist is "working" at TWO CLINICS AT
 * ONCE. Every consumer unions the templates it finds, so nothing errors: the
 * agenda offers both, the portal offers both, and the first anyone hears of it
 * is a patient arriving at the wrong building.
 *
 * TWO WAYS TO STOP THAT, AND THE OWNER RATIFIED THE SECOND.
 *   (A) READ-TIME PRECEDENCE - "most specific wins". Needs the rule in FOUR
 *       places, two TypeScript and two SQL. That is the drift that produced the
 *       S1 incident and forced migration 0059 to collapse three copies of a
 *       predicate into one SQL function.
 *   (B) WRITE-TIME INVARIANT - the writer emits rows that CANNOT double-cover,
 *       so the union is automatically correct and there is nothing to
 *       disambiguate at read time. One rule, one place, no second opinion that
 *       can drift, and no migration.
 *
 * THE INVARIANT IS NOT "AT MOST ONE ROW", and getting that wrong would delete a
 * shipped feature. W13-A allows TWO rows per (user, weekday) at the SAME
 * location - a split shift, 08:00-13:00 plus 14:00-19:00. So the rule is:
 *
 *   for any (weekday, date) that more than one active row covers,
 *   every covering row must be at the SAME location,
 *   and no two of their time ranges may overlap.
 */

export type CoverageRow = {
  /** Present for rows already in the database; absent for a planned write. */
  id?: string;
  locationId: string;
  weekday: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  validFrom: string | null; // "yyyy-mm-dd"
  validUntil: string | null;
};

export type CoverageViolation =
  | { kind: "two_locations"; weekday: number; date: string; locationIds: string[] }
  | { kind: "time_overlap"; weekday: number; date: string; locationId: string };

/** Do two validity ranges share at least one day? Null is open-ended. */
export function validityIntersects(a: CoverageRow, b: CoverageRow): boolean {
  const aFrom = a.validFrom ?? "0000-01-01";
  const aTo = a.validUntil ?? "9999-12-31";
  const bFrom = b.validFrom ?? "0000-01-01";
  const bTo = b.validUntil ?? "9999-12-31";
  return aFrom <= bTo && bFrom <= aTo;
}

/** The first day both rows cover, as an ISO date. Callers use it to name the
 *  violation concretely rather than saying "somewhere in these ranges". */
function firstSharedDay(a: CoverageRow, b: CoverageRow): string {
  const aFrom = a.validFrom ?? "0000-01-01";
  const bFrom = b.validFrom ?? "0000-01-01";
  return aFrom >= bFrom ? aFrom : bFrom;
}

/**
 * Every way `rows` (all for ONE therapist) violate the invariant.
 *
 * PAIRWISE AND EXHAUSTIVE, not a sample. A schedule is a few dozen rows per
 * quarter, so the quadratic cost is irrelevant and a partial check would be the
 * more expensive mistake: the pair it skipped is the one that sends a patient to
 * the wrong clinic.
 */
export function coverageViolations(rows: readonly CoverageRow[]): CoverageViolation[] {
  const out: CoverageViolation[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.weekday !== b.weekday) continue;
      if (!validityIntersects(a, b)) continue;
      const date = firstSharedDay(a, b);
      if (a.locationId !== b.locationId) {
        out.push({
          kind: "two_locations",
          weekday: a.weekday,
          date,
          locationIds: [a.locationId, b.locationId].sort(),
        });
        continue;
      }
      // Same location: a second PERIOD is legal (W13-A split shift). Overlapping
      // times are not - they are a contradiction, not a shift.
      if (timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        out.push({ kind: "time_overlap", weekday: a.weekday, date, locationId: a.locationId });
      }
    }
  }
  return out;
}

/**
 * The locations a therapist is scheduled at on one date, in the order the rows
 * were given. Exists so a test can assert the ANSWER a consumer would compute,
 * rather than re-implementing `isWithinValidity` inside the test and proving
 * only that the test agrees with itself.
 */
export function locationsOnDate(
  rows: readonly CoverageRow[],
  weekday: number,
  date: string,
): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.weekday !== weekday) continue;
    if (!isWithinValidity(date, r.validFrom, r.validUntil)) continue;
    seen.add(r.locationId);
  }
  return [...seen];
}

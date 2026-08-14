import { addDays } from "./time";
import { generateLoteSchedule } from "./lote";
import type { CoverageRow } from "./schedule-coverage";

/**
 * ITEM 5 - turn "JP alternates weeks between Castelo Branco and Linda-a-Velha"
 * into the exact set of `availability_templates` rows that expresses it.
 *
 * THE RECURRENCE IS NOT REIMPLEMENTED HERE. `generateLoteSchedule` already backs
 * Agendar lote and Bloquear lote; calling it a third time means "every 2 weeks
 * until X" has ONE definition in this repo and the three surfaces cannot drift
 * about what a fortnight is. It is called TWICE - once per location, offset by a
 * week - which is the whole of the alternation.
 *
 * ONE ROW PER (WEEKDAY, DATE), BOUNDED TO THAT SINGLE DAY. validFrom ===
 * validUntil === the date. Two rows can then only collide if they are literally
 * the same day, which the generator cannot produce for two offset series, so the
 * coverage invariant holds by construction rather than by checking. A row per
 * WEEK would have been fewer rows and would have needed the boundary arithmetic
 * to be right; a row per day needs nothing to be right.
 *
 * LAYER 1 IS CARVED, NOT DELETED. The therapist's ordinary weekly row keeps
 * serving every date outside the pattern: it is bounded to end the day before
 * the pattern starts, and an identical row resumes the day after it ends. The
 * owner's ruling is that the weekly setup REMAINS the default, so the pattern is
 * a window cut into it, not a replacement for it.
 */

export type AlternatingWeeksPlan = {
  /** Weekdays worked, 0=Sunday..6=Saturday. */
  weekdays: number[];
  /** First date of the pattern, "yyyy-mm-dd". Week A begins on its Monday. */
  startDate: string;
  /** Last date of the pattern, "yyyy-mm-dd". R-SCHED-1 horizon is 3 months. */
  endDate: string;
  /** The clinic worked in week A (the week containing startDate). */
  locationAId: string;
  /** The clinic worked in week B (the following week), then alternating. */
  locationBId: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

/** A row to write. `id` absent: these are all new rows. */
export type PlannedTemplate = CoverageRow;

/**
 * How an EXISTING unbounded weekly row is carved so the pattern can occupy its
 * window. Two writes, never a delete: the owner's standing rule is that
 * scheduling data is not silently destroyed (Q-W5-4).
 */
export type LayerOneCarve = {
  /** The row being bounded. */
  id: string;
  /** Its new validUntil - the day before the pattern starts. */
  validUntil: string;
  /** The identical row that resumes after the pattern, or null when the
   *  original already ended before the pattern does. */
  resume: PlannedTemplate | null;
};

export type AlternatingWeeksWrite = {
  created: PlannedTemplate[];
  carved: LayerOneCarve[];
};

/**
 * The dates one location's weeks fall on: every `weekdays` day, every OTHER
 * week, starting from `from`, bounded by `endDate`.
 */
function datesFor(from: string, weekdays: number[], endDate: string): string[] {
  return generateLoteSchedule({
    from,
    weekdays,
    everyWeeks: 2,
    end: { kind: "until", date: endDate },
  });
}

/**
 * Plan the writes for an alternating-week pattern.
 *
 * `existing` is the therapist's CURRENT active rows. Only unbounded rows on the
 * pattern's weekdays are carved; a row already bounded outside the window, or on
 * a weekday the pattern does not touch, is left exactly as it is.
 */
export function planAlternatingWeeks(
  plan: AlternatingWeeksPlan,
  existing: readonly CoverageRow[],
): AlternatingWeeksWrite {
  const { weekdays, startDate, endDate, locationAId, locationBId, startTime, endTime } = plan;
  if (weekdays.length === 0 || startDate > endDate) return { created: [], carved: [] };

  const weekBStart = addDays(startDate, 7);
  const rowFor = (date: string, locationId: string): PlannedTemplate => ({
    locationId,
    // The generator returns real calendar dates, so the weekday is derived from
    // the date rather than carried alongside it, where the two could disagree.
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    startTime,
    endTime,
    validFrom: date,
    validUntil: date,
  });

  const created: PlannedTemplate[] = [
    ...datesFor(startDate, weekdays, endDate).map((d) => rowFor(d, locationAId)),
    ...(weekBStart <= endDate
      ? datesFor(weekBStart, weekdays, endDate).map((d) => rowFor(d, locationBId))
      : []),
  ];

  const dayBefore = addDays(startDate, -1);
  const dayAfter = addDays(endDate, 1);
  const carved: LayerOneCarve[] = [];
  for (const row of existing) {
    if (!weekdays.includes(row.weekday)) continue;
    // A row that already stops before the pattern, or starts after it, cannot
    // double-cover and must not be touched.
    if (row.validUntil && row.validUntil < startDate) continue;
    if (row.validFrom && row.validFrom > endDate) continue;
    if (!row.id) continue;
    carved.push({
      id: row.id,
      validUntil: dayBefore,
      // Resume only if the original would still have been running after the
      // pattern. A row that was already going to end inside the window keeps its
      // own end date and simply is not resumed.
      resume:
        row.validUntil && row.validUntil <= endDate
          ? null
          : {
              locationId: row.locationId,
              weekday: row.weekday,
              startTime: row.startTime,
              endTime: row.endTime,
              validFrom: dayAfter,
              validUntil: row.validUntil,
            },
    });
  }

  return { created, carved };
}

/**
 * The rows that WILL exist after a plan is applied: the untouched ones, the
 * carved ones with their new bound, the resumed ones, and the new dated ones.
 *
 * EXISTS SO THE INVARIANT CAN BE CHECKED BEFORE ANYTHING IS WRITTEN. Checking
 * after the insert would mean discovering a double-booked therapist inside a
 * transaction that has already half-run.
 */
export function projectedRows(
  existing: readonly CoverageRow[],
  write: AlternatingWeeksWrite,
): CoverageRow[] {
  const carveById = new Map(write.carved.map((c) => [c.id, c]));
  const out: CoverageRow[] = [];
  for (const row of existing) {
    const carve = row.id ? carveById.get(row.id) : undefined;
    if (!carve) {
      out.push(row);
      continue;
    }
    out.push({ ...row, validUntil: carve.validUntil });
    if (carve.resume) out.push(carve.resume);
  }
  out.push(...write.created);
  return out;
}

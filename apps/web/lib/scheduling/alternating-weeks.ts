import { addDays } from "./time";
import { generateLoteSchedule } from "./lote";
import type { CoverageRow } from "./schedule-coverage";
import { planWindow, settlePlan, type SchedulePlan, type WindowCarve } from "./schedule-window";

export { projectedRows } from "./schedule-window";

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
 *
 * THE CARVE ITSELF NOW LIVES IN schedule-window.ts, SHARED WITH THE DAY-BY-DAY
 * GRID (SCHED-04), and this file is only "which dates does the pattern produce".
 * It moved because of SCHED-05: re-running a pattern over a window it already
 * covered bounded its own dated rows BACKWARDS - valid_from after valid_until -
 * leaving dead rows that no screen and no invariant check could see. First-run
 * behaviour is unchanged; a re-run now REFUSES and names the dates, and
 * `replace` supersedes them by deactivation rather than by inversion.
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
export type LayerOneCarve = WindowCarve;

export type AlternatingWeeksWrite = SchedulePlan;

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
  opts: { replace?: boolean } = {},
): AlternatingWeeksWrite {
  const { weekdays, startDate, endDate, locationAId, locationBId, startTime, endTime } = plan;
  if (weekdays.length === 0 || startDate > endDate) {
    return { created: [], carved: [], deactivate: [], collisions: [] };
  }

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

  // The carve, the collision report and the deactivations are the shared part.
  // Only `created` is this mode's own.
  const { carved, deactivate, collisions } = planWindow(
    { startDate, endDate, weekdays },
    existing,
    opts,
  );

  return settlePlan({ created, carved, deactivate, collisions });
}

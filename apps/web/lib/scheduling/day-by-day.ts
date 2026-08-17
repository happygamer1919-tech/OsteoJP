import type { CoverageRow } from "./schedule-coverage";
import { planWindow, type SchedulePlan } from "./schedule-window";

/**
 * SCHED-04 (ITEM B) - the THIRD schedule entry mode: a window of dates with no
 * pattern at all.
 *
 * MODE 1 is the weekly schedule: a recurring week, unbounded, the default.
 * MODE 2 is alternating weeks: a GENERATOR produces the dates from a rule.
 * MODE 3 is this: a human names the dates, one at a time, because no rule
 * describes them. A therapist covering irregular days over a month has no
 * pattern to state, and stating a false one is worse than stating none.
 *
 * IT IS A THIRD MODE RATHER THAN AN OPTION ON THE SECOND, AND THE REASON IS THE
 * CORRECTNESS ARGUMENT, NOT THE UI. Mode 2 is safe because a generator cannot
 * produce the same day twice from two offset series, so the no-double-coverage
 * invariant holds BY CONSTRUCTION. Hand-entered dates have no such guarantee, so
 * they must be CHECKED - and they need a different answer when they land on
 * dates that already have work, which mode 2 never had to have.
 *
 * ============================================================================
 * THE WINDOW IS EXHAUSTIVE, AND THIS IS THE ONE THING TO UNDERSTAND HERE
 * ============================================================================
 * Inside [startDate, endDate] the grid is the COMPLETE truth for the therapist:
 * a date with no entry is a date they do not work. It is not "unchanged".
 *
 * THAT IS FORCED BY THE ROW MODEL, not chosen for tidiness. A weekly layer-1 row
 * has no exception list - the only thing that can limit it is valid_from /
 * valid_until - so there is no way to say "the ordinary Monday, except this one".
 * If layer 1 were left standing for the unset days, a dated CB row on a Monday
 * would sit beside the weekly LV Monday row and the therapist would be at two
 * clinics at once, which is the exact failure the whole layer-2 design exists to
 * prevent.
 *
 * SO THE GRID SHOWS EVERY DATE IN THE WINDOW, INCLUDING WEEKENDS, and an unset
 * day is a visible blank rather than an absent row. The semantics only stay
 * honest while the screen shows what it is deciding: that is why `weekdays`
 * below is all seven, and why the panel renders the full window rather than only
 * the days somebody happened to fill in.
 *
 * Outside the window nothing changes: the weekly schedule is carved for the
 * window's dates and resumes, identical, the day after it ends.
 */

/** One date the therapist works, and where. */
export type DayEntry = {
  date: string; // "yyyy-mm-dd"
  locationId: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

export type DayByDayPlan = {
  /** First date the window governs. */
  startDate: string;
  /** Last date the window governs. */
  endDate: string;
  /**
   * The days worked. Every entry's date must fall inside the window - the
   * server validates that rather than clamping, because a date outside the
   * window the person was looking at is a mistake, not an instruction.
   *
   * TWO ENTRIES ON ONE DATE ARE LEGAL AND MEAN A SPLIT SHIFT, the same as
   * W13-A's two periods per weekday: same clinic, non-overlapping times. The
   * coverage invariant is what decides that, exactly as it does for layer 1, so
   * this type does not need to forbid it.
   */
  entries: DayEntry[];
};

/** The window governs every weekday. See the header: unset means not working. */
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** The weekday of a calendar date, 0=Sunday..6=Saturday, read from the date
 *  itself so it can never disagree with the date it travels with. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Plan the writes for a day-by-day window.
 *
 * `existing` is the therapist's CURRENT active rows. Without `replace`, any
 * dated row already inside the window is reported as a collision and the caller
 * refuses; with it, those rows are superseded by deactivation. Neither path ever
 * writes a validity range backwards - see schedule-window.ts.
 */
export function planDayByDay(
  plan: DayByDayPlan,
  existing: readonly CoverageRow[],
  opts: { replace?: boolean } = {},
): SchedulePlan {
  const { startDate, endDate, entries } = plan;
  if (startDate > endDate) return { created: [], carved: [], deactivate: [], collisions: [] };

  const created: CoverageRow[] = entries.map((e) => ({
    locationId: e.locationId,
    weekday: weekdayOf(e.date),
    startTime: e.startTime,
    endTime: e.endTime,
    // The same shape mode 2 writes: one row bounded to its single day.
    validFrom: e.date,
    validUntil: e.date,
  }));

  const { carved, deactivate, collisions } = planWindow(
    { startDate, endDate, weekdays: ALL_WEEKDAYS },
    existing,
    opts,
  );

  return { created, carved, deactivate, collisions };
}

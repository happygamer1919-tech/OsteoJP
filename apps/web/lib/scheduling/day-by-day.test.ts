import { describe, it, expect } from "vitest";
import { planDayByDay, type DayByDayPlan } from "./day-by-day";
import { planAlternatingWeeks } from "./alternating-weeks";
import { invertedRows, projectedRows } from "./schedule-window";
import { coverageViolations, locationsOnDate, type CoverageRow } from "./schedule-coverage";
import { buildDay } from "./day-availability-core";

/**
 * SCHED-04 (ITEM B) - the day-by-day grid.
 *
 * The properties under test are the ratified ones: the window is exhaustive, a
 * collision with dated rows REFUSES and names the dates, replacing supersedes by
 * deactivation, and layer 1 is carved rather than destroyed.
 *
 * WHERE IT CAN, THIS ASSERTS AT THE CONSUMER RATHER THAN AT THE PLANNER, for the
 * reason SCHED-01's suite gives: the planner agreeing with itself is not
 * evidence. buildDay is the real staff availability engine, and locationsOnDate
 * answers the question a patient's booking actually turns on - where is this
 * therapist on this date.
 */

const CB = "loc-castelo-branco";
const LV = "loc-linda-a-velha";

// 2026-09-07 is a Monday. The window runs a fortnight to Sunday 2026-09-20.
const MON_1 = "2026-09-07";
const WED_1 = "2026-09-09";
const SAT_1 = "2026-09-12";
const MON_2 = "2026-09-14";
const WINDOW_END = "2026-09-20";

const WEEKDAYS = [1, 2, 3, 4, 5];

/** The ordinary weekly schedule before any window: Mon-Fri at LV, unbounded. */
const weeklyAtLV: CoverageRow[] = WEEKDAYS.map((weekday) => ({
  id: `wk-${weekday}`,
  locationId: LV,
  weekday,
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
}));

/** An irregular fortnight: two days at CB, one Saturday at LV, nothing else. */
const PLAN: DayByDayPlan = {
  startDate: MON_1,
  endDate: WINDOW_END,
  entries: [
    { date: MON_1, locationId: CB, startTime: "09:00", endTime: "17:00" },
    { date: WED_1, locationId: CB, startTime: "10:00", endTime: "14:00" },
    { date: SAT_1, locationId: LV, startTime: "09:00", endTime: "13:00" },
  ],
};

/** The rows as the database would hold them after a save. */
const asStored = (rows: readonly CoverageRow[]): CoverageRow[] =>
  rows.map((r, i) => (r.id ? r : { ...r, id: `stored-${i}` }));

describe("SCHED-04 - the window is exhaustive", () => {
  const write = planDayByDay(PLAN, weeklyAtLV);
  const projected = projectedRows(weeklyAtLV, write);

  it("a day that WAS set puts the therapist at exactly that clinic", () => {
    expect(locationsOnDate(projected, 1, MON_1)).toEqual([CB]);
    expect(locationsOnDate(projected, 3, WED_1)).toEqual([CB]);
    expect(locationsOnDate(projected, 6, SAT_1)).toEqual([LV]);
  });

  it("THE LOAD-BEARING ONE: a weekday inside the window that was NOT set is not worked", () => {
    // Tuesday 2026-09-08 is inside the window and has no entry. The ordinary
    // weekly Tuesday row must NOT still be serving it - if it did, the grid
    // would be saying "not working" while the agenda offered slots, and worse,
    // a set Tuesday at CB would have sat beside it at LV.
    expect(locationsOnDate(projected, 2, "2026-09-08")).toEqual([]);
    // Same for the second Monday, which the grid deliberately left blank.
    expect(locationsOnDate(projected, 1, MON_2)).toEqual([]);
  });

  it("asserted at the REAL staff engine, not only through locationsOnDate", () => {
    // buildDay is what the staff agenda actually computes a day from. It reads
    // the templates through isWithinValidity, so it is the check that the dated
    // rows and the carve say the same thing to the surface a human looks at.
    const templates = projected.map((t) => ({
      weekday: t.weekday,
      startTime: t.startTime,
      endTime: t.endTime,
      validFrom: t.validFrom,
      validUntil: t.validUntil,
      // Everything that reaches a consumer is active by definition: the read
      // paths filter is_active in SQL before buildDay ever sees a row.
      isActive: true,
    }));

    const worked = buildDay(MON_1, templates, []);
    const blank = buildDay("2026-09-08", templates, []); // an unset Tuesday
    expect(worked.working).toHaveLength(1);
    expect(blank.working).toEqual([]);
    // And the second Monday, deliberately left out of the grid.
    expect(buildDay(MON_2, templates, []).working).toEqual([]);
  });

  it("outside the window the ordinary weekly schedule is untouched, before and after", () => {
    expect(locationsOnDate(projected, 1, "2026-08-31")).toEqual([LV]); // before
    expect(locationsOnDate(projected, 1, "2026-09-21")).toEqual([LV]); // after
  });

  it("carves layer 1 rather than deleting it - the resume row is there", () => {
    expect(write.carved).toHaveLength(5); // Mon-Fri
    for (const carve of write.carved) {
      expect(carve.validUntil).toBe("2026-09-06");
      expect(carve.resume?.validFrom).toBe("2026-09-21");
      expect(carve.resume?.validUntil).toBeNull();
    }
  });

  it("violates the no-double-coverage invariant nowhere", () => {
    expect(coverageViolations(projected)).toEqual([]);
    expect(invertedRows(projected)).toEqual([]);
  });
});

describe("SCHED-04 - a window that lands on dated work REFUSES", () => {
  const stored = asStored(projectedRows(weeklyAtLV, planDayByDay(PLAN, weeklyAtLV)));

  it("names the dates, and writes nothing", () => {
    const again = planDayByDay(PLAN, stored);
    expect(again.collisions.map((c) => c.date).sort()).toEqual([MON_1, WED_1, SAT_1].sort());
    expect(again.deactivate).toEqual([]);
  });

  it("refuses against the OTHER mode's rows too - the seam is shared", () => {
    // An alternating pattern wrote the dates; the grid must see them as dated
    // work rather than carving them, which is the SCHED-05 failure in reverse.
    const alt = planAlternatingWeeks(
      {
        weekdays: WEEKDAYS,
        startDate: MON_1,
        endDate: WINDOW_END,
        locationAId: CB,
        locationBId: LV,
        startTime: "09:00",
        endTime: "17:00",
      },
      weeklyAtLV,
    );
    const afterAlt = asStored(projectedRows(weeklyAtLV, alt));
    const grid = planDayByDay(PLAN, afterAlt);
    expect(grid.collisions.length).toBeGreaterThan(0);
    expect(grid.collisions.every((c) => c.kind === "dated")).toBe(true);
  });

  it("with the explicit replace: superseded by deactivation, nothing inverted, nothing accumulated", () => {
    const replaced = planDayByDay(PLAN, stored, { replace: true });
    expect(replaced.deactivate).toHaveLength(3); // the three dated rows, by id
    const projected = projectedRows(stored, replaced);
    expect(invertedRows(projected)).toEqual([]);
    expect(projected).toHaveLength(stored.length); // three out, three in
    expect(coverageViolations(projected)).toEqual([]);
    expect(locationsOnDate(projected, 1, MON_1)).toEqual([CB]);
  });

  it("COUNTERWEIGHT: with no dated rows in the way there is no refusal at all", () => {
    // Without this, every assertion above would still pass if planDayByDay
    // simply reported a collision for everything it ever saw.
    const fresh = planDayByDay(PLAN, weeklyAtLV);
    expect(fresh.collisions).toEqual([]);
    expect(fresh.created).toHaveLength(3);
  });
});

describe("SCHED-04 - what the grid may express", () => {
  it("two periods on ONE date at the same clinic is a split shift and is legal", () => {
    const split: DayByDayPlan = {
      startDate: MON_1,
      endDate: WINDOW_END,
      entries: [
        { date: MON_1, locationId: CB, startTime: "08:00", endTime: "13:00" },
        { date: MON_1, locationId: CB, startTime: "14:00", endTime: "19:00" },
      ],
    };
    const projected = projectedRows(weeklyAtLV, planDayByDay(split, weeklyAtLV));
    expect(coverageViolations(projected)).toEqual([]);
    expect(locationsOnDate(projected, 1, MON_1)).toEqual([CB]);
  });

  it("the SAME date at two clinics is refused by the invariant, before any write", () => {
    const impossible: DayByDayPlan = {
      startDate: MON_1,
      endDate: WINDOW_END,
      entries: [
        { date: MON_1, locationId: CB, startTime: "09:00", endTime: "13:00" },
        { date: MON_1, locationId: LV, startTime: "14:00", endTime: "18:00" },
      ],
    };
    const violations = coverageViolations(
      projectedRows(weeklyAtLV, planDayByDay(impossible, weeklyAtLV)),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.kind).toBe("two_locations");
    expect(violations[0]!.date).toBe(MON_1);
  });

  it("overlapping times on one date at one clinic is a contradiction, not a shift", () => {
    const overlapping: DayByDayPlan = {
      startDate: MON_1,
      endDate: WINDOW_END,
      entries: [
        { date: MON_1, locationId: CB, startTime: "09:00", endTime: "14:00" },
        { date: MON_1, locationId: CB, startTime: "13:00", endTime: "18:00" },
      ],
    };
    const violations = coverageViolations(
      projectedRows(weeklyAtLV, planDayByDay(overlapping, weeklyAtLV)),
    );
    expect(violations.map((v) => v.kind)).toEqual(["time_overlap"]);
  });
});

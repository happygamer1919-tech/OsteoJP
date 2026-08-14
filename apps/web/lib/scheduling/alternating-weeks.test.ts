import { describe, it, expect } from "vitest";
import {
  planAlternatingWeeks,
  projectedRows,
  type AlternatingWeeksPlan,
} from "./alternating-weeks";
import { coverageViolations, locationsOnDate, type CoverageRow } from "./schedule-coverage";
import { buildDay } from "./day-availability-core";

/**
 * ITEM 5 - THE TWO DoD TESTS THE RULING NAMED AS THE CORE:
 *   1. the no-double-coverage invariant
 *   2. JP's alternating weeks producing CB one week and LV the next, at EVERY
 *      consumer
 *
 * The second is why `buildDay` is imported. Asserting the planner's own output
 * would only prove the planner agrees with itself; the property that matters is
 * what the CONSUMER computes from those rows, and buildDay is the real staff
 * availability engine. The SQL consumer (the portal booking guard) is proven
 * separately and against a live database in
 * packages/db/tests/alternating-weeks-portal.db.test.ts, because a TypeScript
 * test cannot say anything at all about a SQL predicate.
 */

const CB = "loc-castelo-branco";
const LV = "loc-linda-a-velha";

// 2026-09-07 is a Monday. Week A = 07..13 Sep at CB, week B = 14..20 Sep at LV.
const MON_A = "2026-09-07";
const MON_B = "2026-09-14";
const MON_A2 = "2026-09-21";
const MON_B2 = "2026-09-28";

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon..Fri

const JP_PLAN: AlternatingWeeksPlan = {
  weekdays: WEEKDAYS,
  startDate: MON_A,
  endDate: "2026-12-06", // 13 weeks, the R-SCHED-1 three-month horizon
  locationAId: CB,
  locationBId: LV,
  startTime: "09:00",
  endTime: "17:00",
};

/** JP's ordinary weekly schedule before any pattern: Mon-Fri at LV, unbounded. */
const weeklyAtLV: CoverageRow[] = WEEKDAYS.map((weekday) => ({
  id: `wk-${weekday}`,
  locationId: LV,
  weekday,
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
}));

describe("ITEM 5 DoD 1 - the no-double-coverage invariant", () => {
  it("the projected rows for JP's pattern violate NOTHING", () => {
    const write = planAlternatingWeeks(JP_PLAN, weeklyAtLV);
    const projected = projectedRows(weeklyAtLV, write);
    expect(coverageViolations(projected)).toEqual([]);
  });

  it("PROVES THE CHECK BITES: skipping the carve produces a two-location violation", () => {
    // The counterweight. A test that only ever sees an empty array cannot
    // distinguish "the invariant holds" from "the checker returns nothing".
    // Here the unbounded LV rows are left in place beside the dated CB rows,
    // which is exactly the bug the carve exists to prevent.
    const write = planAlternatingWeeks(JP_PLAN, weeklyAtLV);
    const uncarved = [...weeklyAtLV, ...write.created];
    const violations = coverageViolations(uncarved);
    expect(violations.length).toBeGreaterThan(0);
    // BOTH kinds appear, and that is correct rather than sloppy: the week-A rows
    // are at CB against an unbounded LV row (two clinics on one day), and the
    // week-B rows are at LV against that same row with identical hours (one
    // clinic, two contradictory copies). The two-location one is the failure
    // that would put a patient in the wrong building, so it is named explicitly.
    expect(violations.some((v) => v.kind === "two_locations")).toBe(true);
    expect(violations.some((v) => v.kind === "time_overlap")).toBe(true);
  });

  it("a SPLIT SHIFT at one location is NOT a violation (W13-A must survive)", () => {
    const split: CoverageRow[] = [
      { id: "am", locationId: LV, weekday: 1, startTime: "08:00", endTime: "13:00", validFrom: null, validUntil: null },
      { id: "pm", locationId: LV, weekday: 1, startTime: "14:00", endTime: "19:00", validFrom: null, validUntil: null },
    ];
    expect(coverageViolations(split)).toEqual([]);
  });

  it("but two OVERLAPPING periods at one location ARE a violation", () => {
    const clash: CoverageRow[] = [
      { id: "am", locationId: LV, weekday: 1, startTime: "08:00", endTime: "14:00", validFrom: null, validUntil: null },
      { id: "pm", locationId: LV, weekday: 1, startTime: "13:00", endTime: "19:00", validFrom: null, validUntil: null },
    ];
    expect(coverageViolations(clash).map((v) => v.kind)).toEqual(["time_overlap"]);
  });

  it("rows on DIFFERENT weekdays never collide, however their dates overlap", () => {
    const rows: CoverageRow[] = [
      { id: "a", locationId: CB, weekday: 1, startTime: "09:00", endTime: "17:00", validFrom: null, validUntil: null },
      { id: "b", locationId: LV, weekday: 2, startTime: "09:00", endTime: "17:00", validFrom: null, validUntil: null },
    ];
    expect(coverageViolations(rows)).toEqual([]);
  });

  it("rows on the same weekday at different clinics but DISJOINT dates are fine", () => {
    const rows: CoverageRow[] = [
      { id: "a", locationId: CB, weekday: 1, startTime: "09:00", endTime: "17:00", validFrom: "2026-09-07", validUntil: "2026-09-07" },
      { id: "b", locationId: LV, weekday: 1, startTime: "09:00", endTime: "17:00", validFrom: "2026-09-14", validUntil: "2026-09-14" },
    ];
    expect(coverageViolations(rows)).toEqual([]);
  });
});

describe("ITEM 5 DoD 2 - CB one week, LV the next, at the consumer", () => {
  const write = planAlternatingWeeks(JP_PLAN, weeklyAtLV);
  const projected = projectedRows(weeklyAtLV, write);

  /** What the STAFF availability engine computes for one date. */
  const workingLocationsViaConsumer = (date: string): string[] => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    // buildDay merges the templates that apply; asking it per location tells us
    // which locations actually yield working time on that date.
    return [CB, LV].filter((locationId) => {
      const day = buildDay(
        date,
        projected
          .filter((r) => r.locationId === locationId)
          .map((r) => ({
            weekday: r.weekday,
            startTime: r.startTime,
            endTime: r.endTime,
            validFrom: r.validFrom,
            validUntil: r.validUntil,
            isActive: true,
          })),
        [],
        [],
      );
      return day.working.length > 0 && weekday === new Date(`${date}T00:00:00Z`).getUTCDay();
    });
  };

  it("week A: JP is at CASTELO BRANCO, and not at Linda-a-Velha", () => {
    for (const date of [MON_A, "2026-09-09", "2026-09-11"]) {
      expect(workingLocationsViaConsumer(date), `on ${date}`).toEqual([CB]);
    }
  });

  it("week B: JP is at LINDA-A-VELHA, and not at Castelo Branco", () => {
    for (const date of [MON_B, "2026-09-16", "2026-09-18"]) {
      expect(workingLocationsViaConsumer(date), `on ${date}`).toEqual([LV]);
    }
  });

  it("the alternation keeps going: week 3 is CB again, week 4 is LV again", () => {
    expect(workingLocationsViaConsumer(MON_A2)).toEqual([CB]);
    expect(workingLocationsViaConsumer(MON_B2)).toEqual([LV]);
  });

  it("EXACTLY ONE clinic on every working day of the horizon, never two, never none", () => {
    // The strongest form of DoD 2, asserted over the whole quarter rather than
    // sampled: a pattern that is right in September and wrong in November is
    // still wrong.
    let date = MON_A;
    let checked = 0;
    while (date <= JP_PLAN.endDate) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (WEEKDAYS.includes(weekday)) {
        const at = locationsOnDate(projected, weekday, date);
        expect(at, `on ${date} JP is at ${at.join(" and ") || "no clinic"}`).toHaveLength(1);
        checked++;
      }
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      date = next.toISOString().slice(0, 10);
    }
    // Guard against a vacuous pass: 13 weeks x 5 weekdays.
    expect(checked).toBe(65);
  });

  it("NEGATIVE ARM: OUTSIDE the horizon JP is back on his ordinary weekly schedule at LV", () => {
    // The carve must not leave him with no schedule once the pattern ends.
    const after = "2026-12-14"; // a Monday, after endDate
    expect(locationsOnDate(projected, 1, after)).toEqual([LV]);
  });

  it("NEGATIVE ARM: BEFORE the pattern he is also still at LV", () => {
    const before = "2026-08-31"; // a Monday, before startDate
    expect(locationsOnDate(projected, 1, before)).toEqual([LV]);
  });

  it("NEGATIVE ARM: a weekday the pattern does not touch is left completely alone", () => {
    const withSaturday: CoverageRow[] = [
      ...weeklyAtLV,
      { id: "sat", locationId: LV, weekday: 6, startTime: "09:00", endTime: "13:00", validFrom: null, validUntil: null },
    ];
    const w = planAlternatingWeeks(JP_PLAN, withSaturday);
    expect(w.carved.map((c) => c.id)).not.toContain("sat");
    expect(locationsOnDate(projectedRows(withSaturday, w), 6, "2026-09-12")).toEqual([LV]);
  });
});

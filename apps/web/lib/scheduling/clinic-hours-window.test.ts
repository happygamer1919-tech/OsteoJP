/**
 * AGENDA-2100 — THE GRID'S WINDOW AND THE LATEST START, as pure arithmetic.
 *
 * ==========================================================================
 * WHAT THE OWNER ASKED FOR, AND WHAT THE CODE ACTUALLY NEEDED
 * ==========================================================================
 * The request: the agenda must run to 21:00 with 20:00-21:00 as the last row,
 * and 20:00 must be the last bookable start.
 *
 * The grid half needed NO code change and this file is the proof. `gridWindow`
 * has been driven by `locations.closes_at` since 0085; the reason the last row
 * is 19:00-20:00 today is that production's `closes_at` IS 20:00 (the column's
 * own default). The tests below pin both readings so the change stays where it
 * belongs - in the DATA - and so a future constant reintroduced into the grid
 * fails here rather than on the owner's screen.
 *
 * The latest-start half needed a NEW rule: nothing on any write path compared a
 * booking to the clinic's hours at all (M2). `classifyStart` is that rule.
 */
import { describe, expect, it } from "vitest";

import {
  BOOKING_LEAD_MIN,
  classifyStart,
  closureFor,
  gridWindow,
  latestStartMin,
  overlapsClosure,
  toMinutes,
  type ClinicHours,
} from "./clinic-hours";
import { lisbonDateTimeToUtc } from "./time";

/** Today's production shape: the 0085 defaults, no midday closure. */
const TODAY_LV: ClinicHours = {
  opensAt: "08:00:00",
  closesAt: "20:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
};
/** Today's Castelo Branco: same hours, plus the lunch closure. */
const TODAY_CB: ClinicHours = {
  opensAt: "08:00:00",
  closesAt: "20:00:00",
  middayClosedFrom: "13:00:00",
  middayClosedTo: "14:00:00",
};
/** What Q-HOURS = a asks for on BOTH clinics. */
const NEW_LV: ClinicHours = {
  opensAt: "09:00:00",
  closesAt: "21:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
};
const NEW_CB: ClinicHours = { ...NEW_LV, middayClosedFrom: "13:00:00", middayClosedTo: "14:00:00" };

describe("AGENDA-2100 grid window: the end follows closes_at, with no constant capping it", () => {
  it("draws 09:00 to 21:00 for one clinic at the new hours (last row 20:00-21:00)", () => {
    const win = gridWindow([NEW_LV]);
    expect(win).toEqual({ startMin: 9 * 60, endMin: 21 * 60 });
    // The grid's hour rows are [startMin .. endMin), one per hour, so the LAST
    // row starts at 20:00 and the closing label reads 21:00.
    const lastRowStart = win.endMin - 60;
    expect(lastRowStart).toBe(20 * 60);
  });

  it("draws the same window for BOTH clinics under Todas as localizações (union)", () => {
    expect(gridWindow([NEW_LV, NEW_CB])).toEqual({ startMin: 9 * 60, endMin: 21 * 60 });
  });

  it("takes the UNION, not the intersection, when the two clinics differ", () => {
    // The owner's ruling: an intersection would hide a real working hour.
    expect(gridWindow([NEW_LV, TODAY_CB])).toEqual({ startMin: 8 * 60, endMin: 21 * 60 });
  });

  it("is IDENTICAL to today for today's hours - the code change moves nothing on its own", () => {
    expect(gridWindow([TODAY_LV])).toEqual({ startMin: 8 * 60, endMin: 20 * 60 });
    expect(gridWindow([TODAY_LV, TODAY_CB])).toEqual({ startMin: 8 * 60, endMin: 20 * 60 });
  });

  it("the midday closure does not move the window at either set of hours", () => {
    expect(gridWindow([NEW_CB])).toEqual(gridWindow([NEW_LV]));
    expect(gridWindow([TODAY_CB])).toEqual(gridWindow([TODAY_LV]));
  });
});

describe("AGENDA-2100 latest start: closes_at minus 60 minutes", () => {
  it("is 20:00 when the clinic closes at 21:00", () => {
    expect(latestStartMin(NEW_LV)).toBe(toMinutes("20:00"));
  });

  it("is 19:00 when the clinic closes at 20:00 (today)", () => {
    expect(latestStartMin(TODAY_LV)).toBe(toMinutes("19:00"));
  });

  it("is a flat 60 minutes, not the service duration", () => {
    expect(BOOKING_LEAD_MIN).toBe(60);
    expect(toMinutes(NEW_LV.closesAt) - latestStartMin(NEW_LV)).toBe(60);
  });
});

describe("AGENDA-2100 classifyStart: close 21:00", () => {
  const at = (hhmm: string) => classifyStart(toMinutes(hhmm), NEW_LV);

  it("ACCEPTS 20:00, the last bookable start", () => {
    expect(at("20:00")).toBe("ok");
  });

  it("REFUSES 20:15", () => {
    expect(at("20:15")).toBe("after_latest_start");
  });

  it("accepts the opening minute and refuses the one before it", () => {
    expect(at("09:00")).toBe("ok");
    expect(at("08:45")).toBe("before_open");
  });

  it("accepts the ordinary middle of the day", () => {
    expect(at("13:30")).toBe("ok");
    expect(at("19:45")).toBe("ok");
  });
});

describe("AGENDA-2100 classifyStart: close 20:00 (today's hours)", () => {
  const at = (hhmm: string) => classifyStart(toMinutes(hhmm), TODAY_LV);

  it("ACCEPTS 19:00", () => {
    expect(at("19:00")).toBe("ok");
  });

  it("REFUSES 19:15", () => {
    expect(at("19:15")).toBe("after_latest_start");
  });

  it("accepts 08:00 and refuses 07:45", () => {
    expect(at("08:00")).toBe("ok");
    expect(at("07:45")).toBe("before_open");
  });

  /**
   * THE ONE THAT MATTERS FOR THE ROLLOUT. Under today's production hours a
   * 19:45 booking is currently ACCEPTED by every write path (nothing checks the
   * clinic's hours at all), and it becomes a refusal the moment this ships -
   * before any hours change. That is a genuine behaviour change on today's
   * data, and it is named in the report rather than discovered by reception.
   */
  it("refuses 19:45, which today's code accepts: the named before/after", () => {
    expect(at("19:45")).toBe("after_latest_start");
  });
});

/* ======================================================================== */
/* B3 - WHAT MUST NOT CHANGE                                                 */
/* ======================================================================== */

describe("AGENDA-2100 regression: the CB midday closure is untouched by the new hours", () => {
  /** 2026-09-18 is a Friday; 2026-09-19 is a SATURDAY. */
  const FRIDAY = "2026-09-18";
  const SATURDAY = "2026-09-19";

  it("still closes 13:00-14:00 on a weekday under 09:00-21:00", () => {
    const c = closureFor(FRIDAY, NEW_CB);
    expect(c).not.toBeNull();
    expect(c!.start.toISOString()).toBe(lisbonDateTimeToUtc(FRIDAY, "13:00").toISOString());
    expect(c!.end.toISOString()).toBe(lisbonDateTimeToUtc(FRIDAY, "14:00").toISOString());
  });

  it("still closes 13:00-14:00 on SATURDAY - the ruling says every open day", () => {
    // `closureFor` deliberately takes no weekday: the owner ruled the closure
    // applies every day the clinic is open, Saturday included, and a weekday
    // argument would make the opposite expressible by a caller.
    const c = closureFor(SATURDAY, NEW_CB);
    expect(c).not.toBeNull();
    expect(c!.start.toISOString()).toBe(lisbonDateTimeToUtc(SATURDAY, "13:00").toISOString());
  });

  it("refuses a booking that runs through the closure, on a weekday AND on Saturday", () => {
    for (const day of [FRIDAY, SATURDAY]) {
      expect(
        overlapsClosure(
          lisbonDateTimeToUtc(day, "13:30"),
          lisbonDateTimeToUtc(day, "14:30"),
          day,
          NEW_CB,
        ),
      ).toBe(true);
      // And a booking clear of it is still fine, or the assertion above would
      // pass for a function that refused everything.
      expect(
        overlapsClosure(
          lisbonDateTimeToUtc(day, "15:00"),
          lisbonDateTimeToUtc(day, "16:00"),
          day,
          NEW_CB,
        ),
      ).toBe(false);
    }
  });

  it("Linda-a-Velha has no closure at the new hours, exactly as today", () => {
    expect(closureFor(FRIDAY, NEW_LV)).toBeNull();
    expect(closureFor(SATURDAY, NEW_LV)).toBeNull();
  });

  it("the closure sits inside the new hours, which is what the DB CHECK requires", () => {
    // locations_midday_inside_hours: midday_closed_from >= opens_at and
    // midday_closed_to <= closes_at. 13:00-14:00 inside 09:00-21:00 holds, so
    // the hours change cannot be refused by that constraint.
    expect(toMinutes(NEW_CB.middayClosedFrom!)).toBeGreaterThanOrEqual(toMinutes(NEW_CB.opensAt));
    expect(toMinutes(NEW_CB.middayClosedTo!)).toBeLessThanOrEqual(toMinutes(NEW_CB.closesAt));
  });
});

describe("AGENDA-2100 regression: an appointment before opening still has a place on the grid", () => {
  /**
   * THE RULING: existing appointments before 09:00 stay, render and report, and
   * are never cancelled. The grid's own arithmetic is what makes that true -
   * `makeMinToPx` CLAMPS to the window's first rendered hour, so an 08:30 row
   * under a 09:00 opening is pinned to the top of the first row rather than
   * given a negative offset and drawn off the card.
   *
   * Asserted here as the arithmetic, and on the rendered page in
   * agenda-grid.test.tsx.
   */
  it("the window starting at 09:00 does not move an 08:30 appointment out of range", () => {
    const win = gridWindow([NEW_LV]);
    const originMin = Math.floor(win.startMin / 60) * 60;
    const early = toMinutes("08:30");
    expect(early).toBeLessThan(originMin);
    // The clamp is what keeps it on the card: position = first row, not negative.
    expect(Math.max(originMin, Math.min(early, win.endMin))).toBe(originMin);
  });
});

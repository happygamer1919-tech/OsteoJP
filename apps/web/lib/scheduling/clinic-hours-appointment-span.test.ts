/**
 * AGENDA-NEVER-HIDES — the grid spans the clinics' hours UNION the appointments
 * actually loaded for the view.
 *
 * ==========================================================================
 * THE PRODUCTION DEFECT THIS PINS
 * ==========================================================================
 * Opening moved to 09:00 on 2026-09-16 and an existing 08:00 booking at
 * Linda-a-Velha became unreachable: `gridWindow` read the clinic's hours and
 * nothing else, so 08:00 was outside the window, `makeMinToPx` clamped it to the
 * first rendered hour, and the row was drawn on top of the 09:00 row and could
 * not be clicked. Hours change; bookings made under the old ones do not.
 *
 * These are pure-arithmetic cases, in the same file style as
 * clinic-hours-window.test.ts, which is left untouched: every assertion there
 * calls `gridWindow` with ONE argument and must keep its exact answer, so the
 * new parameter is optional and defaults to empty.
 */
import { describe, expect, it } from "vitest";

import { gridWindow, type ClinicHours } from "./clinic-hours";

/** The hours that caused the incident. */
const OPENS_NINE: ClinicHours = {
  opensAt: "09:00:00",
  closesAt: "21:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
};
/** Today's production shape, restored by GREEN. */
const OPENS_EIGHT: ClinicHours = {
  opensAt: "08:00:00",
  closesAt: "20:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
};

const span = (startMin: number, endMin: number) => ({ startMin, endMin });
const at = (h: number, m = 0) => h * 60 + m;

describe("no appointments: the window is exactly the clinic's hours, as before", () => {
  it("is unchanged when the list is omitted entirely", () => {
    expect(gridWindow([OPENS_NINE])).toEqual({ startMin: at(9), endMin: at(21) });
  });

  it("is unchanged when the list is explicitly empty", () => {
    expect(gridWindow([OPENS_NINE], [])).toEqual({ startMin: at(9), endMin: at(21) });
  });

  it("keeps the empty-clinic fallback", () => {
    expect(gridWindow([], [])).toEqual({ startMin: at(8), endMin: at(20) });
  });
});

describe("an appointment BEFORE opening widens the window down to its hour", () => {
  // THE REPORTED INCIDENT, as arithmetic.
  it("draws the 08:00 row when the clinic opens at 09:00", () => {
    const win = gridWindow([OPENS_NINE], [span(at(8), at(9))]);
    expect(win.startMin).toBe(at(8));
    expect(win.endMin).toBe(at(21));
  });

  it("rounds a half-hour start DOWN to its whole hour, because rows are hours", () => {
    expect(gridWindow([OPENS_NINE], [span(at(8, 30), at(9, 30))]).startMin).toBe(at(8));
  });

  it("takes the EARLIEST of several early bookings", () => {
    const win = gridWindow([OPENS_NINE], [span(at(8), at(9)), span(at(7, 15), at(8))]);
    expect(win.startMin).toBe(at(7));
  });
});

describe("an appointment AFTER closing widens the window up to its hour", () => {
  it("draws the 21:00 row for a 21:30 booking when the clinic closes at 21:00", () => {
    const win = gridWindow([OPENS_NINE], [span(at(21, 30), at(22, 30))]);
    // The 21:00 row exists only if the window ends ABOVE 21:00.
    expect(win.endMin).toBeGreaterThan(at(21));
    expect(win.endMin).toBe(at(23));
  });

  it("adds no row for a booking that ends exactly on the closing hour", () => {
    // 20:00-21:00 at a clinic closing 21:00 needs nothing extra: `ceil` of a
    // whole hour is that hour, which is why the end is not "floor plus one".
    expect(gridWindow([OPENS_NINE], [span(at(20), at(21))]).endMin).toBe(at(21));
  });

  it("a long booking that overruns the close still gets its last row", () => {
    // The repo allows an end after closes_at (clinic-hours.ts states it), so a
    // 20:00 start of a 90-minute service must not be clipped.
    expect(gridWindow([OPENS_NINE], [span(at(20), at(21, 30))]).endMin).toBe(at(22));
  });
});

describe("both ends at once, and the union with several clinics", () => {
  it("widens in both directions in one call", () => {
    const win = gridWindow([OPENS_NINE], [span(at(8), at(9)), span(at(21, 30), at(22))]);
    expect(win).toEqual({ startMin: at(8), endMin: at(22) });
  });

  it("still takes the clinic UNION under Todas as localizacoes, then adds the bookings", () => {
    const win = gridWindow([OPENS_NINE, OPENS_EIGHT], [span(at(7), at(8))]);
    expect(win).toEqual({ startMin: at(7), endMin: at(21) });
  });

  it("an appointment INSIDE the hours moves nothing", () => {
    expect(gridWindow([OPENS_NINE], [span(at(10), at(11))])).toEqual({
      startMin: at(9),
      endMin: at(21),
    });
  });

  it("with no clinics at all, the bookings still get their rows", () => {
    expect(gridWindow([], [span(at(6), at(7))]).startMin).toBe(at(6));
  });
});

describe("it refuses to be broken by bad input rather than producing Infinity", () => {
  it("skips a span carrying NaN", () => {
    expect(gridWindow([OPENS_NINE], [span(Number.NaN, Number.NaN)])).toEqual({
      startMin: at(9),
      endMin: at(21),
    });
  });

  it("treats an end BEFORE its start as ending at the start (a midnight roll-over)", () => {
    // lisbonMinutesFromMidnight of an end past midnight is a SMALL number; it
    // must not drag the window's end backwards below the clinic's close.
    expect(gridWindow([OPENS_NINE], [span(at(23), at(0, 30))]).endMin).toBe(at(24));
  });
});

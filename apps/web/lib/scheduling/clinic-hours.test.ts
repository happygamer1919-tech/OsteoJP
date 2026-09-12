/**
 * 0085 — the clinic's hours and its closure, as pure arithmetic.
 *
 * ==========================================================================
 * THE UNION IS THE ASSERTION THAT CARRIES AN OWNER RULING
 * ==========================================================================
 * "Todas as localizações shows the union of both clinics' hours" is a decision,
 * not a preference: an intersection hides a real working hour of whichever
 * clinic opens earlier, and the agenda would then be lying about a day it is
 * showing. It is asserted directly rather than left to the page.
 */
import { describe, expect, it } from "vitest";
import { closureFor, gridWindow, overlapsClosure, toMinutes, type ClinicHours } from "./clinic-hours";

const CB: ClinicHours = {
  opensAt: "08:00:00",
  closesAt: "20:00:00",
  middayClosedFrom: "13:00:00",
  middayClosedTo: "14:00:00",
};
const LV: ClinicHours = {
  opensAt: "07:00:00",
  closesAt: "21:00:00",
  middayClosedFrom: null,
  middayClosedTo: null,
};
const DATE = "2026-09-23"; // a Wednesday
const SAT = "2026-09-26";

describe("gridWindow", () => {
  it("is the UNION across clinics, not the intersection", () => {
    // LV opens an hour earlier and closes an hour later. An intersection would
    // hide both, on a grid that is showing LV.
    expect(gridWindow([CB, LV])).toEqual({ startMin: 7 * 60, endMin: 21 * 60 });
  });

  it("is that one clinic's own hours when one is selected", () => {
    expect(gridWindow([CB])).toEqual({ startMin: 8 * 60, endMin: 20 * 60 });
  });

  it("falls back to the old constants for an empty list", () => {
    // A tenant with no active locations gets a usable grid rather than a blank
    // one, and the fallback is exactly the behaviour that shipped before 0085.
    expect(gridWindow([])).toEqual({ startMin: 8 * 60, endMin: 20 * 60 });
  });
});

describe("closureFor", () => {
  it("returns the band for a clinic that has one", () => {
    const c = closureFor(DATE, CB)!;
    expect(c).not.toBeNull();
    expect(toMinutes("13:00")).toBe(780);
    expect(c.end.getTime() - c.start.getTime()).toBe(60 * 60 * 1000);
  });

  it("APPLIES ON SATURDAY - the owner ruled every day the clinic is open", () => {
    // The whole reason Option B was dropped. A weekday-varying closure is not
    // expressible here, and this asserts the ruling rather than the absence.
    expect(closureFor(SAT, CB)).not.toBeNull();
  });

  it("is null for a clinic with no closure", () => {
    expect(closureFor(DATE, LV)).toBeNull();
  });

  it("is null for a HALF-SET pair, which the database also refuses", () => {
    // A read path that guessed the missing end would be inventing a clinic's
    // opening hours. Both ends or no closure.
    const half = { ...CB, middayClosedTo: null };
    expect(closureFor(DATE, half)).toBeNull();
  });

  it("is null when there is no clinic in scope at all", () => {
    // "Todas as localizações": a closure is true of ONE clinic, so an answer
    // covering several must not carry it.
    expect(closureFor(DATE, null)).toBeNull();
  });
});

describe("overlapsClosure", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 23, h - 1, m)); // Lisbon = UTC+1

  it("ANY overlap counts, not containment", () => {
    // 13:45-14:45 runs through the closure. A clinic shut at 13:45 cannot see
    // somebody then, however the appointment ends.
    expect(overlapsClosure(at(13, 45), at(14, 45), DATE, CB)).toBe(true);
  });

  it("catches a booking that merely starts inside it", () => {
    expect(overlapsClosure(at(13, 30), at(14, 30), DATE, CB)).toBe(true);
  });

  it("catches one that straddles it entirely", () => {
    expect(overlapsClosure(at(12), at(15), DATE, CB)).toBe(true);
  });

  it("does NOT catch one that ends exactly when the closure starts", () => {
    // Half-open, like every other interval rule in this codebase: 12:00-13:00
    // finishes as the door closes and is a legal booking.
    expect(overlapsClosure(at(12), at(13), DATE, CB)).toBe(false);
  });

  it("does NOT catch one that starts exactly when the closure ends", () => {
    expect(overlapsClosure(at(14), at(15), DATE, CB)).toBe(false);
  });

  it("is false everywhere for a clinic with no closure", () => {
    expect(overlapsClosure(at(13), at(14), DATE, LV)).toBe(false);
  });
});

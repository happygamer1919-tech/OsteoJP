import { describe, expect, it } from "vitest";

import { isYmd, lisbonDayBounds, lisbonMonthsBefore, presetRange } from "./day-bounds";

// R29: Painel and Indicadores count days at Lisbon midnight, not UTC midnight.
//
// The GATE: a visit at 00:30 Lisbon on a summer-time date is counted on that
// Lisbon day, and winter dates are unchanged. "Counted on day D" is what the
// queries do with these bounds: start <= starts_at < end.

const within = (b: { start: Date | null; end: Date | null }, at: Date) =>
  (b.start === null || at.getTime() >= b.start.getTime()) && (b.end === null || at.getTime() < b.end.getTime());

const HOUR = 3_600_000;

describe("lisbonDayBounds: a period is [00:00 Lisbon on from, 00:00 Lisbon after to)", () => {
  it("GATE: a visit at 00:30 Lisbon on a summer date is counted on that Lisbon day", () => {
    // 2026-07-15 00:30 WEST (UTC+1) is 2026-07-14 23:30 UTC.
    const visit = new Date("2026-07-14T23:30:00.000Z");
    expect(within(lisbonDayBounds("2026-07-15", "2026-07-15"), visit)).toBe(true);
    // ... and NOT on the day before, which is where the UTC cut put it.
    expect(within(lisbonDayBounds("2026-07-14", "2026-07-14"), visit)).toBe(false);
  });

  it("CONTROL: the old UTC bounds did put that visit on the previous day", () => {
    // What the code did before R29, kept here so the gate above is not vacuous.
    const utcDay = (d: string) => ({
      start: new Date(`${d}T00:00:00.000Z`),
      end: new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 24 * HOUR),
    });
    const visit = new Date("2026-07-14T23:30:00.000Z");
    expect(within(utcDay("2026-07-15"), visit)).toBe(false);
    expect(within(utcDay("2026-07-14"), visit)).toBe(true);
  });

  it("a summer day's bounds are 23:00 UTC the evening before, both ends", () => {
    const b = lisbonDayBounds("2026-07-15", "2026-07-15");
    expect(b.start?.toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(b.end?.toISOString()).toBe("2026-07-15T23:00:00.000Z");
    // 23:59 Lisbon on the 15th is in; 00:00 Lisbon on the 16th is out.
    expect(within(b, new Date("2026-07-15T22:59:00.000Z"))).toBe(true);
    expect(within(b, new Date("2026-07-15T23:00:00.000Z"))).toBe(false);
  });

  it("winter dates are unchanged: Lisbon is UTC+0, so the bounds are the UTC midnights", () => {
    const b = lisbonDayBounds("2026-01-15", "2026-01-20");
    expect(b.start?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(b.end?.toISOString()).toBe("2026-01-21T00:00:00.000Z");
    const visit = new Date("2026-01-15T00:30:00.000Z"); // 00:30 WET
    expect(within(lisbonDayBounds("2026-01-15", "2026-01-15"), visit)).toBe(true);
    expect(within(lisbonDayBounds("2026-01-14", "2026-01-14"), visit)).toBe(false);
  });

  it("the day the clocks go forward (2026-03-29) is 23 hours long", () => {
    const b = lisbonDayBounds("2026-03-29", "2026-03-29");
    expect(b.start?.toISOString()).toBe("2026-03-29T00:00:00.000Z"); // 00:00 WET
    expect(b.end?.toISOString()).toBe("2026-03-29T23:00:00.000Z"); // 00:00 WEST on the 30th
    expect(b.end!.getTime() - b.start!.getTime()).toBe(23 * HOUR);
  });

  it("the day the clocks go back (2026-10-25) is 25 hours long", () => {
    const b = lisbonDayBounds("2026-10-25", "2026-10-25");
    expect(b.start?.toISOString()).toBe("2026-10-24T23:00:00.000Z"); // 00:00 WEST
    expect(b.end?.toISOString()).toBe("2026-10-26T00:00:00.000Z"); // 00:00 WET on the 26th
    expect(b.end!.getTime() - b.start!.getTime()).toBe(25 * HOUR);
    // 00:30 WEST on the 25th, and 23:30 WET the same evening, are both on the 25th.
    expect(within(b, new Date("2026-10-24T23:30:00.000Z"))).toBe(true);
    expect(within(b, new Date("2026-10-25T23:30:00.000Z"))).toBe(true);
  });

  it("an unset or malformed bound is open on that side", () => {
    expect(lisbonDayBounds(null, null)).toEqual({ start: null, end: null });
    expect(lisbonDayBounds(undefined, "2026-07-15").start).toBeNull();
    expect(lisbonDayBounds("2026-07-15", "").end).toBeNull();
    expect(lisbonDayBounds("15/07/2026", "2026-02-30")).toEqual({ start: null, end: null });
    expect(isYmd("2026-02-28")).toBe(true);
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2026-13-01")).toBe(false);
  });
});

describe("the Lisbon 'today' the default window and the presets count from", () => {
  it("00:30 Lisbon on a summer date is that date, not the UTC date before it", () => {
    const now = new Date("2026-07-14T23:30:00.000Z"); // 2026-07-15 00:30 WEST
    expect(lisbonMonthsBefore(now, 12)).toBe("2025-07-15");
    expect(presetRange("thisMonth", now)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
    expect(presetRange("last3", now)).toEqual({ from: "2026-04-15", to: "2026-07-15" });
  });

  it("the first of a month and of a year in Lisbon start that month and that year", () => {
    const nyd = new Date("2026-12-31T23:30:00.000Z"); // 2026-12-31 23:30 WET: still the 31st
    expect(presetRange("thisYear", nyd)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    const aug1 = new Date("2026-07-31T23:30:00.000Z"); // 2026-08-01 00:30 WEST
    expect(presetRange("thisMonth", aug1)).toEqual({ from: "2026-08-01", to: "2026-08-01" });
    expect(presetRange("thisYear", aug1)).toEqual({ from: "2026-01-01", to: "2026-08-01" });
  });

  it("winter: unchanged from the UTC date", () => {
    const now = new Date("2026-01-15T00:30:00.000Z");
    expect(presetRange("last12", now)).toEqual({ from: "2025-01-15", to: "2026-01-15" });
    expect(presetRange("all", now)).toEqual({ from: null, to: null });
  });
});

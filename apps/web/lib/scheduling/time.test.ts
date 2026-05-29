import { describe, expect, it } from "vitest";
import {
  addDays,
  isoWeekdayMon0,
  lisbonDateTimeToUtc,
  lisbonMidnightUtc,
  lisbonMinutesFromMidnight,
  lisbonParts,
  rangeForView,
  startOfWeekMonday,
  viewDates,
} from "./time";

describe("calendar arithmetic", () => {
  it("adds and subtracts days across month boundaries", () => {
    expect(addDays("2026-04-14", 4)).toBe("2026-04-18");
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("maps weekday to Monday=0", () => {
    expect(isoWeekdayMon0("2026-04-14")).toBe(1); // Tuesday
    expect(isoWeekdayMon0("2026-04-13")).toBe(0); // Monday
    expect(isoWeekdayMon0("2026-04-19")).toBe(6); // Sunday
  });

  it("finds the Monday of a week", () => {
    expect(startOfWeekMonday("2026-04-15")).toBe("2026-04-13");
    expect(startOfWeekMonday("2026-04-13")).toBe("2026-04-13");
  });

  it("renders Mon–Fri for the week view", () => {
    expect(viewDates("week", "2026-04-15")).toEqual([
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
    ]);
    expect(viewDates("day", "2026-04-15")).toEqual(["2026-04-15"]);
  });
});

describe("UTC <-> Lisbon", () => {
  it("converts Lisbon midnight to UTC in summer (WEST, +1)", () => {
    // April 14 2026 is within Portuguese DST → Lisbon is UTC+1.
    expect(lisbonMidnightUtc("2026-04-14").toISOString()).toBe(
      "2026-04-13T23:00:00.000Z",
    );
  });

  it("converts Lisbon midnight to UTC in winter (WET, +0)", () => {
    expect(lisbonMidnightUtc("2026-01-15").toISOString()).toBe(
      "2026-01-15T00:00:00.000Z",
    );
  });

  it("reads Lisbon wall-clock parts from a UTC instant", () => {
    const p = lisbonParts(new Date("2026-04-14T08:30:00Z")); // +1 → 09:30
    expect(p).toEqual({ date: "2026-04-14", hour: 9, minute: 30 });
  });

  it("computes minutes from Lisbon midnight", () => {
    expect(lisbonMinutesFromMidnight(new Date("2026-04-14T08:30:00Z"))).toBe(
      9 * 60 + 30,
    );
  });

  it("round-trips a date + time back to UTC", () => {
    expect(lisbonDateTimeToUtc("2026-04-14", "09:30").toISOString()).toBe(
      "2026-04-14T08:30:00.000Z",
    );
  });
});

describe("rangeForView", () => {
  it("spans the rendered week as a half-open UTC range", () => {
    const { startUtc, endUtc } = rangeForView("week", "2026-04-15");
    // Mon 2026-04-13 00:00 Lisbon .. Sat 2026-04-18 00:00 Lisbon (exclusive)
    expect(startUtc.toISOString()).toBe("2026-04-12T23:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-04-17T23:00:00.000Z");
  });
});

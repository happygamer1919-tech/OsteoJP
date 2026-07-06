import { describe, expect, it } from "vitest";
import {
  addDays,
  formatTimeOfDay,
  isoWeekdayMon0,
  lisbonDateTimeToUtc,
  lisbonMidnightUtc,
  lisbonMinutesFromMidnight,
  lisbonParts,
  rangeForView,
  slotLabel,
  startOfWeekMonday,
  viewDates,
} from "./time";

describe("24h time formatting (W3-08)", () => {
  it("formatTimeOfDay renders 24h HH:mm with no meridiem", () => {
    // 14:30 Lisbon (WET/UTC+0 in January) — must be "14:30", never "2:30 PM".
    const t = formatTimeOfDay(new Date("2026-01-05T14:30:00Z"));
    expect(t).toBe("14:30");
    expect(t).not.toMatch(/[ap]\.?m\.?/i);
  });

  it("formatTimeOfDay pads a morning time and midnight to 2 digits", () => {
    expect(formatTimeOfDay(new Date("2026-01-05T09:05:00Z"))).toBe("09:05");
    expect(formatTimeOfDay(new Date("2026-01-05T00:00:00Z"))).toBe("00:00");
  });

  it("slotLabel renders 24h HH:mm across the afternoon (13:00, 20:00)", () => {
    expect(slotLabel(13 * 60)).toBe("13:00");
    expect(slotLabel(20 * 60)).toBe("20:00");
  });
});

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

  it("renders Mon–Sat (6 days) for the week view", () => {
    // W3-08: the week view includes Saturday (2026-04-18), never Sunday.
    expect(viewDates("week", "2026-04-15")).toEqual([
      "2026-04-13", // Mon
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18", // Sat
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
    // W3-08: 6-day week — Mon 2026-04-13 00:00 Lisbon .. Sun 2026-04-19 00:00
    // Lisbon (exclusive), so the range now covers Saturday 2026-04-18.
    expect(startUtc.toISOString()).toBe("2026-04-12T23:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-04-18T23:00:00.000Z");
  });
});

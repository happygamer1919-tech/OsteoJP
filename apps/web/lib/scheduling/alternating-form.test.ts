import { describe, expect, it } from "vitest";
import { alternatingBlockingReasons, defaultAlternatingWindow } from "./alternating-form";

const ok = {
  weekdays: [1, 2, 3, 4, 5],
  startDate: "2026-09-07",
  endDate: "2026-11-01",
  locationAId: "loc-a",
  locationBId: "loc-b",
  startTime: "09:00",
  endTime: "17:00",
};

describe("alternatingBlockingReasons", () => {
  it("says nothing about a form that can be saved", () => {
    expect(alternatingBlockingReasons(ok)).toEqual([]);
  });

  it("names EVERY reason at once, not the first one found", () => {
    // The point of the list: a reception user fixing one thing must not be sent
    // back for a second, then a third. All four are true at once here.
    const reasons = alternatingBlockingReasons({
      ...ok,
      weekdays: [],
      startDate: "",
      locationBId: "loc-a",
      endTime: "09:00",
    });
    expect(reasons).toEqual([
      "schedule.altBlockNoWeekday",
      "schedule.altBlockNoStart",
      "schedule.altBlockSameClinic",
      "schedule.altBlockEndTimeNotAfterStart",
    ]);
  });

  it("reports an empty end date once, not twice", () => {
    // "no end date" and "the end is before the start" are the same gap; saying
    // both would be two sentences about one empty field.
    expect(alternatingBlockingReasons({ ...ok, endDate: "" })).toEqual(["schedule.altBlockNoEnd"]);
  });

  it("catches an end date before the start", () => {
    expect(alternatingBlockingReasons({ ...ok, endDate: "2026-09-06" })).toEqual([
      "schedule.altBlockEndBeforeStart",
    ]);
  });

  it("accepts a single-day window and a single weekday", () => {
    expect(alternatingBlockingReasons({ ...ok, weekdays: [3], endDate: ok.startDate })).toEqual([]);
  });

  it("catches an end time EQUAL to the start, not only one before it", () => {
    expect(alternatingBlockingReasons({ ...ok, endTime: "09:00" })).toEqual([
      "schedule.altBlockEndTimeNotAfterStart",
    ]);
  });

  it("distinguishes an unset clinic from two identical ones", () => {
    expect(alternatingBlockingReasons({ ...ok, locationBId: "" })).toEqual(["schedule.altBlockNoClinic"]);
    expect(alternatingBlockingReasons({ ...ok, locationBId: ok.locationAId })).toEqual([
      "schedule.altBlockSameClinic",
    ]);
  });
});

describe("defaultAlternatingWindow", () => {
  it("starts on the NEXT Monday from any day of the week", () => {
    // 2026-09-03 is a Thursday; the week that follows begins 2026-09-07.
    const cases: Array<[string, string]> = [
      ["2026-09-06", "2026-09-07"], // Sunday  -> tomorrow
      ["2026-09-07", "2026-09-14"], // Monday  -> the NEXT one, never today
      ["2026-09-08", "2026-09-14"], // Tuesday
      ["2026-09-09", "2026-09-14"], // Wednesday
      ["2026-09-10", "2026-09-14"], // Thursday
      ["2026-09-11", "2026-09-14"], // Friday
      ["2026-09-12", "2026-09-14"], // Saturday
    ];
    for (const [today, expected] of cases) {
      expect(defaultAlternatingWindow(today).startDate, today).toBe(expected);
    }
  });

  it("spans eight whole weeks, so the pattern ends on a cycle boundary", () => {
    const { startDate, endDate } = defaultAlternatingWindow("2026-09-03");
    const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
    expect(days).toBe(55); // inclusive of both ends: 56 days = 8 weeks = 4 A + 4 B
    expect(new Date(`${endDate}T12:00:00Z`).getUTCDay()).toBe(0); // ends on a Sunday
  });

  it("crosses a month and a year boundary without arithmetic of its own", () => {
    expect(defaultAlternatingWindow("2026-12-29")).toEqual({
      startDate: "2027-01-04",
      endDate: "2027-02-28",
    });
  });

  it("produces a window the form accepts", () => {
    const window = defaultAlternatingWindow("2026-09-03");
    expect(alternatingBlockingReasons({ ...ok, ...window })).toEqual([]);
  });
});

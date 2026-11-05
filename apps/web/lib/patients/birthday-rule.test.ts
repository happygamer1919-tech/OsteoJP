import { describe, expect, it } from "vitest";

import {
  ageTurning,
  birthdayMonthDays,
  celebratesOn,
  isLeapYear,
  lisbonDay,
} from "./birthday-rule";

/**
 * Indicação de Aniversários: the date rule (docs/DECISIONS.md, 2026-11-02).
 * Today is the LISBON calendar day; a 29 February birthday shows on
 * 28 February in a non-leap year.
 */

describe("lisbonDay: today is the Lisbon calendar day, not the UTC one", () => {
  it("just after midnight in SUMMER (WEST, UTC+1) Lisbon is already on the next day while UTC is not", () => {
    // 23:30 UTC on 15 July is 00:30 on 16 July in Lisbon.
    const now = new Date("2026-07-15T23:30:00.000Z");
    expect(now.getUTCDate()).toBe(15);
    expect(lisbonDay(now)).toEqual({ year: 2026, month: 7, day: 16 });
  });

  it("the exact summer midnight boundary: 22:59:59 UTC is still the 15th, 23:00 UTC is the 16th", () => {
    expect(lisbonDay(new Date("2026-07-15T22:59:59.000Z"))).toEqual({ year: 2026, month: 7, day: 15 });
    expect(lisbonDay(new Date("2026-07-15T23:00:00.000Z"))).toEqual({ year: 2026, month: 7, day: 16 });
  });

  it("in WINTER (WET, UTC+0) Lisbon and UTC change day together", () => {
    expect(lisbonDay(new Date("2026-01-15T23:30:00.000Z"))).toEqual({ year: 2026, month: 1, day: 15 });
    expect(lisbonDay(new Date("2026-01-16T00:00:00.000Z"))).toEqual({ year: 2026, month: 1, day: 16 });
  });

  it("New Year's Eve at 23:30 UTC in winter is still 31 December in Lisbon", () => {
    expect(lisbonDay(new Date("2026-12-31T23:30:00.000Z"))).toEqual({ year: 2026, month: 12, day: 31 });
  });
});

describe("a summer birthday just after Lisbon midnight", () => {
  const justAfterMidnight = lisbonDay(new Date("2026-07-15T23:30:00.000Z"));

  it("a 16 July birthday celebrates; the 15 July one (the UTC day) does not", () => {
    expect(celebratesOn("1980-07-16", justAfterMidnight)).toBe(true);
    expect(celebratesOn("1980-07-15", justAfterMidnight)).toBe(false);
  });
});

describe("29 February", () => {
  it("knows the leap years, including the century rules", () => {
    expect([2024, 2028, 2000, 2400].map(isLeapYear)).toEqual([true, true, true, true]);
    expect([2026, 2027, 1900, 2100].map(isLeapYear)).toEqual([false, false, false, false]);
  });

  it("shows on 28 February in a NON-leap year, beside the real 28 February birthdays", () => {
    const today = { year: 2027, month: 2, day: 28 };
    expect(birthdayMonthDays(today)).toEqual(["02-28", "02-29"]);
    expect(celebratesOn("2000-02-29", today)).toBe(true);
    expect(celebratesOn("1999-02-28", today)).toBe(true);
  });

  it("in a LEAP year shows on 29 February only, never twice", () => {
    expect(birthdayMonthDays({ year: 2028, month: 2, day: 28 })).toEqual(["02-28"]);
    expect(celebratesOn("2000-02-29", { year: 2028, month: 2, day: 28 })).toBe(false);
    expect(birthdayMonthDays({ year: 2028, month: 2, day: 29 })).toEqual(["02-29"]);
    expect(celebratesOn("2000-02-29", { year: 2028, month: 2, day: 29 })).toBe(true);
  });

  it("does not show on 1 March in a non-leap year", () => {
    expect(celebratesOn("2000-02-29", { year: 2027, month: 3, day: 1 })).toBe(false);
    expect(birthdayMonthDays({ year: 2027, month: 3, day: 1 })).toEqual(["03-01"]);
  });

  it("the age is the one they turn that year, leap or not", () => {
    expect(ageTurning("2000-02-29", { year: 2027, month: 2, day: 28 })).toBe(27);
    expect(ageTurning("2000-02-29", { year: 2028, month: 2, day: 29 })).toBe(28);
  });
});

describe("an ordinary day", () => {
  it("matches the month and the day, never the day alone", () => {
    const today = { year: 2026, month: 11, day: 2 };
    expect(birthdayMonthDays(today)).toEqual(["11-02"]);
    expect(celebratesOn("1985-11-02", today)).toBe(true);
    expect(celebratesOn("1985-10-02", today)).toBe(false);
    expect(celebratesOn("1985-11-20", today)).toBe(false);
  });

  it("the age is this Lisbon year minus the birth year", () => {
    expect(ageTurning("1985-11-02", { year: 2026, month: 11, day: 2 })).toBe(41);
  });
});

import { describe, it, expect } from "vitest";
import {
  AGE_BUCKETS,
  ageBucket,
  ageDistribution,
  ageInYears,
  categoryCounts,
  pivotSeries,
} from "./kpi-transform";

const REF = new Date("2026-07-16T12:00:00.000Z");

describe("ageInYears / ageBucket (W8-03)", () => {
  it("computes whole years, respecting the birthday not yet reached", () => {
    expect(ageInYears("2000-01-01", REF)).toBe(26);
    expect(ageInYears("2000-12-31", REF)).toBe(25); // birthday later this year
    expect(ageInYears("2026-07-16", REF)).toBe(0);
  });
  it("returns null for missing/malformed dates", () => {
    expect(ageInYears(null, REF)).toBeNull();
    expect(ageInYears("not-a-date", REF)).toBeNull();
  });
  it("buckets ages into the fixed ranges", () => {
    expect(ageBucket(5)).toBe("0-17");
    expect(ageBucket(17)).toBe("0-17");
    expect(ageBucket(18)).toBe("18-29");
    expect(ageBucket(44)).toBe("30-44");
    expect(ageBucket(59)).toBe("45-59");
    expect(ageBucket(60)).toBe("60+");
    expect(ageBucket(null)).toBe("desconhecido");
  });
});

describe("ageDistribution", () => {
  it("returns every bucket in fixed order, counting each birth date once", () => {
    const dist = ageDistribution(["2000-01-01", "2010-01-01", null, "1950-01-01", "2015-06-01"], REF);
    expect(dist.map((d) => d.bucket)).toEqual([...AGE_BUCKETS]);
    const by = Object.fromEntries(dist.map((d) => [d.bucket, d.count]));
    expect(by["18-29"]).toBe(1); // 2000 -> 26
    expect(by["0-17"]).toBe(2); // 2010 -> 16, 2015 -> 11
    expect(by["60+"]).toBe(1); // 1950 -> 76
    expect(by["desconhecido"]).toBe(1);
  });
});

describe("categoryCounts", () => {
  it("counts, sorts by count desc then label, and labels empties", () => {
    const r = categoryCounts(["Google", "Amigo", "Google", null, "  ", "Google", "Amigo"], "Sem origem");
    expect(r).toEqual([
      { label: "Google", count: 3 },
      { label: "Amigo", count: 2 },
      { label: "Sem origem", count: 2 },
    ]);
  });
  it("applies a top-N cap", () => {
    const r = categoryCounts(["a", "a", "b", "c"], "-", 2);
    expect(r.map((x) => x.label)).toEqual(["a", "b"]);
  });
});

describe("pivotSeries", () => {
  it("pivots flat rows into recharts rows with 0-filled missing cells, periods sorted", () => {
    const { periods, series } = pivotSeries([
      { period: "2026-02", series: "Ana", value: 3 },
      { period: "2026-01", series: "Ana", value: 1 },
      { period: "2026-01", series: "Rui", value: 2 },
    ]);
    expect(series).toEqual(["Ana", "Rui"]);
    expect(periods).toEqual([
      { period: "2026-01", Ana: 1, Rui: 2 },
      { period: "2026-02", Ana: 3, Rui: 0 },
    ]);
  });
});

describe("ageInYears counts on the Lisbon date (R52)", () => {
  it("summer: at 00:30 Lisbon on the birthday (23:30 UTC the day before) the new age counts", () => {
    // 2026-07-16 00:30 WEST (UTC+1) is 2026-07-15 23:30 UTC.
    const ref = new Date("2026-07-15T23:30:00.000Z");
    expect(ageInYears("2000-07-16", ref)).toBe(26);
  });
  it("summer: at 23:30 Lisbon on the day before the birthday the old age stays", () => {
    // 2026-07-15 23:30 WEST is 2026-07-15 22:30 UTC.
    const ref = new Date("2026-07-15T22:30:00.000Z");
    expect(ageInYears("2000-07-16", ref)).toBe(25);
  });
  it("winter: Lisbon is UTC+0, so the birthday starts at 00:00 UTC", () => {
    // 2026-01-15 23:30 WET is 2026-01-15 23:30 UTC: still the day before.
    expect(ageInYears("2000-01-16", new Date("2026-01-15T23:30:00.000Z"))).toBe(25);
    // 2026-01-16 00:30 WET is 2026-01-16 00:30 UTC: the birthday.
    expect(ageInYears("2000-01-16", new Date("2026-01-16T00:30:00.000Z"))).toBe(26);
  });
  it("an 18th birthday at 00:30 Lisbon in summer moves the patient into 18-29", () => {
    const dist = ageDistribution(["2008-07-16"], new Date("2026-07-15T23:30:00.000Z"));
    const by = Object.fromEntries(dist.map((d) => [d.bucket, d.count]));
    expect(by["18-29"]).toBe(1);
    expect(by["0-17"]).toBe(0);
  });
});

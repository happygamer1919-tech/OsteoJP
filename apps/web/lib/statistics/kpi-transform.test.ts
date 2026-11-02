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

describe("ageInYears edge days on the Lisbon date (R52)", () => {
  it("2026-03-29, clocks go forward at 01:00 UTC: Lisbon midnight is still 00:00 UTC", () => {
    // 23:30 WET on 03-28 is 23:30 UTC: the day before.
    expect(ageInYears("2000-03-29", new Date("2026-03-28T23:30:00.000Z"))).toBe(25);
    // 00:30 WET on 03-29 is 00:30 UTC, before the change: the birthday.
    expect(ageInYears("2000-03-29", new Date("2026-03-29T00:30:00.000Z"))).toBe(26);
    // 02:30 WEST on 03-29 is 01:30 UTC, after the change: still the birthday.
    expect(ageInYears("2000-03-29", new Date("2026-03-29T01:30:00.000Z"))).toBe(26);
  });
  it("2026-10-25, clocks go back at 01:00 UTC: Lisbon midnight is 23:00 UTC the day before", () => {
    // 23:30 WEST on 10-24 is 22:30 UTC: the day before.
    expect(ageInYears("2000-10-25", new Date("2026-10-24T22:30:00.000Z"))).toBe(25);
    // 00:30 WEST on 10-25 is 23:30 UTC on 10-24: the birthday.
    expect(ageInYears("2000-10-25", new Date("2026-10-24T23:30:00.000Z"))).toBe(26);
    // 01:30 WET on 10-25 (after the change) is 01:30 UTC: still the birthday.
    expect(ageInYears("2000-10-25", new Date("2026-10-25T01:30:00.000Z"))).toBe(26);
  });
  it("a 29 February birthday in a non-leap year: the new age comes on 1 March, as before R52", () => {
    expect(ageInYears("2000-02-29", new Date("2026-02-28T23:30:00.000Z"))).toBe(25);
    expect(ageInYears("2000-02-29", new Date("2026-03-01T00:30:00.000Z"))).toBe(26);
  });
  it("New Year's Eve in winter: the year turns at 00:00 UTC, as Lisbon is UTC+0", () => {
    expect(ageInYears("2000-01-01", new Date("2026-12-31T23:30:00.000Z"))).toBe(26);
    expect(ageInYears("2000-01-01", new Date("2027-01-01T00:30:00.000Z"))).toBe(27);
    expect(ageInYears("2000-12-31", new Date("2026-12-31T23:30:00.000Z"))).toBe(26);
  });
});

describe("ageDistribution works out the Lisbon date once (R52)", () => {
  it("gives the same buckets as bucketing each patient with ageInYears", () => {
    const dobs = [
      "2000-07-16", "2008-07-16", "2008-07-17", "1966-07-16", "1966-07-17", "1981-07-16",
      "1997-07-16", "2000-02-29", "2000-03-29", "2000-10-25", "2000-01-01", "2000-12-31",
      "1940-05-05", "2026-07-16", "2030-01-01", null, "not-a-date",
    ];
    const refs = [
      "2026-07-15T22:30:00.000Z", "2026-07-15T23:30:00.000Z", "2026-07-16T12:00:00.000Z",
      "2026-03-28T23:30:00.000Z", "2026-03-29T00:30:00.000Z", "2026-10-24T22:30:00.000Z",
      "2026-10-24T23:30:00.000Z", "2026-02-28T23:30:00.000Z", "2026-03-01T00:30:00.000Z",
      "2026-12-31T23:30:00.000Z", "2027-01-01T00:30:00.000Z",
    ].map((iso) => new Date(iso));
    for (const ref of refs) {
      const expected = new Map<string, number>(AGE_BUCKETS.map((b) => [b, 0]));
      for (const dob of dobs) {
        const b = ageBucket(ageInYears(dob, ref));
        expected.set(b, (expected.get(b) ?? 0) + 1);
      }
      expect(ageDistribution(dobs, ref), ref.toISOString()).toEqual(
        AGE_BUCKETS.map((bucket) => ({ bucket, count: expected.get(bucket) ?? 0 })),
      );
    }
  });
});

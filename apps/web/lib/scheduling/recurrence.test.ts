import { describe, expect, it } from "vitest";
import {
  clampCount,
  expandRecurrence,
  MAX_OCCURRENCES,
  parseRRule,
  stepDate,
  toRRule,
} from "./recurrence";

describe("stepDate", () => {
  it("steps each frequency", () => {
    expect(stepDate("2026-04-14", "daily", 3)).toBe("2026-04-17");
    expect(stepDate("2026-04-14", "weekly", 2)).toBe("2026-04-28");
    expect(stepDate("2026-04-14", "biweekly", 2)).toBe("2026-05-12");
    expect(stepDate("2026-01-31", "monthly", 1)).toBe("2026-02-28"); // clamps
  });
});

describe("expandRecurrence", () => {
  it("generates `count` occurrences including the first", () => {
    const occ = expandRecurrence("2026-04-14", "09:00", 60, {
      freq: "weekly",
      count: 3,
    });
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-04-14T08:00:00.000Z", // WEST (+1) → 09:00 Lisbon
      "2026-04-21T08:00:00.000Z",
      "2026-04-28T08:00:00.000Z",
    ]);
    expect(occ[0].endsAt.toISOString()).toBe("2026-04-14T09:00:00.000Z");
  });

  it("preserves Lisbon wall-clock across the autumn DST change", () => {
    // Portugal leaves DST on 2026-10-25; 09:00 Lisbon must stay 09:00 both weeks.
    const occ = expandRecurrence("2026-10-20", "09:00", 45, {
      freq: "weekly",
      count: 2,
    });
    expect(occ[0].startsAt.toISOString()).toBe("2026-10-20T08:00:00.000Z"); // +1
    expect(occ[1].startsAt.toISOString()).toBe("2026-10-27T09:00:00.000Z"); // +0
  });

  it("clamps the count to the max", () => {
    expect(
      expandRecurrence("2026-04-14", "09:00", 60, {
        freq: "daily",
        count: 999,
      }).length,
    ).toBe(MAX_OCCURRENCES);
  });
});

describe("clampCount", () => {
  it("bounds to [1, MAX]", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-5)).toBe(1);
    expect(clampCount(10)).toBe(10);
    expect(clampCount(1000)).toBe(MAX_OCCURRENCES);
    expect(clampCount(NaN)).toBe(1);
  });
});

describe("toRRule / parseRRule", () => {
  it("round-trips each frequency", () => {
    for (const freq of ["daily", "weekly", "biweekly", "monthly"] as const) {
      const spec = { freq, count: 6 };
      expect(parseRRule(toRRule(spec))).toEqual(spec);
    }
  });

  it("maps WEEKLY;INTERVAL=2 to biweekly", () => {
    expect(toRRule({ freq: "biweekly", count: 4 })).toBe(
      "FREQ=WEEKLY;INTERVAL=2;COUNT=4",
    );
  });

  it("returns null for junk or missing count", () => {
    expect(parseRRule(null)).toBeNull();
    expect(parseRRule("")).toBeNull();
    expect(parseRRule("FREQ=YEARLY;COUNT=3")).toBeNull();
    expect(parseRRule("FREQ=WEEKLY")).toBeNull();
  });
});

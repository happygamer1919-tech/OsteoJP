import { describe, expect, it } from "vitest";
import { timesOverlap } from "./availability-core";

describe("timesOverlap (W2-12 working-hours overlap validation)", () => {
  it("detects overlapping intervals", () => {
    expect(timesOverlap("09:00", "12:00", "11:00", "13:00")).toBe(true);
    expect(timesOverlap("09:00", "17:00", "10:00", "11:00")).toBe(true); // contained
    expect(timesOverlap("10:00", "11:00", "09:00", "17:00")).toBe(true); // container
  });

  it("treats touching (end == start) as NOT overlapping", () => {
    expect(timesOverlap("09:00", "12:00", "12:00", "15:00")).toBe(false);
    expect(timesOverlap("12:00", "15:00", "09:00", "12:00")).toBe(false);
  });

  it("returns false for disjoint intervals", () => {
    expect(timesOverlap("09:00", "10:00", "14:00", "15:00")).toBe(false);
  });
});

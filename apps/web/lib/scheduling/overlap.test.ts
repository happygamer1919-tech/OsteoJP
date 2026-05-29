import { describe, expect, it } from "vitest";
import { hasConflict, intervalsOverlap, isValidInterval } from "./overlap";

const at = (iso: string) => new Date(iso);

describe("intervalsOverlap", () => {
  it("detects a partial overlap", () => {
    expect(
      intervalsOverlap(
        at("2026-04-14T09:00:00Z"),
        at("2026-04-14T10:00:00Z"),
        at("2026-04-14T09:30:00Z"),
        at("2026-04-14T10:30:00Z"),
      ),
    ).toBe(true);
  });

  it("treats the end instant as exclusive (back-to-back is fine)", () => {
    expect(
      intervalsOverlap(
        at("2026-04-14T09:00:00Z"),
        at("2026-04-14T10:00:00Z"),
        at("2026-04-14T10:00:00Z"),
        at("2026-04-14T11:00:00Z"),
      ),
    ).toBe(false);
  });

  it("detects full containment", () => {
    expect(
      intervalsOverlap(
        at("2026-04-14T09:00:00Z"),
        at("2026-04-14T11:00:00Z"),
        at("2026-04-14T09:30:00Z"),
        at("2026-04-14T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns false for disjoint intervals", () => {
    expect(
      intervalsOverlap(
        at("2026-04-14T09:00:00Z"),
        at("2026-04-14T10:00:00Z"),
        at("2026-04-14T11:00:00Z"),
        at("2026-04-14T12:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("hasConflict", () => {
  const candidate = {
    start: at("2026-04-14T09:00:00Z"),
    end: at("2026-04-14T10:00:00Z"),
  };

  it("is false against an empty set", () => {
    expect(hasConflict(candidate, [])).toBe(false);
  });

  it("is true when any existing interval overlaps", () => {
    expect(
      hasConflict(candidate, [
        { start: at("2026-04-14T11:00:00Z"), end: at("2026-04-14T12:00:00Z") },
        { start: at("2026-04-14T09:45:00Z"), end: at("2026-04-14T10:15:00Z") },
      ]),
    ).toBe(true);
  });
});

describe("isValidInterval", () => {
  it("requires end strictly after start", () => {
    expect(isValidInterval(at("2026-04-14T09:00:00Z"), at("2026-04-14T10:00:00Z"))).toBe(true);
    expect(isValidInterval(at("2026-04-14T10:00:00Z"), at("2026-04-14T10:00:00Z"))).toBe(false);
    expect(isValidInterval(at("2026-04-14T10:00:00Z"), at("2026-04-14T09:00:00Z"))).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(isValidInterval(new Date("nope"), at("2026-04-14T10:00:00Z"))).toBe(false);
  });
});

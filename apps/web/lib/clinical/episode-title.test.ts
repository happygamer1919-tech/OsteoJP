import { describe, expect, it } from "vitest";
import { defaultEpisodeTitle, normalizeEpisodeTitle } from "./episode-title";

describe("normalizeEpisodeTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeEpisodeTitle("  Lombalgia   aguda  ")).toBe("Lombalgia aguda");
  });

  it("returns empty for blank input (caller rejects it)", () => {
    expect(normalizeEpisodeTitle("   ")).toBe("");
    expect(normalizeEpisodeTitle("")).toBe("");
  });

  it("clamps to 200 chars", () => {
    expect(normalizeEpisodeTitle("a".repeat(250))).toHaveLength(200);
  });
});

describe("defaultEpisodeTitle", () => {
  // 2026-06-08 12:00 UTC → 13:00 Lisbon (WEST), still 8 June.
  const instant = new Date("2026-06-08T12:00:00Z");

  it("appends a stable dd/mm/yyyy date to the localized word", () => {
    expect(defaultEpisodeTitle("Episódio", instant)).toBe("Episódio — 08/06/2026");
    expect(defaultEpisodeTitle("Episode", instant)).toBe("Episode — 08/06/2026");
  });

  it("renders the date in Europe/Lisbon, not UTC", () => {
    // 2026-06-08 23:30 UTC is already 9 June 00:30 in Lisbon.
    const lateUtc = new Date("2026-06-08T23:30:00Z");
    expect(defaultEpisodeTitle("Episode", lateUtc)).toBe("Episode — 09/06/2026");
  });
});

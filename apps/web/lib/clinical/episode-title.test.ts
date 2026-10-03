import { describe, expect, it } from "vitest";
import { EPISODE_SPECIALTIES, defaultEpisodeTitle, isEpisodeSpecialty, normalizeEpisodeTitle } from "./episode-title";

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

  it("appends a parenthesised dd/mm/yyyy date with no em/en dash", () => {
    expect(defaultEpisodeTitle("Episódio", instant)).toBe("Episódio (08/06/2026)");
    expect(defaultEpisodeTitle("Episode", instant)).toBe("Episode (08/06/2026)");
    expect(defaultEpisodeTitle("Episódio", instant)).not.toMatch(/[–—]/);
  });

  it("renders the date in Europe/Lisbon, not UTC", () => {
    // 2026-06-08 23:30 UTC is already 9 June 00:30 in Lisbon.
    const lateUtc = new Date("2026-06-08T23:30:00Z");
    expect(defaultEpisodeTitle("Episode", lateUtc)).toBe("Episode (09/06/2026)");
  });
});

describe("isEpisodeSpecialty (EPI-01b, Q7): the only words a new episode's title may take from an imported group", () => {
  it("admits exactly the two specialties the importer writes", () => {
    expect(EPISODE_SPECIALTIES).toEqual(["Osteopatia", "Fisioterapia"]);
    expect(isEpisodeSpecialty("Osteopatia")).toBe(true);
    expect(isEpisodeSpecialty("Fisioterapia")).toBe(true);
  });

  it("refuses anything else: another word, free text, a near miss, a non-string", () => {
    for (const v of ["", "Episódio", "osteopatia", " Osteopatia", "Osteopatia ", "Osteopatia (02/10/2026)", "Lombalgia aguda", "—"]) {
      expect(isEpisodeSpecialty(v), JSON.stringify(v)).toBe(false);
    }
    for (const v of [null, undefined, 1, ["Osteopatia"], { Osteopatia: true }]) {
      expect(isEpisodeSpecialty(v)).toBe(false);
    }
  });

  it("the title built from one is the specialty and the Lisbon date, nothing clinical", () => {
    expect(defaultEpisodeTitle("Osteopatia", new Date("2026-10-02T09:00:00Z"))).toBe("Osteopatia (02/10/2026)");
  });
});

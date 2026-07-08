import { describe, expect, it } from "vitest";

import { matchesSearch, normalizeSearchText } from "./text-filter";

describe("normalizeSearchText", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeSearchText("João Pereira")).toBe("joao pereira");
    expect(normalizeSearchText("RECEÇÃO")).toBe("rececao");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSearchText("  Maria ")).toBe("maria");
  });
});

describe("matchesSearch", () => {
  it("matches accent-insensitively in both directions", () => {
    expect(matchesSearch("joao", "João Pereira")).toBe(true);
    expect(matchesSearch("João", "Joao Pereira")).toBe(true);
  });

  it("matches case-insensitive substrings", () => {
    expect(matchesSearch("silva", "Maria Silva")).toBe(true);
    expect(matchesSearch("TERAPEUTA", "Terapeuta")).toBe(true);
  });

  it("returns true for an empty or whitespace query (filter off)", () => {
    expect(matchesSearch("", "anything")).toBe(true);
    expect(matchesSearch("   ", "anything")).toBe(true);
    expect(matchesSearch("", null, undefined)).toBe(true);
  });

  it("returns false when no haystack contains the query", () => {
    expect(matchesSearch("zzz", "Maria Silva", "Terapeuta")).toBe(false);
  });

  it("skips null/undefined haystacks and matches any provided one", () => {
    expect(matchesSearch("maria", null, undefined, "Maria Silva")).toBe(true);
    expect(matchesSearch("maria", null, undefined)).toBe(false);
  });
});

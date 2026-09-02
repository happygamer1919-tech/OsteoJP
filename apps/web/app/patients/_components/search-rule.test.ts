/**
 * PERF-08 TASK 3 — the search issues FEWER queries, not cheaper ones.
 *
 * Every case here counts NAVIGATIONS, because each one is a full page render of
 * /patients and that is the entire cost this change removes. The per-query cost
 * is flat in the query's length (see search-rule.ts for the measurements), so
 * nothing below is about making a search cheaper.
 */
import { describe, expect, it } from "vitest";
import { DEBOUNCE_MS, MIN_SEARCH_LENGTH, nextSearchTarget } from "./search-rule";

describe("below the minimum, from an empty filter", () => {
  it("issues NOTHING for one or two characters", () => {
    // Two of the six renders a six-letter surname can produce, gone.
    expect(nextSearchTarget("s", null)).toEqual({ navigate: false });
    expect(nextSearchTarget("si", null)).toEqual({ navigate: false });
  });

  it("issues the search on the third character", () => {
    expect(nextSearchTarget("sil", null)).toEqual({ navigate: true, q: "sil" });
  });
});

describe("below the minimum, from an ACTIVE filter", () => {
  it("CLEARS it - the stale-filter bug this file caught", () => {
    // The first version returned early on a short value, so the box said "si"
    // and the list still showed silva's results. Box and list must agree.
    expect(nextSearchTarget("si", "silva")).toEqual({ navigate: true, q: null });
    expect(nextSearchTarget("s", "silva")).toEqual({ navigate: true, q: null });
  });

  it("clearing the box entirely still navigates", () => {
    expect(nextSearchTarget("", "silva")).toEqual({ navigate: true, q: null });
    expect(nextSearchTarget("   ", "silva")).toEqual({ navigate: true, q: null });
  });
});

describe("a navigation that changes nothing is refused", () => {
  it("re-typing the same search does not re-render the page", () => {
    expect(nextSearchTarget("silva", "silva")).toEqual({ navigate: false });
  });

  it("every short value from an empty filter is a no-op", () => {
    for (const v of ["a", "ab", "", "  ", "x"]) {
      expect(nextSearchTarget(v, null)).toEqual({ navigate: false });
    }
  });

  it("treats an empty-string q in the URL as no filter", () => {
    // `?q=` is not a filter. Without this, clearing the box from that state
    // would navigate forever in a loop.
    expect(nextSearchTarget("", "")).toEqual({ navigate: false });
    expect(nextSearchTarget("a", "")).toEqual({ navigate: false });
  });
});

describe("trimming", () => {
  it("counts the TRIMMED length, and searches the trimmed value", () => {
    expect(nextSearchTarget("  si  ", null)).toEqual({ navigate: false });
    expect(nextSearchTarget("  sil  ", null)).toEqual({ navigate: true, q: "sil" });
  });
});

describe("the constants are the ones the measurements were taken against", () => {
  it("three characters, five hundred milliseconds", () => {
    // Pinned by exact equality: both were changed on measured grounds and a
    // silent edit would move the behaviour the tests above describe.
    expect(MIN_SEARCH_LENGTH).toBe(3);
    expect(DEBOUNCE_MS).toBe(500);
  });
});

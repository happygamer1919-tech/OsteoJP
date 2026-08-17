import { describe, it, expect } from "vitest";

import { foldName, matchesName } from "./roster-filter";

/**
 * SCHED-03 - the /horarios roster filter.
 *
 * THE ACCENT ARM IS THE REASON THIS FILE EXISTS. Every other assertion here is
 * ordinary substring behaviour; the diacritic ones are the ones that would fail
 * silently in production, in Portuguese, on the names this clinic actually has -
 * and the failure looks like "that therapist is not at this clinic" rather than
 * like a search that missed.
 */

describe("foldName", () => {
  it("strips the accents pt-PT names carry", () => {
    expect(foldName("Abílio")).toBe("abilio");
    expect(foldName("Inês")).toBe("ines");
    expect(foldName("João")).toBe("joao");
    expect(foldName("António")).toBe("antonio");
  });

  it("folds cedilla and the tilde-n as well", () => {
    expect(foldName("Conceição")).toBe("conceicao");
    expect(foldName("Muñoz")).toBe("munoz");
  });

  it("lowercases and trims", () => {
    expect(foldName("  CATARINA  ")).toBe("catarina");
  });
});

describe("matchesName", () => {
  it("finds an accented name from an UNACCENTED query", () => {
    // The case reception will actually produce: typing fast, mid-call, without
    // stopping to find the acute.
    expect(matchesName("Abílio Santos", "abilio")).toBe(true);
    expect(matchesName("Inês Costa", "ines")).toBe(true);
  });

  it("finds an UNACCENTED name from an accented query", () => {
    // The reverse, because the accent can be on either side. A fold applied to
    // only one of the two is the half-fix that passes the test above and still
    // fails a real search.
    expect(matchesName("Abilio Santos", "abílio")).toBe(true);
  });

  it("matches on the SURNAME, not only the start", () => {
    // Half a roster is known by surname. A prefix match would hide them.
    expect(matchesName("Catarina Vieira", "vieira")).toBe(true);
  });

  it("is case-insensitive both ways", () => {
    expect(matchesName("catarina vieira", "VIEIRA")).toBe(true);
    expect(matchesName("CATARINA VIEIRA", "vieira")).toBe(true);
  });

  it("an EMPTY query matches everything, so the unfiltered roster is the default", () => {
    expect(matchesName("Qualquer Pessoa", "")).toBe(true);
  });

  it("a whitespace-only query is the same as empty - somebody has typed nothing", () => {
    expect(matchesName("Qualquer Pessoa", "   ")).toBe(true);
  });

  it("COUNTERWEIGHT: a name that genuinely does not match returns false", () => {
    // Without this every assertion above would pass just as well against a
    // predicate hard-coded to true - which is exactly what an over-eager fold
    // would amount to.
    expect(matchesName("Catarina Vieira", "abilio")).toBe(false);
    expect(matchesName("Abílio Santos", "zzz")).toBe(false);
  });

  it("COUNTERWEIGHT: folding does not collapse DIFFERENT letters together", () => {
    // The fold removes marks; it must not remove the letters. If it ever
    // normalised more aggressively, unrelated names would start matching and
    // reception would be shown the wrong person's schedule to edit.
    expect(matchesName("Ana", "ane")).toBe(false);
    expect(matchesName("Sofia", "sonia")).toBe(false);
  });
});

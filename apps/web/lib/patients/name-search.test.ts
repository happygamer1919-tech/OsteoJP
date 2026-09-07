/**
 * The token rule and the accent fold, without a database.
 *
 * The DB-gated sibling proves the SEMANTICS against real rows. This proves the
 * two things that are cheap to get wrong and invisible in a query plan:
 *
 *   1. the JS fold and the SQL fold agree, character for character;
 *   2. the JS fold and the CLIENT-SIDE filter agree too.
 *
 * WHY (2) IS HERE AT ALL. `lib/search/text-filter.ts` folds accents with an NFD
 * strip and filters rows a role has ALREADY read; this module folds with a
 * translate table and decides what the DATABASE returns. They are different
 * implementations of the same idea, on the same screen, and when they disagree
 * the list a user types into behaves one way and the database another. That
 * disagreement is exactly what the incident looked like from reception's side.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { foldNameToken, nameTokens } from "./name-search";
import { normalizeSearchText } from "@/lib/search/text-filter";

/** Every accented character the fold claims to handle, plus its plain form. */
const PAIRS: Array<[string, string]> = [
  ["á", "a"], ["à", "a"], ["â", "a"], ["ã", "a"], ["ä", "a"],
  ["ç", "c"],
  ["é", "e"], ["è", "e"], ["ê", "e"], ["ë", "e"],
  ["í", "i"], ["ì", "i"], ["î", "i"], ["ï", "i"],
  ["ó", "o"], ["ò", "o"], ["ô", "o"], ["õ", "o"], ["ö", "o"],
  ["ú", "u"], ["ù", "u"], ["û", "u"], ["ü", "u"],
  ["ý", "y"], ["ÿ", "y"],
  ["ñ", "n"],
];

describe("the accent fold", () => {
  it("folds every character it claims to, in lower case", () => {
    for (const [accented, plain] of PAIRS) {
      expect(foldNameToken(accented), `${accented} did not fold`).toBe(plain);
    }
  });

  it("folds the UPPER case forms too, because a person types names capitalised", () => {
    for (const [accented, plain] of PAIRS) {
      expect(foldNameToken(accented.toUpperCase()), `${accented.toUpperCase()} did not fold`).toBe(plain);
    }
  });

  it("AGREES WITH THE CLIENT-SIDE FILTER on every one of them", () => {
    // normalizeSearchText is what the rendered list uses. If these two ever
    // disagree, the same query filters one way in the browser and another in
    // the database - and the database is the one that decides whether a patient
    // exists.
    for (const [accented] of PAIRS) {
      expect(foldNameToken(accented), `disagreement on ${accented}`).toBe(
        normalizeSearchText(accented),
      );
    }
  });

  it("AGREES WITH THE CLIENT-SIDE FILTER on the reported record", () => {
    expect(foldNameToken("António Armando Ribeiro Galhofo")).toBe(
      normalizeSearchText("António Armando Ribeiro Galhofo"),
    );
  });

  it("leaves unaccented text alone apart from case", () => {
    expect(foldNameToken("Galhofo")).toBe("galhofo");
    expect(foldNameToken("MARIA-JOSE")).toBe("maria-jose");
  });

  it("THE CONTROL: it can tell a folded string from an unfolded one", () => {
    // Without this, every assertion above passes on a fold that is the identity
    // function and on one that returns "" for everything.
    expect(foldNameToken("António")).not.toBe("António");
    expect(foldNameToken("António")).toBe("antonio");
    expect(foldNameToken("")).toBe("");
  });
});

describe("the token split", () => {
  it("splits on whitespace", () => {
    expect(nameTokens("Antonio Galhofo")).toEqual(["Antonio", "Galhofo"]);
  });

  it("collapses runs and drops leading and trailing whitespace", () => {
    // An empty token would become `LIKE '%%'`, which matches everything, and
    // ANDing it in would be harmless - until somebody switched the join to OR.
    expect(nameTokens("  Antonio    Galhofo  ")).toEqual(["Antonio", "Galhofo"]);
    expect(nameTokens("   ")).toEqual([]);
    expect(nameTokens("")).toEqual([]);
  });

  it("treats tabs and newlines as whitespace, because a paste carries them", () => {
    expect(nameTokens("Antonio\tGalhofo\n")).toEqual(["Antonio", "Galhofo"]);
  });

  it("does NOT split on a hyphen or an apostrophe", () => {
    // "Maria-José" and "D'Almeida" are ONE name token each. Splitting them
    // would make the search looser, not tighter, which is the wrong direction
    // for a surface that picks a medical record.
    expect(nameTokens("Maria-José D'Almeida")).toEqual(["Maria-José", "D'Almeida"]);
  });
});

/**
 * BOTH SURFACES USE THE ONE RULE, AND THIS IS A SOURCE SCAN ON PURPOSE.
 *
 * The DB-gated sibling drives `listPatientsPage`, which is the surface reception
 * reported. `searchPatients` in queries.ts is the OTHER one - the agenda drawer
 * and the consultation picker - and it carried the IDENTICAL line and the
 * IDENTICAL defect.
 *
 * Driving it from a test would mean mocking `requireRequestContext`, which
 * replaces the auth boundary with a stub in the one suite that is supposed to
 * be about real behaviour. So the cross-file property is asserted directly: it
 * uses the shared matcher, and neither surface has a bare full-name ILIKE left.
 *
 * A crude tie, and the right crudeness - the same argument sellable.test.ts
 * makes for GUEST-08. It cannot be satisfied by a route that reimplements the
 * rule correctly by hand, which would fail this and should, because at that
 * point there are two rules again. It cannot be satisfied AT ALL by one that
 * quietly goes back to a single substring.
 */
describe("the rule is shared, not copied", () => {
  const read = (p: string) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), p), "utf8");
  const listQueries = read("./list-queries.ts");
  const queries = read("./queries.ts");

  for (const [name, src] of [
    ["list-queries.ts", listQueries],
    ["queries.ts", queries],
  ] as const) {
    it(`${name} uses fullNameMatcher`, () => {
      expect(src).toContain("fullNameMatcher");
    });

    it(`${name} has NO bare full-name ILIKE left`, () => {
      // This exact expression is the incident. `ilike(patients.fullName, ...)`
      // is one substring of the whole typed string, in order.
      expect(
        /ilike\(\s*patients\.fullName/.test(src),
        `${name} still matches the whole query as one substring`,
      ).toBe(false);
    });
  }

  it("THE CONTROL: the scan can see the pattern it is looking for", () => {
    // Without this, both assertions above pass on a file that failed to load.
    expect(/ilike\(\s*patients\.fullName/.test("ilike(patients.fullName, x)")).toBe(true);
    expect(listQueries.length).toBeGreaterThan(1000);
    expect(queries.length).toBeGreaterThan(1000);
  });
});

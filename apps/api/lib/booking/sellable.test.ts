/**
 * GUEST-08 CANNOT DRIFT BETWEEN THE ROUTE THAT LISTS AND THE ROUTE THAT ACCEPTS.
 *
 * ==========================================================================
 * WHY THIS TEST IS A SOURCE SCAN AND NOT A BEHAVIOUR TEST
 * ==========================================================================
 * The behaviour is covered where it belongs: `route.test.ts` block (d) proves
 * the POST calls the gate, orders it correctly and refuses on a false, and the
 * DB-gated suites cover what the join returns.
 *
 * What NEITHER of those can catch is the failure that actually happened: the
 * rule lived in ONE route's SELECT, and the other route had no reason to know
 * it existed. Both files were individually correct. A behaviour test written
 * against either one stays green while the two disagree, because each is doing
 * exactly what its own author intended.
 *
 * So this asserts the CROSS-FILE property directly: the clauses named by
 * `GUEST_SELLABILITY_CLAUSES` appear in the catalogue route AND in the checker.
 * It is a crude tie and that is the right crudeness. It cannot be satisfied by
 * a route that reaches the same answer a different way — which would fail this
 * test and should, because at that point the two are no longer one rule — but
 * it cannot be satisfied AT ALL by a route that silently drops a clause, which
 * is the direction that costs something.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GUEST_SELLABILITY_CLAUSES } from "./sellable";

const API = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG = join(API, "app/api/v1/booking/guest/catalog/route.ts");
const CHECKER = join(API, "lib/booking/sellable.ts");
const POST_ROUTE = join(API, "app/api/v1/booking/guest/route.ts");

/**
 * CODE ONLY: comments out, and the clause list itself out of the checker.
 *
 * Both were ways to pass this scan without applying a clause. A comment that
 * NAMES a clause is not a query that applies it. And the checker is the file
 * that DECLARES `GUEST_SELLABILITY_CLAUSES`, so every clause string is in it by
 * construction: scanning the whole file, the "CHECKER still applies" arms below
 * could not fail, whatever the join did. Found in review of R45's sixth clause,
 * and true of the first five since the day they were written.
 */
const codeOnly = (src: string): string =>
  src
    .replace(/export const GUEST_SELLABILITY_CLAUSES = \[[\s\S]*?\] as const;/, "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const catalog = codeOnly(readFileSync(CATALOG, "utf8"));
const checkerSource = readFileSync(CHECKER, "utf8");
const checker = codeOnly(checkerSource);
const postRoute = readFileSync(POST_ROUTE, "utf8");

describe("GUEST-08 is one rule", () => {
  it("names SIX clauses, and the count is pinned", () => {
    // Another condition is a product decision, not a refactor. If one is added,
    // this line is the place somebody has to think about it. It read FIVE until
    // 2026-10-06, when strategy's ruling R45 added the sixth: the location has
    // a bookable therapist with hours there.
    expect(GUEST_SELLABILITY_CLAUSES).toHaveLength(6);
  });

  it("the sixth clause is the shared fragment, defined in exactly one file", () => {
    // The call is what the two files have in common. Its DEFINITION must stay in
    // one place, or the list and the submit check are two rules again.
    const fragment = readFileSync(join(API, "lib/booking/location-bookable.ts"), "utf8");
    expect(fragment).toContain("export function locationHasBookableTherapist(");
    for (const [name, src] of [
      ["the catalogue route", catalog],
      ["the checker", checker],
    ] as const) {
      expect(
        /from\s+availability_templates/.test(src),
        `${name} reads availability_templates itself; the rule belongs in location-bookable.ts`,
      ).toBe(false);
    }
  });

  for (const clause of GUEST_SELLABILITY_CLAUSES) {
    it(`the CATALOGUE route still applies ${clause}`, () => {
      expect(
        catalog.includes(clause),
        `${clause} is part of GUEST-08 and the catalogue route no longer mentions it. ` +
          "Either the rule changed (update GUEST_SELLABILITY_CLAUSES and the checker) " +
          "or a clause was dropped (the public form is now offering something it should not).",
      ).toBe(true);
    });

    it(`the CHECKER still applies ${clause}`, () => {
      expect(
        checker.includes(clause),
        `${clause} is part of GUEST-08 and lib/booking/sellable.ts no longer mentions it. ` +
          "The submit endpoint would accept a service the catalogue hides.",
      ).toBe(true);
    });
  }

  it("the POST route calls the checker and does not re-implement it", () => {
    // A second copy of the predicate is the defect this module was written to
    // remove. If the POST starts querying `services` itself, that copy is free
    // to drift the same way the first one did.
    expect(postRoute).toContain("isGuestSellable");
    expect(
      postRoute.includes("serviceLocationPrices"),
      "the POST route is querying the price grid directly again; that is the second copy of " +
        "GUEST-08 this module exists to prevent",
    ).toBe(false);
  });

  it("THE CONTROL: the scan can tell a missing clause from a present one", () => {
    // Without this, every assertion above passes on a file that failed to load
    // and on a clause list that is empty. Same reason the read-only SQL guard
    // carries a planted-write control.
    expect(catalog.includes("services.patientBookable")).toBe(true);
    expect(catalog.includes("services.thisClauseDoesNotExist")).toBe(false);
    expect(catalog.length).toBeGreaterThan(1000);
    expect(checker.length).toBeGreaterThan(1000);
    // And the scan reads CODE: the declared list is in the file and not in what
    // is scanned, so a clause can only be found where it is applied.
    expect(checkerSource).toContain("export const GUEST_SELLABILITY_CLAUSES = [");
    expect(checker).not.toContain("GUEST_SELLABILITY_CLAUSES = [");
    // Indented, as every real comment in the two files is, and at column zero.
    expect(
      codeOnly('// eq(services.isActive, true)\n  // eq(x.isActive, 1)\nconst a = 1; /* locations.isActive */'),
    ).not.toMatch(/isActive/);
  });
});

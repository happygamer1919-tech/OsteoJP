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
 * So this asserts the CROSS-FILE property directly: the five clauses named by
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

const catalog = readFileSync(CATALOG, "utf8");
const checker = readFileSync(CHECKER, "utf8");
const postRoute = readFileSync(POST_ROUTE, "utf8");

describe("GUEST-08 is one rule", () => {
  it("names FIVE clauses, and the count is pinned", () => {
    // A sixth condition is a product decision, not a refactor. If one is added,
    // this line is the place somebody has to think about it.
    expect(GUEST_SELLABILITY_CLAUSES).toHaveLength(5);
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
  });
});

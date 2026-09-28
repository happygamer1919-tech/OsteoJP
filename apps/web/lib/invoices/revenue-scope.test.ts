/**
 * revenue-scope.test.ts - T5b, revenue per clinic: which clinics' invoices the
 * Inicio revenue tile sums, per role, as the pure decision.
 *
 * `viewerScope` is what `viewerLocationScope` returns for the caller: the
 * assigned location ids for an assigned admin or receptionist, and `null` for
 * the owner, the therapist and an UNASSIGNED admin or receptionist.
 * getMonthlyRevenue feeds it straight in; revenue.db.test.ts proves the same
 * answers through the real function against a real database.
 */
import { describe, expect, it } from "vitest";
import { ROLES } from "@osteojp/auth";

import { canChooseRevenueLocation, revenueLocations } from "./revenue-scope";

const LV = "00000000-0000-0000-0000-0000000000a1";
const CB = "00000000-0000-0000-0000-0000000000c2";

describe("owner: every clinic by default, or the one clinic chosen", () => {
  it("sums every clinic when nothing is chosen (null = no location condition)", () => {
    expect(revenueLocations("owner", null, null)).toBeNull();
  });

  it("sums exactly the chosen clinic", () => {
    expect(revenueLocations("owner", null, LV)).toEqual([LV]);
    expect(revenueLocations("owner", null, CB)).toEqual([CB]);
  });

  it("treats an empty choice as no choice", () => {
    expect(revenueLocations("owner", null, "")).toBeNull();
  });
});

describe("admin and reception: exactly their own clinics", () => {
  it.each(["admin", "reception"] as const)("%s assigned to one clinic sums that clinic only", (role) => {
    expect(revenueLocations(role, [LV], null)).toEqual([LV]);
  });

  it("an admin assigned to two clinics sums both", () => {
    expect(revenueLocations("admin", [LV, CB], null)).toEqual([LV, CB]);
  });

  it("a receptionist assigned to two clinics sums both", () => {
    expect(revenueLocations("reception", [LV, CB], null)).toEqual([LV, CB]);
  });

  it.each(["admin", "reception"] as const)(
    "%s cannot move the figure with a requested clinic, outside or inside their own set",
    (role) => {
      // Outside: an LV admin asking for CB still gets LV.
      expect(revenueLocations(role, [LV], CB)).toEqual([LV]);
      // Inside: a two-clinic admin asking for LV still gets both. The toggle is
      // the owner's; a hand-typed ?location= changes nothing for anyone else.
      expect(revenueLocations(role, [LV, CB], LV)).toEqual([LV, CB]);
    },
  );

  it.each(["admin", "reception"] as const)(
    "%s with NO assignment falls back to the whole tenant, as viewerLocationScope, /invoicing and the appointments RLS do",
    (role) => {
      expect(revenueLocations(role, null, null)).toBeNull();
      // And a requested clinic does not narrow it either.
      expect(revenueLocations(role, null, LV)).toBeNull();
    },
  );
});

describe("the therapist: no clinic at all, and never the whole tenant", () => {
  it("returns an empty list whatever the scope and the request", () => {
    expect(revenueLocations("therapist", null, null)).toEqual([]);
    expect(revenueLocations("therapist", null, LV)).toEqual([]);
    expect(revenueLocations("therapist", [LV], null)).toEqual([]);
  });
});

describe("canChooseRevenueLocation: the toggle is the owner's alone", () => {
  it("is true for the owner and false for every other role", () => {
    expect(ROLES.filter((r) => canChooseRevenueLocation(r))).toEqual(["owner"]);
  });
});

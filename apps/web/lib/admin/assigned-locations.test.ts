import { describe, it, expect } from "vitest";

// STAFF-12 — the Equipa clinic set: memberships always, working hours only
// while they are IN FORCE.
//
// The two arms that matter are opposites, and both are here on purpose:
//   - the JP-shaped arms go RED if the window filter is deleted (too loose);
//   - "in-force hours at a clinic with no membership" and "a perpetual row"
//     go RED if the hours leg is dropped altogether (too tight).
// Without the second kind, a derivation that simply returned the memberships
// would pass every other assertion in this file.

import { buildAssignedLocations, type AssignedHoursRow } from "./assigned-locations";

const TODAY = "2026-09-22";
const CB = "de000002-0000-0000-0000-000000000002";
const LV = "de000002-0000-0000-0000-000000000001";
const U = "user-1";

const hours = (over: Partial<AssignedHoursRow> = {}): AssignedHoursRow => ({
  userId: U,
  locationId: LV,
  validFrom: null,
  validUntil: null,
  ...over,
});

const at = (map: Map<string, Set<string>>, userId: string): string[] =>
  [...(map.get(userId) ?? new Set<string>())].sort();

describe("buildAssignedLocations", () => {
  it("counts a membership with no hours at all", () => {
    const got = buildAssignedLocations([], new Map([[U, [{ locationId: CB }]]]), TODAY);
    expect(at(got, U)).toEqual([CB]);
  });

  it("counts in-force hours at a clinic the member holds NO membership at", () => {
    // The PL-14 widening, and the arm that fails if the hours leg is removed.
    const got = buildAssignedLocations([hours()], new Map(), TODAY);
    expect(at(got, U)).toEqual([LV]);
  });

  it("counts a perpetual row (no window) whatever the date", () => {
    const got = buildAssignedLocations([hours()], new Map(), "2099-01-01");
    expect(at(got, U)).toEqual([LV]);
  });

  it("THE JP CASE: an expired row at the other clinic does not add a chip", () => {
    // JP(cb): installed at Castelo Branco, 21 still-active Linda-a-Velha rows
    // whose windows closed. Measured on production 2026-09-22.
    const got = buildAssignedLocations(
      [
        hours({ locationId: LV, validFrom: "2026-09-12", validUntil: "2026-09-12" }),
        hours({ locationId: LV, validFrom: "2026-09-19", validUntil: "2026-09-19" }),
      ],
      new Map([[U, [{ locationId: CB }]]]),
      TODAY,
    );
    expect(at(got, U)).toEqual([CB]);
  });

  it("THE JP CASE, the other direction: a row that has not started yet does not add a chip", () => {
    // The R8 row: Saturdays at Linda-a-Velha from 2026-11-28, open-ended.
    const got = buildAssignedLocations(
      [hours({ locationId: LV, validFrom: "2026-11-28", validUntil: null })],
      new Map([[U, [{ locationId: CB }]]]),
      TODAY,
    );
    expect(at(got, U)).toEqual([CB]);
  });

  it("keeps a clinic the member is BOTH installed at and has expired hours at", () => {
    const got = buildAssignedLocations(
      [hours({ locationId: CB, validFrom: "2026-01-01", validUntil: "2026-01-31" })],
      new Map([[U, [{ locationId: CB }]]]),
      TODAY,
    );
    expect(at(got, U)).toEqual([CB]);
  });

  it("is inclusive at both edges of the window", () => {
    const startsToday = buildAssignedLocations([hours({ validFrom: TODAY, validUntil: null })], new Map(), TODAY);
    const endsToday = buildAssignedLocations([hours({ validFrom: null, validUntil: TODAY })], new Map(), TODAY);
    const endedYesterday = buildAssignedLocations([hours({ validFrom: null, validUntil: "2026-09-21" })], new Map(), TODAY);
    const startsTomorrow = buildAssignedLocations([hours({ validFrom: "2026-09-23", validUntil: null })], new Map(), TODAY);
    expect(at(startsToday, U)).toEqual([LV]);
    expect(at(endsToday, U)).toEqual([LV]);
    expect(at(endedYesterday, U)).toEqual([]);
    expect(at(startsTomorrow, U)).toEqual([]);
  });

  it("unions the two legs, and dedupes a clinic reached by both", () => {
    const got = buildAssignedLocations(
      [hours({ locationId: LV }), hours({ locationId: CB })],
      new Map([[U, [{ locationId: CB }]]]),
      TODAY,
    );
    expect(at(got, U)).toEqual([LV, CB].sort());
  });

  it("keeps members apart", () => {
    const got = buildAssignedLocations(
      [hours({ userId: "a", locationId: LV }), hours({ userId: "b", locationId: CB, validUntil: "2020-01-01" })],
      new Map([["b", [{ locationId: CB }]]]),
      TODAY,
    );
    expect(at(got, "a")).toEqual([LV]);
    expect(at(got, "b")).toEqual([CB]);
    expect(got.has("c")).toBe(false);
  });

  it("returns no entry for a member with neither hours nor a membership", () => {
    // Ivan M on production: owner, no membership row, no hours. The card must
    // still say "Sem localização atribuída" rather than invent a clinic.
    const got = buildAssignedLocations([], new Map(), TODAY);
    expect(got.size).toBe(0);
  });
});

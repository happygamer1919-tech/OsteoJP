import { describe, expect, it } from "vitest";
import { isLocationScopedRole, seesEveryLocation } from "./location-scope-warning";

// PL-18. These assertions are the audit's finding written down: the platform
// already scopes reception the same way it scopes admin, and the reported
// "sees both clinics" screen is the no-assignment fallback, not a missing rule.
// If someone later "fixes" the fallback by inverting it, this file says what
// the behaviour was and why.

describe("isLocationScopedRole", () => {
  it("covers reception and admin, the two roles viewerLocationScope restricts", () => {
    expect(isLocationScopedRole("reception")).toBe(true);
    expect(isLocationScopedRole("admin")).toBe(true);
  });

  it("excludes owner and therapist", () => {
    // Owner sees every clinic by design; a therapist is bounded by their
    // own-data rules (practitioner lock + therapistPatientScope), not by
    // location, so neither can be "missing" an assignment.
    expect(isLocationScopedRole("owner")).toBe(false);
    expect(isLocationScopedRole("therapist")).toBe(false);
    expect(isLocationScopedRole(null)).toBe(false);
    expect(isLocationScopedRole(undefined)).toBe(false);
  });
});

describe("seesEveryLocation", () => {
  it("flags an active reception with no staff_locations row", () => {
    // This is the reported case, exactly.
    expect(seesEveryLocation("reception", true, 0)).toBe(true);
  });

  it("flags an active admin with no staff_locations row", () => {
    expect(seesEveryLocation("admin", true, 0)).toBe(true);
  });

  it("does not flag once a location is assigned", () => {
    expect(seesEveryLocation("reception", true, 1)).toBe(false);
    expect(seesEveryLocation("admin", true, 2)).toBe(false);
  });

  it("does not flag owner or therapist, whatever their memberships", () => {
    expect(seesEveryLocation("owner", true, 0)).toBe(false);
    expect(seesEveryLocation("therapist", true, 0)).toBe(false);
  });

  it("does not flag an inactive member", () => {
    // They cannot sign in, so there is no over-broad view to warn about, and
    // flagging archived accounts would bury the row that matters.
    expect(seesEveryLocation("reception", false, 0)).toBe(false);
  });
});

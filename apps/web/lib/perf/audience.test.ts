import { describe, it, expect, vi } from "vitest";
import { ROLES, type Role } from "@osteojp/auth";

vi.mock("server-only", () => ({}));

import { mayReadTimings, shouldMeasure, timingsRequested } from "./audience";

/**
 * WHO MAY READ A TIMING BREAKDOWN - the role gate, pinned in BOTH directions.
 *
 * ==========================================================================
 * WHY THE NEGATIVE ARM IS ENUMERATED FROM `ROLES` AND NOT LISTED BY HAND
 * ==========================================================================
 * A hand-written list of excluded roles goes silently stale the day a role is
 * added: the new role would be neither asserted-allowed nor asserted-denied, and
 * a default that let it through would pass this file. Deriving the negative arm
 * from the exported `ROLES` tuple means a fifth role fails HERE, on a test that
 * names it, rather than on a screen.
 */

const ALLOWED: readonly Role[] = ["admin", "owner"];

describe("mayReadTimings", () => {
  it("admits admin and owner", () => {
    for (const role of ALLOWED) {
      expect(mayReadTimings({ role }), `${role} must be able to read timings`).toBe(true);
    }
  });

  it("refuses every other role the system defines", () => {
    const refused = ROLES.filter((r) => !ALLOWED.includes(r));
    // The premise first: if this list is empty the loop below asserts nothing.
    expect(refused.length, "no role is left to refuse - the negative arm is vacuous").toBeGreaterThan(0);
    for (const role of refused) {
      expect(mayReadTimings({ role }), `${role} must NOT be able to read timings`).toBe(false);
    }
  });

  it("is a function of the role alone - no environment variable can widen it", () => {
    // A flag would make the answer differ between production and everywhere
    // else, which is exactly where a measurement must not differ. Asserted by
    // moving every plausible flag and re-reading the same answer.
    const before = mayReadTimings({ role: "reception" });
    process.env.PERF_TIMINGS = "1";
    process.env.NEXT_PUBLIC_PERF_TIMINGS = "1";
    process.env.NODE_ENV_OVERRIDE = "development";
    try {
      expect(mayReadTimings({ role: "reception" })).toBe(before);
      expect(mayReadTimings({ role: "reception" })).toBe(false);
    } finally {
      delete process.env.PERF_TIMINGS;
      delete process.env.NEXT_PUBLIC_PERF_TIMINGS;
      delete process.env.NODE_ENV_OVERRIDE;
    }
  });
});

/**
 * ON REQUEST, NEVER BY DEFAULT. Owner ruling 2026-09-19: the panel had done its
 * job and was still sitting under the title of four pages. It is hidden, not
 * deleted: the `perf` suite reads its numbers off the page, and the next slow
 * page should be one URL parameter away from a measurement rather than one
 * rebuild away.
 *
 * The two gates are asserted separately and then together, because the failure
 * that matters is the combination: a parameter that a receptionist can type must
 * never open what the role gate refuses.
 */
describe("timingsRequested - the URL asks, exactly one way", () => {
  it("is true for ?medicao=1 and for nothing else", () => {
    expect(timingsRequested({ medicao: "1" })).toBe(true);
    expect(timingsRequested({ medicao: ["1", "0"] })).toBe(true);
    for (const sp of [{}, { medicao: "" }, { medicao: "0" }, { medicao: "true" }, { medicao: "yes" }, { medicao: ["0", "1"] }, { medicao: undefined }, { q: "medicao=1" }]) {
      expect(timingsRequested(sp)).toBe(false);
    }
  });
});

describe("shouldMeasure - the role AND the request, never either alone", () => {
  it("admin and owner, asking: measured", () => {
    for (const role of ALLOWED) expect(shouldMeasure({ role }, { medicao: "1" })).toBe(true);
  });

  it("THE DEFAULT: admin and owner who did not ask see no panel and open no span store", () => {
    for (const role of ALLOWED) expect(shouldMeasure({ role }, {})).toBe(false);
  });

  it("THE ONE THAT MATTERS: every other role typing ?medicao=1 is still refused", () => {
    const denied = ROLES.filter((r) => !ALLOWED.includes(r));
    expect(denied.length).toBeGreaterThan(0);
    for (const role of denied) expect(shouldMeasure({ role }, { medicao: "1" })).toBe(false);
  });
});

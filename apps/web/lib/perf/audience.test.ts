import { describe, it, expect, vi } from "vitest";
import { ROLES, type Role } from "@osteojp/auth";

vi.mock("server-only", () => ({}));

import { mayReadTimings } from "./audience";

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

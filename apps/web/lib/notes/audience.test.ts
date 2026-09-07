import { describe, expect, it, vi } from "vitest";
import { ROLES, can, type Capability, type Role } from "@osteojp/auth";

// `audience.ts` is `server-only`; the sibling perf suite mocks it the same way.
vi.mock("server-only", () => ({}));

import { mayReadNotePreviews } from "./audience";

/**
 * THE NOTE-PREVIEW AUDIENCE, AND THE PREMISE THAT MAKES IT VACUOUS TODAY.
 *
 * ==========================================================================
 * A NEGATIVE ARM THAT SELECTS NOBODY IS NOT AN ASSERTION
 * ==========================================================================
 * `lib/perf/audience.test.ts` refuses every role outside its allow-list and
 * asserts first that the refused list is NON-EMPTY, because a loop over nothing
 * passes. That file could make that assertion; this one cannot - every role in
 * the matrix holds `patients:read`, so the refused set here IS empty.
 *
 * So this suite asserts the thing that is actually true and actually load
 * bearing: **no role can reach either preview surface without also holding the
 * capability the FULL notes view asks for.** That is the property the preview
 * depends on. If a fifth role is ever added with `followup:read` and no
 * `patients:read` - or if `patients:read` is ever taken off an existing one -
 * this fails HERE, naming the role, instead of the guard quietly starting to
 * fire on a screen nobody is watching.
 */

/** The capabilities that put a principal in front of a row carrying an excerpt:
 *  `followup:read` is /recuperacao, `appointments:read` is /marcacoes. */
const SURFACE_CAPABILITIES: readonly Capability[] = ["followup:read", "appointments:read"];

describe("mayReadNotePreviews", () => {
  it("admits exactly the roles the FULL notes view admits", () => {
    for (const role of ROLES) {
      expect(
        mayReadNotePreviews({ role }),
        `${role}: the preview audience must equal patients:read`,
      ).toBe(can(role, "patients:read"));
    }
  });

  it("PREMISE: no role reaches a preview surface without patients:read", () => {
    const reaches = ROLES.filter((r: Role) => SURFACE_CAPABILITIES.some((c) => can(r, c)));
    // The premise of the premise: if nothing reaches the surfaces, the loop
    // below asserts nothing at all.
    expect(reaches.length, "no role reaches either surface - this check is vacuous").toBeGreaterThan(0);
    for (const role of reaches) {
      expect(
        can(role, "patients:read"),
        `${role} can open a preview surface but NOT the full notes view - the excerpt ` +
          `would show it a clinical note it cannot open. Gate the surface, or drop the preview.`,
      ).toBe(true);
    }
  });

  it("is a function of the role alone - no environment variable can widen it", () => {
    // Same reasoning as the timing panel's: an audience that differed between
    // production and everywhere else is an audience nothing can test.
    const before = mayReadNotePreviews({ role: "reception" });
    process.env.NOTES_PREVIEW = "1";
    process.env.NEXT_PUBLIC_NOTES_PREVIEW = "1";
    try {
      expect(mayReadNotePreviews({ role: "reception" })).toBe(before);
    } finally {
      delete process.env.NOTES_PREVIEW;
      delete process.env.NEXT_PUBLIC_NOTES_PREVIEW;
    }
  });
});

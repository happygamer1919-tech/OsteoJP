import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
// resolveScheduleScope delegates to viewerLocationScope; neutralise it so this
// unit test exercises assertTargetInScheduleScope in isolation.
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null),
}));

import { assertTargetInScheduleScope } from "./schedule-scope";
import { isAdminError } from "./errors";

/**
 * PL-09 Phase 5 location gate for schedule management. A `null` scope (owner /
 * therapist / unassigned reception-admin) is an unconditional pass and never
 * touches the DB. A non-null scope queries staff_locations for the target and
 * rejects (AdminError "not_found") when the therapist is not at the viewer's
 * location(s).
 */
function fakeTx(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows }),
      }),
    }),
  } as never;
}

describe("assertTargetInScheduleScope", () => {
  it("is a no-op for an unrestricted scope (owner/unassigned) — never queries", async () => {
    let queried = false;
    const tx = {
      select: () => {
        queried = true;
        return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
      },
    } as never;
    await expect(assertTargetInScheduleScope(tx, "ther-1", { kind: "all" })).resolves.toBeUndefined();
    expect(queried).toBe(false);
  });

  it("passes when the target therapist shares a location with the viewer", async () => {
    await expect(
      assertTargetInScheduleScope(fakeTx([{ userId: "ther-1" }]), "ther-1", {
        kind: "locations",
        locationIds: ["loc-A"],
      }),
    ).resolves.toBeUndefined();
  });

  it("throws not_found when the target is NOT at any of the viewer's locations", async () => {
    try {
      await assertTargetInScheduleScope(fakeTx([]), "ther-2", { kind: "locations", locationIds: ["loc-A"] });
      throw new Error("expected throw");
    } catch (e) {
      expect(isAdminError(e) && e.code).toBe("not_found");
    }
  });
});

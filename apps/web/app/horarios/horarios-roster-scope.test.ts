import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null),
}));

import { filterRosterByViewerScope } from "@/lib/scheduling/therapist-location-filter";
import { assertTargetInScheduleScope, manageableTargets } from "@/lib/admin/schedule-scope";
import { isAdminError } from "@/lib/admin/errors";

/**
 * ITEM 1 - /horarios crashed for a LOCATED receptionist, in front of the clinic
 * team, and Equipa crashed the same way for a LOCATED admin.
 *
 * TWO PREDICATES ANSWER "IS THIS THERAPIST IN MY SCOPE" AND THEY DISAGREE ON
 * EXACTLY ONE CASE: a therapist with NO location assignment at all.
 *
 *   filterRosterByViewerScope  (therapist-location-filter.ts:74)  KEEPS them.
 *   assertTargetInScheduleScope (schedule-scope.ts:56)            THROWS on them.
 *
 * Both are deliberate and both comments argue well for themselves. The pages put
 * them in series - render the roster, then run the assert once per rostered
 * member inside a Promise.all - so one unassigned therapist rejected the whole
 * batch and the server component threw.
 *
 * WHAT THIS FILE PINS. Not "the assert is wrong" (it is not) and not "the roster
 * is wrong" (it is not either), but the property the pages actually need:
 * BUILDING A LIST MUST YIELD A PER-MEMBER ANSWER, so no member can lose every
 * other member. `manageableTargets` is that answer.
 */
describe("ITEM 1 - the roster and the schedule-manage gate must agree per member", () => {
  const LV = "loc-lv";
  const CB = "loc-cb";

  const assignments = new Map<string, string[]>([
    ["ther-lv", [LV]],
    ["ther-cb", [CB]],
  ]);
  const roster = [{ id: "ther-lv" }, { id: "ther-cb" }, { id: "ther-unassigned" }];
  const LOC_LV = { kind: "locations" as const, locationIds: [LV] };

  /** The assert's DB shape: one row iff the single target shares a location. */
  const assertTx = (targetAssignments: readonly string[], scope: readonly string[]) =>
    ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              targetAssignments.some((l) => scope.includes(l)) ? [{ userId: "x" }] : [],
          }),
        }),
      }),
    }) as never;

  /** manageableTargets' DB shape: every (user, location) pair in scope. */
  const membershipTx = (scope: readonly string[]) =>
    ({
      selectDistinct: () => ({
        from: () => ({
          where: async () =>
            [...assignments.entries()]
              .filter(([, locs]) => locs.some((l) => scope.includes(l)))
              .map(([userId]) => ({ userId })),
        }),
      }),
    }) as never;

  it("REGRESSION: every member of a located viewer's roster gets an answer, and none throws", async () => {
    const visible = filterRosterByViewerScope(roster, assignments, [LV]);
    expect(visible.map((t) => t.id)).toEqual(["ther-lv", "ther-unassigned"]);

    // The call the pages now make. It must RESOLVE - this is the whole fix.
    const manageable = await manageableTargets(
      membershipTx([LV]),
      visible.map((t) => t.id),
      LOC_LV,
    );

    // Every rostered member is decided, one way or the other. A member missing
    // from the answer would put the page back to guessing.
    for (const t of visible) expect(typeof manageable.has(t.id)).toBe("boolean");
    expect(manageable.has("ther-lv")).toBe(true);
    expect(manageable.has("ther-unassigned")).toBe(false);
  });

  it("the OLD shape is what crashed: chained asserts lose the whole page to one member", async () => {
    const visible = filterRosterByViewerScope(roster, assignments, [LV]);
    // Reproduces the pre-fix page: Promise.all over a throwing per-member gate.
    await expect(
      Promise.all(
        visible.map((t) =>
          assertTargetInScheduleScope(assertTx(assignments.get(t.id) ?? [], [LV]), t.id, LOC_LV),
        ),
      ),
    ).rejects.toSatisfy((e: unknown) => isAdminError(e) && e.code === "not_found");
  });

  it("NEGATIVE ARM: the gate is NOT weakened - the assert still refuses that member", async () => {
    // The fix must not make an out-of-scope write possible. The single-target
    // assert is unchanged and still throws, so a page that renders a member it
    // may not manage still cannot act on them.
    await expect(
      assertTargetInScheduleScope(assertTx([], [LV]), "ther-unassigned", LOC_LV),
    ).rejects.toSatisfy((e: unknown) => isAdminError(e) && e.code === "not_found");
  });

  it("NEGATIVE ARM: a CB-only therapist is still invisible to an LV viewer", () => {
    // The fix must not widen the roster. Isolation is unchanged.
    const visible = filterRosterByViewerScope(roster, assignments, [LV]).map((t) => t.id);
    expect(visible).not.toContain("ther-cb");
  });

  it("NEGATIVE ARM: an UNSCOPED viewer (owner) manages everyone and issues no query", async () => {
    let queried = false;
    const spyTx = {
      selectDistinct: () => {
        queried = true;
        return { from: () => ({ where: async () => [] }) };
      },
    } as never;
    const manageable = await manageableTargets(spyTx, ["ther-lv", "ther-cb", "ther-unassigned"], {
      kind: "all",
    });
    expect(manageable.size).toBe(3);
    expect(queried).toBe(false);
  });

  it("NEGATIVE ARM: an empty roster asks the database nothing", async () => {
    let queried = false;
    const spyTx = {
      selectDistinct: () => {
        queried = true;
        return { from: () => ({ where: async () => [] }) };
      },
    } as never;
    expect((await manageableTargets(spyTx, [], LOC_LV)).size).toBe(0);
    expect(queried).toBe(false);
  });
});

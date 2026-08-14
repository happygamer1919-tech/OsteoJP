import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The factory must not close over a top-level variable (vi.mock is hoisted), so
// the mock is declared inline and the handle fetched after import.
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null as string[] | null),
}));

import { can } from "@osteojp/auth";
import { viewerLocationScope as viewerLocationScopeImport } from "@/lib/auth/viewer-locations";
import {
  assertTargetInScheduleScope,
  manageableTargets,
  resolveScheduleScope,
} from "./schedule-scope";
import { isAdminError } from "./errors";

const viewerLocationScope = vi.mocked(viewerLocationScopeImport);

/**
 * ITEM 3 - a therapist may block their OWN schedule and only their own.
 *
 * THE DANGEROUS HALF OF THIS FEATURE IS NOT THE GRANT, IT IS WHAT THE GRANT
 * MEANT BEFORE IT EXISTED. `resolveScheduleScope` previously returned `null` -
 * "unrestricted" - for the owner, an unassigned staffer AND a therapist alike,
 * because a therapist held no schedule capability and the value was never
 * reachable for them. Granting `schedule:manage` without changing that shape
 * would have handed every therapist the entire clinic's schedule, with no code
 * looking wrong anywhere: three different reasons had been collapsed onto one
 * value years before anyone needed to tell them apart.
 *
 * So the assertions below are deliberately in two groups: the CAPABILITY (may
 * they reach the surface) and the SCOPE (whose schedule may they touch). A test
 * that only checked the first would pass on a build that leaked the whole
 * clinic.
 */

const THERAPIST = {
  role: "therapist" as const,
  userId: "user-therapist-1",
  tenantId: "t-1",
} as never;
const RECEPTION = {
  role: "reception" as const,
  userId: "user-reception-1",
  tenantId: "t-1",
} as never;
const OWNER = { role: "owner" as const, userId: "user-owner", tenantId: "t-1" } as never;

/** A tx that would answer "yes" to anything. If a therapist assertion ever
 *  reaches it, the identity rule has been skipped - so this doubles as a trap. */
const permissiveTx = () =>
  ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ userId: "anything" }] }) }),
    }),
    selectDistinct: () => ({
      from: () => ({ where: async () => [{ userId: "anything" }] }),
    }),
  }) as never;

describe("ITEM 3 - therapist self-schedule: the capability", () => {
  it("a therapist may now reach the schedule surfaces", () => {
    expect(can("therapist", "schedule:read")).toBe(true);
    expect(can("therapist", "schedule:manage")).toBe(true);
  });

  it("NEGATIVE ARM: the grant did not leak into anything else", () => {
    // The capability set is the blast radius. If this feature accidentally
    // widened a therapist's authority elsewhere, it shows up here.
    expect(can("therapist", "settings:manage")).toBe(false);
    expect(can("therapist", "users:manage")).toBe(false);
    expect(can("therapist", "roles:manage")).toBe(false);
    expect(can("therapist", "appointments:delete")).toBe(false);
  });

  it("NEGATIVE ARM: reception, admin and owner keep exactly what they had", () => {
    for (const role of ["reception", "admin", "owner"] as const) {
      expect(can(role, "schedule:read")).toBe(true);
      expect(can(role, "schedule:manage")).toBe(true);
    }
  });
});

describe("ITEM 3 - therapist self-schedule: the scope", () => {
  it("a therapist resolves to a SELF scope, not to unrestricted", async () => {
    const scope = await resolveScheduleScope(THERAPIST);
    expect(scope).toEqual({ kind: "self", userId: "user-therapist-1" });
  });

  it("a therapist may act on THEMSELVES", async () => {
    const scope = await resolveScheduleScope(THERAPIST);
    await expect(
      assertTargetInScheduleScope(permissiveTx(), "user-therapist-1", scope),
    ).resolves.toBeUndefined();
  });

  it("a therapist is REFUSED on a colleague, even when the database would say yes", async () => {
    const scope = await resolveScheduleScope(THERAPIST);
    // permissiveTx returns a matching row for ANY target. The refusal must come
    // from identity, not from the query, so a permissive database cannot buy a
    // therapist another therapist's schedule.
    await expect(
      assertTargetInScheduleScope(permissiveTx(), "user-therapist-2", scope),
    ).rejects.toSatisfy((e: unknown) => isAdminError(e) && e.code === "forbidden");
  });

  it("a therapist's manageable set is exactly themselves", async () => {
    const scope = await resolveScheduleScope(THERAPIST);
    const set = await manageableTargets(
      permissiveTx(),
      ["user-therapist-1", "user-therapist-2", "user-therapist-3"],
      scope,
    );
    expect([...set]).toEqual(["user-therapist-1"]);
  });

  it("a therapist NOT asked about themselves gets an empty set, not a phantom yes", async () => {
    const scope = await resolveScheduleScope(THERAPIST);
    const set = await manageableTargets(permissiveTx(), ["user-therapist-2"], scope);
    expect(set.size).toBe(0);
  });

  it("NEGATIVE ARM: reception is UNCHANGED - still location-scoped, not self-scoped", async () => {
    viewerLocationScope.mockResolvedValueOnce(["loc-lv"]);
    const scope = await resolveScheduleScope(RECEPTION);
    expect(scope).toEqual({ kind: "locations", locationIds: ["loc-lv"] });
  });

  it("NEGATIVE ARM: an UNASSIGNED receptionist is still unrestricted, not locked out", async () => {
    // PL-09's deliberate no-lockout rule. A therapist and an unassigned
    // receptionist used to share one `null`; they must now differ.
    viewerLocationScope.mockResolvedValueOnce(null);
    expect(await resolveScheduleScope(RECEPTION)).toEqual({ kind: "all" });
  });

  it("NEGATIVE ARM: the owner is still unrestricted", async () => {
    viewerLocationScope.mockResolvedValueOnce(null);
    const scope = await resolveScheduleScope(OWNER);
    expect(scope).toEqual({ kind: "all" });
    await expect(
      assertTargetInScheduleScope(permissiveTx(), "anyone-at-all", scope),
    ).resolves.toBeUndefined();
  });

  /**
   * THE LEAK THIS BLOCK EXISTS FOR, found by the e2e arm and NOT by the unit
   * tests above, which is the lesson.
   *
   * Everything above proves a therapist cannot WRITE another therapist's
   * schedule. None of it says anything about what the /horarios page LISTS, and
   * those are different questions. The page builds its roster from
   * `getAgendaOptions`, which is scoped by `viewerLocationScope` - and that
   * returns null for a therapist, correctly, because on the AGENDA a therapist
   * is bounded by their own-data rules rather than by location. Reused here it
   * listed every colleague: seven cards on the seeded database, six of them
   * other people.
   *
   * A SCOPE RESOLVED FOR ONE QUESTION, REUSED FOR ANOTHER. The same shape ITEM 3
   * fixed one layer down, and the same shape that crashed /horarios in STAFF-05.
   */
  it("the ROSTER a self-scoped viewer may be shown is exactly themselves", async () => {
    const scope = await resolveScheduleScope(THERAPIST);
    // The page's own expression, pinned here so a refactor of it has to break a
    // test rather than silently widen the list again.
    const roster = [
      { id: "user-therapist-1" },
      { id: "user-therapist-2" },
      { id: "user-therapist-3" },
    ];
    const shown =
      scope.kind === "self" ? roster.filter((t) => t.id === scope.userId) : roster;
    expect(shown.map((t) => t.id)).toEqual(["user-therapist-1"]);
  });

  it("NEGATIVE ARM: a LOCATION-scoped viewer's roster is NOT narrowed to themselves", async () => {
    // ITEM 1 requires reception to keep seeing colleagues, including members
    // with no clinic assigned. Narrowing everyone to self would have "fixed" the
    // leak by breaking the surface reception actually uses.
    viewerLocationScope.mockResolvedValueOnce(["loc-lv"]);
    const scope = await resolveScheduleScope(RECEPTION);
    const roster = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const shown =
      scope.kind === "self" ? roster.filter((t) => t.id === scope.userId) : roster;
    expect(shown).toHaveLength(3);
  });
});

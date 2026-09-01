/**
 * SR-25. The stat strip is cached, and the capability check is NOT.
 *
 * ==========================================================================
 * THE PROPERTY THIS FILE EXISTS FOR
 * ==========================================================================
 * A cache hit does not execute the function it cached. So a capability check
 * written INSIDE a cached function runs exactly once - on the miss that
 * populated the entry - and is skipped for every hit after it, for the whole
 * TTL. The code would look correct at every line and would be checking nothing.
 *
 * That is why `getCachedPatientListStats` calls `assertCan` before it consults
 * the cache, and why the load-bearing assertion below is the SECOND one: on a
 * cache HIT, `assertCan` must still have run.
 *
 * `unstable_cache` is replaced with a real memoiser keyed on the serialised
 * arguments, so hits are genuine hits rather than a mock that always calls
 * through. A pass-through stub would make every assertion here vacuous.
 *
 * ==========================================================================
 * THE KEY IS FOUR PRIMITIVES AND ALL FOUR CHANGE THE ANSWER
 * ==========================================================================
 * tenant, role, user, location. The ROLE is in the key because it is in the
 * answer: `scopeConditions` branches on it and RLS narrows on it, so two roles
 * legitimately see different totals. A key without the role would serve one
 * role's numbers to another, which is a disclosure rather than a stale number.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A real memoiser, so a hit is a hit. */
const calls: string[] = [];
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown, keyParts: string[]) => {
    const store = new Map<string, unknown>();
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args]);
      calls.push(key);
      if (!store.has(key)) store.set(key, await fn(...args));
      return store.get(key);
    };
  },
}));

const assertCanSpy = vi.fn();
vi.mock("@osteojp/auth", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, assertCan: (...a: unknown[]) => assertCanSpy(...a) };
});

// The DB layer never runs here; the cache behaviour is the subject.
vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async () => [{ total: 1, seenThisMonth: 2, withUpcoming: 3, inRecoveryWindow: 4 }]),
  requireRequestContext: vi.fn(),
}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null),
}));

import { PATIENT_STATS_TAG } from "./cache-tags";
import { getCachedPatientListStats } from "./list-queries";

const CTX = { tenantId: "t-1", role: "reception" as const, userId: "u-1" };

beforeEach(() => {
  calls.length = 0;
  assertCanSpy.mockReset();
});

describe("getCachedPatientListStats", () => {
  it("runs assertCan BEFORE the cache, so a refusal never reaches it", async () => {
    assertCanSpy.mockImplementation(() => {
      throw new Error("ForbiddenError");
    });
    await expect(getCachedPatientListStats(null, CTX as never)).rejects.toThrow("ForbiddenError");
    // The cache was never consulted, so no entry was created for a caller who
    // may not read.
    expect(calls).toHaveLength(0);
  });

  it("STILL runs assertCan on a cache HIT - the assertion this file exists for", async () => {
    // THE COUNT IS NOT A ROUND NUMBER AND THAT IS THE FINDING. On a MISS the
    // wrapper checks and the uncached `getPatientListStats` it wraps checks
    // again, so a miss is two. On a HIT the inner function does not run, so a
    // hit is one - the wrapper's. Asserting a flat "three calls for three
    // invocations" would have been wrong, and wrong in the direction that hides
    // the defect: it would also pass if the wrapper checked nothing and the
    // inner function checked on every call.
    //
    // So the property is asserted as a DELTA rather than a total.
    await getCachedPatientListStats(null, CTX as never);
    const afterMiss = assertCanSpy.mock.calls.length;
    expect(afterMiss).toBe(2); // wrapper + the uncached function it populated with

    await getCachedPatientListStats(null, CTX as never);
    const afterFirstHit = assertCanSpy.mock.calls.length;
    await getCachedPatientListStats(null, CTX as never);
    const afterSecondHit = assertCanSpy.mock.calls.length;

    // Three calls, one cache entry: the hits are real hits.
    expect(new Set(calls).size).toBe(1);
    expect(calls).toHaveLength(3);

    // EXACTLY ONE check per hit. If `assertCan` lived only inside the cached
    // function these deltas would be 0 and the capability would go unchecked
    // for the whole TTL.
    expect(afterFirstHit - afterMiss).toBe(1);
    expect(afterSecondHit - afterFirstHit).toBe(1);
    expect(assertCanSpy).toHaveBeenCalledWith("reception", "patients:read");
  });

  it("keys on tenant, role, user and location - each one changes the entry", async () => {
    await getCachedPatientListStats(null, CTX as never);
    await getCachedPatientListStats("loc-a", CTX as never);
    await getCachedPatientListStats(null, { ...CTX, role: "admin" } as never);
    await getCachedPatientListStats(null, { ...CTX, userId: "u-2" } as never);
    await getCachedPatientListStats(null, { ...CTX, tenantId: "t-2" } as never);

    expect(new Set(calls).size).toBe(5);
  });

  it("passes the context as three flat primitives, never as the object", async () => {
    // `unstable_cache` serialises its arguments, and a caller that builds a
    // fresh RequestContext must still hit. viewer-locations.ts records the same
    // reasoning for React cache().
    await getCachedPatientListStats("loc-a", CTX as never);
    const [, args] = JSON.parse(calls[0]!) as [string[], unknown[]];
    expect(args).toEqual(["t-1", "reception", "u-1", "loc-a"]);
  });

  it("exports the invalidation tag as a constant rather than a repeated string", () => {
    expect(PATIENT_STATS_TAG).toBe("patients-stat-strip");
  });
});

describe("the write paths drop the tag", () => {
  // A SOURCE GUARD, and the reason is that the alternative is worse: importing
  // the "use server" actions module pulls the whole patient write stack into a
  // unit test to assert one line. The property here is WIRING - that the single
  // helper every mutation already calls is the one that drops the tag - and
  // wiring is what a source check can actually establish.
  /**
   * COMMENT-STRIPPED, and this file learned why the hard way: the first draft
   * of the `revalidateTag` guard below matched the sentence in `actions.ts`
   * that EXPLAINS why revalidateTag is not used. A source guard that reads
   * prose is asserting against documentation, not against code.
   *
   * Same stripper as `lib/reminders/payload-minimization.test.ts`.
   */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const read = async () =>
    stripComments(
      await (await import("node:fs/promises")).readFile(
        new URL("./actions.ts", import.meta.url),
        "utf8",
      ),
    );

  it("revalidatePatient drops PATIENT_STATS_TAG, so every mutation site inherits it", async () => {
    const src = await read();
    const fn = src.slice(src.indexOf("function revalidatePatient("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("updateTag(PATIENT_STATS_TAG)");
  });

  it("uses updateTag, NOT revalidateTag, because the deferring form left packs invisible", async () => {
    const src = await read();
    // `app/admin/services/actions.ts` records the incident: revalidateTag(tag,
    // "max") defers, and a just-created pack stayed invisible in the booking
    // drawer. Read-your-writes is the whole point of invalidating here.
    expect(src).toContain("updateTag(PATIENT_STATS_TAG)");
    expect(src).not.toMatch(/revalidateTag\s*\(/);
  });

  it("no patient mutation revalidates /patients WITHOUT going through that helper", async () => {
    const src = await read();
    // One occurrence, inside revalidatePatient. A second would be a site that
    // refreshes the list and leaves the four numbers stale.
    const hits = src.match(/revalidatePath\("\/patients"\)/g) ?? [];
    expect(hits).toHaveLength(1);
  });
});

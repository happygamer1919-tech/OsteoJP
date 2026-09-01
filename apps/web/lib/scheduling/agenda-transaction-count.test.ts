/**
 * PERF-06. THE AGENDA'S REFERENCE READ IS ONE TRANSACTION, AND THIS PINS IT.
 *
 * ==========================================================================
 * WHY A COUNT AND NOT A TIMING
 * ==========================================================================
 * The thing that regresses here is not a duration, it is a SHAPE: somebody adds
 * a reference lookup, gives it its own `runScoped` because that is the obvious
 * way to write one, and the agenda quietly pays another BEGIN + `set local role`
 * + `set_config` + COMMIT. On a local database that costs a fraction of a
 * millisecond and no test notices. On production it is four network round trips,
 * which PERF-03 measured at ~78% of the server slot for a read this small.
 *
 * A timing assertion cannot catch that, because the harness that would run it
 * has no network. The COUNT is exact, and it is the number the card is about.
 *
 * ==========================================================================
 * THE NEGATIVE ARM, AND IT IS THE SECOND ASSERTION RATHER THAN THE FIRST
 * ==========================================================================
 * "One transaction" alone would pass on a build that opened one and then made a
 * second read OUTSIDE it - the therapist-to-location map is exactly that read,
 * and before this card it had its own `runScoped`. So the test also asserts that
 * `readTherapistLocationAssignments` was handed THE SAME transaction object
 * `runScoped` produced. Run against the pre-PERF-06 tree that assertion fails:
 * `listTherapistLocationAssignments(ctx)` took a context, not a transaction.
 *
 * `unstable_cache` is a pass-through here on purpose. The cache makes the warm
 * path free and would make this test assert nothing; the COLD path is the one
 * with the transactions in it, and at 197 agenda renders per 12 hours a
 * 60-second entry is usually cold by the next render anyway.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Pass-through, so the cold path runs. See the header.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(),
}));

vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null),
  bookingLocationScope: vi.fn(async () => null),
}));

vi.mock("./therapist-locations", () => ({
  readTherapistLocationAssignments: vi.fn(async () => new Map<string, string[]>()),
}));

import { runScoped as runScopedImport } from "@/lib/auth/context";
import { readTherapistLocationAssignments as readAssignmentsImport } from "./therapist-locations";
import { getAgendaOptions } from "./data";

const runScoped = vi.mocked(runScopedImport);
const readAssignments = vi.mocked(readAssignmentsImport);

const CTX = { tenantId: "t-1", role: "reception" as const, userId: "u-1" };

/**
 * A drizzle-shaped stub: every builder method returns itself and awaiting it
 * yields no rows. The queries' CONTENT is not what this file is about; the
 * number of transactions wrapped around them is.
 */
function makeTx(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const k of [
    "select",
    "selectDistinct",
    "from",
    "where",
    "orderBy",
    "innerJoin",
    "leftJoin",
    "limit",
    "offset",
  ]) {
    chain[k] = self;
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve);
  return chain;
}

describe("getAgendaOptions opens ONE transaction for its reference data", () => {
  it("calls runScoped exactly once, and hands that transaction to the assignment read", async () => {
    const tx = makeTx();
    runScoped.mockReset();
    readAssignments.mockClear();
    runScoped.mockImplementation((async (_ctx: unknown, fn: (t: unknown) => unknown) =>
      fn(tx)) as never);

    await getAgendaOptions(CTX as never, null);

    // THE COUNT. Two before PERF-06: one for the reference rows, one for the
    // therapist-to-location map.
    expect(runScoped).toHaveBeenCalledTimes(1);

    // THE NEGATIVE ARM. A build that kept the second read outside the
    // transaction would still pass the count above by opening one and calling
    // the other through its own context. This is the assertion that reddens.
    expect(readAssignments).toHaveBeenCalledTimes(1);
    expect(readAssignments).toHaveBeenCalledWith(tx);
  });

  it("still resolves the viewer scope without a transaction of its own", async () => {
    // viewerLocationScope and bookingLocationScope both go through
    // resolveViewerLocationIds, which is React-cache()d per request, so neither
    // may add a transaction here. Mocked to null above; the assertion is that
    // the count above is unaffected by them.
    const tx = makeTx();
    runScoped.mockReset();
    runScoped.mockImplementation((async (_ctx: unknown, fn: (t: unknown) => unknown) =>
      fn(tx)) as never);

    const options = await getAgendaOptions(CTX as never, null);

    expect(runScoped).toHaveBeenCalledTimes(1);
    expect(options).toHaveProperty("therapists");
    expect(options).toHaveProperty("bookableLocations");
  });
});

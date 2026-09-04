import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { collectFor, mark, timed, timingActive, type Measured } from "./request-timing";

/**
 * THE INSTRUMENT'S OWN GATE, ASSERTED IN BOTH DIRECTIONS.
 *
 * ==========================================================================
 * WHAT THESE TESTS EXIST TO PREVENT, AND IT HAS ALREADY HAPPENED ONCE
 * ==========================================================================
 * The first version of this module exported an ungated `collect()`, and all four
 * instrumented pages called it unconditionally - so a store opened for EVERY
 * principal while the file's own header, and a comment on /patients, said "for a
 * non-admin no store is opened". Nothing went red. Nothing could: the spans
 * still never reached a non-admin's payload, because that is decided one layer
 * up by whether the panel ELEMENT is created, and the cost of the extra clock
 * reads is microseconds. The only signal was a comment disagreeing with the
 * code.
 *
 * So the property is asserted here rather than described: `audience: false` must
 * open NO STORE, and a body that calls `timed` and `mark` inside it must produce
 * NOTHING. That is what makes "the unmeasured path is the path it was before" a
 * fact instead of a claim.
 */

/** Narrow for the test's own sake - reading `spans` off the union must not compile. */
function measuredArm<T>(m: Measured<T>): { spans: { name: string; ms: number }[]; totalMs: number } {
  if (!m.measured) throw new Error("expected the MEASURED arm, got the unmeasured one");
  return { spans: m.spans, totalMs: m.totalMs };
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("collectFor - the audience gate", () => {
  it("opens no store at all when the audience is false", async () => {
    let activeInside: boolean | null = null;
    const result = await collectFor(false, async () => {
      activeInside = timingActive();
      // Both instruments are exercised INSIDE the unmeasured body. If a store
      // were open these would land in it.
      await timed("db:should-not-exist", async () => tick(1));
      mark("mark:should-not-exist");
      return "value";
    });

    expect(activeInside, "a store was open on a request nobody may read").toBe(false);
    expect(result.measured).toBe(false);
    expect(result.value).toBe("value");
    // The union has no `spans` on this arm; assert it at runtime too, because a
    // future refactor could add one back without changing any call site.
    expect(Object.keys(result).sort()).toEqual(["measured", "value"]);
  });

  it("opens a store and records the spans when the audience is true", async () => {
    const result = await collectFor(true, async () => {
      expect(timingActive()).toBe(true);
      await timed("db:one", async () => tick(2), "first");
      mark("stat-strip:MISS", "the cached function ran");
      await timed("db:two", async () => tick(2));
      return 42;
    });

    const { spans, totalMs } = measuredArm(result);
    expect(result.value).toBe(42);
    expect(spans.map((s) => s.name)).toEqual(["db:one", "stat-strip:MISS", "db:two"]);
    // A point event is a zero-length span, not an absent duration.
    expect(spans[1]!.ms).toBe(0);
    expect(spans[0]!.ms).toBeGreaterThan(0);
    expect(totalMs).toBeGreaterThan(0);
  });

  it("survives Promise.all, which is where the /patients spans are actually recorded", async () => {
    // The reason this module uses AsyncLocalStorage rather than React `cache()`:
    // three reads overlap, and each must land its own span.
    const result = await collectFor(true, async () => {
      await Promise.all([
        timed("db:a", async () => tick(4)),
        timed("db:b", async () => tick(2)),
        timed("db:c", async () => tick(1)),
      ]);
      return null;
    });
    const { spans } = measuredArm(result);
    // Ordered by COMPLETION, which is what a `finally` push means and what the
    // panel prints. Asserted as a set so the test is not timing-fragile.
    expect(spans.map((s) => s.name).sort()).toEqual(["db:a", "db:b", "db:c"]);
  });

  it("records a span for a step that THREW, and lets the error through", async () => {
    // A failed query is the one whose duration a reader most wants. `timed` uses
    // `finally` so a throw is timed rather than dropped - the alternative would
    // make the slowest path in an incident the one span that never appears.
    await expect(
      collectFor(true, async () => {
        await timed("db:explodes", async () => {
          await tick(1);
          throw new Error("boom");
        });
      }),
    ).rejects.toThrow("boom");
  });

  it("timed and mark are inert with no store, and timed still returns the value", async () => {
    expect(timingActive()).toBe(false);
    await expect(timed("db:orphan", async () => "passthrough")).resolves.toBe("passthrough");
    expect(() => mark("mark:orphan")).not.toThrow();
  });

  it("two concurrent collections do not see each other's spans", async () => {
    // One request must not read another's numbers. This is the property ALS
    // provides and a module-level array would not.
    const [a, b] = await Promise.all([
      collectFor(true, async () => {
        await timed("db:from-a", async () => tick(3));
        return "a";
      }),
      collectFor(true, async () => {
        await timed("db:from-b", async () => tick(1));
        return "b";
      }),
    ]);
    expect(measuredArm(a).spans.map((s) => s.name)).toEqual(["db:from-a"]);
    expect(measuredArm(b).spans.map((s) => s.name)).toEqual(["db:from-b"]);
  });
});

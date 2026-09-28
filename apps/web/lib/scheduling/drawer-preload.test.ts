import { describe, expect, it } from "vitest";

import type { ActionFailure, ActionOutcome } from "@/lib/actions/run-action-core";
import type { DrawerLoad, PieceName } from "./drawer-load-core";
import { createDrawerPreload, type PieceConsumer } from "./drawer-preload";

/**
 * SKEW-01 PR 2 - the drawer's side of the loader. Every consumer asks it first;
 * these pin when it answers, when it refuses (so the consumer fetches with its
 * own action, as before), and what each kind of failure turns into.
 */

const KEYS: Record<PieceName, string> = {
  availability: "ther-1|2026-10-01|loc-1",
  notes: "appt-1",
  contraindications: "pat-1",
  noSms: "pat-1",
  linkable: "appt-1|0",
};

const LOAD: DrawerLoad = {
  availability: { status: "ok", value: { ok: false, error: "forbidden" } },
  notes: { status: "ok", value: { ok: true, notes: [] } },
  contraindications: { status: "ok", value: { epilepsy: true, pregnancy: false, pacemaker: false } },
  noSms: { status: "error" },
  linkable: { status: "skipped" },
};

/** A loader the test answers by hand, counting how often it was started. */
function harness() {
  let resolve!: (o: ActionOutcome<DrawerLoad>) => void;
  let retry: (() => void) | null = null;
  let starts = 0;
  const preload = createDrawerPreload(KEYS, (r) => {
    starts += 1;
    retry = r;
    return new Promise((res) => {
      resolve = res;
    });
  });
  return {
    preload,
    starts: () => starts,
    answer: async (o: ActionOutcome<DrawerLoad>) => {
      resolve(o);
      await new Promise((r) => setTimeout(r, 0));
    },
    pressRetry: () => retry?.(),
  };
}

/** A consumer that logs what it was told, and can be cancelled like an effect's cleanup. */
function consumer<T>(log: string[], tag: string) {
  let cancelled = false;
  const c: PieceConsumer<T> = {
    value: (v) => {
      if (!cancelled) log.push(`${tag} value ${JSON.stringify(v)}`);
    },
    fallback: () => {
      if (!cancelled) log.push(`${tag} fallback`);
    },
    failed: (f: ActionFailure) => {
      if (!cancelled) log.push(`${tag} failed ${f}`);
    },
  };
  return { c, cancel: () => (cancelled = true) };
}

describe("createDrawerPreload", () => {
  it("does not start until the first consumer asks, and starts ONCE however many ask", () => {
    const h = harness();
    expect(h.starts()).toBe(0);
    const log: string[] = [];
    expect(h.preload.take("availability", KEYS.availability, consumer(log, "a").c)).toBe(true);
    expect(h.preload.take("notes", KEYS.notes, consumer(log, "n").c)).toBe(true);
    expect(h.preload.take("noSms", KEYS.noSms, consumer(log, "s").c)).toBe(true);
    expect(h.starts()).toBe(1);
  });

  it("answers each consumer with its piece's value, a refusal value included", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("availability", KEYS.availability, consumer(log, "a").c);
    h.preload.take("contraindications", KEYS.contraindications, consumer(log, "c").c);
    await h.answer({ failed: false, value: LOAD });
    expect(log).toEqual([
      'a value {"ok":false,"error":"forbidden"}',
      'c value {"epilepsy":true,"pregnancy":false,"pacemaker":false}',
    ]);
  });

  it("a piece that failed on the server, or was skipped, sends its consumer to its own action", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("noSms", KEYS.noSms, consumer(log, "s").c);
    h.preload.take("linkable", KEYS.linkable, consumer(log, "l").c);
    await h.answer({ failed: false, value: LOAD });
    expect(log).toEqual(["s fallback", "l fallback"]);
  });

  it("React's development double-mount: two asks with one key share one request, and the live one is answered", async () => {
    const h = harness();
    const log: string[] = [];
    const first = consumer(log, "first");
    h.preload.take("notes", KEYS.notes, first.c);
    first.cancel(); // the effect's cleanup
    h.preload.take("notes", KEYS.notes, consumer(log, "second").c);
    expect(h.starts()).toBe(1);
    await h.answer({ failed: false, value: LOAD });
    expect(log).toEqual(['second value {"ok":true,"notes":[]}']);
  });

  it("refuses a different key, and from then on that piece is spent even for its own key", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("contraindications", KEYS.contraindications, consumer(log, "c").c);
    // The user picked another patient before the loader answered.
    expect(h.preload.take("contraindications", "pat-2", consumer(log, "c2").c)).toBe(false);
    // ...and back again: that is a new read, the consumer's own.
    expect(h.preload.take("contraindications", KEYS.contraindications, consumer(log, "c3").c)).toBe(false);
    await h.answer({ failed: false, value: LOAD });
    expect(log).toEqual([]);
  });

  it("refuses every ask once it has answered, so every refetch after opening is the action's own", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("linkable", KEYS.linkable, consumer(log, "l").c);
    await h.answer({ failed: false, value: LOAD });
    expect(h.preload.take("linkable", KEYS.linkable, consumer(log, "again").c)).toBe(false);
    expect(h.preload.take("availability", KEYS.availability, consumer(log, "late").c)).toBe(false);
    expect(h.starts()).toBe(1);
  });

  it("a failed loader call tells each waiting consumer, and runs nothing on its own", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("availability", KEYS.availability, consumer(log, "a").c);
    h.preload.take("notes", KEYS.notes, consumer(log, "n").c);
    await h.answer({ failed: true, failure: "network" });
    expect(log).toEqual(["a failed network", "n failed network"]);
  });

  it("the toast's retry runs each waiting consumer's own read, once, and not a consumer that moved on", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("availability", KEYS.availability, consumer(log, "a").c);
    h.preload.take("noSms", KEYS.noSms, consumer(log, "s").c);
    h.preload.take("noSms", "pat-2", consumer(log, "s2").c); // moved on
    await h.answer({ failed: true, failure: "error" });
    log.length = 0;
    h.pressRetry();
    h.pressRetry();
    expect(log).toEqual(["a fallback"]);
    expect(h.starts()).toBe(1);
  });

  it("a consumer with no `failed` handler is left as its own failed read left it: untouched", async () => {
    const h = harness();
    const log: string[] = [];
    h.preload.take("notes", KEYS.notes, {
      value: () => log.push("value"),
      fallback: () => log.push("fallback"),
    });
    await h.answer({ failed: true, failure: "navigation" });
    expect(log).toEqual([]);
  });
});

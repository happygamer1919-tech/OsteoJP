import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import { s } from "@/lib/i18n";

import { classifyActionError } from "./classify-action-error";
import {
  createActionRunner,
  READ_RETRY_DELAY_MS,
  READ_TOAST_WINDOW_MS,
  type ActionOwner,
  type ActionRunnerDeps,
  type ActionToast,
} from "./run-action-core";

/**
 * SKEW-01 S9 - the wrapper's contract, driven with plain functions.
 *
 * apps/web vitest runs in node with no DOM (vitest.config.ts), so the pure
 * runner is tested with an injected reload, toast, reporter and clock, and the
 * REAL classifier over the REAL error classes Next's client throws.
 */

const skewError = () =>
  new UnrecognizedActionError(
    'Server Action "7f3a" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
  );

function harness(overrides: Partial<ActionRunnerDeps> = {}) {
  const toasts: ActionToast[] = [];
  /** Indexes into `toasts` of the ones closed through the returned close function. */
  const closedByRunner: number[] = [];
  const reports: Array<{ error: unknown; handledAs: string }> = [];
  const waits: number[] = [];
  const rethrown: unknown[] = [];
  /** Every dependency call, in order: what ran before what. */
  const calls: string[] = [];
  const state = { reloads: 0, clock: 0, online: false };
  const deps: ActionRunnerDeps = {
    classify: classifyActionError,
    notify: (t) => {
      const index = toasts.push(t) - 1;
      calls.push("notify");
      return () => {
        closedByRunner.push(index);
      };
    },
    report: (error, handledAs) => {
      reports.push({ error, handledAs });
      calls.push(`report:${handledAs}`);
    },
    beforeReload: () => {
      calls.push("beforeReload");
      return Promise.resolve();
    },
    reload: () => {
      state.reloads += 1;
    },
    rethrowControlFlow: (e) => rethrown.push(e),
    wait: async (ms) => {
      waits.push(ms);
    },
    now: () => state.clock,
    // OFFLINE by default, the case the network arms below are about; the arms
    // that need an online browser say so.
    online: () => state.online,
    messages: {
      skew: s["actions.skewReload"],
      network: s["actions.networkError"],
      generic: s["errors.generic"],
      retry: s["common.retry"],
    },
    ...overrides,
  };
  return { runner: createActionRunner(deps), toasts, closedByRunner, reports, waits, rethrown, calls, state };
}

/** A stand-in for useActionOwner: `end()` is the component unmounting. */
function fakeOwner() {
  let alive = true;
  const ends: Array<() => void> = [];
  const owner: ActionOwner = {
    alive: () => alive,
    onEnd(fn) {
      if (!alive) fn();
      else ends.push(fn);
    },
  };
  return {
    owner,
    end() {
      alive = false;
      for (const fn of ends.splice(0)) fn();
    },
  };
}

/** Lets the reload chain (beforeReload().then(reload)) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A call that rejects with each error in turn, then resolves `value`. */
function sequence<T>(errors: unknown[], value: T) {
  let i = 0;
  return vi.fn(async () => {
    if (i < errors.length) throw errors[i++];
    return value;
  });
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

describe("skew: one toast, one reload, however many calls fail at once", () => {
  it("SEVEN parallel skew failures reload EXACTLY ONCE and show ONE toast", async () => {
    const h = harness();
    const outcomes = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        h.runner.runAction(() => Promise.reject(skewError()), {
          kind: i % 2 === 0 ? "read" : "write",
          retry: vi.fn(),
        }),
      ),
    );
    await settle();

    expect(h.state.reloads).toBe(1);
    expect(h.toasts).toEqual([{ tone: "info", message: "Nova versão disponível, a atualizar..." }]);
    for (const o of outcomes) expect(o).toEqual({ failed: true, failure: "skew" });
    // Reported to Sentry, tagged as handled skew, once for the page.
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]?.handledAs).toBe("skew");
    expect(h.reports[0]?.error).toBeInstanceOf(UnrecognizedActionError);
    // A skewed read is not retried: the id will not become known by waiting.
    expect(h.waits).toEqual([]);
  });

  it("the reload waits for the toast to paint (beforeReload), and still happens once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness({ beforeReload: () => gate });
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "read", retry: vi.fn() });
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "write", retry: vi.fn() });
    await settle();
    expect(h.toasts).toHaveLength(1);
    expect(h.state.reloads).toBe(0);
    release();
    await settle();
    expect(h.state.reloads).toBe(1);
  });

  it("a later skew failure, after the reload was asked for, changes nothing", async () => {
    const h = harness();
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "read", retry: vi.fn() });
    await settle();
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "read", retry: vi.fn() });
    await settle();
    expect(h.state.reloads).toBe(1);
    expect(h.toasts).toHaveLength(1);
    expect(h.reports).toHaveLength(1);
  });

  it("the quiet reload (S6) shares the guard: never a second reload", async () => {
    const h = harness();
    expect(h.runner.reloadQuietly()).toBe(true);
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "write", retry: vi.fn() });
    expect(h.runner.reloadQuietly()).toBe(false);
    await settle();
    expect(h.state.reloads).toBe(1);
    // Quiet: the S6 reload shows no toast, and the skew after it adds none.
    expect(h.toasts).toEqual([]);
    // But the skew is still REPORTED: the owner's three-day watch counts it
    // whichever path asked for the reload first.
    expect(h.reports.map((r) => r.handledAs)).toEqual(["skew"]);
  });

  it("the skew is REPORTED BEFORE the reload is asked for, so the flush in beforeReload has it to send", async () => {
    const h = harness();
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "write", retry: vi.fn() });
    await settle();
    expect(h.calls.indexOf("report:skew")).toBeGreaterThanOrEqual(0);
    expect(h.calls.indexOf("report:skew")).toBeLessThan(h.calls.indexOf("beforeReload"));
  });

  it("a reload still happens when beforeReload itself fails", async () => {
    const h = harness({ beforeReload: () => Promise.reject(new Error("flush failed")) });
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "read", retry: vi.fn() });
    await settle();
    expect(h.state.reloads).toBe(1);
  });
});

describe("network: a READ is retried once, a WRITE never is", () => {
  it("a read that fails once and then answers is retried ONCE after the delay, silently", async () => {
    const h = harness();
    const call = sequence([new TypeError("Failed to fetch")], { ok: true, data: [1] });
    const out = await h.runner.runAction(call, { kind: "read", retry: vi.fn() });
    expect(out).toEqual({ failed: false, value: { ok: true, data: [1] } });
    expect(call).toHaveBeenCalledTimes(2);
    expect(h.waits).toEqual([READ_RETRY_DELAY_MS]);
    expect(READ_RETRY_DELAY_MS).toBeGreaterThanOrEqual(600);
    expect(READ_RETRY_DELAY_MS).toBeLessThanOrEqual(1000);
    expect(h.toasts).toEqual([]);
  });

  it("a read that fails twice shows the toast with 'Tentar novamente', which runs the caller's retry", async () => {
    const h = harness();
    const call = sequence([new TypeError("Failed to fetch"), new TypeError("Failed to fetch")], null);
    const retry = vi.fn();
    const out = await h.runner.runAction(call, { kind: "read", retry });
    expect(out).toEqual({ failed: true, failure: "network" });
    expect(call).toHaveBeenCalledTimes(2);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]?.tone).toBe("error");
    expect(h.toasts[0]?.message).toBe(s["actions.networkError"]);
    expect(h.toasts[0]?.action?.label).toBe("Tentar novamente");
    expect(retry).not.toHaveBeenCalled();
    h.toasts[0]?.action?.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
    // OFFLINE, a network failure is not an incident: nothing is reported.
    expect(h.reports).toEqual([]);
  });

  it("ONLINE, a network failure is reported once per page, as 'network': the server was unreachable or Next threw", async () => {
    const h = harness();
    h.state.online = true;
    const e = new TypeError("Failed to fetch");
    await h.runner.runAction(() => Promise.reject(e), { kind: "write", retry: vi.fn() });
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: vi.fn() });
    await h.runner.runAction(() => Promise.reject(new TypeError("y")), { kind: "write", retry: vi.fn() });
    expect(h.reports).toEqual([{ error: e, handledAs: "network" }]);
    // Still shown as the network failure it presents as, with its retry.
    expect(h.toasts.map((t) => t.message)).toEqual([s["actions.networkError"], s["actions.networkError"], s["actions.networkError"]]);
  });

  it("a WRITE is never retried automatically: one attempt, then the toast's retry is the caller's handler", async () => {
    const h = harness();
    const call = sequence([new TypeError("Failed to fetch")], { ok: true });
    const retry = vi.fn();
    const out = await h.runner.runAction(call, { kind: "write", retry });
    expect(out).toEqual({ failed: true, failure: "network" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]?.action?.label).toBe("Tentar novamente");
    h.toasts[0]?.action?.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
    // The runner did not re-send it on its own at any point.
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("two failed writes keep two toasts: one press, one retry, never merged", async () => {
    const h = harness();
    const a = vi.fn();
    const b = vi.fn();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "write", retry: a });
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "write", retry: b });
    expect(h.toasts).toHaveLength(2);
    h.toasts[1]?.action?.onClick();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("eight reads failing together (a drawer opening offline) share ONE toast, whose retry re-runs all eight", async () => {
    const h = harness();
    const retries = Array.from({ length: 8 }, () => vi.fn());
    await Promise.all(
      retries.map((retry) =>
        h.runner.runAction(() => Promise.reject(new TypeError("Failed to fetch")), { kind: "read", retry }),
      ),
    );
    expect(h.toasts).toHaveLength(1);
    h.toasts[0]?.action?.onClick();
    for (const r of retries) expect(r).toHaveBeenCalledTimes(1);
  });

  it("a read failing after the group's toast CLOSED (its X, or pushed out of the stack) opens a NEW toast, inside the window", async () => {
    const h = harness();
    const first = vi.fn();
    const second = vi.fn();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: first });
    expect(h.toasts).toHaveLength(1);
    // The toast leaves the screen one second in, long before the window ends.
    h.state.clock += 1_000;
    h.toasts[0]?.onClose?.();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: second });
    expect(h.toasts).toHaveLength(2);
    h.toasts[1]?.action?.onClick();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("while the group's toast is still up, a read failing inside the window joins it", async () => {
    const h = harness();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: vi.fn() });
    h.state.clock += 1_000;
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: vi.fn() });
    expect(h.toasts).toHaveLength(1);
  });

  it("a read failing after the window opens a NEW toast", async () => {
    const h = harness();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: vi.fn() });
    h.state.clock += READ_TOAST_WINDOW_MS;
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: vi.fn() });
    expect(h.toasts).toHaveLength(2);
  });

  it("once a skew reload is on its way, network failures say nothing and reads are not retried", async () => {
    const h = harness({ beforeReload: () => new Promise(() => {}) });
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "read", retry: vi.fn() });
    const call = sequence([new TypeError("x")], "late");
    const out = await h.runner.runAction(call, { kind: "read", retry: vi.fn() });
    expect(out).toEqual({ failed: true, failure: "network" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(h.toasts).toHaveLength(1); // the skew toast only
  });
});

describe("while a reload is on its way, a real failure still reaches Sentry", () => {
  it("skew, then an Error: the Error is REPORTED once as 'error', and no second toast is shown", async () => {
    // beforeReload never settles: the whole test runs inside the window
    // between the skew toast and the reload (toast, flush, lazy import).
    const h = harness({ beforeReload: () => new Promise(() => {}) });
    await h.runner.runAction(() => Promise.reject(skewError()), { kind: "read", retry: vi.fn() });
    const e = new Error("An unexpected response was received from the server.");
    const out = await h.runner.runAction(() => Promise.reject(e), { kind: "write", retry: vi.fn() });
    expect(out).toEqual({ failed: true, failure: "error" });
    expect(h.reports.filter((r) => r.handledAs === "error")).toEqual([{ error: e, handledAs: "error" }]);
    expect(h.reports.map((r) => r.handledAs)).toEqual(["skew", "error"]);
    // The page is going: the skew toast is the only one.
    expect(h.toasts).toEqual([{ tone: "info", message: s["actions.skewReload"] }]);
    expect(h.state.reloads).toBe(0);
  });

  it("S6's quiet reload, then an Error: the Error is reported, and nothing is shown", async () => {
    const h = harness({ beforeReload: () => new Promise(() => {}) });
    expect(h.runner.reloadQuietly()).toBe(true);
    const e = new Error("AUTH_UNAVAILABLE");
    await h.runner.runAction(() => Promise.reject(e), { kind: "read", retry: vi.fn() });
    expect(h.reports).toEqual([{ error: e, handledAs: "error" }]);
    expect(h.toasts).toEqual([]);
  });
});

describe("values and Next's control flow pass through", () => {
  it("an {ok:false} result is a VALUE: returned untouched, no toast, no report", async () => {
    const h = harness();
    const refusal = { ok: false as const, error: "conflict", conflicts: [] };
    const out = await h.runner.runAction(async () => refusal, { kind: "write", retry: vi.fn() });
    expect(out).toEqual({ failed: false, value: refusal });
    expect(out.failed === false && out.value).toBe(refusal);
    expect(h.toasts).toEqual([]);
    expect(h.reports).toEqual([]);
  });

  it("an action's redirect (Next already navigating) is quiet: no toast, no report, no reload, not rethrown", async () => {
    const h = harness();
    const e = getRedirectError("/login", "push") as Error & { handled?: boolean };
    e.handled = true;
    const out = await h.runner.runAction(() => Promise.reject(e), { kind: "write", retry: vi.fn() });
    await settle();
    expect(out).toEqual({ failed: true, failure: "navigation" });
    expect(h.toasts).toEqual([]);
    expect(h.reports).toEqual([]);
    expect(h.rethrown).toEqual([]);
    expect(h.state.reloads).toBe(0);
  });

  it("any other Next control-flow error is handed back to Next, never swallowed", async () => {
    const h = harness();
    const e = getRedirectError("/login", "replace");
    const out = await h.runner.runAction(() => Promise.reject(e), { kind: "read", retry: vi.fn() });
    expect(out).toEqual({ failed: true, failure: "navigation" });
    expect(h.rethrown).toEqual([e]);
    expect(h.toasts).toEqual([]);
  });

  it("any other error is REPORTED and shown as the generic sentence, never Next's English message", async () => {
    const h = harness();
    const e = new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds",
    );
    const retry = vi.fn();
    const out = await h.runner.runAction(() => Promise.reject(e), { kind: "write", retry });
    expect(out).toEqual({ failed: true, failure: "error" });
    expect(h.reports).toEqual([{ error: e, handledAs: "error" }]);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]?.message).toBe("Ocorreu um erro. Tente novamente.");
    expect(h.toasts[0]?.message).not.toContain("Server Components");
    h.toasts[0]?.action?.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("the AUTH_UNAVAILABLE outage throw is not retried as a read (it is not a network failure)", async () => {
    const h = harness();
    const call = sequence([new Error("AUTH_UNAVAILABLE")], "never");
    const out = await h.runner.runAction(call, { kind: "read", retry: vi.fn() });
    expect(out).toEqual({ failed: true, failure: "error" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(h.reports).toHaveLength(1);
  });
});

describe("a write's toast belongs to its form (owner)", () => {
  it("the toast CLOSES when the form unmounts, and its retry never runs after that", async () => {
    const h = harness();
    const form = fakeOwner();
    const retry = vi.fn();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "write", retry, owner: form.owner });
    expect(h.toasts).toHaveLength(1);
    expect(h.closedByRunner).toEqual([]);
    form.end();
    expect(h.closedByRunner).toEqual([0]);
    // Pressed in the instant between the unmount and the toast going: nothing.
    h.toasts[0]?.action?.onClick();
    expect(retry).not.toHaveBeenCalled();
  });

  it("while the form is mounted, the retry runs as before", async () => {
    const h = harness();
    const form = fakeOwner();
    const retry = vi.fn();
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "write", retry, owner: form.owner });
    h.toasts[0]?.action?.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a write that fails AFTER its form closed still says so, with no retry to press", async () => {
    const h = harness();
    const form = fakeOwner();
    const retry = vi.fn();
    let fail!: (e: unknown) => void;
    const pending = h.runner.runAction(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
      { kind: "write", retry, owner: form.owner },
    );
    form.end();
    fail(new TypeError("x"));
    expect(await pending).toEqual({ failed: true, failure: "network" });
    expect(h.toasts).toEqual([{ tone: "error", message: s["actions.networkError"] }]);
  });

  it("an owner that throws is treated as gone, and nothing escapes", async () => {
    const h = harness();
    const owner: ActionOwner = {
      alive: () => {
        throw new Error("owner");
      },
      onEnd: () => {
        throw new Error("owner");
      },
    };
    await expect(
      h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "write", retry: vi.fn(), owner }),
    ).resolves.toEqual({ failed: true, failure: "network" });
    expect(h.toasts[0]?.action).toBeUndefined();
  });
});

describe("a network class is earned: only a promise the call returned can fail on the network", () => {
  it("a TypeError thrown while the thunk BUILDS its arguments is a bug: reported, generic toast, never retried", async () => {
    const h = harness();
    const appointment = undefined as unknown as { id: string };
    const action = vi.fn(async (id: string) => `sent ${id}`);
    const out = await h.runner.runAction(() => action(appointment.id), { kind: "read", retry: vi.fn() });
    expect(out).toEqual({ failed: true, failure: "error" });
    expect(action).not.toHaveBeenCalled();
    expect(h.waits).toEqual([]);
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]?.handledAs).toBe("error");
    expect(h.reports[0]?.error).toBeInstanceOf(TypeError);
    expect(h.toasts[0]?.message).toBe(s["errors.generic"]);
  });

  it("the same TypeError arriving as a REJECTION of the returned promise is a network failure", async () => {
    const h = harness();
    const out = await h.runner.runAction(() => Promise.reject(new TypeError("Load failed")), {
      kind: "write",
      retry: vi.fn(),
    });
    expect(out).toEqual({ failed: true, failure: "network" });
  });
});

describe("the wrapper NEVER rejects", () => {
  it("resolves when the call throws synchronously instead of returning a promise", async () => {
    const h = harness();
    const out = await h.runner.runAction(
      () => {
        throw new Error("sync");
      },
      { kind: "write", retry: vi.fn() },
    );
    expect(out).toEqual({ failed: true, failure: "error" });
  });

  it("resolves when every injected dependency throws", async () => {
    const boom = () => {
      throw new Error("dependency failed");
    };
    const h = harness({
      classify: boom,
      notify: boom,
      report: boom,
      reload: boom,
      rethrowControlFlow: boom,
      beforeReload: boom,
      online: boom,
    });
    await expect(
      h.runner.runAction(() => Promise.reject(new Error("x")), { kind: "read", retry: vi.fn() }),
    ).resolves.toEqual({ failed: true, failure: "error" });
  });

  it("resolves when the retry delay itself rejects", async () => {
    const h = harness({ wait: () => Promise.reject(new Error("timer")) });
    await expect(
      h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry: vi.fn() }),
    ).resolves.toEqual({ failed: true, failure: "error" });
  });

  it("a write's retry handler that throws, pressed from the toast, does not throw out of the button, and is REPORTED", async () => {
    const h = harness();
    const bug = new Error("handler");
    await h.runner.runAction(() => Promise.reject(new TypeError("x")), {
      kind: "write",
      retry: () => {
        throw bug;
      },
    });
    expect(h.reports).toEqual([]);
    expect(() => h.toasts[0]?.action?.onClick()).not.toThrow();
    // A bug in the page's own handler is never silent.
    expect(h.reports).toEqual([{ error: bug, handledAs: "error" }]);
  });

  it("in a read group, one retry that throws is REPORTED and the others still run", async () => {
    const h = harness();
    const bug = new Error("handler");
    const before = vi.fn();
    const after = vi.fn();
    const failing = [
      before,
      () => {
        throw bug;
      },
      after,
    ];
    await Promise.all(
      failing.map((retry) =>
        h.runner.runAction(() => Promise.reject(new TypeError("x")), { kind: "read", retry }),
      ),
    );
    expect(h.toasts).toHaveLength(1);
    expect(() => h.toasts[0]?.action?.onClick()).not.toThrow();
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(h.reports).toEqual([{ error: bug, handledAs: "error" }]);
  });

  it("across every failure kind at once, no rejection escapes", async () => {
    const h = harness();
    const handled = getRedirectError("/login", "push") as Error & { handled?: boolean };
    handled.handled = true;
    const errors: unknown[] = [skewError(), new TypeError("x"), handled, new Error("y"), "z", null];
    const outcomes = await Promise.allSettled(
      errors.flatMap((e) => [
        h.runner.runAction(() => Promise.reject(e), { kind: "read", retry: vi.fn() }),
        h.runner.runAction(() => Promise.reject(e), { kind: "write", retry: vi.fn() }),
      ]),
    );
    await settle();
    for (const o of outcomes) expect(o.status).toBe("fulfilled");
    expect(unhandled).toEqual([]);
  });
});

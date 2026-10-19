/**
 * OSTEOJP-WEB-7 - the /login form survives a deployment it was not built for.
 *
 * Drives the pure wrapper with plain functions (apps/web vitest runs in node,
 * no DOM). The error under test is Next's own UnrecognizedActionError class,
 * the one server-action-reducer.js throws on `x-nextjs-action-not-found: 1`.
 */
import { readFileSync } from "node:fs";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { getStrings } from "@osteojp/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LoginState } from "./actions";
import {
  RELOAD_DELAY_MS,
  RELOAD_GUARD_MS,
  handleStaleAction,
  withStaleActionReload,
  type LoginClientState,
  type StaleReloadDeps,
} from "./stale-action";

const PASSWORD = "s3cret-Pa55word-do-not-log";

function harness(opts: { readThrows?: boolean; writeThrows?: boolean; start?: number } = {}) {
  let marker: string | null = null;
  let clock = opts.start ?? 1_000_000;
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  const reload = vi.fn();
  const deps: StaleReloadDeps = {
    now: () => clock,
    readMarker: () => {
      if (opts.readThrows) throw new Error("SecurityError");
      return marker;
    },
    writeMarker: (v) => {
      if (opts.writeThrows) throw new Error("QuotaExceededError");
      marker = v;
    },
    reload,
    schedule: (fn, ms) => {
      scheduled.push({ fn, ms });
    },
  };
  return {
    deps,
    reload,
    scheduled,
    advance: (ms: number) => {
      clock += ms;
    },
    marker: () => marker,
    runScheduled: () => {
      for (const s of scheduled.splice(0)) s.fn();
    },
  };
}

function form(): FormData {
  const fd = new FormData();
  fd.set("email", "staff@example.invalid");
  fd.set("password", PASSWORD);
  return fd;
}

const prev: LoginClientState = { error: null, staleAction: false };

function skewError(): UnrecognizedActionError {
  return new UnrecognizedActionError(
    'Server Action "abc123" was not found on the server.',
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the stale-action error on /login", () => {
  it("shows the line and reloads the page exactly once", async () => {
    const h = harness();
    const action = vi.fn<(p: LoginState, f: FormData) => Promise<LoginState>>()
      .mockRejectedValue(skewError());
    const run = withStaleActionReload(action, h.deps);

    const out = await run(prev, form());

    expect(out).toEqual({ error: null, staleAction: true });
    expect(h.reload).not.toHaveBeenCalled(); // deferred so the line can be read
    expect(h.scheduled).toHaveLength(1);
    expect(h.scheduled[0]?.ms).toBe(RELOAD_DELAY_MS);
    h.runScheduled();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("also recognises the error by name, for a second copy of the class", async () => {
    const h = harness();
    const e = new Error("Server Action was not found");
    e.name = "UnrecognizedActionError";
    const run = withStaleActionReload(() => Promise.reject(e), h.deps);
    expect(await run(prev, form())).toEqual({ error: null, staleAction: true });
    h.runScheduled();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("guard: a second stale failure within the window shows the line and does NOT reload", async () => {
    const h = harness();
    const run = withStaleActionReload(() => Promise.reject(skewError()), h.deps);

    await run(prev, form());
    h.runScheduled();
    expect(h.reload).toHaveBeenCalledTimes(1);

    // The page came back (same tab, same sessionStorage) and failed again.
    h.advance(RELOAD_GUARD_MS - 1);
    const again = await run(prev, form());
    expect(again).toEqual({ error: null, staleAction: true });
    expect(h.scheduled).toHaveLength(0);
    h.runScheduled();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("guard: a double submit before the reload fires schedules one reload, not two", async () => {
    const h = harness();
    const run = withStaleActionReload(() => Promise.reject(skewError()), h.deps);
    await run(prev, form());
    await run(prev, form());
    expect(h.scheduled).toHaveLength(1);
  });

  it("guard: after the window has passed, a new stale failure reloads again", async () => {
    const h = harness();
    expect(handleStaleAction(h.deps)).toBe("reloading");
    h.advance(RELOAD_GUARD_MS);
    expect(handleStaleAction(h.deps)).toBe("reloading");
    h.runScheduled();
    expect(h.reload).toHaveBeenCalledTimes(2);
  });

  it("guard: an unreadable marker value is not a guard", () => {
    const h = harness();
    h.deps.writeMarker("not-a-number");
    expect(handleStaleAction(h.deps)).toBe("reloading");
  });

  it("storage blocked: still reloads once, and never throws", async () => {
    const h = harness({ readThrows: true, writeThrows: true });
    const run = withStaleActionReload(() => Promise.reject(skewError()), h.deps);
    await expect(run(prev, form())).resolves.toEqual({ error: null, staleAction: true });
    h.runScheduled();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("a reload that throws is contained", () => {
    const h = harness();
    h.reload.mockImplementation(() => {
      throw new Error("blocked");
    });
    handleStaleAction(h.deps);
    expect(() => h.runScheduled()).not.toThrow();
  });
});

describe("every other outcome is untouched", () => {
  it("another error is rethrown as-is and nothing reloads", async () => {
    const h = harness();
    const boom = new Error("An unexpected response was received from the server.");
    const run = withStaleActionReload(() => Promise.reject(boom), h.deps);
    await expect(run(prev, form())).rejects.toBe(boom);
    expect(h.scheduled).toHaveLength(0);
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.marker()).toBeNull();
  });

  it("a network TypeError is rethrown and nothing reloads", async () => {
    const h = harness();
    const net = new TypeError("Failed to fetch");
    const run = withStaleActionReload(() => Promise.reject(net), h.deps);
    await expect(run(prev, form())).rejects.toBe(net);
    expect(h.scheduled).toHaveLength(0);
  });

  it("a returned refusal passes through with the server's own text", async () => {
    const h = harness();
    const refused = { error: "Não foi possível iniciar sessão. Verifique o email e a palavra-passe." };
    const action = vi.fn(async () => refused);
    const run = withStaleActionReload(action, h.deps);
    expect(await run({ error: "old", staleAction: true }, form())).toEqual({
      ...refused,
      staleAction: false,
    });
    // The server action receives only its own state shape, and the form as given.
    expect(action).toHaveBeenCalledWith({ error: "old" }, expect.any(FormData));
    expect(h.scheduled).toHaveLength(0);
  });
});

describe("nothing typed leaves the form", () => {
  it("the stale path logs nothing and stores nothing derived from the input", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const h = harness();
    const run = withStaleActionReload(() => Promise.reject(skewError()), h.deps);
    const out = await run(prev, form());
    h.runScheduled();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).not.toContain(PASSWORD);
    expect(h.marker()).toMatch(/^\d+$/);
  });
});

describe("the line, in both languages", () => {
  it("exists in pt and en and uses no em or en dash", () => {
    const pt = getStrings("pt")["login.appUpdatedReloading"];
    const en = getStrings("en")["login.appUpdatedReloading"];
    expect(pt).toBe("A aplicação foi atualizada. A recarregar a página…");
    expect(en).toBe("The app was updated. Reloading the page…");
    for (const text of [pt, en]) expect(text).not.toMatch(/[–—]/);
  });
});

describe("the page is wired to the wrapper", () => {
  // A source guard: the node test environment cannot submit the form, so this
  // pins the two lines that make the wrapper reach a real tab.
  const src = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("useActionState runs the wrapped action, not the bare server action", () => {
    expect(src).toContain("withStaleActionReload(login, browserStaleReloadDeps)");
    expect(src).toContain("useActionState(loginAction, initial)");
    expect(src).not.toContain("useActionState(login,");
  });

  it("renders the line from the i18n key when the state says so", () => {
    expect(src).toMatch(/state\.staleAction \?[\s\S]{0,200}s\["login\.appUpdatedReloading"\]/);
  });
});

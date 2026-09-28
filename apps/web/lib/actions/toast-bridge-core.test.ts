import { describe, expect, it, vi } from "vitest";

import { createToastBridge, type ToastLike } from "./toast-bridge-core";

/**
 * SKEW-01 S4 - the toast bridge's decisions, driven without a DOM (apps/web
 * vitest runs in node). The DOM half, a real page with no provider, is
 * agenda-action-skew.spec.ts ("a page with no ToastProvider").
 */

type T = ToastLike & { message: string };

/** A provider stand-in: `mounted` says whether showToast can reach one. */
function world(options: { mounted?: boolean; mount?: () => Promise<void> } = {}) {
  const state = { mounted: options.mounted ?? false, mounts: 0 };
  const shown: T[] = [];
  const closed: T[] = [];
  const show = vi.fn((toast: T) => {
    if (!state.mounted) return null;
    shown.push(toast);
    return () => {
      closed.push(toast);
      toast.onClose?.();
    };
  });
  const mountFallback = vi.fn(
    options.mount ??
      (async () => {
        state.mounts += 1;
        // Like the real one (a dynamic import of react-dom/client): the
        // provider is reachable only once the mount has actually resolved.
        await Promise.resolve();
        state.mounted = true;
      }),
  );
  const notify = createToastBridge<T>({ show, mountFallback });
  return { notify, show, mountFallback, shown, closed, state };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a page WITH a provider", () => {
  it("pushes straight into it and mounts nothing", () => {
    const w = world({ mounted: true });
    w.notify({ message: "a" });
    expect(w.shown.map((t) => t.message)).toEqual(["a"]);
    expect(w.mountFallback).not.toHaveBeenCalled();
  });

  it("the returned function closes that toast", () => {
    const w = world({ mounted: true });
    const onClose = vi.fn();
    const close = w.notify({ message: "a", onClose });
    close();
    close();
    expect(w.closed).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("a page with NO provider (every page but /agenda, /marcacoes and /patients/[id])", () => {
  it("mounts the fallback provider and shows the toast in it", async () => {
    const w = world();
    w.notify({ message: "a" });
    expect(w.shown).toEqual([]);
    await flush();
    expect(w.state.mounts).toBe(1);
    expect(w.shown.map((t) => t.message)).toEqual(["a"]);
  });

  it("mounts it ONCE, however many toasts arrive while it is mounting", async () => {
    const w = world();
    for (const m of ["a", "b", "c", "d", "e", "f", "g"]) w.notify({ message: m });
    await flush();
    expect(w.mountFallback).toHaveBeenCalledTimes(1);
    expect(w.shown.map((t) => t.message)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("a toast closed before the fallback is up is never shown, and reports its close", async () => {
    const w = world();
    const onClose = vi.fn();
    const close = w.notify({ message: "a", onClose });
    close();
    await flush();
    expect(w.shown).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a fallback that fails to mount drops the toast, reports its close, and is tried again next time", async () => {
    let attempt = 0;
    const w = world({
      mount: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("chunk failed to load");
        w.state.mounted = true;
      },
    });
    const onClose = vi.fn();
    w.notify({ message: "a", onClose });
    await flush();
    expect(w.shown).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    w.notify({ message: "b" });
    await flush();
    expect(w.mountFallback).toHaveBeenCalledTimes(2);
    expect(w.shown.map((t) => t.message)).toEqual(["b"]);
  });
});

describe("it never throws", () => {
  it("show throwing, mount throwing synchronously, and onClose throwing all stay inside", async () => {
    const notify = createToastBridge<T>({
      show: () => {
        throw new Error("show");
      },
      mountFallback: () => {
        throw new Error("mount");
      },
    });
    const close = notify({
      message: "a",
      onClose: () => {
        throw new Error("onClose");
      },
    });
    expect(() => close()).not.toThrow();

    const notify2 = createToastBridge<T>({
      show: () => null,
      mountFallback: () => {
        throw new Error("mount");
      },
    });
    expect(() => notify2({ message: "b" })).not.toThrow();
    await flush();
  });
});

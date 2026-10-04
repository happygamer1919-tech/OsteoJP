import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_STACK,
  appendToStack,
  createToastLifecycle,
  createToasterRegistry,
  pickRegionParent,
  type Toaster,
} from "./toast-store";

/**
 * SKEW-01 - the rules of the shared Toast (Toast.tsx) that decide when a toast
 * has left, which provider showToast reaches, and which modal the region sits
 * in. Toast.tsx renders; these decide. The popover and the drawer placement
 * themselves are browser behaviour and are proven by apps/web's e2e specs
 * (agenda-action-offline, agenda-action-skew, scheduling).
 */

type Opts = { onClose?: () => void; label?: string };

describe("appendToStack", () => {
  it("keeps the newest three, oldest first", () => {
    expect(MAX_STACK).toBe(3);
    expect(appendToStack([1, 2], 3)).toEqual([1, 2, 3]);
    expect(appendToStack([1, 2, 3], 4)).toEqual([2, 3, 4]);
  });

  it("does not change the stack it was given", () => {
    const stack = [1, 2, 3];
    appendToStack(stack, 4);
    expect(stack).toEqual([1, 2, 3]);
  });
});

describe("toast lifecycle: onClose runs once, whichever way a toast leaves", () => {
  it("release (its timeout, its X, its action, showToast's close) runs onClose once", () => {
    const store = createToastLifecycle<Opts, string>();
    const onClose = vi.fn();
    const id = store.open({ onClose }, null);
    expect(store.isLive(id)).toBe(true);
    store.release(id);
    store.release(id);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.isLive(id)).toBe(false);
  });

  it("a toast closed before its render was ever added is no longer live (Toast.tsx skips adding it)", () => {
    const store = createToastLifecycle<Opts, string>();
    const onClose = vi.fn();
    const id = store.open({ onClose }, "drawer");
    store.release(id);
    expect(store.isLive(id)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("an onClose that throws does not escape and the toast still leaves", () => {
    const store = createToastLifecycle<Opts, string>();
    const id = store.open(
      {
        onClose: () => {
          throw new Error("caller bug");
        },
      },
      null,
    );
    expect(() => store.release(id)).not.toThrow();
    expect(store.isLive(id)).toBe(false);
  });

  it("a toast pushed out of the stack by a newer one is released when that render commits", () => {
    const store = createToastLifecycle<Opts, string>();
    const closed: number[] = [];
    const ids = [1, 2, 3, 4].map(() => {
      const id: number = store.open({ onClose: () => closed.push(id) }, null);
      store.entered(id);
      return id;
    });
    const onScreen = ids.reduce<number[]>((stack, id) => appendToStack(stack, id), []);
    expect(onScreen).toEqual([ids[1], ids[2], ids[3]]);
    store.committed(onScreen);
    expect(closed).toEqual([ids[0]]);
    expect(ids.slice(1).every((id) => store.isLive(id))).toBe(true);
  });

  it("a toast raised after the newest committed render is on its way, not gone", () => {
    const store = createToastLifecycle<Opts, string>();
    const first = vi.fn();
    const second = vi.fn();
    const a = store.open({ onClose: first }, null);
    const b = store.open({ onClose: second }, null);
    store.entered(a);
    store.entered(b);
    // The render holding `a` commits before the one holding `b`.
    store.committed([a]);
    expect(second).not.toHaveBeenCalled();
    expect(store.isLive(b)).toBe(true);
    store.committed([a, b]);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  /**
   * BOOK-CONFIRM, CI 2026-10-04 (PR #1536, e2e/book-confirm.spec.ts, the guest
   * booking for a patient with neither contact, failed 3 of 3). The drawer's
   * save raises TWO toasts in one tick: the approver's notice, then "Marcação
   * guardada". Toast.tsx, with a drawer open and no toast on screen:
   *
   *   notice  raised: the region must MOVE into the drawer, so its add waits a frame
   *   saved   raised: the region is already there, so it is added at once
   *   render commits holding [saved]
   *   one frame later the notice's add runs: `if (!store.isLive(id)) return;`
   *
   * The server action had returned `"notice":"patient_no_email"` (read from the
   * CI trace); the page showed only "Marcação guardada". These arms replay that
   * sequence against the store, which is where the notice was lost.
   */
  it("THE DRAWER'S TWO TOASTS: a toast raised first and added late is not released by the commit of the one added before it", () => {
    const store = createToastLifecycle<Opts, string>();
    const noticeClosed = vi.fn();
    const savedClosed = vi.fn();
    const notice = store.open({ onClose: noticeClosed, label: "notice" }, "drawer"); // its add is deferred
    const saved = store.open({ onClose: savedClosed, label: "saved" }, "drawer");
    store.entered(saved); // added at once
    store.committed([saved]);
    // The notice is still on its way: Toast.tsx's deferred add must find it live.
    expect(store.isLive(notice)).toBe(true);
    expect(noticeClosed).not.toHaveBeenCalled();

    // One frame later it enters, behind the toast raised after it.
    store.entered(notice);
    store.committed([saved, notice]);
    expect(store.isLive(notice)).toBe(true);
    expect(store.isLive(saved)).toBe(true);
    expect(noticeClosed).not.toHaveBeenCalled();
    expect(savedClosed).not.toHaveBeenCalled();
    // Both origins still count while both are up.
    expect([...store.origins()]).toEqual(["drawer", "drawer"]);
  });

  it("a toast that has not entered is never released by a commit, however many pass", () => {
    const store = createToastLifecycle<Opts, string>();
    const onClose = vi.fn();
    const waiting = store.open({ onClose }, "drawer");
    const others = [1, 2, 3, 4].map(() => {
      const id = store.open({}, null);
      store.entered(id);
      return id;
    });
    store.committed(others.slice(1));
    store.committed([]);
    expect(store.isLive(waiting)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    // Its own exits still work: closed before it was ever added.
    store.release(waiting);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a late toast that entered and was then pushed out of the stack is released, once", () => {
    const store = createToastLifecycle<Opts, string>();
    const onClose = vi.fn();
    const late = store.open({ onClose }, "drawer");
    const first = store.open({}, "drawer");
    store.entered(first);
    store.committed([first]);
    store.entered(late);
    store.committed([first, late]);
    // Three newer toasts push both out.
    const newer = [1, 2, 3].map(() => {
      const id = store.open({}, null);
      store.entered(id);
      return id;
    });
    store.committed(newer);
    store.committed(newer);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.isLive(late)).toBe(false);
    expect(store.isLive(first)).toBe(false);
  });

  it("entered is idempotent and ignores a toast that has left", () => {
    const store = createToastLifecycle<Opts, string>();
    const a = store.open({}, null);
    const b = store.open({}, null);
    store.entered(a);
    store.entered(a);
    store.entered(b);
    // `a` entered once, before `b`: the commit holding only `b` has reached it.
    store.committed([b]);
    expect(store.isLive(a)).toBe(false);
    expect(() => store.entered(a)).not.toThrow();
    expect(store.isLive(a)).toBe(false);
  });

  it("Toast.tsx announces the entry at the moment it adds the toast, after the liveness check (source arm)", () => {
    // Toast.tsx needs a DOM, which this package's unit tests do not have, so
    // the one call that ties it to the rule above is pinned in its source.
    // Without it a toast pushed out before any render held it would never be
    // released, and its onClose would never run.
    const src = readFileSync(join(__dirname, "Toast.tsx"), "utf8");
    const add = src.slice(src.indexOf("const add = () => {"), src.indexOf("const el = hostRef.current;"));
    const live = add.indexOf("if (!store.isLive(id)) return;");
    const entered = add.indexOf("store.entered(id);");
    const set = add.indexOf("setToasts(");
    expect(live).toBeGreaterThan(-1);
    expect(entered).toBeGreaterThan(live);
    expect(set).toBeGreaterThan(entered);
  });

  it("a toast that left the screen after being on it is released by the next commit, once", () => {
    const store = createToastLifecycle<Opts, string>();
    const onClose = vi.fn();
    const a = store.open({ onClose }, null);
    const b = store.open({}, null);
    store.committed([a, b]);
    store.committed([b]);
    store.committed([b]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a toast closed through release is not released again by the commit that removes it", () => {
    const store = createToastLifecycle<Opts, string>();
    const onClose = vi.fn();
    const a = store.open({ onClose }, null);
    store.committed([a]);
    store.release(a);
    store.committed([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the provider unmounting releases every live toast once", () => {
    const store = createToastLifecycle<Opts, string>();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const idA = store.open({ onClose: a }, null);
    store.open({ onClose: b }, "drawer");
    store.open({ onClose: c }, null);
    store.release(idA);
    store.releaseAll();
    store.releaseAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("origins follow the live toasts: a released toast's modal no longer counts", () => {
    const store = createToastLifecycle<Opts, string>();
    const a = store.open({}, "drawer");
    store.open({}, null);
    expect([...store.origins()]).toEqual(["drawer", null]);
    store.release(a);
    expect([...store.origins()]).toEqual([null]);
  });

  it("ids are unique and increasing", () => {
    const store = createToastLifecycle<Opts, string>();
    const a = store.open({}, null);
    const b = store.open({}, null);
    store.release(a);
    const c = store.open({}, null);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("showToast's registry", () => {
  function fakeToaster(): Toaster<Opts> & { pushed: Opts[]; closed: number[] } {
    const pushed: Opts[] = [];
    const closed: number[] = [];
    return {
      pushed,
      closed,
      push(options) {
        pushed.push(options);
        return pushed.length;
      },
      close(id) {
        closed.push(id);
      },
    };
  }

  it("returns null when no provider is mounted, and never throws", () => {
    const registry = createToasterRegistry<Opts>();
    expect(registry.show({ label: "x" })).toBeNull();
  });

  it("pushes into the provider mounted last, and its close function closes that toast there", () => {
    const registry = createToasterRegistry<Opts>();
    const first = fakeToaster();
    const second = fakeToaster();
    registry.register(first);
    registry.register(second);
    const close = registry.show({ label: "x" });
    expect(second.pushed).toEqual([{ label: "x" }]);
    expect(first.pushed).toEqual([]);
    close?.();
    expect(second.closed).toEqual([1]);
  });

  it("falls back to the earlier provider when the last one unmounts, and to null after both", () => {
    const registry = createToasterRegistry<Opts>();
    const first = fakeToaster();
    const second = fakeToaster();
    const offFirst = registry.register(first);
    const offSecond = registry.register(second);
    offSecond();
    offSecond();
    registry.show({ label: "a" });
    expect(first.pushed).toEqual([{ label: "a" }]);
    offFirst();
    expect(registry.show({ label: "b" })).toBeNull();
  });

  it("unmounting an earlier provider leaves the last one reachable", () => {
    const registry = createToasterRegistry<Opts>();
    const first = fakeToaster();
    const second = fakeToaster();
    const offFirst = registry.register(first);
    registry.register(second);
    offFirst();
    registry.show({ label: "x" });
    expect(second.pushed).toEqual([{ label: "x" }]);
  });
});

describe("pickRegionParent: the region goes into a modal only for a toast raised in it", () => {
  it("no toast raised in a modal: the body (null)", () => {
    expect(pickRegionParent(["drawer"], [])).toBeNull();
    expect(pickRegionParent(["drawer"], [null, null])).toBeNull();
  });

  it("a toast raised in an open drawer: that drawer", () => {
    expect(pickRegionParent(["drawer"], ["drawer", null])).toBe("drawer");
  });

  it("a drawer opened AFTER the toast was raised does not take the region", () => {
    // The toast was raised on the page (null); a drawer is open now.
    expect(pickRegionParent(["drawer"], [null])).toBeNull();
  });

  it("an origin that has closed no longer counts", () => {
    expect(pickRegionParent(["other"], ["drawer"])).toBeNull();
  });

  it("two origins open: the topmost, which is later in document order", () => {
    expect(pickRegionParent(["drawer", "discard-dialog"], ["drawer", "discard-dialog"])).toBe(
      "discard-dialog",
    );
    expect(pickRegionParent(["drawer", "discard-dialog"], ["drawer"])).toBe("drawer");
  });
});

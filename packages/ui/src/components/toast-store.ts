/**
 * SKEW-01 - THE PURE PARTS OF Toast.tsx: no React, no DOM.
 *
 * Toast.tsx keeps the rendering, the popover and the timers; the rules below
 * decide WHEN a toast has left (so its `onClose` runs exactly once), WHICH
 * provider `showToast` reaches, and WHICH open modal the region belongs in.
 * They live here so toast-store.test.ts can prove them in node, which is the
 * only environment this package's unit tests run in (vitest.config.ts,
 * project "unit").
 */

/** At most this many toasts are on screen; a newer one pushes the oldest out. */
export const MAX_STACK = 3;

/** The new stack after `item` is added: the newest `max`, oldest first. */
export function appendToStack<T>(stack: readonly T[], item: T, max: number = MAX_STACK): T[] {
  return [...stack, item].slice(-max);
}

export interface ClosableToast {
  onClose?: () => void;
}

/**
 * Every toast from the moment it is raised until it leaves, and the modal it
 * was raised in. `M` is the modal's type (an Element in the browser).
 */
export interface ToastLifecycle<O extends ClosableToast, M> {
  /** Records a toast raised while `origin` was the topmost modal (null: none). Returns its id. */
  open(options: O, origin: M | null): number;
  /** True from `open` until the toast has left. */
  isLive(id: number): boolean;
  /**
   * The toast left, for whatever reason. Its `onClose` runs here, once: a
   * second release of the same id (two exits racing) does nothing, and an
   * `onClose` that throws does not escape.
   */
  release(id: number): void;
  /**
   * A render committed with `onScreen` on screen. A live toast that a committed
   * render had already reached and that is no longer on screen was pushed out
   * of the stack, so it is released. A toast raised after the newest committed
   * render is still on its way, not gone, and is left alone.
   */
  committed(onScreen: readonly number[]): void;
  /** The provider is going away: every live toast leaves. */
  releaseAll(): void;
  /** The modal each live toast was raised in, for pickRegionParent. */
  origins(): Iterable<M | null>;
}

export function createToastLifecycle<O extends ClosableToast, M>(): ToastLifecycle<O, M> {
  let lastId = 0;
  /** The highest id any committed render has held. */
  let committedUpTo = 0;
  const live = new Map<number, O>();
  const originOf = new Map<number, M | null>();

  function release(id: number): void {
    const options = live.get(id);
    if (!options) return;
    live.delete(id);
    originOf.delete(id);
    try {
      options.onClose?.();
    } catch {
      // A caller's close handler must not break the toast stack.
    }
  }

  return {
    open(options, origin) {
      lastId += 1;
      live.set(lastId, options);
      originOf.set(lastId, origin);
      return lastId;
    },
    isLive: (id) => live.has(id),
    release,
    committed(onScreen) {
      for (const id of onScreen) if (id > committedUpTo) committedUpTo = id;
      const present = new Set(onScreen);
      for (const id of [...live.keys()]) {
        if (id <= committedUpTo && !present.has(id)) release(id);
      }
    },
    releaseAll() {
      for (const id of [...live.keys()]) release(id);
    },
    origins: () => originOf.values(),
  };
}

/** One mounted ToastProvider, as `showToast` reaches it. */
export interface Toaster<O> {
  push(options: O): number;
  close(id: number): void;
}

export interface ToasterRegistry<O> {
  /** Adds a mounted provider; returns the function that removes it again. */
  register(toaster: Toaster<O>): () => void;
  /**
   * Pushes into the provider mounted LAST and returns a function that closes
   * that toast, or null when no provider is mounted (the caller decides what a
   * page without one gets).
   */
  show(options: O): (() => void) | null;
}

export function createToasterRegistry<O>(): ToasterRegistry<O> {
  const mounted: Array<Toaster<O>> = [];
  return {
    register(toaster) {
      mounted.push(toaster);
      return () => {
        const i = mounted.lastIndexOf(toaster);
        if (i !== -1) mounted.splice(i, 1);
      };
    },
    show(options) {
      const toaster = mounted[mounted.length - 1];
      if (!toaster) return null;
      const id = toaster.push(options);
      return () => toaster.close(id);
    },
  };
}

/**
 * Where the toast region belongs: the topmost OPEN modal that some live toast
 * was raised in, or null for the page body. `openDialogs` is every open dialog
 * in document order, which is also the order they were shown in (a nested
 * dialog is a DOM descendant of its drawer). A closed or unmounted origin is
 * not in that list and no longer counts.
 */
export function pickRegionParent<E>(openDialogs: ArrayLike<E>, origins: Iterable<unknown>): E | null {
  const wanted = new Set<unknown>();
  for (const origin of origins) if (origin) wanted.add(origin);
  if (wanted.size === 0) return null;
  for (let i = openDialogs.length - 1; i >= 0; i -= 1) {
    const d = openDialogs[i] as E;
    if (wanted.has(d)) return d;
  }
  return null;
}

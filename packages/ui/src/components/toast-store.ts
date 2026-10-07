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
   * The toast was handed to the stack: its render is queued. Toast.tsx calls
   * this at the moment it adds the toast, which is NOT always the moment it was
   * raised (see `committed`).
   */
  entered(id: number): void;
  /**
   * The toast left, for whatever reason. Its `onClose` runs here, once: a
   * second release of the same id (two exits racing) does nothing, and an
   * `onClose` that throws does not escape.
   */
  release(id: number): void;
  /**
   * A render committed with `onScreen` on screen. A live toast that a committed
   * render had already reached and that is no longer on screen was pushed out
   * of the stack, so it is released. A toast that entered after the newest
   * committed render is still on its way, not gone, and is left alone. So is a
   * toast that has not entered at all.
   *
   * "REACHED" IS COUNTED IN THE ORDER TOASTS ENTER THE STACK, NOT IN THE ORDER
   * THEY WERE RAISED. The two differ: a toast whose region has to move first
   * (the first toast raised inside an open drawer) is added one frame late,
   * and a toast raised in the same tick, after it, is added at once. This used
   * to compare ids, which are in RAISE order, so the render holding only the
   * second toast "had already reached" the first, released it as pushed out,
   * and the late add then found it dead and dropped it. BOOK-CONFIRM lost its
   * approver notice that way (raised just before "Marcação guardada" as the
   * drawer saves), on CI, 2026-10-04, in all three attempts.
   */
  committed(onScreen: readonly number[]): void;
  /** The provider is going away: every live toast leaves. */
  releaseAll(): void;
  /** The modal each live toast was raised in, for pickRegionParent. */
  origins(): Iterable<M | null>;
}

export function createToastLifecycle<O extends ClosableToast, M>(): ToastLifecycle<O, M> {
  let lastId = 0;
  /** Counts toasts in the order they ENTER the stack. */
  let lastEntry = 0;
  /** The latest entry any committed render has held. */
  let committedUpTo = 0;
  const live = new Map<number, O>();
  const originOf = new Map<number, M | null>();
  /** Each live toast's place in the entry order; absent until it enters. */
  const entryOf = new Map<number, number>();

  function release(id: number): void {
    const options = live.get(id);
    if (!options) return;
    live.delete(id);
    originOf.delete(id);
    entryOf.delete(id);
    try {
      options.onClose?.();
    } catch {
      // A caller's close handler must not break the toast stack.
    }
  }

  function entered(id: number): void {
    if (!live.has(id) || entryOf.has(id)) return;
    lastEntry += 1;
    entryOf.set(id, lastEntry);
  }

  return {
    open(options, origin) {
      lastId += 1;
      live.set(lastId, options);
      originOf.set(lastId, origin);
      return lastId;
    },
    isLive: (id) => live.has(id),
    entered,
    release,
    committed(onScreen) {
      for (const id of onScreen) {
        // On screen without having been announced: it has entered, now.
        entered(id);
        const entry = entryOf.get(id);
        if (entry !== undefined && entry > committedUpTo) committedUpTo = entry;
      }
      const present = new Set(onScreen);
      for (const [id, entry] of [...entryOf]) {
        if (entry <= committedUpTo && !present.has(id)) release(id);
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

/** The clock and the timers a dismiss timer runs on (the window's, in the browser). */
export interface DismissTimerDeps {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface DismissTimer {
  /** The toast is on screen (again): count down with `onDismiss`, unless it is held. */
  start(onDismiss: () => void): void;
  /** The pointer or the focus is on the toast: stop counting. */
  hold(): void;
  /** The pointer or the focus left it: count down what is left. */
  release(): void;
  /** The toast is leaving the screen (or re-rendering): no timer stays behind. */
  stop(): void;
}

/**
 * THE AUTO-DISMISS COUNTDOWN OF ONE TOAST, PAUSED WHILE IT IS HELD.
 *
 * A toast leaves after `duration` ms ON SCREEN AND NOT HELD. Held means the
 * pointer or the focus is on it.
 *
 * WHY THIS IS A RULE WITH A TEST AND NOT THREE LINES IN Toast.tsx. The first
 * version subtracted "time since the countdown started" on every pause, and
 * read the start time from a variable that was 0 until the countdown started.
 * A pause that came BEFORE the first start therefore subtracted the whole epoch:
 * the time left went to minus 1.7 trillion ms and the toast left the moment the
 * countdown did start. That order is not rare. The region sits in the bottom
 * right corner, which is where a drawer's confirm button is, so after "Marcar"
 * or "Guardar" the new toast is born under the pointer and the browser can
 * deliver the pointer's enter before React runs the effect that starts the
 * countdown. Measured on 2026-10-07 on the local stack: 5 of 30 runs of
 * marcar-novamente.spec.ts lost "Nova marcação criada." within 10 ms of showing
 * it, with the booking saved every time.
 *
 * So: only a RUNNING countdown has elapsed time to subtract; a hold that
 * arrives early is remembered and the countdown simply does not start until the
 * release; and the time left never goes below zero.
 *
 * `stop` then `start` (a re-render with a new `onDismiss`) continues the same
 * countdown: the time already spent on screen stays spent.
 */
export function createDismissTimer(duration: number, deps: DismissTimerDeps): DismissTimer {
  let remaining = Math.max(0, duration);
  let held = false;
  let onDismiss: (() => void) | null = null;
  let running: { handle: unknown; since: number } | null = null;

  function halt(): void {
    if (!running) return;
    deps.clearTimeout(running.handle);
    remaining = Math.max(0, remaining - (deps.now() - running.since));
    running = null;
  }

  function run(): void {
    if (running || held || !onDismiss) return;
    const fire = onDismiss;
    running = {
      since: deps.now(),
      handle: deps.setTimeout(() => {
        running = null;
        remaining = 0;
        fire();
      }, remaining),
    };
  }

  return {
    start(fn) {
      halt();
      onDismiss = fn;
      run();
    },
    hold() {
      held = true;
      halt();
    },
    release() {
      held = false;
      run();
    },
    stop() {
      halt();
      onDismiss = null;
    },
  };
}

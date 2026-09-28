/**
 * SKEW-01 S4 - THE TOAST BRIDGE'S DECISIONS, WITHOUT A DOM.
 *
 * The browser binding is toast-bridge.tsx; this is the part a node unit test
 * can drive (apps/web vitest has no DOM): push into a mounted provider when
 * there is one, otherwise mount the fallback provider ONCE and push into it,
 * and never throw. A toast that cannot be shown is dropped, and its onClose
 * still fires, so a caller waiting on that close (the read-failure group in
 * run-action-core.ts) is not left holding a toast nobody can see.
 */

export interface ToastLike {
  onClose?: () => void;
}

export interface ToastBridgeDeps<T extends ToastLike> {
  /** Pushes into the provider mounted last: a close function, or null when none is mounted. */
  show(options: T): (() => void) | null;
  /** Mounts the fallback provider; resolves once `show` can reach it. */
  mountFallback(): Promise<void>;
}

/** Returns `notify`, which shows a toast and returns a function that closes it. */
export function createToastBridge<T extends ToastLike>(deps: ToastBridgeDeps<T>): (options: T) => () => void {
  let mounting: Promise<boolean> | null = null;

  function ensureFallback(): Promise<boolean> {
    if (!mounting) {
      let started: Promise<void>;
      try {
        started = deps.mountFallback();
      } catch (error) {
        started = Promise.reject(error);
      }
      mounting = started.then(
        () => true,
        () => {
          // Not cached: the next toast tries again.
          mounting = null;
          return false;
        },
      );
    }
    return mounting;
  }

  function dropped(options: T): void {
    try {
      options.onClose?.();
    } catch {
      // The caller's close handler must not throw out of a toast.
    }
  }

  return function notify(options: T): () => void {
    let closed = false;
    let closeShown: (() => void) | null = null;
    const close = () => {
      if (closed) return;
      closed = true;
      if (closeShown) {
        try {
          closeShown();
        } catch {
          // Already gone.
        }
      } else {
        dropped(options);
      }
    };

    try {
      closeShown = deps.show(options);
    } catch {
      closed = true;
      dropped(options);
      return close;
    }
    if (closeShown) return close;

    void ensureFallback().then((mounted) => {
      if (closed) return;
      try {
        closeShown = mounted ? deps.show(options) : null;
      } catch {
        closeShown = null;
      }
      if (!closeShown) {
        closed = true;
        dropped(options);
      }
    });
    return close;
  };
}

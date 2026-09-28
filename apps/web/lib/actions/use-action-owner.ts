import { useEffect, useMemo, useRef } from "react";

import type { ActionOwner } from "./run-action-core";

/**
 * SKEW-01 - A WRITE'S TOAST LIVES AND DIES WITH ITS FORM.
 *
 * A failed save leaves "Tentar novamente" on screen for about five seconds, and
 * the drawer or dialog behind it can close in that time. Pressed after that,
 * the retry would re-send the CLOSED form's values, and on success its onDone()
 * would close whichever drawer is open NOW, possibly one holding unsaved input;
 * a refusal would render into a component nobody can see.
 *
 * Pass the owner a component gets from here as `owner` to runAction: the toast
 * is closed when the component unmounts, and its retry never runs after that
 * (run-action-core.ts, contract 8).
 *
 * `alive` is set again on every mount, so React's development double-mount
 * (mount, unmount, mount) ends up alive.
 */
export function useActionOwner(): ActionOwner {
  const state = useRef({ alive: true, ends: new Set<() => void>() });

  useEffect(() => {
    const current = state.current;
    current.alive = true;
    return () => {
      current.alive = false;
      const ends = [...current.ends];
      current.ends.clear();
      for (const end of ends) {
        try {
          end();
        } catch {
          // Closing a toast must not break an unmount.
        }
      }
    };
  }, []);

  return useMemo<ActionOwner>(
    () => ({
      alive: () => state.current.alive,
      onEnd(fn) {
        if (!state.current.alive) {
          fn();
          return;
        }
        state.current.ends.add(fn);
      },
    }),
    [],
  );
}

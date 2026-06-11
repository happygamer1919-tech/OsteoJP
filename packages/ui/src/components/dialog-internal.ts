"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drives a native <dialog> as a controlled, animated modal — SPEC-foundation
 * §4.6 shared internals for Drawer and Dialog.
 *
 * Native <dialog>.showModal() gives us, for free and correctly: focus trap,
 * Escape-to-close, the inert background, the top-layer stacking (so a Drawer's
 * discard Dialog sits above it), and focus restoration to the previously
 * focused element on close. We only add enter/exit transitions: the element
 * stays open through the exit animation and is `close()`d one --duration-base
 * later, so both directions animate. prefers-reduced-motion collapses the CSS
 * transition globally; the small unmount delay is imperceptible.
 */

/** Matches --duration-base (200ms); the exit-animation unmount delay. */
export const DIALOG_ANIM_MS = 200;

export function useAnimatedDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  // `shown` toggles the open/closed transition classes one frame after the
  // dialog is actually shown, so the enter transition runs from the closed state.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    setShown(false);
    const timer = window.setTimeout(() => {
      if (dialog.open) dialog.close();
    }, DIALOG_ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { ref, shown };
}

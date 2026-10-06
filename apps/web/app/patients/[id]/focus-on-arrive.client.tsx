"use client";

import { useEffect } from "react";

/**
 * EPI-01b, piece 2: after "+ Episódio" the therapist lands back on the Registos
 * tab. This moves the keyboard focus (and the screen reader with it) to what
 * the tab has to show them: the new episode's group, or the question about an
 * episode that is already open. The target is an element the server page drew,
 * named by id; when it is not on the page, nothing happens. Draws nothing.
 */
export function FocusOnArrive({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center" });
  }, [targetId]);
  return null;
}

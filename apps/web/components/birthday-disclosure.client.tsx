"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * The `<details>` of the top-bar birthday icon, made to CLOSE.
 *
 * A native `<details>` stays open until its own `<summary>` is pressed again.
 * In the shell, which persists across client navigations, that left the list
 * open over the ficha the person had just clicked through to. So, and nothing
 * else:
 *   - ROUTE CHANGE: the element is keyed on the pathname, so a navigation
 *     mounts a fresh, closed one;
 *   - WHILE IT IS OPEN (tracked from the element's own `toggle` event), two
 *     DOCUMENT-level listeners:
 *       Escape anywhere closes it and returns focus to the summary. Listening
 *       on the element itself was not enough: Safari does not focus a
 *       `<summary>` on click, so after a mouse open the focus is not inside;
 *       a pointer press outside the element closes it.
 *     Both are removed when it closes or unmounts.
 * Everything else stays native: the summary is the keyboard control, the links
 * are ordinary tab stops.
 */
export function BirthdayDisclosure(props: { className?: string; children: ReactNode }) {
  const pathname = usePathname();
  // The KEY is on the stateful part, so a navigation resets the element, its
  // open state and its listeners together.
  return <OpenAwareDetails key={pathname ?? ""} {...props} />;
}

function OpenAwareDetails({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !ref.current) return;
    return attachDismissListeners(document, ref.current);
  }, [open]);

  return (
    <details
      ref={ref}
      className={className}
      data-testid="birthday-indicator"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      {children}
    </details>
  );
}

type Details = Pick<HTMLDetailsElement, "open" | "querySelector" | "contains">;
type KeyLike = { key: string; preventDefault(): void };
type DocLike = {
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
};

/**
 * Escape on an open disclosure: close it, return focus to its summary, and
 * report that it was handled. Anything else is left alone.
 */
export function closeOnEscape(e: KeyLike, details: Details | null): boolean {
  if (e.key !== "Escape" || !details || !details.open) return false;
  details.open = false;
  e.preventDefault();
  details.querySelector<HTMLElement>("summary")?.focus();
  return true;
}

/** A pointer press OUTSIDE an open disclosure closes it; inside, nothing. */
export function closeOnOutsidePointer(target: unknown, details: Details | null): boolean {
  if (!details || !details.open) return false;
  if (target && details.contains(target as Node)) return false;
  details.open = false;
  return true;
}

/**
 * Registers the two document-level listeners for an OPEN disclosure and
 * returns the cleanup that removes exactly those two. The component calls it
 * only while `toggle` says it is open.
 */
export function attachDismissListeners(doc: DocLike, details: Details): () => void {
  const onKey = (e: KeyLike) => {
    closeOnEscape(e, details);
  };
  const onPointer = (e: { target: unknown }) => {
    closeOnOutsidePointer(e.target, details);
  };
  doc.addEventListener("keydown", onKey as unknown as EventListener);
  doc.addEventListener("pointerdown", onPointer as unknown as EventListener);
  return () => {
    doc.removeEventListener("keydown", onKey as unknown as EventListener);
    doc.removeEventListener("pointerdown", onPointer as unknown as EventListener);
  };
}

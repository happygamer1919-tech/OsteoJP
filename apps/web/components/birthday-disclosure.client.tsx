"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * The `<details>` of the top-bar birthday icon, made to CLOSE.
 *
 * A native `<details>` stays open until its own `<summary>` is pressed again.
 * In the shell, which persists across client navigations, that meant the list
 * stayed open over the ficha the person had just clicked through to. Two fixes,
 * and nothing else:
 *   - ROUTE CHANGE: the element is keyed on the pathname, so a navigation
 *     mounts a fresh, closed one;
 *   - ESCAPE: closes it and puts focus back on the `<summary>`, so a keyboard
 *     user is not left on a link that has just disappeared.
 * Everything else stays native: the summary is the keyboard control, the links
 * are ordinary tab stops.
 */
export function BirthdayDisclosure({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      key={pathname ?? ""}
      ref={ref}
      className={className}
      data-testid="birthday-indicator"
      onKeyDown={(e) => closeOnEscape(e, ref.current)}
    >
      {children}
    </details>
  );
}

/**
 * Escape on an open disclosure: close it, return focus to its summary, and
 * report that it was handled. Anything else is left alone. Exported for its
 * test; the component above is its only caller.
 */
export function closeOnEscape(
  e: Pick<KeyboardEvent, "key" | "preventDefault" | "stopPropagation">,
  details: Pick<HTMLDetailsElement, "open" | "querySelector"> | null,
): boolean {
  if (e.key !== "Escape" || !details || !details.open) return false;
  details.open = false;
  e.preventDefault();
  e.stopPropagation();
  details.querySelector<HTMLElement>("summary")?.focus();
  return true;
}

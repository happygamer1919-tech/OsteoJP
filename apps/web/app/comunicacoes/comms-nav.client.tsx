"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type CommsNavItem = { href: string; label: string };

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

/**
 * COMMS-01 (owner dispatch 2026-09-14): the tab bar shared by the sections of
 * the Comunicações group. Same treatment as the admin sub-navigation
 * (admin-nav.client.tsx): real <Link>s with the active state from the pathname,
 * because each section is its own route and keeps its own URL.
 *
 * The items arrive already filtered to what the viewer may open
 * (`commsSectionsForRole`), so this component offers no tab its route refuses.
 * It decides nothing about access.
 *
 * THE TABS WRAP, THEY DO NOT SCROLL. Until T5 this bar scrolled sideways like the
 * admin one (overflow-x-auto). With three sections (T5 F4 added Respostas SMS)
 * it no longer fits a 390px phone, and the third tab showed as "Resp" with
 * nothing on screen saying the bar scrolls. Wrapping puts every tab the role may
 * open on screen at every width, on a second row when the first is full, the
 * way the page toolbars wrap. Each label stays on one line (whitespace-nowrap).
 * e2e/guide-findings.spec.ts asserts it at 390 and 360.
 */
export function CommsNav({ items, label }: { items: CommsNavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-wrap gap-x-1 border-b border-v2-border">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex h-10 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium",
              "transition-colors duration-fast ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset",
              active
                ? "border-v2-green-700 text-v2-text-primary"
                : "border-transparent text-v2-text-secondary hover:text-v2-text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

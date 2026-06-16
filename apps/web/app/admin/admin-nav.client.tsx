"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminNavItem = { href: string; label: string };

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

/**
 * Admin sub-navigation rendered as a token-styled tab bar (SPEC-staff-screens
 * §11.4: Tabs are the only navigation across admin areas). Route-based, so it
 * stays real <Link>s with an active state from the pathname rather than the
 * controlled in-page Tabs component. Presentation only — same routes.
 */
export function AdminNav({
  items,
  label,
}: {
  items: AdminNavItem[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-v2-border"
    >
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
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
                ? "border-v2-green-600 text-v2-text-primary"
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

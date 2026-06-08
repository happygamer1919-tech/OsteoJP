"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav/nav-items";

// Client component so the active section can be highlighted from the current
// pathname. Items are computed (and role-gated) by the server AppShell and
// passed in already filtered — this component never decides visibility.
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3 py-2" aria-label="Primary">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-md border-l-2 px-3 py-2 text-body-sm transition-colors",
              active
                ? "border-brand-teal bg-brand-teal/10 font-semibold text-brand-magenta"
                : "border-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

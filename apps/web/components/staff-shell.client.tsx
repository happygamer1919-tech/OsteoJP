"use client";

import {
  Calendar,
  ClipboardCheck,
  FileText,
  Home,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { StaffAppShell, type AppShellNavItem } from "@osteojp/ui";

import type { NavItem } from "@/lib/nav/nav-items";

/**
 * Client wrapper that adapts the server AppShell to the shared @osteojp/ui
 * StaffAppShell: it injects next/link for client-side routing, computes the
 * active item from the current pathname, and maps each route to its canonical
 * icon (SPEC §3). Icons are LucideIcon components and so cannot cross the
 * server→client prop boundary — the mapping must live here, in client code.
 */
const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/dashboard": Home,
  "/agenda": Calendar,
  "/patients": Users,
  "/clinical": FileText,
  "/clinical/review": ClipboardCheck,
  "/admin": Settings,
};

export function StaffShellClient({
  items,
  userMenu,
  children,
}: {
  items: NavItem[];
  userMenu: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const nav: AppShellNavItem[] = items.map((item) => ({
    href: item.href,
    label: item.label,
    icon: ICON_BY_HREF[item.href] ?? FileText,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));

  return (
    <StaffAppShell
      brandHomeHref="/dashboard"
      nav={nav}
      userMenu={userMenu}
      linkComponent={Link}
    >
      {children}
    </StaffAppShell>
  );
}

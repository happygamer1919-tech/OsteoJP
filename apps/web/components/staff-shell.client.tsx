"use client";

import {
  Calendar,
  CalendarClock,
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

import { HeritageFrame, SidebarAppShell, type AppShellNavItem } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { NavItem } from "@/lib/nav/nav-items";

/**
 * Client wrapper adapting the server AppShell to the shared @osteojp/ui
 * SidebarAppShell (V2-W0-05, SPEC-v2-foundation §7): it injects next/link for
 * client-side routing, computes the active item from the current pathname, maps
 * each route to its canonical icon, and places the HeritageFrame behind the
 * content area. Icons are LucideIcon components and cannot cross the
 * server→client prop boundary — the mapping lives here, in client code.
 */
const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/dashboard": Home,
  "/agenda": Calendar,
  "/patients": Users,
  "/clinical": FileText,
  "/marcacoes": CalendarClock,
  "/clinical/review": ClipboardCheck,
  "/admin": Settings,
};

// Heritage is OsteoJP-tenant-only and opt-in (SPEC §2.2 / §6). No tenant heritage
// flag is wired yet, so the neutral product default (disabled) ships and the
// frame renders nothing; flip this when the tenant setting lands (a functional
// ticket). The frame is integrated here so enabling it is a one-line change.
const HERITAGE_ENABLED = false;

export function StaffShellClient({
  items,
  userArea,
  children,
}: {
  items: NavItem[];
  userArea: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // Active = the longest matching href, so /clinical/review does not also light
  // up /clinical, and /clinical/<id> (the editor) still highlights /clinical.
  const matchLen = (href: string): number =>
    pathname === href || pathname.startsWith(`${href}/`) ? href.length : -1;
  const best = Math.max(-1, ...items.map((i) => matchLen(i.href)));

  const nav: AppShellNavItem[] = items.map((item) => ({
    href: item.href,
    label: item.label,
    icon: ICON_BY_HREF[item.href] ?? FileText,
    active: best >= 0 && matchLen(item.href) === best,
  }));

  return (
    <SidebarAppShell
      brandHomeHref="/dashboard"
      nav={nav}
      brandSize="xl"
      userArea={userArea}
      heritageFrame={
        <HeritageFrame
          enabled={HERITAGE_ENABLED}
          density="restrained"
          pathname={pathname}
        />
      }
      linkComponent={Link}
      navLabel={s["nav.ariaLabel"]}
      openMenuLabel={s["nav.openMenu"]}
      closeMenuLabel={s["nav.closeMenu"]}
      menuTitle={s["nav.menu"]}
      brandLinkLabel={s["nav.goToDashboard"]}
    >
      {children}
    </SidebarAppShell>
  );
}

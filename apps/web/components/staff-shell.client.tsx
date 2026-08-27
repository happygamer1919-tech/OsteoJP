"use client";

import {
  Calendar,
  CalendarClock,
  CalendarCog,
  ChartColumnBig,
  ClipboardCheck,
  FileText,
  Home,
  PhoneCall,
  Receipt,
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
 * each route to its canonical icon AND its canonical colour, and places the
 * HeritageFrame behind the content area. Icons are LucideIcon components and
 * cannot cross the server→client prop boundary — the mapping lives here, in
 * client code.
 */
/**
 * ==========================================================================
 * ONE ICON AND ONE COLOUR PER DESTINATION.
 * ==========================================================================
 * WHAT THIS REPLACES. The map held seven entries against a nav of ten, and the
 * fallback was `FileText`. So **Recuperação, Faturação, Estatísticas and
 * Horários all rendered the same generic document glyph** — four unrelated
 * destinations wearing one symbol — and every icon in the sidebar was the same
 * grey, because the icon inherits the row's text colour.
 *
 * A sidebar in that state is a list of words with a decorative margin: the
 * glyph tells you nothing you did not already read, and the four identical ones
 * actively mislead. This map is the whole fix, and it is a map rather than a
 * fallback because **a missing entry must be visible, not plausible** — see the
 * guard test, which fails when a nav href has no entry here.
 *
 * ==========================================================================
 * THE COLOURS ARE EXISTING TOKENS, MEASURED, NOT NEW HEXES.
 * ==========================================================================
 * Every value is a `-700` step already in `packages/ui/theme.css` with its
 * AA-on-white ratio recorded beside it. Nothing is invented here and no
 * dependency is added: `lucide-react` is already in both `apps/web` and
 * `packages/ui`.
 *
 * `v2-gold-700` is deliberately NOT used, though "gold = revenue" would have
 * fitted Faturação: theme.css records that it fails AA on several light
 * surfaces and carries an open card. `v2-mustard-700` is the money-adjacent hue
 * that measures clean.
 *
 * THE COLOUR LANDS ON THE ICON ONLY. The label keeps `v2-text-secondary`, and
 * the active row keeps its green tint and `v2-green-800` label — the
 * measured treatment `contrast-aa.test.ts` protects. Colour is never the only
 * cue: every item carries its label, the active one carries `aria-current`, and
 * the icons are `aria-hidden`.
 *
 * `packages/ui/src/contrast-aa.test.ts` reads this map and requires every hue
 * to clear the 3:1 graphical floor against BOTH the nav panel and the active
 * tint, composited — not against white, which would over-report both.
 */
const NAV_ICON: Record<string, { icon: LucideIcon; className: string }> = {
  // Home base. Deep blue, the most "structural" hue in the set.
  "/dashboard": { icon: Home, className: "text-v2-navy-700" },
  // Portuguese Blue is the spec's calendar/graph hue (§3.2).
  "/agenda": { icon: Calendar, className: "text-v2-blue-700" },
  "/patients": { icon: Users, className: "text-v2-cyan-700" },
  // A booking is an appointment with a clock on it; violet keeps it clearly
  // distinct from the two blues either side of it in the list.
  "/marcacoes": { icon: CalendarClock, className: "text-v2-violet-700" },
  // Recuperação is a CALL LIST. The glyph is the action, not the noun - a
  // document icon on this page said nothing about what reception does with it.
  "/recuperacao": { icon: PhoneCall, className: "text-v2-orange-700" },
  "/invoicing": { icon: Receipt, className: "text-v2-mustard-700" },
  // Soft Lavender is the spec's clinical-records hue (§3.2), so the review
  // queue and the ficha list share the family and differ in the glyph.
  "/clinical/review": { icon: ClipboardCheck, className: "text-v2-lavender-700" },
  // Unlinked from the primary nav (ruling F) but still deep-link reachable, so
  // it keeps an entry: a route that renders is a route that needs an icon.
  "/clinical": { icon: FileText, className: "text-v2-burgundy-700" },
  "/estatisticas": { icon: ChartColumnBig, className: "text-v2-magenta-700" },
  "/horarios": { icon: CalendarCog, className: "text-v2-olive-700" },
  // Neutral on purpose. Administração is the one destination that is not a
  // subject area, and a hue would claim it was.
  "/admin": { icon: Settings, className: "text-v2-gray-700" },
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

  const nav: AppShellNavItem[] = items.map((item) => {
    /**
     * THE FALLBACK IS STILL HERE AND IT IS STILL `FileText`, because a sidebar
     * that threw on an unmapped route would take down every authenticated page
     * over a 20px graphic. What changed is that it is no longer where four real
     * destinations landed: `staff-shell.client.test.tsx` fails if any href in
     * `nav-items.ts` is missing from the map, so the fallback is now unreachable
     * in practice and a genuine last resort rather than a design.
     */
    const mapped = NAV_ICON[item.href];
    return {
      href: item.href,
      label: item.label,
      icon: mapped?.icon ?? FileText,
      iconClassName: mapped?.className,
      active: best >= 0 && matchLen(item.href) === best,
    };
  });

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

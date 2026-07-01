"use client";

import { Menu, X } from "lucide-react";
import {
  type ElementType,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { BrandLockup } from "../brand/BrandLockup";
import { type AppShellNavItem } from "./AppShell";

/**
 * SidebarAppShell — SPEC-v2-foundation §7 (product default; v2).
 *
 * The 280px floating glass left panel that replaces the staff top bar: brand
 * lockup at the top, the seven nav items below. The panel stays put; the content
 * area scrolls independently. The user-area cluster sits at the top-right of the
 * content area (passed via `userArea`), never in the panel. The HeritageFrame
 * (passed via `heritageFrame`) wraps the content area only — the content region
 * owns the stacking context so the frame stays behind interactive layers.
 *
 * Presentational and framework-agnostic, like the v1 shells: nav is data, role
 * filtering and active-state are the caller's job, and `linkComponent` injects
 * client-side routing (defaults to <a>). On narrow viewports the panel collapses
 * behind a menu button into an off-canvas drawer.
 *
 * Active item: Wellness Green on the `v2-glass-active-bg` tint (label/icon use
 * green-800 — green-700 fails AA on that tint at this size). Inactive items are
 * `v2-text-secondary` with a neutral hover.
 */

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

const navItemClass = (active: boolean | undefined): string =>
  cx(
    "inline-flex w-full items-center gap-3 rounded-v2 px-3 py-2 text-sm font-medium",
    "transition-colors duration-fast ease-standard",
    // Pin the ring offset to the white surface so the focus indicator always
    // sits against a light color: the focus-ring (accent-2-600, ~3.3:1 on white)
    // would drop to ~2.9:1 directly on the active green tint, below the SC
    // 1.4.11 3:1 floor; the white offset keeps it clearing 3:1 on every item.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-v2-surface",
    active
      ? "bg-v2-glass-active-bg text-v2-green-800"
      : "text-v2-text-secondary hover:bg-surface-muted hover:text-v2-text-primary",
  );

function NavList({
  nav,
  Link,
  navLabel,
  onNavigate,
}: {
  nav: AppShellNavItem[];
  Link: ElementType;
  navLabel: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={navLabel} className="flex flex-col gap-1">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          onClick={onNavigate}
          className={navItemClass(item.active)}
          prefetch={false}
        >
          <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export interface SidebarAppShellProps {
  brandHomeHref: string;
  nav: AppShellNavItem[];
  /** Top-right user-area cluster (UserAreaCluster + e.g. a sign-out control). */
  userArea?: ReactNode;
  /** HeritageFrame element; placed behind the content area (OsteoJP theme only). */
  heritageFrame?: ReactNode;
  children: ReactNode;
  /** Link element (e.g. next/link); defaults to "a". */
  linkComponent?: ElementType;
  navLabel?: string;
  openMenuLabel?: string;
  closeMenuLabel?: string;
  menuTitle?: string;
  /** Accessible name for the brand-logo home link (icon-only; must describe destination). */
  brandLinkLabel?: string;
}

export function SidebarAppShell({
  brandHomeHref,
  nav,
  userArea,
  heritageFrame,
  children,
  linkComponent: Link = "a",
  navLabel = "Navegação principal",
  openMenuLabel = "Abrir menu",
  closeMenuLabel = "Fechar menu",
  menuTitle = "Menu",
  brandLinkLabel = "Ir para o painel",
}: SidebarAppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-v2-bg lg:pl-76">
      {/* Desktop: fixed 280px floating glass panel (304px rail with 12px float
          margins → 280px glass). Hidden under lg. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-76 p-3 lg:block">
        <div className="glass-nav flex h-full flex-col gap-6 rounded-v2 p-4 shadow-v2-float">
          <Link
            href={brandHomeHref}
            aria-label={brandLinkLabel}
            className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <BrandLockup variant="lockup" size="lg" />
          </Link>
          <NavList nav={nav} Link={Link} navLabel={navLabel} />
        </div>
      </aside>

      {/* Mobile top bar: menu button + brand + user area. */}
      <header className="glass-nav sticky top-0 z-20 flex h-16 items-center justify-between gap-4 px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={openMenuLabel}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-v2 text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <Link
            href={brandHomeHref}
            aria-label={brandLinkLabel}
            className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <BrandLockup variant="lockup" size="sm" />
          </Link>
        </div>
        {userArea}
      </header>

      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        nav={nav}
        Link={Link}
        brandHomeHref={brandHomeHref}
        brandLinkLabel={brandLinkLabel}
        title={menuTitle}
        navLabel={navLabel}
        closeLabel={closeMenuLabel}
      />

      {/* Content column. The user-area cluster sits top-right on desktop. */}
      <div className="flex min-h-dvh flex-col">
        {userArea != null && (
          <div className="hidden items-center justify-end px-8 pt-6 lg:flex">
            {userArea}
          </div>
        )}
        {/* Content area owns the stacking context (§6.4 / §7.4): the heritage
            frame sits behind, content above at z-10. Content wrapper is a div,
            not <main> — the wrapped pages own their <main> landmark. */}
        <div className="relative isolate flex-1">
          {heritageFrame}
          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileNav({
  open,
  onClose,
  nav,
  Link,
  brandHomeHref,
  brandLinkLabel,
  title,
  navLabel,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  nav: AppShellNavItem[];
  Link: ElementType;
  brandHomeHref: string;
  brandLinkLabel: string;
  title: string;
  navLabel: string;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => {
      if (d.open) d.close();
    }, 200);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-72 rounded-r-v2 bg-v2-surface p-0 shadow-lg",
        "backdrop:bg-v2-text-primary/40",
        "transition-transform duration-base ease-standard",
        shown ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <h2 id={titleId} className="sr-only">{title}</h2>
      <div className="flex h-full flex-col gap-6 p-4">
        <div className="flex items-center justify-between">
          <Link href={brandHomeHref} aria-label={brandLinkLabel} onClick={onClose} className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
            <BrandLockup variant="lockup" size="sm" />
          </Link>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-v2 text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <NavList nav={nav} Link={Link} navLabel={navLabel} onNavigate={onClose} />
      </div>
    </dialog>
  );
}

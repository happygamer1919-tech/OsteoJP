"use client";

import { Menu, X, type LucideIcon } from "lucide-react";
import {
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { BrandLockup } from "../brand/BrandLockup";

/**
 * AppShell (staff) + PortalShell — SPEC-foundation §4.11.
 *
 * Presentational, framework-agnostic shells. Nav is data; role filtering and
 * active-state computation live in the caller (the shell never hardcodes role
 * logic). Pass `linkComponent` (e.g. next/link) to get client-side routing;
 * it defaults to a plain <a>.
 */

export interface AppShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

const navPill = (active: boolean | undefined): string =>
  cx(
    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
    "transition-colors duration-fast ease-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
    active
      ? "bg-surface-muted text-text-primary"
      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
  );

export interface StaffAppShellProps {
  brandHomeHref: string;
  nav: AppShellNavItem[];
  /** Right-side user menu (avatar + menu) slot. */
  userMenu?: ReactNode;
  /** Right-side location switcher slot. */
  locationSwitcher?: ReactNode;
  /** Persistent help control slot (stays visible on mobile). */
  help?: ReactNode;
  children: ReactNode;
  /** Link element (e.g. next/link); defaults to "a". */
  linkComponent?: ElementType;
  /** i18n labels. */
  navLabel?: string;
  openMenuLabel?: string;
  closeMenuLabel?: string;
  menuTitle?: string;
}

export function StaffAppShell({
  brandHomeHref,
  nav,
  userMenu,
  locationSwitcher,
  help,
  children,
  linkComponent: Link = "a",
  navLabel = "Navegação principal",
  openMenuLabel = "Abrir menu",
  closeMenuLabel = "Fechar menu",
  menuTitle = "Menu",
}: StaffAppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={openMenuLabel}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2 md:hidden"
          >
            <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <Link href={brandHomeHref} className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2">
            <BrandLockup variant="lockup" size="sm" />
          </Link>
        </div>

        <nav aria-label={navLabel} className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={navPill(item.active)}
            >
              <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {locationSwitcher}
          {help}
          {userMenu}
        </div>
      </header>

      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        nav={nav}
        Link={Link}
        title={menuTitle}
        navLabel={navLabel}
        closeLabel={closeMenuLabel}
      />

      {/* Content wrapper is a div, not <main>: the wrapped pages own their
          <main> landmark, so the shell must not introduce a nested one. */}
      <div className="mx-auto w-full max-w-7xl px-6 py-8">{children}</div>
    </div>
  );
}

function MobileNav({
  open,
  onClose,
  nav,
  Link,
  title,
  navLabel,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  nav: AppShellNavItem[];
  Link: ElementType;
  title: string;
  navLabel: string;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(false);

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
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-72 rounded-r-xl bg-surface p-0 shadow-lg",
        "backdrop:bg-text-primary/40",
        "transition-transform duration-base ease-standard",
        shown ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <BrandLockup variant="lockup" size="sm" />
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={navLabel} className="flex flex-col gap-1 p-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              onClick={onClose}
              className={navPill(item.active)}
            >
              <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </dialog>
  );
}

export interface PortalShellProps {
  title: ReactNode;
  /** Up to 5 bottom-tab items. */
  tabs: AppShellNavItem[];
  children: ReactNode;
  linkComponent?: ElementType;
  navLabel?: string;
}

/**
 * Portal layout (mobile-first): a 56px top bar (mark + title), content, and a
 * 64px bottom tab bar (≤5 tabs, 24px icon over a caption, 44px targets). On
 * desktop the content centers at 640px and the tabs move to a top row.
 */
export function PortalShell({
  title,
  tabs,
  children,
  linkComponent: Link = "a",
  navLabel = "Navegação",
}: PortalShellProps) {
  const tab = (item: AppShellNavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cx(
        "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
        "transition-colors duration-fast ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
        // SPEC §4.11 says active accent-2-600 / inactive text-muted, but both
        // fail WCAG AA as 12px label text (3.3:1 / 2.9:1) and the inactive icon
        // fails the 3:1 graphical bar. Use AA-safe accent-2-700 / text-secondary
        // (QUESTIONS.md Q13).
        item.active ? "text-accent-2-700" : "text-text-secondary hover:text-text-primary",
      )}
    >
      <item.icon size={24} strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </Link>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <BrandLockup variant="mark" size="sm" />
        <h1 className="truncate text-lg text-text-primary">{title}</h1>
        {/* Desktop: tabs as a top row. */}
        <nav aria-label={navLabel} className="ml-auto hidden items-center gap-1 md:flex">
          {tabs.map(tab)}
        </nav>
      </header>

      {/* div, not <main>: wrapped pages own their <main> landmark. */}
      <div className="mx-auto w-full max-w-160 flex-1 px-4 py-6 pb-24 md:pb-6">
        {children}
      </div>

      {/* Mobile: bottom tab bar. */}
      <nav
        aria-label={navLabel}
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch gap-1 border-t border-border bg-surface px-2 md:hidden"
      >
        {tabs.map(tab)}
      </nav>
    </div>
  );
}

import { type ElementType } from "react";
import { Bell } from "lucide-react";

/**
 * NotificationBell — W13-02 (Wave 13 LOOP 2), PG4.
 *
 * THE CONTROL THIS REPLACES WAS A DEFECT, and it is worth recording what the
 * defect actually was because the report and the cause were not obviously the
 * same thing. The owner reported that the notification bell "navigates to the
 * same destination as O meu perfil". It did, and here is the mechanism: the bell
 * lived inside `UserAreaCluster` as a `<span aria-hidden="true">` with no href
 * and no handler (decorative by design, "until a notifications surface exists"),
 * and `apps/web/components/app-shell.tsx` wrapped the whole cluster in
 * `<Link href="/perfil">`. So a click on the bell hit the enclosing profile
 * link. Nothing was mis-wired; a decorative element was placed inside a link.
 *
 * The surface now exists, so the decorative bell is retired rather than patched,
 * and this is a real control: its own destination, its own accessible name, and
 * rendered as a SIBLING of the profile link rather than a child of it.
 *
 * ACCESSIBILITY, and each of these is a requirement rather than a nicety:
 *   - NOT aria-hidden. The moment it became interactive it had to be reachable;
 *     an aria-hidden link is focusable by keyboard but invisible to a screen
 *     reader, which is worse than either state alone.
 *   - An accessible NAME that includes the unread count, so a screen-reader user
 *     hears "Notificacoes, 3 por ler" rather than "link" — the badge is visual
 *     information and must have a text equivalent.
 *   - A 44px target (`size-11`), meeting WCAG 2.2 AA Target Size (Minimum). The
 *     retired decorative span was 40px, which was fine for something nobody
 *     could click and is not fine for something everybody must.
 *   - The badge itself is aria-hidden, because its content is already in the
 *     accessible name; announcing it twice is noise.
 */
export interface NotificationBellProps {
  /** Where the centre lives. Required — a bell with no destination is the bug. */
  href: string;
  /** Accessible name, e.g. "Notificacoes". pt-PT copy comes from the caller. */
  label: string;
  /** Unread entries. Derived from data server-side, never a client counter. */
  unreadCount?: number;
  /**
   * How the count is spoken, given the count. The caller owns pluralisation
   * because this package holds no strings — pt-PT lives in packages/i18n.
   */
  unreadLabel?: (n: number) => string;
  /**
   * Link element (e.g. next/link); defaults to "a". This package stays
   * framework-agnostic — `StaffAppShell` and `SidebarAppShell` take the same
   * prop for the same reason, and importing next/link here would break the
   * superadmin app's typecheck, which compiles this package without resolving
   * Next's module types.
   */
  linkComponent?: ElementType;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

/** Two digits plus a plus sign; a four-digit badge would break the layout and
 * nobody triages 1000 notifications from a number. */
const CAP = 99;

export function NotificationBell({
  href,
  label,
  unreadCount = 0,
  unreadLabel,
  linkComponent: Link = "a",
  className,
}: NotificationBellProps) {
  const unread = Math.max(0, Math.trunc(unreadCount));
  const shown = unread > CAP ? `${CAP}+` : String(unread);
  const accessibleName =
    unread > 0 && unreadLabel ? `${label}, ${unreadLabel(unread)}` : label;

  return (
    <Link
      href={href}
      aria-label={accessibleName}
      title={label}
      className={cx(
        "relative inline-flex size-11 items-center justify-center rounded-full",
        "text-v2-text-secondary transition-colors hover:bg-surface-muted hover:text-v2-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <Bell size={20} strokeWidth={1.75} />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-v2-green-700 px-1 text-[10px] font-medium leading-4 text-text-inverse"
        >
          {shown}
        </span>
      )}
    </Link>
  );
}

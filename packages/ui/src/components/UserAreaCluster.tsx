import { type ReactNode } from "react";

/**
 * UserAreaCluster — SPEC-v2-foundation §7.3.
 *
 * The signed-in-staff cluster shown at the top-right of the content area (NOT in
 * the sidebar panel): an avatar circle with initials, the name, and the role
 * label (e.g. "Ana Morais / Administradora"). Presentational only — it renders
 * what it is given from existing session data; no new data. The avatar is
 * decorative (its initials duplicate the visible name).
 *
 * THE BELL USED TO LIVE HERE AND NO LONGER DOES (W13-02, PG4). It was a
 * `<span aria-hidden="true">` with no href and no handler, deliberately
 * decorative "until a notifications surface exists" so the foundation never
 * shipped a control that looked interactive but did nothing. That was the right
 * call at the time and it still produced a real defect, because the only
 * consumer — `apps/web/components/app-shell.tsx` — wrapped this whole cluster in
 * `<Link href="/perfil">`, so clicking the decorative bell hit the enclosing
 * profile link. The owner reported it as "the bell goes to the same place as O
 * meu perfil", and it did.
 *
 * The surface now exists, so the bell is a real control in its own component,
 * `NotificationBell`, rendered as a SIBLING of the profile link rather than a
 * child of it. Placing it here again would recreate the defect: anything inside
 * this cluster inherits whatever link the caller wraps around it.
 *
 * @example
 * <UserAreaCluster name="Ana Morais" roleLabel="Administradora" initials="AM" />
 */
export interface UserAreaClusterProps {
  name: ReactNode;
  roleLabel: ReactNode;
  /** 1-2 letter initials for the avatar. */
  initials: string;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function UserAreaCluster({
  name,
  roleLabel,
  initials,
  className,
}: UserAreaClusterProps) {
  return (
    <div className={cx("inline-flex items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-v2-green-100 text-sm font-medium text-v2-green-800"
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-v2-text-primary">{name}</span>
        <span className="truncate text-xs text-v2-text-secondary">{roleLabel}</span>
      </span>
    </div>
  );
}

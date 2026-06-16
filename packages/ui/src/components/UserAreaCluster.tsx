import { type ReactNode } from "react";
import { Bell } from "lucide-react";

/**
 * UserAreaCluster — SPEC-v2-foundation §7.3.
 *
 * The signed-in-staff cluster shown at the top-right of the content area (NOT in
 * the sidebar panel): a notification bell, an avatar circle with initials, the
 * name, and the role label (e.g. "Ana Morais / Administradora"). Presentational
 * only — it renders what it is given from existing session data; no new data.
 *
 * The bell is decorative (`aria-hidden`) until a notifications surface exists, so
 * the foundation never ships a control that looks interactive but does nothing.
 * The avatar is decorative too (its initials duplicate the visible name).
 *
 * @example
 * <UserAreaCluster name="Ana Morais" roleLabel="Administradora" initials="AM" />
 */
export interface UserAreaClusterProps {
  name: ReactNode;
  roleLabel: ReactNode;
  /** 1-2 letter initials for the avatar. */
  initials: string;
  /** Show the (decorative) notification bell. Default true. */
  showBell?: boolean;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function UserAreaCluster({
  name,
  roleLabel,
  initials,
  showBell = true,
  className,
}: UserAreaClusterProps) {
  return (
    <div className={cx("inline-flex items-center gap-3", className)}>
      {showBell && (
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-full text-v2-text-secondary"
        >
          <Bell size={20} strokeWidth={1.75} />
        </span>
      )}
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

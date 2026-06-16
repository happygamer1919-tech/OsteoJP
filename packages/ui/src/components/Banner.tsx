import { AlertTriangle, Check, CircleAlert, Info, X, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

/**
 * Banner — SPEC-foundation §4.9.
 *
 * A standing notice: full-width slim bar (py space-3 px space-4), semantic tint
 * background, a 20px semantic icon, body-sm text-primary message, an optional
 * inline action, and an X when `dismissible`.
 *
 * Hard rule (from the app.doc audit) — enforced by SCREENS, not this component:
 * at most ONE banner is visible per screen. A second pending notice collapses
 * into the first as a count (pass `count`); never stack two banners.
 *
 * @example
 * <Banner tone="warning" count={pendingCount}
 *   action={<a href="/clinical/review" className="text-sm font-semibold text-accent-2-700">Rever</a>}>
 *   {t("review.pending")}
 * </Banner>
 */
export type BannerTone = "success" | "warning" | "error" | "info";

export interface BannerProps {
  tone?: BannerTone;
  children: ReactNode;
  /** Optional inline action (e.g. a link). */
  action?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Collapsed-count for the single-instance rule; shown when > 1. */
  count?: number;
  /** Accessible name for the X button. */
  closeLabel?: string;
  className?: string;
}

const TONE: Record<BannerTone, { bg: string; icon: string; Icon: LucideIcon }> = {
  success: { bg: "bg-success-bg", icon: "text-success", Icon: Check },
  warning: { bg: "bg-warning-bg", icon: "text-warning", Icon: AlertTriangle },
  error: { bg: "bg-error-bg", icon: "text-error", Icon: CircleAlert },
  info: { bg: "bg-info-bg", icon: "text-info", Icon: Info },
};

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function Banner({
  tone = "info",
  children,
  action,
  dismissible = false,
  onDismiss,
  count,
  closeLabel = "Fechar",
  className,
}: BannerProps) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex w-full items-center gap-3 px-4 py-3", t.bg, className)}
    >
      <t.Icon size={20} strokeWidth={1.75} aria-hidden="true" className={cx("shrink-0", t.icon)} />
      <p className="min-w-0 flex-1 text-sm text-text-primary">
        {children}
        {count != null && count > 1 && (
          <span className="ml-1 font-medium text-text-secondary">{`(+${count - 1})`}</span>
        )}
      </p>
      {action != null && <div className="shrink-0">{action}</div>}
      {dismissible && (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onDismiss}
          className="shrink-0 rounded text-text-secondary transition-colors duration-fast ease-standard hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * GlassPanel — SPEC-v2-foundation §9, SPEC-v2-dashboard §4.
 *
 * Larger glass container for grouped content (upcoming-appointments panel,
 * weekly-summary panel, notes card): a header (title + optional action), a body,
 * and an optional footer link with a trailing chevron (e.g. "Ver agenda
 * completa"). The footer link is a single tab stop with the global focus ring.
 *
 * Heavier surfaces than GlassCard's generic container; same glass tokens
 * (`glass-card` utility → 72% white, blur 24px, `v2-radius`, float shadow).
 *
 * @example
 * <GlassPanel title={t("dashboard.upcoming")}
 *   footerHref="/agenda" footerLabel={t("dashboard.seeAgenda")}>
 *   {rows}
 * </GlassPanel>
 */
export interface GlassPanelProps {
  title?: ReactNode;
  /** Right-aligned header action. */
  headerAction?: ReactNode;
  children?: ReactNode;
  /** Footer link target; renders the chevron footer when set with footerLabel. */
  footerHref?: string;
  footerLabel?: ReactNode;
  /** Arbitrary footer node (used instead of the link when provided). */
  footer?: ReactNode;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function GlassPanel({
  title,
  headerAction,
  children,
  footerHref,
  footerLabel,
  footer,
  className,
}: GlassPanelProps) {
  const hasLinkFooter = footerHref != null && footerLabel != null;

  return (
    <section className={cx("glass-card flex flex-col p-6", className)}>
      {(title != null || headerAction != null) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title != null && (
            <h3 className="text-xl text-v2-text-primary">{title}</h3>
          )}
          {headerAction != null && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}

      <div className="flex-1">{children}</div>

      {footer != null && (
        <div className="mt-4 border-t border-v2-border pt-4">{footer}</div>
      )}
      {footer == null && hasLinkFooter && (
        <div className="mt-4 border-t border-v2-border pt-4">
          <a
            href={footerHref}
            className={cx(
              "inline-flex items-center gap-1 rounded text-sm font-medium text-v2-blue-700",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
            )}
          >
            {footerLabel}
            <ChevronRight aria-hidden="true" size={16} />
          </a>
        </div>
      )}
    </section>
  );
}

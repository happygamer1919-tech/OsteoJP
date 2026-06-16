import { type MouseEventHandler, type ReactNode } from "react";

/**
 * GlassCard — SPEC-v2-foundation §9.
 *
 * Generic floating glass container: the `glass-card` surface (72% white,
 * blur 24px, hairline border, `v2-radius` 24px, single `v2-shadow-float`), with
 * optional header (title + right-aligned action), body, and footer slots.
 *
 * The interactive variant turns the whole card into a single tab stop — a link
 * (`href`) or a button (`interactive`) — and adds the §8 hover lift
 * (`translateY(-4px)`, suppressed under reduced motion). One tab stop means: do
 * not nest other interactive elements inside an interactive card.
 *
 * @example
 * <GlassCard title={t("dashboard.notes")}>{…}</GlassCard>
 * <GlassCard href={`/patients/${id}`}>{…}</GlassCard>   // whole-card link
 */
export interface GlassCardProps {
  title?: ReactNode;
  /** Right-aligned action in the header (only with a non-interactive card). */
  headerAction?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Renders the whole card as a link (one tab stop). */
  href?: string;
  /** With no href, renders the whole card as a button (one tab stop). */
  interactive?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  "aria-label"?: string;
  "aria-busy"?: boolean;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function GlassCard({
  title,
  headerAction,
  footer,
  children,
  className,
  href,
  interactive = false,
  onClick,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
}: GlassCardProps) {
  const isLink = href != null;
  const isButton = !isLink && interactive;

  const interactiveClasses =
    isLink || isButton
      ? "w-full text-left cursor-pointer hover-lift focus-visible:outline-none " +
        "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      : "";

  const classNames = cx(
    "glass-card block p-6 text-v2-text-primary",
    interactiveClasses,
    className,
  );

  const content = (
    <>
      {(title != null || headerAction != null) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title != null && (
            <h3 className="text-xl text-v2-text-primary">{title}</h3>
          )}
          {headerAction != null && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
      {footer != null && (
        <div className="mt-4 border-t border-v2-border pt-4">{footer}</div>
      )}
    </>
  );

  if (isLink) {
    return (
      <a href={href} className={classNames} aria-label={ariaLabel} aria-busy={ariaBusy}>
        {content}
      </a>
    );
  }
  if (isButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classNames}
        aria-label={ariaLabel}
        aria-busy={ariaBusy}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={classNames} aria-label={ariaLabel} aria-busy={ariaBusy}>
      {content}
    </div>
  );
}

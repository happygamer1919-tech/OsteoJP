import { type MouseEventHandler, type ReactNode } from "react";

/**
 * Card — SPEC-foundation §4.4.
 *
 * Calm clinical container: surface bg, 1px border (borders carry separation, no
 * shadow at rest), radius lg, padding space-6. Optional header (h3 title +
 * right-aligned action) and footer slots. The interactive variant makes the
 * whole card a single clickable, focus-ringed link (`href`) or button
 * (`interactive`) — one tab stop, so do not nest other interactive elements
 * inside an interactive card.
 *
 * @example
 * <Card title={t("patient.summary")} headerAction={<Button .../>}>…</Card>
 * <Card href={`/patients/${id}`}>…</Card>   // whole-card link
 */
export interface CardProps {
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

export function Card({
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
}: CardProps) {
  const isLink = href != null;
  const isButton = !isLink && interactive;

  const interactiveClasses =
    isLink || isButton
      ? "w-full text-left cursor-pointer transition-colors duration-fast ease-standard " +
        "hover:bg-bg focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-accent-2-500 focus-visible:ring-offset-2"
      : "";

  const className2 = cx(
    "block rounded-lg border border-border bg-surface p-6",
    interactiveClasses,
    className,
  );

  const content = (
    <>
      {(title != null || headerAction != null) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title != null && (
            <h3 className="text-xl text-text-primary">{title}</h3>
          )}
          {headerAction != null && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
      {footer != null && (
        <div className="mt-4 border-t border-border pt-4">{footer}</div>
      )}
    </>
  );

  if (isLink) {
    return (
      <a href={href} className={className2} aria-label={ariaLabel} aria-busy={ariaBusy}>
        {content}
      </a>
    );
  }
  if (isButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className2}
        aria-label={ariaLabel}
        aria-busy={ariaBusy}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className2} aria-label={ariaLabel} aria-busy={ariaBusy}>
      {content}
    </div>
  );
}

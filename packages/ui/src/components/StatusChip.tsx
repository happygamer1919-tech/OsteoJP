import { type ReactNode } from "react";

/**
 * StatusChip — SPEC-foundation §4.5.
 *
 * Generic semantic pill (radius full, caption text weight 500, py space-1 px
 * space-3) with an optional leading 8px dot. Five tones; screens map domain
 * statuses (e.g. appointment states) to a tone via i18n.
 *
 * Accessibility note (QUESTIONS.md Q11): the spec sets the text to the semantic
 * color, but `success` (#2F8F6B → 3.5:1) and `warning` (#B47A14 → 3.3:1) fail
 * WCAG AA on their light tints (and on white) at 12px. Those two tones therefore
 * carry the status with the tinted bg + the colored dot (a graphical object,
 * 3:1) and use `text-primary` for the label. error/info/neutral pass AA and use
 * the semantic text per spec. Pending owner-ratified AA-dark semantic text tokens.
 *
 * @example
 * <StatusChip tone="success" dot>{t("appointment.confirmed")}</StatusChip>
 */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusChipProps {
  tone?: StatusTone;
  /** Optional leading 8px dot in the tone color. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const TONES: Record<StatusTone, { container: string; dot: string }> = {
  // success/warning text → text-primary for WCAG AA (see docblock / Q11).
  success: { container: "bg-success-bg text-text-primary", dot: "bg-success" },
  warning: { container: "bg-warning-bg text-text-primary", dot: "bg-warning" },
  error: { container: "bg-error-bg text-error", dot: "bg-error" },
  info: { container: "bg-info-bg text-info", dot: "bg-info" },
  neutral: { container: "bg-surface-muted text-text-secondary", dot: "bg-text-muted" },
};

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function StatusChip({
  tone = "neutral",
  dot = false,
  children,
  className,
}: StatusChipProps) {
  const t = TONES[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
        t.container,
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className={cx("size-2 rounded-full", t.dot)} />
      )}
      {children}
    </span>
  );
}

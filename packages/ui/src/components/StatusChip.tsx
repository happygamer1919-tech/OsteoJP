import { type ReactNode } from "react";

/**
 * StatusChip — SPEC-foundation §4.5.
 *
 * Generic semantic pill (radius full, caption text weight 500, py space-1 px
 * space-3) with an optional leading 8px dot. Five tones; screens map domain
 * statuses (e.g. appointment states) to a tone via i18n.
 *
 * Accessibility note (QUESTIONS.md Q11, resolved): `success` (#2F8F6B → 3.5:1)
 * and `warning` (#B47A14 → 3.3:1) fail WCAG AA as 12px label text on their light
 * tints (and on white). They now render the label in the AA-dark semantic text
 * tokens `success-700` (#127B59, ≥4.5:1) / `warning-700` (#956302, ≥4.5:1) while
 * the colored 8px dot keeps the base tone (a 3:1 graphical object). error/info/
 * neutral already pass AA and use the semantic text per spec.
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
  // success/warning label → AA-dark semantic text token; dot keeps base tone (Q11).
  success: { container: "bg-success-bg text-success-700", dot: "bg-success" },
  warning: { container: "bg-warning-bg text-warning-700", dot: "bg-warning" },
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

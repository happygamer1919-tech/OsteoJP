import { type ReactNode } from "react";

/**
 * GlassStatusChip — SPEC-v2-foundation §9 (glass restyle of the v1 StatusChip).
 *
 * Soft tinted pill with a hairline glass edge and an optional leading 8px dot,
 * for record/review status (SPEC-v2-fichas §2.1, SPEC-v2-review §3). Screens map
 * a domain status to a tone via i18n; the chip never merges the two clinical
 * status axes into one label.
 *
 * Named `GlassStatusChip` (not `StatusChip`) on purpose: the v1 `StatusChip` is
 * still imported by live v1 staff and portal screens, so the v2 glass variant is
 * additive and does not restyle them. V2 section waves import this one.
 *
 * AA (SPEC §3.4): the label text uses the AA-dark 700 step (or `v2-text-primary`
 * for neutral); the 8px dot may carry the base tone (3:1 graphical object).
 * success/info map to the v2 Wellness-Green / Portuguese-Blue families; warning
 * and error reuse the restrained brand-tokens semantic tones (SPEC §10 forbids a
 * saturated red flood).
 *
 * @example
 * <GlassStatusChip tone="success" dot>{t("record.signed")}</GlassStatusChip>
 */
export type GlassStatusTone = "success" | "warning" | "error" | "info" | "neutral";

export interface GlassStatusChipProps {
  tone?: GlassStatusTone;
  /** Optional leading 8px dot in the tone color. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

// AA on the TINT background, not on white: a 700 accent that clears AA on white
// can fail on its own 100 tint at 12px. Green is the lightest family, so success
// uses the 800 label (5.8:1 on green-100); its dot uses 700 to clear the 3:1
// graphical floor (the 500 base fails on the tint). Blue-700 already clears AA on
// blue-100 (5.3:1); its dot uses 700 for the same 3:1 reason. The neutral tone
// uses the darker brand `text-secondary` (#56697A, 5.0:1 on surface-muted) since
// v2-text-secondary (#66727F) is only AA on white, not on the muted tint.
const TONES: Record<GlassStatusTone, { container: string; dot: string }> = {
  success: { container: "bg-v2-green-100 text-v2-green-800", dot: "bg-v2-green-700" },
  info: { container: "bg-v2-blue-100 text-v2-blue-700", dot: "bg-v2-blue-700" },
  // warning/error reuse the restrained brand semantic tints + AA-dark labels.
  warning: { container: "bg-warning-bg text-warning-700", dot: "bg-warning" },
  error: { container: "bg-error-bg text-error", dot: "bg-error" },
  neutral: { container: "bg-surface-muted text-text-secondary", dot: "bg-text-secondary" },
};

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function GlassStatusChip({
  tone = "neutral",
  dot = false,
  children,
  className,
}: GlassStatusChipProps) {
  const t = TONES[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-v2-border px-3 py-1 text-xs font-medium",
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

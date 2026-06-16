import { type ReactNode } from "react";

/**
 * StatusBadge — SPEC-v2-foundation §9, SPEC-v2-dashboard §4.1.
 *
 * Compact tinted badge for appointment / list-row status (Confirmada green,
 * Pendente orange, Cancelada neutral). No dot — the fill carries the meaning.
 * For the richer record/review status with a dot, use `GlassStatusChip`.
 *
 * AA (SPEC §3.4): label text uses the AA-dark step on each tint. "Pendente
 * orange" uses the restrained brand warning amber, not a saturated orange flood
 * (SPEC §10). Cancelada is neutral grey, not a red flood.
 *
 * @example
 * <StatusBadge tone="confirmed">{t("appointment.confirmed")}</StatusBadge>
 */
export type AppointmentTone = "confirmed" | "pending" | "cancelled";

export interface StatusBadgeProps {
  tone: AppointmentTone;
  children: ReactNode;
  className?: string;
}

// Labels must clear AA on their TINT (12px text). Green-700 fails on green-100
// (3.9:1), so confirmed uses the 800 label (5.8:1). Cancelled uses the darker
// brand `text-secondary` (#56697A, 5.0:1 on surface-muted), since
// v2-text-secondary is only AA on white. Pending warning-700 clears on
// warning-bg (4.6:1).
const TONES: Record<AppointmentTone, string> = {
  confirmed: "bg-v2-green-100 text-v2-green-800",
  pending: "bg-warning-bg text-warning-700",
  cancelled: "bg-surface-muted text-text-secondary",
};

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

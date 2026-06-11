import { type ReactNode } from "react";

import { Card } from "./Card";

/**
 * KpiCard — SPEC-foundation §4.4.
 *
 * Dashboard summary tile: caption label on top, large value (h1 size / 32px,
 * weight 600), and an optional comparison line below (string from the screen).
 * Loading renders the label and a 32px-tall skeleton block in place of the
 * value. Grid layout (4-up xl, 2-up md, 1-up mobile) is the screen's job.
 *
 * @example
 * <KpiCard label={t("kpi.todayAppointments")} value="24" comparison="+3 vs ontem" />
 * <KpiCard label={t("kpi.revenue")} value={amount} loading={isPending} />
 */
export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Optional comparison/sub line (e.g. "+3 vs ontem"). */
  comparison?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  comparison,
  loading = false,
  className,
}: KpiCardProps) {
  return (
    <Card className={className} aria-busy={loading || undefined}>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-text-secondary">{label}</span>
        {loading ? (
          // TODO(W1-07): swap for <Skeleton variant="block" /> once W1-07 ships.
          // Interim 32px-tall placeholder so the value does not blank-then-pop.
          <span
            aria-hidden="true"
            className="h-8 w-24 animate-pulse rounded bg-surface-muted"
          />
        ) : (
          <span className="text-3xl text-text-primary">{value}</span>
        )}
        {comparison != null && (
          // SPEC §4.4 says text-muted, but text-muted (#8A98A6, 2.95:1 on white)
          // fails WCAG AA for this real informational line; text-secondary
          // (5.68:1) is the AA-safe token. See QUESTIONS.md Q11/Q12 context.
          <span className="text-sm text-text-secondary">{comparison}</span>
        )}
      </div>
    </Card>
  );
}

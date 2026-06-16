import { type ReactNode } from "react";

import { type V2Accent, V2_ACCENT_TINT } from "./v2-accent";

/**
 * GlassKpiCard — SPEC-v2-foundation §9, SPEC-v2-dashboard §2.
 *
 * Dashboard KPI tile: an accent-tinted icon circle, a large value, a caption,
 * and an optional delta caption. Fixed 180px tall on the `v2-radius-kpi` (28px)
 * glass surface with the single float shadow.
 *
 * States:
 * - loading: built-in skeleton in place of the value/caption (no blank-then-pop).
 * - error: a compact inline error tone in the caption row (never a red flood,
 *   per SPEC §10); the card chrome stays intact so the rest of the row survives.
 *
 * Copy comes from the screen via i18n; this primitive renders what it is given.
 *
 * @example
 * <GlassKpiCard accent="green" icon={<Users />} label={t("kpi.activePatients")}
 *   value="128" caption="+4 esta semana" />
 */
export interface GlassKpiCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Lucide (or any) icon node, rendered inside the accent-tinted circle. */
  icon?: ReactNode;
  /** Accent family for the icon circle (SPEC-v2-dashboard §2 maps one per KPI). */
  accent?: V2Accent;
  /** Optional delta/sub caption (e.g. "+4 esta semana"). */
  caption?: ReactNode;
  loading?: boolean;
  /** Compact inline error message shown in place of value/caption. */
  error?: ReactNode;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function GlassKpiCard({
  label,
  value,
  icon,
  accent = "blue",
  caption,
  loading = false,
  error,
  className,
}: GlassKpiCardProps) {
  const tint = V2_ACCENT_TINT[accent];
  const busy = loading || undefined;

  return (
    <div
      className={cx(
        // h-45 = 45 * 4px = 180px (SPEC §9), grid-aligned, not an arbitrary value.
        "glass-card flex h-45 flex-col justify-between rounded-v2-kpi p-6",
        className,
      )}
      aria-busy={busy}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="text-sm text-v2-text-secondary">{label}</span>
        {icon != null && (
          <span
            aria-hidden="true"
            className={cx(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              tint.circle,
              tint.icon,
            )}
          >
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {/* Built-in skeleton — neutral token fill, pulse collapses under
              reduced motion via the global rule. */}
          <span
            aria-hidden="true"
            className="h-8 w-24 animate-pulse rounded bg-surface-muted"
          />
          <span
            aria-hidden="true"
            className="h-4 w-32 animate-pulse rounded bg-surface-muted"
          />
        </div>
      ) : error != null ? (
        <div className="flex flex-col gap-1">
          <span className="text-3xl text-v2-text-secondary">—</span>
          <span className="text-sm text-error">{error}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-3xl text-v2-text-primary">{value}</span>
          {caption != null && (
            <span className="text-sm text-v2-text-secondary">{caption}</span>
          )}
        </div>
      )}
    </div>
  );
}

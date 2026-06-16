import { type ReactNode, useId } from "react";

/**
 * ResumoChart — SPEC-v2-foundation §9, SPEC-v2-dashboard §4.2.
 *
 * Minimal line chart: a blue-to-green gradient stroke over a light horizontal
 * grid, no dark colors. Hand-rolled inline SVG — no charting dependency is
 * introduced (a new runtime dep would need a QUESTIONS.md entry first). Renders
 * the supplied series, or an honest empty placeholder when there is not enough
 * data (the dashboard's weekly counts are a V1.1 data dependency).
 *
 * The gradient stops and grid reference the v2 token CSS variables (no hardcoded
 * hex). The stroke uses non-scaling-stroke so the line weight stays even while
 * the chart stretches to its container.
 *
 * @example
 * <ResumoChart data={[4, 6, 5, 8, 7, 9, 6]} ariaLabel={t("dashboard.weeklyChart")} />
 * <ResumoChart emptyLabel={t("dashboard.notEnoughData")} />   // no series yet
 */
export interface ResumoChartProps {
  /** Series values; needs at least 2 points to draw a line. */
  data?: number[];
  loading?: boolean;
  /** Placeholder copy shown when there is no/insufficient data. */
  emptyLabel?: ReactNode;
  /** Accessible summary of the trend (role="img"). */
  ariaLabel?: string;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

// viewBox geometry. Width 100, height 40, with 2-unit vertical padding so the
// extremes never touch the edge.
const W = 100;
const H = 40;
const PAD = 2;

export function ResumoChart({
  data,
  loading = false,
  emptyLabel,
  ariaLabel,
  className,
}: ResumoChartProps) {
  const gradientId = useId();
  const base = "h-40 w-full";

  if (loading) {
    return (
      <div
        aria-hidden="true"
        className={cx(base, "animate-pulse rounded-md bg-surface-muted", className)}
      />
    );
  }

  if (data == null || data.length < 2) {
    return (
      <div
        className={cx(
          base,
          "flex items-center justify-center rounded-md text-sm text-v2-text-secondary",
          className,
        )}
      >
        {emptyLabel ?? "Sem dados suficientes"}
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Four light horizontal grid lines.
  const gridYs = [0.2, 0.4, 0.6, 0.8].map((f) => +(f * H).toFixed(2));

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cx(base, className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-v2-blue-500)" />
          <stop offset="100%" stopColor="var(--color-v2-green-500)" />
        </linearGradient>
      </defs>

      {gridYs.map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2={W}
          y2={y}
          stroke="var(--color-v2-border)"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <polyline
        points={points}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

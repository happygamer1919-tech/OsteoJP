// W6-05 - a small, dependency-free SVG bar chart (no charting vendor added; see
// Q-W6-05-1). Horizontal bars keep every label + value readable and AA-safe: the
// numeric value is always rendered as text, so the bar colour is decorative only.
// Cyan (accent-2) fill per the brand palette.
//
// W7-03 - the PEAK bar takes the logo purple (accent-1-700), the rest stay cyan.
// This is the Estatisticas purple accent in the 55/25/20 equity, and it is tied
// to MEANING (the highest value) rather than being a decorative repaint. Colour
// remains a redundant cue: every value is printed as text beside its bar, so
// nothing is lost to a colourblind reader or a screen reader.

export type BarDatum = { label: string; value: number };

export function BarChart({
  data,
  formatValue,
  emptyLabel,
}: {
  data: BarDatum[];
  formatValue: (v: number) => string;
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-v2-text-secondary">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const rowH = 32;
  const gap = 8;
  const labelW = 120;
  const barMaxW = 320;
  const valueW = 96;
  const width = labelW + barMaxW + valueW;
  const height = data.length * (rowH + gap);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      className="max-w-full"
      preserveAspectRatio="xMinYMin meet"
    >
      {data.map((d, i) => {
        const y = i * (rowH + gap);
        const w = Math.max(2, Math.round((d.value / max) * barMaxW));
        // Peak bar = purple emphasis. `max` is clamped to >= 1, so an all-zero
        // dataset highlights nothing rather than painting every bar purple.
        const isPeak = d.value > 0 && d.value === max;
        return (
          <g key={`${d.label}-${i}`}>
            <text
              x={labelW - 8}
              y={y + rowH / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-current text-v2-text-primary"
              fontSize={13}
            >
              {d.label}
            </text>
            <rect
              x={labelW}
              y={y}
              width={w}
              height={rowH}
              rx={6}
              data-peak={isPeak ? "true" : "false"}
              // Peak = accent-1-700 (logo purple, 8.72:1 on white); every other
              // bar keeps cyan / accent-2 (canonical brand teal).
              style={{
                fill: isPeak
                  ? "var(--color-accent-1-700)"
                  : "var(--color-brand-teal)",
              }}
            />
            <text
              x={labelW + w + 8}
              y={y + rowH / 2}
              dominantBaseline="central"
              className="fill-current text-v2-text-secondary"
              fontSize={13}
            >
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

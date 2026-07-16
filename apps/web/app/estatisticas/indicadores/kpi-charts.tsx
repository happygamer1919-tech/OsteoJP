"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { s } from "@/lib/i18n";

/**
 * W8-03 — recharts chart primitives for the KPI reports. Purple accents (accent-1
 * ramp) per the 55/25/20 equity; the canonical hexes are never redefined here.
 * Every chart is paired with a data TABLE so the value is always available as
 * text (colour is never the only cue — AA + print-safe).
 */

// accent-1 (magenta/purple) ramp from theme.css. Base #8B1863 leads; tints follow
// for multi-series. Never the teal base #45B9A7 for text.
export const CHART_PURPLE = [
  "#8B1863",
  "#AE1E7C",
  "#D9269B",
  "#6D134D",
  "#E25AB3",
  "#4E0E38",
  "#E793CA",
] as const;

const AXIS = "#5B6B7A"; // v2-text-secondary-ish, AA on surface
const GRID = "#E2E8EE";

function EmptyBlock({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-v2-text-secondary">{label}</p>;
}

function DataTable({
  head,
  rows,
}: {
  head: [string, string];
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-4 text-left text-xs font-medium text-v2-text-secondary">{head[0]}</th>
            <th className="py-2 text-right text-xs font-medium text-v2-text-secondary">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`} className="border-b border-border last:border-0">
              <td className="py-2 pr-4 text-v2-text-primary">{r.label}</td>
              <td className="py-2 text-right tabular-nums text-v2-text-primary">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Named = { label: string; value: number };

/** Donut (Tipos de marcação, Origem dos utentes). Legend + table carry the text. */
export function DonutReport({
  data,
  formatValue,
  emptyLabel,
  valueHead,
}: {
  data: Named[];
  formatValue: (v: number) => string;
  emptyLabel: string;
  valueHead: string;
}) {
  if (data.length === 0) return <EmptyBlock label={emptyLabel} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={1}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_PURPLE[i % CHART_PURPLE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatValue(Number(v))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        head={[s["statistics.kpiColLabel"], valueHead]}
        rows={data.map((d) => ({ label: d.label, value: formatValue(d.value) }))}
      />
    </div>
  );
}

/** Horizontal bars (top-N rankings). */
export function HBarReport({
  data,
  formatValue,
  emptyLabel,
  valueHead,
}: {
  data: Named[];
  formatValue: (v: number) => string;
  emptyLabel: string;
  valueHead: string;
}) {
  if (data.length === 0) return <EmptyBlock label={emptyLabel} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="w-full" style={{ height: Math.max(200, data.length * 40 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={{ fill: AXIS, fontSize: 12 }} tickFormatter={(v) => formatValue(Number(v))} />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fill: AXIS, fontSize: 12 }}
            />
            <Tooltip formatter={(v) => formatValue(Number(v))} />
            <Bar dataKey="value" fill={CHART_PURPLE[0]} isAnimationActive={false} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        head={[s["statistics.kpiColLabel"], valueHead]}
        rows={data.map((d) => ({ label: d.label, value: formatValue(d.value) }))}
      />
    </div>
  );
}

/** Vertical bars (Distribuição etária). */
export function VBarReport({
  data,
  formatValue,
  emptyLabel,
  valueHead,
}: {
  data: Named[];
  formatValue: (v: number) => string;
  emptyLabel: string;
  valueHead: string;
}) {
  if (data.every((d) => d.value === 0)) return <EmptyBlock label={emptyLabel} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} />
            <Tooltip formatter={(v) => formatValue(Number(v))} />
            <Bar dataKey="value" fill={CHART_PURPLE[0]} isAnimationActive={false} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        head={[s["statistics.kpiColLabel"], valueHead]}
        rows={data.map((d) => ({ label: d.label, value: formatValue(d.value) }))}
      />
    </div>
  );
}

/** Single-series line (Evolução da faturação). */
export function LineReport({
  data,
  formatValue,
  emptyLabel,
  valueHead,
}: {
  data: { period: string; value: number }[];
  formatValue: (v: number) => string;
  emptyLabel: string;
  valueHead: string;
}) {
  if (data.length === 0) return <EmptyBlock label={emptyLabel} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="period" tick={{ fill: AXIS, fontSize: 12 }} />
            <YAxis tick={{ fill: AXIS, fontSize: 12 }} tickFormatter={(v) => formatValue(Number(v))} width={72} />
            <Tooltip formatter={(v) => formatValue(Number(v))} />
            <Line type="monotone" dataKey="value" stroke={CHART_PURPLE[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        head={[s["statistics.kpiColPeriod"], valueHead]}
        rows={data.map((d) => ({ label: d.period, value: formatValue(d.value) }))}
      />
    </div>
  );
}

/** Multi-series line (faturação / marcações por terapeuta). */
export function MultiLineReport({
  rows,
  series,
  formatValue,
  emptyLabel,
}: {
  rows: { period: string; [k: string]: number | string }[];
  series: string[];
  formatValue: (v: number) => string;
  emptyLabel: string;
}) {
  if (rows.length === 0 || series.length === 0) return <EmptyBlock label={emptyLabel} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="period" tick={{ fill: AXIS, fontSize: 12 }} />
            <YAxis tick={{ fill: AXIS, fontSize: 12 }} tickFormatter={(v) => formatValue(Number(v))} width={72} />
            <Tooltip formatter={(v) => formatValue(Number(v))} />
            <Legend />
            {series.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={CHART_PURPLE[i % CHART_PURPLE.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        head={[s["statistics.kpiColPeriod"], series.join(" · ")]}
        rows={rows.map((r) => ({
          label: String(r.period),
          value: series.map((name) => formatValue(Number(r[name] ?? 0))).join(" · "),
        }))}
      />
    </div>
  );
}

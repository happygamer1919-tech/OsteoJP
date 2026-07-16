// W8-03 — pure transforms for the Indicadores (KPI) reports. No DB, no I/O, so
// the bucketing + pivoting is unit-testable in isolation. Kept separate from the
// query layer (kpi-queries.ts) that feeds these.

/** Age buckets (years). "desconhecido" collects patients with no date of birth. */
export const AGE_BUCKETS = ["0-17", "18-29", "30-44", "45-59", "60+", "desconhecido"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

/** Whole years between a YYYY-MM-DD birth date and a reference date, or null. */
export function ageInYears(dateOfBirth: string | null, ref: Date): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = ref.getUTCFullYear() - y;
  const refM = ref.getUTCMonth() + 1;
  const refD = ref.getUTCDate();
  if (refM < m || (refM === m && refD < d)) age -= 1;
  return age < 0 ? null : age;
}

export function ageBucket(age: number | null): AgeBucket {
  if (age === null) return "desconhecido";
  if (age <= 17) return "0-17";
  if (age <= 29) return "18-29";
  if (age <= 44) return "30-44";
  if (age <= 59) return "45-59";
  return "60+";
}

/** Bucket a list of birth dates into the fixed age buckets (order preserved). */
export function ageDistribution(
  birthDates: (string | null)[],
  ref: Date,
): { bucket: AgeBucket; count: number }[] {
  const counts = new Map<AgeBucket, number>(AGE_BUCKETS.map((b) => [b, 0]));
  for (const dob of birthDates) {
    const b = ageBucket(ageInYears(dob, ref));
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return AGE_BUCKETS.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

/** Count occurrences of a categorical value, top-N by count, with an explicit
 *  label for null/empty (e.g. "Sem origem" / "Sem localidade"). */
export function categoryCounts(
  values: (string | null)[],
  emptyLabel: string,
  topN?: number,
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v && v.trim().length > 0 ? v.trim() : emptyLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return topN ? sorted.slice(0, topN) : sorted;
}

/**
 * Pivot flat (period, seriesName, value) rows into recharts row objects:
 * `[{ period, [seriesName]: value, ... }]` plus the ordered distinct series
 * names. Missing (period, series) cells are 0 so every line is continuous.
 */
export function pivotSeries(
  rows: { period: string; series: string; value: number }[],
): { periods: { period: string; [k: string]: number | string }[]; series: string[] } {
  const periodOrder: string[] = [];
  const seriesOrder: string[] = [];
  const byPeriod = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byPeriod.has(r.period)) {
      byPeriod.set(r.period, new Map());
      periodOrder.push(r.period);
    }
    if (!seriesOrder.includes(r.series)) seriesOrder.push(r.series);
    byPeriod.get(r.period)!.set(r.series, (byPeriod.get(r.period)!.get(r.series) ?? 0) + r.value);
  }
  periodOrder.sort();
  const periods = periodOrder.map((period) => {
    const row: { period: string; [k: string]: number | string } = { period };
    for (const sname of seriesOrder) row[sname] = byPeriod.get(period)?.get(sname) ?? 0;
    return row;
  });
  return { periods, series: seriesOrder };
}

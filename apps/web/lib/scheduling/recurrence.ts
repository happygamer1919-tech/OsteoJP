// Recurring-series generation (pure).
//
// Series are MATERIALIZED: a recurring create writes N concrete appointment
// rows — the parent (first occurrence, carrying the RRULE) plus children that
// point at it via recurrence_parent_id. This module only computes the set of
// occurrence instants and the RRULE string; the DB writes live in actions.ts.
//
// Occurrences are stepped on Lisbon CALENDAR dates and then converted to UTC,
// so the wall-clock time (e.g. 09:00) is preserved across DST changes rather
// than drifting by an hour.

import { addDays, addMonths, lisbonDateTimeToUtc } from "./time";

export const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** A bounded recurrence: a frequency + a total occurrence count (incl. the first). */
export type RecurrenceSpec = { freq: Frequency; count: number };

/** Which occurrences of a series a create/edit/cancel applies to. */
export type SeriesScope = "one" | "following" | "series";

/** Hard cap on generated rows, so one click can't materialize an unbounded series. */
export const MAX_OCCURRENCES = 52;

export function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(Math.trunc(count), MAX_OCCURRENCES));
}

/** The calendar date of occurrence `n` (0-based) for a frequency. */
export function stepDate(dateStr: string, freq: Frequency, n: number): string {
  switch (freq) {
    case "daily":
      return addDays(dateStr, n);
    case "weekly":
      return addDays(dateStr, 7 * n);
    case "biweekly":
      return addDays(dateStr, 14 * n);
    case "monthly":
      return addMonths(dateStr, n);
  }
}

/**
 * UTC start/end instants for every occurrence, given the first occurrence's
 * Lisbon date + time-of-day and its duration. The first element is the parent.
 */
export function expandRecurrence(
  firstDateStr: string,
  hhmm: string,
  durationMin: number,
  spec: RecurrenceSpec,
): { startsAt: Date; endsAt: Date }[] {
  const count = clampCount(spec.count);
  const out: { startsAt: Date; endsAt: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const startsAt = lisbonDateTimeToUtc(stepDate(firstDateStr, spec.freq, i), hhmm);
    out.push({
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
    });
  }
  return out;
}

const FREQ_TO_RRULE: Record<Frequency, { freq: string; interval: number }> = {
  daily: { freq: "DAILY", interval: 1 },
  weekly: { freq: "WEEKLY", interval: 1 },
  biweekly: { freq: "WEEKLY", interval: 2 },
  monthly: { freq: "MONTHLY", interval: 1 },
};

/** iCalendar RRULE string stored on the parent row (interop/documentation). */
export function toRRule(spec: RecurrenceSpec): string {
  const { freq, interval } = FREQ_TO_RRULE[spec.freq];
  return `FREQ=${freq};INTERVAL=${interval};COUNT=${clampCount(spec.count)}`;
}

/** Parse the stored RRULE back into a spec (for prefilling the edit UI). */
export function parseRRule(text: string | null | undefined): RecurrenceSpec | null {
  if (!text) return null;
  const parts: Record<string, string> = {};
  for (const segment of text.split(";")) {
    const [k, v] = segment.split("=");
    if (k && v) parts[k.trim().toUpperCase()] = v.trim();
  }
  const count = Number(parts.COUNT ?? "0");
  if (!Number.isFinite(count) || count < 1) return null;
  const interval = Number(parts.INTERVAL ?? "1");
  let freq: Frequency | null = null;
  if (parts.FREQ === "DAILY") freq = "daily";
  else if (parts.FREQ === "WEEKLY") freq = interval === 2 ? "biweekly" : "weekly";
  else if (parts.FREQ === "MONTHLY") freq = "monthly";
  if (!freq) return null;
  return { freq, count: clampCount(count) };
}

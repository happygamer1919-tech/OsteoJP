// R29 - the days of Painel and Indicadores are Lisbon days.
//
// Both pages take a period as two "yyyy-mm-dd" strings, and the clinic means a
// Lisbon calendar day by them. Until R29 the bounds were built as UTC
// midnights, so in summer time (UTC+1) a visit between 00:00 and 01:00 Lisbon
// fell on the previous day: counted in a period that ended the day before, and
// missing from a period that started on its own day.
//
// The bounds are now Lisbon midnights converted with the zone offset at that
// instant, through the agenda's tested helper (scheduling/time.ts), so a
// period is [00:00 Lisbon on `from`, 00:00 Lisbon on the day after `to`). On
// the day the clocks go forward that day is 23 hours long, on the day they go
// back it is 25. Winter dates are unchanged, because Lisbon is UTC+0 then.
//
// Pure: no database, no server-only import, so the period picker (a client
// component) uses the same "today" as the queries.

import { addDays, lisbonMidnightUtc, todayInLisbon } from "../scheduling/time";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed "yyyy-mm-dd" that is a real calendar date. */
export function isYmd(value: string | null | undefined): value is string {
  return typeof value === "string" && DATE_RE.test(value) && addDays(value, 0) === value;
}

/**
 * The half-open instant range of Lisbon days `from` to `to`, both inclusive:
 * `start` is 00:00 Lisbon on `from`, `end` is 00:00 Lisbon on the day after
 * `to`. A missing or malformed bound is null (unbounded on that side).
 */
export function lisbonDayBounds(
  from?: string | null,
  to?: string | null,
): { start: Date | null; end: Date | null } {
  const start = isYmd(from) ? lisbonMidnightUtc(from) : null;
  const end = isYmd(to) ? lisbonMidnightUtc(addDays(to, 1)) : null;
  return { start, end };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The Lisbon calendar date `months` months before the Lisbon day of `now`.
 * The month arithmetic is the one the 12-month window has always used (a day
 * past the end of the target month rolls forward); only the starting day moved
 * from the UTC date to the Lisbon date.
 */
export function lisbonMonthsBefore(now: Date, months: number): string {
  const [y, m, d] = todayInLisbon(now).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCMonth(t.getUTCMonth() - months);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export type PeriodPreset = "thisMonth" | "last3" | "thisYear" | "last12" | "all";

/** The `from`/`to` a period preset of Indicadores stands for, on Lisbon's today. */
export function presetRange(key: PeriodPreset, now: Date): { from: string | null; to: string | null } {
  if (key === "all") return { from: null, to: null };
  const to = todayInLisbon(now);
  const [y, m] = to.split("-").map(Number);
  if (key === "thisMonth") return { from: `${y}-${pad(m)}-01`, to };
  if (key === "thisYear") return { from: `${y}-01-01`, to };
  return { from: lisbonMonthsBefore(now, key === "last3" ? 3 : 12), to };
}

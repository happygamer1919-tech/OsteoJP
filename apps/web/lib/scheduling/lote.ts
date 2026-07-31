/**
 * "Agendar lote" helpers (W2-10, recurrence rewritten by PL-21). Pure so the
 * date generation and explicit-slot building are unit-testable without React or
 * a DB. The UI collects a recurrence pattern + a PER-DATE time; these turn that
 * into the explicit slot list the W2-09 engine books.
 *
 * PL-21 replaced generateLoteDates (one weekday, a count, an every-N-weeks
 * step) with generateLoteSchedule below. The old helper was a strict subset -
 * `weekdays: [n]` with `end: {kind:"count"}` reproduces it exactly - so it was
 * removed rather than left as a second way to say the same thing.
 */
import { lisbonDateTimeToUtc } from "./time";
import type { BatchExplicitSlot } from "./batch-core";

/** One generated row: a Lisbon calendar date with its own editable time. */
export type LoteRow = { date: string; time: string };

/** Build explicit engine slots (ISO UTC) from per-date rows + a duration. */
export function buildLoteSlots(rows: LoteRow[], durationMin: number): BatchExplicitSlot[] {
  return rows.map((r) => {
    const startsAt = lisbonDateTimeToUtc(r.date, r.time);
    return {
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + durationMin * 60_000).toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* PL-21 — real recurrence                                            */
/* ------------------------------------------------------------------ */

/**
 * Owner CR 2026-07-31, via Rodica: "the current option on how you can select
 * the frequency is very limited, you can only select if 1 per week or twice a
 * week, they need a more complex and flexible selection form, more filters on
 * the repetitiveness".
 *
 * The old generator took a count and an every-N-weeks step and produced dates
 * on ONE weekday. "Segundas e quintas" was unreachable except by hand-editing
 * each generated row. This expresses the pattern people actually describe:
 * WHICH weekdays, HOW OFTEN the pattern repeats, and WHEN it stops.
 *
 * The booking engine needed no change at all: batch.ts has accepted an explicit
 * per-slot list since W2-09, checks each slot against the same availability
 * query the panel uses, and reports a busy slot with its nearest free
 * alternative. This only decides which dates go into that list.
 */

/** When the pattern stops: after N bookings, or on a calendar date. */
export type LoteEnd =
  | { kind: "count"; count: number }
  | { kind: "until"; date: string };

export type LoteSpec = {
  /** First candidate Lisbon calendar date, "yyyy-mm-dd" (usually the form's date). */
  from: string;
  /** Weekdays to book, 0=Sunday..6=Saturday. Empty = the weekday of `from`. */
  weekdays: number[];
  /** Repeat the whole weekday pattern every N weeks (1 = weekly, 2 = fortnightly). */
  everyWeeks: number;
  end: LoteEnd;
};

/**
 * Hard cap on generated dates, mirroring recurrence.MAX_OCCURRENCES: one press
 * must not be able to materialize an unbounded series. It bounds BOTH end
 * modes - "until 2030" is capped exactly like "count: 9999".
 */
export const MAX_LOTE_DATES = 52;

/** Clinical week order: Monday first, Sunday last (matches WEEKDAY_ORDER). */
function offsetFromMonday(weekday: number): number {
  return (weekday + 6) % 7;
}

function parseIsoDate(value: string): Date | null {
  const [y, m, d] = (value ?? "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject a date the calendar rolled over (e.g. "2026-02-31" -> 3 March).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Deduped, valid, in clinical week order; falls back to `from`'s own weekday. */
function normalizeWeekdays(weekdays: number[], fallback: number): number[] {
  const valid = [...new Set((weekdays ?? []).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6))];
  const chosen = valid.length > 0 ? valid : [fallback];
  return chosen.sort((a, b) => offsetFromMonday(a) - offsetFromMonday(b));
}

/**
 * The Lisbon calendar dates a lote pattern produces, ascending.
 *
 * Anchored on the MONDAY of `from`'s week, so "every 2 weeks on Mon+Thu" keeps
 * both days in the same fortnight rather than drifting apart. Dates before
 * `from` never appear: picking Monday on a Wednesday means next Monday, not a
 * booking in the past.
 *
 * Whole-day UTC arithmetic on a date-only value: stable across month ends and
 * unaffected by DST (the wall-clock time is applied later, per row, by
 * buildLoteSlots).
 */
export function generateLoteSchedule(spec: LoteSpec): string[] {
  const start = parseIsoDate(spec.from);
  if (!start) return [];

  const everyWeeks = Math.max(1, Math.floor(spec.everyWeeks || 1));
  const weekdays = normalizeWeekdays(spec.weekdays, start.getUTCDay());

  const until = spec.end.kind === "until" ? parseIsoDate(spec.end.date) : null;
  if (spec.end.kind === "until" && !until) return [];
  const limit =
    spec.end.kind === "count"
      ? Math.max(1, Math.min(Math.floor(spec.end.count) || 1, MAX_LOTE_DATES))
      : MAX_LOTE_DATES;

  const monday = addDays(start, -offsetFromMonday(start.getUTCDay()));
  const dates: string[] = [];

  // Bounded by construction: each pass adds at least one candidate date, and
  // both end modes cap at MAX_LOTE_DATES. The block ceiling is a belt-and-braces
  // stop so a future edit cannot turn this into an infinite loop.
  for (let block = 0; dates.length < limit && block <= MAX_LOTE_DATES * everyWeeks; block += everyWeeks) {
    const weekStart = addDays(monday, block * 7);
    // Every day of this week is already past the end date: nothing later can qualify.
    if (until && weekStart.getTime() > addDays(until, 6).getTime()) break;

    for (const weekday of weekdays) {
      if (dates.length >= limit) break;
      const date = addDays(weekStart, offsetFromMonday(weekday));
      if (date.getTime() < start.getTime()) continue;
      if (until && date.getTime() > until.getTime()) continue;
      dates.push(iso(date));
    }
  }

  return dates;
}

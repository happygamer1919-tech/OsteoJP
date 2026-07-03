/**
 * "Agendar lote" helpers (W2-10). Pure so the date generation and explicit-slot
 * building are unit-testable without React/DB. The UI collects a count + an
 * every-X-weeks pattern + a PER-DATE time; these turn that into the explicit
 * slot list the W2-09 engine books.
 */
import { lisbonDateTimeToUtc } from "./time";
import type { BatchExplicitSlot } from "./batch-core";

/** One generated row: a Lisbon calendar date with its own editable time. */
export type LoteRow = { date: string; time: string };

/**
 * Generate `count` Lisbon calendar dates starting at `startDate`, stepping
 * `everyWeeks` whole weeks between them (so all land on the same weekday).
 * `startDate` is "yyyy-mm-dd"; both count and everyWeeks are clamped to >= 1.
 */
export function generateLoteDates(startDate: string, everyWeeks: number, count: number): string[] {
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return [];
  const stepDays = Math.max(1, Math.floor(everyWeeks)) * 7;
  const n = Math.max(1, Math.floor(count));
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    // Whole-day UTC arithmetic keeps the calendar date stable across month ends
    // and is DST-safe for a date-only value.
    const dt = new Date(Date.UTC(y, m - 1, d + i * stepDays));
    dates.push(dt.toISOString().slice(0, 10));
  }
  return dates;
}

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

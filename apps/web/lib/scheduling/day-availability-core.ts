// Availability day-assembly — PURE core (no DB, no server-only, no auth).
//
// Given a Lisbon calendar date plus the therapist's templates, bookings, and
// time_off blocks, produce that day's working / booked / blocks / free
// intervals. `free` is working MINUS booked MINUS blocks: a time_off block is
// deducted exactly like a booking (W5-12), so a block disappears from the
// availability panel and from Agendar lote (both consume `free`).
//
// Split out from day-availability.ts (which is `server-only`) so the interval
// math is unit-testable in isolation, mirroring batch-core / availability.

import { mergeIntervals, subtractIntervals, type TimeInterval } from "./intervals";
import { isWithinValidity, lisbonWeekday, type AvailabilityTemplate } from "./availability";
import { addDays, lisbonDateTimeToUtc, lisbonMidnightUtc } from "./time";
import type { AppointmentStatusValue } from "./types";

/** A time span crossing the wire as ISO-8601 UTC strings (see types.ts). */
export type IsoInterval = { start: string; end: string };

/** A booked appointment span. Carries the id + status so conflict reporting
 * can attribute the block without a second query. */
export type BookedInterval = IsoInterval & {
  appointmentId: string;
  status: AppointmentStatusValue;
};

/** A therapist absence/block span (time_off), UTC on the wire. */
export type BlockInterval = IsoInterval & {
  blockId: string;
  reason: string;
};

/** Availability for one Lisbon calendar day. */
export type DayAvailability = {
  /** Lisbon calendar date, "yyyy-mm-dd". */
  date: string;
  /** Working windows from availability_templates (merged, sorted). */
  working: IsoInterval[];
  /** Booked appointments overlapping the day (cancelled/no_show excluded). */
  booked: BookedInterval[];
  /** time_off blocks overlapping the day (W5-12). */
  blocks: BlockInterval[];
  /** Working minus booked minus blocks - the bookable gaps (merged, sorted). */
  free: IsoInterval[];
};

export type BookedRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatusValue;
};

export type BlockRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
};

const iso = (i: TimeInterval): IsoInterval => ({
  start: i.start.toISOString(),
  end: i.end.toISOString(),
});

/**
 * Assemble one day's working / booked / blocks / free intervals. Pure given its
 * rows.
 */
export function buildDay(
  date: string,
  templates: AvailabilityTemplate[],
  bookedRows: BookedRow[],
  blockRows: BlockRow[] = [],
): DayAvailability {
  const dayStart = lisbonMidnightUtc(date).getTime();
  const dayEnd = lisbonMidnightUtc(addDays(date, 1)).getTime();
  const weekday = lisbonWeekday(date);

  // Working windows: templates for this weekday, still inside their validity
  // window, converted from Lisbon wall-clock "time" columns to UTC instants.
  const working: TimeInterval[] = templates
    .filter((t) => t.weekday === weekday && isWithinValidity(date, t.validFrom, t.validUntil))
    .map((t) => ({
      start: lisbonDateTimeToUtc(date, t.startTime),
      end: lisbonDateTimeToUtc(date, t.endTime),
    }));

  // Bookings overlapping this specific day (rows are pre-filtered to the range).
  const bookedForDay = bookedRows.filter(
    (r) => r.startsAt.getTime() < dayEnd && r.endsAt.getTime() > dayStart,
  );
  const bookedIntervals: TimeInterval[] = bookedForDay.map((r) => ({
    start: r.startsAt,
    end: r.endsAt,
  }));

  // time_off blocks overlapping this day (rows are pre-filtered to the range).
  const blocksForDay = blockRows.filter(
    (r) => r.startsAt.getTime() < dayEnd && r.endsAt.getTime() > dayStart,
  );
  const blockIntervals: TimeInterval[] = blocksForDay.map((r) => ({
    start: r.startsAt,
    end: r.endsAt,
  }));

  // free = working minus (booked ∪ blocks). Both are cut out of the free time.
  const free = subtractIntervals(working, [...bookedIntervals, ...blockIntervals]);

  return {
    date,
    working: mergeIntervals(working).map(iso), // merged + sorted
    booked: bookedForDay.map((r) => ({
      appointmentId: r.id,
      status: r.status,
      start: r.startsAt.toISOString(),
      end: r.endsAt.toISOString(),
    })),
    blocks: blocksForDay.map((r) => ({
      blockId: r.id,
      reason: r.reason,
      start: r.startsAt.toISOString(),
      end: r.endsAt.toISOString(),
    })),
    free: free.map(iso),
  };
}

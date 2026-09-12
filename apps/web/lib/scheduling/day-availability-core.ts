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
import {
  isWithinValidity,
  lisbonWeekday,
  scheduleRuleFor,
  type AvailabilityTemplate,
  type ScheduleRule,
} from "./availability";
import { addDays, lisbonDateTimeToUtc, lisbonMidnightUtc } from "./time";
import { closureFor, type ClinicHours } from "./clinic-hours";
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
  /** SCHED-19. Null for every block written before the note was required, and
   *  for every block written through a path that does not collect one. */
  note: string | null;
};

/**
 * SCHED-09 — one working window BEFORE merging, with the rule that produced it.
 *
 * IT EXISTS BECAUSE `working` IS MERGED AND THEREFORE CANNOT BE ATTRIBUTED.
 * `mergeIntervals` folds 08:00-13:00 and 13:00-19:00 into a single 08:00-19:00,
 * so an index into `working` no longer corresponds to a template and a parallel
 * array of sources would silently mis-attribute the moment two periods touch.
 * The inspector reads THIS; every existing consumer keeps reading `working`.
 */
export type WorkingSource = IsoInterval & {
  /** Where the window is worked, or null when the caller did not ask. */
  locationId: string | null;
  rule: ScheduleRule;
};

/**
 * 0085 - the CLINIC being shut, which is not a therapist being away.
 *
 * CARRIED SEPARATELY FROM `blocks`, deliberately. They subtract the same
 * minutes from `free`, so folding them together would be tempting and would
 * lose the only thing that matters about the difference: a block belongs to one
 * therapist and can be removed by reception, and a closure belongs to the
 * building and cannot. Every surface that renders them has to say which it is,
 * and it can only do that if the resolver kept them apart.
 */
export type ClosureInterval = IsoInterval;

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
  /** 0085: the clinic's own closure on this day, or empty. At most one, but an
   *  array because every consumer already loops over the other two and a lone
   *  nullable would be the one shape somebody forgets to handle. */
  closures: ClosureInterval[];
  /** Working minus booked minus blocks MINUS CLOSURES - the bookable gaps. */
  free: IsoInterval[];
  /** SCHED-09: the UNMERGED windows with their rule. Additive; `working` is
   *  unchanged and remains what the agenda and the batch engine read. */
  sources: WorkingSource[];
};

/**
 * SCHED-20 - WHY A DAY OFFERS NO SLOTS. Three answers, and the panel had one.
 *
 * ==========================================================================
 * THE DEFECT THIS EXISTS FOR, AND IT NAMED THE WRONG CAUSE FOR FIVE DAYS
 * ==========================================================================
 * The availability panel printed "Sem horarios livres neste dia" whenever
 * `free` came back empty, WHATEVER emptied it. On 23 September it printed that
 * under "Horario: 09:00-20:00" and "Ocupado: 14:00-15:00" - eleven hours of
 * working time, one hour booked, and no free time. That is arithmetic nobody
 * can make sense of, and it sent the reader looking at the appointment list for
 * an hour that was never the problem: a five-day BLOCK had taken the day, and
 * the panel never mentioned blocks at all.
 *
 * SO THE REASON IS COMPUTED, NOT INFERRED FROM EMPTINESS. `free` being empty is
 * the QUESTION, not the answer, and the three answers are genuinely different
 * actions: set some hours, remove a block, or move an appointment.
 *
 * "blocked" WINS OVER "booked" WHEN BOTH ARE TRUE, deliberately. A day can be
 * fully booked AND blocked; the block is the one that has to go first, because
 * moving every appointment off a blocked day frees nothing.
 */
export type NoFreeReason = "no_working_hours" | "closed" | "blocked" | "booked";

/**
 * The reason a day has no bookable time, or null when it has some.
 *
 * PURE, and it reads the SAME `DayAvailability` the panel renders, so the
 * sentence on screen and the intervals above it can never describe different
 * days.
 */
export function noFreeReason(day: DayAvailability): NoFreeReason | null {
  if (day.working.length === 0) return "no_working_hours";
  if (day.free.length > 0) return null;
  // 0085 - THE CLINIC WINS OVER BOTH OF THE OTHERS when it is what took the
  // day, and the ordering is the same argument as blocked-over-booked: removing
  // a block frees nothing on a day the building is shut, and neither does
  // moving an appointment. It is also the only one of the three that reception
  // cannot act on at all, which is precisely what the sentence has to say.
  const closedOverWork = day.closures.some((c) =>
    day.working.some((w) => c.start < w.end && w.start < c.end),
  );
  if (closedOverWork) return "closed";
  // A block only explains the emptiness if it actually overlaps working time.
  // A block at 21:00 on a day that ends at 19:00 has taken nothing, and naming
  // it would be the same class of wrong answer in the other direction.
  const overlapsWork = day.blocks.some((b) =>
    day.working.some((w) => b.start < w.end && w.start < b.end),
  );
  return overlapsWork ? "blocked" : "booked";
}

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
  note: string | null;
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
  /** 0085. Null when the caller is not scoped to one clinic - under "Todas as
   *  localizações" a closure is only true of ONE of them, so drawing or
   *  subtracting it would be a claim about the wrong clinic (owner ruling). */
  clinicHours: ClinicHours | null = null,
): DayAvailability {
  const dayStart = lisbonMidnightUtc(date).getTime();
  const dayEnd = lisbonMidnightUtc(addDays(date, 1)).getTime();
  const weekday = lisbonWeekday(date);

  // Working windows: templates for this weekday, still inside their validity
  // window, converted from Lisbon wall-clock "time" columns to UTC instants.
  const applicable = templates.filter(
    (t) => t.weekday === weekday && isWithinValidity(date, t.validFrom, t.validUntil),
  );
  const working: TimeInterval[] = applicable.map((t) => ({
    start: lisbonDateTimeToUtc(date, t.startTime),
    end: lisbonDateTimeToUtc(date, t.endTime),
  }));
  // SCHED-09: the same windows, unmerged, each carrying its rule. Derived from
  // the SAME `applicable` list, so the inspector cannot drift from the agenda.
  const sources: WorkingSource[] = applicable.map((t) => ({
    start: lisbonDateTimeToUtc(date, t.startTime).toISOString(),
    end: lisbonDateTimeToUtc(date, t.endTime).toISOString(),
    locationId: t.locationId ?? null,
    rule: scheduleRuleFor(t),
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

  // 0085: the clinic's closure on this day, if this call is scoped to a clinic
  // that has one.
  const closure = closureFor(date, clinicHours);
  const closureIntervals: TimeInterval[] = closure ? [closure] : [];

  // free = working minus (booked ∪ blocks ∪ closures). The closure is cut out
  // exactly like the other two - it is the SUBTRACTION that makes a slot
  // unbookable, and the refusal on the write path is a separate guard that
  // exists because a read path is never enforcement.
  const free = subtractIntervals(working, [
    ...bookedIntervals,
    ...blockIntervals,
    ...closureIntervals,
  ]);

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
      note: r.note,
      start: r.startsAt.toISOString(),
      end: r.endsAt.toISOString(),
    })),
    closures: closureIntervals.map(iso),
    free: free.map(iso),
    sources,
  };
}

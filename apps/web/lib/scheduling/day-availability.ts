import "server-only";
import { and, asc, eq, gt, lt, notInArray, type SQL } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { appointments, availabilityTemplates, type DbTx } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { mergeIntervals, subtractIntervals, type TimeInterval } from "./intervals";
import { isWithinValidity, lisbonWeekday, type AvailabilityTemplate } from "./availability";
import { addDays, lisbonDateTimeToUtc, lisbonMidnightUtc } from "./time";
import type { AppointmentStatusValue } from "./types";

/**
 * Read-only availability query. Given a therapist and a date range (a single
 * day or a week), returns per Lisbon day the working windows, the booked
 * intervals, and the free intervals (working minus booked). Shared by the
 * new-appointment panel, the batch engine, and multi-therapist conflict
 * reporting - build once, consume three times.
 *
 * Runs through runScoped, so RLS scopes every read to the caller's tenant;
 * this module never filters tenant_id by hand and never touches getDbAdmin.
 * tenant_id comes from the verified JWT (RequestContext), never from input.
 */

/** A time span crossing the wire as ISO-8601 UTC strings (see types.ts). */
export type IsoInterval = { start: string; end: string };

/** A booked appointment span. Carries the id + status so conflict reporting
 * can attribute the block without a second query. */
export type BookedInterval = IsoInterval & {
  appointmentId: string;
  status: AppointmentStatusValue;
};

/** Availability for one Lisbon calendar day. */
export type DayAvailability = {
  /** Lisbon calendar date, "yyyy-mm-dd". */
  date: string;
  /** Working windows from availability_templates (merged, sorted). */
  working: IsoInterval[];
  /** Booked appointments overlapping the day (cancelled/no_show excluded). */
  booked: BookedInterval[];
  /** Working minus booked - the bookable gaps (merged, sorted). */
  free: IsoInterval[];
};

export type AvailabilityQuery = {
  therapistId: string;
  /** Inclusive Lisbon date range, "yyyy-mm-dd". A single day sets from === to. */
  from: string;
  to: string;
  /** Optional: scope working windows AND bookings to one clinic. When omitted,
   * windows and bookings across all of the therapist's locations are combined. */
  locationId?: string | null;
};

// Statuses that do NOT block a slot. Everything else (scheduled, confirmed,
// completed) counts as booked. Kept as a const tuple so the query stays in sync
// with the appointment_status enum without a manual list of the "booked" side.
const NON_BLOCKING: AppointmentStatusValue[] = ["cancelled", "no_show"];

const iso = (i: TimeInterval): IsoInterval => ({
  start: i.start.toISOString(),
  end: i.end.toISOString(),
});

/** Inclusive list of Lisbon calendar dates from `from` to `to`. */
function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export async function getTherapistAvailability(
  ctx: RequestContext,
  query: AvailabilityQuery,
): Promise<DayAvailability[]> {
  const { therapistId, from, to, locationId } = query;
  if (to < from) return [];

  const rangeStart = lisbonMidnightUtc(from);
  const rangeEnd = lisbonMidnightUtc(addDays(to, 1));

  return runScoped(ctx, async (tx) => {
    const [bookedRows, templateRows] = await Promise.all([
      readBookedRows(tx, { therapistId, rangeStart, rangeEnd, locationId }),
      readTemplateRows(tx, { therapistId, locationId }),
    ]);

    const templates: AvailabilityTemplate[] = templateRows.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      isActive: true, // query already filters is_active = true
    }));

    return datesInRange(from, to).map((date) =>
      buildDay(date, templates, bookedRows),
    );
  });
}

type BookedRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatusValue;
};

function readBookedRows(
  tx: DbTx,
  args: { therapistId: string; rangeStart: Date; rangeEnd: Date; locationId?: string | null },
): Promise<BookedRow[]> {
  const conds: SQL[] = [
    eq(appointments.practitionerId, args.therapistId),
    notInArray(appointments.status, NON_BLOCKING),
    // Half-open overlap with the whole query range: catches appointments that
    // straddle a day boundary at either edge.
    lt(appointments.startsAt, args.rangeEnd),
    gt(appointments.endsAt, args.rangeStart),
  ];
  if (args.locationId) conds.push(eq(appointments.locationId, args.locationId));
  return tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(...conds))
    .orderBy(asc(appointments.startsAt));
}

function readTemplateRows(
  tx: DbTx,
  args: { therapistId: string; locationId?: string | null },
) {
  const conds: SQL[] = [
    eq(availabilityTemplates.userId, args.therapistId),
    eq(availabilityTemplates.isActive, true),
  ];
  if (args.locationId) conds.push(eq(availabilityTemplates.locationId, args.locationId));
  return tx
    .select({
      weekday: availabilityTemplates.weekday,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
    })
    .from(availabilityTemplates)
    .where(and(...conds));
}

/** Assemble one day's working / booked / free intervals. Pure given its rows. */
function buildDay(
  date: string,
  templates: AvailabilityTemplate[],
  bookedRows: BookedRow[],
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

  const free = subtractIntervals(working, bookedIntervals);

  return {
    date,
    working: mergeIntervals(working).map(iso), // merged + sorted
    booked: bookedForDay.map((r) => ({
      appointmentId: r.id,
      status: r.status,
      start: r.startsAt.toISOString(),
      end: r.endsAt.toISOString(),
    })),
    free: free.map(iso),
  };
}

import "server-only";
import { and, asc, eq, gt, lt, notInArray, type SQL } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { appointments, availabilityTemplates, timeOff, type DbTx } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { type AvailabilityTemplate } from "./availability";
import { addDays, lisbonMidnightUtc } from "./time";
import type { AppointmentStatusValue } from "./types";
import {
  buildDay,
  type BlockRow,
  type BookedRow,
  type DayAvailability,
} from "./day-availability-core";

/**
 * Read-only availability query. Given a therapist and a date range (a single
 * day or a week), returns per Lisbon day the working windows, the booked
 * intervals, the time_off blocks, and the free intervals (working minus booked
 * minus blocks). Shared by the new-appointment panel, the batch engine, and
 * multi-therapist conflict reporting - build once, consume three times.
 *
 * The interval math lives in day-availability-core.ts (pure, unit-tested); this
 * module only does the tenant-scoped DB reads that feed it.
 *
 * Runs through runScoped, so RLS scopes every read to the caller's tenant;
 * this module never filters tenant_id by hand and never touches getDbAdmin.
 * tenant_id comes from the verified JWT (RequestContext), never from input.
 */

export type {
  IsoInterval,
  BookedInterval,
  BlockInterval,
  DayAvailability,
} from "./day-availability-core";

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
    const [bookedRows, templateRows, blockRows] = await Promise.all([
      readBookedRows(tx, { therapistId, rangeStart, rangeEnd, locationId }),
      readTemplateRows(tx, { therapistId, locationId }),
      // time_off is therapist-wide (not per location), so it is NOT filtered by
      // locationId: an absence blocks the therapist everywhere for that span.
      readBlockRows(tx, { therapistId, rangeStart, rangeEnd }),
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
      buildDay(date, templates, bookedRows, blockRows),
    );
  });
}

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

/**
 * The half-open overlap predicate shared by EVERY time_off read (W9-04).
 *
 * Extracted so the agenda's band read and the booking availability read cannot
 * drift apart: the loop's own restriction is "reuse the existing time_off read;
 * do not derive a second, divergent block source". Any new block reader must
 * compose this, never restate it.
 */
function blockOverlapsRange(rangeStart: Date, rangeEnd: Date): SQL {
  return and(lt(timeOff.startsAt, rangeEnd), gt(timeOff.endsAt, rangeStart)) as SQL;
}

const blockSelection = {
  id: timeOff.id,
  startsAt: timeOff.startsAt,
  endsAt: timeOff.endsAt,
  reason: timeOff.reason,
} as const;

/** time_off blocks overlapping the query range (half-open). Therapist-wide, so
 *  never scoped to a location — an absence blocks every clinic for that span. */
function readBlockRows(
  tx: DbTx,
  args: { therapistId: string; rangeStart: Date; rangeEnd: Date },
): Promise<BlockRow[]> {
  return tx
    .select(blockSelection)
    .from(timeOff)
    .where(and(eq(timeOff.userId, args.therapistId), blockOverlapsRange(args.rangeStart, args.rangeEnd)))
    .orderBy(asc(timeOff.startsAt));
}

/**
 * ONE therapist's time_off blocks overlapping a range, for the agenda band
 * (W9-04, CB QA item 3). Same source and same predicate as the booking
 * availability read above - only the caller differs.
 *
 * Scoped to a single therapist on purpose. `time_off` is per therapist but the
 * agenda grid has DAY columns and no therapist axis (W9-01 (f)), so a band is
 * only truthful when the agenda is showing exactly one therapist. The caller
 * enforces that; see the loop file and the owner question filed 2026-07-17.
 *
 * Runs through runScoped, so RLS scopes it to the caller's tenant.
 */
export async function listTherapistBlocks(
  ctx: RequestContext,
  args: { therapistId: string; rangeStart: Date; rangeEnd: Date },
): Promise<BlockRow[]> {
  return runScoped(ctx, (tx) => readBlockRows(tx, args));
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

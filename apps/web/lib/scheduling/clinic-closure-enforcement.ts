import "server-only";
import { eq } from "drizzle-orm";
import { locations, type DbTx } from "@osteojp/db";

import {
  classifyStart,
  latestStartMin,
  overlapsClosure,
  type ClinicHours,
  type StartVerdict,
} from "./clinic-hours";
import { lisbonMinutesFromMidnight, lisbonParts, slotLabel } from "./time";

/**
 * 0085 — THE CLINIC IS SHUT, AND NOBODY MAY PRESS PAST IT.
 *
 * ==========================================================================
 * WHY THIS IS NOT A CONFLICT, WHICH IS THE WHOLE DESIGN DECISION
 * ==========================================================================
 * Every other reason a slot is unavailable reaches the write path through
 * `collectConflicts`, INSIDE the `if (!input.allowConflict)` gate — a
 * double-booked therapist, a busy room, a `time_off` absence. All three are
 * things the clinic may deliberately override with "Guardar mesmo assim",
 * because all three are judgements about people the clinic manages.
 *
 * The owner ruled the CB closure "not blockable-around". So it is enforced
 * where AVAILABILITY is enforced: OUTSIDE that gate, beside `checkAvailability`
 * (RB-03's precedent, whose own comment says a therapist who genuinely works
 * late is expressed by extending their hours, not by pressing past the check).
 * Putting it in the conflict list would have been fewer lines and would have
 * made the ruling untrue for anybody holding the override.
 *
 * ==========================================================================
 * THE REFUSAL NAMES THE CLINIC, NOT THE THERAPIST
 * ==========================================================================
 * The reader's next action differs completely. "The therapist is away" sends
 * them to that person's blocks; "the clinic is closed" sends them to nobody,
 * because there is nothing to remove. A message naming the therapist for a
 * building-wide closure is the September outage's mistake in a new place: the
 * screen naming the wrong cause and the reader acting on it.
 */
export type ClosureVerdict =
  /** No closure at this clinic, or the window does not touch it. */
  | { ok: true }
  /** Inside the clinic's closure. `from`/`to` are Lisbon "HH:MM" so the refusal
   *  can quote the hour the building is shut rather than say "closed". */
  | { ok: false; locationName: string; from: string; to: string };

/** One clinic's hours + name, or null when the id names nothing this tenant has. */
async function readClinic(
  tx: DbTx,
  locationId: string,
): Promise<(ClinicHours & { name: string }) | null> {
  const [row] = await tx
    .select({
      name: locations.name,
      opensAt: locations.opensAt,
      closesAt: locations.closesAt,
      middayClosedFrom: locations.middayClosedFrom,
      middayClosedTo: locations.middayClosedTo,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  return row ?? null;
}

/**
 * Does this booking window run through the clinic's closure?
 *
 * ANCHORED ON THE BOOKING'S OWN LISBON DAY, like every other rule here: the
 * closure is a wall-clock fact about a calendar date, and deriving the date
 * from anything but the appointment's own start is how a booking near midnight
 * gets measured against the wrong day.
 */
export async function checkClinicClosure(
  tx: DbTx,
  args: { locationId: string; startsAt: Date; endsAt: Date },
): Promise<ClosureVerdict> {
  const clinic = await readClinic(tx, args.locationId);
  // A location the tenant does not have is not this check's refusal to make -
  // the location is validated elsewhere, and inventing a verdict here would
  // turn a missing row into "the clinic is closed".
  if (!clinic) return { ok: true };

  const date = lisbonParts(args.startsAt).date;
  if (!overlapsClosure(args.startsAt, args.endsAt, date, clinic)) return { ok: true };

  return {
    ok: false,
    locationName: clinic.name,
    from: (clinic.middayClosedFrom ?? "").slice(0, 5),
    to: (clinic.middayClosedTo ?? "").slice(0, 5),
  };
}

/**
 * AGENDA-2100 — THE BOOKING STARTS WHILE THE BUILDING IS OPEN.
 *
 * ==========================================================================
 * THIS RULE DID NOT EXIST BEFORE, AND THAT IS THE MEASUREMENT, NOT A GUESS
 * ==========================================================================
 * M2 walked every path that creates or moves an appointment. NOTHING anywhere
 * compared a booking to `opens_at` or `closes_at`: the only clinic-hours rule
 * enforced on any write path was the MIDDAY closure above. What kept bookings
 * inside the day was the THERAPIST's `availability_templates` (RB-03), which is
 * a different fact about a different subject - a therapist who works late at a
 * clinic that shuts at 20:00 was, and until this lands still is, bookable at
 * 19:45.
 *
 * ==========================================================================
 * IT SITS BESIDE THE CLOSURE, OUTSIDE THE allowConflict GATE
 * ==========================================================================
 * Same position and the same reason: the clinic's own hours are not a judgement
 * about people the clinic manages, so "Guardar mesmo assim" must not reach
 * them. The force path is unchanged BECAUSE it never reached the closure check
 * either, and this check is its neighbour rather than its exception.
 *
 * ==========================================================================
 * THE START ONLY
 * ==========================================================================
 * `classifyStart` explains why the END is not checked: there is no
 * end-after-close rule today, and this card does not invent one.
 */
export type ClinicWindowVerdict =
  | { ok: true }
  | {
      ok: false;
      /** Which half of the day the start fell outside. */
      reason: Exclude<StartVerdict, "ok">;
      locationName: string;
      /** Lisbon "HH:MM", so the refusal can quote the clinic's own hours. */
      opensAt: string;
      closesAt: string;
      /** `closes_at` minus the booking lead, already formatted. */
      latestStart: string;
    };

export async function checkClinicWindow(
  tx: DbTx,
  args: { locationId: string; startsAt: Date },
): Promise<ClinicWindowVerdict> {
  const clinic = await readClinic(tx, args.locationId);
  // Same reasoning as the closure check: a location this tenant does not have
  // is not this check's refusal to invent.
  if (!clinic) return { ok: true };

  const verdict = classifyStart(lisbonMinutesFromMidnight(args.startsAt), clinic);
  if (verdict === "ok") return { ok: true };

  return {
    ok: false,
    reason: verdict,
    locationName: clinic.name,
    opensAt: clinic.opensAt.slice(0, 5),
    closesAt: clinic.closesAt.slice(0, 5),
    latestStart: slotLabel(latestStartMin(clinic)),
  };
}

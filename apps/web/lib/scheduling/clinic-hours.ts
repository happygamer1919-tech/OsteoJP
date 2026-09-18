// Clinic opening hours and the daily closure — PURE core (no DB, no
// server-only), so every consumer computes the same window from the same
// function and the three surfaces cannot drift apart again.
//
// ==========================================================================
// THE PROBLEM THIS EXISTS FOR: THREE WORKING DAYS AND NO CLINIC
// ==========================================================================
// Before 0085 the agenda grid was bounded by DAY_START_HOUR / DAY_END_HOUR in
// ./time.ts, Nova marcação by the therapist's availability_templates, and the
// portal by the same templates expanded in SQL. Nothing recorded when a CLINIC
// opens, so there was no fact for the three to agree on - and that is why they
// could disagree with each other rather than merely be wrong together.
//
// ==========================================================================
// A CLOSURE IS NOT A BLOCK, AND THE DIFFERENCE IS ENFORCEMENT, NOT WORDING
// ==========================================================================
// `time_off` is per THERAPIST, carries no location, and is OVERRIDABLE - staff
// push past it with "Guardar mesmo assim". The owner ruled the CB closure "not
// blockable-around", so it is checked where availability is checked: OUTSIDE
// the allowConflict gate (RB-03's precedent), on both the staff and the portal
// path. Everything in this file is the shared arithmetic behind that.

import { lisbonDateTimeToUtc } from "./time";
import type { TimeInterval } from "./intervals";

/** One clinic's hours, as the columns 0085 added. */
export type ClinicHours = {
  /** Lisbon wall-clock "HH:MM" or "HH:MM:SS". */
  opensAt: string;
  closesAt: string;
  /** Both or neither - `locations_midday_pair` enforces it in the database,
   *  and every function here treats a half-set pair as NO closure rather than
   *  guessing the missing end. */
  middayClosedFrom: string | null;
  middayClosedTo: string | null;
};

/** "09:00" / "09:00:00" -> minutes since midnight. */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * AGENDA-2100 — HOW LONG BEFORE CLOSING A BOOKING MAY STILL START.
 *
 * Strategy ruling 2026-09-17: the latest start is `closes_at` minus 60 minutes,
 * on every path that creates or moves an appointment. Sixty, flat, and NOT the
 * service's own duration: the clinic's rule is about the door, not the
 * treatment, and a duration-derived latest start would give a 90-minute service
 * a different closing time from a 30-minute one at the same building.
 *
 * END-AFTER-CLOSE IS DELIBERATELY NOT A RULE HERE, because it is not one today
 * (M2: nothing anywhere compares an appointment's END to `closes_at`). A 20:00
 * start of a 90-minute service ends at 21:30 and is allowed, exactly as it is
 * allowed today. Adding that rule is a separate ruling with its own refusal
 * copy; inventing it here would refuse bookings the clinic makes now.
 */
export const BOOKING_LEAD_MIN = 60;

/** The last minute-of-day a booking may START at this clinic. */
export function latestStartMin(hours: ClinicHours): number {
  return toMinutes(hours.closesAt) - BOOKING_LEAD_MIN;
}

/** Why a start is outside the clinic's hours, or `ok`. */
export type StartVerdict = "ok" | "before_open" | "after_latest_start";

/**
 * Is this start inside the clinic's day?
 *
 * TAKES MINUTES, NOT A Date, for the same reason everything else in this file
 * is pure arithmetic: the caller owns the timezone conversion, and one function
 * doing both is a function whose test has to construct instants to assert about
 * wall-clock rules.
 *
 * BOTH ENDS ARE INCLUSIVE OF THEIR OWN BOUNDARY. A clinic opening at 09:00
 * admits an 09:00 start, and one closing at 21:00 admits a 20:00 start. The
 * boundary minute is the common case, not an edge: it is what reception books.
 */
export function classifyStart(startMinOfDay: number, hours: ClinicHours): StartVerdict {
  if (startMinOfDay < toMinutes(hours.opensAt)) return "before_open";
  if (startMinOfDay > latestStartMin(hours)) return "after_latest_start";
  return "ok";
}

/**
 * The grid's visible window for a set of clinics, in minutes from midnight.
 *
 * THE UNION, NOT THE INTERSECTION, and that is the owner's ruling rather than a
 * choice: under "Todas as localizações" the agenda must show every hour SOME
 * clinic works, because an intersection hides a real working hour of the clinic
 * that opens earlier. An empty list falls back to the widest sensible day so a
 * misconfigured tenant gets a usable grid rather than a blank one.
 */
export function gridWindow(
  hours: readonly ClinicHours[],
  /**
   * AGENDA-NEVER-HIDES — the spans of the appointments LOADED FOR THIS VIEW, in
   * minutes from midnight. Optional and empty by default, so every existing
   * caller and every existing test gets exactly the window it got before.
   */
  appointmentSpans: readonly { startMin: number; endMin: number }[] = [],
): { startMin: number; endMin: number } {
  let startMin = Infinity;
  let endMin = -Infinity;
  for (const h of hours) {
    startMin = Math.min(startMin, toMinutes(h.opensAt));
    endMin = Math.max(endMin, toMinutes(h.closesAt));
  }
  if (hours.length === 0) {
    startMin = 8 * 60;
    endMin = 20 * 60;
  }
  /**
   * AND THE APPOINTMENTS, WHICH IS THE WHOLE OF THIS FIX.
   *
   * Production, 2026-09-16: opening moved to 09:00 and an 08:00 booking at
   * Linda-a-Velha became unreachable. It was never deleted and never dropped
   * from the DOM - `makeMinToPx` CLAMPS a minute below the window to the first
   * rendered hour, so the 08:00 row was drawn at the same `top` as the 09:00
   * row and sat underneath it, and `startCountsByDay` skipped it (`idx < 0`) so
   * the hour never grew to make room. Hidden, and unclickable.
   *
   * Hours change; the appointments already booked under the old ones do not.
   * So the window is the union of what the clinics work AND what is actually on
   * the day, and an hour that only an appointment asks for is still drawn - it
   * is simply MARKED as outside the clinic's hours (see `clinicWindow` in
   * agenda-grid.tsx). The alternative, clamping, is what hid a real booking from
   * the people responsible for it.
   *
   * Rounded OUTWARD to whole hours because the grid's rows are whole hours: a
   * booking at 08:30 needs the 08:00 row drawn, and one ending at 21:30 needs
   * the 21:00 row. An end landing exactly on the hour adds nothing, which is
   * why this is `ceil` on the end rather than "floor plus one".
   */
  for (const span of appointmentSpans) {
    if (!Number.isFinite(span.startMin) || !Number.isFinite(span.endMin)) continue;
    const startHour = Math.floor(span.startMin / 60) * 60;
    startMin = Math.min(startMin, startHour);
    /**
     * THE START ALWAYS GETS ITS OWN ROW, and `startHour + 60` is what guarantees
     * it. Rows are `[startMin, endMin)` by whole hour, so an end that rounds back
     * to the start's own hour would leave the booking with no row to sit in -
     * the clamp this fix exists to remove, reappearing one level up.
     *
     * An end BEFORE its start is a midnight roll-over: `lisbonMinutesFromMidnight`
     * of 00:30 is 30, not 1470. Taking the end alone would drag the window's end
     * backwards, below the clinic's own close.
     */
    endMin = Math.max(endMin, Math.ceil(span.endMin / 60) * 60, startHour + 60);
  }
  return { startMin, endMin };
}

/**
 * The closure interval on ONE Lisbon calendar date, or null.
 *
 * EVERY DAY THE CLINIC IS OPEN, INCLUDING SATURDAY (owner, 2026-09-10). There
 * is deliberately no weekday argument: the moment this function took one, the
 * ruling would be expressible as its opposite by a caller passing the wrong
 * thing, and the column pair cannot express a per-weekday closure anyway.
 */
export function closureFor(date: string, hours: ClinicHours | null): TimeInterval | null {
  if (!hours) return null;
  const { middayClosedFrom: from, middayClosedTo: to } = hours;
  // A half-set pair is NO closure. The database refuses one; a read path that
  // guessed the missing end would be inventing a clinic's opening hours.
  if (!from || !to) return null;
  return { start: lisbonDateTimeToUtc(date, from), end: lisbonDateTimeToUtc(date, to) };
}

/**
 * Does a candidate booking window fall inside this clinic's closure?
 *
 * ANY OVERLAP COUNTS, not containment: an appointment from 13:45 to 14:45 runs
 * through the closure, and a clinic that is shut at 13:45 cannot see somebody
 * then. Same rule the blocked-slot test uses, for the same reason.
 */
export function overlapsClosure(
  startsAt: Date,
  endsAt: Date,
  date: string,
  hours: ClinicHours | null,
): boolean {
  const c = closureFor(date, hours);
  if (!c) return false;
  return c.start < endsAt && startsAt < c.end;
}

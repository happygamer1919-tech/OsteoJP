/**
 * R10 (strategy, 2026-10-25): A CLINIC CAN BE HELD OFF ONLINE BOOKING, BY
 * CONFIGURATION, WITHOUT TOUCHING ITS DATA.
 *
 * ==========================================================================
 * WHAT IT IS FOR
 * ==========================================================================
 * A clinic whose opening has moved must offer patients no online booking
 * before it opens, while reception keeps booking it by hand and its existing
 * appointments stay exactly as they are. Nothing in the data can say that on
 * its own: archiving the location also takes it off every staff screen, and
 * switching off its schedule rows changes the staff agenda too.
 *
 * ==========================================================================
 * THE SWITCH
 * ==========================================================================
 * `ONLINE_BOOKING_HELD_LOCATION_IDS`: a comma-separated list of location
 * uuids, read on every call (no restart beyond the deploy that carries a new
 * value). Unset or empty holds nothing. An entry that is not a uuid is ignored,
 * and one warning says how many were ignored (a count, never the value).
 *
 * A held location is treated exactly as a location with no bookable therapist
 * (`location-bookable.ts`): the same fragment carries the hold, so the four
 * patient-facing doors that read it (the logged-in catalogue and its write
 * guard, the public form's catalogue and its submit check) all agree, and the
 * roster, the open slots and a booking, which pass the write guard first, are
 * refused with the answer an unstaffed clinic already gets.
 *
 * Rescheduling starts from an existing appointment and never reads that
 * fragment, so it asks `isHeldLocation`: at a held clinic the options list is
 * empty and the action is refused with the same answer.
 *
 * WHAT IT DOES NOT TOUCH: the staff application (it never imports this file),
 * the reminder jobs and the sweep, existing appointments (none is moved or
 * cancelled; reception can still move one by hand), and the patient's own list
 * of appointments. Removing the value and redeploying the api undoes
 * it completely.
 */

export const ONLINE_BOOKING_HOLD_ENV = "ONLINE_BOOKING_HELD_LOCATION_IDS";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type EnvSource = Record<string, string | undefined>;

let warnedFor: string | undefined;

/** The held location ids, lower-cased and de-duplicated. Empty means no hold. */
export function heldLocationIds(env: EnvSource = process.env): string[] {
  const raw = env.ONLINE_BOOKING_HELD_LOCATION_IDS;
  if (!raw || raw.trim() === "") return [];
  const entries = raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "");
  const valid = [...new Set(entries.filter((s) => UUID.test(s)))];
  const ignored = entries.length - entries.filter((s) => UUID.test(s)).length;
  if (ignored > 0 && warnedFor !== raw) {
    warnedFor = raw;
    console.warn(`[online-booking-hold] ${ignored} entr${ignored === 1 ? "y is" : "ies are"} not a location id and ${ignored === 1 ? "was" : "were"} ignored`);
  }
  return valid;
}

/**
 * Whether one location is held. For the paths that start from an existing
 * appointment rather than from the catalogue (rescheduling): they never pass
 * the catalogue's fragment, so they ask here.
 */
export function isHeldLocation(locationId: string, env: EnvSource = process.env): boolean {
  return heldLocationIds(env).includes(locationId.toLowerCase());
}

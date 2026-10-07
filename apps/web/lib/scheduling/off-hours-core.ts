// AGENDA-OFF-HOURS - which slots the agenda marks as outside the selected
// therapist's working hours. PURE (no DB, no `server-only`, no clock), so the
// rule is unit-testable and the page, the grid and the tests share one answer.
//
// REPORTED FROM RECEPTION (2026-10-07): the agenda filtered to ONE therapist
// shades blocked time and says nothing about the hours the therapist does not
// work. A therapist who stops at 19:00 shows 19:00 to 21:00 as empty, reception
// offers the slot, and the booking is refused (`outside_availability`, RB-03).
//
// THE BAND IS THE SERVER'S OWN VERDICT, ONE SLOT AT A TIME. Each slot is turned
// into the instants the booking drawer would send and handed to
// `evaluateAvailability`, the function `checkAvailability` refuses with. Nothing
// here reads a weekday, a validity window or a split shift for itself: a second
// reading of the schedule would drift from the first, and a band that disagrees
// with the refusal is worse than no band. off-hours-core.test.ts pins the
// agreement against `checkAvailability` itself.
//
// SCOPE, THE SAME AS THE BLOCK BAND (W9-04): the grid has DAY columns and no
// therapist axis, so the caller computes this only when the agenda is scoped
// to exactly one therapist.

import { evaluateAvailability, type AvailabilityTemplate } from "./availability";
import { SLOT_MINUTES, lisbonDateTimeToUtc, slotLabel } from "./time";

/** A run of off-hours slots on one day, in minutes from Lisbon midnight. */
export type OffHoursSpan = { startMin: number; endMin: number };

/** Lisbon date ("yyyy-mm-dd") to that day's runs. A day with none has no key. */
export type OffHoursByDate = Record<string, OffHoursSpan[]>;

/** The selected therapist's schedule rows at ONE clinic. */
export type ClinicSchedule = { locationId: string; templates: AvailabilityTemplate[] };

/**
 * Group one therapist's schedule rows by clinic, keeping only `clinicIds`.
 *
 * `clinicIds` is the clinic selected in the toolbar, or every clinic the viewer
 * sees under "Todas as localizações". A row at any other clinic is dropped: it
 * says nothing about a booking this screen can lead to. Every id gets an entry,
 * a clinic with no rows included, so the caller can see it was asked about.
 */
export function schedulesByClinic(
  templates: readonly AvailabilityTemplate[],
  clinicIds: readonly string[],
): ClinicSchedule[] {
  const byClinic = new Map<string, AvailabilityTemplate[]>(clinicIds.map((id) => [id, []]));
  for (const t of templates) {
    if (t.locationId == null) continue;
    byClinic.get(t.locationId)?.push(t);
  }
  return [...byClinic.entries()].map(([locationId, rows]) => ({ locationId, templates: rows }));
}

/**
 * Is the 30-minute slot starting at `slotMin` on `date` outside the therapist's
 * working hours at every clinic in `clinics` that has hours for them?
 *
 * ONE CLINIC: true exactly when `checkAvailability` would refuse a booking of
 * that slot there, i.e. `configured && !covered`.
 *
 * NO HOURS CONFIGURED IS NEVER SHADED. `evaluateAvailability` answers
 * `configured: false` for a therapist with no active row at a clinic, and the
 * enforcement then refuses nothing (availability is opt-in per therapist and
 * clinic). A clinic like that contributes no working window and no shading; a
 * therapist with no hours at any of the clinics is not shaded at all.
 *
 * SEVERAL CLINICS ("Todas as localizações"): the slot is shaded only when the
 * therapist works at NONE of them then. It is evaluated clinic by clinic and
 * not on the merged rows, because two clinics' windows that merely touch
 * (09:00 to 09:15 at one, 09:15 to 09:30 at the other) cover no booking at
 * either, and a merged reading would call that slot worked.
 */
export function isSlotOffHours(
  date: string,
  slotMin: number,
  clinics: readonly ClinicSchedule[],
): boolean {
  // The same conversion the booking form uses for a typed time, so the instant
  // tested is the instant that would be written - DST days included.
  const startsAt = lisbonDateTimeToUtc(date, slotLabel(slotMin));
  const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000);
  let enforcedSomewhere = false;
  for (const clinic of clinics) {
    const verdict = evaluateAvailability(startsAt, endsAt, clinic.templates);
    if (!verdict.configured) continue;
    if (verdict.covered) return false;
    enforcedSomewhere = true;
  }
  return enforcedSomewhere;
}

/**
 * Merge the slots `isOff` accepts into runs of consecutive slots.
 *
 * `slots` is the grid's own ascending list of slot starts (`daySlots`). Two
 * slots join only when the second starts where the first ends, so a run never
 * bridges a slot the predicate rejected.
 */
export function spansOfSlots(
  slots: readonly number[],
  isOff: (slotMin: number) => boolean,
): OffHoursSpan[] {
  const spans: OffHoursSpan[] = [];
  for (const m of slots) {
    if (!isOff(m)) continue;
    const last = spans[spans.length - 1];
    if (last && last.endMin === m) last.endMin = m + SLOT_MINUTES;
    else spans.push({ startMin: m, endMin: m + SLOT_MINUTES });
  }
  return spans;
}

/** Does the slot starting at `slotMin` begin inside one of the runs? */
export function isSlotInSpans(slotMin: number, spans: readonly OffHoursSpan[]): boolean {
  return spans.some((sp) => sp.startMin <= slotMin && slotMin < sp.endMin);
}

/**
 * The off-hours runs for every date in view, over the slots the grid draws.
 *
 * `slots` must be the list the grid is drawn with (`daySlots` of the same
 * window), so a run's edges are slot edges and `isSlotInSpans` gives back
 * exactly the slots that were tested.
 */
export function offHoursByDate(input: {
  dates: readonly string[];
  slots: readonly number[];
  clinics: readonly ClinicSchedule[];
}): OffHoursByDate {
  // Only the clinics that enforce anything for this therapist. With none, no
  // slot can be refused and there is nothing to compute.
  const enforcing = input.clinics.filter((c) => c.templates.some((t) => t.isActive));
  const out: OffHoursByDate = {};
  if (enforcing.length === 0) return out;
  for (const date of input.dates) {
    const spans = spansOfSlots(input.slots, (m) => isSlotOffHours(date, m, enforcing));
    if (spans.length > 0) out[date] = spans;
  }
  return out;
}

// W13-A — split-shift availability. The loader half.
//
// A split shift is a therapist working 08:00-13:00 and 14:00-19:00 on one day,
// with the gap between them outside working hours and therefore unbookable.
//
// NO SCHEMA CHANGE WAS NEEDED and this file is why. `availability_templates` is
// already row-per-period, its dedupe constraint covers the times so two rows per
// weekday are legal, and the slot engine already merges a plural
// `working: TimeInterval[]` (apps/web/lib/scheduling/day-availability-core.ts).
// The only thing standing between the clinic and a split shift was the EDITOR,
// which collapsed each weekday to its first template and discarded the rest.
//
// THIS IS EXTRACTED RATHER THAN EDITED IN TWO PLACES. The identical collapsing
// loop existed in app/admin/staff/page.tsx AND app/horarios/page.tsx, feeding two
// editors that share one `ScheduleDay` type. Teaching one to load a second period
// and not the other would have produced the worst available failure: reception
// saves a split shift, admin's loader drops it, and the row is archived on the
// next admin save. One loader cannot drift from itself.
//
// THE W4-14 MULTI-SHIFT SAFETY PROPERTY IS PRESERVED EXACTLY, and it is the
// subtle part. `saveTherapistScheduleAction` documents it: "the modal tracks
// exactly ONE template id per weekday, so a reconcile only ever archives/updates
// the id it manages. A therapist's second active template on the same weekday
// (DIFFERENT LOCATION) is never surfaced and never touched." That guarantee is
// about a second LOCATION, not about a second PERIOD, so period 2 is admitted
// only when it sits at the SAME location as period 1. A different-location row
// stays invisible and untouched, exactly as before.

/** The subset of an availability template this loader reads. */
export type ScheduleTemplate = {
  id: string;
  userId: string;
  locationId: string;
  weekday: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

/** One weekday's row in the schedule editor. Mirrors the W4-14 reconcile shape,
 * now with an OPTIONAL second period. */
export type ScheduleDayRow = {
  weekday: number;
  label: string;
  /** True when the member works this day (an active template exists). */
  on: boolean;
  /** The active template id period 1 manages, or "" for a new day. */
  id: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  locationId: string;
  /** True when a second period exists for this weekday at the same location. */
  p2On: boolean;
  /** The active template id period 2 manages, or "" when there is none. */
  p2Id: string;
  p2Start: string; // "HH:mm"
  p2End: string; // "HH:mm"
};

/** Defaults for a day that has no template yet. Unchanged from before. */
const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

/** Suggested afternoon window when an admin adds a second period to a day that
 * has none. Never persisted until they save; it exists so the two time fields
 * do not open empty. */
const DEFAULT_P2_START = "14:00";
const DEFAULT_P2_END = "19:00";

/**
 * Index active templates by member and weekday, keeping AT MOST TWO per day.
 *
 * Callers pass templates already ordered by start_time (both call sites read
 * through `listAvailabilityTemplates`, which orders by name, weekday, then
 * start_time), so the first is the morning period and the second the afternoon.
 * The order is asserted rather than assumed: a template that starts before the
 * one already held would be a loader bug, so it is sorted here too and the sort
 * is a no-op on correctly ordered input.
 */
export function indexScheduleTemplates(
  templates: readonly ScheduleTemplate[],
): Map<string, ScheduleTemplate[]> {
  const byKey = new Map<string, ScheduleTemplate[]>();
  for (const tpl of templates) {
    const key = `${tpl.userId}:${tpl.weekday}`;
    const held = byKey.get(key);
    if (!held) {
      byKey.set(key, [tpl]);
      continue;
    }
    // Two periods, one location. A row at a DIFFERENT location is a separate
    // W4-14 multi-shift arrangement this editor has never surfaced and must not
    // start surfacing, or a save here would rewrite its location.
    if (held.length >= 2 || tpl.locationId !== held[0]!.locationId) continue;
    held.push(tpl);
    held.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return byKey;
}

/**
 * Build the seven editor rows for one member.
 *
 * `labels[weekday]` supplies the pt-PT day name; `order` is the weekday order the
 * surface renders in (both call sites pass their own WEEKDAY_ORDER unchanged).
 */
export function buildScheduleDays(
  byKey: Map<string, ScheduleTemplate[]>,
  memberId: string,
  order: readonly number[],
  labels: (weekday: number) => string,
): ScheduleDayRow[] {
  return order.map((wd) => {
    const held = byKey.get(`${memberId}:${wd}`) ?? [];
    const p1 = held[0];
    const p2 = held[1];
    return {
      weekday: wd,
      label: labels(wd),
      on: p1 != null,
      id: p1?.id ?? "",
      start: p1?.startTime ?? DEFAULT_START,
      end: p1?.endTime ?? DEFAULT_END,
      locationId: p1?.locationId ?? "",
      p2On: p2 != null,
      p2Id: p2?.id ?? "",
      p2Start: p2?.startTime ?? DEFAULT_P2_START,
      p2End: p2?.endTime ?? DEFAULT_P2_END,
    };
  });
}

/**
 * Is this day's pair of periods internally consistent? Returns a reason key, or
 * null when the day is fine.
 *
 * IT LIVES HERE, WITH THE LOADER, because the client editor imports it and this
 * module has no server-only dependency.
 *
 * TIME-ONLY AND ORDER-ONLY, on purpose. It answers the one question the write
 * paths cannot: whether the SECOND period sits after the first. Everything else
 * about a template — that it ends after it starts, that it does not overlap a
 * sibling, that its location is active — is already refused in
 * lib/admin/availability.ts, and restating those here would create a second
 * opinion that can drift from the first.
 */
export function scheduleDayError(
  p1Start: string,
  p1End: string,
  p2Start: string,
  p2End: string,
): "p2_before_p1" | "p2_end_before_start" | null {
  if (p2End <= p2Start) return "p2_end_before_start";
  // At or after: touching windows (13:00-13:00) are legal and mean a continuous
  // day expressed as two rows. Overlap is what is refused.
  if (p2Start < p1End) return "p2_before_p1";
  return null;
}


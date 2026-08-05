// W13-A — split-shift availability. The save half.
//
// The W4-14 reconcile, widened from one period per weekday to two. For each
// weekday 0..6 the form submits, per period:
//   d{wd}_on / d{wd}_id / d{wd}_start / d{wd}_end / d{wd}_location   (period 1)
//   d{wd}p2_on / d{wd}p2_id / d{wd}p2_start / d{wd}p2_end            (period 2)
// and the rules are unchanged per period: enabled+id -> update, enabled+no id ->
// create, disabled+id -> archive.
//
// PERIOD 2 POSTS NO LOCATION OF ITS OWN. It reuses period 1's, because the card
// scopes a split shift to one therapist-day-LOCATION and because the loader only
// ever pairs two templates that already share a location
// (lib/admin/schedule-days.ts). A period-2 location select would let one save
// move an afternoon to another clinic while the morning stayed, which is a
// different feature with different consequences for the agenda.
//
// SHARED BY BOTH SERVER ACTIONS, deliberately. app/admin/working-hours/actions.ts
// and app/horarios/actions.ts held two copies of this loop that differed only in
// where they redirect. Teaching one about period 2 and not the other would have
// meant the reception surface archiving a split shift that the admin surface had
// just saved.
//
// WHAT IT DOES NOT DO: validate, and that is not a gap. Every rule that matters
// is already refused inside the write paths this calls
// (lib/admin/availability.ts): `validate` rejects end <= start, `assertNoOverlap`
// rejects an overlapping active sibling for the same therapist + weekday +
// location, and the capability plus own-location scope are checked there too. A
// period 2 that overlaps period 1 is exactly such a sibling, so a crafted POST
// that skipped the browser is refused by the same check that has always guarded
// this table. `scheduleDayError` (lib/admin/schedule-days.ts) exists to say so in
// the form, BEFORE the round trip, next to the field a person can correct — not
// as a second opinion that could drift from the first.

import type { AvailabilityTemplateInput } from "./availability";

/** The three write paths the reconcile drives, injected so this module stays
 * free of the request context and is testable without a database. */
export type ScheduleWrites = {
  create(input: AvailabilityTemplateInput): Promise<void>;
  update(id: string, input: AvailabilityTemplateInput): Promise<void>;
  archive(id: string): Promise<void>;
};

/** Just the fields the reconcile reads. `FormData` satisfies it. */
export type FieldSource = { get(name: string): unknown };

const str = (fd: FieldSource, name: string): string => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/**
 * Reconcile one weekday. Exported for tests; `reconcileWeek` drives all seven.
 *
 * ARCHIVES RUN BEFORE WRITES, and that ordering is load-bearing rather than
 * tidy. Removing the afternoon and widening the morning to cover the whole day
 * is the obvious edit, and doing it the other way round makes the morning's
 * UPDATE overlap an afternoon row that is still active — the write path refuses
 * it with "overlapping template", and the admin sees an error for a schedule
 * that is perfectly legal.
 */
export async function reconcileDay(
  fd: FieldSource,
  wd: number,
  userId: string,
  writes: ScheduleWrites,
): Promise<void> {
  const on = fd.get(`d${wd}_on`) != null;
  const id = str(fd, `d${wd}_id`);
  const locationId = str(fd, `d${wd}_location`);

  const p2On = on && fd.get(`d${wd}p2_on`) != null;
  const p2Id = str(fd, `d${wd}p2_id`);

  // 1. Archive what is going away. A day turned off takes BOTH its periods with
  //    it: leaving period 2 active would make the therapist bookable on a day
  //    the admin just marked as not worked, which is the failure with the worst
  //    consequences here.
  if (!p2On && p2Id) await writes.archive(p2Id);
  if (!on && id) await writes.archive(id);
  if (!on) return;

  // 2. Then the writes, period 1 first so the ids stay in start-time order.
  const p1: AvailabilityTemplateInput = {
    userId,
    locationId,
    weekday: wd,
    startTime: str(fd, `d${wd}_start`),
    endTime: str(fd, `d${wd}_end`),
  };
  if (id) await writes.update(id, p1);
  else await writes.create(p1);

  if (!p2On) return;

  const p2: AvailabilityTemplateInput = {
    userId,
    // Period 1's location, never a field of its own. See the header.
    locationId,
    weekday: wd,
    startTime: str(fd, `d${wd}p2_start`),
    endTime: str(fd, `d${wd}p2_end`),
  };
  if (p2Id) await writes.update(p2Id, p2);
  else await writes.create(p2);
}

/** The whole week, in weekday order. */
export async function reconcileWeek(
  fd: FieldSource,
  userId: string,
  writes: ScheduleWrites,
): Promise<void> {
  for (let wd = 0; wd < 7; wd++) {
    await reconcileDay(fd, wd, userId, writes);
  }
}

"use client";

import type { ScheduleDayRow } from "@/lib/admin/schedule-days";
import { ScheduleWeekFields } from "@/app/admin/staff/ScheduleWeekFields";
import { saveScheduleAction } from "./actions";

/**
 * PL-09 Phase 5 — the weekly working-hours editor for ONE therapist, on the
 * reception surface. Same W4-14 reconcile shape as the admin Equipa editor (per
 * weekday: on/off + start + end + location, one Guardar), but posts to
 * saveScheduleAction, which redirects back to /horarios. Toggling a day off +
 * Guardar archives it (no password — schedule:manage-gated surface).
 *
 * W13-A: the seven day rows moved into ScheduleWeekFields, shared with the
 * Equipa modal. They were two copies of the same markup, and split shifts made
 * the duplication dangerous rather than merely repetitive: a second period the
 * Equipa editor could save and this one could not would be archived the next
 * time reception pressed Guardar.
 */
export function WeekScheduleEditor({
  userId,
  days,
  locations,
}: {
  userId: string;
  days: ScheduleDayRow[];
  locations: { id: string; name: string }[];
}) {
  return (
    <form action={saveScheduleAction} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <ScheduleWeekFields days={days} locations={locations} />
    </form>
  );
}

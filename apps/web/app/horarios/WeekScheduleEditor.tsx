"use client";

import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { adminInputInline, adminLabel } from "@/app/admin/admin-ui";
import type { ScheduleDay } from "@/app/admin/staff/StaffManageModal";
import { saveScheduleAction } from "./actions";

/**
 * PL-09 Phase 5 — the weekly working-hours editor for ONE therapist, on the
 * reception surface. Same W4-14 reconcile shape as the admin Equipa editor (per
 * weekday: on/off + start + end + location, one Guardar), but posts to
 * saveScheduleAction, which redirects back to /horarios. Toggling a day off +
 * Guardar archives it (no password — schedule:manage-gated surface).
 */
export function WeekScheduleEditor({
  userId,
  days,
  locations,
}: {
  userId: string;
  days: ScheduleDay[];
  locations: { id: string; name: string }[];
}) {
  const fallbackLocation = locations[0]?.id ?? "";
  return (
    <form action={saveScheduleAction} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      {days.map((d) => (
        <fieldset
          key={d.weekday}
          className="flex flex-wrap items-end gap-3 rounded-v2 border border-v2-border p-3"
        >
          <label className="flex min-w-32 items-center gap-2 self-center">
            <input
              type="checkbox"
              name={`d${d.weekday}_on`}
              defaultChecked={d.on}
              aria-label={`${s["admin.workingHours.worksLabel"]} — ${d.label}`}
            />
            <span className="font-medium text-v2-text-primary">{d.label}</span>
          </label>
          <input type="hidden" name={`d${d.weekday}_id`} value={d.id} />
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.start"]}</span>
            <TimeFieldInput name={`d${d.weekday}_start`} defaultValue={d.start} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.end"]}</span>
            <TimeFieldInput name={`d${d.weekday}_end`} defaultValue={d.end} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.location"]}</span>
            <select
              name={`d${d.weekday}_location`}
              defaultValue={d.locationId || fallbackLocation}
              aria-label={`${s["admin.workingHours.location"]} — ${d.label}`}
              className={adminInputInline}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ))}
      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          {s["common.save"]}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { adminInputInline, adminLabel } from "@/app/admin/admin-ui";
import { scheduleDayError, type ScheduleDayRow } from "@/lib/admin/schedule-days";

/**
 * W13-A — the seven weekday rows of the schedule editor, with an OPTIONAL second
 * period per day. Shared by the Equipa modal and the reception /horarios editor,
 * which rendered two copies of this markup before.
 *
 * THE SECOND PERIOD IS ABSENT, NOT EMPTY-AND-HIDDEN. A therapist who works one
 * continuous block sees exactly the row they saw before: same height, same
 * fields, one extra text button. Seven days times a permanently rendered second
 * period would have doubled the height of every schedule to serve the minority
 * of days that are split.
 *
 * VALIDATION HARD-BLOCKS THIS FORM, and only this form. Guardar is disabled
 * while any day's second period starts before the first one ends, with the
 * reason printed on the offending day. That is a deliberate exception to the
 * standing rule that availability warnings never block a save: the rule is about
 * APPOINTMENT saves, where a warning must never stop the clinic booking a
 * patient. This is schedule DATA INTEGRITY - two overlapping periods are not a
 * warning about reality, they are a contradiction the write path would refuse
 * anyway, with a worse message and a round trip.
 *
 * THE STATE IS THE FORM. Times are controlled here rather than left to
 * TimeFieldInput's own state, because the comparison needs both periods' values
 * in one place. Everything still posts through the same hidden inputs, so the
 * server action's contract is unchanged.
 */

type DayState = {
  on: boolean;
  start: string;
  end: string;
  p2On: boolean;
  p2Start: string;
  p2End: string;
};

const ERROR_KEY = {
  p2_before_p1: "admin.workingHours.period2AfterFirst",
  p2_end_before_start: "admin.workingHours.period2EndAfterStart",
} as const;

export function ScheduleWeekFields({
  days,
  locations,
}: {
  days: ScheduleDayRow[];
  locations: { id: string; name: string }[];
}) {
  const fallbackLocation = locations[0]?.id ?? "";
  const initial = (): Record<number, DayState> =>
    Object.fromEntries(
      days.map((d) => [
        d.weekday,
        { on: d.on, start: d.start, end: d.end, p2On: d.p2On, p2Start: d.p2Start, p2End: d.p2End },
      ]),
    );
  const [state, setState] = useState<Record<number, DayState>>(initial);

  // RESYNC WHEN THE LOADED SCHEDULE CHANGES. A server action here redirects
  // rather than returning, and React can keep this component mounted across that
  // navigation — which would leave the editor showing the state it had BEFORE
  // the save while the page below it shows the saved truth. The times were
  // uncontrolled before W13-A, so this hazard arrived with the controlled
  // fields; it is closed here rather than left for someone to notice on a
  // Monday. The signature covers every value the editor can change, so an
  // unrelated re-render does not reset a half-finished edit.
  const signature = days
    .map((d) => `${d.id}|${d.on}|${d.start}|${d.end}|${d.p2Id}|${d.p2On}|${d.p2Start}|${d.p2End}`)
    .join("~");
  const [loadedSignature, setLoadedSignature] = useState(signature);
  if (loadedSignature !== signature) {
    setLoadedSignature(signature);
    setState(initial());
  }

  const patch = (weekday: number, next: Partial<DayState>) =>
    setState((prev) => ({ ...prev, [weekday]: { ...prev[weekday]!, ...next } }));

  const errorFor = (weekday: number): string | null => {
    const d = state[weekday]!;
    // A day that is off, or has no second period, has nothing to contradict.
    if (!d.on || !d.p2On) return null;
    const reason = scheduleDayError(d.start, d.end, d.p2Start, d.p2End);
    return reason ? s[ERROR_KEY[reason]] : null;
  };

  const blocked = days.some((d) => errorFor(d.weekday) != null);

  return (
    <>
      {days.map((d) => {
        const day = state[d.weekday]!;
        const error = errorFor(d.weekday);
        return (
          <fieldset
            key={d.weekday}
            className="flex flex-col gap-2 rounded-v2 border border-v2-border p-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-32 items-center gap-2 self-center">
                <input
                  type="checkbox"
                  name={`d${d.weekday}_on`}
                  checked={day.on}
                  onChange={(e) => patch(d.weekday, { on: e.target.checked })}
                  aria-label={`${s["admin.workingHours.worksLabel"]} — ${d.label}`}
                />
                <span className="font-medium text-v2-text-primary">{d.label}</span>
              </label>
              <input type="hidden" name={`d${d.weekday}_id`} value={d.id} />
              {/* PERIOD 2'S ID IS POSTED UNCONDITIONALLY, and that is the whole
                  mechanism for REMOVING a period rather than an oversight. The
                  reconcile archives `d{wd}p2_id` precisely when `d{wd}p2_on` is
                  absent, so an id that disappeared with the fields could never be
                  archived: the admin would remove the afternoon, save, and find
                  it still there — the same save-then-vanish failure as dropping
                  a saved period, running the other way. */}
              <input type="hidden" name={`d${d.weekday}p2_id`} value={d.p2Id} />
              <label className="flex flex-col gap-1">
                <span className={adminLabel}>{s["admin.workingHours.start"]}</span>
                <TimeFieldInput
                  name={`d${d.weekday}_start`}
                  value={day.start}
                  onChange={(v) => patch(d.weekday, { start: v })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={adminLabel}>{s["admin.workingHours.end"]}</span>
                <TimeFieldInput
                  name={`d${d.weekday}_end`}
                  value={day.end}
                  onChange={(v) => patch(d.weekday, { end: v })}
                />
              </label>
              {/* PL-14: one clinic = no per-day choice; the value still posts,
                  the select disappears. Period 2 has no select of its own — it
                  inherits this one, by design (schedule-reconcile.ts). */}
              {locations.length === 1 ? (
                <input
                  type="hidden"
                  name={`d${d.weekday}_location`}
                  value={d.locationId || fallbackLocation}
                />
              ) : (
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
              )}
              {/* The add affordance sits on the FIRST row so a one-period day
                  gains a text button, not a second row of controls. */}
              {day.on && !day.p2On && (
                <button
                  type="button"
                  onClick={() => patch(d.weekday, { p2On: true })}
                  className="min-h-11 rounded px-2 text-sm text-v2-text-secondary underline-offset-2 transition hover:text-v2-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {`+ ${s["admin.workingHours.period2Add"]}`}
                </button>
              )}
            </div>

            {day.on && day.p2On && (
              <div className="flex flex-wrap items-end gap-3 border-t border-v2-border pt-2">
                <span className={`${adminLabel} min-w-32 self-center`}>
                  {s["admin.workingHours.period2"]}
                </span>
                {/* Posted ONLY while the period is shown. Its absence is what
                    tells the reconcile to archive the id above. */}
                <input type="hidden" name={`d${d.weekday}p2_on`} value="on" />
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{s["admin.workingHours.start"]}</span>
                  <TimeFieldInput
                    name={`d${d.weekday}p2_start`}
                    value={day.p2Start}
                    onChange={(v) => patch(d.weekday, { p2Start: v })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{s["admin.workingHours.end"]}</span>
                  <TimeFieldInput
                    name={`d${d.weekday}p2_end`}
                    value={day.p2End}
                    onChange={(v) => patch(d.weekday, { p2End: v })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => patch(d.weekday, { p2On: false })}
                  className="min-h-11 rounded px-2 text-sm text-v2-text-secondary underline-offset-2 transition hover:text-v2-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {s["admin.workingHours.period2Remove"]}
                </button>
              </div>
            )}

            {/* Named by the field it describes, and not colour-only. */}
            {error && (
              <p role="alert" className="text-sm text-v2-danger-text">
                {error}
              </p>
            )}
          </fieldset>
        );
      })}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={blocked}>
          {s["common.save"]}
        </Button>
      </div>
    </>
  );
}

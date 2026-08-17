"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Dialog, Select } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { addDays } from "@/lib/scheduling/time";
import { applyDayByDayScheduleAction } from "./actions";

/**
 * SCHED-04 (ITEM B) - the day-by-day schedule editor for ONE therapist.
 *
 * THE GRID SHOWS EVERY DATE IN THE WINDOW, WEEKENDS INCLUDED, AND THAT IS THE
 * DESIGN RATHER THAN A LAYOUT CHOICE. Inside the window this grid is the
 * therapist's whole schedule: a day left unticked is a day not worked, not a day
 * left alone. That is forced by the row model - a weekly template has no
 * exception list, so the ordinary week cannot survive alongside dated work on
 * the same weekday without putting the therapist at two clinics at once. Since
 * the semantics are unavoidable, the screen has to SHOW them: every date is a
 * row, and an unticked row is a visible statement.
 *
 * SHAPED LIKE AlternatingWeeksPanel ON PURPOSE - same two props, no opinion
 * about who is looking, status inline rather than through a toast (there is no
 * ToastProvider on /horarios and calling useToast here reproduced STAFF-05's
 * black error page once already).
 *
 * THE REFUSAL IS THE INTERESTING PART OF THIS COMPONENT. A save that lands on
 * dates that already carry dated work does NOT overwrite them: the server
 * refuses, returns those dates, and they are listed here. Replacing them is a
 * SECOND action the person takes with the dates in front of them, and it
 * supersedes the old rows rather than rewriting their bounds.
 */

type LocationOption = { id: string; name: string };

type DayState = {
  on: boolean;
  locationId: string;
  startTime: string;
  endTime: string;
};

const WEEKDAY_KEYS = [
  "admin.workingHours.sun",
  "admin.workingHours.mon",
  "admin.workingHours.tue",
  "admin.workingHours.wed",
  "admin.workingHours.thu",
  "admin.workingHours.fri",
  "admin.workingHours.sat",
] as const;

/** R-SCHED-1's horizon, mirrored from the server so the refusal is not the
 *  first time somebody hears about it. The server still enforces it. */
const MAX_HORIZON_DAYS = 100;

/** Every date from `from` to `to` inclusive. Empty if the range is backwards or
 *  longer than the horizon - both are refused before this is called. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > MAX_HORIZON_DAYS + 1) break; // never render an unbounded list
  }
  return out;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** "seg, 07/09" - the weekday first, because the person is thinking in weekdays
 *  even when the dates do not follow one. */
function dayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${s[WEEKDAY_KEYS[weekdayOf(date)]!]}, ${d}/${m}`;
}

export function DayByDayPanel({
  therapistId,
  therapistName,
  locations,
}: {
  therapistId: string;
  therapistName: string;
  locations: LocationOption[];
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState<Record<string, DayState>>({});
  const [affected, setAffected] = useState<{ id: string; label: string }[] | null>(null);
  const [collisions, setCollisions] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // A therapist with no clinic assigned has nothing to choose between, so the
  // entry point is not rendered rather than rendered and refused.
  const hasLocations = locations.length > 0;

  const rangeOk =
    startDate !== "" &&
    endDate !== "" &&
    endDate >= startDate &&
    endDate <= addDays(startDate, MAX_HORIZON_DAYS);

  const dates = useMemo(
    () => (rangeOk ? datesBetween(startDate, endDate) : []),
    [rangeOk, startDate, endDate],
  );

  const dayState = (date: string): DayState =>
    days[date] ?? {
      on: false,
      locationId: locations[0]?.id ?? "",
      startTime: "09:00",
      endTime: "17:00",
    };

  const setDay = (date: string, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [date]: { ...dayState(date), ...patch } }));

  const entries = dates
    .map((date) => ({ date, st: dayState(date) }))
    .filter(({ st }) => st.on && st.locationId !== "" && st.endTime > st.startTime)
    .map(({ date, st }) => ({
      date,
      locationId: st.locationId,
      startTime: st.startTime,
      endTime: st.endTime,
    }));

  const canSave = !busy && rangeOk && entries.length > 0;

  const submit = async (replace: boolean) => {
    setBusy(true);
    const res = await applyDayByDayScheduleAction({
      userId: therapistId,
      startDate,
      endDate,
      entries,
      replace,
    });
    setBusy(false);
    if (!res.ok) {
      // THE REFUSAL PATH. A collision is not a failure to be apologised for, it
      // is an answer: these dates already have a schedule, here they are, and
      // nothing has been touched.
      if (res.collisionDates && res.collisionDates.length > 0) {
        setCollisions(res.collisionDates);
        setStatus(null);
        return;
      }
      setCollisions(null);
      setStatus({ tone: "err", text: s["schedule.gridError"] });
      return;
    }
    setCollisions(null);
    setStatus({
      tone: "ok",
      text: replace ? s["schedule.windowReplaced"] : s["schedule.gridSaved"],
    });
    // Kept on screen rather than toasted: a toast disappears, and these are
    // appointments somebody has to act on.
    setAffected(res.affected ?? []);
    startTransition(() => {});
  };

  if (!hasLocations) return null;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="day-grid-open">
        {s["schedule.gridOpen"]}
      </Button>

      {open && (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            setAffected(null);
            setCollisions(null);
            setStatus(null);
          }}
          title={`${s["schedule.gridTitle"]} · ${therapistName}`}
          cancelLabel={s["common.close"]}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-v2-text-secondary">{s["schedule.gridHelp"]}</p>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["schedule.altFrom"]}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="day-grid-from"
                  className="rounded-v2 border border-v2-border px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["schedule.altTo"]}</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="day-grid-to"
                  className="rounded-v2 border border-v2-border px-2 py-1"
                />
              </label>
            </div>

            {dates.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">{s["schedule.gridDays"]}</legend>
                <div
                  className="flex max-h-80 flex-col gap-1 overflow-y-auto"
                  data-testid="day-grid-days"
                >
                  {dates.map((date) => {
                    const st = dayState(date);
                    return (
                      <div
                        key={date}
                        className="flex flex-wrap items-center gap-2 rounded-v2 border border-v2-border px-2 py-1"
                        data-testid={`day-grid-row-${date}`}
                      >
                        <label className="flex min-w-36 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={st.on}
                            onChange={() => setDay(date, { on: !st.on })}
                            aria-label={`${s["schedule.gridWorking"]} ${date}`}
                          />
                          <span>{dayLabel(date)}</span>
                        </label>
                        {st.on && (
                          <>
                            <Select
                              value={st.locationId}
                              onChange={(e) => setDay(date, { locationId: e.target.value })}
                              aria-label={`${s["schedule.gridClinic"]} ${date}`}
                            >
                              {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </Select>
                            <TimeFieldInput
                              name={`gridStart-${date}`}
                              value={st.startTime}
                              onChange={(v) => setDay(date, { startTime: v })}
                            />
                            <TimeFieldInput
                              name={`gridEnd-${date}`}
                              value={st.endTime}
                              onChange={(v) => setDay(date, { endTime: v })}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <Button onClick={() => submit(false)} disabled={!canSave} data-testid="day-grid-save">
              {s["common.save"]}
            </Button>

            {rangeOk && entries.length === 0 && (
              <p className="text-xs text-v2-text-secondary">{s["schedule.gridEmpty"]}</p>
            )}

            {status && (
              <p
                role="status"
                data-testid="day-grid-status"
                className={
                  status.tone === "ok"
                    ? "rounded-v2 border border-v2-border bg-v2-surface px-3 py-2 text-sm text-v2-text-primary"
                    : "rounded-v2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                }
              >
                {status.text}
              </p>
            )}

            {collisions && collisions.length > 0 && (
              <div
                role="status"
                data-testid="day-grid-collision"
                className="flex flex-col gap-2 rounded-v2 border border-v2-border bg-v2-surface p-3"
              >
                <p className="text-sm text-v2-text-primary">{s["schedule.windowCollision"]}</p>
                {/* NAMED, NEVER COUNTED. "3 dates conflict" is not something a
                    person can check; a list of dates is. */}
                <ul className="list-disc pl-5 text-sm text-v2-text-secondary">
                  {collisions.map((d) => (
                    <li key={d}>{dayLabel(d)}</li>
                  ))}
                </ul>
                <p className="text-xs text-v2-text-secondary">
                  {s["schedule.windowReplaceHelp"]}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => submit(true)}
                  disabled={busy}
                  data-testid="day-grid-replace"
                >
                  {s["schedule.windowReplace"]}
                </Button>
              </div>
            )}

            {affected && affected.length > 0 && (
              <div className="flex flex-col gap-1 rounded-v2 border border-v2-border p-3">
                <p className="text-sm text-v2-text-primary">{s["schedule.altAffected"]}</p>
                <ul className="list-disc pl-5 text-sm text-v2-text-secondary">
                  {affected.map((a) => (
                    <li key={a.id}>{a.label}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}

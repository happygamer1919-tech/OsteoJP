"use client";

import { useState, useTransition } from "react";
import { Button, Dialog, Select, useToast } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { applyAlternatingWeeksAction } from "./actions";

/**
 * ITEM 5 - the alternating-week editor for ONE therapist.
 *
 * SHAPED SO THE THERAPIST SELF-VIEW CAN BE ADDED WITHOUT REWORK, per the ruling.
 * The component takes `therapistId` and `locations` and holds no opinion about
 * WHO is looking: the sidebar question (should a therapist reach /horarios at
 * all - LE-therapist-horarios-nav, pending) is answered by whoever renders this,
 * not here. Mounting it on a future self-view is passing the same two props.
 *
 * THE AFFECTED-APPOINTMENTS LIST IS A RESULT, NOT A BLOCKER. PL-11 makes
 * availability advisory and Q-W5-4 forbids destroying scheduling data, so the
 * save succeeds and the overlapping appointments are listed for a human to move.
 * Refusing instead would leave reception unable to record that the therapist is
 * at the other clinic that week, which is true whether or not the system likes
 * it.
 */

type LocationOption = { id: string; name: string };

const WEEKDAY_KEYS = [
  "admin.workingHours.mon",
  "admin.workingHours.tue",
  "admin.workingHours.wed",
  "admin.workingHours.thu",
  "admin.workingHours.fri",
  "admin.workingHours.sat",
] as const;
/** Clinical week order, matching the schedule editor above it. */
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6] as const;

export function AlternatingWeeksPanel({
  therapistId,
  therapistName,
  locations,
}: {
  therapistId: string;
  therapistName: string;
  locations: LocationOption[];
}) {
  const showToast = useToast();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [locationAId, setLocationAId] = useState(locations[0]?.id ?? "");
  const [locationBId, setLocationBId] = useState(locations[1]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [affected, setAffected] = useState<{ id: string; label: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  // TWO CLINICS ARE REQUIRED and the control says so by existing: with one
  // location the pattern is meaningless, so the entry point is not offered.
  if (locations.length < 2) return null;

  const toggle = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const canSave =
    !busy &&
    weekdays.length > 0 &&
    startDate !== "" &&
    endDate !== "" &&
    endDate >= startDate &&
    locationAId !== "" &&
    locationBId !== "" &&
    locationAId !== locationBId &&
    endTime > startTime;

  const submit = async () => {
    setBusy(true);
    const res = await applyAlternatingWeeksAction({
      userId: therapistId,
      weekdays,
      startDate,
      endDate,
      locationAId,
      locationBId,
      startTime,
      endTime,
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", message: s["schedule.altError"] });
      return;
    }
    showToast({ tone: "success", message: s["schedule.altSaved"] });
    // The list is kept on screen rather than toasted: a toast disappears, and
    // these are appointments somebody has to act on.
    setAffected(res.affected ?? []);
    if ((res.affected ?? []).length === 0) setOpen(false);
    startTransition(() => {});
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="alt-weeks-open">
        {s["schedule.altOpen"]}
      </Button>

      {open && (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            setAffected(null);
          }}
          title={`${s["schedule.altTitle"]} · ${therapistName}`}
          cancelLabel={s["common.close"]}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-v2-text-secondary">{s["schedule.altHelp"]}</p>

            <fieldset className="flex flex-wrap gap-2">
              {WEEKDAY_VALUES.map((value, i) => (
                <label key={value} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={weekdays.includes(value)}
                    onChange={() => toggle(value)}
                    aria-label={s[WEEKDAY_KEYS[i]!]}
                  />
                  <span>{s[WEEKDAY_KEYS[i]!]}</span>
                </label>
              ))}
            </fieldset>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["schedule.altFrom"]}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="alt-weeks-from"
                  className="rounded-v2 border border-v2-border px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["schedule.altTo"]}</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="alt-weeks-to"
                  className="rounded-v2 border border-v2-border px-2 py-1"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{s["schedule.altWeekA"]}</span>
              <Select value={locationAId} onChange={(e) => setLocationAId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{s["schedule.altWeekB"]}</span>
              <Select value={locationBId} onChange={(e) => setLocationBId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </label>

            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["admin.workingHours.start"]}</span>
                <TimeFieldInput name="altStart" value={startTime} onChange={setStartTime} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{s["admin.workingHours.end"]}</span>
                <TimeFieldInput name="altEnd" value={endTime} onChange={setEndTime} />
              </label>
            </div>

            <Button onClick={submit} disabled={!canSave} data-testid="alt-weeks-save">
              {s["common.save"]}
            </Button>

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

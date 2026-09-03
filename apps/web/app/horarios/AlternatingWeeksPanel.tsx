"use client";

import { useState, useTransition } from "react";
import { Button, Dialog, Select } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { alternatingBlockingReasons, defaultAlternatingWindow } from "@/lib/scheduling/alternating-form";
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
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  // BOTH DATES ARRIVE FILLED IN, at the next Monday and eight whole weeks later.
  // Two empty date fields on a form whose Guardar is disabled is the same
  // non-answer the blocking list below exists to end - and the window a human
  // types here is nearly always "from next week, for a couple of months".
  //
  // The Lisbon calendar date, computed the same way the weekly editor computes
  // it, so a session open across midnight UTC does not disagree with the screen
  // beside it. It is deterministic on the server and in the browser, which is
  // what keeps this out of hydration.
  const initialWindow = defaultAlternatingWindow(
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" }),
  );
  const [startDate, setStartDate] = useState(initialWindow.startDate);
  const [endDate, setEndDate] = useState(initialWindow.endDate);
  const [locationAId, setLocationAId] = useState(locations[0]?.id ?? "");
  const [locationBId, setLocationBId] = useState(locations[1]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [affected, setAffected] = useState<{ id: string; label: string }[] | null>(null);
  const [collisions, setCollisions] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  // STATUS IS INLINE, NOT A TOAST, AND THE FIRST DRAFT GOT THIS WRONG IN A WAY
  // THAT CRASHED THE PAGE. `useToast` throws unless a <ToastProvider> is an
  // ancestor; the agenda has one, /horarios does not, so calling it here threw
  // during render and reproduced the exact STAFF-05 symptom - a black
  // "Application error" page - on the surface STAFF-05 had just fixed. Caught by
  // e2e/horarios-renders-per-role.spec.ts, which is the spec STAFF-05 added for
  // precisely this failure mode.
  //
  // Wrapping the page in a provider would have worked; one provider PER
  // THERAPIST CARD would have meant N aria-live regions on one page, which PG9
  // would rightly fail. Inline is also simply better here: the dialog is still
  // open when the answer arrives, and the affected-appointments list is already
  // rendered in it.
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // TWO CLINICS ARE REQUIRED and the control says so by existing: with one
  // location the pattern is meaningless, so the entry point is not offered.
  if (locations.length < 2) return null;

  const toggle = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  // EVERY reason at once, and the button's disabled state is DERIVED from the
  // same list rather than computed beside it - a second conjunction is a second
  // thing to keep in step, and the two would disagree the first time one moved.
  const blocking = alternatingBlockingReasons({
    weekdays,
    startDate,
    endDate,
    locationAId,
    locationBId,
    startTime,
    endTime,
  });
  const canSave = !busy && blocking.length === 0;

  const submit = async (replace: boolean) => {
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
      replace,
    });
    setBusy(false);
    if (!res.ok) {
      // SCHED-05: re-running the pattern over a window that already carries
      // dated rows used to bound those rows BACKWARDS and leave them dead. It
      // now refuses and says which dates are in the way, and replacing them is
      // the second action below.
      if (res.collisionDates && res.collisionDates.length > 0) {
        setCollisions(res.collisionDates);
        setStatus(null);
        return;
      }
      setCollisions(null);
      setStatus({ tone: "err", text: s["schedule.altError"] });
      return;
    }
    setCollisions(null);
    setStatus({
      tone: "ok",
      text: replace ? s["schedule.windowReplaced"] : s["schedule.altSaved"],
    });
    // The list is kept on screen rather than toasted: a toast disappears, and
    // these are appointments somebody has to act on.
    setAffected(res.affected ?? []);
    if ((res.affected ?? []).length === 0 && !replace) setOpen(false);
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
            setCollisions(null);
            setStatus(null);
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

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => submit(false)}
                disabled={!canSave}
                data-testid="alt-weeks-save"
                aria-describedby={blocking.length > 0 ? "alt-weeks-blocked" : undefined}
              >
                {s["common.save"]}
              </Button>

              {/* BESIDE THE BUTTON, not at the top of the dialog: the question
                  being answered is "why can I not press this", and an answer
                  that has scrolled out of view answers nobody. */}
              {blocking.length > 0 && (
                <div
                  id="alt-weeks-blocked"
                  data-testid="alt-weeks-blocked"
                  className="rounded-v2 border border-v2-border bg-v2-surface px-3 py-2 text-sm text-v2-text-secondary"
                >
                  <p className="text-v2-text-primary">{s["schedule.altBlockHeading"]}</p>
                  <ul className="list-disc pl-5">
                    {blocking.map((key) => (
                      <li key={key}>{s[key as keyof typeof s]}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {status && (
              <p
                role="status"
                data-testid="alt-weeks-status"
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
                data-testid="alt-weeks-collision"
                className="flex flex-col gap-2 rounded-v2 border border-v2-border bg-v2-surface p-3"
              >
                <p className="text-sm text-v2-text-primary">{s["schedule.windowCollision"]}</p>
                <ul className="list-disc pl-5 text-sm text-v2-text-secondary">
                  {collisions.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <p className="text-xs text-v2-text-secondary">{s["schedule.windowReplaceHelp"]}</p>
                <Button
                  variant="secondary"
                  onClick={() => submit(true)}
                  disabled={busy}
                  data-testid="alt-weeks-replace"
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

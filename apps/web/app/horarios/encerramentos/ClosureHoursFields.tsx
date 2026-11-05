"use client";

import { useState } from "react";
import { TimeFieldInput } from "@/components/time-field-input";
import { adminLabel } from "@/app/admin/admin-ui";

/**
 * "Dia inteiro" and the two hours, as one control. Ticked (the default): the
 * hour fields are not shown and nothing is posted for them, so the closure is
 * visibly the whole day. Unticked: both hours are shown and the server refuses
 * the save if either is empty (closureHoursFromForm).
 */
export function ClosureHoursFields({
  labels,
}: {
  labels: {
    wholeDay: string;
    wholeDayNote: string;
    from: string;
    fromHours: string;
    fromMinutes: string;
    to: string;
    toHours: string;
    toMinutes: string;
  };
}) {
  const [wholeDay, setWholeDay] = useState(true);
  return (
    <>
      <label className="flex items-center gap-2 pb-2 text-sm text-v2-text-primary">
        <input
          type="checkbox"
          name="wholeDay"
          checked={wholeDay}
          onChange={(e) => setWholeDay(e.target.checked)}
          className="h-4 w-4 rounded border-v2-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          data-testid="closure-whole-day"
        />
        {labels.wholeDay}
      </label>
      {wholeDay ? (
        <span className="pb-2 text-sm text-v2-text-secondary" data-testid="closure-whole-day-note">
          {labels.wholeDayNote}
        </span>
      ) : (
        <>
          <span className="flex flex-col gap-1" role="group" aria-label={labels.from}>
            <span className={adminLabel} aria-hidden="true">
              {labels.from}
            </span>
            <TimeFieldInput name="closedFrom" step={5} hourLabel={labels.fromHours} minuteLabel={labels.fromMinutes} />
          </span>
          <span className="flex flex-col gap-1" role="group" aria-label={labels.to}>
            <span className={adminLabel} aria-hidden="true">
              {labels.to}
            </span>
            <TimeFieldInput name="closedTo" step={5} hourLabel={labels.toHours} minuteLabel={labels.toMinutes} />
          </span>
        </>
      )}
    </>
  );
}

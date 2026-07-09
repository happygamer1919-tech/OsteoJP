"use client";

import { useState } from "react";
import { Button, GlassPanel, useAnimatedDialog } from "@osteojp/ui";
import { TimeFieldInput } from "@/components/time-field-input";
import { adminInputInline, adminLabel } from "../admin-ui";
import { saveTherapistScheduleAction } from "./actions";
import { TherapistBlocks, type BlockView, type BlockLabels } from "./TherapistBlocks";

export type ScheduleDay = {
  weekday: number;
  label: string;
  /** True when the therapist works this day (an active template exists). */
  on: boolean;
  /** The active template id this day manages, or "" for a new day. */
  id: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  locationId: string;
};

export type ScheduleLocation = { id: string; name: string };

export type ScheduleLabels = {
  editSchedule: string;
  scheduleFor: string;
  noHours: string;
  worksLabel: string;
  start: string;
  end: string;
  location: string;
  save: string;
  cancel: string;
};

/**
 * W4-14 — one card per therapist with a compact weekly summary and an
 * `Editar horário` top-layer modal (showModal via useAnimatedDialog, W3-02):
 * weekday toggles + per-day 24h TimeField (15-min step, W4-02) + per-day active
 * location, a single Guardar reconciling through the W2-12 write paths. Toggling
 * a day off + Guardar archives that day (the no-password in-modal delete).
 * Conforms to docs/design/UI-STYLE.md (card + modal + tokens).
 */
export function TherapistScheduleCard({
  therapistId,
  therapistName,
  days,
  locations,
  labels,
  blocks,
  blockLabels,
  autoOpen = false,
}: {
  therapistId: string;
  therapistName: string;
  days: ScheduleDay[];
  locations: ScheduleLocation[];
  labels: ScheduleLabels;
  blocks: BlockView[];
  blockLabels: BlockLabels;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const { ref, shown } = useAnimatedDialog(open);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "";
  const workedDays = days.filter((d) => d.on);
  const fallbackLocation = locations[0]?.id ?? "";

  return (
    <GlassPanel
      title={therapistName}
      headerAction={
        <div className="flex gap-1">
          <TherapistBlocks
            therapistId={therapistId}
            therapistName={therapistName}
            blocks={blocks}
            labels={blockLabels}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="edit-schedule"
          >
            {labels.editSchedule}
          </Button>
        </div>
      }
    >
      {workedDays.length === 0 ? (
        <p className="text-sm text-v2-text-secondary">{labels.noHours}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-v2-text-primary">
          {workedDays.map((d) => (
            <li key={d.weekday} className="flex flex-wrap gap-x-2">
              <span className="min-w-24 font-medium">{d.label}</span>
              <span>
                {d.start}–{d.end}
              </span>
              <span className="text-v2-text-secondary">· {locationName(d.locationId)}</span>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={ref}
        aria-label={`${labels.scheduleFor} ${therapistName}`}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className={[
          "m-auto w-full max-w-2xl rounded-v2 bg-v2-surface p-0 shadow-v2-float",
          "backdrop:bg-text-primary/40",
          "transition-opacity duration-base ease-standard",
          shown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <form action={saveTherapistScheduleAction} className="flex flex-col gap-4 p-6">
          <h3 className="text-lg font-semibold text-v2-text-primary">
            {labels.scheduleFor} {therapistName}
          </h3>
          <input type="hidden" name="userId" value={therapistId} />

          <div className="flex flex-col gap-3">
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
                    aria-label={`${labels.worksLabel} — ${d.label}`}
                  />
                  <span className="font-medium text-v2-text-primary">{d.label}</span>
                </label>
                <input type="hidden" name={`d${d.weekday}_id`} value={d.id} />
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.start}</span>
                  <TimeFieldInput name={`d${d.weekday}_start`} defaultValue={d.start} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.end}</span>
                  <TimeFieldInput name={`d${d.weekday}_end`} defaultValue={d.end} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.location}</span>
                  <select
                    name={`d${d.weekday}_location`}
                    defaultValue={d.locationId || fallbackLocation}
                    aria-label={`${labels.location} — ${d.label}`}
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
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {labels.save}
            </Button>
          </div>
        </form>
      </dialog>
    </GlassPanel>
  );
}

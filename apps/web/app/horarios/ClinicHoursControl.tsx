"use client";

import { useState } from "react";
import { Button, useAnimatedDialog } from "@osteojp/ui";
import type { ScheduleKind } from "@/lib/scheduling/effective-availability-core";

/**
 * HOR-01 - what a Horarios card says about WHICH schedule a therapist is on,
 * and the one action that moves them onto the clinic's hours.
 *
 * THE LABEL IS ALWAYS SHOWN, for every managed therapist, because the question
 * it answers ("why is this person bookable at 19:00 when nobody typed 19:00?")
 * is the first one reception will ask once rows stop being required.
 *
 * THE BUTTON IS SHOWN ONLY ON `own`. On `clinic_default` there is nothing to
 * switch off, and on `none` switching rows off would not make the default
 * apply (the therapist is not bookable, not a member of a clinic, or a shared
 * resource), so offering it would promise something it cannot do.
 *
 * THE CONFIRM IS A SEPARATE STEP ON PURPOSE. The action changes the therapist's
 * hours at every clinic at once; a single press would be too easy to make
 * while reaching for Bloquear horario beside it.
 */
export type ClinicHoursLabels = {
  kindOwn: string;
  kindOwnHint: string;
  kindClinicDefault: string;
  kindClinicDefaultHint: string;
  kindNone: string;
  kindNoneHint: string;
  useClinicHours: string;
  title: string;
  body: string;
  keep: string;
  confirm: string;
  cancel: string;
};

const KIND_CLASS: Record<ScheduleKind, string> = {
  own: "border-v2-border bg-v2-surface text-v2-text-primary",
  clinic_default: "border-v2-green-100 bg-v2-green-50 text-v2-green-800",
  none: "border-v2-border bg-surface-muted text-v2-text-secondary",
};

export function ScheduleKindLabel({
  kind,
  labels,
}: {
  kind: ScheduleKind;
  labels: Pick<
    ClinicHoursLabels,
    "kindOwn" | "kindOwnHint" | "kindClinicDefault" | "kindClinicDefaultHint" | "kindNone" | "kindNoneHint"
  >;
}) {
  const text =
    kind === "own" ? labels.kindOwn : kind === "clinic_default" ? labels.kindClinicDefault : labels.kindNone;
  const hint =
    kind === "own"
      ? labels.kindOwnHint
      : kind === "clinic_default"
        ? labels.kindClinicDefaultHint
        : labels.kindNoneHint;
  return (
    <span
      data-testid="schedule-kind"
      data-kind={kind}
      title={hint}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${KIND_CLASS[kind]}`}
    >
      {text}
    </span>
  );
}

export function UseClinicHoursButton({
  therapistId,
  therapistName,
  labels,
  action,
}: {
  therapistId: string;
  therapistName: string;
  labels: ClinicHoursLabels;
  action: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { ref, shown } = useAnimatedDialog(open);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="use-clinic-hours"
      >
        {labels.useClinicHours}
      </Button>
      <dialog
        ref={ref}
        aria-label={`${labels.title} ${therapistName}`}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className={[
          "m-auto w-full max-w-lg rounded-v2 bg-v2-surface p-0 shadow-v2-float",
          "backdrop:bg-text-primary/40",
          "transition-opacity duration-base ease-standard",
          shown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <form action={action} className="flex flex-col gap-4 p-6" data-testid="use-clinic-hours-form">
          <input type="hidden" name="userId" value={therapistId} />
          <h3 className="text-lg font-semibold text-v2-text-primary">{labels.title}</h3>
          <p className="text-sm font-medium text-v2-text-primary">{therapistName}</p>
          <p className="text-sm text-v2-text-primary">{labels.body}</p>
          <p className="text-sm text-v2-text-secondary">{labels.keep}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" variant="primary" size="sm" data-testid="use-clinic-hours-confirm">
              {labels.confirm}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
 * THE BUTTON IS SHOWN ONLY WHEN THE SERVER WOULD ACCEPT IT: the page passes
 * the same `clinicDefaultSwitchVerdict` the action re-checks, and renders the
 * button only on `ok`. A refusal that still happens (the data changed between
 * the render and the press) is shown in the dialog, in Portuguese, naming the
 * clinics.
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
  confirmClinics,
  action,
}: {
  therapistId: string;
  therapistName: string;
  labels: ClinicHoursLabels;
  /** "O horario proprio sera desativado em: ...", built on the server from the
   *  same verdict the action re-checks. */
  confirmClinics: string;
  action: (input: { userId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { ref, shown } = useAnimatedDialog(open);
  const close = () => {
    setOpen(false);
    setError(null);
  };
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
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className={[
          "m-auto w-full max-w-lg rounded-v2 bg-v2-surface p-0 shadow-v2-float",
          "backdrop:bg-text-primary/40",
          "transition-opacity duration-base ease-standard",
          shown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <div className="flex flex-col gap-4 p-6" data-testid="use-clinic-hours-form">
          <h3 className="text-lg font-semibold text-v2-text-primary">{labels.title}</h3>
          <p className="text-sm font-medium text-v2-text-primary">{therapistName}</p>
          <p className="text-sm text-v2-text-primary">{labels.body}</p>
          <p className="text-sm text-v2-text-primary" data-testid="use-clinic-hours-clinics">
            {confirmClinics}
          </p>
          <p className="text-sm text-v2-text-secondary">{labels.keep}</p>
          {error && (
            <p role="alert" className="rounded-v2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending}
              data-testid="use-clinic-hours-confirm"
              onClick={() =>
                startTransition(async () => {
                  const res = await action({ userId: therapistId });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  close();
                  router.push("/horarios?m=clinic_default");
                })
              }
            >
              {labels.confirm}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

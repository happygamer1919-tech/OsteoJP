"use client";

import {
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  StatusChip,
  ToastProvider,
  useToast,
  type StatusTone,
} from "@osteojp/ui";
import { Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { s } from "@/lib/i18n";
import { cloneAppointment } from "@/lib/scheduling/actions";
import { formatTimeOfDay, lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import type { AgendaAppointment, AppointmentStatusValue } from "@/lib/scheduling/types";

type StringKey = keyof typeof s;

// Local to this file, matching the per-view duplication already used for this
// mapping elsewhere (marcacoes-view.tsx, invoicing-view.tsx) — no shared
// helper exists in the codebase for it yet.
const STATUS_TONE: Record<AppointmentStatusValue, StatusTone> = {
  scheduled: "neutral",
  confirmed: "info",
  completed: "success",
  cancelled: "error",
  no_show: "warning", // never red (§10) — distinct from cancelled, not a hard failure
};
const STATUS_KEY: Record<AppointmentStatusValue, StringKey> = {
  scheduled: "appointment.status.scheduled",
  confirmed: "appointment.status.confirmed",
  completed: "appointment.status.completed",
  cancelled: "appointment.status.cancelled",
  no_show: "appointment.status.no_show",
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Row 3 eligibility: "past or completed" appointments only. Past is judged on
 * the actual instant (startsAt), not appointment status, so a cancelled or
 * no-show visit is still offered — rebooking after exactly those outcomes is
 * the point of "schedule again". Future non-completed appointments (the
 * normal upcoming case) are excluded.
 */
function isEligibleForScheduleAgain(a: AgendaAppointment): boolean {
  return a.status === "completed" || new Date(a.startsAt).getTime() < Date.now();
}

export function AppointmentsList({ appointments }: { appointments: AgendaAppointment[] }) {
  return (
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
      <AppointmentsListInner appointments={appointments} />
    </ToastProvider>
  );
}

function AppointmentsListInner({ appointments }: { appointments: AgendaAppointment[] }) {
  const [scheduleAgainSource, setScheduleAgainSource] = useState<AgendaAppointment | null>(null);

  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={s["patients.emptyConsultasTitle"]}
        description={s["patients.emptyConsultasHelp"]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {appointments.map((a) => (
        <Card key={a.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-text-primary">
                {dateFmt.format(new Date(a.startsAt))} · {formatTimeOfDay(new Date(a.startsAt))}
              </span>
              <span className="text-sm text-text-secondary">
                {a.practitionerName}
                {a.serviceName ? ` · ${a.serviceName}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <StatusChip tone={STATUS_TONE[a.status]} dot>
                {s[STATUS_KEY[a.status]]}
              </StatusChip>
              {a.status === "completed" && !a.hasNote && (
                <StatusChip tone="warning">{s["appointment.noNote"]}</StatusChip>
              )}
              {isEligibleForScheduleAgain(a) && (
                <button
                  type="button"
                  onClick={() => setScheduleAgainSource(a)}
                  className="inline-flex items-center rounded-md px-2 py-1 text-sm font-medium text-accent-2-700 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  {s["patients.scheduleAgain"]}
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}

      {scheduleAgainSource && (
        <ScheduleAgainDrawer
          source={scheduleAgainSource}
          onClose={() => setScheduleAgainSource(null)}
        />
      )}
    </div>
  );
}

/**
 * Minimal schedule-again form: date + time only (Row 3 scope). Patient,
 * practitioner, service, location, and duration are copied server-side by
 * cloneAppointment from the source appointment — never re-asked or editable
 * here. Neither field is prefilled with the source's original date/time; the
 * clinic picks a genuinely new slot.
 */
function ScheduleAgainDrawer({
  source,
  onClose,
}: {
  source: AgendaAppointment;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm() {
    if (!date || !time) return;
    setSubmitting(true);
    const startsAt = lisbonDateTimeToUtc(date, time).toISOString();
    const result = await cloneAppointment(source.id, startsAt);
    setSubmitting(false);
    if (result.ok) {
      toast({ tone: "success", message: s["patients.scheduleAgainSuccess"] });
      onClose();
      // cloneAppointment only revalidates /agenda; refresh this route so the
      // new appointment appears in this list too.
      router.refresh();
    } else {
      toast({ tone: "error", message: s["patients.scheduleAgainError"] });
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={s["patients.scheduleAgain"]}
      closeLabel={s["common.close"]}
      cancelLabel={s["common.cancel"]}
      confirmLabel={s["patients.scheduleAgainConfirm"]}
      confirmDisabled={!date || !time}
      confirmLoading={submitting}
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-4">
        <Field label={s["appointment.date"]} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={s["appointment.time"]} required>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

"use client";

import {
  Banner,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  Select,
  StatusChip,
  TimeField,
  ToastProvider,
  useToast,
  type StatusTone,
} from "@osteojp/ui";
import { Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { s } from "@/lib/i18n";
import {
  cancelAppointment,
  cloneAppointment,
  rescheduleAppointment,
  updateAppointment,
} from "@/lib/scheduling/actions";
import {
  hasLegalEstadoTransition,
  isLegalEstadoTransition,
  legalEstadoTransitions,
} from "@/lib/scheduling/estado-transitions";
import { formatTimeOfDay, lisbonDateTimeToUtc, lisbonParts } from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AppointmentStatusValue,
  ConflictInfo,
} from "@/lib/scheduling/types";

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
 * "Marcar novamente" eligibility: "past or completed" appointments only. Past is
 * judged on the actual instant (startsAt), not appointment status, so a
 * cancelled or no-show visit is still offered — rebooking after exactly those
 * outcomes is the point of "schedule again". Future non-completed appointments
 * (the normal upcoming case) are excluded.
 */
function isEligibleForScheduleAgain(a: AgendaAppointment): boolean {
  return a.status === "completed" || new Date(a.startsAt).getTime() < Date.now();
}

/**
 * An appointment is still open to per-row EDITS (reschedule / Estado change /
 * cancel) only while its lifecycle is not already terminal. Cancelled /
 * completed / no-show visits are read-only here; "Marcar novamente" (a clone,
 * above) is the only forward action for a concluded visit. Mirrors the terminal
 * set the lifecycle helper treats as having no onward transition.
 */
function isEditable(a: AgendaAppointment): boolean {
  return a.status === "scheduled" || a.status === "confirmed";
}

export function AppointmentsList({
  appointments,
  canEdit,
  canCancel,
}: {
  appointments: AgendaAppointment[];
  canEdit: boolean;
  canCancel: boolean;
}) {
  return (
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
      <AppointmentsListInner appointments={appointments} canEdit={canEdit} canCancel={canCancel} />
    </ToastProvider>
  );
}

type RowAction =
  | { kind: "scheduleAgain"; appt: AgendaAppointment }
  | { kind: "reschedule"; appt: AgendaAppointment }
  | { kind: "cancel"; appt: AgendaAppointment };

function AppointmentsListInner({
  appointments,
  canEdit,
  canCancel,
}: {
  appointments: AgendaAppointment[];
  canEdit: boolean;
  canCancel: boolean;
}) {
  const [action, setAction] = useState<RowAction | null>(null);

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
        <AppointmentRow
          key={a.id}
          appt={a}
          canEdit={canEdit}
          canCancel={canCancel}
          onScheduleAgain={() => setAction({ kind: "scheduleAgain", appt: a })}
          onReschedule={() => setAction({ kind: "reschedule", appt: a })}
          onCancel={() => setAction({ kind: "cancel", appt: a })}
        />
      ))}

      {action?.kind === "scheduleAgain" && (
        <ScheduleAgainDrawer source={action.appt} onClose={() => setAction(null)} />
      )}
      {action?.kind === "reschedule" && (
        <RescheduleDrawer appt={action.appt} onClose={() => setAction(null)} />
      )}
      {action?.kind === "cancel" && (
        <CancelDrawer appt={action.appt} onClose={() => setAction(null)} />
      )}
    </div>
  );
}

function AppointmentRow({
  appt: a,
  canEdit,
  canCancel,
  onScheduleAgain,
  onReschedule,
  onCancel,
}: {
  appt: AgendaAppointment;
  canEdit: boolean;
  canCancel: boolean;
  onScheduleAgain: () => void;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  // The per-row Estado control is inline (its own Select + Aplicar), sharing the
  // disclosure with Reagendar / Cancelar. It is only offered while the lifecycle
  // is open AND has at least one legal onward transition.
  const editable = isEditable(a);
  const showReschedule = canEdit && editable;
  const showEstado = canEdit && editable && hasLegalEstadoTransition(a.status);
  const showCancel = canCancel && editable;
  const showManage = showReschedule || showEstado || showCancel;

  return (
    <Card>
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
              onClick={onScheduleAgain}
              className="inline-flex items-center rounded-md px-2 py-1 text-sm font-medium text-accent-2-700 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {s["patients.scheduleAgain"]}
            </button>
          )}
        </div>
      </div>

      {/* Row-actions disclosure (UI-STYLE §6): a native <details> grouping the
          per-row edit actions, each wired to its EXISTING Agenda server action.
          No client JS to open; every control stays in the DOM. */}
      {showManage && (
        <details className="mt-3 border-t border-border pt-3 [&_summary]:list-none">
          <summary className="inline-flex cursor-pointer items-center rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            {s["patients.appointmentManage"]}
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {showReschedule && (
              <Button type="button" size="sm" variant="ghost" onClick={onReschedule}>
                {s["appointment.reschedule"]}
              </Button>
            )}
            {showEstado && <EstadoInline appt={a} />}
            {showCancel && (
              <Button type="button" size="sm" variant="destructive" onClick={onCancel}>
                {s["appointment.cancelAppointment"]}
              </Button>
            )}
          </div>
        </details>
      )}
    </Card>
  );
}

/**
 * Inline Estado change (LIFECYCLE axis only). The Select offers ONLY the
 * lifecycle-legal onward transitions from the current status (never `cancelled`
 * — that is the separate Cancel control — and never any confirmation-axis
 * value). Aplicar posts the picked lifecycle status to the EXISTING
 * updateAppointment action. The submit re-guards with isLegalEstadoTransition so
 * an illegal jump is rejected before any server call. The confirmation axis is
 * never read or written here.
 */
function EstadoInline({ appt }: { appt: AgendaAppointment }) {
  const router = useRouter();
  const toast = useToast();
  const targets = legalEstadoTransitions(appt.status);
  const [next, setNext] = useState<AppointmentStatusValue>(targets[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    // Guard the transition client-side before touching the server. The estado
    // control can only ever set a lifecycle value, and only a LEGAL onward one.
    if (!isLegalEstadoTransition(appt.status, next)) {
      setError(s["appointment.estadoIllegal"]);
      return;
    }
    setSubmitting(true);
    const r = await updateAppointment(appt.id, { status: next });
    setSubmitting(false);
    if (r.ok) {
      toast({ tone: "success", message: s["appointment.saved"] });
      router.refresh();
    } else {
      toast({
        tone: "error",
        message: r.error === "forbidden" ? s["errors.forbidden"] : s["errors.generic"],
      });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Field label={s["appointment.status"]}>
        <div className="flex items-center gap-2">
          <Select
            aria-label={s["appointment.status"]}
            value={next}
            onChange={(e) => setNext(e.target.value as AppointmentStatusValue)}
          >
            {targets.map((v) => (
              <option key={v} value={v}>
                {s[STATUS_KEY[v]]}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={submitting}
            disabled={submitting}
            onClick={() => void apply()}
          >
            {s["common.apply"]}
          </Button>
        </div>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Reschedule drawer: date/time only. PRIMARY-ONLY semantics — the practitioner
 * and location come from the row's own (primary) pair and are NOT re-asked or
 * changed here; only the temporal window moves. Wired to the EXISTING
 * rescheduleAppointment action, which runs the availability/conflict check
 * (findConflictsForWindow). A conflict surfaces inline and offers an explicit
 * "Guardar mesmo assim" (allowConflict) — never auto-applied.
 */
function RescheduleDrawer({
  appt,
  onClose,
}: {
  appt: AgendaAppointment;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const start = new Date(appt.startsAt);
  const parts = lisbonParts(start);
  const durationMin = Math.max(
    1,
    Math.round((new Date(appt.endsAt).getTime() - start.getTime()) / 60_000),
  );
  const [date, setDate] = useState(parts.date);
  const [time, setTime] = useState(
    `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  );
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A conflict banner describes one specific date/time. If either changes after
  // a conflict is shown, the next confirm must re-check from scratch (same
  // render-time reset the Agenda drawer uses), so "Guardar mesmo assim" can
  // never silently skip the check for a never-validated slot.
  const slotKey = `${date}|${time}`;
  const [checkedKey, setCheckedKey] = useState(slotKey);
  if (slotKey !== checkedKey) {
    setCheckedKey(slotKey);
    setConflicts(null);
  }

  async function submit(allowConflict: boolean) {
    if (!date || !time) return;
    setError(null);
    setSubmitting(true);
    const startsAt = lisbonDateTimeToUtc(date, time);
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    const r = await rescheduleAppointment(appt.id, {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      // Primary pair, reused verbatim — no therapist/location editing here.
      practitionerId: appt.practitionerId,
      locationId: appt.locationId,
      allowConflict,
    });
    setSubmitting(false);
    if (r.ok) {
      toast({ tone: "success", message: s["appointment.rescheduled"] });
      onClose();
      router.refresh();
      return;
    }
    if (r.error === "conflict") {
      setConflicts(r.conflicts ?? []);
      return;
    }
    setError(r.error === "forbidden" ? s["errors.forbidden"] : s["errors.generic"]);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={s["appointment.reschedule"]}
      closeLabel={s["common.close"]}
      cancelLabel={s["common.cancel"]}
      confirmLabel={conflicts ? s["appointment.saveAnyway"] : s["appointment.reschedule"]}
      confirmVariant={conflicts ? "destructive" : "primary"}
      confirmDisabled={!date || !time}
      confirmLoading={submitting}
      onConfirm={() => void submit(!!conflicts)}
    >
      <div className="flex flex-col gap-4">
        <Field label={s["appointment.date"]} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={s["appointment.time"]} required>
          <TimeField value={time} onChange={setTime} />
        </Field>

        {conflicts && (
          <Banner tone="warning">
            <span className="flex flex-col gap-1">
              <span className="font-medium">{s["agenda.conflict"]}</span>
              {conflicts.map((c) => (
                <span key={c.id} className="block text-sm">
                  {[c.patientName, c.room].filter(Boolean).join(" · ")}
                  {c.patientName || c.room ? ": " : ""}
                  {formatTimeOfDay(new Date(c.startsAt))}-{formatTimeOfDay(new Date(c.endsAt))}
                </span>
              ))}
            </span>
          </Banner>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}

/**
 * Cancel drawer: optional reason, wired to the EXISTING cancelAppointment
 * action (appointments:delete capability, re-asserted server-side). Sets the
 * lifecycle to `cancelled` via the dedicated delete-cap path — never through the
 * Estado control.
 */
function CancelDrawer({
  appt,
  onClose,
}: {
  appt: AgendaAppointment;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const r = await cancelAppointment(appt.id, reason || undefined);
    setSubmitting(false);
    if (r.ok) {
      toast({ tone: "success", message: s["appointment.cancelledMsg"] });
      onClose();
      router.refresh();
      return;
    }
    setError(r.error === "forbidden" ? s["errors.forbidden"] : s["errors.generic"]);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={s["appointment.cancelAppointment"]}
      closeLabel={s["common.close"]}
      cancelLabel={s["common.cancel"]}
      confirmLabel={s["appointment.cancelAppointment"]}
      confirmVariant="destructive"
      confirmLoading={submitting}
      onConfirm={() => void submit()}
    >
      <div className="flex flex-col gap-4">
        <Field label={s["appointment.cancelReason"]}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Drawer>
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
          <TimeField value={time} onChange={setTime} />
        </Field>
      </div>
    </Drawer>
  );
}

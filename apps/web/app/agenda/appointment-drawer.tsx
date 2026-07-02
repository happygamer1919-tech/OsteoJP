"use client";

import {
  Banner,
  Checkbox,
  Combobox,
  Drawer,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
  type ComboboxOption,
} from "@osteojp/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import { s } from "@/lib/i18n";
import { searchPatientsAction } from "@/lib/patients/actions";
import {
  cancelAppointment,
  createAppointment,
  getTherapistServices,
  rescheduleAppointment,
  updateAppointment,
} from "@/lib/scheduling/actions";
import {
  formatTimeOfDay,
  lisbonDateTimeToUtc,
  lisbonParts,
} from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AgendaOptions,
  AppointmentStatusValue,
  ConflictInfo,
  Frequency,
  SeriesScope,
} from "@/lib/scheduling/types";
import { AvailabilityPanel } from "./availability-panel";

import { ConfirmationIndicator } from "./confirmation-indicator";

export type ModalState =
  | { mode: "create"; slot?: { date: string; time: string } }
  | { mode: "edit"; appt: AgendaAppointment };

type StringKey = keyof typeof s;
type FormState = {
  patientId: string;
  serviceId: string;
  practitionerId: string;
  locationId: string;
  room: string;
  date: string;
  time: string;
  durationMin: number;
  status: AppointmentStatusValue;
  notes: string;
  repeatFreq: "none" | Frequency;
  occurrences: number;
  scope: SeriesScope;
};

const DURATIONS = [30, 45, 60, 90];
const STATUS_OPTIONS: { value: AppointmentStatusValue; key: StringKey }[] = [
  { value: "scheduled", key: "appointment.statusPending" },
  { value: "confirmed", key: "appointment.statusConfirmed" },
  { value: "completed", key: "appointment.statusCompleted" },
  { value: "cancelled", key: "appointment.statusCancelled" },
  { value: "no_show", key: "appointment.statusNoShow" },
];
const FREQ_OPTIONS: { value: Frequency; key: StringKey }[] = [
  { value: "daily", key: "appointment.repeatDaily" },
  { value: "weekly", key: "appointment.repeatWeekly" },
  { value: "biweekly", key: "appointment.repeatBiweekly" },
  { value: "monthly", key: "appointment.repeatMonthly" },
];
const SCOPE_OPTIONS: { value: SeriesScope; key: StringKey }[] = [
  { value: "one", key: "appointment.scopeOne" },
  { value: "following", key: "appointment.scopeFollowing" },
  { value: "series", key: "appointment.scopeSeries" },
];

/**
 * Appointment Drawer (SPEC-staff-screens §5). Replaces the appointment modal,
 * composed from the packages/ui Drawer — identical fields, data, endpoints, and
 * permissions. The patient field is now a search Combobox; the conflict check
 * surfaces as an inline warning Banner; a dirty close routes through the Drawer's
 * discard Dialog; success fires a Toast and refetches the agenda.
 *
 * Deferred (kept native to preserve the booking/reschedule e2e contracts):
 * Data via a native date input and Hora via a native time input (the W2-01
 * DatePicker/TimeField swap is a follow-up); the "Novo paciente" inline-create
 * segment (the appointment endpoint has no patient quick-create today, rule #1).
 */
export function AppointmentDrawer({
  state,
  options,
  anchor,
  onClose,
  onDone,
}: {
  state: ModalState;
  options: AgendaOptions;
  anchor: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const editing = state.mode === "edit" ? state.appt : null;
  const isRecurring = !!(editing && (editing.recurrenceRule || editing.recurrenceParentId));

  const init = useMemo<FormState>(() => {
    if (editing) {
      const start = new Date(editing.startsAt);
      const parts = lisbonParts(start);
      const durationMin = Math.round((new Date(editing.endsAt).getTime() - start.getTime()) / 60_000);
      return {
        patientId: editing.patientId,
        serviceId: editing.serviceId ?? "",
        practitionerId: editing.practitionerId,
        locationId: editing.locationId,
        room: editing.room ?? "",
        date: parts.date,
        time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
        durationMin: durationMin > 0 ? durationMin : 60,
        status: editing.status,
        notes: editing.notes ?? "",
        repeatFreq: "none",
        occurrences: 4,
        scope: "one",
      };
    }
    const slot = state.mode === "create" ? state.slot : undefined;
    return {
      patientId: "",
      serviceId: "",
      practitionerId: "",
      locationId: options.locations[0]?.id ?? "",
      room: "",
      date: slot?.date ?? anchor,
      time: slot?.time ?? "09:00",
      durationMin: 60,
      status: "scheduled",
      notes: "",
      repeatFreq: "none",
      occurrences: 4,
      scope: "one",
    };
  }, [editing, state, anchor, options.locations]);

  const [form, setForm] = useState<FormState>(init);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A conflict banner describes one specific therapist/date/time/duration
  // combination (checked server-side inside create/update/reschedule — there
  // is no separate live pre-check endpoint to call here). If the user changes
  // any of those fields after a conflict is shown, the banner is now
  // describing a slot that's no longer being requested, and — worse — the
  // Drawer's confirm button has switched to "Guardar mesmo assim", which
  // submits with allowConflict=true. Without this, that would silently skip
  // conflict checking for the new, never-validated combination. Clearing
  // conflicts forces the next confirm to re-check the current slot from
  // scratch, same as a first-time submit. Adjusted during render (React's
  // documented pattern for resetting state when inputs change) rather than in
  // an effect, so the stale banner never has a chance to paint.
  const slotKey = `${form.practitionerId}|${form.date}|${form.time}|${form.durationMin}`;
  const [checkedSlotKey, setCheckedSlotKey] = useState(slotKey);
  if (slotKey !== checkedSlotKey) {
    setCheckedSlotKey(slotKey);
    setConflicts(null);
  }

  // Patient search — async, search-as-you-type (min 2 chars, 300 ms debounce).
  // Edit mode pre-populates the query with the existing patient name so the
  // current selection is visible without a round-trip.
  const editingPatient = editing
    ? { value: editing.patientId, label: editing.patientName }
    : null;
  const [patientQuery, setPatientQuery] = useState(editingPatient?.label ?? "");
  const [patientSearchResults, setPatientSearchResults] = useState<ComboboxOption[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);

  // When query is below the minimum, show the current patient (edit) or nothing
  // (create). When at or above minimum, show the debounced search results.
  const patientOptions = useMemo<ComboboxOption[]>(() => {
    if (patientQuery.trim().length < 2) return editingPatient ? [editingPatient] : [];
    return patientSearchResults;
  }, [patientQuery, patientSearchResults, editingPatient]);

  useEffect(() => {
    const q = patientQuery.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setPatientLoading(true);
      searchPatientsAction(q)
        .then((rows) => setPatientSearchResults(rows.map((r) => ({ value: r.id, label: r.label }))))
        .finally(() => setPatientLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  // editing is stable for the drawer's lifetime; patientQuery drives the search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientQuery]);

  const dirty = JSON.stringify(form) !== JSON.stringify(init);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function applyService(serviceId: string) {
    const svc = options.services.find((o) => o.id === serviceId);
    setForm((f) => ({ ...f, serviceId, durationMin: svc ? svc.durationMin : f.durationMin }));
  }
  function onServiceChange(serviceId: string) {
    applyService(serviceId);
  }

  // Therapist -> service mapping (0023, SPEC-appointments §6). `therapistServiceResult`
  // only ever holds the outcome for the therapist it was fetched for, so a
  // stale response landing after the therapist changed again is naturally
  // ignored by the render-time comparison below (same technique the
  // availability panel uses, row 5) rather than resetting state from inside
  // the effect body. Preselect only fires when the fetch was triggered by an
  // actual user edit to the Terapeuta field (userChangedTherapist, set in the
  // Select's onChange below) — never on the initial mount value — so opening
  // the edit drawer can never silently rewrite an already-saved serviceId
  // before the user has touched anything.
  const [therapistServiceResult, setTherapistServiceResult] = useState<
    { therapistId: string; ids: string[] } | null
  >(null);
  const userChangedTherapist = useRef(false);

  useEffect(() => {
    const therapistId = form.practitionerId;
    if (!therapistId) return;
    let cancelled = false;
    getTherapistServices(therapistId).then((r) => {
      if (cancelled) return;
      const ids = r.ok ? r.data : [];
      setTherapistServiceResult({ therapistId, ids });
      if (userChangedTherapist.current && ids.length === 1) applyService(ids[0]);
    });
    return () => {
      cancelled = true;
    };
  // applyService/options.services are stable for the drawer's lifetime (same
  // reasoning as the patient-search effect above); only the therapist drives
  // this fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.practitionerId]);

  // `null` means "unknown" — no therapist picked yet, or the fetch for the
  // current therapist hasn't landed — and is treated as "show every service",
  // same fallback as a therapist with zero mappings (BACKLOG.md doesn't rule
  // on that case; showing all rather than an empty Select is the least
  // surprising default, see PR description).
  const therapistServiceIds =
    form.practitionerId && therapistServiceResult?.therapistId === form.practitionerId
      ? therapistServiceResult.ids
      : null;

  const serviceOptions =
    therapistServiceIds && therapistServiceIds.length > 0
      ? options.services.filter((o) => therapistServiceIds.includes(o.id))
      : options.services;

  function handleResult(r: { ok: boolean; error?: string; conflicts?: ConflictInfo[] }): boolean {
    if (r.ok) return true;
    if (r.error === "conflict") setConflicts(r.conflicts ?? []);
    else if (r.error === "forbidden") setError(s["errors.forbidden"]);
    else if (r.error === "validation") setError(s["appointment.requiredFields"]);
    else if (r.error === "unauthenticated") setError(s["errors.unauthenticated"]);
    else setError(s["errors.generic"]);
    return false;
  }

  async function submit(allowConflict: boolean) {
    setError(null);
    if (!form.patientId || !form.practitionerId || !form.locationId || !form.date || !form.time || form.durationMin <= 0) {
      setError(s["appointment.requiredFields"]);
      return;
    }
    const startsAt = lisbonDateTimeToUtc(form.date, form.time);
    const endsAt = new Date(startsAt.getTime() + form.durationMin * 60_000);
    const startISO = startsAt.toISOString();
    const endISO = endsAt.toISOString();

    setSubmitting(true);
    setConflicts(null);
    try {
      if (!editing) {
        const recurrence = form.repeatFreq !== "none" ? { freq: form.repeatFreq, count: form.occurrences } : null;
        const r = await createAppointment({
          patientId: form.patientId,
          practitionerId: form.practitionerId,
          locationId: form.locationId,
          serviceId: form.serviceId || null,
          room: form.room || null,
          startsAt: startISO,
          endsAt: endISO,
          status: form.status,
          notes: form.notes || null,
          recurrence,
          allowConflict,
        });
        if (!handleResult(r)) return;
        succeed();
        return;
      }

      const scope = form.scope;
      if (form.status === "cancelled" && editing.status !== "cancelled") {
        const r = await cancelAppointment(editing.id, form.notes || undefined, { scope });
        if (!handleResult(r)) return;
        succeed();
        return;
      }

      const patch: Parameters<typeof updateAppointment>[1] = {};
      if (form.serviceId !== (editing.serviceId ?? "")) patch.serviceId = form.serviceId || null;
      if (form.room !== (editing.room ?? "")) patch.room = form.room || null;
      if (form.notes !== (editing.notes ?? "")) patch.notes = form.notes || null;
      if (form.status !== editing.status && form.status !== "cancelled") patch.status = form.status;
      if (Object.keys(patch).length > 0) {
        const r = await updateAppointment(editing.id, patch, { scope, allowConflict });
        if (!handleResult(r)) return;
      }

      const timeOfDayChanged = form.time !== init.time || form.durationMin !== init.durationMin;
      const practOrLocChanged = form.practitionerId !== editing.practitionerId || form.locationId !== editing.locationId;
      const dateChanged = form.date !== init.date;
      const temporalChanged = scope === "one" ? dateChanged || timeOfDayChanged || practOrLocChanged : timeOfDayChanged || practOrLocChanged;

      if (temporalChanged) {
        const r = await rescheduleAppointment(editing.id, {
          startsAt: startISO,
          endsAt: endISO,
          practitionerId: form.practitionerId,
          locationId: form.locationId,
          scope,
          allowConflict,
        });
        if (!handleResult(r)) return;
      }
      succeed();
    } finally {
      setSubmitting(false);
    }
  }

  function succeed() {
    toast({ tone: "success", message: s["appointment.saved"] });
    onDone();
  }

  const therapistConflicts = conflicts?.filter((c) => c.kind === "therapist") ?? [];
  const roomConflicts = conflicts?.filter((c) => c.kind === "room") ?? [];
  const availabilityConflicts = conflicts?.filter((c) => c.kind === "availability") ?? [];
  const timeOffConflicts = conflicts?.filter((c) => c.kind === "time_off") ?? [];

  return (
    <Drawer
      open
      onClose={onClose}
      dirty={dirty}
      discard={{
        title: s["appointment.discardTitle"],
        message: s["appointment.discardMessage"],
        confirmLabel: s["appointment.discardConfirm"],
        cancelLabel: s["appointment.discardKeep"],
      }}
      title={editing ? s["appointment.editTitle"] : s["appointment.newTitle"]}
      closeLabel={s["appointment.close"]}
      cancelLabel={s["common.cancel"]}
      confirmLabel={conflicts ? s["appointment.saveAnyway"] : s["appointment.save"]}
      confirmVariant={conflicts ? "destructive" : "primary"}
      confirmLoading={submitting}
      onConfirm={() => void submit(!!conflicts)}
    >
      <div className="flex flex-col gap-4">
        {editing && isRecurring && (
          <Field label={s["appointment.applyTo"]}>
            <div role="radiogroup" aria-label={s["appointment.applyTo"]} className="flex flex-col gap-1">
              {SCOPE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="radio" name="scope" checked={form.scope === o.value} onChange={() => set("scope", o.value)} />
                  {s[o.key]}
                </label>
              ))}
            </div>
          </Field>
        )}

        {/* Manual label (the Combobox does not consume Field context, which is
            an existing component this wave may not change). */}
        <div className="flex flex-col gap-2">
          <label htmlFor="appt-patient" className="text-xs font-medium text-text-primary">
            {s["appointment.patient"]}
            <span aria-hidden="true" className="text-error"> *</span>
          </label>
          <Combobox
            id="appt-patient"
            options={patientOptions}
            value={form.patientId || null}
            onChange={(v) => set("patientId", v)}
            query={patientQuery}
            onQueryChange={setPatientQuery}
            loading={patientLoading}
            placeholder={s["appointment.patientTypeToSearch"]}
            emptyLabel={s["appointment.patientSearchEmpty"]}
          />
        </div>

        <Field label={s["appointment.service"]}>
          <Select value={form.serviceId} onChange={(e) => onServiceChange(e.target.value)}>
            <option value="">{s["appointment.selectService"]}</option>
            {serviceOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field label={s["appointment.therapist"]} required>
          <Select
            value={form.practitionerId}
            onChange={(e) => {
              userChangedTherapist.current = true;
              set("practitionerId", e.target.value);
            }}
          >
            <option value="">{s["appointment.selectTherapist"]}</option>
            {options.therapists.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field label={s["appointment.room"]}>
          <Input value={form.room} onChange={(e) => set("room", e.target.value)} />
        </Field>

        <Field label={s["header.location"]} required>
          <Select value={form.locationId} onChange={(e) => set("locationId", e.target.value)}>
            <option value="">{s["appointment.selectLocation"]}</option>
            {options.locations.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap gap-3">
          <Field label={s["appointment.date"]} required>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label={s["appointment.time"]} required>
            <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
          </Field>
          <Field label={s["appointment.duration"]}>
            <Select value={String(form.durationMin)} onChange={(e) => set("durationMin", Number(e.target.value))}>
              {[...new Set([...DURATIONS, form.durationMin])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>{d} {s["appointment.minutesSuffix"]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <AvailabilityPanel
          therapistId={form.practitionerId}
          date={form.date}
          locationId={form.locationId}
          durationMin={form.durationMin}
          time={form.time}
          onPickTime={(hhmm) => set("time", hhmm)}
        />

        {!editing && (
          <div className="flex flex-col gap-3">
            <Checkbox
              label={s["appointment.recurringCheckbox"]}
              checked={form.repeatFreq !== "none"}
              onChange={(e) => set("repeatFreq", e.target.checked ? "weekly" : "none")}
            />
            {form.repeatFreq !== "none" && (
              <div className="flex flex-wrap gap-3">
                <Field label={s["appointment.repeat"]}>
                  <Select value={form.repeatFreq} onChange={(e) => set("repeatFreq", e.target.value as FormState["repeatFreq"])}>
                    {FREQ_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{s[o.key]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={s["appointment.occurrences"]}>
                  <Input
                    type="number"
                    min={2}
                    max={52}
                    value={String(form.occurrences)}
                    onChange={(e) => set("occurrences", Math.max(2, Number(e.target.value) || 2))}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field label={s["appointment.status"]}>
          <Select value={form.status} onChange={(e) => set("status", e.target.value as AppointmentStatusValue)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{s[o.key]}</option>
            ))}
          </Select>
        </Field>

        {/* Confirmation axis (0024) — read-only display, ORTHOGONAL to the
            "Estado" lifecycle Select above. Never derived from `form.status`
            and never edited here (BACKLOG specs a display only, no edit
            control); shown separately so the two are never visually or
            semantically conflated. Manual label, same reasoning as the
            patient Combobox above: not a Field-wrapped form control. */}
        {editing && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-primary">{s["appointment.confirmation"]}</span>
            <ConfirmationIndicator state={editing.confirmationState} showLabel />
            {editing.confirmationReceivedAt && (
              <p className="text-xs text-text-secondary">
                {s["appointment.confirmationReceivedAt"]}{": "}
                {new Date(editing.confirmationReceivedAt).toLocaleString("pt-PT")}
                {editing.confirmationChannel ? ` · ${editing.confirmationChannel}` : ""}
              </p>
            )}
          </div>
        )}

        <Field label={s["appointment.notes"]}>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>

        {conflicts && (
          <Banner tone="warning">
            <span className="flex flex-col gap-1">
              {therapistConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictTherapist"]} items={therapistConflicts} />}
              {roomConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictRoom"]} items={roomConflicts} />}
              {availabilityConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictAvailability"]} items={availabilityConflicts} />}
              {timeOffConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictTimeOff"]} items={timeOffConflicts} />}
            </span>
          </Banner>
        )}

        {error && (
          <p role="alert" className="text-sm text-error">{error}</p>
        )}
      </div>
    </Drawer>
  );
}

const TIME_OFF_REASON_KEY: Record<string, StringKey> = {
  vacation: "appointment.timeOffReasonVacation",
  sick: "appointment.timeOffReasonSick",
  holiday: "appointment.timeOffReasonHoliday",
  other: "appointment.timeOffReasonOther",
};

function ConflictLine({ heading, items }: { heading: string; items: ConflictInfo[] }) {
  return (
    <span className="block">
      <span className="font-medium">{heading}</span>
      {": "}
      {items
        .map((c) => {
          const lead = c.patientName ?? (c.reason ? s[TIME_OFF_REASON_KEY[c.reason] ?? "appointment.timeOffReasonOther"] : null);
          const prefix = [lead, c.room].filter(Boolean).join(" · ");
          const time = `${formatTimeOfDay(new Date(c.startsAt))}-${formatTimeOfDay(new Date(c.endsAt))}`;
          return prefix ? `${prefix}: ${time}` : time;
        })
        .join("; ")}
    </span>
  );
}

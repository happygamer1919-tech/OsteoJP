"use client";

import { useMemo, useState } from "react";
import { s, locale } from "@/lib/i18n";
import {
  cancelAppointment,
  createAppointment,
  rescheduleAppointment,
  updateAppointment,
} from "@/lib/scheduling/actions";
import {
  formatInstantTime,
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
const TEAL = "#45B9A7";

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

export function AppointmentModal({
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
  const editing = state.mode === "edit" ? state.appt : null;
  const isRecurring = !!(
    editing &&
    (editing.recurrenceRule || editing.recurrenceParentId)
  );

  const init = useMemo<FormState>(() => {
    if (editing) {
      const start = new Date(editing.startsAt);
      const parts = lisbonParts(start);
      const durationMin = Math.round(
        (new Date(editing.endsAt).getTime() - start.getTime()) / 60_000,
      );
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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onServiceChange(serviceId: string) {
    const svc = options.services.find((o) => o.id === serviceId);
    setForm((f) => ({
      ...f,
      serviceId,
      durationMin: svc ? svc.durationMin : f.durationMin,
    }));
  }

  async function submit(allowConflict: boolean) {
    setError(null);
    if (
      !form.patientId ||
      !form.practitionerId ||
      !form.locationId ||
      !form.date ||
      !form.time ||
      form.durationMin <= 0
    ) {
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
        const recurrence =
          form.repeatFreq !== "none"
            ? { freq: form.repeatFreq, count: form.occurrences }
            : null;
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
        onDone();
        return;
      }

      const scope = form.scope;

      // Cancelling routes through the delete-capability action.
      if (form.status === "cancelled" && editing.status !== "cancelled") {
        const r = await cancelAppointment(editing.id, form.notes || undefined, {
          scope,
        });
        if (!handleResult(r)) return;
        onDone();
        return;
      }

      // Non-temporal edits first (incl. room) so a later reschedule sees the
      // persisted room when checking room conflicts at the new time.
      const patch: Parameters<typeof updateAppointment>[1] = {};
      if (form.serviceId !== (editing.serviceId ?? "")) {
        patch.serviceId = form.serviceId || null;
      }
      if (form.room !== (editing.room ?? "")) patch.room = form.room || null;
      if (form.notes !== (editing.notes ?? "")) patch.notes = form.notes || null;
      if (form.status !== editing.status && form.status !== "cancelled") {
        patch.status = form.status;
      }
      if (Object.keys(patch).length > 0) {
        const r = await updateAppointment(editing.id, patch, {
          scope,
          allowConflict,
        });
        if (!handleResult(r)) return;
      }

      // Temporal change. For scope one a date change counts; for following/
      // series only time-of-day / duration / therapist / location propagate.
      const timeOfDayChanged =
        form.time !== init.time || form.durationMin !== init.durationMin;
      const practOrLocChanged =
        form.practitionerId !== editing.practitionerId ||
        form.locationId !== editing.locationId;
      const dateChanged = form.date !== init.date;
      const temporalChanged =
        scope === "one"
          ? dateChanged || timeOfDayChanged || practOrLocChanged
          : timeOfDayChanged || practOrLocChanged;

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
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  /** Returns true on success; renders the right message and returns false otherwise. */
  function handleResult(r: {
    ok: boolean;
    error?: string;
    conflicts?: ConflictInfo[];
  }): boolean {
    if (r.ok) return true;
    if (r.error === "conflict") {
      setConflicts(r.conflicts ?? []);
    } else if (r.error === "forbidden") {
      setError(s["errors.forbidden"]);
    } else if (r.error === "validation") {
      setError(s["appointment.requiredFields"]);
    } else if (r.error === "unauthenticated") {
      setError(s["errors.unauthenticated"]);
    } else {
      setError(s["errors.generic"]);
    }
    return false;
  }

  const therapistConflicts = conflicts?.filter((c) => c.kind === "therapist") ?? [];
  const roomConflicts = conflicts?.filter((c) => c.kind === "room") ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8EE] px-5 py-3">
          <h2 className="text-base font-semibold text-[#1A2733]">
            {editing ? s["appointment.editTitle"] : s["appointment.newTitle"]}
            {isRecurring && (
              <span className="ml-2 align-middle text-xs font-normal text-[#8E2C7A]">
                ⟳ {s["appointment.recurring"]}
              </span>
            )}
          </h2>
          <button
            type="button"
            aria-label={s["appointment.close"]}
            onClick={onClose}
            className="rounded p-1 text-[#56697A] hover:bg-[#F0F3F6]"
          >
            ✕
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          {/* Series scope — only for an appointment that belongs to a series. */}
          {editing && isRecurring && (
            <Field label={s["appointment.applyTo"]}>
              <div className="flex flex-col gap-1">
                {SCOPE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="scope"
                      checked={form.scope === o.value}
                      onChange={() => set("scope", o.value)}
                    />
                    {s[o.key]}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <Field label={s["appointment.patient"]} required>
            <Select
              value={form.patientId}
              onChange={(v) => set("patientId", v)}
              placeholder={s["appointment.selectPatient"]}
              options={options.patients}
            />
          </Field>

          <Field label={s["appointment.service"]}>
            <Select
              value={form.serviceId}
              onChange={onServiceChange}
              placeholder={s["appointment.selectService"]}
              options={options.services}
            />
          </Field>

          <Field label={s["appointment.therapist"]} required>
            <Select
              value={form.practitionerId}
              onChange={(v) => set("practitionerId", v)}
              placeholder={s["appointment.selectTherapist"]}
              options={options.therapists}
            />
          </Field>

          <Field label={s["appointment.room"]}>
            <input
              type="text"
              value={form.room}
              onChange={(e) => set("room", e.target.value)}
              className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label={s["header.location"]} required>
            <Select
              value={form.locationId}
              onChange={(v) => set("locationId", v)}
              placeholder={s["appointment.selectLocation"]}
              options={options.locations}
            />
          </Field>

          <div className="flex gap-3">
            <Field label={s["appointment.date"]} required>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label={s["appointment.time"]} required>
              <input
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
                className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label={s["appointment.duration"]}>
              <select
                value={form.durationMin}
                onChange={(e) => set("durationMin", Number(e.target.value))}
                className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
              >
                {[...new Set([...DURATIONS, form.durationMin])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d} {s["appointment.minutesSuffix"]}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          {/* Recurrence — create only. */}
          {!editing && (
            <div className="flex gap-3">
              <Field label={s["appointment.repeat"]}>
                <select
                  value={form.repeatFreq}
                  onChange={(e) =>
                    set("repeatFreq", e.target.value as FormState["repeatFreq"])
                  }
                  className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
                >
                  <option value="none">{s["appointment.repeatNone"]}</option>
                  {FREQ_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {s[o.key]}
                    </option>
                  ))}
                </select>
              </Field>
              {form.repeatFreq !== "none" && (
                <Field label={s["appointment.occurrences"]}>
                  <input
                    type="number"
                    min={2}
                    max={52}
                    value={form.occurrences}
                    onChange={(e) =>
                      set("occurrences", Math.max(2, Number(e.target.value) || 2))
                    }
                    className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
                  />
                </Field>
              )}
            </div>
          )}

          <Field label={s["appointment.status"]}>
            <select
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as AppointmentStatusValue)
              }
              className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {s[o.key]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={s["appointment.notes"]}>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full rounded border border-[#C7D1DA] px-2 py-1.5 text-sm"
            />
          </Field>

          {conflicts && (
            <div className="space-y-2">
              {therapistConflicts.length > 0 && (
                <ConflictBlock
                  heading={s["agenda.conflictTherapist"]}
                  detail={s["appointment.conflictTherapistDetail"]}
                  items={therapistConflicts}
                />
              )}
              {roomConflicts.length > 0 && (
                <ConflictBlock
                  heading={s["agenda.conflictRoom"]}
                  detail={s["appointment.conflictRoomDetail"]}
                  items={roomConflicts}
                />
              )}
            </div>
          )}

          {error && <p className="text-sm text-[#B23A3A]">{error}</p>}

          <p className="text-xs text-[#8A98A6]">{s["appointment.deleteHint"]}</p>

          <div className="flex justify-end gap-2 border-t border-[#E2E8EE] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#C7D1DA] px-3 py-1.5 text-sm text-[#1A2733] hover:bg-[#F0F3F6]"
            >
              {s["common.cancel"]}
            </button>
            {conflicts ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit(true)}
                className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "#B47A14" }}
              >
                {s["appointment.saveAnyway"]}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: TEAL }}
              >
                {s["appointment.save"]}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function ConflictBlock({
  heading,
  detail,
  items,
}: {
  heading: string;
  detail: string;
  items: ConflictInfo[];
}) {
  return (
    <div className="rounded border border-[#B47A14] bg-[#FBF1DD] px-3 py-2 text-sm text-[#1A2733]">
      <p className="font-medium">
        ⚠ {heading}: {detail}
      </p>
      <ul className="mt-1 list-disc pl-5 text-xs">
        {items.map((c) => (
          <li key={`${c.kind}:${c.id}`}>
            {c.patientName}
            {c.room ? ` · ${c.room}` : ""}: {formatInstantTime(new Date(c.startsAt), locale)}–
            {formatInstantTime(new Date(c.endsAt), locale)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block flex-1 space-y-1">
      <span className="text-sm font-medium text-[#56697A]">
        {label}
        {required && <span className="text-[#B23A3A]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { id: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[#C7D1DA] bg-white px-2 py-1.5 text-sm text-[#1A2733]"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useMemo, useState } from "react";
import { s } from "@/lib/i18n";
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
import { locale } from "@/lib/i18n";
import type {
  AgendaAppointment,
  AgendaOptions,
  AppointmentStatusValue,
  ConflictInfo,
} from "@/lib/scheduling/types";

export type ModalState =
  | { mode: "create"; slot?: { date: string; time: string } }
  | { mode: "edit"; appt: AgendaAppointment };

const DURATIONS = [30, 45, 60, 90];
const STATUS_RADIOS: { value: AppointmentStatusValue; key: string }[] = [
  { value: "scheduled", key: "appointment.statusPending" },
  { value: "confirmed", key: "appointment.statusConfirmed" },
  { value: "cancelled", key: "appointment.statusCancelled" },
];

const TEAL = "#45B9A7";

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

  const init = useMemo(() => {
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
        status: editing.status as AppointmentStatusValue,
        notes: editing.notes ?? "",
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
      status: "scheduled" as AppointmentStatusValue,
      notes: "",
    };
  }, [editing, state, anchor, options.locations]);

  const [form, setForm] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
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
          allowConflict,
        });
        if (!handleResult(r)) return;
        onDone();
        return;
      }

      // Edit mode. Cancelling routes through the delete-capability action.
      if (form.status === "cancelled" && editing.status !== "cancelled") {
        const r = await cancelAppointment(editing.id, form.notes || undefined);
        if (!handleResult(r)) return;
        onDone();
        return;
      }

      const temporalChanged =
        startISO !== editing.startsAt ||
        endISO !== editing.endsAt ||
        form.practitionerId !== editing.practitionerId ||
        form.locationId !== editing.locationId;

      if (temporalChanged) {
        const r = await rescheduleAppointment(editing.id, {
          startsAt: startISO,
          endsAt: endISO,
          practitionerId: form.practitionerId,
          locationId: form.locationId,
          allowConflict,
        });
        if (!handleResult(r)) return;
      }

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
        const r = await updateAppointment(editing.id, patch);
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

          <Field label={s["appointment.status"]}>
            <div className="flex gap-4">
              {STATUS_RADIOS.map((r) => (
                <label key={r.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="status"
                    checked={form.status === r.value}
                    onChange={() => set("status", r.value)}
                  />
                  {s[r.key as keyof typeof s]}
                </label>
              ))}
            </div>
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
            <div className="rounded border border-[#B47A14] bg-[#FBF1DD] px-3 py-2 text-sm text-[#1A2733]">
              <p className="font-medium">⚠ {s["appointment.conflictTherapistDetail"]}</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {c.patientName}: {formatInstantTime(new Date(c.startsAt), locale)}–
                    {formatInstantTime(new Date(c.endsAt), locale)}
                  </li>
                ))}
              </ul>
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

"use client";

import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { AppointmentSelector } from "@/components/appointment-selector";
import { PatientSelector } from "@/components/patient-selector";
import { appendAppointmentNoteAction, appendPatientNoteAction } from "@/lib/patients/actions";

const MAX_LEN = 5000;

/**
 * Notas Rápidas (W12-13, notes unification R3/R6) — append a note to the UNIFIED
 * store, in two modes:
 *   - PATIENT mode (default): pick a patient, leave the appointment as "nota
 *     geral" → a patient-level note (`appointment_id = NULL`).
 *   - APPOINTMENT mode: also pick one of the patient's appointments → a note on
 *     that specific visit (`appointment_id` set), which reflects on the Agenda /
 *     Marcações hover too.
 * The mode is the AppointmentSelector's value: null = patient-level, an id =
 * appointment. A note added here shows on the patient profile Notas tab.
 */
export function NotasRapidas() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSelectPatient(value: string): void {
    setPatientId(value);
    // A new patient invalidates any appointment picked for the previous one.
    setAppointmentId(null);
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!patientId) {
      setError(s["dashboard.quickNotePatientRequired"]);
      return;
    }
    const content = text.trim();
    if (!content) {
      setError(s["dashboard.quickNoteRequired"]);
      return;
    }
    startTransition(async () => {
      const r = appointmentId
        ? await appendAppointmentNoteAction(appointmentId, content)
        : await appendPatientNoteAction(patientId, content);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setText("");
      setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-v2-text-secondary">
          {s["dashboard.quickNotePatient"]}
        </span>
        <PatientSelector
          value={patientId}
          onChange={onSelectPatient}
          emptyLabel={s["dashboard.quickNoteNoPatient"]}
          placeholder={s["dashboard.quickNotePatientPlaceholder"]}
          ariaLabel={s["dashboard.quickNotePatient"]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-v2-text-secondary">
          {s["dashboard.quickNoteAppointment"]}
        </span>
        <AppointmentSelector
          patientId={patientId}
          value={appointmentId}
          onChange={setAppointmentId}
          patientLevelLabel={s["dashboard.quickNotePatientLevel"]}
          ariaLabel={s["dashboard.quickNoteAppointment"]}
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_LEN}
        rows={4}
        aria-label={s["dashboard.notes"]}
        placeholder={s["dashboard.notesPlaceholder"]}
        className="w-full resize-none rounded-md border border-v2-border bg-transparent p-3 text-sm text-v2-text-primary placeholder:text-v2-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        {saved && !pending && (
          <p role="status" className="text-xs text-v2-text-secondary">
            {s["dashboard.notesSaved"]}
          </p>
        )}
        <Button type="submit" loading={pending} variant="primary">
          {s["common.save"]}
        </Button>
      </div>
    </form>
  );
}

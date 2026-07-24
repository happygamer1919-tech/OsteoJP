"use client";

import { useEffect, useState } from "react";
import { Select } from "@osteojp/ui";
import { listPatientAppointmentsForNoteAction } from "@/lib/notes/appointment-options";

/**
 * AppointmentSelector (W12-13, notes unification R6) — the shared picker for
 * "one of a patient's appointments, or none". Given a selected patient it loads
 * that patient's appointments (server-side, tenant + role scoped) and renders a
 * native `@osteojp/ui` Select whose FIRST option is the patient-level choice
 * (value "" → `onChange(null)`), followed by each appointment. This is the two
 * modes of the Início notes block in one control: pick nothing = a patient-level
 * note; pick an appointment = a note on that specific visit. Extracted from the
 * inline select in `DeclaracaoDialog.tsx` so it is not copied a second time.
 * Strings are passed in so it stays i18n-agnostic.
 */
export function AppointmentSelector({
  patientId,
  value,
  onChange,
  patientLevelLabel,
  ariaLabel,
}: {
  /** The chosen patient; null disables the control (nothing to pick). */
  patientId: string | null;
  /** Selected appointment id, or null for the patient-level choice. */
  value: string | null;
  onChange: (appointmentId: string | null) => void;
  /** Label for the first, patient-level (no specific visit) option. */
  patientLevelLabel: string;
  ariaLabel?: string;
}) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);

  // All setState happens inside the async callback (never synchronously in the
  // effect body) so a patient change re-loads without cascading renders.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = patientId ? await listPatientAppointmentsForNoteAction(patientId) : [];
      if (!cancelled) setOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      disabled={!patientId}
      aria-label={ariaLabel}
      data-testid="note-appointment-selector"
    >
      <option value="">{patientLevelLabel}</option>
      {options.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </Select>
  );
}

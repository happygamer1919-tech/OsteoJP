"use client";

import { Combobox, type ComboboxOption } from "@osteojp/ui";
import { useEffect, useMemo, useState } from "react";

import { s } from "@/lib/i18n";
import { searchPatientsAction } from "@/lib/patients/actions";

/**
 * W5-02: async patient search Combobox for the record-creation form, replacing
 * the Select that listed every patient (a list that always exceeds a
 * screenful). Same pattern and server action as the agenda drawer and the
 * start-consultation screen (min 2 chars, 300 ms debounce); searchPatientsAction
 * is the SAME role-scoped read those surfaces already use — no visibility
 * change. The selection is carried to createRecordAction via a hidden
 * `patientId` input (the action validates it server-side, as before).
 *
 * `initial` pre-selects a patient when arriving from an episode
 * ("+ New record in this episode"), mirroring the old Select's defaultValue.
 */
export function PatientPicker({
  initial,
}: {
  initial: { id: string; name: string } | null;
}) {
  const [patientId, setPatientId] = useState<string | null>(initial?.id ?? null);
  const [query, setQuery] = useState(initial?.name ?? "");
  const [results, setResults] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Below the 2-char minimum show the pre-selected patient (if any) so the
  // prefill is visible without a round-trip — same as the edit drawer.
  const options = useMemo<ComboboxOption[]>(() => {
    if (query.trim().length < 2)
      return initial ? [{ value: initial.id, label: initial.name }] : [];
    return results;
    // initial is stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      searchPatientsAction(q)
        .then((rows) =>
          setResults(rows.map((r) => ({ value: r.id, label: r.label }))),
        )
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    // The Combobox does not consume Field context (same as the appointment
    // drawer and start-consultation), so it takes a manual <label htmlFor>.
    <div className="block space-y-1">
      <label htmlFor="clinical-new-patient" className="block text-sm font-medium">
        {s["clinical.patient"]} *
      </label>
      <Combobox
        id="clinical-new-patient"
        options={options}
        value={patientId}
        onChange={(v) => setPatientId(v)}
        query={query}
        onQueryChange={setQuery}
        loading={loading}
        placeholder={s["clinical.patientTypeToSearch"]}
        emptyLabel={s["clinical.patientSearchEmpty"]}
      />
      <input type="hidden" name="patientId" value={patientId ?? ""} />
    </div>
  );
}

"use client";

import { Combobox, type ComboboxOption } from "@osteojp/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { s } from "@/lib/i18n";
import { searchPatientsAction } from "@/lib/patients/actions";

export type PickerEpisode = { id: string; patientId: string; title: string };

/**
 * W5-02 + W5-04 — Paciente + Episódio fields for the create-record form.
 *
 * Paciente is an async search Combobox (W5-02): the old Select listed EVERY
 * patient (a list that always exceeds a screenful). It uses the SAME
 * role-scoped `searchPatientsAction` as the agenda drawer and the
 * start-consultation screen (min 2 chars, 300 ms debounce) — no visibility
 * change. The selection is carried to createRecordAction via a hidden
 * `patientId` input (the action validates it server-side, as before).
 *
 * The Episódio dropdown (W5-04) is scoped to the currently selected patient:
 * it lists only that patient's episodes plus "Sem episódio". With no patient
 * selected it offers only "Sem episódio". Purely presentational filtering of a
 * list the caller already loaded under the `clinical_records:read` gate +
 * `runScoped` (a subset of what the role can read — visibility is never
 * widened here).
 *
 * `children` renders BETWEEN the two fields so the server-rendered Modelo
 * picker passes through untouched and the field sequence
 * (Paciente, Modelo, Episódio) is preserved (Batch 4 owns that picker).
 *
 * `initialPatient` pre-selects a patient when arriving from an episode
 * ("+ New record in this episode"); `defaultEpisodeId` prefills that episode,
 * but only while its own patient stays selected (switching patients resets the
 * field to "Sem episódio" via the remount key below).
 */
export function PatientEpisodeFields({
  episodes,
  initialPatient,
  defaultEpisodeId,
  children,
}: {
  episodes: PickerEpisode[];
  initialPatient: { id: string; name: string } | null;
  defaultEpisodeId?: string;
  children?: ReactNode;
}) {
  const [patientId, setPatientId] = useState<string | null>(
    initialPatient?.id ?? null,
  );
  const [query, setQuery] = useState(initialPatient?.name ?? "");
  const [results, setResults] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Below the 2-char minimum show the pre-selected patient (if any) so the
  // prefill is visible without a round-trip — same as the edit drawer.
  const options = useMemo<ComboboxOption[]>(() => {
    if (query.trim().length < 2)
      return initialPatient
        ? [{ value: initialPatient.id, label: initialPatient.name }]
        : [];
    return results;
    // initialPatient is stable for the page's lifetime.
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

  const scopedEpisodes = patientId
    ? episodes.filter((e) => e.patientId === patientId)
    : [];
  // The episode prefill (deep link from an episode page) only applies while
  // that episode's own patient is selected.
  const episodeDefault =
    patientId === (initialPatient?.id ?? null) ? (defaultEpisodeId ?? "") : "";

  return (
    <>
      {/* The Combobox does not consume Field context (same as the appointment
          drawer and start-consultation), so it takes a manual <label htmlFor>. */}
      <div className="block space-y-1">
        <label
          htmlFor="clinical-new-patient"
          className="block text-sm font-medium"
        >
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

      {children}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["clinical.episode"]}</span>
        <select
          key={patientId ?? ""}
          name="episodeId"
          defaultValue={episodeDefault}
          className="block w-full rounded border px-2 py-1.5 text-sm"
        >
          <option value="">{s["clinical.episodeNone"]}</option>
          {scopedEpisodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

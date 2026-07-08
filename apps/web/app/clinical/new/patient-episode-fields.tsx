"use client";

import { useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";

const s = getStrings(DEFAULT_LOCALE);

export type PickerPatient = { id: string; fullName: string };
export type PickerEpisode = { id: string; patientId: string; title: string };

/**
 * W5-04 — Paciente + Episódio fields for the create-record form.
 *
 * The Episódio dropdown is scoped to the currently selected patient: it lists
 * only that patient's episodes plus "Sem episódio". With no patient selected
 * it offers only "Sem episódio". Purely presentational filtering of a list the
 * caller already loaded under the `clinical_records:read` gate + `runScoped`
 * (a subset of what the role can read — visibility is never widened here).
 *
 * `children` renders BETWEEN the two fields so the server-rendered Modelo
 * picker passes through untouched and the field sequence
 * (Paciente, Modelo, Episódio) is preserved (Batch 4 owns that picker).
 */
export function PatientEpisodeFields({
  patients,
  episodes,
  defaultPatientId,
  defaultEpisodeId,
  children,
}: {
  patients: PickerPatient[];
  episodes: PickerEpisode[];
  defaultPatientId?: string;
  defaultEpisodeId?: string;
  children?: ReactNode;
}) {
  const [patientId, setPatientId] = useState(defaultPatientId ?? "");
  const scopedEpisodes = patientId
    ? episodes.filter((e) => e.patientId === patientId)
    : [];
  // The episode prefill (deep link from an episode page) only applies while
  // that episode's own patient is selected; switching patients resets the
  // field to "Sem episódio" via the remount key below.
  const episodeDefault =
    patientId === (defaultPatientId ?? "") ? (defaultEpisodeId ?? "") : "";

  return (
    <>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["clinical.patient"]} *</span>
        <select
          name="patientId"
          required
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="block w-full rounded border px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            {s["clinical.selectPatient"]}
          </option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
      </label>

      {children}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["clinical.episode"]}</span>
        <select
          key={patientId}
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

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PatientEpisodeFields,
  type PickerEpisode,
  type PickerPatient,
} from "./patient-episode-fields";

// W5-04 — the Episódio picker is scoped to the selected patient.
//
// The component receives the full (already read-gated + tenant-scoped) episode
// list and must only SURFACE the selected patient's episodes, plus the fixed
// "Sem episódio" option. These renders assert the initial HTML for a given
// selection; the interactive re-filter on patient change is covered by the
// create-flow e2e (clinical.spec.ts).

const PATIENT_A: PickerPatient = {
  id: "00000000-0000-0000-0000-0000000000aa",
  fullName: "Paciente A",
};
const PATIENT_B: PickerPatient = {
  id: "00000000-0000-0000-0000-0000000000bb",
  fullName: "Paciente B",
};

const EPISODES: PickerEpisode[] = [
  { id: "00000000-0000-0000-0000-0000000000e1", patientId: PATIENT_A.id, title: "Lombalgia A1" },
  { id: "00000000-0000-0000-0000-0000000000e2", patientId: PATIENT_A.id, title: "Cervicalgia A2" },
  { id: "00000000-0000-0000-0000-0000000000e3", patientId: PATIENT_B.id, title: "Ciatalgia B1" },
];

function render(props: Partial<Parameters<typeof PatientEpisodeFields>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(PatientEpisodeFields, {
      patients: [PATIENT_A, PATIENT_B],
      episodes: EPISODES,
      ...props,
    }),
  );
}

describe("PatientEpisodeFields — patient-scoped Episódio options", () => {
  it("lists only patient A's episodes (B's excluded) plus Sem episódio when A is selected", () => {
    const html = render({ defaultPatientId: PATIENT_A.id });
    expect(html).toContain("Lombalgia A1");
    expect(html).toContain("Cervicalgia A2");
    expect(html).not.toContain("Ciatalgia B1");
    expect(html).toContain("Sem episódio");
  });

  it("lists only patient B's episodes (A's excluded) plus Sem episódio when B is selected", () => {
    const html = render({ defaultPatientId: PATIENT_B.id });
    expect(html).toContain("Ciatalgia B1");
    expect(html).not.toContain("Lombalgia A1");
    expect(html).not.toContain("Cervicalgia A2");
    expect(html).toContain("Sem episódio");
  });

  it("offers only Sem episódio when no patient is selected", () => {
    const html = render();
    expect(html).toContain("Sem episódio");
    expect(html).not.toContain("Lombalgia A1");
    expect(html).not.toContain("Cervicalgia A2");
    expect(html).not.toContain("Ciatalgia B1");
    // Exactly one option in the episode select.
    const episodeSelect = html.match(/<select[^>]*name="episodeId"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(episodeSelect).not.toBe("");
    expect(episodeSelect.match(/<option/g)).toHaveLength(1);
  });

  it("preselects the episode prefill for its own patient (deep link from an episode)", () => {
    const html = render({
      defaultPatientId: PATIENT_A.id,
      defaultEpisodeId: "00000000-0000-0000-0000-0000000000e1",
    });
    // Attribute order is not guaranteed: grab the selected option tag, then its value.
    const episodeSelect = html.match(/<select[^>]*name="episodeId"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    const selectedTag = episodeSelect.match(/<option[^>]*\bselected\b[^>]*>/)?.[0] ?? "";
    expect(selectedTag.match(/value="([^"]*)"/)?.[1]).toBe("00000000-0000-0000-0000-0000000000e1");
  });

  it("renders children (the untouched Modelo picker) between Paciente and Episódio", () => {
    const html = renderToStaticMarkup(
      createElement(
        PatientEpisodeFields,
        {
          patients: [PATIENT_A, PATIENT_B],
          episodes: EPISODES,
          defaultPatientId: PATIENT_A.id,
        },
        createElement("select", { name: "formTemplateId" }),
      ),
    );
    const patientIdx = html.indexOf('name="patientId"');
    const templateIdx = html.indexOf('name="formTemplateId"');
    const episodeIdx = html.indexOf('name="episodeId"');
    expect(patientIdx).toBeGreaterThan(-1);
    expect(templateIdx).toBeGreaterThan(patientIdx);
    expect(episodeIdx).toBeGreaterThan(templateIdx);
  });
});

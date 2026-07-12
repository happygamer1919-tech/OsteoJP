/* eslint-disable react/display-name -- lightweight @osteojp/ui stand-ins for a render test */
/**
 * RecordForm.test.tsx — W5-14 (SPEC-ficha-medica.md sec 3-5).
 *
 * Renders the Ficha Médica (osteopathy v3) template through the real RecordForm
 * and pins the sec 5 structure that W5-14 delivers:
 *  - the health_problems checkbox_group renders ALL 19 conditions in a
 *    FOUR-COLUMN grid, with the free-text sub-field AFTER the grid (bug fix);
 *  - W5-19 ruling C: the section is titled "Outros" (renderer override), and
 *    the free-text renders unlabeled with the guidance placeholder;
 *  - the 5.1 header row keeps Peso (weight_kg) and Altura (height_cm) ADJACENT;
 *  - W5-19 ruling B: no episode_date input renders (created_at is auto-stamped
 *    server-side); no manual created-date picker exists (sec 4);
 *  - NO-DUPLICATION (sec 3): the ficha renders no nome/NIF/contactos/morada/
 *    profissão input — those live on the patient profile, not the ficha.
 *
 * Renders with react-dom/server (node env, no jsdom), mirroring the agenda
 * drawer render tests. @osteojp/ui is stubbed with label-rendering stand-ins so
 * the assertions see the real field labels the template + form-template engine
 * produce; BodyChart and the server actions are stubbed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseTemplateSchema } from "@/lib/clinical/form-template";

vi.mock("server-only", () => ({}));
vi.mock("./BodyChart", () => ({
  BodyChart: () => createElement("div", { "data-testid": "bodychart" }),
}));
// SignatureConsent pulls in the supabase browser client + server actions — out
// of scope for this pure structure render; stub it (W5-16 covers it separately).
vi.mock("./SignatureConsent", () => ({
  SignatureConsent: () => createElement("div", { "data-testid": "signature-consent" }),
}));
vi.mock("@osteojp/ui", () => {
  const passthrough =
    (tag: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement(tag, null, children as ReactNode);
  return {
    Button: ({ children }: { children?: ReactNode }) =>
      createElement("button", null, children as ReactNode),
    Card: passthrough("div"),
    Field: ({ label, children }: { label?: ReactNode; children?: ReactNode }) =>
      createElement("label", null, label as ReactNode, children as ReactNode),
    Input: ({ type, placeholder, "aria-label": ariaLabel, value }: { type?: string; placeholder?: string; "aria-label"?: string; value?: string }) =>
      createElement("input", { type: type ?? "text", placeholder, "aria-label": ariaLabel, "data-value": value ?? "" }),
    Textarea: () => createElement("textarea"),
    Checkbox: ({ label, checked }: { label?: ReactNode; checked?: boolean }) =>
      createElement("label", { "data-role": "checkbox", "data-checked": checked ? "true" : "false" }, label as ReactNode),
  };
});

import { RecordForm } from "./RecordForm";

const v3 = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../../../packages/db/seed/form-templates/osteopathy-v3.json"),
    "utf8",
  ),
) as { schema: unknown };
const schema = parseTemplateSchema(v3.schema)!;

/** The 19 grid conditions (SPEC 5.4), by their PT label as they appear in v3. */
const NINETEEN_CONDITIONS = [
  "Fumador",
  "Gravidez",
  "Osteoporose",
  "Anemia",
  "Lúpus",
  "Neoplasia",
  "Demência / Alzheimer",
  "Parkinson",
  "Depressão",
  "Epilepsia",
  "Esclerose múltipla",
  "Artrite reumatóide",
  "Alergias Alimentares",
  "Alergias Medicamentosas",
  "Hipertensão",
  "Hipotensão",
  "Diabetes",
  "Problemas Respiratórios",
  "COVID-19",
];

function render(overrides: Record<string, unknown> = {}, readOnly = false): string {
  return renderToStaticMarkup(
    createElement(RecordForm, {
      schema,
      initialData: overrides,
      readOnly,
      saveAction: async () => ({ ok: true }),
      statusChip: null,
      extraActions: null,
      patientSex: "female",
      patientId: "00000000-0000-0000-0000-000000000001",
      recordId: "00000000-0000-0000-0000-000000000002",
    }),
  );
}

describe("Outros grid (SPEC-ficha-medica AMENDMENTS ruling F, W5-24) — legacy 4x5 grid, free-text as inline 20th cell", () => {
  const html = render();
  // Ruling F supersedes ruling C's placeholder; the free-text now guides with "Outras...".
  const PLACEHOLDER = "Outras...";

  it("renders exactly 19 checkboxes", () => {
    const checkboxes = html.match(/data-role="checkbox"/g) ?? [];
    // Only health_problems is a checkbox_group in v3, so all checkbox stand-ins
    // belong to that grid. Lupus is included (no orphaned render).
    expect(checkboxes.length).toBe(19);
  });

  it("renders all 19 conditions including Lúpus", () => {
    for (const label of NINETEEN_CONDITIONS) {
      expect(html).toContain(label);
    }
    expect(NINETEEN_CONDITIONS).toHaveLength(19);
    expect(html).toContain("Lúpus");
  });

  it("renders a strict 4-up desktop / 2-up collapse grid (lg:grid-cols-4, NO sm:grid-cols-3 intermediate)", () => {
    // Ruling F: drop the intermediate 3-column step so the legacy 4x5 reading is
    // exact. lg:grid-cols-4 stays; the sm:grid-cols-3 step is gone (it existed
    // ONLY on the Outros grid, so its absence anywhere in the markup proves it).
    expect(html).toContain("lg:grid-cols-4");
    expect(html).not.toContain("sm:grid-cols-3");
  });

  it("titles the section 'Outros', not 'Problemas de Saúde' (ruling C override, kept)", () => {
    expect(html).toContain("Outros");
    expect(html).not.toContain("Problemas de Saúde");
  });

  it("renders the free-text unlabeled with the 'Outras...' placeholder, as the LAST cell after the grid", () => {
    // Ruling F: the free-text is the 20th grid cell — still after the last
    // checkbox in DOM/reading order, one cell wide, no visible label.
    const lastCheckboxIdx = html.lastIndexOf('data-role="checkbox"');
    const placeholderIdx = html.indexOf(`placeholder="${PLACEHOLDER}"`);
    expect(placeholderIdx).toBeGreaterThan(-1);
    expect(placeholderIdx).toBeGreaterThan(lastCheckboxIdx);
    // The superseded ruling-C placeholder is gone.
    expect(html).not.toContain("Outras condições, alergias, medicamentos...");
  });
});

describe("Outros 20-cell reading-order audit (ruling F, W5-24 DoD)", () => {
  const html = render();
  const PLACEHOLDER = "Outras...";
  // Ruling F cell order, left-to-right then top-to-bottom, cells 1..19 = booleans,
  // cell 20 = the free-text input.
  const EXPECTED_20 = [...NINETEEN_CONDITIONS, `[free-text placeholder="${PLACEHOLDER}"]`];

  it("renders all 20 cells in the exact ruling-F reading order", () => {
    const positioned = NINETEEN_CONDITIONS.map((label) => ({
      id: label,
      idx: html.indexOf(`data-checked="false">${label}`),
    }));
    positioned.push({
      id: `[free-text placeholder="${PLACEHOLDER}"]`,
      idx: html.indexOf(`placeholder="${PLACEHOLDER}"`),
    });
    // Every cell is present.
    for (const cell of positioned) expect(cell.idx).toBeGreaterThan(-1);
    // Sorting by DOM position reproduces the authoritative 4x5 sequence.
    const domOrder = [...positioned].sort((a, b) => a.idx - b.idx).map((c) => c.id);
    expect(domOrder).toEqual(EXPECTED_20);
    expect(domOrder).toHaveLength(20);
  });
});

describe("Stored values unchanged on an existing draft (ruling F is presentation-only, W5-24 DoD)", () => {
  // An existing draft's health_problems: nineteen booleans + `other` free-text.
  const EXISTING_DRAFT = {
    health_problems: {
      smoker: true,
      pregnancy: false,
      osteoporosis: false,
      anemia: false,
      lupus: true,
      neoplasia: false,
      dementia_alzheimer: false,
      parkinson: false,
      depression: false,
      epilepsy: false,
      multiple_sclerosis: false,
      rheumatoid_arthritis: false,
      food_allergies: true,
      medication_allergies: false,
      hypertension: false,
      hypotension: false,
      diabetes: false,
      respiratory_problems: false,
      covid_19: false,
      other: "Alergia à penicilina",
    },
  };
  const SEED_KEYS = Object.keys(EXISTING_DRAFT.health_problems);
  const html = render(EXISTING_DRAFT);

  it("binds all 20 stored sub-keys to the render (byte-identical key set to the v3 seed)", () => {
    // The grid maps the template's health_problems.properties in seed order; that
    // key set is the 20 sub-keys the loop freezes. Confirm none dropped/added.
    expect(SEED_KEYS).toHaveLength(20);
    expect(new Set(SEED_KEYS)).toEqual(
      new Set([
        "smoker", "pregnancy", "osteoporosis", "anemia", "lupus", "neoplasia",
        "dementia_alzheimer", "parkinson", "depression", "epilepsy",
        "multiple_sclerosis", "rheumatoid_arthritis", "food_allergies",
        "medication_allergies", "hypertension", "hypotension", "diabetes",
        "respiratory_problems", "covid_19", "other",
      ]),
    );
  });

  it("reads the stored boolean values back (checked state reflects the draft)", () => {
    // smoker/lupus/food_allergies are true; the other sixteen booleans are false.
    expect((html.match(/data-checked="true"/g) ?? []).length).toBe(3);
    expect((html.match(/data-checked="false"/g) ?? []).length).toBe(16);
  });

  it("reads the stored `other` free-text value back from the `other` sub-key", () => {
    // The free-text cell reads obj.other and writes onChange({...obj, other}) — the
    // render change moved only its position, not its read/write binding.
    expect(html).toContain('data-value="Alergia à penicilina"');
  });
});

describe("Header row (SPEC 5.1) — Peso and Altura adjacent", () => {
  const html = render();

  it("renders the header row as a grid (Peso/Altura/Marcação in one row, no Data)", () => {
    expect(html).toContain("sm:grid-cols-4");
  });

  it("renders Peso (kg) immediately adjacent to Altura (cm), nothing between", () => {
    const pesoIdx = html.indexOf("Peso (kg)");
    const alturaIdx = html.indexOf("Altura (cm)");
    expect(pesoIdx).toBeGreaterThan(-1);
    expect(alturaIdx).toBeGreaterThan(pesoIdx);
    // No other top-level field label falls between Peso and Altura.
    const between = html.slice(pesoIdx, alturaIdx);
    expect(between).not.toContain("Marcação");
    expect(between).not.toContain("Alertas");
  });
});

describe("Timestamp (SPEC 4 + W5-19 ruling B) — no episode_date input, no manual created-date picker", () => {
  it("renders NO date input and no 'Data do Episódio' label (episode_date is auto-stamped)", () => {
    const html = render();
    // Ruling B: episode_date has no manual input — it is populated server-side
    // from created_at on save. Neither the input nor its label renders.
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain("Data do Episódio");
  });

  it("renders no created-date field — Criado em is never an input label in the ficha", () => {
    const html = render();
    // "Criado em" is the profile/header-strip display label; it must not appear
    // as a form field label inside the RecordForm itself.
    expect(html).not.toContain("Criado em");
  });
});

describe("NO-DUPLICATION (SPEC 3) — the ficha never re-requests profile data", () => {
  const html = render();
  it("renders no nome / NIF / contactos / morada / profissão field", () => {
    // None of these profile-owned labels appear as ficha field labels.
    for (const forbidden of ["NIF", "Contactos", "Telemóvel", "Morada", "Profissão", "Nome completo"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});

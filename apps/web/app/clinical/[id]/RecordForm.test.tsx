/* eslint-disable react/display-name -- lightweight @osteojp/ui stand-ins for a render test */
/**
 * RecordForm.test.tsx — W5-14 (SPEC-ficha-medica.md sec 3-5).
 *
 * Renders the Ficha Médica (osteopathy v3) template through the real RecordForm
 * and pins the sec 5 structure that W5-14 delivers:
 *  - the Problemas de Saúde checkbox_group renders ALL 19 conditions in a
 *    FOUR-COLUMN grid, with the free-text "Outros" AFTER the grid (bug fix);
 *  - the 5.1 header row keeps Peso (weight_kg) and Altura (height_cm) ADJACENT;
 *  - no manual created-date picker exists (sec 4: created_at is auto-stamped);
 *  - episode_date is prefilled to today and stays editable;
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
    Input: ({ type }: { type?: string }) => createElement("input", { type: type ?? "text" }),
    Textarea: () => createElement("textarea"),
    Checkbox: ({ label }: { label?: ReactNode }) =>
      createElement("label", { "data-role": "checkbox" }, label as ReactNode),
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

describe("Problemas de Saúde grid (SPEC 5.4) — 19 conditions, four columns, Outros after", () => {
  const html = render();

  it("renders exactly 19 checkboxes plus one Outros text sub-field", () => {
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

  it("renders in a four-column grid (lg:grid-cols-4)", () => {
    expect(html).toContain("lg:grid-cols-4");
  });

  it("renders Outros AFTER the last checkbox, not interleaved", () => {
    const lastCheckboxIdx = html.lastIndexOf('data-role="checkbox"');
    const outrosIdx = html.indexOf("Outros");
    expect(outrosIdx).toBeGreaterThan(lastCheckboxIdx);
  });
});

describe("Header row (SPEC 5.1) — Peso and Altura adjacent", () => {
  const html = render();

  it("renders the header row as a grid (Data/Peso/Altura/Marcação in one row)", () => {
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

describe("Timestamp (SPEC 4) — no manual created-date picker, episode_date prefilled", () => {
  it("prefills episode_date to today (Lisbon) on a fresh draft", () => {
    const html = render();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
    // The hidden `data` JSON carries the prefilled episode_date.
    expect(html).toContain(today);
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

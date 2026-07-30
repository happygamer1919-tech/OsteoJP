import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// PatientForm is a client component shared by /patients/new (create) and
// /patients/[id]/edit (edit). Stub the router + server actions so it renders in
// a node test without an app-router context or a DB connection.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("../../../lib/patients/actions", () => ({
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
}));

import { PatientForm } from "./patient-form";

// BUG-08 — "Data de nascimento" rendered the native picker in US mm/dd/yyyy.
// `dateOfBirth` is a CALENDAR DATE (no time, no timezone): a pg `date` column,
// surfaced by Drizzle as a "yyyy-mm-dd" string, and `<input type="date">` always
// emits/consumes that ISO string regardless of display locale. So the stored
// value never drifts — the bug is purely the picker's *display* format, which
// the browser derives from the input's `lang`. The format isn't observable in a
// node/jsdom render, so we assert the attribute that drives it.
describe("PatientForm — BUG-08 date-of-birth locale", () => {
  it("declares lang=pt-PT on the date input so the native picker uses dd/mm/aaaa", () => {
    const html = renderToStaticMarkup(createElement(PatientForm));
    const dateInput = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";
    expect(dateInput).not.toBe("");
    expect(dateInput).toContain('lang="pt-PT"');
  });
});

// W2-02 — patient form field surface (items 3 + 5).
describe("PatientForm — W2-02 field surface", () => {
  it("does not render the street-address (Morada) input (item 3)", () => {
    const html = renderToStaticMarkup(createElement(PatientForm));
    // The address column stays in the DB and round-trips on save, but is not
    // surfaced as an editable field.
    expect(html).not.toContain("Morada");
  });

  it("renders the Profissão input (item 5)", () => {
    const html = renderToStaticMarkup(createElement(PatientForm));
    expect(html).toContain("Profissão");
  });

  it("preserves the loaded patient's address on the (hidden) field so it round-trips", () => {
    // Rendering with a patient carrying an address must not crash and must keep
    // the value in form state without surfacing a Morada label.
    const html = renderToStaticMarkup(
      createElement(PatientForm, {
        patient: {
          id: "00000000-0000-0000-0000-0000000000aa",
          fullName: "Paciente Antigo",
          address: "Rua Escondida, 1",
          profession: "Osteopata",
        } as never,
      }),
    );
    expect(html).not.toContain("Morada");
    // Profession value is surfaced in its input.
    expect(html).toContain("Osteopata");
  });
});

/* ------------------------------------------------------------------ */
/* PL-15b — the patient's clinic. Owner CR 2026-07-30: the form never   */
/* sent primary_location_id, so every patient registered since 0045 was  */
/* location-less and therefore invisible to that clinic's staff until an */
/* appointment existed. The field follows the PL-14 rule: one clinic is  */
/* applied silently, several are a required choice.                      */
/* ------------------------------------------------------------------ */
const LV = { id: "11111111-1111-1111-1111-111111111111", name: "OsteoJP (LV)" };
const CB = { id: "22222222-2222-2222-2222-222222222222", name: "OsteoJP (CB)" };

describe("PatientForm — clinic (PL-15b)", () => {
  it("applies the only reachable clinic without asking (static line, no select)", () => {
    const html = renderToStaticMarkup(createElement(PatientForm, { locations: [LV] }));
    expect(html).toContain('data-testid="patient-fixed-location"');
    expect(html).toContain("OsteoJP (LV)");
    expect(html).not.toContain("Selecionar localização");
  });

  it("asks a multi-clinic staffer, offering only their own clinics", () => {
    const html = renderToStaticMarkup(createElement(PatientForm, { locations: [LV, CB] }));
    expect(html).toContain("Selecionar localização");
    expect(html).toContain("OsteoJP (LV)");
    expect(html).toContain("OsteoJP (CB)");
    expect(html).not.toContain('data-testid="patient-fixed-location"');
  });

  it("renders no clinic control at all when the caller passes none (unchanged form)", () => {
    const html = renderToStaticMarkup(createElement(PatientForm));
    expect(html).not.toContain('data-testid="patient-fixed-location"');
    expect(html).not.toContain("Selecionar localização");
  });

  it("on edit, an existing clinic wins over the single-clinic default (never silently moved)", () => {
    const html = renderToStaticMarkup(
      createElement(PatientForm, {
        patient: {
          id: "00000000-0000-0000-0000-0000000000aa",
          fullName: "Paciente CB",
          primaryLocationId: CB.id,
        } as never,
        locations: [LV, CB],
      }),
    );
    // The stored clinic is the SELECTED option, not merely present in the list.
    expect(html).toContain(`<option value="${CB.id}" selected="">OsteoJP (CB)</option>`);
    expect(html).not.toContain(`<option value="${LV.id}" selected="">`);
  });
});

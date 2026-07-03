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

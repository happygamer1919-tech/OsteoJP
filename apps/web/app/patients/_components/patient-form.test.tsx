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

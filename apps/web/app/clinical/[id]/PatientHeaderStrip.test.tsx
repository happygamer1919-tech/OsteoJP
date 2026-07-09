/**
 * PatientHeaderStrip.test.tsx — W5-14 (SPEC-ficha-medica.md sec 3 / 4 / 5.0).
 *
 * The read-only patient header strip surfaces a few profile demographics plus
 * the record's auto-stamped creation instant, and contains NO inputs (it can
 * never re-request a profile field — the NO-DUPLICATION rule, sec 3).
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement("section", null, title as ReactNode, children as ReactNode),
}));

import { PatientHeaderStrip } from "./PatientHeaderStrip";

function render() {
  return renderToStaticMarkup(
    createElement(PatientHeaderStrip, {
      name: "Ana Silva",
      patientNumber: 42,
      dateOfBirth: "1985-03-14",
      sex: "female",
      profession: "Professora",
      createdAt: "2026-07-09T08:30:00.000Z",
    }),
  );
}

describe("PatientHeaderStrip (SPEC 3 / 5.0)", () => {
  const html = render();

  it("shows the patient name and demographics", () => {
    expect(html).toContain("Ana Silva");
    expect(html).toContain("0042"); // zero-padded patient number
    expect(html).toContain("Professora");
    expect(html).toContain("Feminino");
  });

  it("shows the auto-stamped creation instant (Lisbon display), never an input", () => {
    expect(html).toContain("Criado em");
    // Lisbon is UTC+1 in July → 08:30 UTC renders as 09:30.
    expect(html).toContain("09:30");
  });

  it("contains no <input> — it is display-only (NO-DUPLICATION rule)", () => {
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });
});

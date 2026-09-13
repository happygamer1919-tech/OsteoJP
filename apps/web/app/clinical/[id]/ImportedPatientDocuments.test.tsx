import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// G-D (2026-09-13): the imported ficha lists the patient's imported originals,
// read-only. A pure render test; apps/web/e2e/imported-record-preview.spec.ts is
// what opens the screen.

vi.mock("@/app/patients/[id]/document-actions", () => ({
  documentDownloadUrlAction: vi.fn(),
}));

import { ImportedPatientDocuments, type ImportedPatientDocument } from "./ImportedPatientDocuments";

const doc: ImportedPatientDocument = {
  id: "a1",
  fileName: "relatorio-original.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4096,
  storagePath: "t/migration/fisiozero/relatorio-original.pdf",
  createdAt: "2026-09-06T16:54:00.000Z",
};

const render = (items: ImportedPatientDocument[]) =>
  renderToStaticMarkup(createElement(ImportedPatientDocuments, { items }));

describe("ImportedPatientDocuments", () => {
  it("lists each imported file by name, with its size and an Abrir button", () => {
    const html = render([doc]);
    expect(html).toContain('data-testid="imported-patient-documents"');
    expect(html).toContain("Documentos importados do paciente");
    expect(html).toContain("relatorio-original.pdf");
    expect(html).toContain("4 KB");
    expect(html).toContain("Abrir");
  });

  it("is read-only: no input, textarea, select or form", () => {
    const html = render([doc]);
    expect(html).not.toMatch(/<(input|textarea|select|form)\b/);
  });

  it("says plainly when the patient has no imported documents", () => {
    const html = render([]);
    expect(html).toContain('data-testid="imported-patient-documents-empty"');
    expect(html).toContain("Este paciente não tem documentos importados.");
    expect(html).not.toContain("Abrir");
  });
});

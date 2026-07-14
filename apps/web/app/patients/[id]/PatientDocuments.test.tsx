import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// W6-06b - the Documentos tab was a flat bordered table; it now renders Card rows
// (name + meta hierarchy) and a heritage empty state, matching Registos/Faturacao.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn() }));
vi.mock("./document-actions", () => ({
  confirmDocumentAction: vi.fn(),
  createDocumentUploadUrlAction: vi.fn(),
  documentDownloadUrlAction: vi.fn(),
}));

import { PatientDocuments, type PatientDocument } from "./PatientDocuments";

const doc: PatientDocument = {
  id: "d1",
  fileName: "consentimento.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  storagePath: "path/consentimento.pdf",
  createdAt: "2026-03-02T09:00:00.000Z",
};

function render(items: PatientDocument[]) {
  return renderToStaticMarkup(
    createElement(PatientDocuments, { patientId: "p1", items, canUpload: false }),
  );
}

describe("PatientDocuments W6-06b strengthened layout", () => {
  it("renders documents as Card rows with name + size, not a bordered table", () => {
    const html = render([doc]);
    expect(html).toContain("consentimento.pdf");
    expect(html).toContain("2 KB");
    // No table markup remains.
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<tr");
  });

  it("shows a heritage empty state (not a bare paragraph) when there are no documents", () => {
    const html = render([]);
    // The strengthened empty state renders the title text.
    expect(html).toContain("Sem documentos");
    expect(html).not.toContain("<table");
  });
});

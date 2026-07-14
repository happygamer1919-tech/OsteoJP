import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// W6-06b - the Documentos tab was a flat bordered table; it renders Card rows
// (name + meta hierarchy), matching Registos/Faturacao.
//
// W7-03 - the redesign: a purple section header with a count, a contained
// accent-1 icon badge as each row's anchor, and an empty state with NO motif
// band above the icon (the "unwanted line" the owner kept seeing).

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

describe("PatientDocuments layout (W6-06b + W7-03)", () => {
  it("renders documents as Card rows with name + size, not a bordered table", () => {
    const html = render([doc]);
    expect(html).toContain("consentimento.pdf");
    expect(html).toContain("2 KB");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<tr");
  });

  it("W7-03: gives the tab a purple section header with a count", () => {
    const html = render([doc]);
    expect(html).toContain("border-accent-1-700");
    expect(html).toContain("Documentos");
  });

  it("W7-03: anchors each row with a contained accent-1 icon badge", () => {
    const html = render([doc]);
    expect(html).toContain("bg-accent-1-50");
    expect(html).toContain("text-accent-1-700");
  });

  it("shows an empty state (not a bare paragraph) when there are no documents", () => {
    const html = render([]);
    expect(html).toContain("Sem documentos");
    expect(html).not.toContain("<table");
  });
});

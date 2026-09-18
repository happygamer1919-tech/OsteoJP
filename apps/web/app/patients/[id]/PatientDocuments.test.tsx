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
// A factory REPLACES THE WHOLE MODULE, so every action the component imports
// has to appear here: one left out is `undefined` at call time, not a missing
// mock that announces itself.
vi.mock("./document-actions", () => ({
  confirmDocumentAction: vi.fn(),
  createDocumentUploadUrlAction: vi.fn(),
  documentDownloadUrlAction: vi.fn(),
  documentPreviewUrlAction: vi.fn(),
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

/**
 * The preview affordance is OFFERED BY TYPE, and the row decides it from the
 * same pure helper the server refuses with. A button that appears on a document
 * the server will not preview is a button that only ever produces an error.
 */
describe("the preview button appears only for what a browser can render", () => {
  const word: PatientDocument = {
    id: "d2",
    fileName: "relatorio.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 4096,
    storagePath: "path/relatorio.docx",
    createdAt: "2026-03-03T09:00:00.000Z",
  };
  const heic: PatientDocument = {
    ...word,
    id: "d3",
    fileName: "scan.heic",
    mimeType: "image/heic",
    storagePath: "path/scan.heic",
  };
  const untyped: PatientDocument = {
    ...word,
    id: "d4",
    fileName: "importado",
    mimeType: null,
    storagePath: "path/importado",
  };

  it("offers it on a PDF, beside Abrir rather than instead of it", () => {
    const html = render([doc]);
    expect(html).toContain("Pré-visualizar");
    // The affordance that already worked is untouched.
    expect(html).toContain("Abrir");
  });

  it("offers it on an image", () => {
    const html = render([{ ...doc, id: "d9", fileName: "ficha.jpg", mimeType: "image/jpeg" }]);
    expect(html).toContain("Pré-visualizar");
  });

  it("does NOT offer it on a Word document, a HEIC scan, or an untyped import", () => {
    // Each of these is uploadable (or, for the untyped row, already imported),
    // and none of them renders in Chrome or Firefox.
    const html = render([word, heic, untyped]);
    expect(html).not.toContain("Pré-visualizar");
    // ...and each still has the affordance it has always had.
    expect(html).toContain("Abrir");
  });

  it("renders no preview panel until somebody asks for one", () => {
    // The 60-second URL is minted on click, never on render: a list of twenty
    // documents must not mint twenty signed URLs nobody looked at.
    const html = render([doc]);
    expect(html).not.toContain("<object");
    expect(html).not.toContain("<img");
  });
});

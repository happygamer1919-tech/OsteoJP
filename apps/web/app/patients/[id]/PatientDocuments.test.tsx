import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// W6-06b - the Documentos tab was a flat bordered table; it renders Card rows
// (name + meta hierarchy), matching Registos/Faturacao.
//
// W7-03 - the redesign: a purple section header with a count, a contained
// accent-1 icon badge as each row's anchor, and an empty state with NO motif
// band above the icon (the "unwanted line" the owner kept seeing).
//
// SR-62 PU-4 - Eliminar per row for a patients:write role, opening a dialog with
// a REQUIRED reason whose confirm button is disabled until the reason is filled.
// A static render proves the markup; apps/web/e2e/patient-documents-soft-delete
// .spec.ts is what clicks it.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn() }));
vi.mock("./document-actions", () => ({
  confirmDocumentAction: vi.fn(),
  createDocumentUploadUrlAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
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

function render(items: PatientDocument[], canDelete = false) {
  return renderToStaticMarkup(
    createElement(PatientDocuments, { patientId: "p1", items, canUpload: false, canDelete }),
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

describe("PatientDocuments Eliminar (SR-62 PU-4)", () => {
  it("offers no Eliminar, no dialog and no reason field to a role that cannot delete", () => {
    const html = render([doc], false);
    expect(html).not.toContain(">Eliminar<");
    expect(html).not.toContain("Eliminar documento");
    expect(html).not.toContain("<textarea");
  });

  it("puts an Eliminar button on each row for a role that can delete, keyed by the row id", () => {
    const html = render([doc, { ...doc, id: "d2", fileName: "outro.pdf" }], true);
    // Button wraps its label in a <span>; "Eliminar documento" (the dialog) is a different string.
    expect(html.match(/<span>Eliminar<\/span>/g) ?? []).toHaveLength(2);
    expect(html).toContain('data-document-id="d1"');
    expect(html).toContain('data-document-id="d2"');
  });

  it("the dialog asks for a REQUIRED reason, capped at 500, and says the file is kept", () => {
    const html = render([doc], true);
    expect(html).toContain("Eliminar documento");
    expect(html).toContain("Motivo (obrigatório)");
    expect(html).toContain("O ficheiro não é apagado");
    expect(html).toMatch(/<textarea[^>]*required=""[^>]*maxLength="500"|<textarea[^>]*maxLength="500"[^>]*required=""/);
  });

  it("the confirm button is DISABLED while the reason is empty", () => {
    const html = render([doc], true);
    const confirm = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Eliminar documento(?:(?!<\/button>)[\s\S])*<\/button>/);
    expect(confirm, "the confirm button rendered").not.toBeNull();
    expect(confirm![0]).toMatch(/<button[^>]*\sdisabled=""/);
  });
});

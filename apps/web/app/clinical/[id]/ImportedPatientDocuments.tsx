"use client";
import { Button, Card } from "@osteojp/ui";
import { FileText } from "lucide-react";
import { s } from "@/lib/i18n";
import { documentDownloadUrlAction } from "@/app/patients/[id]/document-actions";

/** One imported original, as listed under an imported registo. */
export type ImportedPatientDocument = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  createdAt: string;
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * G-D (2026-09-13) - THE PATIENT'S IMPORTED DOCUMENTS, UNDER AN IMPORTED REGISTO.
 *
 * Every Fisiozero original arrived at patient level, so an imported ficha read
 * "Sem anexos" while its source document sat on the patient's Documentos tab.
 * This lists those originals beside the imported content so the clinic can open
 * them from the ficha.
 *
 * READ-ONLY BY CONSTRUCTION: no upload input, no delete, no form. The only
 * action is Abrir, which asks the SAME server action the Documentos tab uses for
 * a 60-second signed URL (patients:read, tenant-prefix checked). Bytes never pass
 * through Next.
 */
export function ImportedPatientDocuments({ items }: { items: ImportedPatientDocument[] }) {
  // SR-62 PU-4: the action takes the document ID and signs the path stored on a
  // live row, so a document soft-deleted on the Documentos tab cannot be opened.
  async function download(documentId: string) {
    const { url } = await documentDownloadUrlAction(documentId);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section
      aria-labelledby="imported-patient-documents-title"
      data-testid="imported-patient-documents"
      className="mt-6 space-y-3"
    >
      <div className="flex items-center gap-3 border-l-2 border-accent-1-700 pl-3">
        <h2 id="imported-patient-documents-title" className="text-base font-semibold text-text-primary">
          {s["clinical.importedDocumentsTitle"]}
        </h2>
        <span className="text-sm tabular-nums text-text-secondary">{items.length}</span>
      </div>
      <p className="text-sm text-text-secondary">{s["clinical.importedDocumentsHelp"]}</p>

      {items.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="imported-patient-documents-empty">
          {s["clinical.importedDocumentsEmpty"]}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((d) => (
            // Card forwards no data-* props, so the row id sits on a wrapper.
            <div key={d.id} data-document-id={d.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-1-50">
                      <FileText
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="text-accent-1-700"
                      />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-text-primary">{d.fileName}</span>
                      <span className="text-sm tabular-nums text-text-secondary">
                        {formatSize(d.sizeBytes)} · {dateFmt.format(new Date(d.createdAt))}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => download(d.id)}
                  >
                    {s["patients.documentOpen"]}
                  </Button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

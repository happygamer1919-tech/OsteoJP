// EPI-01b, piece 3: several per-record report PDFs joined into one document.
//
// The pages are COPIED, never redrawn. Each part is the byte buffer
// `renderClinicalReportPdf` (pdf.ts) produced for one registo, so every page of
// the joined file is the page the per-record PDF prints: the same header and
// logo, the same clinical body, the same signature block and footer. There is
// one layout, and it lives in pdf.ts.
//
// Pure pdf-lib, no database and no `server-only`: node-testable like pdf.ts.

import { PDFDocument } from "pdf-lib";

/**
 * Join `parts` into one PDF, in the order given, each part's pages in its own
 * order. `title` is the document title (the per-record report's own).
 */
export async function mergeReportPdfs(
  parts: readonly Uint8Array[],
  title: string,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(title);
  for (const bytes of parts) {
    const part = await PDFDocument.load(bytes);
    const pages = await out.copyPages(part, part.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

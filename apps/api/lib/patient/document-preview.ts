// Which of a patient's own documents the portal can render IN PLACE, and as what.
//
// ===========================================================================
// THIS IS A SECOND COPY OF A FOUR-LINE LIST, AND THAT IS DELIBERATE
// ===========================================================================
// The staff side has the same list at apps/web/lib/patients/document-preview.ts.
// apps/api and apps/web share no application package - the bucket name is
// already duplicated between them for exactly this reason (PATIENT_DOCUMENTS_
// BUCKET here, ATTACHMENTS_BUCKET there) - so the choice was a new shared
// package for four strings, or a copy with a pointer. The copy is pinned by its
// own test, and the list is a property of what BROWSERS render, not of either
// app, so it does not drift with either app's features.
//
// WHY THESE FOUR, AND NOT THE EIGHT THAT CAN BE UPLOADED:
//   application/pdf, image/jpeg, image/png, image/webp  -> every browser.
//   image/heic, image/heif -> Safari yes, Chrome and Firefox no. A patient on
//     Android would get a blank panel, which reads as a broken document.
//   application/msword, .docx -> no browser renders either.
//
// A type not on this list keeps the affordance it already has: Transferir.

/** How a previewable document is rendered. */
export type DocumentPreviewKind = "pdf" | "image";

/** The types the portal preview renders. Mirrors the staff module. */
export const PREVIEWABLE_DOCUMENT_MIME: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * The preview kind for a stored MIME type, or null when it is not previewable.
 *
 * Null in, null out: an imported document whose vendor export carried no
 * `tipo_mime` is not guessed at from its file name.
 */
export function documentPreviewKind(
  mimeType: string | null | undefined,
): DocumentPreviewKind | null {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (!mime) return null;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return "image";
  return null;
}

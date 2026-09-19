// Which of the patient's documents the portal OFFERS to preview.
//
// THE SERVER DECIDES; THIS ONLY DECIDES WHETHER TO ASK. The refusal that
// matters lives in apps/api (lib/patient/download.ts refuses before signing, and
// the route 404s). This list exists so the button is absent for a document the
// server would refuse, instead of present and always failing.
//
// THIRD COPY OF FOUR LITERALS, and the same reason as the second: apps/portal,
// apps/api and apps/web share no application package, exactly as the storage
// bucket name is spelled out in each of them. Every copy is pinned by its own
// test to the same four values, so a change made in one place and not the others
// turns a suite red rather than making two screens disagree about one file.
//
//   apps/web/lib/patients/document-preview.ts   (staff Documentos tab)
//   apps/api/lib/patient/document-preview.ts    (the refusal that counts)
//   this file                                   (whether to show the button)

/** The types the portal offers to render in place. */
export const PREVIEWABLE_DOCUMENT_MIME: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

/**
 * Should the preview button appear for this document?
 *
 * A document with no stored type is NOT offered: the import leaves `mime_type`
 * null wherever the vendor export omitted it, and a guess from the file name is
 * how a panel ends up rendering something other than what it claims.
 */
export function isDocumentPreviewable(mimeType: string | null | undefined): boolean {
  const mime = (mimeType ?? '').trim().toLowerCase()
  return mime !== '' && PREVIEWABLE_DOCUMENT_MIME.includes(mime)
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A document id is a uuid and nothing else. The preview action is a server
 * action, so its argument is whatever a session holder chooses to send, and it
 * is about to become a path segment of a request made with their bearer token.
 */
export function isDocumentId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id)
}

/**
 * What goes back to the browser: `url` and `kind`, copied out one by one. The
 * body is never forwarded whole, so a response that is not a preview (or is more
 * than one) cannot ride along.
 */
export function narrowPreviewResponse(
  body: unknown,
): { url: string; kind: 'pdf' | 'image' } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { url, kind } = body as { url?: unknown; kind?: unknown }
  if (typeof url !== 'string' || url === '') return null
  if (kind !== 'pdf' && kind !== 'image') return null
  return { url, kind }
}

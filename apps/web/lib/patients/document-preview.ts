// Which patient documents can be shown INSIDE the app, and as what.
//
// Pure and framework-free, like document-validation next door: the same function
// decides the affordance in the browser (show the button or do not) and the
// refusal on the server (sign an inline URL or do not). One list, two callers,
// no way for them to disagree.
//
// ===========================================================================
// A PREVIEW IS NOT A NEW WAY TO REACH THE BYTES
// ===========================================================================
// The only affordance today is "Abrir", which mints a 60-second signed Storage
// URL and hands it to a new browser tab. The preview mints THE SAME 60-second
// URL and renders it in place instead. No new bucket, no bucket policy, no
// longer-lived token, no wider role, and nothing becomes reachable that the
// same member of staff could not already open one click away.
//
// ===========================================================================
// THIS LIST IS NARROWER THAN THE UPLOAD ALLOW-LIST, ON PURPOSE
// ===========================================================================
// Uploads accept eight types (ALLOWED_DOCUMENT_MIME). Only four of them are
// things every browser on the desk renders natively:
//
//   application/pdf, image/jpeg, image/png, image/webp   -> previewed here.
//
//   image/heic, image/heif -> Safari renders them, Chrome and Firefox do not.
//     A preview that is a blank panel for most of the clinic is worse than no
//     preview, because it reads as a broken document rather than a missing
//     feature.
//   application/msword, .docx -> no browser renders either.
//
// A type that is not on this list is NOT an error and not a refusal the user
// sees: it simply keeps exactly the affordance it has today, "Abrir".
//
// Every type here is a subset of ALLOWED_DOCUMENT_MIME, asserted in the test:
// a type nobody can upload has no business being previewable.

/** How a previewable document is rendered. */
export type DocumentPreviewKind = "pdf" | "image";

/**
 * The types the in-app preview renders. Ordered as in ALLOWED_DOCUMENT_MIME so
 * the two lists read against each other.
 */
export const PREVIEWABLE_DOCUMENT_MIME: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * The preview kind for a stored MIME type, or null when the document is not
 * previewable and keeps "Abrir" alone.
 *
 * `mimeType` is nullable because the column is: every Fisiozero import row whose
 * vendor export omitted `tipo_mime` carries null, and an imported original with
 * no recorded type is exactly the row a guess would be wrong about. Null is not
 * previewable — never sniffed from the file name, which is attacker-supplied in
 * the general case and merely unreliable in this one.
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

/** Is this document previewable at all? The button's whole condition. */
export function isDocumentPreviewable(mimeType: string | null | undefined): boolean {
  return documentPreviewKind(mimeType) !== null;
}

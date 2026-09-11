// Patient-document upload validation (type + size). Pure and framework-free so
// it runs identically in the browser (pre-flight UX) and on the server (the
// real gate, in confirmPatientDocument). The clinical attachment flow (W4-05)
// shipped with no explicit type/size gate; patient administrative documents get
// one here because they are staff-uploaded arbitrary files (declarations,
// consent forms, identity docs, referrals) rather than in-visit clinical media.

/**
 * Max upload size: 50 MiB (INC-patient-document-over-15mb-refused). It was 15 MB,
 * and a scanned RGPD document over that was refused at the desk.
 *
 * THIS CONSTANT IS THE WHOLE CAP. The bytes never pass through a Vercel function
 * (browser -> Storage on a signed upload URL, see PatientDocuments.tsx), so the
 * ~4.5 MB function body limit does not apply, and production's
 * `clinical-attachments` bucket has file_size_limit NULL (read 2026-09-11). What
 * sits above this is the Storage project's global upload limit, a dashboard
 * setting that 50 MiB must not exceed.
 */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/**
 * Accepted MIME types for patient documents. Documents (PDF), images (scans /
 * photos of paper forms), and plain office document formats. Deliberately NOT
 * executables/archives — a document store, not a file drop.
 */
export const ALLOWED_DOCUMENT_MIME: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** `accept` attribute string for the file input (UX hint, not a security gate). */
export const DOCUMENT_ACCEPT = ALLOWED_DOCUMENT_MIME.join(",");

export type DocumentValidationError = "type" | "size";

/**
 * Validate a candidate upload. Returns null when acceptable, otherwise the
 * first failing reason. `mimeType` may be null/empty (some browsers omit it):
 * an absent type is rejected as "type" rather than silently allowed.
 */
export function validateDocumentUpload(input: {
  mimeType: string | null;
  sizeBytes: number;
}): DocumentValidationError | null {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (!mime || !ALLOWED_DOCUMENT_MIME.includes(mime)) return "type";
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) return "size";
  return null;
}

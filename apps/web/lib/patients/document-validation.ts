// Upload validation (type + size) for everything staff attach. Pure and
// framework-free so it runs identically in the browser (pre-flight UX) and on
// the server (the real gate).
//
// IT IS NOW ONE GATE FOR BOTH SURFACES, AND IT RUNS BEFORE THE UPLOAD URL IS
// SIGNED. It was written for patient administrative documents (declarations,
// consent forms, identity docs, referrals); the clinical attachment flow (W4-05)
// carried no explicit type or size gate. H5: both upload-URL minters call it
// before they sign anything — `createPatientDocumentUploadUrl` and
// `createAttachmentUploadUrl` — so a refused candidate is answered with no
// token. Both confirms call it too, because a server action can be invoked
// without minting anything first.
//
// WHAT IT CHECKS, STATED NARROWLY, BECAUSE THE WIDER CLAIM IS NOT ONE THIS
// MODULE CAN KEEP. The inputs are `File.type` and `Blob.size`. This is a policy
// check on the type and size the client reports; content-level verification is
// Q-H5-4.

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
 * What the browser reports about a file before a single byte has moved: the two
 * values both upload-URL minters require in order to sign anything, and the same
 * two both confirms re-check.
 *
 * `sizeBytes` IS NOT NULLABLE, AND THAT IS THE AGREEMENT BETWEEN THE TWO GATES.
 * A size that is not known cannot be checked against a ceiling, so an unknown
 * size is a refusal and not a zero. Mapping one onto the other at one caller and
 * not the other is how the mint and the confirm come to disagree about the same
 * file.
 */
export type UploadCandidate = { mimeType: string | null; sizeBytes: number };

/**
 * Validate a candidate upload. Returns null when acceptable, otherwise the
 * first failing reason. `mimeType` may be null/empty (some browsers omit it):
 * an absent type is rejected as "type" rather than silently allowed.
 *
 * THE SIZE RULE IS WRITTEN AGAINST A FORGED PAYLOAD, not only against the
 * TypeScript type. A server action deserialises whatever the client sends, so
 * `sizeBytes` can arrive as null, a string or NaN however it is typed here;
 * anything that is not a finite number fails as "size".
 */
export function validateDocumentUpload(input: UploadCandidate): DocumentValidationError | null {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (!mime || !ALLOWED_DOCUMENT_MIME.includes(mime)) return "type";
  const size = input.sizeBytes;
  if (typeof size !== "number" || !Number.isFinite(size)) return "size";
  if (size <= 0 || size > MAX_DOCUMENT_BYTES) return "size";
  return null;
}

/**
 * SR-62 PU-4: the longest reason a soft delete of a patient document accepts,
 * counted AFTER trimming. Long enough for "carregado no paciente errado, é do
 * irmão, Bernardo" several times over; short enough that the field stays a
 * reason and not a note. The textarea's maxLength mirrors it.
 */
export const DOCUMENT_DELETE_REASON_MAX = 500;

export type DeleteReasonError = "reason_required" | "reason_too_long";

/**
 * Normalise the reason typed into the Eliminar dialog. Pure, so the dialog
 * (disabled confirm) and the writer (the real gate) apply the same rule.
 *
 * Whitespace-only is REQUIRED-missing, not a reason: the owner ruled a reason is
 * required, and "   " answers nothing. A non-string is treated the same way, so
 * a forged server-action payload cannot slip a number or null past the gate.
 * Migration 0089's CHECK refuses a blank reason at the database too.
 */
export function normalizeDeleteReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; error: DeleteReasonError } {
  if (typeof raw !== "string") return { ok: false, error: "reason_required" };
  const reason = raw.trim();
  if (reason.length === 0) return { ok: false, error: "reason_required" };
  if (reason.length > DOCUMENT_DELETE_REASON_MAX) return { ok: false, error: "reason_too_long" };
  return { ok: true, reason };
}

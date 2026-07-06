// Shared attachment-upload orchestration reused by BOTH the file-input picker
// and the in-page camera capture (W4-05). Extracted so the 3-step signed-URL
// flow has ONE implementation and is unit-testable with injected deps (the web
// test env is node — no DOM, no network). The steps mirror the original inline
// flow in Attachments.tsx: sign -> upload-direct-to-Storage -> confirm+audit.

export interface AttachmentUploadDeps {
  /** Server action: issue a one-time signed upload URL (path is tenant-prefixed). */
  createUploadUrl: (
    recordId: string,
    fileName: string,
  ) => Promise<{ ok: true; path: string; token: string } | { ok: false }>;
  /** Upload bytes DIRECTLY to Supabase Storage — never proxied through Next. */
  uploadToStorage: (
    path: string,
    token: string,
    blob: Blob,
  ) => Promise<{ error: unknown }>;
  /** Server action: record the row + write the audit entry. */
  confirmAttachment: (input: {
    recordId: string;
    path: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
  }) => Promise<{ ok: boolean }>;
}

export type AttachmentUploadOutcome =
  | { ok: true }
  | { ok: false; step: "sign" | "upload" | "confirm" };

/**
 * Run a blob (a picked File or a camera-captured still) through the existing
 * signed-URL attachment path and attach it to a draft record.
 */
export async function uploadAttachmentBlob(
  recordId: string,
  blob: Blob,
  fileName: string,
  mimeType: string | null,
  deps: AttachmentUploadDeps,
): Promise<AttachmentUploadOutcome> {
  const slot = await deps.createUploadUrl(recordId, fileName);
  if (!slot.ok) return { ok: false, step: "sign" };

  const up = await deps.uploadToStorage(slot.path, slot.token, blob);
  if (up.error) return { ok: false, step: "upload" };

  const res = await deps.confirmAttachment({
    recordId,
    path: slot.path,
    fileName,
    mimeType,
    sizeBytes: blob.size,
  });
  if (!res.ok) return { ok: false, step: "confirm" };

  return { ok: true };
}

"use server";
import { revalidatePath } from "next/cache";
import { requireRequestContext } from "@/lib/auth/context";
import {
  confirmPatientDocument,
  createPatientDocumentDownloadUrl,
  createPatientDocumentPreviewUrl,
  createPatientDocumentUploadUrl,
} from "@/lib/patients/documents";
import type { DocumentPreviewKind } from "@/lib/patients/document-preview";

// Server actions for the patient Documentos tab. Each re-derives the request
// context (never trusts the client for identity) and gates inside the lib
// helpers (patients:write for upload, patients:read for download). The bytes
// never pass through here — the client uploads/downloads directly against the
// signed Storage URLs these actions mint.

export async function createDocumentUploadUrlAction(
  patientId: string,
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireRequestContext();
  try {
    const { path, token } = await createPatientDocumentUploadUrl(ctx, patientId, fileName);
    return { ok: true, path, token };
  } catch {
    return { ok: false };
  }
}

export async function confirmDocumentAction(input: {
  patientId: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<{ ok: boolean }> {
  const ctx = await requireRequestContext();
  try {
    await confirmPatientDocument(ctx, input);
    revalidatePath(`/patients/${input.patientId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function documentDownloadUrlAction(
  path: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  try {
    return { url: await createPatientDocumentDownloadUrl(ctx, path) };
  } catch {
    return { url: null };
  }
}

/**
 * A 60s signed INLINE url for the in-page preview panel.
 *
 * It passes an ID rather than a path, unlike the download action above, so the
 * server resolves the row itself under the Documentos tab's own predicate. A
 * failure of any kind - not this patient's, not previewable, not there - comes
 * back as the same `ok: false`, so the client cannot tell them apart either.
 */
export async function documentPreviewUrlAction(
  patientId: string,
  documentId: string,
): Promise<
  { ok: true; url: string; kind: DocumentPreviewKind; fileName: string } | { ok: false }
> {
  const ctx = await requireRequestContext();
  try {
    const preview = await createPatientDocumentPreviewUrl(ctx, patientId, documentId);
    return { ok: true, ...preview };
  } catch {
    return { ok: false };
  }
}

"use server";
import { revalidatePath } from "next/cache";
import { ForbiddenError } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { isClinicalError } from "@/lib/clinical/errors";
import {
  confirmPatientDocument,
  createPatientDocumentDownloadUrl,
  createPatientDocumentUploadUrl,
  softDeletePatientDocument,
} from "@/lib/patients/documents";

// Server actions for the patient Documentos tab. Each re-derives the request
// context (never trusts the client for identity) and gates inside the lib
// helpers (patients:write for upload and soft delete, patients:read for
// download). The bytes never pass through here — the client uploads/downloads
// directly against the signed Storage URLs these actions mint.

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

/**
 * SR-62 PU-4: the download takes a DOCUMENT ID, not a Storage path. The server
 * resolves a live Documentos row and signs the path stored on it, so a
 * soft-deleted document cannot be opened and a client cannot name a path.
 */
export async function documentDownloadUrlAction(
  documentId: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  try {
    return { url: await createPatientDocumentDownloadUrl(ctx, documentId) };
  } catch {
    return { url: null };
  }
}

export type DeleteDocumentActionError =
  | "reason_required"
  | "reason_too_long"
  | "already_deleted"
  | "not_found"
  | "forbidden"
  | "error";

const PASSED_THROUGH: ReadonlySet<string> = new Set<DeleteDocumentActionError>([
  "reason_required",
  "reason_too_long",
  "already_deleted",
  "not_found",
]);

/**
 * SR-62 PU-4 — soft delete one patient document with a required reason. Every
 * rule is enforced in softDeletePatientDocument; this maps its refusals to codes
 * the dialog can word, and never echoes the reason or an internal message.
 */
export async function deleteDocumentAction(
  documentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: DeleteDocumentActionError }> {
  const ctx = await requireRequestContext();
  try {
    const { patientId } = await softDeletePatientDocument(ctx, { documentId, reason });
    revalidatePath(`/patients/${patientId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    if (isClinicalError(e) && PASSED_THROUGH.has(e.code)) {
      return { ok: false, error: e.code as DeleteDocumentActionError };
    }
    return { ok: false, error: "error" };
  }
}

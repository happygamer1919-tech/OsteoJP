"use server";
import { revalidatePath } from "next/cache";
import { requireRequestContext } from "@/lib/auth/context";
import {
  confirmPatientDocument,
  createPatientDocumentDownloadUrl,
  createPatientDocumentUploadUrl,
} from "@/lib/patients/documents";

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

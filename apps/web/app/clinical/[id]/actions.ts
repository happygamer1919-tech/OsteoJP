"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, toClaims } from "@osteojp/auth";
import { locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  createAddendum,
  signAndLockRecord,
  updateRecordData,
} from "@/lib/clinical/records";
import {
  confirmAttachment,
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  ATTACHMENTS_BUCKET,
} from "@/lib/clinical/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateClinicalReportPdf } from "@/lib/clinical/report";
import { generateRgpdFormPdf } from "@/lib/clinical/rgpd/generate";
import {
  confirmPatientDocument,
  createPatientDocumentUploadUrl,
} from "@/lib/patients/documents";
import { isClinicalError } from "@/lib/clinical/errors";
import type { SaveState } from "./RecordForm";

export async function saveRecordAction(
  id: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const ctx = await requireRequestContext();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "error" };
  }
  try {
    await updateRecordData(ctx, id, data);
  } catch (e) {
    if (isClinicalError(e)) {
      return { ok: false, code: e.code, errors: e.fieldErrors };
    }
    return { ok: false, code: "error" };
  }
  revalidatePath(`/clinical/${id}`);
  return { ok: true };
}

export async function signRecordAction(id: string): Promise<void> {
  const ctx = await requireRequestContext();
  let m = "signed";
  try {
    await signAndLockRecord(ctx, id);
  } catch (e) {
    m = isClinicalError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath(`/clinical/${id}`);
  redirect(`/clinical/${id}?m=${m}`);
}

/**
 * Render the branded clinical-report PDF for a FINALIZED record and return a
 * short-lived SIGNED download URL. The PDF is generated server-side via the
 * read-only lib/clinical/report engine (which itself gates draft/under-review),
 * written to tenant-prefixed Storage, and handed back as a 60s Supabase signed
 * URL - the URL carries an opaque token + expiry only, never fiscal data, and
 * the bytes are never proxied through Next. Read-only on clinical_records.
 */
export async function downloadReportUrlAction(
  id: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  // Defense in depth beyond the layout gate: a direct action call still needs
  // clinical read. Reception (no clinical_records:read) is refused here.
  if (!can(ctx.role, "clinical_records:read")) return { url: null };

  try {
    // Tenant-scoped + finalized-only gate live inside the report engine (RLS in
    // load, print gate in buildClinicalReportModel). Draft / under-review throw.
    const pdf = await generateClinicalReportPdf(toClaims(ctx), id, locale);

    // Tenant-prefixed object path; record id only - no PII, no fiscal data.
    const path = `${ctx.tenantId}/reports/${id}/${randomUUID()}.pdf`;
    const admin = createSupabaseAdminClient();
    const up = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return { url: null };

    const signed = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 60, { download: pdf.filename });
    if (signed.error || !signed.data) return { url: null };
    return { url: signed.data.signedUrl };
  } catch {
    // not_found / not_printable / render failure - never surface internals/PII.
    return { url: null };
  }
}

/**
 * Generate the branded A4 RGPD print-and-sign form (SPEC sec 7.2) for a record's
 * patient and return a short-lived SIGNED download URL. The PDF is generated
 * server-side via lib/clinical/rgpd (tenant-scoped read), written to
 * tenant-prefixed Storage, and handed back as a 60s Supabase signed URL - the URL
 * carries an opaque token + expiry only, never PII, and the bytes are never
 * proxied through Next. The consent wording is final (W5-33).
 * Read-only on clinical_records. Available in any record status (this is a blank
 * consent form the patient signs by hand, not a finalized-record printout).
 */
export async function generateRgpdFormUrlAction(
  id: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  // A reader of clinical records may print the RGPD form. Reception (no
  // clinical_records:read) is refused here (defense in depth beyond the layout).
  if (!can(ctx.role, "clinical_records:read")) return { url: null };

  try {
    const pdf = await generateRgpdFormPdf(toClaims(ctx), id, locale);

    // Tenant-prefixed object path; record id only - no PII.
    const path = `${ctx.tenantId}/rgpd-forms/${id}/${randomUUID()}.pdf`;
    const admin = createSupabaseAdminClient();
    const up = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return { url: null };

    const signed = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 60, { download: pdf.filename });
    if (signed.error || !signed.data) return { url: null };
    return { url: signed.data.signedUrl };
  } catch {
    // not_found / render failure - never surface internals or PII.
    return { url: null };
  }
}

/**
 * Mint a one-time signed upload URL for the patient's on-screen SIGNATURE image
 * (SPEC sec 7.1). Reuses the patient-documents signed-URL path so the signature
 * lands in the patient's Documentos, tenant-scoped, signed URL only, never
 * public. Gated server-side on patients:write inside the lib helper. The bytes
 * are uploaded DIRECTLY to Storage by the client - never through Next.
 */
export async function createSignatureUploadUrlAction(
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

/**
 * Record the uploaded signature image as a patient document (Documentos) + audit
 * (patient_document.create). Gated on patients:write in the lib helper.
 */
export async function confirmSignatureAction(input: {
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

export async function versionRecordAction(id: string): Promise<void> {
  const ctx = await requireRequestContext();
  const { id: newId } = await createAddendum(ctx, id);
  revalidatePath(`/clinical/${newId}`);
  redirect(`/clinical/${newId}`);
}

/* Called programmatically from the Attachments client component. */

export async function createUploadUrlAction(
  recordId: string,
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireRequestContext();
  try {
    const { path, token } = await createAttachmentUploadUrl(ctx, recordId, fileName);
    return { ok: true, path, token };
  } catch {
    return { ok: false };
  }
}

export async function confirmAttachmentAction(input: {
  recordId: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<{ ok: boolean }> {
  const ctx = await requireRequestContext();
  try {
    await confirmAttachment(ctx, input);
    revalidatePath(`/clinical/${input.recordId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function downloadUrlAction(path: string): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  try {
    return { url: await createAttachmentDownloadUrl(ctx, path) };
  } catch {
    return { url: null };
  }
}

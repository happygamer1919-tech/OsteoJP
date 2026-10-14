"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, toClaims } from "@osteojp/auth";
import { locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  createAddendum,
  getRecordDetail,
  signAndLockRecord,
  updateRecordData,
} from "@/lib/clinical/records";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { recordRegistoExport, recordRgpdFormExport } from "@/lib/clinical/export-audit";
import { recordTermsAcceptance } from "@/lib/clinical/terms-acceptance";
import {
  confirmAttachment,
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  ATTACHMENTS_BUCKET,
} from "@/lib/clinical/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateRegistoReportPdf } from "@/lib/clinical/report";
import { generateRgpdFormPdf } from "@/lib/clinical/rgpd/generate";
import {
  confirmPatientDocument,
  createPatientDocumentUploadUrl,
} from "@/lib/patients/documents";
import type { UploadCandidate } from "@/lib/patients/document-validation";
import { isClinicalError } from "@/lib/clinical/errors";
import { isDataHash } from "@/lib/clinical/sign-sequence";
import type { SaveState } from "./RecordForm";

/**
 * Save the ficha, and — when staff ticked the box — record the patient's terms
 * acceptance in the same submit (W13-05: "captured when staff complete or update
 * the ficha").
 *
 * THE ACCEPTANCE IS WRITTEN AFTER THE RECORD SAVE, NOT BEFORE, and the order is
 * deliberate. `updateRecordData` refuses a finalized record and can fail
 * validation; writing an append-only acceptance first would leave a row that
 * cannot be withdrawn attached to a save that never happened. This way a failed
 * ficha save records nothing, and the checkbox survives in client state for the
 * retry.
 *
 * `patientId` is NOT taken from the form. It is read server-side from the record
 * being saved, so a tampered form field cannot attach one patient's acceptance
 * to another patient. The client sends one boolean and nothing else.
 */
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
  let dataHash: string;
  try {
    ({ dataHash } = await updateRecordData(ctx, id, data));
  } catch (e) {
    if (isClinicalError(e)) {
      return { ok: false, code: e.code, errors: e.fieldErrors };
    }
    return { ok: false, code: "error" };
  }

  if (formData.get("termsAccept") === "true") {
    try {
      const record = await getRecordDetail(ctx, id);
      if (record) {
        await recordTermsAcceptance(ctx, {
          patientId: record.patientId,
          acceptedAt: new Date(),
        });
      }
    } catch {
      // The ficha IS saved at this point. Reporting a generic error here would
      // tell the staff member their clinical edit was lost when it was not, so
      // the save reports success and the acceptance simply is not recorded —
      // which the unchanged "sem aceitacao registada" line on the next render
      // shows them truthfully.
      return { ok: true, code: "terms_not_recorded", dataHash };
    }
  }

  revalidatePath(`/clinical/${id}`);
  return { ok: true, dataHash };
}

/**
 * Sign and lock a draft. SIGN-CONFIRM-AND-SAVE-FIRST: called from the
 * confirmation dialog (SignConfirm), after any unsaved edits were saved, with
 * the fingerprint of the content the signer's form last loaded or saved. The
 * sign commits only while the stored content still has that fingerprint, so an
 * edit saved from another tab or by another person in between is refused
 * (`err:stale`), never signed unseen. The fingerprint comes from the client and
 * is checked for shape here; its only power is to make the sign refuse.
 */
export async function signRecordAction(id: string, expectedDataHash: string): Promise<void> {
  const ctx = await requireRequestContext();
  let m = "signed";
  if (!isDataHash(expectedDataHash)) {
    m = "err:invalid";
  } else {
    try {
      await signAndLockRecord(ctx, id, expectedDataHash);
    } catch (e) {
      m = isClinicalError(e) ? `err:${e.code}` : "err";
    }
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
 *
 * EXPORT-01: the record is read as the registo page reads it
 * (`generateRegistoReportPdf`: the capability, the therapist read scope, the
 * caller's RLS), so this answers for exactly the registos whose page opens for
 * the caller, an imported one included, and `{ url: null }` for every other.
 * An annulled registo is never refused: its PDF carries the annulment mark.
 *
 * THE AUDIT ROW (`clinical_record.export_pdf`, ids only) is written after the
 * file is stored and signed and before the URL is returned. If it cannot be
 * written, the URL is not handed out: no export leaves without its row. The
 * file just stored is then removed, best effort, since nothing will ever link
 * to it (the order and its reasons: lib/clinical/export-audit.ts).
 */
export async function downloadReportUrlAction(
  id: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  // Defense in depth beyond the layout gate: a direct action call still needs
  // clinical read. Reception (no clinical_records:read) is refused here.
  if (!can(ctx.role, "clinical_records:read")) return { url: null };
  if (!id) return { url: null };

  // ROUTE 6. AFTER the capability and shape checks, BEFORE the render: every
  // call that gets past here writes a NEW PERMANENT Storage object under a
  // random path that nothing overwrites and nothing cleans up.
  if (!(await documentGenerationAllowed(ctx.userId))) {
    return { url: null };
  }

  try {
    // The page's read reach and the finalized-only gate live inside the report
    // engine (scope and RLS in load, print gate in buildClinicalReportModel).
    // Draft / under-review throw.
    const pdf = await generateRegistoReportPdf(ctx, id, locale);

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

    try {
      await recordRegistoExport(ctx, id);
    } catch {
      return unaudited(admin, path, "registo-pdf");
    }
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
 *
 * THE AUDIT ROW (`patient.export_pdf`, document `rgpd_form`, ids only) is
 * written after the file is stored and signed and before the URL is returned,
 * as for the report above: no row, no URL, and the file just stored is removed.
 */
export async function generateRgpdFormUrlAction(
  id: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  // A reader of clinical records may print the RGPD form. Reception (no
  // clinical_records:read) is refused here (defense in depth beyond the layout).
  if (!can(ctx.role, "clinical_records:read")) return { url: null };
  if (!id) return { url: null };

  // ROUTE 6. Same reasoning and the same ceiling as the report above: this
  // writes a permanent object per call.
  if (!(await documentGenerationAllowed(ctx.userId))) {
    return { url: null };
  }

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

    try {
      await recordRgpdFormExport(ctx, id);
    } catch {
      return unaudited(admin, path, "rgpd-form");
    }
    return { url: signed.data.signedUrl };
  } catch {
    // not_found / render failure - never surface internals or PII.
    return { url: null };
  }
}

/**
 * AN EXPORT WHOSE AUDIT ROW COULD NOT BE WRITTEN HANDS OUT NOTHING. The file
 * just stored will never be linked to, so it is removed: best effort, since
 * the answer is the same whether or not the removal works. One line is logged,
 * because the screen shows this like any refusal and a write that fails every
 * time would otherwise stop every export unseen. The line names the document
 * and the step and nothing else: no id, no error object, no message text.
 */
async function unaudited(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  path: string,
  document: "registo-pdf" | "rgpd-form",
): Promise<{ url: null }> {
  try {
    await admin.storage.from(ATTACHMENTS_BUCKET).remove([path]);
  } catch {
    // Nothing to add: the audit failure is what is logged below.
  }
  console.error(`[${document}] the export failed at step: audit`);
  return { url: null };
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
  file: UploadCandidate,
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireRequestContext();
  try {
    const { path, token } = await createPatientDocumentUploadUrl(ctx, patientId, fileName, file);
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
  // As on the other two confirms: the shape the mint takes, so one rule reads
  // one pair of values at both ends.
  mimeType: string | null;
  sizeBytes: number;
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
  let newId: string;
  try {
    ({ id: newId } = await createAddendum(ctx, id));
  } catch (e) {
    // A refusal stays on the record with a message, as signing does: chiefly
    // `not_found` for a patient the caller neither treats nor created, which
    // createAddendum refuses from this change on (the permission matrix, and
    // 0097's INSERT policy once applied). Any other fault still throws.
    if (!isClinicalError(e)) throw e;
    redirect(`/clinical/${id}?m=err:${e.code}`);
  }
  revalidatePath(`/clinical/${newId}`);
  redirect(`/clinical/${newId}`);
}

/* Called programmatically from the Attachments client component. */

export async function createUploadUrlAction(
  recordId: string,
  fileName: string,
  file: UploadCandidate,
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireRequestContext();
  try {
    const { path, token } = await createAttachmentUploadUrl(ctx, recordId, fileName, file);
    return { ok: true, path, token };
  } catch {
    return { ok: false };
  }
}

export async function confirmAttachmentAction(input: {
  recordId: string;
  path: string;
  fileName: string;
  // The same two values the mint was given, so both ends apply one rule to one
  // shape. `confirmAttachment` re-checks them whatever a client sends.
  mimeType: string | null;
  sizeBytes: number;
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

import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, like, ne, or } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { attachments, patients } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ATTACHMENTS_BUCKET } from "@/lib/clinical/storage";
import { writeClinicalAudit, clientIp } from "@/lib/clinical/audit";
import { ClinicalError } from "@/lib/clinical/errors";
import { validateDocumentUpload } from "./document-validation";
import { importedDocumentPrefix } from "./imported-documents-path";

// Staff-side PATIENT DOCUMENTS (administrative documents & declarations attached
// to a patient, e.g. consent forms, identity docs, referrals). Migration-free:
// reuses the existing `attachments` table via its nullable `patient_id` column
// (schema.ts) — the same rows the patient portal already reads
// (apps/api/lib/patient/documents.ts, attachments_patient_selfscope RLS). No
// separate storage backend, no schema change.
//
// Isolation: `attachments_tenant_isolation` (migration 0001_rls) confines every
// authenticated read/write to the JWT tenant. Every helper here runs inside
// runScoped (tenant-context tx) AND re-checks the tenant prefix on the Storage
// path — defense in depth against a forged path.
//
// Permission: patient documents are an administrative surface, not clinical
// records, so they gate on `patients:write` (upload) / `patients:read`
// (list + download) — matching the Documentos tab's visibility to every staff
// role — NOT `clinical_records:*`.
//
// Signed URLs only (CLAUDE.md rule 8): upload is a direct signed PUT to Storage,
// download is a 60s signed GET. Bytes are NEVER proxied through Next.

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

/** A patient document as shown in the staff Documentos tab. */
export type PatientDocumentItem = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  createdAt: string;
};

/** Assert the patient exists inside this tenant (RLS-scoped). Throws not_found. */
async function assertPatientInTenant(ctx: RequestContext, patientId: string): Promise<void> {
  const found = await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    return rows[0]?.id ?? null;
  });
  if (!found) throw new ClinicalError("not_found");
}

/**
 * Issue a one-time signed upload URL for a patient document. The client uploads
 * the bytes DIRECTLY to Supabase Storage (never proxied through Next). The
 * object path is derived server-side and tenant-prefixed:
 *   `${tenantId}/patient-documents/${patientId}/${uuid}__${safeName}`
 */
export async function createPatientDocumentUploadUrl(
  ctx: RequestContext,
  patientId: string,
  fileName: string,
): Promise<{ path: string; token: string }> {
  assertCan(ctx.role, "patients:write");
  await assertPatientInTenant(ctx, patientId);

  const path = `${ctx.tenantId}/patient-documents/${patientId}/${randomUUID()}__${safeName(fileName)}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`createPatientDocumentUploadUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return { path: data.path, token: data.token };
}

/** Record an uploaded patient document in `attachments` (RLS-scoped) + audit. */
export async function confirmPatientDocument(
  ctx: RequestContext,
  input: {
    patientId: string;
    path: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
  },
): Promise<{ id: string }> {
  assertCan(ctx.role, "patients:write");
  // The path must live under this tenant's prefix — defense against a forged path.
  if (!input.path.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");
  // Re-validate type/size on the server — the client check is UX only.
  if (validateDocumentUpload({ mimeType: input.mimeType, sizeBytes: input.sizeBytes ?? 0 })) {
    throw new ClinicalError("validation");
  }
  const ip = await clientIp();

  return runScoped(ctx, async (tx) => {
    // Patient must exist in this tenant (RLS-scoped) before we link the row.
    const pat = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, input.patientId))
      .limit(1);
    if (!pat[0]?.id) throw new ClinicalError("not_found");

    const rows = await tx
      .insert(attachments)
      .values({
        tenantId: ctx.tenantId,
        patientId: input.patientId,
        // clinicalRecordId stays null: this is a patient-level document, not a
        // clinical-record attachment.
        storagePath: input.path,
        fileName: safeName(input.fileName),
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedBy: ctx.userId,
      })
      .returning({ id: attachments.id });
    const id = rows[0]!.id;
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "patient_document.create",
      entityType: "attachment",
      entityId: id,
      // ids + metadata only, never PII / file content (CLAUDE.md rule 7).
      metadata: {
        patientId: input.patientId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
      ip,
    });
    return { id };
  });
}

/**
 * List a patient's documents for the Documentos tab, newest first. The
 * patient-level rows (clinical_record_id IS NULL), PLUS every document the
 * Fisiozero import brought in for this patient even when it is linked to a
 * registo: owner ruling 2026-09-13, a linked imported original shows in BOTH
 * places, on the ficha's Anexos and here. Attachments a therapist uploaded onto
 * a registo still live only on that registo. Tenant-scoped (RLS + explicit
 * filter).
 */
export async function listPatientDocuments(
  ctx: RequestContext,
  patientId: string,
): Promise<PatientDocumentItem[]> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        storagePath: attachments.storagePath,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.patientId, patientId),
          or(
            isNull(attachments.clinicalRecordId),
            like(attachments.storagePath, `${importedDocumentPrefix(ctx.tenantId)}%`),
          ),
          eq(attachments.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(desc(attachments.createdAt));
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      storagePath: r.storagePath,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

/**
 * G-D (2026-09-13): the documents the Fisiozero import brought in for a
 * patient, for the read-only list under an imported registo. Every Fisiozero
 * original landed at PATIENT level (documentos.csv names a patient, never a
 * registo), so an imported ficha could not show its source document; this lists
 * them beside it. A file already linked to `excludeRecordId` is left out because
 * that registo's Anexos block shows it. Ordered by name, because an import has
 * no meaningful upload date.
 */
export async function listImportedPatientDocuments(
  ctx: RequestContext,
  patientId: string,
  excludeRecordId: string,
): Promise<PatientDocumentItem[]> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        storagePath: attachments.storagePath,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.patientId, patientId),
          eq(attachments.tenantId, ctx.tenantId),
          like(attachments.storagePath, `${importedDocumentPrefix(ctx.tenantId)}%`),
          or(isNull(attachments.clinicalRecordId), ne(attachments.clinicalRecordId, excludeRecordId)),
        ),
      )
      .orderBy(asc(attachments.fileName));
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      storagePath: r.storagePath,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

/** Short-lived (60s) signed download URL. Verifies the path is in-tenant first. */
export async function createPatientDocumentDownloadUrl(
  ctx: RequestContext,
  path: string,
): Promise<string> {
  assertCan(ctx.role, "patients:read");
  if (!path.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    throw new Error(`createPatientDocumentDownloadUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return data.signedUrl;
}

import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { attachments, clinicalRecords } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope, therapistPatientScope } from "@/lib/patients/scope";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError } from "./errors";

// Bucket is provisioned via the Supabase owner dashboard (NOT in this PR) — see
// the PR description. Files always go to Storage; never into Postgres.
export const ATTACHMENTS_BUCKET = "clinical-attachments";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

/**
 * Issue a one-time signed upload URL for a draft record's attachment. The
 * client uploads the bytes DIRECTLY to Supabase Storage (never proxied through
 * Next). The object path is derived server-side and tenant-prefixed.
 */
export async function createAttachmentUploadUrl(
  ctx: RequestContext,
  recordId: string,
  fileName: string,
): Promise<{ path: string; token: string }> {
  assertCan(ctx.role, "clinical_records:author");

  // Confirm the record is visible to this tenant and still editable.
  const status = await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ status: clinicalRecords.status })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, recordId))
      .limit(1);
    return rows[0]?.status ?? null;
  });
  if (!status) throw new ClinicalError("not_found");
  if (status !== "draft") throw new ClinicalError("finalized");

  const path = `${ctx.tenantId}/${recordId}/${randomUUID()}__${safeName(fileName)}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`createAttachmentUploadUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return { path: data.path, token: data.token };
}

/** Record an uploaded object in the attachments table (RLS-scoped) + audit. */
export async function confirmAttachment(
  ctx: RequestContext,
  input: {
    recordId: string;
    path: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
  },
): Promise<{ id: string }> {
  assertCan(ctx.role, "clinical_records:author");
  // The path must live under this tenant's prefix — defense against a forged path.
  if (!input.path.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");
  const ip = await clientIp();

  return runScoped(ctx, async (tx) => {
    const rec = await tx
      .select({ status: clinicalRecords.status })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, input.recordId))
      .limit(1);
    const status = rec[0]?.status;
    if (!status) throw new ClinicalError("not_found");
    if (status !== "draft") throw new ClinicalError("finalized");

    const rows = await tx
      .insert(attachments)
      .values({
        tenantId: ctx.tenantId,
        clinicalRecordId: input.recordId,
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
      action: "attachment.create",
      entityType: "attachment",
      entityId: id,
      metadata: { recordId: input.recordId, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
      ip,
    });
    return { id };
  });
}

/**
 * Short-lived signed download URL. Verifies the path is in-tenant first.
 *
 * SR-62 PU-4: the path must also belong to a LIVE attachment row in this tenant.
 * Anexos lists an imported original that the Documentos tab can soft-delete;
 * without this read, a deleted file stayed openable by its path. The only caller
 * (Attachments.tsx) passes paths read from attachment rows, so a live row always
 * exists for a legitimate click.
 */
export async function createAttachmentDownloadUrl(
  ctx: RequestContext,
  path: string,
): Promise<string> {
  assertCan(ctx.role, "clinical_records:read");
  if (!path.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");

  // SEC-attachment-download-by-path-skips-the-patient-scope. A live row in this
  // tenant used to be enough, for any role that may read clinical records. It
  // never asked WHOSE PATIENT the file belongs to, `attachments` has a
  // tenant-only policy for staff, and a path reaches the browser in every
  // attachment list, so it leaks the way an id does.
  //
  // A registo upload carries `clinical_record_id` and no `patient_id`; a
  // patient-level document is the reverse. So the path must EITHER hang off a
  // registo the caller can read - the joined row is filtered by
  // `clinical_records`' OWN RLS (therapist: own patients; admin: own clinics),
  // and the app-level therapist scope `getRecordDetail` applies is ANDed on top -
  // OR be a patient-level document under the ficha's rule. The clinic scope is
  // resolved before the transaction, as queries.ts does, because it is a read of
  // its own. Every refusal is the same `not_found` as a path nobody holds.
  const locIds = await viewerLocationScope(ctx);
  const patientLevelScope =
    therapistPatientScope(ctx, attachments.patientId) ??
    (locIds ? patientLocationScope(attachments.patientId, locIds) : undefined);

  const live = await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ id: attachments.id })
      .from(attachments)
      .leftJoin(clinicalRecords, eq(clinicalRecords.id, attachments.clinicalRecordId))
      .where(
        and(
          eq(attachments.storagePath, path),
          eq(attachments.tenantId, ctx.tenantId),
          isNull(attachments.deletedAt),
          or(
            and(
              isNotNull(clinicalRecords.id),
              therapistPatientScope(ctx, clinicalRecords.patientId),
            ),
            and(
              isNull(attachments.clinicalRecordId),
              isNotNull(attachments.patientId),
              patientLevelScope,
            ),
          ),
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  });
  if (!live) throw new ClinicalError("not_found");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    throw new Error(`createAttachmentDownloadUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return data.signedUrl;
}

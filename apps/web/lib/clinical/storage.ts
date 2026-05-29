import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { attachments, clinicalRecords } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
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

/** Short-lived signed download URL. Verifies the path is in-tenant first. */
export async function createAttachmentDownloadUrl(
  ctx: RequestContext,
  path: string,
): Promise<string> {
  assertCan(ctx.role, "clinical_records:read");
  if (!path.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    throw new Error(`createAttachmentDownloadUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return data.signedUrl;
}

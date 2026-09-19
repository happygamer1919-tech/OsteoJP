import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { attachments, patients } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ATTACHMENTS_BUCKET } from "@/lib/clinical/storage";
import { writeClinicalAudit, clientIp } from "@/lib/clinical/audit";
import { ClinicalError } from "@/lib/clinical/errors";
import { normalizeDeleteReason, validateDocumentUpload } from "./document-validation";
import { documentPreviewKind, type DocumentPreviewKind } from "./document-preview";
import { importedDocumentPrefix } from "./imported-documents-path";
import { therapistPatientScope } from "./scope";

// Staff-side PATIENT DOCUMENTS (administrative documents & declarations attached
// to a patient, e.g. consent forms, identity docs, referrals). Reuses the
// existing `attachments` table via its nullable `patient_id` column (schema.ts)
// — the same rows the patient portal already reads
// (apps/api/lib/patient/documents.ts, attachments_patient_selfscope RLS). No
// separate storage backend. SR-62 PU-4 added three soft-delete columns
// (packages/db/migrations/0089_attachments_soft_delete.sql).
//
// Isolation: `attachments_tenant_isolation` (migration 0001_rls) confines every
// authenticated read/write to the JWT tenant. Every helper here runs inside
// runScoped (tenant-context tx) AND re-checks the tenant prefix on the Storage
// path — defense in depth against a forged path.
//
// Permission: patient documents are an administrative surface, not clinical
// records, so they gate on `patients:write` (upload, soft delete) /
// `patients:read` (list + download) — matching the Documentos tab's visibility
// to every staff role — NOT `clinical_records:*`.
//
// SOFT DELETE (SR-62 PU-4, owner ruling): a removed document keeps its row and
// its Storage object. Every reader below filters `deleted_at IS NULL`, so a
// removed document is gone from every staff surface and from download. Nothing
// here ever deletes a row or a Storage object.
//
// Signed URLs only (CLAUDE.md rule 8): upload is a direct signed PUT to Storage,
// download is a 60s signed GET. Bytes are NEVER proxied through Next.

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
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

/**
 * WHICH ATTACHMENT ROWS ARE DOCUMENTOS ROWS. A patient-level row (no registo),
 * or an imported original even when it is linked to a registo (owner ruling
 * 2026-09-13). An attachment a therapist uploaded onto a registo is NOT one: it
 * lives only on that registo, under clinical_records:* gates.
 *
 * Two forms of ONE rule: the SQL predicate for the list and download reads, the
 * row predicate for the writer, which has already loaded the row. The unit tests
 * pin both.
 */
function documentosRowSql(tenantId: string) {
  return or(
    isNull(attachments.clinicalRecordId),
    like(attachments.storagePath, `${importedDocumentPrefix(tenantId)}%`),
  );
}

export function isDocumentosRow(
  tenantId: string,
  row: { patientId: string | null; clinicalRecordId: string | null; storagePath: string },
): boolean {
  if (!row.patientId) return false;
  return row.clinicalRecordId === null || row.storagePath.startsWith(importedDocumentPrefix(tenantId));
}

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
 * a registo still live only on that registo. Soft-deleted rows are left out
 * (SR-62 PU-4). Tenant-scoped (RLS + explicit filter).
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
          documentosRowSql(ctx.tenantId),
          eq(attachments.tenantId, ctx.tenantId),
          isNull(attachments.deletedAt),
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
 * no meaningful upload date. Soft-deleted rows are left out (SR-62 PU-4): the
 * list mirrors the Documentos tab, where the delete happens.
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
          isNull(attachments.deletedAt),
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

/**
 * Short-lived (60s) signed INLINE url for previewing ONE patient document.
 *
 * ===========================================================================
 * IT TAKES A DOCUMENT ID, NOT A STORAGE PATH, AND RESOLVES IT LIKE THE LIST
 * ===========================================================================
 * It never accepts a path. It resolves the row by id THROUGH THE SAME PREDICATE
 * THE DOCUMENTOS TAB LISTS BY, and signs only what that predicate returned: a
 * document the tab would not show you is a document you cannot preview.
 *
 * WHEN THIS WAS FIRST WRITTEN, `createPatientDocumentDownloadUrl` below still
 * signed whatever path the client sent, and taking an id instead was this
 * helper's argument for widening nothing. SR-62 PU-4 (#1338) then changed the
 * download to take an id as well, so the two now resolve the same way and
 * neither accepts a path. The property survives; the contrast with the download
 * does not, and the sentence claiming it has been removed rather than left to
 * age.
 *
 * THAT SHARED PREDICATE IS WHERE THE SOFT DELETE LANDS, AND IT HAS LANDED.
 * `attachments` carries `deleted_at` since 0089, so the predicate below calls
 * `documentosRowSql` - the list's own function, not a copy of it - and filters
 * `deleted_at IS NULL` exactly as `listPatientDocuments` does. A soft-deleted
 * document has no preview, and no signed URL is ever minted for one.
 *
 * ===========================================================================
 * THE SAME 60 SECONDS AS THE DOWNLOAD, AND NOT ONE SECOND MORE
 * ===========================================================================
 * The preview is not a new way to reach the bytes - it renders the same signed
 * URL the "Abrir" button already mints, in place instead of in a new tab - so it
 * gets no longer-lived token, no second bucket and no new storage policy. The
 * one deliberate difference is the ABSENT `download` option: without it Supabase
 * serves the object `Content-Disposition: inline`, which is what lets a browser
 * render it rather than save it (the declaração path relies on the same thing).
 *
 * It REFUSES a type no browser renders, so a Word document is never handed to an
 * <object> that would quietly download it while the panel sat empty.
 */
export async function createPatientDocumentPreviewUrl(
  ctx: RequestContext,
  patientId: string,
  documentId: string,
): Promise<{ url: string; kind: DocumentPreviewKind; fileName: string }> {
  assertCan(ctx.role, "patients:read");
  const row = await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        storagePath: attachments.storagePath,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.id, documentId),
          // The four conditions below are listPatientDocuments' predicate,
          // verbatim - the same `documentosRowSql` call, not a copy of its
          // body. Anything the tab hides, this hides, a soft-deleted document
          // included (SR-62 PU-4).
          eq(attachments.patientId, patientId),
          documentosRowSql(ctx.tenantId),
          eq(attachments.tenantId, ctx.tenantId),
          isNull(attachments.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
  // Not this patient's, not in this tenant, on a registo rather than the tab,
  // soft-deleted, or simply absent: one refusal for all of them, so the reply
  // never says which.
  if (!row) throw new ClinicalError("not_found");

  const kind = documentPreviewKind(row.mimeType);
  if (!kind) throw new ClinicalError("invalid");
  // Defense in depth, as everywhere else here: a row that somehow carried a
  // foreign path is refused rather than signed.
  if (!row.storagePath.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");

  const admin = createSupabaseAdminClient();
  // No `download` option: inline, so it renders in the panel. 60s, as above.
  const { data, error } = await admin.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(row.storagePath, 60);
  if (error || !data) {
    throw new Error(`createPatientDocumentPreviewUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return { url: data.signedUrl, kind, fileName: row.fileName };
}

/**
 * Short-lived (60s) signed download URL for ONE LIVE Documentos row, by id.
 *
 * SR-62 PU-4: this took a raw Storage PATH and checked only the tenant prefix,
 * so a soft-deleted file stayed openable by anyone holding its path, and a
 * patients:read caller (reception) could sign ANY in-tenant path, including a
 * therapist's registo attachment. It now resolves the row first: in this
 * tenant, on a patient, a Documentos row, and not soft-deleted. The path that is
 * signed is the one stored on that row, never one the client sent.
 */
export async function createPatientDocumentDownloadUrl(
  ctx: RequestContext,
  documentId: string,
): Promise<string> {
  assertCan(ctx.role, "patients:read");
  if (!isUuid(documentId)) throw new ClinicalError("invalid");
  const storagePath = await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ storagePath: attachments.storagePath })
      .from(attachments)
      .where(
        and(
          eq(attachments.id, documentId),
          eq(attachments.tenantId, ctx.tenantId),
          isNotNull(attachments.patientId),
          documentosRowSql(ctx.tenantId),
          isNull(attachments.deletedAt),
        ),
      )
      .limit(1);
    return rows[0]?.storagePath ?? null;
  });
  if (!storagePath) throw new ClinicalError("not_found");
  // Defense in depth: a stored path outside this tenant's prefix is refused.
  if (!storagePath.startsWith(`${ctx.tenantId}/`)) throw new ClinicalError("invalid");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error || !data) {
    throw new Error(`createPatientDocumentDownloadUrl: ${error?.message ?? "unknown storage error"}`);
  }
  return data.signedUrl;
}

/**
 * SR-62 PU-4 — SOFT delete a patient document. Owner ruling, final: never a hard
 * delete; a reason is REQUIRED; who, when and why must be answerable later.
 *
 * WHAT IT WRITES, IN ONE TRANSACTION:
 *   attachments  deleted_at = now(), deleted_by_user_id = actor, delete_reason
 *   audit_log    ONE row: patient_document.soft_delete, entity attachment/<id>,
 *                metadata { hadReason: true, patientId } and nothing else.
 * `now()` is the transaction's start time, which is also audit_log.created_at's
 * default, so the two timestamps are identical by construction.
 *
 * WHAT IT NEVER TOUCHES: the Storage object, and any other row.
 *
 * REFUSALS, in order, each before anything is written:
 *   ForbiddenError    no patients:write (the upload capability; Q-PU4-1)
 *   invalid           documentId is not a uuid
 *   reason_required   reason missing, not a string, or blank after trimming
 *   reason_too_long   reason over DOCUMENT_DELETE_REASON_MAX after trimming
 *   not_found         no such row in this tenant, or not a Documentos row (a
 *                     registo attachment, or no patient), or a therapist's
 *                     patient that is not theirs (the same answer either way,
 *                     so a forged id learns nothing)
 *   already_deleted   already soft-deleted, including by a concurrent request
 *                     that won the race (the UPDATE is guarded on deleted_at)
 */
export async function softDeletePatientDocument(
  ctx: RequestContext,
  input: { documentId: unknown; reason: unknown },
): Promise<{ id: string; patientId: string }> {
  assertCan(ctx.role, "patients:write");
  if (!isUuid(input.documentId)) throw new ClinicalError("invalid");
  const documentId = input.documentId;
  const normalized = normalizeDeleteReason(input.reason);
  if (!normalized.ok) throw new ClinicalError(normalized.error);
  const ip = await clientIp();

  return runScoped(ctx, async (tx) => {
    const [row] = await tx
      .select({
        id: attachments.id,
        patientId: attachments.patientId,
        clinicalRecordId: attachments.clinicalRecordId,
        storagePath: attachments.storagePath,
        deletedAt: attachments.deletedAt,
      })
      .from(attachments)
      .where(and(eq(attachments.id, documentId), eq(attachments.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row || !row.patientId || !isDocumentosRow(ctx.tenantId, row)) {
      throw new ClinicalError("not_found");
    }
    if (row.deletedAt) throw new ClinicalError("already_deleted");
    const patientId = row.patientId;

    // W10-04: a therapist holds patients:write, but only for their own patients.
    const scope = therapistPatientScope(ctx, patients.id);
    if (scope) {
      const [visible] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, patientId), scope))
        .limit(1);
      if (!visible) throw new ClinicalError("not_found");
    }

    const updated = await tx
      .update(attachments)
      .set({
        deletedAt: sql`now()`,
        deletedByUserId: ctx.userId,
        deleteReason: normalized.reason,
      })
      .where(
        and(
          eq(attachments.id, row.id),
          eq(attachments.tenantId, ctx.tenantId),
          isNull(attachments.deletedAt),
        ),
      )
      .returning({ id: attachments.id });
    if (updated.length === 0) throw new ClinicalError("already_deleted");

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "patient_document.soft_delete",
      entityType: "attachment",
      entityId: row.id,
      // The reason is prose and lives in attachments.delete_reason. Rule 7.
      metadata: { hadReason: true, patientId },
      ip,
    });
    return { id: row.id, patientId };
  });
}

import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  attachments,
  clinicalEpisodes,
  clinicalRecords,
  formTemplates,
  patients,
  users,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError } from "./errors";
import {
  parseTemplateSchema,
  validateRecordData,
  type Localized,
} from "./form-template";
import { resolveCurrentTemplates } from "./template-version";

export type RecordStatus = "draft" | "locked" | "signed";

/** The orthogonal AI-review axis (schema.ts ai_review_state); null for records
 *  that never entered the AI/patient review queue. */
export type AiReviewState =
  | "pending_review"
  | "in_review"
  | "approved"
  | "rejected";

export type RecordListItem = {
  id: string;
  patientId: string;
  patientName: string;
  status: RecordStatus;
  /** Second status axis (§6 / §11.2). Read-only projection surfaced for the
   *  list's two-axis StatusChip — no filtering/scope/permission change. */
  aiReviewState: AiReviewState | null;
  version: number;
  templateTitle: Localized | null;
  signedAt: string | null;
  updatedAt: string;
};

export type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  createdAt: string;
};

export type RecordDetail = {
  id: string;
  patientId: string;
  patientName: string;
  patientSex: string | null;
  episodeId: string | null;
  episodeTitle: string | null;
  formTemplateId: string | null;
  status: RecordStatus;
  version: number;
  supersedesId: string | null;
  data: Record<string, unknown>;
  signedAt: string | null;
  signedByName: string | null;
  updatedAt: string;
  template: { title: Localized | null; schema: unknown } | null;
  attachments: AttachmentItem[];
};

export type TemplateOption = { id: string; key: string; title: Localized | null; version: number };
export type PatientOption = { id: string; fullName: string };
export type EpisodeOption = { id: string; title: string };

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export async function listRecords(
  ctx: RequestContext,
  filter: { patientId?: string } = {},
): Promise<RecordListItem[]> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: clinicalRecords.id,
        patientId: clinicalRecords.patientId,
        patientName: patients.fullName,
        status: clinicalRecords.status,
        aiReviewState: clinicalRecords.aiReviewState,
        version: clinicalRecords.version,
        templateTitle: formTemplates.title,
        signedAt: clinicalRecords.signedAt,
        updatedAt: clinicalRecords.updatedAt,
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .where(filter.patientId ? eq(clinicalRecords.patientId, filter.patientId) : undefined)
      .orderBy(desc(clinicalRecords.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      patientName: r.patientName,
      status: r.status as RecordStatus,
      aiReviewState: (r.aiReviewState as AiReviewState | null) ?? null,
      version: r.version,
      templateTitle: (r.templateTitle as Localized | null) ?? null,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

export async function getRecordDetail(
  ctx: RequestContext,
  id: string,
): Promise<RecordDetail | null> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const signer = users;
    const rows = await tx
      .select({
        id: clinicalRecords.id,
        patientId: clinicalRecords.patientId,
        patientName: patients.fullName,
        patientSex: patients.sex,
        episodeId: clinicalRecords.episodeId,
        episodeTitle: clinicalEpisodes.title,
        formTemplateId: clinicalRecords.formTemplateId,
        status: clinicalRecords.status,
        version: clinicalRecords.version,
        supersedesId: clinicalRecords.supersedesId,
        data: clinicalRecords.data,
        signedAt: clinicalRecords.signedAt,
        signedByName: signer.fullName,
        updatedAt: clinicalRecords.updatedAt,
        templateTitle: formTemplates.title,
        templateSchema: formTemplates.schema,
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .leftJoin(clinicalEpisodes, eq(clinicalEpisodes.id, clinicalRecords.episodeId))
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .leftJoin(signer, eq(signer.id, clinicalRecords.signedBy))
      .where(eq(clinicalRecords.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;

    const att = await tx
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        storagePath: attachments.storagePath,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(eq(attachments.clinicalRecordId, id))
      .orderBy(asc(attachments.createdAt));

    return {
      id: r.id,
      patientId: r.patientId,
      patientName: r.patientName,
      patientSex: r.patientSex,
      episodeId: r.episodeId,
      episodeTitle: r.episodeTitle,
      formTemplateId: r.formTemplateId,
      status: r.status as RecordStatus,
      version: r.version,
      supersedesId: r.supersedesId,
      data: (r.data as Record<string, unknown>) ?? {},
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      signedByName: r.signedByName,
      updatedAt: r.updatedAt.toISOString(),
      template: r.formTemplateId
        ? { title: (r.templateTitle as Localized | null) ?? null, schema: r.templateSchema }
        : null,
      attachments: att.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        storagePath: a.storagePath,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });
}

/**
 * Templates for the "Modelo" picker: ONE entry per key — the current (highest)
 * version among active rows. Without this collapse the picker would list every
 * version (osteopathy v1+v2, physiotherapy v3+v4 since PR #91) as duplicates.
 *
 * This is the new-record path only. Existing records pin formTemplateId and are
 * resolved by id elsewhere (immutability) — never through this resolver.
 */
export async function listActiveTemplates(ctx: RequestContext): Promise<TemplateOption[]> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: formTemplates.id,
        key: formTemplates.key,
        title: formTemplates.title,
        version: formTemplates.version,
      })
      .from(formTemplates)
      .where(eq(formTemplates.isActive, true))
      // key asc, version asc → resolveCurrentTemplates keeps the picker key-sorted.
      .orderBy(asc(formTemplates.key), asc(formTemplates.version));
    const options: TemplateOption[] = rows.map((r) => ({
      id: r.id,
      key: r.key,
      title: (r.title as Localized | null) ?? null,
      version: r.version,
    }));
    return resolveCurrentTemplates(options);
  });
}

export async function listPatients(ctx: RequestContext): Promise<PatientOption[]> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, (tx) =>
    tx
      .select({ id: patients.id, fullName: patients.fullName })
      .from(patients)
      .where(isNull(patients.deletedAt))
      .orderBy(asc(patients.fullName)),
  );
}

export async function listEpisodes(
  ctx: RequestContext,
  patientId: string,
): Promise<EpisodeOption[]> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, (tx) =>
    tx
      .select({ id: clinicalEpisodes.id, title: clinicalEpisodes.title })
      .from(clinicalEpisodes)
      .where(eq(clinicalEpisodes.patientId, patientId))
      .orderBy(desc(clinicalEpisodes.openedAt)),
  );
}

/** Flat episode list for the create-record picker, labelled with the patient. */
export async function listEpisodesForPicker(
  ctx: RequestContext,
): Promise<{ id: string; label: string }[]> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: clinicalEpisodes.id,
        title: clinicalEpisodes.title,
        patientName: patients.fullName,
      })
      .from(clinicalEpisodes)
      .innerJoin(patients, eq(patients.id, clinicalEpisodes.patientId))
      .orderBy(desc(clinicalEpisodes.openedAt));
    return rows.map((r) => ({ id: r.id, label: `${r.patientName} — ${r.title}` }));
  });
}

/* ------------------------------------------------------------------ */
/* Mutations — each writes an audit row (actor_user_id = ctx.userId)  */
/* in the SAME tenant-scoped tx.                                      */
/* ------------------------------------------------------------------ */

export async function createDraftRecord(
  ctx: RequestContext,
  input: { patientId: string; formTemplateId: string; episodeId?: string | null; appointmentId?: string | null },
): Promise<{ id: string }> {
  assertCan(ctx.role, "clinical_records:author");
  if (!input.patientId || !input.formTemplateId) {
    throw new ClinicalError("invalid");
  }
  const ip = await clientIp();
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .insert(clinicalRecords)
      .values({
        tenantId: ctx.tenantId,
        patientId: input.patientId,
        formTemplateId: input.formTemplateId,
        episodeId: input.episodeId ?? null,
        appointmentId: input.appointmentId ?? null,
        practitionerId: ctx.userId,
        data: {},
        status: "draft",
      })
      .returning({ id: clinicalRecords.id });
    const id = rows[0]!.id;
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.create",
      entityType: "clinical_record",
      entityId: id,
      metadata: { templateId: input.formTemplateId, patientId: input.patientId },
      ip,
    });
    return { id };
  });
}

export async function updateRecordData(
  ctx: RequestContext,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  assertCan(ctx.role, "clinical_records:author");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        status: clinicalRecords.status,
        schema: formTemplates.schema,
      })
      .from(clinicalRecords)
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .where(eq(clinicalRecords.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ClinicalError("not_found");
    // App-level guard for a clean message; the DB trigger is the real wall.
    if (row.status !== "draft") throw new ClinicalError("finalized");

    const schema = parseTemplateSchema(row.schema);
    if (schema) {
      const result = validateRecordData(schema, data);
      if (!result.ok) throw new ClinicalError("validation", result.errors);
    }

    await tx.update(clinicalRecords).set({ data }).where(eq(clinicalRecords.id, id));
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.update",
      entityType: "clinical_record",
      entityId: id,
      metadata: { fields: Object.keys(data) },
      ip,
    });
  });
}

/** Create a new draft version (addendum) that supersedes a finalized record. */
export async function createAddendum(
  ctx: RequestContext,
  id: string,
): Promise<{ id: string }> {
  assertCan(ctx.role, "clinical_records:author");
  const ip = await clientIp();
  return runScoped(ctx, async (tx) => {
    const src = await tx
      .select({
        patientId: clinicalRecords.patientId,
        episodeId: clinicalRecords.episodeId,
        formTemplateId: clinicalRecords.formTemplateId,
        appointmentId: clinicalRecords.appointmentId,
        data: clinicalRecords.data,
        version: clinicalRecords.version,
      })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, id))
      .limit(1);
    const s = src[0];
    if (!s) throw new ClinicalError("not_found");

    const rows = await tx
      .insert(clinicalRecords)
      .values({
        tenantId: ctx.tenantId,
        patientId: s.patientId,
        episodeId: s.episodeId,
        formTemplateId: s.formTemplateId,
        appointmentId: s.appointmentId,
        practitionerId: ctx.userId,
        data: (s.data as Record<string, unknown>) ?? {},
        status: "draft",
        version: s.version + 1,
        supersedesId: id,
      })
      .returning({ id: clinicalRecords.id });
    const newId = rows[0]!.id;
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.version",
      entityType: "clinical_record",
      entityId: newId,
      metadata: { supersedesId: id, version: s.version + 1 },
      ip,
    });
    return { id: newId };
  });
}

/** Sign and lock a draft: status → signed, immutable thereafter (DB trigger). */
export async function signAndLockRecord(ctx: RequestContext, id: string): Promise<void> {
  assertCan(ctx.role, "clinical_records:sign");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ status: clinicalRecords.status })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ClinicalError("not_found");
    if (row.status !== "draft") throw new ClinicalError("finalized");

    const signedAt = new Date();
    await tx
      .update(clinicalRecords)
      .set({ status: "signed", signedBy: ctx.userId, signedAt })
      .where(and(eq(clinicalRecords.id, id), eq(clinicalRecords.status, "draft")));

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.sign",
      entityType: "clinical_record",
      entityId: id,
      metadata: { signedAt: signedAt.toISOString() },
      ip,
    });
  });
}

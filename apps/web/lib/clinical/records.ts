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
import { FICHA_MEDICA_KEY } from "./ficha-medica";
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
  /** Auto-stamped record creation instant (UTC in DB, Lisbon on display).
   *  SPEC-ficha-medica.md sec 4: no manual created-date picker; shown on the
   *  patient profile alongside the record. */
  createdAt: string;
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
  patientNumber: number | null;
  patientDateOfBirth: string | null;
  patientProfession: string | null;
  createdAt: string;
  episodeId: string | null;
  episodeTitle: string | null;
  formTemplateId: string | null;
  status: RecordStatus;
  /** Origin axis (schema.ts `source`); 'ai_ingested' records flow through the
   *  Revisão Consulta review path (W5-17). */
  source: string;
  /** Orthogonal AI-review axis (schema.ts ai_review_state); null for records
   *  that never entered the AI/patient review queue (rule #4). */
  aiReviewState: AiReviewState | null;
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
        createdAt: clinicalRecords.createdAt,
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
      createdAt: r.createdAt.toISOString(),
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
        patientNumber: patients.patientNumber,
        patientDateOfBirth: patients.dateOfBirth,
        patientProfession: patients.profession,
        episodeId: clinicalRecords.episodeId,
        episodeTitle: clinicalEpisodes.title,
        formTemplateId: clinicalRecords.formTemplateId,
        status: clinicalRecords.status,
        source: clinicalRecords.source,
        aiReviewState: clinicalRecords.aiReviewState,
        version: clinicalRecords.version,
        supersedesId: clinicalRecords.supersedesId,
        data: clinicalRecords.data,
        signedAt: clinicalRecords.signedAt,
        signedByName: signer.fullName,
        createdAt: clinicalRecords.createdAt,
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
      patientNumber: r.patientNumber ?? null,
      patientDateOfBirth: r.patientDateOfBirth ?? null,
      patientProfession: r.patientProfession ?? null,
      episodeId: r.episodeId,
      episodeTitle: r.episodeTitle,
      formTemplateId: r.formTemplateId,
      status: r.status as RecordStatus,
      source: r.source,
      aiReviewState: (r.aiReviewState as AiReviewState | null) ?? null,
      version: r.version,
      supersedesId: r.supersedesId,
      data: (r.data as Record<string, unknown>) ?? {},
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      signedByName: r.signedByName,
      createdAt: r.createdAt.toISOString(),
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
 * Templates for the "Modelo" picker on record CREATION. W5-13 (SPEC sec 1):
 * record creation offers a SINGLE template — Ficha Médica — so the picker is
 * restricted to the Ficha Médica key (`FICHA_MEDICA_KEY`) and collapsed to its
 * current (highest) active version. The other templates (ficha_geral /
 * physiotherapy / nesa / the x-form-ref wrappers) are retired FROM CREATION by
 * this filter — no row is deleted and no existing record is rewritten.
 *
 * The retirement is a code-level scope of THIS creation query only; every
 * template row stays in `form_templates` and `is_active=true`, so existing
 * records keep resolving their pinned template unchanged (immutability). The
 * version collapse (resolveCurrentTemplates) still guards against listing more
 * than one Ficha Médica version once W5-14/W5-15 bump the schema again.
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
      // Creation offers ONLY Ficha Médica (SPEC sec 1); other templates are not
      // selectable when creating a new record.
      .where(and(eq(formTemplates.isActive, true), eq(formTemplates.key, FICHA_MEDICA_KEY)))
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

/**
 * Resolve the current (highest-version, active) Ficha Médica template — its id,
 * title and schema. W5-17: an AI-ingested draft is inserted with
 * `formTemplateId = null` (store.ts persists only the raw payload), so opening it
 * in the Ficha Médica editor needs the template resolved BY KEY, not by the
 * (absent) pinned id. Uses the same key-identity + highest-version rule as the
 * creation picker (FICHA_MEDICA_KEY, resolveCurrentTemplates). Returns null if no
 * active Ficha Médica template exists (a seed/deploy fault, surfaced by the
 * caller, never silently ignored).
 */
export async function getFichaMedicaTemplate(
  ctx: RequestContext,
): Promise<{ id: string; title: Localized | null; schema: unknown } | null> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: formTemplates.id,
        key: formTemplates.key,
        title: formTemplates.title,
        version: formTemplates.version,
        schema: formTemplates.schema,
      })
      .from(formTemplates)
      .where(and(eq(formTemplates.isActive, true), eq(formTemplates.key, FICHA_MEDICA_KEY)))
      .orderBy(asc(formTemplates.version));
    if (rows.length === 0) return null;
    // Highest active version = the current Ficha Médica (rule #5 version collapse).
    const current = rows.reduce((a, b) => (b.version > a.version ? b : a));
    return {
      id: current.id,
      title: (current.title as Localized | null) ?? null,
      schema: current.schema,
    };
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

/**
 * Episode options for the create-record picker. Each row carries its
 * `patientId` so the client scopes the visible list to the selected patient
 * (W5-04); the label is the bare episode title, since the patient-name prefix
 * is redundant once the list is patient-scoped. The patients inner join is
 * kept so the returned row set is unchanged (episodes without a patient row
 * never appeared and still do not). Same read gate, same tenant scoping.
 */
export async function listEpisodesForPicker(
  ctx: RequestContext,
): Promise<{ id: string; patientId: string; title: string }[]> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, (tx) =>
    tx
      .select({
        id: clinicalEpisodes.id,
        patientId: clinicalEpisodes.patientId,
        title: clinicalEpisodes.title,
      })
      .from(clinicalEpisodes)
      .innerJoin(patients, eq(patients.id, clinicalEpisodes.patientId))
      .orderBy(desc(clinicalEpisodes.openedAt)),
  );
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

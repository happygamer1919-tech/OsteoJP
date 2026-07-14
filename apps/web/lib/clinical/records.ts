import "server-only";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  aiIngestionRequests,
  attachments,
  clinicalEpisodes,
  clinicalRecords,
  formTemplates,
  patientFormSubmissions,
  patients,
  recordAnnulments,
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
  /** W5-30: the record has a `record_annulments` row (shown ANULADO). The signed
   *  record row itself is untouched; this is a separate append-only fact. */
  annulled: boolean;
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
  filter: { patientId?: string; includeAnnulled?: boolean } = {},
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

    // W5-30: which of these records are annulled? One extra tenant-scoped read
    // (RLS) rather than a join, so a record with >1 annulment can't fan out rows.
    const ids = rows.map((r) => r.id);
    const annulledIds = new Set<string>();
    if (ids.length > 0) {
      const annuls = await tx
        .select({ recordId: recordAnnulments.recordId })
        .from(recordAnnulments)
        .where(inArray(recordAnnulments.recordId, ids));
      for (const a of annuls) annulledIds.add(a.recordId);
    }

    return rows
      .map((r) => ({
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
        annulled: annulledIds.has(r.id),
      }))
      // Default list hides annulled records behind the "Mostrar anulados" toggle.
      .filter((r) => (filter.includeAnnulled ? true : !r.annulled));
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
        createdAt: clinicalRecords.createdAt,
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
    // Ruling B (W5-19): episode_date has no manual input. When the template
    // carries it and the record has no value yet, stamp it from the record's
    // created_at (Europe/Lisbon civil date) so the `required` field stays valid
    // without a hand-typed date. Existing values round-trip unchanged.
    const ed = data["episode_date"];
    const needsEpisodeDate =
      schema != null &&
      "episode_date" in schema.properties &&
      (ed == null || (typeof ed === "string" && ed.trim() === ""));
    const recordData = needsEpisodeDate
      ? {
          ...data,
          episode_date: new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Lisbon",
          }).format(row.createdAt),
        }
      : data;

    if (schema) {
      const result = validateRecordData(schema, recordData);
      if (!result.ok) throw new ClinicalError("validation", result.errors);
    }

    await tx.update(clinicalRecords).set({ data: recordData }).where(eq(clinicalRecords.id, id));
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.update",
      entityType: "clinical_record",
      entityId: id,
      metadata: { fields: Object.keys(recordData) },
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

/**
 * W5-30 — hard-delete a DRAFT (or AI-pending, which is also status=draft)
 * clinical record. The password gate + capability check live in the server
 * action; this does the tenant-scoped DB work. Draft-only by construction: the
 * status check refuses non-draft, and the clinical_records BEFORE UPDATE OR
 * DELETE immutability trigger is the backstop (locked/signed can never be
 * deleted — the trigger is NOT touched). Attachment children are removed
 * child-first (RETURNING). Idempotent: a missing/cross-tenant id → not_found.
 */
export async function hardDeleteClinicalRecord(ctx: RequestContext, id: string): Promise<void> {
  assertCan(ctx.role, "clinical_records:author");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const [target] = await tx
      .select({ status: clinicalRecords.status, version: clinicalRecords.version })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, id))
      .limit(1);
    if (!target) throw new ClinicalError("not_found");
    // Only draft / AI-pending (status=draft) is deletable; the trigger blocks the rest.
    if (target.status !== "draft") throw new ClinicalError("not_draft");

    // W6-01a: detach the nullable back-pointers that reference this draft before
    // deleting it. An AI-ingested draft is pointed at by ai_ingestion_requests,
    // and a patient-submission-materialised draft by patient_form_submissions;
    // both FKs are NO-ACTION, so leaving them set makes the record DELETE raise a
    // Postgres foreign-key violation (23503) that surfaced to the owner as the
    // opaque "Ocorreu um erro". Both columns are nullable pointers, so we null
    // them here (the request / submission log rows are preserved, just unlinked)
    // in the SAME tenant-scoped tx. The fix is app-layer DML only: no schema
    // change, no migration, no touch to the immutability trigger.
    const detachedIngestion = await tx
      .update(aiIngestionRequests)
      .set({ clinicalRecordId: null })
      .where(eq(aiIngestionRequests.clinicalRecordId, id))
      .returning({ id: aiIngestionRequests.id });
    const detachedSubmission = await tx
      .update(patientFormSubmissions)
      .set({ clinicalRecordId: null })
      .where(eq(patientFormSubmissions.clinicalRecordId, id))
      .returning({ id: patientFormSubmissions.id });

    // Child-first: remove attachment rows referencing this record (RETURNING).
    // Storage objects are left to lifecycle cleanup, mirroring hardDeletePatient.
    await tx
      .delete(attachments)
      .where(eq(attachments.clinicalRecordId, id))
      .returning({ id: attachments.id });

    // Delete the record; the AND status=draft keeps it draft-only even under a race.
    const deleted = await tx
      .delete(clinicalRecords)
      .where(and(eq(clinicalRecords.id, id), eq(clinicalRecords.status, "draft")))
      .returning({ id: clinicalRecords.id });
    if (deleted.length === 0) throw new ClinicalError("not_found");

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.hard_delete",
      entityType: "clinical_record",
      entityId: id,
      metadata: {
        status: target.status,
        version: target.version,
        // PII-free counts of detached back-pointers (rule 7): ids never logged.
        detachedIngestionRequests: detachedIngestion.length,
        detachedFormSubmissions: detachedSubmission.length,
      },
      ip,
    });
  });
}

/**
 * W5-30 — Anular (void) a SIGNED clinical record. INSERTs an append-only
 * `record_annulments` row; the locked/signed record row is NEVER updated or
 * deleted (the immutability trigger stays intact). Signed-only; a second annul
 * on the same record is refused (already_annulled). reason is optional. The
 * password gate + capability check live in the server action.
 */
export async function annulRecord(
  ctx: RequestContext,
  id: string,
  reason: string | null,
): Promise<void> {
  assertCan(ctx.role, "clinical_records:author");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const [target] = await tx
      .select({ status: clinicalRecords.status })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, id))
      .limit(1);
    if (!target) throw new ClinicalError("not_found");
    if (target.status !== "signed") throw new ClinicalError("not_signed");

    const [{ n: existing }] = await tx
      .select({ n: count() })
      .from(recordAnnulments)
      .where(eq(recordAnnulments.recordId, id));
    if (Number(existing) > 0) throw new ClinicalError("already_annulled");

    // Append-only INSERT — the signed record row is untouched. tenant_id is set
    // explicitly (rule 3); RLS WITH CHECK also pins it to the JWT tenant.
    const trimmed = reason?.trim();
    await tx.insert(recordAnnulments).values({
      tenantId: ctx.tenantId,
      recordId: id,
      reason: trimmed && trimmed.length > 0 ? trimmed : null,
      annulledByUserId: ctx.userId,
    });

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.annul",
      entityType: "clinical_record",
      entityId: id,
      metadata: { hadReason: Boolean(trimmed && trimmed.length > 0) },
      ip,
    });
  });
}

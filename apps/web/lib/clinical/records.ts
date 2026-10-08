import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
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
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import {
  therapistPatientReadScope,
  therapistPatientScope,
  therapistRegistoWriteScope,
} from "@/lib/patients/scope";
import { FICHA_MEDICA_KEY } from "./ficha-medica";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError, type ClinicalErrorCode } from "./errors";
import { isEpisodeKeyRefusal } from "./episode-key-refusal";
import { defaultEpisodeTitle, isEpisodeSpecialty } from "./episode-title";
import { findOpenEpisodeOfSpecialty, insertOpenEpisode } from "./episodes";
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
  /** The registo's author (clinical_records.practitioner_id); null for an AI
   *  draft nobody has claimed yet. 0097: a therapist writes only their own. */
  practitionerId: string | null;
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
  /** SIGN-CONFIRM: fingerprint of the stored `data` (see `recordDataHash`). */
  dataHash: string;
  template: { title: Localized | null; schema: unknown } | null;
  attachments: AttachmentItem[];
};

/**
 * SIGN-CONFIRM-AND-SAVE-FIRST: the fingerprint of a record's stored content,
 * `md5(data::text)`. jsonb prints canonically (keys sorted, spacing fixed on the
 * way in), so unchanged content always reads back with the same fingerprint.
 *
 * A sign carries the fingerprint of the content the signer's form last loaded or
 * saved, and commits only while the row still has it (the predicate is in the
 * UPDATE itself, so it holds under concurrent writers). That is what stops a
 * save from another tab, or by another person, landing between the signer's
 * save and their sign and being signed without being seen.
 *
 * A fresh expression per call: a query embeds it, and nothing is shared between
 * queries.
 */
export function recordDataHash(): SQL<string> {
  return sql<string>`md5(${clinicalRecords.data}::text)`;
}

export type TemplateOption = { id: string; key: string; title: Localized | null; version: number };

/** A uuid's shape; anything else is refused before it reaches a uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  // W10-04: a therapist sees fichas only for their own patients (own-only).
  // CARE-02a: and, as a READ, for the patients whose care team they are on.
  // clinical_records_select (0096) admits the same set; the INSERT, UPDATE and
  // DELETE policies do not, so a registo listed here is not one they can edit.
  const scope = await therapistPatientReadScope(ctx, clinicalRecords.patientId);
  const patientFilter = filter.patientId
    ? eq(clinicalRecords.patientId, filter.patientId)
    : undefined;
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
      .where(and(patientFilter, scope))
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
  // W10-04: a therapist can only open a ficha for one of their own patients.
  // CARE-02a: or, to READ it, a patient whose care team they are on (0096).
  const scope = await therapistPatientReadScope(ctx, clinicalRecords.patientId);
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
        practitionerId: clinicalRecords.practitionerId,
        source: clinicalRecords.source,
        aiReviewState: clinicalRecords.aiReviewState,
        version: clinicalRecords.version,
        supersedesId: clinicalRecords.supersedesId,
        data: clinicalRecords.data,
        signedAt: clinicalRecords.signedAt,
        signedByName: signer.fullName,
        createdAt: clinicalRecords.createdAt,
        updatedAt: clinicalRecords.updatedAt,
        dataHash: recordDataHash(),
        templateTitle: formTemplates.title,
        templateSchema: formTemplates.schema,
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .leftJoin(clinicalEpisodes, eq(clinicalEpisodes.id, clinicalRecords.episodeId))
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .leftJoin(signer, eq(signer.id, clinicalRecords.signedBy))
      .where(scope ? and(eq(clinicalRecords.id, id), scope) : eq(clinicalRecords.id, id))
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
      // SR-62 PU-4: a soft-deleted document is gone EVERYWHERE staff browse. An
      // imported original linked to this registo is the SAME row the
      // Documentos tab shows (owner ruling 2026-09-13), so removing it there
      // removes it from Anexos too. The record row itself is untouched.
      .where(and(eq(attachments.clinicalRecordId, id), isNull(attachments.deletedAt)))
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
      practitionerId: r.practitionerId ?? null,
      source: r.source,
      aiReviewState: (r.aiReviewState as AiReviewState | null) ?? null,
      version: r.version,
      supersedesId: r.supersedesId,
      data: (r.data as Record<string, unknown>) ?? {},
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      signedByName: r.signedByName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      dataHash: r.dataHash,
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
/**
 * CARE-02a: may this viewer WRITE to the registo `id`, as well as read it?
 *
 * `getRecordDetail` takes the READ scope, so since 0096 a therapist on the care
 * team opens a colleague's registo. Every registo writer reads its source row
 * under `therapistRegistoWriteScope` and refuses outside it; this is the same
 * read, for the page, so the form, Assinar, Nova versao, the review controls
 * and the attachment upload are not offered where they would refuse. For every
 * non-therapist the scope is undefined and the answer is simply "the row is
 * visible", which is what the page assumed before.
 */
export async function canWriteRecord(ctx: RequestContext, id: string): Promise<boolean> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ id: clinicalRecords.id })
      .from(clinicalRecords)
      .where(and(eq(clinicalRecords.id, id), therapistRegistoWriteScope(ctx)))
      .limit(1);
    return rows.length > 0;
  });
}

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
  // W10-04: the ficha "Paciente" picker offers a therapist only their own patients.
  // CARE-02a: THE NARROW SCOPE, deliberately. This picker feeds a new registo,
  // which is a write: clinical_records' INSERT policy still keys on
  // clinical_therapist_sees_patient(), which 0096 does not touch.
  const scope = therapistPatientScope(ctx, patients.id);
  return runScoped(ctx, (tx) =>
    tx
      .select({ id: patients.id, fullName: patients.fullName })
      .from(patients)
      .where(scope ? and(isNull(patients.deletedAt), scope) : isNull(patients.deletedAt))
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
 *
 * EPI-01b (R4 round 1): OPEN EPISODES ONLY. A new registo is never filed in a
 * closed episode (createDraftRecord refuses it, `episode_closed`), and every
 * imported episode is closed, so the picker no longer offers one. A deep link
 * naming a closed episode falls back to "Sem episódio".
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
      .where(eq(clinicalEpisodes.status, "open"))
      .orderBy(desc(clinicalEpisodes.openedAt)),
  );
}

/* ------------------------------------------------------------------ */
/* Mutations — each writes an audit row (actor_user_id = ctx.userId)  */
/* in the SAME tenant-scoped tx.                                      */
/* ------------------------------------------------------------------ */

/**
 * The permission matrix, which 0097's INSERT policy enforces once applied: a
 * therapist files a registo (a new draft, or a new version of one) only in
 * their own name AND for a patient they treat or created, and
 * `therapistPatientScope` is the same test in the app. The owner files for any
 * patient of the tenant.
 *
 * EPI-01b (R4 round 1): EVERY ROLE IS ASKED, with one read of the patient
 * under the caller's own RLS. "Any patient of the tenant" was not something
 * the database checked for the owner: 0097's owner arm asks only the row's
 * tenant_id, and the foreign key to patients ignores RLS, so an owner could
 * file a registo (or open an episode) in their own tenant for ANOTHER tenant's
 * patient id. patients_select admits the owner to their tenant's patients only,
 * so the read refuses that id. A malformed id is refused before the read (it
 * is not a patient, and Postgres would answer with a raw 22P02). The name is
 * kept from when it asked a therapist only; the scope register
 * (scope-callers.test.ts) keys on it.
 *
 * Refuses nothing 0097's policy admits. BEFORE 0097 IT REFUSES MORE than the
 * database does: 0045's INSERT admits a therapist filing in their own name for
 * any patient of the tenant, so from this change's merge a new draft, a new
 * version or a patient form claim for a patient outside treat or created is
 * refused in the app, ahead of the policy.
 */
async function therapistMayFileFor(tx: DbTx, ctx: RequestContext, patientId: string): Promise<boolean> {
  if (!UUID_RE.test(patientId)) return false;
  const scope = therapistPatientScope(ctx, patients.id);
  const own = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(scope ? and(eq(patients.id, patientId), scope) : eq(patients.id, patientId))
    .limit(1);
  return own.length > 0;
}

/**
 * `therapistMayFileFor`, asked first inside the writer's own transaction, so a
 * patient outside that scope (a posted id, another tenant's patient, or a
 * patient whose last appointment with the caller was deleted since the page
 * rendered) is a clean `not_found`, for every role.
 * From 0097 it is also what keeps that INSERT from reaching the policy as a raw
 * row level security error (42501); before 0097 the INSERT would have succeeded,
 * so the refusal is the app's own.
 */
export async function assertTherapistMayFileFor(
  tx: DbTx,
  ctx: RequestContext,
  patientId: string,
): Promise<void> {
  if (!(await therapistMayFileFor(tx, ctx, patientId))) throw new ClinicalError("not_found");
}

/**
 * The same question for a page deciding which controls to draw (the record
 * page's "Nova versao", and its Save and Sign, which 0097's UPDATE WITH CHECK
 * also asks). A read of its own, in the caller's tenant-scoped context.
 */
export async function mayFileRegistoFor(ctx: RequestContext, patientId: string): Promise<boolean> {
  if (!therapistPatientScope(ctx, patients.id)) return true;
  return runScoped(ctx, (tx) => therapistMayFileFor(tx, ctx, patientId));
}

/**
 * The error for an UPDATE or DELETE of a registo that touched no row, decided
 * from the row this transaction read before the write.
 *
 * `not_author` ONLY WHEN THE ROW HAS AN AUTHOR AND IT IS NOT THE CALLER, and
 * the caller is a therapist. From 0097 the clinical_records UPDATE and DELETE
 * policies admit a therapist only on a registo they authored, so that is the
 * refusal row level security made. Every other 0 rows keeps the writer's own
 * code (`moved`: `stale`, `finalized` or `not_found`), because it is a race
 * (the row moved between the read and the write): the caller's own registo,
 * the owner on any registo, and a registo with NO author yet. The last matters
 * before 0097: a review claim writes no author until 0097's function exists,
 * so every claimed AI draft is unauthored, and a therapist who loses a race on
 * one is told it was finalized or changed, not that it is someone else's.
 * Either way the answer only names a refusal that already happened: it never
 * turns a refusal into a write or a write into a refusal, on a database with
 * or without 0097. Only the owner and a therapist hold the write capabilities,
 * and the owner arm admits every registo of the tenant.
 */
export function zeroRowRefusal(
  ctx: RequestContext,
  authorId: string | null | undefined,
  moved: ClinicalErrorCode,
): ClinicalError {
  const someoneElses = authorId != null && authorId !== ctx.userId;
  return new ClinicalError(ctx.role === "therapist" && someoneElses ? "not_author" : moved);
}

/**
 * EPI-01b (S-1002-D P2.2): Q9, THE APP HALF. A registo filed in an episode is
 * filed in an episode of THE SAME PATIENT, IN THE SAME TENANT, or not at all.
 *
 * Nothing in the database ties `clinical_records.episode_id` to the record's
 * patient: the foreign key checks only that the episode exists, and it checks
 * that without row level security, so it would accept another tenant's episode
 * too. The database half (a trigger or a composite key) is Tier C, after 0102;
 * this is the braces it is the belt to.
 *
 * Read in the WRITER'S OWN transaction, under the caller's RLS. clinical_episodes
 * is tenant-only, so another tenant's episode reads as no row; the tenant is
 * still compared explicitly, so the refusal does not rest on the policy alone.
 * A malformed id is the same refusal, before any read (it is not an episode of
 * this patient, and Postgres would otherwise answer with a raw 22P02).
 *
 * REFUSES WITH `episode_mismatch` AND WRITES NOTHING: it throws before the
 * INSERT, the transaction rolls back, and no audit row is written (audit rows
 * record a mutation that commits; every refusal in this file writes none). One
 * log line says it happened, with no identifier in it (CLAUDE.md rule 7): the
 * screens never offer another patient's episode, so this fires only on a posted
 * id or a page gone stale, and that should be visible somewhere.
 *
 * `requireOpen` (EPI-01b, R4 round 1): a NEW registo is filed only in an OPEN
 * episode; a closed one is `episode_closed`. Every imported episode is closed,
 * so this is what keeps "it never writes into an imported episode" true on the
 * server and not only on the screen. createDraftRecord asks it; createAddendum
 * does NOT, because a new version keeps its registo's episode on purpose
 * (EPI-01a: "Nova versão" of an imported registo stays in its imported group).
 */
export async function assertEpisodeIsThePatients(
  tx: DbTx,
  ctx: RequestContext,
  episodeId: string,
  patientId: string,
  opts: { requireOpen?: boolean } = {},
): Promise<void> {
  let why: string | null = null;
  let code: "episode_mismatch" | "episode_closed" = "episode_mismatch";
  if (!UUID_RE.test(episodeId)) {
    why = "the episode id is malformed";
  } else {
    const [episode] = await tx
      .select({
        tenantId: clinicalEpisodes.tenantId,
        patientId: clinicalEpisodes.patientId,
        status: clinicalEpisodes.status,
      })
      .from(clinicalEpisodes)
      .where(eq(clinicalEpisodes.id, episodeId))
      .limit(1);
    if (!episode) why = "the episode is not visible in this tenant";
    else if (episode.tenantId !== ctx.tenantId) why = "the episode is another tenant's";
    else if (episode.patientId !== patientId) why = "the episode is another patient's";
    else if (opts.requireOpen && episode.status !== "open") {
      why = "the episode is closed";
      code = "episode_closed";
    }
  }
  if (why !== null) {
    console.warn(`[clinical] registo refused: ${why} (${code}). Nothing written.`);
    throw new ClinicalError(code);
  }
}

/**
 * REG-03: THE SAME RULE, WHEN IT IS THE DATABASE THAT REFUSES. Where the
 * database carries the foreign key `isEpisodeKeyRefusal` names
 * (episode-key-refusal.ts), an INSERT whose episode is not the registo's
 * patient's, in its tenant, is refused there with a foreign-key violation that
 * names the key. This maps that one refusal to the refusal the application
 * already returns for the rule, `episode_mismatch`, so the caller gets the same
 * answer `assertEpisodeIsThePatients` gives and not an unhandled database error.
 *
 * NOTHING IS WRITTEN: the statement failed, this throws, and the writer's
 * transaction rolls back with everything it did before the INSERT (an episode
 * opened for the registo included). No audit row, and one log line with no
 * identifier in it, as for the application's own refusal above.
 *
 * EVERY OTHER ERROR PASSES THROUGH UNCHANGED, a foreign-key violation that
 * names any other key included. On a database that does not carry the key
 * this never matches.
 */
async function namingEpisodeKeyRefusal<T>(insert: PromiseLike<T>): Promise<T> {
  try {
    return await insert;
  } catch (e) {
    if (!isEpisodeKeyRefusal(e)) throw e;
    console.warn("[clinical] registo refused: the database's episode key refused it (episode_mismatch). Nothing written.");
    throw new ClinicalError("episode_mismatch");
  }
}

export async function createDraftRecord(
  ctx: RequestContext,
  input: {
    patientId: string;
    formTemplateId: string;
    episodeId?: string | null;
    appointmentId?: string | null;
    /**
     * EPI-01b (Q7, ruling R31): "+ Avaliação" on an IMPORTED group. The registo
     * is filed in the patient's OPEN APP EPISODE OF THIS SPECIALTY when there is
     * one; a NEW episode, titled with the specialty and today's Lisbon date, is
     * opened ONLY WHEN THERE IS NONE. Which of the two is decided here, in the
     * write's own transaction, never by the page. Never an imported episode.
     * Only a word on EPISODE_SPECIALTIES is accepted, so a new title is never
     * clinical text. Exclusive with `episodeId`. (The name is piece 1's, from
     * when it always opened one.)
     */
    newEpisodeSpecialty?: string | null;
  },
): Promise<{ id: string; episodeId: string | null }> {
  assertCan(ctx.role, "clinical_records:author");
  if (!input.patientId || !input.formTemplateId) {
    throw new ClinicalError("invalid");
  }
  const specialty = input.newEpisodeSpecialty ?? null;
  if (specialty !== null && (input.episodeId || !isEpisodeSpecialty(specialty))) {
    throw new ClinicalError("invalid");
  }
  // The patient id in its canonical (lowercase) form, ONCE, for everything
  // below. Postgres reads a uuid in either case, so an id posted in uppercase
  // names the same patient and passes the patient test; but the episode guard,
  // R31's choice of episode and its lock compare or hash ids as TEXT, and the
  // rows they read carry lowercase. Left as posted, an uppercase id would match
  // no open episode (a second one would be opened) and take a lock of its own.
  const patientId = input.patientId.toLowerCase();
  const ip = await clientIp();
  return runScoped(ctx, async (tx) => {
    // A therapist files a registo only for a patient they treat or created
    // (the permission matrix; 0097's INSERT policy once applied). Refuse any
    // other patient here, cleanly. Before 0097 the INSERT would succeed (0045
    // admits any patient); from 0097 it would be a raw 42501.
    await assertTherapistMayFileFor(tx, ctx, patientId);
    let episodeId = input.episodeId || null;
    if (episodeId) {
      // Q9, the app half: the episode is this patient's, in this tenant, and
      // (a new registo) OPEN: never a closed or imported one.
      await assertEpisodeIsThePatients(tx, ctx, episodeId, patientId, { requireOpen: true });
    } else if (specialty !== null) {
      // Q7, ruling R31: the patient's open app episode of this specialty, when
      // there is one. Decided HERE, under a lock held to the end of this
      // transaction, so two clicks (or a page that is stale) file in ONE episode.
      episodeId = await findOpenEpisodeOfSpecialty(tx, ctx, patientId, specialty);
      if (episodeId) {
        // The reused episode is held to Q9's app half like a posted one: this
        // patient's, in this tenant, and open.
        await assertEpisodeIsThePatients(tx, ctx, episodeId, patientId, { requireOpen: true });
      } else {
        // None: a new open episode, through the one episode insert, in THIS
        // transaction: if the registo below is refused, the episode is not left.
        ({ id: episodeId } = await insertOpenEpisode(
          tx,
          ctx,
          { patientId, title: defaultEpisodeTitle(specialty, new Date()) },
          ip,
        ));
      }
    }
    const rows = await namingEpisodeKeyRefusal(
      tx
        .insert(clinicalRecords)
        .values({
          tenantId: ctx.tenantId,
          patientId,
          formTemplateId: input.formTemplateId,
          episodeId,
          appointmentId: input.appointmentId ?? null,
          practitionerId: ctx.userId,
          data: {},
          status: "draft",
        })
        .returning({ id: clinicalRecords.id }),
    );
    const id = rows[0]!.id;
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.create",
      entityType: "clinical_record",
      entityId: id,
      metadata: { templateId: input.formTemplateId, patientId, episodeId },
      ip,
    });
    return { id, episodeId };
  });
}

/**
 * Save a draft's `data`. Returns the fingerprint of the content as stored (with
 * the episode_date stamp below applied), which a later sign must name.
 */
export async function updateRecordData(
  ctx: RequestContext,
  id: string,
  data: Record<string, unknown>,
): Promise<{ dataHash: string }> {
  assertCan(ctx.role, "clinical_records:author");
  const ip = await clientIp();
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        status: clinicalRecords.status,
        practitionerId: clinicalRecords.practitionerId,
        schema: formTemplates.schema,
        createdAt: clinicalRecords.createdAt,
      })
      .from(clinicalRecords)
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      // CARE-02a: a write, so its source row is read under the pre-0096 write reach.
      .where(and(eq(clinicalRecords.id, id), therapistRegistoWriteScope(ctx)))
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

    const saved = await tx
      .update(clinicalRecords)
      .set({ data: recordData })
      .where(eq(clinicalRecords.id, id))
      .returning({ dataHash: recordDataHash() });
    // The row was read above in this transaction; an UPDATE that returns
    // nothing saved nothing, and writes no audit row. From 0097 that is also
    // what row level security does to a therapist on a draft with another
    // author (`zeroRowRefusal` tells the two apart); otherwise, a draft with no
    // author included, the row is gone or out of reach now.
    const stored = saved[0];
    if (!stored) throw zeroRowRefusal(ctx, row.practitionerId, "not_found");
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.update",
      entityType: "clinical_record",
      entityId: id,
      metadata: { fields: Object.keys(recordData) },
      ip,
    });
    return { dataHash: stored.dataHash };
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
      // CARE-02a: a write, so its source row is read under the pre-0096 write reach.
      .where(and(eq(clinicalRecords.id, id), therapistRegistoWriteScope(ctx)))
      .limit(1);
    const s = src[0];
    if (!s) throw new ClinicalError("not_found");
    // 0097: a new version is filed in the caller's name for the same patient,
    // so it meets the same test as any registo: a patient they treat or created.
    await assertTherapistMayFileFor(tx, ctx, s.patientId);
    // EPI-01b, Q9's app half: the version copies its record's episode, so it is
    // held to the same rule as a new registo. A source row already filed in
    // another patient's episode does not get a second one. NOT `requireOpen`:
    // a version stays in its registo's episode even when that episode is closed
    // (an imported registo's "Nova versão" stays in its imported group).
    if (s.episodeId) await assertEpisodeIsThePatients(tx, ctx, s.episodeId, s.patientId);

    const rows = await namingEpisodeKeyRefusal(
      tx
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
        .returning({ id: clinicalRecords.id }),
    );
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

/**
 * Sign and lock a draft: status → signed, immutable thereafter (DB trigger).
 *
 * SIGN-CONFIRM-AND-SAVE-FIRST: `expectedDataHash` is the fingerprint of the
 * content the signer's form last loaded or saved (`recordDataHash`). The sign
 * commits only while the row is still a draft AND still holds that content, and
 * both conditions sit in the UPDATE's own WHERE, so they hold against a
 * concurrent writer, not only against the read above. An UPDATE that matched no
 * row signed nothing and writes no audit row: before this the row count was not
 * read, so a sign that lost a race to another sign could still write a second
 * `clinical_record.sign` audit row and report "signed".
 */
export async function signAndLockRecord(
  ctx: RequestContext,
  id: string,
  expectedDataHash: string,
): Promise<void> {
  assertCan(ctx.role, "clinical_records:sign");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        status: clinicalRecords.status,
        practitionerId: clinicalRecords.practitionerId,
        dataHash: recordDataHash(),
      })
      .from(clinicalRecords)
      // CARE-02a: a write, so its source row is read under the pre-0096 write reach.
      .where(and(eq(clinicalRecords.id, id), therapistRegistoWriteScope(ctx)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ClinicalError("not_found");
    if (row.status !== "draft") throw new ClinicalError("finalized");
    if (row.dataHash !== expectedDataHash) throw new ClinicalError("stale");

    const signedAt = new Date();
    const signed = await tx
      .update(clinicalRecords)
      .set({ status: "signed", signedBy: ctx.userId, signedAt })
      .where(
        and(
          eq(clinicalRecords.id, id),
          eq(clinicalRecords.status, "draft"),
          sql`${recordDataHash()} = ${expectedDataHash}`,
        ),
      )
      .returning({ id: clinicalRecords.id });
    // Nothing was signed. Either something moved between the read and the
    // write (another save, or another sign), which is `stale`, or, from 0097,
    // row level security admitted no row because the caller is a therapist and
    // the draft has another author, which is `not_author` (`zeroRowRefusal`; a
    // draft with no author is a race, `stale`).
    if (signed.length === 0) throw zeroRowRefusal(ctx, row.practitionerId, "stale");

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
      .select({
        status: clinicalRecords.status,
        version: clinicalRecords.version,
        practitionerId: clinicalRecords.practitionerId,
      })
      .from(clinicalRecords)
      // CARE-02a: a write, so its source row is read under the pre-0096 write reach.
      .where(and(eq(clinicalRecords.id, id), therapistRegistoWriteScope(ctx)))
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
    // 0 rows deleted nothing (the transaction then rolls the detaches above
    // back). From 0097 the DELETE policy admits a therapist only on a draft they
    // authored, so for a therapist on a draft with another author that is
    // `not_author`; a draft with no author keeps `not_found`.
    if (deleted.length === 0) throw zeroRowRefusal(ctx, target.practitionerId, "not_found");

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
      // CARE-02a: a write, so its source row is read under the pre-0096 write reach.
      .where(and(eq(clinicalRecords.id, id), therapistRegistoWriteScope(ctx)))
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

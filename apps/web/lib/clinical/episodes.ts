import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  clinicalEpisodes,
  clinicalRecords,
  formTemplates,
  patients,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { therapistPatientScope } from "@/lib/patients/scope";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError } from "./errors";
import { normalizeEpisodeTitle } from "./episode-title";
import type { Localized } from "./form-template";
import type { RecordStatus } from "./records";

export type EpisodeStatus = "open" | "closed";

/** A uuid's shape; anything else is refused before it reaches a uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EpisodeRecordItem = {
  id: string;
  status: RecordStatus;
  version: number;
  templateTitle: Localized | null;
  updatedAt: string;
};

export type EpisodeDetail = {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  status: EpisodeStatus;
  openedAt: string;
  primaryPractitionerName: string | null;
  records: EpisodeRecordItem[];
};

/* ------------------------------------------------------------------ */
/* Mutations — writes an audit row in the SAME tenant-scoped tx.       */
/* ------------------------------------------------------------------ */

/**
 * Open a new clinical episode for a patient. Authoring-gated (owner/therapist;
 * admin reads clinical but does not author, reception has no clinical access at
 * all). Tenant-scoped via runScoped; RLS keys isolation on the tenant claim and
 * the role gate is enforced here, since clinical_episodes RLS is tenant-only.
 */
export async function createEpisode(
  ctx: RequestContext,
  input: { patientId: string; title: string },
): Promise<{ id: string }> {
  assertCan(ctx.role, "clinical_records:author");
  const title = normalizeEpisodeTitle(input.title);
  if (!UUID_RE.test(input.patientId) || !title) throw new ClinicalError("invalid");

  const ip = await clientIp();
  // CARE-02a: a therapist opens an episode only for a patient they treat or
  // created, the narrow scope. clinical_episodes is tenant-only (its narrowing
  // is the N5 wave) and this function checked nothing about the patient, which
  // was unreachable from a screen while the ficha of a patient who was not
  // theirs answered 404. 0098 opens that ficha to the care team for READING, so
  // the write is held to its old reach here. undefined for every other role.
  //
  // EPI-01b (R4 round 1): the patient is read for EVERY role, under the
  // caller's RLS. clinical_episodes is tenant-only and its foreign key to
  // patients ignores RLS, so without this read an owner could open an episode
  // in their own tenant for ANOTHER tenant's patient id. patients_select admits
  // the owner to their own tenant's patients only.
  const writeScope = therapistPatientScope(ctx, patients.id);
  return runScoped(ctx, async (tx) => {
    const [mine] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(writeScope ? and(eq(patients.id, input.patientId), writeScope) : eq(patients.id, input.patientId))
      .limit(1);
    if (!mine) throw new ClinicalError("not_found");
    return insertOpenEpisode(tx, ctx, { patientId: input.patientId, title }, ip);
  });
}

/**
 * THE ONE EPISODE INSERT: an OPEN episode for the patient, in the caller's
 * tenant and name, and its `clinical_episode.create` audit row, in the CALLER'S
 * transaction so the two commit or roll back together.
 *
 * Two callers: `createEpisode` above, and EPI-01b's "+ Avaliação" on an imported
 * group (`createDraftRecord` with `newEpisodeSpecialty`), which opens the episode
 * and files the registo in it in ONE transaction, so a refused registo leaves no
 * empty episode behind. It asks nothing about the patient: each caller has
 * already asked the narrow write scope (`therapistPatientScope`) in the same
 * transaction, and `title` is already normalised and non-clinical.
 */
export async function insertOpenEpisode(
  tx: DbTx,
  ctx: RequestContext,
  input: { patientId: string; title: string },
  ip: string | null,
): Promise<{ id: string }> {
  const rows = await tx
    .insert(clinicalEpisodes)
    .values({
      tenantId: ctx.tenantId, // required by NOT NULL + RLS WITH CHECK
      patientId: input.patientId,
      title: input.title,
      primaryPractitionerId: ctx.userId,
      status: "open",
    })
    .returning({ id: clinicalEpisodes.id });
  const id = rows[0]!.id;

  await writeClinicalAudit(tx, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "clinical_episode.create",
    entityType: "clinical_episode",
    entityId: id,
    // ids only, never patient PII or clinical content (CLAUDE.md rule 7).
    metadata: { patientId: input.patientId },
    ip,
  });
  return { id };
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

/** Episode header + the clinical records filed under it. Null if not visible. */
export async function getEpisodeDetail(
  ctx: RequestContext,
  id: string,
): Promise<EpisodeDetail | null> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: clinicalEpisodes.id,
        patientId: clinicalEpisodes.patientId,
        patientName: patients.fullName,
        title: clinicalEpisodes.title,
        status: clinicalEpisodes.status,
        openedAt: clinicalEpisodes.openedAt,
        primaryPractitionerName: users.fullName,
      })
      .from(clinicalEpisodes)
      .innerJoin(patients, eq(patients.id, clinicalEpisodes.patientId))
      .leftJoin(users, eq(users.id, clinicalEpisodes.primaryPractitionerId))
      .where(eq(clinicalEpisodes.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;

    const records = await tx
      .select({
        id: clinicalRecords.id,
        status: clinicalRecords.status,
        version: clinicalRecords.version,
        templateTitle: formTemplates.title,
        updatedAt: clinicalRecords.updatedAt,
      })
      .from(clinicalRecords)
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .where(eq(clinicalRecords.episodeId, id))
      .orderBy(desc(clinicalRecords.updatedAt));

    return {
      id: r.id,
      patientId: r.patientId,
      patientName: r.patientName,
      title: r.title,
      status: r.status as EpisodeStatus,
      openedAt: r.openedAt.toISOString(),
      primaryPractitionerName: r.primaryPractitionerName,
      records: records.map((rec) => ({
        id: rec.id,
        status: rec.status as RecordStatus,
        version: rec.version,
        templateTitle: (rec.templateTitle as Localized | null) ?? null,
        updatedAt: rec.updatedAt.toISOString(),
      })),
    };
  });
}

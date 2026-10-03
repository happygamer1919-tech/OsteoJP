import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  clinicalEpisodes,
  clinicalRecords,
  formTemplates,
  migrationStagingRows,
  patients,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { therapistPatientScope } from "@/lib/patients/scope";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError } from "./errors";
import { episodeSpecialtyOf, normalizeEpisodeTitle, type EpisodeSpecialty } from "./episode-title";
import { pickEpisodeToReuse } from "./episode-reuse-core";
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
 * group (`createDraftRecord` with `newEpisodeSpecialty`) WHEN THE PATIENT HAS NO
 * OPEN APP EPISODE OF THAT SPECIALTY (R31; `findOpenEpisodeOfSpecialty` below),
 * which opens the episode and files the registo in it in ONE transaction, so a
 * refused registo leaves no empty episode behind. It asks nothing about the patient: each caller has
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

/**
 * The advisory lock `findOpenEpisodeOfSpecialty` takes: one per tenant, patient
 * and specialty, never table-wide. Exported so a test can read its payload.
 *
 * pg_advisory_xact_lock, not pg_advisory_lock: it is released at commit or
 * rollback, so an error path cannot leave it held on a pooled connection (the
 * same choice, for the same reason, as scheduling/slot-lock.ts).
 */
export function specialtyEpisodeLock(tenantId: string, patientId: string, specialty: EpisodeSpecialty): SQL {
  const payload = `clinical-episode-specialty:${tenantId}:${patientId}:${specialty}`;
  return sql`select pg_advisory_xact_lock(hashtextextended(${payload}, 0))`;
}

/**
 * EPI-01b (strategy ruling R31, Q7): THE EPISODE "+ Avaliação" ON AN IMPORTED
 * GROUP REUSES. The ruling: it "reuses the patient's open app episode of that
 * specialty and creates one only when none exists".
 *
 * Asked ON THE SERVER, IN THE WRITER'S OWN TRANSACTION (`createDraftRecord`),
 * so a page rendered before the episode existed, or a second tab, cannot open a
 * second one: the page posts only the specialty, and what it files in is decided
 * here, at the moment of the write. Returns the episode's id, or null for "none:
 * open a new one". The caller still passes the id through
 * `assertEpisodeIsThePatients` (records.ts), like any other episode id.
 *
 * THREE STEPS:
 *   1. THE LOCK (`specialtyEpisodeLock`), held to the end of the transaction.
 *      Two requests for the same patient and specialty run one after the other:
 *      the second waits, then reads the episode the first one committed (each
 *      statement of a READ COMMITTED transaction sees what was committed before
 *      it), and reuses it. Without it both would read "none" and both would open
 *      one, and no constraint in the database would object;
 *   2. the patient's OPEN episodes in this tenant, read under the caller's RLS
 *      (clinical_episodes is tenant-only; the tenant is asked explicitly too);
 *   3. for those whose title names the specialty, WHETHER THE IMPORT LEDGER
 *      NAMES THEM: the same fact ficha-groups.ts reads to call a group imported.
 *      Every imported episode is closed today, so step 2 already leaves them
 *      out; this is what keeps "never an imported episode" true if one is ever
 *      open.
 * `pickEpisodeToReuse` (episode-reuse-core.ts) then decides, and holds the
 * tie-break rule: the most recently opened.
 *
 * It writes nothing and audits nothing: a reused episode is not a mutation of
 * the episode. The registo's own `clinical_record.create` audit row names the
 * episode it was filed in.
 */
export async function findOpenEpisodeOfSpecialty(
  tx: DbTx,
  ctx: RequestContext,
  patientId: string,
  specialty: EpisodeSpecialty,
): Promise<string | null> {
  await tx.execute(specialtyEpisodeLock(ctx.tenantId, patientId, specialty));
  const open = await tx
    .select({
      id: clinicalEpisodes.id,
      tenantId: clinicalEpisodes.tenantId,
      patientId: clinicalEpisodes.patientId,
      status: clinicalEpisodes.status,
      title: clinicalEpisodes.title,
      openedAt: clinicalEpisodes.openedAt,
    })
    .from(clinicalEpisodes)
    .where(
      and(
        eq(clinicalEpisodes.tenantId, ctx.tenantId),
        eq(clinicalEpisodes.patientId, patientId),
        eq(clinicalEpisodes.status, "open"),
      ),
    )
    .orderBy(desc(clinicalEpisodes.openedAt), asc(clinicalEpisodes.id));
  const named = open.filter((e) => episodeSpecialtyOf(e.title) === specialty);
  if (named.length === 0) return null;

  const ledger = await tx
    .select({ id: migrationStagingRows.importedEntityId })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.entityType, "clinical_episode"),
        inArray(
          migrationStagingRows.importedEntityId,
          named.map((e) => e.id),
        ),
      ),
    );
  const imported = new Set(ledger.map((row) => row.id));
  return pickEpisodeToReuse(
    named.map((e) => ({ ...e, imported: imported.has(e.id) })),
    { tenantId: ctx.tenantId, patientId, specialty },
  );
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

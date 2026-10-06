import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { assertCan, ForbiddenError, type RequestContext } from "@osteojp/auth";
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
import { episodeSpecialtyOf, isEpisodeSpecialty, specialtyEpisodeTitle, type EpisodeSpecialty } from "./episode-title";
import { decideOpenEpisode, mayOpenEpisode } from "./episode-open-core";
import { canonicalId, pickEpisodeToReuse, type ReuseCandidate } from "./episode-reuse-core";
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
 * EPI-01b, piece 2: "+ Episódio" ON THE REGISTOS TAB. Opens a NEW open episode
 * for a patient. It never closes, edits, merges or removes an episode.
 *
 * THE TITLE IS A SPECIALTY AND A DATE, BY RULING. The input carries a specialty
 * and nothing else that could become a title: the server builds
 * "<specialty> (dd/mm/yyyy)" from a word on EPISODE_SPECIALTIES and the clinic's
 * Lisbon day (`specialtyEpisodeTitle`). A word off the list is `invalid`; any
 * other property a caller adds to the input is never read.
 *
 * WHO, asked here, on the server, whatever the screen drew:
 *   1. the authoring capability the registo writers ask (`clinical_records:author`);
 *   2. the therapist role (`mayOpenEpisode`). Every other role is refused with
 *      the same ForbiddenError a missing capability raises (its message names
 *      the capability; the reason here is the role);
 *   3. a patient the therapist may write registos for: the narrow write scope
 *      (`therapistPatientScope`: treats or created), read under the caller's
 *      own tenant-scoped context, so a patient outside it, or of another
 *      tenant, is a clean `not_found`.
 *
 * AN OPEN EPISODE OF THE SAME SPECIALTY (`decideOpenEpisode`, episode-open-core.ts).
 * Read with `findOpenEpisodeOfSpecialty`, so under the same lock and by the
 * same rule as "+ Avaliação" on an imported group (ruling R31: the most
 * recently opened). When there is one and the call does not confirm against
 * it, nothing is written and the answer names it (`open_exists`); the page
 * shows it and asks. A confirmed call opens another, which is then the most
 * recently opened, so it is the one R31 files in from then on.
 *
 * The audit row is `insertOpenEpisode`'s `clinical_episode.create`: ids only.
 */
export type CreateEpisodeResult =
  | { kind: "created"; id: string }
  | { kind: "open_exists"; episodeId: string };

export async function createEpisode(
  ctx: RequestContext,
  input: { patientId: string; specialty: string; confirmedOpenEpisodeId?: string | null },
): Promise<CreateEpisodeResult> {
  assertCan(ctx.role, "clinical_records:author");
  if (!mayOpenEpisode(ctx.role)) throw new ForbiddenError(ctx.role, "clinical_records:author");
  const specialty = input.specialty;
  const confirmed = input.confirmedOpenEpisodeId ?? null;
  if (!UUID_RE.test(input.patientId) || !isEpisodeSpecialty(specialty)) throw new ClinicalError("invalid");
  if (confirmed !== null && !UUID_RE.test(confirmed)) throw new ClinicalError("invalid");
  // The canonical (lowercase) form, once, for the patient read, the lock, the
  // choice of episode, the insert and the audit row (as createDraftRecord does).
  const patientId = canonicalId(input.patientId);

  const ip = await clientIp();
  const writeScope = therapistPatientScope(ctx, patients.id);
  return runScoped(ctx, async (tx) => {
    const [mine] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(writeScope ? and(eq(patients.id, patientId), writeScope) : eq(patients.id, patientId))
      .limit(1);
    if (!mine) throw new ClinicalError("not_found");

    const open = await findOpenEpisodeOfSpecialty(tx, ctx, patientId, specialty);
    const decision = decideOpenEpisode(open, confirmed);
    if (decision.kind === "confirm") return { kind: "open_exists", episodeId: decision.episodeId };

    const title = specialtyEpisodeTitle(specialty, new Date());
    if (title === null) throw new ClinicalError("invalid");
    const { id } = await insertOpenEpisode(tx, ctx, { patientId, title }, ip);
    return { kind: "created", id };
  });
}

/**
 * THE ONE EPISODE INSERT: an OPEN episode for the patient, in the caller's
 * tenant and name, and its `clinical_episode.create` audit row, in the CALLER'S
 * transaction so the two commit or roll back together.
 *
 * Two callers: `createEpisode` above ("+ Episódio"), and EPI-01b's "+ Avaliação" on an imported
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
 *
 * THE KEY IS BUILT FROM THE IDS' CANONICAL FORM, never from the text a request
 * carried: the key is hashed as text, so the same patient posted in uppercase
 * would otherwise take a DIFFERENT lock and not wait for a request that named
 * it in lowercase.
 */
export function specialtyEpisodeLock(tenantId: string, patientId: string, specialty: EpisodeSpecialty): SQL {
  const payload = `clinical-episode-specialty:${canonicalId(tenantId)}:${canonicalId(patientId)}:${specialty}`;
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

/** One open app episode of a patient, as the Registos tab needs it. */
export type OpenAppEpisode = ReuseCandidate & {
  /** True when no registo the viewer can read is filed in it. */
  empty: boolean;
};

/**
 * EPI-01b, piece 2: THE PATIENT'S OPEN APP EPISODES, FOR THE REGISTOS TAB OF A
 * VIEWER WHO MAY WRITE THERE. The tab draws its groups from registos, so an
 * episode "+ Episódio" has just opened, which holds none yet, would not appear;
 * this is what lets the tab draw it (with "+ Avaliação" at hand), and what it
 * shows the therapist when the patient already has an open episode of the
 * specialty they chose.
 *
 * It feeds a write, so it keeps the write's reach: the authoring capability,
 * and for a therapist the narrow write scope on the patient (treats or
 * created), under the caller's own tenant-scoped context. A patient outside
 * that reach answers an empty list. Open (`status = 'open'`), this patient's,
 * in this tenant, and not named by the import ledger: the same four facts
 * `pickEpisodeToReuse` asks, in the same order (most recently opened first).
 * It writes nothing.
 */
export async function listOpenAppEpisodes(ctx: RequestContext, patientId: string): Promise<OpenAppEpisode[]> {
  assertCan(ctx.role, "clinical_records:author");
  if (!UUID_RE.test(patientId)) return [];
  const id = canonicalId(patientId);
  const writeScope = therapistPatientScope(ctx, patients.id);
  return runScoped(
    ctx,
    async (tx) => {
      const [mine] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(writeScope ? and(eq(patients.id, id), writeScope) : eq(patients.id, id))
        .limit(1);
      if (!mine) return [];

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
            eq(clinicalEpisodes.patientId, id),
            eq(clinicalEpisodes.status, "open"),
          ),
        )
        .orderBy(desc(clinicalEpisodes.openedAt), asc(clinicalEpisodes.id));
      if (open.length === 0) return [];
      const ids = open.map((e) => e.id);

      const ledger = await tx
        .select({ id: migrationStagingRows.importedEntityId })
        .from(migrationStagingRows)
        .where(
          and(eq(migrationStagingRows.entityType, "clinical_episode"), inArray(migrationStagingRows.importedEntityId, ids)),
        );
      const imported = new Set(ledger.map((row) => row.id));

      const filed = await tx
        .selectDistinct({ episodeId: clinicalRecords.episodeId })
        .from(clinicalRecords)
        .where(inArray(clinicalRecords.episodeId, ids));
      const holdsRegistos = new Set(filed.map((row) => row.episodeId));

      return open
        .filter((e) => !imported.has(e.id))
        .map((e) => ({ ...e, imported: false, empty: !holdsRegistos.has(e.id) }));
    },
    "clinical:open-app-episodes",
  );
}

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

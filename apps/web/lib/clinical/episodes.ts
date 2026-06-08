import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  clinicalEpisodes,
  clinicalRecords,
  formTemplates,
  patients,
  users,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError } from "./errors";
import { normalizeEpisodeTitle } from "./episode-title";
import type { Localized } from "./form-template";
import type { RecordStatus } from "./records";

export type EpisodeStatus = "open" | "closed";

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
  if (!input.patientId || !title) throw new ClinicalError("invalid");

  const ip = await clientIp();
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .insert(clinicalEpisodes)
      .values({
        tenantId: ctx.tenantId, // required by NOT NULL + RLS WITH CHECK
        patientId: input.patientId,
        title,
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
      // ids only — never patient PII / clinical content (CLAUDE.md rule 7).
      metadata: { patientId: input.patientId },
      ip,
    });
    return { id };
  });
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

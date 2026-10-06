import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { assertCan, toClaims, type RequestContext } from "@osteojp/auth";
import {
  clinicalEpisodes,
  clinicalRecords,
  migrationStagingRows,
  patients,
  recordAnnulments,
} from "@osteojp/db";
import { getStrings, type Locale } from "@osteojp/i18n";
import { runScoped } from "@/lib/auth/context";
import { therapistPatientReadScope } from "@/lib/patients/scope";
import { clientIp, writeClinicalAudit } from "../audit";
import { canonicalId } from "../episode-reuse-core";
import { isClinicalError } from "../errors";
import { episodeReportFilename, selectEpisodeExport, type EpisodeExportRow } from "./episode-export-core";
import { mergeReportPdfs } from "./episode-pdf";
import { generateClinicalReportPdf } from "./generate";
import type { RecordStatus } from "./report-model";

/**
 * EPI-01b, piece 3: ONE PDF FOR A WHOLE EPISODE, from an episode group of the
 * Registos tab. Three steps, each its own function so the action
 * (episode-pdf-actions.ts) can put the document ceiling between the first and
 * the second:
 *
 *   readEpisodeExportSelection   which registos, in which order. Reads only
 *                                (`readEpisodeExportRows`), then the pure rule.
 *   renderEpisodeReport          each registo through the per-record report
 *                                engine, joined into one document.
 *   recordEpisodeExport          the audit row.
 *
 * EVERY READ IS THE CALLER'S OWN. The selection runs under `runScoped` (the
 * caller's tenant-scoped, RLS-enforced transaction) with the therapist read
 * scope the Registos tab applies, and each registo is then loaded by
 * `generateClinicalReportPdf` with the caller's claims: the very call
 * "Transferir PDF" makes for that registo. Nothing here uses the service-role
 * client, so the file never holds a page the caller could not download one
 * registo at a time.
 */

/** A uuid's shape; anything else is refused before it reaches a uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EpisodeExportSelection = {
  episodeId: string;
  patientId: string;
  /** The registos of the file, in the file's order. Never empty. */
  recordIds: string[];
  /** Registos of the episode the caller reads that are not in the file. */
  leftOut: number;
};

/**
 * THE REGISTOS OF ONE APP EPISODE OF ONE PATIENT, AS THE CALLER READS THEM, or
 * null when there is no such episode to export. It writes nothing.
 *
 * Null, in the order asked:
 *   - an id that is not a uuid;
 *   - no such episode FOR THIS PATIENT in the caller's tenant. Another tenant's
 *     episode is simply not a row under RLS; an episode of another patient is
 *     refused by the patient test, whatever its registos say;
 *   - an episode the import ledger names. An imported group on the tab is one
 *     group per specialty over many imported episodes, not an episode; the
 *     export is built for app episodes.
 * An empty list is an episode in which the caller reads no registo.
 *
 * The registos are read with the Registos tab's reach (`listFichaRecords`):
 * the capability, the therapist read scope on the patient, the caller's RLS.
 * The inner join to `patients` is the one the per-record load makes, so a
 * registo that load would not find is not listed either.
 */
export async function readEpisodeExportRows(
  ctx: RequestContext,
  input: { patientId: string; episodeId: string },
): Promise<EpisodeExportRow[] | null> {
  assertCan(ctx.role, "clinical_records:read");
  if (!UUID_RE.test(input.patientId) || !UUID_RE.test(input.episodeId)) return null;
  const patientId = canonicalId(input.patientId);
  const episodeId = canonicalId(input.episodeId);

  const scope = await therapistPatientReadScope(ctx, clinicalRecords.patientId);
  return runScoped(
    ctx,
    async (tx) => {
      const [episode] = await tx
        .select({ id: clinicalEpisodes.id })
        .from(clinicalEpisodes)
        .where(
          and(
            eq(clinicalEpisodes.id, episodeId),
            eq(clinicalEpisodes.patientId, patientId),
            eq(clinicalEpisodes.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!episode) return null;

      const [ledger] = await tx
        .select({ id: migrationStagingRows.importedEntityId })
        .from(migrationStagingRows)
        .where(
          and(
            eq(migrationStagingRows.entityType, "clinical_episode"),
            eq(migrationStagingRows.importedEntityId, episodeId),
          ),
        )
        .limit(1);
      if (ledger) return null;

      const rows = await tx
        .select({
          id: clinicalRecords.id,
          status: clinicalRecords.status,
          aiReviewState: clinicalRecords.aiReviewState,
          createdAt: clinicalRecords.createdAt,
          version: clinicalRecords.version,
        })
        .from(clinicalRecords)
        .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
        .where(
          and(eq(clinicalRecords.episodeId, episodeId), eq(clinicalRecords.patientId, patientId), scope),
        )
        .orderBy(asc(clinicalRecords.createdAt), asc(clinicalRecords.version), asc(clinicalRecords.id));
      if (rows.length === 0) return [];

      const annuls = await tx
        .select({ recordId: recordAnnulments.recordId })
        .from(recordAnnulments)
        .where(
          inArray(
            recordAnnulments.recordId,
            rows.map((r) => r.id),
          ),
        );
      const annulled = new Set(annuls.map((a) => a.recordId));

      return rows.map((r) => ({
        id: r.id,
        status: r.status as RecordStatus,
        aiReviewState: r.aiReviewState ?? null,
        annulled: annulled.has(r.id),
        createdAt: r.createdAt,
        version: r.version,
      }));
    },
    "clinical:episode-export",
  );
}

/**
 * WHICH REGISTOS THE EPISODE'S FILE HOLDS, or null when there is nothing to
 * export: no such app episode for this patient (`readEpisodeExportRows`), no
 * registo the caller reads in it, or none the selection rule admits
 * (episode-export-core.ts). It writes nothing and renders nothing.
 */
export async function readEpisodeExportSelection(
  ctx: RequestContext,
  input: { patientId: string; episodeId: string },
): Promise<EpisodeExportSelection | null> {
  const rows = await readEpisodeExportRows(ctx, input);
  if (!rows) return null;
  const { recordIds, leftOut } = selectEpisodeExport(rows);
  if (recordIds.length === 0) return null;
  return {
    episodeId: canonicalId(input.episodeId),
    patientId: canonicalId(input.patientId),
    recordIds,
    leftOut,
  };
}

export type EpisodeReportPdf = {
  bytes: Uint8Array;
  /** Suggested download filename: the episode id's first block, never patient data. */
  filename: string;
  /** The registos the file holds, in the file's order. Never empty. */
  recordIds: string[];
  /** How many registos of the episode the caller reads that it does not hold. */
  leftOut: number;
};

/**
 * THE EPISODE'S FILE: each selected registo rendered by the per-record report
 * engine (`generateClinicalReportPdf`: the caller-scoped load, the print gate,
 * the branded layout), and the results joined in the selection's order
 * (episode-pdf.ts copies the pages; it draws nothing).
 *
 * The engine decides again for every registo, at the moment of the render: one
 * it does not find or refuses to print (`not_found`, `not_printable`) is left
 * out and counted, exactly as "Transferir PDF" on that registo would produce
 * nothing. Any other fault ends the export. Null when no registo rendered.
 */
export async function renderEpisodeReport(
  ctx: RequestContext,
  selection: EpisodeExportSelection,
  locale: Locale,
): Promise<EpisodeReportPdf | null> {
  const claims = toClaims(ctx);
  const parts: Uint8Array[] = [];
  const recordIds: string[] = [];
  let leftOut = selection.leftOut;
  for (const recordId of selection.recordIds) {
    try {
      parts.push((await generateClinicalReportPdf(claims, recordId, locale)).bytes);
      recordIds.push(recordId);
    } catch (e) {
      if (isClinicalError(e) && (e.code === "not_found" || e.code === "not_printable")) {
        leftOut += 1;
        continue;
      }
      throw e;
    }
  }
  if (parts.length === 0) return null;

  return {
    bytes: await mergeReportPdfs(parts, getStrings(locale)["report.clinical.title"]),
    filename: episodeReportFilename(selection.episodeId),
    recordIds,
    leftOut,
  };
}

/**
 * THE AUDIT ROW OF ONE EXPORT (CLAUDE.md rule 6): `episode.export_pdf` on the
 * episode, written under the caller's own tenant-scoped context, in the
 * caller's name. Ids and counts only, never a name or clinical text (rule 7;
 * `writeClinicalAudit` refuses free text).
 *
 * `recordIds` names the registos that are IN the file, in the file's order, so
 * which registos left stays answerable after a draft of the episode is signed
 * or a registo is annulled. `recordsIncluded` is their number. A registo left
 * out is counted (`recordsLeftOut`) and never named.
 */
export async function recordEpisodeExport(
  ctx: RequestContext,
  exported: { episodeId: string; patientId: string; recordIds: readonly string[]; leftOut: number },
): Promise<void> {
  const ip = await clientIp();
  await runScoped(
    ctx,
    (tx) =>
      writeClinicalAudit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: "episode.export_pdf",
        entityType: "clinical_episode",
        entityId: exported.episodeId,
        metadata: {
          episodeId: exported.episodeId,
          patientId: exported.patientId,
          recordIds: [...exported.recordIds],
          recordsIncluded: exported.recordIds.length,
          recordsLeftOut: exported.leftOut,
        },
        ip,
      }),
    "clinical:episode-export-audit",
  );
}

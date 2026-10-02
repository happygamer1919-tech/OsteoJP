import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { clinicalEpisodes, clinicalRecords, formTemplates, recordAnnulments } from "@osteojp/db";
import { DEFAULT_LOCALE } from "@osteojp/i18n";
import { runScoped } from "@/lib/auth/context";
import { therapistPatientReadScope } from "@/lib/patients/scope";
import { EXCERPT_KEYS, excerpt, type FichaRecord, type FichaRecordStatus } from "./ficha-groups-core";

/**
 * EPI-01a: THE REGISTOS TAB'S READ, WITH EACH REGISTO'S EPISODE.
 *
 * READ-ONLY, and the SAME reach as `listRecords` (records.ts): the same
 * `clinical_records:read` check (reception holds none, so it never gets here),
 * the same therapist read scope (own patients, and the care team at their own
 * clinics once 0096 is applied), under the viewer's own RLS (`runScoped`).
 * What it adds is what the grouping needs (`ficha-groups-core.ts`):
 *   - the episode (left join: a registo may have none; clinical_episodes is
 *     tenant-wide under RLS, and the registo read above is what narrows it);
 *   - WHETHER THE IMPORT LEDGER NAMES THAT EPISODE. The same ledger
 *     `record-origin.ts` reads for a record, at entity_type 'clinical_episode':
 *     the importer writes that row for every episode it creates (upsert.ts) and
 *     nothing else does, so it is the one fact that says "imported". A closed
 *     status or a specialty title is not that fact: an app episode can be closed
 *     and titled "Osteopatia" too. It is read under the viewer's tenant RLS, as
 *     record-origin reads it;
 *   - the excerpt fields, read out of `data` by key, so no whole `data` blob is
 *     shipped for a list (Q3's keys, EXCERPT_KEYS);
 *   - `supersedes_id`, so a version can be shown with its record.
 * Ordered by the CLINICAL date (`created_at`); `updated_at` is the import time
 * on every imported row. Annulled registos are dropped unless asked for, as
 * `listRecords` drops them (the "Mostrar anulados" toggle).
 */
export async function listFichaRecords(
  ctx: RequestContext,
  filter: { patientId: string; includeAnnulled?: boolean },
): Promise<FichaRecord[]> {
  assertCan(ctx.role, "clinical_records:read");
  const scope = await therapistPatientReadScope(ctx, clinicalRecords.patientId);
  return runScoped(
    ctx,
    async (tx) => {
    const fields = Object.fromEntries(
      EXCERPT_KEYS.map((k) => [k, sql<string | null>`${clinicalRecords.data} ->> ${k}`]),
    ) as Record<(typeof EXCERPT_KEYS)[number], ReturnType<typeof sql<string | null>>>;
    const rows = await tx
      .select({
        id: clinicalRecords.id,
        status: clinicalRecords.status,
        version: clinicalRecords.version,
        supersedesId: clinicalRecords.supersedesId,
        createdAt: clinicalRecords.createdAt,
        updatedAt: clinicalRecords.updatedAt,
        templateTitle: formTemplates.title,
        episodeId: clinicalRecords.episodeId,
        episodeTitle: clinicalEpisodes.title,
        ...fields,
      })
      .from(clinicalRecords)
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .leftJoin(clinicalEpisodes, eq(clinicalEpisodes.id, clinicalRecords.episodeId))
      .where(and(eq(clinicalRecords.patientId, filter.patientId), scope))
      .orderBy(asc(clinicalRecords.createdAt), asc(clinicalRecords.version));

    const ids = rows.map((r) => r.id);
    const annulled = new Set<string>();
    if (ids.length > 0) {
      const annuls = await tx
        .select({ recordId: recordAnnulments.recordId })
        .from(recordAnnulments)
        .where(inArray(recordAnnulments.recordId, ids));
      for (const a of annuls) annulled.add(a.recordId);
    }

    const episodeIds = [...new Set(rows.map((r) => r.episodeId).filter((e): e is string => e !== null))];
    const importedEpisodes = new Set<string>();
    if (episodeIds.length > 0) {
      const result = await tx.execute(sql`
        select distinct ledger.imported_entity_id::text as id
          from public.migration_staging_rows ledger
         where ledger.entity_type = 'clinical_episode'::public.migration_entity_type
           and ledger.imported_entity_id in (${sql.join(
             episodeIds.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
      `);
      // postgres-js returns an array of rows; another driver returns { rows }.
      const ledger = (Array.isArray(result)
        ? result
        : ((result as { rows?: unknown[] } | null)?.rows ?? [])) as { id: string }[];
      for (const row of ledger) importedEpisodes.add(row.id);
    }

    return rows
      .map((r): FichaRecord => {
        const title = r.templateTitle as Record<string, string> | null;
        return {
          id: r.id,
          status: r.status as FichaRecordStatus,
          version: r.version,
          supersedesId: r.supersedesId ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          annulled: annulled.has(r.id),
          templateTitle: title ? (title[DEFAULT_LOCALE] ?? null) : null,
          episodeId: r.episodeId ?? null,
          episodeTitle: r.episodeTitle ?? null,
          episodeImported: r.episodeId !== null && importedEpisodes.has(r.episodeId),
          excerpt: excerpt(Object.fromEntries(EXCERPT_KEYS.map((k) => [k, (r as Record<string, unknown>)[k]]))),
        };
      })
      .filter((r) => (filter.includeAnnulled ? true : !r.annulled));
    },
    "clinical:ficha-records",
  );
}

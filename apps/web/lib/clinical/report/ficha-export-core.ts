/**
 * EXPORT-01: "Exportar ficha", ONE PDF FOR THE WHOLE PATIENT. PURE: no
 * database, no server import, no PDF library, so what the file holds, in which
 * order and under which name are unit-tested as statements. `ficha-export.ts`
 * reads the rows and renders; this file decides the sections.
 *
 * ==========================================================================
 * THE FILE IS THE REGISTOS TAB, IN DATE ORDER
 * ==========================================================================
 * The tab draws a patient's registos in groups (ficha-groups-core.ts
 * `groupForFicha`): one per app episode, one per specialty for the imported
 * history, and "Sem episódio" for a registo filed in none. Those groups are
 * the file's SECTIONS, so the file holds every episode the tab shows the
 * caller and never a registo their tab would not list.
 *
 *   - A section holds its group's registos under the episode file's own rule
 *     (episode-export-core.ts `isEpisodeExportable`): finalized ones, an
 *     ANNULLED one among them (the per-record engine prints its mark). A DRAFT
 *     IS NEVER IN THE FILE. A group left with no registo is no section.
 *   - Inside a section the registos keep the group's order: oldest first by the
 *     clinical date, a later version after its record.
 *   - The sections run OLDEST FIRST, by the date of the first registo each one
 *     holds in the file. The tab runs newest first, for whoever is about to
 *     write; a file is read from its beginning.
 *   - "SEM EPISÓDIO" IS THE LAST SECTION, whatever its dates, as it is the last
 *     group on the tab: it is not an episode.
 */
import type { FichaGroup, FichaGroupKind } from "../ficha-groups-core";
import { isEpisodeExportable } from "./episode-export-core";

/** One section of the file: a group of the Registos tab, as the file holds it. */
export type FichaExportSection = {
  kind: FichaGroupKind;
  /** The specialty (imported) or the episode title (app); null for "Sem episódio". */
  label: string | null;
  /** The registos of the section, in the file's order. Never empty. */
  recordIds: string[];
};

/**
 * The sections of the file, in the file's order, and how many of the registos
 * read are not in it. `leftOut` counts only registos the caller's own read
 * returned: one outside that read is never seen, so it is never counted.
 */
export function selectFichaExport(groups: readonly FichaGroup[]): {
  sections: FichaExportSection[];
  leftOut: number;
} {
  let leftOut = 0;
  const dated: { section: FichaExportSection; firstAt: string; key: string }[] = [];
  for (const group of groups) {
    // The tab's list does not carry the AI review axis: read as "not under
    // review", as the tab's own buttons read it. The per-record engine asks
    // the full rule again for every registo at the render.
    const included = group.records.filter((r) => isEpisodeExportable({ status: r.status, aiReviewState: null }));
    leftOut += group.records.length - included.length;
    if (included.length === 0) continue;
    dated.push({
      section: { kind: group.kind, label: group.label, recordIds: included.map((r) => r.id) },
      firstAt: included[0]!.createdAt,
      key: group.key,
    });
  }
  dated.sort((a, b) => {
    if (a.section.kind === "none" && b.section.kind !== "none") return 1;
    if (b.section.kind === "none" && a.section.kind !== "none") return -1;
    if (a.firstAt !== b.firstAt) return a.firstAt < b.firstAt ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return { sections: dated.map((d) => d.section), leftOut };
}

/**
 * The Storage object of one export: `<tenant>/ficha-reports/<patient>/<object>.pdf`.
 * A folder of its own, beside the per-record, the episode and the imported
 * group's, so no two exports can name the same object. Ids only: no name, no
 * date, no clinical text.
 */
export function fichaReportPath(tenantId: string, patientId: string, objectId: string): string {
  return `${tenantId}/ficha-reports/${patientId}/${objectId}.pdf`;
}

/** The suggested download name: the patient id's first block, never patient data. */
export function fichaReportFilename(patientId: string): string {
  return `relatorio-ficha-${patientId.slice(0, 8)}.pdf`;
}

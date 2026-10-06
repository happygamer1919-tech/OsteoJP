/**
 * EPI-01b, piece 3: ONE PDF FOR A WHOLE EPISODE. PURE: no database, no server
 * import, no PDF library, so the selection, the order and the file's name are
 * unit-tested as statements. `episode-export.ts` reads the rows and renders;
 * this file decides which registos are in the file and in which order.
 *
 * ==========================================================================
 * THE SELECTION RULE: NEVER A PAGE THE PER-RECORD BUTTON WOULD NOT GIVE
 * ==========================================================================
 * A registo is in the episode's file when "Transferir PDF" on that registo
 * would print it, which is `isPrintable` (report-model.ts): finalized (locked
 * or signed) and not under AI review. The same function gates the per-record
 * button (record-status.ts) and the per-record engine (buildClinicalReportModel),
 * so the two exports cannot drift apart on a status.
 *
 * One rule is NARROWER than the per-record button: an ANNULLED registo is left
 * out. The Registos tab hides it unless asked, and a file that covers a whole
 * episode holds the registos that stand.
 *
 * Every version of a registo that passes the rule is in the file, as every
 * version is a row of the group on the tab.
 *
 * ==========================================================================
 * THE ORDER IS THE REGISTOS TAB'S
 * ==========================================================================
 * Oldest to newest by the CLINICAL date (`created_at`), then by version: the
 * order `groupForFicha` gives a group's rows (ficha-groups-core.ts). The id is
 * the last tie-break, so the same rows always give the same file.
 */
import { isPrintable, type RecordStatus } from "./report-model";

/** One registo of the episode, as the caller's own scope reads it. */
export type EpisodeExportRow = {
  id: string;
  status: RecordStatus;
  /** clinical_records.ai_review_state (null for a manual registo). */
  aiReviewState: string | null;
  /** True when a record_annulments row names it. */
  annulled: boolean;
  /** The clinical date (`created_at`). */
  createdAt: Date;
  version: number;
};

/** Is this registo in the episode's file? See the selection rule above. */
export function isEpisodeExportable(
  row: Pick<EpisodeExportRow, "status" | "aiReviewState" | "annulled">,
): boolean {
  return !row.annulled && isPrintable(row);
}

const byClinicalDateThenVersion = (a: EpisodeExportRow, b: EpisodeExportRow): number => {
  const at = a.createdAt.getTime() - b.createdAt.getTime();
  if (at !== 0) return at;
  if (a.version !== b.version) return a.version - b.version;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * The registos of the episode's file, in the file's order, and how many of the
 * rows read were left out. `leftOut` counts only rows the caller's scope read:
 * a registo outside that scope is never read, so it is never counted.
 */
export function selectEpisodeExport(rows: readonly EpisodeExportRow[]): {
  recordIds: string[];
  leftOut: number;
} {
  const included = rows.filter(isEpisodeExportable).sort(byClinicalDateThenVersion);
  return { recordIds: included.map((r) => r.id), leftOut: rows.length - included.length };
}

/**
 * The Storage object of one export: `<tenant>/episode-reports/<episode>/<object>.pdf`.
 * The per-record report's convention (`<tenant>/reports/<record>/<object>.pdf`)
 * under a folder of its own, so the two can never name the same object. Ids
 * only: no name, no date, no clinical text.
 */
export function episodeReportPath(tenantId: string, episodeId: string, objectId: string): string {
  return `${tenantId}/episode-reports/${episodeId}/${objectId}.pdf`;
}

/** The suggested download name: the episode id's first block, never patient data. */
export function episodeReportFilename(episodeId: string): string {
  return `relatorio-episodio-${episodeId.slice(0, 8)}.pdf`;
}

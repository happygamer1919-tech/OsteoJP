import "server-only";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { getStrings, type Locale } from "@osteojp/i18n";
import { canonicalId } from "../episode-reuse-core";
import { isClinicalError } from "../errors";
import { listFichaRecords } from "../ficha-groups";
import { groupForFicha, type FichaGroup } from "../ficha-groups-core";
import { mergeReportPdfs } from "./episode-pdf";
import {
  fichaReportFilename,
  selectFichaExport,
  type FichaExportSection,
} from "./ficha-export-core";
import { generateRegistoReportPdf, registoReadScope } from "./generate";
import { renderSectionPagePdf, type SectionHeading } from "./pdf";

/**
 * EXPORT-01: "Exportar ficha", ONE PDF FOR THE WHOLE PATIENT, from the Registos
 * tab. The episode file's shape (episode-export.ts), over every group the tab
 * draws: two steps, each its own function so the action (ficha-pdf-actions.ts)
 * can put the document ceiling between them.
 *
 *   readPatientFichaExportSelection   which registos, under which sections, in
 *                                     which order. One read, then the pure rule
 *                                     (ficha-export-core.ts).
 *   renderPatientFichaReport          a heading page per section, then each of
 *                                     its registos through the per-record
 *                                     engine, all joined into one document.
 *
 * EVERY READ IS THE CALLER'S OWN. The selection IS the Registos tab's read
 * (`listFichaRecords`: the capability, the therapist read scope on the
 * patient, the caller's RLS) and the tab's grouping, run again on the server.
 * Each registo is then printed by `generateRegistoReportPdf`: the very call
 * "Transferir PDF" makes for that registo, with the reach the registo page
 * opens it with. Nothing here uses the service-role client, so the file never
 * holds a page the caller could not download one registo at a time.
 */

/** A uuid's shape; anything else is refused before it reaches a uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FichaExportSelection = {
  patientId: string;
  /** The sections of the file, in the file's order. Never empty; none is empty. */
  sections: FichaExportSection[];
  /** Registos of the patient the caller reads that are not in the file. */
  leftOut: number;
};

/**
 * THE REGISTOS TAB OF ONE PATIENT, AS THE CALLER READS IT, or null for a
 * patient id that is not a uuid. It writes nothing.
 *
 * It IS the tab's read and the tab's grouping: `listFichaRecords` and
 * `groupForFicha`. Annulled registos are asked for, whatever the tab's toggle
 * shows: the file holds them, marked. An empty list is a patient of whom the
 * caller reads no registo: no such patient in the caller's tenant, a patient
 * outside the caller's reach, or one with no registo yet.
 * Reception holds no `clinical_records:read` and is refused before any read.
 */
export async function readPatientFichaGroups(
  ctx: RequestContext,
  input: { patientId: string },
): Promise<FichaGroup[] | null> {
  assertCan(ctx.role, "clinical_records:read");
  if (typeof input.patientId !== "string" || !UUID_RE.test(input.patientId)) return null;
  const records = await listFichaRecords(ctx, {
    patientId: canonicalId(input.patientId),
    includeAnnulled: true,
  });
  return groupForFicha(records);
}

/**
 * WHICH REGISTOS THE PATIENT'S FILE HOLDS, or null when there is nothing to
 * export: no registo the caller reads for this patient (`readPatientFichaGroups`)
 * or none the selection rule admits (ficha-export-core.ts: drafts only). It
 * writes nothing and renders nothing.
 */
export async function readPatientFichaExportSelection(
  ctx: RequestContext,
  input: { patientId: string },
): Promise<FichaExportSelection | null> {
  const groups = await readPatientFichaGroups(ctx, input);
  if (!groups) return null;
  const { sections, leftOut } = selectFichaExport(groups);
  if (sections.length === 0) return null;
  return { patientId: canonicalId(input.patientId), sections, leftOut };
}

export type FichaReportPdf = {
  bytes: Uint8Array;
  /** Suggested download filename: the patient id's first block, never patient data. */
  filename: string;
  /** The registos the file holds, in the file's order. Never empty. */
  recordIds: string[];
  /** How many sections (heading pages) the file holds. */
  sections: number;
  /** How many registos of the patient the caller reads that it does not hold. */
  leftOut: number;
};

/**
 * What a section's heading page says: the name the Registos tab gives the
 * group, in the tab's own words. An episode is named by its title (for the
 * imported history, the specialty, noted as imported); a registo filed in no
 * episode goes under the tab's "Sem episódio".
 */
function sectionHeading(section: FichaExportSection, locale: Locale): SectionHeading {
  const s = getStrings(locale);
  if (section.kind === "none") {
    return { overline: null, title: s["patients.fichaGroupNoEpisode"], note: null };
  }
  return {
    overline: s["report.record.episode"],
    title: section.label ?? s["report.record.episode"],
    note: section.kind === "imported" ? s["patients.fichaGroupImported"] : null,
  };
}

/**
 * THE PATIENT'S FILE: for each section, its heading page, then each of its
 * registos rendered by the per-record engine (`generateRegistoReportPdf`: the
 * caller-scoped load, the print gate, the branded layout, the annulment mark),
 * all joined in the selection's order (episode-pdf.ts copies the pages).
 *
 * The engine decides again for every registo, at the moment of the render: one
 * it does not find or refuses to print (`not_found`, `not_printable`) is left
 * out and counted, exactly as "Transferir PDF" on that registo would produce
 * nothing. A section left with no registo prints no heading. Any other fault
 * ends the export. Null when no registo rendered.
 *
 * The capability is asked here too, before the read scope: reception is
 * refused whoever made the selection.
 */
export async function renderPatientFichaReport(
  ctx: RequestContext,
  selection: FichaExportSelection,
  locale: Locale,
): Promise<FichaReportPdf | null> {
  assertCan(ctx.role, "clinical_records:read");
  const scope = await registoReadScope(ctx);
  const parts: Uint8Array[] = [];
  const recordIds: string[] = [];
  let sections = 0;
  let leftOut = selection.leftOut;
  for (const section of selection.sections) {
    const printed: Uint8Array[] = [];
    for (const recordId of section.recordIds) {
      try {
        printed.push((await generateRegistoReportPdf(ctx, recordId, locale, scope)).bytes);
        recordIds.push(recordId);
      } catch (e) {
        if (isClinicalError(e) && (e.code === "not_found" || e.code === "not_printable")) {
          leftOut += 1;
          continue;
        }
        throw e;
      }
    }
    if (printed.length === 0) continue;
    parts.push(await renderSectionPagePdf(sectionHeading(section, locale), locale), ...printed);
    sections += 1;
  }
  if (recordIds.length === 0) return null;

  return {
    bytes: await mergeReportPdfs(parts, getStrings(locale)["report.clinical.title"]),
    filename: fichaReportFilename(selection.patientId),
    recordIds,
    sections,
    leftOut,
  };
}

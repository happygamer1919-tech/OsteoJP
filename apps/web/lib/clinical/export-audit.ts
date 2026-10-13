import "server-only";
import { eq } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { clinicalRecords, locations, patients, type DbTx } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { clientIp, writeClinicalAudit } from "./audit";
import { ClinicalError } from "./errors";

/**
 * EXPORT-01: THE AUDIT ROW OF A DOCUMENT EXPORT (CLAUDE.md rule 6). Every PDF
 * of patient or clinical data that an action hands out as a signed URL writes
 * EXACTLY ONE `audit_log` row, in the caller's name, under the caller's own
 * tenant-scoped context. The row holds ids and counts only, never a name, a
 * title or clinical text (rule 7; `writeClinicalAudit` refuses free text).
 *
 *   the export                         action                      on           the row holds
 *   "Transferir PDF" (a registo)       clinical_record.export_pdf  the registo  recordId, patientId
 *   "PDF do episódio" (an app episode) episode.export_pdf          the episode  (recordEpisodeExport, report/episode-export.ts)
 *   "PDF do episódio" (imported group) patient.export_pdf          the patient  document, patientId, recordIds, 2 counts
 *   "Exportar ficha"                   patient.export_pdf          the patient  document, patientId, recordIds, 3 counts
 *   the RGPD form                      patient.export_pdf          the patient  document, patientId, recordId
 *   the Declaração de Presença         patient.export_pdf          the patient  document, patientId, locationId
 *
 * `document` is one word from a closed list (`PatientExportDocument`): which
 * of the four files about a patient this row is for. An imported group is
 * filed on the patient because it is one group per specialty over many
 * imported episodes, so it has no episode of its own to name; its label is a
 * stored title and is never written here.
 *
 * WHEN IT IS WRITTEN: AFTER the file is rendered, stored and signed, and
 * BEFORE the URL is returned, in every action. After, because what the row
 * counts is known only then (the per-record engine decides again for every
 * registo at the render), and because a request that produced no file writes
 * no row. Before the URL, because that is what makes the rule hold: the only
 * way an action answers with a URL is past this write. If the row cannot be
 * written the action hands out no URL and removes the file it just stored. So
 * a download always has its row; a row with no download behind it (a link
 * never opened) is the direction the rule allows.
 *
 * THE IDS ARE THE DATABASE'S OWN. An id that reaches an action as a bare
 * string (a registo's, a patient's, a location's) is read back from its row
 * inside the transaction that writes the audit row, under the caller's RLS,
 * and the row is written from what that read returned. A row the caller does
 * not read is `not_found`: nothing is written, so nothing is handed out.
 */

/** Which of the four files about a patient a `patient.export_pdf` row is for. */
export type PatientExportDocument = "ficha" | "imported_group" | "rgpd_form" | "declaracao";

/** The registo and its patient, as the caller reads them, or `not_found`. */
async function readRegistoIds(tx: DbTx, recordId: string): Promise<{ id: string; patientId: string }> {
  const [row] = await tx
    .select({ id: clinicalRecords.id, patientId: clinicalRecords.patientId })
    .from(clinicalRecords)
    .where(eq(clinicalRecords.id, recordId))
    .limit(1);
  if (!row) throw new ClinicalError("not_found");
  return row;
}

/** One `patient.export_pdf` row: the document, the patient, and `rest`, which is ids and counts. */
async function writePatientExport(
  tx: DbTx,
  ctx: RequestContext,
  ip: string | null,
  document: PatientExportDocument,
  patientId: string,
  rest: Record<string, string | number | string[]>,
): Promise<void> {
  await writeClinicalAudit(tx, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "patient.export_pdf",
    entityType: "patient",
    entityId: patientId,
    metadata: { document, patientId, ...rest },
    ip,
  });
}

/**
 * "Transferir PDF": one registo's PDF left. `clinical_record.export_pdf` on the
 * registo, naming it and its patient.
 */
export async function recordRegistoExport(ctx: RequestContext, recordId: string): Promise<void> {
  const ip = await clientIp();
  await runScoped(
    ctx,
    async (tx) => {
      const record = await readRegistoIds(tx, recordId);
      await writeClinicalAudit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: "clinical_record.export_pdf",
        entityType: "clinical_record",
        entityId: record.id,
        metadata: { recordId: record.id, patientId: record.patientId },
        ip,
      });
    },
    "clinical:registo-export-audit",
  );
}

/**
 * The RGPD form, asked for from a registo, is a document about that registo's
 * patient: `patient.export_pdf` on the patient, naming the registo it was
 * asked from.
 */
export async function recordRgpdFormExport(ctx: RequestContext, recordId: string): Promise<void> {
  const ip = await clientIp();
  await runScoped(
    ctx,
    async (tx) => {
      const record = await readRegistoIds(tx, recordId);
      await writePatientExport(tx, ctx, ip, "rgpd_form", record.patientId, { recordId: record.id });
    },
    "clinical:rgpd-form-export-audit",
  );
}

/**
 * "PDF do episódio" on an imported group. `recordIds` names the registos that
 * are IN the file, in the file's order, as `recordEpisodeExport` does;
 * `recordsIncluded` is their number. A registo left out is counted
 * (`recordsLeftOut`) and never named. The group's label is not written.
 */
export async function recordImportedGroupExport(
  ctx: RequestContext,
  exported: { patientId: string; recordIds: readonly string[]; leftOut: number },
): Promise<void> {
  const ip = await clientIp();
  await runScoped(
    ctx,
    (tx) =>
      writePatientExport(tx, ctx, ip, "imported_group", exported.patientId, {
        recordIds: [...exported.recordIds],
        recordsIncluded: exported.recordIds.length,
        recordsLeftOut: exported.leftOut,
      }),
    "clinical:imported-group-export-audit",
  );
}

/**
 * "Exportar ficha": the whole patient. The registos in the file, in the file's
 * order, their number, the number of sections (heading pages) the file holds
 * and the number of registos left out. No section is named: a section's name
 * is an episode's title.
 */
export async function recordPatientFichaExport(
  ctx: RequestContext,
  exported: { patientId: string; recordIds: readonly string[]; sections: number; leftOut: number },
): Promise<void> {
  const ip = await clientIp();
  await runScoped(
    ctx,
    (tx) =>
      writePatientExport(tx, ctx, ip, "ficha", exported.patientId, {
        recordIds: [...exported.recordIds],
        recordsIncluded: exported.recordIds.length,
        sectionsIncluded: exported.sections,
        recordsLeftOut: exported.leftOut,
      }),
    "clinical:ficha-export-audit",
  );
}

/**
 * The Declaração de Presença: the patient and the location it was issued for.
 * The day, the hours, the NIF and the observações typed in the dialog are not
 * ids and are not written.
 */
export async function recordDeclaracaoExport(
  ctx: RequestContext,
  exported: { patientId: string; locationId: string },
): Promise<void> {
  const ip = await clientIp();
  await runScoped(
    ctx,
    async (tx) => {
      const [patient] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.id, exported.patientId))
        .limit(1);
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, exported.locationId))
        .limit(1);
      if (!patient || !location) throw new ClinicalError("not_found");
      await writePatientExport(tx, ctx, ip, "declaracao", patient.id, { locationId: location.id });
    },
    "clinical:declaracao-export-audit",
  );
}

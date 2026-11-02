"use server";
import { randomUUID } from "node:crypto";
import { can } from "@osteojp/auth";
import { locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { recordPatientFichaExport } from "@/lib/clinical/export-audit";
import {
  overridesByRecord,
  overridesWithin,
  parseExportOverrides,
  type ExportRow,
} from "@/lib/clinical/report/export-overrides";
import {
  readPatientFichaExportRows,
  readPatientFichaExportSelection,
  renderPatientFichaReport,
} from "@/lib/clinical/report/ficha-export";
import { fichaReportPath } from "@/lib/clinical/report/ficha-export-core";
import { ATTACHMENTS_BUCKET } from "@/lib/clinical/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * EXPORT-01: "Exportar ficha" on the Registos tab. ONE PDF of the whole
 * patient: every group the tab shows the caller, oldest first, each under a
 * heading page, each finalized registo printed by the per-record report
 * engine, handed back as a short-lived SIGNED download URL. It mirrors
 * `downloadEpisodeReportUrlAction` (episode-pdf-actions.ts): the same
 * capability, the same bucket, a 60s signed URL that carries an opaque token
 * and nothing else, bytes never proxied through Next, and `{ url: null }` for
 * every refusal and every failure, so nothing internal reaches the screen.
 *
 * THE ORDER, and why each step sits where it does:
 *   1. the capability (`clinical_records:read`; reception holds none) and the
 *      shape of the patient id;
 *   2. WHICH REGISTOS: the tab's own read and grouping, run again under the
 *      caller's scope (`readPatientFichaExportSelection`). Nothing to export
 *      (no such patient for this caller, a patient outside their reach, no
 *      registo, none finalized) ends here, having rendered, stored and spent
 *      nothing;
 *   3. THE DOCUMENT CEILING (document-rate-limit.ts), once: one export writes
 *      one permanent Storage object, whatever the number of registos in it;
 *   4. the render, the upload and the signed URL;
 *   5. THE AUDIT ROW (`patient.export_pdf`, document `ficha`), before the URL
 *      is returned. If it cannot be written, the URL is not handed out: no
 *      export leaves without its row. The file just stored is then removed,
 *      best effort, since nothing will ever link to it. The row names the
 *      patient and the registos in the file and counts the rest; no section
 *      is named.
 *
 * RODICA-export-edit-before-download (owner ruling 2026-11-02): `overrides`
 * is what the export dialog sent when the user chose "Alterar": per registo,
 * the date, the hour and the heading text THIS FILE prints. It is checked
 * value by value before any read (`parseExportOverrides`), and every registo
 * it names must be one the selection of step 2 holds (`overridesWithin`):
 * anything else is a refusal, with nothing rendered or spent. The registos
 * exported are always the server's own selection; the dialog only changes
 * what the selected ones print. Nothing is written to any registo. Which
 * registos printed changed values, and the values before and after, go in
 * the audit row.
 */
export async function downloadPatientFichaUrlAction(
  patientId: string,
  overrides?: unknown,
): Promise<{ url: string | null }> {
  // The export's own time, written into its audit row (batch item 11): from
  // the action's start, before the session is read, to the signed URL, the
  // audit write itself not included. performance.now() is monotonic: a clock
  // adjustment during the export cannot bend it.
  const started = performance.now();
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:read")) return { url: null };
  if (typeof patientId !== "string" || !UUID_RE.test(patientId)) return { url: null };
  const asked = parseExportOverrides(overrides);
  if (!asked) return { url: null };

  // The step under way, so a fault thrown from it is logged under its name.
  let step: ExportStep = "read";
  try {
    const selection = await readPatientFichaExportSelection(ctx, { patientId });
    if (!selection) return { url: null };
    if (!overridesWithin(asked, selection.sections.flatMap((s) => s.recordIds))) return { url: null };

    step = "limit";
    if (!(await documentGenerationAllowed(ctx.userId))) return { url: null };

    step = "render";
    // With no override the render is called exactly as it always was.
    const byRecord = overridesByRecord(asked);
    const pdf =
      byRecord.size > 0
        ? await renderPatientFichaReport(ctx, selection, locale, byRecord)
        : await renderPatientFichaReport(ctx, selection, locale);
    if (!pdf) return { url: null };

    step = "upload";
    // Tenant-prefixed object path; the patient id only - no PII.
    const path = fichaReportPath(ctx.tenantId, selection.patientId, randomUUID());
    const admin = createSupabaseAdminClient();
    const up = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return failedAt("upload");

    step = "sign";
    const signed = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 60, { download: pdf.filename });
    if (signed.error || !signed.data) return failedAt("sign");

    try {
      await recordPatientFichaExport(ctx, {
        patientId: selection.patientId,
        recordIds: pdf.recordIds,
        sections: pdf.sections,
        leftOut: pdf.leftOut,
        durationMs: performance.now() - started,
        ...(pdf.overridden ? { overridden: pdf.overridden } : {}),
      });
    } catch {
      // No row, so no URL, and the file just stored will never be linked to:
      // it is removed. Best effort: whether or not the removal works, the
      // answer is the same and the failure logged is the audit's.
      try {
        await admin.storage.from(ATTACHMENTS_BUCKET).remove([path]);
      } catch {
        // Nothing to add: the audit failure is what is reported below.
      }
      return failedAt("audit");
    }
    return { url: signed.data.signedUrl };
  } catch {
    // A read, the ceiling, the render or a Storage call threw: never surface
    // internals or PII.
    return failedAt(step);
  }
}

/**
 * RODICA-export-edit-before-download: THE EXPORT DIALOG'S ROWS for "Exportar
 * ficha", asked when the user chooses "Alterar": every registo the file would
 * print, with the appointment's date and hour and the heading it prints when
 * nothing is changed. The same capability, the same patient id check and the
 * same selection as the export itself; reads only, so no ceiling is spent and
 * no audit row is written. `{ rows: null }` for every refusal and every
 * failure, as the export answers `{ url: null }`.
 */
export async function readPatientFichaExportRowsAction(patientId: string): Promise<{ rows: ExportRow[] | null }> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:read")) return { rows: null };
  if (typeof patientId !== "string" || !UUID_RE.test(patientId)) return { rows: null };
  try {
    const selection = await readPatientFichaExportSelection(ctx, { patientId });
    if (!selection) return { rows: null };
    const rows = await readPatientFichaExportRows(ctx, selection, locale);
    return { rows: rows.length > 0 ? rows : null };
  } catch {
    console.error("[ficha-pdf] the ficha export's dialog rows failed to load");
    return { rows: null };
  }
}

/** The steps of an export that can fail. */
type ExportStep = "read" | "limit" | "render" | "upload" | "sign" | "audit";

/**
 * A FAILED EXPORT IS LOGGED, BECAUSE THE SCREEN CANNOT REPORT IT: every refusal
 * and every failure is the same `{ url: null }` on screen (the reasoning of
 * episode-pdf-actions.ts `failedAt`). The line names the step and nothing
 * else: no id, no error object and no message text. A REFUSAL IS NOT A FAILURE
 * and logs nothing here.
 */
function failedAt(step: ExportStep): { url: null } {
  console.error(`[ficha-pdf] the ficha export failed at step: ${step}`);
  return { url: null };
}

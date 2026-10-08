"use server";
import { randomUUID } from "node:crypto";
import { can } from "@osteojp/auth";
import { locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import {
  readEpisodeExportSelection,
  readImportedGroupExportSelection,
  recordEpisodeExport,
  renderEpisodeReport,
  renderImportedGroupReport,
} from "@/lib/clinical/report/episode-export";
import { episodeReportPath, importedGroupReportPath } from "@/lib/clinical/report/episode-export-core";
import { ATTACHMENTS_BUCKET } from "@/lib/clinical/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * EPI-01b, piece 3: "PDF do episódio" on an episode group of the Registos tab.
 * ONE PDF of the episode's finalized registos, oldest first, each printed by
 * the per-record report engine, handed back as a short-lived SIGNED download
 * URL. It mirrors `downloadReportUrlAction` (clinical/[id]/actions.ts): the
 * same capability, the same bucket, a 60s signed URL that carries an opaque
 * token and nothing else, bytes never proxied through Next, and `{ url: null }`
 * for every refusal and every failure, so nothing internal reaches the screen.
 *
 * THE ORDER, and why each step sits where it does:
 *   1. the capability (`clinical_records:read`; reception holds none) and the
 *      shape of the two ids;
 *   2. WHICH REGISTOS, read under the caller's own scope
 *      (`readEpisodeExportSelection`). Nothing to export (no such episode for
 *      this patient, an imported one, an empty one, none finalized, none the
 *      caller reads) ends here, having rendered, stored and spent nothing;
 *   3. THE DOCUMENT CEILING (ROUTE 6, document-rate-limit.ts), once: one export
 *      writes one permanent Storage object, whatever the number of registos in
 *      it. After every check that can refuse, before the render, as its own
 *      rule asks: a request that was never going to produce a document does
 *      not spend the caller's allowance;
 *   4. the render, the upload and the signed URL;
 *   5. THE AUDIT ROW (`episode.export_pdf`), before the URL is returned. If it
 *      cannot be written, the URL is not handed out: no export leaves without
 *      its row. The file just stored is then removed, best effort, since
 *      nothing will ever link to it.
 */
export async function downloadEpisodeReportUrlAction(
  patientId: string,
  episodeId: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:read")) return { url: null };
  if (typeof patientId !== "string" || typeof episodeId !== "string") return { url: null };
  if (!UUID_RE.test(patientId) || !UUID_RE.test(episodeId)) return { url: null };

  // The step under way, so a fault thrown from it is logged under its name.
  let step: ExportStep = "read";
  try {
    const selection = await readEpisodeExportSelection(ctx, { patientId, episodeId });
    if (!selection) return { url: null };

    step = "limit";
    if (!(await documentGenerationAllowed(ctx.userId))) return { url: null };

    step = "render";
    const pdf = await renderEpisodeReport(ctx, selection, locale);
    if (!pdf) return { url: null };

    step = "upload";
    // Tenant-prefixed object path; the episode id only - no PII.
    const path = episodeReportPath(ctx.tenantId, selection.episodeId, randomUUID());
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
      await recordEpisodeExport(ctx, {
        episodeId: selection.episodeId,
        patientId: selection.patientId,
        recordIds: pdf.recordIds,
        leftOut: pdf.leftOut,
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
 * EXPORT-01: "PDF do episódio" on an IMPORTED group of the Registos tab. ONE
 * PDF of the group's finalized registos, oldest first, each printed as its own
 * page shows it (the stored field names under the read-only notice), handed
 * back as a short-lived SIGNED download URL. The action above, step for step,
 * for the group the tab draws from the imported history:
 *
 *   1. the capability (`clinical_records:read`; reception holds none) and the
 *      shape of the patient id and of the group's label;
 *   2. WHICH REGISTOS: the tab's own read and grouping, run again under the
 *      caller's scope (`readImportedGroupExportSelection`). No such group for
 *      this caller, or none of its registos finalized, ends here, having
 *      rendered, stored and spent nothing;
 *   3. the document ceiling, once;
 *   4. the render, the upload and the signed URL.
 * `{ url: null }` for every refusal and every failure, as above.
 */
export async function downloadImportedGroupReportUrlAction(
  patientId: string,
  specialty: string,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:read")) return { url: null };
  if (typeof patientId !== "string" || typeof specialty !== "string") return { url: null };
  if (!UUID_RE.test(patientId) || specialty === "") return { url: null };

  let step: ExportStep = "read";
  try {
    const selection = await readImportedGroupExportSelection(ctx, { patientId, specialty });
    if (!selection) return { url: null };

    step = "limit";
    if (!(await documentGenerationAllowed(ctx.userId))) return { url: null };

    step = "render";
    const pdf = await renderImportedGroupReport(ctx, selection, locale);
    if (!pdf) return { url: null };

    step = "upload";
    // Tenant-prefixed object path; the patient id only - no PII, no specialty.
    const path = importedGroupReportPath(ctx.tenantId, selection.patientId, randomUUID());
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
    return { url: signed.data.signedUrl };
  } catch {
    // A read, the ceiling, the render or a Storage call threw: never surface
    // internals or PII.
    return failedAt(step);
  }
}

/** The steps of an export that can fail. */
type ExportStep = "read" | "limit" | "render" | "upload" | "sign" | "audit";

/**
 * A FAILED EXPORT IS LOGGED, BECAUSE THE SCREEN CANNOT REPORT IT. Every refusal
 * and every failure is the same `{ url: null }` on screen, so a fault must be
 * tellable from a refusal somewhere (the reasoning of document-rate-limit.ts's
 * own refusal line). The line names the step and nothing else: no id, no error
 * object and no message text, which could carry what the step was reading.
 *
 * A REFUSAL IS NOT A FAILURE and logs nothing here: no capability, a malformed
 * id, nothing to export, the ceiling reached (which logs its own line), no
 * registo printed after all.
 */
function failedAt(step: ExportStep): { url: null } {
  console.error(`[episode-pdf] the episode export failed at step: ${step}`);
  return { url: null };
}

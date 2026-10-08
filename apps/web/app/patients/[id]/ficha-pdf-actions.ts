"use server";
import { randomUUID } from "node:crypto";
import { can } from "@osteojp/auth";
import { locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { readPatientFichaExportSelection, renderPatientFichaReport } from "@/lib/clinical/report/ficha-export";
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
 *   4. the render, the upload and the signed URL.
 */
export async function downloadPatientFichaUrlAction(patientId: string): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:read")) return { url: null };
  if (typeof patientId !== "string" || !UUID_RE.test(patientId)) return { url: null };

  // The step under way, so a fault thrown from it is logged under its name.
  let step: ExportStep = "read";
  try {
    const selection = await readPatientFichaExportSelection(ctx, { patientId });
    if (!selection) return { url: null };

    step = "limit";
    if (!(await documentGenerationAllowed(ctx.userId))) return { url: null };

    step = "render";
    const pdf = await renderPatientFichaReport(ctx, selection, locale);
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
    return { url: signed.data.signedUrl };
  } catch {
    // A read, the ceiling, the render or a Storage call threw: never surface
    // internals or PII.
    return failedAt(step);
  }
}

/** The steps of an export that can fail. */
type ExportStep = "read" | "limit" | "render" | "upload" | "sign";

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

import "server-only";
import type { SQL } from "drizzle-orm";
import { assertCan, toClaims, type RequestContext } from "@osteojp/auth";
import { clinicalRecords, type TenantClaims } from "@osteojp/db";
import type { Locale } from "@osteojp/i18n";
import { therapistPatientReadScope } from "@/lib/patients/scope";
import { ClinicalError } from "../errors";
import { loadClinicalReportInputs } from "./load";
import { buildClinicalReportModel, RecordNotPrintableError } from "./report-model";
import { renderClinicalReportPdf } from "./pdf";

// Orchestrator: load (tenant-scoped, read-only) → gate (finalized-only) →
// render. The caller is a server action / route that has already authorized the
// requesting user (clinical read permission) and supplies their tenant claims;
// RLS in loadClinicalReportInputs is the defense-in-depth layer.

export type ClinicalReportPdf = {
  bytes: Uint8Array;
  /** Suggested download filename — record id only, never patient PII. */
  filename: string;
};

/**
 * Generate the branded PDF for a finalized clinical record.
 *
 * Throws ClinicalError("not_found") if the record isn't visible in this tenant
 * context, and ClinicalError("not_printable") if it is a draft or still under AI
 * review (the gate lives in buildClinicalReportModel).
 *
 * `scope` narrows the record read (load.ts); `generateRegistoReportPdf` below
 * is the caller that supplies the registo page's own.
 */
export async function generateClinicalReportPdf(
  claims: TenantClaims,
  recordId: string,
  locale: Locale,
  scope?: SQL,
): Promise<ClinicalReportPdf> {
  const inputs = await loadClinicalReportInputs(claims, recordId, scope);
  if (!inputs) throw new ClinicalError("not_found");

  let model;
  try {
    model = buildClinicalReportModel(inputs, locale);
  } catch (e) {
    // Translate the pure gate's error to the domain error at the server boundary.
    if (e instanceof RecordNotPrintableError) throw new ClinicalError("not_printable");
    throw e;
  }
  const bytes = await renderClinicalReportPdf(model, locale);

  return {
    bytes,
    filename: `relatorio-clinico-${recordId.slice(0, 8)}.pdf`,
  };
}

/**
 * EXPORT-01: THE REGISTO'S PDF FOR WHOEVER MAY OPEN THE REGISTO, AND NOBODY
 * ELSE. The registo page reads a record with the capability, the therapist
 * read scope on the record's patient, and the caller's RLS (`getRecordDetail`,
 * records.ts). This is that same reach, in that order, in front of the engine
 * above, so the export answers exactly where the page does:
 *
 *   - reception holds no `clinical_records:read` and is refused before any read;
 *   - a therapist gets a registo of a patient they may open (they treat or
 *     created the patient, or are on the care team at their own clinics). The
 *     registo policy by itself also admits a registo they authored, whoever
 *     the patient; the page answers 404 for one whose patient they may not
 *     open, and so does this (`not_found`);
 *   - an admin and the owner are narrowed by RLS only, as on the page.
 *
 * `scope` lets a caller that prints many registos ask for it once
 * (`registoReadScope`); it must be the value that function returned for `ctx`.
 * A draft, or a record under AI review, is `not_printable` whoever asks. An
 * annulled registo is printed, with its mark.
 */
export async function generateRegistoReportPdf(
  ctx: RequestContext,
  recordId: string,
  locale: Locale,
  scope?: { value: SQL | undefined },
): Promise<ClinicalReportPdf> {
  assertCan(ctx.role, "clinical_records:read");
  const narrowed = scope ? scope.value : (await registoReadScope(ctx)).value;
  return generateClinicalReportPdf(toClaims(ctx), recordId, locale, narrowed);
}

/**
 * The read scope `generateRegistoReportPdf` applies for `ctx`, asked once. The
 * value is `undefined` for every role the scope does not narrow, which is why
 * it travels in a box: "not asked yet" and "asked, and there is none" differ.
 */
export async function registoReadScope(ctx: RequestContext): Promise<{ value: SQL | undefined }> {
  return { value: await therapistPatientReadScope(ctx, clinicalRecords.patientId) };
}

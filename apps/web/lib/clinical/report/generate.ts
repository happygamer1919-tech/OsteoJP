import "server-only";
import type { TenantClaims } from "@osteojp/db";
import type { Locale } from "@osteojp/i18n";
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
 */
export async function generateClinicalReportPdf(
  claims: TenantClaims,
  recordId: string,
  locale: Locale,
): Promise<ClinicalReportPdf> {
  const inputs = await loadClinicalReportInputs(claims, recordId);
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

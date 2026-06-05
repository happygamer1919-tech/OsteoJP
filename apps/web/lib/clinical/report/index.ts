// Clinical-report PDF — public surface.
//
// Generates a branded PDF of a FINALIZED (locked/signed) clinical record:
// OsteoJP brand mark, the printing location's contacts, clinic fiscal
// identification in the header, the clinical body, and a signature block.
// Draft and under-review records are rejected. Read-only on clinical_records.
//
// This is a CLINICAL document, NOT a fiscal one — no fatura-recibo / ATCUD /
// QR / SAF-T.

export { generateClinicalReportPdf, type ClinicalReportPdf } from "./generate";

// Pure seams (testable without a DB or the PDF lib).
export {
  isPrintable,
  assertPrintable,
  buildClinicalReportModel,
  RecordNotPrintableError,
  PRINTABLE_STATUSES,
  UNDER_REVIEW_AI_STATES,
  REPORT_BODY_KEYS,
  type ClinicalReportModel,
  type ReportInputs,
  type ReportBodyKey,
  type RecordStatus,
} from "./report-model";

export {
  resolveLocationContact,
  normalizeLocationKey,
  OSTEOJP_LOCATION_CONTACTS,
  type LocationContact,
  type SourceLocation,
} from "./location-contacts";

export {
  resolveClinicFiscal,
  type ClinicFiscal,
  type ClinicFiscalSource,
} from "./clinic-fiscal";

export { renderClinicalReportPdf } from "./pdf";

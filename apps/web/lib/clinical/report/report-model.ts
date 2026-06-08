// Clinical-report model — the pure projection a locked clinical record into the
// value shape the PDF renderer consumes, plus the finalized-only print gate.
//
// No DB, no PDF lib, no i18n: this is the testable core. Labels are applied by
// the renderer (i18n PT/EN); this module produces values only. Dates are
// formatted here (Europe/Lisbon) because the renderer is locale-agnostic layout.
//
// This is a CLINICAL report, NOT a fiscal document: the "fiscal" fields are
// IDENTIFICATION only (clinic fiscal name + NIF in the header). No fatura-recibo,
// no ATCUD, no QR, no SAF-T — deliberately out of scope.

import type { Locale } from "@osteojp/i18n";
import { resolveLocationContact, type LocationContact, type SourceLocation } from "./location-contacts";

export type RecordStatus = "draft" | "locked" | "signed";

/**
 * Thrown by the print gate when a record is not finalized (draft / under AI
 * review). Local + pure (no `server-only`) so the gate stays node-testable; the
 * server boundary (generate.ts) translates it to ClinicalError("not_printable").
 */
export class RecordNotPrintableError extends Error {
  override readonly name = "RecordNotPrintableError";
  readonly code = "not_printable" as const;
  constructor(message = "Clinical record is not finalized and cannot be printed") {
    super(message);
  }
}

/** record_status values that may be printed: the finalized states. */
export const PRINTABLE_STATUSES: ReadonlySet<RecordStatus> = new Set(["locked", "signed"]);

/**
 * ai_review_state values that mean "still under review". A record in any of
 * these must never print, even if its record_status somehow reads finalized
 * (defense in depth — by rule AI ingestion never produces a locked record).
 */
export const UNDER_REVIEW_AI_STATES: ReadonlySet<string> = new Set([
  "pending_review",
  "in_review",
]);

// ---------------------------------------------------------------------------
// Inputs (already loaded, tenant-scoped, by load.ts)
// ---------------------------------------------------------------------------

export type ReportRecordInput = {
  id: string;
  status: RecordStatus;
  /** clinical_records.ai_review_state (null for manual records). */
  aiReviewState: string | null;
  version: number;
  episodeId: string | null;
  /** The filled form response (clinical_records.data jsonb). */
  data: unknown;
  /** Consultation date — appointment start, else the record's creation date. */
  consultationDate: Date | null;
  signedAt: Date | null;
};

export type ReportPatientInput = {
  fullName: string;
  /** clinical date-only string "YYYY-MM-DD" (patients.date_of_birth). */
  dateOfBirth: string | null;
  nif: string | null;
};

export type ReportPractitionerInput = {
  fullName: string | null;
  /** e.g. "Osteopata", "Fisioterapeuta" — printed under the signature. */
  title: string | null;
  /** Name of the signer (clinical_records.signed_by), when signed. */
  signedByName: string | null;
};

/** Clinic FISCAL IDENTIFICATION (header). From the tenant record. */
export type ReportClinicInput = {
  fiscalName: string;
  nif: string;
};

export type ReportInputs = {
  record: ReportRecordInput;
  patient: ReportPatientInput;
  practitioner: ReportPractitionerInput;
  clinic: ReportClinicInput;
  /** The record's printing location (from its appointment). */
  location: SourceLocation;
};

// ---------------------------------------------------------------------------
// Output model
// ---------------------------------------------------------------------------

/** Clinical body fields, in print order. Keys map to i18n labels at render. */
export const REPORT_BODY_KEYS = [
  "consultationReason",
  "background",
  "mainComplaints",
  "diagnosis",
  "treatmentGoals",
  "treatmentPlan",
  "observations",
] as const;
export type ReportBodyKey = (typeof REPORT_BODY_KEYS)[number];

/** Candidate keys in clinical_records.data for each body field (tolerant read). */
const BODY_FIELD_SOURCES: Record<ReportBodyKey, readonly string[]> = {
  consultationReason: ["consultationReason", "consultation_reason", "motivo", "reason"],
  background: ["background", "antecedentes", "history"],
  mainComplaints: ["mainComplaints", "main_complaints", "queixas", "complaints"],
  diagnosis: ["diagnosis", "diagnostico"],
  treatmentGoals: ["treatmentGoals", "treatment_goals", "objetivos"],
  treatmentPlan: ["treatmentPlan", "treatment_plan", "plano"],
  observations: ["observations", "observacoes", "notes", "notas"],
};

export type ClinicalReportModel = {
  clinic: { fiscalName: string; nif: string };
  location: LocationContact;
  patient: { fullName: string; dateOfBirth: string | null; nif: string | null };
  record: {
    id: string;
    version: number;
    status: RecordStatus;
    consultationDate: string | null;
    episodeId: string | null;
  };
  /** Only the fields actually present in the record data, in template order. */
  body: { key: ReportBodyKey; value: string }[];
  signature: {
    practitionerName: string | null;
    practitionerTitle: string | null;
    signedAt: string | null;
  };
};

// ---------------------------------------------------------------------------
// Print gate
// ---------------------------------------------------------------------------

/** True iff this record may be printed: finalized AND not under AI review. */
export function isPrintable(record: Pick<ReportRecordInput, "status" | "aiReviewState">): boolean {
  if (record.aiReviewState && UNDER_REVIEW_AI_STATES.has(record.aiReviewState)) {
    return false;
  }
  return PRINTABLE_STATUSES.has(record.status);
}

/**
 * Throw unless the record may be printed. `draft` and any under-review record
 * are rejected with ClinicalError("not_printable"); finalized (locked/signed)
 * records pass.
 */
export function assertPrintable(
  record: Pick<ReportRecordInput, "status" | "aiReviewState">,
): void {
  if (!isPrintable(record)) {
    throw new RecordNotPrintableError();
  }
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

function localeTag(locale: Locale): string {
  return locale === "pt" ? "pt-PT" : "en-GB";
}

/** Format a timestamp as a Lisbon-local short date for the given locale. */
function formatDate(d: Date | null, locale: Locale): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Format a date-only "YYYY-MM-DD" string (e.g. DOB) WITHOUT timezone math, so it
 * never shifts a day. Parsed at UTC and formatted at UTC → the literal calendar
 * date, localized (pt-PT → dd/mm/aaaa, en-GB → dd/mm/yyyy).
 */
function formatDateOnly(value: string | null, locale: Locale): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Tolerantly read a non-empty string body field from the record data. */
function readBodyField(data: Record<string, unknown>, key: ReportBodyKey): string | null {
  for (const candidate of BODY_FIELD_SOURCES[key]) {
    const v = data[candidate];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * Build the print-ready model from loaded inputs. Enforces the print gate first
 * (a draft / under-review record throws before any model is produced).
 */
export function buildClinicalReportModel(
  inputs: ReportInputs,
  locale: Locale,
): ClinicalReportModel {
  assertPrintable(inputs.record);

  const data =
    typeof inputs.record.data === "object" && inputs.record.data !== null
      ? (inputs.record.data as Record<string, unknown>)
      : {};

  const body = REPORT_BODY_KEYS.map((key) => ({ key, value: readBodyField(data, key) }))
    .filter((f): f is { key: ReportBodyKey; value: string } => f.value !== null);

  // A signed record prints the signer; a locked-but-unsigned one prints the
  // authoring practitioner (no signature line value).
  const practitionerName =
    inputs.practitioner.signedByName ?? inputs.practitioner.fullName ?? null;

  return {
    clinic: { fiscalName: inputs.clinic.fiscalName, nif: inputs.clinic.nif },
    location: resolveLocationContact(inputs.location),
    patient: {
      fullName: inputs.patient.fullName,
      dateOfBirth: formatDateOnly(inputs.patient.dateOfBirth, locale),
      nif: inputs.patient.nif,
    },
    record: {
      id: inputs.record.id,
      version: inputs.record.version,
      status: inputs.record.status,
      consultationDate: formatDate(inputs.record.consultationDate, locale),
      episodeId: inputs.record.episodeId,
    },
    body,
    signature: {
      practitionerName,
      practitionerTitle: inputs.practitioner.title,
      signedAt: formatDate(inputs.record.signedAt, locale),
    },
  };
}

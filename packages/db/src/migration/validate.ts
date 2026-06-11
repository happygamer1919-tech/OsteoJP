// packages/db/src/migration/validate.ts
//
// Shape validation for intermediate records, run between staging and import
// (pending → validated | failed). TypeScript types constrain compile-time
// callers, but adapter output is built from UNTRUSTED source data at runtime —
// this is the gate that keeps a malformed row from reaching the importer.
//
// Returned details are PII-free: field names and codes only, never values
// (CLAUDE.md rule 7). The raw payload stays in migration_staging_rows.raw.

import type { MigrationErrorDetail, MigrationRecord } from "./types";

const APPOINTMENT_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);
const EPISODE_STATUSES = new Set(["open", "closed"]);
const RECORD_STATUSES = new Set(["draft", "locked"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isNonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isIsoDate = (v: unknown): boolean => isNonEmpty(v) && ISO_DATE.test(v);
const isIsoInstant = (v: unknown): boolean =>
  isNonEmpty(v) && !Number.isNaN(new Date(v).getTime());

/**
 * Validate one intermediate record. Returns null when valid, otherwise a
 * structured detail ready for markFailed().
 */
export function validateMigrationRecord(rec: MigrationRecord): MigrationErrorDetail | null {
  const bad: string[] = [];

  switch (rec.entityType) {
    case "patient": {
      const p = rec.data;
      if (!isNonEmpty(p.sourceId)) bad.push("sourceId");
      if (!isNonEmpty(p.fullName)) bad.push("fullName");
      if (p.dateOfBirth != null && !isIsoDate(p.dateOfBirth)) bad.push("dateOfBirth");
      if (!Array.isArray(p.locationKeys)) bad.push("locationKeys");
      break;
    }
    case "appointment": {
      const a = rec.data;
      if (!isNonEmpty(a.sourceId)) bad.push("sourceId");
      if (!isNonEmpty(a.patientSourceId)) bad.push("patientSourceId");
      if (!isNonEmpty(a.practitionerKey)) bad.push("practitionerKey");
      if (!isNonEmpty(a.locationKey)) bad.push("locationKey");
      if (!isIsoInstant(a.startsAt)) bad.push("startsAt");
      if (!isIsoInstant(a.endsAt)) bad.push("endsAt");
      if (!APPOINTMENT_STATUSES.has(a.status)) bad.push("status");
      break;
    }
    case "clinical_episode": {
      const e = rec.data;
      if (!isNonEmpty(e.sourceId)) bad.push("sourceId");
      if (!isNonEmpty(e.patientSourceId)) bad.push("patientSourceId");
      if (!isNonEmpty(e.title)) bad.push("title");
      if (!EPISODE_STATUSES.has(e.status)) bad.push("status");
      if (!isIsoInstant(e.openedAt)) bad.push("openedAt");
      if (e.closedAt != null && !isIsoInstant(e.closedAt)) bad.push("closedAt");
      break;
    }
    case "clinical_record": {
      const r = rec.data;
      if (!isNonEmpty(r.sourceId)) bad.push("sourceId");
      if (!isNonEmpty(r.patientSourceId)) bad.push("patientSourceId");
      if (r.data === null || typeof r.data !== "object" || Array.isArray(r.data))
        bad.push("data");
      if (!RECORD_STATUSES.has(r.status)) bad.push("status");
      if (r.recordedAt != null && !isIsoInstant(r.recordedAt)) bad.push("recordedAt");
      break;
    }
    case "attachment": {
      const a = rec.data;
      if (!isNonEmpty(a.sourceId)) bad.push("sourceId");
      if (!isNonEmpty(a.storagePath)) bad.push("storagePath");
      if (!isNonEmpty(a.fileName)) bad.push("fileName");
      break;
    }
  }

  if (bad.length === 0) return null;
  return {
    code: "validation_failed",
    message: `invalid or missing intermediate fields: ${bad.join(", ")}`,
    fields: bad,
  };
}

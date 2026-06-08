// Field-level redaction for the patient fichas endpoint — the CRITICAL guard
// that keeps therapist-private content out of a patient response.
//
// Why this exists: RLS (migration 0010) is ROW-level only — it confines a
// patient to their OWN clinical_records, but a row still carries therapist-only
// fields (e.g. data.private_notes — the "NOTAS PESSOAIS / not shared with other
// users" field on the clinical form). A patient must NEVER see those.
//
// Model: DEFAULT-DENY ALLOW-LIST. We never "remove private fields" (a denylist
// would leak the day a new private field is added). Instead we build the patient
// view from an EXPLICIT allow-list and drop everything else — including the
// entire freeform `data` blob unless a key is explicitly allowed.
//
// CLINICAL SIGN-OFF (João Pedro): the schema has NO per-field patient-visibility
// marking. Until a clinician signs off WHICH clinical fields are safe to show a
// patient, the data allow-list ships EMPTY — the endpoint returns record
// METADATA only, never any free-text clinical content. This is the deliberate
// conservative default: ship it, do not block, expand the allow-list only after
// sign-off. See PR description.
//
// Pure module: no DB, no framework. Unit-tested to prove a private field is
// never serialized.

/** Top-level clinical_record columns a patient may see (metadata only). */
export const PATIENT_VISIBLE_RECORD_FIELDS = [
  "id",
  "status",
  "version",
  "episodeId",
  "createdAt",
  "signedAt",
] as const;
export type PatientVisibleRecordField = (typeof PATIENT_VISIBLE_RECORD_FIELDS)[number];

/**
 * Keys inside clinical_records.data a patient may see. EMPTY by design — pending
 * João Pedro clinical sign-off (see file header). Add keys here ONLY after a
 * clinician confirms they carry no therapist-private content.
 */
export const PATIENT_VISIBLE_DATA_KEYS: readonly string[] = [];

/**
 * Known therapist-PRIVATE data keys. Not used by the allow-list mechanism (which
 * denies everything not allowed), but kept explicit for documentation and tests:
 * these must NEVER appear in a patient response.
 */
export const KNOWN_PRIVATE_DATA_KEYS = [
  "private_notes", // "NOTAS PESSOAIS" — not shared with other users
  "red_flags",
  "cid_codes",
] as const;

/** The raw record shape the read layer hands in (a superset of what we return). */
export type RawClinicalRecord = {
  id: string;
  status: string;
  version: number;
  episodeId: string | null;
  createdAt: Date | string | null;
  signedAt: Date | string | null;
  data: unknown;
  // …any other columns; deliberately ignored by the allow-list.
};

/** The patient-facing ficha: allow-listed metadata + allow-listed data keys. */
export type PatientFicha = {
  id: string;
  status: string;
  version: number;
  episodeId: string | null;
  createdAt: string | null;
  signedAt: string | null;
  /** Only PATIENT_VISIBLE_DATA_KEYS (currently none → {}). Never private fields. */
  data: Record<string, unknown>;
};

function toIso(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/**
 * Project a raw clinical record into the patient-safe view. Default-deny: only
 * allow-listed fields are copied; the freeform `data` is filtered to
 * PATIENT_VISIBLE_DATA_KEYS (empty by default), so therapist-private content can
 * never be serialized regardless of what the row contains.
 */
export function redactRecordForPatient(record: RawClinicalRecord): PatientFicha {
  const data: Record<string, unknown> = {};
  if (record.data && typeof record.data === "object") {
    const src = record.data as Record<string, unknown>;
    for (const key of PATIENT_VISIBLE_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(src, key)) data[key] = src[key];
    }
  }

  return {
    id: record.id,
    status: record.status,
    version: record.version,
    episodeId: record.episodeId,
    createdAt: toIso(record.createdAt),
    signedAt: toIso(record.signedAt),
    data,
  };
}

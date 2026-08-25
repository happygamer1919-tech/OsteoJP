// packages/db/src/migration/types.ts
//
// Normalized INTERMEDIATE shapes for the Fisiozero → OsteoJP data migration
// (Phase 5 foundation). Source-agnostic: a source adapter (Fisiozero CSV+ZIP,
// Stylus.pt, ...) maps its raw rows into these shapes; the importer in
// upsert.ts maps these shapes onto the target tables. Neither side ever sees
// the other's format.
//
// Field names are grounded 1:1 in packages/db/src/schema.ts target columns —
// when a target column is NOT NULL the intermediate field is required here, so
// shape errors surface at validation, not as constraint violations mid-import.
//
// Cross-record references use SOURCE ids (patientSourceId, episodeSourceId):
// the importer resolves them to target uuids through the staging ledger
// (migration_staging_rows.imported_entity_id). References to data that already
// exists in OsteoJP (locations, practitioners, services) use symbolic KEYS
// resolved through MigrationResolvers, because those rows are seeded/managed
// in the platform and have no source-system id.
//
// Dates/times are ISO-8601 strings: `YYYY-MM-DD` for plain dates,
// full UTC timestamps for instants (CLAUDE.md: UTC in DB).

/** Entity discriminator — mirrors the `migration_entity_type` pg enum. */
export type MigrationEntityType =
  | "patient"
  | "appointment"
  | "clinical_episode"
  | "clinical_record"
  | "attachment";

/** Staging-row lifecycle — mirrors the `migration_staging_status` pg enum. */
export type MigrationStagingStatus = "pending" | "validated" | "imported" | "failed";

/* ================================================================== */
/* Intermediate entity shapes                                          */
/* ================================================================== */

/** → patients (+ patient_locations links via locationKeys). */
export type MigrationPatient = {
  sourceId: string;
  fullName: string;
  /** ISO date `YYYY-MM-DD`. Nullable: Fisiozero records with missing DOB are a
   * known edge case (docs/migration-notes.md) — imported and flagged, not dropped. */
  dateOfBirth?: string | null;
  sex?: string | null;
  /** PT fiscal number. Also incomplete in the source; nullable on the target. */
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  notes?: string | null;
  /** Location keys (e.g. "linda-a-velha") resolved via MigrationResolvers
   * into patient_locations rows. Empty = no location link. */
  locationKeys: string[];

  /**
   * Resolver key → locations.id for `patients.primary_location_id`.
   *
   * A KEY AND NOT AN ID, matching every other cross-reference in this file:
   * ids for platform-managed rows are resolved through MigrationResolvers,
   * because the adapter cannot know a uuid the platform assigned.
   *
   * PERSISTED by upsert.ts since 2026-08-24.
   *
   * REQUIRED. The adapter refuses to emit a patient it cannot place at a
   * clinic — an unplaced patient routes to to_review instead. PL-09 makes an
   * unassigned staff member deliberately UNRESTRICTED, and a patient with no
   * primary location inherits that looseness on the read paths scoped by it.
   */
  primaryLocationKey: string;

  /**
   * `numero_paciente` from the vendor export → `patients.patient_number`.
   *
   * OWNER RULING 2026-08-24: VENDOR NUMBERS ARE AUTHORITATIVE AND PRESERVED.
   * The trigger keeps assigning for patients with no `numero_paciente` and for
   * every future patient, and the import migration seeds the per-tenant
   * counter ABOVE the highest imported number so the two schemes cannot
   * collide under `patients_tenant_number_uq`.
   */
  patientNumber?: number | null;

  /**
   * `seguro_saude` + `numero_apolice` → `patients.health_insurance_numbers`.
   *
   * A LIST, because PL-23 (migration 0051) models insurance as
   * `{ insurer, number }[]` - a patient may hold ADSE and a private insurer at
   * once, which is ordinary in PT. The two vendor columns are semicolon
   * separated in matching order and are zipped by the adapter.
   */
  healthInsuranceNumbers?: { insurer: string | null; number: string }[];
};

/** → appointments. */
export type MigrationAppointment = {
  sourceId: string;
  /** Source id of the patient — resolved through the staging ledger. */
  patientSourceId: string;
  /** Resolver key → users.id. Required: appointments.practitioner_id is NOT NULL. */
  practitionerKey: string;
  /** Resolver key → locations.id. Required: appointments.location_id is NOT NULL. */
  locationKey: string;
  /** Resolver key → services.id. Optional, like the target column. Free-text
   * Fisiozero event-type mapping happens in the ADAPTER, not here. */
  serviceKey?: string | null;
  /** ISO UTC timestamps. */
  startsAt: string;
  endsAt: string;
  /** Mirrors the `appointment_status` enum. Historical imports are normally
   * `completed` / `cancelled` / `no_show`. */
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  notes?: string | null;
};

/** → clinical_episodes. */
export type MigrationClinicalEpisode = {
  sourceId: string;
  patientSourceId: string;
  /** Resolver key → users.id; target column is nullable. */
  practitionerKey?: string | null;
  title: string;
  status: "open" | "closed";
  /** ISO UTC timestamp. */
  openedAt: string;
  closedAt?: string | null;
};

/** → clinical_records.
 *
 * `signed` is deliberately NOT an importable status: a signature attests a
 * therapist's review in THIS system and cannot be carried over from Fisiozero.
 * Whether historical records land `draft` or `locked` is an open owner
 * question (docs/QUESTIONS.md); the shape supports both.
 */
export type MigrationClinicalRecord = {
  sourceId: string;
  patientSourceId: string;
  /** Optional link to an episode imported in the same migration. */
  episodeSourceId?: string | null;
  practitionerKey?: string | null;
  /** The clinical content, as JSONB. The adapter is responsible for shaping
   * free-text Fisiozero notes into this object. */
  data: Record<string, unknown>;
  status: "draft" | "locked";
  /** Original creation instant in the source system (ISO UTC). Preserved into
   * created_at so clinical history keeps its real chronology. */
  recordedAt?: string | null;
};

/** → attachments.
 *
 * The FILE itself is out of scope here: Fisiozero stores attachments as local
 * server paths (docs/migration-notes.md), and moving bytes into Supabase
 * Storage is a separate step. `storagePath` is the DESTINATION object path —
 * the importer requires it to already be decided (attachments.storage_path is
 * NOT NULL), it does not upload anything.
 */
export type MigrationAttachment = {
  sourceId: string;
  patientSourceId?: string | null;
  clinicalRecordSourceId?: string | null;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

/* ================================================================== */
/* Union + resolvers                                                   */
/* ================================================================== */

/** One normalized record, discriminated by target entity. */
export type MigrationRecord =
  | { entityType: "patient"; data: MigrationPatient }
  | { entityType: "appointment"; data: MigrationAppointment }
  | { entityType: "clinical_episode"; data: MigrationClinicalEpisode }
  | { entityType: "clinical_record"; data: MigrationClinicalRecord }
  | { entityType: "attachment"; data: MigrationAttachment };

/**
 * Maps the symbolic keys used in intermediate shapes onto target-row uuids for
 * data that already exists in the platform (seeded locations, staff users,
 * service catalog). Built once per import run by the caller — typically by
 * querying locations/users/services for the tenant and keying on slug/name.
 */
export type MigrationResolvers = {
  locationIdByKey: Record<string, string>;
  practitionerIdByKey: Record<string, string>;
  serviceIdByKey?: Record<string, string>;
};

/**
 * Structured, PII-FREE error detail persisted to
 * migration_staging_rows.error_detail (CLAUDE.md rule 7: messages reference
 * field names and codes, never raw source values — the raw payload is already
 * in the `raw` column for anyone with row access).
 */
export type MigrationErrorDetail = {
  code:
    | "validation_failed"
    | "unresolved_reference"
    | "import_failed"
    | "invalid_transition";
  message: string;
  /** Offending intermediate field paths, when known. */
  fields?: string[];
};

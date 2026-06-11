// packages/db/src/schema.ts
// OsteoJP platform — Drizzle schema v0
//
// Multi-tenant clinic management for OsteoJP (Osteopatia, Fisioterapia e Formação).
// Every domain table carries `tenant_id`. RLS policies (next step) will enforce
// tenant_id = (auth.jwt() ->> 'tenant_id') at the database layer, so isolation
// does not depend on the application remembering to filter.
//
// Conventions:
//   - UUID primary keys (defaultRandom), except `users.id` which mirrors Supabase auth.users.id
//   - timestamptz everywhere; created_at/updated_at on mutable tables (updated_at via $onUpdate)
//   - soft delete via deleted_at where records must never truly disappear (patients)
//   - JSONB for form definitions and filled clinical data (flexible, AI-extractable)
//   - money stored as integer cents + ISO currency

import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  smallint,
  jsonb,
  char,
  date,
  time,
  timestamp,
  index,
  uniqueIndex,
  unique,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ================================================================== */
/* Enums                                                              */
/* ================================================================== */

export const appointmentStatus = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export const episodeStatus = pgEnum("episode_status", ["open", "closed"]);

export const recordStatus = pgEnum("record_status", [
  "draft",
  "locked", // finalized; no longer editable
  "signed", // locked + practitioner signature
]);

// `patient` (Wave B) tags a record/submission originating from the patient
// portal intake. Like `ai_ingested`, it NEVER auto-produces a finalized record:
// a patient-submitted form lands in a review state and waits for therapist
// finalize (a separate future wave). See patient_form_submissions below.
export const recordSource = pgEnum("record_source", ["manual", "ai_ingested", "patient"]);

// AI ingestion review states (Stream D). PLACEHOLDER — the exact states depend on
// the AI partner ingestion contract, which is still being finalized. Refine here
// once the contract is signed off.
export const aiReviewState = pgEnum("ai_review_state", [
  "pending_review",
  "in_review",
  "approved",
  "rejected",
]);

// Lifecycle of one AI ingestion request (Stream D), tracked per idempotency_key:
// `received` (logged), `accepted` (a draft clinical_record was created),
// `rejected` (validation/auth failed, no draft).
export const ingestionStatus = pgEnum("ingestion_status", [
  "received",
  "accepted",
  "rejected",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "void",
]);

// Nullable on invoices. Internal-ledger only at launch — the platform never
// self-issues fiscal documents. PT certified-billing law means fiscal docs are
// issued by the clinic's AT-certified provider; InvoiceXpress relay comes in Phase 4.
export const paymentProvider = pgEnum("payment_provider", [
  "cash",
  "mbway",
  "multibanco",
  "stripe",
  "ifthenpay",
  "other",
]);

// Stream B — reason for a therapist absence block (time_off).
export const timeOffReason = pgEnum("time_off_reason", [
  "vacation",
  "sick",
  "holiday",
  "other",
]);

// Data migration (Phase 5 foundation) — lifecycle of one staged source row:
// `pending` (raw payload landed), `validated` (passed intermediate-shape
// validation), `imported` (target row written, imported_entity_id set),
// `failed` (validation or import error, error_detail set). failed → pending is
// allowed (re-stage after fixing the source); imported is terminal.
export const migrationStagingStatus = pgEnum("migration_staging_status", [
  "pending",
  "validated",
  "imported",
  "failed",
]);

// Which target entity a staged row maps onto. Mirrors the intermediate types
// in src/migration/types.ts (MigrationPatient → patients, ...).
export const migrationEntityType = pgEnum("migration_entity_type", [
  "patient",
  "appointment",
  "clinical_episode",
  "clinical_record",
  "attachment",
]);

// Stream F — platform-level tenant lifecycle. Managed ONLY by the superadmin
// (platform operator) via the service-role path; not a tenant-role concern.
// `suspended` is a platform flag; it does NOT alter tenant RLS isolation.
export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"]);

/* ================================================================== */
/* Core tenancy + identity                                            */
/* ================================================================== */

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    nif: varchar("nif", { length: 20 }), // PT fiscal number of the clinic
    // Platform-operator-managed lifecycle. Defaults to `active` so existing
    // tenants and the role/tenant-create path need no backfill.
    status: tenantStatus("status").notNull().default("active"),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // `slug` keys the in-code permission matrix (packages/auth/permissions.ts)
    slug: text("slug").notNull(), // owner | admin | therapist | reception
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("roles_tenant_idx").on(t.tenantId),
    uniqueIndex("roles_tenant_slug_uq").on(t.tenantId, t.slug),
  ],
);

export const users = pgTable(
  "users",
  {
    // 1:1 with Supabase auth.users.id — NOT auto-generated here. JWT carries
    // tenant_id + role slug, which RLS and the permission matrix read.
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("users_tenant_idx").on(t.tenantId),
    uniqueIndex("users_tenant_email_uq").on(t.tenantId, t.email),
  ],
);

/* ================================================================== */
/* Locations + services                                               */
/* ================================================================== */

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("locations_tenant_idx").on(t.tenantId)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id), // null = all locations
    // Osteopatia, Fisioterapia, RPG, NESA, Massagem, Pilates Terapêutico, Formação...
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull().default(60),
    priceCents: integer("price_cents"), // seeded from the owner's pricing data
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("services_tenant_idx").on(t.tenantId),
    index("services_tenant_location_idx").on(t.tenantId, t.locationId),
  ],
);

// Stream F — per-location service pricing. This is an OVERRIDE layer over
// services.price_cents (the base/catalog price): when a row exists here for a
// (service, location) pair it wins for that location; otherwise the location
// inherits services.price_cents. Lets a clinic price the same service
// differently per location without duplicating the catalog. is_active toggles
// an override off (falling back to the base) without deleting it.
export const serviceLocationPrices = pgTable(
  "service_location_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    priceCents: integer("price_cents").notNull(), // minor units (cents), never float
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One price row per (tenant, service, location).
    unique("service_location_prices_tenant_service_location_uq").on(
      t.tenantId,
      t.serviceId,
      t.locationId,
    ),
    index("service_location_prices_tenant_location_idx").on(t.tenantId, t.locationId),
    check("service_location_prices_price_nonneg", sql`${t.priceCents} >= 0`),
  ],
);

/* ================================================================== */
/* Patients                                                           */
/* ================================================================== */

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    dateOfBirth: date("date_of_birth"),
    sex: varchar("sex", { length: 16 }),
    nif: varchar("nif", { length: 20 }), // PT fiscal number (fatura-recibo)
    email: text("email"),
    phone: varchar("phone", { length: 32 }),
    address: text("address"),
    postalCode: varchar("postal_code", { length: 16 }),
    city: text("city"),
    notes: text("notes"),
    // Patient identity layer — links a patient to their Supabase auth principal
    // (the patient portal login at api.osteojp.pt). A patient is a DISTINCT
    // principal from a staff `users` row: there is no users row for a patient.
    // Nullable until the patient activates; UNIQUE so one auth account maps to at
    // most one patient. The access-token hook resolves patient_id from this
    // column, and patient-portal RLS self-scope keys on that claim.
    authUserId: uuid("auth_user_id").unique(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    // Stream A — patient merge: the losing record points at the survivor.
    mergedIntoId: uuid("merged_into_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => [
    index("patients_tenant_idx").on(t.tenantId),
    index("patients_tenant_name_idx").on(t.tenantId, t.fullName),
  ],
);

// Stream A — multi-location patient assignment. A patient can be seen at more
// than one of the clinic's locations; this junction links them many-to-many.
// Fully tenant-scoped (RLS mirrors the standard tenant_isolation policy).
export const patientLocations = pgTable(
  "patient_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One link per (tenant, patient, location).
    uniqueIndex("patient_locations_tenant_patient_location_uq").on(
      t.tenantId,
      t.patientId,
      t.locationId,
    ),
    index("patient_locations_patient_idx").on(t.patientId),
    index("patient_locations_location_idx").on(t.locationId),
  ],
);

/* ================================================================== */
/* Scheduling                                                         */
/* ================================================================== */

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    practitionerId: uuid("practitioner_id")
      .notNull()
      .references(() => users.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    serviceId: uuid("service_id").references(() => services.id),
    room: text("room"), // room-conflict detection (Stream B)
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("scheduled"),
    // Recurring series: RRULE string + pointer to the series parent (Stream B).
    recurrenceRule: text("recurrence_rule"), // null = one-off
    recurrenceParentId: uuid("recurrence_parent_id"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("appointments_tenant_idx").on(t.tenantId),
    index("appointments_tenant_start_idx").on(t.tenantId, t.startsAt),
    index("appointments_practitioner_start_idx").on(t.practitionerId, t.startsAt),
    index("appointments_patient_idx").on(t.patientId),
  ],
);

/* ================================================================== */
/* Availability + time off (Stream B)                                 */
/* Defines WHEN a therapist works; enforcement (blocking out-of-hours */
/* or during time_off bookings) is wired in a later feature PR.        */
/* ================================================================== */

// A therapist's recurring weekly working hours, per location (a therapist may
// work different hours at each clinic — multi-location landed in 0005).
export const availabilityTemplates = pgTable(
  "availability_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    // Weekday: 0 = Sunday .. 6 = Saturday (matches JS Date.getDay()). Range
    // enforced by the weekday_range CHECK below.
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    // Optional validity window for seasonal/temporary schedules. NULL = open-ended.
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("availability_templates_user_weekday_idx").on(t.tenantId, t.userId, t.weekday),
    index("availability_templates_tenant_location_idx").on(t.tenantId, t.locationId),
    // Prevent exact-duplicate rows. NULLS NOT DISTINCT so two rows that are
    // identical including NULL validity windows still collide.
    unique("availability_templates_dedupe_uq")
      .on(
        t.tenantId,
        t.userId,
        t.locationId,
        t.weekday,
        t.startTime,
        t.endTime,
        t.validFrom,
        t.validUntil,
      )
      .nullsNotDistinct(),
    check("availability_templates_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("availability_templates_start_before_end", sql`${t.startTime} < ${t.endTime}`),
  ],
);

// Therapist absence blocks — therapist-wide across all locations. timestamptz
// so partial-day and multi-day absences both work.
export const timeOff = pgTable(
  "time_off",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: timeOffReason("reason").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("time_off_user_starts_idx").on(t.tenantId, t.userId, t.startsAt),
    check("time_off_starts_before_ends", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

/* ================================================================== */
/* Clinical                                                           */
/* ================================================================== */

export const formTemplates = pgTable(
  "form_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // osteopathy | physiotherapy | rpg | nesa ...
    version: integer("version").notNull().default(1),
    // PT/EN labels live inside the JSON; ai_extractable flags are per field.
    // See docs/draft-form-templates/ (currently ai_extractable: false on all fields).
    title: jsonb("title").notNull(), // { pt: "...", en: "..." }
    schema: jsonb("schema").notNull(), // JSON-Schema-style field definitions
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("form_templates_tenant_idx").on(t.tenantId),
    uniqueIndex("form_templates_tenant_key_version_uq").on(t.tenantId, t.key, t.version),
  ],
);

export const clinicalEpisodes = pgTable(
  "clinical_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    primaryPractitionerId: uuid("primary_practitioner_id").references(() => users.id),
    title: text("title").notNull(), // e.g. "Lombalgia — Jan 2026"
    status: episodeStatus("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("clinical_episodes_tenant_idx").on(t.tenantId),
    index("clinical_episodes_patient_idx").on(t.patientId),
  ],
);

export const clinicalRecords = pgTable(
  "clinical_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => clinicalEpisodes.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    practitionerId: uuid("practitioner_id").references(() => users.id),
    formTemplateId: uuid("form_template_id").references(() => formTemplates.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    data: jsonb("data").notNull().default({}), // filled form response (incl. bodychart markers under data.bodychart)
    status: recordStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1), // versioning (Stream C)
    // Addendum chain (Stream C): a new version points at the finalized record it
    // supersedes. null = first version. Self-FK; walk it to reconstruct history.
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => clinicalRecords.id),
    source: recordSource("source").notNull().default("manual"),
    // AI ingestion (Stream D) — review-queue state machine; refine with the contract.
    aiReviewState: aiReviewState("ai_review_state"),
    aiPayloadId: text("ai_payload_id"), // external id from the AI partner
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedBy: uuid("signed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("clinical_records_tenant_idx").on(t.tenantId),
    index("clinical_records_patient_idx").on(t.patientId),
    index("clinical_records_episode_idx").on(t.episodeId),
    index("clinical_records_ai_review_idx").on(t.tenantId, t.aiReviewState),
    index("clinical_records_supersedes_idx").on(t.supersedesId),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id").references(() => patients.id),
    clinicalRecordId: uuid("clinical_record_id").references(() => clinicalRecords.id),
    storagePath: text("storage_path").notNull(), // Supabase Storage object path
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attachments_tenant_idx").on(t.tenantId),
    index("attachments_record_idx").on(t.clinicalRecordId),
  ],
);

// AI ingestion request log (Stream D). One row per request from the AI partner,
// keyed by the partner's idempotency_key. The unique (tenant_id, idempotency_key)
// constraint is what lets the future endpoint do 24h dedupe (same key + same
// payload_hash -> replay the prior result) and 409-on-mismatch (same key,
// different payload_hash). Writes come from the ingestion job as service_role
// (BYPASSRLS); RLS keeps rows tenant-scoped and fail-closed for the authenticated
// review queue. No app/endpoint code in this PR — schema only.
export const aiIngestionRequests = pgTable(
  "ai_ingestion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestId: text("request_id").notNull(), // partner-supplied correlation id
    payloadHash: text("payload_hash").notNull(), // hash of the canonical payload, for mismatch detection
    // The draft clinical_record created from this request. Null until/unless a
    // draft is produced (e.g. a rejected request). FK is NO ACTION on delete —
    // clinical_records are immutable and never deleted.
    clinicalRecordId: uuid("clinical_record_id").references(() => clinicalRecords.id),
    status: ingestionStatus("status").notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Dedupe / 409 key: one ingestion row per (tenant, idempotency_key).
    unique("ai_ingestion_requests_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    index("ai_ingestion_requests_tenant_idx").on(t.tenantId),
    index("ai_ingestion_requests_tenant_status_idx").on(t.tenantId, t.status),
    index("ai_ingestion_requests_record_idx").on(t.clinicalRecordId),
  ],
);

/* ================================================================== */
/* Audit + billing                                                    */
/* ================================================================== */

// Append-only. No updated_at, no deletes — RLS will allow INSERT + SELECT only.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(), // e.g. patient.update, record.sign
    entityType: text("entity_type").notNull(), // e.g. patient, clinical_record
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ip: varchar("ip", { length: 45 }), // IPv4/IPv6
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_tenant_idx").on(t.tenantId),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id").references(() => patients.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    status: invoiceStatus("status").notNull().default("draft"),
    // Nullable relay hooks — internal ledger at launch, AT-certified provider
    // issues the fiscal document; InvoiceXpress relay wires in via these in Phase 4.
    externalInvoiceId: text("external_invoice_id"),
    paymentProvider: paymentProvider("payment_provider"),
    paymentRef: text("payment_ref"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("invoices_tenant_idx").on(t.tenantId),
    index("invoices_patient_idx").on(t.patientId),
  ],
);

/* ================================================================== */
/* Data migration staging (Phase 5 foundation)                        */
/* ================================================================== */

// One row per source record staged for import (Fisiozero → OsteoJP, but
// source-agnostic: source_system discriminates). Two jobs in one table:
//
//   1. STAGING — the raw source payload (JSONB) plus a validate→import status
//      machine, so a batch can be landed, checked, and imported in separate,
//      resumable passes.
//   2. IDEMPOTENCY LEDGER — unique (tenant_id, source_system, entity_type,
//      source_id) with imported_entity_id pointing at the created target row.
//      Target tables carry NO source_id column; this ledger is the single
//      source_id → target-uuid map, and it is what makes re-running an import
//      a no-op instead of a duplicate-creator.
//
// error_detail is STRUCTURED (code + field paths), never raw source values —
// the raw payload already lives in `raw`, and error text must stay PII-free
// because it is the part that gets surfaced in logs/reconciliation reports
// (CLAUDE.md rule 7).
export const migrationStagingRows = pgTable(
  "migration_staging_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Groups one import run; reconciliation reports key on it.
    batchId: uuid("batch_id").notNull(),
    // 'fisiozero' | 'stylus' | ... — free text, the adapter supplies it.
    sourceSystem: text("source_system").notNull(),
    entityType: migrationEntityType("entity_type").notNull(),
    // The record's id IN THE SOURCE SYSTEM (free text — formats unknown).
    sourceId: text("source_id").notNull(),
    raw: jsonb("raw").notNull().default({}),
    status: migrationStagingStatus("status").notNull().default("pending"),
    errorDetail: jsonb("error_detail"),
    // Target-row uuid once imported. Deliberately NOT an FK: it points at a
    // different table per entity_type (patients, appointments, ...).
    importedEntityId: uuid("imported_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The idempotency key: one staging row per source record per tenant.
    unique("migration_staging_tenant_source_uq").on(
      t.tenantId,
      t.sourceSystem,
      t.entityType,
      t.sourceId,
    ),
    index("migration_staging_tenant_batch_idx").on(t.tenantId, t.batchId),
    index("migration_staging_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/* ================================================================== */
/* Patient form intake (Wave B)                                       */
/* ================================================================== */

// A form the PATIENT submits from the portal: the shared general anamnese
// (Ficha Geral) or a per-therapy supplement. Mirrors the AI-ingestion boundary
// (CLAUDE.md rule #4): it is source-tagged `patient`, lands in a review state
// (`ai_review_state`, reusing the same review-before-finalize machine), and
// NEVER auto-writes a finalized clinical_record. A therapist later reviews and
// finalizes it into a clinical_record — that staff write path is a separate
// future wave, NOT built here. Hence this table holds the raw submission only;
// it has no clinical_record_id and no link into the immutable record lifecycle.
//
// RLS (migration 0011): self-scope for the `patient` role (a patient may INSERT
// + SELECT only their OWN submissions, and only in the initial review state —
// they can never self-finalize), plus the standard tenant-isolation policy for
// `authenticated` staff (the future review wave reads/processes them).
export const patientFormSubmissions = pgTable(
  "patient_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // The submitting patient. ALWAYS derived from the verified principal, never
    // from request payload (enforced again by the self-scope WITH CHECK policy).
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    // 'ficha_geral' (shared anamnese) or 'supplement' (per-therapy supplement).
    formKey: text("form_key").notNull(),
    // Therapy slug for a supplement (osteopathy, physiotherapy, …); null for the
    // shared Ficha Geral.
    therapy: text("therapy"),
    // The submitted answers. Validated against the intake catalog in app code;
    // stored raw for the therapist to review.
    payload: jsonb("payload").notNull().default({}),
    // Origin tag. Always 'patient' here (app-supplied). Not DB-defaulted: a
    // DEFAULT would evaluate the new 'patient' enum label in the same migration
    // that ADDs it, which Postgres forbids ("unsafe use of new value").
    source: recordSource("source").notNull(),
    // Review queue state — reuses ai_review_state (the review-before-finalize
    // machine in apps/web lib/ingestion/review-state.ts). Lands as
    // 'pending_review'; this table never reaches a finalized record on its own.
    reviewState: aiReviewState("review_state").notNull().default("pending_review"),
    // Review/finalize write path (migration 0013). A patient submission is
    // materialised into a draft clinical_record when a therapist CLAIMS it
    // (review_state pending_review → in_review); this column links the
    // submission to that record so the queue can show the outcome and a re-claim
    // is idempotent. reviewed_by / reviewed_at record the finalize DECISION (who
    // approved, when) on the submission row itself — distinct from the resulting
    // clinical_record's signed_by/signed_at. All three are NULL until the staff
    // review path touches the row; they are never patient-writable (patient RLS
    // grants INSERT/SELECT only, migration 0011).
    clinicalRecordId: uuid("clinical_record_id").references(() => clinicalRecords.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("patient_form_submissions_tenant_idx").on(t.tenantId),
    index("patient_form_submissions_patient_idx").on(t.patientId),
    index("patient_form_submissions_tenant_review_idx").on(t.tenantId, t.reviewState),
  ],
);

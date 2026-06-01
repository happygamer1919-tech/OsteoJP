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

export const recordSource = pgEnum("record_source", ["manual", "ai_ingested"]);

// AI ingestion review states (Stream D). PLACEHOLDER — the exact states depend on
// the AI partner ingestion contract, which is still being finalized. Refine here
// once the contract is signed off.
export const aiReviewState = pgEnum("ai_review_state", [
  "pending_review",
  "in_review",
  "approved",
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

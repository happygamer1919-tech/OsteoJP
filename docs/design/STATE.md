# STATE

Observed-state log of the codebase as audited at specific points in time. Factual
record of schema, write paths, and existing surfaces. Append-only, dated sections.
No recommendations here. Design decisions go in DECISIONS.md; open questions go in
QUESTIONS.md.

## 2026-06-30 - Wave 01 audit findings

Read-only audit against `main` (commit at `origin/main`). No schema changed, no
migration run. File paths are repo-relative. Migrations inspected: `0000`–`0021`
(the wave brief said `0000`–`0019`; current tree extends to `0021`).

### 1. Notas rapidas persistence

**Verdict: persisted to a dedicated table. Button is fully wired and DB-backed.**

Exact write path:

- Component: `apps/web/app/dashboard/notas-rapidas.tsx` — client component
  `NotasRapidas({ initialNotes })`. Renders a `<form>` whose `action` is the server
  action from `useActionState(saveQuickNotesAction, ...)`, a single
  `<textarea name="notes">` (maxLength 2000), and the Guardar `<Button type="submit">`.
  Mounted at `apps/web/app/dashboard/page.tsx:362` as `<NotasRapidas initialNotes={initialNotes} />`.
- Handler: Guardar is a form submit bound to server action `saveQuickNotesAction`
  (not an API route, not local/session storage, not a no-op).
- Server action: `apps/web/lib/dashboard/actions.ts` (`"use server"`).
  `saveQuickNotesAction` reads `formData.get("notes")`, calls `saveQuickNotes(text)`
  (slices to `NOTES_MAX = 2000`), then `revalidatePath("/dashboard")`.
- DB write: `saveQuickNotes` runs inside `runScoped(ctx, tx => ...)`
  (`apps/web/lib/auth/context.ts:49`, an RLS-scoped Drizzle transaction) and performs
  an upsert:
  `tx.insert(quickNotes).values({ tenantId, staffUserId, content }).onConflictDoUpdate({ target: [quickNotes.tenantId, quickNotes.staffUserId], set: { content, updatedAt } })`.
- Drizzle table: `quickNotes` at `packages/db/src/schema.ts:844` → table `public.quick_notes`.
- Read side: `apps/web/lib/dashboard/notes.ts` `getQuickNotes(ctx)` selects `content`
  where `staffUserId = ctx.userId`; feeds `initialNotes` in `page.tsx`.

Migration `packages/db/migrations/0018_quick_notes.sql` — table `public.quick_notes`
("per-staff scratchpad", one row per `(tenant_id, staff_user_id)`):

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`
- `staff_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`
- `content text NOT NULL DEFAULT ''`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `CONSTRAINT quick_notes_tenant_user_uq UNIQUE (tenant_id, staff_user_id)`
- index `quick_notes_tenant_user_idx ON (tenant_id, staff_user_id)`
- RLS enabled; policy `quick_notes_own_row` FOR ALL TO authenticated:
  `USING/WITH CHECK (tenant_id = (select public.jwt_tenant_id()) AND staff_user_id = auth.uid())`;
  grants SELECT, INSERT, UPDATE, DELETE to `authenticated`.

The `onConflictDoUpdate` target matches the `quick_notes_tenant_user_uq` constraint
exactly. The note is scoped per-staff-per-tenant (one mutable row), not append-only.

Stale comment observed (not a functional defect): `apps/web/app/dashboard/page.tsx:360`
reads `{/* Notas rápidas — persisted to tenants.settings.notes. */}`. Persistence is
to `quick_notes`, not `tenants.settings.notes`.

### 2. Appointment history retention

**Verdict: row-level history is retained (one durable row per appointment, never
hard-deleted, current status preserved). A per-appointment status-transition timeline
(old→new over time) is NOT stored in a dedicated history/event table.**

- Table: `appointments` (`packages/db/src/schema.ts:373-412`, DDL
  `packages/db/migrations/0000_empty_runaways.sql:8-26`). `agenda` and `marcacoes`
  are UI route names only (`apps/web/app/agenda/`, `apps/web/app/marcacoes/`), not tables.
- Status column: `status "appointment_status" DEFAULT 'scheduled' NOT NULL`. It is a
  Postgres ENUM (not a check constraint):
  `CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');`
  (`0000_empty_runaways.sql:2`; Drizzle `schema.ts:42-48`).
- Completion / past-date transitions: the row is kept and updated in place. Status
  changes are plain `UPDATE`s to `status` on the same row
  (`apps/web/lib/scheduling/actions.ts:309`, `:371`, `:381`). No scheduled job or
  trigger archives or mutates appointments when their date passes; status only changes
  on explicit user action. Prior status is overwritten on the row (only current status
  persists on the appointments row); the row itself persists.
- Deletes: no `deleted_at` / `is_deleted` column on `appointments` (only `patients`
  has `deleted_at`, `schema.ts:331`). Cancellation is a status value. Hard delete is
  explicitly forbidden in code (`apps/web/lib/scheduling/actions.ts:536-540`,
  comment `// Never hard delete — cancel via the status field only.`, sets
  `status: "cancelled"`). Repo-wide search for `.delete(appointments)` in non-test
  code: zero matches. Deletes are effectively soft via `status = 'cancelled'`; the row
  is never removed.
- History / audit trail for appointments: no dedicated appointment history table,
  status-transition log, or append-only per-appointment event table. Cross-time trace
  exists only via the generic shared `audit_log` table (see section 4). Appointment
  mutations are recorded there by `apps/web/lib/scheduling/audit.ts` with actions
  `appointment.create | appointment.update | appointment.reschedule | appointment.cancel`,
  `entityType: "appointment"`, `entityId: appointmentId`. Audit metadata is limited:
  on update it stores `metadata: { changed: Object.keys(set), scope }`
  (`actions.ts:366`) — which field names changed, not structured old→new status values;
  on cancel `metadata: { reason, scope }` (`actions.ts:548`).

Implication for downstream design sections 2 and 3: "full history retained" holds at
the row level (durable, never deleted, current status preserved). A queryable
per-appointment status-transition timeline is NOT backed by a dedicated history/event
table; only `audit_log` records that a change occurred (action + actor + timestamp +
changed field names), not prior status values.

### 3. Schema reality dump

Source of truth: `packages/db/src/schema.ts`, cross-checked against migrations
`0000`–`0021`. No drift found in the tables below. Structural facts up front:

- There is no dedicated therapist/practitioner table. The care-deliverer is a `users`
  row whose role resolves to `roles.slug = 'therapist'`. Appointments/records reference
  the practitioner as `practitioner_id → users.id`.
- There is no therapist-to-service link of any kind (no join table, no array column,
  no FK). See end of this section.

**`appointments`** (`schema.ts:373-412`; DDL `0000:8-26`; FKs `0000:189-194`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| patient_id | uuid | NO | — | FK → patients.id ON DELETE no action |
| practitioner_id | uuid | NO | — | FK → users.id ON DELETE no action (the therapist) |
| location_id | uuid | NO | — | FK → locations.id ON DELETE no action |
| service_id | uuid | YES | — | FK → services.id ON DELETE no action |
| room | text | YES | — | room-conflict detection |
| starts_at | timestamptz | NO | — | |
| ends_at | timestamptz | NO | — | |
| status | enum appointment_status | NO | 'scheduled' | scheduled, confirmed, completed, cancelled, no_show |
| recurrence_rule | text | YES | — | RRULE; null = one-off |
| recurrence_parent_id | uuid | YES | — | self-pointer; no FK constraint declared |
| notes | text | YES | — | |
| created_by | uuid | YES | — | FK → users.id ON DELETE no action |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Indexes: `appointments_tenant_idx (tenant_id)`, `appointments_tenant_start_idx (tenant_id, starts_at)`,
`appointments_tenant_location_start_idx (tenant_id, location_id, starts_at)` (added 0016),
`appointments_practitioner_start_idx (practitioner_id, starts_at)`,
`appointments_patient_idx (patient_id)`. No unique or check constraints.

**`patients`** (`schema.ts:296-337`; base DDL `0000:125`; identity layer `0010`; reminder prefs `0019`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| full_name | text | NO | — | |
| date_of_birth | date | YES | — | |
| sex | varchar(16) | YES | — | |
| nif | varchar(20) | YES | — | PT fiscal number |
| email | text | YES | — | |
| phone | varchar(32) | YES | — | |
| address | text | YES | — | |
| postal_code | varchar(16) | YES | — | |
| city | text | YES | — | |
| notes | text | YES | — | |
| auth_user_id | uuid | YES | — | UNIQUE (`patients_auth_user_id_unique`); patient-portal auth principal |
| activated_at | timestamptz | YES | — | |
| merged_into_id | uuid | YES | — | merge-survivor pointer; no FK constraint declared |
| reminder_sms_enabled | boolean | NO | true | added 0019 |
| reminder_email_enabled | boolean | NO | false | added 0019 |
| created_by | uuid | YES | — | FK → users.id |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |
| deleted_at | timestamptz | YES | — | soft delete |

Constraints: PK id; UNIQUE `auth_user_id`; FK tenant_id ON DELETE cascade; FK created_by → users.
Indexes: `patients_tenant_idx (tenant_id)`, `patients_tenant_name_idx (tenant_id, full_name)`,
phone-digits expression index (`0015`). No check constraints.

**Therapist / staff = `users` (+ `roles`)** — no `therapists`/`practitioners`/`staff` table.

`users` (`schema.ts:180-203`; DDL `0000:178`):

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | — (no default) | PK; 1:1 with Supabase auth.users.id |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| role_id | uuid | YES | — | FK → roles.id |
| email | text | NO | — | |
| full_name | text | NO | — | |
| is_active | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Constraints: PK id; UNIQUE `users_tenant_email_uq (tenant_id, email)`; index `users_tenant_idx (tenant_id)`.

`roles` (`schema.ts:161-178`): id (PK, gen_random_uuid), tenant_id (NO, FK → tenants ON DELETE cascade),
slug (NO; owner | admin | therapist | reception), name (NO), description (YES), created_at (NO, now()).
Constraints: UNIQUE `roles_tenant_slug_uq (tenant_id, slug)`; index `roles_tenant_idx (tenant_id)`.

Per-therapist schedule tables (keyed on `users.id`; define WHEN a therapist works, not what they offer):
- `availability_templates` (`schema.ts:422-466`): recurring weekly hours per
  `(user_id, location_id, weekday, start_time, end_time)`. Checks:
  `availability_templates_weekday_range CHECK (weekday between 0 and 6)`,
  `availability_templates_start_before_end CHECK (start_time < end_time)`;
  unique `availability_templates_dedupe_uq` with `.nullsNotDistinct()`.
- `time_off` (`schema.ts:470-490`): therapist absence blocks keyed on `user_id` (no
  location_id; therapist-wide). Check: `time_off_starts_before_ends CHECK (starts_at < ends_at)`.

**`services`** (`schema.ts:229-254`; DDL `0000:154`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| location_id | uuid | YES | — | FK → locations.id; null = all locations |
| name | text | NO | — | Osteopatia, Fisioterapia, RPG, NESA, Massagem, etc. |
| description | text | YES | — | |
| duration_min | integer | NO | 60 | |
| price_cents | integer | YES | — | base/catalog price |
| currency | varchar(3) | NO | 'EUR' | |
| is_active | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Constraints: PK id; FKs tenant_id (cascade), location_id. Indexes: `services_tenant_idx (tenant_id)`,
`services_tenant_location_idx (tenant_id, location_id)`. No unique-on-name, no check constraints.

**`locations`** (`schema.ts:209-227`; DDL `0000:114`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | NO | — | FK → tenants.id ON DELETE cascade |
| name | text | NO | — | |
| address | text | YES | — | |
| phone | varchar(32) | YES | — | |
| is_active | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | `$onUpdate` |

Constraints: PK id; FK tenant_id (cascade). Index: `locations_tenant_idx (tenant_id)`. No unique/check constraints.

**Therapist-to-service relationship: NONE.** No join table, array column, or FK links a
therapist (`users` row) to the services they provide. `services` has no
`user_id`/`practitioner_id` column; `users` has no services column; no
`therapist_services`/`service_practitioners` table exists (searched schema.ts +
migrations 0000–0021: zero matches). A therapist and a service co-occur only on an
individual `appointments` row (`practitioner_id` + nullable `service_id`) — i.e. per
booking, not as a capability/offering.

**Therapist-to-location:** only via `availability_templates (user_id, location_id)`,
both NOT NULL. No dedicated `user_locations` table — `0001_rls.sql:175-176` confirms:
`TODO v0.1: tighten to patients-they-treat once user_locations / appointment scoping exists.`
`time_off.user_id` is therapist-wide (no location_id).

**Service-to-location:** two mechanisms. (a) `services.location_id` (nullable FK; null
= all locations). (b) `service_location_prices` (`schema.ts:262-290`; DDL `0007`) —
per-location price override layer: columns id, tenant_id, service_id, location_id,
price_cents (NOT NULL), currency char(3) 'EUR', is_active, created_at. Constraints
verbatim (`0007:10-16`):
`CONSTRAINT "service_location_prices_tenant_service_location_uq" UNIQUE("tenant_id","service_id","location_id")`,
`CONSTRAINT "service_location_prices_price_nonneg" CHECK ("service_location_prices"."price_cents" >= 0)`;
FKs to tenants (cascade), services, locations. Index
`service_location_prices_tenant_location_idx (tenant_id, location_id)`. RLS tenant isolation.

For completeness, the only true many-to-many location junction is `patient_locations`
(`schema.ts:342-367`; DDL `0005`): links `patient_id ↔ location_id`, unique
`patient_locations_tenant_patient_location_uq (tenant_id, patient_id, location_id)`.

### 4. Existing event / audit surface

**Verdict: one generic audit table (`audit_log`) exists, scoped to compliance/security
auditing, deliberately PII-free, append-only via RLS. No analytics/KPI/metrics/telemetry
event table exists.**

`audit_log` (`schema.ts:653-674`; CREATE TABLE `0000_empty_runaways.sql:40-50`; RLS
`0001_rls.sql:150-166`). Columns verbatim:

```sql
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

FKs (`0000:199-200`): `tenant_id → tenants.id ON DELETE cascade`;
`actor_user_id → users.id ON DELETE no action`. Indexes (`schema.ts:670-672`):
`audit_log_tenant_idx (tenant_id)`, `audit_log_entity_idx (entity_type, entity_id)`,
`audit_log_created_idx (created_at)`.

Append-only by RLS — SELECT + INSERT policies only, no UPDATE/DELETE policy (both
denied). schema.ts:653 comment: "Append-only. No updated_at, no deletes — RLS will allow
INSERT + SELECT only." Policies:

```sql
CREATE POLICY "audit_log_tenant_select" ON public.audit_log
  FOR SELECT TO authenticated USING (tenant_id = (select public.jwt_tenant_id()));
CREATE POLICY "audit_log_tenant_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
```

Shape: generic actor/action/entity/timestamp/payload. `actor_user_id` (nullable for
system events), `action` (dotted verbs e.g. `patient.update`), `entity_type` +
`entity_id` (target), `metadata jsonb` (PII-free by contract: ids/field-names/status/ISO
timestamps only), `ip varchar(45)`, `created_at`. All domains funnel through this one table.

Writers (all insert into `auditLog`, in the same transaction as the recorded mutation):
- `apps/web/lib/admin/audit.ts` — generic `writeAudit(tx, actor, {action, entityType, entityId, metadata})` (insert :25).
- `apps/web/lib/clinical/audit.ts` — `writeClinicalAudit(...)` (insert :36); exports `clientIp()`.
- `apps/web/lib/scheduling/audit.ts` — `writeAppointmentAudit(...)` (insert :31); hardcodes `entityType: "appointment"`.
- `apps/web/lib/patients/audit.ts` — `writeAudit(tx, ctx, {action: \`patient.${...}\`, entityId, metadata})` (insert :22); hardcodes `entityType: "patient"`.
- Direct: `apps/web/lib/integrations/ifthenpay/ledger-drizzle.ts:81` (`actorUserId: null`, `invoice.payment.recorded`);
  `apps/admin/lib/tenants.ts:118` (`actorUserId: null`, `tenant.status_change`).

Recorded actions / entity_types in use: `patient` (create, update, soft_delete,
restore), `location` (create, update), `service` (create, update), `staff` (invite,
role_change, profile_update), `tenant` (update, status_change), `appointment` (create,
update, reschedule, cancel), `clinical_record` (create, update, version, sign,
review_claim, review_finalize), `clinical_episode` (create), `attachment` (create),
`invoice` (payment.recorded).

`0013_review_finalize_audit.sql` is NOT a table — despite its name it only adds three
columns to `patient_form_submissions`:
`clinical_record_id uuid`, `reviewed_by uuid`, `reviewed_at timestamptz` (in-row
finalize-outcome fields). The corresponding `clinical_record.review_finalize` event is
what gets appended to `audit_log`.

Adjacent non-audit surfaces (none are generic event logs): `ai_ingestion_requests`
(`schema.ts:619`, `0008`) — mutable request-status row, deduped by
`(tenant_id, idempotency_key)`; `migration_staging_rows` (`schema.ts:727`, `0014`) —
mutable import staging; `quick_notes` (`schema.ts:844`, `0018`) — one mutable note per
staff; `clinical_records.supersedes_id` (`schema.ts:568`) — self-FK version chain
(append-only clinical-record version history, but the domain table itself, not a log).

Net for a future KPI event layer: the only existing audit/event surface is `audit_log`,
shape `(id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata jsonb, ip,
created_at)`, append-only, tenant-isolated, written synchronously in-transaction. Its
purpose is compliance/security auditing with PII-free metadata, not analytics. No
existing KPI/metrics/analytics/telemetry event table.

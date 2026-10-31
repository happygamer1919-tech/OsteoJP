# Data dictionary: appointments and the objects a visit KPI reads

Derived from code on 2026-10-26, at `origin/main` 38721f0b. No production data was read and
no count appears here. Every statement carries the file and line it was read from; a
statement that the code cannot settle says "not established".

Sources, in order of authority:

1. `packages/db/migrations/*.sql`: the schema as applied (the latest file touching each object).
2. `packages/db/src/schema.ts`: the Drizzle mirror of that schema.
3. The write paths: `apps/web/lib/**` (staff server actions), `apps/api/lib/**` (patient portal),
   `packages/db/src/migration/**` (the Fisiozero importer), and the SQL functions in the migrations.

Line numbers are for this commit. A later edit moves them; the function names do not.

## Contents

1. Appointments (`appointments`) and its two state axes
2. Every writer of `appointments`, with the audit row each one writes
3. History stores: `audit_log`, `analytics_events`, `appointment_notes`, `staff_notifications`,
   `patient_audit_log`, `appointment_reschedule_requests`
4. Time: `availability_templates`, `time_off`, `locations` hours and closures
5. Services, therapist services, packs
6. Staff: `users`, `staff_locations`
7. Patients and patient identity
8. Fisiozero import: `migration_staging_rows` and the mapping
9. Group, multi-therapist, recurring and batch bookings
10. AI recording consultations (`consultations`) and AI ingestion (`ai_ingestion_requests`)
11. Statistics screens: what each one reads

---

## 1. `appointments`

Created in `0000_empty_runaways.sql:8`; columns added by `0024` (confirmation axis),
`0027` (`booking_group_id`), `0028` (`batch_id`), `0032` (`patient_2_id`, `practitioner_2_id`),
`0061` (exclusion constraint), `0067` (`origin`, `pack_instance_id`). Drizzle:
`packages/db/src/schema.ts:1010-1117`.

| Column | Type | Null | Meaning | Evidence |
|---|---|---|---|---|
| `id` | uuid | no | Primary key, `gen_random_uuid()`. The one appointment id; a staff or portal reschedule keeps it (section 2). | schema.ts:1013 |
| `tenant_id` | uuid | no | Tenant. | schema.ts:1014 |
| `patient_id` | uuid FK patients | no | The patient. Moved by `merge_patients` (section 7). | schema.ts:1017 |
| `practitioner_id` | uuid FK users | no | The Terapeuta. Can be a person or a shared resource row (`users.is_shared_resource`, section 6). | schema.ts:1020 |
| `location_id` | uuid FK locations | no | The clinic. | schema.ts:1023 |
| `service_id` | uuid FK services | yes | The service. NULL is allowed and the importer writes NULL when the source service type had no mapping (section 8). | schema.ts:1026; fisiozero.ts:797-801 |
| `patient_2_id` | uuid FK patients | yes | Optional second patient, display only ("primary-only semantics everywhere"). | schema.ts:1027-1038 |
| `practitioner_2_id` | uuid FK users | yes | Optional second therapist (Terapeuta 2), display and conflict only. | schema.ts:1039 |
| `room` | text | yes | Free-text room. | schema.ts:1040 |
| `starts_at` | timestamptz | no | Planned start, CURRENT value. Overwritten in place by a reschedule. | schema.ts:1041 |
| `ends_at` | timestamptz | no | Planned end, CURRENT value. Planned duration = `ends_at - starts_at`; there is no duration column. | schema.ts:1042 |
| `status` | `appointment_status` | no | Lifecycle axis, default `scheduled`. | schema.ts:1043 |
| `confirmation_state` | `appointment_confirmation_state` | no | Confirmation axis, default `pending`. Orthogonal to `status`. | schema.ts:1045-1047 |
| `confirmation_received_at` | timestamptz | yes | When a confirmation arrived (SMS reply, signed link, reception SMS review). | schema.ts:1048 |
| `confirmation_channel` | text | yes | Free text: `sms` (patient reply), `sms_review` (reception on the patient's behalf). | schema.ts:1051; inbound-reply.ts:416; inbound-store.ts:281 |
| `recurrence_rule` | text | yes | RRULE of a recurring series or a batch; NULL for a one-off. | schema.ts:1053 |
| `recurrence_parent_id` | uuid (no FK) | yes | First occurrence of a recurring series (children point at it). | schema.ts:1054; actions.ts:943 |
| `booking_group_id` | uuid (no FK) | yes | Rows created together in one multi-therapist flow. | schema.ts:1055-1061 |
| `batch_id` | uuid (no FK) | yes | Rows created by one batch run ("Agendar lote"). | schema.ts:1062-1068 |
| `origin` | text, CHECK `staff` or `patient_portal` | no | Who created the row. Default `staff`. The importer leaves the default. | schema.ts:1083; 0067:42-52; DUR-01 doc Q1 (`docs/data-op-dur-01.md:102`) |
| `pack_instance_id` | uuid FK patient_pack_instances | yes | The pack instance this visit draws a session from. | schema.ts:1092; 0067:173-175 |
| `notes` | text | yes | Legacy per-visit note. New notes go to `appointment_notes` (section 3); the importer still writes the source note here. | schema.ts:1093; actions.ts:727-731; upsert.ts:804 |
| `created_by` | uuid FK users | yes | Staff creator. NULL for portal rows and for imported rows; a staff principal may also insert NULL. | schema.ts:1094; store.ts:993; 0067:36-40 |
| `created_at` | timestamptz | no | Row insert time, `now()`. For imported rows this is the import time, not the source booking time. | schema.ts:1095; upsert.ts:796-805 |
| `updated_at` | timestamptz | no | Last write (Drizzle `$onUpdate`). Only the latest change is kept. | schema.ts:1096-1099 |

There is NO column for: the originally planned start, a previous start, a realised (actual)
start or end, a cancellation time, a cancellation reason, who cancelled, a rescheduled-from
link, a soft-delete marker, a source-system id, or a service area.

Constraints and indexes:

- `appointments_origin_check`: `origin IN ('staff','patient_portal')` (0067:49-51).
- `appointments_no_double_confirmed`: EXCLUDE on `(practitioner_id, tstzrange(starts_at, ends_at))`
  WHERE `status = 'confirmed'` (0061:185-191). Two `confirmed` rows of one practitioner cannot
  overlap; any other combination can.
- Indexes: schema.ts:1101-1116, plus `appointments_pack_instance_idx` (0067:180-182).

### 1.1 `appointment_status` (lifecycle axis)

`0000_empty_runaways.sql:2`, schema.ts:43-49. Values and the meaning the code gives them:

| Value | UI label (pt) | Meaning in code | Holds the slot? |
|---|---|---|---|
| `scheduled` | Pendente / Agendada | Booked, not confirmed. Every new staff or portal row starts here (actions.ts:726; store.ts:991; batch.ts:178; clone-core.ts:106). A portal row in this state with `origin = patient_portal` is an unconfirmed request ("pedido"). | yes, except an unconfirmed pedido (0059, 0067:130) |
| `confirmed` | Confirmada | Confirmed by reception, the patient (SMS), or acceptance of a pedido. | yes |
| `completed` | Concluída | The visit took place. Set by hand; nothing sets it automatically at the end time. | yes |
| `cancelled` | Cancelada | Cancelled. Also: an imported Fisiozero row whose source state was `marcada` with a start in the past at import time (section 8). | no (0052) |
| `no_show` | Falta | The patient did not attend. | no (0052) |

Labels: `packages/i18n/src/strings.pt.json:387-407`. Slot release for `cancelled` and `no_show`:
`0052_conflicts_no_show_releases_slot.sql`, latest `appointment_conflicts` in
`0095_conflict_name_visibility.sql:221`.

There is no `rescheduled` value and no `realised` value. A reschedule is an in-place update of
`starts_at`/`ends_at` on the same row (section 2). "Realised" can only be read as `completed`.

### 1.2 `appointment_confirmation_state` (confirmation axis)

`0024_appointment_confirmation_state.sql:34-40`, schema.ts:55-59: `pending` (default),
`confirmed`, `declined`. `declined` has no writer in the application (actions.ts:1906-1909 says
so). Writers of `confirmed`: section 2, rows W9, W10, W11, W12.

### 1.3 Allowed `status` transitions

Two doors, each with its own audit action.

Ordinary Estado control, `apps/web/lib/scheduling/estado-transitions.ts:37-43`, enforced on the
server in `updateAppointment` (actions.ts:1594):

| From | To |
|---|---|
| `scheduled` | `confirmed`, `completed`, `no_show` |
| `confirmed` | `completed`, `no_show` |
| `cancelled` | `scheduled`, `confirmed` (bring back, SCHED-27) |
| `completed` | none |
| `no_show` | none |

`cancelled` is never set by `updateAppointment` (actions.ts:1497); it is set by the cancel paths.

Correction door "Corrigir estado", `apps/web/lib/scheduling/estado-correction.ts:39-74`: any final
state (`completed`, `cancelled`, `no_show`) to any other final state. Server action
`correctAppointmentEstadoAction` (actions.ts:2651), capability `appointments:delete`.

Other writers set status directly (section 2): cancel paths set `cancelled` from `scheduled` or
`confirmed`; confirm paths set `confirmed` from `scheduled` only.

---

## 2. Every writer of `appointments`

Found by `git grep` for `insert(appointments)`, `update(appointments)`, `delete(appointments)` and
raw `UPDATE/INSERT/DELETE ... appointments` across `apps`, `packages` and `scripts`
(seeds and tests excluded).

`writeAppointmentAudit` (apps/web/lib/scheduling/audit.ts:42-64) inserts one `audit_log` row with
`entity_type = 'appointment'`, `entity_id` = the appointment id, the staff actor and the request IP.

| # | Path | What it writes | `audit_log` row (action, metadata keys) | Other trail |
|---|---|---|---|---|
| W1 | `createAppointment`, apps/web/lib/scheduling/actions.ts:620; insert 911 (first) and 930 (recurring children) | New row(s), `status = scheduled`, `created_by` = actor, `origin` default `staff` | `appointment.create`, one per row (actions.ts:970-990): patientId, practitionerId, locationId, serviceId, packId, status, **startsAt**, seriesId, occurrence, count, allowConflict | `appointment_notes` row if a note was typed (actions.ts:956-966) |
| W2 | `batchScheduleAppointments`, actions.ts:1075, insert in apps/web/lib/scheduling/batch.ts:278 | New rows sharing `batch_id`, `status = scheduled` (batch.ts:178) | `appointment.create` per row (batch.ts:310-326): patientId, practitionerId, locationId, serviceId, status, startsAt, batchId, packInstanceId; ip NULL | |
| W3 | `cloneAppointment` ("Marcar novamente"), actions.ts:1238, insert 1438 | A NEW row (new id) copied from a source row, `status = scheduled` | `appointment.create` (actions.ts:1442-1456): ..., startsAt, **clonedFrom** = source id | |
| W4 | `updateAppointment`, actions.ts:1486, update 1898 | `service_id`, `room`, `status` (never `cancelled`); bring-back resets `confirmation_state` from `declined` (1911) | `appointment.update` per affected row (actions.ts:1950-1976): changed, scope, allowConflict, and on a status patch **fromStatus**, **toStatus** | On `to = completed` only: one `analytics_events` row `appointment_status_changed` per row (actions.ts:1983-1995, analytics.ts:23-70). A note becomes an `appointment_notes` row (1924-1940) |
| W5 | `rescheduleAppointment` (staff), actions.ts:2067, update 2261 | `starts_at`, `ends_at`, `practitioner_id`, `location_id` on the SAME row (same id) | `appointment.reschedule` per row (actions.ts:2269-2283): practitionerId, locationId, **startsAt (new)**, endsAt (new), scope, allowConflict. The previous start is not in this row | |
| W6 | `confirmAppointmentRequest` (accept a pedido), actions.ts:2421, update 2512 | `status` `scheduled` to `confirmed` | `appointment.update` (actions.ts:2519-2534): changed, scope, **from_status**, **to_status** (snake case here), via = `portal_request_confirm` | |
| W7 | `correctAppointmentEstadoAction`, actions.ts:2651, update 2744 | `status` final to final | `appointment.estado_correction` (actions.ts:2746-2768): fromStatus, toStatus, correction = true, allowConflict | No `analytics_events` row, also when the target is `completed` |
| W8 | `cancelAppointment` (staff), actions.ts:2806, update 2865 | `status = cancelled` | `appointment.cancel` per row (actions.ts:2872-2915): hadReason (boolean), reasonRef, scope, fromStatus, toStatus = `cancelled`. The reason text is not stored anywhere (actions.ts:2829-2833) | |
| W9 | `hardDeleteAppointment`, actions.ts:2955, delete 3019 | DELETES the row, after deleting its `analytics_events` rows (3012) | `appointment.hard_delete` (actions.ts:3026-3042): a snapshot of ids, startsAt, endsAt, status, confirmationState | Refused when notes, clinical records or invoices are linked (2992-3007). Capability `settings:manage` plus the tenant delete password |
| W10 | Patient SMS reply, apps/web/lib/reminders/inbound-reply.ts: cancel 326, confirm 408 | `status = cancelled`, or `status = confirmed` + `confirmation_state = confirmed` + `confirmation_received_at` + `confirmation_channel = sms`. Only from `scheduled` (inbound-reply.ts:311) | `appointment.patient_sms_reply` (inbound-reply.ts:147-165), actor NULL: source = `patient-sms-reply`, intent, outcome, reason | `sms_inbound_events` row |
| W11 | Reception SMS review, apps/web/lib/reminders/inbound-store.ts:272 | `status` to `confirmed` (+ confirmation fields, channel `sms_review`) or `cancelled`, from `scheduled` only | `appointment.sms_reply_reviewed` (inbound-store.ts:369-385): source, inboundEventId, resolution, applied, patientId | |
| W12 | SMS confirmation code, apps/web/lib/reminders/confirm-redeem.ts:220 | `status` `scheduled` to `confirmed` | `appointment.confirm.sms_code` (confirm-redeem.ts:224-229; writer 360-372), actor NULL; a refusal writes the same action with reason `double_confirmed_refused` (244-251). A reschedule REQUEST writes `appointment.reschedule_request.sms_code` (308) and an `appointment_reschedule_requests` row (296) | |
| W13 | Signed reminder link, apps/web/lib/reminders/redeem.ts:223 (confirm) and 228 (cancel) | confirm: `confirmation_state = confirmed` + `confirmation_received_at` (status unchanged); cancel: `status = cancelled` | none in `audit_log`; one `patient_audit_log` row (redeem.ts:297-303), auth_means `signed_token`, action, outcome | `action_token_consumptions` row (redeem.ts:233-238) |
| W14 | Pack link, apps/web/lib/packs/link.ts:177 | `pack_instance_id` on an unlinked row | `pack_instance.link_appointment` (link.ts:184-196): packInstanceId, packId, sessionsTotal, sessionsAvailableBefore | |
| W15 | Portal booking, apps/api/lib/appointments/booking.ts:509 `bookAppointment`, insert apps/api/lib/appointments/store.ts:982-1007 | New row, `status = scheduled`, `origin = patient_portal`, `created_by` NULL | none in `audit_log` or `patient_audit_log` | `staff_notifications` row(s), kind `appointment_request`, post-commit (booking.ts:620-629; apps/api/lib/notifications/centre.ts:177) |
| W16 | Portal cancel, booking.ts:638 `cancelAppointment`, update store.ts:1037-1051 | `status = cancelled`, from `scheduled` or `confirmed`, outside the 24h cutoff | none in `audit_log` or `patient_audit_log` | `staff_notifications`, kind `cancelled`, `previous_starts_at = new_starts_at` (booking.ts:656-667) |
| W17 | Portal reschedule, booking.ts:728 `rescheduleAppointment`, update store.ts:1053-1100 | `starts_at`, `ends_at` on the SAME row; duration preserved | none in `audit_log` or `patient_audit_log` | `staff_notifications`, kind `rescheduled`, carrying `previous_starts_at` and `new_starts_at` (booking.ts:781-791) |
| W18 | Fisiozero importer, packages/db/src/migration/upsert.ts:781-833 | Insert: patient, practitioner, location, service, starts_at, ends_at, status, notes. RE-RUN: UPDATE of the same columns from the source (upsert.ts:818-826) | none (`docs/DECISIONS.md:4286-4288`) | `migration_staging_rows` ledger row (section 8) |
| W19 | `merge_patients` SQL function, latest in 0105_clinical_records_episode_key.sql:288; update 339-341 | `patient_id` source to target (not `patient_2_id`) | one `patient.merge` row with counts (0105:393-400) | |
| W20 | Data ops run on production (GREEN), each documented in `docs/` | `docs/data-op-dur-01.md:40`: `ends_at` and `updated_at` on imported one-minute future rows; `docs/data-op-nesa-split.md` (table "What stage 1 writes"): `practitioner_id`; `docs/data-op-staff-10-v2.md`: practitioner and status changes on named rows | one row per op: `staff.dur01.extend_import_duration`, `staff.nesa_split.reassign`, and the STAFF-10 v2 row `staff.staff10_v2.apply` (`docs/data-op-dur-01.md:18-19`) | |

Capabilities: `appointments:write`, `appointments:delete`, `appointments:cancel_own`
(`packages/auth/permissions.ts:36-45`); who may cancel or bring back is
`apps/web/lib/scheduling/cancel-authority.ts`.

Audit metadata history (merge dates of the change, from `git log`; the production deploy date is
not established):

- `fromStatus`/`toStatus` on `appointment.update`, and `allowConflict` on create and update:
  added by #873, merged 2026-08-11. Earlier `appointment.update` rows carry no from/to.
- `appointment.estado_correction`: added by #1254, merged 2026-09-10.
- `appointment.cancel` metadata reduced to `hadReason`/`reasonRef`: #1226, merged 2026-09-09.
- `writeAppointmentAudit` itself: #43, merged 2026-05-29.
- `note_present` on the completion event: #449, merged 2026-07-03.

---

## 3. History stores

### `audit_log`

`0000_empty_runaways.sql`, RLS in `0001_rls.sql`; schema.ts:1796-1816. Append-only by policy set.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | |
| `tenant_id` | uuid | |
| `actor_user_id` | uuid FK users, nullable | Staff actor. NULL for patient SMS paths (inbound-reply.ts:148-154; confirm-redeem.ts `writeAudit`) |
| `action` | text | See section 2 for appointment actions |
| `entity_type` | text | `appointment` for every row in section 2 except `patient.merge` (`patient`) and the data-op rows |
| `entity_id` | uuid, nullable | The appointment id |
| `metadata` | jsonb | Ids, enums, ISO timestamps (contract: apps/web/lib/audit/metadata-contract.ts) |
| `ip` | varchar(45) | |
| `created_at` | timestamptz | When the change happened |

Appointment-related actions written by application code (complete list from `git grep`):
`appointment.create`, `appointment.update`, `appointment.reschedule`, `appointment.cancel`,
`appointment.hard_delete`, `appointment.estado_correction` (audit.ts:5-21),
`appointment.patient_sms_reply`, `appointment.sms_reply_reviewed`,
`appointment.confirm.sms_code`, `appointment.reschedule_request.sms_code`,
`appointment.booking_approved_handed_over` (apps/web/lib/reminders/dispatch-ledger.ts:133),
`pack_instance.link_appointment`. Schedule actions are in section 4.

### `analytics_events`

`0025_event_schema.sql`; schema.ts:1829-1866. Its header calls it "the per-appointment
status-transition history". In code there is ONE writer and ONE event type:
`appointment_status_changed`, written only by `updateAppointment` for `to = completed`
(actions.ts:1983-1995; analytics.ts:23-70). Payload: `appointment_id`, `from_status`, `to_status`,
`actor`, `note_present`. Columns set: `therapist_user_id`, `location_id`, `actor_user_id`,
`occurred_at`; `patient_id` and `service_id` are not set. Not written by the correction door, the
SMS paths, the portal or the importer. Deleted for an appointment by `hardDeleteAppointment`
(actions.ts:3012).

### `appointment_notes`

`0026`, `0042`, `0050`; schema.ts:1368-1411. Per-visit notes, one row per note: `appointment_id`
(nullable), `patient_id`, `episode_id`, `author_user_id`, `body`, `created_at`, `edited_at`,
`last_edited_by`. Not a status history.

### `staff_notifications`

`0055`, `0061`; schema.ts:2158-2214. Kinds pinned by CHECK (five since 0061, including
`appointment_request`, `cancelled`, `rescheduled`, `confirmed`). Columns that matter here:
`appointment_id` (no FK), `patient_id`, `previous_starts_at`, `new_starts_at`, `occurred_at`,
`actor_user_id` (NULL for patient actions), `recipient_user_id`. One row per recipient, so one
patient action can produce several rows (dedupe key schema.ts:2206-2211). Written post-commit and
best-effort.

### `patient_audit_log`

`0054`; schema.ts:2084-2111. Patient actions through a signed link: `patient_id`,
`appointment_id`, `auth_means` (`signed_token` | `otp_session`), `action`, `outcome`
(`success` | `refused`), `reason`, `occurred_at`. Writer: apps/web/lib/reminders/redeem.ts:297.

### `appointment_reschedule_requests`

`0080`; schema.ts:1738-1771. A patient's request to be moved (SMS code), `via` CHECK `sms_code`,
`requested_at`, `handled_at`, `handled_by`. Written by confirm-redeem.ts:296; closed by
apps/web/lib/notifications/reschedule-requests.ts:145. It does not move the appointment.

---

## 4. Time: when a professional can be booked

### `availability_templates`

`0006_availability_timeoff.sql`; schema.ts:1127-1171.

| Column | Type | Meaning |
|---|---|---|
| `user_id` | uuid FK users | The professional |
| `location_id` | uuid FK locations | The clinic this window applies to |
| `weekday` | smallint 0-6 | 0 = Sunday |
| `start_time`, `end_time` | time | Lisbon wall-clock window |
| `valid_from`, `valid_until` | date, nullable | Optional validity window; NULL = open-ended |
| `is_active` | boolean | Archive flag |
| `created_at` | timestamptz | |

No `updated_at`, no `archived_at`, no service column, no "held for other services" column.

| Writer | What it changes | `audit_log` action |
|---|---|---|
| `createTemplateIn`, apps/web/lib/admin/availability.ts:217 | insert | `availability_template.create` (238) |
| `updateTemplateIn`, availability.ts:253 | UPDATE in place of user, location, weekday, start, end (283-290) | `availability_template.update` (295), no metadata |
| `archiveTemplateIn`, availability.ts:313 | `is_active = false` (327) | `availability_template.archive` (333) |
| `removeDayDefined`, apps/web/lib/admin/day-defined-remove.ts:89 | `is_active` and validity bounds (82) | `availability_template.day_defined_remove` (134) |
| `writeSchedulePlan`, apps/web/lib/admin/schedule-window-write.ts:151 (via alternating-schedule.ts:109, day-by-day-schedule.ts:103) | insert and update (133, 159, 182) | `availability_template.alternating_weeks` (alternating-schedule.ts:112), `availability_template.day_by_day` (day-by-day-schedule.ts:106) |
| `deleteLocation`, apps/web/lib/admin/locations.ts:308 | DELETE of the location's templates | `location.delete` (347) |
| `deleteStaffMember`, apps/web/lib/admin/staff.ts:633 | DELETE of the person's templates | `staff.delete` (649) |

### `time_off` (blocks and absences)

`0006`; schema.ts:1175-1195. `user_id`, `starts_at`, `ends_at` (timestamptz), `reason`
(`time_off_reason`: `vacation`, `sick`, `holiday`, `other`; schema.ts:114-119), `note`,
`created_at`. No `location_id`: a block applies to the professional at every clinic
(schema.ts:1173-1174). No `updated_at`, no `created_by`.

The application writes two reasons only: `prolongada` mode gives `vacation`, `pontual` mode gives
`other` (apps/web/lib/admin/time-off.ts:105-107). `sick` and `holiday` have no application writer.

| Writer | What it changes | `audit_log` action |
|---|---|---|
| `createTimeOffBlock`, time-off.ts:355 (also the agenda "Bloquear" dialog, apps/web/app/agenda/block-actions) | insert (369) | `time_off.create` (380): mode, overlappingAppointments |
| `createTimeOffBlockBatch`, time-off.ts:401 | insert many (439) | `time_off.create_batch` (451) |
| `updateTimeOffBlock`, time-off.ts:462 | UPDATE in place (478) | `time_off.update` (484): mode, overlappingAppointments |
| `deleteTimeOffBlock`, time-off.ts:495 | hard DELETE (508) | `time_off.delete` (513), no metadata |
| `deleteStaffMember`, staff.ts:634 | DELETE of the person's blocks | `staff.delete` |

### `locations`: opening hours and the midday closure

`0000`, `0041` (slot granularity), `0085_clinic_hours_and_cb_closure.sql`; schema.ts:259-342.
`opens_at`, `closes_at` (time, one pair per location, no weekday), `midday_closed_from`,
`midday_closed_to` (both or neither, every open day), `slot_granularity_min`, `is_active`.
Writers: apps/web/lib/admin/locations.ts:163 (`location.create`), 181 (`location.update`), 241,
275 (`location.delete`).

There is no table for public holidays, clinic closed days, or closed weekdays. A day the clinic is
closed is a day with no active availability template for anyone.

### How booking reads them

Staff: `evaluateAvailability` (apps/web/lib/scheduling/availability.ts) and the conflict kinds
`therapist`, `room`, `availability`, `time_off` (apps/web/lib/scheduling/types.ts:260); the
"Guardar mesmo assim" override (`allowConflict`) books past an availability or block conflict, and
is recorded only in the audit metadata (section 2, W1, W4, W5). Portal: SQL predicates in
apps/api/lib/appointments/store.ts:175-280 (availability, time off, midday closure, clinic hours).

---

## 5. Services, therapist services, packs

### `services`

`0000`, `0031`, `0039`, `0057`; schema.ts:344-393. `name` (free text), `description`,
`location_id` (NULL = all clinics), `duration_min` (default length, default 60), `price_cents`,
`currency`, `is_active`, `contraindication_sensitive`, `internal_only`, `patient_bookable`.
There is no service category, area or specialty column; the only grouping in code is a colour
mapping by name prefix (apps/web/app/marcacoes/marcacoes-view.tsx:119-133). Writers:
apps/web/lib/admin/services.ts (`service.create` 120, `service.update` 148, `service.delete` 329,
`service.price.set` 513).

`service_location_prices` (schema.ts:401-429): per-clinic price override.

### `therapist_services`

`0023`; schema.ts:711-737. (`therapist_user_id`, `service_id`) pairs, add or remove only. The
oldest row is the "primary" service (apps/web/lib/admin/therapist-primary-service.ts:19-32).
Writers: therapist-primary-service.ts:113 (`therapist.primary_service.set`), 204
(`therapist.services.set`). It governs preselection in the booking form, not what is booked.

### Packs

`service_packs` (schema.ts:438-467): pack type, `base_service_id`, `session_count`, price.
`patient_pack_instances` (schema.ts:510-616): one purchase. Balance is derived:
`sessions_total - legacy_consumed - count(linked appointments with status <> 'cancelled')`
(packages/db/src/pack-balance.ts:34-63). A `no_show` consumes a session.

---

## 6. Staff: `users`, `staff_locations`

`users` (schema.ts:191-253; `0036`, `0046`, `0066`, `0086`): one row per staff login and per
shared resource. `role_id` (permission role), `job_title` (free text, "Fisioterapeuta",
"Osteopata", never gates anything, schema.ts:225-229), `is_active`, `is_bookable` (appears in the
Terapeuta list, schema.ts:231-238), `is_shared_resource` (a clinic resource such as NESA, not a
person, schema.ts:239-242). There is no service-area column on a person.

`staff_locations` (`0038`; schema.ts:977-1004): (`user_id`, `location_id`, `color`). Writer:
apps/web/lib/admin/staff-locations.ts:88 (`staff.locations.set`).

A professional who works in several service areas has several `therapist_services` rows and
availability at one or more clinics; nothing records which hours belong to which area.

---

## 7. Patients and patient identity

`patients` (schema.ts:743-931). One row per person per tenant; the tenant spans both clinics, so
one `patients.id` is used at every clinic. `patient_number` is unique per tenant (schema.ts:929).
`created_at` is the ficha creation time; for imported patients it is the source registration date
when present (packages/db/src/migration/upsert.ts:730-736). `primary_location_id` (nullable),
`merged_into_id` and `deleted_at` (a merged patient is soft-deleted and points at the survivor,
0105:387-391).

`patient_locations` (`0005`; schema.ts:936-961): many-to-many patient and clinic links, written by
the importer (upsert.ts:771-775) and by `merge_patients`.

`merge_patients(source, target, actor)` (latest 0105:288): moves `appointments.patient_id`,
episodes, records, attachments, invoices and location links to the target, soft-deletes the source,
writes `patient.merge`. It does not move `appointments.patient_2_id`.

---

## 8. Fisiozero import

### `migration_staging_rows` (the ledger)

`0014_migration_staging.sql`, index `0098_migration_staging_imported_entity_idx.sql`;
schema.ts:1919-1956.

| Column | Meaning |
|---|---|
| `batch_id` | One import run |
| `source_system` | `fisiozero` |
| `entity_type` | `migration_entity_type`: `patient`, `appointment`, `clinical_episode`, `clinical_record`, `attachment` (schema.ts:135-141) |
| `source_id` | Source key. For appointments `sha256(id_paciente|inicio|terapeuta)`, because the delivery has no appointment id (fisiozero.ts:295-297, 790) |
| `raw` | jsonb, the whole source row as delivered, including `estado`, `inicio`, `fim`, `tipo_servico` (fisiozero.ts:566-567, 814). Contains personal data in other keys |
| `status` | `migration_staging_status`: `pending`, `validated`, `imported`, `failed` (schema.ts:126-131) |
| `error_detail` | jsonb |
| `imported_entity_id` | uuid of the target row (no FK) |
| `created_at`, `updated_at` | |

Unique on (`tenant_id`, `source_system`, `entity_type`, `source_id`).

Imported appointment = `appointments.id IN (SELECT imported_entity_id FROM migration_staging_rows
WHERE source_system = 'fisiozero' AND entity_type = 'appointment' AND status = 'imported')`.
This is the only marker; `origin` is `staff` and `created_by` is NULL on imported rows, and NULL
`created_by` is not unique to them (`docs/data-op-dur-01.md:102`; 0067:36-40).

### Mapping, appointments (`marcacoes.csv`)

Adapter packages/db/src/migration/sources/fisiozero.ts:743-815, writer upsert.ts:781-806.

| Source | Target |
|---|---|
| `id_paciente` | `patient_id` via the ledger |
| `terapeuta` | `practitioner_id` via a config map; unmapped goes to review |
| clinic (file) | `location_id` |
| `tipo_servico` | `service_id` via a config map; unmapped gives NULL |
| `inicio`, `fim` (Lisbon local) | `starts_at`, `ends_at` |
| `estado` | `status`, below |
| `observacoes` | `notes` |

`estado` (fisiozero.ts:254-278): `realizada` to `completed`; `falta` to `no_show`; `marcada` with a
start after the run time to `scheduled`; `marcada` with a start at or before the run time to
`cancelled` (owner ruling B, 2026-08-25); anything else is not imported (review `unknown_estado`).
Nothing maps to `confirmed`. The delivery vocabulary is `{realizada, falta, marcada}`
(scripts/import/check-delivery.mjs:48).

Not set by the importer: `created_by`, `origin` (default), `confirmation_state` (default),
recurrence, group, batch, pack, second participants, room (upsert.ts:796-805). `created_at` is the
import time. No audit row.

Patients (`pacientes.csv`): fisiozero.ts:676-693, upsert.ts:700-736; identity key is
`id_paciente` only (no NIF, phone or name dedupe). Clinical episodes and records: fisiozero.ts:824-901.
Attachments: fisiozero.ts:905-937.

Not imported: availability, blocks, absences, holidays, packs, staff, services, locations
(practitioners, clinics and services are mapped to existing rows by config, types.ts:13-18,
216-226). Fisiozero had no block feature; blocked time there was booked against placeholder
patients, which arrive as patients with appointments, recognisable only by name pattern
(scripts/import/cb-reconciliation.sql:508-553).

`docs/data-op-dur-01.md` records that imported future rows held as one minute were extended to
their service's default length on 2026-09-27 (board card DUR-01); past imported rows keep the
source length.

---

## 9. Group, multi-therapist, recurring and batch bookings

| Shape | Representation | Evidence |
|---|---|---|
| Two patients in one slot | One row, second patient in `patient_2_id` | schema.ts:1027-1038 |
| Two therapists for one patient | Two rows sharing `booking_group_id`, or one row with `practitioner_2_id` | schema.ts:1039, 1055-1061 |
| Group class (several patients, one slot) | No representation; one row per patient, no shared key. The pilates module is out of V1 scope (`CLAUDE.md`, "Out of scope for V1") | not established beyond this |
| Recurring series | Rows sharing `recurrence_parent_id` and `recurrence_rule` | actions.ts:911-944 |
| Batch | Rows sharing `batch_id` | batch.ts:278-298 |
| Shared resource (NESA) | A `users` row with `is_shared_resource = true` as `practitioner_id` or `practitioner_2_id` | schema.ts:239-242; 0086 |
| Overlapping bookings | Allowed by "Guardar mesmo assim" except two `confirmed` rows of one practitioner (0061) | section 1 |
| Out-of-hours booking | A normal row; the override is recorded only in audit metadata `allowConflict` | section 2 |
| Extra visit | No marker | not established |

---

## 10. AI recording consultations and AI ingestion

### `consultations`

`0064_consultations.sql:66-130`; schema.ts:2618-2665. One row per recorded consultation, written
before the send to the AI partner.

| Column | Meaning |
|---|---|
| `id`, `tenant_id` | |
| `patient_id` | NOT NULL |
| `doctor_id` | NOT NULL, the recording professional (`users`) |
| `audio_object_key` | storage key of the audio |
| `consultation_started_at`, `consultation_ended_at` | recording window |
| `fire_status` | text, CHECK `pending`, `fired`, `needs_attention` (0064:103-104), default `pending` |
| `attempt_count` | sends attempted, including the first |
| `last_attempt_at`, `last_error` | latest attempt only |
| `created_at` | |

No `appointment_id`, no `location_id`. `fire_status` meaning: `pending` = waiting for a first or
next send; `fired` = the partner answered 200, 201 or 409; `needs_attention` = the retry ceiling
(8) was reached (apps/web/lib/consultation/retry-policy.ts:15, 118-121).

Writers: insert `persistConsultation`, apps/web/lib/consultation/consultation-store.ts:96 (called
from apps/web/app/consultation/actions.ts:381); state `markDelivered` (consultation-store.ts:147),
`markPending` (160), `markNeedsAttention` (178), decided in
apps/web/lib/consultation/fire-attempt.ts:113-132; retries every 5 minutes by
apps/web/lib/consultation/inngest/functions.ts:20-97. `audit_log`: `patient.recording_consent` on
consent (apps/web/app/consultation/actions.ts:156-160); none for insert or state changes.

### `ai_ingestion_requests`

`0008_ai_ingestion_requests.sql`; schema.ts:1497-1525. `idempotency_key`, `request_id`,
`payload_hash`, `clinical_record_id`, `status` (`ingestion_status`: `received`, `accepted`,
`rejected`; only `accepted` is written, apps/web/lib/ingestion/store.ts:95-105). The draft record:
`clinical_records.source = 'ai_ingested'`, `ai_review_state = 'pending_review'`, `appointment_id`
NULL (store.ts:78-93). No key links a consultation to the record that comes back.

---

## 11. Statistics screens

| Screen | Loader | Appointment filter | Shows |
|---|---|---|---|
| `/estatisticas/painel` | `getStatistics`, apps/web/lib/statistics/queries.ts:61 | period (`starts_at`, UTC day bounds, queries.ts:41-49), professional, service, clinic; no status filter on the count (149-156) | total appointments (all statuses, 158-160); occupied minutes = sum of `ends_at - starts_at` where `status <> 'cancelled'` (162-165, includes `no_show`); appointments by status (170-175); revenue by professional, service, clinic and month (91-146) |
| `/estatisticas/indicadores` | `getKpiReports`, apps/web/lib/statistics/kpi-queries.ts:107 | period only (default 12 months, 70-97); `status <> 'cancelled'` (141-146) | the 10 reports (labels `packages/i18n/src/strings.pt.json:44-53`, queries kpi-queries.ts:156-287): counts by service, by professional, by day and professional, by patient; revenue by month, by month and professional, by patient; age, referral source and city of patients seen |
| `/dashboard` | apps/web/app/dashboard/page.tsx | today, this week | active patients and patients created this week (223-230, 274-280); non-cancelled appointments today and per weekday (233-239, 264-270); new clinical records this week; month revenue |

Neither statistics loader reads `availability_templates` or `time_off` (queries.ts:11,
kpi-queries.ts:10). No CSV or spreadsheet export of appointments exists in `apps/web`.

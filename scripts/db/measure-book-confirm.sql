-- BOOK-CONFIRM MEASUREMENT: an online request reception accepted, and the
-- confirmation message it should have produced. READ ONLY. COUNTS ONLY: no id, no
-- person's name, no email address, no phone number, no free text and no exact
-- timestamp is ever printed, so the transcript carries no patient data and may be
-- pasted. A LOCATION's name is printed (it is a clinic, not a person); its address
-- and phone are printed only as present or absent.
-- Run inside the block's own `begin read only`, so the server refuses any write
-- this file could contain. Row 0 prints that the transaction is READ ONLY.
--
-- WHY. The owner accepted an online request on production and the patient got no
-- confirmation email. In code, accepting a request emits `appointment/scheduled`
-- (apps/web/lib/scheduling/actions.ts, confirmAppointmentRequest), and the
-- Inngest function sendAppointmentConfirmation calls dispatchConfirmation
-- (apps/web/lib/reminders/dispatch.ts), which sends `confirmation.email` and
-- `confirmation.sms`. This file prints the production counts that say which of
-- dispatchConfirmation's gates the accepted requests meet. A PROFILE, not
-- verdicts: it asserts nothing about the counts, it prints them.
--
-- READ THIS BEFORE READING SECTIONS E AND F. A zero there is NOT evidence that
-- nothing was sent. dispatchReminder records every outcome in
-- `reminder_dispatches`. dispatchConfirmation does not: the only row it can
-- write is `confirmation.sms` with outcome `provider_error` (sendPatientSms goes
-- through sendRecordingProviderError). A confirmation that was sent, on either
-- channel, a confirmation that a gate held back (status, origin, unconfirmed,
-- no_contact, channels_off), and an email the provider refused all leave NO row.
-- So E and F say whether the SMS leg was refused by the provider, and print the
-- other templates beside it as the comparand. They cannot say an email went out.
--
-- THE WINDOW is the 30 days ending at the transaction's start: every section
-- uses `now() - interval '30 days'`, and now() does not move inside one
-- transaction. Section G prints the window as two Lisbon dates.
--
-- WHAT IT PRINTS
--   0  the transaction is READ ONLY;
--   A  each active location: its name, and whether an address and a phone are on
--      file. The message prints the location's phone, and falls back to the
--      tenant's `settings.contacts.phone` when the location has none;
--   B  each tenant's reminder switches as the application reads them
--      (parseTenantConfig, apps/web/lib/admin/settings-config.ts): the JSON path
--      is `tenants.settings -> 'reminders' -> 'emailEnabled'` and `-> 'smsEnabled'`.
--      A key that is missing, or holds anything but a JSON boolean, reads as the
--      default, and the default is TRUE for both. A tenant is printed as an
--      ordinal (oldest first), never by name;
--   C  online requests. C0: every appointment by origin, the base. C1: requests
--      (origin `patient_portal`) created in the window, by current status. C2:
--      acceptances in the window, by the door that accepted. The four writers in
--      apps/web/lib/scheduling/pedido-acceptance.ts each leave a different audit
--      row, so the audit log CAN tell them apart:
--        1  the Pedidos queue       `appointment.update`, metadata `via` =
--                                   `portal_request_confirm`
--        2  the drawer's Estado     `appointment.update`, metadata `fromStatus` =
--           selector                `scheduled` and `toStatus` = `confirmed`
--                                   (camelCase, and no `via`)
--        3  the SMS review queue    `appointment.sms_reply_reviewed`, metadata
--                                   `resolution` = `confirmed`, `applied` = true
--        4  the patient's SMS reply `appointment.patient_sms_reply`, metadata
--                                   `outcome` = `confirmed`
--      and a fifth writer moves `scheduled` to `confirmed` and emits nothing:
--        5  the confirm link        `appointment.confirm.sms_code`, no `reason`
--      Every other audit row on an online request is counted beside them as the
--      comparand. What the audit row does NOT record, for doors 3, 4 and 5, is
--      that the row was a request at that moment: this file reads it from
--      `origin` = `patient_portal`. C3: requests that left `scheduled` with no
--      row of any of the five shapes, which would be a door this file cannot
--      see. C4: GUEST requests (the public form, `guest_booking_requests`). A
--      guest request is never accepted into an appointment by any door:
--      reception converts it to a patient and books by hand, which makes a
--      `staff` appointment, and dispatchConfirmation sends nothing for a `staff`
--      appointment (its `origin` gate);
--   D  of the requests accepted in the window: D1 their patients (DISTINCT
--      patients, one row), with an email on file, a phone on file, a phone the
--      SMS leg can use, each per-patient switch on, and soft-deleted. "On file"
--      is the application's own test, a non-empty string. D2 their current
--      status, because dispatchConfirmation sends only for `scheduled` and
--      `confirmed`;
--   E  `reminder_dispatches` in the window. E0: the totals. E1: rows whose
--      template id starts `confirmation.`, by channel, template, outcome,
--      suppression reason and provider status. E2: the same for EVERY template,
--      the comparand. A template id, a reason or a status that is not a plain
--      lower-case code is counted as "other (not printed)", never printed;
--   F  of the requests accepted in the window, per door and for all doors: how
--      many have a `confirmation.email` row, a `confirmation.sms` row, no
--      confirmation row, and any row of any template (the comparand: a request
--      with a reminder row and no confirmation row is the expected shape);
--   G  the age profile, so a zero is readable: total rows, and the oldest and
--      newest row as a Lisbon DATE, for `reminder_dispatches` and for the
--      appointment rows of `audit_log`, and the window's two dates.
--
-- SECTION H RIDES IN THE SAME SITTING, for a second question. Strategy's dispatch
-- S-1003-B, block 2: the clinic opens a third location, Montemor-o-Novo, on
-- 2026-10-17, and "Measure first". H prints what a location carries today, so
-- the third one can be given the same. The same rule holds: counts, a
-- location's name, clinic hours and a role's key. No staff name, no email
-- address, no phone number and no id.
--   H1 every location, active AND inactive (an archived Montemor row would show
--      here): name, active, `opens_at`, `closes_at`, the midday closure pair
--      (`midday_closed_from`, `midday_closed_to`), `slot_granularity_min`, and
--      whether an address and a phone are on file. The times are clinic hours,
--      printed as HH:MM;
--   H2 staff per role (`roles.slug`, the role's key, never the person): active
--      users, how many have NO row in `staff_locations`, and how many have 1, 2,
--      or 3 or more. A role key that is not a plain lower-case code is counted
--      as "other (not printed)";
--   H3 per location. H3a: `staff_locations` rows by role. H3b:
--      `availability_templates` rows, active rows, active rows valid today, and
--      distinct therapists with active hours. H3c: `service_location_prices` and
--      `service_pack_location_prices` rows, all and active. H3d: active users
--      with `is_bookable` true who have a `staff_locations` row or active hours
--      there, DISTINCT users;
--   H4 per location: appointments created in the last 30 days by origin, and at
--      any time, the base H3 is read against.

\echo '=== BOOK-CONFIRM MEASUREMENT: accepted online requests and their confirmation message. READ ONLY, counts only ==='

select '0. this transaction is READ ONLY (the server refuses writes)' as check,
       current_setting('transaction_read_only') as observed,
       'on' as expected;

\echo '--- A. ACTIVE LOCATIONS: the name, and whether an address and a phone are on file (yes or no, never the value)'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when coalesce(btrim(l.address), '') = '' then 'no' else 'yes' end as address_present,
       case when coalesce(btrim(l.phone), '') = '' then 'no' else 'yes' end as phone_present
from locations l
join tenants t on t.id = l.tenant_id
where l.is_active
order by 1, 2;

\echo '--- A. BASE: locations, active and inactive'
select count(*) filter (where l.is_active) as active_locations,
       count(*) filter (where not l.is_active) as inactive_locations,
       count(*) as all_locations
from locations l;

\echo '--- B. TENANT REMINDER SWITCHES as parseTenantConfig reads them: settings.reminders.emailEnabled and .smsEnabled, TRUE unless the key holds JSON false'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       case when t.settings #> '{reminders,emailEnabled}' = 'false'::jsonb then 'false' else 'true' end as email_enabled,
       case when jsonb_typeof(t.settings #> '{reminders,emailEnabled}') = 'boolean' then 'stored' else 'default (key missing or not a boolean)' end as email_enabled_source,
       case when t.settings #> '{reminders,smsEnabled}' = 'false'::jsonb then 'false' else 'true' end as sms_enabled,
       case when jsonb_typeof(t.settings #> '{reminders,smsEnabled}') = 'boolean' then 'stored' else 'default (key missing or not a boolean)' end as sms_enabled_source,
       case when jsonb_typeof(t.settings #> '{contacts,phone}') = 'string' and t.settings #>> '{contacts,phone}' <> '' then 'yes' else 'no' end as tenant_contact_phone_present,
       count(distinct l.id) filter (where l.is_active) as active_locations,
       count(distinct a.id) as online_requests_created_in_window
from tenants t
left join locations l on l.tenant_id = t.id
left join appointments a on a.tenant_id = t.id and a.origin = 'patient_portal' and a.created_at >= now() - interval '30 days'
group by t.id, t.created_at, t.settings
order by 1;

\echo '--- C0. BASE: every appointment, by origin, created in the last 30 days and at any time'
select case when a.origin = 'patient_portal' then 'patient_portal (an online request)' else 'staff' end as origin,
       count(*) filter (where a.created_at >= now() - interval '30 days') as created_in_window,
       count(*) as created_at_any_time
from appointments a
group by 1
order by 1;

\echo '--- C1. ONLINE REQUESTS created in the last 30 days (origin patient_portal), by current status'
select a.status::text as current_status,
       count(*) as online_requests_created_in_window,
       count(distinct a.patient_id) as distinct_patients
from appointments a
where a.origin = 'patient_portal'
  and a.created_at >= now() - interval '30 days'
group by 1
order by 1;

\echo '--- C2. ACCEPTANCES in the last 30 days, by the door that accepted (door 0 is the comparand: every other audit row on an online request)'
with acc as (
  select al.entity_id as appointment_id,
         case
           when al.action = 'appointment.update' and al.metadata ->> 'via' = 'portal_request_confirm'
             then '1 Pedidos queue (appointment.update, via portal_request_confirm)'
           when al.action = 'appointment.update' and al.metadata ->> 'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' = 'confirmed'
             then '2 drawer Estado selector (appointment.update, fromStatus scheduled, toStatus confirmed)'
           when al.action = 'appointment.sms_reply_reviewed' and al.metadata ->> 'resolution' = 'confirmed' and al.metadata -> 'applied' = 'true'::jsonb
             then '3 SMS review queue (appointment.sms_reply_reviewed, confirmed, applied)'
           when al.action = 'appointment.patient_sms_reply' and al.metadata ->> 'outcome' = 'confirmed'
             then '4 patient SMS reply (appointment.patient_sms_reply, confirmed)'
           when al.action = 'appointment.confirm.sms_code' and al.metadata ->> 'reason' is null
             then '5 confirm link (appointment.confirm.sms_code), which emits no confirmation event'
         end as door
  from audit_log al
  join appointments a on a.id = al.entity_id
  where al.entity_type = 'appointment'
    and al.created_at >= now() - interval '30 days'
    and a.origin = 'patient_portal'
),
labelled as (
  select coalesce(acc.door, '0 not an acceptance: every other audit row on an online request (the comparand)') as door,
         acc.appointment_id
  from acc
)
select labelled.door,
       count(*) as audit_rows,
       count(distinct labelled.appointment_id) as distinct_requests
from labelled
group by 1
order by 1;

\echo '--- C3. A DOOR THIS FILE CANNOT SEE: online requests created in the window that left scheduled, and how many have no acceptance row of the five shapes at any time'
with acc_of_window_requests as (
  select al.entity_id as appointment_id,
         case
           when al.action = 'appointment.update' and al.metadata ->> 'via' = 'portal_request_confirm'
             then '1 Pedidos queue (appointment.update, via portal_request_confirm)'
           when al.action = 'appointment.update' and al.metadata ->> 'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' = 'confirmed'
             then '2 drawer Estado selector (appointment.update, fromStatus scheduled, toStatus confirmed)'
           when al.action = 'appointment.sms_reply_reviewed' and al.metadata ->> 'resolution' = 'confirmed' and al.metadata -> 'applied' = 'true'::jsonb
             then '3 SMS review queue (appointment.sms_reply_reviewed, confirmed, applied)'
           when al.action = 'appointment.patient_sms_reply' and al.metadata ->> 'outcome' = 'confirmed'
             then '4 patient SMS reply (appointment.patient_sms_reply, confirmed)'
           when al.action = 'appointment.confirm.sms_code' and al.metadata ->> 'reason' is null
             then '5 confirm link (appointment.confirm.sms_code), which emits no confirmation event'
         end as door
  from audit_log al
  join appointments a on a.id = al.entity_id
  where al.entity_type = 'appointment'
    and a.origin = 'patient_portal'
    and a.created_at >= now() - interval '30 days'
)
select count(*) as now_confirmed_completed_or_no_show,
       count(*) filter (where not exists (select 1 from acc_of_window_requests x where x.appointment_id = a.id and x.door is not null)) as of_those_with_no_acceptance_row
from appointments a
where a.origin = 'patient_portal'
  and a.created_at >= now() - interval '30 days'
  and a.status in ('confirmed', 'completed', 'no_show');

\echo '--- C4. GUEST REQUESTS (the public form) created in the last 30 days, by status: no door accepts one into an appointment, reception books it by hand as a staff appointment'
select case when g.status in ('pending', 'confirmed', 'declined') then g.status else 'other (not printed)' end as guest_request_status,
       count(*) filter (where g.created_at >= now() - interval '30 days') as created_in_window,
       count(*) filter (where g.created_at >= now() - interval '30 days' and g.converted_patient_id is not null) as in_window_converted_to_a_patient,
       count(*) filter (where g.created_at >= now() - interval '30 days' and g.converted_appointment_id is not null) as in_window_linked_to_an_appointment,
       count(*) filter (where g.created_at >= now() - interval '30 days' and g.handled_at is not null) as in_window_dismissed_from_the_queue,
       count(*) as created_at_any_time
from guest_booking_requests g
group by 1
order by 1;

\echo '--- D1. THE PATIENTS of the requests accepted in the window (DISTINCT patients, any of the five doors)'
with acc as (
  select al.entity_id as appointment_id,
         case
           when al.action = 'appointment.update' and al.metadata ->> 'via' = 'portal_request_confirm'
             then '1 Pedidos queue (appointment.update, via portal_request_confirm)'
           when al.action = 'appointment.update' and al.metadata ->> 'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' = 'confirmed'
             then '2 drawer Estado selector (appointment.update, fromStatus scheduled, toStatus confirmed)'
           when al.action = 'appointment.sms_reply_reviewed' and al.metadata ->> 'resolution' = 'confirmed' and al.metadata -> 'applied' = 'true'::jsonb
             then '3 SMS review queue (appointment.sms_reply_reviewed, confirmed, applied)'
           when al.action = 'appointment.patient_sms_reply' and al.metadata ->> 'outcome' = 'confirmed'
             then '4 patient SMS reply (appointment.patient_sms_reply, confirmed)'
           when al.action = 'appointment.confirm.sms_code' and al.metadata ->> 'reason' is null
             then '5 confirm link (appointment.confirm.sms_code), which emits no confirmation event'
         end as door
  from audit_log al
  join appointments a on a.id = al.entity_id
  where al.entity_type = 'appointment'
    and al.created_at >= now() - interval '30 days'
    and a.origin = 'patient_portal'
),
pat as (
  select distinct a.patient_id
  from appointments a
  where a.id in (select acc.appointment_id from acc where acc.door is not null)
)
select count(*) as distinct_patients,
       count(*) filter (where coalesce(p.email, '') <> '') as with_email_on_file,
       count(*) filter (where p.reminder_email_enabled) as with_email_switch_on,
       count(*) filter (where coalesce(p.email, '') <> '' and p.reminder_email_enabled) as email_on_file_and_switch_on,
       count(*) filter (where coalesce(p.phone, '') <> '') as with_phone_on_file,
       count(*) filter (where p.phone_e164 like '+3519%') as with_phone_the_sms_leg_can_use,
       count(*) filter (where p.reminder_sms_enabled) as with_sms_switch_on,
       count(*) filter (where coalesce(p.phone, '') <> '' and p.reminder_sms_enabled) as phone_on_file_and_switch_on,
       count(*) filter (where coalesce(p.email, '') = '' and coalesce(p.phone, '') = '') as with_no_contact_at_all,
       count(*) filter (where p.deleted_at is not null) as soft_deleted
from pat
join patients p on p.id = pat.patient_id;

\echo '--- D2. THE REQUESTS accepted in the window, by current status (a confirmation is sent only for scheduled and confirmed)'
with acc as (
  select al.entity_id as appointment_id,
         case
           when al.action = 'appointment.update' and al.metadata ->> 'via' = 'portal_request_confirm'
             then '1 Pedidos queue (appointment.update, via portal_request_confirm)'
           when al.action = 'appointment.update' and al.metadata ->> 'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' = 'confirmed'
             then '2 drawer Estado selector (appointment.update, fromStatus scheduled, toStatus confirmed)'
           when al.action = 'appointment.sms_reply_reviewed' and al.metadata ->> 'resolution' = 'confirmed' and al.metadata -> 'applied' = 'true'::jsonb
             then '3 SMS review queue (appointment.sms_reply_reviewed, confirmed, applied)'
           when al.action = 'appointment.patient_sms_reply' and al.metadata ->> 'outcome' = 'confirmed'
             then '4 patient SMS reply (appointment.patient_sms_reply, confirmed)'
           when al.action = 'appointment.confirm.sms_code' and al.metadata ->> 'reason' is null
             then '5 confirm link (appointment.confirm.sms_code), which emits no confirmation event'
         end as door
  from audit_log al
  join appointments a on a.id = al.entity_id
  where al.entity_type = 'appointment'
    and al.created_at >= now() - interval '30 days'
    and a.origin = 'patient_portal'
)
select a.status::text as current_status,
       count(*) as accepted_requests,
       count(*) filter (where a.created_at >= now() - interval '30 days') as of_those_created_in_window
from appointments a
where a.id in (select acc.appointment_id from acc where acc.door is not null)
group by 1
order by 1;

\echo '--- E0. reminder_dispatches in the last 30 days: the totals (a confirmation row is written ONLY for an SMS the provider refused, see the file header)'
select count(*) as all_rows_in_window,
       count(*) filter (where d.template_id like 'confirmation.%') as confirmation_rows_in_window,
       count(*) filter (where d.template_id not like 'confirmation.%') as other_template_rows_in_window,
       count(distinct d.appointment_id) as distinct_appointments_in_window
from reminder_dispatches d
where d.created_at >= now() - interval '30 days';

\echo '--- E1. reminder_dispatches in the last 30 days, template ids starting confirmation.'
select d.channel,
       case when d.template_id ~ '^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$' then d.template_id else 'other (not printed)' end as template_id,
       d.outcome,
       case when d.suppression_reason is null then '(none)' when d.suppression_reason ~ '^[a-z][a-z0-9_]*$' then d.suppression_reason else 'other (not printed)' end as suppression_reason,
       case when d.provider_status is null then '(none)' when d.provider_status ~ '^[a-z][a-z0-9_]*$' then d.provider_status else 'other (not printed)' end as provider_status,
       count(*) as dispatch_rows,
       count(distinct d.appointment_id) as distinct_appointments
from reminder_dispatches d
where d.created_at >= now() - interval '30 days'
  and d.template_id like 'confirmation.%'
group by 1, 2, 3, 4, 5
order by 1, 2, 3, 4, 5;

\echo '--- E2. THE COMPARAND: reminder_dispatches in the last 30 days, EVERY template id'
select d.channel,
       case when d.template_id ~ '^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$' then d.template_id else 'other (not printed)' end as template_id,
       d.outcome,
       case when d.suppression_reason is null then '(none)' when d.suppression_reason ~ '^[a-z][a-z0-9_]*$' then d.suppression_reason else 'other (not printed)' end as suppression_reason,
       case when d.provider_status is null then '(none)' when d.provider_status ~ '^[a-z][a-z0-9_]*$' then d.provider_status else 'other (not printed)' end as provider_status,
       count(*) as dispatch_rows,
       count(distinct d.appointment_id) as distinct_appointments
from reminder_dispatches d
where d.created_at >= now() - interval '30 days'
group by 1, 2, 3, 4, 5
order by 1, 2, 3, 4, 5;

\echo '--- F. THE REQUESTS accepted in the window and their reminder_dispatches rows, per door and for all doors (rows at any time, not only in the window)'
with acc as (
  select al.entity_id as appointment_id,
         case
           when al.action = 'appointment.update' and al.metadata ->> 'via' = 'portal_request_confirm'
             then '1 Pedidos queue (appointment.update, via portal_request_confirm)'
           when al.action = 'appointment.update' and al.metadata ->> 'fromStatus' = 'scheduled' and al.metadata ->> 'toStatus' = 'confirmed'
             then '2 drawer Estado selector (appointment.update, fromStatus scheduled, toStatus confirmed)'
           when al.action = 'appointment.sms_reply_reviewed' and al.metadata ->> 'resolution' = 'confirmed' and al.metadata -> 'applied' = 'true'::jsonb
             then '3 SMS review queue (appointment.sms_reply_reviewed, confirmed, applied)'
           when al.action = 'appointment.patient_sms_reply' and al.metadata ->> 'outcome' = 'confirmed'
             then '4 patient SMS reply (appointment.patient_sms_reply, confirmed)'
           when al.action = 'appointment.confirm.sms_code' and al.metadata ->> 'reason' is null
             then '5 confirm link (appointment.confirm.sms_code), which emits no confirmation event'
         end as door
  from audit_log al
  join appointments a on a.id = al.entity_id
  where al.entity_type = 'appointment'
    and al.created_at >= now() - interval '30 days'
    and a.origin = 'patient_portal'
),
per_door as (
  select distinct acc.door, acc.appointment_id
  from acc
  where acc.door is not null
),
flagged as (
  select per_door.door,
         per_door.appointment_id,
         exists (select 1 from reminder_dispatches d where d.appointment_id = per_door.appointment_id and d.template_id = 'confirmation.email') as has_email,
         exists (select 1 from reminder_dispatches d where d.appointment_id = per_door.appointment_id and d.template_id = 'confirmation.sms') as has_sms,
         exists (select 1 from reminder_dispatches d where d.appointment_id = per_door.appointment_id) as has_any
  from per_door
)
select flagged.door,
       count(distinct flagged.appointment_id) as accepted_requests,
       count(distinct flagged.appointment_id) filter (where flagged.has_email) as with_a_confirmation_email_row,
       count(distinct flagged.appointment_id) filter (where flagged.has_sms) as with_a_confirmation_sms_row,
       count(distinct flagged.appointment_id) filter (where not flagged.has_email and not flagged.has_sms) as with_no_confirmation_row,
       count(distinct flagged.appointment_id) filter (where flagged.has_any) as with_a_row_of_any_template
from flagged
group by 1
union all
select 'ALL DOORS (distinct requests)',
       count(distinct flagged.appointment_id),
       count(distinct flagged.appointment_id) filter (where flagged.has_email),
       count(distinct flagged.appointment_id) filter (where flagged.has_sms),
       count(distinct flagged.appointment_id) filter (where not flagged.has_email and not flagged.has_sms),
       count(distinct flagged.appointment_id) filter (where flagged.has_any)
from flagged
order by 1;

\echo '--- G. THE AGE PROFILE, so a zero is readable: total rows and the oldest and newest row as a Lisbon DATE, and the window'
select 'reminder_dispatches' as rows_of,
       count(*) as total_rows,
       count(*) filter (where d.created_at >= now() - interval '30 days') as rows_in_window,
       to_char(min(d.created_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD') as oldest_row_date,
       to_char(max(d.created_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD') as newest_row_date,
       to_char((now() - interval '30 days') at time zone 'Europe/Lisbon', 'YYYY-MM-DD') as window_from_date,
       to_char(now() at time zone 'Europe/Lisbon', 'YYYY-MM-DD') as window_to_date
from reminder_dispatches d
union all
select 'audit_log, appointment rows',
       count(*),
       count(*) filter (where al.created_at >= now() - interval '30 days'),
       to_char(min(al.created_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD'),
       to_char(max(al.created_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD'),
       to_char((now() - interval '30 days') at time zone 'Europe/Lisbon', 'YYYY-MM-DD'),
       to_char(now() at time zone 'Europe/Lisbon', 'YYYY-MM-DD')
from audit_log al
where al.entity_type = 'appointment'
order by 1;

\echo '--- H1. EVERY LOCATION, active and inactive: clinic hours, the midday closure, the slot size, and whether an address and a phone are on file'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when l.is_active then 'yes' else 'no' end as active,
       to_char(l.opens_at, 'HH24:MI') as opens_at,
       to_char(l.closes_at, 'HH24:MI') as closes_at,
       coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '(none)') as midday_closed_from,
       coalesce(to_char(l.midday_closed_to, 'HH24:MI'), '(none)') as midday_closed_to,
       l.slot_granularity_min,
       case when coalesce(btrim(l.address), '') = '' then 'no' else 'yes' end as address_present,
       case when coalesce(btrim(l.phone), '') = '' then 'no' else 'yes' end as phone_present
from locations l
join tenants t on t.id = l.tenant_id
order by 1, 2;

\echo '--- H2. STAFF PER ROLE (the role key, never the person): active users by how many staff_locations rows they hold (none means every location for an admin or a receptionist)'
with staff as (
  select u.role_id,
         u.is_active,
         u.is_bookable,
         (select count(*) from staff_locations sl where sl.user_id = u.id) as n_locations
  from users u
)
select case when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end as role,
       count(*) filter (where staff.is_active) as active_staff,
       count(*) filter (where staff.is_active and staff.n_locations = 0) as with_no_staff_locations_row,
       count(*) filter (where staff.is_active and staff.n_locations = 1) as with_1_location,
       count(*) filter (where staff.is_active and staff.n_locations = 2) as with_2_locations,
       count(*) filter (where staff.is_active and staff.n_locations >= 3) as with_3_or_more_locations,
       count(*) filter (where staff.is_active and staff.is_bookable) as of_active_bookable,
       count(*) filter (where not staff.is_active) as inactive_staff
from staff
left join roles r on r.id = staff.role_id
group by 1
order by 1;

\echo '--- H3a. PER LOCATION: staff_locations rows by role'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when l.is_active then 'yes' else 'no' end as active,
       case when sl.id is null then '(no staff_locations row)' when r.slug is null then '(no role)' when r.slug ~ '^[a-z][a-z0-9_-]*$' then r.slug else 'other (not printed)' end as role,
       count(sl.id) as staff_locations_rows,
       count(sl.id) filter (where u.is_active) as of_active_users
from locations l
join tenants t on t.id = l.tenant_id
left join staff_locations sl on sl.location_id = l.id
left join users u on u.id = sl.user_id
left join roles r on r.id = u.role_id
group by t.id, t.created_at, l.id, l.name, l.is_active, 4
order by 1, 2, 4;

\echo '--- H3b. PER LOCATION: availability_templates rows and the therapists who hold them'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when l.is_active then 'yes' else 'no' end as active,
       count(av.id) as template_rows,
       count(av.id) filter (where av.is_active) as active_template_rows,
       count(av.id) filter (where av.is_active and coalesce(av.valid_from, current_date) <= current_date and coalesce(av.valid_until, current_date) >= current_date) as active_and_valid_today,
       count(distinct av.user_id) filter (where av.is_active) as distinct_therapists_with_active_hours
from locations l
join tenants t on t.id = l.tenant_id
left join availability_templates av on av.location_id = l.id
group by t.id, t.created_at, l.id, l.name, l.is_active
order by 1, 2;

\echo '--- H3c. PER LOCATION: service_location_prices and service_pack_location_prices rows'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when l.is_active then 'yes' else 'no' end as active,
       count(distinct sp.id) as service_price_rows,
       count(distinct sp.id) filter (where sp.is_active) as active_service_price_rows,
       count(distinct pp.id) as pack_price_rows,
       count(distinct pp.id) filter (where pp.is_active) as active_pack_price_rows
from locations l
join tenants t on t.id = l.tenant_id
left join service_location_prices sp on sp.location_id = l.id
left join service_pack_location_prices pp on pp.location_id = l.id
group by t.id, t.created_at, l.id, l.name, l.is_active
order by 1, 2;

\echo '--- H3d. PER LOCATION: active bookable users with a staff_locations row or active hours there (DISTINCT users)'
with presence as (
  select sl.location_id, sl.user_id, true as by_membership, false as by_hours
  from staff_locations sl
  union all
  select av.location_id, av.user_id, false, true
  from availability_templates av
  where av.is_active
)
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when l.is_active then 'yes' else 'no' end as active,
       count(distinct u.id) filter (where u.is_active and u.is_bookable) as bookable_users_with_membership_or_hours,
       count(distinct u.id) filter (where u.is_active and u.is_bookable and presence.by_membership) as of_those_by_membership,
       count(distinct u.id) filter (where u.is_active and u.is_bookable and presence.by_hours) as of_those_by_active_hours,
       count(distinct u.id) as all_users_with_membership_or_hours
from locations l
join tenants t on t.id = l.tenant_id
left join presence on presence.location_id = l.id
left join users u on u.id = presence.user_id
group by t.id, t.created_at, l.id, l.name, l.is_active
order by 1, 2;

\echo '--- H4. PER LOCATION: appointments created in the last 30 days by origin, and at any time (the base for H3)'
select dense_rank() over (order by t.created_at, t.id) as tenant_n,
       l.name as location_name,
       case when l.is_active then 'yes' else 'no' end as active,
       count(a.id) filter (where a.origin = 'patient_portal' and a.created_at >= now() - interval '30 days') as online_requests_created_in_window,
       count(a.id) filter (where a.origin <> 'patient_portal' and a.created_at >= now() - interval '30 days') as staff_appointments_created_in_window,
       count(a.id) filter (where a.created_at >= now() - interval '30 days') as all_created_in_window,
       count(a.id) as all_at_any_time
from locations l
join tenants t on t.id = l.tenant_id
left join appointments a on a.location_id = l.id
group by t.id, t.created_at, l.id, l.name, l.is_active
order by 1, 2;

\echo 'BOOK-CONFIRM MEASUREMENT PRINTED. Nothing was written; the block rolls the transaction back.'

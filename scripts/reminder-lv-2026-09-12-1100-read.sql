-- ===========================================================================
-- INC-lv-sms-reminder-not-received-20260912. PRODUCTION READ. READ ONLY.
-- ===========================================================================
-- D1: reception reports that neither patient booked at Linda-a-Velha on
-- 2026-09-12 at 11:00 received the SMS reminder. This prints, for every
-- appointment starting at that instant, what the database knows about its
-- origin, whether a reminder could have been scheduled, every reminder ledger
-- row, and the patient's stored phone byte for byte.
-- D2: counts live patients whose stored phone is not E.164, by clinic and by
-- whether they hold a future appointment. Counts only.
--
-- SELECTs only, inside ONE read-only transaction that is rolled back at the end.
-- Emits nothing, writes nothing, can be interrupted anywhere.
--
-- RUN BY REF (SR-61). Nothing that is checked out is used:
--   git -C ~/osteojp fetch -q origin
--   git -C ~/osteojp show origin/main:scripts/reminder-lv-2026-09-12-1100-read.sql > /tmp/reminder-lv-read.sql
--   shasum -a 256 /tmp/reminder-lv-read.sql
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -v tenant_slug=osteojp -P pager=off -f /tmp/reminder-lv-read.sql
--
-- THE OUTPUT CARRIES PERSONAL DATA. Section D1-E prints each patient's stored
-- phone, because the question is about the stored bytes. No patient name is
-- printed anywhere. This FILE names no patient and no number: the appointments
-- are found by their slot, not by who they are.
--
-- WHAT THE DATABASE CANNOT SAY. A reminder is event-scheduled: a booking door
-- sends `appointment/scheduled` to Inngest after commit, and Inngest sleeps until
-- the send instant (apps/web/lib/reminders/inngest/functions.ts). No table records
-- that event. D1-B therefore prints the facts that decide whether one was sent
-- (the door, the booking time against the send instants), and the Inngest
-- dashboard is the only direct record: Events, `appointment/scheduled`, search the
-- appointment id from D1-A.
--
-- DATES THAT DECIDE WHAT A MISSING ROW MEANS
--   2026-09-10 19:58:24Z  the reminder ledger starts being written (#1256). A send
--                         due before this leaves no row, so no 48h email row for
--                         a 2026-09-12 booking is NOT evidence of anything.
--                         The 24h SMS for 11:00 Lisbon was due 2026-09-11 10:00Z,
--                         after it: an SMS run that reached dispatch left a row.
--   2026-09-10 22:45:15Z  Agendar lote starts emitting the event (OBS-05). A batch
--                         row created before it never had a reminder scheduled.
--   the Fisiozero importer never emits the event, writes no audit row and no
--                         created_by (scripts/reminder-outside-app-read-2026-09-13.sql).
--
-- SECTIONS
--   D1-A  the appointments at the slot
--   D1-B  provenance and whether a reminder could have been scheduled
--   D1-C  every reminder ledger row (reminder_dispatches), plus a zero line
--   D1-D  the 24h SMS's confirm code, and any patient reply matched to it
--   D1-E  the patient: stored phone byte for byte, preferences, tenant switches
--   D2-A  phone class by patient clinic and future appointment
--   D2-B  phone class by the clinic of the patient's next appointment
--   D2-C  totals
-- ===========================================================================

\set ON_ERROR_STOP on
\set slot '2026-09-12 11:00'
begin transaction read only;

\echo
\echo '=== D1-A  every appointment starting 2026-09-12 11:00 Europe/Lisbon, any clinic'
with k as (select t.id as tenant_id from tenants t where t.slug = :'tenant_slug')
select a.id as appointment_id,
       l.name as clinic,
       pr.full_name as terapeuta,
       a.practitioner_id,
       (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int as minutes,
       a.status::text as status,
       a.confirmation_state::text as confirmation_state,
       a.origin,
       to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z' as created_at_utc,
       coalesce(a.created_by::text, '(null)') as created_by,
       coalesce(cb.full_name, '-') as created_by_name,
       coalesce(a.batch_id::text, '(null)') as batch_id,
       coalesce(a.booking_group_id::text, '(null)') as booking_group_id,
       coalesce(a.recurrence_parent_id::text, '(null)') as recurrence_parent_id,
       a.patient_id,
       coalesce(a.practitioner_2_id::text, '(null)') as practitioner_2_id
  from appointments a
  join k on k.tenant_id = a.tenant_id
  left join locations l on l.id = a.location_id
  left join users pr on pr.id = a.practitioner_id
  left join users cb on cb.id = a.created_by
 where a.starts_at = (timestamp :'slot') at time zone 'Europe/Lisbon'
 order by l.name, pr.full_name, a.id;

\echo
\echo '=== D1-B  provenance, and whether a reminder could have been scheduled'
with k as (select t.id as tenant_id from tenants t where t.slug = :'tenant_slug'),
tgt as (
  select a.* from appointments a join k on k.tenant_id = a.tenant_id
   where a.starts_at = (timestamp :'slot') at time zone 'Europe/Lisbon'
),
stg as (
  select m.imported_entity_id as id,
         string_agg(distinct m.source_system, ',') as source_system,
         string_agg(distinct m.status::text, ',') as ledger_status,
         string_agg(distinct m.batch_id::text, ',') as ledger_batch_id,
         min(m.created_at) as staged_at
    from migration_staging_rows m
    join k on k.tenant_id = m.tenant_id
   where m.entity_type = 'appointment'
     and m.imported_entity_id in (select id from tgt)
   group by m.imported_entity_id
),
stg_pat as (
  select distinct m.imported_entity_id as id
    from migration_staging_rows m
    join k on k.tenant_id = m.tenant_id
   where m.entity_type = 'patient'
     and m.imported_entity_id in (select patient_id from tgt)
),
aud as (
  select l.entity_id as id,
         count(*) as audit_rows,
         min(l.created_at) filter (where l.action = 'appointment.create') as create_at,
         max(l.created_at) filter (where l.action = 'appointment.reschedule') as reschedule_at,
         string_agg(distinct l.action, ', ') as actions
    from audit_log l
    join k on k.tenant_id = l.tenant_id
   where l.entity_type = 'appointment'
     and l.entity_id in (select id from tgt)
   group by l.entity_id
),
x as (
  select t.id, t.starts_at, t.created_at, t.batch_id, t.origin,
         (s.id is not null) as appt_imported,
         (sp.id is not null) as patient_imported,
         s.source_system, s.ledger_status, s.ledger_batch_id, s.staged_at,
         coalesce(au.audit_rows, 0) as audit_rows,
         au.create_at, au.reschedule_at, au.actions,
         greatest(t.created_at, coalesce(au.reschedule_at, t.created_at)) as last_emit_point,
         t.starts_at - interval '48 hours' as email_48h_due,
         t.starts_at - interval '24 hours' as sms_24h_due
    from tgt t
    left join stg s on s.id = t.id
    left join stg_pat sp on sp.id = t.patient_id
    left join aud au on au.id = t.id
)
select x.id as appointment_id,
       case when x.appt_imported then 'yes' else 'no' end as appointment_in_import_ledger,
       coalesce(x.source_system || ' / ' || x.ledger_status, '-') as ledger_source_and_status,
       coalesce(x.ledger_batch_id, '-') as ledger_batch_id,
       coalesce(to_char(x.staged_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || 'Z', '-') as staged_at_utc,
       case when x.patient_imported then 'yes' else 'no' end as patient_in_import_ledger,
       x.audit_rows,
       coalesce(x.actions, '-') as audit_actions,
       coalesce(to_char(x.create_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z', '-') as create_audit_at_utc,
       coalesce(to_char(x.reschedule_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z', '-') as last_reschedule_at_utc,
       to_char(x.sms_24h_due at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || 'Z' as sms_24h_due_utc,
       case when x.last_emit_point < x.sms_24h_due then 'yes' else 'NO: booked or moved after the 24h send instant, so no SMS leg is scheduled' end
         as sms_leg_schedulable_by_time,
       case
         when x.appt_imported
           then 'NO EVENT: imported by the Fisiozero importer, which emits none'
         when x.batch_id is not null and x.created_at < timestamptz '2026-09-10 22:45:15+00'
           then 'NO EVENT: Agendar lote before the OBS-05 fix (2026-09-10 22:45Z)'
         when x.create_at is not null
           then 'EVENT SENT BY THE DOOR: an app booking with an appointment.create audit row (best effort; check Inngest)'
         else 'UNKNOWN DOOR: not imported, no appointment.create audit row'
       end as reminder_event_verdict
  from x
 order by x.id;

\echo
\echo '=== D1-C  every reminder ledger row for these appointments (no row = no dispatch attempt recorded)'
with k as (select t.id as tenant_id from tenants t where t.slug = :'tenant_slug'),
tgt as (
  select a.* from appointments a join k on k.tenant_id = a.tenant_id
   where a.starts_at = (timestamp :'slot') at time zone 'Europe/Lisbon'
)
select t.id as appointment_id,
       coalesce(to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z', '(no ledger row)') as attempted_at_utc,
       coalesce(d.channel, '-') as channel,
       coalesce(d.template_id, '-') as template_id,
       coalesce(d.outcome, '-') as outcome,
       coalesce(d.suppression_reason, '-') as suppression_reason,
       coalesce(d.provider_message_id, '-') as provider_message_id,
       coalesce(d.provider_status, '-') as provider_status,
       coalesce(d.provider_error_code, '-') as provider_error_code,
       coalesce(to_char(d.status_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z', '-') as status_at_utc,
       coalesce(d.body_length::text, '-') as body_length
  from tgt t
  left join reminder_dispatches d on d.tenant_id = t.tenant_id and d.appointment_id = t.id
 order by t.id, d.created_at nulls first;

\echo
\echo '=== D1-D  the 24h SMS confirm code (minted only when the SMS render ran), and patient replies matched to the appointment'
with k as (select t.id as tenant_id from tenants t where t.slug = :'tenant_slug'),
tgt as (
  select a.* from appointments a join k on k.tenant_id = a.tenant_id
   where a.starts_at = (timestamp :'slot') at time zone 'Europe/Lisbon'
)
select t.id as appointment_id,
       'confirm code' as kind,
       coalesce(to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z', '(none)') as at_utc,
       case when c.code_hash is null then '-' when c.consumed_at is null then 'live' else 'consumed' end as state,
       '-' as classification
  from tgt t
  left join appointment_confirm_codes c on c.tenant_id = t.tenant_id and c.appointment_id = t.id
union all
select t.id,
       'patient reply (sms_inbound_events)',
       coalesce(to_char(e.received_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || 'Z', '(none)'),
       coalesce(e.resolution, case when e.id is null then '-' else 'in queue' end),
       coalesce(e.classification, '-')
  from tgt t
  left join sms_inbound_events e on e.tenant_id = t.tenant_id and e.appointment_id = t.id
 order by 1, 2, 3;

\echo
\echo '=== D1-E  the patient on each appointment: stored phone BYTE FOR BYTE (personal data), preferences, tenant switches'
with k as (select t.id as tenant_id from tenants t where t.slug = :'tenant_slug'),
tgt as (
  select a.* from appointments a join k on k.tenant_id = a.tenant_id
   where a.starts_at = (timestamp :'slot') at time zone 'Europe/Lisbon'
)
select t.id as appointment_id,
       p.id as patient_id,
       coalesce('[' || p.phone || ']', '(null)') as phone_stored_in_brackets,
       coalesce(length(p.phone)::text, '-') as chars,
       coalesce(octet_length(p.phone)::text, '-') as bytes,
       coalesce(encode(convert_to(p.phone, 'UTF8'), 'hex'), '-') as phone_hex,
       coalesce(p.phone_e164, '(null: does not normalise)') as phone_e164_derived,
       case when p.phone ~ '^\+351[29][0-9]{8}$' then 'yes' else 'no' end as stored_is_e164_pt,
       case
         when p.phone_e164 is null then 'no (invalid_phone skip)'
         when p.phone_e164 ~ '^\+3512' then 'no (landline skip)'
         else 'yes'
       end as sms_capable,
       p.reminder_sms_enabled,
       p.reminder_email_enabled,
       (p.email is not null) as has_email,
       coalesce(to_char(p.deleted_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || 'Z', '-') as deleted_at_utc,
       coalesce(tn.settings #>> '{reminders,smsEnabled}', '(absent, so true)') as tenant_sms_enabled,
       coalesce(tn.settings #>> '{reminders,emailEnabled}', '(absent, so true)') as tenant_email_enabled,
       coalesce(tn.settings #>> '{reminders,leadTimeHours}', '(absent, so [48,24])') as tenant_lead_time_hours
  from tgt t
  join patients p on p.id = t.patient_id and p.tenant_id = t.tenant_id
  join tenants tn on tn.id = t.tenant_id
 order by t.id;

\echo
\echo '=== D2-A  live patients by stored phone class, patient clinic and future appointment (counts only)'
with k as (select t.id as tenant_id, now() as t0 from tenants t where t.slug = :'tenant_slug'),
pat as (
  select p.id, p.primary_location_id,
         case
           when p.phone is null or btrim(p.phone) = '' then '0 no phone'
           when p.phone ~ '^\+351[29][0-9]{8}$' then '1 E.164 PT as stored'
           when p.phone_e164 is not null then '2 not E.164, normalises to PT (SMS still sends)'
           when p.phone ~ '^\+[1-9][0-9]{6,14}$' then '3 E.164 outside PT (SMS skipped: invalid_phone)'
           else '4 does not normalise (SMS skipped: invalid_phone)'
         end as phone_class,
         (p.phone_e164 ~ '^\+3512') as landline
    from patients p
    join k on k.tenant_id = p.tenant_id
   where p.deleted_at is null
),
fut as (
  select a.patient_id, count(*) as n
    from appointments a
    join k on k.tenant_id = a.tenant_id
   where a.starts_at > k.t0
     and a.status::text in ('scheduled', 'confirmed')
   group by a.patient_id
)
select pat.phone_class,
       coalesce(l.name, '(no primary clinic)') as patient_clinic,
       case when fut.n is null then 'no' else 'yes' end as has_future_appointment,
       count(*) as patients,
       coalesce(sum(fut.n), 0) as future_appointments,
       count(*) filter (where pat.landline) as of_which_landline
  from pat
  left join fut on fut.patient_id = pat.id
  left join locations l on l.id = pat.primary_location_id
 group by pat.phone_class, coalesce(l.name, '(no primary clinic)'), case when fut.n is null then 'no' else 'yes' end
 order by 1, 2, 3;

\echo
\echo '=== D2-B  patients WITH a future appointment, by stored phone class and the clinic of their NEXT appointment'
with k as (select t.id as tenant_id, now() as t0 from tenants t where t.slug = :'tenant_slug'),
pat as (
  select p.id, p.reminder_sms_enabled,
         case
           when p.phone is null or btrim(p.phone) = '' then '0 no phone'
           when p.phone ~ '^\+351[29][0-9]{8}$' then '1 E.164 PT as stored'
           when p.phone_e164 is not null then '2 not E.164, normalises to PT (SMS still sends)'
           when p.phone ~ '^\+[1-9][0-9]{6,14}$' then '3 E.164 outside PT (SMS skipped: invalid_phone)'
           else '4 does not normalise (SMS skipped: invalid_phone)'
         end as phone_class
    from patients p
    join k on k.tenant_id = p.tenant_id
   where p.deleted_at is null
),
nxt as (
  select distinct on (a.patient_id) a.patient_id, a.location_id
    from appointments a
    join k on k.tenant_id = a.tenant_id
   where a.starts_at > k.t0
     and a.status::text in ('scheduled', 'confirmed')
   order by a.patient_id, a.starts_at, a.id
),
fut as (
  select a.patient_id, count(*) as n
    from appointments a
    join k on k.tenant_id = a.tenant_id
   where a.starts_at > k.t0
     and a.status::text in ('scheduled', 'confirmed')
   group by a.patient_id
)
select pat.phone_class,
       coalesce(l.name, '(no location row)') as next_appointment_clinic,
       count(*) as patients,
       sum(fut.n) as future_appointments,
       count(*) filter (where pat.reminder_sms_enabled) as sms_preference_on
  from nxt
  join pat on pat.id = nxt.patient_id
  join fut on fut.patient_id = nxt.patient_id
  left join locations l on l.id = nxt.location_id
 group by pat.phone_class, coalesce(l.name, '(no location row)')
 order by 1, 2;

\echo
\echo '=== D2-C  totals over live patients'
with k as (select t.id as tenant_id, now() as t0 from tenants t where t.slug = :'tenant_slug'),
pat as (
  select p.id, p.phone, p.phone_e164
    from patients p
    join k on k.tenant_id = p.tenant_id
   where p.deleted_at is null
),
fut as (
  select distinct a.patient_id
    from appointments a
    join k on k.tenant_id = a.tenant_id
   where a.starts_at > k.t0
     and a.status::text in ('scheduled', 'confirmed')
)
select key, n from (
            select 1 as ord, 'tenant slug matched (must be 1)' as key, (select count(*) from k)::bigint as n
  union all select 2, 'live patients', count(*) from pat
  union all select 3, 'with a phone', count(*) filter (where btrim(coalesce(phone, '')) <> '') from pat
  union all select 4, 'phone NOT stored as E.164 PT (classes 2, 3, 4)', count(*) filter (where btrim(coalesce(phone, '')) <> '' and phone !~ '^\+351[29][0-9]{8}$') from pat
  union all select 5, '  of which a future appointment', count(*) filter (where btrim(coalesce(phone, '')) <> '' and phone !~ '^\+351[29][0-9]{8}$' and id in (select patient_id from fut)) from pat
  union all select 6, 'phone that cannot receive an SMS (classes 3, 4, or a landline)', count(*) filter (where btrim(coalesce(phone, '')) <> '' and (phone_e164 is null or phone_e164 ~ '^\+3512')) from pat
  union all select 7, '  of which a future appointment', count(*) filter (where btrim(coalesce(phone, '')) <> '' and (phone_e164 is null or phone_e164 ~ '^\+3512') and id in (select patient_id from fut)) from pat
) r
order by ord;

rollback;

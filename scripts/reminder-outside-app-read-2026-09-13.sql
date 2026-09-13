-- ===========================================================================
-- OBS-07 - WHAT IS THE outside_app CLASS? PRODUCTION READ. READ ONLY.
-- ===========================================================================
-- SELECTs only: ONE statement inside a READ ONLY transaction that is rolled
-- back at the end. Emits nothing, writes nothing, can be interrupted anywhere.
--
-- WHO RAN IT: lane PURPLE, read-only against production, 2026-09-13 (dispatch P-A).
-- To re-run it, from the repo root:
--   psql "${DATABASE_URL_DIRECT}" -v ON_ERROR_STOP=1 -v tenant_slug=osteojp -P pager=off -f scripts/reminder-outside-app-read-2026-09-13.sql
--
-- PRINTS COUNTS ONLY. No patient id, name, phone or email; no staff name.
-- Every output row is (section, key, n).
--
-- THE SET IT DIAGNOSES is exactly what packages/db/scripts/obs-05-backfill-emit.mjs
-- selects for --classes outside_app: the classification below is a byte-for-byte
-- copy (scripts/obs-05-backfill-emit.test.mjs holds every copy equal), then
-- exposed, no reminder ledger row, starting more than 24 hours out. It is
-- evaluated at now(), so it can only be SMALLER than the 483 of the 2026-09-12
-- dry run: rows that have come inside 24 hours since then drop out.
--
-- WHY outside_app IS NOT EVIDENCE OF A BROKEN EMIT PATH BY ITSELF. The class is
-- "a staff-origin row with no appointment.create audit row", a negative test.
-- The Fisiozero importer (packages/db/src/migration/upsert.ts, importAppointment
-- and insertChunk) writes NO audit row, NO created_by, NO batch_id, and leaves
-- origin at its 'staff' default, so EVERY imported appointment lands in this
-- class by construction. The importer's own ledger is migration_staging_rows:
-- entity_type 'appointment' with imported_entity_id = the appointment id. Both
-- clinics share ONE source_system ('fisiozero') and ONE batch id
-- (docs/import/PROD-RUN.md section 4.1), so the clinic is read from the
-- appointment's location, never from the batch.
--
-- SECTIONS
--   0  the set: size, patients, practitioners, origin, status
--   A  provenance: is the APPOINTMENT in the import ledger; is its PATIENT
--   B  would it send: patient preference, contact present, tenant switches
--   C  when: created_at by day (UTC), ledger day, starts by month and hour (Lisbon)
--   D  audit: any audit_log row naming the appointment, by action
--   E  twins: another live appointment of the same patient at an overlapping time,
--      and whether that twin was booked in the app or is itself imported
--   F  concentration: how the rows spread across patients
--   G  every patient holding 10 or more rows, ranked by row count and never
--      identified: series shape, which contact fields exist, clinical history
-- ===========================================================================

\set ON_ERROR_STOP on
begin transaction read only;

-- >>> DIAGNOSIS REPORT
with k as (
  select t.id as tenant_id, now() as t0 from tenants t where t.slug = :'tenant_slug'
),
-- >>> EXPOSURE CLASSIFICATION
fix as (
  select timestamptz '2026-08-31 22:59:10+00' as portal_fix,
         timestamptz '2026-09-10 22:45:15+00' as batch_fix,
         timestamptz '2026-09-11 12:32:05+00' as doors_fix,
         timestamptz '2026-09-10 19:58:24+00' as ledger_live
),
fut as (
  select a.id, a.tenant_id, a.starts_at, a.status::text as status, a.origin,
         a.batch_id, a.created_at,
         (p.email is not null and p.reminder_email_enabled) as email_ok,
         (p.phone is not null and p.reminder_sms_enabled) as sms_ok
    from appointments a
    join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
    join k on k.tenant_id = a.tenant_id
   where a.starts_at > k.t0
     and a.status::text in ('scheduled', 'confirmed')
     and p.deleted_at is null
),
ev as (
  select f.id,
         coalesce(bool_or(l.action = 'appointment.create'), false) as has_create,
         max(l.created_at) filter (where l.action = 'appointment.reschedule') as reschedule_at,
         min(l.created_at) filter (where l.action = 'appointment.update'
                                     and l.metadata ->> 'via' = 'portal_request_confirm') as aceitar_at,
         min(l.created_at) filter (where l.action = 'appointment.update'
                                     and l.metadata ->> 'toStatus' = 'confirmed'
                                     and l.metadata ->> 'via' is null) as estado_at,
         min(l.created_at) filter (where l.action = 'appointment.sms_reply_reviewed'
                                     and l.metadata ->> 'resolution' = 'confirmed'
                                     and l.metadata ->> 'applied' = 'true') as queue_at,
         min(l.created_at) filter (where l.action = 'appointment.patient_sms_reply'
                                     and l.metadata ->> 'outcome' = 'confirmed') as reply_at
    from fut f
    left join audit_log l
      on l.tenant_id = f.tenant_id and l.entity_type = 'appointment' and l.entity_id = f.id
   group by f.id
),
led as (
  select f.id,
         coalesce(bool_or(d.template_id like 'reminder.%'), false) as any_reminder_row,
         coalesce(bool_or(d.template_id = 'reminder.48h.email'), false) as has_48h,
         coalesce(bool_or(d.template_id = 'reminder.24h.sms'), false) as has_24h
    from fut f
    left join reminder_dispatches d on d.tenant_id = f.tenant_id and d.appointment_id = f.id
   group by f.id
),
cls0 as (
  select f.*, e.has_create, e.reschedule_at,
         least(e.aceitar_at, e.estado_at, e.queue_at, e.reply_at) as conf_at,
         case least(e.aceitar_at, e.estado_at, e.queue_at, e.reply_at)
           when e.aceitar_at then 'aceitar'
           when e.estado_at then 'estado'
           when e.queue_at then 'sms_queue'
           when e.reply_at then 'sms_reply'
         end as conf_via,
         g.any_reminder_row, g.has_48h, g.has_24h
    from fut f
    join ev e on e.id = f.id
    join led g on g.id = f.id
),
cls as (
  select c.*,
         case
           when c.origin = 'patient_portal' and c.status = 'scheduled' then 'portal_awaiting_acceptance'
           when c.origin = 'patient_portal' and c.conf_at is null then 'portal_confirmed_unknown_path'
           when c.origin = 'patient_portal' and c.conf_at < x.portal_fix then 'portal_confirmed_before_fix'
           when c.origin = 'patient_portal' and c.conf_via = 'aceitar' then 'portal_accepted'
           when c.origin = 'patient_portal' and c.conf_at >= x.doors_fix then 'portal_door_after_fix'
           when c.origin = 'patient_portal' then c.conf_via
           when c.batch_id is not null and c.created_at < x.batch_fix then 'batch'
           when c.batch_id is not null then 'batch_after_fix'
           when not c.has_create then 'outside_app'
           else 'staff_drawer'
         end as path,
         (c.reschedule_at is not null
          and c.reschedule_at > case when c.origin = 'patient_portal' then c.conf_at
                                     else c.created_at end) as rescheduled_since,
         (c.starts_at - interval '48 hours' > x.ledger_live
          and c.starts_at - interval '48 hours' < k.t0 and c.email_ok) as due_48h,
         (c.starts_at - interval '24 hours' > x.ledger_live
          and c.starts_at - interval '24 hours' < k.t0 and c.sms_ok) as due_24h
    from cls0 c
    cross join fix x
    cross join k
),
exposure as (
  select s.*,
         (s.path in ('batch', 'estado', 'sms_queue', 'sms_reply',
                     'portal_confirmed_before_fix', 'outside_app')
          and not coalesce(s.rescheduled_since, false)) as exposed,
         ((s.due_48h and not s.has_48h) or (s.due_24h and not s.has_24h)) as due_without_ledger
    from cls s
)
-- <<< EXPOSURE CLASSIFICATION
, tgt as (
  select a.id, a.patient_id, a.location_id, a.practitioner_id, a.starts_at, a.ends_at,
         a.created_at, a.status::text as status, a.origin, (a.created_by is null) as creator_null
    from exposure e
    join appointments a on a.id = e.id
   where e.exposed
     and not e.any_reminder_row
     and e.starts_at > (select t0 from k) + interval '24 hours'
     and e.path = 'outside_app'
)
, stg_appt as (
  select m.imported_entity_id as id,
         min(m.source_system) as source_system,
         min(m.batch_id::text) as batch_id,
         min(m.status::text) as ledger_status,
         min(m.created_at) as staged_at
    from migration_staging_rows m
   where m.tenant_id = (select tenant_id from k)
     and m.entity_type = 'appointment'
     and m.imported_entity_id in (select id from tgt)
   group by m.imported_entity_id
)
, stg_pat as (
  select m.imported_entity_id as id
    from migration_staging_rows m
   where m.tenant_id = (select tenant_id from k)
     and m.entity_type = 'patient'
     and m.imported_entity_id in (select patient_id from tgt)
   group by m.imported_entity_id
)
, aud as (
  select l.entity_id as id, l.entity_type, l.action
    from audit_log l
   where l.tenant_id = (select tenant_id from k)
     and l.entity_id in (select id from tgt)
)
, pat as (
  select p.id,
         p.reminder_email_enabled as pref_email,
         p.reminder_sms_enabled as pref_sms,
         (p.email is not null) as has_email,
         (p.phone is not null) as has_phone,
         (p.phone_e164 is not null) as has_e164
    from patients p
   where p.id in (select patient_id from tgt)
)
, twin as (
  select t.id,
         bool_or(exists (select 1 from audit_log l
                          where l.tenant_id = b.tenant_id
                            and l.entity_type = 'appointment'
                            and l.entity_id = b.id
                            and l.action = 'appointment.create')) as twin_in_app,
         bool_or(exists (select 1 from migration_staging_rows ms
                          where ms.tenant_id = b.tenant_id
                            and ms.entity_type = 'appointment'
                            and ms.imported_entity_id = b.id)) as twin_imported,
         bool_or(b.starts_at = t.starts_at and b.practitioner_id = t.practitioner_id) as twin_same_start
    from tgt t
    join appointments b
      on b.tenant_id = (select tenant_id from k)
     and (b.patient_id = t.patient_id or b.patient_2_id = t.patient_id)
     and b.id <> t.id
     and b.status::text in ('scheduled', 'confirmed')
     and b.starts_at < t.ends_at
     and b.ends_at > t.starts_at
   group by t.id
)
, lbl as (
  select t.*,
         (sa.id is not null) as appt_imported,
         (sp.id is not null) as patient_imported,
         coalesce(l.name, '(no location row)') as clinic,
         case
           when t.practitioner_id::text = '54d486e0-a9c3-4c82-acac-8b909ce5a2d0' then 'JP(cb) 54d486e0'
           when t.practitioner_id::text = '0c1a0000-0000-4000-8000-000000000001' then 'JP(lv) 0c1a..0001'
           when t.practitioner_id::text like '0c1a0000-%' then 'another import-era 0c1a row'
           else 'another staff row'
         end as practitioner,
         (select count(*) from aud x where x.id = t.id) as audit_rows,
         (tw.id is not null) as has_twin,
         coalesce(tw.twin_in_app, false) as twin_in_app,
         coalesce(tw.twin_imported, false) as twin_imported,
         coalesce(tw.twin_same_start, false) as twin_same_start,
         p.pref_email, p.pref_sms, p.has_email, p.has_phone, p.has_e164,
         sa.staged_at, sa.ledger_status, sa.source_system as appt_source, sa.batch_id as appt_batch
    from tgt t
    left join stg_appt sa on sa.id = t.id
    left join stg_pat sp on sp.id = t.patient_id
    left join locations l on l.id = t.location_id
    left join twin tw on tw.id = t.id
    left join pat p on p.id = t.patient_id
)
select section, key, n from (
            select '0 set' as section, 'tenant slug matched (must be 1)' as key, (select count(*) from k)::bigint as n
  union all select '0 set', 'ROWS: the backfill''s outside_app selection at now()', count(*) from lbl
  union all select '0 set', 'distinct patients', count(distinct patient_id) from lbl
  union all select '0 set', 'most rows held by one patient', coalesce(max(c), 0) from (select count(*) as c from lbl group by patient_id) z
  union all select '0 set', 'patients holding 10 or more rows', count(*) from (select 1 from lbl group by patient_id having count(*) >= 10) z
  union all select '0 set', 'practitioner: ' || practitioner, count(*) from lbl group by practitioner
  union all select '0 set', 'origin ' || origin || ', created_by ' || case when creator_null then 'NULL' else 'set' end, count(*) from lbl group by origin, creator_null
  union all select '0 set', 'status ' || status, count(*) from lbl group by status

  union all select 'A provenance', 'appointment row IS in the import ledger', count(*) filter (where appt_imported) from lbl
  union all select 'A provenance', 'appointment row is NOT in the import ledger', count(*) filter (where not appt_imported) from lbl
  union all select 'A provenance', 'patient IS in the import ledger', count(*) filter (where patient_imported) from lbl
  union all select 'A provenance', 'patient is NOT in the import ledger', count(*) filter (where not patient_imported) from lbl
  union all select 'A provenance', 'appointment AND patient both imported', count(*) filter (where appt_imported and patient_imported) from lbl
  union all select 'A provenance', 'NEITHER imported (hand SQL or an unknown path)', count(*) filter (where not appt_imported and not patient_imported) from lbl
  union all select 'A provenance', 'imported appointments: source_system ' || appt_source || ', ledger status ' || ledger_status, count(*) from lbl where appt_imported group by appt_source, ledger_status
  union all select 'A provenance', 'imported appointments: distinct ledger batch ids (both clinics share one)', count(distinct appt_batch) from lbl where appt_imported
  union all select 'A by clinic', clinic || ': appointment imported ' || case when appt_imported then 'yes' else 'NO' end, count(*) from lbl group by clinic, appt_imported

  union all select 'B would send', 'patient reminder_email_enabled true', count(*) filter (where pref_email) from lbl
  union all select 'B would send', 'patient reminder_sms_enabled true', count(*) filter (where pref_sms) from lbl
  union all select 'B would send', 'EITHER preference true', count(*) filter (where pref_email or pref_sms) from lbl
  union all select 'B would send', 'email routable: preference AND an address', count(*) filter (where pref_email and has_email) from lbl
  union all select 'B would send', 'sms routable: preference AND a phone', count(*) filter (where pref_sms and has_phone) from lbl
  union all select 'B would send', 'sms preference AND a valid PT E.164 phone', count(*) filter (where pref_sms and has_e164) from lbl
  union all select 'B would send', 'AT LEAST ONE channel routable for the patient', count(*) filter (where (pref_email and has_email) or (pref_sms and has_phone)) from lbl
  union all select 'B would send', 'distinct patients with at least one routable channel', count(distinct patient_id) filter (where (pref_email and has_email) or (pref_sms and has_phone)) from lbl
  union all select 'B would send', 'starts more than 48h out (both legs would schedule)', count(*) filter (where starts_at > (select t0 from k) + interval '48 hours') from lbl
  union all select 'B tenant switch', 'settings.reminders.emailEnabled = ' || coalesce(t.settings #>> '{reminders,emailEnabled}', '(absent, so true)'), null::bigint from tenants t join k on k.tenant_id = t.id
  union all select 'B tenant switch', 'settings.reminders.smsEnabled = ' || coalesce(t.settings #>> '{reminders,smsEnabled}', '(absent, so true)'), null::bigint from tenants t join k on k.tenant_id = t.id
  union all select 'B tenant switch', 'settings.reminders.leadTimeHours = ' || coalesce(t.settings #>> '{reminders,leadTimeHours}', '(absent, so [48,24])'), null::bigint from tenants t join k on k.tenant_id = t.id

  union all select 'C created_at day (UTC)', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD'), count(*) from lbl group by to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')
  union all select 'C ledger staged day (UTC)', to_char(staged_at at time zone 'UTC', 'YYYY-MM-DD'), count(*) from lbl where appt_imported group by to_char(staged_at at time zone 'UTC', 'YYYY-MM-DD')
  union all select 'C starts month (Lisbon)', to_char(starts_at at time zone 'Europe/Lisbon', 'YYYY-MM'), count(*) from lbl group by to_char(starts_at at time zone 'Europe/Lisbon', 'YYYY-MM')
  union all select 'C starts hour (Lisbon)', to_char(starts_at at time zone 'Europe/Lisbon', 'HH24') || 'h', count(*) from lbl group by to_char(starts_at at time zone 'Europe/Lisbon', 'HH24')
  union all select 'C starts not on the hour', 'minute is not 00', count(*) filter (where extract(minute from starts_at at time zone 'Europe/Lisbon') <> 0) from lbl
  union all select 'C last start (Lisbon date)', coalesce(to_char(max(starts_at at time zone 'Europe/Lisbon'), 'YYYY-MM-DD'), '-'), null::bigint from lbl

  union all select 'D audit', 'rows with ANY audit_log row naming the appointment', count(*) filter (where audit_rows > 0) from lbl
  union all select 'D audit', 'rows with NO audit_log row at all', count(*) filter (where audit_rows = 0) from lbl
  union all select 'D audit', 'action ' || x.action || ' on ' || x.entity_type || ' (distinct rows)', count(distinct x.id) from aud x group by x.action, x.entity_type

  union all select 'E twins', 'another live appointment of the same patient overlaps it', count(*) filter (where has_twin) from lbl
  union all select 'E twins', 'and that other appointment was created in the app', count(*) filter (where twin_in_app) from lbl
  union all select 'E twins', 'and that other appointment is itself in the import ledger', count(*) filter (where twin_imported) from lbl
  union all select 'E twins', 'twin at the SAME start with the same practitioner', count(*) filter (where twin_same_start) from lbl
  union all select 'B would send', 'routable for at least one channel AND no overlapping twin', count(*) filter (where ((pref_email and has_email) or (pref_sms and has_phone)) and not has_twin) from lbl

  union all select 'F concentration', 'patients holding ' || bucket || ' rows', count(*)
              from (select patient_id,
                           case when count(*) = 1 then '1' when count(*) < 10 then '2-9' when count(*) < 50 then '10-49' else '50+' end as bucket
                      from lbl group by patient_id) z
             group by bucket
  union all select 'F concentration', 'rows held by patients holding ' || bucket || ' rows', sum(c)::bigint
              from (select patient_id, count(*) as c,
                           case when count(*) = 1 then '1' when count(*) < 10 then '2-9' when count(*) < 50 then '10-49' else '50+' end as bucket
                      from lbl group by patient_id) z
             group by bucket

  union all select 'G heavy patient #' || hp.rk, m.metric, m.v
              from (select row_number() over (order by count(*) desc, patient_id) as rk, patient_id, count(*) as c
                      from lbl group by patient_id having count(*) >= 10) hp
             cross join lateral (values
               ('a rows in the set', hp.c::bigint),
               ('b distinct weekday+time slots', (select count(distinct to_char(x.starts_at at time zone 'Europe/Lisbon', 'D HH24:MI')) from lbl x where x.patient_id = hp.patient_id)::bigint),
               ('c distinct start dates', (select count(distinct (x.starts_at at time zone 'Europe/Lisbon')::date) from lbl x where x.patient_id = hp.patient_id)::bigint),
               ('d distinct practitioners', (select count(distinct x.practitioner_id) from lbl x where x.patient_id = hp.patient_id)::bigint),
               ('e distinct clinics', (select count(distinct x.location_id) from lbl x where x.patient_id = hp.patient_id)::bigint),
               ('f rows with no service', (select count(*) from appointments a where a.id in (select x.id from lbl x where x.patient_id = hp.patient_id) and a.service_id is null)::bigint),
               ('g patient has a phone (1/0)', (select (p.phone is not null)::int from patients p where p.id = hp.patient_id)::bigint),
               ('h patient has an email (1/0)', (select (p.email is not null)::int from patients p where p.id = hp.patient_id)::bigint),
               ('i patient has a NIF (1/0)', (select (p.nif is not null)::int from patients p where p.id = hp.patient_id)::bigint),
               ('j patient has a date of birth (1/0)', (select (p.date_of_birth is not null)::int from patients p where p.id = hp.patient_id)::bigint),
               ('k patient clinical records, all time', (select count(*) from clinical_records r where r.patient_id = hp.patient_id)::bigint),
               ('l patient appointments completed, all time', (select count(*) from appointments a where a.patient_id = hp.patient_id and a.status::text = 'completed')::bigint),
               ('m patient appointments, all time', (select count(*) from appointments a where a.patient_id = hp.patient_id)::bigint),
               ('n routable for at least one channel (1/0)', (select (bool_or((x.pref_email and x.has_email) or (x.pref_sms and x.has_phone)))::int from lbl x where x.patient_id = hp.patient_id)::bigint)
             ) as m(metric, v)
) r
order by section, key;
-- <<< DIAGNOSIS REPORT

rollback;

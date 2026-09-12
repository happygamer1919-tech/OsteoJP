-- ===========================================================================
-- Y1 - REMINDER EXPOSURE, PRODUCTION READ. READ ONLY.
-- ===========================================================================
-- SELECTs only, inside a READ ONLY transaction that is rolled back at the end.
-- Creates nothing, changes nothing, can be interrupted at any point.
--
-- WHO RUNS IT: the owner, in his own shell, against production:
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -v tenant_slug=osteojp \
--        -P pager=off -f scripts/reminder-exposure-read-2026-09-11.sql
-- The lane authored and rehearsed it and cannot execute it: the harness refuses
-- anything that connects to production.
--
-- ===========================================================================
-- WHAT THIS CAN AND CANNOT SEE. READ BEFORE ANY NUMBER.
-- ===========================================================================
-- "No reminder run scheduled" is NOT visible to Postgres. A run is a sleeping
-- Inngest function; the database holds no trace of it until it fires. And
-- `reminder_dispatches` (the ledger) only gains a row when a reminder is
-- attempted, so an appointment more than 48 hours out has NO ledger row whether
-- or not a run exists. Ledger absence alone proves nothing for most of the window.
--
-- So exposure is read the way it was CAUSED: by the path that created or
-- confirmed the appointment, against the instant that path's fix went live.
-- A path that never emitted `appointment/scheduled` left no run behind, by
-- construction. The fix instants are GitHub's "Deployment has completed" status
-- for osteojp-platform on each merge commit:
--   portal acceptance emits   #1085  fcc09dee  2026-08-31 22:59:10Z
--   ledger writer live        #1256  89d9799d  2026-09-10 19:58:24Z
--   batch path emits          #1261  46e2014f  2026-09-10 22:45:15Z
--   Estado / SMS queue / SIM  #1273  11955253  2026-09-11 12:32:05Z
--
-- THE PATHS, as `path` below:
--   batch                        Agendar lote, created before #1261. EXPOSED.
--   estado                       a portal pedido confirmed with the drawer's Estado
--                                selector before #1273. EXPOSED.
--   sms_queue                    a portal pedido confirmed from the SMS review queue
--                                before #1273. EXPOSED.
--   sms_reply                    a portal pedido confirmed by the patient's own SMS
--                                "SIM" before #1273. EXPOSED.
--   portal_confirmed_before_fix  a portal booking confirmed by ANY door before
--                                #1085, when nothing on the portal path emitted.
--                                EXPOSED.
--   outside_app                  a staff-origin row with no appointment.create audit:
--                                the Fisiozero importer or hand SQL. Never emitted.
--                                EXPOSED.
--   staff_drawer                 created by createAppointment / clone, which emit.
--                                Covered by construction; the only way one lacks a
--                                run is a failed enqueue, which only the ledger
--                                cross-check below can show.
--   batch_after_fix              batch rows after #1261. Covered.
--   portal_accepted              accepted with "Aceitar pedido" after #1085. Covered.
--   portal_door_after_fix        confirmed by Estado / queue / SIM after #1273. Covered.
--   portal_awaiting_acceptance   an unaccepted pedido. NO reminders BY DESIGN until
--                                reception accepts it (owner ruling 2026-08-31). Not
--                                exposure.
--   portal_confirmed_unknown_path  confirmed, but no audit row says how. Needs a look;
--                                never backfilled automatically.
-- A later appointment.reschedule EMITS, so any exposed row rescheduled after the
-- silent event is covered (`rescheduled_since`).
-- Estado CORRECTION is not a path: it only moves one final state to another
-- (isLegalEstadoCorrection), so it can never produce a remindable row.
--
-- THE LEDGER CROSS-CHECK, the one signal that works for every path. An offset
-- that came due AFTER the ledger writer went live, on a patient contactable on
-- that channel with the preference on, should have a ledger row whatever the
-- outcome. `due_without_ledger` counts the ones that do not. CAVEAT: the
-- dispatcher also returns early WITHOUT a ledger row when the tenant's reminder
-- config switches a channel off (section 0 prints that config), so read this
-- column next to section 0, never alone.
--
-- Prints appointment ids, instants, statuses and counts. Never a name, phone or
-- email (CLAUDE.md rule 7).
-- ===========================================================================

\pset pager off
\timing off
\set ON_ERROR_STOP on

begin transaction read only;

\echo ''
\echo '=== 0. TARGET, AND WHETHER THE LEDGER IS BEING WRITTEN ==='
select case when count(*) = 1 then 'OK' else 'FAIL' end as tenant_resolves
  from tenants where slug = :'tenant_slug';
select t.id as tenant_id,
       now() as read_at,
       t.settings -> 'reminders' as tenant_reminders_config,
       (select count(*) from reminder_dispatches d
         where d.tenant_id = t.id and d.created_at >= now() - interval '24 hours') as ledger_rows_last_24h,
       (select max(d.created_at) from reminder_dispatches d where d.tenant_id = t.id) as newest_ledger_row
  from tenants t where t.slug = :'tenant_slug';

\echo ''
\echo '=== 1. THE NEXT 14 DAYS, REMINDABLE, BY ORIGIN AND STATUS ==='
select a.origin, a.status::text as status, count(*) as rows
  from appointments a
  join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
  join tenants t on t.id = a.tenant_id and t.slug = :'tenant_slug'
 where a.starts_at > now() and a.starts_at <= now() + interval '14 days'
   and a.status::text in ('scheduled', 'confirmed')
   and p.deleted_at is null
 group by 1, 2
 order by 1, 2;

\echo ''
\echo '=== 2. EXPOSURE BY PATH: the next 14 days, and ALL future rows (which sizes the backfill) ==='
\echo '    backfill_eligible = exposed, starts more than 24h out, and NO reminder ledger row at all.'
\echo '    contradicted_by_ledger = classified exposed, but a reminder WAS attempted: never backfilled.'
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
select e.path,
       case
         when e.path in ('batch', 'estado', 'sms_queue', 'sms_reply', 'portal_confirmed_before_fix', 'outside_app')
           then 'EXPOSED unless rescheduled since'
         when e.path = 'portal_awaiting_acceptance' then 'by design: no reminders until accepted'
         when e.path = 'portal_confirmed_unknown_path' then 'NEEDS A LOOK: confirmed, no audit says how'
         else 'covered: its path emitted'
       end as reading,
       count(*) filter (where e.starts_at <= k.t0 + interval '14 days') as rows_14d,
       count(*) filter (where e.exposed and e.starts_at <= k.t0 + interval '14 days') as exposed_14d,
       count(*) as rows_all_future,
       count(*) filter (where e.exposed) as exposed_all_future,
       count(*) filter (where e.exposed and e.starts_at > k.t0 + interval '24 hours'
                          and not e.any_reminder_row) as backfill_eligible,
       count(*) filter (where e.exposed and e.any_reminder_row) as contradicted_by_ledger,
       count(*) filter (where e.due_48h or e.due_24h) as due_contactable,
       count(*) filter (where e.due_without_ledger) as due_without_ledger
  from exposure e
  cross join k
 group by e.path
 order by e.path;

\echo ''
\echo '=== 3. THE ROWS: every exposed row (all future), every ledger contradiction, every due-without-ledger row ==='
\echo '    Ids and instants only. would_schedule_now = the offsets a re-emit could still schedule.'
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
select e.path, e.id, e.starts_at, e.status,
       e.exposed,
       e.any_reminder_row as ledger_has_reminder,
       e.due_without_ledger,
       concat_ws(', ',
         case when e.starts_at - interval '48 hours' > k.t0 then '48h email' end,
         case when e.starts_at - interval '24 hours' > k.t0 then '24h sms' end) as would_schedule_now
  from exposure e
  cross join k
 where e.exposed or e.due_without_ledger or e.path = 'portal_confirmed_unknown_path'
 order by e.path, e.starts_at, e.id;

rollback;

-- ===========================================================================
-- B4 — REMINDER PIPELINE, PRODUCTION READ. READ ONLY.
-- ===========================================================================
-- SELECTs only. No INSERT, UPDATE, DELETE, CREATE, ALTER, GRANT. Creates
-- nothing, changes nothing, and can be interrupted at any point with no effect.
--
-- WHO RUNS IT: Ivan, in his own shell, against production. The lane authored it
-- and cannot execute it: the harness permits the target guard and refuses
-- anything that CONNECTS.
--
-- ===========================================================================
-- READ THIS BEFORE READING ANY NUMBER BELOW. SECTION 2 WILL RETURN ZERO ROWS
-- FOR BOTH CHANNELS, AND THAT IS NOT EVIDENCE ABOUT EMAIL.
-- ===========================================================================
-- `reminder_dispatches` exists on production - migration 0075, applied
-- 2026-09-04, journal id 75, hash e268bc0d... - and NOTHING IN THE APPLICATION
-- EVER WRITES A ROW TO IT. The only reference to the table in the entire
-- repository outside migrations, checks and its own DB-gated test is the Drizzle
-- schema declaration at packages/db/src/schema.ts:1517. `dispatch.ts` does not
-- import it. There is no INSERT anywhere.
--
-- So the table is EMPTY BY CONSTRUCTION. A count of 0 SMS and 0 email over the
-- last 7 days means "nothing is recorded", never "nothing was sent" - and a
-- reader who compares those two zeroes and concludes "email is broken, SMS is
-- fine" would be reading a fact about the ledger as a fact about the pipeline.
-- Section 2 is run anyway, because "0 rows" MEASURED on production is what turns
-- a repository claim into a production fact, and because a non-zero result would
-- mean the repository reading is wrong and everything below it must be re-derived.
--
-- Section 1 is the one that decides how to read the rest.
-- ===========================================================================

\pset pager off
\timing off

\echo ''
\echo '=== 1. IS THERE A LEDGER AT ALL, AND DOES IT HOLD ANYTHING? ==='
\echo '    A row count of 0 with the table PRESENT confirms the write-path gap.'
select
  (to_regclass('public.reminder_dispatches') is not null) as table_exists,
  (select count(*) from public.reminder_dispatches)       as rows_all_time,
  (select count(*) from public.reminder_dispatches
     where created_at >= now() - interval '7 days')       as rows_last_7d,
  (select max(created_at) from public.reminder_dispatches) as newest_row;

\echo ''
\echo '=== 2. REMINDER SENDS, LAST 7 DAYS, BY CHANNEL (from our own ledger) ==='
\echo '    Read section 1 first. If rows_all_time is 0 this section is empty for'
\echo '    BOTH channels and says nothing about either.'
select
  d.channel,
  d.template_id,
  d.outcome,
  d.suppression_reason,
  count(*)                                   as attempts,
  min(d.created_at)                          as first_at,
  max(d.created_at)                          as last_at,
  count(*) filter (where d.provider_message_id is not null) as with_provider_id,
  count(*) filter (where d.provider_status is not null)     as with_provider_status,
  left(max(d.provider_error_code), 80)       as sample_error_code
from public.reminder_dispatches d
where d.created_at >= now() - interval '7 days'
group by 1, 2, 3, 4
order by 1, 2, 3, 4;

\echo ''
\echo '=== 3. PROXY: 24h SMS THAT GOT AS FAR AS MINTING A CONFIRM LINK ==='
\echo '    REAL but PARTIAL. One row per 24h reminder that rendered a sendable'
\echo '    body and minted a code. It proves the SMS leg RAN. It says nothing'
\echo '    about Twilio accepting or delivering it, and it has no email twin -'
\echo '    the 48h email mints no code, so its absence here is meaningless.'
select
  (c.created_at at time zone 'Europe/Lisbon')::date as day_lisbon,
  count(*)                                          as codes_minted,
  count(*) filter (where c.consumed_at is not null) as codes_consumed
from public.appointment_confirm_codes c
where c.created_at >= now() - interval '7 days'
group by 1
order by 1;

\echo ''
\echo '=== 4. PROXY: INBOUND REPLIES — the only proof a patient RECEIVED one ==='
\echo '    A reply cannot exist unless a message arrived. SMS only, by nature.'
select
  (e.received_at at time zone 'Europe/Lisbon')::date as day_lisbon,
  e.classification,
  count(*)                                           as replies
from public.sms_inbound_events e
where e.received_at >= now() - interval '7 days'
group by 1, 2
order by 1, 2;

\echo ''
\echo '=== 5. THE OWNER DELIVERY TESTS (audit_log) — REAL outcomes ==='
\echo '    messaging.check.send is the /admin messaging test page and NOTHING'
\echo '    else. The reminder pipeline writes no audit row of any kind.'
select
  (a.created_at at time zone 'Europe/Lisbon')::date as day_lisbon,
  a.metadata->>'channel'                            as channel,
  case
    when a.metadata->>'failure' is null          then 'sent'
    when a.metadata->>'failure' like 'skipped:%' then 'suppressed'
    else 'failed'
  end                                               as outcome,
  count(*)                                          as attempts,
  left(max(a.metadata->>'failure'), 160)            as sample_failure
from public.audit_log a
where a.action = 'messaging.check.send'
  and a.created_at >= now() - interval '7 days'
group by 1, 2, 3
order by 1, 2, 3;

\echo ''
\echo '=== 6. THE APPOINTMENT IN QUESTION: 2026-09-10 14:00 Lisbon, Nuno ==='
\echo '    Resolved by practitioner NAME to an id; the name is never printed.'
\echo '    If matched_appointments is not exactly 1, STOP and report the count -'
\echo '    every section below addresses whatever this matched, and a 0 or a 2'
\echo '    makes them all meaningless.'
with nuno as (
  select u.id
  from public.users u
  where u.full_name ilike 'nuno%'
),
target as (
  select a.id, a.tenant_id, a.starts_at, a.status, a.confirmation_state,
         a.origin, a.created_at, a.practitioner_id, a.location_id
  from public.appointments a
  where a.practitioner_id in (select id from nuno)
    and a.starts_at = timestamptz '2026-09-10 14:00:00 Europe/Lisbon'
)
select
  (select count(*) from nuno)   as practitioners_named_nuno,
  (select count(*) from target) as matched_appointments;

\echo ''
\echo '--- 6a. the appointment row (ids, instants, states; no names) ---'
with nuno as (select u.id from public.users u where u.full_name ilike 'nuno%')
select a.id            as appointment_id,
       a.tenant_id,
       a.starts_at,
       a.created_at    as booked_at,
       a.status,
       a.confirmation_state,
       a.origin,
       a.location_id,
       -- How much runway each offset had at booking time. A 48h reminder is
       -- NEVER SCHEDULED for an appointment booked less than 48h ahead
       -- (computeDueReminders drops any offset already in the past), so this
       -- column decides whether "no 48h email" is a fault or arithmetic.
       (a.starts_at - a.created_at)                       as booked_lead_time,
       (a.starts_at - a.created_at) > interval '48 hours' as was_48h_schedulable,
       (a.starts_at - a.created_at) > interval '24 hours' as was_24h_schedulable
from public.appointments a
where a.practitioner_id in (select id from nuno)
  and a.starts_at = timestamptz '2026-09-10 14:00:00 Europe/Lisbon';

\echo ''
\echo '--- 6b. the gates dispatchReminder evaluates, as stored (no PII) ---'
\echo '    has_email / has_phone are BOOLEANS. No address and no number is read.'
with nuno as (select u.id from public.users u where u.full_name ilike 'nuno%')
select a.id                                   as appointment_id,
       (p.email is not null and p.email <> '')  as has_email,
       (p.phone is not null and p.phone <> '')  as has_phone,
       p.reminder_email_enabled,
       p.reminder_sms_enabled,
       (p.deleted_at is not null)               as patient_soft_deleted
from public.appointments a
join public.patients p on p.id = a.patient_id
where a.practitioner_id in (select id from nuno)
  and a.starts_at = timestamptz '2026-09-10 14:00:00 Europe/Lisbon';

\echo ''
\echo '--- 6c. every dispatch ledger row for it (expected: none, see the header) ---'
with nuno as (select u.id from public.users u where u.full_name ilike 'nuno%')
select d.id, d.channel, d.template_id, d.outcome, d.suppression_reason,
       d.provider_message_id, d.provider_status, d.provider_error_code,
       d.created_at, d.status_at
from public.reminder_dispatches d
join public.appointments a on a.id = d.appointment_id
where a.practitioner_id in (select id from nuno)
  and a.starts_at = timestamptz '2026-09-10 14:00:00 Europe/Lisbon'
order by d.created_at;

\echo ''
\echo '--- 6d. was a 24h SMS attempted? the confirm-code proxy ---'
with nuno as (select u.id from public.users u where u.full_name ilike 'nuno%')
select c.appointment_id, c.created_at as code_minted_at, c.consumed_at
from public.appointment_confirm_codes c
join public.appointments a on a.id = c.appointment_id
where a.practitioner_id in (select id from nuno)
  and a.starts_at = timestamptz '2026-09-10 14:00:00 Europe/Lisbon'
order by c.created_at;

\echo ''
\echo '--- 6e. did the patient reply? (inbound, ids and classification only) ---'
with nuno as (select u.id from public.users u where u.full_name ilike 'nuno%')
select e.id, e.appointment_id, e.classification, e.review_reason,
       e.received_at, e.resolution
from public.sms_inbound_events e
join public.appointments a on a.id = e.appointment_id
where a.practitioner_id in (select id from nuno)
  and a.starts_at = timestamptz '2026-09-10 14:00:00 Europe/Lisbon'
order by e.received_at;

\echo ''
\echo '=== 7. TENANT REMINDER CONFIG — the three gates, STORED and EFFECTIVE ==='
\echo '    Booleans and offsets only. No credential, no sender, no endpoint.'
\echo ''
\echo '    AN ABSENT KEY IS NOT "OFF". parseReminders() is a TOLERANT read: a'
\echo '    missing or malformed field falls back to DEFAULT_TENANT_CONFIG, which'
\echo '    is emailEnabled true, smsEnabled true, leadTimeHours [48, 24]. So a'
\echo '    NULL in the *_stored columns means the pipeline uses the default in'
\echo '    the *_effective column beside it, and reading a NULL as a disabled'
\echo '    channel would blame configuration for something it did not do.'
\echo ''
\echo '    lead_48_effective is the FIRST gate dispatchReminder evaluates for a'
\echo '    48h email: planReminderChannels returns lead_time_off before it looks'
\echo '    at any channel or contact. If it is false, no 48h email exists for'
\echo '    this tenant at all and nothing further down is worth reading.'
select t.id as tenant_id,
       t.settings->'reminders'->>'emailEnabled'   as email_stored,
       coalesce((t.settings->'reminders'->>'emailEnabled')::boolean, true)
                                                  as email_effective,
       t.settings->'reminders'->>'smsEnabled'     as sms_stored,
       coalesce((t.settings->'reminders'->>'smsEnabled')::boolean, true)
                                                  as sms_effective,
       t.settings->'reminders'->>'leadTimeHours'  as lead_times_stored,
       coalesce(
         (t.settings->'reminders'->'leadTimeHours') @> '48'::jsonb,
         true)                                    as lead_48_effective,
       coalesce(
         (t.settings->'reminders'->'leadTimeHours') @> '24'::jsonb,
         true)                                    as lead_24_effective
from public.tenants t
order by t.id;

\echo ''
\echo '=== DONE. Nothing above wrote anything. ==='

-- THE F4 READ, 2026-11-06 (strategy's ruling F4 on the A1 findings): for ONE visit, two answers,
-- each yes or no, and nothing else:
--   has email: yes|no             the patient's email address is present, as `!!data.patientEmail`
--   email reminders on: yes|no    the patient's own email-reminder switch
-- computed from the same fields apps/web/lib/reminders/dispatch.ts:1290 to 1303 (main, 50383ca9)
-- reads for them: `data.patientEmail` and `data.patientReminderEmailEnabled`, which
-- loadReminderData (apps/web/lib/reminders/data.ts) loads as patients.email and
-- patients.reminder_email_enabled through the visit's patient (patients.id =
-- appointments.patient_id). The two expressions are the ones the compare's NC rule uses
-- (scripts/db/read-shadow-compare-20261106.sql, `nc`), byte for byte, and the test checks it.
--
-- READ ONLY. It writes nothing; run it inside `begin read only` ... `rollback`.
--
-- ONE VALUE COMES FROM OUTSIDE: the visit, the setting `osteojp.f4_appointment_id`, which the block
-- sets with `set local` from the dispatch's APPTID after checking it is a uuid. The id is never
-- written in the repository. Unset, the read stops with an error; not a uuid, the cast stops it.
--
-- WHAT IT PRINTS: exactly two rows of one column, in this order, when the id names a visit with a
-- patient; NO ROW when it names none (the block STOPs on anything but the two lines). No value,
-- no name, no id, no other field.
--
-- Run (the document's F4 block does exactly this, with a 30 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '30s'"
--        -c "set local osteojp.f4_appointment_id = '<APPTID>'"
--        -f scripts/db/read-f4-contact-20261106.sql -c "rollback"
with
i as (
  select pt.email as nc_email, pt.reminder_email_enabled as nc_email_on
    from public.appointments a
    join public.patients pt on pt.id = a.patient_id
   where a.id = current_setting('osteojp.f4_appointment_id')::uuid
)
select z.line from (
  select 1 as o, 'has email: ' || case when coalesce(i.nc_email, '') <> '' then 'yes' else 'no' end as line from i
  union all
  select 2, 'email reminders on: ' || case when i.nc_email_on then 'yes' else 'no' end from i
) z
order by z.o;

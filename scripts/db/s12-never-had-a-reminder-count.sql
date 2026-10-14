-- S12: HOW MANY UPCOMING VISITS NEVER HAD A REMINDER. Information for
-- strategy's FINAL S12 ruling, read in the 0106 sitting as its own block, after
-- the post-check (strategy, 2026-10-14: "provisional ruling = your first
-- definition (history-based). Run s12-never-had-a-reminder-count-20261013.sql
-- read-only in the 0106 sitting as its own block; final ruling on the counts,
-- before arming."). IT IS NEVER A STOP CONDITION: whatever it counts, the
-- sitting's verdicts are the pre-check's and the post-check's.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside
-- `begin read only` ... `rollback`, so the server refuses any write.
-- WHAT IT PRINTS: one row per tenant, the tenant's id (a clinic, not a person)
-- and seven counts. No patient id, no name, no phone, no email, no text of any
-- row: it reads appointments, audit_log, migration_staging_rows and
-- reminder_dispatches only inside count(*) and EXISTS.
--
-- Everything below the line "BEGIN OF THE HANDOVER FILE" is, byte for byte,
-- /Users/ivan/osteojp-handover/s12-never-had-a-reminder-count-20261013.sql,
-- sha256 334e9e3a3e09a88e9c527a2277a812fb4d3f177f4673004aa173b7706feb00df.
-- Its own first line still says PROPOSED: the definition is strategy's
-- provisional ruling of 2026-10-14, not yet final.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -f scripts/db/s12-never-had-a-reminder-count.sql -c "rollback"
--
-- BEGIN OF THE HANDOVER FILE
-- S12, PROPOSED DEFINITION: "a visit that never had a reminder".
-- READ ONLY. Counts only, one row per tenant. No name, no id of a person.
-- Run inside:  begin read only;  ...  rollback;
with never as (
  select a.tenant_id, a.id, a.starts_at, a.status, a.origin
  from public.appointments a
  where a.status in ('scheduled', 'confirmed')
    and a.starts_at > now()
    and not exists (
      select 1
      from public.audit_log l
      where l.tenant_id = a.tenant_id
        and l.entity_type = 'appointment'
        and l.entity_id = a.id
        and (
          l.action in ('appointment.create', 'appointment.reschedule')
          or (l.action = 'appointment.update'
              and (l.metadata->>'toStatus' in ('scheduled', 'confirmed')
                   or l.metadata->>'via' = 'portal_request_confirm'))
          or (l.action = 'appointment.sms_reply_reviewed'
              and l.metadata->>'resolution' = 'confirmed'
              and l.metadata->>'applied' = 'true')
          or (l.action = 'appointment.patient_sms_reply'
              and l.metadata->>'outcome' = 'confirmed')
        )
    )
)
select
  n.tenant_id,
  count(*)                                                             as never_had_a_reminder,
  count(*) filter (where n.origin = 'patient_portal'
                     and n.status = 'scheduled')                       as of_which_online_requests_not_yet_accepted,
  count(*) filter (where exists (
      select 1 from public.migration_staging_rows m
      where m.tenant_id = n.tenant_id
        and m.entity_type = 'appointment'
        and m.imported_entity_id = n.id))                              as of_which_written_by_the_import,
  count(*) filter (where n.starts_at <= now() + interval '48 hours')   as starting_within_48_hours,
  count(*) filter (where n.starts_at >  now() + interval '48 hours'
                     and n.starts_at <= now() + interval '28 days')    as starting_in_2_to_28_days,
  count(*) filter (where n.starts_at >  now() + interval '28 days')    as starting_later_than_28_days,
  count(*) filter (where exists (
      select 1 from public.reminder_dispatches d
      where d.tenant_id = n.tenant_id
        and d.appointment_id = n.id
        and d.template_id like 'reminder.%'))                          as of_which_a_reminder_attempt_is_on_record_anyway
from never n
group by n.tenant_id
order by n.tenant_id;

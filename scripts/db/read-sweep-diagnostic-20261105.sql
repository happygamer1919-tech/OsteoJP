-- SWEEP DIAGNOSTIC, 2026-11-05 (strategy's A1 of 2026-11-04): WHAT THE REMINDER SWEEP'S HEARTBEATS
-- OF TUESDAY 2026-11-03 HOLD, THE HEARTBEATS WHOSE COUNTS DIFFER FROM THEIR ROWS, AND THE HISTORY
-- OF ONE SHADOW-ONLY MARK. It decides nothing: it prints what the database holds, and four
-- findings (rows 30 to 33) that a hypothesis is CONFIRMED, REFUTED or UNDECIDED by it.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside `begin read only` ...
-- `rollback`, so the server refuses any write. Row 0 reads the transaction's own setting.
--
-- ONE VALUE COMES FROM OUTSIDE: the appointment id of the shadow-only mark, read from the setting
-- `osteojp.diag_appointment_id`, which the block sets with `set local` inside the read-only
-- transaction. This file names no appointment. Unset, the read stops with an error and prints
-- nothing.
--
-- WHY IT EXISTS. The shadow compare of 2026-11-04 (scripts/db/read-shadow-compare-20261104.sql)
-- stopped on four FAIL: its verdict 3 on 2026-11-03 (60 heartbeats, 60 pass ids, 59 slots), its
-- verdict 8 (two heartbeats whose recorded count is not the number of shadow rows of their
-- transaction) and its verdicts 11 and 13 (one shadow-only mark with no label). This read prints
-- the rows behind those three, in counts, times and labels.
--
-- WHAT THE HEARTBEAT TABLE HOLDS (0106, `reminder_sweep_passes`): id, tenant_id, pass_id, mode,
-- pass_at, look_ahead_before, due_count, recorded_count, over_ceiling, excluded_count, created_at.
-- Row 1 prints the column list as the database has it. Of those, two are times of the pass:
--   pass_at     the pass's own clock, read in the job (`clock()`, apps/web/lib/reminders/sweep.ts,
--               runReminderSweep) at the start of that tenant's step, BEFORE its transaction;
--   created_at  the column default now(): the START of the tenant's transaction. Every shadow row
--               of the pass carries the same created_at, which is how the compare's verdict 8
--               ties rows to their heartbeat, and how this read does.
-- NO COLUMN RECORDS WHEN A PASS ENDED: the end is not recorded in the database. Rows 10 and 21 say
-- so, and print the one upper bound the data gives: the next heartbeat's transaction start (same
-- mode), an upper bound only when passes do not overlap. No commit time is read: a commit-time
-- function is checked for EXECUTE when the plan starts, even in a branch that never runs, so a role
-- without it would lose the whole read.
-- `pass_id` is the scheduler's run id (`runId`, apps/web/lib/reminders/inngest/sweep.ts). When it
-- reads as a ULID, its first 10 characters are a millisecond time, decoded here as "run time".
-- WHAT THAT TIME IS, IS NOT VERIFIED: it may be the cron tick, the run's creation or its start,
-- and the scheduler may create a run late. So the run time can CONFIRM a late pass the slots
-- already show, and can never refute one.
-- ONLY SHADOW HEARTBEATS ARE COMPARED WITH ROWS. A send heartbeat (apps/web/lib/reminders/
-- sweep-send.ts, runReminderSweepSend) records the claims its pass took, in a transaction of its
-- own after them, and has no shadow row: rows 20 to 22 and F3 read shadow heartbeats only, and
-- row 20 counts the send heartbeats apart.
--
-- THE FOUR FINDINGS:
--   F1 (row 30) A LATE PASS: a run of one 15-minute slot whose pass clock fell in a later one, so
--      its heartbeat sits in the next slot (or after 21:45). Never REFUTED. CONFIRMED only when the
--      slots and the run time agree: on 11-03 a heartbeat sits in a doubled slot (or after 21:45),
--      its pass id decodes to an earlier slot, and that slot has no heartbeat. CONSISTENT when the
--      slots alone fit (a doubled slot, or one after 21:45, with the slot before it missing) and
--      the run time does not confirm it. UNDECIDED when the day has a doubled, missing or outside
--      slot that fits neither. NO_SUBJECT when it has none.
--   F2 (row 31) A MARK RE-SELECTED: a mark taken by two heartbeats. The table has no unique key
--      over shadow rows (0106: only one per claim ATTEMPT, `reminder_claims_claim_attempt_key`,
--      WHERE kind = 'claim') and the sweep's insert has no conflict clause (sweep.ts,
--      `tx.insert(reminderClaims).values(shadowRows)`), so a re-selected mark would leave TWO
--      shadow rows, never one row counted twice. CONFIRMED when a mark has two shadow rows from
--      2026-11-02 on; REFUTED when none has and there are shadow rows; NO_SUBJECT when there is no
--      shadow row (a zero is never a pass; named apart from VACUOUS so the block's verdict count
--      does not take it). Row 25 prints the table's unique indexes.
--   F3 (row 32) ROWS THAT WENT WITH A DELETED VISIT: a shadow row goes with its appointment
--      (0106, `reminder_claims_appointment_id_fkey` ON DELETE CASCADE), and the hard delete
--      (apps/web/lib/scheduling/actions.ts, hardDeleteAppointment) writes the audit row
--      `appointment.hard_delete` with the start it deleted. So a heartbeat counted a row that is
--      gone when a visit whose mark that pass took was hard-deleted afterwards. The sweep has no
--      lower bound on a mark (`dueVisits`, sweep.ts), so a mark can be taken by a later pass than
--      the first that had it due (catch-up): a mark is a candidate of every shadow heartbeat whose
--      count differs, that had it due with the visit still ahead and began before the delete, and
--      is given to the EARLIEST of them (the pass that took it lost the row, so it differs too).
--      CONFIRMED when every such heartbeat is short (never over) by exactly the marks given to it
--      and no mark fits two of them; REFUTED only when no mark fits any of them, every hard-deleted
--      visit's start can be placed, and none has a mark due before 2026-11-02 (which a pass this
--      read does not read could have taken); UNDECIDED otherwise; NO_SUBJECT when no heartbeat's
--      count differs.
--   F4 (row 33) A SCHEDULING EVENT FOR THE APPOINTMENT. The application sends
--      `appointment/scheduled` after the save's commit (apps/web/lib/reminders/index.ts,
--      enqueueAppointmentReminders, `inngest.send`), best-effort, and a failed send is only
--      logged (apps/web/lib/scheduling/reminders.ts, enqueueRemindersAfterCommit). NO TABLE
--      RECORDS THE SEND. What the database holds is: the door's audit row (RE_ARMING_SAVES,
--      apps/web/lib/reminders/reminder-population.ts), which says a send was attempted; a
--      confirmation in the ledger (template `confirmation.*`, `booking_approved.email` or
--      `booking_approved.sms`), written
--      only by send-appointment-confirmation, which runs on that event; and a claim of taker `run`,
--      written only by send-appointment-reminder, which runs on the reminder event that
--      schedule-appointment-reminders fans out from that event. EVIDENCED when a confirmation or a
--      `run` claim exists (an event was received); DOOR_ONLY when only a door's audit row exists;
--      NO_EVIDENCE otherwise. Which events the scheduler received is the owner's look in its
--      dashboard, not this read's.
--
-- WHAT IT PRINTS: ONE result set, ordered by `n`, columns n | check | observed | expected |
-- verdict. Rows 0, 2, 3, 20 and 40 carry a verdict (OK, REVIEW, VACUOUS or FAIL); rows 30 to 33
-- carry a finding word; every other row reads INFO. It prints counts, Lisbon times, a tenant's
-- ordinal (never its id), pass ids, the fixed labels of offsets, channels, kinds, takers,
-- template ids, ledger outcomes, reason and provider codes, audit actions and the clause names of
-- RE_ARMING_SAVES and staff role slugs. NO APPOINTMENT ID: rows 22 to 24 name other visits by an
-- ordinal of this read ("visit 1", the same visit the same in all three, at most 100 rows each), and
-- the subject as "the appointment passed in". No patient field, no name, phone, email address,
-- note, message text, free text or audit metadata beyond the action and the clause name: the one
-- metadata value it reads into a printed row is a hard-deleted visit's start, as a time.
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -c "set local osteojp.diag_appointment_id = '<APPT_ID>'"
--        -f scripts/db/read-sweep-diagnostic-20261105.sql -c "rollback"
with
clock as (
  select now() as t1
),
k as (
  select current_setting('osteojp.diag_appointment_id')::uuid as subject,
         date '2026-11-03' as day,
         timestamptz '2026-11-02 00:00:00 Europe/Lisbon' as since
),
reminder as (
  -- apps/web/lib/reminders/offsets.ts REMINDER_OFFSETS: one channel per offset.
  select v.offset_id, v.channel, v.minutes
    from (values ('48h', 'email', 2880), ('24h', 'sms', 1440)) as v(offset_id, channel, minutes)
),
crockford as (
  select '0123456789ABCDEFGHJKMNPQRSTVWXYZ'::text as alphabet
),
hb0 as (
  -- Every heartbeat from Monday 2026-11-02 00:00 Lisbon, either mode, with its Lisbon day and its
  -- 15-minute slot, both from pass_at (the compare's own rule).
  select p.id, p.tenant_id, p.pass_id, p.mode, p.pass_at, p.look_ahead_before, p.due_count,
         p.recorded_count, p.over_ceiling, p.excluded_count, p.created_at,
         (p.pass_at at time zone 'Europe/Lisbon')::date as day,
         date_trunc('hour', p.pass_at at time zone 'Europe/Lisbon')
           + floor(extract(minute from p.pass_at at time zone 'Europe/Lisbon') / 15) * interval '15 minutes' as slot
    from public.reminder_sweep_passes p cross join k
   where p.pass_at >= k.since
),
tenant_n as (
  select z.tenant_id, row_number() over (order by z.tenant_id) as tn
    from (select distinct tenant_id from hb0) z
),
shadow as (
  select c.id, c.tenant_id, c.appointment_id, c.offset_id, c.channel, c.starts_at, c.due_at,
         c.pass_id, c.created_at
    from public.reminder_claims c cross join k
   where c.kind = 'shadow' and c.created_at >= k.since
),
hb1 as (
  select h.*, t.tn,
         case when h.pass_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
           to_timestamp((select sum((strpos(cr.alphabet, substr(h.pass_id, i, 1)) - 1)::numeric * power(32::numeric, 10 - i))
                           from generate_series(1, 10) as i cross join crockford cr)::float8 / 1000.0)
         end as run_at,
         (select count(*) from shadow s where s.tenant_id = h.tenant_id and s.created_at = h.created_at) as rows_tx,
         (select count(*) from shadow s where s.tenant_id = h.tenant_id and s.pass_id = h.pass_id) as rows_pid,
         count(*) over (partition by h.tenant_id, h.slot) as slot_beats,
         row_number() over (partition by h.tenant_id, h.slot order by h.pass_at, h.created_at) as slot_rank,
         count(*) over (partition by h.tenant_id, h.pass_id) as pid_beats,
         lag(h.pass_at) over w as prev_pass_at,
         lag(h.look_ahead_before) over w as prev_look,
         lag(h.created_at) over w as prev_created,
         lead(h.created_at) over w as next_created
    from hb0 h join tenant_n t on t.tenant_id = h.tenant_id
  window w as (partition by h.tenant_id, h.mode order by h.pass_at, h.created_at)
),
hb as (
  select h.*,
         date_trunc('hour', h.run_at at time zone 'Europe/Lisbon')
           + floor(extract(minute from h.run_at at time zone 'Europe/Lisbon') / 15) * interval '15 minutes' as run_slot,
         (h.slot_beats > 1) as f_doubled,
         (h.slot::time < time '07:00' or h.slot::time > time '21:45') as f_outside,
         (h.mode = 'shadow' and h.rows_tx <> h.recorded_count) as f_differs,
         (h.pass_id is not null and h.pid_beats > 1) as f_pid_shared,
         (h.mode = 'shadow' and h.pass_id is not null and h.rows_pid <> h.rows_tx) as f_pid_rows
    from hb1 h
),
hbf as (
  select h.*,
         (h.run_slot is not null and h.run_slot < h.slot) as f_late,
         concat_ws(', ',
           case when h.f_doubled then 'slot doubled (' || h.slot_rank::text || ' of ' || h.slot_beats::text || ')' end,
           case when h.f_outside then 'slot outside 07:00 to 21:45' end,
           case when h.f_differs then 'count differs' end,
           case when h.run_slot is not null and h.run_slot < h.slot then 'late: run time in slot ' || to_char(h.run_slot, 'HH24:MI') end,
           case when h.f_pid_shared then 'pass id on ' || h.pid_beats::text || ' heartbeats' end,
           case when h.f_pid_rows then 'rows by pass id differ from rows by transaction' end) as flags
    from hb h
),
day_slot as (
  select k.day + time '07:00' + make_interval(mins => 15 * g.n) as slot
    from k cross join generate_series(0, 59) as g(n)
),
slots as (
  select t.tn, t.tenant_id,
         (select count(*) from hbf h where h.tenant_id = t.tenant_id and h.day = k.day) as beats,
         (select count(*) from hbf h where h.tenant_id = t.tenant_id and h.day = k.day and h.mode = 'shadow') as shadow_beats,
         (select count(distinct h.pass_id) from hbf h where h.tenant_id = t.tenant_id and h.day = k.day) as pass_ids,
         (select count(distinct h.slot) from hbf h where h.tenant_id = t.tenant_id and h.day = k.day and not h.f_outside) as in_slots,
         (select string_agg(to_char(d.slot, 'HH24:MI'), ', ' order by d.slot) from day_slot d
           where not exists (select 1 from hbf h where h.tenant_id = t.tenant_id and h.slot = d.slot)) as missing,
         (select string_agg(distinct to_char(h.slot, 'HH24:MI'), ', ' order by to_char(h.slot, 'HH24:MI')) from hbf h
           where h.tenant_id = t.tenant_id and h.day = k.day and h.f_doubled) as doubled,
         (select string_agg(to_char(h.slot, 'HH24:MI'), ', ' order by h.slot) from hbf h
           where h.tenant_id = t.tenant_id and h.day = k.day and h.f_outside) as outside,
         (select count(*) from hbf h where h.tenant_id = t.tenant_id and h.day = k.day and h.f_differs) as differs
    from tenant_n t cross join k
),
day_hb as (
  select h.* from hbf h cross join k where h.day = k.day
),
-- ---- The heartbeats whose counts differ (any day from 11-02), and the marks they may have counted.
differ as (
  -- Shadow heartbeats only (f_differs is false on a send heartbeat).
  select h.*, h.recorded_count - h.rows_tx as short
    from hbf h where h.f_differs
),
deleted as (
  -- Visits hard-deleted from 11-02 on whose row is gone. The start the delete wrote, as text,
  -- exactly as toISOString() writes it; any other shape is left out rather than cast.
  select l.tenant_id, l.entity_id as appointment_id, l.created_at as deleted_at,
         case when l.metadata->>'startsAt' ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9][.][0-9]{3}Z$'
              then (l.metadata->>'startsAt')::timestamptz end as starts_at
    from public.audit_log l cross join k
   where l.entity_type = 'appointment' and l.action = 'appointment.hard_delete'
     and l.created_at >= k.since
     and not exists (select 1 from public.appointments a where a.id = l.entity_id)
),
del_mark as (
  select d.tenant_id, d.appointment_id, d.deleted_at, d.starts_at, rm.offset_id, rm.channel,
         d.starts_at - make_interval(mins => rm.minutes) as due_at
    from deleted d cross join reminder rm
   where d.starts_at is not null
),
cand_fit as (
  -- A mark of a hard-deleted visit that this heartbeat's pass could have taken: due at it (no
  -- lower bound, as `dueVisits` has none: a catch-up counts), the visit still ahead, deleted after
  -- the pass's transaction began, and due from 11-02 on. A candidate, not a proof: the visit's
  -- other predicates at the pass (status, a scheduling save, created before its mark) cannot be
  -- read once its row is gone.
  select d.id as hb_id, d.pass_at as hb_pass_at, m.*
    from differ d
    join del_mark m on m.tenant_id = d.tenant_id
    cross join k
   where m.deleted_at > d.created_at
     and m.starts_at > d.pass_at
     and m.due_at >= k.since
     and ((d.look_ahead_before is null and m.due_at <= d.pass_at)
          or (d.look_ahead_before is not null and m.due_at < d.look_ahead_before))
),
cand_deleted as (
  -- Each mark given to the earliest heartbeat it fits: the pass that took it lost the row.
  select z.* from (
    select c.*,
           count(*) over (partition by c.tenant_id, c.appointment_id, c.offset_id) as fits,
           row_number() over (partition by c.tenant_id, c.appointment_id, c.offset_id order by c.hb_pass_at, c.hb_id) as pick
      from cand_fit c
  ) z where z.pick = 1
),
cand_neighbour as (
  -- A mark this pass could have selected (due at it, the visit still ahead) that a shadow row of
  -- the PREVIOUS or the NEXT heartbeat of the same tenant holds.
  select d.id as hb_id, s.appointment_id, s.offset_id, s.channel, s.starts_at, s.due_at,
         case when s.created_at = d.prev_created then 'the previous heartbeat' else 'the next heartbeat' end as holder,
         (select to_char(x.slot, 'YYYY-MM-DD HH24:MI') from hbf x where x.tenant_id = s.tenant_id and x.created_at = s.created_at limit 1) as holder_slot
    from differ d
    join shadow s on s.tenant_id = d.tenant_id
                 and (s.created_at = d.prev_created or s.created_at = d.next_created)
   where s.starts_at > d.pass_at
     and ((d.look_ahead_before is null and s.due_at <= d.pass_at)
          or (d.look_ahead_before is not null and s.due_at < d.look_ahead_before))
),
dup as (
  -- Marks (appointment, offset, channel, start) with more than one shadow row from 11-02 on.
  select s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at, count(*) as n,
         string_agg(coalesce((select to_char(x.slot, 'YYYY-MM-DD HH24:MI') from hbf x
                                where x.tenant_id = s.tenant_id and x.created_at = s.created_at limit 1), 'no heartbeat'),
                    ', ' order by s.created_at) as holders,
         bool_or((s.created_at at time zone 'Europe/Lisbon')::date = (select day from k)) as on_day
    from shadow s
   group by s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at
  having count(*) > 1
),
vis as (
  -- Rows 22 to 24 name visits by an ordinal of this read ("visit 1"), never by id, so one visit
  -- reads the same in all three rows; the appointment passed in reads as itself.
  select z.appointment_id, row_number() over (order by z.first_mark, z.appointment_id) as vn
    from (select u.appointment_id, min(u.mark) as first_mark
            from (select appointment_id, due_at as mark from cand_deleted
                  union all select appointment_id, due_at from cand_neighbour
                  union all select appointment_id, starts_at from dup) u
           cross join k
           where u.appointment_id <> k.subject
           group by u.appointment_id) z
),
f3 as (
  select (select count(*) from differ) as differing,
         (select count(*) from differ where short < 0) as over,
         (select count(*) from cand_deleted) as candidates,
         (select count(*) from cand_deleted where fits > 1) as ambiguous,
         (select count(*) from differ d
           where d.short > 0 and d.short = (select count(*) from cand_deleted c where c.hb_id = d.id)) as matched,
         (select count(*) from differ d where exists (select 1 from cand_deleted c where c.hb_id = d.id)) as with_candidates,
         (select count(*) from deleted) as deleted_visits,
         (select count(*) from deleted where starts_at is null) as unplaced,
         (select count(*) from del_mark m cross join k where m.due_at < k.since and m.starts_at > k.since) as early_marks
),
f1 as (
  select (select count(*) from day_hb) as beats,
         (select count(*) from day_hb where run_at is null) as undecoded,
         (select count(*) from slots where doubled is not null or missing is not null or outside is not null) as anomalous_tenants,
         (select count(*) from day_hb where f_doubled or f_outside) as displaced,
         -- The slots alone: a heartbeat in a doubled slot (or after 21:45) whose slot before it, a
         -- slot of the day, has no heartbeat of the tenant.
         (select count(*) from day_hb h
           where (h.f_doubled or h.f_outside)
             and exists (select 1 from day_slot d where d.slot = h.slot - interval '15 minutes')
             and not exists (select 1 from hbf x where x.tenant_id = h.tenant_id and x.slot = h.slot - interval '15 minutes')) as slot_fit,
         (select count(*) from day_hb where f_late) as late,
         -- The slots and the run time agree: the run time decodes to an earlier slot of the day,
         -- which has no heartbeat of the tenant.
         (select count(*) from day_hb h
           where (h.f_doubled or h.f_outside) and h.f_late
             and exists (select 1 from day_slot d where d.slot = h.run_slot)
             and not exists (select 1 from hbf x where x.tenant_id = h.tenant_id and x.slot = h.run_slot)) as late_from_missing,
         (select count(*) from day_hb where extract(epoch from (pass_at at time zone 'Europe/Lisbon') - slot) > 60) as over_a_minute
),
-- ---- The subject: the appointment the dispatch names.
subj as (
  select a.id, a.tenant_id, a.status::text as status, a.starts_at, a.origin::text as origin,
         a.created_at, a.updated_at
    from public.appointments a cross join k
   where a.id = k.subject
),
subj_audit as (
  select l.id, l.action, l.created_at,
         case when l.actor_user_id is null then 'no user'
              when exists (select 1 from public.users u where u.id = l.actor_user_id)
                then coalesce('staff, role ' || (select r.slug from public.users u join public.roles r on r.id = u.role_id
                                                   where u.id = l.actor_user_id), 'staff, no role')
              else 'not a staff user' end as actor,
         -- RE_ARMING_SAVES (reminder-population.ts), clause by clause, as the 2026-11-04 compare
         -- reads it; the visit's origin where the clause asks for it.
         case
           when l.action = 'appointment.create' then 'booked'
           when l.action = 'appointment.reschedule' then 'moved'
           when l.action = 'appointment.update' and l.metadata->>'via' = 'portal_request_confirm'
             then 'accepted_in_pedidos'
           when l.action = 'appointment.update' and l.metadata->>'fromStatus' = 'scheduled'
                and l.metadata->>'toStatus' = 'confirmed' and sj.origin = 'patient_portal'
             then 'accepted_with_estado'
           when l.action = 'appointment.update' and l.metadata->>'fromStatus' = 'cancelled'
                and (l.metadata->>'toStatus' = 'confirmed'
                     or (l.metadata->>'toStatus' = 'scheduled' and sj.origin <> 'patient_portal'))
             then 'brought_back'
           when l.action = 'appointment.sms_reply_reviewed' and l.metadata->>'resolution' = 'confirmed'
                and l.metadata->>'applied' = 'true' and sj.origin = 'patient_portal'
             then 'accepted_in_sms_review'
           when l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' = 'confirmed'
                and sj.origin = 'patient_portal'
             then 'accepted_by_sms_reply'
         end as clause,
         -- reminder-population.ts hasSchedulingEvent, predicate by predicate.
         (l.action in ('appointment.create', 'appointment.reschedule')
          or (l.action = 'appointment.update'
              and (l.metadata->>'toStatus' in ('scheduled', 'confirmed')
                   or l.metadata->>'via' = 'portal_request_confirm'))
          or (l.action = 'appointment.sms_reply_reviewed'
              and l.metadata->>'resolution' = 'confirmed' and l.metadata->>'applied' = 'true')
          or (l.action = 'appointment.patient_sms_reply'
              and l.metadata->>'outcome' = 'confirmed')) as scheduling
    from public.audit_log l
    cross join k
    left join subj sj on sj.id = l.entity_id
   where l.entity_type = 'appointment' and l.entity_id = k.subject
),
subj_claim as (
  select c.id, c.kind, c.taker, c.offset_id, c.channel, c.starts_at, c.due_at, c.early, c.attempt,
         c.claim_id, c.minutes_after_mark, c.saved_after_mark, c.pass_id, c.created_at, c.tenant_id,
         exists (select 1 from public.reminder_claims rl
                  where rl.kind = 'release' and rl.claim_id = c.id) as released
    from public.reminder_claims c cross join k
   where c.appointment_id = k.subject
),
subj_ledger as (
  select x.channel, x.template_id, x.outcome, x.suppression_reason, x.provider_status,
         x.provider_error_code, x.created_at, x.status_at
    from public.reminder_dispatches x cross join k
   where x.appointment_id = k.subject
),
emit as (
  select (select count(*) from subj_audit where clause is not null) as doors,
         (select min(created_at) from subj_audit where clause is not null) as first_door,
         (select max(created_at) from subj_audit where clause is not null) as last_door,
         (select count(*) from subj_audit where scheduling) as scheduling_saves,
         (select count(*) from subj_ledger
           where template_id like 'confirmation.%' or template_id in ('booking_approved.email', 'booking_approved.sms')) as confirmations,
         (select count(*) from subj_claim where kind = 'claim' and taker = 'run') as run_claims,
         (select count(*) from subj_claim c where c.kind = 'claim' and c.taker = 'run'
            and c.starts_at = (select date_trunc('milliseconds', s.starts_at) from subj s)) as run_claims_now,
         (select count(*) from subj_claim c where c.kind = 'claim' and c.taker = 'run'
            and exists (select 1 from subj_claim s where s.kind = 'shadow' and s.starts_at = c.starts_at
                          and s.offset_id = c.offset_id and s.channel = c.channel)) as run_claims_of_shadow_marks
),
lis as (
  select to_char(c.t1 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as t1 from clock c
)
select n, "check", observed, expected, verdict from (
  select 0 as n, 0::bigint as ord,
         '0. this transaction is READ ONLY (the server refuses writes)' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select 1, 0,
         'the heartbeat table reminder_sweep_passes, its columns in order (pass_at is the pass''s clock before its transaction, created_at its transaction''s start; no column records a pass''s end: rows 10 and 21 say it is not recorded in the database and print an upper bound); read at (Lisbon)',
         (select string_agg(c.column_name::text, ', ' order by c.ordinal_position)
            from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'reminder_sweep_passes')
           || '; read at ' || (select t1 from lis),
         'information', 'INFO'
  union all
  select 2, 0,
         '2. heartbeats on 2026-11-03 (Lisbon, by pass_at): there is something to diagnose',
         'heartbeats ' || count(*)::text || ', tenants ' || count(distinct tenant_id)::text
           || ', shadow ' || (count(*) filter (where mode = 'shadow'))::text
           || ', send ' || (count(*) filter (where mode = 'send'))::text
           || ', distinct pass ids ' || count(distinct pass_id)::text
           || ', with no pass id ' || (count(*) filter (where pass_id is null))::text,
         'heartbeats > 0',
         case when count(*) = 0 then 'VACUOUS' else 'OK' end
    from day_hb
  union all
  select 3, s.tn,
         '3. tenant ' || s.tn::text || ', slots on 2026-11-03: 60 heartbeats in the 60 slots 07:00 to 21:45, none doubled, none missing, none outside',
         'heartbeats ' || s.beats::text || ' (shadow ' || s.shadow_beats::text || '), pass ids ' || s.pass_ids::text
           || ', slots ' || s.in_slots::text
           || '; doubled ' || coalesce(s.doubled, 'none')
           || '; missing ' || coalesce(s.missing, 'none')
           || '; outside ' || coalesce(s.outside, 'none')
           || '; counts that differ ' || s.differs::text,
         '60, 60; none; none; none',
         case when s.beats = 60 and s.in_slots = 60 and s.doubled is null and s.missing is null and s.outside is null
              then 'OK' else 'REVIEW' end
    from slots s
  union all
  select 10, row_number() over (order by h.pass_at, h.tn, h.created_at),
         'heartbeat on 2026-11-03, tenant ' || h.tn::text || ', slot ' || to_char(h.slot, 'HH24:MI'),
         'pass_at ' || to_char(h.pass_at at time zone 'Europe/Lisbon', 'HH24:MI:SS.MS')
           || ' (' || round(extract(epoch from (h.pass_at at time zone 'Europe/Lisbon') - h.slot)::numeric, 1)::text || ' s into its slot)'
           || '; transaction start ' || to_char(h.created_at at time zone 'Europe/Lisbon', 'HH24:MI:SS.MS')
           || ' (' || round(extract(epoch from h.created_at - h.pass_at)::numeric, 3)::text || ' s after pass_at)'
           || '; end not recorded in the database, upper bound (only when passes do not overlap) the next heartbeat''s transaction start '
           || coalesce(to_char(h.next_created at time zone 'Europe/Lisbon', 'HH24:MI:SS.MS'), 'none')
           || '; previous heartbeat''s transaction start ' || coalesce(round(extract(epoch from h.created_at - h.prev_created)::numeric / 60, 2)::text || ' min before', 'none')
           || '; next heartbeat''s transaction start ' || coalesce(round(extract(epoch from h.next_created - h.created_at)::numeric / 60, 2)::text || ' min after', 'none')
           || '; pass id ' || coalesce(h.pass_id, 'none')
           || '; run time (pass id as a ULID, NOT VERIFIED as the cron tick) ' || coalesce(to_char(h.run_at at time zone 'Europe/Lisbon', 'HH24:MI:SS.MS') || ' (slot ' || to_char(h.run_slot, 'HH24:MI') || ')', 'not decoded (not a ULID)')
           || '; mode ' || h.mode || '; look-ahead ' || coalesce(to_char(h.look_ahead_before at time zone 'Europe/Lisbon', 'HH24:MI'), 'none')
           || '; due ' || h.due_count::text || ', recorded ' || h.recorded_count::text
           || ', shadow rows of its transaction ' || h.rows_tx::text
           || ', shadow rows naming its pass id ' || h.rows_pid::text
           || case when h.mode = 'shadow' then '' else ' (a send heartbeat: its recorded count is claims taken, not compared)' end
           || ', over the ceiling ' || case when h.over_ceiling then 'yes' else 'no' end
           || ', left out ' || h.excluded_count::text,
         'flags: ' || coalesce(nullif(h.flags, ''), 'none'),
         'INFO'
    from day_hb h
  union all
  select 20, 0,
         '20. shadow heartbeats whose recorded count is not the number of shadow rows of their transaction, from 2026-11-02 00:00 Lisbon to the read (the compare''s verdict 8 tie)',
         'heartbeats ' || (select count(*) from hbf)::text
           || ', shadow ' || (select count(*) from hbf where mode = 'shadow')::text
           || ', send ' || (select count(*) from hbf where mode = 'send')::text || ' (not compared: a send heartbeat records claims, not shadow rows)'
           || '; shadow rows ' || (select count(*) from shadow)::text
           || ', recorded by shadow heartbeats ' || coalesce((select sum(recorded_count) from hbf where mode = 'shadow'), 0)::text
           || '; counts that differ ' || f3.differing::text
           || '; rows short in all ' || coalesce((select sum(short) from differ where short > 0), 0)::text
           || ', rows over in all ' || coalesce((select -sum(short) from differ where short < 0), 0)::text
           || '; of them on 2026-11-03 ' || (select count(*) from differ d cross join k where d.day = k.day)::text
           || '; at ' || coalesce((select string_agg(to_char(d.slot, 'YYYY-MM-DD HH24:MI') || ' tenant ' || d.tn::text || ' short ' || d.short::text, ', ' order by d.pass_at) from differ d), 'none'),
         'the compare read 2 (shadow rows 222, recorded 224)',
         case when (select count(*) from hbf where mode = 'shadow') = 0 then 'VACUOUS'
              when f3.differing > 0 then 'REVIEW'
              else 'OK' end
    from f3
  union all
  select 21, row_number() over (order by d.pass_at, d.tn),
         'count differs: ' || to_char(d.slot, 'YYYY-MM-DD HH24:MI') || ', tenant ' || d.tn::text,
         'mode ' || d.mode || '; recorded ' || d.recorded_count::text || ', due ' || d.due_count::text
           || '; shadow rows of its transaction ' || d.rows_tx::text || ', naming its pass id ' || d.rows_pid::text
           || '; short by ' || d.short::text
           || '; pass_at ' || to_char(d.pass_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS.MS')
           || ', transaction start ' || to_char(d.created_at at time zone 'Europe/Lisbon', 'HH24:MI:SS.MS')
           || ', end not recorded in the database, upper bound (only when passes do not overlap) the next heartbeat''s transaction start '
           || coalesce(to_char(d.next_created at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS.MS'), 'none')
           || '; pass id ' || coalesce(d.pass_id, 'none')
           || '; candidates: hard-deleted visits given to this pass ' || (select count(*) from cand_deleted c where c.hb_id = d.id)::text
           || ', marks a neighbouring heartbeat''s row holds ' || (select count(*) from cand_neighbour c where c.hb_id = d.id)::text,
         'flags: ' || coalesce(nullif(d.flags, ''), 'none'),
         'INFO'
    from differ d
  union all
  select 22, z.rk, z."check", z.observed, 'a candidate mark this pass counted that no row of its holds', 'INFO' from (
    select row_number() over (order by d.pass_at, c.due_at, c.appointment_id, c.offset_id) as rk,
           'counted, no row (a hard-deleted visit): ' || to_char(d.slot, 'YYYY-MM-DD HH24:MI') || ', tenant ' || d.tn::text as "check",
           case when c.appointment_id = k.subject then 'the appointment passed in'
                else 'visit ' || (select v.vn from vis v where v.appointment_id = c.appointment_id)::text || ' (hard-deleted)' end
             || ', ' || c.offset_id || ' ' || c.channel
             || ', start ' || to_char(c.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
             || ', mark ' || to_char(c.due_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
             || ', deleted ' || to_char(c.deleted_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')
             || '; fits ' || c.fits::text || ' heartbeat(s) whose count differs, given to the earliest'
             || '; another heartbeat''s row holds it: '
             || case when exists (select 1 from public.reminder_claims s
                                   where s.kind = 'shadow' and s.appointment_id = c.appointment_id
                                     and s.offset_id = c.offset_id and s.channel = c.channel)
                     then 'yes' else 'no (a visit''s rows go with it)' end as observed
      from cand_deleted c join differ d on d.id = c.hb_id cross join k
  ) z where z.rk <= 100
  union all
  select 23, z.rk, z."check", z.observed, 'a mark this pass could have selected that another heartbeat''s row holds', 'INFO' from (
    select row_number() over (order by d.pass_at, c.due_at, c.appointment_id, c.offset_id) as rk,
           'held by a neighbour: ' || to_char(d.slot, 'YYYY-MM-DD HH24:MI') || ', tenant ' || d.tn::text as "check",
           case when c.appointment_id = k.subject then 'the appointment passed in'
                else 'visit ' || (select v.vn from vis v where v.appointment_id = c.appointment_id)::text end
             || ', ' || c.offset_id || ' ' || c.channel
             || ', start ' || to_char(c.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
             || ', mark ' || to_char(c.due_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
             || '; held by ' || c.holder || ' (slot ' || coalesce(c.holder_slot, 'none') || ')'
             || '; rows of this mark from 11-02 ' || (select count(*) from shadow s where s.tenant_id = d.tenant_id
                   and s.appointment_id = c.appointment_id and s.offset_id = c.offset_id and s.channel = c.channel
                   and s.starts_at = c.starts_at)::text as observed
      from cand_neighbour c join differ d on d.id = c.hb_id cross join k
  ) z where z.rk <= 100
  union all
  select 24, z.rk, z."check", z.observed, 'a mark taken by more than one heartbeat', 'INFO' from (
    select row_number() over (order by u.starts_at, u.appointment_id, u.offset_id) as rk,
           'a mark with ' || u.n::text || ' shadow rows' as "check",
           case when u.appointment_id = k.subject then 'the appointment passed in'
                else 'visit ' || (select v.vn from vis v where v.appointment_id = u.appointment_id)::text end
             || ', ' || u.offset_id || ' ' || u.channel
             || ', start ' || to_char(u.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
             || '; its heartbeats (slots) ' || u.holders as observed
      from dup u cross join k
  ) z where z.rk <= 100
  union all
  select 25, 0,
         'the unique indexes on reminder_claims (0106 has none over shadow rows: a re-selected mark leaves two rows)',
         coalesce((select string_agg(i.relname::text, ', ' order by i.relname)
                     from pg_index x
                     join pg_class i on i.oid = x.indexrelid
                     join pg_class t on t.oid = x.indrelid
                     join pg_namespace s on s.oid = t.relnamespace
                    where s.nspname = 'public' and t.relname = 'reminder_claims' and x.indisunique), 'none'),
         'information', 'INFO'
  union all
  select 30, 0,
         'F1 a late pass on 2026-11-03, never REFUTED (the run time''s meaning is NOT VERIFIED): CONFIRMED when a heartbeat in a doubled slot (or after 21:45) decodes to an earlier slot that has no heartbeat; CONSISTENT when the slots alone fit (the slot before it missing); UNDECIDED when the day has a slot anomaly that fits neither; NO_SUBJECT when it has none',
         'heartbeats ' || f1.beats::text || ', pass id not decoded ' || f1.undecoded::text
           || '; tenants with a doubled, missing or outside slot ' || f1.anomalous_tenants::text
           || '; heartbeats in a doubled slot or after 21:45 ' || f1.displaced::text
           || ', of them with the slot before missing ' || f1.slot_fit::text
           || '; late by their run time ' || f1.late::text || ', of them from a missing slot ' || f1.late_from_missing::text
           || '; pass clocks more than 60 s into their slot ' || f1.over_a_minute::text,
         'CONFIRMED, CONSISTENT, UNDECIDED or NO_SUBJECT',
         case when f1.late_from_missing > 0 then 'CONFIRMED'
              when f1.slot_fit > 0 then 'CONSISTENT'
              when f1.anomalous_tenants > 0 then 'UNDECIDED'
              else 'NO_SUBJECT' end
    from f1
  union all
  select 31, 0,
         'F2 a mark re-selected: a mark with two or more shadow rows from 2026-11-02 on (a re-selected mark leaves two rows; no row is ever counted by two heartbeats)',
         'marks with more than one shadow row ' || (select count(*) from dup)::text
           || ', of them with a row written on 2026-11-03 ' || (select count(*) from dup where on_day)::text
           || '; shadow rows from 11-02 ' || (select count(*) from shadow)::text,
         'CONFIRMED, REFUTED or NO_SUBJECT (no shadow row: a zero is never a pass)',
         case when (select count(*) from dup) > 0 then 'CONFIRMED'
              when (select count(*) from shadow) = 0 then 'NO_SUBJECT'
              else 'REFUTED' end
  union all
  select 32, 0,
         'F3 rows that went with a hard-deleted visit: every shadow heartbeat whose count differs is short by exactly the marks of hard-deleted visits given to it (each mark to the earliest such heartbeat it fits, catch-up included)',
         'shadow heartbeats whose count differs ' || f3.differing::text || ', of them over (more rows than recorded) ' || f3.over::text
           || '; with a hard-deleted candidate ' || f3.with_candidates::text
           || ', short by exactly their candidates ' || f3.matched::text
           || '; candidates in all ' || f3.candidates::text || ', fitting two or more heartbeats ' || f3.ambiguous::text
           || '; hard-deleted visits from 11-02 ' || f3.deleted_visits::text
           || ', of them with a start this read cannot place ' || f3.unplaced::text
           || ', marks of them due before 11-02 with the visit ahead then ' || f3.early_marks::text,
         'CONFIRMED, REFUTED, UNDECIDED or NO_SUBJECT',
         case when f3.differing = 0 then 'NO_SUBJECT'
              when f3.over = 0 and f3.matched = f3.differing and f3.ambiguous = 0 then 'CONFIRMED'
              when f3.with_candidates = 0 and f3.unplaced = 0 and f3.early_marks = 0 then 'REFUTED'
              else 'UNDECIDED' end
    from f3
  union all
  select 33, 0,
         'F4 a scheduling event for the appointment passed in: what the database evidences (no table records the send itself; which events the scheduler received is the owner''s look in its dashboard)',
         'door audit rows (RE_ARMING_SAVES) ' || e.doors::text
           || coalesce(', first ' || to_char(e.first_door at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')
                       || ', last ' || to_char(e.last_door at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS'), '')
           || '; scheduling saves ' || e.scheduling_saves::text
           || '; confirmations in the ledger ' || e.confirmations::text
           || '; sleeping-job claims, any start ' || e.run_claims::text
           || ', of its start now ' || e.run_claims_now::text
           || ', of the marks its shadow rows hold ' || e.run_claims_of_shadow_marks::text,
         'EVIDENCED, DOOR_ONLY or NO_EVIDENCE',
         case when e.confirmations > 0 or e.run_claims > 0 then 'EVIDENCED'
              when e.doors > 0 then 'DOOR_ONLY'
              else 'NO_EVIDENCE' end
    from emit e
  union all
  select 40, 0,
         '40. the appointment passed in: its row now (status, start, origin, created, updated, its two marks now), and whether the id names anything',
         case when s.id is null then 'no row'
                || '; hard-delete audit rows ' || (select count(*) from subj_audit where action = 'appointment.hard_delete')::text
              else 'status ' || s.status || '; starts ' || to_char(s.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
                || '; origin ' || coalesce(s.origin, 'none')
                || '; created ' || to_char(s.created_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')
                || '; updated ' || to_char(s.updated_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')
                || '; 48h mark ' || to_char((s.starts_at - interval '2880 minutes') at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
                || ', 24h mark ' || to_char((s.starts_at - interval '1440 minutes') at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI')
           end
           || '; audit rows ' || (select count(*) from subj_audit)::text
           || ', claim store rows ' || (select count(*) from subj_claim)::text
           || ', ledger rows ' || (select count(*) from subj_ledger)::text,
         'a row, or at least one audit, claim or ledger row',
         case when s.id is null and (select count(*) from subj_audit) = 0 and (select count(*) from subj_claim) = 0
                   and (select count(*) from subj_ledger) = 0 then 'VACUOUS'
              else 'OK' end
    from k left join subj s on true
  union all
  select 41, row_number() over (order by a.created_at, a.action, a.id),
         'audit row ' || (row_number() over (order by a.created_at, a.action, a.id))::text || ': ' || a.action,
         'written ' || to_char(a.created_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS.MS')
           || '; by ' || a.actor
           || '; clause ' || coalesce(a.clause, 'none (re-arms nothing)')
           || '; a scheduling save ' || case when a.scheduling then 'yes' else 'no' end,
         'information', 'INFO'
    from subj_audit a
  union all
  select 42, row_number() over (order by c.created_at, c.kind, c.id),
         'claim store row ' || (row_number() over (order by c.created_at, c.kind, c.id))::text || ': ' || c.kind
           || coalesce(' by ' || c.taker, '') || ', ' || c.offset_id || ' ' || c.channel,
         'written ' || to_char(c.created_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS.MS')
           || '; start ' || coalesce(to_char(c.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'), 'none')
           || '; mark ' || coalesce(to_char(c.due_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'), 'none')
           || case c.kind
                when 'claim' then '; early ' || coalesce(c.early::text, 'none') || '; attempt ' || coalesce(c.attempt::text, 'none')
                                  || '; released ' || case when c.released then 'yes' else 'no' end
                when 'release' then '; releases the claim written '
                                  || coalesce((select to_char(o.created_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS.MS')
                                                 from subj_claim o where o.id = c.claim_id), 'not of this appointment')
                else '; minutes after mark ' || coalesce(c.minutes_after_mark::text, 'none')
                     || '; saved after mark ' || coalesce(c.saved_after_mark::text, 'none')
                     || '; its heartbeat (by transaction) '
                     || coalesce((select to_char(x.slot, 'YYYY-MM-DD HH24:MI') || ', pass id matches '
                                           || case when x.pass_id is not distinct from c.pass_id then 'yes' else 'no' end
                                    from hbf x
                                   where x.tenant_id = c.tenant_id and x.created_at = c.created_at limit 1), 'none found')
              end,
         'information', 'INFO'
    from subj_claim c
  union all
  select 43, row_number() over (order by x.created_at, x.template_id),
         'ledger row ' || (row_number() over (order by x.created_at, x.template_id))::text || ': ' || x.template_id,
         'written ' || to_char(x.created_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS.MS')
           || '; channel ' || x.channel || '; outcome ' || x.outcome
           || '; reason ' || coalesce(x.suppression_reason, 'none')
           || '; provider status ' || coalesce(x.provider_status, 'none')
           || '; provider error code ' || coalesce(x.provider_error_code, 'none')
           || '; status at ' || coalesce(to_char(x.status_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS'), 'none'),
         'information', 'INFO'
    from subj_ledger x
) out
order by n, ord;

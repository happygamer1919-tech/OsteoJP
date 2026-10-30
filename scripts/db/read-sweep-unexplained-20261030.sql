-- SWEEP-UNEXPLAINED READ, 2026-10-30: WHY DID THE REMINDER SWEEP NOT TAKE THE MARKS THE
-- SLEEPING JOB TOOK. Strategy's R22 of 2026-10-30, its words: "Read-only, one row per
-- unexplained visit, no personal data: status, created against mark, which audit actions
-- exist, origin, location, the live job's outcome, and everything the sweep's selection reads
-- at each pass." It names, per mark, which predicate of the sweep's selection was false. It
-- decides nothing itself.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside `begin read only` ...
-- `rollback`, so the server refuses any write. Verdict 0 reads the transaction's own setting.
--
-- THE SET IT EXPLAINS IS R20'S, RECOMPUTED, NEVER TYPED IN. Every line from `clock as (` to the
-- end of `pc` below is a byte-for-byte copy of scripts/db/read-shadow-compare-20261029.sql
-- lines 145 to 444 at e604854b (R20, merged as #1670): the window from t0, the sides, the key,
-- and the candidate labels, unchanged. scripts/read-sweep-unexplained-20261030.test.mjs fails
-- if one byte of that span differs from R20's file. "Unexplained" is R20's own: a `pc` row with
-- side `run_only` and category `UNEXPLAINED`, on ANY Lisbon day from t0 to the read's clock (R20
-- judged only Monday 10-26 to Wednesday 10-28; this read details every day). No appointment id
-- is written in this file.
--
-- WHAT IT PRINTS: ONE result set, ordered by mark then by `n`, columns
-- n | check | observed | expected | verdict. Verdicts are OK, VACUOUS or FAIL; every other row
-- reads INFO and is never counted. It prints Lisbon times, minutes, counts, the fixed labels of
-- offsets, channels, statuses, origins, audit action names, ledger outcomes and suppression
-- reasons, appointment ids, location ids and location names. No tenant id, patient id or staff
-- id, no name of a person, no phone, no email address, no message text, no note, and no audit
-- metadata except the scheduling fields the reminder code itself reads, each printed as a fixed
-- word (a status from the enum, `portal_request_confirm`, `confirmed`, `true`, `this start`,
-- `another start`) or `other`: never the stored text.
--
-- WHAT THE SWEEP'S SELECTION READS (apps/web/lib/reminders on origin/main at e604854b; a change
-- to that code changes this read's meaning). sweep.ts `selectDueMarks` takes, per tenant and per
-- offset of offsets.ts, the visits where `dueVisits` AND `hasSchedulingEvent` (the switch
-- REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is `false`) AND `notTakenBySweep` hold, at most
-- SWEEP_MARK_CEILING (50) a pass, oldest mark first, inside withReminderTenantContext
-- (context.ts: role `authenticated`, claims tenant_id and user_role `admin`, no user id). Each
-- predicate is evaluated here AS OF EACH PASS, from the rows that existed then:
--   P1 tenant     `appointments.tenant_id` equals the pass's tenant (dueVisits, first term).
--   P2 start      the start the visit had at the pass equals the start the sleeping job claimed.
--                 The selection reads the visit's start at the pass; a different start is a
--                 different key. Reconstructed from the audit trail: the `startsAt` of the
--                 latest `appointment.create` or `appointment.reschedule` row written at or
--                 before the pass, when one was moved later; the start now, when none was
--                 moved after the pass. `?` when it cannot be reconstructed.
--   P3 status     the status at the pass is `scheduled` or `confirmed` (SWEEP_REMINDABLE_STATUSES).
--                 Reconstructed: the `fromStatus` of the first audit row after the pass that
--                 carries a `toStatus`; the status now when there is none. `?` when that row
--                 records no `fromStatus`. A status change that wrote no audit row with a
--                 `toStatus` cannot be seen.
--   P4 ahead      the claimed start is after the pass's clock (`pass_at`) (sweepStartRange.after).
--   P5 due        the claimed start is at or before `pass_at` plus the offset, or, for the day's
--                 last pass, before 23:00 Lisbon of that day plus the offset (sweepStartRange,
--                 sweepLookAheadLimit). Recomputed from `pass_at`, and compared with the
--                 `look_ahead_before` the pass itself recorded.
--   P6 created    `appointments.created_at` is before the mark (the claimed start minus the offset).
--   P7 scheduling a scheduling save (reminder-population.ts hasSchedulingEvent, predicate by
--                 predicate) on the audit trail, written at or before the pass's transaction
--                 (the heartbeat's `created_at`), of the visit's own tenant: the job's context
--                 reads `audit_log` under `audit_log_tenant_select` (tenant only). Printed beside
--                 it: the same predicate over every tenant's rows, so a save under another tenant
--                 shows.
--   P8 not taken  no shadow row of this appointment, offset, channel and claimed start written
--                 before the pass, and no live claim of taker `sweep` (not early, not released)
--                 of the same key (notTakenBySweep).
--   the pass      its heartbeat's due, recorded and left-out counts and its over-the-ceiling flag.
--   NOW           the row-level security the job's context reads under (the policies on
--                 `appointments` and `audit_log`) cannot be read as of a past pass: rows 10 and
--                 11 print the policies as they are NOW and are labelled NOW.
-- The passes evaluated per mark: every shadow heartbeat of the visit's tenant from 75 minutes
-- before the mark (the 21:45 look-ahead) to the claimed start.
--
-- TWO CLOCKS, KEPT APART, AS IN R20. `pass_at` is the pass's own (application) clock and is what
-- the range predicates P4 and P5 compare with. "The rows that existed then" (P2, P3, P7, P8)
-- compares a row's database `created_at` with the heartbeat's `created_at`, the start of the
-- pass's transaction. A row written in the same few milliseconds, or one whose transaction began
-- before the pass and committed after it, is the one case this cannot place exactly.
--
-- VERDICTS (OK, VACUOUS or FAIL; the block succeeds only on 5 OK / 0 VACUOUS / 0 FAIL):
--    0  the transaction is READ ONLY
--    1  the recomputed unexplained set is not empty
--    2  Monday 10-26 to Wednesday 10-28: 8 unexplained marks over 6 visits, as R20 printed when
--       GREEN ran it on 2026-10-30 18:18 Lisbon
--    3  Thursday 10-29: 2 unexplained marks, both on visits of the Monday-to-Wednesday set
--    4  every unexplained mark has its visit row and is evaluated at one or more passes
-- Rows 10 and 11 are NOW and INFO; rows 20 to 27 are per mark, INFO:
--   20 the mark: appointment id, Lisbon day, mark, offset, channel, claimed start, claim time,
--      and what the sleeping job's claim ended as (R20's r_out)
--   21 the visit: status now, origin, location id and name, start now, created and updated
--      (Lisbon), created minus mark in minutes
--   22 every `reminder_claims` row of the appointment (claims, releases, shadow rows; both
--      offsets; any start)
--   23 every reminder ledger row of the appointment: time, template, outcome, reason
--   24 every audit row of the appointment: time, action, and the scheduling fields only
--   26 one row per pass: P1 to P8, each T, F or ?, and the heartbeat's counts
--   27 the summary: per predicate, at how many passes it was false while the pass's range
--      covered the mark (P4 and P5 true); the predicates false at EVERY such pass; and the first
--      pass, if any, at which every predicate held
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -f scripts/db/read-sweep-unexplained-20261030.sql -c "rollback"
with
clock as (
  select now() as t1
),
k as (
  select timestamptz '2026-10-25 15:15:19 Europe/Lisbon' as resync,
         timestamptz '2026-10-26 07:00:00 Europe/Lisbon' as first_full_pass,
         timestamptz '2026-10-29 07:15:00 Europe/Lisbon' as closes
),
full_day as (
  select g.d::date as d, g.n
    from (values (date '2026-10-26', 0), (date '2026-10-27', 1), (date '2026-10-28', 2)) as g(d, n)
),
reminder as (
  -- apps/web/lib/reminders/offsets.ts REMINDER_OFFSETS: one channel per offset.
  select v.offset_id, v.channel, v.n
    from (values ('48h', 'email', 0), ('24h', 'sms', 1)) as v(offset_id, channel, n)
),
win as (
  select (select min(p.pass_at)
            from public.reminder_sweep_passes p cross join k
           where p.mode = 'shadow' and p.pass_at >= k.resync) as t0,
         (select min(p.created_at)
            from public.reminder_sweep_passes p cross join k
           where p.mode = 'shadow' and p.pass_at >= k.resync) as t0c,
         (select t1 from clock) as t1
),
tenant as (
  -- The sweep sweeps every tenant (listTenantIdsForRetention).
  select t.id from public.tenants t
),
hb as (
  -- Every heartbeat since the Resync, either mode, with its Lisbon day and its
  -- 15-minute slot.
  select p.tenant_id, p.pass_id, p.mode, p.pass_at, p.look_ahead_before, p.due_count,
         p.recorded_count, p.over_ceiling, p.excluded_count, p.created_at,
         (p.pass_at at time zone 'Europe/Lisbon')::date as day,
         date_trunc('hour', p.pass_at at time zone 'Europe/Lisbon')
           + floor(extract(minute from p.pass_at at time zone 'Europe/Lisbon') / 15) * interval '15 minutes' as slot
    from public.reminder_sweep_passes p cross join k
   where p.pass_at >= k.resync
),
hb_day as (
  select fd.d, t.id as tenant_id,
         count(h.tenant_id) as beats,
         count(h.tenant_id) filter (where h.mode = 'shadow') as shadow_beats,
         count(distinct h.slot) filter (where h.mode = 'shadow'
           and h.slot::time >= time '07:00' and h.slot::time <= time '21:45') as slots
    from full_day fd
   cross join tenant t
    left join hb h on h.tenant_id = t.id and h.day = fd.d
   group by fd.d, t.id
),
hb_verdict as (
  select fd.d, fd.n,
         count(x.tenant_id) as tenants,
         count(x.tenant_id) filter (where x.beats = 60 and x.shadow_beats = 60 and x.slots = 60) as tenants_ok,
         coalesce(min(x.beats), 0) as min_beats, coalesce(max(x.beats), 0) as max_beats,
         coalesce(min(x.slots), 0) as min_slots, coalesce(max(x.slots), 0) as max_slots
    from full_day fd
    left join hb_day x on x.d = fd.d
   group by fd.d, fd.n
),
c_all as (
  -- The two writers' rows whose mark is due inside the window.
  select c.tenant_id, c.appointment_id, c.kind, c.offset_id, c.channel, c.starts_at, c.due_at,
         c.early, c.saved_after_mark, c.created_at,
         (c.due_at at time zone 'Europe/Lisbon')::date as day
    from public.reminder_claims c cross join win
   where c.due_at >= win.t0 and c.due_at <= win.t1
     and (c.kind = 'shadow' or (c.kind = 'claim' and c.taker = 'run'))
),
s as (
  select tenant_id, appointment_id, offset_id, channel, starts_at,
         min(due_at) as due_at, min(day) as day, min(created_at) as shadow_at,
         bool_or(saved_after_mark) as saved_after_mark
    from c_all where kind = 'shadow'
   group by tenant_id, appointment_id, offset_id, channel, starts_at
),
r as (
  select tenant_id, appointment_id, offset_id, channel, starts_at,
         min(due_at) as due_at, min(day) as day, min(created_at) as claimed_at
    from c_all where kind = 'claim' and early is distinct from true
   group by tenant_id, appointment_id, offset_id, channel, starts_at
),
r_early as (
  -- Reminders the sleeping job claimed ONLY early: no on-time claim and no
  -- shadow row for the same key. Never matched, never dropped: a run-only
  -- mismatch with its own label.
  select e.tenant_id, e.appointment_id, e.offset_id, e.channel, e.starts_at,
         min(e.due_at) as due_at, min(e.day) as day, min(e.created_at) as claimed_at
    from c_all e
   where e.kind = 'claim' and e.early = true
     and not exists (select 1 from r where r.tenant_id = e.tenant_id and r.appointment_id = e.appointment_id
                       and r.offset_id = e.offset_id and r.channel = e.channel and r.starts_at = e.starts_at)
     and not exists (select 1 from s where s.tenant_id = e.tenant_id and s.appointment_id = e.appointment_id
                       and s.offset_id = e.offset_id and s.channel = e.channel and s.starts_at = e.starts_at)
   group by e.tenant_id, e.appointment_id, e.offset_id, e.channel, e.starts_at
),
live as (
  -- THE CLAIM FAILS OPEN (reminder-claim.ts): on an error or a lock timeout the
  -- reminder is still handed over with no claim row. So every reminder ledger
  -- row inside the window with no claim of that appointment, offset and channel
  -- in the hour before it, and no shadow row of that reminder whose mark lies
  -- from 12 hours before it to 1 hour after it, is a send neither side holds:
  -- a live-only mismatch, always UNEXPLAINED. One per reminder and Lisbon day.
  select x.tenant_id, x.appointment_id, rm.offset_id, rm.channel,
         min(x.created_at) as sent_at, (x.created_at at time zone 'Europe/Lisbon')::date as day
    from public.reminder_dispatches x
    join reminder rm on rm.channel = x.channel and x.template_id like 'reminder.' || rm.offset_id || '.%'
   cross join win
   where x.created_at >= win.t0 and x.created_at <= win.t1
     and not exists (
       select 1 from public.reminder_claims e
        where e.tenant_id = x.tenant_id and e.appointment_id = x.appointment_id
          and e.kind = 'claim' and e.offset_id = rm.offset_id and e.channel = rm.channel
          and e.created_at <= x.created_at and e.created_at >= x.created_at - interval '1 hour')
     and not exists (
       select 1 from public.reminder_claims sh
        where sh.tenant_id = x.tenant_id and sh.appointment_id = x.appointment_id
          and sh.kind = 'shadow' and sh.offset_id = rm.offset_id and sh.channel = rm.channel
          and sh.due_at >= x.created_at - interval '12 hours' and sh.due_at <= x.created_at + interval '1 hour')
   group by x.tenant_id, x.appointment_id, rm.offset_id, rm.channel, (x.created_at at time zone 'Europe/Lisbon')::date
),
pair as (
  select coalesce(s.tenant_id, r.tenant_id) as tenant_id,
         coalesce(s.appointment_id, r.appointment_id) as appointment_id,
         coalesce(s.offset_id, r.offset_id) as offset_id,
         coalesce(s.channel, r.channel) as channel,
         coalesce(s.starts_at, r.starts_at) as starts_at,
         coalesce(s.due_at, r.due_at) as due_at,
         coalesce(s.day, r.day) as day,
         s.shadow_at, s.saved_after_mark, r.claimed_at, false as early_only,
         case when s.appointment_id is null then 'run_only'
              when r.appointment_id is null then 'shadow_only'
              else 'both' end as side,
         to_char(coalesce(s.starts_at, r.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as iso_start
    from s
    full join r
      on r.tenant_id = s.tenant_id and r.appointment_id = s.appointment_id
     and r.offset_id = s.offset_id and r.channel = s.channel and r.starts_at = s.starts_at
  union all
  select tenant_id, appointment_id, offset_id, channel, starts_at, due_at, day,
         null::timestamptz, null::boolean, claimed_at, true, 'run_only',
         to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from r_early
  union all
  select tenant_id, appointment_id, offset_id, channel, null::timestamptz, sent_at, day,
         null::timestamptz, null::boolean, null::timestamptz, false, 'live_only', null::text
    from live
),
r_out as (
  -- What each of the sleeping job's claims ended as: the first reminder row of
  -- the ledger for that appointment, channel and offset at or after the claim
  -- (the derivation of reminder-claim.ts claimIsHeld).
  select r.*, coalesce(d.outcome, 'no ledger row') as outcome, coalesce(d.suppression_reason, '') as reason
    from r
    left join lateral (
      select x.outcome, x.suppression_reason
        from public.reminder_dispatches x
       where x.tenant_id = r.tenant_id and x.appointment_id = r.appointment_id
         and x.channel = r.channel
         and x.template_id like 'reminder.' || r.offset_id || '.%'
         and x.created_at >= r.claimed_at
         -- and before the next live claim of this reminder, of any start.
         and not exists (
           select 1 from public.reminder_claims nx
            where nx.tenant_id = r.tenant_id and nx.appointment_id = r.appointment_id
              and nx.kind = 'claim' and nx.offset_id = r.offset_id and nx.channel = r.channel
              and nx.created_at > r.claimed_at and nx.created_at <= x.created_at
              and not exists (
                select 1 from public.reminder_claims rl
                 where rl.tenant_id = nx.tenant_id and rl.appointment_id = nx.appointment_id
                   and rl.kind = 'release' and rl.claim_id = nx.id))
       order by x.created_at, x.id
       limit 1) d on true
),
saves as (
  -- The audit trail of the visits that mismatch: each save's database time and
  -- what kind of save it was. Its metadata is read here and never printed.
  select l.tenant_id, l.entity_id as appointment_id, l.created_at,
         -- The new start as text, exactly as toISOString() writes it, and never cast:
         -- a malformed audit row (a month 13, a word) cannot stop the read.
         case when l.action = 'appointment.reschedule'
                   and l.metadata->>'startsAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
              then l.metadata->>'startsAt' end as new_start,
         (l.metadata->>'toStatus' in ('scheduled', 'confirmed')) as restored,
         (l.action = 'appointment.update' and l.metadata->>'via' = 'portal_request_confirm') as portal_confirm,
         (l.metadata->>'toStatus' is not null
          and l.metadata->>'toStatus' not in ('scheduled', 'confirmed')) as unremindable,
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
   where l.entity_type = 'appointment'
     and l.entity_id in (select appointment_id from pair where side <> 'both')
),
pc as (
  select p.*,
    case p.side
    when 'both' then null
    when 'shadow_only' then
      case
        when a.id is null then 'UNEXPLAINED'
        when date_trunc('milliseconds', a.starts_at) <> p.starts_at
             and p.shadow_at < p.due_at
             and exists (
               select 1 from saves v
                where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id
                  and v.new_start <> p.iso_start
                  and v.created_at > p.shadow_at and v.created_at <= p.due_at)
          then 'S3 moved after the 21:45 pass took its mark ahead'
        when exists (
          select 1 from public.reminder_dispatches x
           where x.tenant_id = p.tenant_id and x.appointment_id = p.appointment_id
             and x.channel = p.channel and x.template_id like 'reminder.' || p.offset_id || '.%'
             and x.created_at >= p.due_at - interval '10 minutes' and x.created_at <= p.starts_at
             -- No claim of this reminder, of ANY start, at or before that row: a row
             -- that another start's claim can own is not a claim that failed open.
             and not exists (
               select 1 from public.reminder_claims e
                where e.tenant_id = p.tenant_id and e.appointment_id = p.appointment_id
                  and e.kind = 'claim' and e.taker = 'run'
                  and e.offset_id = p.offset_id and e.channel = p.channel
                  and e.created_at <= x.created_at))
          then 'S4 a ledger row with no claim (the claim failed open)'
        when p.saved_after_mark
             and exists (
               select 1 from saves v
                where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id
                  and v.created_at > p.due_at and v.created_at <= p.shadow_at
                  and (v.new_start = p.iso_start
                       or (v.portal_confirm
                           and not exists (
                             select 1 from saves w
                              where w.tenant_id = p.tenant_id and w.appointment_id = p.appointment_id
                                and w.scheduling and w.created_at < p.due_at))))
          then 'S5 saved after its mark, before the pass'
        when p.due_at > win.t1 - interval '15 minutes' then 'S7 due in the 15 minutes before the read'
        else 'UNEXPLAINED'
      end
    when 'live_only' then 'UNEXPLAINED'
    else
      case
        when p.early_only then 'R7 claimed early only: no on-time claim, no shadow row'
        when a.id is null then 'UNEXPLAINED'
        when date_trunc('milliseconds', a.starts_at) <> p.starts_at
             and exists (
               select 1 from saves v
                where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id
                  and v.new_start <> p.iso_start
                  and v.created_at > p.claimed_at and v.created_at <= f.first_pass)
          then 'R1 moved after the claim, before the next pass'
        when exists (
          select 1 from r_out o
           where o.tenant_id = p.tenant_id and o.appointment_id = p.appointment_id
             and o.offset_id = p.offset_id and o.channel = p.channel and o.starts_at = p.starts_at
             and o.outcome = 'suppressed' and o.reason = 'status')
             and not exists (
               select 1 from saves v
                where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id and v.restored
                  and v.created_at > p.claimed_at and v.created_at < p.starts_at)
          then 'R2 suppressed by the sleeping job as not remindable'
        when a.created_at >= p.due_at then 'R3 created at or after its mark'
        when not exists (
          select 1 from saves v
           where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id and v.scheduling)
          then 'R4 never reminded: no scheduling save (switch off)'
        when not exists (
          select 1 from hb h
           where h.tenant_id = p.tenant_id and h.mode = 'shadow'
             and (h.pass_at >= p.due_at or h.look_ahead_before > p.due_at))
             and p.day not in (select d from full_day)
          then 'R5 no pass of the sweep since its mark'
        when exists (
          select 1 from saves v
           where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id
             and v.unremindable
             and v.created_at > p.due_at and v.created_at <= f.first_pass)
             and not exists (
               select 1 from saves v
                where v.tenant_id = p.tenant_id and v.appointment_id = p.appointment_id and v.restored
                  and v.created_at > p.claimed_at and v.created_at < p.starts_at)
          then 'R6 made not remindable between its mark and the next pass'
        else 'UNEXPLAINED'
      end
    end as category
    from pair p
   cross join win
    left join public.appointments a on a.id = p.appointment_id and a.tenant_id = p.tenant_id
    left join lateral (
      -- The first pass at or after the mark, on the database clock.
      select min(h.created_at) as first_pass from hb h
       where h.tenant_id = p.tenant_id and h.mode = 'shadow' and h.created_at >= p.due_at) f on true
),
-- ======================================================================================
-- R22 FROM HERE. Everything above is R20's, unchanged.
-- ======================================================================================
off_min as (
  -- apps/web/lib/reminders/offsets.ts REMINDER_OFFSETS: minutesBefore per offset.
  select v.offset_id, v.minutes
    from (values ('48h', 2880), ('24h', 1440)) as v(offset_id, minutes)
),
u as (
  -- The unexplained set: R20's run-only rows with category UNEXPLAINED, on every day.
  select p.tenant_id, p.appointment_id, p.offset_id, p.channel, p.starts_at, p.due_at, p.day,
         p.claimed_at, p.iso_start, om.minutes,
         'U' || lpad(row_number() over (order by p.due_at, p.appointment_id, p.offset_id)::text, 3, '0') as uk
    from pc p
    join off_min om on om.offset_id = p.offset_id
   where p.side = 'run_only' and p.category = 'UNEXPLAINED'
),
uv as (
  select distinct u.tenant_id, u.appointment_id from u
),
ev as (
  -- The audit trail of those visits, every tenant's rows, with the visit's own tenant flagged.
  -- Only the fields the reminder code reads, each reduced to a fixed word.
  select l.id, v.tenant_id, l.entity_id as appointment_id, l.created_at,
         (l.tenant_id = v.tenant_id) as same_tenant,
         case when l.action ~ '^appointment[.][a-z_]+$' then l.action else 'other' end as action,
         case when l.metadata->>'toStatus' is null then null
              when l.metadata->>'toStatus' in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
                then l.metadata->>'toStatus'
              else 'other' end as to_status,
         case when l.metadata->>'fromStatus' is null then null
              when l.metadata->>'fromStatus' in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
                then l.metadata->>'fromStatus'
              else 'other' end as from_status,
         case when l.action in ('appointment.create', 'appointment.reschedule')
                   and l.metadata->>'startsAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
              then l.metadata->>'startsAt' end as new_start,
         (l.action in ('appointment.create', 'appointment.reschedule')) as moves_or_books,
         case when l.metadata->>'via' is null then null
              when l.metadata->>'via' = 'portal_request_confirm' then 'portal_request_confirm'
              else 'other' end as via,
         -- reminder-population.ts hasSchedulingEvent, predicate by predicate (lines 90 to 106).
         (l.action in ('appointment.create', 'appointment.reschedule')) as arm_save,
         (l.action = 'appointment.update' and l.metadata->>'toStatus' in ('scheduled', 'confirmed')) as arm_status,
         (l.action = 'appointment.update' and l.metadata->>'via' = 'portal_request_confirm') as arm_portal,
         (l.action = 'appointment.sms_reply_reviewed'
          and l.metadata->>'resolution' = 'confirmed' and l.metadata->>'applied' = 'true') as arm_review,
         (l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' = 'confirmed') as arm_reply
    from public.audit_log l
    join uv v on v.appointment_id = l.entity_id
   where l.entity_type = 'appointment'
),
ev2 as (
  select e.*, (e.arm_save or e.arm_status or e.arm_portal or e.arm_review or e.arm_reply) as scheduling
    from ev e
),
pp as (
  -- One row per unexplained mark and per shadow pass of its tenant from 75 minutes before the
  -- mark to the claimed start, with every predicate of the selection as of that pass.
  select u.uk, u.tenant_id, u.appointment_id, u.offset_id, u.channel, u.starts_at, u.due_at, u.minutes,
         u.iso_start, h.pass_at, h.created_at as pass_c, h.look_ahead_before,
         h.due_count, h.recorded_count, h.excluded_count, h.over_ceiling,
         case when (h.pass_at at time zone 'Europe/Lisbon')::time >= time '21:45'
                   and ((h.pass_at at time zone 'Europe/Lisbon')::date + time '23:00') at time zone 'Europe/Lisbon' > h.pass_at
              then ((h.pass_at at time zone 'Europe/Lisbon')::date + time '23:00') at time zone 'Europe/Lisbon'
         end as la_calc,
         a.id is not null as p1,
         -- P2: the start the visit had at the pass.
         case
           when a.id is null then '?'
           when not exists (select 1 from ev2 e
                             where e.appointment_id = u.appointment_id and e.moves_or_books
                               and e.created_at > h.created_at)
             then to_char(a.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           else coalesce((select e.new_start from ev2 e
                           where e.appointment_id = u.appointment_id and e.moves_or_books
                             and e.created_at <= h.created_at
                           order by e.created_at desc, e.id desc limit 1), '?')
         end as start_at_pass,
         -- P3: the status at the pass.
         case
           when a.id is null then '?'
           else coalesce((select coalesce(e.from_status, '?') from ev2 e
                           where e.appointment_id = u.appointment_id and e.to_status is not null
                             and e.created_at > h.created_at
                           order by e.created_at, e.id limit 1), a.status::text)
         end as status_at_pass,
         u.starts_at > h.pass_at as p4,
         a.created_at < u.due_at as p6,
         exists (select 1 from ev2 e
                  where e.appointment_id = u.appointment_id and e.same_tenant and e.scheduling
                    and e.created_at <= h.created_at) as p7,
         exists (select 1 from ev2 e
                  where e.appointment_id = u.appointment_id and e.scheduling
                    and e.created_at <= h.created_at) as p7_any,
         not exists (select 1 from public.reminder_claims sh
                      where sh.tenant_id = u.tenant_id and sh.appointment_id = u.appointment_id
                        and sh.kind = 'shadow' and sh.offset_id = u.offset_id and sh.channel = u.channel
                        and sh.starts_at = u.starts_at and sh.created_at < h.created_at)
         and not exists (select 1 from public.reminder_claims cl
                          where cl.tenant_id = u.tenant_id and cl.appointment_id = u.appointment_id
                            and cl.kind = 'claim' and cl.taker = 'sweep'
                            and cl.offset_id = u.offset_id and cl.channel = u.channel
                            and cl.starts_at = u.starts_at and cl.early is distinct from true
                            and cl.created_at < h.created_at
                            and not exists (select 1 from public.reminder_claims rl
                                             where rl.tenant_id = cl.tenant_id and rl.appointment_id = cl.appointment_id
                                               and rl.kind = 'release' and rl.claim_id = cl.id)) as p8
    from u
    join hb h on h.tenant_id = u.tenant_id and h.mode = 'shadow'
             and h.pass_at >= u.due_at - interval '75 minutes' and h.pass_at < u.starts_at
    left join public.appointments a on a.id = u.appointment_id and a.tenant_id = u.tenant_id
),
pq as (
  select p.*,
         case when p.start_at_pass = '?' then '?' when p.start_at_pass = p.iso_start then 'T' else 'F' end as f2,
         case when p.status_at_pass = '?' then '?'
              when p.status_at_pass in ('scheduled', 'confirmed') then 'T' else 'F' end as f3,
         case when p.la_calc is null then p.starts_at <= p.pass_at + make_interval(mins => p.minutes)
              else p.starts_at < p.la_calc + make_interval(mins => p.minutes) end as p5,
         (p.la_calc is not distinct from p.look_ahead_before) as la_same
    from pp p
),
pr as (
  select q.*,
         (q.p4 and q.p5) as in_range,
         case when q.p1 and q.f2 = 'T' and q.f3 = 'T' and q.p4 and q.p5 and q.p6 and q.p7 and q.p8 then 'T'
              when not q.p1 or q.f2 = 'F' or q.f3 = 'F' or not q.p4 or not q.p5 or not q.p6 or not q.p7 or not q.p8 then 'F'
              else '?' end as every
    from pq q
),
summ as (
  select u.uk,
         count(r.pass_at) as passes,
         count(r.pass_at) filter (where r.in_range) as in_range,
         count(r.pass_at) filter (where r.in_range and not r.p1) as f1,
         count(r.pass_at) filter (where r.in_range and r.f2 = 'F') as f2,
         count(r.pass_at) filter (where r.in_range and r.f2 = '?') as u2,
         count(r.pass_at) filter (where r.in_range and r.f3 = 'F') as f3,
         count(r.pass_at) filter (where r.in_range and r.f3 = '?') as u3,
         count(r.pass_at) filter (where r.in_range and not r.p6) as f6,
         count(r.pass_at) filter (where r.in_range and not r.p7) as f7,
         count(r.pass_at) filter (where r.in_range and not r.p7_any) as f7_any,
         count(r.pass_at) filter (where r.in_range and not r.p8) as f8,
         count(r.pass_at) filter (where r.in_range and r.over_ceiling) as over,
         count(r.pass_at) filter (where r.every = 'T') as every_t,
         min(r.pass_at) filter (where r.every = 'T') as first_every
    from u
    left join pr r on r.uk = u.uk
   group by u.uk
),
verdict_in as (
  select (select count(*) from u) as marks,
         (select count(*) from u where u.day in (select d from full_day)) as full_marks,
         (select count(distinct u.appointment_id) from u where u.day in (select d from full_day)) as full_visits,
         (select count(*) from u where u.day = date '2026-10-29') as thu_marks,
         (select count(*) from u where u.day = date '2026-10-29'
             and u.appointment_id not in (select f.appointment_id from u f where f.day in (select d from full_day))) as thu_outside,
         (select count(*) from u where u.day not in (select d from full_day) and u.day <> date '2026-10-29') as other_marks,
         (select count(*) from summ where summ.passes = 0) as unevaluated,
         (select count(*) from u
           where not exists (select 1 from public.appointments a
                              where a.id = u.appointment_id and a.tenant_id = u.tenant_id)) as no_visit
),
lt as (
  -- Lisbon wall time, one format everywhere.
  select 'YYYY-MM-DD HH24:MI:SS'::text as f
)
select n, "check", observed, expected, verdict from (
  select '' as sk, 0 as n,
         '0. this transaction is READ ONLY (the server refuses writes)' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select '', 1,
         '1. the recomputed unexplained set (R20''s run-only UNEXPLAINED rows, every day from t0 to the read''s clock) is not empty',
         'unexplained marks ' || marks::text || '; of them on days other than Monday to Thursday ' || other_marks::text,
         'one or more',
         case when marks = 0 then 'VACUOUS' else 'OK' end
    from verdict_in
  union all
  select '', 2,
         '2. Monday 10-26 to Wednesday 10-28: the unexplained marks and visits R20 printed when GREEN ran it on 2026-10-30 18:18 Lisbon',
         'marks ' || full_marks::text || ' over visits ' || full_visits::text,
         'marks 8 over visits 6',
         case when marks = 0 then 'VACUOUS' when full_marks = 8 and full_visits = 6 then 'OK' else 'FAIL' end
    from verdict_in
  union all
  select '', 3,
         '3. Thursday 10-29: the unexplained marks R20 printed, both on visits of the Monday-to-Wednesday set',
         'marks ' || thu_marks::text || '; on a visit outside that set ' || thu_outside::text,
         'marks 2; 0',
         case when marks = 0 then 'VACUOUS' when thu_marks = 2 and thu_outside = 0 then 'OK' else 'FAIL' end
    from verdict_in
  union all
  select '', 4,
         '4. every unexplained mark has its visit row and is evaluated at one or more passes (rows 26)',
         'marks ' || marks::text || '; without a visit row ' || no_visit::text || '; with no pass ' || unevaluated::text,
         'marks > 0; 0; 0',
         case when marks = 0 then 'VACUOUS' when no_visit = 0 and unevaluated = 0 then 'OK' else 'FAIL' end
    from verdict_in
  union all
  select '', 10,
         'NOW: the row-level security policies on appointments and audit_log, the tables the selection reads as role authenticated with claims tenant_id and user_role admin and no user id (context.ts)',
         coalesce((select string_agg(pl.tablename || ': ' || pl.policyname || ' ' || pl.cmd || ' ' || pl.permissive
                                     || ' to ' || array_to_string(pl.roles, ','), '; ' order by pl.tablename, pl.policyname)
                     from pg_catalog.pg_policies pl
                    where pl.schemaname = 'public' and pl.tablename in ('appointments', 'audit_log')
                      and pl.cmd in ('SELECT', 'ALL')), 'none'),
         'NOW, not as of a pass',
         'INFO'
  union all
  select '', 11,
         'NOW: restrictive policies on appointments and audit_log, and row security switched on (a restrictive policy narrows every role; none is expected)',
         'restrictive ' || (select count(*) from pg_catalog.pg_policies pl
                             where pl.schemaname = 'public' and pl.tablename in ('appointments', 'audit_log')
                               and pl.permissive <> 'PERMISSIVE')::text
           || '; row security on appointments ' || (select c.relrowsecurity::text from pg_catalog.pg_class c
                                                    where c.oid = 'public.appointments'::regclass)
           || ', audit_log ' || (select c.relrowsecurity::text from pg_catalog.pg_class c
                                  where c.oid = 'public.audit_log'::regclass),
         'NOW, not as of a pass',
         'INFO'
  union all
  select u.uk, 20,
         u.uk || ' the mark',
         'appointment ' || u.appointment_id::text
           || ' | day ' || u.day::text || case when u.day in (select d from full_day) then ' (full day)' else ' (partial day)' end
           || ' | mark ' || to_char(u.due_at at time zone 'Europe/Lisbon', lt.f) || ' ' || u.offset_id || ' ' || u.channel
           || ' | claimed start ' || to_char(u.starts_at at time zone 'Europe/Lisbon', lt.f)
           || ' | claimed ' || to_char(u.claimed_at at time zone 'Europe/Lisbon', lt.f)
           || ' | the claim ended as ' || coalesce((select o.outcome || case when o.reason <> '' then ' (' || o.reason || ')' else '' end
                                                     from r_out o
                                                    where o.tenant_id = u.tenant_id and o.appointment_id = u.appointment_id
                                                      and o.offset_id = u.offset_id and o.channel = u.channel
                                                      and o.starts_at = u.starts_at
                                                    limit 1), 'not found'),
         'Lisbon times',
         'INFO'
    from u cross join lt
  union all
  select u.uk, 21,
         u.uk || ' the visit (NOW)',
         case when a.id is null then 'no visit row for this appointment under the claim''s tenant'
         else 'status ' || a.status::text
           || ' | origin ' || case when a.origin in ('staff', 'patient_portal') then a.origin else 'other' end
           || ' | location ' || coalesce(a.location_id::text, 'none') || ' ' || coalesce(lo.name, '(no location row)')
           || ' | start now ' || to_char(a.starts_at at time zone 'Europe/Lisbon', lt.f)
           || case when date_trunc('milliseconds', a.starts_at) = u.starts_at then ' (the claimed start)' else ' (NOT the claimed start)' end
           || ' | created ' || to_char(a.created_at at time zone 'Europe/Lisbon', lt.f)
           || ' | created minus mark ' || floor(extract(epoch from (a.created_at - u.due_at)) / 60)::bigint::text || ' min'
           || ' | updated ' || to_char(a.updated_at at time zone 'Europe/Lisbon', lt.f)
           || case when a.updated_at > u.due_at then ' (after the mark)' else ' (before the mark)' end
         end,
         'NOW',
         'INFO'
    from u cross join lt
    left join public.appointments a on a.id = u.appointment_id and a.tenant_id = u.tenant_id
    left join public.locations lo on lo.id = a.location_id and lo.tenant_id = a.tenant_id
  union all
  select u.uk, 22,
         u.uk || ' reminder_claims row written ' || to_char(c.created_at at time zone 'Europe/Lisbon', lt.f),
         case when c.kind in ('claim', 'release', 'shadow') then c.kind else 'other' end
           || case when c.kind = 'claim' then ' taker ' || coalesce(c.taker, 'none')
                     || case when c.early then ' early' else '' end
                     || ' attempt ' || coalesce(c.attempt::text, 'none') else '' end
           || ' | ' || c.offset_id || ' ' || c.channel
           || ' | start ' || coalesce(to_char(c.starts_at at time zone 'Europe/Lisbon', lt.f), 'none')
           || case when c.starts_at = u.starts_at then ' (this start)' when c.starts_at is null then '' else ' (another start)' end
           || ' | mark ' || coalesce(to_char(c.due_at at time zone 'Europe/Lisbon', lt.f), 'none')
           || case when c.kind = 'shadow' then ' | saved after mark ' || coalesce(c.saved_after_mark::text, 'none') else '' end
           || case when c.kind = 'release' then ' | releases a claim written '
                     || coalesce((select to_char(x.created_at at time zone 'Europe/Lisbon', lt.f)
                                    from public.reminder_claims x where x.id = c.claim_id), 'none') else '' end,
         'every kind, both offsets, any start',
         'INFO'
    from u cross join lt
    join public.reminder_claims c on c.tenant_id = u.tenant_id and c.appointment_id = u.appointment_id
  union all
  select u.uk, 23,
         u.uk || ' reminder ledger row written ' || to_char(x.created_at at time zone 'Europe/Lisbon', lt.f),
         case when x.template_id ~ '^reminder[.][0-9a-z]+[.][a-z]+$' then x.template_id else 'other' end
           || ' | ' || x.channel
           || ' | outcome ' || case when x.outcome ~ '^[a-z_]+$' then x.outcome else 'other' end
           || ' | reason ' || case when x.suppression_reason is null then 'none'
                                   when x.suppression_reason ~ '^[a-z_]+$' then x.suppression_reason else 'other' end,
         'both offsets',
         'INFO'
    from u cross join lt
    join public.reminder_dispatches x on x.tenant_id = u.tenant_id and x.appointment_id = u.appointment_id
                                      and x.template_id like 'reminder.%'
  union all
  select u.uk, 24,
         u.uk || ' audit ' || to_char(e.created_at at time zone 'Europe/Lisbon', lt.f) || ' ' || e.action,
         case when e.same_tenant then 'the visit''s tenant' else 'ANOTHER TENANT (the job''s context cannot read it)' end
           || ' | toStatus ' || coalesce(e.to_status, 'none')
           || ' | fromStatus ' || coalesce(e.from_status, 'none')
           || ' | startsAt ' || case when not e.moves_or_books then 'n/a'
                                     when e.new_start is null then 'none or not an instant'
                                     when e.new_start = u.iso_start then 'this start'
                                     else 'another start' end
           || ' | via ' || coalesce(e.via, 'none')
           || ' | scheduling save ' || case when e.scheduling then 'yes ('
                 || concat_ws(', ',
                      case when e.arm_save then 'create or reschedule' end,
                      case when e.arm_status then 'update toStatus scheduled or confirmed' end,
                      case when e.arm_portal then 'update via portal_request_confirm' end,
                      case when e.arm_review then 'sms_reply_reviewed confirmed applied' end,
                      case when e.arm_reply then 'patient_sms_reply confirmed' end) || ')'
               else 'no' end
           || case when e.created_at > u.due_at then ' | after the mark' else ' | before the mark' end,
         'scheduling fields only',
         'INFO'
    from u cross join lt
    join ev2 e on e.appointment_id = u.appointment_id
  union all
  select r.uk, 26,
         r.uk || ' pass ' || to_char(r.pass_at at time zone 'Europe/Lisbon', lt.f),
         'P1 tenant ' || case when r.p1 then 'T' else 'F' end
           || ' | P2 start ' || r.f2
           || ' | P3 status ' || r.f3 || ' (' || r.status_at_pass || ')'
           || ' | P4 ahead ' || case when r.p4 then 'T' else 'F' end
           || ' | P5 due ' || case when r.p5 then 'T' else 'F' end
           || case when r.la_calc is not null then ' (look-ahead)' else '' end
           || ' | P6 created ' || case when r.p6 then 'T' else 'F' end
           || ' | P7 scheduling ' || case when r.p7 then 'T' else 'F' end
           || ' (any tenant ' || case when r.p7_any then 'T' else 'F' end || ')'
           || ' | P8 not taken ' || case when r.p8 then 'T' else 'F' end
           || ' | EVERY ' || r.every
           || ' | heartbeat due ' || r.due_count::text || ', recorded ' || r.recorded_count::text
           || ', left out ' || r.excluded_count::text || ', over ceiling ' || r.over_ceiling::text
           || case when r.la_same then '' else ', look-ahead recorded differs from recomputed' end,
         'as of the pass',
         'INFO'
    from pr r cross join lt
  union all
  select s.uk, 27,
         s.uk || ' summary',
         'passes ' || s.passes::text || ', of them with the mark in range (P4 and P5) ' || s.in_range::text
           || ' | false at those: P1 ' || s.f1::text || ', P2 ' || s.f2::text || ' (? ' || s.u2::text || ')'
           || ', P3 ' || s.f3::text || ' (? ' || s.u3::text || ')'
           || ', P6 ' || s.f6::text || ', P7 ' || s.f7::text || ' (any tenant ' || s.f7_any::text || ')'
           || ', P8 ' || s.f8::text || ' | over the ceiling ' || s.over::text
           || ' | false at EVERY pass in range: '
           || case when s.in_range = 0 then 'no pass had the mark in range'
                   else coalesce(nullif(concat_ws(', ',
                          case when s.f1 = s.in_range then 'P1 tenant' end,
                          case when s.f2 = s.in_range then 'P2 start' end,
                          case when s.f3 = s.in_range then 'P3 status' end,
                          case when s.f6 = s.in_range then 'P6 created' end,
                          case when s.f7 = s.in_range then 'P7 scheduling' end,
                          case when s.f8 = s.in_range then 'P8 not taken' end), ''), 'none') end
           || ' | every predicate held at ' || s.every_t::text || ' passes'
           || case when s.first_every is not null
                   then ', first ' || to_char(s.first_every at time zone 'Europe/Lisbon', lt.f) else '' end,
         'the cause is the predicate false at every pass in range',
         'INFO'
    from summ s cross join lt
) out
order by sk, n, "check";

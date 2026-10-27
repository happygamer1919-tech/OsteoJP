-- SHADOW-READ, 2026-10-29: DID THE REMINDER SWEEP'S SHADOW AGREE WITH THE SLEEPING
-- JOB, MONDAY 2026-10-26 TO WEDNESDAY 2026-10-28. Strategy's R20 of 2026-10-26:
-- the comparison read becomes a repository file with OK / VACUOUS / FAIL verdicts,
-- run by GREEN on Thursday 2026-10-29 after 07:15 Lisbon. It is the evidence for
-- the Thursday decision on the sweep's send mode; it decides nothing itself.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside
-- `begin read only` ... `rollback`, so the server refuses any write. Verdict 0
-- reads the transaction's own setting.
--
-- WHAT IT PRINTS: ONE result set (the Supabase SQL editor shows only the last
-- result), ordered by `n`, columns n | check | observed | expected | verdict.
-- Verdicts are OK, VACUOUS or FAIL; rows that only inform read INFO and are
-- never counted. It prints counts, Lisbon times, the fixed labels of offsets,
-- channels, ledger outcomes and suppression reasons, and, in the mismatch list
-- only, appointment ids (at most 500 a side). No tenant id, no patient id, no
-- staff id, no name, no phone, no email address, no message text, no note.
--
-- WHAT IT COMPARES (apps/web/lib/reminders on origin/main at 38721f0b; a change
-- to that code changes this read's meaning):
--   shadow    a `reminder_claims` row of kind `shadow`: the sweep, switched to
--             shadow, would have handed this reminder (appointment, offset,
--             channel, START) to the dispatcher (sweep.ts sweepTenantInShadow).
--   run       a `reminder_claims` row of kind `claim`, taker `run`, not
--             `early`: the sleeping job (send-appointment-reminder) woke at the
--             mark and took the reminder for the start the visit had then
--             (dispatch.ts dispatchReminderInner -> reminder-claim.ts
--             takeReminderClaim). It claims BEFORE every gate, so a claim is
--             "the sleeping job acted", not "a message went out"; what it ended
--             as is read from `reminder_dispatches` (the first reminder row of
--             that appointment, channel and offset at or after the claim).
--   the key   tenant, appointment, offset, channel and start, exactly as both
--             writers store it (the start to the millisecond). Both store the
--             mark as `due_at` = start minus the offset, so a mark's Lisbon day
--             is the same on both sides.
--   heartbeat a `reminder_sweep_passes` row: one per tenant per pass. A tenant
--             whose pass failed has NO row for it (sweep.ts), so "no pass with
--             an error" is "60 heartbeats in 60 slots", nothing else.
--
-- THE WINDOW. From t0, the first `shadow` heartbeat at or after the owner's
-- Resync (2026-10-25 15:15:19 Lisbon), to the read's clock. The verdicts cover
-- the marks due on the three full Lisbon days Monday 2026-10-26, Tuesday
-- 2026-10-27 and Wednesday 2026-10-28 (60 passes each, 07:00 to 21:45). Sunday
-- (partial) and Thursday (partial) are INFO. A mark due after 23:00 is taken
-- by the next morning's 07:00 pass, so the read refuses to vouch before
-- Thursday 07:15 Lisbon (verdict 1): that pass has run and written by then.
--
-- TWO CLOCKS, KEPT APART. `pass_at` is the pass's own clock (the application's);
-- `created_at` is the database's, and a heartbeat and the shadow rows of its pass
-- share one `created_at` (one transaction). The window of MARKS starts at t0
-- (pass_at). Everything compared with a row's `created_at` (verdict 8, verdicts 9
-- and 10, and the time bounds of the categories) uses t0c, the database
-- `created_at` of the first shadow heartbeat since the Resync, and the
-- `created_at` of the heartbeats.
--
-- ONE CLOCK. The read's clock is `clock.t1` below, read once from now(). A
-- rehearsal on a throwaway replaces that one line with a fixed instant; nothing
-- else in the file reads the time.
--
-- A ZERO IS NEVER A PASS. A verdict whose subject is empty reads VACUOUS, and
-- one whose fault is seen directly reads FAIL first. Every predicate on t0 is
-- guarded: when no shadow heartbeat exists, t0 is NULL, every set built on it
-- is empty, and the verdicts that read those sets say VACUOUS, never OK.
--
-- NO CATEGORY CAN MAKE A VERDICT OK (R4 round 3). An agreement verdict is OK only
-- with at least one match and ZERO mismatches of any kind. A mismatch carries a
-- CANDIDATE label, a reading for the human who reads it, or UNEXPLAINED:
--   REVIEW  at least one match, mismatches present, every one labelled. REVIEW
--           is not a pass: SOLO and strategy read every listed mismatch.
--   FAIL    any UNEXPLAINED mismatch.   VACUOUS  no match.
-- The labels (letters are kept stable; a withdrawn letter is never reused):
-- shadow only (the sweep would send, the sleeping job made no on-time claim):
--   S1  WITHDRAWN in R4 round 3 (an early claim of this start); counted, row 34
--   S2  WITHDRAWN in R4 round 2 (a claim of another start)
--   S3  the 21:45 pass took the mark ahead, and an `appointment.reschedule` save
--       whose new start (metadata startsAt) differs from this start lies after
--       that pass and at or before the mark; the start now differs
--   S4  a reminder ledger row exists for it, and no claim of this reminder of
--       any start was written at or before that row (the claim fails open:
--       reminder-claim.ts "IT FAILS OPEN")
--   S5  the shadow row says the visit was saved after its mark, and between the
--       mark and the pass lies either an `appointment.reschedule` TO this start
--       (metadata startsAt equal to it), or an `appointment.update` via
--       `portal_request_confirm` on a visit with no scheduling save before the
--       mark. The sweep takes any untaken mark while the visit is still ahead
--       (sweep.ts, NO GRACE); the re-armed job dropped the past mark
--   S6  WITHDRAWN in R4 round 2 (a save after a look-ahead)
--   S7  due in the 15 minutes before the read
-- sent with neither (live only): a reminder ledger row inside the window with no
--   claim of that reminder in the hour before it and no shadow row of it (the
--   claim fails open, reminder-claim.ts). Always UNEXPLAINED: the day FAILs.
-- run only (the sleeping job claimed, the shadow has no row for that start):
--   R1  an `appointment.reschedule` save whose new start differs from this start
--       lies after the claim and at or before the first pass at or after the
--       mark; the start now differs
--   R2  the sleeping job suppressed it with reason `status` (not remindable at
--       its mark), and no save set it back to `scheduled` or `confirmed` after
--       the claim and before the start. Only `status`: the sweep does not apply
--       the unaccepted-request gate (sweep.ts, "WHAT A SHADOW ROW MEANS")
--   R3  the visit was created at or after its mark (the sweep's rule)
--   R4  no scheduling save on its audit trail: left out by the switch
--       REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER = false (reminder-population.ts)
--   R5  partial days only: no pass of the sweep for that tenant at or after its
--       mark
--   R6  a change to a status that is not remindable lies after its mark, at or
--       before the first pass at or after it, and no save set it back to
--       `scheduled` or `confirmed` after the claim and before the start
--   R7  the sleeping job claimed this start ONLY early: no on-time claim and no
--       shadow row (never dropped; at least REVIEW)
-- "A scheduling save" is reminder-population.ts hasSchedulingEvent, predicate by
-- predicate; "a status that is not remindable" is an audit row whose metadata
-- toStatus is set and is neither `scheduled` nor `confirmed`. A reschedule's new
-- start is compared as TEXT, exactly as toISOString() writes it, and never cast,
-- so a malformed audit row cannot stop the read; any other shape is not a move. A label's time bounds are read on the database clock.
--
-- VERDICTS (OK, REVIEW, VACUOUS or FAIL; the block succeeds on 0 FAIL, 0
-- VACUOUS and verdicts 0 to 10 all OK, and only 17 OK / 0 VACUOUS / 0 FAIL is a
-- PASS; any REVIEW is reported as REVIEW):
--    0  the transaction is READ ONLY
--    1  the clock: the read runs at or after 2026-10-29 07:15 Lisbon
--    2  the window: a shadow heartbeat exists after the Resync, no later than
--       Monday's 07:00 slot
--  3-5  heartbeats, Monday, Tuesday, Wednesday: every tenant has 60 shadow
--       heartbeats in the 60 slots 07:00 to 21:45
--    6  the shadow sent nothing: no `send` heartbeat and no claim by taker
--       `sweep` since the Resync
--    7  no pass over the ceiling on the three full days
--    8  the heartbeats account for every shadow row (same transaction)
--    9  no mark taken twice by the shadow
--   10  nothing falls out of the comparison: every shadow row and sleeping-job
--       claim since t0 has a mark and a known offset and channel, and so does
--       every such row and every reminder send inside the window
-- 11-16 agreement, per full day and per reminder (48h email, 24h sms): OK with
--       at least one match and no mismatch; REVIEW, FAIL or VACUOUS as above
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -f scripts/db/read-shadow-compare-20261029.sql -c "rollback"
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
agree as (
  select fd.d, fd.n as dn, rm.offset_id, rm.channel, rm.n as rn,
         count(m.appointment_id) filter (where m.side = 'both') as matched,
         count(m.appointment_id) filter (where m.side = 'shadow_only') as shadow_only,
         count(m.appointment_id) filter (where m.side = 'shadow_only' and m.category = 'UNEXPLAINED') as shadow_unexplained,
         count(m.appointment_id) filter (where m.side = 'run_only') as run_only,
         count(m.appointment_id) filter (where m.side = 'run_only' and m.category = 'UNEXPLAINED') as run_unexplained,
         count(m.appointment_id) filter (where m.side = 'live_only') as live_only
    from full_day fd
   cross join reminder rm
    left join pc m on m.day = fd.d and m.offset_id = rm.offset_id and m.channel = rm.channel
   group by fd.d, fd.n, rm.offset_id, rm.channel, rm.n
),
since_t0 as (
  -- Every shadow row and sleeping-job claim WRITTEN since t0, whatever its mark.
  select c.tenant_id, c.appointment_id, c.kind, c.offset_id, c.channel, c.starts_at, c.due_at, c.created_at
    from public.reminder_claims c cross join win
   where c.created_at >= win.t0c
     and (c.kind = 'shadow' or (c.kind = 'claim' and c.taker = 'run'))
),
sent_nothing as (
  select (select count(*) from hb where hb.mode = 'send') as send_beats,
         (select count(*) from public.reminder_claims c cross join k
           where c.kind = 'claim' and c.taker = 'sweep' and c.created_at >= k.resync) as sweep_claims
),
ceiling as (
  select count(*) filter (where h.mode = 'shadow') as beats,
         count(*) filter (where h.mode = 'shadow' and h.over_ceiling) as over
    from hb h join full_day fd on fd.d = h.day
),
sh_tx as (
  select tenant_id, created_at, count(*) as n
    from since_t0 where kind = 'shadow'
   group by tenant_id, created_at
),
hb_tx as (
  select h.tenant_id, h.created_at, sum(h.recorded_count) as recorded
    from hb h cross join win
   where h.mode = 'shadow' and h.created_at >= win.t0c
   group by h.tenant_id, h.created_at
),
acct as (
  select count(*) filter (where h.tenant_id is null) as rows_without_beat,
         count(*) filter (where x.tenant_id is null and h.recorded > 0) as beats_without_rows,
         count(*) filter (where x.n <> h.recorded) as counts_differ,
         coalesce(sum(x.n), 0) as shadow_rows,
         coalesce(sum(h.recorded), 0) as recorded,
         count(h.tenant_id) as beat_groups
    from sh_tx x
    full join hb_tx h on h.tenant_id = x.tenant_id and h.created_at = x.created_at
),
twice as (
  select count(*) as keys,
         count(*) filter (where n > 1) as taken_twice
    from (select count(*) as n from since_t0 where kind = 'shadow'
           group by tenant_id, appointment_id, offset_id, channel, starts_at) z
),
marked as (
  select count(*) as rows_written,
         count(*) filter (where z.due_at is null
                            or not exists (select 1 from reminder rm
                                            where rm.offset_id = z.offset_id and rm.channel = z.channel)) as unplaced,
         -- The comparison window (by mark) must drop nothing either.
         (select count(*) from c_all c
           where not exists (select 1 from reminder rm
                              where rm.offset_id = c.offset_id and rm.channel = c.channel)) as window_unplaced,
         -- Nor may a reminder send of an offset and channel the read does not know.
         (select count(*) from public.reminder_dispatches x cross join win
           where x.created_at >= win.t0 and x.created_at <= win.t1
             and x.template_id like 'reminder.%'
             and not exists (select 1 from reminder rm
                              where rm.channel = x.channel and x.template_id like 'reminder.' || rm.offset_id || '.%')) as ledger_unplaced
    from since_t0 z
),
summary as (
  select coalesce(sum(matched), 0) as matched,
         coalesce(sum(shadow_only), 0) as shadow_only,
         coalesce(sum(shadow_unexplained), 0) as shadow_unexplained,
         coalesce(sum(run_only), 0) as run_only,
         coalesce(sum(run_unexplained), 0) as run_unexplained,
         coalesce(sum(live_only), 0) as live_only
    from agree
),
lisbon as (
  select to_char(win.t0 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as t0,
         to_char(win.t1 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as t1,
         (select to_char(max(h.pass_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')
            from hb h where h.mode = 'shadow') as last_beat
    from win
)
select n, "check", observed, expected, verdict from (
  select 0 as n,
         '0. this transaction is READ ONLY (the server refuses writes)' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select 1,
         '1. the clock: the read runs at or after 2026-10-29 07:15 Lisbon, when the window has closed',
         'Lisbon ' || lisbon.t1,
         'at or after 2026-10-29 07:15:00',
         case when clock.t1 >= k.closes then 'OK' else 'FAIL' end
    from clock cross join k cross join lisbon
  union all
  select 2,
         '2. the window: the first shadow heartbeat after the Resync (2026-10-25 15:15:19 Lisbon), no later than Monday''s 07:00 slot',
         'Lisbon ' || coalesce(lisbon.t0, 'none'),
         'a heartbeat before 2026-10-26 07:15',
         case when win.t0 is null then 'VACUOUS'
              when win.t0 < k.first_full_pass + interval '15 minutes' then 'OK'
              else 'FAIL' end
    from win cross join k cross join lisbon
  union all
  select 3 + v.n,
         (3 + v.n)::text || '. heartbeats on ' || v.d::text || ': every tenant has 60 shadow heartbeats in the 60 slots 07:00 to 21:45 (a failed pass leaves none)',
         'tenants ' || v.tenants::text || ', of them complete ' || v.tenants_ok::text
           || '; heartbeats ' || v.min_beats::text || ' to ' || v.max_beats::text
           || '; slots ' || v.min_slots::text || ' to ' || v.max_slots::text,
         'every tenant: 60 heartbeats, 60 slots',
         case when v.tenants = 0 then 'VACUOUS'
              when v.tenants_ok = v.tenants then 'OK'
              else 'FAIL' end
    from hb_verdict v
  union all
  select 6,
         '6. the shadow sent nothing: no send heartbeat and no claim by taker sweep since the Resync',
         'send heartbeats ' || send_beats::text || '; sweep claims ' || sweep_claims::text,
         '0; 0 (with shadow heartbeats present)',
         case when send_beats > 0 or sweep_claims > 0 then 'FAIL'
              when (select t0 from win) is null then 'VACUOUS'
              else 'OK' end
    from sent_nothing
  union all
  select 7,
         '7. no pass over the ceiling of 50 marks on the three full days',
         'over the ceiling ' || over::text || ' of ' || beats::text || ' shadow heartbeats',
         '0 of 180 or more',
         case when beats = 0 then 'VACUOUS' when over = 0 then 'OK' else 'FAIL' end
    from ceiling
  union all
  select 8,
         '8. the heartbeats account for every shadow row: each pass''s recorded count equals the shadow rows of its transaction, since t0',
         'shadow rows ' || shadow_rows::text || '; recorded ' || recorded::text
           || '; rows with no heartbeat ' || rows_without_beat::text
           || '; heartbeats with missing rows ' || beats_without_rows::text
           || '; counts that differ ' || counts_differ::text,
         'shadow rows > 0; recorded equal; 0; 0; 0',
         case when beat_groups = 0 or shadow_rows = 0 then 'VACUOUS'
              when rows_without_beat = 0 and beats_without_rows = 0 and counts_differ = 0
                   and shadow_rows = recorded then 'OK'
              else 'FAIL' end
    from acct
  union all
  select 9,
         '9. no mark taken twice by the shadow (appointment, offset, channel, start), since t0',
         'marks ' || keys::text || '; taken more than once ' || taken_twice::text,
         'marks > 0; 0',
         case when taken_twice > 0 then 'FAIL' when keys = 0 then 'VACUOUS' else 'OK' end
    from twice
  union all
  select 10,
         '10. nothing falls out of the comparison: every row written since t0 has a mark and a known reminder, and so does every row and reminder send in the window',
         'rows ' || rows_written::text || '; without a mark or with an unknown reminder ' || unplaced::text
           || '; window rows with an unknown reminder ' || window_unplaced::text
           || '; reminder sends with an unknown reminder ' || ledger_unplaced::text,
         'rows > 0; 0; 0; 0',
         case when unplaced > 0 or window_unplaced > 0 or ledger_unplaced > 0 then 'FAIL'
              when rows_written = 0 then 'VACUOUS' else 'OK' end
    from marked
  union all
  select 11 + a.dn * 2 + a.rn,
         (11 + a.dn * 2 + a.rn)::text || '. agreement, marks due ' || a.d::text || ', ' || a.offset_id || ' ' || a.channel
           || ': the shadow and the sleeping job took the same reminders (OK only with no mismatch)',
         'both ' || a.matched::text || '; shadow only ' || a.shadow_only::text
           || ' (unexplained ' || a.shadow_unexplained::text || '); run only ' || a.run_only::text
           || ' (unexplained ' || a.run_unexplained::text || '); sent with neither ' || a.live_only::text,
         'both > 0; shadow only 0; run only 0; sent with neither 0',
         case when (select t0 from win) is null then 'VACUOUS'
              when a.shadow_unexplained > 0 or a.run_unexplained > 0 or a.live_only > 0 then 'FAIL'
              when a.matched = 0 then 'VACUOUS'
              when a.shadow_only > 0 or a.run_only > 0 then 'REVIEW'
              else 'OK' end
    from agree a
  union all
  select 20, 'window: first shadow heartbeat, the read''s clock, the last shadow heartbeat (Lisbon)',
         coalesce(t0, 'none') || ' | ' || t1 || ' | ' || coalesce(last_beat, 'none'),
         'information', 'INFO'
    from lisbon
  union all
  select 21, 'heartbeats on ' || h.day::text || ': tenants, rows, shadow rows, slots, outside 07:00 to 21:45, due, recorded, over the ceiling, left out (a level)',
         count(distinct h.tenant_id)::text || ', ' || count(*)::text || ', '
           || (count(*) filter (where h.mode = 'shadow'))::text || ', '
           || count(distinct h.slot)::text || ', '
           || (count(*) filter (where h.slot::time < time '07:00' or h.slot::time > time '21:45'))::text || ', '
           || sum(h.due_count)::text || ', ' || sum(h.recorded_count)::text || ', '
           || (count(*) filter (where h.over_ceiling))::text || ', ' || sum(h.excluded_count)::text,
         case when h.day in (select d from full_day) then 'full day: 60 per tenant' else 'partial day' end,
         'INFO'
    from hb h
   group by h.day
  union all
  select 22, 'passes on ' || fd.d::text || ' (R11): distinct pass ids, heartbeat rows, heartbeats with no pass id, tenants per pass min and max, shadow rows written',
         (select count(distinct h.pass_id) from hb h where h.day = fd.d and h.mode = 'shadow')::text || ', '
           || (select count(*) from hb h where h.day = fd.d and h.mode = 'shadow')::text || ', '
           || (select count(*) from hb h where h.day = fd.d and h.mode = 'shadow' and h.pass_id is null)::text || ', '
           || coalesce((select min(z.n)::text || ' to ' || max(z.n)::text
                          from (select count(distinct h.tenant_id) as n from hb h
                                 where h.day = fd.d and h.mode = 'shadow' and h.pass_id is not null
                                 group by h.pass_id) z), 'none') || ', '
           || (select count(*) from public.reminder_claims c
                where c.kind = 'shadow'
                  and (c.created_at at time zone 'Europe/Lisbon')::date = fd.d)::text,
         'information', 'INFO'
    from full_day fd
  union all
  select 30, 'compare, marks due ' || p.day::text || ', ' || p.offset_id || ' ' || p.channel || ': both, shadow only, run only',
         (count(*) filter (where p.side = 'both'))::text || ', '
           || (count(*) filter (where p.side = 'shadow_only'))::text || ', '
           || (count(*) filter (where p.side = 'run_only'))::text,
         case when p.day in (select d from full_day) then 'full day' else 'partial day' end,
         'INFO'
    from pc p
   group by p.day, p.offset_id, p.channel
  union all
  select 31, 'mismatch label, marks due ' || p.day::text || ', ' || p.offset_id || ' ' || p.channel || ', ' || p.side || ': ' || p.category,
         count(*)::text,
         case when p.day in (select d from full_day) then 'full day: a candidate label, read every one' else 'partial day' end,
         'INFO'
    from pc p
   where p.side <> 'both'
   group by p.day, p.offset_id, p.channel, p.side, p.category
  union all
  select 32, 'sleeping-job claims, marks due ' || o.day::text || ', ' || o.offset_id || ' ' || o.channel || ', ended as: '
           || o.outcome || case when o.reason <> '' then ' (' || o.reason || ')' else '' end,
         count(*)::text, 'information', 'INFO'
    from r_out o
   group by o.day, o.offset_id, o.channel, o.outcome, o.reason
  union all
  select 33, 'sleeping-job claims in the window: early claims, reminders claimed more than once for one start, releases',
         (select count(*) from c_all where kind = 'claim' and early = true)::text || ', '
           || (select count(*) from (select 1 from c_all where kind = 'claim'
                                      group by tenant_id, appointment_id, offset_id, channel, starts_at
                                     having count(*) > 1) z)::text || ', '
           || (select count(*) from public.reminder_claims rl
                where rl.kind = 'release'
                  and exists (select 1 from c_all cc join public.reminder_claims cl
                                on cl.tenant_id = cc.tenant_id and cl.appointment_id = cc.appointment_id
                               and cl.offset_id = cc.offset_id and cl.channel = cc.channel
                               and cl.starts_at = cc.starts_at and cl.kind = 'claim'
                               where cc.kind = 'claim' and cl.id = rl.claim_id))::text,
         'information', 'INFO'
  union all
  select 34, 'shadow-only rows whose start the sleeping job claimed early (the withdrawn S1), full days and partial days',
         (count(*) filter (where p.day in (select d from full_day)))::text || ', '
           || (count(*) filter (where p.day not in (select d from full_day)))::text,
         'information', 'INFO'
    from pc p
   where p.side = 'shadow_only'
     and exists (
       select 1 from public.reminder_claims e
        where e.tenant_id = p.tenant_id and e.appointment_id = p.appointment_id
          and e.kind = 'claim' and e.taker = 'run' and e.early = true
          and e.offset_id = p.offset_id and e.channel = p.channel and e.starts_at = p.starts_at)
  union all
  select 40, 'SHADOW_SUMMARY',
         'full days 2026-10-26 to 2026-10-28: both=' || matched::text
           || ' shadow_only=' || shadow_only::text || ' shadow_unexplained=' || shadow_unexplained::text
           || ' run_only=' || run_only::text || ' run_unexplained=' || run_unexplained::text
           || ' sent_with_neither=' || live_only::text
           || ' matched_share=' || case when matched + shadow_only + run_only + live_only = 0 then 'none'
                                       else round(100.0 * matched / (matched + shadow_only + run_only + live_only), 1)::text || '%' end,
         'OK only with no mismatch; the candidate labels are rows 31, every mismatch is in rows 50 to 52',
         'INFO'
    from summary
  union all
  select n, "check", observed, 'information', 'INFO' from (
    select case side when 'shadow_only' then 50 when 'run_only' then 51 else 52 end as n,
           side || ' ' || to_char(due_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') || ' ' || offset_id || ' ' || channel as "check",
           appointment_id::text || ' | ' || category as observed,
           row_number() over (partition by side
                              order by (category = 'UNEXPLAINED') desc, due_at, appointment_id) as rk
      from pc
     where side <> 'both'
  ) m
   where rk <= 500
) out
order by n, "check";

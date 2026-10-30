-- SHADOW-COMPARE, 2026-10-31: THE REMINDER SWEEP'S SHADOW AGAINST THE SLEEPING JOB, RE-RUN OVER
-- EVERY LISBON DAY FROM MONDAY 2026-10-26 TO THE READ'S OWN CLOCK, WITH ONE NEW RUN-ONLY LABEL.
-- R20 (scripts/db/read-shadow-compare-20261029.sql) found run-only marks none of its labels
-- explains; R22 (scripts/db/read-sweep-unexplained-20261030.sql, pull request #1672) found, for
-- every one of them, that the sweep's selection predicate P7 (a scheduling save of the visit's own
-- tenant, as of the pass) was false at every pass that had the mark in range while every other
-- predicate held. This read re-runs R20's comparison and gives that shape a name, R8, placed
-- after every R20 label and before UNEXPLAINED. It decides nothing itself.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside `begin read only` ...
-- `rollback`, so the server refuses any write. Verdict 0 reads the transaction's own setting.
--
-- WHAT IT PRINTS: ONE result set, ordered by `n`, columns n | check | observed | expected |
-- verdict. Verdicts are OK, REVIEW, VACUOUS or FAIL; rows that only inform read INFO and are never
-- counted. It prints counts, Lisbon times, the fixed labels of offsets, channels, ledger outcomes
-- and suppression reasons, and, in the mismatch list only, appointment ids (at most 500 a side).
-- No tenant id, no patient id, no staff id, no name, no phone, no email address, no message text,
-- no note, and no audit metadata text (metadata is compared, never printed).
--
-- HOW IT IS BUILT. Three parts, in this order:
--   1. R20, from `clock as (` to the end of `pc`: a copy of
--      scripts/db/read-shadow-compare-20261029.sql lines 145 to 444 (at e604854b, merged as #1670)
--      with exactly two substitutions, both named in scripts/read-shadow-compare-20261031.test.mjs,
--      which fails on any other difference: `k.closes` reads 2026-10-30 07:15 Lisbon (one line),
--      and the body of `full_day` (two lines) is every Lisbon day from Monday 2026-10-26 that has
--      closed by the read's clock (below). Everything else, the window, the sides, the key and the
--      candidate labels S3 to S7 and R1 to R7, is byte for byte R20's; R2 and R4 are unchanged.
--   2. R22, from `off_min as (` to the end of `summ`: a byte-for-byte copy of
--      scripts/db/read-sweep-unexplained-20261030.sql lines 413 to 586 at 3a7a0686 (the head of
--      #1672). It evaluates the sweep's selection predicates P1 to P8 as of each pass, for every
--      run-only UNEXPLAINED mark of part 1, on every day. The test pins that span's sha256.
--   3. This read's own: `r8` and `pcl` (the labelled comparison), then the verdicts and the rows.
--
-- THE NEW LABEL (run only, after R7 and before UNEXPLAINED):
--   R8  a run-only mark R20 leaves UNEXPLAINED whose visit had no scheduling save of its own
--       tenant at or before ANY pass that had the mark in range, while every other predicate held
--       at every such pass. In R22's words: at least one pass had the mark in range (P4 and P5),
--       P7 scheduling was false at every one of them, and P1 tenant, P2 start, P3 status, P6
--       created and P8 not taken were true (never false, never unknown) at every one of them, and
--       every one of them recorded the sweep leaving at least one visit out (its heartbeat's
--       `excluded_count` above 0: the sweep's own testimony that its scheduling-save rule ran). The
--       sweep's `selectDueMarks` (apps/web/lib/reminders/sweep.ts) requires `hasSchedulingEvent`
--       (reminder-population.ts) while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false; the
--       sleeping job never did. So the sweep skips such a visit BY DESIGN while that switch is
--       off. R4 (no scheduling save on the trail at all) still comes first: R8 is the visit whose
--       only scheduling save came after the last pass that could take the mark.
--   Like every label, R8 is a candidate reading, never a pass: a day with an R8 mark reads REVIEW.
--
-- THE DAYS. From t0, the first `shadow` heartbeat at or after the owner's Resync (2026-10-25
-- 15:15:19 Lisbon), to the read's clock. A Lisbon day d from Monday 2026-10-26 is FULL once the
-- read's clock is at or after d + 1 at 07:15 Lisbon: a mark due after 23:00 is taken by the next
-- morning's 07:00 pass, and by 07:15 that pass has run and written. Every full day gets its own
-- heartbeat verdict and its two agreement verdicts. Sunday 10-25 (from t0) and the day or days
-- after the last full day (to the read's clock) are partial: INFO, except verdict 13, which reads
-- every day.
--
-- ONE CLOCK. The read's clock is `clock.t1` below, read once from now(). A rehearsal on a
-- throwaway replaces that one line with a fixed instant; nothing else in the file reads the time.
--
-- A ZERO IS NEVER A PASS. A verdict whose subject is empty reads VACUOUS, and one whose fault is
-- seen directly reads FAIL first. When no shadow heartbeat exists, t0 is NULL, every set built on
-- it is empty, and the verdicts that read those sets say VACUOUS, never OK.
--
-- VERDICTS (the block succeeds on 0 FAIL, 0 VACUOUS, every verdict other than 11 and 12 OK, one
-- row each of 0, 1, 2, 6 to 10, 13 and 14, and as many rows of 3, of 11 and of 12 as there are
-- full days, at least 4; any REVIEW is reported as REVIEW, never PASSED):
--    0  the transaction is READ ONLY
--    1  the clock: the read runs at or after 2026-10-30 07:15 Lisbon (Thursday 10-29 has closed)
--    2  the window: a shadow heartbeat exists after the Resync, no later than Monday's 07:00 slot
--    3  heartbeats, ONE ROW PER FULL DAY: every tenant has 60 shadow heartbeats in the 60 slots
--       07:00 to 21:45 (R20's verdicts 3 to 5, carried to every full day)
--    6  the shadow sent nothing: no `send` heartbeat and no claim by taker `sweep` since the Resync
--    7  no pass over the ceiling on the full days
--    8  the heartbeats account for every shadow row (same transaction)
--    9  no mark taken twice by the shadow
--   10  nothing falls out of the comparison (R20's verdict 10, unchanged)
--   11  agreement, 48h email, ONE ROW PER FULL DAY   } R20's verdicts 11 to 16: OK with at least one
--   12  agreement, 24h sms, ONE ROW PER FULL DAY     } match and no mismatch; REVIEW, FAIL, VACUOUS
--   13  no mark stays UNEXPLAINED, on any side and any day from t0 to the read's clock
--   14  R8 explains exactly the 10 marks R22 found: R8 marks due Monday 10-26 to Thursday 10-29
--       are 10 over 6 visits, 8 of them Monday to Wednesday over those 6 visits and 2 on
--       Thursday on visits of that set (R22's verdicts 2 and 3); later days are printed, never
--       asserted
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -f scripts/db/read-shadow-compare-20261031.sql -c "rollback"
with
clock as (
  select now() as t1
),
k as (
  select timestamptz '2026-10-25 15:15:19 Europe/Lisbon' as resync,
         timestamptz '2026-10-26 07:00:00 Europe/Lisbon' as first_full_pass,
         timestamptz '2026-10-30 07:15:00 Europe/Lisbon' as closes
),
full_day as (
  select g.d::date as d, (g.d::date - date '2026-10-26') as n
    from clock, generate_series(timestamp '2026-10-26 00:00:00', (((clock.t1 at time zone 'Europe/Lisbon') - interval '7 hours 15 minutes')::date - 1)::timestamp, interval '1 day') as g(d)
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
-- R22 FROM HERE, TO THE END OF `summ`: its lines 413 to 586 at 3a7a0686, byte for byte.
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
         case when l.action ~ '^appointment([.][a-z_]+)+$' then l.action else 'other' end as action,
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
         (l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' = 'confirmed') as arm_reply,
         -- A status change that carries no toStatus: inbound-reply.ts (cancelled line 326, confirmed
         -- line 410) and inbound-store.ts (line 272); both move only a `scheduled` visit.
         ((l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' in ('cancelled', 'confirmed'))
          or (l.action = 'appointment.sms_reply_reviewed' and l.metadata->>'applied' = 'true'
              and l.metadata->>'resolution' in ('confirmed', 'cancelled'))) as sms_status
    from public.audit_log l
    join uv v on v.appointment_id = l.entity_id
   where l.entity_type = 'appointment'
),
ev2 as (
  select e.*, (e.arm_save or e.arm_status or e.arm_portal or e.arm_review or e.arm_reply) as scheduling
    from ev e
),
pal as (
  -- The patient's own link (redeem.ts) writes patient_audit_log only. Fixed code words only.
  select pa.id, pa.appointment_id, pa.occurred_at,
         case when pa.action ~ '^[a-z_]+$' then pa.action else 'other' end as action,
         case when pa.outcome ~ '^[a-z_]+$' then pa.outcome else 'other' end as outcome
    from public.patient_audit_log pa
    join uv v on v.appointment_id = pa.appointment_id and v.tenant_id = pa.tenant_id
),
sc as (
  -- Every status change of those visits, with the status it left.
  select e.appointment_id, e.created_at, e.id::text as k, coalesce(e.from_status, '?') as from_status
    from ev2 e where e.to_status is not null
  union all
  select e.appointment_id, e.created_at, e.id::text, 'scheduled'
    from ev2 e where e.to_status is null and e.sms_status
  union all
  select p.appointment_id, p.occurred_at, p.id::text, 'scheduled or confirmed'
    from pal p where p.action = 'cancel' and p.outcome = 'success'
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
           else coalesce((select c.from_status from sc c
                           where c.appointment_id = u.appointment_id
                             and c.created_at > h.created_at
                           order by c.created_at, c.k limit 1),
                         case when a.status::text not in ('scheduled', 'confirmed') and a.updated_at > h.created_at
                              then '?' else a.status::text end)
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
              when p.status_at_pass in ('scheduled', 'confirmed', 'scheduled or confirmed') then 'T' else 'F' end as f3,
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
-- ======================================================================================
-- THIS READ'S OWN FROM HERE. Above: R20's comparison (two lines changed) and R22's predicates.
-- ======================================================================================
r8 as (
  -- R8: a run-only UNEXPLAINED mark (R22's `u`) that at least one pass had in range, at every
  -- such pass P7 scheduling false and every other predicate true (never false, never unknown),
  -- and every such pass's heartbeat recorded the sweep leaving at least one visit out
  -- (`excluded_count` above 0: the sweep's own count of the visits its scheduling-save rule
  -- left out, sweep.ts `not(hasSchedulingEvent)`), so the sweep itself testifies to the rule.
  select u.tenant_id, u.appointment_id, u.offset_id, u.channel, u.starts_at
    from u
    join summ s on s.uk = u.uk
   where s.in_range > 0
     and s.f7 = s.in_range
     and s.f1 = 0
     and s.f2 = 0 and s.u2 = 0
     and s.f3 = 0 and s.u3 = 0
     and s.f6 = 0
     and s.f8 = 0
     and not exists (select 1 from pr where pr.uk = u.uk and pr.in_range and coalesce(pr.excluded_count, 0) = 0)
),
pcl as (
  -- R20's comparison with the R8 label put on the marks it names; every other label is R20's.
  select p.tenant_id, p.appointment_id, p.offset_id, p.channel, p.starts_at, p.due_at, p.day, p.side,
         case when p.side = 'run_only' and p.category = 'UNEXPLAINED'
                   and exists (select 1 from r8
                                where r8.tenant_id = p.tenant_id and r8.appointment_id = p.appointment_id
                                  and r8.offset_id = p.offset_id and r8.channel = p.channel
                                  and r8.starts_at = p.starts_at)
              then 'R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)'
              else p.category end as category
    from pc p
),
agree as (
  select fd.d, fd.n as dn, rm.offset_id, rm.channel, rm.n as rn,
         count(m.appointment_id) filter (where m.side = 'both') as matched,
         count(m.appointment_id) filter (where m.side = 'shadow_only') as shadow_only,
         count(m.appointment_id) filter (where m.side = 'shadow_only' and m.category = 'UNEXPLAINED') as shadow_unexplained,
         count(m.appointment_id) filter (where m.side = 'run_only') as run_only,
         count(m.appointment_id) filter (where m.side = 'run_only' and m.category = 'UNEXPLAINED') as run_unexplained,
         count(m.appointment_id) filter (where m.side = 'run_only' and m.category like 'R8 %') as run_r8,
         count(m.appointment_id) filter (where m.side = 'live_only') as live_only
    from full_day fd
   cross join reminder rm
    left join pcl m on m.day = fd.d and m.offset_id = rm.offset_id and m.channel = rm.channel
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
                              where rm.channel = x.channel and x.template_id like 'reminder.' || rm.offset_id || '.%')) as ledger_unplaced,
         -- Sent with neither, on ANY day of the window.
         (select count(*) from live) as sent_with_neither
    from since_t0 z
),
unexp as (
  -- Verdict 13: every mark of the window, every side, every day (full and partial).
  select count(*) as pairs,
         count(*) filter (where p.category = 'UNEXPLAINED' and p.side = 'shadow_only') as shadow_u,
         count(*) filter (where p.category = 'UNEXPLAINED' and p.side = 'run_only') as run_u,
         count(*) filter (where p.category = 'UNEXPLAINED' and p.side = 'live_only') as live_u,
         count(*) filter (where p.category = 'UNEXPLAINED' and p.day not in (select d from full_day)) as partial_u
    from pcl p
),
r8c as (
  -- Verdict 14: R8 on the four days R22 read, against R22's production counts exactly (its
  -- verdicts 2 and 3): 8 marks over 6 visits Monday 10-26 to Wednesday 10-28, and 2 on Thursday
  -- 10-29, both on visits of the Monday-to-Wednesday set. Later days are counted, never asserted.
  select count(*) filter (where p.day >= date '2026-10-26' and p.day <= date '2026-10-29') as early_pairs,
         count(*) filter (where p.category like 'R8 %' and p.day >= date '2026-10-26' and p.day <= date '2026-10-29') as early_r8,
         count(distinct p.appointment_id) filter (where p.category like 'R8 %'
                                                    and p.day >= date '2026-10-26' and p.day <= date '2026-10-29') as early_r8_visits,
         count(*) filter (where p.category like 'R8 %' and p.day >= date '2026-10-26' and p.day <= date '2026-10-28') as mw_r8,
         count(distinct p.appointment_id) filter (where p.category like 'R8 %'
                                                    and p.day >= date '2026-10-26' and p.day <= date '2026-10-28') as mw_r8_visits,
         count(*) filter (where p.category like 'R8 %' and p.day = date '2026-10-29') as thu_r8,
         count(*) filter (where p.category like 'R8 %' and p.day = date '2026-10-29'
                            and p.appointment_id not in (select q.appointment_id from pcl q
                                                          where q.category like 'R8 %'
                                                            and q.day >= date '2026-10-26' and q.day <= date '2026-10-28')) as thu_outside,
         count(*) filter (where p.category like 'R8 %' and p.day > date '2026-10-29') as later_r8
    from pcl p
),
summary as (
  select coalesce(sum(matched), 0) as matched,
         coalesce(sum(shadow_only), 0) as shadow_only,
         coalesce(sum(shadow_unexplained), 0) as shadow_unexplained,
         coalesce(sum(run_only), 0) as run_only,
         coalesce(sum(run_unexplained), 0) as run_unexplained,
         coalesce(sum(run_r8), 0) as run_r8,
         coalesce(sum(live_only), 0) as live_only,
         (select min(d)::text || ' to ' || max(d)::text from full_day) as span
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
         '1. the clock: the read runs at or after 2026-10-30 07:15 Lisbon, when Thursday 10-29 has closed',
         'Lisbon ' || lisbon.t1,
         'at or after 2026-10-30 07:15:00',
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
  select 3,
         '3. heartbeats on ' || v.d::text || ': every tenant has 60 shadow heartbeats in the 60 slots 07:00 to 21:45 (a failed pass leaves none)',
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
         '7. no pass over the ceiling of 50 marks on the full days',
         'over the ceiling ' || over::text || ' of ' || beats::text || ' shadow heartbeats on '
           || (select count(*) from full_day)::text || ' full days',
         '0 of 60 or more per full day',
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
         '10. nothing falls out of the comparison: every row written since t0 has a mark and a known reminder, so does every row and reminder send in the window, and no reminder in the window was sent with neither a claim nor a shadow row',
         'rows ' || rows_written::text || '; without a mark or with an unknown reminder ' || unplaced::text
           || '; window rows with an unknown reminder ' || window_unplaced::text
           || '; reminder sends with an unknown reminder ' || ledger_unplaced::text
           || '; sent with neither, any day ' || sent_with_neither::text,
         'rows > 0; 0; 0; 0; 0',
         case when unplaced > 0 or window_unplaced > 0 or ledger_unplaced > 0 or sent_with_neither > 0 then 'FAIL'
              when rows_written = 0 then 'VACUOUS' else 'OK' end
    from marked
  union all
  select 11 + a.rn,
         (11 + a.rn)::text || '. agreement, marks due ' || a.d::text || ', ' || a.offset_id || ' ' || a.channel
           || ': the shadow and the sleeping job took the same reminders (OK only with no mismatch)',
         'both ' || a.matched::text || '; shadow only ' || a.shadow_only::text
           || ' (unexplained ' || a.shadow_unexplained::text || '); run only ' || a.run_only::text
           || ' (unexplained ' || a.run_unexplained::text || ', R8 ' || a.run_r8::text || '); sent with neither ' || a.live_only::text,
         'both > 0; shadow only 0; run only 0; sent with neither 0',
         case when (select t0 from win) is null then 'VACUOUS'
              when a.shadow_unexplained > 0 or a.run_unexplained > 0 or a.live_only > 0 then 'FAIL'
              when a.matched = 0 then 'VACUOUS'
              when a.shadow_only > 0 or a.run_only > 0 then 'REVIEW'
              else 'OK' end
    from agree a
  union all
  select 13,
         '13. no mark stays UNEXPLAINED: every mismatch from t0 to the read''s clock, on every side and every day, full or partial, carries a candidate label',
         'marks ' || pairs::text || '; unexplained shadow only ' || shadow_u::text || ', run only ' || run_u::text
           || ', sent with neither ' || live_u::text || '; of them on partial days ' || partial_u::text,
         'marks > 0; 0, 0, 0',
         case when (select t0 from win) is null then 'VACUOUS'
              when shadow_u + run_u + live_u > 0 then 'FAIL'
              when pairs = 0 then 'VACUOUS'
              else 'OK' end
    from unexp
  union all
  select 14,
         '14. R8 explains exactly the 10 marks R22 found: R8 marks due 2026-10-26 to 2026-10-29, as R22 counted them',
         'R8 marks ' || early_r8::text || ' over visits ' || early_r8_visits::text
           || '; Monday to Wednesday ' || mw_r8::text || ' over visits ' || mw_r8_visits::text
           || '; Thursday ' || thu_r8::text || ', on a visit outside that set ' || thu_outside::text
           || ' (of ' || early_pairs::text || ' marks those days); R8 marks due after 2026-10-29 ' || later_r8::text || ' (not asserted)',
         '10 over 6 visits; 8 over 6; 2, 0',
         case when (select t0 from win) is null then 'VACUOUS'
              when early_pairs = 0 then 'VACUOUS'
              when early_r8 = 10 and early_r8_visits = 6 and mw_r8 = 8 and mw_r8_visits = 6
                   and thu_r8 = 2 and thu_outside = 0 then 'OK'
              else 'FAIL' end
    from r8c
  union all
  select 20, 'window: first shadow heartbeat, the read''s clock, the last shadow heartbeat (Lisbon), the full days',
         coalesce(t0, 'none') || ' | ' || t1 || ' | ' || coalesce(last_beat, 'none') || ' | '
           || coalesce((select min(d)::text || ' to ' || max(d)::text || ' (' || count(*)::text || ')' from full_day having count(*) > 0), 'none'),
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
    from pcl p
   group by p.day, p.offset_id, p.channel
  union all
  select 31, 'mismatch label, marks due ' || p.day::text || ', ' || p.offset_id || ' ' || p.channel || ', ' || p.side || ': ' || p.category,
         count(*)::text,
         case when p.day in (select d from full_day) then 'full day: a candidate label, read every one' else 'partial day' end,
         'INFO'
    from pcl p
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
    from pcl p
   where p.side = 'shadow_only'
     and exists (
       select 1 from public.reminder_claims e
        where e.tenant_id = p.tenant_id and e.appointment_id = p.appointment_id
          and e.kind = 'claim' and e.taker = 'run' and e.early = true
          and e.offset_id = p.offset_id and e.channel = p.channel and e.starts_at = p.starts_at)
  union all
  select 35, 'R8 per mark day: run-only marks R20 leaves UNEXPLAINED that R22''s predicates read as P7 alone (every day, full and partial)',
         p.day::text || ' ' || p.offset_id || ' ' || p.channel || ': ' || count(*)::text,
         case when p.day in (select d from full_day) then 'full day' else 'partial day' end,
         'INFO'
    from pcl p
   where p.category like 'R8 %'
   group by p.day, p.offset_id, p.channel
  union all
  select 40, 'SHADOW_SUMMARY',
         'full days ' || coalesce(span, 'none') || ': both=' || matched::text
           || ' shadow_only=' || shadow_only::text || ' shadow_unexplained=' || shadow_unexplained::text
           || ' run_only=' || run_only::text || ' run_unexplained=' || run_unexplained::text
           || ' run_r8=' || run_r8::text
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
      from pcl
     where side <> 'both'
  ) m
   where rk <= 500
) out
order by n, "check";

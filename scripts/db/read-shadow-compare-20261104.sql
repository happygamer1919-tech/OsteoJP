-- SHADOW-COMPARE, 2026-11-04 (strategy's R47): THE REMINDER SWEEP'S SHADOW AGAINST THE SLEEPING
-- JOB OVER THE TWO FULL DAYS MONDAY 2026-11-02 AND TUESDAY 2026-11-03, UNDER #1678's CODE (R24 AND
-- R33: NO GRACE FOR A VISIT SAVED AFTER ITS MARK, COUNTING ONLY THE SAVES THAT RE-ARM THE SLEEPING
-- JOB; R34: THE SENDING PASS'S HELD-BACK RETRY, CAPPED AT 3 HOURS AFTER THE MARK). It decides
-- nothing itself: strategy's R32 says when a REVIEW counts as clean, and R36 what follows.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside `begin read only` ...
-- `rollback`, so the server refuses any write. Verdict 0 reads the transaction's own setting.
--
-- ONE VALUE COMES FROM OUTSIDE: the instant #1678 went live in production (the dispatch's
-- DEPLOYED_AT), read from the setting `osteojp.r47_deployed_at`, which the block sets with
-- `set local` inside the read-only transaction. Unset, the read stops with an error and prints
-- nothing.
--
-- WHAT IT PRINTS: ONE result set, ordered by `n`, columns n | check | observed | expected |
-- verdict. Verdicts are OK, REVIEW, VACUOUS or FAIL; rows that only inform read INFO and are never
-- counted. It prints counts, Lisbon times, the fixed labels of offsets, channels, ledger outcomes
-- and suppression reasons, and, in the mismatch list only, appointment ids (at most 500 a side).
-- No tenant id, no patient id, no staff id, no name, no phone, no email address, no message text,
-- no note, and no audit metadata text (metadata is compared, never printed). The same as the
-- 2026-10-31 read printed, and nothing more.
--
-- HOW IT IS BUILT. Three parts, in this order:
--   1. R20, from `clock as (` to the end of `pc`: a copy of
--      scripts/db/read-shadow-compare-20261029.sql lines 145 to 444 (on main, #1670) with exactly
--      two substitutions, both named in scripts/read-shadow-compare-20261104.test.mjs, which fails
--      on any other difference: the body of `k` (three lines: `resync` now holds DEPLOYED_AT,
--      `first_full_pass` is Monday 2026-11-02 07:00 and `closes` Wednesday 2026-11-04 07:15
--      Lisbon), and the body of `full_day` (one line: Monday 11-02 and Tuesday 11-03). The
--      column keeps the name `resync` so the rest of R20 reads byte for byte; in this read it is
--      the deploy. Everything else, the window, the sides, the key and the candidate labels S3 to
--      S7 and R1 to R7, is R20's.
--   2. R22, from `off_min as (` to the end of `summ`: a byte-for-byte copy of
--      scripts/db/read-sweep-unexplained-20261030.sql lines 413 to 586 (on main, #1672): the
--      sweep's old selection predicates P1 to P8 as of each pass, for every run-only UNEXPLAINED
--      mark of part 1.
--   3. This read's own: R8 (the 2026-10-31 read's, unchanged), the re-arming saves of #1678 as
--      SQL, R9, the labelled comparison, the verdicts and the rows.
--
-- THE LABELS. R20's, unchanged, and R8 (2026-10-31), unchanged; and one new candidate:
--   R9  a run-only mark R20 leaves UNEXPLAINED, not R8, that R24 kept out: at least one pass had
--       it in range with every predicate of the old selection true (R22's `every`), and at every
--       pass that had it in range a re-arming save written after the mark was already on the
--       visit's trail (as of that pass), unless an old predicate was false there. The shape:
--       a visit cancelled at its mark or before the next pass and brought back after the mark.
--       Under #1678 the bring-back keeps the sweep out (R24); before it, the sweep took the mark
--       after the bring-back and the pair read `both`. R9 is NOT in R32's accepted set: a day
--       with an R9 mark reads REVIEW, and verdict 16 reads REVIEW, so strategy reads it.
--   NO KEPT-START LABEL. A move written after the mark that keeps the start does not count under
--   R33 (#1678, R4 round 2), so the shadow takes that mark and the pair reads `both`; a run-only
--   row for such a visit is UNEXPLAINED, and R9 cannot name it (that save does not count).
--   R34 is a label of the sending pass's rows; the shadow sends nothing, so in this read it has no
--   subject. Its predicate is written in (`r34`, row 36) for the read after the switch.
--
-- THE RE-ARMING SAVES. `rearm_rows` is RE_ARMING_SAVES of apps/web/lib/reminders/
-- reminder-population.ts at #1678's head (1bd32c06), `reArmingClause` clause by clause, and
-- `probe_eval` is `hasReArmingSaveAfter` for a given mark, start and instant: a save of a clause,
-- of the visit's own tenant (the sweep reads under the tenant's claims), written STRICTLY after
-- the mark and at or before the instant; a `moved` row counts only while the start AT THE MARK
-- (the `fromStartsAt` of the earliest move after the mark, else the `startsAt` of the latest
-- booking or move at or before it, else none) is distinct from the start the mark is for. The
-- test holds this to the file's text at 1bd32c06.
--
-- THE DAYS AND THE WINDOW. t0 is the first `shadow` heartbeat at or after DEPLOYED_AT. The
-- window of marks runs from t0 to the read's clock. Monday 11-02 and Tuesday 11-03 are the full
-- days, fixed: verdict 2 FAILs unless t0 falls in or before Monday's 07:00 slot and no Monday mark
-- is due before t0, so each full day is wholly under the new code. Sunday 11-01 (from t0) and
-- Wednesday 11-04 (to the read's clock) are partial: INFO, except verdicts 13, 15 and 16. Marks
-- due in the 24 hours before t0 ran under the old code: row 23 counts them, no verdict reads them.
--
-- ONE CLOCK. The read's clock is `clock.t1` below, read once from now(). A rehearsal on a
-- throwaway replaces that one line with a fixed instant; nothing else in the file reads the time.
--
-- A ZERO IS NEVER A PASS. A verdict whose subject is empty reads VACUOUS, and one whose fault is
-- seen directly reads FAIL first. When no shadow heartbeat follows the deploy, t0 is NULL, every
-- set built on it is empty, and the verdicts that read those sets say VACUOUS, never OK. One
-- exception, by the calendar: an agreement verdict for a day whose visits would start on a Sunday
-- (the clinics are closed, strategy's S-1003-A R29) reads OK when that day has no mark at all.
--
-- VERDICTS (the block succeeds on 0 FAIL, 0 VACUOUS, REVIEW only on 11, 12 and 16, one row each
-- of 0, 1, 2, 6 to 10, 13, 15 and 16, and exactly two rows each of 3, 11 and 12):
--    0  the transaction is READ ONLY
--    1  the clock: the read runs at or after 2026-11-04 07:15 Lisbon (Tuesday 11-03 has closed)
--    2  the window: t0 exists, in or before Monday's 07:00 slot; no Monday mark due before t0;
--       every move written since t0 records the start it left (the deployed code is #1678's)
--    3  heartbeats, ONE ROW PER FULL DAY: every tenant has 60 shadow heartbeats in the 60 slots
--    6  the shadow sent nothing since the deploy
--    7  no pass over the ceiling on the full days
--    8  the heartbeats account for every shadow row (same transaction)
--    9  no mark taken twice by the shadow
--   10  nothing falls out of the comparison
--   11  agreement, 48h email, ONE ROW PER FULL DAY  } OK with at least one match and no mismatch, or
--   12  agreement, 24h sms, ONE ROW PER FULL DAY    } by the calendar; REVIEW, FAIL, VACUOUS
--   13  no mark stays UNEXPLAINED, on any side and any day from t0 to the read's clock
--   15  R24 held: 0 shadow-only S5 rows due in the window, 0 shadow rows taken after a re-arming
--       save written after their mark, and at least one mark R24 had to keep out (the control)
--   16  every mismatch label is in R32's accepted set (R2, R4, R8, S5; R34 has no row here): OK,
--       or REVIEW naming the others (window-edge labels R5 and S7 on a partial day not judged)
--   (14 was the 2026-10-31 read's R8 count; the number is not reused.)
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -c "set local osteojp.r47_deployed_at = '<DEPLOYED_AT>'"
--        -f scripts/db/read-shadow-compare-20261104.sql -c "rollback"
with
clock as (
  select now() as t1
),
k as (
  select current_setting('osteojp.r47_deployed_at')::timestamptz as resync,
         timestamptz '2026-11-02 07:00:00 Europe/Lisbon' as first_full_pass,
         timestamptz '2026-11-04 07:15:00 Europe/Lisbon' as closes
),
full_day as (
  select g.d::date as d, g.n
    from (values (date '2026-11-02', 0), (date '2026-11-03', 1)) as g(d, n)
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
-- R22 FROM HERE, TO THE END OF `summ`: its lines 413 to 586 on main (#1672), byte for byte.
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
-- THIS READ'S OWN FROM HERE. Above: R20's comparison (two substitutions) and R22's predicates.
-- ======================================================================================
r8 as (
  -- R8 (the 2026-10-31 read's, unchanged): a run-only UNEXPLAINED mark (R22's `u`) that at least
  -- one pass had in range, at every such pass P7 scheduling false and every other predicate true
  -- (never false, never unknown), and every such pass's heartbeat recorded the sweep leaving at
  -- least one visit out (`excluded_count` above 0: the sweep's own count of the visits its
  -- scheduling-save rule left out, sweep.ts `not(hasSchedulingEvent)`), so the sweep itself
  -- testifies to the rule.
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
swept as (
  -- SEND MODE ONLY (none in this read: verdict 6 FAILs on any sweep claim). Every claim of taker
  -- `sweep` written since t0, not released, whose first reminder ledger row at or after it is
  -- `sent` (the R34 note's "sweep-sent row").
  select c.id, c.tenant_id, c.appointment_id, c.offset_id, c.channel, c.starts_at, c.due_at, c.created_at
    from public.reminder_claims c cross join win
   where c.kind = 'claim' and c.taker = 'sweep' and c.created_at >= win.t0c
     and not exists (select 1 from public.reminder_claims rl
                      where rl.tenant_id = c.tenant_id and rl.appointment_id = c.appointment_id
                        and rl.kind = 'release' and rl.claim_id = c.id)
     and (select x.outcome from public.reminder_dispatches x
           where x.tenant_id = c.tenant_id and x.appointment_id = c.appointment_id and x.channel = c.channel
             and x.template_id like 'reminder.' || c.offset_id || '.%' and x.created_at >= c.created_at
           order by x.created_at, x.id limit 1) = 'sent'
),
probe as (
  -- The questions this read asks of R24. Each: a visit, a mark, the start that mark is for, and
  -- an instant `upto`: was a re-arming save written after the mark and at or before `upto`?
  --   shadow   every shadow row due in the window; upto its own created_at (its pass's
  --            transaction): the save the pass could see
  --   subject  every mark due in the window, by the visit's start now, of a visit with an audit
  --            row of a re-arming action written in the window; upto the read's clock or the
  --            visit's start, the earlier (verdict 15's control)
  --   pass     every pass that had a run-only UNEXPLAINED mark in range (R22's `pr`); upto that
  --            pass's created_at (R9)
  --   sent     every sweep-sent row (send mode only); upto its claim's created_at (R34)
  select 'shadow' as src, c.id::text as k, c.tenant_id, c.appointment_id, c.offset_id, c.channel,
         c.due_at as mark,
         to_char(date_trunc('milliseconds', c.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start_text,
         c.created_at as upto
    from public.reminder_claims c cross join win
   where c.kind = 'shadow' and c.due_at >= win.t0 and c.due_at <= win.t1
  union all
  select 'subject', null, a.tenant_id, a.id, rm.offset_id, rm.channel,
         a.starts_at - make_interval(mins => om.minutes),
         to_char(date_trunc('milliseconds', a.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         least(win.t1, a.starts_at)
    from public.appointments a
   cross join win
   cross join reminder rm
    join off_min om on om.offset_id = rm.offset_id
   where a.starts_at - make_interval(mins => om.minutes) >= win.t0
     and a.starts_at - make_interval(mins => om.minutes) <= win.t1
     and exists (select 1 from public.audit_log l
                  where l.entity_type = 'appointment' and l.entity_id = a.id and l.tenant_id = a.tenant_id
                    and l.action in ('appointment.create', 'appointment.reschedule', 'appointment.update',
                                     'appointment.sms_reply_reviewed', 'appointment.patient_sms_reply')
                    and l.created_at > win.t0 and l.created_at <= win.t1)
  union all
  select 'pass', r.uk, r.tenant_id, r.appointment_id, r.offset_id, r.channel, r.due_at, r.iso_start, r.pass_c
    from pr r
   where r.in_range
  union all
  select 'sent', s.id::text, s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.due_at,
         to_char(date_trunc('milliseconds', s.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         s.created_at
    from swept s
),
rearm_rows as (
  -- RE_ARMING_SAVES (reminder-population.ts at 1bd32c06, `reArmingClause`), clause by clause, on
  -- the audit trail of the visits `probe` asks about. Only rows of the visit's own tenant: the
  -- sweep reads under the tenant's claims. `moved` matches every `appointment.reschedule` here;
  -- whether it counts depends on the mark and is decided in `probe_eval`. The two start fields
  -- are compared there and never printed.
  select z.* from (
    select l.id, l.tenant_id, l.entity_id as appointment_id, l.created_at,
           case
             when l.action = 'appointment.create' then 'booked'
             when l.action = 'appointment.reschedule' then 'moved'
             when l.action = 'appointment.update' and l.metadata->>'via' = 'portal_request_confirm'
               then 'accepted_in_pedidos'
             when l.action = 'appointment.update' and l.metadata->>'fromStatus' = 'scheduled'
                  and l.metadata->>'toStatus' = 'confirmed' and a.origin = 'patient_portal'
               then 'accepted_with_estado'
             when l.action = 'appointment.update' and l.metadata->>'fromStatus' = 'cancelled'
                  and (l.metadata->>'toStatus' = 'confirmed'
                       or (l.metadata->>'toStatus' = 'scheduled' and a.origin <> 'patient_portal'))
               then 'brought_back'
             when l.action = 'appointment.sms_reply_reviewed' and l.metadata->>'resolution' = 'confirmed'
                  and l.metadata->>'applied' = 'true' and a.origin = 'patient_portal'
               then 'accepted_in_sms_review'
             when l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' = 'confirmed'
                  and a.origin = 'patient_portal'
               then 'accepted_by_sms_reply'
           end as clause,
           l.metadata->>'fromStartsAt' as from_start,
           l.metadata->>'startsAt' as to_start
      from public.audit_log l
      join public.appointments a on a.id = l.entity_id and a.tenant_id = l.tenant_id
     where l.entity_type = 'appointment'
       and l.entity_id in (select appointment_id from probe)
  ) z
   where z.clause is not null
),
probe_eval as (
  -- `hasReArmingSaveAfter` (reminder-population.ts at 1bd32c06) for each probe: the start at the
  -- mark by `startAtTheMark`'s two rules, then the first save of any clause written strictly
  -- after the mark and at or before `upto`, a `moved` row counting only when the start at the
  -- mark is distinct from the probe's start. `rearmed` is whether there is one.
  select p.*, m.start_at_mark, z.first_at as first_rearm_at, z.first_at is not null as rearmed
    from probe p
    left join lateral (
      select coalesce(
               (select n.from_start from rearm_rows n
                 where n.tenant_id = p.tenant_id and n.appointment_id = p.appointment_id
                   and n.clause = 'moved' and n.created_at > p.mark and n.created_at <= p.upto
                 order by n.created_at, n.id limit 1),
               (select b.to_start from rearm_rows b
                 where b.tenant_id = p.tenant_id and b.appointment_id = p.appointment_id
                   and b.clause in ('booked', 'moved') and b.created_at <= p.mark
                 order by b.created_at desc, b.id desc limit 1)) as start_at_mark) m on true
    left join lateral (
      select min(r.created_at) as first_at
        from rearm_rows r
       where r.tenant_id = p.tenant_id and r.appointment_id = p.appointment_id
         and r.created_at > p.mark and r.created_at <= p.upto
         and (r.clause <> 'moved' or m.start_at_mark is distinct from p.start_text)) z on true
),
r9 as (
  -- R9: a run-only UNEXPLAINED mark (R22's `u`), not R8, that R24 kept out: at least one pass
  -- had it in range with every old predicate true (`every` T) and a re-arming save after the mark
  -- already written, and at every pass that had it in range either such a save was already
  -- written or an old predicate was false (an unknown `?` without such a save keeps it out of R9).
  select u.tenant_id, u.appointment_id, u.offset_id, u.channel, u.starts_at
    from u
   where not exists (select 1 from r8
                      where r8.tenant_id = u.tenant_id and r8.appointment_id = u.appointment_id
                        and r8.offset_id = u.offset_id and r8.channel = u.channel and r8.starts_at = u.starts_at)
     and exists (select 1 from pr
                   join probe_eval e on e.src = 'pass' and e.k = pr.uk and e.upto = pr.pass_c
                  where pr.uk = u.uk and pr.in_range and pr.every = 'T' and e.rearmed)
     and not exists (select 1 from pr
                       left join probe_eval e on e.src = 'pass' and e.k = pr.uk and e.upto = pr.pass_c
                      where pr.uk = u.uk and pr.in_range and pr.every <> 'F' and not coalesce(e.rearmed, false))
),
pcl as (
  -- R20's comparison with R8 and R9 put on the marks they name; every other label is R20's.
  select p.tenant_id, p.appointment_id, p.offset_id, p.channel, p.starts_at, p.due_at, p.day, p.side,
         case when p.side = 'run_only' and p.category = 'UNEXPLAINED'
                   and exists (select 1 from r8
                                where r8.tenant_id = p.tenant_id and r8.appointment_id = p.appointment_id
                                  and r8.offset_id = p.offset_id and r8.channel = p.channel
                                  and r8.starts_at = p.starts_at)
              then 'R8 no scheduling save before any pass that could take the mark (by design while REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER is false)'
              when p.side = 'run_only' and p.category = 'UNEXPLAINED'
                   and exists (select 1 from r9
                                where r9.tenant_id = p.tenant_id and r9.appointment_id = p.appointment_id
                                  and r9.offset_id = p.offset_id and r9.channel = p.channel
                                  and r9.starts_at = p.starts_at)
              then 'R9 kept out by R24: a re-arming save after its mark at every pass that could otherwise take it'
              else p.category end as category
    from pc p
),
agree as (
  -- Per full day and reminder. `closed_start`: the visits these marks are for would start on a
  -- Sunday, when both clinics are closed (strategy's S-1003-A R29), so no mark at all is expected.
  select fd.d, fd.n as dn, rm.offset_id, rm.channel, rm.n as rn,
         fd.d + om.minutes / 1440 as start_day,
         extract(isodow from fd.d + om.minutes / 1440) = 7 as closed_start,
         count(m.appointment_id) filter (where m.side = 'both') as matched,
         count(m.appointment_id) filter (where m.side = 'shadow_only') as shadow_only,
         count(m.appointment_id) filter (where m.side = 'shadow_only' and m.category = 'UNEXPLAINED') as shadow_unexplained,
         count(m.appointment_id) filter (where m.side = 'run_only') as run_only,
         count(m.appointment_id) filter (where m.side = 'run_only' and m.category = 'UNEXPLAINED') as run_unexplained,
         count(m.appointment_id) filter (where m.side = 'run_only' and m.category like 'R8 %') as run_r8,
         count(m.appointment_id) filter (where m.side = 'run_only' and m.category like 'R9 %') as run_r9,
         count(m.appointment_id) filter (where m.side = 'live_only') as live_only
    from full_day fd
   cross join reminder rm
    join off_min om on om.offset_id = rm.offset_id
    left join pcl m on m.day = fd.d and m.offset_id = rm.offset_id and m.channel = rm.channel
   group by fd.d, fd.n, rm.offset_id, rm.channel, rm.n, om.minutes
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
window_check as (
  -- Verdict 2's two premises beyond t0's slot. A Monday mark due before t0 was the old code's to
  -- take, so Monday would not be wholly under #1678. And #1678 makes every move record the start
  -- it left (`fromStartsAt`, actions.ts moveAppointment, the only writer of the row): a move
  -- written since t0 without that key means the old code was still serving after t0.
  select (select count(*) from public.reminder_claims c cross join win
           where (c.kind = 'shadow' or (c.kind = 'claim' and c.taker = 'run'))
             and c.due_at >= timestamptz '2026-11-02 00:00:00 Europe/Lisbon' and c.due_at < win.t0) as monday_before_t0,
         (select count(*) from public.audit_log l cross join win
           where l.entity_type = 'appointment' and l.action = 'appointment.reschedule'
             and l.created_at >= win.t0c) as moves_since,
         (select count(*) from public.audit_log l cross join win
           where l.entity_type = 'appointment' and l.action = 'appointment.reschedule'
             and l.created_at >= win.t0c and not (l.metadata ? 'fromStartsAt')) as old_moves,
         (select count(*) from public.audit_log l cross join k
           where l.entity_type = 'appointment' and l.action = 'appointment.reschedule'
             and l.created_at < k.resync and (l.metadata ? 'fromStartsAt')) as new_moves_before
),
subj as (
  -- Verdict 15's control: marks due in the window, by the visit's start now, that a re-arming
  -- save written after the mark keeps out under R24 and that the shadow had not taken before
  -- that save, of a visit created before the mark and remindable now (scheduled or confirmed).
  -- Under the code before #1678 these were the shadow's S5 rows. A control, not a
  -- reconstruction of each pass.
  select e.tenant_id, e.appointment_id, e.offset_id, e.channel, e.mark
    from probe_eval e
    join public.appointments a on a.id = e.appointment_id and a.tenant_id = e.tenant_id
   where e.src = 'subject' and e.rearmed
     and a.created_at < e.mark and a.status::text in ('scheduled', 'confirmed')
     and not exists (select 1 from public.reminder_claims sh
                      where sh.tenant_id = e.tenant_id and sh.appointment_id = e.appointment_id
                        and sh.kind = 'shadow' and sh.offset_id = e.offset_id and sh.channel = e.channel
                        and to_char(date_trunc('milliseconds', sh.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = e.start_text
                        and sh.created_at < e.first_rearm_at)
),
r24 as (
  select (select count(*) from pcl p where p.side = 'shadow_only' and p.category like 'S5 %') as s5_rows,
         (select count(*) from probe_eval e where e.src = 'shadow' and e.rearmed) as taken_after_save,
         (select count(*) from subj) as subjects,
         (select count(distinct appointment_id) from subj) as subject_visits
),
lab as (
  -- Verdict 16: R32's accepted set is R2, R4, R8, S5 and R34's label (none here: R34 labels
  -- sweep-sent rows). UNEXPLAINED is verdict 13's. On a partial day, the window-edge labels R5 (no
  -- pass since its mark) and S7 (due in the 15 minutes before the read) are printed, not judged.
  select p.day, p.side, split_part(p.category, ' ', 1) as letter,
         p.day in (select d from full_day) as full_day
    from pcl p
   where p.side <> 'both' and p.category <> 'UNEXPLAINED'
),
labels as (
  select (select count(*) from pcl) as pairs,
         (select count(*) from lab) as labelled,
         (select count(*) from lab where letter not in ('R2', 'R4', 'R8', 'S5')
                                     and (full_day or letter not in ('R5', 'S7'))) as outside,
         (select string_agg(z.letter || ' ' || z.n::text, ', ' order by z.letter)
            from (select letter, count(*) as n from lab
                   where letter not in ('R2', 'R4', 'R8', 'S5') and (full_day or letter not in ('R5', 'S7'))
                   group by letter) z) as outside_list,
         (select count(*) from lab where not full_day and letter in ('R5', 'S7')) as edge
),
r34 as (
  -- R34's label, SEND MODE ONLY (strategy's R34; sweep-send.ts at 1bd32c06,
  -- notSavedAfterMarkBeforeItWasHandedOver and SWEEP_RETRY_AFTER_SAVE_LIMIT_MS): a sweep-sent row
  -- whose visit had a re-arming save written after its mark and before the send (1), whose mark
  -- had been handed over before the FIRST such save, by a claim of this mark of either taker, not
  -- early, at or before it (2), and whose selecting pass (the tenant's last `send` heartbeat at or
  -- before the claim; the claim's own time when there is none) ran at most 3 hours after the
  -- mark, exactly 3 hours inside (3). A sweep-sent row after such a save that is not R34 is a
  -- sweep-sent S5: R36 requires none.
  select s.id, e.rearmed,
         e.rearmed
         and exists (select 1 from public.reminder_claims c0
                      where c0.tenant_id = s.tenant_id and c0.appointment_id = s.appointment_id
                        and c0.kind = 'claim' and c0.offset_id = s.offset_id and c0.channel = s.channel
                        and c0.starts_at = s.starts_at and c0.early is distinct from true
                        and c0.id <> s.id and c0.created_at <= e.first_rearm_at)
         and coalesce((select h.pass_at from hb h
                        where h.tenant_id = s.tenant_id and h.mode = 'send' and h.created_at <= s.created_at
                        order by h.created_at desc limit 1), s.created_at) <= s.due_at + interval '3 hours' as is_r34
    from swept s
    join probe_eval e on e.src = 'sent' and e.k = s.id::text
),
pre_t0 as (
  -- Row 23: marks due in the 24 hours before t0, the code before the deploy. Matched on the key
  -- only, with no label; no verdict reads them.
  select count(*) filter (where z.s and z.r) as both_sides,
         count(*) filter (where z.s and not z.r) as shadow_only,
         count(*) filter (where z.r and not z.s) as run_only
    from (select bool_or(c.kind = 'shadow') as s, bool_or(c.kind = 'claim') as r
            from public.reminder_claims c cross join win
           where c.due_at >= win.t0 - interval '24 hours' and c.due_at < win.t0
             and (c.kind = 'shadow' or (c.kind = 'claim' and c.taker = 'run' and c.early is distinct from true))
           group by c.tenant_id, c.appointment_id, c.offset_id, c.channel, c.starts_at) z
),
summary as (
  select coalesce(sum(matched), 0) as matched,
         coalesce(sum(shadow_only), 0) as shadow_only,
         coalesce(sum(shadow_unexplained), 0) as shadow_unexplained,
         coalesce(sum(run_only), 0) as run_only,
         coalesce(sum(run_unexplained), 0) as run_unexplained,
         coalesce(sum(run_r8), 0) as run_r8,
         coalesce(sum(run_r9), 0) as run_r9,
         coalesce(sum(live_only), 0) as live_only,
         (select min(d)::text || ' to ' || max(d)::text from full_day) as span
    from agree
),
lisbon as (
  select to_char(k.resync at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as deployed,
         to_char(win.t0 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as t0,
         to_char(win.t1 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as t1,
         (select to_char(max(h.pass_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS')
            from hb h where h.mode = 'shadow') as last_beat
    from win cross join k
)
select n, "check", observed, expected, verdict from (
  select 0 as n,
         '0. this transaction is READ ONLY (the server refuses writes)' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select 1,
         '1. the clock: the read runs at or after 2026-11-04 07:15 Lisbon, when Tuesday 11-03 has closed',
         'Lisbon ' || lisbon.t1,
         'at or after 2026-11-04 07:15:00',
         case when clock.t1 >= k.closes then 'OK' else 'FAIL' end
    from clock cross join k cross join lisbon
  union all
  select 2,
         '2. the window: the first shadow heartbeat at or after the deploy (DEPLOYED_AT, Lisbon ' || lisbon.deployed
           || '), no later than Monday 11-02''s 07:00 slot; no Monday mark due before it; every move written since it records the start it left (#1678''s code)',
         'Lisbon ' || coalesce(lisbon.t0, 'none') || '; Monday marks due before it ' || w.monday_before_t0::text
           || '; moves written since it ' || w.moves_since::text || ', of them without fromStartsAt ' || w.old_moves::text
           || '; moves recording it written before the deploy ' || w.new_moves_before::text || ' (information)',
         'a heartbeat before 2026-11-02 07:15; 0; any, 0',
         case when win.t0 is null then 'VACUOUS'
              when win.t0 >= k.first_full_pass + interval '15 minutes' or w.monday_before_t0 > 0 or w.old_moves > 0 then 'FAIL'
              else 'OK' end
    from win cross join k cross join lisbon cross join window_check w
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
         '6. the shadow sent nothing: no send heartbeat and no claim by taker sweep since the deploy',
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
           || ': the shadow and the sleeping job took the same reminders (OK only with no mismatch, or by the calendar)',
         'both ' || a.matched::text || '; shadow only ' || a.shadow_only::text
           || ' (unexplained ' || a.shadow_unexplained::text || '); run only ' || a.run_only::text
           || ' (unexplained ' || a.run_unexplained::text || ', R8 ' || a.run_r8::text || ', R9 ' || a.run_r9::text
           || '); sent with neither ' || a.live_only::text
           || '; visits starting ' || a.start_day::text
           || case when a.closed_start then ', a Sunday: the clinics are closed' else '' end,
         'both > 0; shadow only 0; run only 0; sent with neither 0 (or no mark at all for visits starting on a Sunday)',
         case when (select t0 from win) is null then 'VACUOUS'
              when a.shadow_unexplained > 0 or a.run_unexplained > 0 or a.live_only > 0 then 'FAIL'
              when a.closed_start and a.matched = 0 and a.shadow_only = 0 and a.run_only = 0 then 'OK'
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
  select 15,
         '15. R24 held: no shadow-only S5 row due from t0 to the read''s clock, no shadow row taken after a re-arming save written after its mark, and at least one mark R24 had to keep out (the control)',
         'S5 shadow-only rows ' || s5_rows::text || '; shadow rows taken after a re-arming save ' || taken_after_save::text
           || '; marks saved after their mark by a re-arming save before the shadow took them ' || subjects::text
           || ' over visits ' || subject_visits::text,
         '0; 0; control > 0',
         case when (select t0 from win) is null then 'VACUOUS'
              when s5_rows > 0 or taken_after_save > 0 then 'FAIL'
              when subjects = 0 then 'VACUOUS'
              else 'OK' end
    from r24
  union all
  select 16,
         '16. every mismatch label is in R32''s accepted set (R2, R4, R8, S5; R34 labels sweep-sent rows, none here), from t0 to the read''s clock',
         'marks ' || pairs::text || '; labelled mismatches ' || labelled::text
           || '; with a label outside the set ' || outside::text
           || coalesce(' (' || outside_list || ')', '')
           || '; window-edge labels on a partial day, not judged ' || edge::text,
         'marks > 0; outside the set 0',
         case when (select t0 from win) is null then 'VACUOUS'
              when pairs = 0 then 'VACUOUS'
              when outside > 0 then 'REVIEW'
              else 'OK' end
    from labels
  union all
  select 20, 'window: DEPLOYED_AT, the first shadow heartbeat after it (t0), the read''s clock, the last shadow heartbeat (Lisbon), the full days',
         deployed || ' | ' || coalesce(t0, 'none') || ' | ' || t1 || ' | ' || coalesce(last_beat, 'none') || ' | '
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
  select 23, 'marks due in the 24 hours before t0, the code before the deploy (no verdict reads them): both, shadow only, run only, on the key alone',
         both_sides::text || ', ' || shadow_only::text || ', ' || run_only::text,
         'information', 'INFO'
    from pre_t0
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
  select 35, 'R8 and R9 per mark day: the run-only marks R20 leaves UNEXPLAINED that R22''s predicates read as P7 alone (R8) or as kept out by R24 (R9), every day',
         split_part(p.category, ' ', 1) || ' ' || p.day::text || ' ' || p.offset_id || ' ' || p.channel || ': ' || count(*)::text,
         case when p.day in (select d from full_day) then 'full day' else 'partial day' end,
         'INFO'
    from pcl p
   where p.category like 'R8 %' or p.category like 'R9 %'
   group by split_part(p.category, ' ', 1), p.day, p.offset_id, p.channel
  union all
  select 36, 'R34, send mode only: sweep-sent rows since t0; of them sent after a re-arming save written after their mark; of those, R34 (held back, then tried again within 3 hours of the mark) and outside R34 (a sweep-sent S5)',
         (select count(*) from swept)::text || ', ' || (select count(*) from r34 where rearmed)::text || ', '
           || (select count(*) from r34 where is_r34)::text || ', ' || (select count(*) from r34 where rearmed and not is_r34)::text
           || case when (select count(*) from swept) = 0 then ': 0 sweep-sent rows, as shadow sends nothing' else '' end,
         'information: the shadow sends nothing (verdict 6 FAILs on any sweep claim), so R34 has no subject in this read; the read after the switch asserts outside R34 = 0',
         'INFO'
  union all
  select 40, 'SHADOW_SUMMARY',
         'full days ' || coalesce(span, 'none') || ': both=' || matched::text
           || ' shadow_only=' || shadow_only::text || ' shadow_unexplained=' || shadow_unexplained::text
           || ' run_only=' || run_only::text || ' run_unexplained=' || run_unexplained::text
           || ' run_r8=' || run_r8::text || ' run_r9=' || run_r9::text
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

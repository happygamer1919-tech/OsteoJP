-- FIRST-SEND, 2026-11-05 (strategy's R47 and R36): THE REMINDER SWEEP'S FIRST SENDING PASSES.
-- Since SWITCHED_AT, the owner's redeploy with the sweep's two switches on: did the passes run,
-- who sent what, was anything sent twice, was anything missed, and did R24 and R34 hold. It decides
-- nothing itself.
--
-- READ ONLY. It writes nothing and changes nothing; run it inside `begin read only` ...
-- `rollback`, so the server refuses any write. Verdict 0 reads the transaction's own setting.
--
-- ONE VALUE COMES FROM OUTSIDE: SWITCHED_AT, read from the setting `osteojp.r47_switched_at`, which
-- the block sets with `set local` inside the read-only transaction. Unset, the read stops with an
-- error and prints nothing.
--
-- WHAT IT PRINTS: ONE result set, ordered by `n`, columns n | check | observed | expected |
-- verdict. Verdicts are OK, REVIEW, VACUOUS or FAIL; rows that only inform read INFO and are never
-- counted. It prints counts, Lisbon times, the fixed labels of offsets, channels, takers, ledger
-- outcomes and suppression reasons, and, in the list of rows 50 to 55 only, appointment ids (at most
-- 500 a list). No tenant id, no patient id, no staff id, no name, no phone, no email address, no
-- message text, no note, and no audit metadata text (metadata is compared, never printed).
--
-- THE LEDGER HAS NO START AND NO TAKER. A ledger row is tied to its sender here by THE LATEST CLAIM
-- of its appointment, offset and channel at or before it (`led`): the dispatcher writes the claim,
-- then the send, then the row. That claim's start and taker are the row's.
--
-- THE MODEL OF THE SENDING PASS (apps/web/lib/reminders/sweep-send.ts). A pass reads its clock once
-- (`pass_at`), selects, hands each mark over in a step of its own (the claim's `created_at` is that
-- step's), and writes its heartbeat AFTER its marks. So THE SELECTING PASS of a claim is the send
-- heartbeat written first at or after the claim whose `pass_at` is at or before the claim, never
-- "the last heartbeat at or before the claim", which is the pass before. And the gate read the audit
-- trail at the selection, so a save counts for R24 and R34 only up to that pass's `pass_at`. A
-- sweep-sent row with no such heartbeat (the pass still running, or its heartbeat lost) cannot be
-- judged: verdict 10 reads REVIEW for it, never FAIL.
--
-- THE FLOOR (`readSweepFloor`): the first send heartbeat of the spell. That first pass sends nothing,
-- and a mark due before the floor stays with the sleeping job, which waits 20 minutes for the sweep
-- and then sends as the taker `run` (inngest/backstop.ts). So a `run` send of a mark before the
-- floor is by design; of a mark at or after it, it is a reminder the sweep missed (verdict 6).
--
-- THE RE-ARMING SAVES. `rearm_rows` and `probe_eval` are RE_ARMING_SAVES and hasReArmingSaveAfter
-- of reminder-population.ts. The test holds them to that code's bytes and runs every clause's case
-- and near miss here.
--
-- AN EARLY COPY THEN AN ON-TIME SEND IS BY DESIGN. A patient moves a visit later in the portal (no
-- event, no audit row). Before the switch the old job wakes at the old mark, the open path has no
-- clock check, so it sends and leaves a live `early` claim for the NEW start. After the floor the
-- sweep reaches the new start's mark; `claimOfThisMark` and `claimIsLive` skip early claims, and R24
-- sees no save, so the sweep sends: two `sent` rows on one start ("today both go out",
-- reminder-claim.ts). Verdict 5 reads REVIEW when that is its only hit; anything else is a FAIL.
--
-- ONE CLOCK. The read's clock is `clock.t1` below, read once from now(). A rehearsal on a
-- throwaway replaces that one line with a fixed instant; nothing else in the file reads the time.
--
-- A ZERO IS NEVER A PASS. A verdict whose subject is empty reads VACUOUS, and one whose fault is
-- seen directly reads FAIL first.
--
-- VERDICTS (twelve rows, one each). 5 or 10 at FAIL: UNDO NOW. Any other FAIL, any VACUOUS, or a
-- REVIEW outside 4, 5, 6, 7, 10 and 11: the block STOPs. Else CLEAN (all OK) or REVIEW:
--    0  the transaction is READ ONLY
--    1  the clock: at or after 2026-11-05 10:20 Lisbon
--    2  the switch: a send heartbeat since SWITCHED_AT, no shadow heartbeat since it
--    3  passes: every tenant has a send heartbeat in every slot expected since 07:00 (a gap FAILs)
--    4  something was sent since 07:00, by the sweep (no send at all: VACUOUS; only the job: REVIEW)
--    5  DOUBLE SENDS, MUST BE 0: one start with two `sent` rows, or two live claims of different
--       takers each followed by a send of its own; REVIEW when the only hit is an early copy from
--       before the switch then an on-time send
--    6  the sleeping job sent no mark due since the floor (else REVIEW: the sweep missed it)
--    7  no mark due since the floor and covered by a finished pass is without a send or a reason
--    8  the late limit: no `sent` row later than 3 hours (SMS) or 12 hours (email) after its mark
--    9  no pass proved the second switch off: no send heartbeat left a visit out
--   10  R34, no sweep-sent S5: a sweep-sent row after a re-arming save carries R34's label
--   11  every `sent` row since the switch has a claim before it
--
-- Run (the document's block does exactly this, with a 120 second bound):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -c "begin read only" -c "set local statement_timeout = '120s'"
--        -c "set local osteojp.r47_switched_at = '<SWITCHED_AT>'"
--        -f scripts/db/read-first-send-20261105.sql -c "rollback"
with
clock as (
  select now() as t1
),
k as (
  select current_setting('osteojp.r47_switched_at')::timestamptz as switched,
         timestamptz '2026-11-05 07:00:00 Europe/Lisbon' as first_slot,
         timestamptz '2026-11-05 10:20:00 Europe/Lisbon' as closes
),
reminder as (
  -- apps/web/lib/reminders/offsets.ts REMINDER_OFFSETS and dispatch.ts REMINDER_LATE_LIMIT_MS.
  select v.offset_id, v.channel, v.minutes, v.late_limit
    from (values ('48h', 'email', 2880, interval '12 hours'), ('24h', 'sms', 1440, interval '3 hours')) as v(offset_id, channel, minutes, late_limit)
),
tenant as (
  select t.id from public.tenants t
),
hb as (
  -- Every heartbeat since the switch, either mode, with its Lisbon 15-minute slot.
  select p.tenant_id, p.pass_id, p.mode, p.pass_at, p.due_count, p.recorded_count, p.over_ceiling, p.excluded_count, p.created_at,
         date_trunc('hour', p.pass_at at time zone 'Europe/Lisbon')
           + floor(extract(minute from p.pass_at at time zone 'Europe/Lisbon') / 15) * interval '15 minutes' as slot
    from public.reminder_sweep_passes p cross join k
   where p.pass_at >= k.switched
),
fl as (
  -- The floor of the spell, per tenant, and the last finished pass.
  select tenant_id, min(pass_at) as floor_at, max(pass_at) as last_pass
    from hb where mode = 'send'
   group by tenant_id
),
expected as (
  -- The slots a pass should have finished in: 07:00 to 21:45, from the switch, to 5 minutes
  -- before the read (a pass writes its heartbeat after its marks).
  select g.s as slot
    from clock cross join k,
         generate_series(timestamp '2026-11-05 07:00:00', (clock.t1 at time zone 'Europe/Lisbon') - interval '5 minutes', interval '15 minutes') as g(s)
   where g.s::time >= time '07:00' and g.s::time <= time '21:45'
     and (g.s at time zone 'Europe/Lisbon') >= k.switched
),
slots as (
  select (select count(*) from expected) as expected_slots,
         (select count(*) from expected e cross join tenant t
           where not exists (select 1 from hb h where h.tenant_id = t.id and h.mode = 'send' and h.slot = e.slot)) as gaps,
         (select count(*) from tenant) as tenants,
         (select count(*) from hb where mode = 'send') as send_beats,
         (select count(*) from hb where mode <> 'send') as other_beats,
         (select count(*) from hb where mode = 'send' and over_ceiling) as over
),
led as (
  -- Every reminder ledger row of a visit with a reminder row since the switch, with its sender:
  -- the latest claim of this appointment, offset and channel at or before the row.
  select x.id, x.tenant_id, x.appointment_id, rm.offset_id, rm.channel, x.outcome,
         coalesce(x.suppression_reason, '') as reason, x.created_at,
         x.created_at >= k.switched as since_switch,
         o.id as claim_id, o.taker, o.starts_at, o.due_at, o.early
    from public.reminder_dispatches x
    join reminder rm on rm.channel = x.channel and x.template_id like 'reminder.' || rm.offset_id || '.%'
   cross join k
    left join lateral (
      select c.id, c.taker, c.starts_at, c.due_at, c.early
        from public.reminder_claims c
       where c.tenant_id = x.tenant_id and c.appointment_id = x.appointment_id
         and c.kind = 'claim' and c.offset_id = rm.offset_id and c.channel = rm.channel
         and c.created_at <= x.created_at
       order by c.created_at desc, c.attempt desc limit 1) o on true
   where x.appointment_id in (select y.appointment_id from public.reminder_dispatches y cross join k k2
                               where y.created_at >= k2.switched and y.template_id like 'reminder.%')
),
sent as (
  select * from led where outcome = 'sent'
),
sends as (
  -- Rows handed to the provider since the switch, and of them since the first slot.
  select count(*) as total,
         count(*) filter (where s.taker = 'sweep') as by_sweep,
         count(*) filter (where s.taker = 'run') as by_job,
         count(*) filter (where s.claim_id is null) as no_claim,
         count(*) filter (where s.created_at >= k.first_slot) as since_first_slot,
         count(*) filter (where s.created_at >= k.first_slot and s.taker = 'sweep') as sweep_since_first_slot,
         count(*) filter (where s.taker = 'run' and s.due_at >= f.floor_at) as job_after_floor,
         count(*) filter (where s.taker = 'run' and (f.floor_at is null or s.due_at < f.floor_at or s.due_at is null)) as job_before_floor
    from sent s cross join k
    left join fl f on f.tenant_id = s.tenant_id
   where s.since_switch
),
early_copy as (
  -- By design (the header): exactly two `sent` rows on one start, the sleeping job's on an `early`
  -- claim from before the switch, and one since the switch on a claim that is not early.
  select s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at
    from sent s
   where s.claim_id is not null
   group by s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at
  having count(*) = 2
     and count(*) filter (where not s.since_switch and s.taker = 'run' and s.early = true) = 1
     and count(*) filter (where s.since_switch and s.early is distinct from true) = 1
),
same_start as (
  -- One start, two `sent` rows, one of them since the switch, and not that pair.
  select s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at
    from sent s
   where s.claim_id is not null
     and not exists (select 1 from early_copy q
                      where q.tenant_id = s.tenant_id and q.appointment_id = s.appointment_id
                        and q.offset_id = s.offset_id and q.channel = s.channel and q.starts_at = s.starts_at)
   group by s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at
  having count(*) > 1 and bool_or(s.since_switch)
),
live as (
  -- Every claim of a visit with a reminder row since the switch that no release names.
  select c.id, c.tenant_id, c.appointment_id, c.offset_id, c.channel, c.starts_at, c.taker, c.created_at, c.due_at, c.early
    from public.reminder_claims c
   where c.kind = 'claim'
     and c.appointment_id in (select appointment_id from led)
     and not exists (select 1 from public.reminder_claims rl
                      where rl.tenant_id = c.tenant_id and rl.appointment_id = c.appointment_id
                        and rl.kind = 'release' and rl.claim_id = c.id)
),
two_takers as (
  -- Two live claims of one start, of different takers. `each_sent`: each has a `sent` row of its
  -- own at or after it, two rows in all, one of them since the switch. `a` is the older claim, so
  -- in the by-design pair `a` is the early copy; only that pair is left out, not the start.
  select a.tenant_id, a.appointment_id, a.offset_id, a.channel, a.starts_at,
         exists (select 1 from sent x join sent y on y.id <> x.id
                                                 and y.tenant_id = x.tenant_id and y.appointment_id = x.appointment_id
                                                 and y.offset_id = x.offset_id and y.channel = x.channel
                  where x.tenant_id = a.tenant_id and x.appointment_id = a.appointment_id
                    and x.offset_id = a.offset_id and x.channel = a.channel
                    and x.created_at >= a.created_at and y.created_at >= b.created_at
                    and (x.since_switch or y.since_switch)) as each_sent
    from live a
    join live b on b.tenant_id = a.tenant_id and b.appointment_id = a.appointment_id
               and b.offset_id = a.offset_id and b.channel = a.channel and b.starts_at = a.starts_at
               and b.taker <> a.taker and (b.created_at, b.id) > (a.created_at, a.id)
   where not (a.early = true and exists (select 1 from early_copy q
                      where q.tenant_id = a.tenant_id and q.appointment_id = a.appointment_id
                        and q.offset_id = a.offset_id and q.channel = a.channel and q.starts_at = a.starts_at))
),
moved_start as (
  -- INFO: one reminder sent for two starts: a re-plan may legitimately send for a new start.
  select s.appointment_id
    from sent s
   where s.claim_id is not null
   group by s.tenant_id, s.appointment_id, s.offset_id, s.channel
  having count(distinct s.starts_at) > 1 and bool_or(s.since_switch)
),
cand as (
  -- The marks a sending pass should have taken: by the visit's start now, due since the tenant's
  -- floor and at or before its last finished pass, of a visit created before the mark and
  -- remindable now (dueVisits, sweep.ts). The second switch on: scheduling saves are not asked.
  select a.tenant_id, a.id as appointment_id, rm.offset_id, rm.channel,
         a.starts_at - make_interval(mins => rm.minutes) as due_at,
         date_trunc('milliseconds', a.starts_at) as starts_at
    from public.appointments a
    join fl f on f.tenant_id = a.tenant_id
   cross join reminder rm
   where a.status::text in ('scheduled', 'confirmed')
     and a.starts_at - make_interval(mins => rm.minutes) >= f.floor_at
     and a.starts_at - make_interval(mins => rm.minutes) <= f.last_pass
     and a.created_at < a.starts_at - make_interval(mins => rm.minutes)
),
pre_floor as (
  -- Row 24: marks due from the switch to the floor. Those are the sleeping job's, and no verdict
  -- judges them: what became of each, by what the ledger holds of its start.
  select c.offset_id, c.channel,
         coalesce((select 'sent by ' || coalesce(s.taker, 'no claim') from sent s
                    where s.tenant_id = c.tenant_id and s.appointment_id = c.appointment_id
                      and s.offset_id = c.offset_id and s.channel = c.channel and s.starts_at = c.starts_at limit 1),
                  (select 'a recorded reason' from led s
                    where s.outcome <> 'sent' and s.tenant_id = c.tenant_id and s.appointment_id = c.appointment_id
                      and s.offset_id = c.offset_id and s.channel = c.channel and s.starts_at = c.starts_at limit 1),
                  'no row') as became
    from (select a.tenant_id, a.id as appointment_id, rm.offset_id, rm.channel, date_trunc('milliseconds', a.starts_at) as starts_at
            from public.appointments a
            join fl f on f.tenant_id = a.tenant_id
           cross join reminder rm cross join k
           where a.status::text in ('scheduled', 'confirmed')
             and a.starts_at - make_interval(mins => rm.minutes) >= k.switched
             and a.starts_at - make_interval(mins => rm.minutes) < f.floor_at
             and a.created_at < a.starts_at - make_interval(mins => rm.minutes)) c
),
swept as (
  -- SWEEP-SENT ROWS: `sent` since the switch whose claim is the sweep's and live, with the
  -- selecting pass: the send heartbeat written first at or after the claim, with its clock at or
  -- before the claim. No such heartbeat: the pass is still running, or its heartbeat was lost.
  select s.id, s.claim_id, s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.starts_at, s.due_at,
         c.created_at as claimed_at, sel.pass_at as selected_at
    from sent s
    join public.reminder_claims c on c.id = s.claim_id
    left join lateral (
      select h.pass_at from hb h
       where h.tenant_id = s.tenant_id and h.mode = 'send'
         and h.created_at >= c.created_at and h.pass_at <= c.created_at
       order by h.created_at, h.pass_at desc limit 1) sel on true
   where s.since_switch and s.taker = 'sweep'
     and not exists (select 1 from public.reminder_claims rl
                      where rl.tenant_id = s.tenant_id and rl.appointment_id = s.appointment_id
                        and rl.kind = 'release' and rl.claim_id = s.claim_id)
),
probe as (
  -- The questions asked of R24. Each: a visit, a mark, the start that mark is for, and an instant
  -- `upto`: was a re-arming save written after the mark and at or before `upto`?
  --   sent      a sweep-sent row, upto its selecting pass's clock (what the gate could read)
  --   sent_late the same, upto its claim (printed: a save between the selection and the send)
  --   cand      a mark that should have been taken, upto the read's clock (R24 keeps it out)
  select 'sent' as src, s.id::text as k, s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.due_at as mark,
         to_char(date_trunc('milliseconds', s.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start_text,
         s.selected_at as upto
    from swept s where s.selected_at is not null
  union all
  select 'sent_late', s.id::text, s.tenant_id, s.appointment_id, s.offset_id, s.channel, s.due_at,
         to_char(date_trunc('milliseconds', s.starts_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         s.claimed_at
    from swept s where s.selected_at is not null
  union all
  select 'cand', c.offset_id, c.tenant_id, c.appointment_id, c.offset_id, c.channel, c.due_at,
         to_char(c.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         clock.t1
    from cand c cross join clock
),
rearm_rows as (
  -- RE_ARMING_SAVES (reminder-population.ts, `reArmingClause`), clause by clause, on the audit
  -- trail of the visits `probe` asks about. Only rows of the visit's own tenant: the sweep reads
  -- under the tenant's claims. `moved` matches every `appointment.reschedule` here; whether it
  -- counts depends on the mark and is decided in `probe_eval`. The two start fields are compared
  -- there and never printed.
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
  -- `hasReArmingSaveAfter` for each probe: the start at the mark by `startAtTheMark`'s two rules,
  -- then the first save of any clause written strictly after the mark and at or before `upto`, a
  -- `moved` row counting only when the start at the mark is distinct from the probe's start.
  select p.*, z.first_at as first_rearm_at, z.first_at is not null as rearmed
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
r34 as (
  -- R34's label, with the selecting pass and the save bound of the model above: a sweep-sent row
  -- whose visit had a re-arming save written after its mark and at or before the selecting pass
  -- (`rearmed`), whose mark had been handed over before the FIRST such save, by a claim of this
  -- mark of either taker, not early, not the row's own, at or before it, and whose selecting pass
  -- ran at most 3 hours after the mark, exactly 3 hours inside. `rearmed` and not `is_r34` is a
  -- sweep-sent S5: R36 requires none.
  select s.id, s.appointment_id, s.offset_id, s.channel, s.due_at, e.rearmed,
         e.rearmed
         and s.selected_at <= s.due_at + interval '3 hours'
         and exists (select 1 from public.reminder_claims c0
                      where c0.tenant_id = s.tenant_id and c0.appointment_id = s.appointment_id
                        and c0.kind = 'claim' and c0.offset_id = s.offset_id and c0.channel = s.channel
                        and c0.starts_at = s.starts_at and c0.early is distinct from true
                        and c0.id <> s.claim_id and c0.created_at <= e.first_rearm_at) as is_r34
    from swept s
    join probe_eval e on e.src = 'sent' and e.k = s.id::text
),
marks as (
  -- What became of each mark in `cand`. `sent` and `reason`: a ledger row of this start (by its
  -- claim), or with no claim from 75 minutes before the mark (the day's last pass takes ahead).
  -- `unsettled`: a live claim of this start with no ledger row at or after it. `kept`: R24.
  select c.tenant_id, c.appointment_id, c.offset_id, c.channel, c.due_at,
         exists (select 1 from sent s where s.tenant_id = c.tenant_id and s.appointment_id = c.appointment_id
                   and s.offset_id = c.offset_id and s.channel = c.channel
                   and (s.starts_at = c.starts_at or (s.claim_id is null and s.created_at >= c.due_at - interval '75 minutes'))) as is_sent,
         exists (select 1 from led s where s.outcome <> 'sent' and s.tenant_id = c.tenant_id and s.appointment_id = c.appointment_id
                   and s.offset_id = c.offset_id and s.channel = c.channel
                   and (s.starts_at = c.starts_at or (s.claim_id is null and s.created_at >= c.due_at - interval '75 minutes'))) as has_reason,
         exists (select 1 from public.reminder_claims l
                  where l.tenant_id = c.tenant_id and l.appointment_id = c.appointment_id and l.kind = 'claim'
                    and l.offset_id = c.offset_id and l.channel = c.channel and l.starts_at = c.starts_at
                    and l.early is distinct from true
                    and not exists (select 1 from public.reminder_claims rl
                                     where rl.tenant_id = l.tenant_id and rl.appointment_id = l.appointment_id
                                       and rl.kind = 'release' and rl.claim_id = l.id)) as has_live_claim,
         e.rearmed as kept
    from cand c
    join probe_eval e on e.src = 'cand' and e.tenant_id = c.tenant_id and e.appointment_id = c.appointment_id and e.k = c.offset_id
),
marks_l as (
  select m.*,
         case when m.is_sent then 'sent'
              when m.has_reason then 'a recorded reason'
              when m.has_live_claim then 'a claim with nothing after it'
              when m.kept then 'kept out by R24'
              else 'missed' end as became
    from marks m
),
never_taken as (
  -- Sweep claims since the switch of a visit with no scheduling save at the claim
  -- (`hasSchedulingEvent`, reminder-population.ts): what the second switch brought in.
  select c.id, c.tenant_id, c.appointment_id
    from public.reminder_claims c cross join k
   where c.kind = 'claim' and c.taker = 'sweep' and c.created_at >= k.switched
     and not exists (
       select 1 from public.audit_log l
        where l.entity_type = 'appointment' and l.entity_id = c.appointment_id and l.tenant_id = c.tenant_id
          and l.created_at <= c.created_at
          and (l.action in ('appointment.create', 'appointment.reschedule')
               or (l.action = 'appointment.update'
                   and (l.metadata->>'toStatus' in ('scheduled', 'confirmed') or l.metadata->>'via' = 'portal_request_confirm'))
               or (l.action = 'appointment.sms_reply_reviewed'
                   and l.metadata->>'resolution' = 'confirmed' and l.metadata->>'applied' = 'true')
               or (l.action = 'appointment.patient_sms_reply' and l.metadata->>'outcome' = 'confirmed')))
),
late as (
  select count(*) as judged,
         count(*) filter (where s.created_at > s.due_at + rm.late_limit + interval '1 minute') as over_limit,
         count(*) filter (where s.created_at > s.due_at) as after_mark,
         coalesce(max(s.created_at - s.due_at) filter (where s.channel = 'sms'), interval '0') as worst_sms,
         coalesce(max(s.created_at - s.due_at) filter (where s.channel = 'email'), interval '0') as worst_email
    from sent s
    join reminder rm on rm.offset_id = s.offset_id
   where s.since_switch and s.due_at is not null
),
issues as (
  -- The list of rows 50 to 55: the one place an appointment id is printed.
  select 50 as n, s.due_at as at_mark, s.offset_id, s.channel, s.appointment_id, 'one start sent twice' as category
    from same_start q join sent s on s.tenant_id = q.tenant_id and s.appointment_id = q.appointment_id
                                 and s.offset_id = q.offset_id and s.channel = q.channel and s.starts_at = q.starts_at
  union all
  select 50, t.starts_at, t.offset_id, t.channel, t.appointment_id, 'two takers, each followed by a send'
    from two_takers t where t.each_sent
  union all
  select 51, m.due_at, m.offset_id, m.channel, m.appointment_id, m.became
    from marks_l m where m.became in ('missed', 'a claim with nothing after it')
  union all
  select 52, r.due_at, r.offset_id, r.channel, r.appointment_id, 'sweep-sent S5'
    from r34 r where r.rearmed and not r.is_r34
  union all
  select 53, s.due_at, s.offset_id, s.channel, s.appointment_id, 'sent by the sleeping job, a mark since the floor'
    from sent s join fl f on f.tenant_id = s.tenant_id
   where s.since_switch and s.taker = 'run' and s.due_at >= f.floor_at
  union all
  select 54, s.created_at, s.offset_id, s.channel, s.appointment_id, 'sent with no claim before it'
    from sent s where s.since_switch and s.claim_id is null
  union all
  select 55, q.starts_at, q.offset_id, q.channel, q.appointment_id, 'early copy then on-time send'
    from early_copy q
),
lisbon as (
  select to_char(k.switched at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as switched,
         to_char(clock.t1 at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') as t1,
         (select to_char(min(floor_at) at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') from fl) as floor_at,
         (select to_char(max(last_pass) at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI:SS') from fl) as last_pass
    from k cross join clock
)
select n, "check", observed, expected, verdict from (
  select 0 as n,
         '0. this transaction is READ ONLY (the server refuses writes)' as "check",
         current_setting('transaction_read_only') as observed,
         'on' as expected,
         case when current_setting('transaction_read_only') = 'on' then 'OK' else 'FAIL' end as verdict
  union all
  select 1,
         '1. the clock: the read runs at or after 2026-11-05 10:20 Lisbon',
         'Lisbon ' || lisbon.t1,
         'at or after 2026-11-05 10:20:00',
         case when clock.t1 >= k.closes then 'OK' else 'FAIL' end
    from clock cross join k cross join lisbon
  union all
  select 2,
         '2. the switch: a send heartbeat since SWITCHED_AT (Lisbon ' || lisbon.switched || '), no heartbeat of another mode since it',
         'send heartbeats ' || s.send_beats::text || ', first ' || coalesce(lisbon.floor_at, 'none') || '; of another mode ' || s.other_beats::text,
         'send > 0; 0',
         case when s.other_beats > 0 then 'FAIL' when s.send_beats = 0 then 'VACUOUS' else 'OK' end
    from slots s cross join lisbon
  union all
  select 3,
         '3. passes: every tenant has a send heartbeat in every slot expected since 07:00, 07:00 to 21:45, to 5 minutes before the read',
         'slots expected ' || expected_slots::text || ' for tenants ' || tenants::text || '; missing ' || gaps::text
           || '; over the ceiling (information) ' || over::text,
         'expected > 0; 0',
         case when expected_slots = 0 or tenants = 0 then 'VACUOUS' when gaps > 0 then 'FAIL' else 'OK' end
    from slots
  union all
  select 4,
         '4. reminders were handed to the provider since 07:00, by the sweep',
         'since 07:00 ' || since_first_slot::text || ', by the sweep ' || sweep_since_first_slot::text,
         'sent > 0, by the sweep > 0',
         case when since_first_slot = 0 then 'VACUOUS' when sweep_since_first_slot = 0 then 'REVIEW' else 'OK' end
    from sends
  union all
  select 5,
         '5. DOUBLE SENDS, MUST BE 0: one appointment, offset, channel and start with two sent rows, or two live claims of different takers each followed by a send',
         'one start sent twice ' || (select count(*) from same_start)::text
           || '; two takers, each followed by a send ' || (select count(*) from two_takers where each_sent)::text
           || '; early copy then on-time send ' || (select count(*) from early_copy)::text
           || ' (of sent rows since the switch ' || total::text || ')',
         '0; 0; 0 (with sent rows present)',
         case when (select count(*) from same_start) > 0 or (select count(*) from two_takers where each_sent) > 0 then 'FAIL'
              when total = 0 then 'VACUOUS'
              when (select count(*) from early_copy) > 0 then 'REVIEW'
              else 'OK' end
    from sends
  union all
  select 6,
         '6. the sleeping job sent no mark due since the floor: a claim that says run is a reminder the sweep missed',
         'sent by the job, marks since the floor ' || job_after_floor::text || '; marks before it, by design ' || job_before_floor::text,
         '0',
         case when total = 0 then 'VACUOUS' when job_after_floor > 0 then 'REVIEW' else 'OK' end
    from sends
  union all
  select 7,
         '7. every mark due since the floor and covered by a finished pass has a send or a recorded reason',
         'marks ' || count(*)::text || '; sent ' || (count(*) filter (where became = 'sent'))::text
           || '; a recorded reason ' || (count(*) filter (where became = 'a recorded reason'))::text
           || '; kept out by R24 ' || (count(*) filter (where became = 'kept out by R24'))::text
           || '; a claim with nothing after it ' || (count(*) filter (where became = 'a claim with nothing after it'))::text
           || '; missed ' || (count(*) filter (where became = 'missed'))::text,
         'marks > 0; a claim with nothing after it 0; missed 0',
         case when count(*) = 0 then 'VACUOUS'
              when count(*) filter (where became in ('missed', 'a claim with nothing after it')) > 0 then 'REVIEW'
              else 'OK' end
    from marks_l
  union all
  select 8,
         '8. the late limit: no sent row later than 3 hours (SMS) or 12 hours (email) after its mark, with a minute for the provider',
         'sent rows ' || judged::text || '; over the limit ' || over_limit::text
           || '; latest SMS ' || to_char(worst_sms, 'HH24:MI:SS') || ', email ' || to_char(worst_email, 'HH24:MI:SS'),
         'sent > 0; 0',
         case when over_limit > 0 then 'FAIL' when judged = 0 then 'VACUOUS' else 'OK' end
    from late
  union all
  select 9,
         '9. no pass proved the second switch off: no send heartbeat left a visit out (a pass with the switch off counts them; only a never-reminded visit taken proves it on)',
         'send heartbeats ' || send_beats::text || '; that left a visit out ' || (select count(*) from hb where mode = 'send' and excluded_count > 0)::text
           || '; never-reminded visits taken ' || (select count(*) from never_taken)::text
           || '; proven on: ' || case when (select count(*) from never_taken) > 0 then 'yes' else 'no' end,
         'send > 0; 0',
         case when (select count(*) from hb where mode = 'send' and excluded_count > 0) > 0 then 'FAIL'
              when send_beats = 0 then 'VACUOUS' else 'OK' end
    from slots
  union all
  select 10,
         '10. R34, no sweep-sent S5: a sweep-sent row after a re-arming save, read up to its selecting pass, carries R34''s label',
         'sweep-sent rows ' || (select count(*) from swept)::text
           || '; after such a save ' || (select count(*) from r34 where rearmed)::text
           || ', R34 ' || (select count(*) from r34 where is_r34)::text
           || ', sweep-sent S5 ' || (select count(*) from r34 where rearmed and not is_r34)::text
           || '; with no selecting pass yet ' || (select count(*) from swept where selected_at is null)::text,
         'sweep-sent > 0; sweep-sent S5 0; no selecting pass 0',
         case when (select count(*) from r34 where rearmed and not is_r34) > 0 then 'FAIL'
              when (select count(*) from swept where selected_at is null) > 0 then 'REVIEW'
              when (select count(*) from swept) = 0 then 'VACUOUS'
              else 'OK' end
  union all
  select 11,
         '11. every sent row since the switch has a claim before it (the closed claim stops a send without one)',
         'sent rows ' || total::text || '; with no claim ' || no_claim::text,
         'sent > 0; 0',
         case when total = 0 then 'VACUOUS' when no_claim > 0 then 'REVIEW' else 'OK' end
    from sends
  union all
  select 20, 'window: SWITCHED_AT, the first send heartbeat (the floor), the last, the read''s clock (Lisbon)',
         switched || ' | ' || coalesce(floor_at, 'none') || ' | ' || coalesce(last_pass, 'none') || ' | ' || t1,
         'information', 'INFO'
    from lisbon
  union all
  select 21, 'pass in slot ' || to_char(h.slot, 'YYYY-MM-DD HH24:MI') || ', ' || h.mode || ': heartbeats, due, marks taken, left out, over the ceiling, then the ledger in that slot: sent, too late, held',
         count(*)::text || ', ' || sum(h.due_count)::text || ', ' || sum(h.recorded_count)::text || ', ' || sum(h.excluded_count)::text || ', '
           || (count(*) filter (where h.over_ceiling))::text || ', '
           || (select count(*) from led l where l.since_switch and l.outcome = 'sent' and l.created_at >= (h.slot at time zone 'Europe/Lisbon') and l.created_at < (h.slot at time zone 'Europe/Lisbon') + interval '15 minutes')::text || ', '
           || (select count(*) from led l where l.since_switch and l.reason in ('mark_missed', 'start_passed') and l.created_at >= (h.slot at time zone 'Europe/Lisbon') and l.created_at < (h.slot at time zone 'Europe/Lisbon') + interval '15 minutes')::text || ', '
           || (select count(*) from led l where l.since_switch and l.outcome <> 'sent' and l.reason not in ('mark_missed', 'start_passed') and l.created_at >= (h.slot at time zone 'Europe/Lisbon') and l.created_at < (h.slot at time zone 'Europe/Lisbon') + interval '15 minutes')::text,
         'information', 'INFO'
    from hb h
   group by h.slot, h.mode
  union all
  select 24, 'marks due from the switch to the floor, the job''s, judged by no verdict, ' || p.offset_id || ' ' || p.channel || ': ' || p.became,
         count(*)::text, 'information', 'INFO'
    from pre_floor p
   group by p.offset_id, p.channel, p.became
  union all
  select 30, 'handed to the provider since the switch, ' || coalesce(s.taker, 'no claim') || ', ' || s.offset_id || ' ' || s.channel,
         count(*)::text, 'information', 'INFO'
    from sent s where s.since_switch
   group by s.taker, s.offset_id, s.channel
  union all
  select 31, 'marks since the floor, ' || m.offset_id || ' ' || m.channel || ': ' || m.became,
         count(*)::text, 'information', 'INFO'
    from marks_l m
   group by m.offset_id, m.channel, m.became
  union all
  select 32, 'not handed over since the switch, ' || l.offset_id || ' ' || l.channel || ', ' || l.outcome || case when l.reason <> '' then ' (' || l.reason || ')' else '' end,
         count(*)::text, 'information', 'INFO'
    from led l where l.since_switch and l.outcome <> 'sent'
   group by l.offset_id, l.channel, l.outcome, l.reason
  union all
  select 33, 'one reminder sent for two starts, one send since the switch (a re-plan may legitimately send for a new start)',
         (select count(*) from moved_start)::text, 'information', 'INFO'
  union all
  select 34, 'two live claims of different takers on one start, without two sends',
         (select count(*) from two_takers where not each_sent)::text, 'information', 'INFO'
  union all
  select 35, 'never-reminded visits taken by the sweep since the switch: claims; sent; of those sent later than their mark',
         (select count(*) from never_taken)::text || '; '
           || (select count(*) from swept s join never_taken t on t.id = s.claim_id)::text || '; '
           || (select count(*) from swept s join never_taken t on t.id = s.claim_id join sent x on x.id = s.id where x.created_at > x.due_at)::text,
         'information', 'INFO'
  union all
  select 36, 'R34: sweep-sent rows with a re-arming save between the selection and the send (not the gate''s to see)',
         ((select count(*) from probe_eval e where e.src = 'sent_late' and e.rearmed)
          - (select count(*) from probe_eval e where e.src = 'sent' and e.rearmed))::text,
         'information', 'INFO'
  union all
  select 40, 'FIRST_SEND_SUMMARY',
         'since the switch: sent_by_sweep=' || by_sweep::text || ' sent_by_job=' || by_job::text || ' sent_no_claim=' || no_claim::text
           || ' double_sends=' || ((select count(*) from same_start) + (select count(*) from two_takers where each_sent))::text
           || ' early_copy_then_on_time=' || (select count(*) from early_copy)::text
           || ' sweep_sent_s5=' || (select count(*) from r34 where rearmed and not is_r34)::text
           || ' missed=' || (select count(*) from marks_l where became = 'missed')::text,
         'double sends must be 0',
         'INFO'
    from sends
  union all
  select n, "check", observed, 'information', 'INFO' from (
    select i.n, 'issue ' || to_char(i.at_mark at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') || ' ' || i.offset_id || ' ' || i.channel as "check",
           i.appointment_id::text || ' | ' || i.category as observed,
           row_number() over (partition by i.n order by i.at_mark, i.appointment_id) as rk
      from issues i
  ) m
   where rk <= 500
) out
order by n, "check";

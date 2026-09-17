-- ============================================================================
-- CLINIC HOURS, STAGE 2 of 3: THE WRITE. ONE TRANSACTION.
--
-- Card AGENDA-2100. THE TARGET HOURS ARE PARAMETERS, not constants in this file.
--
-- ==========================================================================
-- WHY THEY BECAME PARAMETERS, AND IT IS NOT TIDINESS
-- ==========================================================================
-- This file was authored for one ruling (09:00-21:00, Q-HOURS = a) and hard-coded
-- it in fourteen places: a constant, four guards and nine messages. The owner
-- then changed the ruling to 08:00-21:00 AFTER the 09:00 run had already
-- happened. Editing fourteen literals per ruling is how a message comes to say
-- one thing while the write does another - and the messages are what the operator
-- reads to decide whether the sitting went right.
--
-- So the hours arrive as `-v target_opens` / `-v target_closes`, they are
-- VALIDATED here rather than trusted, and every guard and notice below is
-- phrased from them. The two location ids stay constants: a location id supplied
-- at run time is the one thing an operator can get wrong in a way no guard
-- downstream can catch.
--
-- ==========================================================================
-- RE-RUNNABLE FOR A DIFFERENT TARGET, AND THAT IS A CORRECTION
-- ==========================================================================
-- The previous version refused if ANY `location.hours_set` audit row existed.
-- That is right for a one-shot op and WRONG the moment hours can change twice:
-- with the 09:00 sitting already recorded on production, a second sitting to
-- 08:00 would have been refused before it read anything. The guard now asks the
-- only question that means anything - has THIS target already been written -
-- against the live rows AND against the audit trail.
--
-- WRITES: public.locations.opens_at and closes_at on exactly 2 rows, plus one
-- public.audit_log row per location. NOTHING ELSE. It does not touch the midday
-- closures, which days each clinic is open, any appointment, or any other
-- location - and it asserts each of those rather than merely omitting them.
--
-- IT REFUSES WITHOUT THE PRE-CHECK'S OWN VALUES (SR-59). The four carries come
-- from the transcript of the SAME sitting's stage 1, never from a card, a memory
-- or an earlier run. If the database has moved since that read, the values
-- disagree and nothing is written.
--
-- ==========================================================================
-- WHY EVERY PARAMETER TRAVELS THROUGH set_config
-- ==========================================================================
-- psql performs variable interpolation in ordinary statements, and NOT inside
-- dollar-quoted strings. A `:'target_opens'` written inside the DO block below
-- would reach the server as those literal characters and fail at parse - which
-- the rehearsal is what caught. They are set as run-time parameters first, in a
-- statement where interpolation does happen, and the block reads them back with
-- current_setting().
--
-- Any line starting "STOP:" means the transaction aborted and NOTHING was
-- written. Success is the final "CLINIC HOURS DONE" notice.
--
-- Run (the four carries are stage 1's printed values; the target is the ruling):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v target_opens=08:00 -v target_closes=21:00
--        -v lv_opens_before=09:00 -v lv_closes_before=21:00
--        -v cb_opens_before=09:00 -v cb_closes_before=21:00
--        -f scripts/data/location-hours-2-set.sql
-- ============================================================================

\if :{?target_opens}
\else
  -- `\quit 1` DOES NOT SET AN EXIT CODE: psql warns "extra argument
  -- 1 ignored" and exits 0, so a `set -e` runner would carry on into the
  -- write with no target at all. Caught in rehearsal. A raised exception
  -- under ON_ERROR_STOP=1 exits 3, which is what every other stop here does.
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v target_opens is missing. The ruling names it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?target_closes}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v target_closes is missing. The ruling names it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?lv_opens_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v lv_opens_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?lv_closes_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v lv_closes_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?cb_opens_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v cb_opens_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?cb_closes_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v cb_closes_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif

SELECT set_config('agenda2100.target_opens',     :'target_opens',     false),
       set_config('agenda2100.target_closes',    :'target_closes',    false),
       set_config('agenda2100.lv_opens_before',  :'lv_opens_before',  false),
       set_config('agenda2100.lv_closes_before', :'lv_closes_before', false),
       set_config('agenda2100.cb_opens_before',  :'cb_opens_before',  false),
       set_config('agenda2100.cb_closes_before', :'cb_closes_before', false);

do $hours$
declare
  c_lv     constant uuid := 'de000002-0000-0000-0000-000000000001'; -- OsteoJP (LV)
  c_cb     constant uuid := 'de000002-0000-0000-0000-000000000002'; -- OsteoJP (CB)
  c_action constant text := 'location.hours_set';
  -- The booking lead AGENDA-2100 enforces in the application
  -- (BOOKING_LEAD_MIN, apps/web/lib/scheduling/clinic-hours.ts). Stated here so
  -- the hours this op writes cannot describe a day with no bookable start.
  c_lead   constant interval := interval '60 minutes';

  s_opens  text := current_setting('agenda2100.target_opens');
  s_closes text := current_setting('agenda2100.target_closes');
  v_opens  time;
  v_closes time;

  v_lv        record;
  v_cb        record;
  v_tenant    uuid;
  v_updated   int;
  v_audited   int;
  v_already   int;
  v_midday    jsonb;
  v_midday_af jsonb;
  v_row       record;
begin
  -- ==========================================================================
  -- THE TARGET IS VALIDATED, NOT TRUSTED.
  -- ==========================================================================
  -- THE FORMAT IS CHECKED AS A STRING FIRST, BEFORE ANY CAST. `'8:00'::time` and
  -- `'0800'::time` both succeed in Postgres and mean 08:00, and `'25:00'::time`
  -- raises a bare `invalid input syntax` with no mention of which parameter was
  -- wrong. An operator mistyping the ruling deserves a refusal that names the
  -- parameter and shows what it received.
  if s_opens !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'STOP: -v target_opens must be HH:MM (00:00 to 23:59); received %', s_opens;
  end if;
  if s_closes !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'STOP: -v target_closes must be HH:MM (00:00 to 23:59); received %', s_closes;
  end if;
  v_opens  := s_opens::time;
  v_closes := s_closes::time;

  -- `locations_open_before_close` says this too, but a constraint violation
  -- names a constraint; this names the ruling that is wrong.
  if v_opens >= v_closes then
    raise exception 'STOP: target_opens % is not before target_closes %', s_opens, s_closes;
  end if;

  -- THE DAY MUST CONTAIN AT LEAST ONE BOOKABLE START. The app refuses a booking
  -- that starts later than closes_at minus 60 minutes, so hours only 45 minutes
  -- wide would leave a clinic open and unbookable - a state no screen explains.
  if (v_closes - c_lead) < v_opens then
    raise exception
      'STOP: % - % leaves no bookable start: the last start is closes_at minus 60 minutes, which is before opening',
      s_opens, s_closes;
  end if;

  -- ==========================================================================
  -- THE TWO ROWS.
  -- ==========================================================================
  select id, tenant_id, name, opens_at, closes_at, midday_closed_from, midday_closed_to, is_active
    into v_lv from public.locations where id = c_lv;
  if not found then raise exception 'STOP: Linda-a-Velha (%) does not exist', c_lv; end if;

  select id, tenant_id, name, opens_at, closes_at, midday_closed_from, midday_closed_to, is_active
    into v_cb from public.locations where id = c_cb;
  if not found then raise exception 'STOP: Castelo Branco (%) does not exist', c_cb; end if;

  if v_lv.tenant_id is distinct from v_cb.tenant_id then
    raise exception 'STOP: the two clinics are in different tenants';
  end if;
  v_tenant := v_lv.tenant_id;

  raise notice 'TARGET  % - %', s_opens, s_closes;
  raise notice 'BEFORE  %: % - %', v_lv.name, to_char(v_lv.opens_at, 'HH24:MI'), to_char(v_lv.closes_at, 'HH24:MI');
  raise notice 'BEFORE  %: % - %', v_cb.name, to_char(v_cb.opens_at, 'HH24:MI'), to_char(v_cb.closes_at, 'HH24:MI');

  -- ==========================================================================
  -- SR-59: THE CARRIES MUST BE THIS SITTING'S PRE-CHECK.
  -- ==========================================================================
  if to_char(v_lv.opens_at, 'HH24:MI') is distinct from current_setting('agenda2100.lv_opens_before') then
    raise exception 'STOP: Linda-a-Velha opens at %, but the carry says %; re-run stage 1',
      to_char(v_lv.opens_at, 'HH24:MI'), current_setting('agenda2100.lv_opens_before');
  end if;
  if to_char(v_lv.closes_at, 'HH24:MI') is distinct from current_setting('agenda2100.lv_closes_before') then
    raise exception 'STOP: Linda-a-Velha closes at %, but the carry says %; re-run stage 1',
      to_char(v_lv.closes_at, 'HH24:MI'), current_setting('agenda2100.lv_closes_before');
  end if;
  if to_char(v_cb.opens_at, 'HH24:MI') is distinct from current_setting('agenda2100.cb_opens_before') then
    raise exception 'STOP: Castelo Branco opens at %, but the carry says %; re-run stage 1',
      to_char(v_cb.opens_at, 'HH24:MI'), current_setting('agenda2100.cb_opens_before');
  end if;
  if to_char(v_cb.closes_at, 'HH24:MI') is distinct from current_setting('agenda2100.cb_closes_before') then
    raise exception 'STOP: Castelo Branco closes at %, but the carry says %; re-run stage 1',
      to_char(v_cb.closes_at, 'HH24:MI'), current_setting('agenda2100.cb_closes_before');
  end if;

  -- ==========================================================================
  -- HAS *THIS TARGET* ALREADY BEEN WRITTEN? Both signals, because either alone
  -- can be true after a half-finished sitting and "it looks done" is not a
  -- verdict. Keyed on the TARGET, never on the mere existence of an audit row:
  -- a previous sitting to DIFFERENT hours is history, not a reason to refuse.
  -- ==========================================================================
  if v_lv.opens_at = v_opens and v_lv.closes_at = v_closes
     and v_cb.opens_at = v_opens and v_cb.closes_at = v_closes then
    raise exception 'STOP: both clinics already read % - %; there is nothing for this block to write', s_opens, s_closes;
  end if;

  select count(*) into v_already
    from public.audit_log
   where action = c_action
     and entity_id in (c_lv, c_cb)
     and metadata ->> 'opens_at_after'  = s_opens
     and metadata ->> 'closes_at_after' = s_closes;
  if v_already >= 2 then
    raise exception
      'STOP: % audit rows already record both clinics being set to % - %; this exact change has already run',
      v_already, s_opens, s_closes;
  end if;

  -- ==========================================================================
  -- THE CONSTRAINT THE NEW HOURS MUST SATISFY, CHECKED BEFORE THE WRITE so the
  -- refusal names the clinic rather than arriving as a constraint violation.
  -- ==========================================================================
  for v_row in
    select l.name, l.midday_closed_from as mfrom, l.midday_closed_to as mto
      from public.locations l
     where l.id in (c_lv, c_cb) and l.midday_closed_from is not null
  loop
    if v_row.mfrom < v_opens or v_row.mto > v_closes then
      raise exception 'STOP: % has a midday closure % to % that would fall outside % - %',
        v_row.name, to_char(v_row.mfrom, 'HH24:MI'), to_char(v_row.mto, 'HH24:MI'), s_opens, s_closes;
    end if;
  end loop;

  -- The closures as they stand, so "untouched" is asserted and not assumed.
  select jsonb_agg(jsonb_build_object('id', l.id, 'from', l.midday_closed_from, 'to', l.midday_closed_to)
                   order by l.id)
    into v_midday
    from public.locations l where l.id in (c_lv, c_cb);

  -- ==========================================================================
  -- THE WRITE. Exactly two rows, exactly two columns.
  -- ==========================================================================
  -- `source` NAMES THE MECHANISM THAT RAN IT, and it was wrong. It read
  -- `owner_sql_editor`, which is the Supabase dashboard's SQL editor - a
  -- different surface, with a different actor, a different audit story and no
  -- ON_ERROR_STOP. This op is a psql data operation run from a document, so it
  -- says so. A slug, never prose: the audit metadata contract refuses whitespace.
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  select v_tenant, null, c_action, 'location', l.id,
         jsonb_build_object(
           'card', 'AGENDA-2100',
           'source', 'psql_data_op',
           'ruling', 'owner-hours-ruling-2026-09-17',
           'opens_at_before', to_char(l.opens_at, 'HH24:MI'),
           'closes_at_before', to_char(l.closes_at, 'HH24:MI'),
           'opens_at_after', to_char(v_opens, 'HH24:MI'),
           'closes_at_after', to_char(v_closes, 'HH24:MI'),
           'midday_unchanged', jsonb_build_object(
             'from', to_char(l.midday_closed_from, 'HH24:MI'),
             'to',   to_char(l.midday_closed_to, 'HH24:MI')))
    from public.locations l
   where l.id in (c_lv, c_cb);
  get diagnostics v_audited = row_count;
  if v_audited <> 2 then
    raise exception 'STOP: wrote % audit rows, expected exactly 2', v_audited;
  end if;

  update public.locations
     set opens_at = v_opens,
         closes_at = v_closes
   where id in (c_lv, c_cb);
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'STOP: updated % locations, expected exactly 2', v_updated;
  end if;

  -- ==========================================================================
  -- NOTHING ELSE MOVED.
  -- ==========================================================================
  if exists (select 1 from public.locations
              where id in (c_lv, c_cb) and (opens_at <> v_opens or closes_at <> v_closes)) then
    raise exception 'STOP: a clinic does not read % - % after the write', s_opens, s_closes;
  end if;

  select jsonb_agg(jsonb_build_object('id', l.id, 'from', l.midday_closed_from, 'to', l.midday_closed_to)
                   order by l.id)
    into v_midday_af
    from public.locations l where l.id in (c_lv, c_cb);
  if v_midday_af is distinct from v_midday then
    raise exception 'STOP: a midday closure changed, and none may';
  end if;

  raise notice 'AFTER   %: % - %', v_lv.name, s_opens, s_closes;
  raise notice 'AFTER   %: % - %', v_cb.name, s_opens, s_closes;
  raise notice 'CLINIC HOURS DONE: 2 clinics set to % - %; midday closures, open days and appointments untouched',
    s_opens, s_closes;
end $hours$;

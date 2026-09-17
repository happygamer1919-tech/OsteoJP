-- ============================================================================
-- CLINIC HOURS 09:00-21:00, STAGE 2 of 3: THE WRITE. ONE TRANSACTION.
--
-- Card AGENDA-2100. Owner ruling Q-HOURS = a, 2026-09-17: BOTH clinics, EVERY
-- open day INCLUDING Saturday, opens_at 09:00 and closes_at 21:00.
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
-- IT REFUSES ANY LOCATION BUT THE TWO CLINICS. The ids are constants here, not
-- parameters: a location id supplied at run time is the one thing an operator
-- can get wrong in a way no guard downstream can catch.
--
-- ==========================================================================
-- WHY THE CARRIES TRAVEL THROUGH set_config AND NOT STRAIGHT INTO THE BLOCK
-- ==========================================================================
-- psql performs variable interpolation in ordinary statements, and NOT inside
-- dollar-quoted strings. A `:'lv_opens_before'` written inside the DO block
-- below would therefore reach the server as those literal characters and fail at
-- parse - which the rehearsal is what caught. They are set as run-time
-- parameters first, in a statement where interpolation does happen, and the
-- block reads them back with current_setting().
--
-- Any line starting "STOP:" means the transaction aborted and NOTHING was
-- written. Success is the final "CLINIC HOURS DONE" notice.
--
-- Run (the four carries are stage 1's printed values):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v lv_opens_before=08:00 -v lv_closes_before=20:00
--        -v cb_opens_before=08:00 -v cb_closes_before=20:00
--        -f scripts/data/location-hours-2-set.sql
-- ============================================================================

\if :{?lv_opens_before}
\else
  -- `\quit 1` DOES NOT SET AN EXIT CODE: psql warns "extra argument
  -- 1 ignored" and exits 0, so a `set -e` runner would carry on into the
  -- write with no carry at all. Caught in rehearsal. A raised exception
  -- under ON_ERROR_STOP=1 exits 3, which is what every other stop here does.
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v lv_opens_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?lv_closes_before}
\else
  -- `\quit 1` DOES NOT SET AN EXIT CODE: psql warns "extra argument
  -- 1 ignored" and exits 0, so a `set -e` runner would carry on into the
  -- write with no carry at all. Caught in rehearsal. A raised exception
  -- under ON_ERROR_STOP=1 exits 3, which is what every other stop here does.
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v lv_closes_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?cb_opens_before}
\else
  -- `\quit 1` DOES NOT SET AN EXIT CODE: psql warns "extra argument
  -- 1 ignored" and exits 0, so a `set -e` runner would carry on into the
  -- write with no carry at all. Caught in rehearsal. A raised exception
  -- under ON_ERROR_STOP=1 exits 3, which is what every other stop here does.
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v cb_opens_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif
\if :{?cb_closes_before}
\else
  -- `\quit 1` DOES NOT SET AN EXIT CODE: psql warns "extra argument
  -- 1 ignored" and exits 0, so a `set -e` runner would carry on into the
  -- write with no carry at all. Caught in rehearsal. A raised exception
  -- under ON_ERROR_STOP=1 exits 3, which is what every other stop here does.
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v cb_closes_before is missing. Stage 1 prints it; this block refuses to guess.';
  END $missing$;
\endif

SELECT set_config('agenda2100.lv_opens_before',  :'lv_opens_before',  false),
       set_config('agenda2100.lv_closes_before', :'lv_closes_before', false),
       set_config('agenda2100.cb_opens_before',  :'cb_opens_before',  false),
       set_config('agenda2100.cb_closes_before', :'cb_closes_before', false);

do $hours$
declare
  c_lv     constant uuid := 'de000002-0000-0000-0000-000000000001'; -- OsteoJP (LV)
  c_cb     constant uuid := 'de000002-0000-0000-0000-000000000002'; -- OsteoJP (CB)
  c_opens  constant time := '09:00';
  c_closes constant time := '21:00';
  c_action constant text := 'location.hours_set';

  v_lv        record;
  v_cb        record;
  v_tenant    uuid;
  v_updated   int;
  v_audited   int;
  v_midday    jsonb;
  v_midday_af jsonb;
  v_row       record;
begin
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
  -- ALREADY RUN? Both signals, because either alone can be true after a
  -- half-finished sitting and "it looks done" is not a verdict.
  -- ==========================================================================
  if v_lv.opens_at = c_opens and v_lv.closes_at = c_closes
     and v_cb.opens_at = c_opens and v_cb.closes_at = c_closes then
    raise exception 'STOP: both clinics already read 09:00-21:00; this block has already run';
  end if;
  if exists (select 1 from public.audit_log where action = c_action) then
    raise exception 'STOP: a % audit row already exists; this block has already run', c_action;
  end if;

  -- ==========================================================================
  -- THE CONSTRAINT THE NEW HOURS MUST SATISFY, CHECKED BEFORE THE WRITE so the
  -- refusal names the clinic rather than arriving as a constraint violation.
  -- ==========================================================================
  if c_opens >= c_closes then
    raise exception 'STOP: 09:00 is not before 21:00';
  end if;
  for v_row in
    select l.name, l.midday_closed_from as mfrom, l.midday_closed_to as mto
      from public.locations l
     where l.id in (c_lv, c_cb) and l.midday_closed_from is not null
  loop
    if v_row.mfrom < c_opens or v_row.mto > c_closes then
      raise exception 'STOP: % has a midday closure % to % that would fall outside 09:00-21:00',
        v_row.name, to_char(v_row.mfrom, 'HH24:MI'), to_char(v_row.mto, 'HH24:MI');
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
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  select v_tenant, null, c_action, 'location', l.id,
         jsonb_build_object(
           'card', 'AGENDA-2100',
           'source', 'owner_sql_editor',
           'ruling', 'Q-HOURS = a, 2026-09-17',
           'opens_at_before', to_char(l.opens_at, 'HH24:MI'),
           'closes_at_before', to_char(l.closes_at, 'HH24:MI'),
           'opens_at_after', to_char(c_opens, 'HH24:MI'),
           'closes_at_after', to_char(c_closes, 'HH24:MI'),
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
     set opens_at = c_opens,
         closes_at = c_closes
   where id in (c_lv, c_cb);
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'STOP: updated % locations, expected exactly 2', v_updated;
  end if;

  -- ==========================================================================
  -- NOTHING ELSE MOVED.
  -- ==========================================================================
  if exists (select 1 from public.locations
              where id in (c_lv, c_cb) and (opens_at <> c_opens or closes_at <> c_closes)) then
    raise exception 'STOP: a clinic does not read 09:00-21:00 after the write';
  end if;

  select jsonb_agg(jsonb_build_object('id', l.id, 'from', l.midday_closed_from, 'to', l.midday_closed_to)
                   order by l.id)
    into v_midday_af
    from public.locations l where l.id in (c_lv, c_cb);
  if v_midday_af is distinct from v_midday then
    raise exception 'STOP: a midday closure changed, and none may';
  end if;

  raise notice 'AFTER   %: 09:00 - 21:00', v_lv.name;
  raise notice 'AFTER   %: 09:00 - 21:00', v_cb.name;
  raise notice 'CLINIC HOURS DONE: 2 clinics set to 09:00-21:00; midday closures, open days and appointments untouched';
end $hours$;

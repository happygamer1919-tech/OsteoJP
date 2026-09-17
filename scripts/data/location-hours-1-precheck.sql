-- ============================================================================
-- CLINIC HOURS, STAGE 1 of 3: PRE-CHECK. READ ONLY.
--
-- Card AGENDA-2100. THE TARGET HOURS ARE PARAMETERS, so this file can forecast
-- the ruling actually being applied rather than the one it was written for.
--
-- WHAT THIS PRINTS, AND WHY EACH ROW IS HERE
--   1. the hours as they stand, per clinic. These are the CARRIES stage 2
--      refuses to run without (SR-59): it is handed what this run measured and
--      stops if the database has moved since.
--   2. that hours are ONE PAIR PER LOCATION. There is no per-weekday hours
--      table anywhere in this schema, so "every open day including Saturday" is
--      satisfied by one write per clinic rather than by seven. Asserted here
--      rather than asserted in prose, because the ruling's wording invites the
--      opposite assumption.
--   3. what the new rule would refuse if it were already live: future active
--      appointments starting BEFORE the target opening or AFTER the target's
--      last bookable start. Those rows are not touched by anything here - the
--      ruling says they stay, render and report, and are never cancelled - but
--      the owner should see the number before the hours move, not discover it
--      from reception.
--   4. the midday closures, which stage 2 must leave exactly as they are, and
--      which stage 3 compares against the write's own record of them.
--
-- THE FORECAST IS COMPUTED FROM THE TARGET, and that is the reason this file
-- takes parameters at all. It previously hard-coded 09:00 and 20:00. Run for a
-- ruling of 08:00-21:00 it would have reported the count of bookings before
-- 09:00 - a number describing a rule nobody was about to apply, printed under a
-- heading claiming it was the one that would be refused.
--
-- Writes nothing: SELECTs only.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v target_opens=08:00 -v target_closes=21:00
--        -f scripts/data/location-hours-1-precheck.sql
-- ============================================================================

\if :{?target_opens}
\else
  -- `\quit 1` DOES NOT SET AN EXIT CODE: psql warns and exits 0, so a `set -e`
  -- runner would carry on. A raised exception under ON_ERROR_STOP=1 exits 3.
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

\pset pager off
\timing off

\echo ''
\echo '=== 0. THE TARGET THIS RUN IS FORECASTING FOR ==='

SELECT :'target_opens'  AS target_opens,
       :'target_closes' AS target_closes,
       to_char((:'target_closes'::time - interval '60 minutes'), 'HH24:MI') AS last_bookable_start;

\echo ''
\echo '=== 1. THE CARRIES. Stage 2 is given these four values and refuses if they have moved. ==='

SELECT l.id::text          AS location_id,
       l.name,
       l.is_active,
       to_char(l.opens_at,  'HH24:MI') AS opens_at,
       to_char(l.closes_at, 'HH24:MI') AS closes_at,
       coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') AS midday_from,
       coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') AS midday_to
  FROM public.locations l
 WHERE l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 ORDER BY l.name;

\echo ''
\echo '=== 2. EVERY location in the tenant, so a third clinic cannot be missed ==='

SELECT l.id::text AS location_id,
       l.name,
       l.is_active,
       to_char(l.opens_at, 'HH24:MI')  AS opens_at,
       to_char(l.closes_at, 'HH24:MI') AS closes_at,
       CASE WHEN l.id IN ('de000002-0000-0000-0000-000000000001',
                          'de000002-0000-0000-0000-000000000002')
            THEN 'IN SCOPE' ELSE 'not touched by stage 2' END AS scope
  FROM public.locations l
 ORDER BY scope, l.name;

\echo ''
\echo '=== 3. HOURS ARE ONE PAIR PER LOCATION - there is no per-weekday hours table ==='

SELECT 'a per-weekday hours table exists' AS check,
       coalesce(to_regclass('public.location_hours')::text, 'none') AS observed,
       'none' AS expected,
       CASE WHEN to_regclass('public.location_hours') IS NULL THEN 'OK' ELSE 'FAIL' END AS verdict
UNION ALL
SELECT 'locations carries exactly one opens_at/closes_at pair',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations'
           AND column_name IN ('opens_at', 'closes_at')),
       '2',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'locations'
                     AND column_name IN ('opens_at', 'closes_at')) = 2
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== 4. THE FOUR CONSTRAINTS THE TARGET HOURS MUST SATISFY ==='

SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
 WHERE c.conrelid = 'public.locations'::regclass
   AND c.contype = 'c'
 ORDER BY c.conname;

\echo ''
\echo '=== 4b. AND WHETHER EACH IN-SCOPE CLINIC WOULD SATISFY THEM AT THE TARGET ==='

SELECT l.name,
       coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') AS midday_from,
       coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') AS midday_to,
       CASE
         WHEN l.midday_closed_from IS NULL THEN 'OK (no closure)'
         WHEN l.midday_closed_from >= :'target_opens'::time
          AND l.midday_closed_to   <= :'target_closes'::time THEN 'OK'
         ELSE 'FAIL - the closure would fall outside the target hours'
       END AS midday_inside_target
  FROM public.locations l
 WHERE l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 ORDER BY l.name;

\echo ''
\echo '=== 5. WHAT THE NEW RULE WOULD REFUSE TODAY (nothing here is changed or cancelled) ==='

SELECT l.name,
       count(*) FILTER (
         WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time < :'target_opens'::time
       )::int AS future_before_target_open,
       count(*) FILTER (
         WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time
               > (:'target_closes'::time - interval '60 minutes')
       )::int AS future_after_last_start,
       count(*)::int AS future_total
  FROM public.appointments a
  JOIN public.locations l ON l.id = a.location_id
 WHERE a.starts_at > now()
   AND a.status <> 'cancelled'
   AND l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 GROUP BY l.name
 ORDER BY l.name;

\echo ''
\echo '=== 6. HAS THIS TARGET ALREADY BEEN WRITTEN? (stage 2 keys its refusal on this) ==='

SELECT count(*)::int AS audit_rows_for_this_target,
       (SELECT count(*)::int FROM public.audit_log WHERE action = 'location.hours_set')
         AS audit_rows_for_any_hours_change
  FROM public.audit_log
 WHERE action = 'location.hours_set'
   AND metadata ->> 'opens_at_after'  = :'target_opens'
   AND metadata ->> 'closes_at_after' = :'target_closes';

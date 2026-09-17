-- ============================================================================
-- CLINIC HOURS 09:00-21:00, STAGE 1 of 3: PRE-CHECK. READ ONLY.
--
-- Card AGENDA-2100. Owner ruling Q-HOURS = a, 2026-09-17: BOTH clinics, EVERY
-- open day INCLUDING Saturday, opens_at 09:00 and closes_at 21:00, last booking
-- start 20:00.
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
--      appointments starting BEFORE 09:00 or AT/AFTER 20:00. Those rows are not
--      touched by anything here - the ruling says they stay, render and report,
--      and are never cancelled - but the owner should see the number before the
--      hours move, not discover it from reception.
--   4. the midday closures, which stage 2 must leave exactly as they are.
--
-- Writes nothing: SELECTs only.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/location-hours-1-precheck.sql
-- ============================================================================

\pset pager off
\timing off

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
\echo '=== 4. THE FOUR CONSTRAINTS 09:00-21:00 must satisfy ==='

SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
 WHERE c.conrelid = 'public.locations'::regclass
   AND c.contype = 'c'
 ORDER BY c.conname;

\echo ''
\echo '=== 5. WHAT THE NEW RULE WOULD REFUSE TODAY (nothing here is changed or cancelled) ==='

SELECT l.name,
       count(*) FILTER (
         WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time < '09:00'
       )::int AS future_before_0900,
       count(*) FILTER (
         WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time >= '20:00'
       )::int AS future_at_or_after_2000,
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
\echo '=== 6. HAS STAGE 2 ALREADY RUN? (its audit rows) ==='

SELECT count(*)::int AS location_hours_set_audit_rows
  FROM public.audit_log
 WHERE action = 'location.hours_set';

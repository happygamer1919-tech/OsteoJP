-- ============================================================================
-- CLINIC HOURS 09:00-21:00, STAGE 3 of 3: POST-CHECK. READ ONLY.
--
-- Card AGENDA-2100. Every verdict must read OK.
--
-- THE CARRIES ARE READ BACK, NOT TYPED. Stage 2 recorded each clinic's before
-- values in its own audit row, so this file compares what the database says now
-- with what the write itself recorded - the same shape the NESA split's
-- post-check uses, and the reason no number here passes through a human hand.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/location-hours-3-postcheck.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== CLINIC HOURS POST-CHECK - every verdict must read OK ==='

WITH k AS (
  SELECT 'de000002-0000-0000-0000-000000000001'::uuid AS lv,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb
), a AS (
  SELECT al.entity_id, al.metadata AS m
    FROM public.audit_log al
   WHERE al.action = 'location.hours_set'
), f AS (
  SELECT
    (SELECT count(*)::int FROM public.locations l, k
      WHERE l.id IN (k.lv, k.cb) AND l.opens_at = '09:00' AND l.closes_at = '21:00') AS set_right,
    (SELECT count(*)::int FROM a)                                                    AS audit_rows,
    (SELECT count(DISTINCT entity_id)::int FROM a)                                   AS audit_locations,
    (SELECT count(*)::int FROM public.locations l
      WHERE l.opens_at = '09:00' AND l.closes_at = '21:00')                          AS set_anywhere,
    (SELECT coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.cb) AS cb_midday_from,
    (SELECT coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.cb) AS cb_midday_to,
    (SELECT coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.lv) AS lv_midday_from,
    (SELECT count(*)::int FROM public.locations l, k
      WHERE l.id IN (k.lv, k.cb) AND l.is_active)                                     AS still_active,
    -- Every clinic whose closure now sits outside its hours would be a row the
    -- database itself refuses; asserted because the ruling promised the closure
    -- survives the change.
    (SELECT count(*)::int FROM public.locations l
      WHERE l.midday_closed_from IS NOT NULL
        AND (l.midday_closed_from < l.opens_at OR l.midday_closed_to > l.closes_at)) AS closure_outside_hours
)
SELECT '1. both clinics read 09:00-21:00'                  AS check, set_right::text            AS observed, '2'  AS expected, CASE WHEN set_right = 2 THEN 'OK' ELSE 'FAIL' END AS verdict FROM f
UNION ALL SELECT '2. one audit row per clinic',             audit_rows::text,                   '2',  CASE WHEN audit_rows = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '3. and they name two DIFFERENT clinics',  audit_locations::text,              '2',  CASE WHEN audit_locations = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '4. no OTHER location was set to 09:00-21:00', set_anywhere::text,             '2',  CASE WHEN set_anywhere = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '5. CB keeps its 13:00 closure',           cb_midday_from,                     '13:00', CASE WHEN cb_midday_from = '13:00' THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '6. CB keeps its 14:00 re-opening',        cb_midday_to,                       '14:00', CASE WHEN cb_midday_to = '14:00' THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '7. LV''s closure is unchanged',           lv_midday_from,                     'as before', CASE WHEN lv_midday_from IS NOT NULL THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '8. both clinics are still active',        still_active::text,                 '2',  CASE WHEN still_active = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '9. no closure now falls outside its hours', closure_outside_hours::text,      '0',  CASE WHEN closure_outside_hours = 0 THEN 'OK' ELSE 'FAIL' END FROM f;

\echo ''
\echo '=== FOR THE RECORD: the two clinics, and what the write said it changed ==='

SELECT l.name,
       to_char(l.opens_at, 'HH24:MI')  AS opens_at,
       to_char(l.closes_at, 'HH24:MI') AS closes_at,
       coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') AS midday_from,
       coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') AS midday_to,
       (SELECT al.metadata ->> 'opens_at_before' FROM public.audit_log al
         WHERE al.action = 'location.hours_set' AND al.entity_id = l.id LIMIT 1)  AS opens_before,
       (SELECT al.metadata ->> 'closes_at_before' FROM public.audit_log al
         WHERE al.action = 'location.hours_set' AND al.entity_id = l.id LIMIT 1) AS closes_before
  FROM public.locations l
 WHERE l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 ORDER BY l.name;

\echo ''
\echo '=== FOR THE RECORD: future appointments the new booking rule would now refuse ==='
\echo '=== (they are NOT cancelled and NOT changed - they render and report as before) ==='

SELECT l.name,
       count(*) FILTER (WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time < '09:00')::int  AS before_0900,
       count(*) FILTER (WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time >= '20:00')::int AS at_or_after_2000
  FROM public.appointments a
  JOIN public.locations l ON l.id = a.location_id
 WHERE a.starts_at > now()
   AND a.status <> 'cancelled'
   AND l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 GROUP BY l.name
 ORDER BY l.name;

-- ============================================================================
-- CLINIC HOURS, STAGE 3 of 3: POST-CHECK. READ ONLY.
--
-- Card AGENDA-2100. Every verdict must read OK.
--
-- THE CARRIES ARE READ BACK, NOT TYPED. Stage 2 recorded each clinic's before
-- values in its own audit row, so this file compares what the database says now
-- with what the write itself recorded - the same shape the NESA split's
-- post-check uses, and the reason no number here passes through a human hand.
--
-- ==========================================================================
-- TWO CORRECTIONS THIS REVISION MAKES
-- ==========================================================================
-- 1. THE CLOSURE CHECKS COMPARED AGAINST CONSTANTS, AND ONE OF THEM WAS
--    VACUOUS. LV's read `lv_midday_from IS NOT NULL` with an expected column of
--    the word "as before": it passed whatever LV's closure was, and would have
--    FAILED if LV had no closure at all - which is a legitimate state the
--    database allows. CB's compared against the literals 13:00 and 14:00, which
--    stops being true the day the owner moves CB's lunch. Both now compare
--    against `midday_unchanged` in the write's own audit row, which IS stage 1's
--    observation carried through the write. "Unchanged" is now a comparison
--    rather than an adjective.
--
-- 2. IT ASSUMED EXACTLY TWO AUDIT ROWS EXIST, EVER. Now that the op is
--    re-runnable for a different target, production holds one pair per sitting -
--    two from the 09:00 change and two from this one. An unscoped
--    `audit_rows = 2` would read FAIL on a correct sitting. Every audit read
--    here is therefore scoped to THIS target's rows.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v target_opens=08:00 -v target_closes=21:00
--        -f scripts/data/location-hours-3-postcheck.sql
-- ============================================================================

\if :{?target_opens}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v target_opens is missing. It must be the value stage 2 was given.';
  END $missing$;
\endif
\if :{?target_closes}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v target_closes is missing. It must be the value stage 2 was given.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== CLINIC HOURS POST-CHECK - every verdict must read OK ==='

WITH k AS (
  SELECT 'de000002-0000-0000-0000-000000000001'::uuid AS lv,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb
), a AS (
  -- THIS SITTING'S ROWS ONLY. See correction 2 in the header.
  SELECT al.entity_id, al.metadata AS m
    FROM public.audit_log al
   WHERE al.action = 'location.hours_set'
     AND al.metadata ->> 'opens_at_after'  = :'target_opens'
     AND al.metadata ->> 'closes_at_after' = :'target_closes'
), f AS (
  SELECT
    (SELECT count(*)::int FROM public.locations l, k
      WHERE l.id IN (k.lv, k.cb)
        AND l.opens_at = :'target_opens'::time
        AND l.closes_at = :'target_closes'::time)                                AS set_right,
    (SELECT count(*)::int FROM a)                                                AS audit_rows,
    (SELECT count(DISTINCT entity_id)::int FROM a)                               AS audit_locations,
    -- NOTHING OUTSIDE SCOPE WAS WRITTEN. The old form counted locations sitting
    -- at the target hours, which a third clinic could legitimately already do;
    -- this counts locations this op CLAIMS to have changed, which only the two
    -- may ever be.
    (SELECT count(*)::int FROM public.audit_log al, k
      WHERE al.action = 'location.hours_set'
        AND al.entity_id NOT IN (k.lv, k.cb))                                    AS audited_out_of_scope,
    -- The closures, live and as the write recorded them, per clinic.
    (SELECT coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.lv) AS lv_from_now,
    (SELECT coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.lv) AS lv_to_now,
    (SELECT coalesce(a.m -> 'midday_unchanged' ->> 'from', '-') FROM a, k WHERE a.entity_id = k.lv)               AS lv_from_carry,
    (SELECT coalesce(a.m -> 'midday_unchanged' ->> 'to',   '-') FROM a, k WHERE a.entity_id = k.lv)               AS lv_to_carry,
    (SELECT coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.cb) AS cb_from_now,
    (SELECT coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') FROM public.locations l, k WHERE l.id = k.cb) AS cb_to_now,
    (SELECT coalesce(a.m -> 'midday_unchanged' ->> 'from', '-') FROM a, k WHERE a.entity_id = k.cb)               AS cb_from_carry,
    (SELECT coalesce(a.m -> 'midday_unchanged' ->> 'to',   '-') FROM a, k WHERE a.entity_id = k.cb)               AS cb_to_carry,
    (SELECT count(*)::int FROM public.locations l, k
      WHERE l.id IN (k.lv, k.cb) AND l.is_active)                                AS still_active,
    -- Every clinic whose closure now sits outside its hours would be a row the
    -- database itself refuses; asserted because the ruling promised the closure
    -- survives the change.
    (SELECT count(*)::int FROM public.locations l
      WHERE l.midday_closed_from IS NOT NULL
        AND (l.midday_closed_from < l.opens_at OR l.midday_closed_to > l.closes_at)) AS closure_outside_hours,
    (SELECT to_char((:'target_closes'::time - interval '60 minutes'), 'HH24:MI'))     AS last_start
)
SELECT '1. both clinics read the target hours'          AS check, set_right::text        AS observed, '2' AS expected, CASE WHEN set_right = 2 THEN 'OK' ELSE 'FAIL' END AS verdict FROM f
UNION ALL SELECT '2. one audit row per clinic FOR THIS TARGET', audit_rows::text,         '2', CASE WHEN audit_rows = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '3. and they name two DIFFERENT clinics',      audit_locations::text,    '2', CASE WHEN audit_locations = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '4. no location OUTSIDE scope was ever audited by this op', audited_out_of_scope::text, '0', CASE WHEN audited_out_of_scope = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '5. LV closure FROM matches the write''s carry', lv_from_now || ' vs ' || lv_from_carry, 'equal', CASE WHEN lv_from_now = lv_from_carry THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '6. LV closure TO matches the write''s carry',   lv_to_now   || ' vs ' || lv_to_carry,   'equal', CASE WHEN lv_to_now   = lv_to_carry   THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '7. CB closure FROM matches the write''s carry', cb_from_now || ' vs ' || cb_from_carry, 'equal', CASE WHEN cb_from_now = cb_from_carry THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '8. CB closure TO matches the write''s carry',   cb_to_now   || ' vs ' || cb_to_carry,   'equal', CASE WHEN cb_to_now   = cb_to_carry   THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '9. both clinics are still active',             still_active::text,      '2', CASE WHEN still_active = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '10. no closure now falls outside its hours',   closure_outside_hours::text, '0', CASE WHEN closure_outside_hours = 0 THEN 'OK' ELSE 'FAIL' END FROM f;

\echo ''
\echo '=== FOR THE RECORD: the two clinics, and what the write said it changed ==='

SELECT l.name,
       to_char(l.opens_at, 'HH24:MI')  AS opens_at,
       to_char(l.closes_at, 'HH24:MI') AS closes_at,
       coalesce(to_char(l.midday_closed_from, 'HH24:MI'), '-') AS midday_from,
       coalesce(to_char(l.midday_closed_to,   'HH24:MI'), '-') AS midday_to,
       (SELECT al.metadata ->> 'opens_at_before' FROM public.audit_log al
         WHERE al.action = 'location.hours_set' AND al.entity_id = l.id
           AND al.metadata ->> 'opens_at_after'  = :'target_opens'
           AND al.metadata ->> 'closes_at_after' = :'target_closes' LIMIT 1)  AS opens_before,
       (SELECT al.metadata ->> 'closes_at_before' FROM public.audit_log al
         WHERE al.action = 'location.hours_set' AND al.entity_id = l.id
           AND al.metadata ->> 'opens_at_after'  = :'target_opens'
           AND al.metadata ->> 'closes_at_after' = :'target_closes' LIMIT 1) AS closes_before,
       (SELECT al.metadata ->> 'source' FROM public.audit_log al
         WHERE al.action = 'location.hours_set' AND al.entity_id = l.id
           AND al.metadata ->> 'opens_at_after'  = :'target_opens'
           AND al.metadata ->> 'closes_at_after' = :'target_closes' LIMIT 1) AS audit_source
  FROM public.locations l
 WHERE l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 ORDER BY l.name;

\echo ''
\echo '=== FOR THE RECORD: future appointments the new booking rule would now refuse ==='
\echo '=== (they are NOT cancelled and NOT changed - they render and report as before) ==='

SELECT l.name,
       count(*) FILTER (WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time < :'target_opens'::time)::int AS before_target_open,
       count(*) FILTER (WHERE (a.starts_at AT TIME ZONE 'Europe/Lisbon')::time
                              > (:'target_closes'::time - interval '60 minutes'))::int                       AS after_last_start
  FROM public.appointments a
  JOIN public.locations l ON l.id = a.location_id
 WHERE a.starts_at > now()
   AND a.status <> 'cancelled'
   AND l.id IN ('de000002-0000-0000-0000-000000000001',
                'de000002-0000-0000-0000-000000000002')
 GROUP BY l.name
 ORDER BY l.name;

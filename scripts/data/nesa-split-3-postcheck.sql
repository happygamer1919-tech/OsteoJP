-- ============================================================================
-- NESA SPLIT, POST-CHECK. READ ONLY. Every verdict must read OK.
--
-- Card NESA-SPLIT-lv-bookings-to-the-lv-row. Run after stage 2, by stage 2 of
-- docs/data-op-nesa-split.md.
--
-- THE CARRIES ARE NOT TYPED, THEY ARE READ BACK (SR-59, taken one step
-- further). Stage 1 wrote its own before-counts and every moved id into its
-- audit row, so this file recomputes P3, P6 and P7 and compares them with what
-- the write itself recorded. A number that travelled through a human hand
-- cannot disagree with the database here, because no number does.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/nesa-split-3-postcheck.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== NESA SPLIT POST-CHECK - every verdict must read OK ==='

WITH k AS (
  SELECT '0c1a0000-0000-4000-8000-000000000002'::uuid AS cb_row,
         'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'::uuid AS lv_row,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc
), a AS (
  SELECT al.metadata AS m
    FROM public.audit_log al, k
   WHERE al.action = 'staff.nesa_split.reassign' AND al.entity_id = k.cb_row
   ORDER BY al.created_at DESC
   LIMIT 1
), moved AS (
  SELECT (jsonb_array_elements_text(a.m -> 'moved_ids'))::uuid AS id FROM a
), f AS (
  SELECT
    (SELECT count(*)::int FROM a)                                              AS stage1_rows,
    (SELECT (m ->> 'moved_count')::int FROM a)                                 AS moved_count,
    (SELECT (m ->> 'cb_row_appointments_before')::int FROM a)                  AS cb_before,
    (SELECT (m ->> 'lv_row_appointments_before')::int FROM a)                  AS lv_before,
    (SELECT count(*)::int FROM moved)                                          AS moved_ids,
    (SELECT count(*)::int FROM moved m2 JOIN public.appointments ap ON ap.id = m2.id, k
      WHERE ap.practitioner_id = k.lv_row)                                     AS moved_now_on_lv,
    (SELECT count(*)::int FROM public.appointments ap, k
      WHERE ap.practitioner_id = k.cb_row)                                     AS cb_now,
    (SELECT count(*)::int FROM public.appointments ap, k
      WHERE ap.practitioner_id = k.lv_row)                                     AS lv_now,
    (SELECT count(*)::int FROM public.appointments ap, k
      WHERE ap.practitioner_id = k.cb_row AND ap.location_id = k.lv_loc AND ap.starts_at > now()) AS p3_now,
    (SELECT count(*)::int FROM public.availability_templates av, k
      WHERE av.user_id = k.cb_row AND av.location_id = k.lv_loc AND av.is_active)                 AS p6_now,
    (SELECT count(*)::int FROM public.appointments ap, k
      WHERE ap.practitioner_id = k.lv_row AND ap.location_id = k.cb_loc AND ap.starts_at > now()) AS p7_now,
    (SELECT count(*)::int FROM public.users u, k WHERE u.id IN (k.cb_row, k.lv_row) AND u.is_shared_resource) AS flagged,
    (SELECT count(*)::int FROM public.users u WHERE u.is_shared_resource)      AS flagged_anywhere,
    (SELECT count(*)::int FROM public.audit_log al, k
      WHERE al.action = 'staff.set_shared_resource' AND al.entity_id IN (k.cb_row, k.lv_row))     AS stage2_rows,
    (SELECT count(*)::int FROM public.clinical_records cr WHERE cr.appointment_id IN (SELECT id FROM moved)) AS clinical,
    (SELECT count(*)::int FROM public.staff_locations sl, k WHERE sl.user_id = k.cb_row)          AS cb_clinics,
    (SELECT count(*)::int FROM public.staff_locations sl, k
      WHERE sl.user_id = k.lv_row AND sl.location_id = k.lv_loc)               AS lv_at_lv,
    (SELECT count(*)::int FROM public.appointments x JOIN public.appointments y
        ON x.id < y.id AND x.practitioner_id = y.practitioner_id
       AND tstzrange(x.starts_at, x.ends_at) && tstzrange(y.starts_at, y.ends_at), k
      WHERE x.practitioner_id = k.lv_row AND x.status = 'confirmed' AND y.status = 'confirmed')   AS confirmed_pairs
)
SELECT '1. stage 1 audit row is present'            AS check, stage1_rows::text  AS observed, '1'                        AS expected, CASE WHEN stage1_rows = 1 THEN 'OK' ELSE 'FAIL' END AS verdict FROM f
UNION ALL SELECT '2. moved_ids matches moved_count', moved_ids::text,     coalesce(moved_count::text, '(no stage 1 audit row)'),           CASE WHEN moved_ids = moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '3. every moved row is on the LV row', moved_now_on_lv::text, coalesce(moved_count::text, '(no stage 1 audit row)'),      CASE WHEN moved_now_on_lv = moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '4. CB row total = before - moved (nothing else moved)', cb_now::text, coalesce((cb_before - moved_count)::text, '(no stage 1 audit row)'), CASE WHEN cb_now = cb_before - moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '5. LV row total = before + moved (nothing else arrived)', lv_now::text, coalesce((lv_before + moved_count)::text, '(no stage 1 audit row)'), CASE WHEN lv_now = lv_before + moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '6. P3 recomputed: future LV appointments on the CB row', p3_now::text, '0',          CASE WHEN p3_now = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '7. P6 recomputed: active LV hour rows on the CB row', p6_now::text, '0',             CASE WHEN p6_now = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '8. P7 recomputed: future CB appointments on the LV row', p7_now::text, '0',          CASE WHEN p7_now = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '9. is_shared_resource true on BOTH NESA rows', flagged::text, '2',                   CASE WHEN flagged = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '10. and on no other row in the tenant', flagged_anywhere::text, '2',                 CASE WHEN flagged_anywhere = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '11. one stage 2 audit row per flagged row', stage2_rows::text, '2',                  CASE WHEN stage2_rows = 2 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '12. no clinical record hangs off a moved row', clinical::text, '0',                  CASE WHEN clinical = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '13. the CB row is still installed at one clinic', cb_clinics::text, '1',             CASE WHEN cb_clinics = 1 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '14. the LV row is still installed at Linda-a-Velha', lv_at_lv::text, '1',            CASE WHEN lv_at_lv = 1 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '15. no overlapping confirmed pair on the LV row', confirmed_pairs::text, '0',        CASE WHEN confirmed_pairs = 0 THEN 'OK' ELSE 'FAIL' END FROM f;

\echo ''
\echo '=== FOR THE RECORD: what the two NESA rows hold now ==='

SELECT u.id::text AS nesa_row,
       u.is_bookable,
       u.is_shared_resource,
       (SELECT string_agg(l.name, ', ' ORDER BY l.name)
          FROM public.staff_locations sl JOIN public.locations l ON l.id = sl.location_id
         WHERE sl.user_id = u.id) AS installed_at,
       (SELECT count(*) FROM public.appointments ap WHERE ap.practitioner_id = u.id) AS appointments,
       (SELECT count(*) FROM public.appointments ap WHERE ap.practitioner_id = u.id AND ap.starts_at > now()) AS future
  FROM public.users u
 WHERE u.id IN ('0c1a0000-0000-4000-8000-000000000002', 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a')
 ORDER BY u.id;

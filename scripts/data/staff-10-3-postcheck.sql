-- ============================================================================
-- STAFF-10 SCHEDULE ROWS, POST-CHECK. READ ONLY. Every verdict must read OK.
--
-- Card STAFF-10-jp-split-phase-2-reassignment-script (the rewrite). Run after
-- stage 2, by stage 2 of docs/data-op-staff-10.md.
--
-- THE CARRIES ARE NOT TYPED, THEY ARE READ BACK. Stage 2 wrote its own
-- before-counts and every id it touched into its audit row, so this file
-- recomputes each one and compares it with what the write itself recorded. No
-- number passes through a human hand, so no number can be transcribed wrongly.
-- That is SR-59 taken one step further, and it is why the dispatch's own figures
-- (9 pairs, 26 Saturdays, 8 every-other-week, 20 active LV rows) appear in none
-- of these three files.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-3-postcheck.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== STAFF-10 POST-CHECK - every verdict must read OK ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc,
         DATE '2026-09-30'                            AS block_day,
         (now() AT TIME ZONE 'Europe/Lisbon')::date   AS today_lisbon
), a AS (
  SELECT al.metadata AS m
    FROM public.audit_log al, k
   WHERE al.action = 'staff.jp_lv_schedule_rows.retire' AND al.entity_id = k.jp_cb
   ORDER BY al.created_at DESC
   LIMIT 1
), retired AS (
  SELECT (jsonb_array_elements_text(a.m -> 'retired_covered_ids'))::uuid AS id FROM a
  UNION ALL
  SELECT (jsonb_array_elements_text(a.m -> 'retired_sat_window_ids'))::uuid FROM a
  UNION ALL
  SELECT (jsonb_array_elements_text(a.m -> 'retired_past_ids'))::uuid FROM a
), moved AS (
  SELECT (jsonb_array_elements_text(a.m -> 'moved_saturday_ids'))::uuid AS id FROM a
), f AS (
  SELECT
    (SELECT count(*)::int FROM a)                                          AS audit_rows,
    (SELECT count(*)::int FROM public.audit_log al, k
      WHERE al.action = 'staff.jp_lv_schedule_rows.retire' AND al.entity_id = k.jp_cb) AS audit_rows_all,
    (SELECT (m ->> 'retired_count')::int FROM a)                           AS retired_count,
    (SELECT (m ->> 'moved_count')::int FROM a)                             AS moved_count,
    (SELECT (m ->> 'deleted_blocks')::int FROM a)                          AS deleted_blocks,
    (SELECT (m ->> 'appointments_before')::int FROM a)                     AS appt_before,
    (SELECT (m ->> 'appt_cb_before')::int FROM a)                          AS appt_cb_before,
    (SELECT (m ->> 'appt_lv_before')::int FROM a)                          AS appt_lv_before,
    (SELECT (m ->> 'cb_at_cb_before')::int FROM a)                         AS cb_at_cb_before,
    (SELECT (m ->> 'lv_saturdays_before')::int FROM a)                     AS lv_sat_before,
    (SELECT (m ->> 'cb_inactive_before')::int FROM a)                      AS cb_inactive_before,
    (SELECT count(*)::int FROM retired)                                    AS retired_ids,
    (SELECT count(*)::int FROM moved)                                      AS moved_ids,
    (SELECT count(*)::int FROM retired r JOIN public.availability_templates av ON av.id = r.id
      WHERE NOT av.is_active)                                              AS retired_now_inactive,
    (SELECT count(*)::int FROM moved m2 JOIN public.availability_templates av ON av.id = m2.id, k
      WHERE av.user_id = k.jp_lv)                                          AS moved_now_on_lv,
    (SELECT count(*)::int FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active
        AND (av.valid_until IS NULL OR av.valid_until >= k.today_lisbon))  AS cb_lv_future_now,
    (SELECT count(*)::int FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active
        AND (av.valid_from  IS NULL OR av.valid_from  <= k.today_lisbon)
        AND (av.valid_until IS NULL OR av.valid_until >= k.today_lisbon))  AS cb_lv_portal_now,
    (SELECT count(*)::int FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_lv AND av.location_id = k.lv_loc AND av.is_active AND av.weekday = 6) AS lv_sat_now,
    (SELECT count(*)::int FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.location_id = k.cb_loc AND av.is_active) AS cb_at_cb_now,
    (SELECT count(*)::int FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND NOT av.is_active)                     AS cb_inactive_now,
    (SELECT count(*)::int FROM public.time_off t, k
      WHERE t.user_id = k.jp_cb
        AND (t.starts_at AT TIME ZONE 'Europe/Lisbon')::date <= k.block_day
        AND (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::date >  k.block_day) AS block_now,
    (SELECT CASE WHEN (m -> 'deleted_block') ? 'starts_at'
                  AND (m -> 'deleted_block') ? 'ends_at'
                  AND (m -> 'deleted_block') ? 'reason' THEN 1 ELSE 0 END FROM a) AS block_recorded,
    (SELECT count(*)::int FROM public.appointments)                        AS appt_now,
    (SELECT count(*)::int FROM public.appointments ap, k WHERE ap.practitioner_id = k.jp_cb) AS appt_cb_now,
    (SELECT count(*)::int FROM public.appointments ap, k WHERE ap.practitioner_id = k.jp_lv) AS appt_lv_now
)
SELECT '1. stage 2 left exactly one audit row' AS check,
       f.audit_rows_all::text AS actual, '1' AS expected,
       CASE WHEN f.audit_rows_all = 1 THEN 'OK' ELSE 'FAIL' END AS verdict FROM f
UNION ALL SELECT '2. the retired ids match the recorded count',
       f.retired_ids::text, f.retired_count::text,
       CASE WHEN f.retired_ids = f.retired_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '3. every retired row is now inactive',
       f.retired_now_inactive::text, f.retired_count::text,
       CASE WHEN f.retired_now_inactive = f.retired_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '4. the moved ids match the recorded count',
       f.moved_ids::text, f.moved_count::text,
       CASE WHEN f.moved_ids = f.moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '5. every moved Saturday now belongs to JP(lv)',
       f.moved_now_on_lv::text, f.moved_count::text,
       CASE WHEN f.moved_now_on_lv = f.moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '6. JP(cb) holds NO active LV row from today forward',
       f.cb_lv_future_now::text, '0',
       CASE WHEN f.cb_lv_future_now = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '7. JP(cb) has LEFT the LV portal list (active and in window)',
       f.cb_lv_portal_now::text, '0',
       CASE WHEN f.cb_lv_portal_now = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '8. JP(lv) own Saturdays unchanged, plus exactly the moved ones',
       f.lv_sat_now::text, (f.lv_sat_before + f.moved_count)::text,
       CASE WHEN f.lv_sat_now = f.lv_sat_before + f.moved_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '9. JP(cb) Castelo Branco rows are untouched',
       f.cb_at_cb_now::text, f.cb_at_cb_before::text,
       CASE WHEN f.cb_at_cb_now = f.cb_at_cb_before THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '10. no previously-inactive row was reactivated',
       f.cb_inactive_now::text, (f.cb_inactive_before + f.retired_count)::text,
       CASE WHEN f.cb_inactive_now = f.cb_inactive_before + f.retired_count THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '11. the 30 September block is gone',
       f.block_now::text, '0',
       CASE WHEN f.block_now = 0 THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '12. the deleted block was recorded whole, so it can be restored',
       f.block_recorded::text, CASE WHEN f.deleted_blocks = 0 THEN '0' ELSE '1' END,
       CASE WHEN (f.deleted_blocks = 0 AND f.block_recorded = 0)
                 OR (f.deleted_blocks = 1 AND f.block_recorded = 1) THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '13. no appointment changed hands',
       (f.appt_cb_now::text || '/' || f.appt_lv_now::text),
       (f.appt_cb_before::text || '/' || f.appt_lv_before::text),
       CASE WHEN f.appt_cb_now = f.appt_cb_before AND f.appt_lv_now = f.appt_lv_before
            THEN 'OK' ELSE 'FAIL' END FROM f
UNION ALL SELECT '14. the appointment total is unchanged',
       f.appt_now::text, f.appt_before::text,
       CASE WHEN f.appt_now = f.appt_before THEN 'OK' ELSE 'FAIL' END FROM f;

\echo ''
\echo '=== STAFF-10 POST-CHECK COMPLETE. 14 rows, every one must read OK. ==='

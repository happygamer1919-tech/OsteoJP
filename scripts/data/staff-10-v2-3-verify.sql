-- ============================================================================
-- STAFF-10 V2, STAGE 3 of 3: THE VERIFY. READ ONLY. Verdicts OK / VACUOUS / FAIL.
--
-- Card STAFF-10 (a ruled Tier C item). Run after stage 2, by stage 3 of
-- docs/data-op-staff-10-v2.md, and re-issuable at any time: it writes nothing.
--
-- NO NUMBER IS TYPED. Stage 2 wrote every id, before-count and md5 into its one
-- audit row; this file reads them back and recomputes each against the
-- database. A VACUOUS verdict means the arm ran over an empty set and could not
-- have failed; the stage 3 block in the doc allows VACUOUS only on the arms it
-- names, and never on 1, 7, 8, 9, 10, 21 or 22.
--
-- The rows printed after the SUMMARY are the future pairs as they stand after
-- the write, ids only: the owner-only reception note points at that section.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-v2-3-verify.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== STAFF-10 V2, STAGE 3. READ ONLY. Every verdict must read OK or a named VACUOUS ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc,
         '0c1a0000-0000-4000-8000-000000000002'::uuid AS nesa_cb,
         'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'::uuid AS nesa_lv,
         (DATE '2026-09-30')::timestamp AT TIME ZONE 'Europe/Lisbon' AS blk_from,
         (DATE '2026-10-01')::timestamp AT TIME ZONE 'Europe/Lisbon' AS blk_to,
         '2000-01-01 03:00:00+00'::timestamptz AS ctl_from,
         '2000-01-01 03:01:00+00'::timestamptz AS ctl_to,
         (now() AT TIME ZONE 'Europe/Lisbon')::date AS today
), al AS (
  SELECT a.metadata AS m, a.created_at AS at, a.tenant_id AS tenant
    FROM public.audit_log a
   WHERE a.action = 'staff.staff10_v2.apply'
   ORDER BY a.created_at DESC
   LIMIT 1
), ids AS (
  SELECT 'rcov' AS s, (jsonb_array_elements_text(al.m -> 'retired_covered_ids'))::uuid AS id FROM al
  UNION ALL SELECT 'rpast', (jsonb_array_elements_text(al.m -> 'retired_past_ids'))::uuid FROM al
  UNION ALL SELECT 'rphan', (jsonb_array_elements_text(al.m -> 'retired_phantom_ids'))::uuid FROM al
  UNION ALL SELECT 'rwin', (jsonb_array_elements_text(al.m -> 'retired_sat_window_ids'))::uuid FROM al
  UNION ALL SELECT 'msat', (jsonb_array_elements_text(al.m -> 'moved_saturday_ids'))::uuid FROM al
  UNION ALL SELECT 'h', (jsonb_array_elements_text(al.m -> 'h_ids'))::uuid FROM al
  UNION ALL SELECT 'keep', (jsonb_array_elements_text(al.m -> 'keep_ids'))::uuid FROM al
), xp AS (
  SELECT (e ->> 'id')::uuid AS id, (e ->> 'from')::uuid AS from_user, (e ->> 'to')::uuid AS to_user
    FROM al, jsonb_array_elements(al.m -> 'x_pairs') e
), fp AS (
  SELECT (e ->> 'p')::uuid AS p, (e ->> 'n')::uuid AS n, (e ->> 'r')::uuid AS r,
         (e ->> 's')::timestamptz AS s, (e ->> 'e')::timestamptz AS e
    FROM al, jsonb_array_elements(al.m -> 'f_pairs') e
), written AS (
  SELECT id FROM ids WHERE s = 'h'
  UNION SELECT id FROM xp UNION SELECT p FROM fp UNION SELECT n FROM fp
), sat AS (
  -- The next REAL Saturday, today or later, on which JP(lv) holds a dated
  -- Linda-a-Velha row. The roster is evaluated there, not only today.
  SELECT min(av.valid_from) AS d
    FROM public.availability_templates av, k
   WHERE av.user_id = k.jp_lv AND av.location_id = k.lv_loc AND av.is_active IS TRUE
     AND av.valid_from IS NOT NULL AND av.valid_until IS NOT NULL AND av.valid_from = av.valid_until
     AND av.valid_from >= k.today AND extract(dow FROM av.valid_from)::int = 6
), v AS (
  SELECT
    (SELECT count(*) FROM public.audit_log a WHERE a.action = 'staff.staff10_v2.apply')::int AS audit_rows,
    (SELECT count(*) FROM ids WHERE s = 'rcov')::int AS n_rcov,
    (SELECT count(*) FROM ids JOIN public.availability_templates av ON av.id = ids.id
      WHERE ids.s = 'rcov' AND av.is_active IS NOT TRUE)::int AS rcov_off,
    (SELECT count(*) FROM ids WHERE s = 'rpast')::int AS n_rpast,
    (SELECT count(*) FROM ids JOIN public.availability_templates av ON av.id = ids.id
      WHERE ids.s = 'rpast' AND av.is_active IS NOT TRUE)::int AS rpast_off,
    (SELECT count(*) FROM ids WHERE s = 'rphan')::int AS n_rphan,
    (SELECT count(*) FROM ids JOIN public.availability_templates av ON av.id = ids.id
      WHERE ids.s = 'rphan' AND av.is_active IS NOT TRUE)::int AS rphan_off,
    (SELECT count(*) FROM ids WHERE s = 'rwin')::int AS n_rwin,
    (SELECT count(*) FROM ids JOIN public.availability_templates av ON av.id = ids.id
      WHERE ids.s = 'rwin' AND av.is_active IS NOT TRUE)::int AS rwin_off,
    (SELECT count(*) FROM ids WHERE s = 'msat')::int AS n_msat,
    (SELECT count(*) FROM ids JOIN public.availability_templates av ON av.id = ids.id, k
      WHERE ids.s = 'msat' AND av.user_id = k.jp_lv AND av.location_id = k.lv_loc AND av.is_active IS TRUE
        AND av.weekday = 6 AND av.valid_from IS NOT NULL AND av.valid_from = av.valid_until
        AND extract(dow FROM av.valid_from)::int = 6)::int AS msat_ok,
    (SELECT count(*) FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active IS TRUE)::int AS cb_lv_active,
    (SELECT count(*) FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_lv AND av.location_id = k.lv_loc AND av.is_active IS TRUE
        AND (av.valid_until IS NULL OR av.valid_until >= k.today))::int AS lv_lv_future,
    (SELECT sat.d FROM sat) AS sat_day,
    (SELECT count(*) FROM public.availability_templates av, k, sat
      WHERE sat.d IS NOT NULL AND av.user_id = k.jp_lv AND av.location_id = k.lv_loc AND av.is_active IS TRUE
        AND (av.valid_from IS NULL OR av.valid_from <= sat.d)
        AND (av.valid_until IS NULL OR av.valid_until >= sat.d))::int AS roster_lv_at_sat,
    (SELECT count(*) FROM public.availability_templates av, k, sat
      WHERE sat.d IS NOT NULL AND av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active IS TRUE
        AND (av.valid_from IS NULL OR av.valid_from <= sat.d)
        AND (av.valid_until IS NULL OR av.valid_until >= sat.d))::int AS roster_cb_at_sat,
    (SELECT count(*) FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.location_id = k.cb_loc)::int AS n_cb_sched_now,
    (SELECT md5(coalesce(string_agg((av.*)::text, E'\n' ORDER BY av.id), ''))
       FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.location_id = k.cb_loc) AS md5_cb_sched_now,
    (SELECT count(*) FROM public.availability_templates av, k
      WHERE av.user_id = k.jp_cb AND av.is_active IS NOT TRUE)::int AS cb_inactive_now,
    (SELECT jsonb_array_length(coalesce(al.m -> 'deleted_blocks', '[]'::jsonb)) FROM al)::int AS n_blk,
    (SELECT count(*) FROM public.time_off t, k
      WHERE t.user_id = k.jp_cb AND t.starts_at < k.blk_to AND t.ends_at > k.blk_from)::int AS blk_now,
    (SELECT count(*) FROM al, jsonb_array_elements(coalesce(al.m -> 'deleted_blocks', '[]'::jsonb)) b
      WHERE b ? 'id' AND b ? 'user_id' AND b ? 'starts_at' AND b ? 'ends_at' AND b ? 'reason')::int AS blk_recorded,
    (SELECT count(*) FROM ids WHERE s = 'h')::int AS n_h,
    (SELECT count(*) FROM ids JOIN public.appointments a ON a.id = ids.id, k, al
      WHERE ids.s = 'h' AND a.practitioner_id = k.jp_lv AND a.location_id = k.lv_loc
        AND a.starts_at < (al.m ->> 'day0')::timestamptz)::int AS h_ok,
    (SELECT count(*) FROM xp)::int AS n_x,
    (SELECT count(*) FROM xp JOIN public.appointments a ON a.id = xp.id
      WHERE a.practitioner_id = xp.to_user
        AND EXISTS (SELECT 1 FROM public.staff_locations sl
                     WHERE sl.user_id = xp.to_user AND sl.location_id = a.location_id))::int AS x_ok,
    (SELECT count(*) FROM fp)::int AS n_f,
    (SELECT count(*) FROM fp JOIN public.appointments a ON a.id = fp.p
      WHERE a.practitioner_2_id = fp.r AND a.status NOT IN ('cancelled', 'no_show')
        AND a.starts_at <= fp.s AND a.ends_at >= fp.e)::int AS fp_ok,
    (SELECT count(*) FROM fp JOIN public.appointments a ON a.id = fp.n
      WHERE a.status = 'cancelled')::int AS fn_ok,
    (SELECT count(*) FROM fp
      WHERE EXISTS (SELECT 1 FROM public.appointments a, al
                     WHERE a.id <> fp.n
                       AND a.tenant_id = al.tenant
                       AND (a.practitioner_id = fp.r OR a.practitioner_2_id = fp.r)
                       AND a.status NOT IN ('cancelled', 'no_show')
                       AND NOT (a.status = 'scheduled'
                                AND (a.origin = 'patient_portal'
                                     OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                                 WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
                       AND a.starts_at <= fp.s AND a.ends_at >= fp.e))::int AS mh_held,
    (SELECT count(*) FROM public.appointments a, k, al
      WHERE a.tenant_id = al.tenant
        AND (a.practitioner_id IN (k.nesa_cb, k.nesa_lv) OR a.practitioner_2_id IN (k.nesa_cb, k.nesa_lv))
        AND a.status NOT IN ('cancelled', 'no_show')
        AND NOT (a.status = 'scheduled'
                 AND (a.origin = 'patient_portal'
                      OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                  WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
        AND a.starts_at < k.ctl_to AND a.ends_at > k.ctl_from)::int AS mh_ctl,
    (SELECT count(*) FROM fp JOIN public.appointments a ON a.id = fp.p
      WHERE a.status NOT IN ('cancelled', 'no_show')
        AND NOT (a.status = 'scheduled'
                 AND (a.origin = 'patient_portal'
                      OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                  WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request'))))::int AS th_held,
    (SELECT (al.m -> 'before' ->> 'n_cr_att')::int FROM al) AS n_cr_att,
    (SELECT count(*)::int FROM public.clinical_records cr WHERE cr.appointment_id IN (SELECT id FROM written)) AS n_cr_att_now,
    (SELECT md5(coalesce(string_agg(ROW(cr.id, cr.practitioner_id, cr.appointment_id)::text, E'\n' ORDER BY cr.id), ''))
       FROM public.clinical_records cr WHERE cr.appointment_id IN (SELECT id FROM written)) AS md5_cr_att_now,
    (SELECT (al.m -> 'before' ->> 'n_keep')::int FROM al) AS n_keep,
    (SELECT md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.practitioner_2_id, a.location_id, a.starts_at,
                                        a.ends_at, a.status)::text, E'\n' ORDER BY a.id), ''))
       FROM public.appointments a WHERE a.id IN (SELECT id FROM ids WHERE s = 'keep')) AS md5_keep_now,
    (SELECT (al.m -> 'before' ->> 'n_cb_past')::int FROM al) AS n_cb_past,
    (SELECT md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.practitioner_2_id, a.location_id, a.starts_at,
                                        a.ends_at, a.status)::text, E'\n' ORDER BY a.id), ''))
       FROM public.appointments a, k, al
      WHERE a.practitioner_id = k.jp_cb AND a.location_id = k.cb_loc
        AND a.starts_at < (al.m ->> 'day0')::timestamptz) AS md5_cb_past_now,
    (SELECT count(*) FROM public.appointments a, al
      WHERE a.tenant_id = al.tenant AND a.created_at <= al.at)::int AS appt_then_now,
    (SELECT count(*) FROM written)::int AS n_written,
    (SELECT count(*) FROM written w JOIN public.appointments a ON a.id = w.id, al
      WHERE a.updated_at >= al.at)::int AS written_stamped,
    (SELECT count(*) FROM public.appointments a, k
      WHERE a.location_id = k.lv_loc AND a.practitioner_2_id = k.jp_cb)::int AS t2_cb_lv,
    (SELECT count(*) FROM public.appointments a, k
      WHERE a.practitioner_id = k.jp_lv AND a.practitioner_2_id = k.jp_lv)::int AS both_slots_lv,
    (SELECT count(*) FROM public.appointments a, k
      WHERE a.location_id = k.lv_loc AND a.practitioner_2_id IS NOT NULL)::int AS t2_lv_any,
    (SELECT count(*) FROM public.appointments a1 JOIN public.appointments a2
        ON a1.id < a2.id AND a1.practitioner_id = a2.practitioner_id
       AND tstzrange(a1.starts_at, a1.ends_at) && tstzrange(a2.starts_at, a2.ends_at), k
      WHERE a1.status = 'confirmed' AND a2.status = 'confirmed'
        AND a1.practitioner_id IN (k.jp_lv, k.nesa_cb, k.nesa_lv))::int AS confirmed_overlaps,
    (SELECT count(*) FROM public.appointments a, k
      WHERE a.status = 'confirmed' AND a.practitioner_id IN (k.jp_lv, k.nesa_cb, k.nesa_lv))::int AS confirmed_rows,
    (SELECT al.m FROM al) AS m
  FROM (SELECT 1) one
), r AS (
SELECT 1 AS n, 'the v2 audit row exists exactly once' AS "check",
       v.audit_rows::text AS observed, '1' AS expected,
       CASE WHEN v.audit_rows <> 1 THEN 'FAIL' ELSE 'OK' END AS verdict FROM v
UNION ALL SELECT 2, 'every retired covered row is now inactive',
       v.rcov_off::text, v.n_rcov::text,
       CASE WHEN v.rcov_off <> v.n_rcov THEN 'FAIL' WHEN v.n_rcov = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 3, 'every retired past row is now inactive',
       v.rpast_off::text, v.n_rpast::text,
       CASE WHEN v.rpast_off <> v.n_rpast THEN 'FAIL' WHEN v.n_rpast = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 4, 'every retired phantom row is now inactive',
       v.rphan_off::text, v.n_rphan::text,
       CASE WHEN v.rphan_off <> v.n_rphan THEN 'FAIL' WHEN v.n_rphan = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 5, 'every retired Saturday window is now inactive',
       v.rwin_off::text, v.n_rwin::text,
       CASE WHEN v.rwin_off <> v.n_rwin THEN 'FAIL' WHEN v.n_rwin = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 6, 'every moved row is an active real Saturday on JP(lv) at Linda-a-Velha',
       v.msat_ok::text, v.n_msat::text,
       CASE WHEN v.msat_ok <> v.n_msat THEN 'FAIL' WHEN v.n_msat = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 7, 'JP(cb) holds no active Linda-a-Velha row; control: JP(lv) holds one from today',
       v.cb_lv_active::text || ' / control ' || v.lv_lv_future::text, '0 / control above 0',
       CASE WHEN v.cb_lv_active <> 0 OR v.lv_lv_future = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 8, 'LV roster at the next real Saturday JP(lv) holds: JP(lv) present, JP(cb) absent',
       coalesce(v.sat_day::text, '(no such Saturday)') || ': JP(lv) ' || v.roster_lv_at_sat::text
         || ', JP(cb) ' || v.roster_cb_at_sat::text, 'JP(lv) above 0, JP(cb) 0',
       CASE WHEN v.roster_cb_at_sat <> 0 THEN 'FAIL' WHEN v.sat_day IS NULL THEN 'VACUOUS'
            WHEN v.roster_lv_at_sat = 0 THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 9, 'JP(cb) Castelo Branco schedule rows are unchanged (md5)',
       v.n_cb_sched_now::text || ' ' || left(v.md5_cb_sched_now, 8),
       (v.m -> 'before' ->> 'n_cb_sched') || ' ' || left(v.m -> 'md5' ->> 'cb_sched', 8),
       CASE WHEN v.md5_cb_sched_now IS DISTINCT FROM (v.m -> 'md5' ->> 'cb_sched') THEN 'FAIL'
            WHEN v.n_cb_sched_now = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 10, 'no previously inactive JP(cb) row was reactivated',
       v.cb_inactive_now::text,
       ((v.m -> 'before' ->> 'cb_inactive')::int + v.n_rcov + v.n_rpast + v.n_rphan + v.n_rwin)::text,
       CASE WHEN v.cb_inactive_now IS DISTINCT FROM
                 ((v.m -> 'before' ->> 'cb_inactive')::int + v.n_rcov + v.n_rpast + v.n_rphan + v.n_rwin)
            THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 11, 'no JP(cb) block overlaps 30 September any more',
       v.blk_now::text, '0',
       CASE WHEN v.blk_now <> 0 THEN 'FAIL' WHEN v.n_blk = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 12, 'every deleted block was recorded whole, so it can be restored',
       v.blk_recorded::text, v.n_blk::text,
       CASE WHEN v.blk_recorded <> v.n_blk THEN 'FAIL' WHEN v.n_blk = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 13, 'ruling (a): every recorded row is on JP(lv), at Linda-a-Velha, before the run day',
       v.h_ok::text, v.n_h::text,
       CASE WHEN v.h_ok <> v.n_h THEN 'FAIL' WHEN v.n_h = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 14, 'ruling (b): every recorded NESA row is on its target, installed at its clinic',
       v.x_ok::text, v.n_x::text,
       CASE WHEN v.x_ok <> v.n_x THEN 'FAIL' WHEN v.n_x = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 15, 'ruling (c): every person row names its NESA as practitioner_2, is live and covers the window',
       v.fp_ok::text, v.n_f::text,
       CASE WHEN v.fp_ok <> v.n_f THEN 'FAIL' WHEN v.n_f = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 16, 'ruling (c): every future NESA row is cancelled',
       v.fn_ok::text, v.n_f::text,
       CASE WHEN v.fn_ok <> v.n_f THEN 'FAIL' WHEN v.n_f = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 17, 'the machine hour: another live row holds each NESA over its whole window; control window 0',
       v.mh_held::text || ' / control ' || v.mh_ctl::text, v.n_f::text || ' / control 0',
       CASE WHEN v.mh_held <> v.n_f OR v.mh_ctl <> 0 THEN 'FAIL' WHEN v.n_f = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 18, 'the therapist hour: every future person row still holds its own practitioner',
       v.th_held::text, v.n_f::text,
       CASE WHEN v.th_held <> v.n_f THEN 'FAIL' WHEN v.n_f = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 19, 'clinical authorship: records on the written rows are unchanged (md5)',
       v.n_cr_att_now::text || ' ' || left(v.md5_cr_att_now, 8),
       v.n_cr_att::text || ' ' || left(v.m -> 'md5' ->> 'cr_att', 8),
       CASE WHEN v.md5_cr_att_now IS DISTINCT FROM (v.m -> 'md5' ->> 'cr_att') THEN 'FAIL'
            WHEN v.n_cr_att = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 20, 'ruling (d): the past twin rows no write touched are unchanged (md5)',
       left(v.md5_keep_now, 8), left(v.m -> 'md5' ->> 'keep', 8),
       CASE WHEN v.md5_keep_now IS DISTINCT FROM (v.m -> 'md5' ->> 'keep') THEN 'FAIL'
            WHEN v.n_keep = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 21, 'JP(cb) past Castelo Branco appointments are unchanged (md5)',
       left(v.md5_cb_past_now, 8), left(v.m -> 'md5' ->> 'cb_past', 8),
       CASE WHEN v.md5_cb_past_now IS DISTINCT FROM (v.m -> 'md5' ->> 'cb_past') THEN 'FAIL'
            WHEN v.n_cb_past = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 22, 'the appointment total, counting rows created up to the op, is unchanged',
       v.appt_then_now::text, v.m -> 'before' ->> 'appointments',
       CASE WHEN v.appt_then_now IS DISTINCT FROM (v.m -> 'before' ->> 'appointments')::int THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 23, 'every appointment the op wrote carries updated_at at or after the op',
       v.written_stamped::text, v.n_written::text,
       CASE WHEN v.written_stamped <> v.n_written THEN 'FAIL' WHEN v.n_written = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 24, 'no LV row names JP(cb) as practitioner_2 and none holds JP(lv) in both slots; control: LV rows with a practitioner_2',
       (v.t2_cb_lv + v.both_slots_lv)::text || ' / control ' || v.t2_lv_any::text, '0 / control above 0',
       CASE WHEN v.t2_cb_lv + v.both_slots_lv <> 0 THEN 'FAIL' WHEN v.t2_lv_any = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 25, 'no two confirmed rows overlap on JP(lv) or either NESA row; control: their confirmed rows',
       v.confirmed_overlaps::text || ' / control ' || v.confirmed_rows::text, '0 / control above 0',
       CASE WHEN v.confirmed_overlaps <> 0 THEN 'FAIL' WHEN v.confirmed_rows = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
)
SELECT r.n, r."check", r.observed, r.expected, r.verdict FROM r
UNION ALL
SELECT 99, 'SUMMARY',
       count(*) FILTER (WHERE r.verdict = 'OK')::text || ' OK / '
         || count(*) FILTER (WHERE r.verdict = 'VACUOUS')::text || ' VACUOUS / '
         || count(*) FILTER (WHERE r.verdict = 'FAIL')::text || ' FAIL',
       count(*)::text || ' verdicts', 'SUMMARY'
  FROM r
 ORDER BY 1;

-- ---------------------------------------------------------------------------
-- RECEPTION: the future pairs as they stand after the write. Ids only. The
-- owner-only reception note points here; nothing below is a verdict.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== RECEPTION: each future pair after the write. The person row stands with the NESA as Terapeuta 2; the NESA row is cancelled ==='
SELECT (a.starts_at AT TIME ZONE 'Europe/Lisbon')::text AS starts_lisbon,
       (e ->> 'p') AS person_row_kept,
       a.status::text AS person_row_status,
       (e ->> 'n') AS nesa_row_cancelled,
       n.status::text AS nesa_row_status,
       (e ->> 'r') AS nesa_now_terapeuta_2,
       a.patient_id::text AS patient_id,
       l.name AS clinic
  FROM public.audit_log al
 CROSS JOIN LATERAL jsonb_array_elements(al.metadata -> 'f_pairs') e
  JOIN public.appointments a ON a.id = (e ->> 'p')::uuid
  JOIN public.appointments n ON n.id = (e ->> 'n')::uuid
  JOIN public.locations l ON l.id = a.location_id
 WHERE al.action = 'staff.staff10_v2.apply'
 ORDER BY a.starts_at, (e ->> 'p');

ROLLBACK;

\echo ''
\echo '=== STAFF-10 V2 STAGE 3 COMPLETE. Nothing was written. ==='

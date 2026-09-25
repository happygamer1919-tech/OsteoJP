-- ============================================================================
-- DUR-01, STAGE 3 of 3: THE VERIFY. READ ONLY. Verdicts OK / VACUOUS / FAIL.
--
-- Card DUR-01 (docs/data-op-dur-01.md). Run after stage 2, and re-issuable at
-- any time: it writes nothing.
--
-- NO NUMBER IS TYPED. Stage 2 wrote every id, its before and after end, the
-- excluded ids by verdict, the carries and the md5s into its one audit row;
-- this file reads them back and recomputes each against the database. A
-- VACUOUS verdict means the arm ran over an empty set and could not have
-- failed; the stage 3 block in the doc allows it only on verdict 18 (no row was
-- excluded). Stage 2 refuses an empty write set (R06), so every other arm always
-- has rows to read. An instrument that cannot see the written rows (verdict
-- 11's control) FAILs, never VACUOUS, because its zero would green 12 to 17.
--
-- The rows printed after the SUMMARY are every row stage 2 did not write, as
-- it stands now, ids only: reception's list, re-issuable.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/dur-01-3-verify.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== DUR-01, STAGE 3. READ ONLY. Every verdict must read OK, or VACUOUS where the block allows it ==='

WITH al AS (
  SELECT a.metadata AS m, a.created_at AS at, a.tenant_id AS tenant
    FROM public.audit_log a
   WHERE a.action = 'staff.dur01.extend_import_duration'
   ORDER BY a.created_at DESC
   LIMIT 1
), wl AS (
  SELECT (e ->> 'id')::uuid AS id, (e ->> 'service_id')::uuid AS service_id, (e ->> 'duration_min')::int AS duration_min,
         (e ->> 'before_end')::timestamptz AS before_end, (e ->> 'after_end')::timestamptz AS after_end,
         (e ->> 'before_updated_at')::timestamptz AS before_updated_at
    FROM al, jsonb_array_elements(al.m -> 'written') e
), xl AS (
  SELECT x.key AS verdict, (jsonb_array_elements_text(x.value))::uuid AS id
    FROM al, jsonb_each(al.m -> 'excluded') x
),
-- The written rows, read at their end as it stands now.
cand AS (
  SELECT a.id, a.tenant_id, a.patient_id, a.patient_2_id, a.practitioner_id, a.practitioner_2_id,
         a.location_id, a.room, a.starts_at AS s, a.ends_at AS e
    FROM public.appointments a WHERE a.id IN (SELECT wl.id FROM wl)
),
-- >>> DUR-01 RECHECK BEGIN. The app's rule again, over the rows stage 2 wrote,
-- each read at its end as it now stands. Byte-identical in stage 2 (after the
-- write, inside its transaction) and stage 3 (scripts/dur-01-data-op.test.mjs
-- asserts it); only the cand CTE before it differs, and says where its ids
-- come from. live_self is the positive control: every written row is itself a
-- live row, so a live filter that cannot see them reads fewer than n.
-- >>> DUR-01 RULE BEGIN. The app's own rule for one candidate window, INLINE.
-- These lines are byte-identical in stage 1's BASE, stage 2's BASE, stage 2's
-- RECHECK and stage 3's RECHECK (scripts/dur-01-data-op.test.mjs asserts it).
-- They read one input, cand (id, tenant_id, patient_id, patient_2_id,
-- practitioner_id, practitioner_2_id, location_id, room, s, e): the window
-- [s, e) each candidate would hold. Every interval is half-open, as
-- apps/web/lib/scheduling/overlap.ts and appointment_conflicts compare them.
--
-- WHY INLINE. public.appointment_conflicts and public.is_unconfirmed_pedido
-- filter on jwt_tenant_id(), which is NULL in a psql session with no claims, so
-- called from here they answer "no conflict" and "not a pedido" for every row.
-- The tenant is taken from the candidate row instead.
--
-- THE SHARED RESOURCES, as listSharedResourcesTx reads them
-- (apps/web/lib/scheduling/shared-resources.ts): flagged and active.
shared AS (
  SELECT u.id, u.tenant_id
    FROM public.users u
   WHERE u.is_shared_resource IS TRUE AND u.is_active IS TRUE
),
-- The shared resources each candidate names in either slot
-- (conflict.ts, sharedResourcesAmong). A person named as Terapeuta 2 holds
-- nothing (W4-19), so only a shared resource enters here.
c_res AS (
  SELECT c.id AS cand_id, r.id AS res_id
    FROM cand c
    JOIN shared r ON r.tenant_id = c.tenant_id AND r.id IN (c.practitioner_id, c.practitioner_2_id)
),
-- A row that holds its hour: not cancelled or no-show (0052), and not an
-- unconfirmed pedido (0067's body of is_unconfirmed_pedido, inline). Bounded to
-- the candidates' horizon, which changes no answer: a row that overlaps a
-- candidate ends after the earliest candidate start and starts before the
-- latest candidate end.
live AS (
  SELECT o.id, o.tenant_id, o.patient_id, o.patient_2_id, o.practitioner_id, o.practitioner_2_id,
         o.location_id, o.room, o.status, o.starts_at, o.ends_at
    FROM public.appointments o
   WHERE o.status NOT IN ('cancelled', 'no_show')
     AND NOT (o.status = 'scheduled'
              AND (o.origin = 'patient_portal'
                   OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                               WHERE sn.appointment_id = o.id AND sn.kind = 'appointment_request')))
     AND o.ends_at > (SELECT min(c.s) FROM cand c)
     AND o.starts_at < (SELECT max(c.e) FROM cand c)
),
-- THE BOOKING ARMS (findConflicts): the therapist arm and the room arm of
-- appointment_conflicts (0059), then for every shared resource the candidate
-- names, the rows where it is Terapeuta and the rows where it is Terapeuta 2.
-- The candidate itself is excluded, as excludeIds excludes it.
hit_booking AS (
  SELECT c.id AS cand_id, o.id AS other_id, o.starts_at AS other_s, o.ends_at AS other_e,
         CASE WHEN o.practitioner_id = c.practitioner_id THEN 'therapist'
              WHEN o.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id) THEN 'resource_as_terapeuta'
              WHEN o.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id) THEN 'resource_as_terapeuta_2'
              ELSE 'room' END AS arm
    FROM cand c
    JOIN live o ON o.tenant_id = c.tenant_id AND o.id <> c.id
               AND o.starts_at < c.e AND o.ends_at > c.s
   WHERE o.practitioner_id = c.practitioner_id
      OR o.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR o.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR (nullif(btrim(c.room), '') IS NOT NULL AND o.location_id = c.location_id
          AND lower(o.room) = lower(btrim(c.room)))
),
-- THE BLOCK ARM (findScheduleConflicts): time_off on the Terapeuta, which is
-- therapist-wide and carries no clinic.
hit_block AS (
  SELECT c.id AS cand_id, t.id AS block_id, t.starts_at AS block_s, t.ends_at AS block_e
    FROM cand c
    JOIN public.time_off t
      ON t.tenant_id = c.tenant_id AND t.user_id = c.practitioner_id
     AND t.starts_at < c.e AND t.ends_at > c.s
),
-- THE SAME PATIENT BOOKED ELSEWHERE. Not in the app's rule; the op adds it, and
-- it is the check that sees a twin whose two rows name different people.
hit_patient AS (
  SELECT c.id AS cand_id, o.id AS other_id, o.starts_at AS other_s, o.ends_at AS other_e
    FROM cand c
    JOIN live o ON o.tenant_id = c.tenant_id AND o.id <> c.id
               AND o.starts_at < c.e AND o.ends_at > c.s
   WHERE o.patient_id IN (c.patient_id, c.patient_2_id)
      OR o.patient_2_id IN (c.patient_id, c.patient_2_id)
),
-- THE CLINIC (clinic-closure-enforcement.ts and clinic-hours.ts), anchored on
-- the candidate's own Lisbon day. The midday closure is any overlap, both ends
-- set, minutes only (lisbonDateTimeToUtc reads hours and minutes). The start
-- must fall between opens_at and closes_at minus BOOKING_LEAD_MIN (60), both
-- ends inclusive. Ending after closing time is not a rule in the app: printed,
-- never a verdict. A clinic the tenant does not have answers no refusal.
clinic AS (
  SELECT c.id AS cand_id, l.name AS clinic_name,
         (l.midday_closed_from IS NOT NULL AND l.midday_closed_to IS NOT NULL
          AND (((c.s AT TIME ZONE 'Europe/Lisbon')::date + date_trunc('minute', l.midday_closed_from::interval))
                AT TIME ZONE 'Europe/Lisbon') < c.e
          AND c.s < (((c.s AT TIME ZONE 'Europe/Lisbon')::date + date_trunc('minute', l.midday_closed_to::interval))
                      AT TIME ZONE 'Europe/Lisbon')) IS TRUE AS in_closure,
         ((extract(hour FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int * 60
           + extract(minute FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int)
            < (extract(hour FROM l.opens_at)::int * 60 + extract(minute FROM l.opens_at)::int)
          OR (extract(hour FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int * 60
              + extract(minute FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int)
            > (extract(hour FROM l.closes_at)::int * 60 + extract(minute FROM l.closes_at)::int - 60)) IS TRUE
           AS out_of_window,
         (c.e > (((c.s AT TIME ZONE 'Europe/Lisbon')::date + date_trunc('minute', l.closes_at::interval))
                  AT TIME ZONE 'Europe/Lisbon')) IS TRUE AS ends_after_close
    FROM cand c
    LEFT JOIN public.locations l ON l.id = c.location_id AND l.tenant_id = c.tenant_id
),
-- THE THERAPIST'S HOURS (availability-enforcement.ts, checkAvailability, RB-03),
-- which the app's reschedule enforces outside the "Guardar mesmo assim" gate.
-- Configured: any active template for (Terapeuta, clinic), any weekday. Not
-- configured is no refusal. Configured, the window [start, start + duration) in
-- Lisbon wall-clock minutes must sit inside one merged run of that day's active
-- windows (weekday = the Lisbon date's weekday, the date inside valid_from and
-- valid_until, open bounds allowed), adjacent windows merging (isRangeCovered).
av_cfg AS (
  SELECT c.id AS cand_id,
         EXISTS (SELECT 1 FROM public.availability_templates av
                  WHERE av.tenant_id = c.tenant_id AND av.user_id = c.practitioner_id
                    AND av.location_id = c.location_id AND av.is_active IS TRUE) AS configured,
         (c.s AT TIME ZONE 'Europe/Lisbon')::date AS d,
         (extract(hour FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int * 60
          + extract(minute FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int) AS s_min,
         (extract(hour FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int * 60
          + extract(minute FROM (c.s AT TIME ZONE 'Europe/Lisbon'))::int)
           + extract(epoch FROM (c.e - c.s)) / 60 AS e_min
    FROM cand c
),
av_win AS (
  SELECT g.cand_id,
         extract(hour FROM av.start_time)::int * 60 + extract(minute FROM av.start_time)::int AS ws,
         extract(hour FROM av.end_time)::int * 60 + extract(minute FROM av.end_time)::int AS we
    FROM av_cfg g
    JOIN cand c ON c.id = g.cand_id
    JOIN public.availability_templates av
      ON av.tenant_id = c.tenant_id AND av.user_id = c.practitioner_id AND av.location_id = c.location_id
     AND av.is_active IS TRUE AND av.weekday = extract(dow FROM g.d)::int
     AND (av.valid_from IS NULL OR g.d >= av.valid_from)
     AND (av.valid_until IS NULL OR g.d <= av.valid_until)
),
av_w2 AS (
  SELECT w.cand_id, w.ws, w.we,
         max(w.we) OVER (PARTITION BY w.cand_id ORDER BY w.ws, w.we
                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max
    FROM av_win w
),
av_w3 AS (
  SELECT w.cand_id, w.ws, w.we,
         sum(CASE WHEN w.prev_max IS NULL OR w.ws > w.prev_max THEN 1 ELSE 0 END)
           OVER (PARTITION BY w.cand_id ORDER BY w.ws, w.we ROWS UNBOUNDED PRECEDING) AS grp
    FROM av_w2 w
),
av_run AS (
  SELECT w.cand_id, w.grp, min(w.ws) AS rs, max(w.we) AS re
    FROM av_w3 w
   GROUP BY w.cand_id, w.grp
),
avail AS (
  SELECT g.cand_id, g.configured,
         (NOT g.configured
          OR EXISTS (SELECT 1 FROM av_run r
                      WHERE r.cand_id = g.cand_id AND r.rs <= g.s_min AND r.re >= g.e_min)) AS covered
    FROM av_cfg g
),
-- <<< DUR-01 RULE END
rc AS (
  SELECT (SELECT count(*) FROM cand)::int AS n,
         (SELECT count(*) FROM cand c WHERE c.id IN (SELECT o.id FROM live o))::int AS live_self,
         (SELECT count(DISTINCT x.cand_id) FROM hit_booking x)::int AS booking,
         (SELECT count(DISTINCT x.cand_id) FROM hit_block x)::int AS block,
         (SELECT count(*) FROM clinic x WHERE x.in_closure)::int AS closure,
         (SELECT count(*) FROM clinic x WHERE x.out_of_window)::int AS clinic_hours,
         (SELECT count(*) FROM avail x WHERE NOT x.covered)::int AS therapist_hours,
         (SELECT count(DISTINCT x.cand_id) FROM hit_patient x)::int AS patient,
         (SELECT count(*) FROM clinic x WHERE x.ends_after_close)::int AS ends_after_close,
         (SELECT count(*) FROM avail x WHERE x.configured)::int AS hours_configured
)
-- <<< DUR-01 RECHECK END
, v AS (
  SELECT
    (SELECT count(*) FROM public.audit_log a WHERE a.action = 'staff.dur01.extend_import_duration')::int AS n_audit,
    (SELECT count(*) FROM wl)::int AS n_w,
    (SELECT count(DISTINCT wl.id) FROM wl)::int AS n_w_distinct,
    (SELECT (al.m -> 'carries' ->> 'dur01_count')::int FROM al) AS carried_n,
    (SELECT (al.m -> 'before' ->> 'written')::int FROM al) AS before_n,
    (SELECT count(*) FROM wl JOIN public.appointments a ON a.id = wl.id
      WHERE a.tenant_id = (SELECT al.tenant FROM al))::int AS exists_n,
    (SELECT count(*) FROM wl JOIN public.appointments a ON a.id = wl.id WHERE a.ends_at = wl.after_end)::int AS at_after,
    (SELECT count(*) FROM wl JOIN public.appointments a ON a.id = wl.id
       JOIN public.services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.ends_at = a.starts_at + make_interval(mins => s.duration_min))::int AS at_default,
    (SELECT count(*) FROM wl JOIN public.appointments a ON a.id = wl.id
      WHERE a.ends_at - a.starts_at = interval '1 minute')::int AS still_short,
    (SELECT coalesce(md5(string_agg(wl.id::text || '@' || extract(epoch FROM wl.after_end)::bigint::text,
                                    ',' ORDER BY wl.id)), 'empty') FROM wl) AS digest_replay,
    (SELECT al.m -> 'carries' ->> 'dur01_digest' FROM al) AS digest_carried,
    (SELECT count(*) FROM wl JOIN public.appointments a ON a.id = wl.id
      WHERE wl.before_end = a.starts_at + interval '1 minute')::int AS undo_exact,
    (SELECT count(*) FROM wl JOIN public.appointments a ON a.id = wl.id
      WHERE a.updated_at >= (SELECT (al.m ->> 'clock')::timestamptz FROM al))::int AS stamped,
    (SELECT md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.practitioner_id, a.location_id,
                                     a.service_id, a.room, a.starts_at, a.status, a.recurrence_rule, a.recurrence_parent_id,
                                     a.notes, a.created_by, a.created_at, a.confirmation_state, a.confirmation_received_at,
                                     a.confirmation_channel, a.booking_group_id, a.batch_id, a.patient_2_id,
                                     a.practitioner_2_id, a.origin, a.pack_instance_id)::text, E'\n' ORDER BY a.id), ''))
       FROM public.appointments a WHERE a.id IN (SELECT wl.id FROM wl)) AS frozen_now,
    (SELECT al.m -> 'md5' ->> 'frozen' FROM al) AS frozen_then,
    (SELECT count(*) FROM xl)::int AS n_x,
    (SELECT count(*) FROM xl JOIN public.appointments a ON a.id = xl.id
      WHERE a.ends_at - a.starts_at = interval '1 minute')::int AS x_still_short,
    (SELECT count(*) FROM public.appointments a
      WHERE a.tenant_id = (SELECT al.tenant FROM al) AND a.created_at <= (SELECT al.at FROM al))::int AS total_then_now,
    (SELECT (al.m -> 'before' ->> 'appointments')::int FROM al) AS total_before,
    rc.n AS rc_n, rc.live_self, rc.booking, rc.block, rc.closure, rc.clinic_hours, rc.therapist_hours, rc.patient,
    rc.ends_after_close, rc.hours_configured
  FROM rc
), r AS (
  SELECT 1 AS n, 'exactly one DUR-01 audit row' AS "check", v.n_audit::text AS observed, '1' AS expected,
         CASE WHEN v.n_audit <> 1 THEN 'FAIL' ELSE 'OK' END AS verdict
    FROM v
UNION ALL SELECT 2, 'the written list: distinct ids, as many as the carried count and the recorded count',
       v.n_w::text || ' / distinct ' || v.n_w_distinct::text,
       coalesce(v.carried_n::text, 'none') || ' / recorded ' || coalesce(v.before_n::text, 'none'),
       CASE WHEN v.n_w <> v.n_w_distinct OR v.n_w IS DISTINCT FROM v.carried_n OR v.n_w IS DISTINCT FROM v.before_n
            THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 3, 'every written id still exists, in the recorded tenant',
       v.exists_n::text, v.n_w::text,
       CASE WHEN v.exists_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 4, 'every written id ends at its recorded after end',
       v.at_after::text, v.n_w::text,
       CASE WHEN v.at_after <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 5, 'every written id ends at its start plus its service default, read now',
       v.at_default::text, v.n_w::text,
       CASE WHEN v.at_default <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 6, 'no written id lasts one minute any more',
       v.still_short::text || ' / control ' || v.n_w::text, '0 / control above 0',
       CASE WHEN v.still_short <> 0 THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 7, 'the recorded after ends reproduce the carried digest',
       left(v.digest_replay, 8), left(coalesce(v.digest_carried, 'none'), 8),
       CASE WHEN v.digest_replay IS DISTINCT FROM v.digest_carried THEN 'FAIL'
            WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 8, 'the undo is exact: every recorded before end is its start plus one minute',
       v.undo_exact::text, v.n_w::text,
       CASE WHEN v.undo_exact <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 9, 'every written id carries updated_at at or after the op''s clock',
       v.stamped::text, v.n_w::text,
       CASE WHEN v.stamped <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 10, 'every written id is unchanged in every column the op does not write (md5)',
       left(coalesce(v.frozen_now, 'none'), 8), left(coalesce(v.frozen_then, 'none'), 8),
       CASE WHEN v.frozen_now IS DISTINCT FROM v.frozen_then THEN 'FAIL'
            WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 11, 'the re-measure reads every written id, and sees each as a live row (its control)',
       v.rc_n::text || ' / live ' || v.live_self::text, v.n_w::text || ' / live ' || v.n_w::text,
       CASE WHEN v.rc_n <> v.n_w OR v.live_self <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 12, 'no written id overlaps a booking: therapist, room, resource as Terapeuta or as Terapeuta 2',
       v.booking::text || ' / control ' || v.live_self::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.booking <> 0 OR v.live_self <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 13, 'no written id overlaps a block on its therapist',
       v.block::text || ' / control ' || v.rc_n::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.block <> 0 OR v.rc_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 14, 'no written id runs into its clinic''s midday closure',
       v.closure::text || ' / control ' || v.rc_n::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.closure <> 0 OR v.rc_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 15, 'no written id starts outside its clinic''s hours',
       v.clinic_hours::text || ' / control ' || v.rc_n::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.clinic_hours <> 0 OR v.rc_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 16, 'every written id sits inside its therapist''s hours, where they are configured',
       v.therapist_hours::text || ' / configured ' || v.hours_configured::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.therapist_hours <> 0 OR v.rc_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 17, 'no written id overlaps another live booking of the same patient',
       v.patient::text || ' / control ' || v.live_self::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.patient <> 0 OR v.live_self <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 18, 'every id the op held still lasts one minute',
       v.x_still_short::text, v.n_x::text,
       CASE WHEN v.x_still_short <> v.n_x THEN 'FAIL' WHEN v.n_x = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 19, 'the appointment total, counting rows created up to the op, equals the recorded count',
       v.total_then_now::text, coalesce(v.total_before::text, 'none'),
       CASE WHEN v.total_then_now IS DISTINCT FROM v.total_before THEN 'FAIL' ELSE 'OK' END FROM v
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
-- RECEPTION: every row stage 2 held, as it stands now. Ids only.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== RECEPTION: every row stage 2 did not write, by the verdict it held it under, as it stands now ==='
SELECT x.key AS verdict, a.id::text AS appointment,
       to_char(a.starts_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS starts_lisbon,
       to_char(a.ends_at AT TIME ZONE 'Europe/Lisbon', 'HH24:MI') AS ends_now,
       a.status::text AS status, a.practitioner_id::text AS therapist_id, a.patient_id::text AS patient_id,
       l.name AS clinic
  FROM public.audit_log al
 CROSS JOIN LATERAL jsonb_each(al.metadata -> 'excluded') x
 CROSS JOIN LATERAL jsonb_array_elements_text(x.value) e(id)
  JOIN public.appointments a ON a.id = e.id::uuid
  LEFT JOIN public.locations l ON l.id = a.location_id
 WHERE al.action = 'staff.dur01.extend_import_duration'
 ORDER BY x.key, a.starts_at, a.id;

ROLLBACK;

\echo ''
\echo '=== DUR-01 STAGE 3 COMPLETE. Nothing was written. ==='

-- ============================================================================
-- STAFF-10 SCHEDULE ROWS, STAGE 1 of 3: THE PREVIEW. IT WRITES NOTHING.
--
-- Card STAFF-10-jp-split-phase-2-reassignment-script (the rewrite). Owner
-- rulings in force, 2026-09-18:
--   - the two JP rows STAY. Nothing here merges them.
--   - JP works Linda-a-Velha EVERY OTHER Saturday.
--   - JP(cb)'s Wednesday blocks mean "not at Castelo Branco" only.
--   - JP(cb)'s 30 September block was wrong.
--   - clinical authorship NEVER moves. PAST APPOINTMENTS NEVER MOVE.
--
-- WHAT THIS OPERATION IS, AND WHAT IT IS NOT. It touches SCHEDULE ROWS and one
-- absence block. It does not touch a single appointment, clinical record or
-- episode, in any stage. The duplicate bookings the dispatch measured are NOT
-- cancelled here: a cancellation is reception's to make, one at a time, from
-- docs/staff-10-reception-list.md, and stage 1 prints the list they work from.
-- Section 4c, added 2026-09-22, lists a second kind of twin that is NOT a JP
-- row: one NESA session imported twice, once on a NESA resource row and once
-- on the person. It is on this list because the owner ruled it onto the
-- STAFF-10 twin list; like lists A and B it is read only and names ids only.
--
-- WHY NOT CANCEL THEM HERE, stated because it was checked rather than assumed:
-- a cancel is already silent to the patient (no SMS, no email, no template
-- exists), and an already-scheduled reminder is suppressed at send time by the
-- dispatcher's own status re-read. So silence is not the obstacle. The obstacle
-- is that a cancel is a clinical-diary decision about a real person's visit,
-- and nine pairs is a number a human can work. A script that cancels in bulk
-- would be making that call for them.
--
-- EVERY TARGET SET BELOW IS RE-DERIVED FROM THE DATABASE AT RUN TIME. No count,
-- no id and no date from the dispatch appears anywhere in this file. The
-- dispatch's own figures (9 pairs, 1 CB/LV pair, 2 real LV double bookings, 26
-- Saturdays, 8 every-other-week Saturdays, 20 active LV hour rows, 3 reminders
-- already sent) are HISTORY: they were measured by another lane at another
-- hour, and if they disagree with what this file prints, what this file prints
-- is what is true.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-1-preview.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== STAFF-10 SCHEDULE ROWS, STAGE 1. READ ONLY. ==='

-- ---------------------------------------------------------------------------
-- 0. SCOPE. The two JP rows and the two clinics, by id, with what each row
--    holds today. The ids are the ones STAFF-09 established and STAFF-10 and
--    STAFF-11 both carry; they are asserted to exist in section 2.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 0. SCOPE: the two JP rows, and where each one holds hours ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc,
         (now() AT TIME ZONE 'Europe/Lisbon')::date   AS today_lisbon
)
SELECT CASE WHEN u.id = k.jp_cb THEN 'JP(cb)' ELSE 'JP(lv)' END AS jp_row,
       u.id::text,
       u.full_name,
       u.is_active,
       u.is_bookable,
       l.name AS clinic,
       count(*) FILTER (WHERE av.is_active)                                       AS active_rows,
       count(*) FILTER (WHERE av.is_active
                          AND (av.valid_from  IS NULL OR av.valid_from  <= k.today_lisbon)
                          AND (av.valid_until IS NULL OR av.valid_until >= k.today_lisbon)) AS active_in_window,
       count(*)                                                                   AS all_rows
  FROM k
  JOIN public.users u                     ON u.id IN (k.jp_cb, k.jp_lv)
  LEFT JOIN public.availability_templates av ON av.user_id = u.id
  LEFT JOIN public.locations l            ON l.id = av.location_id
 GROUP BY u.id, u.full_name, u.is_active, u.is_bookable, l.name, k.jp_cb
 ORDER BY jp_row, clinic;

\echo ''
\echo '    active_in_window is the PORTAL predicate (apps/api/lib/appointments/store.ts,'
\echo '    listBookableTherapists): active AND the row window covers today in Lisbon.'
\echo '    JP(cb) leaves the LV portal list when its LV active_in_window reaches 0.'

-- ---------------------------------------------------------------------------
-- 1. THE CARRIES. Stage 2 is handed these two values and refuses if either has
--    moved. The digest is md5 over the ORDERED (action, id) pairs of every row
--    stage 2 will touch, so a set that changes membership without changing
--    size is still caught.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. THE CARRIES. Stage 2 is given these and refuses if they have moved. ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         (now() AT TIME ZONE 'Europe/Lisbon')::date   AS today_lisbon
),
-- Every JP(cb) row at Linda-a-Velha, classified. A row is DATED when its
-- window is a single day (valid_from = valid_until), which is the only way
-- this schema can express one calendar date: there is no biweekly column, so
-- "every other Saturday" is always a run of dated rows.
cb_lv AS (
  SELECT av.*, k.today_lisbon,
         (av.valid_from IS NOT NULL AND av.valid_from = av.valid_until) AS is_dated
    FROM public.availability_templates av, k
   WHERE av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active
),
-- (a) RETIRE: a dated row JP(lv) already covers, same weekday and hours, on the
--     same date. The clinic loses nothing: the other row already holds it.
retire_covered AS (
  SELECT c.id FROM cb_lv c, k
   WHERE c.is_dated
     AND EXISTS (SELECT 1 FROM public.availability_templates o
                  WHERE o.user_id = k.jp_lv AND o.location_id = k.lv_loc AND o.is_active
                    AND o.weekday = c.weekday AND o.start_time = c.start_time
                    AND o.end_time = c.end_time
                    AND o.valid_from = c.valid_from AND o.valid_until = c.valid_until)
),
-- (b) MOVE: a FUTURE dated Saturday JP(lv) does not hold. Saturday is weekday 6
--     (0 = Sunday, matching JS getDay(); schema.ts weekday_range CHECK).
move_saturdays AS (
  SELECT c.id FROM cb_lv c, k
   WHERE c.is_dated AND c.weekday = 6 AND c.valid_from >= k.today_lisbon
     AND c.id NOT IN (SELECT id FROM retire_covered)
),
-- (c) RETIRE: a RECURRING Saturday window (no single-day window). The owner
--     ruled every OTHER Saturday, and a recurring row says every Saturday.
retire_sat_windows AS (
  SELECT c.id FROM cb_lv c WHERE NOT c.is_dated AND c.weekday = 6
),
-- (d) RETIRE: a dated row whose day is already past. It cannot serve anyone and
--     it keeps JP(cb) on the LV list under the pre-PORTAL-ROSTER reading.
retire_past AS (
  SELECT c.id FROM cb_lv c, k
   WHERE c.is_dated AND c.valid_until < k.today_lisbon
     AND c.id NOT IN (SELECT id FROM retire_covered)
),
-- (e) DELETE: the 30 September all-day block, DERIVED not pinned. time_off
--     carries no is_active and no deleted_at, so a block can only be deleted;
--     stage 2 records the whole row in its audit metadata first.
block_30_sep AS (
  SELECT t.id FROM public.time_off t, k
   WHERE t.user_id = k.jp_cb
     AND (t.starts_at AT TIME ZONE 'Europe/Lisbon')::date <= DATE '2026-09-30'
     AND (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::date >  DATE '2026-09-30'
),
targets AS (
  SELECT 'retire_covered'     AS action, id FROM retire_covered
  UNION ALL SELECT 'move_saturday',       id FROM move_saturdays
  UNION ALL SELECT 'retire_sat_window',   id FROM retire_sat_windows
  UNION ALL SELECT 'retire_past',         id FROM retire_past
  UNION ALL SELECT 'delete_block',        id FROM block_30_sep
)
SELECT 'staff10_expected_count' AS carry,
       (SELECT count(*)::text FROM targets)  AS value
UNION ALL
SELECT 'staff10_expected_digest',
       (SELECT coalesce(md5(string_agg(action || ':' || id::text, ',' ORDER BY action, id)), 'empty')
          FROM targets);

\echo ''
\echo '    A carry of 0 with digest "empty" means there is nothing to do and stage 2'
\echo '    will refuse. That is a finished state, not a failure.'

-- ---------------------------------------------------------------------------
-- 2. THE REFUSALS. Every one must read 0, or stage 2 stops.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. THE REFUSALS. Every one must read 0 or stage 2 STOPS. ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc,
         (now() AT TIME ZONE 'Europe/Lisbon')::date   AS today_lisbon
)
SELECT 'R1 a JP row is missing from this tenant' AS refusal,
       (SELECT (2 - count(*))::int FROM public.users u, k WHERE u.id IN (k.jp_cb, k.jp_lv)) AS must_be_zero
UNION ALL
SELECT 'R2 JP(lv) is inactive (its LV cover would vanish)',
       (SELECT count(*)::int FROM public.users u, k WHERE u.id = k.jp_lv AND NOT u.is_active)
UNION ALL
SELECT 'R3 JP(cb) is not installed at Castelo Branco',
       (SELECT (1 - count(*))::int FROM public.staff_locations sl, k
         WHERE sl.user_id = k.jp_cb AND sl.location_id = k.cb_loc)
UNION ALL
SELECT 'R4 JP(lv) is not installed at Linda-a-Velha',
       (SELECT (1 - count(*))::int FROM public.staff_locations sl, k
         WHERE sl.user_id = k.jp_lv AND sl.location_id = k.lv_loc)
UNION ALL
-- A move sets user_id on an existing row. If JP(lv) already holds a row
-- identical on every column of availability_templates_dedupe_uq (NULLS NOT
-- DISTINCT), the UPDATE violates it and the transaction dies. Stage 2 refuses
-- first, with a sentence instead of a constraint name.
SELECT 'R5 a Saturday to be MOVED collides with an identical JP(lv) row',
       (SELECT count(*)::int
          FROM public.availability_templates c, k
         WHERE c.user_id = k.jp_cb AND c.location_id = k.lv_loc AND c.is_active
           AND c.weekday = 6 AND c.valid_from IS NOT NULL AND c.valid_from = c.valid_until
           AND c.valid_from >= k.today_lisbon
           AND EXISTS (SELECT 1 FROM public.availability_templates o
                        WHERE o.tenant_id = c.tenant_id AND o.user_id = k.jp_lv
                          AND o.location_id = c.location_id AND o.weekday = c.weekday
                          AND o.start_time = c.start_time AND o.end_time = c.end_time
                          AND o.valid_from IS NOT DISTINCT FROM c.valid_from
                          AND o.valid_until IS NOT DISTINCT FROM c.valid_until))
UNION ALL
SELECT 'R6 more than one JP(cb) block covers 30 September',
       (SELECT GREATEST(count(*)::int - 1, 0) FROM public.time_off t, k
         WHERE t.user_id = k.jp_cb
           AND (t.starts_at AT TIME ZONE 'Europe/Lisbon')::date <= DATE '2026-09-30'
           AND (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::date >  DATE '2026-09-30')
UNION ALL
SELECT 'R7 stage 2 has already run (its own audit row)',
       (SELECT count(*)::int FROM public.audit_log
         WHERE action = 'staff.jp_lv_schedule_rows.retire')
UNION ALL
-- R8 IS THE ONE THAT PROTECTS THE CLINIC'S COVER, and it is the reason this
-- operation refuses instead of doing its best. Stage 2 must leave JP(cb) with
-- NO active Linda-a-Velha row from today forward. Four sets get it there:
-- retire what JP(lv) already covers, move the future Saturdays, retire the
-- recurring Saturday windows, retire the past. A row that is none of those -
-- a FUTURE LV row on a weekday JP(lv) does not cover, or a recurring non-
-- Saturday LV window - would be left active, and stage 2 would then abort on
-- its own final assertion, mid-sitting, having written nothing.
--
-- Refusing here instead means the owner sees it BEFORE the sitting: retiring it
-- blind would take cover away from a day the clinic is open, and moving it
-- blind would give JP(lv) hours nobody ruled on. Either is a new decision.
SELECT 'R8 a FUTURE JP(cb) LV row that nothing retires or moves',
       (SELECT count(*)::int
          FROM public.availability_templates c, k
         WHERE c.user_id = k.jp_cb AND c.location_id = k.lv_loc AND c.is_active
           AND (c.valid_until IS NULL OR c.valid_until >= k.today_lisbon)
           AND NOT EXISTS (SELECT 1 FROM public.availability_templates o
                            WHERE o.user_id = k.jp_lv AND o.location_id = k.lv_loc AND o.is_active
                              AND o.weekday = c.weekday AND o.start_time = c.start_time
                              AND o.end_time = c.end_time
                              AND o.valid_from = c.valid_from AND o.valid_until = c.valid_until)
           AND NOT (c.valid_from IS NOT NULL AND c.valid_from = c.valid_until
                    AND c.weekday = 6 AND c.valid_from >= k.today_lisbon)
           AND NOT (c.weekday = 6 AND NOT (c.valid_from IS NOT NULL AND c.valid_from = c.valid_until)));

-- ---------------------------------------------------------------------------
-- 3. WHAT STAGE 2 WOULD DO, row by row, so the owner reads the change before it
--    happens rather than a count standing in for it.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. THE TARGET ROWS, one line each. This is what stage 2 changes. ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         (now() AT TIME ZONE 'Europe/Lisbon')::date   AS today_lisbon
),
cb_lv AS (
  SELECT av.*, (av.valid_from IS NOT NULL AND av.valid_from = av.valid_until) AS is_dated
    FROM public.availability_templates av, k
   WHERE av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active
)
SELECT CASE
         WHEN c.is_dated AND EXISTS (SELECT 1 FROM public.availability_templates o, k k2
                                      WHERE o.user_id = k2.jp_lv AND o.location_id = c.location_id
                                        AND o.is_active AND o.weekday = c.weekday
                                        AND o.start_time = c.start_time AND o.end_time = c.end_time
                                        AND o.valid_from = c.valid_from AND o.valid_until = c.valid_until)
              THEN 'RETIRE (JP(lv) already covers it)'
         WHEN c.is_dated AND c.valid_until < k.today_lisbon THEN 'RETIRE (past)'
         WHEN c.is_dated AND c.weekday = 6                  THEN 'MOVE to JP(lv)'
         WHEN NOT c.is_dated AND c.weekday = 6              THEN 'RETIRE (recurring Saturday window)'
         ELSE 'LEFT ALONE'
       END                                   AS what_stage_2_does,
       c.id::text,
       c.weekday,
       to_char(c.start_time, 'HH24:MI') || '-' || to_char(c.end_time, 'HH24:MI') AS hours,
       coalesce(c.valid_from::text, '(open)') AS valid_from,
       coalesce(c.valid_until::text, '(open)') AS valid_until
  FROM cb_lv c, k
 ORDER BY what_stage_2_does, c.valid_from NULLS FIRST, c.weekday, c.start_time;

\echo ''
\echo '=== 3b. THE 30 SEPTEMBER BLOCK, derived. time_off has no is_active: a block'
\echo '        can only be DELETED, so stage 2 records the whole row first. ==='

WITH k AS (SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb)
SELECT t.id::text,
       (t.starts_at AT TIME ZONE 'Europe/Lisbon')::text AS starts_lisbon,
       (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::text AS ends_lisbon,
       t.reason::text,
       coalesce(t.note, '(no note)') AS note
  FROM public.time_off t, k
 WHERE t.user_id = k.jp_cb
   AND (t.starts_at AT TIME ZONE 'Europe/Lisbon')::date <= DATE '2026-09-30'
   AND (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::date >  DATE '2026-09-30';

\echo ''
\echo '    JP(cb)"s WEDNESDAY blocks are NOT touched by any stage. The owner ruled they'
\echo '    mean "not at Castelo Branco" only, and time_off carries NO location column'
\echo '    (schema.ts: tenant, user, starts_at, ends_at, reason, note). Honouring that'
\echo '    ruling needs a schema change, not a data op. It is left for its own card.'

-- ---------------------------------------------------------------------------
-- 4. THE RECEPTION LIST. Stage 2 does not touch a single appointment; this
--    section, with 4b and 4c, is the evidence reception works from, and it is the whole content
--    of docs/staff-10-reception-list.md. Ids only, never a name.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. RECEPTION LIST A: the same patient booked on BOTH JP rows at the same start ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv
)
SELECT a.patient_id::text,
       (a.starts_at AT TIME ZONE 'Europe/Lisbon')::text AS starts_lisbon,
       a.id::text        AS cb_row_appointment,
       a.status::text    AS cb_row_status,
       la.id::text       AS lv_row_appointment,
       la.status::text   AS lv_row_status,
       lcb.name          AS cb_row_clinic,
       llv.name          AS lv_row_clinic,
       CASE WHEN a.status NOT IN ('cancelled','no_show')
             AND la.status NOT IN ('cancelled','no_show')
            THEN 'BOTH STILL SCHEDULED - reception decides which one stands'
            ELSE 'one side already cancelled or no-show - nothing to do'
       END AS verdict
  FROM public.appointments a
  JOIN k ON TRUE
  JOIN public.appointments la
    ON la.practitioner_id = k.jp_lv
   AND la.patient_id = a.patient_id
   AND la.starts_at = a.starts_at
  JOIN public.locations lcb ON lcb.id = a.location_id
  JOIN public.locations llv ON llv.id = la.location_id
 WHERE a.practitioner_id = k.jp_cb
 ORDER BY verdict, a.starts_at;

\echo ''
\echo '=== 4b. RECEPTION LIST B: two LIVE bookings on one JP row that overlap in time, FUTURE only ==='

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc
)
SELECT l.name AS clinic,
       CASE WHEN a.practitioner_id = k.jp_cb THEN 'JP(cb)' ELSE 'JP(lv)' END AS jp_row,
       a.id::text AS appointment_one,
       b.id::text AS appointment_two,
       a.patient_id::text AS patient_one,
       b.patient_id::text AS patient_two,
       (a.starts_at AT TIME ZONE 'Europe/Lisbon')::text AS one_starts_lisbon,
       (b.starts_at AT TIME ZONE 'Europe/Lisbon')::text AS two_starts_lisbon
  FROM public.appointments a
  JOIN k ON a.practitioner_id IN (k.jp_cb, k.jp_lv)
  JOIN public.appointments b
    ON b.practitioner_id = a.practitioner_id
   AND b.id > a.id
   AND b.starts_at < a.ends_at AND b.ends_at > a.starts_at
  JOIN public.locations l ON l.id = a.location_id
 WHERE a.status NOT IN ('cancelled','no_show')
   AND b.status NOT IN ('cancelled','no_show')
   AND a.patient_id <> b.patient_id
   /* FUTURE ONLY, owner ruling 2026-09-22. A past overlap is history: this
      list's own rule is that past appointments are never touched, and the
      imported history made list B long, and none of those rows is a
      decision. The past pairs are counted below, not listed, and every one
      of them is still in appointments, unchanged. */
   AND (a.starts_at >= now() OR b.starts_at >= now())
 ORDER BY clinic, a.starts_at;

\echo ''
\echo '    4b, history: past overlapping pairs on the JP rows, COUNTED, never listed for reception.'

WITH k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv
)
SELECT count(*)::int AS past_overlapping_pairs
  FROM public.appointments a
  JOIN k ON a.practitioner_id IN (k.jp_cb, k.jp_lv)
  JOIN public.appointments b
    ON b.practitioner_id = a.practitioner_id
   AND b.id > a.id
   AND b.starts_at < a.ends_at AND b.ends_at > a.starts_at
 WHERE a.status NOT IN ('cancelled','no_show')
   AND b.status NOT IN ('cancelled','no_show')
   AND a.patient_id <> b.patient_id
   AND a.starts_at < now() AND b.starts_at < now();

\echo ''
\echo '    The live-appointment predicate is the repository"s own:'
\echo '    NOT IN (cancelled, no_show), apps/web/lib/scheduling/conflict.ts.'

-- ---------------------------------------------------------------------------
-- 4c. RECEPTION LIST C: ONE NESA SESSION IMPORTED TWICE. Added 2026-09-22 on the
--     owner's ruling "add (c) to the STAFF-10 twin list", after a therapist's
--     Concluida NESA booking did not render on her own week view.
--
--     THE SHAPE. The Fisiozero importer keys an appointment on
--     (patient, start, terapeuta) and writes practitioner_id only, never
--     practitioner_2_id. So one NESA session the old system held in BOTH the NESA
--     column and the therapist's column arrives as TWO rows at the same start for
--     the same patient: one on a shared-resource user (NESA), one on the person,
--     both carrying the same NESA service. Staff can also make the same shape by
--     hand, two rows for one session; this list does not tell the two origins
--     apart. A THERAPIST's own agenda draws a resource's rows only when
--     the resource is installed at one of that therapist's clinics
--     (apps/web/app/agenda/page.tsx, data.ts), so a session held on the Castelo
--     Branco NESA row never reaches a Linda-a-Velha therapist's own diary.
--     Reception, admin and owner still see it.
--
--     THE VERDICT FOLLOWS THIS LIST'S OWN RULE: a past appointment is never
--     touched, by anyone, in any stage. A past pair is listed so reception can
--     ANSWER a therapist who asks where a session went, not so it is changed.
--     A FUTURE pair with both rows live is NOT reception's to resolve yet: the
--     two rows hold two different things (the machine's hour and the
--     therapist's), so cancelling either frees one of them. Which row stands is
--     an owner question, and the reception list says so.
--
--     lines_for_this_session counts the 4c lines that share the same patient and
--     start. More than 1 means the session sits on three or more rows, and those
--     lines must be read together.
--
--     Ids only, never a name, like lists A and B. The resource's clinic and the
--     booking's clinic are printed because together they say whether any diary
--     at the booking's clinic can draw the resource row.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4c. RECEPTION LIST C: one NESA session held on BOTH a resource row and a person row, same patient, same start ==='

SELECT n.patient_id::text,
       (n.starts_at AT TIME ZONE 'Europe/Lisbon')::text           AS starts_lisbon,
       n.id::text                                                 AS resource_row_appointment,
       n.status::text                                             AS resource_row_status,
       p.id::text                                                 AS person_row_appointment,
       p.status::text                                             AS person_row_status,
       ln.name                                                    AS booking_clinic,
       coalesce((SELECT string_agg(l2.name, ', ' ORDER BY l2.name)
                   FROM public.staff_locations sl
                   JOIN public.locations l2 ON l2.id = sl.location_id
                  WHERE sl.user_id = n.practitioner_id), 'none') AS resource_installed_at,
       count(*) OVER (PARTITION BY n.patient_id, n.starts_at)::int AS lines_for_this_session,
       CASE WHEN n.starts_at < now()
            THEN 'PAST - listed so a question can be answered; never touched'
            WHEN n.status NOT IN ('cancelled','no_show') AND p.status NOT IN ('cancelled','no_show')
            THEN 'FUTURE, BOTH STILL LIVE - held for the owner, cancel neither'
            ELSE 'FUTURE, one side already cancelled or no-show - nothing to do'
       END                                                        AS verdict
  FROM public.appointments n
  JOIN public.users un ON un.id = n.practitioner_id AND un.is_shared_resource
  JOIN public.appointments p
    ON p.tenant_id  = n.tenant_id
   AND p.patient_id = n.patient_id
   AND p.starts_at  = n.starts_at
   AND p.id <> n.id
   AND p.service_id IS NOT DISTINCT FROM n.service_id
  JOIN public.users up ON up.id = p.practitioner_id AND NOT up.is_shared_resource
  JOIN public.locations ln ON ln.id = n.location_id
 ORDER BY verdict, n.starts_at, n.patient_id, n.id, p.id;

-- ---------------------------------------------------------------------------
-- 5. HAS STAGE 2 ALREADY RUN? Its own audit row is the only answer.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. HAS STAGE 2 ALREADY RUN? ==='

SELECT al.id::text,
       al.created_at::text,
       (al.metadata ->> 'retired_count')  AS retired,
       (al.metadata ->> 'moved_count')    AS moved,
       (al.metadata ->> 'deleted_blocks') AS blocks_deleted
  FROM public.audit_log al
 WHERE al.action = 'staff.jp_lv_schedule_rows.retire'
 ORDER BY al.created_at DESC;

\echo ''
\echo '=== STAFF-10 STAGE 1 PREVIEW COMPLETE. Nothing was written. ==='

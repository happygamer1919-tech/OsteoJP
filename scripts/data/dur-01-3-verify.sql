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
-- failed. The stage 3 block in the doc allows it on six verdicts only, each
-- for a subject a real day may lack: 14 (no written row sits at a clinic with
-- a midday closure configured), 16 (no written row has hours configured),
-- 18 (no row was excluded), 20 (no written row is on a NESA), 21 (no written
-- row names a NESA) and 22 (no written row is on a JP row). Stage 2 refuses an
-- empty write set (R06), so every other arm always has rows to read. An
-- instrument that cannot see the written rows (verdict 11's control) FAILs,
-- never VACUOUS, because its zero would green 12 to 17 and 20 to 22.
--
-- THE TOTAL IS READ FROM THE AUDIT ROW, NOT COUNTED AGAIN (verdict 19). A live
-- count of the tenant's appointments moves with the clinic: a later hard
-- delete lowers it, and a booking whose transaction began before stage 2,
-- waited on its lock and committed after it carries a created_at earlier than
-- the audit row. Either would FAIL a correct write. So stage 2 records the
-- total it counted under its own lock before the write and again after it, in
-- the same transaction, and verdict 19 compares the two it recorded.
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
-- live row, so a live filter that cannot see them reads fewer than n. Five
-- counts are the subjects of the stage 3 verdicts a real day may leave with
-- nothing to check: hours_configured (16), written rows whose therapist has
-- hours configured at the clinic; closure_configured (14), written rows at a
-- clinic with a midday closure configured, both ends set, as the clinic CTE
-- reads it; and the last three, on_resource (20), names_resource (21) and
-- on_person_row (22): written rows on a shared resource, naming one in either
-- slot, and on a one_person row.
-- >>> DUR-01 RULE BEGIN. The app's own rule for one candidate window, INLINE,
-- with the checks the op adds to it (the same patient, the NESA hour of a live
-- twin, and the one person with two staff rows), each marked where it stands.
-- These lines are byte-identical in
-- stage 1's BASE, stage 2's BASE, stage 2's RECHECK and stage 3's RECHECK
-- (scripts/dur-01-data-op.test.mjs asserts it).
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
-- THE ROOM each candidate's room arm reads, trimmed as the app trims it before
-- it asks appointment_conflicts (conflict.ts, appointmentConflicts:
-- args.room?.trim() || null). JavaScript's trim strips every character of
-- ECMAScript's WhiteSpace and LineTerminator sets, listed below by code point:
-- the space, tab, line feed, carriage return, form feed, vertical tab, the
-- no-break spaces, the Unicode space separators, the line and paragraph
-- separators and the byte order mark. Postgres btrim with no second argument
-- strips the ASCII space only, so a room ending in a tab or a no-break space
-- would miss the live row the app finds. A room that trims to nothing is no
-- room and asks no room arm, as in the app. The other row's room is compared
-- as stored, as appointment_conflicts compares a.room.
c_room AS (
  SELECT c.id AS cand_id,
         nullif(btrim(c.room, E' \t\n\r\f\x0b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'), '') AS room
    FROM cand c
),
-- ONE PERSON, TWO STAFF ROWS. Not in the app's rule; the op adds it. JP is one
-- person the tenant holds as two staff rows (STAFF-09): JP(cb), the row for
-- Castelo Branco, and JP(lv), the row for Linda-a-Velha. The ids are JP_CB,
-- JP_LV, CB and LV of packages/db/scripts/staff-11-jp-one-clinic-check.mjs,
-- and the unit test holds them equal. The app reads each row as its own
-- therapist, so its rule never compares one with the other; STAFF-10 v2 guards
-- the same gap for its own moves (its R14). The op reads a booking or a block on
-- either row as holding the person (arm same_person below, and the second block
-- arm), and holds outright a row booked on one of the two at a clinic that is
-- not that row's own (person_away, verdict 18). R10 refuses when the pair does
-- not resolve in the population's tenant, so these arms cannot read a vacuous 0.
one_person AS (
  SELECT x.user_id, x.other_id, x.home_id
    FROM (VALUES ('54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid, '0c1a0000-0000-4000-8000-000000000001'::uuid,
                  'de000002-0000-0000-0000-000000000002'::uuid),
                 ('0c1a0000-0000-4000-8000-000000000001'::uuid, '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid,
                  'de000002-0000-0000-0000-000000000001'::uuid)) x(user_id, other_id, home_id)
),
-- The other staff row of each candidate's Terapeuta, where it has one.
c_alias AS (
  SELECT c.id AS cand_id, op.other_id AS user_id
    FROM cand c
    JOIN one_person op ON op.user_id = c.practitioner_id
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
-- appointment_conflicts (0059), the room read as c_room trims it, then for
-- every shared resource the candidate names, the rows where it is Terapeuta
-- and the rows where it is Terapeuta 2.
-- The candidate itself is excluded, as excludeIds excludes it. The same_person
-- arm is the op's (one_person above): a row on the Terapeuta's other staff row.
hit_booking AS (
  SELECT c.id AS cand_id, o.id AS other_id, o.starts_at AS other_s, o.ends_at AS other_e,
         CASE WHEN o.practitioner_id = c.practitioner_id THEN 'therapist'
              WHEN o.practitioner_id IN (SELECT ca.user_id FROM c_alias ca WHERE ca.cand_id = c.id) THEN 'same_person'
              WHEN o.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id) THEN 'resource_as_terapeuta'
              WHEN o.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id) THEN 'resource_as_terapeuta_2'
              ELSE 'room' END AS arm
    FROM cand c
    JOIN live o ON o.tenant_id = c.tenant_id AND o.id <> c.id
               AND o.starts_at < c.e AND o.ends_at > c.s
   WHERE o.practitioner_id = c.practitioner_id
      OR o.practitioner_id IN (SELECT ca.user_id FROM c_alias ca WHERE ca.cand_id = c.id)
      OR o.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR o.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR (o.location_id = c.location_id
          AND lower(o.room) IN (SELECT lower(cm.room) FROM c_room cm WHERE cm.cand_id = c.id AND cm.room IS NOT NULL))
),
-- THE BLOCK ARM (findScheduleConflicts): time_off on the Terapeuta, which is
-- therapist-wide and carries no clinic. The second arm is the op's: a block on
-- the Terapeuta's other staff row (one_person above) holds the person too.
hit_block AS (
  SELECT c.id AS cand_id, t.id AS block_id, t.starts_at AS block_s, t.ends_at AS block_e
    FROM cand c
    JOIN public.time_off t
      ON t.tenant_id = c.tenant_id AND t.user_id = c.practitioner_id
     AND t.starts_at < c.e AND t.ends_at > c.s
  UNION ALL
  SELECT c.id, t.id, t.starts_at, t.ends_at
    FROM cand c
    JOIN c_alias ca ON ca.cand_id = c.id
    JOIN public.time_off t
      ON t.tenant_id = c.tenant_id AND t.user_id = ca.user_id
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
-- THE NESA HOUR A LIVE TWIN WILL MOVE. Not in the app's rule today; the op adds
-- it, so the answer does not depend on the order it runs in with STAFF-10 v2
-- (#1444). That op resolves every future twin whose two rows are both live by
-- its ruling (c): the person row takes the NESA as Terapeuta 2 and the NESA row
-- is cancelled, so from then on the NESA is held over the PERSON window, which
-- its R17 lets be longer than the NESA window. Before it runs, the app's rule
-- reads only the NESA row. So the person row of every such twin (live, on a
-- person, with a row of the same patient, start and service, NULL-safe, on a
-- shared resource and not cancelled or no-show) is read here as holding that
-- NESA over its own window, whether or not STAFF-10 v2 has run: after it has,
-- no such pair is left, and the resource arm above reads the same hold through
-- practitioner_2. A candidate naming that NESA in either slot is held by it,
-- unless the candidate is that twin's own NESA row, whose hour it is.
twin_hold AS (
  SELECT p.id AS hold_id, n.id AS n_id, n.practitioner_id AS res_id, p.tenant_id, p.starts_at, p.ends_at
    FROM live p
    JOIN public.appointments ap ON ap.id = p.id
    JOIN public.users up ON up.id = p.practitioner_id AND up.is_shared_resource IS NOT TRUE
    JOIN public.appointments n
      ON n.tenant_id = p.tenant_id AND n.patient_id = p.patient_id
     AND n.starts_at = p.starts_at AND n.id <> p.id
     AND n.service_id IS NOT DISTINCT FROM ap.service_id
     AND n.status NOT IN ('cancelled', 'no_show')
    JOIN public.users un ON un.id = n.practitioner_id AND un.is_shared_resource IS TRUE
),
hit_twin_hold AS (
  SELECT c.id AS cand_id, h.hold_id AS other_id, h.starts_at AS other_s, h.ends_at AS other_e
    FROM cand c
    JOIN twin_hold h ON h.tenant_id = c.tenant_id AND h.hold_id <> c.id AND h.n_id <> c.id
                    AND h.starts_at < c.e AND h.ends_at > c.s
   WHERE h.res_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
),
-- SCHED-17 (shared-resource-guard.ts, sharedResourceLocationAllowed), which
-- rescheduleAppointment asks before any other check and which "Guardar mesmo
-- assim" cannot pass: a row whose Terapeuta is a shared resource may sit only
-- at a clinic where that resource is installed (staff_locations, in its
-- tenant), for every role, the owner included. Its other condition, the
-- actor's own clinics, has no actor in a data op and is not read.
res_away AS (
  SELECT c.id AS cand_id, c.practitioner_id AS res_id
    FROM cand c
    JOIN shared r ON r.id = c.practitioner_id AND r.tenant_id = c.tenant_id
   WHERE NOT EXISTS (SELECT 1 FROM public.staff_locations sl
                      WHERE sl.user_id = c.practitioner_id AND sl.tenant_id = c.tenant_id
                        AND sl.location_id = c.location_id)
),
-- ONE PERSON'S ROW AT THE OTHER CLINIC. Not in the app's rule; the op adds it. A
-- row booked on one of the two staff rows of one_person at a clinic that is not
-- that row's own: JP(cb) at Linda-a-Velha, or JP(lv) at Castelo Branco.
-- STAFF-10 v2 hands JP(cb)'s future Linda-a-Velha rows to reception (its Q1),
-- retires JP(cb)'s hours there (its W1 and W2), and moves every JP(cb) row there
-- that starts before its own run day to JP(lv) in any status (its W4). So the
-- hours that would hold such a row, and the staff row it sits on, change with
-- the order the two ops run in. Held outright, whatever the order.
person_away AS (
  SELECT c.id AS cand_id, c.practitioner_id AS user_id
    FROM cand c
    JOIN one_person op ON op.user_id = c.practitioner_id
   WHERE op.home_id IS DISTINCT FROM c.location_id
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
         (SELECT count(*) FROM res_away x)::int AS resource_away,
         (SELECT count(DISTINCT x.cand_id) FROM hit_twin_hold x)::int AS twin_hold,
         (SELECT count(*) FROM person_away x)::int AS person_away,
         (SELECT count(*) FROM clinic x WHERE x.ends_after_close)::int AS ends_after_close,
         (SELECT count(*) FROM avail x WHERE x.configured)::int AS hours_configured,
         (SELECT count(*) FROM cand c
            JOIN public.locations l ON l.id = c.location_id AND l.tenant_id = c.tenant_id
           WHERE l.midday_closed_from IS NOT NULL AND l.midday_closed_to IS NOT NULL)::int AS closure_configured,
         (SELECT count(*) FROM cand c JOIN shared r ON r.id = c.practitioner_id AND r.tenant_id = c.tenant_id)::int AS on_resource,
         (SELECT count(DISTINCT cr.cand_id) FROM c_res cr)::int AS names_resource,
         (SELECT count(*) FROM cand c WHERE c.practitioner_id IN (SELECT op.user_id FROM one_person op))::int AS on_person_row
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
    (SELECT (al.m -> 'after' ->> 'appointments')::int FROM al) AS total_after,
    (SELECT (al.m -> 'before' ->> 'appointments')::int FROM al) AS total_before,
    rc.n AS rc_n, rc.live_self, rc.booking, rc.block, rc.closure, rc.clinic_hours, rc.therapist_hours, rc.patient,
    rc.resource_away, rc.twin_hold, rc.ends_after_close, rc.hours_configured, rc.closure_configured,
    rc.person_away, rc.on_resource, rc.names_resource, rc.on_person_row
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
UNION ALL SELECT 12, 'no written id overlaps a booking: therapist, the same person on its other staff row, room, resource as Terapeuta or as Terapeuta 2',
       v.booking::text || ' / control ' || v.live_self::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.booking <> 0 OR v.live_self <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 13, 'no written id overlaps a block on its therapist, or on the same person''s other staff row',
       v.block::text || ' / control ' || v.rc_n::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.block <> 0 OR v.rc_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 14, 'no written id runs into its clinic''s midday closure, where one is configured',
       v.closure::text || ' / at a clinic with a closure ' || v.closure_configured::text || ' / control ' || v.rc_n::text,
       '0 / at a clinic with a closure above 0 / control ' || v.n_w::text,
       CASE WHEN v.closure <> 0 OR v.rc_n <> v.n_w THEN 'FAIL'
            WHEN v.n_w = 0 OR v.closure_configured = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 15, 'no written id starts outside its clinic''s hours',
       v.clinic_hours::text || ' / control ' || v.rc_n::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.clinic_hours <> 0 OR v.rc_n <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 16, 'every written id sits inside its therapist''s hours, where they are configured',
       v.therapist_hours::text || ' / configured ' || v.hours_configured::text, '0 / configured above 0',
       CASE WHEN v.therapist_hours <> 0 OR v.rc_n <> v.n_w THEN 'FAIL'
            WHEN v.n_w = 0 OR v.hours_configured = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 17, 'no written id overlaps another live booking of the same patient',
       v.patient::text || ' / control ' || v.live_self::text, '0 / control ' || v.n_w::text,
       CASE WHEN v.patient <> 0 OR v.live_self <> v.n_w THEN 'FAIL' WHEN v.n_w = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 18, 'every id the op held still lasts one minute',
       v.x_still_short::text, v.n_x::text,
       CASE WHEN v.x_still_short <> v.n_x THEN 'FAIL' WHEN v.n_x = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 19, 'the appointment total stage 2 counted under its lock after the write equals the one before (audit row)',
       'after ' || coalesce(v.total_after::text, 'none'), 'before ' || coalesce(v.total_before::text, 'none'),
       CASE WHEN v.total_after IS NULL OR v.total_before IS NULL OR v.total_after <> v.total_before
            THEN 'FAIL' ELSE 'OK' END FROM v
UNION ALL SELECT 20, 'no written id is a NESA booked at a clinic where it is not installed (SCHED-17)',
       v.resource_away::text || ' / on a NESA ' || v.on_resource::text, '0 / on a NESA above 0',
       CASE WHEN v.resource_away <> 0 OR v.rc_n <> v.n_w THEN 'FAIL'
            WHEN v.n_w = 0 OR v.on_resource = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 21, 'no written id overlaps the NESA hour a live twin''s person row holds, or will hold after STAFF-10 v2',
       v.twin_hold::text || ' / naming a NESA ' || v.names_resource::text || ' / live ' || v.live_self::text,
       '0 / naming a NESA above 0 / live ' || v.n_w::text,
       CASE WHEN v.twin_hold <> 0 OR v.live_self <> v.n_w THEN 'FAIL'
            WHEN v.n_w = 0 OR v.names_resource = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
UNION ALL SELECT 22, 'no written id sits on one person''s staff row meant for another clinic (the two JP rows)',
       v.person_away::text || ' / on a JP row ' || v.on_person_row::text, '0 / on a JP row above 0',
       CASE WHEN v.person_away <> 0 OR v.rc_n <> v.n_w THEN 'FAIL'
            WHEN v.n_w = 0 OR v.on_person_row = 0 THEN 'VACUOUS' ELSE 'OK' END FROM v
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

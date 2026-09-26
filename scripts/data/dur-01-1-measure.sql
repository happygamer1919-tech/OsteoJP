-- ============================================================================
-- DUR-01, STAGE 1 of 3: THE MEASUREMENT. IT WRITES NOTHING.
--
-- Card DUR-01, a NEW held data op, owner ruling of 2026-09-24, paraphrased:
-- measure the future appointments the Fisiozero importer wrote with a one
-- minute duration, then author a write that gives each one its service's
-- default duration where nothing stands in the way. Held unarmed with a
-- question block (docs/data-op-dur-01.md), because the premise, what a one
-- minute Fisiozero row means, is the owner's to rule.
--
-- THIS STAGE RUNS ON ITS OWN. It is the measurement sitting the question block
-- asks for before any decision about stage 2: it prints every row, its verdict
-- and why, and the carries stage 2 would need. Running it commits nobody to
-- stage 2.
--
-- EVERY SET IS DERIVED FROM THE DATABASE AT RUN TIME, by the block between the
-- BASE BEGIN and BASE END markers, which stage 2 carries byte for byte. No
-- count and no id measured on production appears in this file. The only ids
-- it names are the four of one_person, in the rule: JP's two staff rows and
-- their two clinics, as packages/db/scripts/staff-11-jp-one-clinic-check.mjs
-- on main names them.
--
-- THE SOURCE ROW IS REAL PATIENT DATA. The only reads of migration_staging_rows
-- .raw are the inicio and fim keys inside the BASE's ledger CTE, turned into
-- one integer there. Nothing below prints a raw value, a patient name or any
-- free text; the tables carry ids, clinic and service names, times and counts.
--
-- ONE STATEMENT COMPUTES EVERYTHING. The sets are evaluated once, packaged into
-- one JSON value held in the psql variable dur01_json by \gset (a client-side
-- variable, not a write), and every section below prints from that value. So
-- every section describes the same instant.
--
-- Run (stage 1 of docs/data-op-dur-01.md):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/dur-01-1-measure.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== DUR-01, STAGE 1. READ ONLY. ==='

SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation;

WITH
-- >>> DUR-01 BASE BEGIN. These lines are byte-identical in stage 1 and stage 2
-- (scripts/dur-01-data-op.test.mjs asserts it), so the set stage 1 prints and
-- the set stage 2 writes are computed by the same text. now() is the
-- transaction's start time in both, so every cut below is fixed per stage.
k AS (
  SELECT now() AS t_now,
         (now() AT TIME ZONE 'Europe/Lisbon')::date AS today,
         (((now() AT TIME ZONE 'Europe/Lisbon')::date + 1)::timestamp AT TIME ZONE 'Europe/Lisbon') AS day1
),
-- THE LEDGER. The importer's only reliable mark on a row it wrote is its
-- staging row: source_system fisiozero, entity_type appointment, status
-- imported, imported_entity_id the appointment (packages/db/src/migration/
-- staging.ts, markImported). origin and created_at cannot tell an import from
-- a staff booking.
--
-- raw IS THE SOURCE ROW, WHICH IS REAL PATIENT DATA. This CTE reads exactly two
-- keys of it, inicio and fim, and turns them into ONE INTEGER: the source's own
-- duration in seconds, when both parse as the importer's naive local form
-- (fisiozero.ts, naiveLocalToIso) on the same calendar date. It never casts a
-- value that could throw, and no raw value leaves this CTE.
ledger AS (
  SELECT m.tenant_id, m.imported_entity_id AS appointment_id, count(*)::int AS ledger_rows,
         min(CASE WHEN btrim(m.raw ->> 'inicio') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
                   AND btrim(m.raw ->> 'fim') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
                   AND left(btrim(m.raw ->> 'inicio'), 10) = left(btrim(m.raw ->> 'fim'), 10)
                  THEN (substr(btrim(m.raw ->> 'fim'), 12, 2)::int * 3600
                        + substr(btrim(m.raw ->> 'fim'), 15, 2)::int * 60
                        + coalesce(nullif(substr(btrim(m.raw ->> 'fim'), 18, 2), ''), '0')::int)
                     - (substr(btrim(m.raw ->> 'inicio'), 12, 2)::int * 3600
                        + substr(btrim(m.raw ->> 'inicio'), 15, 2)::int * 60
                        + coalesce(nullif(substr(btrim(m.raw ->> 'inicio'), 18, 2), ''), '0')::int)
             END)::int AS src_seconds
    FROM public.migration_staging_rows m
   WHERE m.source_system = 'fisiozero' AND m.entity_type = 'appointment'
     AND m.status = 'imported' AND m.imported_entity_id IS NOT NULL
   GROUP BY m.tenant_id, m.imported_entity_id
),
-- THE POPULATION: every appointment the importer wrote that lasts exactly one
-- minute and starts now or later. Whatever else it is, it is classified below.
pop AS (
  SELECT a.id, a.tenant_id, a.patient_id, a.patient_2_id, a.practitioner_id, a.practitioner_2_id,
         a.location_id, a.service_id, a.room, a.status, a.origin, a.starts_at, a.ends_at,
         lg.ledger_rows, lg.src_seconds, s.duration_min
    FROM public.appointments a
    JOIN ledger lg ON lg.appointment_id = a.id AND lg.tenant_id = a.tenant_id
    LEFT JOIN public.services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
   CROSS JOIN k
   WHERE a.ends_at - a.starts_at = interval '1 minute' AND a.starts_at >= k.t_now
),
-- THE CANDIDATE WINDOW: the start, and the end the staff drawer would give it,
-- start plus the service's duration_min (appointment-drawer.tsx, applyService
-- and the endsAt it submits). No service, or a default of one minute or less,
-- has no window, and those rows are classified without one.
cand AS (
  SELECT p.id, p.tenant_id, p.patient_id, p.patient_2_id, p.practitioner_id, p.practitioner_2_id,
         p.location_id, p.room, p.starts_at AS s, p.starts_at + make_interval(mins => p.duration_min) AS e
    FROM pop p
   WHERE p.duration_min > 1
),
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
-- THE NESA TWIN (list C's predicate, origin/data/STAFF-10-list-c-nesa-twins,
-- and STAFF-10 v2's tw): another row in the tenant with the same patient, the
-- same start and the same service (NULL-safe), one of the two on a shared
-- resource and the other not. The partner is counted in ANY status, so a twin
-- whose NESA row STAFF-10 v2 has already cancelled is still a twin here.
twins AS (
  SELECT p.id AS cand_id, o.id AS twin_id, o.status AS twin_status
    FROM pop p
    JOIN public.users up ON up.id = p.practitioner_id
    JOIN public.appointments o
      ON o.tenant_id = p.tenant_id AND o.patient_id = p.patient_id
     AND o.starts_at = p.starts_at AND o.id <> p.id
     AND o.service_id IS NOT DISTINCT FROM p.service_id
    JOIN public.users uo ON uo.id = o.practitioner_id
   WHERE (up.is_shared_resource IS TRUE AND uo.is_shared_resource IS NOT TRUE)
      OR (up.is_shared_resource IS NOT TRUE AND uo.is_shared_resource IS TRUE)
),
-- TWO STUBS THAT WOULD COLLIDE ONCE BOTH ARE EXTENDED. The app's rule above
-- reads every other row at its CURRENT end, so a stub 30 minutes after another
-- stub is clear of it today and not after both are written. Every live
-- candidate is read here at its PROPOSED end, whatever its own verdict, which
-- holds more than it has to and never less.
pair AS (
  SELECT c.id AS cand_id, c2.id AS other_id, c2.s AS other_s, c2.e AS other_e
    FROM cand c
    JOIN cand c2 ON c2.tenant_id = c.tenant_id AND c2.id <> c.id AND c2.s < c.e AND c2.e > c.s
    JOIN live o2 ON o2.id = c2.id
   WHERE c2.practitioner_id = c.practitioner_id
      OR c2.practitioner_id IN (SELECT ca.user_id FROM c_alias ca WHERE ca.cand_id = c.id)
      OR c2.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR c2.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR c.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c2.id)
      OR c.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c2.id)
      OR (c2.location_id = c.location_id
          AND lower(c2.room) IN (SELECT lower(cm.room) FROM c_room cm WHERE cm.cand_id = c.id AND cm.room IS NOT NULL))
      OR c2.patient_id IN (c.patient_id, c.patient_2_id)
      OR c2.patient_2_id IN (c.patient_id, c.patient_2_id)
),
-- EVERY FLAG, per population row. None is NULL: each is an EXISTS or a
-- coalesce, so no row can fall out of a verdict through a NULL predicate.
f AS (
  SELECT p.id, p.tenant_id, p.patient_id, p.practitioner_id, p.practitioner_2_id, p.location_id,
         p.service_id, p.room, p.status, p.origin, p.starts_at, p.ends_at, p.ledger_rows, p.src_seconds,
         p.duration_min, c.e AS proposed_end,
         coalesce(cl.in_closure, false) AS in_closure,
         coalesce(cl.out_of_window, false) AS out_of_window,
         coalesce(cl.ends_after_close, false) AS ends_after_close,
         coalesce(NOT av.covered, false) AS outside_hours,
         EXISTS (SELECT 1 FROM twins x WHERE x.cand_id = p.id) AS is_twin,
         EXISTS (SELECT 1 FROM hit_booking x WHERE x.cand_id = p.id) AS hits_booking,
         EXISTS (SELECT 1 FROM hit_block x WHERE x.cand_id = p.id) AS hits_block,
         EXISTS (SELECT 1 FROM pair x WHERE x.cand_id = p.id) AS hits_stub,
         EXISTS (SELECT 1 FROM hit_patient x WHERE x.cand_id = p.id) AS hits_patient,
         EXISTS (SELECT 1 FROM res_away x WHERE x.cand_id = p.id) AS resource_away,
         EXISTS (SELECT 1 FROM hit_twin_hold x WHERE x.cand_id = p.id) AS hits_twin_hold,
         EXISTS (SELECT 1 FROM person_away x WHERE x.cand_id = p.id) AS person_away,
         -- The row itself an unconfirmed pedido, by the live filter's own test
         -- (0067): the re-measure would not see it as live, so it is held.
         (p.status = 'scheduled'
          AND (p.origin = 'patient_portal'
               OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                           WHERE sn.appointment_id = p.id AND sn.kind = 'appointment_request'))) IS TRUE AS is_pedido,
         EXISTS (SELECT 1 FROM public.users u WHERE u.id = p.practitioner_id AND u.is_shared_resource IS TRUE)
           AS on_resource_row
    FROM pop p
    LEFT JOIN cand c ON c.id = p.id
    LEFT JOIN clinic cl ON cl.cand_id = p.id
    LEFT JOIN avail av ON av.cand_id = p.id
),
-- EVERY ROW GETS EXACTLY ONE VERDICT: the first that applies, in this order.
-- WRITE is the only one stage 2 writes. The doc's "What every verdict means"
-- names who each one belongs to.
v AS (
  SELECT f.*,
         CASE WHEN f.status IN ('cancelled', 'no_show') THEN '01 NOT LIVE'
              WHEN f.status = 'completed' THEN '02 COMPLETED IN THE FUTURE'
              WHEN f.service_id IS NULL OR f.duration_min IS NULL THEN '03 NO SERVICE'
              WHEN f.duration_min <= 1 THEN '04 SERVICE DEFAULT NOT ABOVE ONE MINUTE'
              WHEN f.ledger_rows IS DISTINCT FROM 1 THEN '05 LEDGER AMBIGUOUS'
              WHEN f.src_seconds IS DISTINCT FROM 60 THEN '06 SOURCE ROW NOT ONE MINUTE'
              WHEN f.starts_at < k.day1 THEN '07 STARTS ON THE RUN DAY'
              WHEN f.is_twin THEN '08 PART OF A NESA TWIN'
              WHEN f.in_closure THEN '09 RUNS INTO THE CLINIC CLOSURE'
              WHEN f.out_of_window THEN '10 STARTS OUTSIDE CLINIC HOURS'
              WHEN f.outside_hours THEN '11 OUTSIDE THE THERAPIST HOURS'
              WHEN f.hits_booking THEN '12 OVERLAPS A BOOKING'
              WHEN f.hits_block THEN '13 OVERLAPS A BLOCK'
              WHEN f.hits_stub THEN '14 OVERLAPS ANOTHER STUB ONCE BOTH ARE EXTENDED'
              WHEN f.hits_patient THEN '15 SAME PATIENT BOOKED ELSEWHERE'
              WHEN f.resource_away THEN '16 NESA NOT INSTALLED AT THE CLINIC'
              WHEN f.hits_twin_hold THEN '17 OVERLAPS THE NESA HOUR OF A LIVE TWIN'
              WHEN f.person_away THEN '18 ON A STAFF ROW MEANT FOR ANOTHER CLINIC'
              WHEN f.is_pedido THEN '19 AN UNCONFIRMED PEDIDO'
              ELSE 'WRITE' END AS verdict
    FROM f CROSS JOIN k
),
-- THE WRITE SET, with the end stage 2 gives each row.
wr AS (
  SELECT v.id, v.tenant_id, v.proposed_end FROM v WHERE v.verdict = 'WRITE'
),
-- ---------------------------------------------------------------------------
-- THE REFUSALS. n must be 0. control is the population the predicate read, so
-- a 0 that could not have seen anything prints VACUOUS rather than OK.
-- ---------------------------------------------------------------------------
ref AS (
  SELECT 'R01' AS code, 'the Fisiozero appointment ledger is empty, so the population filter could read nothing' AS label,
         (CASE WHEN (SELECT count(*) FROM ledger) = 0 THEN 1 ELSE 0 END)::int AS n,
         (SELECT count(*) FROM ledger)::int AS control
  UNION ALL
  SELECT 'R02', 'a tenant in the population has no active shared resource, so the twin and resource checks would read a vacuous zero',
         (SELECT count(*) FROM (SELECT DISTINCT p.tenant_id FROM pop p) t
           WHERE NOT EXISTS (SELECT 1 FROM shared r WHERE r.tenant_id = t.tenant_id))::int,
         (SELECT count(*) FROM shared)::int
  UNION ALL
  SELECT 'R03', 'the population spans more than one tenant, and the audit row names one',
         GREATEST((SELECT count(DISTINCT p.tenant_id) FROM pop p) - 1, 0)::int,
         (SELECT count(*) FROM pop)::int
  UNION ALL
  SELECT 'R04', 'DUR-01 has already run (its audit row)',
         (SELECT count(*) FROM public.audit_log al WHERE al.action = 'staff.dur01.extend_import_duration')::int,
         (SELECT count(*) FROM public.audit_log al)::int
  UNION ALL
  -- A trigger the system did not create would run code the write whitelist does
  -- not name, inside the committed transaction. The control is every trigger on
  -- the two tables, the foreign-key constraint triggers included.
  SELECT 'R05', 'a trigger the system did not create sits on a table stage 2 writes',
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.audit_log'::regclass)
             AND NOT t.tgisinternal)::int,
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.audit_log'::regclass))::int
  UNION ALL
  SELECT 'R06', 'there is nothing to write: the WRITE set is empty',
         (CASE WHEN (SELECT count(*) FROM wr) = 0 THEN 1 ELSE 0 END)::int,
         (SELECT count(*) FROM pop)::int
  UNION ALL
  -- The database's own backstop, appointments_no_double_confirmed (0061): an
  -- EXCLUDE on practitioner_id and tstzrange for confirmed rows, no tenant in it.
  -- A confirmed WRITE row that would break it means the classifier and the
  -- database disagree. Another WRITE row counts at its proposed end.
  SELECT 'R07', 'a confirmed WRITE row, once extended, would overlap another confirmed row on its practitioner (the 0061 constraint)',
         (SELECT count(*) FROM v w
            JOIN public.appointments o
              ON o.practitioner_id = w.practitioner_id AND o.id <> w.id AND o.status = 'confirmed'
             AND tstzrange(w.starts_at, w.proposed_end)
                 && tstzrange(o.starts_at, coalesce((SELECT w2.proposed_end FROM wr w2 WHERE w2.id = o.id), o.ends_at))
           WHERE w.verdict = 'WRITE' AND w.status = 'confirmed')::int,
         (SELECT count(*) FROM v w WHERE w.verdict = 'WRITE' AND w.status = 'confirmed')::int
  UNION ALL
  SELECT 'R08', 'two WRITE rows would overlap each other once both are extended, on a practitioner, a resource, a room or a patient',
         (SELECT count(*) FROM pair x
           WHERE x.cand_id IN (SELECT wr.id FROM wr) AND x.other_id IN (SELECT wr.id FROM wr))::int,
         (SELECT count(*) FROM wr)::int
  UNION ALL
  -- Every flag again, NULL-safe, on the WRITE set: a verdict order that let a
  -- held row through, or a flag that read NULL, refuses here.
  SELECT 'R09', 'a WRITE row carries a flag that should have held it',
         (SELECT count(*) FROM v w
           WHERE w.verdict = 'WRITE'
             AND (w.status NOT IN ('scheduled', 'confirmed') OR w.duration_min IS NULL OR w.duration_min <= 1
                  OR w.ledger_rows IS DISTINCT FROM 1 OR w.src_seconds IS DISTINCT FROM 60
                  OR w.proposed_end IS NULL OR w.starts_at < (SELECT k.day1 FROM k)
                  OR w.is_twin IS NOT FALSE OR w.in_closure IS NOT FALSE OR w.out_of_window IS NOT FALSE
                  OR w.outside_hours IS NOT FALSE OR w.hits_booking IS NOT FALSE OR w.hits_block IS NOT FALSE
                  OR w.hits_stub IS NOT FALSE OR w.hits_patient IS NOT FALSE
                  OR w.resource_away IS NOT FALSE OR w.hits_twin_hold IS NOT FALSE
                  OR w.person_away IS NOT FALSE OR w.is_pedido IS NOT FALSE))::int,
         (SELECT count(*) FROM wr)::int
  UNION ALL
  -- The pair one_person names must resolve: both staff rows and the row's own
  -- clinic, in one tenant of the population. If not, the same_person arms and
  -- person_away would read a vacuous 0. Its control is the pair rows that do
  -- resolve; with no population it reads VACUOUS, R06 refusing already.
  SELECT 'R10', 'the one person with two staff rows does not resolve in the population''s tenant, so its checks would read a vacuous zero',
         (SELECT count(*) FROM one_person op
           WHERE EXISTS (SELECT 1 FROM pop)
             AND NOT EXISTS (SELECT 1 FROM public.users u
                               JOIN public.users u2 ON u2.id = op.other_id AND u2.tenant_id = u.tenant_id
                               JOIN public.locations l ON l.id = op.home_id AND l.tenant_id = u.tenant_id
                              WHERE u.id = op.user_id AND u.tenant_id IN (SELECT p.tenant_id FROM pop p)))::int,
         (SELECT count(*) FROM one_person op
           WHERE EXISTS (SELECT 1 FROM public.users u
                           JOIN public.users u2 ON u2.id = op.other_id AND u2.tenant_id = u.tenant_id
                           JOIN public.locations l ON l.id = op.home_id AND l.tenant_id = u.tenant_id
                          WHERE u.id = op.user_id AND u.tenant_id IN (SELECT p.tenant_id FROM pop p)))::int
),
-- ---------------------------------------------------------------------------
-- THE CARRIES. Stage 2 recomputes them with this text and refuses on any
-- difference. The digest is over each WRITE id with the end stage 2 gives it.
-- ---------------------------------------------------------------------------
car AS (
  SELECT 1 AS ord, 'dur01_run_day' AS carry, (SELECT k.today::text FROM k) AS value
  UNION ALL
  SELECT 2, 'dur01_count', (SELECT count(*)::text FROM wr)
  UNION ALL
  SELECT 3, 'dur01_digest',
         (SELECT coalesce(md5(string_agg(wr.id::text || '@' || extract(epoch FROM wr.proposed_end)::bigint::text,
                                         ',' ORDER BY wr.id)), 'empty') FROM wr)
  UNION ALL
  -- STAFF-10 v2's audit rows: a STAFF-10 v2 write landing between stage 1 and
  -- stage 2 changes this, and stage 2 refuses (the doc's D5).
  SELECT 4, 'dur01_s10v2_runs',
         (SELECT count(*)::text FROM public.audit_log al WHERE al.action = 'staff.staff10_v2.apply')
)
-- <<< DUR-01 BASE END
,
-- Stage 1 only, after the BASE: who each verdict belongs to, and every reason a
-- held row is held, one line per reason. Ids only, never a name.
vw AS (
  SELECT v.*,
         CASE WHEN v.verdict = 'WRITE' THEN 'stage 2 writes it'
              WHEN left(v.verdict, 2) IN ('01', '04') THEN 'left alone'
              WHEN left(v.verdict, 2) = '02' THEN 'owner, the DATA-future card'
              WHEN left(v.verdict, 2) = '08' THEN 'owner, question option (b)'
              WHEN left(v.verdict, 2) IN ('05', '06') THEN 'held as a finding'
              ELSE 'reception' END AS who
    FROM v
),
reasons AS (
  SELECT h.cand_id AS id, 'booking, ' || h.arm AS kind, h.other_id::text AS other_id, h.other_s, h.other_e FROM hit_booking h
  UNION ALL
  SELECT b.cand_id, 'block', b.block_id::text, b.block_s, b.block_e FROM hit_block b
  UNION ALL
  SELECT x.cand_id, 'another stub, once both are extended', x.other_id::text, x.other_s, x.other_e FROM pair x
  UNION ALL
  SELECT x.cand_id, 'the same patient', x.other_id::text, x.other_s, x.other_e FROM hit_patient x
  UNION ALL
  SELECT t.cand_id, 'nesa twin, partner ' || t.twin_status::text, t.twin_id::text, NULL::timestamptz, NULL::timestamptz FROM twins t
  UNION ALL
  SELECT w.id, 'the clinic closure', NULL, NULL, NULL FROM vw w WHERE w.in_closure
  UNION ALL
  SELECT w.id, 'starts outside the clinic hours', NULL, NULL, NULL FROM vw w WHERE w.out_of_window
  UNION ALL
  SELECT w.id, 'outside the therapist hours', NULL, NULL, NULL FROM vw w WHERE w.outside_hours
  UNION ALL
  SELECT w.id, 'starts on the run day', NULL, NULL, NULL FROM vw w WHERE left(w.verdict, 2) = '07'
  UNION ALL
  SELECT w.id, 'no service, so no default', NULL, NULL, NULL FROM vw w WHERE left(w.verdict, 2) = '03'
  UNION ALL
  SELECT x.cand_id, 'nesa not installed at this clinic', x.res_id::text, NULL, NULL FROM res_away x
  UNION ALL
  SELECT x.cand_id, 'the nesa hour of a live twin, its person row', x.other_id::text, x.other_s, x.other_e FROM hit_twin_hold x
  UNION ALL
  SELECT x.cand_id, 'one person, a staff row meant for another clinic', x.user_id::text, NULL, NULL FROM person_away x
  UNION ALL
  SELECT w.id, 'an unconfirmed pedido', NULL, NULL, NULL FROM vw w WHERE w.is_pedido
),
-- THE LIVE FUTURE NESA TWINS, as STAFF-10 v2's ruling (c) set reads them: a row
-- on a shared resource and a row on a person, same tenant, patient, start and
-- service (NULL-safe), both live, starting from 00:00 Lisbon today. covers is
-- its R17: the person window covers the NESA window, or STAFF-10 v2 stops.
live_twin AS (
  SELECT p.id AS p_id, n.id AS n_id, p.location_id,
         (p.starts_at <= n.starts_at AND p.ends_at >= n.ends_at) AS covers,
         (p.ends_at - p.starts_at = interval '1 minute'
          AND EXISTS (SELECT 1 FROM ledger lg WHERE lg.appointment_id = p.id)) AS p_stub,
         (n.ends_at - n.starts_at = interval '1 minute'
          AND EXISTS (SELECT 1 FROM ledger lg WHERE lg.appointment_id = n.id)) AS n_stub
    FROM public.appointments n
    JOIN public.users un ON un.id = n.practitioner_id AND un.is_shared_resource IS TRUE
    JOIN public.appointments p
      ON p.tenant_id = n.tenant_id AND p.patient_id = n.patient_id
     AND p.starts_at = n.starts_at AND p.id <> n.id
     AND p.service_id IS NOT DISTINCT FROM n.service_id
    JOIN public.users up ON up.id = p.practitioner_id AND up.is_shared_resource IS NOT TRUE
   CROSS JOIN k
   WHERE n.status NOT IN ('cancelled', 'no_show') AND p.status NOT IN ('cancelled', 'no_show')
     AND n.starts_at >= (k.today::timestamp AT TIME ZONE 'Europe/Lisbon')
)
SELECT jsonb_build_object(
  'meta', (SELECT jsonb_build_object(
             'now_utc', k.t_now::text,
             'now_lisbon', (k.t_now AT TIME ZONE 'Europe/Lisbon')::text,
             'run_day', k.today::text,
             'write_from_lisbon', (k.day1 AT TIME ZONE 'Europe/Lisbon')::text) FROM k),
  'resources', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', u.id::text, 'active', u.is_active::text, 'bookable', u.is_bookable::text,
                  'installed_at', coalesce((SELECT string_agg(l.name, ', ' ORDER BY l.name)
                                              FROM public.staff_locations sl
                                              JOIN public.locations l ON l.id = sl.location_id
                                             WHERE sl.user_id = u.id), '(nowhere)'))
                  ORDER BY u.id), '[]'::jsonb)
                  FROM public.users u WHERE u.is_shared_resource IS TRUE),
  'clinics', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id::text, 'clinic', l.name,
                'opens', to_char(l.opens_at, 'HH24:MI'), 'closes', to_char(l.closes_at, 'HH24:MI'),
                'latest_start', to_char(l.closes_at - interval '60 minutes', 'HH24:MI'),
                'closure', coalesce(to_char(l.midday_closed_from, 'HH24:MI') || '-' || to_char(l.midday_closed_to, 'HH24:MI'), '(none)'))
                ORDER BY l.name, l.id), '[]'::jsonb)
                FROM public.locations l WHERE l.tenant_id IN (SELECT p.tenant_id FROM pop p)),
  'runs', (SELECT jsonb_agg(jsonb_build_object(
             'action', x.action, 'audit_rows', (SELECT count(*) FROM public.audit_log al WHERE al.action = x.action),
             'last_at', coalesce((SELECT max(al.created_at)::text FROM public.audit_log al WHERE al.action = x.action), '(never)'))
             ORDER BY x.ord)
             FROM (VALUES (1, 'staff.dur01.extend_import_duration'), (2, 'staff.staff10_v2.apply'),
                          (3, 'staff.nesa_split.reassign')) x(ord, action)),
  'live_twins', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'clinic', q.clinic, 'pairs', q.n, 'covers', q.n_cover, 'shorter', q.n_short, 'stub', q.n_stub,
                   'stub_short', q.n_stub_short, 'both_stubs', q.n_both, 'stub_other', q.n_stub_other)
                   ORDER BY q.ord, q.clinic), '[]'::jsonb)
                   FROM (SELECT 0 AS ord, coalesce(l.name, '(no clinic)') AS clinic, count(*) AS n,
                                count(*) FILTER (WHERE lt.covers) AS n_cover,
                                count(*) FILTER (WHERE NOT lt.covers) AS n_short,
                                count(*) FILTER (WHERE lt.p_stub) AS n_stub,
                                count(*) FILTER (WHERE lt.p_stub AND NOT lt.covers) AS n_stub_short,
                                count(*) FILTER (WHERE lt.p_stub AND lt.n_stub) AS n_both,
                                count(*) FILTER (WHERE lt.p_stub AND lt.covers AND NOT lt.n_stub) AS n_stub_other
                           FROM live_twin lt LEFT JOIN public.locations l ON l.id = lt.location_id
                          GROUP BY 2
                         UNION ALL
                         SELECT 1, 'ALL CLINICS', count(*), count(*) FILTER (WHERE lt.covers),
                                count(*) FILTER (WHERE NOT lt.covers), count(*) FILTER (WHERE lt.p_stub),
                                count(*) FILTER (WHERE lt.p_stub AND NOT lt.covers),
                                count(*) FILTER (WHERE lt.p_stub AND lt.n_stub),
                                count(*) FILTER (WHERE lt.p_stub AND lt.covers AND NOT lt.n_stub)
                           FROM live_twin lt) q),
  'one_person', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'staff_row', op.user_id::text, 'resolves', (u.id IS NOT NULL AND lh.id IS NOT NULL)::text,
                   'own_clinic', coalesce(lh.name, '(not found)'),
                   'hours_own', (SELECT count(*) FROM public.availability_templates av
                                  WHERE av.user_id = op.user_id AND av.location_id = op.home_id AND av.is_active IS TRUE),
                   'hours_other', (SELECT count(*) FROM public.availability_templates av
                                    WHERE av.user_id = op.user_id AND av.location_id IS DISTINCT FROM op.home_id
                                      AND av.is_active IS TRUE),
                   'blocks_ahead', (SELECT count(*) FROM public.time_off t, k WHERE t.user_id = op.user_id AND t.ends_at > k.t_now),
                   'own_rows', (SELECT count(*) FROM vw w WHERE w.practitioner_id = op.user_id AND w.location_id = op.home_id),
                   'own_write', (SELECT count(*) FROM vw w WHERE w.practitioner_id = op.user_id AND w.location_id = op.home_id
                                    AND w.verdict = 'WRITE'),
                   'own_block', (SELECT count(*) FROM vw w WHERE w.practitioner_id = op.user_id AND w.location_id = op.home_id
                                    AND w.hits_block),
                   'own_same_person', (SELECT count(DISTINCT h.cand_id) FROM hit_booking h JOIN vw w ON w.id = h.cand_id
                                        WHERE w.practitioner_id = op.user_id AND h.arm = 'same_person'),
                   'away_rows', (SELECT count(*) FROM vw w WHERE w.practitioner_id = op.user_id
                                    AND w.location_id IS DISTINCT FROM op.home_id))
                   ORDER BY op.home_id), '[]'::jsonb)
                   FROM one_person op
                   LEFT JOIN public.users u ON u.id = op.user_id
                   LEFT JOIN public.locations lh ON lh.id = op.home_id AND lh.tenant_id = u.tenant_id),
  'population', (SELECT jsonb_agg(jsonb_build_object(
                   'clinic', q.clinic, 'future_1min_all', q.n_all, 'importer_written', q.n_ledger,
                   'not_in_ledger', q.n_other, 'importer_written_live', q.n_live,
                   'first_created_lisbon', q.first_c, 'last_created_lisbon', q.last_c)
                   ORDER BY q.ord, q.clinic)
                   FROM (SELECT 0 AS ord, coalesce(l.name, '(no clinic)') AS clinic, count(*) AS n_all,
                                count(*) FILTER (WHERE lg.appointment_id IS NOT NULL) AS n_ledger,
                                count(*) FILTER (WHERE lg.appointment_id IS NULL) AS n_other,
                                count(*) FILTER (WHERE lg.appointment_id IS NOT NULL
                                                   AND a.status IN ('scheduled', 'confirmed')) AS n_live,
                                coalesce((min(a.created_at) FILTER (WHERE lg.appointment_id IS NOT NULL)
                                          AT TIME ZONE 'Europe/Lisbon')::text, '-') AS first_c,
                                coalesce((max(a.created_at) FILTER (WHERE lg.appointment_id IS NOT NULL)
                                          AT TIME ZONE 'Europe/Lisbon')::text, '-') AS last_c
                           FROM public.appointments a
                           LEFT JOIN public.locations l ON l.id = a.location_id
                           LEFT JOIN ledger lg ON lg.appointment_id = a.id AND lg.tenant_id = a.tenant_id
                          CROSS JOIN k
                          WHERE a.ends_at - a.starts_at = interval '1 minute' AND a.starts_at >= k.t_now
                          GROUP BY coalesce(l.name, '(no clinic)')
                         UNION ALL
                         SELECT 1, 'ALL CLINICS', count(*),
                                count(*) FILTER (WHERE lg.appointment_id IS NOT NULL),
                                count(*) FILTER (WHERE lg.appointment_id IS NULL),
                                count(*) FILTER (WHERE lg.appointment_id IS NOT NULL
                                                   AND a.status IN ('scheduled', 'confirmed')),
                                coalesce((min(a.created_at) FILTER (WHERE lg.appointment_id IS NOT NULL)
                                          AT TIME ZONE 'Europe/Lisbon')::text, '-'),
                                coalesce((max(a.created_at) FILTER (WHERE lg.appointment_id IS NOT NULL)
                                          AT TIME ZONE 'Europe/Lisbon')::text, '-')
                           FROM public.appointments a
                           LEFT JOIN ledger lg ON lg.appointment_id = a.id AND lg.tenant_id = a.tenant_id
                          CROSS JOIN k
                          WHERE a.ends_at - a.starts_at = interval '1 minute' AND a.starts_at >= k.t_now) q),
  'profile', (SELECT coalesce(jsonb_agg(jsonb_build_object('clinic', q.clinic, 'minutes', q.minutes, 'rows', q.n)
                                        ORDER BY q.clinic, q.sec), '[]'::jsonb)
                FROM (SELECT coalesce(l.name, '(no clinic)') AS clinic,
                             extract(epoch FROM a.ends_at - a.starts_at)::bigint AS sec,
                             round(extract(epoch FROM a.ends_at - a.starts_at) / 60, 1)::text AS minutes,
                             count(*) AS n
                        FROM public.appointments a
                        JOIN ledger lg ON lg.appointment_id = a.id AND lg.tenant_id = a.tenant_id
                        LEFT JOIN public.locations l ON l.id = a.location_id
                       CROSS JOIN k
                       WHERE a.starts_at >= k.t_now AND a.ends_at - a.starts_at < interval '30 minutes'
                       GROUP BY 1, 2, 3) q),
  'verdicts', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'clinic', q.clinic, 'verdict', q.verdict, 'who', q.who, 'rows', q.n,
                 'ends_after_close', q.n_late, 'on_resource_row', q.n_res)
                 ORDER BY q.ord, q.clinic, q.verdict), '[]'::jsonb)
                 FROM (SELECT 0 AS ord, coalesce(l.name, '(no clinic)') AS clinic, w.verdict, w.who, count(*) AS n,
                              count(*) FILTER (WHERE w.ends_after_close) AS n_late,
                              count(*) FILTER (WHERE w.on_resource_row) AS n_res
                         FROM vw w LEFT JOIN public.locations l ON l.id = w.location_id
                        GROUP BY 2, 3, 4
                       UNION ALL
                       SELECT 1, 'ALL CLINICS', w.verdict, w.who, count(*),
                              count(*) FILTER (WHERE w.ends_after_close),
                              count(*) FILTER (WHERE w.on_resource_row)
                         FROM vw w GROUP BY w.verdict, w.who) q),
  'partition', (SELECT jsonb_build_object(
                  'population', (SELECT count(*) FROM pop),
                  'classified', count(*), 'distinct_ids', count(DISTINCT w.id),
                  'write', count(*) FILTER (WHERE w.verdict = 'WRITE'),
                  'held', count(*) FILTER (WHERE w.verdict <> 'WRITE'))
                  FROM vw w),
  'by_service', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'clinic', q.clinic, 'service_id', q.service_id, 'service', q.service, 'default_min', q.dmin,
                   'rows', q.n, 'write', q.n_write, 'nesa_twin', q.n_twin, 'on_resource_row', q.n_res,
                   'person_row', q.n_person, 'machine_alongside', q.n_along)
                   ORDER BY q.clinic, q.n DESC, q.service, q.service_id), '[]'::jsonb)
                   FROM (SELECT coalesce(l.name, '(no clinic)') AS clinic,
                                coalesce(w.service_id::text, '(none)') AS service_id,
                                coalesce(s.name, '(none)') AS service,
                                coalesce(w.duration_min::text, '-') AS dmin,
                                count(*) AS n,
                                count(*) FILTER (WHERE w.verdict = 'WRITE') AS n_write,
                                count(*) FILTER (WHERE w.is_twin) AS n_twin,
                                count(*) FILTER (WHERE w.on_resource_row) AS n_res,
                                count(*) FILTER (WHERE NOT w.on_resource_row) AS n_person,
                                count(*) FILTER (WHERE NOT w.on_resource_row AND EXISTS (
                                  SELECT 1 FROM public.appointments o
                                    JOIN public.users uo ON uo.id = o.practitioner_id AND uo.is_shared_resource IS TRUE
                                   WHERE o.tenant_id = w.tenant_id AND o.id <> w.id AND o.patient_id = w.patient_id
                                     AND o.status NOT IN ('cancelled', 'no_show')
                                     AND o.starts_at < coalesce(w.proposed_end, w.starts_at + interval '1 hour')
                                     AND o.ends_at > w.starts_at)) AS n_along
                           FROM vw w
                           LEFT JOIN public.locations l ON l.id = w.location_id
                           LEFT JOIN public.services s ON s.id = w.service_id
                          GROUP BY 1, 2, 3, 4) q),
  'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
             'clinic', coalesce(l.name, '(no clinic)'), 'appointment', w.id::text,
             'starts_lisbon', to_char(w.starts_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'),
             'current_end', to_char(w.ends_at AT TIME ZONE 'Europe/Lisbon', 'HH24:MI'),
             'proposed_end', coalesce(to_char(w.proposed_end AT TIME ZONE 'Europe/Lisbon', 'HH24:MI'), '-'),
             'default_min', coalesce(w.duration_min::text, '-'), 'status', w.status::text,
             'service_id', coalesce(w.service_id::text, '(none)'), 'therapist_id', w.practitioner_id::text,
             'therapist_2_id', coalesce(w.practitioner_2_id::text, '-'),
             'flags', concat_ws(' ',
                        CASE WHEN w.on_resource_row THEN 'resource_row' END,
                        CASE WHEN w.is_twin THEN 'twin' END,
                        CASE WHEN w.in_closure THEN 'closure' END,
                        CASE WHEN w.out_of_window THEN 'clinic_hours' END,
                        CASE WHEN w.outside_hours THEN 'therapist_hours' END,
                        CASE WHEN w.hits_booking THEN 'booking' END,
                        CASE WHEN w.hits_block THEN 'block' END,
                        CASE WHEN w.hits_stub THEN 'stub' END,
                        CASE WHEN w.hits_patient THEN 'patient' END,
                        CASE WHEN w.resource_away THEN 'nesa_away' END,
                        CASE WHEN w.hits_twin_hold THEN 'twin_hold' END,
                        CASE WHEN w.person_away THEN 'person_away' END,
                        CASE WHEN w.is_pedido THEN 'pedido' END,
                        CASE WHEN w.ends_after_close THEN 'ends_after_close' END),
             'verdict', w.verdict, 'who', w.who)
             ORDER BY coalesce(l.name, '(no clinic)'), w.verdict, w.starts_at, w.id), '[]'::jsonb)
             FROM vw w LEFT JOIN public.locations l ON l.id = w.location_id),
  'reception', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'clinic', coalesce(l.name, '(no clinic)'), 'appointment', w.id::text,
                  'patient_id', w.patient_id::text, 'therapist_id', w.practitioner_id::text,
                  'starts_lisbon', to_char(w.starts_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'),
                  'would_end', coalesce(to_char(w.proposed_end AT TIME ZONE 'Europe/Lisbon', 'HH24:MI'), '-'),
                  'verdict', w.verdict, 'reason', r.kind, 'other_id', coalesce(r.other_id, '-'),
                  'other_window', coalesce(to_char(r.other_s AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') || '-'
                                           || to_char(r.other_e AT TIME ZONE 'Europe/Lisbon', 'HH24:MI'), '-'))
                  ORDER BY coalesce(l.name, '(no clinic)'), w.starts_at, w.id, r.kind, r.other_id), '[]'::jsonb)
                  FROM vw w
                  JOIN reasons r ON r.id = w.id
                  LEFT JOIN public.locations l ON l.id = w.location_id
                 WHERE w.who IN ('reception', 'owner, question option (b)')),
  'carries', (SELECT jsonb_agg(jsonb_build_object('ord', c.ord, 'carry', c.carry, 'value', c.value) ORDER BY c.ord)
                FROM car c),
  'refusals', (SELECT jsonb_agg(jsonb_build_object(
                 'code', r.code, 'label', r.label, 'n', r.n, 'control', r.control,
                 'verdict', CASE WHEN r.n > 0 THEN 'REFUSE' WHEN r.control = 0 THEN 'VACUOUS' ELSE 'OK' END)
                 ORDER BY r.code) FROM ref r),
  'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'on_table', t.tgrelid::regclass::text, 'trigger', t.tgname::text,
                 'enabled', t.tgenabled::text, 'function', t.tgfoid::regprocedure::text)
                 ORDER BY t.tgrelid::regclass::text, t.tgname::text), '[]'::jsonb)
                 FROM pg_catalog.pg_trigger t
                WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.audit_log'::regclass)
                  AND NOT t.tgisinternal)
)::text AS dur01_json
\gset

-- ---------------------------------------------------------------------------
-- 0. THE INSTANT. Every cut below is taken from it.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 0. THE INSTANT: the clock, the Lisbon run day, and the first start stage 2 may write ==='
SELECT m ->> 'now_utc' AS now_utc, m ->> 'now_lisbon' AS now_lisbon, m ->> 'run_day' AS run_day_lisbon,
       m ->> 'write_from_lisbon' AS writes_only_rows_starting_from
  FROM (SELECT :'dur01_json'::jsonb -> 'meta' AS m) s;

-- ---------------------------------------------------------------------------
-- 1. SCOPE: the shared resources, the clinics, and what has already run.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. SCOPE: every shared resource and where it is installed ==='
SELECT e ->> 'id' AS resource_id, e ->> 'active' AS active, e ->> 'bookable' AS bookable,
       e ->> 'installed_at' AS installed_at
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'resources') e;
\echo '    The twin check and the resource arms read the ACTIVE shared resources (R02 refuses none).'
\echo '    Section 1e names the one person with two staff rows (R10 refuses a pair that does not resolve).'
\echo ''
\echo '=== 1b. THE CLINICS: opening, the last start the app allows, closing, and the midday closure ==='
SELECT e ->> 'clinic' AS clinic, e ->> 'id' AS clinic_id, e ->> 'opens' AS opens,
       e ->> 'latest_start' AS latest_start, e ->> 'closes' AS closes, e ->> 'closure' AS midday_closure
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'clinics') e;
\echo ''
\echo '=== 1c. WHAT HAS ALREADY RUN: DUR-01 itself, STAFF-10 v2 and NESA-SPLIT, by their audit rows ==='
SELECT e ->> 'action' AS action, (e ->> 'audit_rows')::int AS audit_rows, e ->> 'last_at' AS last_at
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'runs') e;
\echo '    STAFF-10 v2 before or after DUR-01 is the doc''s D5. Either order is classified, and 1e says'
\echo '    what differs; a STAFF-10 v2 write landing between this stage and stage 2 refuses there.'
\echo ''
\echo '=== 1d. THE LIVE FUTURE NESA TWINS STAFF-10 v2 RESOLVES, and how many of them its R17 refuses ==='
SELECT e ->> 'clinic' AS clinic, (e ->> 'pairs')::int AS live_future_pairs,
       (e ->> 'covers')::int AS person_window_covers_nesa, (e ->> 'shorter')::int AS its_r17_refuses,
       (e ->> 'stub')::int AS person_half_is_an_importer_minute,
       (e ->> 'stub_short')::int AS of_which_nesa_row_longer, (e ->> 'both_stubs')::int AS of_which_both_halves_a_minute,
       (e ->> 'stub_other')::int AS of_which_other
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'live_twins') e;
\echo '    STAFF-10 v2 cancels the NESA row of each pair and holds the NESA on the person row instead,'
\echo '    over the whole person window. Verdict 17 already holds every stub that overlaps that window,'
\echo '    so the NESA hour reads the same in either order; section 1e names what the order does change.'
\echo '    its_r17_refuses above 0 means STAFF-10 v2 stops, whole, until those person rows are fixed.'
\echo '    of_which_nesa_row_longer is the AGENDA-TWIN shape, a person minute against a longer NESA row,'
\echo '    which its R17 refuses; of_which_both_halves_a_minute passes its R17 and leaves its person'
\echo '    minute naming the NESA as Terapeuta 2 (question option b).'
\echo ''
\echo '=== 1e. THE ONE PERSON WITH TWO STAFF ROWS (JP): hours, blocks and one-minute rows on each ==='
SELECT e ->> 'staff_row' AS staff_row, e ->> 'own_clinic' AS own_clinic, e ->> 'resolves' AS resolves,
       (e ->> 'hours_own')::int AS hours_rows_own_clinic, (e ->> 'hours_other')::int AS hours_rows_other_clinic,
       (e ->> 'blocks_ahead')::int AS blocks_ahead,
       (e ->> 'own_rows')::int AS minute_rows_own_clinic, (e ->> 'own_write')::int AS of_which_write,
       (e ->> 'own_block')::int AS of_which_over_a_block, (e ->> 'own_same_person')::int AS over_the_other_row,
       (e ->> 'away_rows')::int AS minute_rows_other_clinic
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'one_person') e;
\echo '    A row on one of the two at the other clinic is held outright (verdict 18), in either order.'
\echo '    over_the_other_row counts rows held because the other staff row holds the person then.'
\echo '    What STAFF-10 v2 still changes, when it runs first: its W3 deletes a JP(cb) block, so'
\echo '    rows of_which_over_a_block may read WRITE after it; its W2 gives JP(lv) Saturday hours, so'
\echo '    on a JP(lv) row with no hours_rows_own_clinic today, verdict 11 may hold rows after it.'

-- ---------------------------------------------------------------------------
-- 2. THE POPULATION, with and without the ledger filter.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. THE POPULATION: future one-minute rows, and how many the importer wrote (the ledger) ==='
SELECT e ->> 'clinic' AS clinic, (e ->> 'future_1min_all')::int AS future_1min_all,
       (e ->> 'importer_written')::int AS importer_written, (e ->> 'not_in_ledger')::int AS not_in_ledger,
       (e ->> 'importer_written_live')::int AS importer_written_live,
       e ->> 'first_created_lisbon' AS first_created_lisbon, e ->> 'last_created_lisbon' AS last_created_lisbon
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'population') e;
\echo '    importer_written is the population this op classifies. not_in_ledger rows are staff-made and'
\echo '    are never touched. The created range is a cross-check against the import windows.'
\echo ''
\echo '=== 2b. THE DURATION PROFILE: importer-written future rows under 30 minutes, by clinic ==='
SELECT e ->> 'clinic' AS clinic, e ->> 'minutes' AS minutes, (e ->> 'rows')::int AS importer_rows
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'profile') e;
\echo '    Only exactly one minute is in scope. Any other short class here is a finding for the owner.'

-- ---------------------------------------------------------------------------
-- 3. THE VERDICTS, by clinic, and the partition.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. THE VERDICTS BY CLINIC: every importer-written row gets exactly one ==='
SELECT e ->> 'clinic' AS clinic, e ->> 'verdict' AS verdict, e ->> 'who' AS belongs_to,
       (e ->> 'rows')::int AS importer_rows, (e ->> 'ends_after_close')::int AS ends_after_close,
       (e ->> 'on_resource_row')::int AS on_resource_row
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'verdicts') e;
\echo ''
\echo '=== 3b. THE PARTITION: every population row classified once ==='
SELECT (p ->> 'population')::int AS population, (p ->> 'classified')::int AS classified,
       (p ->> 'distinct_ids')::int AS distinct_ids, (p ->> 'write')::int AS write, (p ->> 'held')::int AS held,
       CASE WHEN (p ->> 'population')::int = (p ->> 'classified')::int
             AND (p ->> 'population')::int = (p ->> 'distinct_ids')::int
             AND (p ->> 'population')::int = (p ->> 'write')::int + (p ->> 'held')::int
            THEN 'partition holds' ELSE 'PARTITION BROKEN' END AS partition
  FROM (SELECT :'dur01_json'::jsonb -> 'partition' AS p) s;

-- ---------------------------------------------------------------------------
-- 4. BY SERVICE: the evidence for the premise question.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. BY SERVICE: what the one-minute rows are, the evidence for the premise question ==='
SELECT e ->> 'clinic' AS clinic, e ->> 'service' AS service, e ->> 'service_id' AS service_id,
       e ->> 'default_min' AS default_min, (e ->> 'rows')::int AS importer_rows, (e ->> 'write')::int AS write,
       (e ->> 'nesa_twin')::int AS nesa_twin, (e ->> 'on_resource_row')::int AS on_resource_row,
       (e ->> 'person_row')::int AS person_row, (e ->> 'machine_alongside')::int AS machine_alongside
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'by_service') e;
\echo '    person_row: the stub names a therapist, not a machine. machine_alongside: of those, how many'
\echo '    have a live row of the same patient on a shared resource over the proposed window (or the'
\echo '    hour from the start). Many of those means the stub may be "the therapist starts the machine",'
\echo '    and extending it would hold the therapist for the whole default. The question block asks this.'

-- ---------------------------------------------------------------------------
-- 5. EVERY ROW. Ids only.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. EVERY ROW: ids, Lisbon times, the flags that fired, and its verdict ==='
SELECT e ->> 'clinic' AS clinic, e ->> 'appointment' AS appointment, e ->> 'starts_lisbon' AS starts_lisbon,
       e ->> 'current_end' AS ends_now, e ->> 'proposed_end' AS would_end, e ->> 'default_min' AS default_min,
       e ->> 'status' AS status, e ->> 'service_id' AS service_id, e ->> 'therapist_id' AS therapist_id,
       e ->> 'therapist_2_id' AS therapist_2_id, e ->> 'flags' AS flags, e ->> 'verdict' AS verdict
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'rows') e;

-- ---------------------------------------------------------------------------
-- 6. THE RECEPTION AND HELD LIST: every reason, one line each. Ids only.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. THE RECEPTION LIST, and the twins held for the owner: one line per reason, ids only ==='
SELECT e ->> 'clinic' AS clinic, e ->> 'appointment' AS appointment, e ->> 'patient_id' AS patient_id,
       e ->> 'therapist_id' AS therapist_id, e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'would_end' AS would_end,
       e ->> 'verdict' AS verdict, e ->> 'reason' AS reason, e ->> 'other_id' AS other_id,
       e ->> 'other_window' AS other_window_lisbon
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'reception') e;
\echo '    Stage 2 never writes these. Reception fixes each by hand in the agenda, where the app''s own'
\echo '    checks run; a NESA twin waits for the owner''s answer to question option (b).'

-- ---------------------------------------------------------------------------
-- 7. THE CARRIES. Stage 2 is handed every one and refuses if any has moved.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 7. THE CARRIES. Stage 2 is given these and refuses if any has moved ==='
SELECT e ->> 'carry' AS carry, e ->> 'value' AS value
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'carries') e
 ORDER BY (e ->> 'ord')::int;

-- ---------------------------------------------------------------------------
-- 8. THE REFUSALS. n must read 0 on every line, or stage 2 STOPS.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 8. THE REFUSALS. Any REFUSE stops the sitting here; stage 2 refuses on the same lines ==='
SELECT e ->> 'code' AS code, e ->> 'label' AS refuses_when, (e ->> 'n')::int AS n,
       (e ->> 'control')::int AS control, e ->> 'verdict' AS verdict
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'refusals') e
 ORDER BY e ->> 'code';
\echo ''
\echo '=== 8b. WHAT ELSE WOULD RUN ON THE WRITE: every trigger the system did not create on appointments or audit_log. R05 refuses any ==='
SELECT e ->> 'on_table' AS on_table, e ->> 'trigger' AS trigger_name, e ->> 'enabled' AS enabled,
       e ->> 'function' AS runs_function
  FROM jsonb_array_elements(:'dur01_json'::jsonb -> 'triggers') e;
\echo '    An empty listing is the expected answer.'

ROLLBACK;

\echo ''
\echo '=== DUR-01 STAGE 1 COMPLETE. Nothing was written. ==='

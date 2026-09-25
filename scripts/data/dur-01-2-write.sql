-- ============================================================================
-- DUR-01, STAGE 2 of 3: THE WRITE. ONE DO BLOCK, ONE TRANSACTION.
--
-- Card DUR-01, a NEW held data op (docs/data-op-dur-01.md). Built to option (a)
-- of its question block: write only the rows stage 1 classifies WRITE.
--
-- WHAT IT WRITES, AND NOTHING ELSE:
--   public.appointments.ends_at    -> starts_at + the service's duration_min,
--                                     on the WRITE rows only
--   public.appointments.updated_at -> now(), on the same rows
--   public.audit_log                  ONE row: per id the before and after end
--                                     and the before updated_at, the excluded
--                                     ids by verdict, the carries, the md5s
--
-- WHAT IT NEVER TOUCHES, asserted inside the transaction rather than promised:
-- every other column of the written rows (md5 of the frozen columns, before and
-- after), every other appointment in the tenant (md5), the appointment total,
-- and every table but appointments and audit_log. It writes no status, no
-- start, no participant, no service, no confirmation, and it sends nothing: a
-- raw UPDATE runs no app path, so no reminder is queued and no one is told.
--
-- THE TABLES ARE LOCKED BEFORE THE FIRST READ. A staff reschedule takes no
-- advisory lock (apps/web/lib/scheduling/slot-lock.ts), so only a table lock
-- orders this write against one. appointments is taken SHARE ROW EXCLUSIVE and
-- the three tables the verdicts read that the app writes during the day are
-- taken SHARE, each with a lock_timeout, so a booking in flight STOPS this op
-- cleanly instead of racing it. The transaction is READ COMMITTED: every read
-- runs after the locks, so each one sees the tables as they stand under them.
--
-- A "STOP:" RAISED IN THIS FILE (psql exit 3) MEANS THE TRANSACTION ABORTED AND
-- NOTHING WAS WRITTEN. Every refusal is raised before the write, and every
-- assertion after it raises, which rolls the whole block back. psql exit 0
-- means the COMMIT below ran: the write stands.
--
-- THE CARRIES COME FROM STAGE 1, RUN ON THE SAME LISBON DAY IN THE SAME SITTING.
-- The block between the BASE markers is stage 1's, byte for byte, so the
-- recomputed carries can only differ if the database moved.
--
-- Run (stage 2 of docs/data-op-dur-01.md passes every carry with -v):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v dur01_run_day=... -f scripts/data/dur-01-2-write.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
-- The step lines and the DONE line are NOTICEs. A role or database default of
-- client_min_messages above notice would hide them, and the stage 2 block would
-- then miss DONE after a write that committed. Pinned here, for this session.
SET client_min_messages = notice;

\echo ''
\echo '=== DUR-01, STAGE 2. ONE TRANSACTION, THE TABLES LOCKED BEFORE THE FIRST READ. ==='

BEGIN ISOLATION LEVEL READ COMMITTED;

-- PSQL DOES NOT INTERPOLATE :'var' INSIDE A DOLLAR-QUOTED BODY. The carries are
-- lifted into session settings here, in plain SQL, and read back inside the
-- block with current_setting. A carry not passed fails on this statement.
SELECT count(*) AS carries_lifted
  FROM (VALUES
    (set_config('dur01.dur01_run_day',    :'dur01_run_day',    false)),
    (set_config('dur01.dur01_count',      :'dur01_count',      false)),
    (set_config('dur01.dur01_digest',     :'dur01_digest',     false)),
    (set_config('dur01.dur01_s10v2_runs', :'dur01_s10v2_runs', false))
  ) v(x);

DO $dur01$
DECLARE
  c_action   constant text := 'staff.dur01.extend_import_duration';

  v_today    date;
  v_day1     timestamptz;
  v_clock    timestamptz;
  v_tenant   uuid;
  v_ids      uuid[];
  v_excluded jsonb;
  v_verdicts jsonb;
  v_pop_n    int;
  v_ref      jsonb;
  v_car      jsonb;
  v_written  jsonb;
  v_rc       jsonb;

  v_row      record;
  v_want     text;
  v_n        int;

  v_b_total  int;
  v_bn_frozen int;
  v_b_md5_frozen text;
  v_bn_rest  int;
  v_b_md5_rest text;
  v_b_digest text;
  v_a_total  int;
  v_a_md5_frozen text;
  v_a_md5_rest text;
  v_a_digest text;
BEGIN
  -- ==========================================================================
  -- L1. THE LOCKS, before the first read. lock_timeout is local to this
  --     transaction: a lock not granted in five seconds STOPS the op.
  -- ==========================================================================
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.appointments IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.time_off, public.availability_templates, public.staff_notifications IN SHARE MODE;
  RAISE NOTICE 'L1 locked appointments (share row exclusive) and time_off, availability_templates, staff_notifications (share); lock_timeout %',
    current_setting('lock_timeout');

  -- ==========================================================================
  -- P0. HAS THIS OP ALREADY RUN? Its audit action is the only answer.
  -- ==========================================================================
  SELECT count(*)::int INTO v_n FROM public.audit_log al WHERE al.action = c_action;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'STOP: DUR-01 has already run: % audit row(s) carry the action %. Nothing was written', v_n, c_action;
  END IF;
  RAISE NOTICE 'P0 no audit row carries %', c_action;

  -- ==========================================================================
  -- P1. EVERY SET, COMPUTED ONCE, BY STAGE 1'S OWN TEXT.
  -- ==========================================================================
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
      OR c2.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR c2.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c.id)
      OR c.practitioner_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c2.id)
      OR c.practitioner_2_id IN (SELECT cr.res_id FROM c_res cr WHERE cr.cand_id = c2.id)
      OR (nullif(btrim(c.room), '') IS NOT NULL AND c2.location_id = c.location_id
          AND lower(c2.room) = lower(btrim(c.room)))
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
                  OR w.hits_stub IS NOT FALSE OR w.hits_patient IS NOT FALSE))::int,
         (SELECT count(*) FROM wr)::int
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
  SELECT (SELECT k.today FROM k), (SELECT k.day1 FROM k), (SELECT k.t_now FROM k),
         (SELECT p.tenant_id FROM pop p ORDER BY p.id LIMIT 1),
         coalesce((SELECT array_agg(wr.id ORDER BY wr.id) FROM wr), '{}'::uuid[]),
         coalesce((SELECT jsonb_object_agg(x.verdict, x.ids)
                     FROM (SELECT v.verdict, jsonb_agg(v.id ORDER BY v.id) AS ids
                             FROM v WHERE v.verdict <> 'WRITE' GROUP BY v.verdict) x), '{}'::jsonb),
         coalesce((SELECT jsonb_object_agg(x.verdict, x.n)
                     FROM (SELECT v.verdict, count(*) AS n FROM v GROUP BY v.verdict) x), '{}'::jsonb),
         (SELECT count(*)::int FROM pop),
         (SELECT jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label, 'n', r.n, 'control', r.control)
                           ORDER BY r.code) FROM ref r),
         (SELECT jsonb_object_agg(c.carry, c.value) FROM car c)
    INTO v_today, v_day1, v_clock, v_tenant, v_ids, v_excluded, v_verdicts, v_pop_n, v_ref, v_car;

  RAISE NOTICE 'P1 run day (Lisbon) %, writes rows starting from % Lisbon, clock %',
    v_today, v_day1 AT TIME ZONE 'Europe/Lisbon', v_clock;
  RAISE NOTICE 'P1 population %, to write %, by verdict %', v_pop_n, cardinality(v_ids), v_verdicts;

  -- ==========================================================================
  -- P2. THE REFUSALS, stage 1's own lines. Any n above 0 STOPS the op here.
  -- ==========================================================================
  FOR v_row IN SELECT e ->> 'code' AS code, e ->> 'label' AS label,
                      (e ->> 'n')::int AS n, (e ->> 'control')::int AS control
                 FROM jsonb_array_elements(v_ref) e ORDER BY 1
  LOOP
    RAISE NOTICE 'P2 % n=% control=% (%)', v_row.code, v_row.n, v_row.control, v_row.label;
  END LOOP;
  FOR v_row IN SELECT e ->> 'code' AS code, e ->> 'label' AS label, (e ->> 'n')::int AS n
                 FROM jsonb_array_elements(v_ref) e WHERE (e ->> 'n')::int > 0 ORDER BY 1
  LOOP
    RAISE EXCEPTION 'STOP: % refuses, %: n = %. Nothing was written', v_row.code, v_row.label, v_row.n;
  END LOOP;

  -- ==========================================================================
  -- P3. THE CARRIES. Same Lisbon day, then each carry against stage 1's.
  -- ==========================================================================
  IF current_setting('dur01.dur01_run_day', true) IS DISTINCT FROM v_today::text THEN
    RAISE EXCEPTION 'STOP: stage 1 ran on Lisbon day %, and today is %. Run stage 1 again today',
      current_setting('dur01.dur01_run_day', true), v_today;
  END IF;
  SELECT count(*)::int INTO v_n FROM jsonb_object_keys(v_car);
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'STOP: the carry set has % names, not 4', v_n;
  END IF;
  FOR v_row IN SELECT c.key, c.value FROM jsonb_each_text(v_car) c ORDER BY 1
  LOOP
    v_want := current_setting('dur01.' || v_row.key, true);
    IF v_want IS NULL OR v_want = '' THEN
      RAISE EXCEPTION 'STOP: carry % was not passed from stage 1', v_row.key;
    END IF;
    IF v_want IS DISTINCT FROM v_row.value THEN
      RAISE EXCEPTION 'STOP: carry % reads % now and stage 1 printed %. The database moved since stage 1. Run stage 1 again',
        v_row.key, v_row.value, v_want;
    END IF;
  END LOOP;
  RAISE NOTICE 'P3 the run day and all 4 carries match stage 1';

  -- ==========================================================================
  -- P4. WHAT ELSE RUNS ON A WRITE TO THESE TABLES. R05 has already refused any
  --     trigger the system did not create; P4 reads the catalog again under the
  --     lock and STOPS on any. Every piece is cast: text || "char" has no
  --     operator, and a print must not abort.
  -- ==========================================================================
  SELECT string_agg(t.tgrelid::regclass::text || '.' || t.tgname::text || ' (enabled ' || t.tgenabled::text || ')',
                    ', ' ORDER BY t.tgrelid::regclass::text, t.tgname::text)
    INTO v_want
    FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.audit_log'::regclass)
     AND NOT t.tgisinternal;
  RAISE NOTICE 'P4 triggers the system did not create, on a table this op writes: %', coalesce(v_want, 'none');
  IF v_want IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: P4 found a trigger the system did not create on a table this op writes: %. Nothing was written', v_want;
  END IF;

  -- ==========================================================================
  -- P5. THE BASELINES. Each is read again after the write and asserted.
  --     frozen: EVERY appointments column but the two this op writes (ends_at,
  --     updated_at), over the rows it writes. The unit test derives the column
  --     list from packages/db/src/schema.ts and the migrations, which must agree.
  --     rest: every other appointment in the tenant, whole.
  -- ==========================================================================
  SELECT count(*)::int INTO v_b_total FROM public.appointments a WHERE a.tenant_id = v_tenant;
  SELECT count(*)::int, md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.practitioner_id, a.location_id,
                                     a.service_id, a.room, a.starts_at, a.status, a.recurrence_rule, a.recurrence_parent_id,
                                     a.notes, a.created_by, a.created_at, a.confirmation_state, a.confirmation_received_at,
                                     a.confirmation_channel, a.booking_group_id, a.batch_id, a.patient_2_id,
                                     a.practitioner_2_id, a.origin, a.pack_instance_id)::text, E'\n' ORDER BY a.id), ''))
    INTO v_bn_frozen, v_b_md5_frozen
    FROM public.appointments a WHERE a.id = ANY(v_ids);
  SELECT count(*)::int, md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), ''))
    INTO v_bn_rest, v_b_md5_rest
    FROM public.appointments a WHERE a.tenant_id = v_tenant AND NOT (a.id = ANY(v_ids));
  -- The per-id record the audit row carries, and the ends the write will give,
  -- computed from the table under the lock and checked against the carry
  -- BEFORE anything is written.
  SELECT jsonb_agg(jsonb_build_object('id', a.id, 'service_id', a.service_id, 'duration_min', s.duration_min,
                                      'before_end', a.ends_at, 'before_updated_at', a.updated_at,
                                      'after_end', a.starts_at + make_interval(mins => s.duration_min))
                   ORDER BY a.id),
         coalesce(md5(string_agg(a.id::text || '@'
                                 || extract(epoch FROM a.starts_at + make_interval(mins => s.duration_min))::bigint::text,
                                 ',' ORDER BY a.id)), 'empty')
    INTO v_written, v_b_digest
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
   WHERE a.id = ANY(v_ids);
  IF v_bn_frozen <> cardinality(v_ids) OR coalesce(jsonb_array_length(v_written), 0) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'STOP: the rows to write read % and % under the lock, not %. Nothing was written',
      v_bn_frozen, coalesce(jsonb_array_length(v_written), 0), cardinality(v_ids);
  END IF;
  IF v_b_digest IS DISTINCT FROM current_setting('dur01.dur01_digest', true) THEN
    RAISE EXCEPTION 'STOP: the ends this write would give (%) are not the carried ones (%). Nothing was written',
      v_b_digest, current_setting('dur01.dur01_digest', true);
  END IF;
  RAISE NOTICE 'P5 baseline: appointments in the tenant %, to write %, frozen md5 %, the rest md5 % over %',
    v_b_total, v_bn_frozen, left(v_b_md5_frozen, 8), left(v_b_md5_rest, 8), v_bn_rest;
  IF v_bn_rest = 0 THEN
    RAISE EXCEPTION 'STOP: the tenant holds no appointment outside the write set, so the untouched comparison would prove nothing. Nothing was written';
  END IF;

  -- ==========================================================================
  -- W1. THE WRITE. Only the WRITE ids, only while each still lasts one minute
  --     and is live, the end taken from its service. ROW_COUNT asserted exactly.
  -- ==========================================================================
  UPDATE public.appointments a
     SET ends_at = a.starts_at + make_interval(mins => s.duration_min), updated_at = now()
    FROM public.services s
   WHERE a.id = ANY(v_ids) AND a.tenant_id = v_tenant
     AND s.id = a.service_id AND s.tenant_id = a.tenant_id
     AND a.ends_at = a.starts_at + interval '1 minute'
     AND a.status IN ('scheduled', 'confirmed');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'STOP: W1 extended % row(s), expected %. Nothing was written', v_n, cardinality(v_ids);
  END IF;
  RAISE NOTICE 'W1 extended % row(s) to start plus the service default', v_n;

  -- ==========================================================================
  -- A1. THE ENDS NOW IN THE TABLE ARE THE CARRIED ONES, id by id.
  -- ==========================================================================
  SELECT coalesce(md5(string_agg(a.id::text || '@' || extract(epoch FROM a.ends_at)::bigint::text, ',' ORDER BY a.id)), 'empty')
    INTO v_a_digest
    FROM public.appointments a WHERE a.id = ANY(v_ids);
  IF v_a_digest IS DISTINCT FROM current_setting('dur01.dur01_digest', true) THEN
    RAISE EXCEPTION 'STOP: after the write the ends read %, not the carried %', v_a_digest, current_setting('dur01.dur01_digest', true);
  END IF;
  RAISE NOTICE 'A1 the written ends reproduce the carried digest %', v_a_digest;

  -- ==========================================================================
  -- A2. THE RE-MEASURE. The app's rule again, over every written row at its new
  --     end, against the table as it now stands, the other written rows
  --     included. Any hit STOPS the whole transaction.
  -- ==========================================================================
  WITH
  cand AS (
    SELECT a.id, a.tenant_id, a.patient_id, a.patient_2_id, a.practitioner_id, a.practitioner_2_id,
           a.location_id, a.room, a.starts_at AS s, a.ends_at AS e
      FROM public.appointments a WHERE a.id = ANY(v_ids)
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
  SELECT to_jsonb(rc) INTO v_rc FROM rc;
  RAISE NOTICE 'A2 the re-measure on the table as it now stands: %', v_rc;
  IF (v_rc ->> 'n')::int <> cardinality(v_ids) OR (v_rc ->> 'live_self')::int <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'STOP: the re-measure read % written row(s) and saw % as live, not %; its zeros would prove nothing',
      v_rc ->> 'n', v_rc ->> 'live_self', cardinality(v_ids);
  END IF;
  IF (v_rc ->> 'booking')::int + (v_rc ->> 'block')::int + (v_rc ->> 'closure')::int + (v_rc ->> 'clinic_hours')::int
     + (v_rc ->> 'therapist_hours')::int + (v_rc ->> 'patient')::int <> 0 THEN
    RAISE EXCEPTION 'STOP: after the write a written row overlaps something the rule forbids: %. Nothing was written', v_rc;
  END IF;

  -- ==========================================================================
  -- A3. WHAT MUST NOT HAVE MOVED.
  -- ==========================================================================
  SELECT count(*)::int INTO v_a_total FROM public.appointments a WHERE a.tenant_id = v_tenant;
  SELECT md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.practitioner_id, a.location_id,
                                     a.service_id, a.room, a.starts_at, a.status, a.recurrence_rule, a.recurrence_parent_id,
                                     a.notes, a.created_by, a.created_at, a.confirmation_state, a.confirmation_received_at,
                                     a.confirmation_channel, a.booking_group_id, a.batch_id, a.patient_2_id,
                                     a.practitioner_2_id, a.origin, a.pack_instance_id)::text, E'\n' ORDER BY a.id), ''))
    INTO v_a_md5_frozen
    FROM public.appointments a WHERE a.id = ANY(v_ids);
  SELECT md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), ''))
    INTO v_a_md5_rest
    FROM public.appointments a WHERE a.tenant_id = v_tenant AND NOT (a.id = ANY(v_ids));
  IF v_a_total <> v_b_total THEN
    RAISE EXCEPTION 'STOP: the appointment total moved from % to %', v_b_total, v_a_total;
  END IF;
  IF v_a_md5_frozen IS DISTINCT FROM v_b_md5_frozen THEN
    RAISE EXCEPTION 'STOP: a written appointment changed in a column this op does not write';
  END IF;
  IF v_a_md5_rest IS DISTINCT FROM v_b_md5_rest THEN
    RAISE EXCEPTION 'STOP: an appointment outside the write set changed';
  END IF;
  RAISE NOTICE 'A3 total %, frozen md5 and the rest md5 unchanged', v_a_total;

  -- ==========================================================================
  -- THE AUDIT ROW. Ids, times, counts and md5s only: no patient data and no
  -- free text. Stage 3 reads every number back from it.
  -- ==========================================================================
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_tenant, NULL, c_action, 'appointment', NULL, jsonb_build_object(
    'card', 'DUR-01',
    'source', 'data_op_dur_01',
    'option', 'a',
    'run_day_lisbon', v_today,
    'writes_from', v_day1,
    'clock', v_clock,
    'carries', v_car,
    'written', v_written,
    'excluded', v_excluded,
    'verdicts', v_verdicts,
    'population', v_pop_n,
    'before', jsonb_build_object('appointments', v_b_total, 'written', cardinality(v_ids)),
    'md5', jsonb_build_object('frozen', v_b_md5_frozen, 'rest', v_b_md5_rest),
    'md5_rows', jsonb_build_object('frozen', v_bn_frozen, 'rest', v_bn_rest),
    'recheck', v_rc
  ));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 OR (SELECT count(*) FROM public.audit_log al WHERE al.action = c_action) <> 1 THEN
    RAISE EXCEPTION 'STOP: the audit row was not written exactly once';
  END IF;

  RAISE NOTICE 'DUR-01 STAGE 2 DONE: % row(s) extended to their service default; % population row(s) held, by verdict %',
    cardinality(v_ids), v_pop_n - cardinality(v_ids), v_verdicts;
END $dur01$;

COMMIT;

\echo ''
\echo '=== DUR-01 STAGE 2 COMMITTED ==='

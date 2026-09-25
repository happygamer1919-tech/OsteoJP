-- ============================================================================
-- STAFF-10 V2, STAGE 1 of 3: THE READ. IT WRITES NOTHING.
--
-- Card STAFF-10 (a ruled Tier C item). One held production data op that
-- replaces PR #1433 and the original STAFF-10 stage 2. Owner rulings of
-- 2026-09-24, paraphrased (docs/data-op-staff-10-v2.md has the full question
-- block):
--   (a) JP(cb)'s Linda-a-Velha appointments from before the start of the Lisbon
--       run day are re-attributed to JP(lv);
--   (b) a past NESA twin pair whose NESA row is not installed at the booking
--       clinic has that row re-attributed to the NESA installed there;
--   (c) a future NESA twin pair keeps the person row, which takes the NESA as
--       practitioner_2, and the NESA row is cancelled (option a);
--   (d) every other past twin is listed here and never changed;
--   (e) the original schedule-row actions carry forward, defects fixed.
--
-- EVERY SET IS DERIVED FROM THE DATABASE AT RUN TIME, by the block between the
-- SETS BEGIN and SETS END markers, which stage 2 carries byte for byte. No
-- count and no id measured on production appears in this file.
--
-- ONE STATEMENT COMPUTES EVERYTHING. The sets are evaluated once, packaged into
-- one JSON value held in the psql variable s10v2_json by \gset (a client-side
-- variable, not a write), and every section below prints from that value. So
-- every section describes the same instant.
--
-- Run (stage 1 of docs/data-op-staff-10-v2.md):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -f scripts/data/staff-10-v2-1-read.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo ''
\echo '=== STAFF-10 V2, STAGE 1. READ ONLY. ==='

SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation;

WITH
-- >>> STAFF-10 V2 SETS BEGIN. These lines are byte-identical in stage 1 and
-- stage 2 (scripts/staff-10-v2-data-op.test.mjs asserts it), so the set stage 1
-- prints and the set stage 2 writes are computed by the same text. now() is the
-- transaction's start time in both, so every cut below is fixed per stage.
k AS (
  SELECT '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid AS jp_cb,
         '0c1a0000-0000-4000-8000-000000000001'::uuid AS jp_lv,
         'de000002-0000-0000-0000-000000000001'::uuid AS lv_loc,
         'de000002-0000-0000-0000-000000000002'::uuid AS cb_loc,
         '0c1a0000-0000-4000-8000-000000000002'::uuid AS nesa_cb,
         'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a'::uuid AS nesa_lv,
         (SELECT u.tenant_id FROM public.users u
           WHERE u.id = '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'::uuid) AS tenant,
         now() AS t_now,
         now() + interval '2 hours' AS sitting_end,
         (now() AT TIME ZONE 'Europe/Lisbon')::date AS today,
         ((now() AT TIME ZONE 'Europe/Lisbon')::date)::timestamp AT TIME ZONE 'Europe/Lisbon' AS day0,
         (DATE '2026-09-30')::timestamp AT TIME ZONE 'Europe/Lisbon' AS blk_from,
         (DATE '2026-10-01')::timestamp AT TIME ZONE 'Europe/Lisbon' AS blk_to,
         (DATE '2026-09-23')::timestamp AT TIME ZONE 'Europe/Lisbon' AS ctl_blk_from,
         (DATE '2026-10-08')::timestamp AT TIME ZONE 'Europe/Lisbon' AS ctl_blk_to
),
-- The two JP rows, as found, with the three user flags the Linda-a-Velha roster
-- reads (apps/api/lib/appointments/store.ts): active, bookable, not shared.
jp AS (
  SELECT u.id, u.tenant_id, u.is_active, u.is_bookable, u.is_shared_resource
    FROM public.users u, k
   WHERE u.id IN (k.jp_cb, k.jp_lv)
),
-- Every shared resource in the tenant, active or not, and where each ACTIVE one
-- is installed. A clinic's NESA is DERIVED here, never assumed: ruling (b)
-- targets the one NESA installed at the booking clinic, and R11 refuses a
-- clinic with none or with more than one.
res AS (
  SELECT u.id, u.is_active
    FROM public.users u, k
   WHERE u.tenant_id = k.tenant AND u.is_shared_resource IS TRUE
),
inst AS (
  SELECT sl.location_id, sl.user_id
    FROM public.staff_locations sl
    JOIN res r ON r.id = sl.user_id AND r.is_active IS TRUE
),
inst_n AS (
  SELECT i.location_id, count(*)::int AS n,
         (array_agg(i.user_id ORDER BY i.user_id))[1] AS first_one
    FROM inst i
   GROUP BY i.location_id
),
-- ---------------------------------------------------------------------------
-- THE SCHEDULE ROWS. Every ACTIVE JP(cb) row at Linda-a-Velha, classified.
-- is_dated has ONE definition, NULL-safe: both bounds present and equal. It is
-- never NULL, so no row can fall out of a class because a bound is NULL.
-- ---------------------------------------------------------------------------
cb_lv AS (
  SELECT av.id, av.tenant_id, av.weekday, av.start_time, av.end_time,
         av.valid_from, av.valid_until,
         (av.valid_from IS NOT NULL AND av.valid_until IS NOT NULL AND av.valid_from = av.valid_until) AS is_dated
    FROM public.availability_templates av, k
   WHERE av.user_id = k.jp_cb AND av.location_id = k.lv_loc AND av.is_active IS TRUE
),
cls0 AS (
  SELECT c.*,
         EXISTS (SELECT 1 FROM public.availability_templates o, k k2
                  WHERE o.user_id = k2.jp_lv AND o.location_id = k2.lv_loc AND o.is_active IS TRUE
                    AND o.weekday = c.weekday AND o.start_time = c.start_time AND o.end_time = c.end_time
                    AND o.valid_from IS NOT DISTINCT FROM c.valid_from
                    AND o.valid_until IS NOT DISTINCT FROM c.valid_until) AS lv_same,
         (c.valid_until IS NOT NULL AND c.valid_until < k.today) AS ended,
         (c.is_dated AND extract(dow FROM c.valid_from)::int = 6) AS real_saturday,
         (c.is_dated AND extract(dow FROM c.valid_from)::int <> c.weekday) AS phantom
    FROM cb_lv c, k
),
-- Five classes plus UNCLASSIFIED, each written out as its own predicate and
-- mutually exclusive by construction; R09 proves every row sets exactly one.
cls1 AS (
  SELECT c.*,
         (c.is_dated AND c.lv_same) AS f_cov,
         (NOT (c.is_dated AND c.lv_same) AND c.ended) AS f_past,
         (NOT (c.is_dated AND c.lv_same) AND NOT c.ended AND c.is_dated
            AND c.weekday = 6 AND extract(dow FROM c.valid_from)::int = 6) AS f_move,
         (NOT (c.is_dated AND c.lv_same) AND NOT c.ended AND c.phantom) AS f_phan,
         (NOT (c.is_dated AND c.lv_same) AND NOT c.ended AND NOT c.is_dated AND c.weekday = 6) AS f_win
    FROM cls0 c
),
cls AS (
  SELECT c.*,
         NOT (c.f_cov OR c.f_past OR c.f_move OR c.f_phan OR c.f_win) AS f_unc,
         CASE WHEN c.f_cov  THEN 'retire_covered'
              WHEN c.f_past THEN 'retire_past'
              WHEN c.f_move THEN 'move_saturday'
              WHEN c.f_phan THEN 'retire_phantom'
              WHEN c.f_win  THEN 'retire_sat_window'
              ELSE 'UNCLASSIFIED' END AS label
    FROM cls1 c
),
-- ---------------------------------------------------------------------------
-- THE 30 SEPTEMBER BLOCK: the OVERLAP form, so a block that starts and ends on
-- 30 September is caught. blk_win is its positive control: JP(cb)'s blocks from
-- 23 September to 7 October, printed so a zero can be read.
-- ---------------------------------------------------------------------------
blk AS (
  SELECT t.id
    FROM public.time_off t, k
   WHERE t.user_id = k.jp_cb AND t.starts_at < k.blk_to AND t.ends_at > k.blk_from
),
blk_win AS (
  SELECT t.id
    FROM public.time_off t, k
   WHERE t.user_id = k.jp_cb AND t.starts_at < k.ctl_blk_to AND t.ends_at > k.ctl_blk_from
),
-- ---------------------------------------------------------------------------
-- RULING (a), SET H: JP(cb)'s Linda-a-Velha appointments that start before the
-- start of the Lisbon run day, any status. Future ones stay on JP(cb).
-- ---------------------------------------------------------------------------
h AS (
  SELECT a.id, a.status, a.practitioner_2_id, a.starts_at, a.ends_at
    FROM public.appointments a, k
   WHERE a.tenant_id = k.tenant AND a.practitioner_id = k.jp_cb AND a.location_id = k.lv_loc
     AND a.starts_at < k.day0
),
-- The unconfirmed pedido, INLINE. public.is_unconfirmed_pedido filters on
-- jwt_tenant_id(), which is NULL in a psql session, so calling it here would
-- answer false for every row. This is its body (0067) with the tenant taken from k.
ped AS (
  SELECT a.id
    FROM public.appointments a, k
   WHERE a.tenant_id = k.tenant AND a.status = 'scheduled'
     AND (a.origin = 'patient_portal'
          OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                      WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request'))
),
-- ---------------------------------------------------------------------------
-- THE NESA TWINS: one session held on a shared-resource row (n) and on a person
-- row (p), same tenant, same patient, same start, same service (NULL-safe).
-- A pair is PAST when it starts before the start of the Lisbon run day.
-- n_home: the NESA row is installed at the clinic it is booked at.
-- ---------------------------------------------------------------------------
tw AS (
  SELECT n.id AS n_id, p.id AS p_id,
         n.practitioner_id AS n_user, p.practitioner_id AS p_user,
         n.location_id AS n_loc, p.location_id AS p_loc,
         n.starts_at, n.ends_at AS n_ends, p.starts_at AS p_starts, p.ends_at AS p_ends,
         n.status AS n_status, p.status AS p_status,
         p.practitioner_2_id AS p_t2, n.pack_instance_id AS n_pack,
         (n.starts_at < k.day0) AS is_past,
         (n.status NOT IN ('cancelled', 'no_show') AND p.status NOT IN ('cancelled', 'no_show')) AS both_live,
         EXISTS (SELECT 1 FROM public.staff_locations sl
                  WHERE sl.user_id = n.practitioner_id AND sl.location_id = n.location_id) AS n_home
    FROM k
    JOIN public.appointments n ON n.tenant_id = k.tenant
    JOIN public.users un ON un.id = n.practitioner_id AND un.is_shared_resource IS TRUE
    JOIN public.appointments p
      ON p.tenant_id = n.tenant_id AND p.patient_id = n.patient_id
     AND p.starts_at = n.starts_at AND p.id <> n.id
     AND p.service_id IS NOT DISTINCT FROM n.service_id
    JOIN public.users up ON up.id = p.practitioner_id AND up.is_shared_resource IS NOT TRUE
),
-- RULING (b), SET X: a past pair whose NESA row is not installed at the booking
-- clinic. The NESA row is re-attributed to the one NESA installed there.
-- QUESTION Q3's DEFAULT: a past pair whose person row is in set H (JP(cb) at
-- Linda-a-Velha) has its person row moved by ruling (a) and its NESA row left
-- alone and listed, installed at its clinic or not. So a NESA row that sits in
-- ANY past pair whose person row is in H is not in X; it lands in P and in
-- tw_keep instead.
x AS (
  SELECT DISTINCT tw.n_id AS id, tw.n_user AS from_user, tw.n_loc AS loc,
         coalesce(i.n, 0) AS installed_here,
         CASE WHEN i.n = 1 THEN i.first_one END AS to_user
    FROM tw
    LEFT JOIN inst_n i ON i.location_id = tw.n_loc
   WHERE tw.is_past AND NOT tw.n_home
     AND NOT EXISTS (SELECT 1 FROM tw t2
                      WHERE t2.is_past AND t2.n_id = tw.n_id
                        AND t2.p_id IN (SELECT h.id FROM h))
),
-- RULING (c), SET F: a future pair with both rows live. Option a: the person row
-- keeps and takes the NESA as practitioner_2; the NESA row is cancelled.
f AS (
  SELECT tw.*, coalesce(i.n, 0) AS installed_here,
         (tw.p_id IN (SELECT ped.id FROM ped)) AS p_pedido,
         (tw.n_id IN (SELECT ped.id FROM ped)) AS n_pedido,
         EXISTS (SELECT 1 FROM public.clinical_records cr WHERE cr.appointment_id = tw.n_id) AS n_has_record,
         EXISTS (SELECT 1 FROM public.invoices iv WHERE iv.appointment_id = tw.n_id) AS n_has_invoice,
         EXISTS (SELECT 1 FROM res r JOIN public.staff_locations sl ON sl.user_id = r.id
                  WHERE r.id = tw.n_user AND r.is_active IS TRUE AND sl.location_id = tw.p_loc) AS n_ok_at_booking
    FROM tw
    LEFT JOIN inst_n i ON i.location_id = tw.p_loc
   WHERE NOT tw.is_past AND tw.both_live
),
-- RULING (d), SET P: every other past pair, that is every past pair whose NESA
-- row ruling (b) does not move. Listed, never changed by ruling (b); a person
-- row in H is still moved by ruling (a) (Q3).
pp AS (
  SELECT tw.* FROM tw WHERE tw.is_past AND tw.n_id NOT IN (SELECT x.id FROM x)
),
-- The rows of every past pair that no write touches: compared by md5 after.
tw_keep AS (
  SELECT DISTINCT s.id
    FROM (SELECT tw.n_id AS id FROM tw WHERE tw.is_past
          UNION SELECT tw.p_id FROM tw WHERE tw.is_past) s
   WHERE s.id NOT IN (SELECT h.id FROM h) AND s.id NOT IN (SELECT x.id FROM x)
),
-- ---------------------------------------------------------------------------
-- THE CARRIES: per action a count and an md5 over its ordered keys, plus the
-- Lisbon run day. Stage 2 recomputes this CTE and refuses on any difference.
-- ---------------------------------------------------------------------------
tgt AS (
  SELECT 'rcov' AS code, c.id::text AS key FROM cls c WHERE c.f_cov
  UNION ALL SELECT 'rpast', c.id::text FROM cls c WHERE c.f_past
  UNION ALL SELECT 'msat', c.id::text FROM cls c WHERE c.f_move
  UNION ALL SELECT 'rphan', c.id::text FROM cls c WHERE c.f_phan
  UNION ALL SELECT 'rwin', c.id::text FROM cls c WHERE c.f_win
  UNION ALL SELECT 'dblk', b.id::text FROM blk b
  UNION ALL SELECT 'hjp', h.id::text FROM h
  UNION ALL SELECT 'xnesa', x.id::text || '>' || coalesce(x.to_user::text, 'none') FROM x
  UNION ALL SELECT 'ft2', f.p_id::text || '>' || f.n_user::text FROM f
  UNION ALL SELECT 'fcan', f.n_id::text FROM f
),
codes AS (
  SELECT * FROM (VALUES (1, 'rcov'), (2, 'rpast'), (3, 'msat'), (4, 'rphan'), (5, 'rwin'),
                        (6, 'dblk'), (7, 'hjp'), (8, 'xnesa'), (9, 'ft2'), (10, 'fcan')) v(ord, code)
),
car AS (
  SELECT 0 AS ord, 's10v2_run_day' AS carry, (SELECT k.today::text FROM k) AS value
  UNION ALL
  SELECT c.ord * 2 - 1, 's10v2_count_' || c.code,
         (SELECT count(*)::text FROM tgt t WHERE t.code = c.code)
    FROM codes c
  UNION ALL
  SELECT c.ord * 2, 's10v2_digest_' || c.code,
         (SELECT coalesce(md5(string_agg(t.key, ',' ORDER BY t.key)), 'empty') FROM tgt t WHERE t.code = c.code)
    FROM codes c
),
-- ---------------------------------------------------------------------------
-- THE CONFIRMED-OVERLAP RULE, appointments_no_double_confirmed (0061): EXCLUDE
-- on (practitioner_id, tstzrange(starts_at, ends_at)) WHERE status = confirmed,
-- with no tenant, clinic or date in it. Each set below is every confirmed row a
-- target would hold after its re-attribution. R14 and R15 take as control the
-- confirmed rows that MOVE: with none, no collision is possible, so a 0 there
-- prints VACUOUS rather than OK.
-- ---------------------------------------------------------------------------
h_after AS (
  SELECT a.id, a.starts_at, a.ends_at, (a.id IN (SELECT h.id FROM h)) AS moving
    FROM public.appointments a, k
   WHERE a.status = 'confirmed' AND (a.practitioner_id = k.jp_lv OR a.id IN (SELECT h.id FROM h))
),
x_after AS (
  SELECT coalesce(xx.to_user, a.practitioner_id) AS holder, a.id, a.starts_at, a.ends_at,
         (xx.id IS NOT NULL) AS moving
    FROM public.appointments a
    LEFT JOIN x xx ON xx.id = a.id
   WHERE a.status = 'confirmed'
     AND (xx.id IS NOT NULL
          OR a.practitioner_id IN (SELECT x.to_user FROM x WHERE x.to_user IS NOT NULL))
),
-- ---------------------------------------------------------------------------
-- THE REFUSALS. n must be 0. control is the population the predicate read, so
-- a 0 that could not have seen anything prints VACUOUS rather than OK.
-- ---------------------------------------------------------------------------
ref AS (
  SELECT 'R01' AS code, 'both JP rows exist, in one tenant' AS label,
         ((2 - (SELECT count(*) FROM jp)) + (SELECT count(DISTINCT jp.tenant_id) FROM jp) - 1)::int AS n,
         (SELECT count(*) FROM jp)::int AS control
  UNION ALL
  SELECT 'R02', 'JP(lv) is inactive, not bookable or a shared resource, so the Linda-a-Velha roster would not list it',
         (SELECT count(*) FROM jp, k
           WHERE jp.id = k.jp_lv
             AND (jp.is_active IS NOT TRUE OR jp.is_bookable IS NOT TRUE OR jp.is_shared_resource IS NOT FALSE))::int,
         (SELECT count(*) FROM jp, k WHERE jp.id = k.jp_lv)::int
  UNION ALL
  SELECT 'R03', 'JP(cb) is not installed at Castelo Branco',
         GREATEST(1 - (SELECT count(*) FROM public.staff_locations sl, k
                        WHERE sl.user_id = k.jp_cb AND sl.location_id = k.cb_loc), 0)::int,
         (SELECT count(*) FROM public.staff_locations sl, k WHERE sl.user_id = k.jp_cb)::int
  UNION ALL
  SELECT 'R04', 'JP(lv) is not installed at Linda-a-Velha',
         GREATEST(1 - (SELECT count(*) FROM public.staff_locations sl, k
                        WHERE sl.user_id = k.jp_lv AND sl.location_id = k.lv_loc), 0)::int,
         (SELECT count(*) FROM public.staff_locations sl, k WHERE sl.user_id = k.jp_lv)::int
  UNION ALL
  SELECT 'R05', 'a Saturday to MOVE already exists identically on JP(lv), active or not (the unique constraint)',
         (SELECT count(*) FROM cls c, k
           WHERE c.f_move
             AND EXISTS (SELECT 1 FROM public.availability_templates o
                          WHERE o.tenant_id = c.tenant_id AND o.user_id = k.jp_lv
                            AND o.location_id = k.lv_loc AND o.weekday = c.weekday
                            AND o.start_time = c.start_time AND o.end_time = c.end_time
                            AND o.valid_from IS NOT DISTINCT FROM c.valid_from
                            AND o.valid_until IS NOT DISTINCT FROM c.valid_until))::int,
         (SELECT count(*) FROM cls c WHERE c.f_move)::int
  UNION ALL
  SELECT 'R06', 'more than one JP(cb) block overlaps 30 September',
         GREATEST((SELECT count(*) FROM blk) - 1, 0)::int,
         (SELECT count(*) FROM blk_win)::int
  UNION ALL
  SELECT 'R07', 'the original STAFF-10 write has already run (its audit row)',
         (SELECT count(*) FROM public.audit_log al WHERE al.action = 'staff.jp_lv_schedule_rows.retire')::int,
         (SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant)::int
  UNION ALL
  SELECT 'R08', 'this v2 write has already run (its audit row)',
         (SELECT count(*) FROM public.audit_log al WHERE al.action = 'staff.staff10_v2.apply')::int,
         (SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant)::int
  UNION ALL
  SELECT 'R09', 'an active JP(cb) Linda-a-Velha row is UNCLASSIFIED, or sits in other than exactly one class',
         (SELECT count(*) FROM cls c
           WHERE c.f_unc
              OR (c.f_cov::int + c.f_past::int + c.f_move::int + c.f_phan::int + c.f_win::int + c.f_unc::int) <> 1)::int,
         (SELECT count(*) FROM cls)::int
  UNION ALL
  SELECT 'R10', 'the shared resources are not exactly the two NESA rows, both active',
         ((SELECT count(*) FROM res r, k WHERE r.id NOT IN (k.nesa_cb, k.nesa_lv) OR r.is_active IS NOT TRUE)
          + 2 - (SELECT count(*) FROM res r, k WHERE r.id IN (k.nesa_cb, k.nesa_lv)))::int,
         (SELECT count(*) FROM res)::int
  UNION ALL
  SELECT 'R11', 'a booking clinic of a past or future pair has no installed NESA, or more than one',
         ((SELECT count(*) FROM x WHERE x.installed_here <> 1)
          + (SELECT count(*) FROM f WHERE f.installed_here <> 1))::int,
         ((SELECT count(*) FROM x) + (SELECT count(*) FROM f))::int
  UNION ALL
  SELECT 'R12', 'an appointment at Linda-a-Velha names JP(cb) as practitioner_2, which no ruling covers',
         (SELECT count(*) FROM public.appointments a, k
           WHERE a.tenant_id = k.tenant AND a.location_id = k.lv_loc AND a.practitioner_2_id = k.jp_cb)::int,
         (SELECT count(*) FROM public.appointments a, k
           WHERE a.tenant_id = k.tenant AND a.location_id = k.lv_loc AND a.practitioner_2_id IS NOT NULL)::int
  UNION ALL
  SELECT 'R13', 'a ruling (a) row already names JP(lv) as practitioner_2, so it would hold JP(lv) in both slots',
         (SELECT count(*) FROM h, k WHERE h.practitioner_2_id = k.jp_lv)::int,
         (SELECT count(*) FROM h)::int
  UNION ALL
  SELECT 'R14', 'a ruling (a) re-attribution would put two overlapping confirmed rows on JP(lv)',
         (SELECT count(*) FROM h_after a1 JOIN h_after a2
             ON a1.id < a2.id AND (a1.moving OR a2.moving)
            AND tstzrange(a1.starts_at, a1.ends_at) && tstzrange(a2.starts_at, a2.ends_at))::int,
         (SELECT count(*) FROM h_after WHERE h_after.moving)::int
  UNION ALL
  SELECT 'R15', 'a ruling (b) re-attribution would put two overlapping confirmed rows on one NESA row',
         (SELECT count(*) FROM x_after a1 JOIN x_after a2
             ON a1.id < a2.id AND a1.holder = a2.holder AND (a1.moving OR a2.moving)
            AND tstzrange(a1.starts_at, a1.ends_at) && tstzrange(a2.starts_at, a2.ends_at))::int,
         (SELECT count(*) FROM x_after WHERE x_after.moving)::int
  UNION ALL
  SELECT 'R16', 'a future pair: the person row already has a practitioner_2',
         (SELECT count(*) FROM f WHERE f.p_t2 IS NOT NULL)::int, (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R17', 'a future pair: the person window does not cover the NESA window',
         (SELECT count(*) FROM f WHERE NOT (f.p_starts <= f.starts_at AND f.p_ends >= f.n_ends))::int,
         (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R18', 'a future pair: the NESA row is not shared, active and installed at the booking clinic, or the two rows sit at two clinics',
         (SELECT count(*) FROM f WHERE NOT f.n_ok_at_booking OR f.n_loc <> f.p_loc)::int,
         (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R19', 'a future pair: the person row is an unconfirmed pedido, which holds no hour',
         (SELECT count(*) FROM f WHERE f.p_pedido)::int, (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R20', 'a future pair: the NESA row has a clinical record, an invoice or a pack session',
         (SELECT count(*) FROM f WHERE f.n_has_record OR f.n_has_invoice OR f.n_pack IS NOT NULL)::int,
         (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R21', 'a future pair starts within the sitting (before now plus two hours)',
         (SELECT count(*) FROM f, k WHERE f.starts_at < k.sitting_end)::int, (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R22', 'a future row sits in more than one live pair, so which row keeps is ambiguous',
         (SELECT count(*) FROM f
           WHERE (SELECT count(*) FROM f f2 WHERE f2.n_id = f.n_id) > 1
              OR (SELECT count(*) FROM f f2 WHERE f2.p_id = f.p_id) > 1)::int,
         (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R23', 'a future pair: the NESA row is an unconfirmed pedido, so it holds no machine hour today',
         (SELECT count(*) FROM f WHERE f.n_pedido)::int, (SELECT count(*) FROM f)::int
  UNION ALL
  SELECT 'R24', 'there is nothing to do: every action set is empty',
         (CASE WHEN (SELECT count(*) FROM tgt) = 0 THEN 1 ELSE 0 END)::int,
         (SELECT count(*) FROM tgt)::int
  UNION ALL
  -- Two of the untouched sets stage 3 compares by md5, JP(cb)'s Castelo Branco
  -- rows: empty, the comparison would prove nothing, so refuse before writing.
  SELECT 'R25', 'an untouched comparison set is empty: JP(cb) has no past Castelo Branco appointment or no Castelo Branco schedule row',
         ((CASE WHEN (SELECT count(*) FROM public.appointments a, k
                       WHERE a.practitioner_id = k.jp_cb AND a.location_id = k.cb_loc AND a.starts_at < k.day0) = 0
                THEN 1 ELSE 0 END)
          + (CASE WHEN (SELECT count(*) FROM public.availability_templates av, k
                         WHERE av.user_id = k.jp_cb AND av.location_id = k.cb_loc) = 0
                  THEN 1 ELSE 0 END))::int,
         (SELECT count(*) FROM public.appointments a, k WHERE a.practitioner_id = k.jp_cb)::int
  UNION ALL
  -- The ruled block is a 30 September block. One that also covers another day
  -- (a multi-day absence) is not it, and deleting it would erase real absence.
  SELECT 'R26', 'the block overlapping 30 September also covers another day, so it is not the 30 September block',
         (SELECT count(*) FROM blk JOIN public.time_off t ON t.id = blk.id, k
           WHERE t.starts_at < k.blk_from OR t.ends_at > k.blk_to)::int,
         (SELECT count(*) FROM blk)::int
  UNION ALL
  -- The other two untouched sets stage 3 compares by md5: the clinical records
  -- on the rows the op writes, and the past twin rows it leaves alone. Empty,
  -- either comparison proves nothing, so the op refuses before writing.
  SELECT 'R27', 'an untouched comparison set is empty: no row the op writes carries a clinical record, or no past twin row is left untouched',
         ((CASE WHEN (SELECT count(*) FROM public.clinical_records cr
                       WHERE cr.appointment_id IN (SELECT h.id FROM h UNION SELECT x.id FROM x
                                                   UNION SELECT f.p_id FROM f UNION SELECT f.n_id FROM f)) = 0
                THEN 1 ELSE 0 END)
          + (CASE WHEN (SELECT count(*) FROM tw_keep) = 0 THEN 1 ELSE 0 END))::int,
         ((SELECT count(*) FROM h) + (SELECT count(*) FROM tw WHERE tw.is_past))::int
  UNION ALL
  -- Stage 3 checks the Linda-a-Velha roster on the next real Saturday JP(lv)
  -- holds as a dated row. After the write those are JP(lv)'s own and the moved
  -- ones; with neither, that check could not run, so the op refuses first.
  SELECT 'R28', 'the roster check would have no real Saturday: JP(lv) holds no dated Linda-a-Velha Saturday from today and none moves',
         (CASE WHEN (SELECT count(*) FROM public.availability_templates o, k
                      WHERE o.user_id = k.jp_lv AND o.location_id = k.lv_loc AND o.is_active IS TRUE
                        AND o.valid_from IS NOT NULL AND o.valid_until IS NOT NULL AND o.valid_from = o.valid_until
                        AND o.valid_from >= k.today AND extract(dow FROM o.valid_from)::int = 6)
                   + (SELECT count(*) FROM cls c WHERE c.f_move) = 0
               THEN 1 ELSE 0 END)::int,
         (SELECT count(*) FROM public.availability_templates o, k
           WHERE o.user_id = k.jp_lv AND o.location_id = k.lv_loc AND o.is_active IS TRUE)::int
  UNION ALL
  -- Ruling (b) moves a past NESA row to the NESA installed at the booking clinic.
  -- With the two rows of its pair at two clinics, which clinic booked the session
  -- is a guess, and no ruling makes it, so the op refuses, as R18 does for a
  -- future pair. The control is every past pair ruling (b) would act on.
  SELECT 'R29', 'a past pair ruling (b) would move has its two rows at two clinics, so its booking clinic is ambiguous',
         (SELECT count(*) FROM tw WHERE tw.is_past AND tw.n_id IN (SELECT x.id FROM x)
             AND tw.p_loc IS DISTINCT FROM tw.n_loc)::int,
         (SELECT count(*) FROM tw WHERE tw.is_past AND tw.n_id IN (SELECT x.id FROM x))::int
  UNION ALL
  -- A trigger the system did not create, on a table stage 2 writes, would run
  -- code the write whitelist does not name, inside the committed transaction and
  -- with no ROW_COUNT check on what it does. Main has none; production has run
  -- ahead of main before, so the op reads the catalog and refuses rather than
  -- trusting that. The control is every trigger on those tables, the constraint
  -- triggers the system creates for each foreign key included, so a 0 that read
  -- nothing prints VACUOUS.
  SELECT 'R30', 'a trigger the system did not create sits on a table stage 2 writes, so a write would run code outside the whitelist',
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.availability_templates'::regclass,
                               'public.time_off'::regclass, 'public.audit_log'::regclass)
             AND NOT t.tgisinternal)::int,
         (SELECT count(*) FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.availability_templates'::regclass,
                               'public.time_off'::regclass, 'public.audit_log'::regclass))::int
)
-- <<< STAFF-10 V2 SETS END
SELECT jsonb_build_object(
  'meta', (SELECT jsonb_build_object(
             'run_day', k.today::text,
             'day0_lisbon', (k.day0 AT TIME ZONE 'Europe/Lisbon')::text,
             'now_lisbon', (k.t_now AT TIME ZONE 'Europe/Lisbon')::text,
             'sitting_end_lisbon', (k.sitting_end AT TIME ZONE 'Europe/Lisbon')::text,
             'tenant', k.tenant::text) FROM k),
  'staff', (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'row', CASE WHEN u.id = k.jp_cb THEN 'JP(cb)' WHEN u.id = k.jp_lv THEN 'JP(lv)'
                          WHEN u.id = k.nesa_cb THEN 'NESA(cb)' WHEN u.id = k.nesa_lv THEN 'NESA(lv)'
                          ELSE 'other shared resource' END,
              'id', u.id::text,
              'active', u.is_active::text,
              'bookable', u.is_bookable::text,
              'shared', coalesce(u.is_shared_resource::text, 'null'),
              'installed_at', coalesce((SELECT string_agg(l.name, ', ' ORDER BY l.name)
                                          FROM public.staff_locations sl
                                          JOIN public.locations l ON l.id = sl.location_id
                                         WHERE sl.user_id = u.id), '(nowhere)'))
              ORDER BY u.id), '[]'::jsonb)
              FROM public.users u, k
             WHERE u.id IN (k.jp_cb, k.jp_lv, k.nesa_cb, k.nesa_lv)
                OR (u.tenant_id = k.tenant AND u.is_shared_resource IS TRUE)),
  'nesa_split_audit', (SELECT count(*) FROM public.audit_log al WHERE al.action = 'staff.nesa_split.reassign'),
  'classes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'class', c.label,
                'id', c.id::text,
                'weekday', c.weekday,
                'date_dow', CASE WHEN c.valid_from IS NULL THEN '(open)' ELSE extract(dow FROM c.valid_from)::int::text END,
                'hours', to_char(c.start_time, 'HH24:MI') || '-' || to_char(c.end_time, 'HH24:MI'),
                'valid_from', coalesce(c.valid_from::text, '(open)'),
                'valid_until', coalesce(c.valid_until::text, '(open)'),
                'jp_lv_same_row', c.lv_same::text,
                'jp_lv_sat_cover_from_start',
                  CASE WHEN c.f_win THEN (SELECT count(*) FROM public.availability_templates o, k k2
                                           WHERE o.user_id = k2.jp_lv AND o.location_id = k2.lv_loc
                                             AND o.is_active IS TRUE AND o.weekday = 6
                                             AND (o.valid_until IS NULL
                                                  OR o.valid_until >= GREATEST(coalesce(c.valid_from, k2.today), k2.today)))::text
                       ELSE '' END)
                ORDER BY c.label, c.valid_from NULLS FIRST, c.weekday, c.start_time, c.id), '[]'::jsonb)
                FROM cls c),
  'partition', (SELECT jsonb_build_object(
                  'active_rows', count(*),
                  'retire_covered', count(*) FILTER (WHERE c.f_cov),
                  'retire_past', count(*) FILTER (WHERE c.f_past),
                  'move_saturday', count(*) FILTER (WHERE c.f_move),
                  'retire_phantom', count(*) FILTER (WHERE c.f_phan),
                  'retire_sat_window', count(*) FILTER (WHERE c.f_win),
                  'unclassified', count(*) FILTER (WHERE c.f_unc),
                  'exactly_one_class', count(*) FILTER (WHERE (c.f_cov::int + c.f_past::int + c.f_move::int
                                                               + c.f_phan::int + c.f_win::int + c.f_unc::int) = 1),
                  'label_agrees', count(*) FILTER (WHERE (c.label = 'retire_covered') = c.f_cov
                                                     AND (c.label = 'retire_past') = c.f_past
                                                     AND (c.label = 'move_saturday') = c.f_move
                                                     AND (c.label = 'retire_phantom') = c.f_phan
                                                     AND (c.label = 'retire_sat_window') = c.f_win
                                                     AND (c.label = 'UNCLASSIFIED') = c.f_unc))
                  FROM cls c),
  'blocks', (SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id::text,
               'starts_lisbon', (t.starts_at AT TIME ZONE 'Europe/Lisbon')::text,
               'ends_lisbon', (t.ends_at AT TIME ZONE 'Europe/Lisbon')::text,
               'reason', t.reason::text,
               'deleted_by_stage_2', (t.id IN (SELECT blk.id FROM blk))::text)
               ORDER BY t.starts_at, t.id), '[]'::jsonb)
               FROM public.time_off t WHERE t.id IN (SELECT blk_win.id FROM blk_win)),
  'carries', (SELECT jsonb_agg(jsonb_build_object('ord', c.ord, 'carry', c.carry, 'value', c.value) ORDER BY c.ord)
                FROM car c),
  'refusals', (SELECT jsonb_agg(jsonb_build_object(
                 'code', r.code, 'label', r.label, 'n', r.n, 'control', r.control,
                 'verdict', CASE WHEN r.n > 0 THEN 'REFUSE' WHEN r.control = 0 THEN 'VACUOUS' ELSE 'OK' END)
                 ORDER BY r.code) FROM ref r),
  'h_summary', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'status', s.status, 'rows', s.n, 'first_lisbon', s.first_start, 'last_lisbon', s.last_start,
                  'with_clinical_record', s.with_record)
                  ORDER BY s.status), '[]'::jsonb)
                  FROM (SELECT h.status::text AS status, count(*) AS n,
                               (min(h.starts_at) AT TIME ZONE 'Europe/Lisbon')::text AS first_start,
                               (max(h.starts_at) AT TIME ZONE 'Europe/Lisbon')::text AS last_start,
                               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.clinical_records cr
                                                              WHERE cr.appointment_id = h.id)) AS with_record
                          FROM h GROUP BY h.status) s),
  'h_list_a', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'cb_row_appointment', h.id::text, 'cb_row_status', h.status::text,
                 'lv_row_appointment', la.id::text, 'lv_row_status', la.status::text,
                 'starts_lisbon', (h.starts_at AT TIME ZONE 'Europe/Lisbon')::text)
                 ORDER BY h.starts_at, h.id), '[]'::jsonb)
                 FROM h
                 JOIN public.appointments a ON a.id = h.id
                 JOIN k ON TRUE
                 JOIN public.appointments la
                   ON la.practitioner_id = k.jp_lv AND la.patient_id = a.patient_id AND la.starts_at = a.starts_at),
  'x', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'nesa_row', tw.n_id::text, 'person_row', tw.p_id::text,
          'starts_lisbon', (tw.starts_at AT TIME ZONE 'Europe/Lisbon')::text,
          'booking_clinic', l.name, 'person_clinic', lp.name,
          'two_clinics', (tw.p_loc IS DISTINCT FROM tw.n_loc)::text,
          'from_nesa', x.from_user::text, 'to_nesa', coalesce(x.to_user::text, '(none)'),
          'nesa_status', tw.n_status::text, 'person_status', tw.p_status::text)
          ORDER BY tw.starts_at, tw.n_id, tw.p_id), '[]'::jsonb)
          FROM tw JOIN x ON x.id = tw.n_id JOIN public.locations l ON l.id = tw.n_loc
          JOIN public.locations lp ON lp.id = tw.p_loc
         WHERE tw.is_past),
  'f', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'person_row', f.p_id::text, 'nesa_row', f.n_id::text, 'nesa_user', f.n_user::text,
          'starts_lisbon', (f.starts_at AT TIME ZONE 'Europe/Lisbon')::text,
          'nesa_ends_lisbon', (f.n_ends AT TIME ZONE 'Europe/Lisbon')::text,
          'person_ends_lisbon', (f.p_ends AT TIME ZONE 'Europe/Lisbon')::text,
          'booking_clinic', l.name,
          'person_status', f.p_status::text, 'nesa_status', f.n_status::text,
          'person_t2', coalesce(f.p_t2::text, '(none)'),
          'machine_hour_held_now_by_nesa_row', (NOT f.n_pedido)::text,
          'person_pedido', f.p_pedido::text)
          ORDER BY f.starts_at, f.p_id), '[]'::jsonb)
          FROM f JOIN public.locations l ON l.id = f.p_loc),
  'p', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'nesa_row', pp.n_id::text, 'person_row', pp.p_id::text,
          'starts_lisbon', (pp.starts_at AT TIME ZONE 'Europe/Lisbon')::text,
          'booking_clinic', l.name,
          'nesa_installed_there', pp.n_home::text,
          'nesa_status', pp.n_status::text, 'person_status', pp.p_status::text,
          'person_row_in_h', (pp.p_id IN (SELECT h.id FROM h))::text)
          ORDER BY pp.starts_at, pp.n_id, pp.p_id), '[]'::jsonb)
          FROM pp JOIN public.locations l ON l.id = pp.n_loc),
  'f_other', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'nesa_row', tw.n_id::text, 'person_row', tw.p_id::text,
                'starts_lisbon', (tw.starts_at AT TIME ZONE 'Europe/Lisbon')::text,
                'nesa_status', tw.n_status::text, 'person_status', tw.p_status::text)
                ORDER BY tw.starts_at, tw.n_id), '[]'::jsonb)
                FROM tw WHERE NOT tw.is_past AND NOT tw.both_live),
  'near_miss', (SELECT count(*) FROM k
                  JOIN public.appointments n ON n.tenant_id = k.tenant
                  JOIN public.users un ON un.id = n.practitioner_id AND un.is_shared_resource IS TRUE
                  JOIN public.appointments p
                    ON p.tenant_id = n.tenant_id AND p.patient_id = n.patient_id
                   AND p.starts_at = n.starts_at AND p.id <> n.id
                   AND p.service_id IS DISTINCT FROM n.service_id
                  JOIN public.users up ON up.id = p.practitioner_id AND up.is_shared_resource IS NOT TRUE),
  'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('action', al.action, 'id', al.id::text,
                                                        'created_at', al.created_at::text)
                                     ORDER BY al.created_at), '[]'::jsonb)
             FROM public.audit_log al
            WHERE al.action IN ('staff.jp_lv_schedule_rows.retire', 'staff.staff10_v2.apply')),
  'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'on_table', t.tgrelid::regclass::text, 'trigger', t.tgname::text,
                 'enabled', t.tgenabled::text, 'function', t.tgfoid::regprocedure::text)
                 ORDER BY t.tgrelid::regclass::text, t.tgname::text), '[]'::jsonb)
                 FROM pg_catalog.pg_trigger t
                WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.availability_templates'::regclass,
                                    'public.time_off'::regclass, 'public.audit_log'::regclass)
                  AND NOT t.tgisinternal)
)::text AS s10v2_json
\gset

-- ---------------------------------------------------------------------------
-- 0. THE INSTANT. Every cut below is taken from these.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 0. THE INSTANT: the Lisbon run day and the cuts taken from it ==='
SELECT m ->> 'run_day' AS run_day_lisbon,
       m ->> 'day0_lisbon' AS past_means_before,
       m ->> 'now_lisbon' AS now_lisbon,
       m ->> 'sitting_end_lisbon' AS a_future_pair_must_start_after
  FROM (SELECT :'s10v2_json'::jsonb -> 'meta' AS m) s;

-- ---------------------------------------------------------------------------
-- 1. SCOPE: the two JP rows, both NESA rows, and every shared resource.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. SCOPE: the JP rows, the NESA rows, every shared resource, and where each is installed ==='
SELECT e ->> 'row' AS staff_row, e ->> 'id' AS id, e ->> 'active' AS active, e ->> 'bookable' AS bookable,
       e ->> 'shared' AS shared_resource, e ->> 'installed_at' AS installed_at
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'staff') e
 ORDER BY e ->> 'row', e ->> 'id';
SELECT :'s10v2_json'::jsonb ->> 'nesa_split_audit' AS nesa_split_stage_1_audit_rows;
\echo '    NESA-SPLIT is READ here, not assumed: the NESA rows must both be active shared'
\echo '    resources (R10), and each booking clinic must have exactly one installed (R11).'

-- ---------------------------------------------------------------------------
-- 2. THE SCHEDULE ROWS, every active JP(cb) Linda-a-Velha row, and its class.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. EVERY ACTIVE JP(cb) LINDA-A-VELHA ROW, and what stage 2 does to it ==='
SELECT e ->> 'class' AS what_stage_2_does, e ->> 'id' AS id, e ->> 'weekday' AS weekday,
       e ->> 'date_dow' AS weekday_of_the_date, e ->> 'hours' AS hours,
       e ->> 'valid_from' AS valid_from, e ->> 'valid_until' AS valid_until,
       e ->> 'jp_lv_same_row' AS jp_lv_holds_it, e ->> 'jp_lv_sat_cover_from_start' AS jp_lv_saturday_rows_from_its_start
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'classes') e;
\echo '    retire_covered: dated, JP(lv) holds the same row. retire_past: its window ended'
\echo '    before today. move_saturday: dated, weekday 6 AND the date is a Saturday, today or'
\echo '    later. retire_phantom: dated, the weekday column is not the date''s weekday.'
\echo '    retire_sat_window: an undated weekday 6 window, open-ended included. UNCLASSIFIED'
\echo '    refuses (R09).'
\echo ''
\echo '=== 2b. THE PARTITION: every active row lands in exactly one class ==='
SELECT (p ->> 'active_rows')::int AS active_rows,
       (p ->> 'retire_covered')::int AS covered, (p ->> 'retire_past')::int AS past,
       (p ->> 'move_saturday')::int AS move, (p ->> 'retire_phantom')::int AS phantom,
       (p ->> 'retire_sat_window')::int AS sat_window, (p ->> 'unclassified')::int AS unclassified,
       (p ->> 'exactly_one_class')::int AS in_exactly_one, (p ->> 'label_agrees')::int AS label_agrees,
       CASE WHEN (p ->> 'active_rows')::int = (p ->> 'exactly_one_class')::int
             AND (p ->> 'active_rows')::int = (p ->> 'label_agrees')::int
             AND (p ->> 'unclassified')::int = 0
             AND (p ->> 'active_rows')::int = (p ->> 'retire_covered')::int + (p ->> 'retire_past')::int
                 + (p ->> 'move_saturday')::int + (p ->> 'retire_phantom')::int + (p ->> 'retire_sat_window')::int
            THEN 'partition holds' ELSE 'PARTITION BROKEN, R09 refuses' END AS partition
  FROM (SELECT :'s10v2_json'::jsonb -> 'partition' AS p) s;

-- ---------------------------------------------------------------------------
-- 2c. JP(cb)'s blocks from 23 September to 7 October: the positive control for
--     the 30 September predicate. No note text is printed.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2c. JP(cb) BLOCKS FROM 23 SEPTEMBER TO 7 OCTOBER. Stage 2 deletes the one that overlaps 30 September ==='
SELECT e ->> 'id' AS id, e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'ends_lisbon' AS ends_lisbon,
       e ->> 'reason' AS reason, e ->> 'deleted_by_stage_2' AS deleted_by_stage_2
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'blocks') e;
\echo '    JP(cb) WEDNESDAY blocks other than 30 September are left alone, as ruled.'

-- ---------------------------------------------------------------------------
-- 3. THE CARRIES. Stage 2 is handed every one and refuses if any has moved.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. THE CARRIES. Stage 2 is given these and refuses if any has moved ==='
SELECT e ->> 'carry' AS carry, e ->> 'value' AS value
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'carries') e
 ORDER BY (e ->> 'ord')::int;
\echo '    A count of 0 with digest "empty" means that action has nothing to do today.'

-- ---------------------------------------------------------------------------
-- 4. THE REFUSALS. n must read 0 on every line, or stage 2 STOPS. control is
--    the population the predicate read: 0 there prints VACUOUS, not OK.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. THE REFUSALS. Any REFUSE stops the sitting here; stage 2 refuses on the same lines ==='
SELECT e ->> 'code' AS code, e ->> 'label' AS refuses_when, (e ->> 'n')::int AS n,
       (e ->> 'control')::int AS control, e ->> 'verdict' AS verdict
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'refusals') e
 ORDER BY e ->> 'code';
\echo ''
\echo '=== 4b. WHAT ELSE WOULD RUN ON A WRITE: every trigger the system did not create, on a table stage 2 writes. R30 refuses any ==='
SELECT e ->> 'on_table' AS on_table, e ->> 'trigger' AS trigger_name, e ->> 'enabled' AS enabled,
       e ->> 'function' AS runs_function
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'triggers') e;
\echo '    An empty listing is the expected answer; R30 control counts every trigger read, the'
\echo '    system constraint triggers included, so an empty listing that read nothing prints VACUOUS.'

-- ---------------------------------------------------------------------------
-- 5. RULING (a): JP(cb)'s past Linda-a-Velha appointments, summarised. Every id
--    goes into stage 2's audit row.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. RULING (a): JP(cb) Linda-a-Velha appointments before the run day, by status. Stage 2 moves them to JP(lv) ==='
SELECT e ->> 'status' AS status, (e ->> 'rows')::int AS rows, e ->> 'first_lisbon' AS first_lisbon,
       e ->> 'last_lisbon' AS last_lisbon, (e ->> 'with_clinical_record')::int AS with_clinical_record
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'h_summary') e;
\echo '    Clinical authorship does not move: clinical_records is never written, and stage 2'
\echo '    and stage 3 compare those records by md5.'
\echo ''
\echo '=== 5b. RULING (a) and list A: a past JP(cb) row with a JP(lv) twin (same patient, same start). Both end on JP(lv) ==='
SELECT e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'cb_row_appointment' AS cb_row_appointment,
       e ->> 'cb_row_status' AS cb_row_status, e ->> 'lv_row_appointment' AS lv_row_appointment,
       e ->> 'lv_row_status' AS lv_row_status
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'h_list_a') e;
\echo '    A pair that would put two overlapping CONFIRMED rows on JP(lv) is refused by R14.'

-- ---------------------------------------------------------------------------
-- 6. RULING (b): the past pairs whose NESA row is not installed at the booking
--    clinic, and the NESA row each one goes to.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. RULING (b): past pairs whose NESA row is not installed at the booking clinic, person row not in ruling (a). Stage 2 re-attributes the NESA row ==='
SELECT e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'nesa_row' AS nesa_row, e ->> 'person_row' AS person_row,
       e ->> 'booking_clinic' AS booking_clinic, e ->> 'person_clinic' AS person_row_clinic,
       e ->> 'two_clinics' AS two_clinics, e ->> 'from_nesa' AS from_nesa, e ->> 'to_nesa' AS to_nesa,
       e ->> 'nesa_status' AS nesa_status, e ->> 'person_status' AS person_status
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'x') e;
\echo '    booking_clinic is the NESA row''s clinic. two_clinics = true means the person row sits at'
\echo '    another clinic, and R29 refuses it. No pair here has its person row in ruling (a): that'
\echo '    pair''s NESA row is left alone and listed in section 8 (question Q3 in the doc).'

-- ---------------------------------------------------------------------------
-- 7. RULING (c): the future pairs, both rows live. Option a, pair by pair, with
--    the machine hour as it stands before the write.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 7. RULING (c): future pairs, both rows live. The person row keeps and takes the NESA as practitioner_2; the NESA row is cancelled ==='
SELECT e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'person_row' AS person_row, e ->> 'nesa_row' AS nesa_row,
       e ->> 'nesa_user' AS nesa, e ->> 'booking_clinic' AS booking_clinic,
       e ->> 'nesa_ends_lisbon' AS nesa_ends, e ->> 'person_ends_lisbon' AS person_ends,
       e ->> 'person_status' AS person_status, e ->> 'nesa_status' AS nesa_status,
       e ->> 'person_t2' AS person_practitioner_2,
       e ->> 'machine_hour_held_now_by_nesa_row' AS machine_hour_held_now, e ->> 'person_pedido' AS person_is_pedido
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'f') e;
\echo '    The machine hour is held BEFORE by the NESA row and AFTER by the person row through'
\echo '    practitioner_2, under the app rule (apps/web/lib/scheduling/conflict.ts). Stage 2'
\echo '    asserts both sides of that and stage 3 re-reads it. Stage 3 prints these ids again.'

-- ---------------------------------------------------------------------------
-- 8. RULING (d): THE PROVENANCE LISTING. Every other past pair, never changed.
--    Its ids also go into stage 2's audit row.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 8. RULING (d): every other past pair. Listed here and in the audit row; no stage changes its NESA row ==='
SELECT e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'nesa_row' AS nesa_row, e ->> 'person_row' AS person_row,
       e ->> 'booking_clinic' AS booking_clinic, e ->> 'nesa_installed_there' AS nesa_installed_there,
       e ->> 'nesa_status' AS nesa_status, e ->> 'person_status' AS person_status,
       e ->> 'person_row_in_h' AS person_row_moved_by_a
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'p') e;
\echo '    No stage changes a NESA row listed here. person_row_moved_by_a = true: the person row is'
\echo '    JP(cb) at Linda-a-Velha, so ruling (a) moves it to JP(lv), and its NESA row stays where it'
\echo '    is, installed at its clinic or not (question Q3 in the doc). nesa_installed_there = false'
\echo '    marks a NESA row that ruling (b) would have moved had its person row not been in ruling (a).'

-- ---------------------------------------------------------------------------
-- 9. WHAT NO RULING ACTS ON: future pairs with one side already cancelled or
--    no-show, and near misses whose service differs or is NULL on one side.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 9. NO RULING ACTS ON THESE: future pairs with one side already cancelled or no-show ==='
SELECT e ->> 'starts_lisbon' AS starts_lisbon, e ->> 'nesa_row' AS nesa_row, e ->> 'person_row' AS person_row,
       e ->> 'nesa_status' AS nesa_status, e ->> 'person_status' AS person_status
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'f_other') e;
SELECT (:'s10v2_json'::jsonb ->> 'near_miss')::int AS near_misses_service_differs_or_null_on_one_side;
\echo '    A near miss is not a twin under the ruled definition and no stage touches it.'

-- ---------------------------------------------------------------------------
-- 10. HAS ANY WRITE ALREADY RUN? Its own audit row is the only answer.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 10. HAS THE ORIGINAL STAFF-10 WRITE OR THIS V2 WRITE ALREADY RUN? ==='
SELECT e ->> 'action' AS action, e ->> 'id' AS id, e ->> 'created_at' AS created_at
  FROM jsonb_array_elements(:'s10v2_json'::jsonb -> 'runs') e;

ROLLBACK;

\echo ''
\echo '=== STAFF-10 V2 STAGE 1 COMPLETE. Nothing was written. ==='

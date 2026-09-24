-- ============================================================================
-- STAFF-10 V2, STAGE 2 of 3: THE WRITE. ONE DO BLOCK, ONE TRANSACTION.
--
-- Card STAFF-10 (a ruled Tier C item). Rulings of 2026-09-24, paraphrased, in
-- stage 1's header and in docs/data-op-staff-10-v2.md.
--
-- WHAT IT WRITES, AND NOTHING ELSE:
--   public.availability_templates.is_active -> false  (retire_covered, retire_past,
--                                                     retire_phantom, retire_sat_window)
--   public.availability_templates.user_id   -> JP(lv) (move_saturday)
--   public.time_off                          DELETE   (the block overlapping 30 September,
--                                                     recorded whole in the audit row first)
--   public.appointments.practitioner_id     -> JP(lv) (ruling a, set H)
--   public.appointments.practitioner_id     -> the NESA installed at the booking clinic
--                                                     (ruling b, set X)
--   public.appointments.practitioner_2_id   -> the NESA (ruling c, the person row of each
--                                                     future pair)
--   public.appointments.status              -> cancelled (ruling c, the NESA row of each
--                                                     future pair)
--   public.appointments.updated_at          -> now() on every appointment written above
--   public.audit_log                         ONE row carrying every id, every
--                                                     before-count and every md5
--
-- WHAT IT NEVER TOUCHES, asserted inside the transaction rather than promised:
-- clinical_records (authorship included), invoices, users, staff_locations,
-- every appointment outside the four sets, and every JP(cb) row at Castelo
-- Branco. Each is compared by md5 before and after.
--
-- ANY "STOP:" MEANS THE TRANSACTION ABORTED AND NOTHING WAS WRITTEN. There is no
-- partial write: every refusal is raised before the first write, and every
-- assertion after a write raises, which rolls the whole block back.
--
-- THE CARRIES COME FROM STAGE 1, RUN ON THE SAME LISBON DAY IN THE SAME SITTING.
-- The block between the SETS markers is stage 1's, byte for byte, so the
-- recomputed carries can only differ if the database moved.
--
-- Run (stage 2 of docs/data-op-staff-10-v2.md passes every carry with -v):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off -v s10v2_run_day=... -f scripts/data/staff-10-v2-2-write.sql
-- ============================================================================

\pset pager off
\timing off
SET TIME ZONE 'UTC';
SET datestyle = 'ISO, YMD';

\echo ''
\echo '=== STAFF-10 V2, STAGE 2. ONE TRANSACTION, REPEATABLE READ. ==='

-- REPEATABLE READ: every read inside the block sees one snapshot, so the before
-- and after comparisons cannot be moved by another session's commit, and a
-- concurrent update of a row this block writes aborts it instead of racing it.
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- PSQL DOES NOT INTERPOLATE :'var' INSIDE A DOLLAR-QUOTED BODY. The carries are
-- lifted into session settings here, in plain SQL, and read back inside the
-- block with current_setting. A carry not passed fails on this statement.
SELECT count(*) AS carries_lifted
  FROM (VALUES
    (set_config('s10v2.s10v2_run_day',       :'s10v2_run_day',       false)),
    (set_config('s10v2.s10v2_count_rcov',    :'s10v2_count_rcov',    false)),
    (set_config('s10v2.s10v2_digest_rcov',   :'s10v2_digest_rcov',   false)),
    (set_config('s10v2.s10v2_count_rpast',   :'s10v2_count_rpast',   false)),
    (set_config('s10v2.s10v2_digest_rpast',  :'s10v2_digest_rpast',  false)),
    (set_config('s10v2.s10v2_count_msat',    :'s10v2_count_msat',    false)),
    (set_config('s10v2.s10v2_digest_msat',   :'s10v2_digest_msat',   false)),
    (set_config('s10v2.s10v2_count_rphan',   :'s10v2_count_rphan',   false)),
    (set_config('s10v2.s10v2_digest_rphan',  :'s10v2_digest_rphan',  false)),
    (set_config('s10v2.s10v2_count_rwin',    :'s10v2_count_rwin',    false)),
    (set_config('s10v2.s10v2_digest_rwin',   :'s10v2_digest_rwin',   false)),
    (set_config('s10v2.s10v2_count_dblk',    :'s10v2_count_dblk',    false)),
    (set_config('s10v2.s10v2_digest_dblk',   :'s10v2_digest_dblk',   false)),
    (set_config('s10v2.s10v2_count_hjp',     :'s10v2_count_hjp',     false)),
    (set_config('s10v2.s10v2_digest_hjp',    :'s10v2_digest_hjp',    false)),
    (set_config('s10v2.s10v2_count_xnesa',   :'s10v2_count_xnesa',   false)),
    (set_config('s10v2.s10v2_digest_xnesa',  :'s10v2_digest_xnesa',  false)),
    (set_config('s10v2.s10v2_count_ft2',     :'s10v2_count_ft2',     false)),
    (set_config('s10v2.s10v2_digest_ft2',    :'s10v2_digest_ft2',    false)),
    (set_config('s10v2.s10v2_count_fcan',    :'s10v2_count_fcan',    false)),
    (set_config('s10v2.s10v2_digest_fcan',   :'s10v2_digest_fcan',   false))
  ) v(x);

DO $s10v2$
DECLARE
  c_jp_cb    constant uuid := '54d486e0-a9c3-4c82-acac-8b909ce5a2d0';
  c_jp_lv    constant uuid := '0c1a0000-0000-4000-8000-000000000001';
  c_lv_loc   constant uuid := 'de000002-0000-0000-0000-000000000001';
  c_cb_loc   constant uuid := 'de000002-0000-0000-0000-000000000002';
  c_nesa_cb  constant uuid := '0c1a0000-0000-4000-8000-000000000002';
  c_nesa_lv  constant uuid := 'bdc466d7-f81f-4f8c-aa2e-b85194d73e1a';
  c_action   constant text := 'staff.staff10_v2.apply';
  c_ctl_from constant timestamptz := '2000-01-01 03:00:00+00';
  c_ctl_to   constant timestamptz := '2000-01-01 03:01:00+00';

  v_tenant  uuid;
  v_today   date;
  v_day0    timestamptz;
  v_rcov    uuid[];
  v_rpast   uuid[];
  v_msat    uuid[];
  v_rphan   uuid[];
  v_rwin    uuid[];
  v_retire  uuid[];
  v_blk     uuid[];
  v_h       uuid[];
  v_x       jsonb;
  v_f       jsonb;
  v_pp      jsonb;
  v_keep    uuid[];
  v_ref     jsonb;
  v_car     jsonb;
  v_x_ids   uuid[];
  v_f_p     uuid[];
  v_f_n     uuid[];
  v_written uuid[];
  v_sched   uuid[];
  v_blk_rows jsonb;

  v_row     record;
  v_key     text;
  v_want    text;
  v_n       int;
  v_m       int;

  v_b_appt int; v_b_cb int; v_b_lv int; v_b_ncb int; v_b_nlv int; v_b_cancel int; v_b_t2 int;
  v_b_cb_lv_rows int; v_b_lv_lv_rows int; v_b_cb_inactive int; v_b_timeoff int;
  v_b_md5_appt_rest text; v_b_md5_w_fixed text; v_b_md5_h text; v_b_md5_x text; v_b_md5_fp text; v_b_md5_fn text;
  v_b_md5_av_rest text; v_b_md5_av_w text; v_b_md5_to_rest text;
  v_b_md5_cr_all text; v_b_md5_inv text; v_b_md5_users text; v_b_md5_sl text;
  v_b_md5_cr_att text; v_b_md5_keep text; v_b_md5_cb_past text; v_b_md5_cb_sched text;
  v_b_n_cr_att int; v_b_n_keep int; v_b_n_cb_past int; v_b_n_cb_sched int;
  v_b_mh_n int; v_b_mh_other int; v_b_mh_ctl int;
  v_a_mh_p int; v_a_mh_n int; v_a_mh_ctl int; v_a_th_p int;
BEGIN
  -- ==========================================================================
  -- P1. EVERY SET, COMPUTED ONCE, BY STAGE 1'S OWN TEXT.
  -- ==========================================================================
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
-- The two JP rows, as found.
jp AS (
  SELECT u.id, u.tenant_id, u.is_active
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
x AS (
  SELECT DISTINCT tw.n_id AS id, tw.n_user AS from_user, tw.n_loc AS loc,
         coalesce(i.n, 0) AS installed_here,
         CASE WHEN i.n = 1 THEN i.first_one END AS to_user
    FROM tw
    LEFT JOIN inst_n i ON i.location_id = tw.n_loc
   WHERE tw.is_past AND NOT tw.n_home
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
-- RULING (d), SET P: every other past pair. Listed, never changed.
pp AS (
  SELECT tw.* FROM tw WHERE tw.is_past AND tw.n_home
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
-- target would hold after its re-attribution.
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
  SELECT 'R02', 'JP(lv) is inactive, so its Linda-a-Velha cover would vanish',
         (SELECT count(*) FROM jp, k WHERE jp.id = k.jp_lv AND jp.is_active IS NOT TRUE)::int,
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
         (SELECT count(*) FROM h_after)::int
  UNION ALL
  SELECT 'R15', 'a ruling (b) re-attribution would put two overlapping confirmed rows on one NESA row',
         (SELECT count(*) FROM x_after a1 JOIN x_after a2
             ON a1.id < a2.id AND a1.holder = a2.holder AND (a1.moving OR a2.moving)
            AND tstzrange(a1.starts_at, a1.ends_at) && tstzrange(a2.starts_at, a2.ends_at))::int,
         (SELECT count(*) FROM x_after)::int
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
)
-- <<< STAFF-10 V2 SETS END
  SELECT (SELECT k.tenant FROM k), (SELECT k.today FROM k), (SELECT k.day0 FROM k),
         coalesce((SELECT array_agg(c.id ORDER BY c.id) FROM cls c WHERE c.f_cov), '{}'::uuid[]),
         coalesce((SELECT array_agg(c.id ORDER BY c.id) FROM cls c WHERE c.f_past), '{}'::uuid[]),
         coalesce((SELECT array_agg(c.id ORDER BY c.id) FROM cls c WHERE c.f_move), '{}'::uuid[]),
         coalesce((SELECT array_agg(c.id ORDER BY c.id) FROM cls c WHERE c.f_phan), '{}'::uuid[]),
         coalesce((SELECT array_agg(c.id ORDER BY c.id) FROM cls c WHERE c.f_win), '{}'::uuid[]),
         coalesce((SELECT array_agg(b.id ORDER BY b.id) FROM blk b), '{}'::uuid[]),
         coalesce((SELECT array_agg(h.id ORDER BY h.id) FROM h), '{}'::uuid[]),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'from', x.from_user, 'to', x.to_user)
                                    ORDER BY x.id) FROM x), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('p', f.p_id, 'n', f.n_id, 'r', f.n_user,
                                                       's', f.starts_at, 'e', f.n_ends)
                                    ORDER BY f.p_id) FROM f), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('n', pp.n_id, 'p', pp.p_id)
                                    ORDER BY pp.n_id, pp.p_id) FROM pp), '[]'::jsonb),
         coalesce((SELECT array_agg(tk.id ORDER BY tk.id) FROM tw_keep tk), '{}'::uuid[]),
         (SELECT jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label, 'n', r.n, 'control', r.control)
                           ORDER BY r.code) FROM ref r),
         (SELECT jsonb_object_agg(c.carry, c.value) FROM car c)
    INTO v_tenant, v_today, v_day0, v_rcov, v_rpast, v_msat, v_rphan, v_rwin, v_blk, v_h,
         v_x, v_f, v_pp, v_keep, v_ref, v_car;

  v_x_ids   := ARRAY(SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(v_x) e ORDER BY 1);
  v_f_p     := ARRAY(SELECT (e ->> 'p')::uuid FROM jsonb_array_elements(v_f) e ORDER BY 1);
  v_f_n     := ARRAY(SELECT (e ->> 'n')::uuid FROM jsonb_array_elements(v_f) e ORDER BY 1);
  v_retire  := v_rcov || v_rpast || v_rphan || v_rwin;
  v_sched   := v_retire || v_msat;
  v_written := v_h || v_x_ids || v_f_p || v_f_n;

  RAISE NOTICE 'P1 tenant %, run day (Lisbon) %, past means before %', v_tenant, v_today, v_day0;
  RAISE NOTICE 'P1 retire_covered % / retire_past % / move_saturday % / retire_phantom % / retire_sat_window % / block %',
    cardinality(v_rcov), cardinality(v_rpast), cardinality(v_msat), cardinality(v_rphan), cardinality(v_rwin),
    cardinality(v_blk);
  RAISE NOTICE 'P1 ruling a % / ruling b % / ruling c % / ruling d listed % / past twin rows kept %',
    cardinality(v_h), cardinality(v_x_ids), cardinality(v_f_p), jsonb_array_length(v_pp), cardinality(v_keep);

  -- ==========================================================================
  -- P2. THE REFUSALS, stage 1's own lines. Any n above 0 STOPS the op here,
  --     before the first write.
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
  -- P3. THE CARRIES. Same Lisbon day, then every count and digest, per action.
  -- ==========================================================================
  IF current_setting('s10v2.s10v2_run_day', true) IS DISTINCT FROM v_today::text THEN
    RAISE EXCEPTION 'STOP: stage 1 ran on Lisbon day %, and today is %. Run stage 1 again today',
      current_setting('s10v2.s10v2_run_day', true), v_today;
  END IF;
  SELECT count(*)::int INTO v_n FROM jsonb_object_keys(v_car);
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'STOP: the carry set has % names, not 21', v_n;
  END IF;
  FOR v_row IN SELECT c.key, c.value FROM jsonb_each_text(v_car) c ORDER BY 1
  LOOP
    v_want := current_setting('s10v2.' || v_row.key, true);
    IF v_want IS NULL OR v_want = '' THEN
      RAISE EXCEPTION 'STOP: carry % was not passed from stage 1', v_row.key;
    END IF;
    IF v_want IS DISTINCT FROM v_row.value THEN
      RAISE EXCEPTION 'STOP: carry % reads % now and stage 1 printed %. The database moved since stage 1. Run stage 1 again',
        v_row.key, v_row.value, v_want;
    END IF;
  END LOOP;
  RAISE NOTICE 'P3 the run day and all 21 carries match stage 1';

  -- ==========================================================================
  -- P4. WHAT ELSE RUNS ON A WRITE TO THESE TABLES. Printed; every piece cast,
  --     because text || "char" has no operator and a print must not abort.
  -- ==========================================================================
  SELECT string_agg(t.tgrelid::regclass::text || '.' || t.tgname::text || ' (enabled ' || t.tgenabled::text || ')',
                    ', ' ORDER BY t.tgrelid::regclass::text, t.tgname::text)
    INTO v_want
    FROM pg_trigger t
   WHERE t.tgrelid IN ('public.appointments'::regclass, 'public.availability_templates'::regclass,
                       'public.time_off'::regclass, 'public.audit_log'::regclass)
     AND NOT t.tgisinternal;
  RAISE NOTICE 'P4 triggers: %', coalesce(v_want, 'none');

  -- ==========================================================================
  -- P5. THE BASELINES. Every one is read again after the writes and asserted.
  -- ==========================================================================
  SELECT count(*)::int INTO v_b_appt FROM public.appointments a WHERE a.tenant_id = v_tenant;
  SELECT count(*)::int INTO v_b_cb FROM public.appointments a WHERE a.practitioner_id = c_jp_cb;
  SELECT count(*)::int INTO v_b_lv FROM public.appointments a WHERE a.practitioner_id = c_jp_lv;
  SELECT count(*)::int INTO v_b_ncb FROM public.appointments a WHERE a.practitioner_id = c_nesa_cb;
  SELECT count(*)::int INTO v_b_nlv FROM public.appointments a WHERE a.practitioner_id = c_nesa_lv;
  SELECT count(*)::int INTO v_b_cancel FROM public.appointments a WHERE a.tenant_id = v_tenant AND a.status = 'cancelled';
  SELECT count(*)::int INTO v_b_t2 FROM public.appointments a WHERE a.tenant_id = v_tenant AND a.practitioner_2_id IS NOT NULL;
  SELECT count(*)::int INTO v_b_cb_lv_rows FROM public.availability_templates av
   WHERE av.user_id = c_jp_cb AND av.location_id = c_lv_loc AND av.is_active IS TRUE;
  SELECT count(*)::int INTO v_b_lv_lv_rows FROM public.availability_templates av
   WHERE av.user_id = c_jp_lv AND av.location_id = c_lv_loc AND av.is_active IS TRUE;
  SELECT count(*)::int INTO v_b_cb_inactive FROM public.availability_templates av
   WHERE av.user_id = c_jp_cb AND av.is_active IS NOT TRUE;
  SELECT count(*)::int INTO v_b_timeoff FROM public.time_off t WHERE t.tenant_id = v_tenant;

  SELECT md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), '')) INTO v_b_md5_appt_rest
    FROM public.appointments a
   WHERE a.tenant_id = v_tenant AND NOT EXISTS (SELECT 1 FROM unnest(v_written) w(id) WHERE w.id = a.id);
  SELECT md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.location_id, a.service_id, a.room,
                                     a.starts_at, a.ends_at, a.patient_2_id, a.confirmation_state, a.origin,
                                     a.pack_instance_id, a.notes, a.created_by, a.created_at, a.booking_group_id,
                                     a.batch_id, a.recurrence_rule, a.recurrence_parent_id)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_md5_w_fixed
    FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_written) w(id));
  SELECT md5(coalesce(string_agg(ROW(a.id, a.status, a.practitioner_2_id)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_md5_h FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_h) w(id));
  SELECT md5(coalesce(string_agg(ROW(a.id, a.status, a.practitioner_2_id)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_md5_x FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_x_ids) w(id));
  SELECT md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.status)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_md5_fp FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_f_p) w(id));
  SELECT md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.practitioner_2_id)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_md5_fn FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_f_n) w(id));
  SELECT md5(coalesce(string_agg((av.*)::text, E'\n' ORDER BY av.id), '')) INTO v_b_md5_av_rest
    FROM public.availability_templates av
   WHERE av.tenant_id = v_tenant AND NOT EXISTS (SELECT 1 FROM unnest(v_sched) w(id) WHERE w.id = av.id);
  SELECT md5(coalesce(string_agg(ROW(av.id, av.tenant_id, av.location_id, av.weekday, av.start_time, av.end_time,
                                     av.valid_from, av.valid_until, av.created_at)::text, E'\n' ORDER BY av.id), ''))
    INTO v_b_md5_av_w
    FROM public.availability_templates av WHERE av.id IN (SELECT w.id FROM unnest(v_sched) w(id));
  SELECT md5(coalesce(string_agg((t.*)::text, E'\n' ORDER BY t.id), '')) INTO v_b_md5_to_rest
    FROM public.time_off t
   WHERE t.tenant_id = v_tenant AND NOT EXISTS (SELECT 1 FROM unnest(v_blk) w(id) WHERE w.id = t.id);
  SELECT md5(coalesce(string_agg(ROW(cr.id, cr.practitioner_id, cr.appointment_id, cr.patient_id, cr.status,
                                     cr.version, cr.updated_at)::text, E'\n' ORDER BY cr.id), ''))
    INTO v_b_md5_cr_all FROM public.clinical_records cr WHERE cr.tenant_id = v_tenant;
  SELECT md5(coalesce(string_agg(ROW(iv.id, iv.appointment_id, iv.patient_id, iv.amount_cents, iv.status,
                                     iv.updated_at)::text, E'\n' ORDER BY iv.id), ''))
    INTO v_b_md5_inv FROM public.invoices iv WHERE iv.tenant_id = v_tenant;
  SELECT md5(coalesce(string_agg(ROW(u.id, u.is_active, u.is_bookable, u.is_shared_resource, u.role_id,
                                     u.updated_at)::text, E'\n' ORDER BY u.id), ''))
    INTO v_b_md5_users FROM public.users u WHERE u.tenant_id = v_tenant;
  SELECT md5(coalesce(string_agg(ROW(sl.id, sl.user_id, sl.location_id)::text, E'\n' ORDER BY sl.id), ''))
    INTO v_b_md5_sl FROM public.staff_locations sl WHERE sl.tenant_id = v_tenant;

  -- Recorded in the audit row, and recomputed by stage 3 with the same text.
  SELECT count(*)::int,
         md5(coalesce(string_agg(ROW(cr.id, cr.practitioner_id, cr.appointment_id)::text, E'\n' ORDER BY cr.id), ''))
    INTO v_b_n_cr_att, v_b_md5_cr_att
    FROM public.clinical_records cr WHERE cr.appointment_id IN (SELECT w.id FROM unnest(v_written) w(id));
  SELECT count(*)::int,
         md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.practitioner_2_id, a.location_id, a.starts_at,
                                     a.ends_at, a.status)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_n_keep, v_b_md5_keep
    FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_keep) w(id));
  SELECT count(*)::int,
         md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.practitioner_2_id, a.location_id, a.starts_at,
                                     a.ends_at, a.status)::text, E'\n' ORDER BY a.id), ''))
    INTO v_b_n_cb_past, v_b_md5_cb_past
    FROM public.appointments a
   WHERE a.practitioner_id = c_jp_cb AND a.location_id = c_cb_loc AND a.starts_at < v_day0;
  SELECT count(*)::int, md5(coalesce(string_agg((av.*)::text, E'\n' ORDER BY av.id), ''))
    INTO v_b_n_cb_sched, v_b_md5_cb_sched
    FROM public.availability_templates av WHERE av.user_id = c_jp_cb AND av.location_id = c_cb_loc;

  RAISE NOTICE 'P5 baseline: appointments % (JP(cb) %, JP(lv) %, NESA(cb) %, NESA(lv) %), cancelled %, with practitioner_2 %',
    v_b_appt, v_b_cb, v_b_lv, v_b_ncb, v_b_nlv, v_b_cancel, v_b_t2;
  RAISE NOTICE 'P5 untouched sets: clinical records on written rows %, past twin rows kept %, JP(cb) past CB appointments %, JP(cb) CB schedule rows %',
    v_b_n_cr_att, v_b_n_keep, v_b_n_cb_past, v_b_n_cb_sched;

  -- ==========================================================================
  -- P6. THE MACHINE HOUR, BEFORE. Under the app rule (conflict.ts: a row holds
  --     a resource when it names it in either slot, is not cancelled or no-show,
  --     is not an unconfirmed pedido, and overlaps), each future pair's NESA row
  --     holds its NESA over its own window today. The control window must read 0.
  -- ==========================================================================
  SELECT count(*)::int INTO v_b_mh_n
    FROM jsonb_array_elements(v_f) e
   WHERE EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.id = (e ->> 'n')::uuid
                    AND a.tenant_id = v_tenant
                    AND (a.practitioner_id = (e ->> 'r')::uuid OR a.practitioner_2_id = (e ->> 'r')::uuid)
                    AND a.status NOT IN ('cancelled', 'no_show')
                    AND NOT (a.status = 'scheduled'
                             AND (a.origin = 'patient_portal'
                                  OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                              WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
                    AND a.starts_at < (e ->> 'e')::timestamptz AND a.ends_at > (e ->> 's')::timestamptz);
  SELECT count(*)::int INTO v_b_mh_other
    FROM jsonb_array_elements(v_f) e
   WHERE EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.id <> (e ->> 'n')::uuid
                    AND a.tenant_id = v_tenant
                    AND (a.practitioner_id = (e ->> 'r')::uuid OR a.practitioner_2_id = (e ->> 'r')::uuid)
                    AND a.status NOT IN ('cancelled', 'no_show')
                    AND NOT (a.status = 'scheduled'
                             AND (a.origin = 'patient_portal'
                                  OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                              WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
                    AND a.starts_at < (e ->> 'e')::timestamptz AND a.ends_at > (e ->> 's')::timestamptz);
  SELECT count(*)::int INTO v_b_mh_ctl
    FROM public.appointments a
   WHERE a.tenant_id = v_tenant
     AND (a.practitioner_id IN (c_nesa_cb, c_nesa_lv) OR a.practitioner_2_id IN (c_nesa_cb, c_nesa_lv))
     AND a.status NOT IN ('cancelled', 'no_show')
     AND NOT (a.status = 'scheduled'
              AND (a.origin = 'patient_portal'
                   OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                               WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
     AND a.starts_at < c_ctl_to AND a.ends_at > c_ctl_from;
  RAISE NOTICE 'P6 machine hour BEFORE: held by the NESA row in % of % future pairs; also held by another row in %; control window %',
    v_b_mh_n, jsonb_array_length(v_f), v_b_mh_other, v_b_mh_ctl;
  IF v_b_mh_n <> jsonb_array_length(v_f) THEN
    RAISE EXCEPTION 'STOP: the NESA row holds its machine hour in % of % future pairs, not all', v_b_mh_n, jsonb_array_length(v_f);
  END IF;
  IF v_b_mh_ctl <> 0 THEN
    RAISE EXCEPTION 'STOP: the control window reads % before the write, not 0; the hold rule is not reading what it should', v_b_mh_ctl;
  END IF;

  -- ==========================================================================
  -- THE WRITES. Each is followed by its ROW_COUNT, asserted exactly.
  -- ==========================================================================
  -- W1. Retire: covered, past, phantom and Saturday-window rows.
  UPDATE public.availability_templates SET is_active = false
   WHERE id = ANY(v_retire) AND user_id = c_jp_cb AND location_id = c_lv_loc AND is_active IS TRUE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_retire) THEN
    RAISE EXCEPTION 'STOP: W1 retired % schedule rows, expected %', v_n, cardinality(v_retire);
  END IF;
  RAISE NOTICE 'W1 retired % schedule row(s)', v_n;

  -- W2. Move: the dated real Saturdays JP(lv) does not hold.
  UPDATE public.availability_templates SET user_id = c_jp_lv
   WHERE id = ANY(v_msat) AND user_id = c_jp_cb AND location_id = c_lv_loc AND is_active IS TRUE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_msat) THEN
    RAISE EXCEPTION 'STOP: W2 moved % Saturday rows, expected %', v_n, cardinality(v_msat);
  END IF;
  RAISE NOTICE 'W2 moved % Saturday row(s) to JP(lv)', v_n;

  -- W3. The 30 September block, recorded whole before it goes.
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) INTO v_blk_rows
    FROM public.time_off t WHERE t.id = ANY(v_blk);
  DELETE FROM public.time_off WHERE id = ANY(v_blk) AND user_id = c_jp_cb;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_blk) THEN
    RAISE EXCEPTION 'STOP: W3 deleted % blocks, expected %', v_n, cardinality(v_blk);
  END IF;
  RAISE NOTICE 'W3 deleted % block(s) overlapping 30 September (recorded whole in the audit row)', v_n;

  -- W4. Ruling (a): JP(cb)'s past Linda-a-Velha appointments to JP(lv).
  UPDATE public.appointments SET practitioner_id = c_jp_lv, updated_at = now()
   WHERE id = ANY(v_h) AND practitioner_id = c_jp_cb AND location_id = c_lv_loc AND starts_at < v_day0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_h) THEN
    RAISE EXCEPTION 'STOP: W4 re-attributed % ruling (a) rows, expected %', v_n, cardinality(v_h);
  END IF;
  RAISE NOTICE 'W4 re-attributed % past JP(cb) Linda-a-Velha appointment(s) to JP(lv)', v_n;

  -- W5. Ruling (b): each past NESA row to the NESA installed at its clinic.
  UPDATE public.appointments SET practitioner_id = t.to_user, updated_at = now()
    FROM (SELECT (e ->> 'id')::uuid AS id, (e ->> 'from')::uuid AS from_user, (e ->> 'to')::uuid AS to_user
            FROM jsonb_array_elements(v_x) e) t
   WHERE appointments.id = t.id AND appointments.practitioner_id = t.from_user
     AND t.to_user IS NOT NULL AND appointments.starts_at < v_day0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_x_ids) THEN
    RAISE EXCEPTION 'STOP: W5 re-attributed % ruling (b) rows, expected %', v_n, cardinality(v_x_ids);
  END IF;
  RAISE NOTICE 'W5 re-attributed % past NESA row(s) to the NESA installed at the booking clinic', v_n;

  -- W6. Ruling (c): the person row takes the NESA as practitioner_2.
  UPDATE public.appointments SET practitioner_2_id = t.r, updated_at = now()
    FROM (SELECT (e ->> 'p')::uuid AS p, (e ->> 'r')::uuid AS r FROM jsonb_array_elements(v_f) e) t
   WHERE appointments.id = t.p AND appointments.practitioner_2_id IS NULL
     AND appointments.status NOT IN ('cancelled', 'no_show');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_f_p) THEN
    RAISE EXCEPTION 'STOP: W6 set practitioner_2 on % person rows, expected %', v_n, cardinality(v_f_p);
  END IF;
  RAISE NOTICE 'W6 set the NESA as practitioner_2 on % future person row(s)', v_n;

  -- W7. Ruling (c): the NESA row of each future pair is cancelled.
  UPDATE public.appointments SET status = 'cancelled', updated_at = now()
   WHERE id = ANY(v_f_n) AND status NOT IN ('cancelled', 'no_show');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_f_n) THEN
    RAISE EXCEPTION 'STOP: W7 cancelled % NESA rows, expected %', v_n, cardinality(v_f_n);
  END IF;
  RAISE NOTICE 'W7 cancelled % future NESA row(s)', v_n;

  -- ==========================================================================
  -- A. THE EXACT DELTAS, and every untouched set by md5.
  -- ==========================================================================
  IF (SELECT count(*) FROM public.appointments a WHERE a.tenant_id = v_tenant) <> v_b_appt THEN
    RAISE EXCEPTION 'STOP: the appointment total moved; this op creates and deletes no appointment';
  END IF;
  IF (SELECT count(*) FROM public.appointments a WHERE a.practitioner_id = c_jp_cb) <> v_b_cb - cardinality(v_h)
     OR (SELECT count(*) FROM public.appointments a WHERE a.practitioner_id = c_jp_lv) <> v_b_lv + cardinality(v_h) THEN
    RAISE EXCEPTION 'STOP: the JP counts are not exactly before minus and plus the ruling (a) set';
  END IF;
  SELECT count(*)::int INTO v_n FROM jsonb_array_elements(v_x) e WHERE (e ->> 'from')::uuid = c_nesa_cb;
  SELECT count(*)::int INTO v_m FROM jsonb_array_elements(v_x) e WHERE (e ->> 'to')::uuid = c_nesa_cb;
  IF (SELECT count(*) FROM public.appointments a WHERE a.practitioner_id = c_nesa_cb) <> v_b_ncb - v_n + v_m THEN
    RAISE EXCEPTION 'STOP: NESA(cb) holds the wrong number of appointments after ruling (b)';
  END IF;
  SELECT count(*)::int INTO v_n FROM jsonb_array_elements(v_x) e WHERE (e ->> 'from')::uuid = c_nesa_lv;
  SELECT count(*)::int INTO v_m FROM jsonb_array_elements(v_x) e WHERE (e ->> 'to')::uuid = c_nesa_lv;
  IF (SELECT count(*) FROM public.appointments a WHERE a.practitioner_id = c_nesa_lv) <> v_b_nlv - v_n + v_m THEN
    RAISE EXCEPTION 'STOP: NESA(lv) holds the wrong number of appointments after ruling (b)';
  END IF;
  IF (SELECT count(*) FROM public.appointments a WHERE a.tenant_id = v_tenant AND a.status = 'cancelled')
       <> v_b_cancel + cardinality(v_f_n) THEN
    RAISE EXCEPTION 'STOP: the cancelled count is not exactly before plus the future NESA rows';
  END IF;
  IF (SELECT count(*) FROM public.appointments a WHERE a.tenant_id = v_tenant AND a.practitioner_2_id IS NOT NULL)
       <> v_b_t2 + cardinality(v_f_p) THEN
    RAISE EXCEPTION 'STOP: the practitioner_2 count is not exactly before plus the future person rows';
  END IF;
  IF (SELECT count(*) FROM public.appointments a WHERE a.id = ANY(v_written) AND a.updated_at = now())
       <> cardinality(v_written) THEN
    RAISE EXCEPTION 'STOP: an appointment this op wrote does not carry the op''s updated_at';
  END IF;

  IF (SELECT md5(coalesce(string_agg((a.*)::text, E'\n' ORDER BY a.id), ''))
        FROM public.appointments a
       WHERE a.tenant_id = v_tenant AND NOT EXISTS (SELECT 1 FROM unnest(v_written) w(id) WHERE w.id = a.id))
     IS DISTINCT FROM v_b_md5_appt_rest THEN
    RAISE EXCEPTION 'STOP: an appointment outside the four sets changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.location_id, a.service_id, a.room,
                                         a.starts_at, a.ends_at, a.patient_2_id, a.confirmation_state, a.origin,
                                         a.pack_instance_id, a.notes, a.created_by, a.created_at, a.booking_group_id,
                                         a.batch_id, a.recurrence_rule, a.recurrence_parent_id)::text, E'\n' ORDER BY a.id), ''))
        FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_written) w(id)))
     IS DISTINCT FROM v_b_md5_w_fixed THEN
    RAISE EXCEPTION 'STOP: a written appointment changed in a column this op does not write';
  END IF;
  IF (SELECT md5(coalesce(string_agg(ROW(a.id, a.status, a.practitioner_2_id)::text, E'\n' ORDER BY a.id), ''))
        FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_h) w(id))) IS DISTINCT FROM v_b_md5_h
     OR (SELECT md5(coalesce(string_agg(ROW(a.id, a.status, a.practitioner_2_id)::text, E'\n' ORDER BY a.id), ''))
        FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_x_ids) w(id))) IS DISTINCT FROM v_b_md5_x
     OR (SELECT md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.status)::text, E'\n' ORDER BY a.id), ''))
        FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_f_p) w(id))) IS DISTINCT FROM v_b_md5_fp
     OR (SELECT md5(coalesce(string_agg(ROW(a.id, a.practitioner_id, a.practitioner_2_id)::text, E'\n' ORDER BY a.id), ''))
        FROM public.appointments a WHERE a.id IN (SELECT w.id FROM unnest(v_f_n) w(id))) IS DISTINCT FROM v_b_md5_fn THEN
    RAISE EXCEPTION 'STOP: a written appointment changed in a column its own ruling does not write';
  END IF;
  IF (SELECT count(*) FROM public.appointments a WHERE a.id = ANY(v_h) AND a.practitioner_id = c_jp_lv)
       <> cardinality(v_h)
     OR (SELECT count(*) FROM public.appointments a
           JOIN (SELECT (e ->> 'id')::uuid AS id, (e ->> 'to')::uuid AS to_user FROM jsonb_array_elements(v_x) e) t
             ON t.id = a.id AND a.practitioner_id = t.to_user) <> cardinality(v_x_ids)
     OR (SELECT count(*) FROM public.appointments a
           JOIN (SELECT (e ->> 'p')::uuid AS p, (e ->> 'r')::uuid AS r FROM jsonb_array_elements(v_f) e) t
             ON t.p = a.id AND a.practitioner_2_id = t.r) <> cardinality(v_f_p)
     OR (SELECT count(*) FROM public.appointments a WHERE a.id = ANY(v_f_n) AND a.status = 'cancelled')
       <> cardinality(v_f_n) THEN
    RAISE EXCEPTION 'STOP: a written appointment does not read what its ruling wrote';
  END IF;

  IF (SELECT md5(coalesce(string_agg((av.*)::text, E'\n' ORDER BY av.id), ''))
        FROM public.availability_templates av
       WHERE av.tenant_id = v_tenant AND NOT EXISTS (SELECT 1 FROM unnest(v_sched) w(id) WHERE w.id = av.id))
     IS DISTINCT FROM v_b_md5_av_rest THEN
    RAISE EXCEPTION 'STOP: a schedule row outside the five classes changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(ROW(av.id, av.tenant_id, av.location_id, av.weekday, av.start_time, av.end_time,
                                         av.valid_from, av.valid_until, av.created_at)::text, E'\n' ORDER BY av.id), ''))
        FROM public.availability_templates av WHERE av.id IN (SELECT w.id FROM unnest(v_sched) w(id)))
     IS DISTINCT FROM v_b_md5_av_w THEN
    RAISE EXCEPTION 'STOP: a written schedule row changed in a column this op does not write';
  END IF;
  IF (SELECT count(*) FROM public.availability_templates av
       WHERE av.user_id = c_jp_cb AND av.location_id = c_lv_loc AND av.is_active IS TRUE) <> 0 THEN
    RAISE EXCEPTION 'STOP: JP(cb) still holds an active Linda-a-Velha schedule row';
  END IF;
  IF (SELECT count(*) FROM public.availability_templates av
       WHERE av.user_id = c_jp_lv AND av.location_id = c_lv_loc AND av.is_active IS TRUE)
       <> v_b_lv_lv_rows + cardinality(v_msat) THEN
    RAISE EXCEPTION 'STOP: JP(lv) active Linda-a-Velha rows are not exactly before plus the moved Saturdays';
  END IF;
  IF (SELECT count(*) FROM public.availability_templates av WHERE av.user_id = c_jp_cb AND av.is_active IS NOT TRUE)
       <> v_b_cb_inactive + cardinality(v_retire) THEN
    RAISE EXCEPTION 'STOP: JP(cb) inactive rows are not exactly before plus the retired ones';
  END IF;
  IF (SELECT count(*) FROM public.availability_templates av
       WHERE av.id = ANY(v_msat) AND av.user_id = c_jp_lv AND av.is_active IS TRUE AND av.weekday = 6
         AND extract(dow FROM av.valid_from)::int = 6
         AND av.valid_from IS NOT NULL AND av.valid_until IS NOT NULL AND av.valid_from = av.valid_until) <> cardinality(v_msat) THEN
    RAISE EXCEPTION 'STOP: a moved row is not an active real Saturday on JP(lv)';
  END IF;

  IF (SELECT count(*) FROM public.time_off t WHERE t.tenant_id = v_tenant) <> v_b_timeoff - cardinality(v_blk)
     OR (SELECT md5(coalesce(string_agg((t.*)::text, E'\n' ORDER BY t.id), ''))
           FROM public.time_off t
          WHERE t.tenant_id = v_tenant AND NOT EXISTS (SELECT 1 FROM unnest(v_blk) w(id) WHERE w.id = t.id))
        IS DISTINCT FROM v_b_md5_to_rest THEN
    RAISE EXCEPTION 'STOP: time_off changed other than by the one deleted block';
  END IF;

  IF (SELECT md5(coalesce(string_agg(ROW(cr.id, cr.practitioner_id, cr.appointment_id, cr.patient_id, cr.status,
                                         cr.version, cr.updated_at)::text, E'\n' ORDER BY cr.id), ''))
        FROM public.clinical_records cr WHERE cr.tenant_id = v_tenant) IS DISTINCT FROM v_b_md5_cr_all
     OR (SELECT md5(coalesce(string_agg(ROW(iv.id, iv.appointment_id, iv.patient_id, iv.amount_cents, iv.status,
                                            iv.updated_at)::text, E'\n' ORDER BY iv.id), ''))
           FROM public.invoices iv WHERE iv.tenant_id = v_tenant) IS DISTINCT FROM v_b_md5_inv
     OR (SELECT md5(coalesce(string_agg(ROW(u.id, u.is_active, u.is_bookable, u.is_shared_resource, u.role_id,
                                            u.updated_at)::text, E'\n' ORDER BY u.id), ''))
           FROM public.users u WHERE u.tenant_id = v_tenant) IS DISTINCT FROM v_b_md5_users
     OR (SELECT md5(coalesce(string_agg(ROW(sl.id, sl.user_id, sl.location_id)::text, E'\n' ORDER BY sl.id), ''))
           FROM public.staff_locations sl WHERE sl.tenant_id = v_tenant) IS DISTINCT FROM v_b_md5_sl THEN
    RAISE EXCEPTION 'STOP: clinical_records, invoices, users or staff_locations changed; this op writes none of them';
  END IF;

  -- ==========================================================================
  -- A2. THE MACHINE HOUR, AFTER. The NESA row no longer holds it; the person row
  --     holds it through practitioner_2 over the whole NESA window, and still
  --     holds its own practitioner's hour. The control window still reads 0.
  -- ==========================================================================
  SELECT count(*)::int INTO v_a_mh_p
    FROM jsonb_array_elements(v_f) e
   WHERE EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.id = (e ->> 'p')::uuid
                    AND a.tenant_id = v_tenant
                    AND (a.practitioner_id = (e ->> 'r')::uuid OR a.practitioner_2_id = (e ->> 'r')::uuid)
                    AND a.status NOT IN ('cancelled', 'no_show')
                    AND NOT (a.status = 'scheduled'
                             AND (a.origin = 'patient_portal'
                                  OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                              WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
                    AND a.starts_at <= (e ->> 's')::timestamptz AND a.ends_at >= (e ->> 'e')::timestamptz);
  SELECT count(*)::int INTO v_a_mh_n
    FROM jsonb_array_elements(v_f) e
   WHERE EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.id = (e ->> 'n')::uuid
                    AND a.tenant_id = v_tenant
                    AND (a.practitioner_id = (e ->> 'r')::uuid OR a.practitioner_2_id = (e ->> 'r')::uuid)
                    AND a.status NOT IN ('cancelled', 'no_show')
                    AND NOT (a.status = 'scheduled'
                             AND (a.origin = 'patient_portal'
                                  OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                              WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
                    AND a.starts_at < (e ->> 'e')::timestamptz AND a.ends_at > (e ->> 's')::timestamptz);
  SELECT count(*)::int INTO v_a_th_p
    FROM jsonb_array_elements(v_f) e
   WHERE EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.id = (e ->> 'p')::uuid
                    AND a.tenant_id = v_tenant
                    AND a.status NOT IN ('cancelled', 'no_show')
                    AND NOT (a.status = 'scheduled'
                             AND (a.origin = 'patient_portal'
                                  OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                                              WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request'))));
  SELECT count(*)::int INTO v_a_mh_ctl
    FROM public.appointments a
   WHERE a.tenant_id = v_tenant
     AND (a.practitioner_id IN (c_nesa_cb, c_nesa_lv) OR a.practitioner_2_id IN (c_nesa_cb, c_nesa_lv))
     AND a.status NOT IN ('cancelled', 'no_show')
     AND NOT (a.status = 'scheduled'
              AND (a.origin = 'patient_portal'
                   OR EXISTS (SELECT 1 FROM public.staff_notifications sn
                               WHERE sn.appointment_id = a.id AND sn.kind = 'appointment_request')))
     AND a.starts_at < c_ctl_to AND a.ends_at > c_ctl_from;
  RAISE NOTICE 'A2 machine hour AFTER: held by the person row over the whole NESA window in % of %; still held by the NESA row in %; therapist hour held in %; control window %',
    v_a_mh_p, jsonb_array_length(v_f), v_a_mh_n, v_a_th_p, v_a_mh_ctl;
  IF v_a_mh_p <> jsonb_array_length(v_f) OR v_a_th_p <> jsonb_array_length(v_f) THEN
    RAISE EXCEPTION 'STOP: after the write a future pair''s machine hour or therapist hour is not held by the person row';
  END IF;
  IF v_a_mh_n <> 0 THEN
    RAISE EXCEPTION 'STOP: a cancelled NESA row still holds its hour; the hold rule did not discriminate';
  END IF;
  IF v_a_mh_ctl <> 0 THEN
    RAISE EXCEPTION 'STOP: the control window reads % after the write, not 0', v_a_mh_ctl;
  END IF;

  -- ==========================================================================
  -- THE AUDIT ROW. Ids, counts and md5s only: no patient data, no free text
  -- beyond the deleted block copied whole. Stage 3 reads every number back.
  -- ==========================================================================
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_tenant, NULL, c_action, 'user', c_jp_cb, jsonb_build_object(
    'card', 'STAFF-10',
    'source', 'data_op_staff_10_v2',
    'today_lisbon', v_today,
    'day0', v_day0,
    'carries', v_car,
    'retired_covered_ids', to_jsonb(v_rcov),
    'retired_past_ids', to_jsonb(v_rpast),
    'retired_phantom_ids', to_jsonb(v_rphan),
    'retired_sat_window_ids', to_jsonb(v_rwin),
    'moved_saturday_ids', to_jsonb(v_msat),
    'deleted_blocks', v_blk_rows,
    'h_ids', to_jsonb(v_h),
    'x_pairs', v_x,
    'f_pairs', v_f,
    'p_pairs', v_pp,
    'keep_ids', to_jsonb(v_keep),
    'before', jsonb_build_object(
      'appointments', v_b_appt, 'jp_cb', v_b_cb, 'jp_lv', v_b_lv, 'nesa_cb', v_b_ncb, 'nesa_lv', v_b_nlv,
      'cancelled', v_b_cancel, 'with_t2', v_b_t2, 'cb_lv_rows', v_b_cb_lv_rows, 'lv_lv_rows', v_b_lv_lv_rows,
      'cb_inactive', v_b_cb_inactive, 'time_off', v_b_timeoff,
      'n_cr_att', v_b_n_cr_att, 'n_keep', v_b_n_keep, 'n_cb_past', v_b_n_cb_past, 'n_cb_sched', v_b_n_cb_sched,
      'mh_held_by_nesa', v_b_mh_n, 'mh_held_by_other', v_b_mh_other, 'mh_control', v_b_mh_ctl),
    'md5', jsonb_build_object(
      'cr_att', v_b_md5_cr_att, 'keep', v_b_md5_keep, 'cb_past', v_b_md5_cb_past, 'cb_sched', v_b_md5_cb_sched,
      'appt_rest', v_b_md5_appt_rest, 'w_fixed', v_b_md5_w_fixed, 'av_rest', v_b_md5_av_rest,
      'to_rest', v_b_md5_to_rest, 'cr_all', v_b_md5_cr_all),
    'after', jsonb_build_object(
      'mh_held_by_person', v_a_mh_p, 'mh_held_by_nesa', v_a_mh_n, 'therapist_hour_held', v_a_th_p,
      'mh_control', v_a_mh_ctl)
  ));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 OR (SELECT count(*) FROM public.audit_log al WHERE al.action = c_action) <> 1 THEN
    RAISE EXCEPTION 'STOP: the audit row was not written exactly once';
  END IF;

  RAISE NOTICE 'STAFF-10 V2 STAGE 2 DONE: schedule % retired and % moved, % block(s) deleted; ruling a %, ruling b %, ruling c % pair(s); JP(cb) holds no active Linda-a-Velha row',
    cardinality(v_retire), cardinality(v_msat), cardinality(v_blk), cardinality(v_h), cardinality(v_x_ids),
    cardinality(v_f_p);
END $s10v2$;

COMMIT;

\echo ''
\echo '=== STAFF-10 V2 STAGE 2 COMMITTED ==='

-- ============================================================================
-- STAFF-10 SCHEDULE ROWS, STAGE 2 of 3: THE WRITE. ONE TRANSACTION.
--
-- Card STAFF-10-jp-split-phase-2-reassignment-script (the rewrite).
--
-- WHAT IT WRITES, AND NOTHING ELSE:
--   public.availability_templates.is_active -> false   (three retire sets)
--   public.availability_templates.user_id   -> JP(lv)  (the future Saturdays)
--   public.time_off                          DELETE    (the 30 September block)
--   public.audit_log                         ONE row carrying every id above
--
-- WHAT IT NEVER TOUCHES, asserted at the end rather than promised: appointments
-- (past or future, any status), clinical_records, clinical_episodes,
-- attachments, users, staff_locations, and every JP(cb) row at Castelo Branco.
-- No appointment is cancelled by any stage of this operation: the duplicate
-- bookings go to reception, from docs/staff-10-reception-list.md.
--
-- THE DELETE IS THE ONE IRREVERSIBLE ACT HERE, and it is irreversible because
-- the schema leaves no choice: public.time_off has no is_active and no
-- deleted_at (schema.ts: tenant_id, user_id, starts_at, ends_at, reason, note,
-- created_at), so a block can only be removed. The whole row is copied into the
-- audit metadata BEFORE the delete, so re-creating it is a single insert from
-- values this operation recorded.
--
-- THE CARRIES COME FROM STAGE 1, IN THE SAME SITTING. Stage 2 recomputes the
-- target set from the database and refuses unless the count AND the digest both
-- match what stage 1 printed. The digest is md5 over the ordered (action, id)
-- pairs, so a set that changed membership without changing size is caught too.
--
-- Any line starting "STOP:" means the transaction aborted and NOTHING was
-- written. Success is the final "STAFF-10 STAGE 2 DONE" notice.
--
-- Run (stage 2 of docs/data-op-staff-10.md passes both carries):
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off \
--     -v staff10_expected_count=<N> -v staff10_expected_digest=<md5> \
--     -f scripts/data/staff-10-2-apply.sql
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== STAFF-10 SCHEDULE ROWS, STAGE 2. ONE TRANSACTION. ==='

-- PSQL VARIABLES ARE NOT INTERPOLATED INSIDE A DOLLAR-QUOTED BODY. Everything
-- between $$ and $$ reaches the server verbatim, so `:'staff10_expected_count'`
-- written inside the block below is not substituted: it is sent as those
-- characters and the server answers `syntax error at or near ":"`.
--
-- FOUND BY REHEARSING THIS FILE, and it is the reason rehearsals are run: the
-- first cut declared both carries with :'...' inside the block and died on the
-- DECLARE section, BEFORE a single precondition had executed. On production that
-- is a sitting that stops on a substitution rule, not on the data.
--
-- So the two carries are lifted into session settings HERE, in plain SQL where
-- psql does substitute, and read back inside the block with current_setting.
-- A missing -v still fails loudly, on this line, before anything is read.
SELECT set_config('staff10.expected_count',  :'staff10_expected_count',  false) AS expected_count,
       set_config('staff10.expected_digest', :'staff10_expected_digest', false) AS expected_digest;

DO $$
DECLARE
  c_jp_cb   constant uuid := '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'; -- JP, the Castelo Branco row
  c_jp_lv   constant uuid := '0c1a0000-0000-4000-8000-000000000001'; -- JP, the Linda-a-Velha row
  c_lv_loc  constant uuid := 'de000002-0000-0000-0000-000000000001'; -- OsteoJP (LV)
  c_cb_loc  constant uuid := 'de000002-0000-0000-0000-000000000002'; -- OsteoJP (CB)
  c_action  constant text := 'staff.jp_lv_schedule_rows.retire';
  c_block_day constant date := DATE '2026-09-30';

  v_cb            record;
  v_lv            record;
  v_tenant        uuid;
  v_today         date;
  v_expect_count  int  := current_setting('staff10.expected_count')::int;
  v_expect_digest text := current_setting('staff10.expected_digest');

  v_retire_covered uuid[];
  v_retire_window  uuid[];
  v_retire_past    uuid[];
  v_move_saturday  uuid[];
  v_block          record;
  v_block_json     jsonb := 'null'::jsonb;

  v_count         int;
  v_digest        text;
  v_collisions    int;
  v_blocks        int;

  v_appt_before       int;
  v_appt_cb_before    int;
  v_appt_lv_before    int;
  v_cb_at_cb_before   int;
  v_lv_sat_before     int;
  v_inactive_before   int;

  v_appt_after        int;
  v_cb_at_cb_after    int;
  v_lv_sat_after      int;
  v_inactive_after    int;
  v_cb_lv_future      int;
  v_cb_lv_in_window   int;

  v_n int;
BEGIN
  v_today := (now() AT TIME ZONE 'Europe/Lisbon')::date;

  -- ==========================================================================
  -- P1. BOTH ROWS EXIST, IN ONE TENANT, AND EACH IS INSTALLED WHERE IT BELONGS.
  -- ==========================================================================
  SELECT id, tenant_id, full_name, is_active INTO v_cb FROM public.users WHERE id = c_jp_cb;
  IF NOT FOUND THEN RAISE EXCEPTION 'STOP: JP(cb) % does not exist', c_jp_cb; END IF;

  SELECT id, tenant_id, full_name, is_active INTO v_lv FROM public.users WHERE id = c_jp_lv;
  IF NOT FOUND THEN RAISE EXCEPTION 'STOP: JP(lv) % does not exist', c_jp_lv; END IF;

  IF v_cb.tenant_id IS DISTINCT FROM v_lv.tenant_id THEN
    RAISE EXCEPTION 'STOP: the two JP rows are in different tenants (% and %)', v_cb.tenant_id, v_lv.tenant_id;
  END IF;
  v_tenant := v_cb.tenant_id;

  -- JP(lv) is what the clinic falls back to at Linda-a-Velha. If it is inactive,
  -- retiring JP(cb)'s LV rows would leave the clinic with no JP at all there.
  IF NOT v_lv.is_active THEN
    RAISE EXCEPTION 'STOP: JP(lv) is inactive; retiring JP(cb) at LV would leave nobody covering it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff_locations
                  WHERE user_id = c_jp_cb AND location_id = c_cb_loc) THEN
    RAISE EXCEPTION 'STOP: JP(cb) is not installed at Castelo Branco';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_locations
                  WHERE user_id = c_jp_lv AND location_id = c_lv_loc) THEN
    RAISE EXCEPTION 'STOP: JP(lv) is not installed at Linda-a-Velha; the moved Saturdays would be unreachable';
  END IF;

  RAISE NOTICE 'P1 tenant %, today (Lisbon) %', v_tenant, v_today;

  -- ==========================================================================
  -- P2. A RE-RUN IS REFUSED ON THIS BLOCK'S OWN AUDIT ROW.
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM public.audit_log WHERE action = c_action) THEN
    RAISE EXCEPTION 'STOP: this block has already run (audit row % present)', c_action;
  END IF;

  -- ==========================================================================
  -- P3. RE-DERIVE THE FIVE TARGET SETS. These five queries are stage 1's,
  --     verbatim. Nothing is pinned; nothing is taken from the dispatch.
  -- ==========================================================================
  SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}'::uuid[]) INTO v_retire_covered
    FROM public.availability_templates c
   WHERE c.user_id = c_jp_cb AND c.location_id = c_lv_loc AND c.is_active
     AND c.valid_from IS NOT NULL AND c.valid_from = c.valid_until
     AND EXISTS (SELECT 1 FROM public.availability_templates o
                  WHERE o.user_id = c_jp_lv AND o.location_id = c_lv_loc AND o.is_active
                    AND o.weekday = c.weekday AND o.start_time = c.start_time
                    AND o.end_time = c.end_time
                    AND o.valid_from = c.valid_from AND o.valid_until = c.valid_until);

  SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}'::uuid[]) INTO v_retire_window
    FROM public.availability_templates c
   WHERE c.user_id = c_jp_cb AND c.location_id = c_lv_loc AND c.is_active
     AND c.weekday = 6
     AND NOT (c.valid_from IS NOT NULL AND c.valid_from = c.valid_until);

  SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}'::uuid[]) INTO v_retire_past
    FROM public.availability_templates c
   WHERE c.user_id = c_jp_cb AND c.location_id = c_lv_loc AND c.is_active
     AND c.valid_from IS NOT NULL AND c.valid_from = c.valid_until
     AND c.valid_until < v_today
     AND NOT (c.id = ANY(v_retire_covered));

  SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}'::uuid[]) INTO v_move_saturday
    FROM public.availability_templates c
   WHERE c.user_id = c_jp_cb AND c.location_id = c_lv_loc AND c.is_active
     AND c.valid_from IS NOT NULL AND c.valid_from = c.valid_until
     AND c.weekday = 6 AND c.valid_from >= v_today
     AND NOT (c.id = ANY(v_retire_covered));

  SELECT t.* INTO v_block FROM public.time_off t
   WHERE t.user_id = c_jp_cb
     AND (t.starts_at AT TIME ZONE 'Europe/Lisbon')::date <= c_block_day
     AND (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::date >  c_block_day;

  SELECT count(*)::int INTO v_blocks FROM public.time_off t
   WHERE t.user_id = c_jp_cb
     AND (t.starts_at AT TIME ZONE 'Europe/Lisbon')::date <= c_block_day
     AND (t.ends_at   AT TIME ZONE 'Europe/Lisbon')::date >  c_block_day;
  IF v_blocks > 1 THEN
    RAISE EXCEPTION 'STOP: % JP(cb) blocks cover %; this op deletes exactly one', v_blocks, c_block_day;
  END IF;

  RAISE NOTICE 'P3 retire_covered % / retire_sat_window % / retire_past % / move_saturday % / blocks %',
    coalesce(array_length(v_retire_covered, 1), 0),
    coalesce(array_length(v_retire_window, 1), 0),
    coalesce(array_length(v_retire_past, 1), 0),
    coalesce(array_length(v_move_saturday, 1), 0),
    v_blocks;

  -- ==========================================================================
  -- P4. THE CARRIES. Count AND digest, both, against what stage 1 printed.
  -- ==========================================================================
  WITH targets AS (
    SELECT 'retire_covered'   AS action, unnest(v_retire_covered) AS id
    UNION ALL SELECT 'move_saturday',      unnest(v_move_saturday)
    UNION ALL SELECT 'retire_sat_window',  unnest(v_retire_window)
    UNION ALL SELECT 'retire_past',        unnest(v_retire_past)
    UNION ALL SELECT 'delete_block',       v_block.id WHERE v_block.id IS NOT NULL
  )
  SELECT count(*)::int,
         coalesce(md5(string_agg(action || ':' || id::text, ',' ORDER BY action, id)), 'empty')
    INTO v_count, v_digest
    FROM targets;

  RAISE NOTICE 'P4 recomputed count % digest %; stage 1 said count % digest %',
    v_count, v_digest, v_expect_count, v_expect_digest;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'STOP: there is nothing to do (0 target rows). That is a finished state, not a failure';
  END IF;
  IF v_count <> v_expect_count THEN
    RAISE EXCEPTION 'STOP: the target set has changed since stage 1 (% rows now, stage 1 saw %)', v_count, v_expect_count;
  END IF;
  IF v_digest IS DISTINCT FROM v_expect_digest THEN
    RAISE EXCEPTION 'STOP: the target SET has changed since stage 1 (same size, different rows). Re-run stage 1';
  END IF;

  -- ==========================================================================
  -- P5. A MOVE MUST NOT COLLIDE. availability_templates_dedupe_uq is NULLS NOT
  --     DISTINCT over (tenant, user, location, weekday, start, end, from, until),
  --     so re-pointing user_id onto a row JP(lv) already holds identically would
  --     abort on the constraint. Refuse with a sentence instead.
  -- ==========================================================================
  SELECT count(*)::int INTO v_collisions
    FROM public.availability_templates c
   WHERE c.id = ANY(v_move_saturday)
     AND EXISTS (SELECT 1 FROM public.availability_templates o
                  WHERE o.tenant_id = c.tenant_id AND o.user_id = c_jp_lv
                    AND o.location_id = c.location_id AND o.weekday = c.weekday
                    AND o.start_time = c.start_time AND o.end_time = c.end_time
                    AND o.valid_from  IS NOT DISTINCT FROM c.valid_from
                    AND o.valid_until IS NOT DISTINCT FROM c.valid_until);
  IF v_collisions > 0 THEN
    RAISE EXCEPTION 'STOP: % Saturday row(s) to be moved already exist identically on JP(lv)', v_collisions;
  END IF;

  -- ==========================================================================
  -- P5b. NOTHING MAY BE LEFT BEHIND. The four sets above must between them
  --      account for every active LV row from today forward. A row that is in
  --      none of them - a future LV row on a weekday JP(lv) does not cover, or
  --      a recurring non-Saturday LV window - would survive the write, and the
  --      final assertion would then abort the sitting having written nothing.
  --      Refuse here, with the sentence, rather than there with an invariant.
  --      Retiring it blind takes cover off a day the clinic is open; moving it
  --      blind gives JP(lv) hours nobody ruled on. Both are new decisions.
  -- ==========================================================================
  SELECT count(*)::int INTO v_n
    FROM public.availability_templates c
   WHERE c.user_id = c_jp_cb AND c.location_id = c_lv_loc AND c.is_active
     AND (c.valid_until IS NULL OR c.valid_until >= v_today)
     AND NOT (c.id = ANY(v_retire_covered))
     AND NOT (c.id = ANY(v_retire_window))
     AND NOT (c.id = ANY(v_retire_past))
     AND NOT (c.id = ANY(v_move_saturday));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'STOP: % future JP(cb) LV row(s) are in no target set; stage 1 refusal R8 covers this. Re-scope before running', v_n;
  END IF;

  -- ==========================================================================
  -- P6. THE BASELINES. Every one is re-read after the write and asserted.
  -- ==========================================================================
  SELECT count(*)::int INTO v_appt_before    FROM public.appointments;
  SELECT count(*)::int INTO v_appt_cb_before FROM public.appointments WHERE practitioner_id = c_jp_cb;
  SELECT count(*)::int INTO v_appt_lv_before FROM public.appointments WHERE practitioner_id = c_jp_lv;
  SELECT count(*)::int INTO v_cb_at_cb_before FROM public.availability_templates
   WHERE user_id = c_jp_cb AND location_id = c_cb_loc AND is_active;
  SELECT count(*)::int INTO v_lv_sat_before FROM public.availability_templates
   WHERE user_id = c_jp_lv AND location_id = c_lv_loc AND is_active AND weekday = 6;
  SELECT count(*)::int INTO v_inactive_before FROM public.availability_templates
   WHERE user_id = c_jp_cb AND NOT is_active;

  RAISE NOTICE 'P6 appointments % (JP(cb) %, JP(lv) %); JP(cb) active CB rows %; JP(lv) active LV Saturdays %; JP(cb) inactive rows %',
    v_appt_before, v_appt_cb_before, v_appt_lv_before, v_cb_at_cb_before, v_lv_sat_before, v_inactive_before;

  -- ==========================================================================
  -- THE WRITES.
  -- ==========================================================================
  UPDATE public.availability_templates SET is_active = false
   WHERE id = ANY(v_retire_covered) OR id = ANY(v_retire_window) OR id = ANY(v_retire_past);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> coalesce(array_length(v_retire_covered, 1), 0)
          + coalesce(array_length(v_retire_window, 1), 0)
          + coalesce(array_length(v_retire_past, 1), 0) THEN
    RAISE EXCEPTION 'STOP: retired % rows, expected %', v_n,
      coalesce(array_length(v_retire_covered, 1), 0) + coalesce(array_length(v_retire_window, 1), 0)
      + coalesce(array_length(v_retire_past, 1), 0);
  END IF;
  RAISE NOTICE 'W1 retired % schedule row(s) (is_active false)', v_n;

  UPDATE public.availability_templates SET user_id = c_jp_lv WHERE id = ANY(v_move_saturday);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> coalesce(array_length(v_move_saturday, 1), 0) THEN
    RAISE EXCEPTION 'STOP: moved % Saturday rows, expected %', v_n, coalesce(array_length(v_move_saturday, 1), 0);
  END IF;
  RAISE NOTICE 'W2 moved % Saturday row(s) to JP(lv)', v_n;

  IF v_block.id IS NOT NULL THEN
    -- The whole row, before it goes, so an undo is one insert from these values.
    v_block_json := jsonb_build_object(
      'id', v_block.id, 'tenant_id', v_block.tenant_id, 'user_id', v_block.user_id,
      'starts_at', v_block.starts_at, 'ends_at', v_block.ends_at,
      'reason', v_block.reason::text, 'note', v_block.note,
      'created_at', v_block.created_at);
    DELETE FROM public.time_off WHERE id = v_block.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: deleting the 30 September block removed % rows, expected 1', v_n; END IF;
    RAISE NOTICE 'W3 deleted the % block on JP(cb) (recorded in the audit row)', c_block_day;
  ELSE
    RAISE NOTICE 'W3 no JP(cb) block covers %; nothing deleted', c_block_day;
  END IF;

  -- ==========================================================================
  -- P7. NOTHING ELSE MOVED. Asserted, not promised.
  -- ==========================================================================
  SELECT count(*)::int INTO v_appt_after FROM public.appointments;
  IF v_appt_after <> v_appt_before THEN
    RAISE EXCEPTION 'STOP: the appointment count moved (% -> %); this op writes no appointment', v_appt_before, v_appt_after;
  END IF;
  IF (SELECT count(*)::int FROM public.appointments WHERE practitioner_id = c_jp_cb) <> v_appt_cb_before
     OR (SELECT count(*)::int FROM public.appointments WHERE practitioner_id = c_jp_lv) <> v_appt_lv_before THEN
    RAISE EXCEPTION 'STOP: an appointment changed hands; no stage of this op may do that';
  END IF;

  SELECT count(*)::int INTO v_cb_at_cb_after FROM public.availability_templates
   WHERE user_id = c_jp_cb AND location_id = c_cb_loc AND is_active;
  IF v_cb_at_cb_after <> v_cb_at_cb_before THEN
    RAISE EXCEPTION 'STOP: JP(cb) Castelo Branco rows changed (% -> %)', v_cb_at_cb_before, v_cb_at_cb_after;
  END IF;

  SELECT count(*)::int INTO v_lv_sat_after FROM public.availability_templates
   WHERE user_id = c_jp_lv AND location_id = c_lv_loc AND is_active AND weekday = 6;
  IF v_lv_sat_after <> v_lv_sat_before + coalesce(array_length(v_move_saturday, 1), 0) THEN
    RAISE EXCEPTION 'STOP: JP(lv) Saturdays are %, expected %',
      v_lv_sat_after, v_lv_sat_before + coalesce(array_length(v_move_saturday, 1), 0);
  END IF;

  SELECT count(*)::int INTO v_cb_lv_future FROM public.availability_templates
   WHERE user_id = c_jp_cb AND location_id = c_lv_loc AND is_active
     AND (valid_until IS NULL OR valid_until >= v_today);
  IF v_cb_lv_future <> 0 THEN
    RAISE EXCEPTION 'STOP: JP(cb) still holds % active LV row(s) from today forward', v_cb_lv_future;
  END IF;

  SELECT count(*)::int INTO v_cb_lv_in_window FROM public.availability_templates
   WHERE user_id = c_jp_cb AND location_id = c_lv_loc AND is_active
     AND (valid_from  IS NULL OR valid_from  <= v_today)
     AND (valid_until IS NULL OR valid_until >= v_today);
  IF v_cb_lv_in_window <> 0 THEN
    RAISE EXCEPTION 'STOP: JP(cb) is still on the LV portal list (% row(s) active and in window)', v_cb_lv_in_window;
  END IF;

  -- ==========================================================================
  -- THE AUDIT ROW. Counts and ids only: no patient data, no free text. The
  -- post-check reads every number back out of here rather than being told one.
  -- ==========================================================================
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_tenant, NULL, c_action, 'user', c_jp_cb, jsonb_build_object(
    'expected_count',        v_expect_count,
    'expected_digest',       v_expect_digest,
    'retired_covered_ids',   to_jsonb(v_retire_covered),
    'retired_sat_window_ids', to_jsonb(v_retire_window),
    'retired_past_ids',      to_jsonb(v_retire_past),
    'moved_saturday_ids',    to_jsonb(v_move_saturday),
    'retired_count',         coalesce(array_length(v_retire_covered, 1), 0)
                             + coalesce(array_length(v_retire_window, 1), 0)
                             + coalesce(array_length(v_retire_past, 1), 0),
    'moved_count',           coalesce(array_length(v_move_saturday, 1), 0),
    'deleted_blocks',        v_blocks,
    'deleted_block',         v_block_json,
    'appointments_before',   v_appt_before,
    'appt_cb_before',        v_appt_cb_before,
    'appt_lv_before',        v_appt_lv_before,
    'cb_at_cb_before',       v_cb_at_cb_before,
    'lv_saturdays_before',   v_lv_sat_before,
    'cb_inactive_before',    v_inactive_before,
    'today_lisbon',          v_today
  ));

  RAISE NOTICE 'STAFF-10 STAGE 2 DONE: % retired, % moved, % block(s) deleted; JP(cb) holds 0 active LV rows from today forward',
    coalesce(array_length(v_retire_covered, 1), 0) + coalesce(array_length(v_retire_window, 1), 0)
    + coalesce(array_length(v_retire_past, 1), 0),
    coalesce(array_length(v_move_saturday, 1), 0),
    v_blocks;
END $$;

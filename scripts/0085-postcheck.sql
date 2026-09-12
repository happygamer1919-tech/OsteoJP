-- ===================================================================
-- 0085 POST-CHECK. Run in STAGE 2 of docs/migration-apply-0085.md.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v journal_before=<J> -v locations_before=<L> -v cb_before=<C> \
--        -f /tmp/0085-postcheck.sql 2>&1 | tee /tmp/0085-postcheck.out
--
-- SR-59: J, L and C come out of THIS RUN's pre-check transcript, parsed by the
-- stage, never typed. Like the pre-check, this file lives on MAIN and is read
-- out of origin/main by path and pinned by sha256.
--
-- EVERY VERDICT MUST READ OK, AND THE ARMS BLOCK MUST PRINT ITS NOTICE. Any FAIL,
-- or any ERROR, halts and is reported IMMEDIATELY (SR-50(c)): a half-applied
-- production schema does not wait for a report.
--
-- ===================================================================
-- THE ARMS WRITE NOTHING, ON EITHER PATH
-- ===================================================================
-- Each probe is an UPDATE inside its own PL/pgSQL sub-block. When the constraint
-- refuses it, the sub-block's savepoint is rolled back and nothing was written.
-- When a constraint is MISSING and the UPDATE succeeds, the next line raises,
-- the exception leaves the DO block, and Postgres aborts the whole statement -
-- the accepted UPDATE with it. The one probe that is SUPPOSED to succeed (0e)
-- raises its own SQLSTATE to roll itself back. No path leaves a row changed.
--
-- WHY ARMS AS WELL AS THE DEFINITION TEXT. Rows 8-11 compare
-- pg_get_constraintdef() with the exact text Postgres normalised the migration
-- to, on a rehearsal database. That already refuses a `CHECK (false)`. The arms
-- prove the other half: that each constraint refuses the row it exists for, BY
-- NAME - an UPDATE refused by the wrong constraint is a FAIL, not a pass - and
-- that a legitimate closure is still accepted.

\pset pager off
\timing off

\echo ''
\echo '=== 0085 POST-CHECK: the arms first (they write nothing) ==='

DO $$
DECLARE
  cb uuid;
  cn text;
  accepted boolean := false;
BEGIN
  SELECT id INTO cb FROM public.locations WHERE name LIKE '%(CB)%' ORDER BY id LIMIT 1;
  IF cb IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): no "(CB)" row to probe - the pre-check should have halted on row 10.';
  END IF;

  -- 0a. Half a closure pair.
  BEGIN
    UPDATE public.locations SET midday_closed_to = NULL WHERE id = cb;
    RAISE EXCEPTION 'POST-CHECK FAILED (0a): a half-set closure pair was ACCEPTED.';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
    IF cn IS DISTINCT FROM 'locations_midday_pair' THEN
      RAISE EXCEPTION 'POST-CHECK FAILED (0a): refused by % instead of locations_midday_pair.', cn;
    END IF;
  END;

  -- 0b. A closure that ends before it starts.
  BEGIN
    UPDATE public.locations SET midday_closed_from = '14:00', midday_closed_to = '13:00' WHERE id = cb;
    RAISE EXCEPTION 'POST-CHECK FAILED (0b): a backwards closure was ACCEPTED.';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
    IF cn IS DISTINCT FROM 'locations_midday_order' THEN
      RAISE EXCEPTION 'POST-CHECK FAILED (0b): refused by % instead of locations_midday_order.', cn;
    END IF;
  END;

  -- 0c. A closure that starts before the clinic opens.
  BEGIN
    UPDATE public.locations SET midday_closed_from = '07:00', midday_closed_to = '08:30' WHERE id = cb;
    RAISE EXCEPTION 'POST-CHECK FAILED (0c): a closure outside opening hours was ACCEPTED.';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
    IF cn IS DISTINCT FROM 'locations_midday_inside_hours' THEN
      RAISE EXCEPTION 'POST-CHECK FAILED (0c): refused by % instead of locations_midday_inside_hours.', cn;
    END IF;
  END;

  -- 0d. A clinic that closes when it opens. The closure is cleared in the same
  -- statement so that ONLY locations_open_before_close can object: with the
  -- 13:00-14:00 closure left in place, inside_hours would fire first (Postgres
  -- evaluates CHECK constraints in name order) and hide whether this one exists.
  BEGIN
    UPDATE public.locations
       SET opens_at = '20:00', midday_closed_from = NULL, midday_closed_to = NULL
     WHERE id = cb;
    RAISE EXCEPTION 'POST-CHECK FAILED (0d): a clinic closing as it opens was ACCEPTED.';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
    IF cn IS DISTINCT FROM 'locations_open_before_close' THEN
      RAISE EXCEPTION 'POST-CHECK FAILED (0d): refused by % instead of locations_open_before_close.', cn;
    END IF;
  END;

  -- 0e. NOT a refusal. A legitimate closure must be ACCEPTED - four refusals
  -- are also what CHECK (false) would produce. It rolls itself back.
  BEGIN
    UPDATE public.locations SET midday_closed_from = '12:30', midday_closed_to = '13:30' WHERE id = cb;
    RAISE EXCEPTION USING ERRCODE = 'OJ085', MESSAGE = 'probe 0e rolled back on purpose';
  EXCEPTION WHEN SQLSTATE 'OJ085' THEN
    accepted := true;
  END;
  IF NOT accepted THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (0e): a valid 12:30-13:30 closure was not accepted.';
  END IF;

  RAISE NOTICE 'ARMS 0a-0e OK: four refusals fired, each by its own constraint, and a valid closure was accepted and rolled back.';
END
$$;

\echo ''
\echo '=== 0085 POST-CHECK: every row must read OK ==='

SELECT '1. journal = before + 1',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       (:'journal_before'::int + 1)::text,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'journal_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END;

-- THE FILE APPLIED IS THE FILE APPROVED. The only row that proves it.
SELECT '2. 0085 present by sha256 of the approved file',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. 0084 STILL present by file hash',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36')
            THEN 'OK' ELSE 'FAIL' END;

-- THE FOUR COLUMNS, type + nullability + default read back as Postgres stores them.
SELECT '4. opens_at is time NOT NULL DEFAULT 08:00',
       (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'opens_at'),
       'time without time zone NO ''08:00:00''::time without time zone',
       CASE WHEN (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'opens_at')
               = 'time without time zone NO ''08:00:00''::time without time zone'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. closes_at is time NOT NULL DEFAULT 20:00',
       (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'closes_at'),
       'time without time zone NO ''20:00:00''::time without time zone',
       CASE WHEN (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'closes_at')
               = 'time without time zone NO ''20:00:00''::time without time zone'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '6. midday_closed_from is nullable time, no default',
       (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'midday_closed_from'),
       'time without time zone YES <none>',
       CASE WHEN (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'midday_closed_from')
               = 'time without time zone YES <none>'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. midday_closed_to is nullable time, no default',
       (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'midday_closed_to'),
       'time without time zone YES <none>',
       CASE WHEN (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'midday_closed_to')
               = 'time without time zone YES <none>'
            THEN 'OK' ELSE 'FAIL' END;

-- THE FOUR CONSTRAINTS, VALIDATED, and each one's text exactly as Postgres
-- normalised the migration on a rehearsal database. A constraint with the right
-- name and the wrong body fails here.
SELECT '8. locations_open_before_close',
       coalesce((SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_open_before_close'), 'MISSING'),
       'true CHECK ((opens_at < closes_at))',
       CASE WHEN (SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                   WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_open_before_close')
               = 'true CHECK ((opens_at < closes_at))'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. locations_midday_pair',
       coalesce((SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_midday_pair'), 'MISSING'),
       'true CHECK (((midday_closed_from IS NULL) = (midday_closed_to IS NULL)))',
       CASE WHEN (SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                   WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_midday_pair')
               = 'true CHECK (((midday_closed_from IS NULL) = (midday_closed_to IS NULL)))'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. locations_midday_order',
       coalesce((SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_midday_order'), 'MISSING'),
       'true CHECK (((midday_closed_from IS NULL) OR (midday_closed_from < midday_closed_to)))',
       CASE WHEN (SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                   WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_midday_order')
               = 'true CHECK (((midday_closed_from IS NULL) OR (midday_closed_from < midday_closed_to)))'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. locations_midday_inside_hours',
       coalesce((SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_midday_inside_hours'), 'MISSING'),
       'true CHECK (((midday_closed_from IS NULL) OR ((midday_closed_from >= opens_at) AND (midday_closed_to <= closes_at))))',
       CASE WHEN (SELECT convalidated::text || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
                   WHERE conrelid = 'public.locations'::regclass AND conname = 'locations_midday_inside_hours')
               = 'true CHECK (((midday_closed_from IS NULL) OR ((midday_closed_from >= opens_at) AND (midday_closed_to <= closes_at))))'
            THEN 'OK' ELSE 'FAIL' END;

-- THE DATA. The migration's only row write is CB's closure; everything else must
-- be exactly the defaults it claims leave behaviour unchanged.
SELECT '12. locations rows unchanged',
       (SELECT count(*)::text FROM public.locations),
       :'locations_before',
       CASE WHEN (SELECT count(*) FROM public.locations) = :'locations_before'::int
            THEN 'OK' ELSE 'FAIL' END;

SELECT '13. every "(CB)" row carries 13:00-14:00',
       (SELECT count(*)::text FROM public.locations
         WHERE name LIKE '%(CB)%' AND midday_closed_from = '13:00' AND midday_closed_to = '14:00'),
       :'cb_before',
       CASE WHEN (SELECT count(*) FROM public.locations
                   WHERE name LIKE '%(CB)%' AND midday_closed_from = '13:00' AND midday_closed_to = '14:00')
               = :'cb_before'::int
            THEN 'OK' ELSE 'FAIL' END;

SELECT '14. NO other clinic acquired a closure',
       (SELECT count(*)::text FROM public.locations
         WHERE midday_closed_from IS NOT NULL AND name NOT LIKE '%(CB)%'),
       '0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.locations
                              WHERE midday_closed_from IS NOT NULL AND name NOT LIKE '%(CB)%')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '15. every clinic reads 08:00-20:00 (today''s compiled-in day)',
       (SELECT count(*)::text FROM public.locations
         WHERE opens_at <> '08:00' OR closes_at <> '20:00'),
       '0 rows differ',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.locations
                              WHERE opens_at <> '08:00' OR closes_at <> '20:00')
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END POST-CHECK. Any FAIL, or a missing ARMS notice, halts. ==='

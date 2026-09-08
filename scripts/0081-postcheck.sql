-- ===================================================================
-- 0081 POST-CHECK. Every verdict must read OK.
-- ===================================================================
-- Run AFTER `pnpm db:migrate`. Any FAIL halts and is reported IMMEDIATELY,
-- breaking SR-48's one-report rule: a half-applied production schema is not a
-- thing that waits for a report (SR-50 c).
--
-- IT WRITES NOTHING PERMANENT. One arm needs to prove the CHECK constraint
-- actually REFUSES a third value, and the only way to know a constraint fires
-- is to make it fire. That arm runs inside a sub-transaction that is ALWAYS
-- rolled back, in a DO block, and it asserts the row count is unchanged
-- afterwards. See the block itself for why an assertion about pg_constraint
-- would not have been the same claim.
--
-- SUBSTITUTE THE FOUR NUMBERS the pre-check printed where the file says
-- :'journal_before' etc. Run it as:
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v journal_before=78 -v patients_before=NNNN \
--        -v guests_before=NN -v grant_cols_before=7 \
--        -f scripts/0081-postcheck.sql
\pset pager off
\pset format aligned
\pset title '0081 POST-CHECK - every verdict must read OK'

-- ===================================================================
-- ARM 0: THE CHECK CONSTRAINT ACTUALLY REFUSES A THIRD VALUE.
-- ===================================================================
-- WHY THIS IS NOT `SELECT ... FROM pg_constraint`. That would prove a
-- constraint with the right NAME and the right TEXT exists. It would not prove
-- the database ENFORCES it, and those are different claims: a constraint added
-- NOT VALID, or one whose expression a later edit changed, satisfies the
-- catalogue read and admits the bad row anyway. This whole project's rule is
-- that a guard proves a test ran and only the assertion proves it tested the
-- right subject, so this arm makes the constraint FIRE.
--
-- IT CANNOT LEAVE A ROW BEHIND. The INSERT and the ROLLBACK are both inside the
-- exception block, the sub-transaction is rolled back on BOTH paths, and if the
-- INSERT unexpectedly SUCCEEDS the block raises rather than returning quietly -
-- an unhandled case must FAIL, not fall back.
DO $$
DECLARE
  refused boolean := false;
  rows_before bigint;
  rows_after  bigint;
BEGIN
  SELECT count(*) INTO rows_before FROM public.patients;

  BEGIN
    INSERT INTO public.patients (tenant_id, full_name, locale)
    SELECT t.id, '0081 POSTCHECK PROBE - ROLLED BACK', 'fr'
      FROM public.tenants t ORDER BY t.created_at LIMIT 1;
    -- Reached only if the CHECK did NOT fire.
    RAISE EXCEPTION
      'POST-CHECK FAILED: patients_locale_check accepted the value ''fr''. The constraint exists in name only.';
  EXCEPTION
    WHEN check_violation THEN
      refused := true;
    WHEN raise_exception THEN
      RAISE;
  END;

  IF NOT refused THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: the probe neither inserted nor was refused.';
  END IF;

  SELECT count(*) INTO rows_after FROM public.patients;
  IF rows_after <> rows_before THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: the probe changed the patients row count, % -> %.',
      rows_before, rows_after;
  END IF;

  RAISE NOTICE 'ARM 0 OK: patients_locale_check refused ''fr'' and left % rows.', rows_after;
END
$$;

SELECT 'journal = before + 1'                    AS check,
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS observed,
       (:'journal_before'::int + 1)::text        AS expected,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'journal_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END            AS verdict

UNION ALL
-- IDENTITY IS THE FILE HASH. This is the only check that proves the file
-- APPLIED is the file APPROVED; a renamed or edited file cannot satisfy it.
SELECT '0081 present by sha256 of the approved file',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT '0080 STILL present by file hash',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'patients.locale exists',
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='patients' AND column_name='locale'), 'ABSENT'),
       'text',
       CASE WHEN (SELECT data_type FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='locale') = 'text'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'patients.locale is NULLABLE',
       coalesce((SELECT is_nullable FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='patients' AND column_name='locale'), 'ABSENT'),
       'YES',
       CASE WHEN (SELECT is_nullable FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='locale') = 'YES'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- NO DEFAULT. A DEFAULT of 'pt' would make every row written from now on claim
-- a choice the patient never made, which is the same corruption a backfill
-- would cause, arriving one row at a time instead of all at once.
SELECT 'patients.locale has NO default',
       coalesce((SELECT column_default FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='patients' AND column_name='locale'), 'none'),
       'none',
       CASE WHEN (SELECT column_default FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='locale') IS NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'guest_booking_requests.locale exists',
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='guest_booking_requests' AND column_name='locale'), 'ABSENT'),
       'text',
       CASE WHEN (SELECT data_type FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='guest_booking_requests' AND column_name='locale') = 'text'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'guest_booking_requests.locale is NULLABLE',
       coalesce((SELECT is_nullable FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='guest_booking_requests' AND column_name='locale'), 'ABSENT'),
       'YES',
       CASE WHEN (SELECT is_nullable FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='guest_booking_requests' AND column_name='locale') = 'YES'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'guest_booking_requests.locale has NO default',
       coalesce((SELECT column_default FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='guest_booking_requests' AND column_name='locale'), 'none'),
       'none',
       CASE WHEN (SELECT column_default FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='guest_booking_requests' AND column_name='locale') IS NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'both CHECK constraints exist and are VALIDATED',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname IN ('patients_locale_check','guest_booking_requests_locale_check')
           AND contype = 'c' AND convalidated),
       '2',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conname IN ('patients_locale_check','guest_booking_requests_locale_check')
                     AND contype = 'c' AND convalidated) = 2
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- ZERO ROWS WRITTEN. THREE INDEPENDENT WAYS OF ASKING.
-- ==================================================================
SELECT 'patients row count UNCHANGED',
       (SELECT count(*)::text FROM public.patients),
       :'patients_before',
       CASE WHEN (SELECT count(*) FROM public.patients) = :'patients_before'::bigint
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'guest_booking_requests row count UNCHANGED',
       (SELECT count(*)::text FROM public.guest_booking_requests),
       :'guests_before',
       CASE WHEN (SELECT count(*) FROM public.guest_booking_requests) = :'guests_before'::bigint
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE ONE THAT MATTERS MOST. NULL is never backfilled to 'pt': every existing
-- row must still carry NULL, so a non-NULL count of anything but zero means a
-- backfill happened and the third state is gone.
SELECT 'EVERY patients.locale is NULL (no backfill)',
       (SELECT count(*)::text FROM public.patients WHERE locale IS NOT NULL),
       '0',
       CASE WHEN (SELECT count(*) FROM public.patients WHERE locale IS NOT NULL) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'EVERY guest_booking_requests.locale is NULL (no backfill)',
       (SELECT count(*)::text FROM public.guest_booking_requests WHERE locale IS NOT NULL),
       '0',
       CASE WHEN (SELECT count(*) FROM public.guest_booking_requests WHERE locale IS NOT NULL) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE GRANT DID NOT MOVE, IN EITHER DIRECTION.
-- ==================================================================
-- Unchanged is the CORRECT outcome and it is asserted rather than assumed:
-- `locale` must NOT have become patient-writable (this file grants nothing),
-- and the six columns 0019/0020 granted must NOT have been disturbed, because
-- the portal's profile PATCH fails with 42501 if any of them goes missing.
SELECT 'patient-role UPDATE columns on patients UNCHANGED',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='patients'
           AND grantee='patient' AND privilege_type='UPDATE'),
       :'grant_cols_before',
       CASE WHEN (SELECT count(*) FROM information_schema.column_privileges
                   WHERE table_schema='public' AND table_name='patients'
                     AND grantee='patient' AND privilege_type='UPDATE') = :'grant_cols_before'::int
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'locale is NOT patient-writable (expected; see the migration header)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.column_privileges
                          WHERE table_schema='public' AND table_name='patients'
                            AND grantee='patient' AND privilege_type='UPDATE' AND column_name='locale')
            THEN 'writable' ELSE 'not writable' END,
       'not writable',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.column_privileges
                          WHERE table_schema='public' AND table_name='patients'
                            AND grantee='patient' AND privilege_type='UPDATE' AND column_name='locale')
            THEN 'FAIL' ELSE 'OK' END;

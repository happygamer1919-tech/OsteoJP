-- ===================================================================
-- 0081 PRE-CHECK. READ-ONLY. Nothing writes. Every verdict must read OK.
-- ===================================================================
-- Run BEFORE `pnpm db:migrate`. Any FAIL halts: do not retry, adjust or work
-- around it (SR-50 b). It prints `journal_rows_before` and
-- `patients_rows_before` - CARRY BOTH NUMBERS INTO THE POST-CHECK, because the
-- post-check proves this migration wrote no data and it cannot prove that
-- against a number nobody wrote down.
\pset pager off
\pset format aligned
\pset title '0081 PRE-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'PRE-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT = 'That is the journal drizzle-kit migrate writes; supabase db reset writes a DIFFERENT one. Check the connection target.';
  END IF;
END
$$;

SELECT 'journal_rows_before'                    AS check,
       count(*)::text                           AS observed,
       'carry this into the post-check'         AS expected,
       'OK'                                     AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'patients_rows_before',
       (SELECT count(*)::text FROM public.patients),
       'carry this into the post-check',
       'OK'

UNION ALL
SELECT 'guest_booking_requests_rows_before',
       (SELECT count(*)::text FROM public.guest_booking_requests),
       'carry this into the post-check',
       'OK'

UNION ALL
-- 0081 MUST BE ABSENT. Identity is the FILE HASH and never `id`: `id` is a
-- SERIAL and stopped matching the tag at the 0076/0077 gap, so the tag, the
-- journal idx and the row id are three different numbers.
SELECT '0081 is NOT yet applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'present' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
SELECT '0080 IS applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE 7.0b ROW. THE ONLY CHECK THAT CATCHES A SILENT SKIP *BEFORE*
-- THE APPLY RATHER THAN AFTER IT.
-- ==================================================================
-- drizzle applies a migration only when its journal `when` is STRICTLY GREATER
-- than the newest created_at already in the table (pg-core/dialect.js:
-- `if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)`).
-- A file whose `when` is not greater is SKIPPED and `db:migrate` still prints
-- "migrations applied successfully". A post-check asserting the columns exist
-- catches it too, but only after everybody has been told the apply worked.
-- 0081's journal `when` is 1787501200000.
SELECT 'newest applied created_at < 0081 when',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1787501200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1787501200000
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- BOTH COLUMNS MUST BE ABSENT. The migration has no IF NOT EXISTS, so a column
-- that already exists raises 42701 and the apply stops - but finding out here
-- costs nothing and finding out there costs a failed production transaction.
SELECT 'patients.locale absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='patients'
                            AND column_name='locale')
            THEN 'PRESENT' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='patients'
                            AND column_name='locale')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
SELECT 'guest_booking_requests.locale absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='guest_booking_requests'
                            AND column_name='locale')
            THEN 'PRESENT' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='guest_booking_requests'
                            AND column_name='locale')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
-- Neither constraint name may be taken. A name collision would abort the ALTER
-- halfway, leaving the first table changed and the second not.
SELECT 'neither locale CHECK name is taken',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname IN ('patients_locale_check','guest_booking_requests_locale_check')),
       '0',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conname IN ('patients_locale_check','guest_booking_requests_locale_check')) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- Both target tables must exist. `guest_booking_requests` arrived in 0063 and
-- is the younger of the two.
SELECT 'both target tables exist',
       CASE WHEN to_regclass('public.patients') IS NOT NULL
             AND to_regclass('public.guest_booking_requests') IS NOT NULL
            THEN 'both present' ELSE 'MISSING' END,
       'both present',
       CASE WHEN to_regclass('public.patients') IS NOT NULL
             AND to_regclass('public.guest_booking_requests') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE COLUMN-LEVEL GRANT, OBSERVED RATHER THAN ASSUMED.
-- ==================================================================
-- 0019 and 0020 gave the `patient` role a COLUMN-LEVEL UPDATE grant on
-- `patients`. This row records how many columns it covers BEFORE the apply, so
-- the post-check can prove the number did not move - i.e. that `locale` did NOT
-- silently become patient-writable, and equally that this migration did not
-- take away a column the portal's profile PATCH depends on.
SELECT 'patient-role UPDATE columns on patients (before)',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='patients'
           AND grantee='patient' AND privilege_type='UPDATE'),
       'carry this into the post-check',
       'OK';

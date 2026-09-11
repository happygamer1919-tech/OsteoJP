-- ===================================================================
-- 0085 PRE-CHECK. READ-ONLY. Run in STAGE 1 of docs/migration-apply-0085.md.
-- ===================================================================
-- Migration: packages/db/migrations/0085_clinic_hours_and_cb_closure.sql
--            sha256 568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1
--            journal when 1787901200000
-- Branch:    db/0085-clinic-hours-cb-closure (#1264)
--
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f /tmp/0085-precheck.sql | tee /tmp/0085-precheck.out
--
-- THIS FILE LIVES ON MAIN, NOT ON THE 0085 BRANCH. The migration's branch
-- belongs to another lane and carries no checks; adding files to it would move
-- a branch somebody else is working on. So the apply block reads this file out
-- of origin/main by path and asserts its sha256 before running it - the same
-- content pin the migration gets, from a second ref. Its identity is its bytes.
--
-- THREE ROWS ARE CARRIES (SR-59): journal_rows_before, locations_rows_before
-- and cb_rows_before. Stage 2 parses them out of THIS RUN's transcript and hands
-- them to the post-check. Nobody retypes them.
--
-- EVERY VERDICT MUST READ OK. Any FAIL halts: do not retry, adjust or work
-- around it. Report and stop.
--
-- ===================================================================
-- ROWS 3 TO 5 ARE THE QUEUE
-- ===================================================================
-- 0085's `when` is 1787901200000, above 0082 (1787601200000), 0083
-- (1787701200000) and 0084 (1787801200000). If 0085 lands while any of those is
-- still pending, the newest created_at becomes 0085's and drizzle skips the
-- earlier file for ever while printing "migrations applied successfully" (the
-- INC-07 / 0058 failure). Identity is the FILE HASH, never `id`, which is a
-- serial and stopped equalling the migration number at the 0076/0077 gap.
--
-- ===================================================================
-- ROW 10 IS THE ONE THAT CAN FAIL ON A PERFECTLY HEALTHY DATABASE
-- ===================================================================
-- 0085 seeds CB's 13:00-14:00 closure with
--   UPDATE locations ... WHERE name LIKE '%(CB)%' AND midday_closed_from IS NULL
-- It matches on the NAME because no clinic id is stable across environments.
-- ZERO matches is not an error to Postgres: the migration succeeds, every
-- post-check column row passes, and CB has no closure. So the pre-check refuses
-- unless EXACTLY ONE row matches. Zero means the production name is not in the
-- "(CB)" form the migration assumes, and 0085 must not be applied until that is
-- resolved. More than one means the seed would reach a clinic it was not
-- written for. The matched names are printed so the halt says which.

\pset pager off
\timing off

\echo ''
\echo '=== 0085 PRE-CHECK - every row must read OK ==='

SELECT '1. journal_rows_before (carry)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       'record it',
       'OK';

SELECT '2. 0085 sha256 is ABSENT from the journal',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                             WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. 0082 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. 0083 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. 0084 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '6. newest applied created_at < 0085 when (7.0b skip guard)',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1787901200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1787901200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. locations has NONE of the four 0085 columns yet',
       (SELECT coalesce(string_agg(column_name::text, ',' ORDER BY column_name), 'none')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations'
           AND column_name IN ('opens_at', 'closes_at', 'midday_closed_from', 'midday_closed_to')),
       'none',
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'locations'
                                AND column_name IN ('opens_at', 'closes_at', 'midday_closed_from', 'midday_closed_to'))
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. none of the four 0085 constraints exist yet',
       (SELECT coalesce(string_agg(conname::text, ',' ORDER BY conname), 'none')
          FROM pg_constraint
         WHERE conrelid = 'public.locations'::regclass
           AND conname IN ('locations_open_before_close', 'locations_midday_pair',
                           'locations_midday_order', 'locations_midday_inside_hours')),
       'none',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint
                              WHERE conrelid = 'public.locations'::regclass
                                AND conname IN ('locations_open_before_close', 'locations_midday_pair',
                                                'locations_midday_order', 'locations_midday_inside_hours'))
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. locations_rows_before (carry)',
       (SELECT count(*)::text FROM public.locations),
       'record it',
       'OK';

SELECT '10. cb_rows_before (carry): rows 0085''s seed will match',
       (SELECT count(*)::text FROM public.locations WHERE name LIKE '%(CB)%'),
       '= 1',
       CASE WHEN (SELECT count(*) FROM public.locations WHERE name LIKE '%(CB)%') = 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. the names row 10 matched (information, not a verdict)',
       coalesce((SELECT string_agg(name, ' / ' ORDER BY name) FROM public.locations
                  WHERE name LIKE '%(CB)%'), '(none)'),
       'one CB clinic',
       'INFO';

\echo ''
\echo '=== END PRE-CHECK. Any FAIL halts. ==='

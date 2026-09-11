-- ===================================================================
-- 0084 PRE-CHECK. READ-ONLY. Run BEFORE `pnpm db:migrate`.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/0084-precheck.sql
--
-- Print the journal count it reports and pass it to the POST-CHECK as
-- `-v expected_before=<n>`. EVERY VERDICT MUST READ OK. Any FAIL halts: do not
-- retry, adjust or work around it. Report and stop.
--
-- IDENTITY IS THE FILE HASH, NEVER `id`. `drizzle.__drizzle_migrations.id` is a
-- SERIAL - how many migrations have been applied - and it stopped equalling the
-- migration number at the 0076/0077 gap. 0084's sha256 is
--   6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36
-- and "has 0084 been applied" is asked as "does any row carry that sha256".
--
-- ===================================================================
-- ROW 5 IS THE ONE THAT MATTERS AND IT IS NOT ABOUT THIS MIGRATION.
-- ===================================================================
-- PORTAL-REHYDRATE 7.0b: drizzle applies a migration ONLY when its journal
-- `when` is strictly greater than the newest `created_at` already in the
-- journal. A file whose `when` is below that is SKIPPED and
-- `migrations applied successfully` is printed over it - nothing fails, the
-- pending count does not move, and the policy you asked for is simply not there.
--
-- 0084 carries when = 1787801200000. Row 5 passes whenever nothing NEWER than
-- 0084 is already applied - so it guards 0084 against being skipped, and it
-- guards nothing else.
--
-- ===================================================================
-- ROWS 8 AND 9 ARE THE QUEUE, AND ROW 5 WAS NEVER IT. Corrected 2026-09-10.
-- ===================================================================
-- This header used to say row 5 "will only pass once 0082 and 0083 have
-- landed". It passes without them. The hazard runs the OTHER way: apply 0084
-- while 0083 (when 1787701200000) is still pending, and the newest created_at
-- becomes 0084's, which is ABOVE 0083's when - so drizzle skips 0083 for ever
-- and prints "migrations applied successfully" every time it is tried. That is
-- the INC-07 / 0058 failure, and the only thing that prevents it is refusing
-- 0084 until 0082 and 0083 are in the journal by their file hashes:
--   0082  b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9
--   0083  12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d
-- If 0083's file changes before it is applied, row 9 FAILS here, which is the
-- correct outcome: this block was written against those bytes.

\pset pager off
\timing off

\echo ''
\echo '=== 0084 PRE-CHECK — every row must read OK ==='

SELECT '1. journal row count (carry to post-check)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       'record it',
       'OK';

SELECT '2. 0084 sha256 is ABSENT from the journal',
       coalesce((SELECT count(*)::text FROM drizzle.__drizzle_migrations
                 WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36'), '0'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                             WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. appointment_notes has NO delete policy yet',
       coalesce((SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                 WHERE polrelid = to_regclass('public.appointment_notes') AND polcmd = 'd'), 'none'),
       'none',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policy
                             WHERE polrelid = to_regclass('public.appointment_notes') AND polcmd = 'd')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. patient_note_revisions has NO delete policy yet',
       coalesce((SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                 WHERE polrelid = to_regclass('public.patient_note_revisions') AND polcmd = 'd'), 'none'),
       'none',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policy
                             WHERE polrelid = to_regclass('public.patient_note_revisions') AND polcmd = 'd')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. newest applied created_at < 0084 when (7.0b skip guard)',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1787801200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1787801200000
            THEN 'OK' ELSE 'FAIL' END;

-- 0084 adds NO grant, because DELETE is already granted on both tables (0026 and
-- 0030 each granted the full DML set on purpose, so append-only denies as 0 rows
-- via RLS everywhere). Asserted rather than assumed - SR-52/SR-56: a grant is an
-- end state you read, not one you remember. If either of these FAILS, the
-- migration is incomplete as written and must gain the grant it assumes.
SELECT '6. DELETE already granted to authenticated on appointment_notes',
       coalesce((SELECT 'yes' FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='appointment_notes'
                   AND grantee='authenticated' AND privilege_type='DELETE' LIMIT 1), 'no'),
       'yes',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.role_table_grants
                         WHERE table_schema='public' AND table_name='appointment_notes'
                           AND grantee='authenticated' AND privilege_type='DELETE')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. DELETE already granted to authenticated on patient_note_revisions',
       coalesce((SELECT 'yes' FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='patient_note_revisions'
                   AND grantee='authenticated' AND privilege_type='DELETE' LIMIT 1), 'no'),
       'yes',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.role_table_grants
                         WHERE table_schema='public' AND table_name='patient_note_revisions'
                           AND grantee='authenticated' AND privilege_type='DELETE')
            THEN 'OK' ELSE 'FAIL' END;

-- THE QUEUE. See the header: without these two rows an out-of-order apply of
-- 0084 orphans 0083 for ever and nothing in the transcript says so.
SELECT '8. 0082 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. 0083 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d')
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END PRE-CHECK. Any FAIL halts. ==='

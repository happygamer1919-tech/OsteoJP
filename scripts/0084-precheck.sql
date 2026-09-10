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
-- 0084 carries when = 1787801200000. 0082 (1787601200000) and 0083 sit ahead of
-- it and are BOTH unapplied at the time of writing, so this row will only pass
-- once they have landed. That is standing rule 8 showing up as a check rather
-- than as a convention: if it FAILS, 0084 is out of order and must wait.

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

\echo ''
\echo '=== END PRE-CHECK. Any FAIL halts. ==='

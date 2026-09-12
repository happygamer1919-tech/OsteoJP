-- ===================================================================
-- 0086 PRE-CHECK. READ-ONLY. Run in STAGE 1 of docs/migration-apply-0086.md.
-- ===================================================================
-- Migration: packages/db/migrations/0086_nesa_shared_resource.sql
--            sha256 d3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99
--            journal when 1788001200000
-- Branch:    db/0086-nesa-shared-resource
--
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/0086-precheck.sql 2>&1 | tee /tmp/0086-precheck.out
--
-- THIS FILE LIVES ON THE 0086 BRANCH, beside the migration. The branch is BLUE's,
-- so unlike 0085 there is no other lane's branch to avoid moving. The apply block
-- checks the branch out and asserts this file's sha256 on disk before running it.
--
-- FOUR ROWS ARE CARRIES (SR-59): journal_rows_before, users_rows_before,
-- appointments_rows_before and clinic_rows_before, plus staff_location_links_before.
-- Stage 2 parses them out of THIS RUN's transcript and hands them to the
-- post-check. Nobody retypes them. The names are chosen so that none is a
-- substring of another, because the stage's parser matches with index().
--
-- EVERY VERDICT MUST READ OK. Any FAIL halts: do not retry, adjust or work
-- around it. Report and stop.
--
-- ===================================================================
-- ROWS 3 TO 7 ARE THE QUEUE
-- ===================================================================
-- 0086's `when` is 1788001200000, above 0082 (1787601200000), 0083
-- (1787701200000), 0084 (1787801200000) and 0085 (1787901200000). If 0086 lands
-- while any of those is still pending, the newest created_at becomes 0086's and
-- drizzle skips the earlier file for ever while printing "migrations applied
-- successfully" (the INC-07 / 0058 failure). Identity is the FILE HASH, never
-- `id`, which is a serial and stopped equalling the migration number at the
-- 0076/0077 gap.
--
-- ===================================================================
-- ROWS 10 AND 11 ARE WHY THIS CHECK EXISTS
-- ===================================================================
-- 0086 does not ADD a disjunct to appointments_rls; ALTER POLICY has no syntax
-- for that. It RESTATES the whole USING and WITH CHECK expression, character for
-- character 0078's plus one new therapist arm. So if production's policy is not
-- exactly 0078's today - a hand edit, a hotfix nobody recorded - applying 0086
-- would silently overwrite that difference. These two rows compare the md5 of
-- the live expression with 0078's, measured on a database built from main's
-- migrations (641 characters, both arms identical). A mismatch is a STOP and a
-- question for the owner, not something to reconcile in the sitting.

\pset pager off
\timing off

\echo ''
\echo '=== 0086 PRE-CHECK - every row must read OK ==='

SELECT '1. journal_rows_before (carry)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       'record it',
       'OK';

SELECT '2. 0086 sha256 is ABSENT from the journal',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                             WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99')
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

SELECT '6. 0085 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. newest applied created_at < 0086 when (7.0b skip guard)',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1788001200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1788001200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. users has NO is_shared_resource column yet',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_shared_resource'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'users'
                                AND column_name = 'is_shared_resource')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. shared_resource_practitioner_ids() does NOT exist yet',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'shared_resource_practitioner_ids'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.proname = 'shared_resource_practitioner_ids')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. appointments_rls USING is exactly 0078''s (md5, length)',
       coalesce((SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                   FROM pg_policy WHERE polname = 'appointments_rls'
                    AND polrelid = 'public.appointments'::regclass), 'MISSING'),
       'ded52b80dfb77f36a2166633c29b95db 641',
       CASE WHEN (SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                    FROM pg_policy WHERE polname = 'appointments_rls'
                     AND polrelid = 'public.appointments'::regclass)
               = 'ded52b80dfb77f36a2166633c29b95db 641'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. appointments_rls WITH CHECK is exactly 0078''s (md5, length)',
       coalesce((SELECT md5(pg_get_expr(polwithcheck, polrelid)) || ' ' || length(pg_get_expr(polwithcheck, polrelid))
                   FROM pg_policy WHERE polname = 'appointments_rls'
                    AND polrelid = 'public.appointments'::regclass), 'MISSING'),
       'ded52b80dfb77f36a2166633c29b95db 641',
       CASE WHEN (SELECT md5(pg_get_expr(polwithcheck, polrelid)) || ' ' || length(pg_get_expr(polwithcheck, polrelid))
                    FROM pg_policy WHERE polname = 'appointments_rls'
                     AND polrelid = 'public.appointments'::regclass)
               = 'ded52b80dfb77f36a2166633c29b95db 641'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '12. users_rows_before (carry)',
       (SELECT count(*)::text FROM public.users),
       'record it',
       'OK';

SELECT '13. appointments_rows_before (carry)',
       (SELECT count(*)::text FROM public.appointments),
       'record it',
       'OK';

SELECT '14. clinic_rows_before (carry)',
       (SELECT count(*)::text FROM public.locations),
       'record it',
       'OK';

SELECT '15. staff_location_links_before (carry)',
       (SELECT count(*)::text FROM public.staff_locations),
       'record it',
       'OK';

-- The post-check's arms borrow ONE existing therapist's role and ONE existing
-- patient, and create everything else inside a transaction they roll back. A
-- database without both would let 0086 apply and then halt the post-check with
-- nothing proven, so it is refused here, before the apply.
SELECT '16. the post-check arms have a therapist role and a patient to use',
       (SELECT count(*)::text FROM public.users u JOIN public.roles r ON r.id = u.role_id
         WHERE r.slug = 'therapist'
           AND EXISTS (SELECT 1 FROM public.patients p WHERE p.tenant_id = u.tenant_id)),
       '>= 1',
       CASE WHEN EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.id = u.role_id
                          WHERE r.slug = 'therapist'
                            AND EXISTS (SELECT 1 FROM public.patients p WHERE p.tenant_id = u.tenant_id))
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END PRE-CHECK. Any FAIL halts. ==='

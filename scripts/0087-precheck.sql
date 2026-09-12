-- ===================================================================
-- 0087 PRE-CHECK. READ-ONLY. Run in STAGE 1 of docs/migration-apply-0087.md.
-- ===================================================================
-- Migration: packages/db/migrations/0087_guest_clinical_intake.sql
--            sha256 ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14
--            journal when 1788101200000
-- Branch:    db/0087-guest-clinical-intake
--
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/0087-precheck.sql 2>&1 | tee /tmp/0087-precheck.out
--
-- THREE ROWS ARE CARRIES (SR-59): journal_rows_before, secdef_functions_before
-- and guest_requests_rows_before. Stage 2 parses them out of THIS RUN's
-- transcript and hands them to the post-check. Nobody retypes them. No name is a
-- substring of another, because the stage's parser matches with index().
--
-- EVERY VERDICT MUST READ OK. Any FAIL halts: do not retry, adjust or work
-- around it. Report and stop.
--
-- IDENTITY IS THE FILE HASH, NEVER `id`. drizzle.__drizzle_migrations.id is a
-- SERIAL row counter and stopped equalling the migration number at the
-- 0076/0077 gap. And `created_at` holds the migration's journal `when` (a fixed
-- constant written by drizzle), NOT the time the row was inserted, so nothing
-- below reads it as a time.
--
-- ===================================================================
-- ROWS 3 TO 8 ARE THE QUEUE
-- ===================================================================
-- 0087's `when` is 1788101200000, above 0082 (1787601200000), 0083
-- (1787701200000), 0084 (1787801200000), 0085 (1787901200000) and 0086
-- (1788001200000). drizzle applies a file only when its `when` is strictly
-- greater than the newest `created_at` already recorded. So if 0087 landed while
-- any of those is still pending, the newest created_at would become 0087's and
-- drizzle would skip the earlier file for ever while printing "migrations applied
-- successfully" (the INC-07 / 0058 failure). Rows 3 to 7 refuse unless every one
-- of them is present BY FILE HASH; row 8 refuses if anything newer than 0087 is.
-- If 0085's or 0086's file changes before it is applied, its row FAILS here,
-- which is correct: this block was written against those bytes.

\pset pager off
\timing off

\echo ''
\echo '=== 0087 PRE-CHECK - every row must read OK ==='

SELECT '1. journal_rows_before (carry)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       'record it',
       'OK';

SELECT '2. 0087 sha256 is ABSENT from the journal',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                             WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14')
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

SELECT '7. 0086 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99')
            THEN 'OK' ELSE 'FAIL' END;

-- The value printed is a journal `when` (a constant from _journal.json), not a time.
SELECT '8. newest applied journal when < 0087 when (7.0b skip guard)',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1788101200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1788101200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. type public.intake_answer does NOT exist yet',
       (SELECT count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public' AND t.typname = 'intake_answer'),
       '= 0',
       CASE WHEN to_regtype('public.intake_answer') IS NULL THEN 'OK' ELSE 'FAIL' END;

SELECT '10. table public.guest_clinical_intakes does NOT exist yet',
       coalesce(to_regclass('public.guest_clinical_intakes')::text, 'absent'),
       'absent',
       CASE WHEN to_regclass('public.guest_clinical_intakes') IS NULL THEN 'OK' ELSE 'FAIL' END;

SELECT '11. none of 0087''s three functions exists yet',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('patient_guest_request_ids', 'purge_expired_guest_intakes',
                             'guest_clinical_intake_tenant_matches')),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public'
                                AND p.proname IN ('patient_guest_request_ids', 'purge_expired_guest_intakes',
                                                  'guest_clinical_intake_tenant_matches'))
            THEN 'OK' ELSE 'FAIL' END;

-- The two policies and the patient helper call these six. A missing one would
-- make 0087 fail at CREATE, which is safe, but the sitting would then be halted
-- mid-transaction with nothing learned; refusing here says which one.
SELECT '12. the six helpers 0087''s policies call exist',
       ((to_regprocedure('public.jwt_tenant_id()') IS NOT NULL)::int
        + (to_regprocedure('public.jwt_patient_id()') IS NOT NULL)::int
        + (to_regprocedure('public.jwt_role()') IS NOT NULL)::int
        + (to_regprocedure('public.viewer_has_location_assignment()') IS NOT NULL)::int
        + (to_regprocedure('public.location_in_viewer_scope(uuid)') IS NOT NULL)::int
        + (to_regprocedure('public.clinical_therapist_sees_patient(uuid)') IS NOT NULL)::int)::text,
       '= 6',
       CASE WHEN to_regprocedure('public.jwt_tenant_id()') IS NOT NULL
             AND to_regprocedure('public.jwt_patient_id()') IS NOT NULL
             AND to_regprocedure('public.jwt_role()') IS NOT NULL
             AND to_regprocedure('public.viewer_has_location_assignment()') IS NOT NULL
             AND to_regprocedure('public.location_in_viewer_scope(uuid)') IS NOT NULL
             AND to_regprocedure('public.clinical_therapist_sees_patient(uuid)') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END;

SELECT '13. the four roles 0087 grants and revokes exist',
       (SELECT count(*)::text FROM pg_roles
         WHERE rolname IN ('anon', 'authenticated', 'patient', 'service_role')),
       '= 4',
       CASE WHEN (SELECT count(*) FROM pg_roles
                   WHERE rolname IN ('anon', 'authenticated', 'patient', 'service_role')) = 4
            THEN 'OK' ELSE 'FAIL' END;

SELECT '14. guest_booking_requests has the four columns 0087 reads',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'guest_booking_requests'
           AND column_name IN ('id', 'tenant_id', 'location_id', 'converted_patient_id')),
       '= 4',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'guest_booking_requests'
                     AND column_name IN ('id', 'tenant_id', 'location_id', 'converted_patient_id')) = 4
            THEN 'OK' ELSE 'FAIL' END;

-- The purge writes (tenant_id, actor_user_id NULL, action, entity_type,
-- entity_id, metadata jsonb). If actor_user_id were NOT NULL the job would fail
-- on its first deletion, days after this sitting, where nobody is watching.
SELECT '15. audit_log accepts the purge''s row (actor nullable, entity uuid, metadata jsonb)',
       (SELECT string_agg(column_name || ':' || udt_name || ':' || is_nullable, ',' ORDER BY column_name)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'audit_log'
           AND column_name IN ('actor_user_id', 'entity_id', 'metadata')),
       'actor_user_id:uuid:YES,entity_id:uuid:YES,metadata:jsonb:NO',
       CASE WHEN (SELECT string_agg(column_name || ':' || udt_name || ':' || is_nullable, ',' ORDER BY column_name)
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'audit_log'
                     AND column_name IN ('actor_user_id', 'entity_id', 'metadata'))
               = 'actor_user_id:uuid:YES,entity_id:uuid:YES,metadata:jsonb:NO'
            THEN 'OK' ELSE 'FAIL' END;

-- 22 = main's 21 plus 0086's shared_resource_practitioner_ids. The post-check
-- asserts this number plus exactly two, all owned by postgres.
SELECT '16. secdef_functions_before (carry): 22 in public, all owned by postgres',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       '= 22',
       CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.prosecdef) = 22
             AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prosecdef
                                AND pg_get_userbyid(p.proowner) <> 'postgres')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '17. guest_requests_rows_before (carry)',
       (SELECT count(*)::text FROM public.guest_booking_requests),
       'record it',
       'OK';

-- The post-check's arms borrow ONE existing location and ONE existing service in
-- one tenant, and create everything else inside a transaction they roll back.
-- Without both, 0087 would apply and the post-check would halt with nothing proven.
SELECT '18. the post-check arms have a tenant with a location and a service to borrow',
       (SELECT count(*)::text FROM public.locations l
         WHERE EXISTS (SELECT 1 FROM public.services s WHERE s.tenant_id = l.tenant_id)),
       '>= 1',
       CASE WHEN EXISTS (SELECT 1 FROM public.locations l
                          WHERE EXISTS (SELECT 1 FROM public.services s WHERE s.tenant_id = l.tenant_id))
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END PRE-CHECK. Any FAIL halts. ==='

-- ===================================================================
-- 0080 POST-CHECK. READ-ONLY. Every verdict must read OK.
-- ===================================================================
-- Run AFTER `pnpm db:migrate`, with -v expected_before=<the pre-check's number>.
-- Any FAIL halts and is reported IMMEDIATELY (SR-50 c).
\pset pager off
\pset format aligned
\pset title '0080 POST-CHECK - every verdict must read OK'

SELECT 'journal = before + 1'          AS check,
       count(*)::text                  AS observed,
       (:expected_before + 1)::text    AS expected,
       CASE WHEN count(*) = :expected_before + 1 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT '0080 is applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- NOTHING UNDERNEATH MOVED, so a migration that rewrote history cannot pass a
-- purely forward-looking check.
SELECT '0079 still applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'table exists',
       CASE WHEN to_regclass('public.appointment_reschedule_requests') IS NOT NULL
            THEN 'present' ELSE 'MISSING' END,
       'present',
       CASE WHEN to_regclass('public.appointment_reschedule_requests') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'RLS is ENABLED on it',
       coalesce((SELECT relrowsecurity::text FROM pg_class
                  WHERE oid = 'public.appointment_reschedule_requests'::regclass), 'missing'),
       'true',
       CASE WHEN coalesce((SELECT relrowsecurity FROM pg_class
                            WHERE oid = 'public.appointment_reschedule_requests'::regclass), false)
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- A TABLE WITH RLS ON AND NO POLICY DENIES EVERYONE, which looks like security
-- and is an outage. Both halves are asserted.
SELECT 'the policy exists and delegates to appointments',
       coalesce((SELECT CASE WHEN qual LIKE '%appointments%' THEN 'delegating' ELSE 'PRESENT BUT NOT DELEGATING' END
                   FROM pg_policies
                  WHERE schemaname='public' AND tablename='appointment_reschedule_requests'
                    AND policyname='appointment_reschedule_requests_rls'), 'MISSING'),
       'delegating',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='appointment_reschedule_requests'
                            AND policyname='appointment_reschedule_requests_rls'
                            AND qual LIKE '%appointments%')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE GRANTS, READ WITH has_table_privilege AND NOT FROM relacl.
-- SR-52: a check that greps an ACL for a grantee by NAME cannot see a
-- grant made to everybody, and PUBLIC is everybody.
-- ==================================================================
SELECT 'authenticated has SELECT, INSERT, UPDATE',
       concat_ws(',',
         has_table_privilege('authenticated','public.appointment_reschedule_requests','SELECT')::text,
         has_table_privilege('authenticated','public.appointment_reschedule_requests','INSERT')::text,
         has_table_privilege('authenticated','public.appointment_reschedule_requests','UPDATE')::text),
       'true,true,true',
       CASE WHEN has_table_privilege('authenticated','public.appointment_reschedule_requests','SELECT')
             AND has_table_privilege('authenticated','public.appointment_reschedule_requests','INSERT')
             AND has_table_privilege('authenticated','public.appointment_reschedule_requests','UPDATE')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE ROW THE FIRST DRAFT FAILED. Supabase's ALTER DEFAULT PRIVILEGES grants
-- ALL to `authenticated` at CREATE TABLE time, so granting three privileges
-- removes nothing. The migration revokes first for that reason.
SELECT 'authenticated CANNOT delete',
       has_table_privilege('authenticated','public.appointment_reschedule_requests','DELETE')::text,
       'false',
       CASE WHEN has_table_privilege('authenticated','public.appointment_reschedule_requests','DELETE')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
SELECT 'anon has NOTHING',
       (SELECT count(*)::text FROM unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
         WHERE has_table_privilege('anon','public.appointment_reschedule_requests',p)),
       '0',
       CASE WHEN (SELECT count(*) FROM unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
                   WHERE has_table_privilege('anon','public.appointment_reschedule_requests',p)) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'patient has NOTHING',
       (SELECT count(*)::text FROM unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
         WHERE has_table_privilege('patient','public.appointment_reschedule_requests',p)),
       '0',
       CASE WHEN (SELECT count(*) FROM unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
                   WHERE has_table_privilege('patient','public.appointment_reschedule_requests',p)) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'the three indexes exist',
       (SELECT count(*)::text FROM pg_indexes
         WHERE schemaname='public' AND tablename='appointment_reschedule_requests'
           AND indexname IN ('appt_reschedule_req_open_idx',
                             'appt_reschedule_req_appointment_idx',
                             'appt_reschedule_req_one_open_uq')),
       '3',
       CASE WHEN (SELECT count(*) FROM pg_indexes
                   WHERE schemaname='public' AND tablename='appointment_reschedule_requests'
                     AND indexname IN ('appt_reschedule_req_open_idx',
                                       'appt_reschedule_req_appointment_idx',
                                       'appt_reschedule_req_one_open_uq')) = 3
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'the two CHECK constraints exist',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.appointment_reschedule_requests'::regclass AND contype = 'c'
           AND conname IN ('appointment_reschedule_requests_via_check',
                           'appointment_reschedule_requests_handled_pair_check')),
       '2',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid = 'public.appointment_reschedule_requests'::regclass AND contype = 'c'
                     AND conname IN ('appointment_reschedule_requests_via_check',
                                     'appointment_reschedule_requests_handled_pair_check')) = 2
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE TABLE IS EMPTY AND MUST BE. This migration creates and grants; it
-- backfills nothing, which is what keeps it inside SR-50(d).
SELECT 'no rows were written',
       (SELECT count(*)::text FROM public.appointment_reschedule_requests),
       '0',
       CASE WHEN (SELECT count(*) FROM public.appointment_reschedule_requests) = 0
            THEN 'OK' ELSE 'FAIL' END;

-- 0088 PRE-CHECK - READ ONLY. Card MIG-0088-nesa-second-participant-visible-to-cb-therapists.
--
-- Run by stage 1 of docs/migration-apply-0088.md, against production, BEFORE the apply.
-- Every verdict must read OK; exactly 14 OK rows are required. Rows 1, 11 and 12 are the
-- carries stage 2 parses out of this transcript (SR-59). Rows 13 and 14 are reports for the
-- owner and strategy: how many machines are flagged today, and how many existing bookings the
-- new policy would widen to a clinic's therapists the moment it lands.
--
-- Writes nothing: SELECTs only.

\pset pager off
\timing off

\echo ''
\echo '=== 0088 PRE-CHECK - every row must read OK ==='

SELECT '1. journal_rows_before (carry)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       'record it',
       'OK';

SELECT '2. 0088 sha256 is ABSENT from the journal',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                             WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. 0086 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. 0087 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. newest applied journal when < 0088 when (7.0b skip guard)',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1788201200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1788201200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '6. the 0088 policy does NOT exist yet',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'appointments'
           AND policyname = 'appointments_shared_resource_second_participant_select'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                              WHERE schemaname = 'public' AND tablename = 'appointments'
                                AND policyname = 'appointments_shared_resource_second_participant_select')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. appointments_rls is 0086''s: FOR ALL, TO authenticated, same expression both halves',
       coalesce((SELECT cmd || ' ' || roles::text || ' ' || md5(qual) || ' ' || md5(with_check)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'appointments_rls'), 'ABSENT'),
       'ALL {authenticated} 22e128271c25d59ca149731cb04e55aa x2',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'appointments_rls'
                            AND cmd = 'ALL' AND roles::text = '{authenticated}'
                            AND md5(qual) = '22e128271c25d59ca149731cb04e55aa'
                            AND md5(with_check) = '22e128271c25d59ca149731cb04e55aa')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. the four helpers 0088 calls exist',
       ((to_regprocedure('public.jwt_tenant_id()') IS NOT NULL)::int
        + (to_regprocedure('public.jwt_role()') IS NOT NULL)::int
        + (to_regprocedure('public.shared_resource_practitioner_ids()') IS NOT NULL)::int
        + (to_regprocedure('public.viewer_location_ids()') IS NOT NULL)::int)::text,
       '= 4',
       CASE WHEN to_regprocedure('public.jwt_tenant_id()') IS NOT NULL
             AND to_regprocedure('public.jwt_role()') IS NOT NULL
             AND to_regprocedure('public.shared_resource_practitioner_ids()') IS NOT NULL
             AND to_regprocedure('public.viewer_location_ids()') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. the four columns 0088 reads exist',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public'
           AND ((table_name = 'appointments' AND column_name IN ('practitioner_2_id', 'location_id', 'tenant_id'))
             OR (table_name = 'users' AND column_name = 'is_shared_resource'))),
       '= 4',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND ((table_name = 'appointments' AND column_name IN ('practitioner_2_id', 'location_id', 'tenant_id'))
                       OR (table_name = 'users' AND column_name = 'is_shared_resource'))) = 4
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. the role 0088 grants to exists',
       (SELECT count(*)::text FROM pg_roles WHERE rolname = 'authenticated'),
       '= 1',
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN 'OK' ELSE 'FAIL' END;

SELECT '11. appointments_policies_before (carry): exactly two',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments'),
       '= 2',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments') = 2
            THEN 'OK' ELSE 'FAIL' END;

SELECT '12. secdef_functions_before (carry): all owned by postgres',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       'record it; every owner postgres',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prosecdef
                                AND pg_get_userbyid(p.proowner) <> 'postgres')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '13. report: active machines flagged as shared resources today',
       (SELECT count(*)::text FROM public.users WHERE is_shared_resource AND is_active),
       'report',
       'OK';

SELECT '14. report: bookings 0088 would widen (a flagged machine as Terapeuta 2)',
       (SELECT count(*)::text FROM public.appointments a
          JOIN public.users u ON u.id = a.practitioner_2_id AND u.is_shared_resource),
       'report',
       'OK';

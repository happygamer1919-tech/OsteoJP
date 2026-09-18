-- 0089 PRE-CHECK - READ ONLY. Card SR62-PU4-documentos-soft-delete.
--
-- Run by stage 1 of docs/migration-apply-0089.md, against production, BEFORE the apply.
-- Every verdict must read OK; exactly 16 OK rows are required. Rows 1, 11 and 12 are the
-- carries stage 2 parses out of this transcript (SR-59); no carry name is a substring of
-- another. Rows 15 and 16 are reports for the owner: how many documents exist today, and
-- how many of them the patient portal can currently see.
--
-- Writes nothing: SELECTs only.

\pset pager off
\timing off

\echo ''
\echo '=== 0089 PRE-CHECK - every row must read OK ==='

SELECT '1. journal_rows_before (carry)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       'record it',
       'OK';

SELECT '2. 0089 sha256 is ABSENT from the journal',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                             WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. 0088 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. 0087 IS applied (by file hash)',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. newest applied journal when < 0089 when (7.0b skip guard)',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1788301200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1788301200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '6. the three soft-delete columns do NOT exist yet',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'attachments'
           AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')),
       '= 0',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')) = 0
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. the CHECK constraint does NOT exist yet',
       (SELECT count(*)::text FROM pg_constraint WHERE conname = 'attachments_soft_delete_complete'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_soft_delete_complete')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. the FK constraint does NOT exist yet',
       (SELECT count(*)::text FROM pg_constraint WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_deleted_by_user_id_users_id_fk')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. attachments_patient_selfscope is 0010''s: SELECT, TO patient, expression by md5 and length',
       coalesce((SELECT cmd || ' ' || roles::text || ' ' || md5(qual) || ' ' || length(qual)::text
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'attachments'
                    AND policyname = 'attachments_patient_selfscope'), 'ABSENT'),
       'SELECT {patient} 9b55a6d007d2226e2227be448d8b48a0 122',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'attachments'
                            AND policyname = 'attachments_patient_selfscope'
                            AND cmd = 'SELECT' AND roles::text = '{patient}'
                            AND md5(qual) = '9b55a6d007d2226e2227be448d8b48a0'
                            AND length(qual) = 122)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. attachments_tenant_isolation is 0001''s: FOR ALL, TO authenticated, same expression both halves',
       coalesce((SELECT cmd || ' ' || roles::text || ' ' || md5(qual) || ' ' || md5(with_check)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'attachments'
                    AND policyname = 'attachments_tenant_isolation'), 'ABSENT'),
       'ALL {authenticated} 11ef341951d0d9b55ccd0acbb8d6a2e0 x2',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'attachments'
                            AND policyname = 'attachments_tenant_isolation'
                            AND cmd = 'ALL' AND roles::text = '{authenticated}'
                            AND md5(qual) = '11ef341951d0d9b55ccd0acbb8d6a2e0'
                            AND md5(with_check) = '11ef341951d0d9b55ccd0acbb8d6a2e0')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. attachments_policies_before (carry): exactly two',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attachments'),
       '= 2',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attachments') = 2
            THEN 'OK' ELSE 'FAIL' END;

SELECT '12. secdef_functions_before (carry): all owned by postgres',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       'record it; every owner postgres',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prosecdef
                                AND pg_get_userbyid(p.proowner) <> 'postgres')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '13. the two helpers the rewritten policy calls exist',
       ((to_regprocedure('public.jwt_patient_id()') IS NOT NULL)::int
        + (to_regprocedure('public.jwt_tenant_id()') IS NOT NULL)::int)::text,
       '= 2',
       CASE WHEN to_regprocedure('public.jwt_patient_id()') IS NOT NULL
             AND to_regprocedure('public.jwt_tenant_id()') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END;

SELECT '14. the role the policy is TO, and the FK target column, both exist',
       ((SELECT count(*) FROM pg_roles WHERE rolname = 'patient')
        + (SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'))::text,
       '= 2',
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'patient')
             AND EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '15. report: attachments rows the ADD CONSTRAINT must validate',
       (SELECT count(*)::text FROM public.attachments),
       'report',
       'OK';

SELECT '16. report: attachments the patient portal can see today (patient-level rows)',
       (SELECT count(*)::text FROM public.attachments WHERE patient_id IS NOT NULL),
       'report',
       'OK';

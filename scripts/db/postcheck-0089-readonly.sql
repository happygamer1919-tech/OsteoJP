-- 0089 READ-ONLY POST-CHECK. Card SR62-PU4-documentos-soft-delete.
--
-- ===========================================================================
-- WHY THIS FILE EXISTS, AND WHAT IT IS NOT
-- ===========================================================================
-- docs/migration-apply-0089.md stage 2 is the full post-check. Its ARMS block
-- proves the migration's BEHAVIOUR by building a patient, a staff user and two
-- documents, soft-deleting one, and reading back as `patient` and as
-- `authenticated`. Those writes live inside one transaction that is rolled
-- back, so they change nothing - but they are still INSERTs and UPDATEs, and
-- the safety classifier refuses the block as a production write. The apply's
-- stage 1 marker window has since expired, so stage 2 cannot be re-run at all.
--
-- This file is the part of stage 2 that needs NO write: every assertion that a
-- catalogue read alone can settle. It is NOT a replacement for the arms. What
-- it cannot prove is listed in docs/migration-postcheck-0089.md under "What
-- stays unproven", and that list is short and specific.
--
-- ===========================================================================
-- IT CANNOT WRITE, AND THE SERVER IS WHAT ENFORCES THAT
-- ===========================================================================
-- Everything runs inside BEGIN READ ONLY, and the transaction is ROLLED BACK at
-- the end. A READ ONLY transaction makes Postgres itself refuse INSERT, UPDATE,
-- DELETE, CREATE and ALTER - so the guarantee does not rest on reading this file
-- and counting keywords. Verdict 0 asserts the transaction really is read only
-- before anything else runs, so the file cannot pass vacuously if someone
-- strips the BEGIN.
--
-- There is no CREATE TEMP TABLE here either, which is why the arms cannot be
-- ported: they need somewhere to record each probe's outcome.
--
-- ===========================================================================
-- THE PINNED NUMBERS COME FROM G3, NOT FROM THIS SITTING
-- ===========================================================================
-- Three of stage 2's assertions were CARRIES: numbers stage 1 measured on
-- production and stage 2 compared against. Stage 1 cannot run again, so the
-- carries are pinned here as literals, and their source is stated rather than
-- assumed. From the dispatch's recorded stage 1 values (G3), measured on
-- production 2026-09-16 before the apply:
--
--     journal_rows_before        = 86    -> this file expects 87 after 0089
--     attachments_policies_before = 2    -> this file expects 2 (ALTER, not CREATE)
--     secdef_functions_before     = 24   -> this file expects 24 (none added)
--     attachments                 = 1181
--     attachments patient-level   = 1181
--
-- A pinned literal is weaker evidence than a carry measured in the same sitting,
-- and that is stated plainly rather than hidden: if production's policy count
-- before the apply was not 2, verdict 16 passing proves less than it appears to.
-- What makes the pin safe here is that 0089 is an ALTER POLICY - it cannot
-- change the count - so the count is a property of the schema, not of the apply.
--
-- Run:  psql "<url>" -X -P pager=off -v ON_ERROR_STOP=1 -f scripts/db/postcheck-0089-readonly.sql
-- Every verdict must read OK. Exactly 27.

\pset pager off
\timing off

BEGIN READ ONLY;

\echo ''
\echo '=== 0089 READ-ONLY POST-CHECK - every row must read OK (27 expected) ==='

SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict;

/* ---------------------------------------------------------------- journal -- */

SELECT '1. the journal is 87 rows (G3: 86 before + 1)',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       '= 87',
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = 87 THEN 'OK' ELSE 'FAIL' END;

SELECT '2. 0089 sha256 is present exactly once',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced'),
       '= 1',
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations
                   WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced') = 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. the newest journal when is 0089''s',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '= 1788301200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) = 1788301200000
            THEN 'OK' ELSE 'FAIL' END;

-- NOTHING UNDERNEATH MOVED. A migration that rewrote history cannot pass a
-- purely forward-looking check, so 0088 and 0087 are re-asserted by file hash.
SELECT '4. 0088 is still applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56')
            THEN 'present' ELSE 'ABSENT' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. 0087 is still applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14')
            THEN 'present' ELSE 'ABSENT' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14')
            THEN 'OK' ELSE 'FAIL' END;

/* ---------------------------------------------------------------- columns -- */

SELECT '6. the three soft-delete columns exist and are all nullable',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'attachments'
           AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')
           AND is_nullable = 'YES'),
       '= 3',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')
                     AND is_nullable = 'YES') = 3
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. their data types are the declared ones',
       coalesce((SELECT string_agg(column_name || '=' || data_type, ' ' ORDER BY column_name)
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'attachments'
                    AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')), 'ABSENT'),
       'delete_reason=text deleted_at=timestamp with time zone deleted_by_user_id=uuid',
       CASE WHEN (SELECT string_agg(column_name || '=' || data_type, ' ' ORDER BY column_name)
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason'))
                 = 'delete_reason=text deleted_at=timestamp with time zone deleted_by_user_id=uuid'
            THEN 'OK' ELSE 'FAIL' END;

-- THE COLUMNS ARRIVE EMPTY AND MUST STAY THAT WAY BY DEFAULT. A DEFAULT on any
-- of the three would start writing deletion metadata onto rows nobody deleted.
SELECT '8. none of the three carries a column DEFAULT',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'attachments'
           AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')
           AND column_default IS NOT NULL),
       '= 0',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')
                     AND column_default IS NOT NULL) = 0
            THEN 'OK' ELSE 'FAIL' END;

/* ------------------------------------------------------------ constraints -- */

SELECT '9. the CHECK constraint, by md5 and length of its definition',
       coalesce((SELECT md5(pg_get_constraintdef(oid)) || ' ' || length(pg_get_constraintdef(oid))::text
                   FROM pg_constraint WHERE conname = 'attachments_soft_delete_complete'), 'ABSENT'),
       '21a8365a5fb8c6a4d3eabb6025b35dd0 235',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'attachments_soft_delete_complete'
                            AND md5(pg_get_constraintdef(oid)) = '21a8365a5fb8c6a4d3eabb6025b35dd0'
                            AND length(pg_get_constraintdef(oid)) = 235)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. the CHECK is attached to public.attachments and is a CHECK',
       coalesce((SELECT contype::text || ' on ' || conrelid::regclass::text FROM pg_constraint
                  WHERE conname = 'attachments_soft_delete_complete'), 'ABSENT'),
       'c on attachments',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'attachments_soft_delete_complete'
                            AND contype = 'c'
                            AND conrelid = 'public.attachments'::regclass)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. the FK constraint, by md5 of its definition',
       coalesce((SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
                  WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'), 'ABSENT'),
       '18e5b11368781041d450e7aebc0b9331',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'
                            AND md5(pg_get_constraintdef(oid)) = '18e5b11368781041d450e7aebc0b9331')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '12. the FK points at public.users and is a FOREIGN KEY',
       coalesce((SELECT contype::text || ' -> ' || confrelid::regclass::text FROM pg_constraint
                  WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'), 'ABSENT'),
       'f -> users',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'
                            AND contype = 'f'
                            AND confrelid = 'public.users'::regclass)
            THEN 'OK' ELSE 'FAIL' END;

/* --------------------------------------------------------------- policies -- */

SELECT '13. attachments_patient_selfscope gained the deleted_at conjunct (cmd, role, md5, length)',
       coalesce((SELECT cmd || ' ' || roles::text || ' ' || md5(qual) || ' ' || length(qual)::text
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'attachments'
                    AND policyname = 'attachments_patient_selfscope'), 'ABSENT'),
       'SELECT {patient} ee4023fadfae136818251ad2192538ab 147',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'attachments'
                            AND policyname = 'attachments_patient_selfscope'
                            AND cmd = 'SELECT' AND roles::text = '{patient}'
                            AND md5(qual) = 'ee4023fadfae136818251ad2192538ab'
                            AND length(qual) = 147)
            THEN 'OK' ELSE 'FAIL' END;

-- A PERMISSIVE second policy would be ORed and would give back exactly the
-- visibility 0089 exists to remove, so the KIND is asserted, not just the text.
SELECT '14. the portal policy is still PERMISSIVE and SELECT-only',
       coalesce((SELECT permissive || ' ' || cmd FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'attachments'
                    AND policyname = 'attachments_patient_selfscope'), 'ABSENT'),
       'PERMISSIVE SELECT',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'attachments'
                            AND policyname = 'attachments_patient_selfscope'
                            AND permissive = 'PERMISSIVE' AND cmd = 'SELECT')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '15. attachments_tenant_isolation is untouched (both halves, cmd and role)',
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

SELECT '16. attachments carries exactly two policies (G3: 2 before; ALTER, not CREATE)',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attachments'),
       '= 2',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attachments') = 2
            THEN 'OK' ELSE 'FAIL' END;

-- RLS ENABLED is the wall both policies stand on. A table with policies and RLS
-- off enforces nothing at all, and reads as security from the policy list alone.
SELECT '17. RLS is ENABLED on public.attachments',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.attachments'::regclass),
       'true',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.attachments'::regclass)
            THEN 'OK' ELSE 'FAIL' END;

/* ------------------------------------------- SECURITY DEFINER surface area -- */

SELECT '18. no SECURITY DEFINER function was added (G3: 24 before)',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       '= 24',
       CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.prosecdef) = 24
            THEN 'OK' ELSE 'FAIL' END;

SELECT '19. every public SECURITY DEFINER function is owned by postgres',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef
           AND pg_get_userbyid(p.proowner) <> 'postgres'),
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prosecdef
                                AND pg_get_userbyid(p.proowner) <> 'postgres')
            THEN 'OK' ELSE 'FAIL' END;

-- A SECURITY DEFINER function with an UNPINNED search_path is the injection
-- shape 0012 and 0045 exist to close. Counting them is how a regression shows.
SELECT '20. every public SECURITY DEFINER function pins its search_path',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef
           AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                            WHERE c LIKE 'search\_path=%')),
       '= 0 unpinned',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prosecdef
                                AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                                                 WHERE c LIKE 'search\_path=%'))
            THEN 'OK' ELSE 'FAIL' END;

/* ----------------------------------------------------------------- grants -- */

-- 0089 adds columns to a table whose grants are already hardened (0021 revoked
-- anon). A new column inherits the table grant, so the END STATE is asserted:
-- the patient portal may READ the new columns and may not write them, and anon
-- reaches none of it. See [[table-revoke-drops-column-grants]] for why the whole
-- list is restated rather than spot-checked.
SELECT '21. table grants on attachments are the hardened set',
       coalesce((SELECT string_agg(grantee || '=' || privs, ' ' ORDER BY grantee)
                   FROM (SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
                           FROM information_schema.role_table_grants
                          WHERE table_schema = 'public' AND table_name = 'attachments'
                            AND grantee IN ('authenticated', 'patient', 'anon')
                          GROUP BY grantee) g), 'NONE'),
       'authenticated=DELETE,INSERT,SELECT,UPDATE patient=SELECT (anon absent)',
       CASE WHEN (SELECT string_agg(grantee || '=' || privs, ' ' ORDER BY grantee)
                    FROM (SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
                            FROM information_schema.role_table_grants
                           WHERE table_schema = 'public' AND table_name = 'attachments'
                             AND grantee IN ('authenticated', 'patient', 'anon')
                           GROUP BY grantee) g)
                 = 'authenticated=DELETE,INSERT,SELECT,UPDATE patient=SELECT'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '22. the patient role may READ the three new columns and may not WRITE them',
       coalesce((SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
                   FROM information_schema.column_privileges
                  WHERE table_schema = 'public' AND table_name = 'attachments'
                    AND grantee = 'patient'
                    AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')), 'NONE'),
       'SELECT',
       CASE WHEN (SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
                    FROM information_schema.column_privileges
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND grantee = 'patient'
                     AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')) = 'SELECT'
            THEN 'OK' ELSE 'FAIL' END;

/* ---------------------------------------------------------------- comment -- */

SELECT '23. the delete_reason column comment is present, by md5',
       coalesce(md5(col_description('public.attachments'::regclass,
                 (SELECT ordinal_position FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name = 'delete_reason')::int)), 'ABSENT'),
       '544869ec4d0dab44c6c8b9e96602ac5b',
       CASE WHEN md5(col_description('public.attachments'::regclass,
                 (SELECT ordinal_position FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name = 'delete_reason')::int)) = '544869ec4d0dab44c6c8b9e96602ac5b'
            THEN 'OK' ELSE 'FAIL' END;

/* ------------------------------------------------------------------ shape -- */

-- G3 measured these on production before the apply. 0089 writes no data, so
-- both must be UNCHANGED. A move here means something other than 0089 ran.
SELECT '24. attachments row count is unchanged (G3: 1181)',
       (SELECT count(*)::text FROM public.attachments),
       '= 1181',
       CASE WHEN (SELECT count(*) FROM public.attachments) = 1181 THEN 'OK' ELSE 'FAIL' END;

SELECT '25. patient-level attachments unchanged (G3: 1181)',
       (SELECT count(*)::text FROM public.attachments WHERE patient_id IS NOT NULL),
       '= 1181',
       CASE WHEN (SELECT count(*) FROM public.attachments WHERE patient_id IS NOT NULL) = 1181
            THEN 'OK' ELSE 'FAIL' END;

-- THE COLUMNS ARRIVED EMPTY. Nothing has been soft-deleted yet, so any non-null
-- deleted_at on production before the first UI delete would mean a writer this
-- migration did not account for.
SELECT '26. no attachment is soft-deleted yet (the columns arrived empty)',
       (SELECT count(*)::text FROM public.attachments a
         WHERE (to_jsonb(a) ->> 'deleted_at') IS NOT NULL),
       '= 0 (and the column must exist)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'attachments'
                            AND column_name = 'deleted_at')
             AND (SELECT count(*) FROM public.attachments a
                   WHERE (to_jsonb(a) ->> 'deleted_at') IS NOT NULL) = 0
            THEN 'OK' ELSE 'FAIL' END;

ROLLBACK;

\echo ''
\echo '=== end of 0089 READ-ONLY POST-CHECK. The transaction was rolled back. ==='

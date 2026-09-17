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
--     attachments                 = 1181 -> this file expects AT LEAST 1181
--     attachments patient-level   = 1181 -> this file expects AT LEAST 1181
--
-- THE TWO ROW COUNTS ARE FLOORS AND NOT EQUALITIES, AND THAT IS A CORRECTION.
-- They were pinned as `= 1181` and both read FAIL on the first production run,
-- at 1185: four documents were uploaded after G3's 12:00 UTC read, the newest at
-- 16:42 UTC. A clinic that keeps working is not a regression. What 0089 has to
-- answer is whether anything was LOST - it writes no data - so the assertion is
-- that nothing was deleted and nothing moved off patient level. A floor passes a
-- table that grew and fails one that shrank.
--
-- WHAT A FLOOR CANNOT SEE, said rather than papered over: a delete followed by
-- an equal number of inserts. G3 recorded counts and no row identities, so there
-- is no id-level assertion available to make here.
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
--
-- THIS ROW NO LONGER PINS A LITERAL, AND THE REASON IS A REAL FAILURE. It
-- expected `authenticated=DELETE,INSERT,SELECT,UPDATE`, and production read
-- `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`. Nothing had gone
-- wrong. The extra three are SUPABASE PLATFORM DEFAULTS: a Supabase project
-- carries `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO
-- authenticated`, so every table arrives with all seven and a migration's
-- explicit GRANT is invisible against them. The rehearsal database was built by
-- a plain CREATE DATABASE, which inherits no default privileges, so it showed
-- only the four this repository grants - and the literal recorded the rehearsal,
-- not production. Measured 2026-09-17: rebuilding the same throwaway with that
-- one ALTER DEFAULT PRIVILEGES reproduces production's string exactly, on
-- attachments and on patients alike.
--
-- SO THE ROW ASSERTS WHAT 0089 GOVERNS AND NOTHING ELSE: `patient` reads and
-- only reads, `anon` is absent, and `authenticated` holds the four privileges
-- this repository actually grants it - `GRANT SELECT, INSERT, UPDATE, DELETE ON
-- ALL TABLES IN SCHEMA public TO authenticated`, in 0003_grants.sql, which is
-- the only place any of the four is granted on this table. No migration in this
-- repository ever grants TRUNCATE, TRIGGER or REFERENCES to anyone; every
-- mention of those three is a REVOKE on some other table. The platform's own
-- additions are therefore not judged against a
-- number that would go stale the next time Supabase changes a default - they are
-- compared against `patients`, read IN THE SAME QUERY, which is governed by the
-- same defaults and by no part of 0089. A drift that hits attachments alone is
-- what this catches; a platform-wide change moves both and is not 0089's to
-- report.
--
-- IT CANNOT PASS VACUOUSLY. The `patients` baseline must be non-empty, so a
-- query returning nothing cannot make the comparison trivially true; and the
-- four-privilege floor is asserted on attachments directly, so two tables
-- stripped to the same empty set fail rather than matching each other.
WITH g AS (
  SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('attachments', 'patients')
     AND grantee IN ('authenticated', 'patient', 'anon')
   GROUP BY table_name, grantee
), m AS (
  SELECT (SELECT privs FROM g WHERE table_name = 'attachments' AND grantee = 'authenticated') AS att_auth,
         (SELECT privs FROM g WHERE table_name = 'attachments' AND grantee = 'patient')       AS att_patient,
         (SELECT privs FROM g WHERE table_name = 'attachments' AND grantee = 'anon')          AS att_anon,
         (SELECT privs FROM g WHERE table_name = 'patients'    AND grantee = 'authenticated') AS pat_auth
)
SELECT '21. attachments grants: patient reads only, anon absent, authenticated as on patients',
       'attachments patient=' || coalesce(att_patient, 'NONE') ||
       ' anon=' || coalesce(att_anon, 'absent') ||
       ' authenticated=' || coalesce(att_auth, 'NONE') ||
       ' | patients authenticated=' || coalesce(pat_auth, 'NONE'),
       'patient=SELECT, anon absent, authenticated >= DELETE,INSERT,SELECT,UPDATE and equal to patients',
       CASE WHEN att_patient = 'SELECT'
                 AND att_anon IS NULL
                 AND pat_auth IS NOT NULL
                 AND att_auth = pat_auth
                 AND string_to_array(att_auth, ',') @> ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']
            THEN 'OK' ELSE 'FAIL' END
  FROM m;

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
-- nothing may have been LOST. These are floors, not equalities: the clinic keeps
-- uploading documents, and a table that grew is not a regression. See the header
-- for the run that made this a correction rather than a preference.
SELECT '24. no attachment row was deleted since G3 (floor 1181, not a pinned total)',
       (SELECT count(*)::text FROM public.attachments),
       '>= 1181',
       CASE WHEN (SELECT count(*) FROM public.attachments) >= 1181 THEN 'OK' ELSE 'FAIL' END;

-- THE SECOND FLOOR IS NOT THE FIRST ONE RESTATED. A row whose patient_id was
-- cleared still counts in 24 and vanishes from 25, which is exactly the move
-- 0089 must not have made. The count of rows carrying no patient is printed
-- beside it as context and is NOT asserted: a record-level attachment is
-- representable in this schema, and forbidding one would fail the day staff
-- attach a document to a consultation instead of a patient.
SELECT '25. no attachment moved off patient level since G3 (floor 1181)',
       (SELECT count(*)::text FROM public.attachments WHERE patient_id IS NOT NULL)
         || ' patient-level (' || (SELECT count(*)::text FROM public.attachments WHERE patient_id IS NULL)
         || ' carry no patient, not asserted)',
       '>= 1181 patient-level',
       CASE WHEN (SELECT count(*) FROM public.attachments WHERE patient_id IS NOT NULL) >= 1181
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

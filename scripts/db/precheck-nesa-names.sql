-- 0090 NESA-NAMES PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- WHY THIS IS A FILE AND NOT A HEREDOC. The first revision of
-- docs/migration-apply-0090.md carried its pre-check inline. An inline block
-- cannot be pinned by sha256, was never teed to a transcript, and printed its
-- three carries as one wide row that stage 2 then asked a person to retype.
-- SR-59 says the post-check's carries come out of THIS RUN's pre-check
-- transcript, which needs a transcript, which needs this file.
--
-- THE SHAPE IS THE POST-CHECK'S: check | observed | expected | verdict, with the
-- verdict LAST so the stage can match it anchored to the end of the line. The
-- four carries are rows whose `check` column IS the carry's name, and no carry
-- name is a substring of another, so an awk `index()` on column 1 cannot take
-- the wrong row.
--
-- WHAT IT ASSERTS, AND WHY EACH ONE IS HERE:
--   0      the transaction is READ ONLY, so the server is what refuses a write;
--   1      the function is ABSENT. A post-check that passes on a database which
--          already had the function proves nothing about this apply;
--   2      0090 is absent from the journal BY HASH, never by id or tag;
--   3      0089 is present BY HASH. 0090 must follow it, and verified-migrate
--          proves "one pending" but not WHICH migration is the newest applied;
--   4      the newest applied `when` is below 0090's. The 0058 skip guard;
--   5      journal_rows_before = 87. CARRY. Production read 87 on 2026-09-19;
--   6      policies_before. CARRY. This migration creates no policy;
--   7      secdef_functions_before. CARRY. Every one owned by postgres (0060);
--   8      patients_select_md5. CARRY. The policy this apply may not change;
--   9      patients_select still keys on viewer_treated_patient_ids;
--   10     the four helpers the function body calls exist. It is LANGUAGE sql,
--          so a missing helper fails the CREATE, and this says which one first;
--   11     the four roles the migration names exist. REVOKE from a role that
--          does not exist is an ERROR, halfway through the file.
--
-- Run by stage 1 of docs/migration-apply-0090.md, which pins this file's sha256.

\pset pager off
\timing off

BEGIN READ ONLY;

\echo ''
\echo '=== 0090 NESA-NAMES PRE-CHECK - every verdict must read OK (12 expected) ==='

WITH j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                         AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                       AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642') AS has_0090,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced') AS has_0089,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names') AS fn_count,
    (SELECT count(*)::int FROM pg_policy)                                            AS policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                    AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) <> 'postgres')                               AS secdef_not_postgres,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patients' AND pol.polname = 'patients_select')              AS patients_md5,
    (SELECT pg_get_expr(pol.polqual, pol.polrelid) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patients' AND pol.polname = 'patients_select')              AS patients_qual,
    (SELECT count(DISTINCT p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('jwt_tenant_id', 'jwt_role', 'viewer_location_ids',
                          'shared_resource_practitioner_ids'))                       AS helpers,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('anon', 'patient', 'service_role', 'authenticated'))         AS roles
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. the function is ABSENT', fn_count::text, '0',
       CASE WHEN fn_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. 0090 is absent from the journal, by hash', has_0090::text, '0',
       CASE WHEN has_0090 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. 0089 is present in the journal, by hash', has_0089::text, '1',
       CASE WHEN has_0089 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the newest applied when is below that of 0090', coalesce(newest_when::text, 'absent'), '< 1788401200000',
       CASE WHEN newest_when < 1788401200000 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '87',
       CASE WHEN journal_rows = 87 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'patients_select_md5', coalesce(patients_md5, 'absent'), '32 hex characters',
       CASE WHEN patients_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. patients_select keys on viewer_treated_patient_ids',
       CASE WHEN patients_qual LIKE '%viewer_treated_patient_ids%' THEN 'present' ELSE 'MISSING' END, 'present',
       CASE WHEN patients_qual LIKE '%viewer_treated_patient_ids%' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. the four helpers the function body calls exist', helpers::text, '4',
       CASE WHEN helpers = 4 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. the four roles the migration names exist', roles::text, '4',
       CASE WHEN roles = 4 THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;

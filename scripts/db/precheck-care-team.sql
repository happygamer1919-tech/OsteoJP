-- 0091 CARE-01 PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- WHY THIS IS A FILE AND NOT A HEREDOC. An inline block cannot be pinned by
-- sha256, is never teed to a transcript, and prints its carries as one wide row
-- that stage 2 then asks a person to retype. SR-59 says the post-check's
-- carries come out of THIS RUN's pre-check transcript, which needs a
-- transcript, which needs this file. The shape is 0090's, deliberately.
--
-- THE SHAPE IS THE POST-CHECK'S: check | observed | expected | verdict, with the
-- verdict LAST so the stage can match it anchored to the end of the line. The
-- five carries are rows whose `check` column IS the carry's name, and no carry
-- name is a substring of another, so an awk `index()` on column 1 cannot take
-- the wrong row. That is why the appointments one is
-- `appointments_policy_count_before` and not `appointments_policies_before`:
-- the latter CONTAINS `policies_before`, and the parser would then be correct
-- only by the order the rows happen to come out in.
--
-- WHAT IT ASSERTS, AND WHY EACH ONE IS HERE:
--   0      the transaction is READ ONLY, so the server is what refuses a write;
--   1      the TABLE is absent. 0091 uses CREATE TABLE IF NOT EXISTS, so a
--          table already there would be silently adopted with whatever shape
--          and whatever rows it has, and the post-check would pass on it;
--   2      the FUNCTION is absent. It is CREATE OR REPLACE, same reasoning;
--   3      the new appointments POLICY is absent. CREATE POLICY is NOT
--          idempotent, so a policy already there makes the apply ERROR halfway
--          through the file, after the table and the function exist;
--   4      0091 is absent from the journal BY HASH, never by id or tag;
--   5      0090 is present BY HASH. 0091 must follow it, and verified-migrate
--          proves "one pending" but not WHICH migration is the newest applied;
--   6      the newest applied `when` is below 0091's. The 0058 skip guard;
--   7      journal_rows_before = 88. CARRY. Production read 88 after 0090;
--   8      policies_before. CARRY. This migration creates exactly four;
--   9      secdef_functions_before. CARRY. Every one owned by postgres (0060);
--   10     appointments_policy_count_before. CARRY. This migration adds exactly one
--          to that table, and the whole-schema count cannot say WHERE;
--   11     appointments_rls_md5. CARRY. appointments_rls is FOR ALL, so its
--          USING governs SELECT, UPDATE targets and DELETE targets alike. It is
--          this apply's central prohibition and must come out byte-identical;
--   12     appointments_rls is the FOR ALL policy, not something narrower that
--          happens to carry the name;
--   13     the four helpers the new objects call exist. The function is
--          LANGUAGE sql, so a missing helper fails the CREATE, and this says
--          which one first;
--   14     the four roles the migration and the post-check name exist. REVOKE
--          from a role that does not exist is an ERROR, halfway through;
--   15     the three FK parents exist and `appointments` carries BOTH patient
--          columns, because the new policy reads patient_2_id as well.
--
-- Run by stage 1 of docs/migration-apply-0091.md, which pins this file's sha256.

\pset pager off
\timing off

BEGIN READ ONLY;

\echo ''
\echo '=== 0091 CARE-01 PRE-CHECK - every verdict must read OK (16 expected) ==='

WITH j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                          AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                        AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f') AS has_0091,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'cbff20cb90f5bb27b607055a4bf46d4b7ed5992aebe1c894d0fe559868b5c642') AS has_0090,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_care_team')                  AS tbl_count,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')       AS fn_count,
    (SELECT count(*)::int FROM pg_policy
      WHERE polname = 'appointments_care_team_patient_history_select')                 AS newpol_count,
    (SELECT count(*)::int FROM pg_policy)                                             AS policies,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'appointments')                       AS appt_policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                      AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) <> 'postgres')                                 AS secdef_not_postgres,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'appointments' AND pol.polname = 'appointments_rls')           AS appt_rls_md5,
    (SELECT pol.polcmd::text FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'appointments' AND pol.polname = 'appointments_rls')           AS appt_rls_cmd,
    (SELECT count(DISTINCT p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname IN ('jwt_tenant_id', 'jwt_role',
                                                    'viewer_treated_patient_ids'))
         OR (n.nspname = 'auth' AND p.proname = 'uid'))                                AS helpers,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('anon', 'patient', 'service_role', 'authenticated'))           AS roles,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('tenants', 'patients', 'users'))                             AS fk_parents,
    (SELECT count(*)::int FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appointments'
        AND column_name IN ('patient_id', 'patient_2_id'))                             AS appt_patient_cols
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. the table patient_care_team is ABSENT', tbl_count::text, '0',
       CASE WHEN tbl_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. the function viewer_care_team_patient_ids is ABSENT', fn_count::text, '0',
       CASE WHEN fn_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. the new appointments policy is ABSENT', newpol_count::text, '0',
       CASE WHEN newpol_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. 0091 is absent from the journal, by hash', has_0091::text, '0',
       CASE WHEN has_0091 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. 0090 is present in the journal, by hash', has_0090::text, '1',
       CASE WHEN has_0090 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. the newest applied when is below that of 0091', coalesce(newest_when::text, 'absent'), '< 1788501200000',
       CASE WHEN newest_when < 1788501200000 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '88',
       CASE WHEN journal_rows = 88 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'appointments_policy_count_before', appt_policies::text, '> 0',
       CASE WHEN appt_policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'appointments_rls_md5', coalesce(appt_rls_md5, 'absent'), '32 hex characters',
       CASE WHEN appt_rls_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. appointments_rls is the FOR ALL policy (its USING governs UPDATE and DELETE too)',
       coalesce(appt_rls_cmd, 'absent'), '*',
       CASE WHEN appt_rls_cmd = '*' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. the four helpers the new objects call exist', helpers::text, '4',
       CASE WHEN helpers = 4 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. the four roles the migration and the post-check name exist', roles::text, '4',
       CASE WHEN roles = 4 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '15. the three FK parents exist and appointments carries both patient columns',
       fk_parents::text || ' parents, ' || appt_patient_cols::text || ' columns', '3 parents, 2 columns',
       CASE WHEN fk_parents = 3 AND appt_patient_cols = 2 THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;

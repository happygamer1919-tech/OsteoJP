-- 0093 RGPD-01 PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- Run by stage 1 of docs/migration-apply-0093.md, which pins this file's sha256
-- and asserts that every verdict reads OK (15 expected). The shape is 0092's:
-- check | observed | expected | verdict, verdict LAST so the stage can match it
-- anchored to the end of the line. The five carries are rows whose `check`
-- column IS the carry's name, and no carry name is a substring of another's or
-- of any other row's `check`, because stage 2's awk parser matches column 1
-- with index().
--
-- 0093 CREATES, so this file proves ABSENCE, as 0091's did:
--   0      the transaction is READ ONLY;
--   1      the table patient_rgpd_acceptances is ABSENT. 0093 uses CREATE TABLE
--          IF NOT EXISTS, so a table already there would be adopted, with
--          whatever shape and rows it has, and the post-check would pass on it;
--   2      its index is ABSENT (CREATE INDEX IF NOT EXISTS, same reasoning);
--   3      neither of its two policies exists. CREATE POLICY is not
--          idempotent, so one already there ERRORs part way through the file;
--   4      0093 is absent from the journal BY HASH;
--   5      0092 is present BY HASH. 0093 follows it;
--   6      the newest applied `when` is below 0093's. The 0058 skip guard;
--   CARRY  journal_rows_before = 90. Production read 90 after 0092;
--   CARRY  policies_before. 0093 adds exactly two;
--   CARRY  secdef_functions_before, every one owned by postgres. 0093
--          creates no function and must not move it;
--   CARRY  public_tables_before. 0093 adds exactly one;
--   CARRY  other_policies_md5: one md5 over EVERY policy in the database
--          today. None of them may move; the post-check recomputes it over
--          every policy except the two 0093 adds;
--   7      the three FK parents exist (tenants, patients, users);
--   8      the two roles the grants name exist (authenticated, patient). A
--          REVOKE from a missing role is an ERROR, part way through the file;
--   9      the two helpers the policies call exist (public.jwt_tenant_id,
--          auth.uid).

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN READ ONLY;

\echo ''
\echo '=== 0093 RGPD-01 PRE-CHECK - every verdict must read OK (15 expected) ==='

WITH j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                         AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454')  AS has_0093,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '23964a4b26609126bda3166ef37ac4f4abe28bb1dd72a6f67ec82bb4ca85abfa')  AS has_0092,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_rgpd_acceptances')            AS tbl_count,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_rgpd_acceptances_patient_idx') AS idx_count,
    (SELECT count(*)::int FROM pg_policy
      WHERE polname IN ('patient_rgpd_acceptances_tenant_select',
                        'patient_rgpd_acceptances_tenant_insert'))                     AS pol_count,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                       AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) <> 'postgres')                                  AS secdef_not_postgres,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')                                   AS public_tables,
    (SELECT md5(string_agg(
              n.nspname || '.' || c.relname || '.' || pol.polname || ':' || pol.polcmd::text || ':'
              || pol.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(pol.polqual, pol.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(pol.polwithcheck, pol.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, pol.polname))
       FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace)                                   AS all_md5,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('tenants', 'patients', 'users'))                              AS fk_parents,
    (SELECT count(*)::int FROM pg_roles WHERE rolname IN ('authenticated', 'patient'))  AS roles,
    (SELECT count(DISTINCT n.nspname || '.' || p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname = 'jwt_tenant_id')
         OR (n.nspname = 'auth' AND p.proname = 'uid'))                                 AS helpers
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. the consent table is ABSENT', tbl_count::text, '0',
       CASE WHEN tbl_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. its index is ABSENT', idx_count::text, '0',
       CASE WHEN idx_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. neither of its two policies exists', pol_count::text, '0',
       CASE WHEN pol_count = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. 0093 is absent from the journal, by hash', has_0093::text, '0',
       CASE WHEN has_0093 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. 0092 is present in the journal, by hash', has_0092::text, '1',
       CASE WHEN has_0092 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. the newest applied when is below that of 0093', coalesce(newest_when::text, 'absent'), '< 1788501400000',
       CASE WHEN newest_when < 1788501400000 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '90',
       CASE WHEN journal_rows = 90 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'public_tables_before', public_tables::text, '> 0',
       CASE WHEN public_tables > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'other_policies_md5', coalesce(all_md5, 'absent'), '32 hex characters',
       CASE WHEN all_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. the three FK parents exist (tenants, patients, users)', fk_parents::text, '3',
       CASE WHEN fk_parents = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. the two roles the grants name exist (authenticated, patient)', roles::text, '2',
       CASE WHEN roles = 2 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. the two helpers the policies call exist (jwt_tenant_id, auth.uid)', helpers::text, '2',
       CASE WHEN helpers = 2 THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;

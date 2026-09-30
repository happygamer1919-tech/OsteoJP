-- 0094 USERS/TENANTS/ROLES POLICY SPLIT: PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- For the apply document written at promotion (docs/migration-apply-0094.md),
-- which pins this file's sha256 and asserts that every verdict reads OK (21
-- expected). The shape is 0093's: check | observed | expected | verdict,
-- verdict LAST so a stage can match it anchored to the end of the line. The six
-- carries are rows whose `check` column IS the carry's name, and no carry name
-- is a substring of another's or of any other row's `check`.
--
-- 0094 DROPS THREE POLICIES AND CREATES EIGHT, ONE FUNCTION AND ONE TRIGGER, so
-- this file proves the starting point exactly:
--   0      the transaction is READ ONLY;
--   1-3    each of the three FOR ALL policies 0094 drops is there, PERMISSIVE,
--          TO authenticated, with 0001's USING and WITH CHECK, pinned by md5.
--          A different expression means production is not where the migration
--          was written against, and the post-check's "reads unchanged" pins
--          would be comparing against the wrong thing;
--   4      none of the eight policy names 0094 creates exists yet;
--   5      the guard function and its trigger do not exist yet;
--   6      the two token-hook read policies 0094 must NOT touch are there
--          (auth_admin_read_users, auth_admin_read_roles);
--   7      the three tables carry exactly those five policies and no
--          RESTRICTIVE one, so the post-check's count arithmetic holds;
--   8      users carries no user trigger today;
--   9      row level security is ENABLED on all three tables;
--   10     0094 is absent from the journal, BY HASH;
--   11     0093 is present, BY HASH. 0094 follows it;
--   12     the newest applied `when` is 0093's. 0094's is set above it at
--          promotion; the 0058 skip guard;
--   13     the three helpers the policies call exist (public.jwt_tenant_id,
--          public.jwt_role, auth.uid);
--   14     the five roles the file names exist (authenticated, anon,
--          service_role, patient, supabase_auth_admin). A REVOKE from a
--          missing role is an ERROR part way through the file;
--   CARRY  journal_rows_before = 91, which is main's journal after 0093;
--   CARRY  policies_before. 0094 moves it by exactly +5 (3 dropped, 8 made);
--   CARRY  secdef_functions_before, every one owned by postgres. 0094 makes no
--          SECURITY DEFINER function and must not move it;
--   CARRY  public_functions_before. 0094 adds exactly one function;
--   CARRY  other_policies_md5: one md5 over every policy in the database
--          EXCEPT the three 0094 drops. The post-check recomputes it over every
--          policy except the eight 0094 creates; nothing else may move;
--   CARRY  hook_md5: the token hook's body. 0094 must not touch it.

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN READ ONLY;

\echo ''
\echo '=== 0094 USERS/TENANTS/ROLES PRE-CHECK - every verdict must read OK (21 expected) ==='

WITH pol AS (
  SELECT c.relname, p.polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')      AS qual_md5,
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-') AS check_md5
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('users', 'tenants', 'roles')
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                         AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c')  AS has_0094,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454')  AS has_0093,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'tenants_tenant_isolation')                            AS old_tenants,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'roles_tenant_isolation')                              AS old_roles,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE polname = 'users_tenant_isolation')                              AS old_users,
    (SELECT count(*)::int FROM pg_policy
      WHERE polname IN ('tenants_tenant_select', 'tenants_manager_update', 'roles_tenant_select',
                        'users_tenant_select', 'users_manager_insert', 'users_manager_update',
                        'users_self_update', 'users_manager_delete'))                   AS new_pols,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'users_self_service_columns')
    + (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'users_self_service_columns') AS guard_objs,
    (SELECT string_agg(polname || '=' || cmd || '/' || to_roles || '/' || qual_md5, ',' ORDER BY polname)
       FROM pol WHERE polname IN ('auth_admin_read_users', 'auth_admin_read_roles'))   AS hook_pols,
    (SELECT count(*)::int FROM pol)                                                    AS three_table_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                               AS restrictive_pols,
    (SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal) AS users_triggers,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('users', 'tenants', 'roles') AND c.relrowsecurity) AS rls_on,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                       AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) <> 'postgres')                                  AS secdef_not_postgres,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                       AS public_functions,
    (SELECT md5(string_agg(
              n.nspname || '.' || c.relname || '.' || p.polname || ':' || p.polcmd::text || ':'
              || p.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, p.polname))
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE p.polname NOT IN ('tenants_tenant_isolation', 'roles_tenant_isolation',
                              'users_tenant_isolation'))                                AS other_md5,
    (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook')             AS hook_md5,
    (SELECT count(DISTINCT n.nspname || '.' || p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname IN ('jwt_tenant_id', 'jwt_role'))
         OR (n.nspname = 'auth' AND p.proname = 'uid'))                                 AS helpers,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('authenticated', 'anon', 'service_role', 'patient', 'supabase_auth_admin')) AS roles_named
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
-- 0001's expressions, rendered by Postgres 17: (id = ( SELECT jwt_tenant_id() AS
-- jwt_tenant_id)) is 2fac38fc48c49953b24de49b0da5f197, and (tenant_id = ( SELECT
-- jwt_tenant_id() AS jwt_tenant_id)) is 11ef341951d0d9b55ccd0acbb8d6a2e0.
UNION ALL SELECT '1. tenants_tenant_isolation is FOR ALL, TO authenticated, USING and WITH CHECK id = jwt_tenant_id()',
       coalesce(old_tenants, 'absent'),
       '*/true/authenticated 2fac38fc48c49953b24de49b0da5f197 2fac38fc48c49953b24de49b0da5f197',
       CASE WHEN old_tenants = '*/true/authenticated 2fac38fc48c49953b24de49b0da5f197 2fac38fc48c49953b24de49b0da5f197'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. roles_tenant_isolation is FOR ALL, TO authenticated, USING and WITH CHECK tenant_id = jwt_tenant_id()',
       coalesce(old_roles, 'absent'),
       '*/true/authenticated 11ef341951d0d9b55ccd0acbb8d6a2e0 11ef341951d0d9b55ccd0acbb8d6a2e0',
       CASE WHEN old_roles = '*/true/authenticated 11ef341951d0d9b55ccd0acbb8d6a2e0 11ef341951d0d9b55ccd0acbb8d6a2e0'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. users_tenant_isolation is FOR ALL, TO authenticated, USING and WITH CHECK tenant_id = jwt_tenant_id()',
       coalesce(old_users, 'absent'),
       '*/true/authenticated 11ef341951d0d9b55ccd0acbb8d6a2e0 11ef341951d0d9b55ccd0acbb8d6a2e0',
       CASE WHEN old_users = '*/true/authenticated 11ef341951d0d9b55ccd0acbb8d6a2e0 11ef341951d0d9b55ccd0acbb8d6a2e0'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. none of the eight policy names 0094 creates exists', new_pols::text, '0',
       CASE WHEN new_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the guard function and its trigger do not exist', guard_objs::text, '0',
       CASE WHEN guard_objs = 0 THEN 'OK' ELSE 'FAIL' END FROM j
-- `true` renders to b326b5062b2f0e69046810717534cb09.
UNION ALL SELECT '6. the two token-hook read policies are there, FOR SELECT, TO supabase_auth_admin, USING true',
       coalesce(hook_pols, 'absent'),
       'auth_admin_read_roles=r/supabase_auth_admin/b326b5062b2f0e69046810717534cb09,auth_admin_read_users=r/supabase_auth_admin/b326b5062b2f0e69046810717534cb09',
       CASE WHEN hook_pols = 'auth_admin_read_roles=r/supabase_auth_admin/b326b5062b2f0e69046810717534cb09,auth_admin_read_users=r/supabase_auth_admin/b326b5062b2f0e69046810717534cb09'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. the three tables carry exactly those five policies, none RESTRICTIVE',
       three_table_pols::text || ' policies, ' || restrictive_pols::text || ' restrictive', '5 policies, 0 restrictive',
       CASE WHEN three_table_pols = 5 AND restrictive_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. users carries no user trigger today', users_triggers::text, '0',
       CASE WHEN users_triggers = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. row level security is ENABLED on users, tenants and roles', rls_on::text, '3',
       CASE WHEN rls_on = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. 0094 is absent from the journal, by hash', has_0094::text, '0',
       CASE WHEN has_0094 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. 0093 is present in the journal, by hash', has_0093::text, '1',
       CASE WHEN has_0093 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. the newest applied when is that of 0093', coalesce(newest_when::text, 'absent'), '1788501400000',
       CASE WHEN newest_when = 1788501400000 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '91',
       CASE WHEN journal_rows = 91 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'public_functions_before', public_functions::text, '> 0',
       CASE WHEN public_functions > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'other_policies_md5', coalesce(other_md5, 'absent'), '32 hex characters',
       CASE WHEN other_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'hook_md5', coalesce(hook_md5, 'absent'), '32 hex characters',
       CASE WHEN hook_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. the three helpers the policies call exist (jwt_tenant_id, jwt_role, auth.uid)', helpers::text, '3',
       CASE WHEN helpers = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. the five roles the file names exist', roles_named::text, '5',
       CASE WHEN roles_named = 5 THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;

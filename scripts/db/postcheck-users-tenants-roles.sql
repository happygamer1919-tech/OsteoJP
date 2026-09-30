-- ============================================================================
-- 0094 USERS/TENANTS/ROLES POLICY SPLIT: POST-CHECK. READ ONLY. Every verdict
-- must read OK (18 expected).
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0094_users_tenants_roles_policy_split: the three FOR ALL policies 0001 made
-- on users, tenants and roles are GONE, EIGHT narrower policies stand in their
-- place, and ONE SECURITY INVOKER trigger guards the columns a non-manager may
-- change on their own row. Nothing else may move. Every verdict here is a
-- catalogue read. The behaviour is proven elsewhere:
-- scripts/db/behaviour-users-tenants-roles-readonly.sql on the database this
-- was applied to, and the in-action arms of the rehearsal (writes, which no
-- READ ONLY check can make).
--
-- THE SIX CARRIES COME FROM THE PRE-CHECK OF THE SAME SITTING (SR-59).
--
-- EXACT, NOT "LOOKS LIKE". Every policy expression is compared by md5 to the
-- text Postgres 17 renders for it, as 0093's post-check does; the expected
-- values were read on the rehearsal database after the apply. A LIKE would
-- pass `... OR true`; this does not. THE THREE SELECT POLICIES ARE PINNED TO
-- THE SAME md5 AS THE FOR ALL POLICIES THEY REPLACE (the pre-check's 1 to 3),
-- which is the proof that no read moved.
--
-- THIS FILE DOES NOT OPEN ITS OWN TRANSACTION. The apply stage wraps it in
-- `-c "begin read only" ... -c "rollback"`, so the server refuses any write.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<pre> -v secdef_before=<pre>
--        -v public_functions_before=<pre> -v other_policies_md5=<pre>
--        -v hook_md5=<pre> -v journal_rows_before=<pre>
--        -c "begin read only" -f scripts/db/postcheck-users-tenants-roles.sql -c "rollback"
-- ============================================================================

\if :{?policies_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v policies_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v secdef_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?public_functions_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v public_functions_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?hook_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v hook_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== 0094 USERS/TENANTS/ROLES POST-CHECK - every verdict must read OK (18 expected) ==='

WITH pol AS (
  SELECT c.relname, p.polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')      AS qual_md5,
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-') AS check_md5
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('users', 'tenants', 'roles')
), shape AS (
  /* One line per policy on the three tables: table.name=cmd/permissive/roles/using-md5/check-md5. */
  SELECT string_agg(relname || '.' || polname || '=' || cmd || '/' || permissive::text || '/' || to_roles
                    || '/' || qual_md5 || '/' || check_md5, ' ; ' ORDER BY relname, polname) AS all_shapes
    FROM pol
), fn AS (
  SELECT p.oid, p.prosecdef, l.lanname, md5(p.prosrc) AS src_md5,
         coalesce(array_to_string(p.proconfig, ','), '') AS config,
         pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'users_self_service_columns' AND p.pronargs = 0
), t AS (
  SELECT
    (SELECT count(*)::int FROM pol WHERE polname IN ('tenants_tenant_isolation', 'roles_tenant_isolation',
                                                     'users_tenant_isolation'))                      AS old_left,
    (SELECT count(*)::int FROM pol)                                                                  AS three_table_pols,
    (SELECT count(*)::int FROM pol WHERE cmd = '*')                                                  AS for_all_pols,
    (SELECT count(*)::int FROM pol WHERE NOT permissive)                                             AS restrictive_pols,
    /* Any write policy on roles, for any role: the only policy on roles that */
    /* is not authenticated's is the hook's SELECT, so none may exist.         */
    (SELECT count(*)::int FROM pol WHERE relname = 'roles' AND cmd IN ('a', 'w', 'd', '*'))           AS roles_write_pols,
    (SELECT count(*)::int FROM pol WHERE relname = 'tenants' AND cmd IN ('a', 'd', '*'))             AS tenants_ins_del_pols,
    (SELECT all_shapes FROM shape)                                                                   AS all_shapes,
    (SELECT count(*)::int FROM pg_trigger tg
      WHERE tg.tgrelid = 'public.users'::regclass AND tg.tgname = 'users_self_service_columns'
        AND NOT tg.tgisinternal AND tg.tgenabled = 'O'
        /* tgtype 19 = ROW (1) + BEFORE (2) + UPDATE (16). tgtype does not     */
        /* carry an UPDATE OF column list (tgattr) or a WHEN clause (tgqual),  */
        /* and either one would narrow when the guard fires, so both are      */
        /* pinned empty: it fires on every UPDATE of any column.              */
        AND tg.tgtype = 19 AND tg.tgattr::text = '' AND tg.tgqual IS NULL
        AND tg.tgfoid = (SELECT oid FROM fn))                                                        AS trigger_ok,
    (SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal) AS users_triggers,
    (SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || lanname || '/' || config || '/' || owner || ' ' || src_md5
       FROM fn)                                                                                      AS fn_shape,
    (SELECT coalesce(string_agg(r, ',' ORDER BY r), 'none')
       FROM unnest(array['PUBLIC', 'anon', 'authenticated', 'service_role', 'patient']) r
      WHERE (SELECT oid FROM fn) IS NOT NULL
        AND CASE WHEN r = 'PUBLIC'
                 THEN EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               WHERE p.oid = (SELECT oid FROM fn) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
                 ELSE has_function_privilege(r, (SELECT oid FROM fn), 'EXECUTE') END)                AS fn_executors,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('users', 'tenants', 'roles') AND c.relrowsecurity) AS rls_on,
    (has_table_privilege('authenticated', 'public.users', 'SELECT')
     AND has_table_privilege('authenticated', 'public.tenants', 'SELECT')
     AND has_table_privilege('authenticated', 'public.roles', 'SELECT')
     AND has_table_privilege('supabase_auth_admin', 'public.users', 'SELECT')
     AND has_table_privilege('supabase_auth_admin', 'public.roles', 'SELECT'))::text                 AS reads_granted,
    (SELECT count(*)::int FROM pg_policy)                                                            AS policies_now,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                                     AS secdef_now,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                                     AS public_functions_now,
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
      WHERE p.polname NOT IN ('tenants_tenant_select', 'tenants_manager_update', 'roles_tenant_select',
                              'users_tenant_select', 'users_manager_insert', 'users_manager_update',
                              'users_self_update', 'users_manager_delete'))                         AS other_md5_now,
    (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook')                          AS hook_md5_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                                          AS journal_rows_now
)
SELECT '1. the three FOR ALL policies from 0001 are gone'             AS check,
       old_left::text                                                 AS observed,
       '0'                                                            AS expected,
       CASE WHEN old_left = 0 THEN 'OK' ELSE 'FAIL' END               AS verdict FROM t
UNION ALL SELECT '2. the three tables carry exactly ten policies (eight new, the two hook reads), none FOR ALL, none RESTRICTIVE',
       three_table_pols::text || ' policies, ' || for_all_pols::text || ' FOR ALL, ' || restrictive_pols::text || ' restrictive',
       '10 policies, 0 FOR ALL, 0 restrictive',
       CASE WHEN three_table_pols = 10 AND for_all_pols = 0 AND restrictive_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM t
-- THE SELECT POLICIES READ WHAT THE OLD FOR ALL POLICIES READ: the same md5 as
-- pre-check 1 to 3. A '-' in a shape means the policy has no such expression.
UNION ALL SELECT '3. tenants_tenant_select, roles_tenant_select, users_tenant_select: FOR SELECT, TO authenticated, USING exactly the old tenant expression',
       coalesce(substring(all_shapes FROM 'roles\.roles_tenant_select=[^ ;]*'), 'roles absent') || ' ' ||
       coalesce(substring(all_shapes FROM 'tenants\.tenants_tenant_select=[^ ;]*'), 'tenants absent') || ' ' ||
       coalesce(substring(all_shapes FROM 'users\.users_tenant_select=[^ ;]*'), 'users absent'),
       'roles.roles_tenant_select=r/true/authenticated/11ef341951d0d9b55ccd0acbb8d6a2e0/- tenants.tenants_tenant_select=r/true/authenticated/2fac38fc48c49953b24de49b0da5f197/- users.users_tenant_select=r/true/authenticated/11ef341951d0d9b55ccd0acbb8d6a2e0/-',
       CASE WHEN all_shapes LIKE '%roles.roles_tenant_select=r/true/authenticated/11ef341951d0d9b55ccd0acbb8d6a2e0/-%'
             AND all_shapes LIKE '%tenants.tenants_tenant_select=r/true/authenticated/2fac38fc48c49953b24de49b0da5f197/-%'
             AND all_shapes LIKE '%users.users_tenant_select=r/true/authenticated/11ef341951d0d9b55ccd0acbb8d6a2e0/-%'
            THEN 'OK' ELSE 'FAIL' END FROM t
-- ((id = T) AND (R = ANY (ARRAY['owner', 'admin']))) on both sides.
UNION ALL SELECT '4. tenants_manager_update: FOR UPDATE, TO authenticated, USING and WITH CHECK exactly own tenant AND owner or admin',
       coalesce(substring(all_shapes FROM 'tenants\.tenants_manager_update=[^ ;]*'), 'absent'),
       'tenants.tenants_manager_update=w/true/authenticated/50f1b3c61bc72057a0726f5ed36e48fd/50f1b3c61bc72057a0726f5ed36e48fd',
       CASE WHEN substring(all_shapes FROM 'tenants\.tenants_manager_update=[^ ;]*')
                 = 'tenants.tenants_manager_update=w/true/authenticated/50f1b3c61bc72057a0726f5ed36e48fd/50f1b3c61bc72057a0726f5ed36e48fd'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '5. users_manager_insert: FOR INSERT, TO authenticated, WITH CHECK exactly own tenant AND owner or admin AND ROLE_OK',
       coalesce(substring(all_shapes FROM 'users\.users_manager_insert=[^ ;]*'), 'absent'),
       'users.users_manager_insert=a/true/authenticated/-/087290ce1cf065438e8ecd4504ecea3a',
       CASE WHEN substring(all_shapes FROM 'users\.users_manager_insert=[^ ;]*')
                 = 'users.users_manager_insert=a/true/authenticated/-/087290ce1cf065438e8ecd4504ecea3a'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '6. users_manager_update: FOR UPDATE, TO authenticated, USING and WITH CHECK exactly own tenant AND owner or admin AND ROLE_OK',
       coalesce(substring(all_shapes FROM 'users\.users_manager_update=[^ ;]*'), 'absent'),
       'users.users_manager_update=w/true/authenticated/087290ce1cf065438e8ecd4504ecea3a/087290ce1cf065438e8ecd4504ecea3a',
       CASE WHEN substring(all_shapes FROM 'users\.users_manager_update=[^ ;]*')
                 = 'users.users_manager_update=w/true/authenticated/087290ce1cf065438e8ecd4504ecea3a/087290ce1cf065438e8ecd4504ecea3a'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '7. users_self_update: FOR UPDATE, TO authenticated, USING own tenant AND own row, WITH CHECK the same AND ROLE_OK',
       coalesce(substring(all_shapes FROM 'users\.users_self_update=[^ ;]*'), 'absent'),
       'users.users_self_update=w/true/authenticated/194c0ea44a4fd185dc83c6dce8236bcd/6a8c4021e6398036c188830d9b3eafde',
       CASE WHEN substring(all_shapes FROM 'users\.users_self_update=[^ ;]*')
                 = 'users.users_self_update=w/true/authenticated/194c0ea44a4fd185dc83c6dce8236bcd/6a8c4021e6398036c188830d9b3eafde'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '8. users_manager_delete: FOR DELETE, TO authenticated, USING exactly own tenant AND owner or admin AND never an owner row',
       coalesce(substring(all_shapes FROM 'users\.users_manager_delete=[^ ;]*'), 'absent'),
       'users.users_manager_delete=d/true/authenticated/77b2d1a1e92b48e0d7d5814e4ea17e68/-',
       CASE WHEN substring(all_shapes FROM 'users\.users_manager_delete=[^ ;]*')
                 = 'users.users_manager_delete=d/true/authenticated/77b2d1a1e92b48e0d7d5814e4ea17e68/-'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '9. roles has no INSERT, UPDATE, DELETE or ALL policy at all; tenants has no INSERT, DELETE or ALL policy',
       'roles ' || roles_write_pols::text || ', tenants ' || tenants_ins_del_pols::text, 'roles 0, tenants 0',
       CASE WHEN roles_write_pols = 0 AND tenants_ins_del_pols = 0 THEN 'OK' ELSE 'FAIL' END FROM t
-- The guard's body is pinned by md5 of prosrc; the in-action proof that it
-- refuses and allows the right columns is the rehearsal's, since a READ ONLY
-- transaction cannot UPDATE.
UNION ALL SELECT '10. the guard function is SECURITY INVOKER, plpgsql, search_path=public, owned by postgres, body pinned',
       coalesce(fn_shape, 'absent'),
       'INVOKER/plpgsql/search_path=public/postgres 9b0fc7485410808653b45cd55626ff39',
       CASE WHEN fn_shape = 'INVOKER/plpgsql/search_path=public/postgres 9b0fc7485410808653b45cd55626ff39'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '11. no API role and not PUBLIC holds EXECUTE on the guard function',
       CASE WHEN fn_shape IS NULL THEN 'function absent' ELSE fn_executors END, 'none',
       CASE WHEN fn_shape IS NOT NULL AND fn_executors = 'none' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '12. its trigger is on users, BEFORE UPDATE FOR EACH ROW, of every column, with no WHEN clause, enabled, and the only user trigger there',
       trigger_ok::text || ' matching, ' || users_triggers::text || ' on users', '1 matching, 1 on users',
       CASE WHEN trigger_ok = 1 AND users_triggers = 1 THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '13. row level security is still ENABLED on the three tables, and the read grants stand',
       rls_on::text || ' enabled, reads ' || reads_granted, '3 enabled, reads true',
       CASE WHEN rls_on = 3 AND reads_granted = 'true' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '14. the POLICY COUNT moved by exactly +5 (three dropped, eight created)', policies_now::text,
       (:'policies_before'::int + 5)::text,
       CASE WHEN policies_now = :'policies_before'::int + 5 THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '15. no SECURITY DEFINER function appeared or went', secdef_now::text, :'secdef_before',
       CASE WHEN secdef_now = :'secdef_before'::int THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '16. exactly one function was added to public', public_functions_now::text,
       (:'public_functions_before'::int + 1)::text,
       CASE WHEN public_functions_now = :'public_functions_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '17. every OTHER policy in the database is byte-identical (one md5 over all of them), the hook reads included',
       coalesce(other_md5_now, 'absent'), :'other_policies_md5',
       CASE WHEN other_md5_now = :'other_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '18. the token hook body is unchanged, and the journal moved by exactly one',
       coalesce(hook_md5_now, 'absent') || ', journal ' || journal_rows_now::text,
       :'hook_md5' || ', journal ' || (:'journal_rows_before'::int + 1)::text,
       CASE WHEN hook_md5_now = :'hook_md5' AND journal_rows_now = :'journal_rows_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END FROM t;

\echo ''
\echo '=== FOR THE RECORD: the policies on users, tenants and roles as the catalogue now describes them ==='

SELECT c.relname, p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('users', 'tenants', 'roles')
 ORDER BY 1, 2;

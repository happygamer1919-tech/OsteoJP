-- 0095 CONFLICT NAMES: PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- For the apply document docs/migration-apply-0095.md, which pins this file's
-- sha256 and asserts that every verdict reads OK (14 expected). The shape is
-- 0094's: check | observed | expected | verdict, verdict LAST so a stage can
-- match it anchored to the end of the line. The five carries are rows whose
-- `check` column IS the carry's name, and no carry name is a substring of
-- another's or of any other row's `check`.
--
-- 0095 REPLACES ONE FUNCTION'S BODY AND CREATES ONE FUNCTION. It switches
-- public.appointment_conflicts from SECURITY DEFINER to SECURITY INVOKER in
-- place, and creates public.appointment_conflict_rows, SECURITY DEFINER. So
-- this file proves the starting point exactly:
--   0      the transaction is READ ONLY;
--   1      appointment_conflicts is there as 0059 wrote it and 0060 pinned it:
--          SECURITY DEFINER, owned by postgres, sql, STABLE,
--          search_path=public, its body pinned by md5. A different body means
--          production is not where the migration was written against;
--   2      its EXECUTE today: authenticated holds it; PUBLIC, anon, patient
--          and service_role do not (0079);
--   3      no function named appointment_conflict_rows exists, in any schema,
--          with any signature;
--   4      the three functions the new bodies call exist:
--          public.jwt_tenant_id(), public.is_unconfirmed_pedido(uuid),
--          public.shared_resource_appointment_patient_names() (0090);
--   5      the four roles the file names exist (authenticated, anon, patient,
--          service_role). A REVOKE from a missing role is an ERROR part way
--          through the file;
--   6      0095 is absent from the journal, BY HASH;
--   7      0094 is present, BY HASH. 0095 follows it;
--   8      the newest applied `when` is 0094's. 0095's is set above it at
--          promotion; the 0058 skip guard;
--   CARRY  journal_rows_before = 92, which is main's journal after 0094;
--   CARRY  secdef_functions_before, every one owned by postgres. 0095 makes
--          one SECURITY DEFINER function and unmakes one: NET ZERO;
--   CARRY  public_functions_before. 0095 adds exactly one function;
--   CARRY  all_policies_md5: one md5 over every policy in the database. 0095
--          touches no policy;
--   CARRY  other_functions_md5: one md5 over every public function EXCEPT the
--          two 0095 names (name, identity arguments, SECURITY DEFINER flag,
--          owner, settings, ACL and body md5). Nothing else may move.

\pset pager off
\timing off
\set ON_ERROR_STOP on

BEGIN READ ONLY;

\echo ''
\echo '=== 0095 CONFLICT NAMES PRE-CHECK - every verdict must read OK (14 expected) ==='

WITH j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                         AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806')  AS has_0095,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '439cb53eab62803026a74e1148dbe3f5af1b7f95f0fc8e486d55eb7d62836a6c')  AS has_0094,
    (SELECT CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END
            || '/' || pg_get_userbyid(p.proowner)
            || '/' || l.lanname
            || '/' || p.provolatile::text
            || '/' || coalesce(array_to_string(p.proconfig, ','), '-')
            || ' ' || md5(p.prosrc)
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.oid = to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')) AS old_fn,
    (SELECT count(*) FILTER (WHERE r.rolname = 'authenticated'
                               AND has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::text
            || ' of 1 / '
            || count(*) FILTER (WHERE r.rolname <> 'authenticated'
                                  AND has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::text
            || ' of 3 / PUBLIC '
            || (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.oid = to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')
                   AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')::text
       FROM (SELECT to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')::oid AS oid) f
      CROSS JOIN pg_roles r
      WHERE f.oid IS NOT NULL
        AND r.rolname IN ('authenticated', 'anon', 'patient', 'service_role'))          AS old_exec,
    (SELECT count(*)::int FROM pg_proc WHERE proname = 'appointment_conflict_rows')     AS rows_fns,
    ((to_regprocedure('public.jwt_tenant_id()') IS NOT NULL)::int
     + (to_regprocedure('public.is_unconfirmed_pedido(uuid)') IS NOT NULL)::int
     + (to_regprocedure('public.shared_resource_appointment_patient_names()') IS NOT NULL)::int) AS callees,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname IN ('authenticated', 'anon', 'patient', 'service_role'))            AS roles_named,
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
       JOIN pg_namespace n ON n.oid = c.relnamespace)                                   AS all_pol_md5,
    (SELECT md5(string_agg(
              p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):'
              || p.prosecdef::text || ':' || pg_get_userbyid(p.proowner) || ':'
              || coalesce(array_to_string(p.proconfig, ','), '-') || ':'
              || coalesce(p.proacl::text, '-') || ':' || md5(p.prosrc),
              ';' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname NOT IN ('appointment_conflicts', 'appointment_conflict_rows'))   AS other_fn_md5
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
-- 0059's body, as stored after 0060 and 0079, read on Postgres 17.6 at main's
-- 92 migrations: md5(prosrc) is 895aab4b0e8d7e7ef29a42b2273beca6.
UNION ALL SELECT '1. appointment_conflicts is SECURITY DEFINER, owned by postgres, sql, STABLE, search_path public, 0059''s body',
       coalesce(old_fn, 'absent'),
       'definer/postgres/sql/s/search_path=public 895aab4b0e8d7e7ef29a42b2273beca6',
       CASE WHEN old_fn = 'definer/postgres/sql/s/search_path=public 895aab4b0e8d7e7ef29a42b2273beca6'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. EXECUTE on appointment_conflicts: authenticated only (anon, patient, service_role and PUBLIC hold none)',
       coalesce(old_exec, 'absent'), '1 of 1 / 0 of 3 / PUBLIC 0',
       CASE WHEN old_exec = '1 of 1 / 0 of 3 / PUBLIC 0' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. no function named appointment_conflict_rows exists yet', rows_fns::text, '0',
       CASE WHEN rows_fns = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the three functions the new bodies call exist', callees::text, '3',
       CASE WHEN callees = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the four roles the file names exist', roles_named::text, '4',
       CASE WHEN roles_named = 4 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. 0095 is absent from the journal, by hash', has_0095::text, '0',
       CASE WHEN has_0095 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. 0094 is present in the journal, by hash', has_0094::text, '1',
       CASE WHEN has_0094 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. the newest applied when is that of 0094', coalesce(newest_when::text, 'absent'), '1788501500000',
       CASE WHEN newest_when = 1788501500000 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '92',
       CASE WHEN journal_rows = 92 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'public_functions_before', public_functions::text, '> 0',
       CASE WHEN public_functions > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'all_policies_md5', coalesce(all_pol_md5, 'absent'), '32 hex characters',
       CASE WHEN all_pol_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'other_functions_md5', coalesce(other_fn_md5, 'absent'), '32 hex characters',
       CASE WHEN other_fn_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;

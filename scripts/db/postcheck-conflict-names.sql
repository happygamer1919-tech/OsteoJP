-- ============================================================================
-- 0095 CONFLICT NAMES: POST-CHECK. READ ONLY. Every verdict must read OK
-- (13 expected).
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0095_conflict_name_visibility: public.appointment_conflicts is SECURITY
-- INVOKER with the new body, and public.appointment_conflict_rows is a new
-- SECURITY DEFINER function owned by postgres, with no patient column.
-- Nothing else may move. Every verdict here is a catalogue read. The behaviour
-- is proven by scripts/db/behaviour-conflict-name-readonly.sql, run as a real
-- therapist on the database this was applied to.
--
-- THE FIVE CARRIES COME FROM THE PRE-CHECK OF THE SAME SITTING (SR-59).
--
-- EXACT, NOT "LOOKS LIKE". Each body is compared by md5(prosrc), the text
-- between the dollar quotes, which Postgres stores as written; the expected
-- values were read on the rehearsal database (Postgres 17.6) after the apply.
-- The two COMMENTs are pinned the same way.
--
-- THIS FILE DOES NOT OPEN ITS OWN TRANSACTION. The apply stage wraps it in
-- `-c "begin read only" ... -c "rollback"`, so the server refuses any write.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v journal_rows_before=<pre> -v secdef_before=<pre>
--        -v public_functions_before=<pre> -v all_policies_md5=<pre>
--        -v other_functions_md5=<pre>
--        -c "begin read only" -f scripts/db/postcheck-conflict-names.sql -c "rollback"
-- ============================================================================

\if :{?journal_rows_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v journal_rows_before is missing. The pre-check prints it; this file refuses to guess.';
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
\if :{?all_policies_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v all_policies_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?other_functions_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v other_functions_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== 0095 CONFLICT NAMES POST-CHECK - every verdict must read OK (13 expected) ==='

WITH j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                         AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'cfdfffff71a6c847a791ce17c71bbc6e05b75a367e9c8f03dfcb0cfc638f5806')  AS has_0095,
    (SELECT CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END
            || '/' || pg_get_userbyid(p.proowner)
            || '/' || l.lanname
            || '/' || p.provolatile::text
            || '/' || coalesce(array_to_string(p.proconfig, ','), '-')
            || ' ' || md5(p.prosrc)
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.oid = to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')) AS conflicts_fn,
    (SELECT CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END
            || '/' || pg_get_userbyid(p.proowner)
            || '/' || l.lanname
            || '/' || p.provolatile::text
            || '/rows ' || p.prorows::int::text
            || '/' || coalesce(array_to_string(p.proconfig, ','), '-')
            || ' ' || md5(p.prosrc)
       FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.oid = to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])')) AS rows_fn,
    (SELECT count(*) FILTER (WHERE proname = 'appointment_conflicts')::text || ' / '
            || count(*) FILTER (WHERE proname = 'appointment_conflict_rows')::text
       FROM pg_proc WHERE proname IN ('appointment_conflicts', 'appointment_conflict_rows')) AS fn_names,
    (SELECT string_agg(t.nm, ',' ORDER BY t.ord)
       FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS t(nm, md, ord)
      WHERE p.oid = to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])')
        AND t.md = 't')                                                                AS rows_cols,
    (SELECT string_agg(t.nm, ',' ORDER BY t.ord)
       FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS t(nm, md, ord)
      WHERE p.oid = to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')
        AND t.md = 't')                                                                AS conflicts_cols,
    (SELECT count(*) FILTER (WHERE r.rolname = 'authenticated'
                               AND has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::text
            || ' of 2 / '
            || count(*) FILTER (WHERE r.rolname <> 'authenticated'
                                  AND has_function_privilege(r.rolname, f.oid, 'EXECUTE'))::text
            || ' of 6'
       FROM (VALUES (to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])')::oid),
                    (to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])')::oid)) AS f(oid)
      CROSS JOIN pg_roles r
      WHERE r.rolname IN ('authenticated', 'anon', 'patient', 'service_role'))          AS exec_roles,
    (SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid IN (to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])'),
                      to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])'))
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')                             AS exec_public,
    (SELECT coalesce(md5(obj_description(to_regprocedure('public.appointment_conflicts(uuid,uuid,text,timestamptz,timestamptz,uuid[])'), 'pg_proc')), 'none')
            || ' / '
            || coalesce(md5(obj_description(to_regprocedure('public.appointment_conflict_rows(uuid,uuid,text,timestamptz,timestamptz,uuid[])'), 'pg_proc')), 'none')) AS comments,
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
-- The new bodies, read on Postgres 17.6 after the apply: appointment_conflicts
-- 3f6febceb17ff033fdf84bc6c108d540, appointment_conflict_rows
-- 80a762d46f4f01baf40c3cbb6907881b.
UNION ALL SELECT '1. appointment_conflicts is SECURITY INVOKER, owned by postgres, sql, STABLE, search_path public, the new body',
       coalesce(conflicts_fn, 'absent'),
       'invoker/postgres/sql/s/search_path=public 3f6febceb17ff033fdf84bc6c108d540',
       CASE WHEN conflicts_fn = 'invoker/postgres/sql/s/search_path=public 3f6febceb17ff033fdf84bc6c108d540'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. appointment_conflict_rows is SECURITY DEFINER, owned by postgres, sql, STABLE, ROWS 5, search_path public, its body',
       coalesce(rows_fn, 'absent'),
       'definer/postgres/sql/s/rows 5/search_path=public 80a762d46f4f01baf40c3cbb6907881b',
       CASE WHEN rows_fn = 'definer/postgres/sql/s/rows 5/search_path=public 80a762d46f4f01baf40c3cbb6907881b'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. exactly one function of each name, no overload', coalesce(fn_names, 'absent'), '1 / 1',
       CASE WHEN fn_names = '1 / 1' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. the rows function has no name column; appointment_conflicts keeps its return columns',
       coalesce(rows_cols, 'absent') || ' | ' || coalesce(conflicts_cols, 'absent'),
       'id,starts_at,ends_at,room,kind | id,patient_name,starts_at,ends_at,room,kind',
       CASE WHEN rows_cols = 'id,starts_at,ends_at,room,kind'
             AND conflicts_cols = 'id,patient_name,starts_at,ends_at,room,kind' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. EXECUTE on both: authenticated holds it, anon, patient and service_role do not', exec_roles,
       '2 of 2 / 0 of 6',
       CASE WHEN exec_roles = '2 of 2 / 0 of 6' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. EXECUTE on both: PUBLIC holds none', exec_public::text, '0',
       CASE WHEN exec_public = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. the two COMMENTs are the migration''s, by md5', comments,
       '11b9cc614b0b935e8e4ad65ccac085c6 / 9fe2b50cfd8df9c142a71ea08956cc2a',
       CASE WHEN comments = '11b9cc614b0b935e8e4ad65ccac085c6 / 9fe2b50cfd8df9c142a71ea08956cc2a'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. the SECURITY DEFINER count is unchanged, every one owned by postgres',
       secdef::text || ', ' || secdef_not_postgres::text || ' not postgres',
       :'secdef_before' || ', 0 not postgres',
       CASE WHEN secdef = :'secdef_before'::int AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. the public function count is one more than before', public_functions::text,
       (:'public_functions_before'::int + 1)::text,
       CASE WHEN public_functions = :'public_functions_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. every policy in the database is unchanged, as one md5', coalesce(all_pol_md5, 'absent'),
       :'all_policies_md5',
       CASE WHEN all_pol_md5 = :'all_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. every other public function is unchanged, as one md5', coalesce(other_fn_md5, 'absent'),
       :'other_functions_md5',
       CASE WHEN other_fn_md5 = :'other_functions_md5' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. the journal grew by one, 0095 in it once by hash, its when the newest',
       journal_rows::text || ' rows, 0095 x' || has_0095::text || ', newest ' || coalesce(newest_when::text, 'absent'),
       (:'journal_rows_before'::int + 1)::text || ' rows, 0095 x1, newest 1788501600000',
       CASE WHEN journal_rows = :'journal_rows_before'::int + 1 AND has_0095 = 1
             AND newest_when = 1788501600000 THEN 'OK' ELSE 'FAIL' END FROM j;

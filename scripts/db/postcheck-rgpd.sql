-- ============================================================================
-- 0093 RGPD-01 POST-CHECK. READ ONLY. Every verdict must read OK (14 expected).
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0093_patient_rgpd_acceptances: ONE table (public.patient_rgpd_acceptances)
-- with ONE index, RLS ENABLED, SELECT and INSERT granted to authenticated and
-- UPDATE, DELETE, TRUNCATE revoked from it, everything revoked from patient,
-- and TWO policies (a tenant SELECT, and an INSERT that pins recorded_by to the
-- acting user). Nothing else may move, and every verdict here is a catalogue
-- read. The behaviour is proven elsewhere: packages/db/tests/
-- patient-rgpd-acceptances.db.test.ts in CI's DB-gated job, and
-- scripts/db/behaviour-rgpd-readonly.sql on the database this was applied to.
--
-- THE FOUR CARRIES COME FROM STAGE 1 OF THE SAME SITTING (SR-59).
--
-- APPEND-ONLY IS A PRIVILEGE FACT, NOT ONLY A POLICY FACT. Supabase's schema-wide
-- default privileges hand `authenticated` UPDATE, DELETE and TRUNCATE on a new
-- table at CREATE time; the migration's REVOKE is what takes them back. Verdict
-- 5 reads the privileges themselves, because a table with no UPDATE policy but
-- an UPDATE grant is one policy away from being writable.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<stage 1> -v secdef_before=<stage 1>
--        -v public_tables_before=<stage 1> -v other_policies_md5=<stage 1>
--        -f scripts/db/postcheck-rgpd.sql
-- ============================================================================

\if :{?policies_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v policies_before is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?secdef_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v secdef_before is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?public_tables_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v public_tables_before is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== 0093 RGPD-01 POST-CHECK - every verdict must read OK (14 expected) ==='

WITH t AS (
  SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_rgpd_acceptances' AND c.relkind = 'r') AS tbl_count,
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_rgpd_acceptances')                     AS rls_on,
    (SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE ic.relname = 'patient_rgpd_acceptances_patient_idx')                                 AS idx_def,
    (SELECT count(*)::int FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      WHERE c.relname = 'patient_rgpd_acceptances'
        AND con.conname = 'patient_rgpd_acceptances_version_not_blank' AND con.contype = 'c')    AS chk_count,
    (SELECT count(*)::int FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      WHERE c.relname = 'patient_rgpd_acceptances' AND con.contype = 'f')                        AS fk_count,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patient_rgpd_acceptances')                                              AS tbl_policies,
    (SELECT pol.polcmd::text || '/' || pol.polpermissive::text || '/'
            || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
            || '/' || CASE WHEN pol.polwithcheck IS NULL THEN 'no-check' ELSE 'CHECK' END
       FROM pg_policy pol WHERE pol.polname = 'patient_rgpd_acceptances_tenant_select')          AS sel_shape,
    (SELECT pg_get_expr(pol.polqual, pol.polrelid) FROM pg_policy pol
      WHERE pol.polname = 'patient_rgpd_acceptances_tenant_select')                              AS sel_qual,
    (SELECT pol.polcmd::text || '/' || pol.polpermissive::text || '/'
            || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
            || '/' || CASE WHEN pol.polqual IS NULL THEN 'no-using' ELSE 'USING' END
       FROM pg_policy pol WHERE pol.polname = 'patient_rgpd_acceptances_tenant_insert')          AS ins_shape,
    (SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) FROM pg_policy pol
      WHERE pol.polname = 'patient_rgpd_acceptances_tenant_insert')                              AS ins_check,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patient_rgpd_acceptances' AND pol.polcmd IN ('w', 'd', '*'))            AS write_policies,
    (SELECT count(*)::int FROM pg_policy)                                                        AS policies_now,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                                 AS secdef_now,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')                                             AS public_tables_now,
    (SELECT md5(string_agg(
              n.nspname || '.' || c.relname || '.' || pol.polname || ':' || pol.polcmd::text || ':'
              || pol.polpermissive::text || ':'
              || coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
              || ':' || coalesce(md5(pg_get_expr(pol.polqual, pol.polrelid)), '-')
              || ':' || coalesce(md5(pg_get_expr(pol.polwithcheck, pol.polrelid)), '-'),
              ';' ORDER BY n.nspname, c.relname, pol.polname))
       FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE pol.polname NOT IN ('patient_rgpd_acceptances_tenant_select',
                                'patient_rgpd_acceptances_tenant_insert'))                      AS other_md5_now
), g AS (
  SELECT *,
    has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'SELECT')   AS a_sel,
    has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'INSERT')   AS a_ins,
    has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'UPDATE')   AS a_upd,
    has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'DELETE')   AS a_del,
    has_table_privilege('authenticated', 'public.patient_rgpd_acceptances', 'TRUNCATE') AS a_trunc,
    (has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'SELECT')
     OR has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'INSERT')
     OR has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'UPDATE')
     OR has_table_privilege('patient', 'public.patient_rgpd_acceptances', 'DELETE'))    AS patient_any
  FROM t
)
SELECT '1. the consent table exists, exactly once'                    AS check,
       tbl_count::text                                                AS observed,
       '1'                                                            AS expected,
       CASE WHEN tbl_count = 1 THEN 'OK' ELSE 'FAIL' END              AS verdict FROM g
UNION ALL SELECT '2. row level security is ENABLED on it', coalesce(rls_on::text, 'absent'), 'true',
       CASE WHEN rls_on THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '3. its index leads (tenant_id, patient_id, accepted_at DESC)',
       CASE WHEN idx_def IS NULL THEN 'absent'
            WHEN idx_def LIKE '%(tenant_id, patient_id, accepted_at DESC)%' THEN 'present, those columns'
            ELSE 'present, OTHER columns' END,
       'present, those columns',
       CASE WHEN idx_def LIKE '%(tenant_id, patient_id, accepted_at DESC)%' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '4. the not-blank version CHECK and the three foreign keys exist',
       chk_count::text || ' check, ' || fk_count::text || ' foreign keys', '1 check, 3 foreign keys',
       CASE WHEN chk_count = 1 AND fk_count = 3 THEN 'OK' ELSE 'FAIL' END FROM g
-- APPEND-ONLY, READ OFF THE PRIVILEGES. The two positives are the control for
-- the three negatives: a table nobody can touch would pass the negatives too.
UNION ALL SELECT '5. authenticated may SELECT and INSERT, and may NOT UPDATE, DELETE or TRUNCATE',
       'S=' || a_sel::text || ' I=' || a_ins::text || ' U=' || a_upd::text || ' D=' || a_del::text || ' T=' || a_trunc::text,
       'S=true I=true U=false D=false T=false',
       CASE WHEN a_sel AND a_ins AND NOT a_upd AND NOT a_del AND NOT a_trunc THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '6. the portal patient role holds no privilege on it', patient_any::text, 'false',
       CASE WHEN NOT patient_any THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '7. exactly two policies on the table, and none for UPDATE, DELETE or ALL',
       tbl_policies::text || ' policies, ' || write_policies::text || ' write', '2 policies, 0 write',
       CASE WHEN tbl_policies = 2 AND write_policies = 0 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '8. the SELECT policy is PERMISSIVE, FOR SELECT, TO authenticated, tenant-scoped',
       coalesce(sel_shape, 'absent') || CASE WHEN sel_qual LIKE '%jwt_tenant_id()%' THEN ' tenant' ELSE ' NO-tenant' END,
       'r/true/authenticated/no-check tenant',
       CASE WHEN sel_shape = 'r/true/authenticated/no-check' AND sel_qual LIKE '%tenant_id = %jwt_tenant_id()%'
            THEN 'OK' ELSE 'FAIL' END FROM g
-- recorded_by IS THE FIELD THE ROW'S EVIDENTIAL VALUE RESTS ON, so the database
-- pins it to the acting user rather than trusting the server action.
UNION ALL SELECT '9. the INSERT policy is FOR INSERT, TO authenticated, and pins tenant and recorded_by = auth.uid()',
       coalesce(ins_shape, 'absent')
         || CASE WHEN ins_check LIKE '%jwt_tenant_id()%' THEN ' tenant' ELSE ' NO-tenant' END
         || CASE WHEN ins_check LIKE '%recorded_by = %auth.uid()%' THEN ' recorded_by' ELSE ' NO-recorded_by' END,
       'a/true/authenticated/no-using tenant recorded_by',
       CASE WHEN ins_shape = 'a/true/authenticated/no-using'
             AND ins_check LIKE '%tenant_id = %jwt_tenant_id()%'
             AND ins_check LIKE '%recorded_by = %auth.uid()%'
            THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '10. the POLICY COUNT grew by exactly two', policies_now::text,
       (:'policies_before'::int + 2)::text,
       CASE WHEN policies_now = :'policies_before'::int + 2 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '11. no SECURITY DEFINER function appeared or went', secdef_now::text, :'secdef_before',
       CASE WHEN secdef_now = :'secdef_before'::int THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '12. exactly one public table was added', public_tables_now::text,
       (:'public_tables_before'::int + 1)::text,
       CASE WHEN public_tables_now = :'public_tables_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '13. every OTHER policy in the database is byte-identical (one md5 over all of them)',
       coalesce(other_md5_now, 'absent'), :'other_policies_md5',
       CASE WHEN other_md5_now = :'other_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM g;

-- 14 is its own statement so that a missing table is a clean FAIL row above and
-- not an ERROR here: it counts rows only when the table exists.
SELECT '14. the table ships EMPTY (this migration records no consent)' AS check,
       CASE WHEN to_regclass('public.patient_rgpd_acceptances') IS NULL THEN 'absent'
            ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.patient_rgpd_acceptances', false, true, '')))[1]::text END AS observed,
       '0' AS expected,
       CASE WHEN to_regclass('public.patient_rgpd_acceptances') IS NULL THEN 'FAIL'
            WHEN (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.patient_rgpd_acceptances', false, true, '')))[1]::text = '0'
            THEN 'OK' ELSE 'FAIL' END AS verdict;

\echo ''
\echo '=== FOR THE RECORD: the table and its policies as the catalogue now describes them ==='

SELECT pol.polname, pol.polcmd AS command, pol.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
 WHERE c.relname = 'patient_rgpd_acceptances'
 ORDER BY pol.polname;

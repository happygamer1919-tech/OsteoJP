-- ============================================================================
-- CARE-01 POST-CHECK. READ ONLY. Every verdict must read OK.
--
-- Card CARE-01-assigned-therapists. Runs after
-- `packages/db/scripts/verified-migrate.mjs` has applied 0091_care_team
-- (promoted from migrations-pending/NEXT-AFTER-0089_care_team.sql, bytes
-- unchanged).
--
-- ==========================================================================
-- WHAT THIS PROVES, AND WHY EVERY ARM IS A CATALOGUE READ
-- ==========================================================================
-- The migration creates ONE table, ONE function and FOUR policies, and must
-- change nothing else. That is a claim about the SHAPE of the database, so
-- every verdict here reads a system catalogue rather than exercising
-- behaviour. The behavioural proof is two things at two layers, and neither is
-- this file: packages/db/tests/care-team-appointment-visibility.db.test.ts in
-- CI's DB-gated job, and scripts/db/behaviour-care-team-readonly.sql against
-- the database this was applied to.
--
-- THE FOUR CARRIES COME FROM STAGE 1 OF THE SAME SITTING (SR-59). They are
-- counts and a hash taken BEFORE the apply, so "nothing else moved" is a
-- comparison rather than an assertion. Nothing here is typed from a card.
--
-- ==========================================================================
-- WHAT IS DELIBERATELY NOT ASSERTED HERE
-- ==========================================================================
-- THE JOURNAL. `drizzle.__drizzle_migrations` identifies a migration by a
-- `hash` whose derivation this file would have to assume, and a tag-based
-- check is the trap recorded against 0088 ("the journal id is not the tag").
-- The journal is proven by stage 2 itself, which asserts the row count grew by
-- exactly one and that 0091's sha256 is present exactly once, and by
-- `pnpm db:check-journal` at stage 0 reconciling files, entries, order and the
-- supabase mirror BY CONTENT.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<stage 1> -v secdef_before=<stage 1>
--        -v appt_policies_before=<stage 1> -v appt_rls_md5=<stage 1>
--        -f scripts/db/postcheck-care-team.sql
-- ============================================================================

\if :{?policies_before}
\else
  -- A raised exception under ON_ERROR_STOP=1 exits 3. `\quit 1` does NOT set an
  -- exit code (psql warns and exits 0), which is why no stop here uses it.
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
\if :{?appt_policies_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v appt_policies_before is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?appt_rls_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v appt_rls_md5 is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== CARE-01 POST-CHECK - every verdict must read OK (22 expected) ==='

WITH t AS (
  SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_care_team' AND c.relkind = 'r')  AS tbl_count,
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patient_care_team')                      AS rls_on,
    (SELECT count(*)::int FROM pg_class ic JOIN pg_namespace n ON n.oid = ic.relnamespace
      WHERE n.nspname = 'public'
        AND ic.relname IN ('patient_care_team_live_unique', 'patient_care_team_viewer_idx',
                           'patient_care_team_patient_idx'))                               AS idx_count,
    (SELECT count(*)::int FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE ic.relname = 'patient_care_team_live_unique'
        AND i.indisunique AND i.indpred IS NOT NULL)                                       AS live_unique,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_count,
    (SELECT p.pronargs::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_nargs,
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_result,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_secdef,
    (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_owner,
    (SELECT coalesce(array_to_string(p.proconfig, ','), '') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_config,
    (SELECT p.provolatile::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_volatile,
    (SELECT p.proacl IS NOT NULL FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids')           AS fn_acl_present,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
            LATERAL aclexplode(p.proacl) a
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids'
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')                                AS fn_public_exec,
    (SELECT count(*)::int FROM pg_policy
      WHERE polname = 'appointments_care_team_patient_history_select')                     AS newpol_count,
    (SELECT pol.polpermissive FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')                 AS newpol_permissive,
    (SELECT pol.polcmd::text FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')                 AS newpol_cmd,
    (SELECT coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
       FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')                 AS newpol_roles,
    (SELECT pg_get_expr(pol.polqual, pol.polrelid) FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')                 AS newpol_qual,
    (SELECT pg_get_expr(pol.polwithcheck, pol.polrelid) FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')                 AS newpol_check,
    (SELECT count(*)::int FROM pg_policy)                                                  AS policies_now,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'appointments')                           AS appt_policies_now,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                          AS secdef_now,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'appointments' AND pol.polname = 'appointments_rls')               AS appt_rls_md5_now,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patient_care_team')                                               AS ct_policies,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patient_care_team'
        AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
         || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%owner%'
        AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
         || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%reception%')  AS ct_owner_reception,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patient_care_team'
        AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
         || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ILIKE '%therapist%') AS ct_therapist,
    (SELECT count(*)::int FROM public.patient_care_team)                                   AS ct_rows
), g AS (
  SELECT *,
    has_table_privilege('authenticated', 'public.patient_care_team', 'SELECT') AS tbl_select,
    has_table_privilege('authenticated', 'public.patient_care_team', 'INSERT') AS tbl_insert,
    has_table_privilege('authenticated', 'public.patient_care_team', 'UPDATE') AS tbl_update,
    has_table_privilege('authenticated', 'public.patient_care_team', 'DELETE') AS tbl_delete,
    has_function_privilege('anon',          'public.viewer_care_team_patient_ids()', 'EXECUTE') AS anon_may,
    has_function_privilege('patient',       'public.viewer_care_team_patient_ids()', 'EXECUTE') AS patient_may,
    has_function_privilege('service_role',  'public.viewer_care_team_patient_ids()', 'EXECUTE') AS service_may,
    has_function_privilege('authenticated', 'public.viewer_care_team_patient_ids()', 'EXECUTE') AS staff_may
  FROM t
)
SELECT '1. the table patient_care_team exists, exactly once'    AS check,
       tbl_count::text                                          AS observed,
       '1'                                                      AS expected,
       CASE WHEN tbl_count = 1 THEN 'OK' ELSE 'FAIL' END        AS verdict FROM g
UNION ALL SELECT '2. row level security is ENABLED on it', coalesce(rls_on::text, 'absent'), 'true',
       CASE WHEN rls_on THEN 'OK' ELSE 'FAIL' END FROM g
-- THE PARTIAL UNIQUE INDEX IS THE SOFT-REMOVE CONTRACT. Without `WHERE
-- removed_at IS NULL` a re-assignment would collide with the historical row
-- the table exists to keep.
UNION ALL SELECT '3. its three indexes exist and the live-unique one is UNIQUE and PARTIAL',
       idx_count::text || ' indexes, live_unique=' || live_unique::text, '3 indexes, live_unique=1',
       CASE WHEN idx_count = 3 AND live_unique = 1 THEN 'OK' ELSE 'FAIL' END FROM g
-- NO DELETE GRANT. Removal is an UPDATE that sets removed_at; a DELETE would
-- destroy the record. The three positives are the control for the negative.
UNION ALL SELECT '4. authenticated has SELECT, INSERT, UPDATE and NOT DELETE on it',
       'S=' || tbl_select::text || ' I=' || tbl_insert::text || ' U=' || tbl_update::text || ' D=' || tbl_delete::text,
       'S=true I=true U=true D=false',
       CASE WHEN tbl_select AND tbl_insert AND tbl_update AND tbl_delete = false THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '5. the function exists once, is NULLARY and returns uuid[]',
       coalesce(fn_count::text, '0') || ' fn, ' || coalesce(fn_nargs::text, '-') || ' args, returns ' || coalesce(fn_result, 'absent'),
       '1 fn, 0 args, returns uuid[]',
       CASE WHEN fn_count = 1 AND fn_nargs = 0 AND fn_result = 'uuid[]' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '6. it is SECURITY DEFINER', coalesce(fn_secdef::text, 'absent'), 'true',
       CASE WHEN fn_secdef THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '7. owned by postgres (whose privileges it runs with)', coalesce(fn_owner, 'absent'), 'postgres',
       CASE WHEN fn_owner = 'postgres' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '8. search_path is pinned', coalesce(fn_config, ''), 'search_path=public',
       CASE WHEN fn_config LIKE '%search_path=public%' THEN 'OK' ELSE 'FAIL' END FROM g
-- NULLARY AND STABLE IS THE INITPLAN CONTRACT: `(SELECT f())` is evaluated once
-- per statement, not once per row. A VOLATILE function here reintroduces the
-- 4,691 ms per-row defect 0078 removed.
UNION ALL SELECT '9. it is STABLE, so the nullary call stays an initplan', coalesce(fn_volatile, 'absent'), 's',
       CASE WHEN fn_volatile = 's' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '10. anon cannot execute it', anon_may::text, 'false',
       CASE WHEN anon_may = false THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '11. the PORTAL patient role cannot execute it', patient_may::text, 'false',
       CASE WHEN patient_may = false THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '12. service_role cannot execute it (0079)', service_may::text, 'false',
       CASE WHEN service_may = false THEN 'OK' ELSE 'FAIL' END FROM g
-- SR-52: PUBLIC IS NOT A ROLE NAME has_function_privilege ACCEPTS, and a NULL
-- proacl means PUBLIC holds EXECUTE by default. So this reads the ACL itself:
-- it must exist, and carry no grant to grantee 0.
UNION ALL SELECT '13. PUBLIC holds no EXECUTE (the ACL exists and names no PUBLIC grant)',
       'acl_present=' || coalesce(fn_acl_present::text, 'absent') || ' public_execute=' || coalesce(fn_public_exec::text, '-'),
       'acl_present=true public_execute=0',
       CASE WHEN fn_acl_present AND fn_public_exec = 0 THEN 'OK' ELSE 'FAIL' END FROM g
-- THE POSITIVE CONTROL for the four refusals above: if `authenticated` were
-- false too, 10 to 13 would be satisfied by a function nobody can call.
UNION ALL SELECT '14. authenticated CAN execute it (control)', staff_may::text, 'true',
       CASE WHEN staff_may THEN 'OK' ELSE 'FAIL' END FROM g
-- FOR SELECT ONLY, TO authenticated ONLY. A policy that came out FOR ALL would
-- hand every therapist the right to change or delete a colleague's booking.
UNION ALL SELECT '15. the new appointments policy is PERMISSIVE, FOR SELECT, TO authenticated alone',
       coalesce(newpol_count::text, '0') || ' policy, permissive=' || coalesce(newpol_permissive::text, '-')
         || ' cmd=' || coalesce(newpol_cmd, '-') || ' roles=' || coalesce(newpol_roles, '-')
         || ' with_check=' || CASE WHEN newpol_check IS NULL THEN 'none' ELSE 'PRESENT' END,
       '1 policy, permissive=true cmd=r roles=authenticated with_check=none',
       CASE WHEN newpol_count = 1 AND newpol_permissive AND newpol_cmd = 'r'
             AND newpol_roles = 'authenticated' AND newpol_check IS NULL
            THEN 'OK' ELSE 'FAIL' END FROM g
-- THE RULING, READ OFF THE SHIPPED PREDICATE: therapist only, both helpers,
-- both patient columns. A predicate missing patient_2_id would silently omit
-- shared bookings from the history.
UNION ALL SELECT '16. its predicate keys on role therapist, both helpers and both patient columns',
       CASE WHEN newpol_qual IS NULL THEN 'absent' ELSE
         CASE WHEN newpol_qual LIKE '%therapist%' THEN 'therapist ' ELSE 'NO-ROLE ' END
         || CASE WHEN newpol_qual LIKE '%viewer_care_team_patient_ids%' THEN 'care_team ' ELSE 'NO-care_team ' END
         || CASE WHEN newpol_qual LIKE '%viewer_treated_patient_ids%' THEN 'treated ' ELSE 'NO-treated ' END
         || CASE WHEN newpol_qual LIKE '%patient_2_id%' THEN 'patient_2_id' ELSE 'NO-patient_2_id' END END,
       'therapist care_team treated patient_2_id',
       CASE WHEN newpol_qual LIKE '%therapist%'
             AND newpol_qual LIKE '%viewer_care_team_patient_ids%'
             AND newpol_qual LIKE '%viewer_treated_patient_ids%'
             AND newpol_qual LIKE '%patient_id%'
             AND newpol_qual LIKE '%patient_2_id%'
            THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '17. the POLICY COUNT grew by exactly four', policies_now::text,
       (:'policies_before'::int + 4)::text,
       CASE WHEN policies_now = :'policies_before'::int + 4 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '18. exactly ONE of them landed on appointments', appt_policies_now::text,
       (:'appt_policies_before'::int + 1)::text,
       CASE WHEN appt_policies_now = :'appt_policies_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '19. exactly ONE new SECURITY DEFINER function', secdef_now::text,
       (:'secdef_before'::int + 1)::text,
       CASE WHEN secdef_now = :'secdef_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM g
-- THIS APPLY'S CENTRAL PROHIBITION. appointments_rls is FOR ALL: widening it
-- would have handed a therapist the right to UPDATE and DELETE a colleague's
-- booking, which no ruling grants.
UNION ALL SELECT '20. appointments_rls is byte-identical (hash)', coalesce(appt_rls_md5_now, 'absent'), :'appt_rls_md5',
       CASE WHEN appt_rls_md5_now = :'appt_rls_md5' THEN 'OK' ELSE 'FAIL' END FROM g
-- A THERAPIST HAS NO POLICY ON THE NEW TABLE AND NEEDS NONE: the SECURITY
-- DEFINER helper reads it on their behalf without showing them who else is on
-- any team.
UNION ALL SELECT '21. all three policies on the new table admit owner and reception only',
       ct_policies::text || ' policies, ' || ct_owner_reception::text || ' owner+reception, '
         || ct_therapist::text || ' naming therapist',
       '3 policies, 3 owner+reception, 0 naming therapist',
       CASE WHEN ct_policies = 3 AND ct_owner_reception = 3 AND ct_therapist = 0 THEN 'OK' ELSE 'FAIL' END FROM g
-- IT ASSIGNS NOBODY. Every row comes from reception pressing a control, so at
-- the moment of the apply the table must be empty.
UNION ALL SELECT '22. the table ships EMPTY (this migration assigns nobody)', ct_rows::text, '0',
       CASE WHEN ct_rows = 0 THEN 'OK' ELSE 'FAIL' END FROM g;

\echo ''
\echo '=== FOR THE RECORD: the function and the new policy as the catalogue now describes them ==='

SELECT p.proname,
       pg_get_function_result(p.oid)    AS returns,
       p.prosecdef                      AS security_definer,
       pg_get_userbyid(p.proowner)      AS owner,
       coalesce(array_to_string(p.proconfig, ','), '') AS config,
       p.provolatile                    AS volatility
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'viewer_care_team_patient_ids';

SELECT c.relname AS on_table,
       pol.polname,
       pol.polcmd                       AS command,
       pol.polpermissive                AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
 WHERE c.relname IN ('patient_care_team', 'appointments')
 ORDER BY c.relname, pol.polname;

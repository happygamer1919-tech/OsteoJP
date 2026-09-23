-- 0092 CARE-LOC PRE-CHECK. READ ONLY. It writes nothing and cannot.
--
-- Run by stage 1 of docs/migration-apply-0092.md, which pins this file's sha256
-- and asserts that every verdict reads OK (18 expected). The shape is 0091's:
-- check | observed | expected | verdict, with the verdict LAST so the stage can
-- match it anchored to the end of the line. The six carries are rows whose
-- `check` column IS the carry's name, and no carry name is a substring of
-- another's or of any other row's `check`, because stage 2's awk parser matches
-- column 1 with index().
--
-- 0092 IS ONE ALTER POLICY AND ONE COMMENT, and the pre-check is shaped by that.
-- 0091 created objects, so its pre-check proved them ABSENT. 0092 changes the
-- USING of a policy that must already be there, so this file proves the policy
-- PRESENT and proves it is exactly the one 0091 created, by the md5 of its
-- expression. `ALTER POLICY ... USING` replaces whatever expression it finds,
-- so a policy someone had edited by hand would be overwritten in silence, and a
-- policy already carrying 0092's clause would mean 0092 ran outside the journal.
--
-- WHAT IT ASSERTS, AND WHY EACH ONE IS HERE:
--   0      the transaction is READ ONLY, so the server is what refuses a write;
--   1      the policy appointments_care_team_patient_history_select exists,
--          exactly once. ALTER POLICY on a missing policy is an ERROR;
--   2      its expression is 0091's, byte for byte, by md5;
--   3      its shape is PERMISSIVE, FOR SELECT, TO authenticated alone, with no
--          WITH CHECK. ALTER ... USING leaves all four alone, and the post-check
--          re-reads them, so this is the "before" of that comparison;
--   4      0092 is absent from the journal BY HASH, never by id or tag;
--   5      0091 is present BY HASH. 0092 amends what 0091 created;
--   6      the newest applied `when` is below 0092's. The 0058 skip guard;
--   CARRY  journal_rows_before = 89. Production read 89 after 0091;
--   CARRY  policies_before. ALTER must not move it;
--   CARRY  secdef_functions_before, every one owned by postgres. 0092 creates
--          no function and must not move it;
--   CARRY  appointments_policy_count_before;
--   CARRY  appointments_rls_md5. appointments_rls is FOR ALL, so its USING
--          governs SELECT, UPDATE targets and DELETE targets alike;
--   CARRY  other_policies_md5: one md5 over EVERY policy in the database except
--          the one 0092 amends - name, command, permissive, roles, USING and
--          WITH CHECK. "Nothing else moved" becomes a comparison of one value;
--   7      the five helpers the amended predicate calls exist;
--   8      `authenticated` holds EXECUTE on viewer_location_ids(). The new
--          conjunct calls it AS THE READING THERAPIST, so a missing grant would
--          not narrow the policy, it would make every therapist's read of
--          `appointments` ERROR;
--   9      `appointments` carries location_id, patient_id and patient_2_id;
--   J4a    viewer_location_ids() under JP(cb)'s claims is Castelo Branco and
--          nothing else, AND auth.uid() is JP(cb) while it answers;
--   J4b    the same for JP(lv) and Linda-a-Velha.
--
-- J4 IS THE OWNER'S OWN PRE-CHECK ROW, ruled 2026-09-22: 0092 does not go
-- READY-TO-APPLY until viewer_location_ids() returns CB only for JP(cb) and LV
-- only for JP(lv), proven in the same run. It belongs BEFORE the apply because
-- 0092's whole effect is `location_id = ANY (viewer_location_ids())`: if that
-- helper answers wrongly for these two rows the migration narrows to the wrong
-- set, and the post-check would still pass, because the post-check proves the
-- SHAPE of the policy and not what the helper says.
--
-- IT PROVES THE RLS SCOPE, NOT THE APP SCOPE. No application code calls
-- public.viewer_location_ids(): the app has a parallel TypeScript reader,
-- apps/web/lib/auth/viewer-locations.ts, and the two disagree on the unassigned
-- case (the SQL helper returns '{}', fail closed; the TypeScript one returns
-- null and falls back to every location). J4 certifies the helper the POLICY
-- uses, which is the only one 0092 reads.
--
-- IT IMPERSONATES, IT DOES NOT LOG IN: claims set transaction-locally, then
-- SET LOCAL ROLE authenticated, then RESET ROLE, inside the READ ONLY
-- transaction. No credential of either JP row is involved. auth.uid() is read
-- under the same claims because it prefers the `request.jwt.claim.sub` GUC over
-- the claims blob, so a session leftover would make the helper answer for
-- somebody else while the claims we set looked correct.
--
-- IDS: JP(cb), JP(lv) and the two clinics are the ones pinned in
-- docs/data-op-staff-10.md (STAFF-09 / STAFF-10). The tenant is the seed tenant.

\pset pager off
\timing off
\set ON_ERROR_STOP on

\set jp_cb  '54d486e0-a9c3-4c82-acac-8b909ce5a2d0'
\set jp_lv  '0c1a0000-0000-4000-8000-000000000001'
\set loc_cb 'de000002-0000-0000-0000-000000000002'
\set loc_lv 'de000002-0000-0000-0000-000000000001'
\set tenant '3a2d0711-fbdb-4ce9-b940-b6a87e3d3560'

BEGIN READ ONLY;

\echo ''
\echo '=== 0092 CARE-LOC PRE-CHECK - every verdict must read OK (18 expected) ==='

/* J4, JP(cb). Claims first, then the role, then read, then back. */
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'tenant', 'user_role', 'therapist', 'sub', :'jp_cb')::text,
       true) IS NOT NULL AS claims_set \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(array_to_string(ARRAY(SELECT unnest(public.viewer_location_ids()) ORDER BY 1), ','), '') AS j4_cb_locs,
       coalesce((SELECT auth.uid())::text, '') AS j4_cb_uid \gset
RESET ROLE;

/* J4, JP(lv). */
SELECT set_config('request.jwt.claims',
       json_build_object('tenant_id', :'tenant', 'user_role', 'therapist', 'sub', :'jp_lv')::text,
       true) IS NOT NULL AS claims_set \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(array_to_string(ARRAY(SELECT unnest(public.viewer_location_ids()) ORDER BY 1), ','), '') AS j4_lv_locs,
       coalesce((SELECT auth.uid())::text, '') AS j4_lv_uid \gset
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) IS NOT NULL AS claims_cleared \gset

WITH j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT max(created_at) FROM drizzle.__drizzle_migrations)                         AS newest_when,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '23964a4b26609126bda3166ef37ac4f4abe28bb1dd72a6f67ec82bb4ca85abfa')  AS has_0092,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'bd207cdc8c39099ac213f087e42fbd7cc332158590c5248dcbfe3928bf5a972f')  AS has_0091,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'appointments'
        AND pol.polname = 'appointments_care_team_patient_history_select')              AS pol_count,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_md5,
    (SELECT pol.polpermissive FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_permissive,
    (SELECT pol.polcmd::text FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_cmd,
    (SELECT coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
       FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_roles,
    (SELECT pol.polwithcheck IS NULL FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_no_check,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'appointments')                        AS appt_policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                       AS secdef,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) <> 'postgres')                                  AS secdef_not_postgres,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'appointments' AND pol.polname = 'appointments_rls')            AS appt_rls_md5,
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
      WHERE pol.polname <> 'appointments_care_team_patient_history_select')             AS other_md5,
    (SELECT count(DISTINCT p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('jwt_tenant_id', 'jwt_role', 'viewer_location_ids',
                          'viewer_care_team_patient_ids', 'viewer_treated_patient_ids'))  AS helpers,
    (SELECT count(*)::int FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appointments'
        AND column_name IN ('location_id', 'patient_id', 'patient_2_id'))                AS appt_cols
), g AS (
  SELECT *,
    has_function_privilege('authenticated', 'public.viewer_location_ids()', 'EXECUTE') AS staff_may_vli
  FROM j
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM g
UNION ALL SELECT '1. the patient-following policy on appointments exists, exactly once', pol_count::text, '1',
       CASE WHEN pol_count = 1 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '2. its expression is the one 0091 created (md5)', coalesce(pol_md5, 'absent'),
       '2f3548c5576a1b731d19d2cfc8f8c767',
       CASE WHEN pol_md5 = '2f3548c5576a1b731d19d2cfc8f8c767' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '3. its shape is PERMISSIVE, FOR SELECT, TO authenticated alone, no WITH CHECK',
       'permissive=' || coalesce(pol_permissive::text, '-') || ' cmd=' || coalesce(pol_cmd, '-')
         || ' roles=' || coalesce(pol_roles, '-')
         || ' with_check=' || CASE WHEN pol_no_check THEN 'none' WHEN pol_no_check IS NULL THEN '-' ELSE 'PRESENT' END,
       'permissive=true cmd=r roles=authenticated with_check=none',
       CASE WHEN pol_permissive AND pol_cmd = 'r' AND pol_roles = 'authenticated' AND pol_no_check
            THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '4. 0092 is absent from the journal, by hash', has_0092::text, '0',
       CASE WHEN has_0092 = 0 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '5. 0091 is present in the journal, by hash', has_0091::text, '1',
       CASE WHEN has_0091 = 1 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '6. the newest applied when is below that of 0092', coalesce(newest_when::text, 'absent'), '< 1788501300000',
       CASE WHEN newest_when < 1788501300000 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '89',
       CASE WHEN journal_rows = 89 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'secdef_functions_before', secdef::text, 'every one owned by postgres',
       CASE WHEN secdef > 0 AND secdef_not_postgres = 0 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'appointments_policy_count_before', appt_policies::text, '> 0',
       CASE WHEN appt_policies > 0 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'appointments_rls_md5', coalesce(appt_rls_md5, 'absent'), '32 hex characters',
       CASE WHEN appt_rls_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'other_policies_md5', coalesce(other_md5, 'absent'), '32 hex characters',
       CASE WHEN other_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '7. the five helpers the amended predicate calls exist', helpers::text, '5',
       CASE WHEN helpers = 5 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '8. authenticated can execute viewer_location_ids() (the new clause runs as the reader)',
       coalesce(staff_may_vli::text, 'absent'), 'true',
       CASE WHEN staff_may_vli THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '9. appointments carries location_id, patient_id and patient_2_id', appt_cols::text, '3',
       CASE WHEN appt_cols = 3 THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'J4a. viewer_location_ids() for JP(cb) is Castelo Branco and nothing else',
       CASE WHEN :'j4_cb_uid' <> :'jp_cb' THEN 'auth.uid() was SOMEBODY ELSE'
            WHEN :'j4_cb_locs' = '' THEN 'no clinic at all'
            WHEN :'j4_cb_locs' = :'loc_cb' THEN 'Castelo Branco alone'
            ELSE 'another set of clinics' END,
       'Castelo Branco alone',
       CASE WHEN :'j4_cb_uid' = :'jp_cb' AND :'j4_cb_locs' = :'loc_cb' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT 'J4b. viewer_location_ids() for JP(lv) is Linda-a-Velha and nothing else',
       CASE WHEN :'j4_lv_uid' <> :'jp_lv' THEN 'auth.uid() was SOMEBODY ELSE'
            WHEN :'j4_lv_locs' = '' THEN 'no clinic at all'
            WHEN :'j4_lv_locs' = :'loc_lv' THEN 'Linda-a-Velha alone'
            ELSE 'another set of clinics' END,
       'Linda-a-Velha alone',
       CASE WHEN :'j4_lv_uid' = :'jp_lv' AND :'j4_lv_locs' = :'loc_lv' THEN 'OK' ELSE 'FAIL' END FROM g;

ROLLBACK;

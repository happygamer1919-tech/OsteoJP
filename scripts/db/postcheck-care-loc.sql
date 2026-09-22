-- ============================================================================
-- 0092 CARE-LOC POST-CHECK. READ ONLY. Every verdict must read OK (11 expected).
--
-- Card CARE-LOC. Runs after `packages/db/scripts/verified-migrate.mjs` has
-- applied 0092_care_team_location, which is ONE `ALTER POLICY ... USING` on
-- appointments_care_team_patient_history_select and ONE `COMMENT ON POLICY`.
--
-- ==========================================================================
-- WHAT THIS PROVES, AND WHY EVERY ARM IS A CATALOGUE READ
-- ==========================================================================
-- The migration changes one expression and one comment, and must change nothing
-- else. That is a claim about the SHAPE of the database, so every verdict here
-- reads a system catalogue. The behavioural proof is two things at two layers,
-- and neither is this file: the DB-gated suites in CI
-- (packages/db/tests/care-team-appointment-visibility.db.test.ts and
-- appointments-location-rls.test.ts), and scripts/db/behaviour-care-loc-readonly.sql
-- against the database this was applied to.
--
-- THE FIVE CARRIES COME FROM STAGE 1 OF THE SAME SITTING (SR-59). They are
-- counts and hashes taken BEFORE the apply, so "nothing else moved" is a
-- comparison rather than an assertion. Nothing here is typed from a card.
--
-- WHY THE POLICY COUNT MUST NOT MOVE, where 0091's had to move by four. 0092 is
-- an ALTER, not a drop and a create. A drop-and-create would take the count
-- down and back up, and "the count did not change" would then pass on a run
-- where the create had silently failed. Verdict 5 is only meaningful because
-- the file ALTERs, and verdict 3 is what proves the ALTER landed.
--
-- THE EXPECTED EXPRESSION IS PINNED BY md5, AND THE VALUE WAS MEASURED, not
-- computed: it is md5(pg_get_expr(polqual, polrelid)) read back off a
-- throwaway standing at production's position immediately after
-- verified-migrate applied this exact file (docs/migration-apply-0092.md,
-- rehearsal section). pg_get_expr deparses, so the value is the SERVER's
-- rendering of the expression, not the text in the migration; the md5 of
-- 0091's form, read the same way, matches production byte for byte.
--
-- ==========================================================================
-- WHAT IS DELIBERATELY NOT ASSERTED HERE
-- ==========================================================================
-- THE JOURNAL. Stage 2 asserts it itself: the row count grew by exactly one and
-- 0092's sha256 is present exactly once. A tag-based check here is the trap
-- recorded against 0088 ("the journal id is not the tag").
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<stage 1> -v secdef_before=<stage 1>
--        -v appt_policies_before=<stage 1> -v appt_rls_md5=<stage 1>
--        -v other_policies_md5=<stage 1>
--        -f scripts/db/postcheck-care-loc.sql
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
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== 0092 CARE-LOC POST-CHECK - every verdict must read OK (11 expected) ==='

WITH t AS (
  SELECT
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'appointments'
        AND pol.polname = 'appointments_care_team_patient_history_select')              AS pol_count,
    (SELECT pol.polpermissive FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_permissive,
    (SELECT pol.polcmd::text FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_cmd,
    (SELECT coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ','), '')
       FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_roles,
    (SELECT pol.polwithcheck IS NULL FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_no_check,
    (SELECT pg_get_expr(pol.polqual, pol.polrelid) FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_qual,
    (SELECT obj_description(pol.oid, 'pg_policy') FROM pg_policy pol
      WHERE pol.polname = 'appointments_care_team_patient_history_select')              AS pol_comment,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies_now,
    (SELECT count(*)::int FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'appointments')                        AS appt_policies_now,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                       AS secdef_now,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'appointments' AND pol.polname = 'appointments_rls')            AS appt_rls_md5_now,
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
      WHERE pol.polname <> 'appointments_care_team_patient_history_select')             AS other_md5_now
), g AS (
  SELECT *,
    md5(pol_qual) AS pol_md5,
    has_function_privilege('authenticated', 'public.viewer_location_ids()', 'EXECUTE') AS staff_may_vli
  FROM t
)
SELECT '1. the patient-following policy on appointments exists, exactly once' AS check,
       pol_count::text                                                      AS observed,
       '1'                                                                  AS expected,
       CASE WHEN pol_count = 1 THEN 'OK' ELSE 'FAIL' END                    AS verdict FROM g
-- ALTER ... USING LEAVES THESE FOUR ALONE. A policy that came out FOR ALL would
-- hand every therapist the right to change or delete a colleague's booking.
UNION ALL SELECT '2. its shape is still PERMISSIVE, FOR SELECT, TO authenticated alone, no WITH CHECK',
       'permissive=' || coalesce(pol_permissive::text, '-') || ' cmd=' || coalesce(pol_cmd, '-')
         || ' roles=' || coalesce(pol_roles, '-')
         || ' with_check=' || CASE WHEN pol_no_check THEN 'none' WHEN pol_no_check IS NULL THEN '-' ELSE 'PRESENT' END,
       'permissive=true cmd=r roles=authenticated with_check=none',
       CASE WHEN pol_permissive AND pol_cmd = 'r' AND pol_roles = 'authenticated' AND pol_no_check
            THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '3. its expression is the one 0092 writes (md5, measured on the rehearsal)',
       coalesce(pol_md5, 'absent'), '155e57e4d6759878d8f7f468cee48dfa',
       CASE WHEN pol_md5 = '155e57e4d6759878d8f7f468cee48dfa' THEN 'OK' ELSE 'FAIL' END FROM g
-- THE RULING, READ OFF THE SHIPPED PREDICATE: the location clause is there, and
-- nothing 0091 put there was lost on the way.
UNION ALL SELECT '4. it keys on the clinic AND keeps role therapist, both helpers and both patient columns',
       CASE WHEN pol_qual IS NULL THEN 'absent' ELSE
         CASE WHEN pol_qual LIKE '%viewer_location_ids%' AND pol_qual LIKE '%location_id%' THEN 'clinic ' ELSE 'NO-clinic ' END
         || CASE WHEN pol_qual LIKE '%therapist%' THEN 'therapist ' ELSE 'NO-role ' END
         || CASE WHEN pol_qual LIKE '%viewer_care_team_patient_ids%' THEN 'care_team ' ELSE 'NO-care_team ' END
         || CASE WHEN pol_qual LIKE '%viewer_treated_patient_ids%' THEN 'treated ' ELSE 'NO-treated ' END
         || CASE WHEN pol_qual LIKE '%patient_2_id%' THEN 'patient_2_id' ELSE 'NO-patient_2_id' END END,
       'clinic therapist care_team treated patient_2_id',
       CASE WHEN pol_qual LIKE '%viewer_location_ids%'
             AND pol_qual LIKE '%location_id%'
             AND pol_qual LIKE '%therapist%'
             AND pol_qual LIKE '%viewer_care_team_patient_ids%'
             AND pol_qual LIKE '%viewer_treated_patient_ids%'
             AND pol_qual LIKE '%patient_2_id%'
            THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '5. the POLICY COUNT did not move (ALTER, not drop and create)', policies_now::text,
       :'policies_before',
       CASE WHEN policies_now = :'policies_before'::int THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '6. the count on appointments did not move', appt_policies_now::text,
       :'appt_policies_before',
       CASE WHEN appt_policies_now = :'appt_policies_before'::int THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '7. no SECURITY DEFINER function appeared or went', secdef_now::text,
       :'secdef_before',
       CASE WHEN secdef_now = :'secdef_before'::int THEN 'OK' ELSE 'FAIL' END FROM g
-- THIS APPLY'S CENTRAL PROHIBITION, as it was 0091's. appointments_rls is FOR
-- ALL: narrowing its own-work arms was NOT ruled, and widening it would hand a
-- therapist UPDATE and DELETE over a colleague's booking.
UNION ALL SELECT '8. appointments_rls is byte-identical (hash)', coalesce(appt_rls_md5_now, 'absent'), :'appt_rls_md5',
       CASE WHEN appt_rls_md5_now = :'appt_rls_md5' THEN 'OK' ELSE 'FAIL' END FROM g
-- EVERY OTHER POLICY, in one value. patients_select was examined and
-- deliberately left alone; this is what proves it was.
UNION ALL SELECT '9. every OTHER policy in the database is byte-identical (one md5 over all of them)',
       coalesce(other_md5_now, 'absent'), :'other_policies_md5',
       CASE WHEN other_md5_now = :'other_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '10. the policy comment is the CARE-LOC one (the second statement landed)',
       CASE WHEN pol_comment IS NULL THEN 'absent'
            WHEN pol_comment LIKE '%CARE-LOC%' THEN 'names CARE-LOC' ELSE 'the old comment' END,
       'names CARE-LOC',
       CASE WHEN pol_comment LIKE '%CARE-LOC%' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '11. authenticated can still execute viewer_location_ids() (the new clause runs as the reader)',
       coalesce(staff_may_vli::text, 'absent'), 'true',
       CASE WHEN staff_may_vli THEN 'OK' ELSE 'FAIL' END FROM g;

\echo ''
\echo '=== FOR THE RECORD: the amended policy as the catalogue now describes it ==='

SELECT c.relname AS on_table,
       pol.polname,
       pol.polcmd                       AS command,
       pol.polpermissive                AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) r ORDER BY 1), ',') AS to_roles,
       md5(pg_get_expr(pol.polqual, pol.polrelid)) AS using_md5
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
 WHERE c.relname = 'appointments'
 ORDER BY pol.polname;

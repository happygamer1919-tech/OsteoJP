-- ============================================================================
-- NESA-NAMES POST-CHECK. READ ONLY. Every verdict must read OK.
--
-- Card NESA-NAMES. Runs after `pnpm db:migrate` has applied
-- 0090_nesa_patient_name_for_therapists (promoted from
-- migrations-pending/NEXT-AFTER-0089_nesa_patient_name_for_therapists.sql,
-- bytes unchanged).
--
-- ==========================================================================
-- WHAT THIS PROVES, AND WHY EVERY ARM IS A CATALOGUE READ
-- ==========================================================================
-- The migration creates ONE function and must change nothing else. That is a
-- claim about the SHAPE of the database, so every verdict here reads a system
-- catalogue rather than exercising behaviour: the behavioural proof is
-- packages/db/tests/nesa-patient-name-for-therapists.db.test.ts, which runs in
-- CI's DB-gated job against a seeded database on every PR.
--
-- THE THREE CARRIES COME FROM STAGE 1 OF THE SAME SITTING (SR-59). They are
-- counts and a hash taken BEFORE the apply, so "nothing else moved" is a
-- comparison rather than an assertion. Nothing here is typed from a card.
--
-- ==========================================================================
-- WHAT IS DELIBERATELY NOT ASSERTED HERE
-- ==========================================================================
-- THE JOURNAL. `drizzle.__drizzle_migrations` identifies a migration by a `hash`
-- whose derivation this file would have to assume, and a tag-based check is the
-- trap recorded against 0088 ("the journal id is not the tag"). The journal is
-- proven at stage 0 instead, by `pnpm db:check-journal` reconciling files,
-- entries, order and the supabase mirror BY CONTENT, and by drizzle's own apply
-- output naming what it ran.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<stage 1> -v secdef_before=<stage 1> -v patients_md5=<stage 1>
--        -f scripts/db/postcheck-nesa-names.sql
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
\if :{?patients_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v patients_md5 is missing. Stage 1 prints it; this file refuses to guess.';
  END $missing$;
\endif

\pset pager off
\timing off

\echo ''
\echo '=== NESA-NAMES POST-CHECK - every verdict must read OK ==='

WITH f AS (
  SELECT
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names') AS fn_count,
    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names') AS secdef,
    (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names') AS owner,
    (SELECT coalesce(array_to_string(p.proconfig, ','), '') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names') AS config,
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'shared_resource_appointment_patient_names') AS result_sig,
    (SELECT count(*)::int FROM pg_policy)                                                    AS policies_now,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)                                            AS secdef_now,
    (SELECT md5(pg_get_expr(pol.polqual, pol.polrelid)) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patients' AND pol.polname = 'patients_select')                      AS patients_md5_now,
    (SELECT pg_get_expr(pol.polqual, pol.polrelid) FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'patients' AND pol.polname = 'patients_select')                      AS patients_qual
), g AS (
  SELECT *,
    has_function_privilege('anon',          'public.shared_resource_appointment_patient_names()', 'EXECUTE') AS anon_may,
    has_function_privilege('patient',       'public.shared_resource_appointment_patient_names()', 'EXECUTE') AS patient_may,
    has_function_privilege('service_role',  'public.shared_resource_appointment_patient_names()', 'EXECUTE') AS service_may,
    has_function_privilege('authenticated', 'public.shared_resource_appointment_patient_names()', 'EXECUTE') AS staff_may
  FROM f
)
SELECT '1. the function exists, exactly once'                AS check,
       fn_count::text                                        AS observed,
       '1'                                                   AS expected,
       CASE WHEN fn_count = 1 THEN 'OK' ELSE 'FAIL' END      AS verdict FROM g
UNION ALL SELECT '2. it is SECURITY DEFINER',                 coalesce(secdef::text, 'absent'), 'true',
       CASE WHEN secdef THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '3. owned by postgres (whose privileges it runs with)', coalesce(owner, 'absent'), 'postgres',
       CASE WHEN owner = 'postgres' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '4. search_path is pinned',                  coalesce(config, ''), 'search_path=public',
       CASE WHEN config LIKE '%search_path=public%' THEN 'OK' ELSE 'FAIL' END FROM g
-- THE RULING IS "THE NAME AND NOTHING MORE", asserted on the signature so a
-- later edit that adds a column fails here instead of shipping a phone number
-- to every therapist at the clinic.
UNION ALL SELECT '5. returns exactly appointment_id + patient_name', coalesce(result_sig, 'absent'),
       'TABLE(appointment_id uuid, patient_name text)',
       CASE WHEN result_sig LIKE '%appointment_id uuid%'
             AND result_sig LIKE '%patient_name text%'
             AND result_sig NOT ILIKE '%phone%'
             AND result_sig NOT ILIKE '%nif%'
             AND result_sig NOT ILIKE '%email%'
             AND result_sig NOT ILIKE '%patient_id%'
            THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '6. anon cannot execute it',                 anon_may::text,    'false',
       CASE WHEN anon_may = false THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '7. the PORTAL patient role cannot execute it', patient_may::text, 'false',
       CASE WHEN patient_may = false THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '8. service_role cannot execute it (0079)',  service_may::text, 'false',
       CASE WHEN service_may = false THEN 'OK' ELSE 'FAIL' END FROM g
-- THE POSITIVE CONTROL for the three refusals above: if `authenticated` were
-- false too, 6, 7 and 8 would be satisfied by a function nobody can call.
UNION ALL SELECT '9. authenticated CAN execute it (control)', staff_may::text,   'true',
       CASE WHEN staff_may THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '10. the POLICY COUNT did not move',         policies_now::text, :'policies_before',
       CASE WHEN policies_now = :'policies_before'::int THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '11. exactly ONE new SECURITY DEFINER function', secdef_now::text,
       (:'secdef_before'::int + 1)::text,
       CASE WHEN secdef_now = :'secdef_before'::int + 1 THEN 'OK' ELSE 'FAIL' END FROM g
-- THE RULING'S CENTRAL PROHIBITION. Widening this policy would have handed a
-- therapist the ficha, the phone and the NIF of every patient NESA sees.
UNION ALL SELECT '12. patients_select is byte-identical (hash)', coalesce(patients_md5_now, 'absent'), :'patients_md5',
       CASE WHEN patients_md5_now = :'patients_md5' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '13. and still keys on viewer_treated_patient_ids',
       CASE WHEN patients_qual LIKE '%viewer_treated_patient_ids%' THEN 'present' ELSE 'MISSING' END, 'present',
       CASE WHEN patients_qual LIKE '%viewer_treated_patient_ids%' THEN 'OK' ELSE 'FAIL' END FROM g
UNION ALL SELECT '14. and names no shared_resource helper',
       CASE WHEN patients_qual ILIKE '%shared_resource%' THEN 'PRESENT' ELSE 'absent' END, 'absent',
       CASE WHEN patients_qual ILIKE '%shared_resource%' THEN 'FAIL' ELSE 'OK' END FROM g;

\echo ''
\echo '=== FOR THE RECORD: the function as the catalogue now describes it ==='

SELECT p.proname,
       pg_get_function_result(p.oid)    AS returns,
       p.prosecdef                      AS security_definer,
       pg_get_userbyid(p.proowner)      AS owner,
       coalesce(array_to_string(p.proconfig, ','), '') AS config,
       p.provolatile                    AS volatility
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'shared_resource_appointment_patient_names';

-- ============================================================================
-- 0098 CARE-02a v2 (the care team reads the ficha and the registos, at the
-- therapist's own clinics only): POST-CHECK.
-- READ ONLY. Every verdict must read OK (16 expected).
--
-- Runs after `packages/db/scripts/verified-migrate.mjs` has applied
-- 0098_care02a_care_team_reads: ONE function was CREATED, FOUR policies were
-- ALTERED in place, and nothing else moved. Every verdict here is a catalogue
-- read. The behaviour is proven elsewhere: scripts/db/behaviour-care02a-
-- readonly.sql on the database this was applied to, and the in-action arms of
-- the rehearsal (writes, which no READ ONLY check can make).
--
-- THE FIVE CARRIES COME FROM THE PRE-CHECK OF THE SAME SITTING (SR-59).
--
-- EXACT, NOT "LOOKS LIKE". Every policy expression is compared by md5 to the
-- text Postgres 17 renders for it, as 0093's and 0094's post-checks do; the
-- expected values were read on the rehearsal database after the apply. A LIKE
-- would pass `... OR true`; this does not. THE ELEVEN OTHER POLICIES ON THE
-- THREE TABLES ARE PINNED TO THE SAME md5 AS THE PRE-CHECK'S ARM 5, and THE
-- THIRTEEN ON attachments, clinical_episodes, appointment_notes,
-- patient_note_revisions AND guest_clinical_intakes TO THE SAME md5 AS ITS ARM
-- 14, which is the proof that no write policy of patients or clinical_records,
-- not patient_care_team_update, and nothing on the five tables 0098 leaves to
-- the N5 wave, moved.
--
-- THE FOUR NEW EXPRESSIONS, as the migration writes them
-- (packages/db/migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql,
-- section 9), rendered by Postgres 17 as:
--   patients_select           de612f10145303302884747fa10b6c66  (USING)
--   clinical_records_select   976ba6f105c2bc373f0ec3c4a2ffb342  (USING)
--   patient_care_team_select  6a84c4ab560d81fabf3424b6f75dbd04  (USING)
--   patient_care_team_insert  93edfcb33192ef57568c0970a5283a4d  (WITH CHECK)
-- THE NEW FUNCTION, public.viewer_care_team_patient_ids_at_my_clinics():
--   nullary, RETURNS uuid[], LANGUAGE sql, SECURITY DEFINER, STABLE,
--   search_path=public, owned by postgres, body (prosrc) md5
--   9539ec380f391d56af0d89c7998156db; EXECUTE for authenticated, and for
--   neither anon, service_role, patient nor PUBLIC.
--
-- "NO OTHER FUNCTION CHANGED" IS MEASURED WITHOUT THE NEW ONE. The pre-check's
-- functions_md5 and grants_md5 were read before the function existed; this file
-- recomputes both over the same rows, leaving out the one function 0098 creates,
-- so an equal md5 says every other function's body, security, volatility,
-- owner, settings and ACL, and every table and column ACL, is byte-identical.
-- With the new function present exactly once (arm 12), that is also the proof
-- that the SECURITY DEFINER count in public moved by exactly one.
--
-- THIS FILE DOES NOT OPEN ITS OWN TRANSACTION. The apply stage wraps it in
-- `-c "begin read only" ... -c "rollback"`, so the server refuses any write.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v policies_before=<pre> -v other_policies_md5=<pre>
--        -v functions_md5=<pre> -v grants_md5=<pre> -v journal_rows_before=<pre>
--        -c "begin read only" -f scripts/db/postcheck-0098-care02a.sql -c "rollback"
-- ============================================================================

\if :{?policies_before}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v policies_before is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?other_policies_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v other_policies_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?functions_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v functions_md5 is missing. The pre-check prints it; this file refuses to guess.';
  END $missing$;
\endif
\if :{?grants_md5}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v grants_md5 is missing. The pre-check prints it; this file refuses to guess.';
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
\echo '=== 0098 CARE-02a v2 POST-CHECK - every verdict must read OK (16 expected) ==='

WITH pol AS (
  SELECT c.relname, p.polname, p.polcmd::text AS cmd, p.polpermissive AS permissive,
         coalesce(array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ','), '') AS to_roles,
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-')      AS qual_md5,
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-') AS check_md5
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('patients', 'clinical_records', 'patient_care_team',
                       'attachments', 'clinical_episodes', 'appointment_notes',
                       'patient_note_revisions', 'guest_clinical_intakes')
), fn AS (
  SELECT p.proname,
         CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '/' || p.provolatile::text || '/'
         || coalesce(array_to_string(p.proconfig, ','), '') || '/' || pg_get_userbyid(p.proowner) || '/'
         || CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'exec' ELSE 'NOEXEC' END
         || ' ' || md5(p.prosrc) AS shape
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('viewer_care_team_patient_ids', 'viewer_location_ids', 'clinical_admin_sees_patient',
                       'viewer_treated_patient_ids', 'clinical_therapist_sees_patient')
), nf AS (
  -- THE NEW FUNCTION, every row by that name in public (arm 12 requires one).
  SELECT p.oid, p.pronargs, format_type(p.prorettype, NULL) AS rettype, l.lanname,
         p.prosecdef, p.provolatile::text AS volatile, coalesce(array_to_string(p.proconfig, ','), '') AS config,
         pg_get_userbyid(p.proowner) AS owner, md5(p.prosrc) AS body_md5, p.proacl IS NOT NULL AS acl_present
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids_at_my_clinics'
), t AS (
  SELECT
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'patients' AND polname = 'patients_select')             AS new_patients,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'clinical_records' AND polname = 'clinical_records_select') AS new_records,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'patient_care_team' AND polname = 'patient_care_team_select') AS new_team_select,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'patient_care_team' AND polname = 'patient_care_team_insert') AS new_team_insert,
    (SELECT md5(string_agg(relname || '.' || polname || ':' || cmd || ':' || permissive::text || ':' || to_roles
                           || ':' || qual_md5 || ':' || check_md5, ';' ORDER BY relname, polname))
       FROM pol WHERE relname IN ('patients', 'clinical_records', 'patient_care_team')
                  AND polname NOT IN ('patients_select', 'clinical_records_select',
                                      'patient_care_team_select', 'patient_care_team_insert')) AS eleven_md5,
    (SELECT count(*)::int FROM pol WHERE relname IN ('patients', 'clinical_records', 'patient_care_team')
                  AND polname NOT IN ('patients_select', 'clinical_records_select',
                                      'patient_care_team_select', 'patient_care_team_insert')) AS eleven_n,
    (SELECT string_agg(relname || '=' || n, ',' ORDER BY relname)
       FROM (SELECT relname, count(*)::text AS n FROM pol
              WHERE relname IN ('patients', 'clinical_records', 'patient_care_team') GROUP BY relname) x) AS per_table,
    (SELECT count(*)::int FROM pol WHERE relname IN ('patients', 'clinical_records', 'patient_care_team')
                                    AND NOT permissive)                                AS restrictive_pols,
    (SELECT md5(string_agg(relname || '.' || polname || ':' || cmd || ':' || permissive::text || ':' || to_roles
                           || ':' || qual_md5 || ':' || check_md5, ';' ORDER BY relname, polname))
       FROM pol WHERE relname IN ('attachments', 'clinical_episodes', 'appointment_notes',
                                  'patient_note_revisions', 'guest_clinical_intakes')) AS five_md5,
    (SELECT string_agg(relname || '=' || n, ',' ORDER BY relname)
       FROM (SELECT relname, count(*)::text AS n FROM pol
              WHERE relname IN ('attachments', 'clinical_episodes', 'appointment_notes',
                                'patient_note_revisions', 'guest_clinical_intakes') GROUP BY relname) x) AS five_per_table,
    (SELECT string_agg(proname || '=' || shape, ' ; ' ORDER BY proname) FROM fn)        AS helper_shapes,
    (SELECT count(*)::int FROM nf)                                                     AS nf_n,
    (SELECT 'args=' || pronargs::text || ' returns=' || rettype || ' lang=' || lanname
            || ' secdef=' || prosecdef::text || ' volatile=' || volatile || ' config=' || config
            || ' owner=' || owner || ' body=' || body_md5 FROM nf LIMIT 1)             AS nf_shape,
    (SELECT 'authenticated=' || has_function_privilege('authenticated', oid, 'EXECUTE')::text
            || ' anon=' || has_function_privilege('anon', oid, 'EXECUTE')::text
            || ' service_role=' || has_function_privilege('service_role', oid, 'EXECUTE')::text
            || ' patient=' || has_function_privilege('patient', oid, 'EXECUTE')::text
            || ' acl_present=' || acl_present::text
            || ' public_execute=' || (SELECT count(*) FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid = nf.oid)) a
                                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')::text
       FROM nf LIMIT 1)                                                                 AS nf_exec,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('patients', 'clinical_records', 'patient_care_team')
        AND c.relrowsecurity)                                                           AS rls_on,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies_now,
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
      WHERE NOT (n.nspname = 'public'
                 AND (c.relname, p.polname) IN (('patients', 'patients_select'),
                                                ('clinical_records', 'clinical_records_select'),
                                                ('patient_care_team', 'patient_care_team_select'),
                                                ('patient_care_team', 'patient_care_team_insert')))) AS other_md5_now,
    -- The pre-check's functions md5, over every function EXCEPT the new one.
    (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                           || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) || ':'
                           || coalesce(array_to_string(p.proconfig, ','), ''),
                           ';' ORDER BY p.oid::regprocedure::text))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname <> 'viewer_care_team_patient_ids_at_my_clinics') AS functions_md5_now,
    -- The pre-check's grants md5, with the new function's ACL left out.
    (SELECT md5(
              coalesce((SELECT string_agg(c.relname || ':' || coalesce(c.relacl::text, 'default'), ';' ORDER BY c.relname)
                          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')), '')
              || '|' ||
              coalesce((SELECT string_agg(c.relname || '.' || a.attname || ':' || a.attacl::text, ';' ORDER BY c.relname, a.attname)
                          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND a.attacl IS NOT NULL AND NOT a.attisdropped), '')
              || '|' ||
              coalesce((SELECT string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'default'), ';'
                                          ORDER BY p.oid::regprocedure::text)
                          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public'
                           AND p.proname <> 'viewer_care_team_patient_ids_at_my_clinics'), '')))  AS grants_md5_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows_now,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45')  AS has_0098,
    (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1) AS newest_hash
)
SELECT '1. patients_select: FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0098''s expression (the clinic-limited care-team term on the therapist arm)' AS check,
       coalesce(new_patients, 'absent')                               AS observed,
       'r/true/authenticated de612f10145303302884747fa10b6c66 -'      AS expected,
       CASE WHEN new_patients = 'r/true/authenticated de612f10145303302884747fa10b6c66 -' THEN 'OK' ELSE 'FAIL' END AS verdict FROM t
UNION ALL SELECT '2. clinical_records_select: FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0098''s expression (the clinic-limited care-team term on the therapist arm)',
       coalesce(new_records, 'absent'),
       'r/true/authenticated 976ba6f105c2bc373f0ec3c4a2ffb342 -',
       CASE WHEN new_records = 'r/true/authenticated 976ba6f105c2bc373f0ec3c4a2ffb342 -' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '3. patient_care_team_select: FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0098''s expression (owner, reception; a therapist''s own rows and its teams at its clinics)',
       coalesce(new_team_select, 'absent'),
       'r/true/authenticated 6a84c4ab560d81fabf3424b6f75dbd04 -',
       CASE WHEN new_team_select = 'r/true/authenticated 6a84c4ab560d81fabf3424b6f75dbd04 -' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '4. patient_care_team_insert: FOR INSERT, PERMISSIVE, TO authenticated, WITH CHECK exactly 0098''s expression (owner, reception; a therapist''s own booking row)',
       coalesce(new_team_insert, 'absent'),
       'a/true/authenticated - 93edfcb33192ef57568c0970a5283a4d',
       CASE WHEN new_team_insert = 'a/true/authenticated - 93edfcb33192ef57568c0970a5283a4d' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '5. the eleven other policies on the three tables are unchanged: the same md5 as the pre-check''s arm 5',
       eleven_n::text || ' policies, ' || coalesce(eleven_md5, 'absent'),
       '11 policies, 85981c6894a92530edca6f8eeb634c69',
       CASE WHEN eleven_n = 11 AND eleven_md5 = '85981c6894a92530edca6f8eeb634c69' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '6. the policy count is flat on each table: 5, 3 and 7, none RESTRICTIVE',
       coalesce(per_table, 'none') || ', ' || restrictive_pols::text || ' restrictive',
       'clinical_records=5,patient_care_team=3,patients=7, 0 restrictive',
       CASE WHEN per_table = 'clinical_records=5,patient_care_team=3,patients=7' AND restrictive_pols = 0
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '7. the POLICY COUNT in the database did not move', policies_now::text, :'policies_before',
       CASE WHEN policies_now = :'policies_before'::int THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '8. every OTHER policy in the database is byte-identical (one md5 over all of them)',
       coalesce(other_md5_now, 'absent'), :'other_policies_md5',
       CASE WHEN other_md5_now = :'other_policies_md5' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '9. the thirteen policies on attachments, clinical_episodes, appointment_notes, patient_note_revisions and guest_clinical_intakes are unchanged: the pre-check''s arm 14',
       coalesce(five_per_table, 'none') || ', ' || coalesce(five_md5, 'absent'),
       'appointment_notes=4,attachments=2,clinical_episodes=2,guest_clinical_intakes=2,patient_note_revisions=3, 50438a565df1b37cbadbb32b896876eb',
       CASE WHEN five_per_table = 'appointment_notes=4,attachments=2,clinical_episodes=2,guest_clinical_intakes=2,patient_note_revisions=3'
             AND five_md5 = '50438a565df1b37cbadbb32b896876eb' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '10. no function in public other than the new one changed, and the five helpers are still as the pre-check''s arm 7 pinned them',
       coalesce(functions_md5_now, 'absent') || CASE WHEN helper_shapes = 'clinical_admin_sees_patient=DEFINER/s/search_path=public/postgres/exec 278de3a836486f3950e9513baf5429b3 ; clinical_therapist_sees_patient=DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; viewer_care_team_patient_ids=DEFINER/s/search_path=public/postgres/exec 88b26a83d4c94fe7e5acbf906c2d4b4e ; viewer_location_ids=DEFINER/s/search_path=public/postgres/exec 1238f35e2142dbb260a0c7acda4f48ef ; viewer_treated_patient_ids=DEFINER/s/search_path=public/postgres/exec c6bb997dced200956d7b5d1c49427dfa'
                                                     THEN ', helpers pinned' ELSE ', helpers MOVED' END,
       :'functions_md5' || ', helpers pinned',
       CASE WHEN functions_md5_now = :'functions_md5'
             AND helper_shapes = 'clinical_admin_sees_patient=DEFINER/s/search_path=public/postgres/exec 278de3a836486f3950e9513baf5429b3 ; clinical_therapist_sees_patient=DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; viewer_care_team_patient_ids=DEFINER/s/search_path=public/postgres/exec 88b26a83d4c94fe7e5acbf906c2d4b4e ; viewer_location_ids=DEFINER/s/search_path=public/postgres/exec 1238f35e2142dbb260a0c7acda4f48ef ; viewer_treated_patient_ids=DEFINER/s/search_path=public/postgres/exec c6bb997dced200956d7b5d1c49427dfa'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '11. no table, column or function grant in public changed, the new function''s own ACL aside',
       coalesce(grants_md5_now, 'absent'), :'grants_md5',
       CASE WHEN grants_md5_now = :'grants_md5' THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '12. the new helper exists ONCE, nullary, uuid[], sql, SECURITY DEFINER, STABLE, search_path=public, owned by postgres, with 0098''s body',
       nf_n::text || ' found, ' || coalesce(nf_shape, 'absent'),
       '1 found, args=0 returns=uuid[] lang=sql secdef=true volatile=s config=search_path=public owner=postgres body=9539ec380f391d56af0d89c7998156db',
       CASE WHEN nf_n = 1
             AND nf_shape = 'args=0 returns=uuid[] lang=sql secdef=true volatile=s config=search_path=public owner=postgres body=9539ec380f391d56af0d89c7998156db'
            THEN 'OK' ELSE 'FAIL' END FROM t
-- THE POSITIVE CONTROL for the four refusals sits in the same row: a function
-- nobody may execute would satisfy the refusals and take every therapist's
-- patients_select down with it. PUBLIC is read off the ACL (SR-52: it is not a
-- role name has_function_privilege accepts, and a NULL ACL means PUBLIC holds
-- EXECUTE by default).
UNION ALL SELECT '13. EXECUTE on the new helper: authenticated only (anon, service_role, patient and PUBLIC hold none)',
       coalesce(nf_exec, 'absent'),
       'authenticated=true anon=false service_role=false patient=false acl_present=true public_execute=0',
       CASE WHEN nf_exec = 'authenticated=true anon=false service_role=false patient=false acl_present=true public_execute=0'
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '14. row level security is still ENABLED on the three tables', rls_on::text, '3',
       CASE WHEN rls_on = 3 THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '15. 0098 is in the journal by hash, it is the newest row, and the journal moved by exactly one',
       has_0098::text || ' by hash, newest ' || CASE WHEN newest_hash = 'fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45'
                                                     THEN 'is 0098' ELSE 'is NOT 0098' END
       || ', journal ' || journal_rows_now::text,
       '1 by hash, newest is 0098, journal ' || (:'journal_rows_before'::int + 1)::text,
       CASE WHEN has_0098 = 1
             AND newest_hash = 'fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45'
             AND journal_rows_now = :'journal_rows_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END FROM t
UNION ALL SELECT '16. exactly three policies in the database name the new helper, and they are the three 0098 put it in',
       coalesce((SELECT string_agg(tablename || '.' || policyname, ',' ORDER BY tablename, policyname) FROM pg_policies
                  WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '') LIKE '%viewer_care_team_patient_ids_at_my_clinics%'), 'none'),
       'clinical_records.clinical_records_select,patient_care_team.patient_care_team_select,patients.patients_select',
       CASE WHEN (SELECT string_agg(tablename || '.' || policyname, ',' ORDER BY tablename, policyname) FROM pg_policies
                   WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '') LIKE '%viewer_care_team_patient_ids_at_my_clinics%')
                 = 'clinical_records.clinical_records_select,patient_care_team.patient_care_team_select,patients.patients_select'
            THEN 'OK' ELSE 'FAIL' END FROM t;

\echo ''
\echo '=== FOR THE RECORD: the policies on patients, clinical_records and patient_care_team as the catalogue now describes them ==='

SELECT c.relname, p.polname, p.polcmd AS command, p.polpermissive AS permissive,
       array_to_string(array(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') AS to_roles
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('patients', 'clinical_records', 'patient_care_team')
 ORDER BY 1, 2;

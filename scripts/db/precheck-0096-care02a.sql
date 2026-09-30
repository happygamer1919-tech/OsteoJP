-- 0096 CARE-02a v2 (the care team reads the ficha and the registos, at the
-- therapist's own clinics only): PRE-CHECK. Ruled 0098 on 2026-09-27 and
-- renumbered 0096 by the fifth renumbering of 2026-09-30; the migration's own
-- header still says 0098, because a promotion changes no byte of it.
-- READ ONLY. It writes nothing and cannot.
--
-- For the apply document written at promotion (docs/migration-apply-0096.md),
-- which pins this file's sha256 and asserts that every verdict reads OK (20
-- expected). The shape is 0094's: check | observed | expected | verdict, verdict
-- LAST so a stage can match it anchored to the end of the line. The five carries
-- are rows whose `check` column IS the carry's name, and no carry name is a
-- substring of another's or of any other row's `check`.
--
-- 0096 CREATES ONE FUNCTION AND ALTERS FOUR POLICIES, AND CHANGES NOTHING ELSE,
-- so this file proves the starting point exactly:
--   0      the transaction is READ ONLY;
--   1-4    each of the four policies 0096 alters is there, PERMISSIVE, TO
--          authenticated, with the command it has on main and the expression
--          main's migrations leave it with, pinned by md5 of Postgres 17's
--          rendering (read on the rehearsal built from main's 91 migrations
--          and the then held 0094 to 0097, which included 0094 and 0095 as
--          production now carries them):
--            patients_select           0074:222-242
--            clinical_records_select   0045:221-240
--            patient_care_team_select  0091:108-115
--            patient_care_team_insert  0091:117-124
--          0096 RESTATES each expression and adds one arm. A different
--          expression on production means the ALTER would overwrite something
--          this file was not written against: STOP and find out why;
--   5      the eleven OTHER policies on those three tables (the patients and
--          clinical_records writes, patient_care_team_update, the patient
--          self-scopes, the token hook's read) read as main's migrations leave
--          them, one md5 over all eleven. 0096 relies on them NOT moving: a
--          care-team-only therapist must still write nothing;
--   6      the three tables carry exactly 7, 5 and 3 policies, none RESTRICTIVE,
--          so the post-check's flat-count arithmetic holds;
--   7      the five functions 0096 calls or reproduces, and must NOT touch, are
--          as their migrations left them: SECURITY DEFINER, STABLE,
--          search_path=public, owned by postgres, EXECUTE to authenticated,
--          body pinned by md5:
--            viewer_care_team_patient_ids     0091, the team the new helper reads
--            viewer_location_ids              0073, the clinics it reads
--            clinical_admin_sees_patient      0045, the basis it reproduces
--            viewer_treated_patient_ids       0074, the insert arm's check
--            clinical_therapist_sees_patient  0045, deliberately not widened;
--   8      row level security is ENABLED on the three tables;
--   9      0096 is absent from the journal, BY HASH: the sha256 of
--          packages/db/migrations/0096_care02a_care_team_reads.sql,
--          fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45,
--          promoted from migrations-pending/NEXT-AFTER-0097_care02a_care_team_reads.sql.
--          The promotion is a rename and changes no byte, so this is the hash
--          drizzle records for 0096;
--   10     0093 is present, BY HASH (the last migration numbered on main when
--          this file was written);
--   11     the newest applied journal row is 0095's: its hash and its `when`,
--          passed in with -v prev_hash and -v prev_when. The apply document
--          pins both (0095 is applied and final) and checks them against
--          0095's file and journal entry on the branch it runs from. 0096
--          follows it; its own `when` is above prev_when (the 0058 skip guard);
--   12     the three helpers every policy calls exist (public.jwt_tenant_id,
--          public.jwt_role, auth.uid);
--   13     the NEW helper's name is free: no function in public is called
--          viewer_care_team_patient_ids_at_my_clinics, with any arguments.
--          0096 creates it with CREATE OR REPLACE, which would silently take
--          over a same-named function somebody else made;
--   14     the thirteen policies on attachments, clinical_episodes,
--          appointment_notes, patient_note_revisions and guest_clinical_intakes
--          read as main's migrations leave them (2, 2, 4, 3 and 2 of them),
--          one md5 over all thirteen. 0096 must not move them, and the
--          post-check pins the same md5;
--   CARRY  journal_rows_before = 93: main's 91 after 0093, then 0094 and
--          0095, one row each, in the ruled queue (0000 to 0095 applied;
--          the journal has fewer rows than file numbers, as it always has);
--   CARRY  policies_before. 0096 must not move it;
--   CARRY  other_policies_md5: one md5 over every policy in the database EXCEPT
--          the four 0096 alters. The post-check recomputes it; nothing else may
--          move;
--   CARRY  functions_md5: one md5 over every function in public (signature,
--          body, SECURITY DEFINER, volatility, owner, settings). The post-check
--          recomputes it over every function EXCEPT the one 0096 creates, and
--          it must not move: 0096 edits no existing function;
--   CARRY  grants_md5: one md5 over every table, column and function ACL in
--          public. The post-check recomputes it without the new function's
--          ACL, and it must not move: 0096 grants nothing on anything else.
--
-- Run:
--   psql "${DATABASE_URL_DIRECT}" -X -v ON_ERROR_STOP=1 -P pager=off
--        -v prev_hash=<0095's sha256> -v prev_when=<0095's journal when>
--        -f scripts/db/precheck-0096-care02a.sql

\pset pager off
\timing off
\set ON_ERROR_STOP on

\if :{?prev_hash}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_hash is missing (the sha256 of 0095 as applied). This file refuses to guess.';
  END $missing$;
\endif
\if :{?prev_when}
\else
  DO $missing$ BEGIN
    RAISE EXCEPTION 'STOP: -v prev_when is missing (0095''s journal when). This file refuses to guess.';
  END $missing$;
\endif

BEGIN READ ONLY;

\echo ''
\echo '=== 0096 CARE-02a v2 PRE-CHECK - every verdict must read OK (20 expected) ==='

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
), j AS (
  SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations)                           AS journal_rows,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = 'fbf8cad1dc959a600b0e8b3ccffb7225e2295919e5dfe08432301faf6b5e9c45')  AS has_0096,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE hash = '7a769298c43f982cdc27dc71cbec403a53861dbfc2c24b72c62c2203d370c454')  AS has_0093,
    (SELECT hash || ' ' || created_at::text FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC, id DESC LIMIT 1)                                        AS newest_row,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations
      WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations))    AS newest_ties,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'patients' AND polname = 'patients_select')             AS old_patients,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'clinical_records' AND polname = 'clinical_records_select') AS old_records,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'patient_care_team' AND polname = 'patient_care_team_select') AS old_team_select,
    (SELECT cmd || '/' || permissive::text || '/' || to_roles || ' ' || qual_md5 || ' ' || check_md5
       FROM pol WHERE relname = 'patient_care_team' AND polname = 'patient_care_team_insert') AS old_team_insert,
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
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'viewer_care_team_patient_ids_at_my_clinics') AS new_name_taken,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('patients', 'clinical_records', 'patient_care_team')
        AND c.relrowsecurity)                                                           AS rls_on,
    (SELECT count(DISTINCT n.nspname || '.' || p.proname)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname IN ('jwt_tenant_id', 'jwt_role'))
         OR (n.nspname = 'auth' AND p.proname = 'uid'))                                 AS helpers,
    (SELECT count(*)::int FROM pg_policy)                                              AS policies,
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
                                                ('patient_care_team', 'patient_care_team_insert')))) AS other_md5,
    (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef::text || ':'
                           || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) || ':'
                           || coalesce(array_to_string(p.proconfig, ','), ''),
                           ';' ORDER BY p.oid::regprocedure::text))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                                       AS functions_md5,
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
                         WHERE n.nspname = 'public'), '')))                             AS grants_md5
)
SELECT '0. this transaction is READ ONLY (the server refuses writes)' AS check,
       current_setting('transaction_read_only')                      AS observed,
       'on'                                                          AS expected,
       CASE WHEN current_setting('transaction_read_only') = 'on' THEN 'OK' ELSE 'FAIL' END AS verdict FROM j
UNION ALL SELECT '1. patients_select is FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0074''s expression',
       coalesce(old_patients, 'absent'),
       'r/true/authenticated 30d5b2b6dd3e7154ec2b8475961bf296 -',
       CASE WHEN old_patients = 'r/true/authenticated 30d5b2b6dd3e7154ec2b8475961bf296 -' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '2. clinical_records_select is FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0045''s expression',
       coalesce(old_records, 'absent'),
       'r/true/authenticated 8e124591c1b4e454358c38f1e5b18846 -',
       CASE WHEN old_records = 'r/true/authenticated 8e124591c1b4e454358c38f1e5b18846 -' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '3. patient_care_team_select is FOR SELECT, PERMISSIVE, TO authenticated, USING exactly 0091''s owner-or-reception expression',
       coalesce(old_team_select, 'absent'),
       'r/true/authenticated 64384f7e1ce17e8da4fd1c0ecad3eb5b -',
       CASE WHEN old_team_select = 'r/true/authenticated 64384f7e1ce17e8da4fd1c0ecad3eb5b -' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '4. patient_care_team_insert is FOR INSERT, PERMISSIVE, TO authenticated, WITH CHECK exactly 0091''s owner-or-reception expression',
       coalesce(old_team_insert, 'absent'),
       'a/true/authenticated - 64384f7e1ce17e8da4fd1c0ecad3eb5b',
       CASE WHEN old_team_insert = 'a/true/authenticated - 64384f7e1ce17e8da4fd1c0ecad3eb5b' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '5. the eleven other policies on the three tables read as main''s migrations leave them (one md5)',
       eleven_n::text || ' policies, ' || coalesce(eleven_md5, 'absent'),
       '11 policies, 85981c6894a92530edca6f8eeb634c69',
       CASE WHEN eleven_n = 11 AND eleven_md5 = '85981c6894a92530edca6f8eeb634c69' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '6. the three tables carry 5, 3 and 7 policies, none RESTRICTIVE',
       coalesce(per_table, 'none') || ', ' || restrictive_pols::text || ' restrictive',
       'clinical_records=5,patient_care_team=3,patients=7, 0 restrictive',
       CASE WHEN per_table = 'clinical_records=5,patient_care_team=3,patients=7' AND restrictive_pols = 0
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '7. the five helpers 0096 calls, reproduces or leaves alone are as 0045, 0073, 0074 and 0091 left them',
       coalesce(helper_shapes, 'absent'),
       'clinical_admin_sees_patient=DEFINER/s/search_path=public/postgres/exec 278de3a836486f3950e9513baf5429b3 ; clinical_therapist_sees_patient=DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; viewer_care_team_patient_ids=DEFINER/s/search_path=public/postgres/exec 88b26a83d4c94fe7e5acbf906c2d4b4e ; viewer_location_ids=DEFINER/s/search_path=public/postgres/exec 1238f35e2142dbb260a0c7acda4f48ef ; viewer_treated_patient_ids=DEFINER/s/search_path=public/postgres/exec c6bb997dced200956d7b5d1c49427dfa',
       CASE WHEN helper_shapes = 'clinical_admin_sees_patient=DEFINER/s/search_path=public/postgres/exec 278de3a836486f3950e9513baf5429b3 ; clinical_therapist_sees_patient=DEFINER/s/search_path=public/postgres/exec 9d9e8a5a8ee79ce1c1fe04830d7c9186 ; viewer_care_team_patient_ids=DEFINER/s/search_path=public/postgres/exec 88b26a83d4c94fe7e5acbf906c2d4b4e ; viewer_location_ids=DEFINER/s/search_path=public/postgres/exec 1238f35e2142dbb260a0c7acda4f48ef ; viewer_treated_patient_ids=DEFINER/s/search_path=public/postgres/exec c6bb997dced200956d7b5d1c49427dfa'
            THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '8. row level security is ENABLED on patients, clinical_records and patient_care_team', rls_on::text, '3',
       CASE WHEN rls_on = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '9. 0096 is absent from the journal, by hash', has_0096::text, '0',
       CASE WHEN has_0096 = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '10. 0093 is present in the journal, by hash', has_0093::text, '1',
       CASE WHEN has_0093 = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '11. the newest applied journal row is 0095''s, by hash and when, and no other row shares its when',
       coalesce(newest_row, 'absent') || ', ' || newest_ties::text || ' at that when',
       lower(:'prev_hash') || ' ' || :'prev_when' || ', 1 at that when',
       CASE WHEN newest_row = lower(:'prev_hash') || ' ' || :'prev_when' AND newest_ties = 1 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'journal_rows_before', journal_rows::text, '93',
       CASE WHEN journal_rows = 93 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'policies_before', policies::text, '> 0',
       CASE WHEN policies > 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'other_policies_md5', coalesce(other_md5, 'absent'), '32 hex characters',
       CASE WHEN other_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'functions_md5', coalesce(functions_md5, 'absent'), '32 hex characters',
       CASE WHEN functions_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT 'grants_md5', coalesce(grants_md5, 'absent'), '32 hex characters',
       CASE WHEN grants_md5 ~ '^[0-9a-f]{32}$' THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '12. the three helpers the policies call exist (jwt_tenant_id, jwt_role, auth.uid)', helpers::text, '3',
       CASE WHEN helpers = 3 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '13. the new helper''s name is free: no function in public is called viewer_care_team_patient_ids_at_my_clinics',
       new_name_taken::text || ' found', '0 found',
       CASE WHEN new_name_taken = 0 THEN 'OK' ELSE 'FAIL' END FROM j
UNION ALL SELECT '14. the thirteen policies on attachments, clinical_episodes, appointment_notes, patient_note_revisions and guest_clinical_intakes read as main leaves them (one md5)',
       coalesce(five_per_table, 'none') || ', ' || coalesce(five_md5, 'absent'),
       'appointment_notes=4,attachments=2,clinical_episodes=2,guest_clinical_intakes=2,patient_note_revisions=3, 50438a565df1b37cbadbb32b896876eb',
       CASE WHEN five_per_table = 'appointment_notes=4,attachments=2,clinical_episodes=2,guest_clinical_intakes=2,patient_note_revisions=3'
             AND five_md5 = '50438a565df1b37cbadbb32b896876eb' THEN 'OK' ELSE 'FAIL' END FROM j;

ROLLBACK;

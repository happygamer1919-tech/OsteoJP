-- ===================================================================
-- 0082 POST-CHECK. Every verdict must read OK.
-- ===================================================================
-- Run AFTER `pnpm db:migrate`, IN THE SAME RUN AS THE PRE-CHECK (SR-59).
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v journal_before=79 -v grant_cols_before=7 \
--        -f scripts/0082-postcheck.sql
--
-- IT WRITES NOTHING. Unlike 0081's, this post-check has no probe arm: the
-- claim here is about the CATALOGUE (who holds which privilege), and
-- has_column_privilege answers it directly. 0081 needed a probe because a
-- CHECK constraint can exist in the catalogue and not fire; a privilege
-- cannot be held and not held.
\pset pager off
\pset format aligned
\pset title '0082 POST-CHECK - every verdict must read OK'

SELECT 'journal = before + 1'                    AS check,
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS observed,
       (:'journal_before'::int + 1)::text        AS expected,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'journal_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END            AS verdict

UNION ALL
SELECT '0082 present by sha256 of the approved file',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT '0081 STILL present by file hash',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE END STATE. EIGHT COLUMNS, NAMED, NOT COUNTED.
-- ==================================================================
-- A count of eight is satisfied by the wrong eight. The set is what this file
-- claims and the set is what is asserted.
SELECT 'patient-role UPDATE columns are EXACTLY the eight',
       (SELECT string_agg(column_name, ',' ORDER BY column_name)
          FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='patients'
           AND grantee='patient' AND privilege_type='UPDATE'),
       'address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at',
       CASE WHEN (SELECT string_agg(column_name, ',' ORDER BY column_name)
                    FROM information_schema.column_privileges
                   WHERE table_schema='public' AND table_name='patients'
                     AND grantee='patient' AND privilege_type='UPDATE')
                 = 'address,city,locale,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'count moved by exactly one (before + 1)',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='patients'
           AND grantee='patient' AND privilege_type='UPDATE'),
       (:'grant_cols_before'::int + 1)::text,
       CASE WHEN (SELECT count(*) FROM information_schema.column_privileges
                   WHERE table_schema='public' AND table_name='patients'
                     AND grantee='patient' AND privilege_type='UPDATE') = :'grant_cols_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- READ THE PRIVILEGE, NOT THE ACL (SR-52 / SR-56).
-- ==================================================================
-- information_schema.column_privileges above lists the grants; these ask the
-- database whether the privilege is HELD, which is the question that matters
-- and the one an aclitem grep gets wrong.
SELECT 'patient CAN update locale (has_column_privilege)',
       has_column_privilege('patient', 'public.patients', 'locale', 'UPDATE')::text,
       'true',
       CASE WHEN has_column_privilege('patient', 'public.patients', 'locale', 'UPDATE')
            THEN 'OK' ELSE 'FAIL - the portal Idioma control will 42501' END

UNION ALL
-- THE SEVEN THAT MUST HAVE SURVIVED THE REVOKE. This is the assertion the
-- whole revoke-and-restate shape exists to be checked by: a table-level
-- REVOKE takes the column grants with it, so a file that revoked and granted
-- only `locale` would leave all seven of these FALSE and the portal's profile
-- PATCH failing with 42501 - which is the exact defect 0020 was written for.
SELECT 'the 0019 + 0020 seven ALL survived the revoke',
       (SELECT count(*)::text FROM unnest(ARRAY['phone','address','postal_code','city',
                                                'reminder_sms_enabled','reminder_email_enabled',
                                                'updated_at']) c
         WHERE has_column_privilege('patient','public.patients', c, 'UPDATE')),
       '7',
       CASE WHEN (SELECT count(*) FROM unnest(ARRAY['phone','address','postal_code','city',
                                                    'reminder_sms_enabled','reminder_email_enabled',
                                                    'updated_at']) c
                   WHERE has_column_privilege('patient','public.patients', c, 'UPDATE')) = 7
            THEN 'OK' ELSE 'FAIL - the re-grant narrowed the list; the portal profile PATCH is broken' END

UNION ALL
-- AND THE IDENTITY FIELDS THE PATIENT MUST STILL NOT WRITE. 0019's own comment
-- names them: full_name, email, nif, auth_user_id.
SELECT 'patient still CANNOT update the identity fields',
       (SELECT count(*)::text FROM unnest(ARRAY['full_name','email','nif','auth_user_id']) c
         WHERE has_column_privilege('patient','public.patients', c, 'UPDATE')),
       '0',
       CASE WHEN (SELECT count(*) FROM unnest(ARRAY['full_name','email','nif','auth_user_id']) c
                   WHERE has_column_privilege('patient','public.patients', c, 'UPDATE')) = 0
            THEN 'OK' ELSE 'FAIL - the re-grant WIDENED the list' END

UNION ALL
SELECT 'patient still does NOT hold TABLE-level UPDATE',
       has_table_privilege('patient', 'public.patients', 'UPDATE')::text,
       'false',
       CASE WHEN has_table_privilege('patient', 'public.patients', 'UPDATE')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
-- THE REVOKE WAS `REVOKE UPDATE`, NOT `REVOKE ALL`, and this is what says so.
SELECT 'patient KEPT SELECT (0010) - REVOKE UPDATE, never REVOKE ALL',
       has_table_privilege('patient', 'public.patients', 'SELECT')::text,
       'true',
       CASE WHEN has_table_privilege('patient', 'public.patients', 'SELECT')
            THEN 'OK' ELSE 'FAIL - the portal can no longer READ a patient own row' END

UNION ALL
SELECT 'authenticated (staff) UNCHANGED - table-level UPDATE',
       has_table_privilege('authenticated', 'public.patients', 'UPDATE')::text,
       'true',
       CASE WHEN has_table_privilege('authenticated', 'public.patients', 'UPDATE')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'anon STILL holds nothing on patients',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema='public' AND table_name='patients' AND grantee='anon'),
       '0',
       CASE WHEN (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='patients' AND grantee='anon') = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE ROW GATE IS UNTOUCHED. A column grant without it would let a patient
-- write `locale` on ANY row.
SELECT 'patients_patient_update_selfscope still pins the row to the JWT',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='patients'
                            AND policyname='patients_patient_update_selfscope'
                            AND qual LIKE '%jwt_patient_id%'
                            AND with_check LIKE '%jwt_patient_id%')
            THEN 'both clauses pin it' ELSE 'MISSING OR CHANGED' END,
       'both clauses pin it',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='patients'
                            AND policyname='patients_patient_update_selfscope'
                            AND qual LIKE '%jwt_patient_id%'
                            AND with_check LIKE '%jwt_patient_id%')
            THEN 'OK' ELSE 'FAIL' END;

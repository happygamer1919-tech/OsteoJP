-- ===================================================================
-- 0082 PRE-CHECK. READ ONLY. Every verdict must read OK before the apply.
-- ===================================================================
-- Run FIRST, in the same session-pooler connection the apply will use:
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/0082-precheck.sql
--
-- SR-59: WRITE DOWN THE THREE CARRY VALUES THIS PRINTS, FROM THIS RUN, AND
-- PASS THEM TO THE POST-CHECK IN THE SAME SESSION. A carry pasted from an
-- earlier run produced a false FAIL on 0081 and could equally produce a false
-- OK. If you are re-running the pre-check, the carries from the FIRST run are
-- now stale and must be discarded.
--
-- SR-58: the apply stage that follows this one RE-CHECKOUTS ITS OWN REF and
-- asserts packages/db/migrations/0082_patient_locale_grant.sql is on disk
-- before invoking drizzle. `db:migrate` against a tree with no 0082 reports
-- SUCCESS, because there is nothing to apply.
-- ===================================================================
\pset pager off
\pset format aligned
\pset title '0082 PRE-CHECK - every verdict must read OK'

SELECT 'journal rows now (CARRY -> journal_before)'  AS check,
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS observed,
       '79 expected: 0081 applied, 0082 not'         AS expected,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = 79
            THEN 'OK' ELSE 'FAIL - 0081 is not applied, or 0082 already is' END AS verdict

UNION ALL
-- 0081 MUST BE THERE, BY HASH. This file grants a privilege on a column 0081
-- creates. Applying it first raises 42703 (undefined_column) and the whole
-- migration rolls back - loudly, which is correct - but it is better refused
-- here than discovered mid-apply.
SELECT '0081 present by sha256 of the approved file',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '127ef0dca77b3a705a21919d01e69273a09edb7e9f9ad81e43a7887cc14ed481')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'patients.locale exists (0081 landed)',
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='patients' AND column_name='locale'), 'ABSENT'),
       'text',
       CASE WHEN (SELECT data_type FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='locale') = 'text'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE END STATE THIS FILE REPLACES, OBSERVED RATHER THAN ASSUMED.
-- ==================================================================
-- 0082 REVOKES EVERYTHING AND RE-GRANTS A LIST OF EIGHT. If production's
-- current list is NOT the seven this file believes it is, the re-grant would
-- SILENTLY NARROW what the patient role can write - and the failure would
-- arrive later, as a 42501 on somebody's profile save, with nothing pointing
-- back here. So the apply is refused unless the starting state is the one the
-- file was written against.
SELECT 'patient-role UPDATE columns now (CARRY -> grant_cols_before)',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='patients'
           AND grantee='patient' AND privilege_type='UPDATE'),
       '7',
       CASE WHEN (SELECT count(*) FROM information_schema.column_privileges
                   WHERE table_schema='public' AND table_name='patients'
                     AND grantee='patient' AND privilege_type='UPDATE') = 7
            THEN 'OK' ELSE 'FAIL - the starting list is not 0019+0020; DO NOT APPLY' END

UNION ALL
-- THE SET, NOT THE COUNT. Seven of the wrong seven is still seven.
SELECT 'and they are EXACTLY the 0019 + 0020 seven',
       (SELECT string_agg(column_name, ',' ORDER BY column_name)
          FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='patients'
           AND grantee='patient' AND privilege_type='UPDATE'),
       'address,city,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at',
       CASE WHEN (SELECT string_agg(column_name, ',' ORDER BY column_name)
                    FROM information_schema.column_privileges
                   WHERE table_schema='public' AND table_name='patients'
                     AND grantee='patient' AND privilege_type='UPDATE')
                 = 'address,city,phone,postal_code,reminder_email_enabled,reminder_sms_enabled,updated_at'
            THEN 'OK' ELSE 'FAIL - the starting SET differs; DO NOT APPLY' END

UNION ALL
-- THE PATIENT ROLE MUST NOT ALREADY HOLD TABLE-LEVEL UPDATE. If it did, the
-- column list would be decoration: a table grant covers every column, and this
-- file's REVOKE would then be a real narrowing rather than a restatement.
SELECT 'patient does NOT hold TABLE-level UPDATE',
       has_table_privilege('patient', 'public.patients', 'UPDATE')::text,
       'false',
       CASE WHEN has_table_privilege('patient', 'public.patients', 'UPDATE')
            THEN 'FAIL - a table grant makes the column list meaningless' ELSE 'OK' END

UNION ALL
SELECT 'patient keeps SELECT (0010) - this file must not touch it',
       has_table_privilege('patient', 'public.patients', 'SELECT')::text,
       'true',
       CASE WHEN has_table_privilege('patient', 'public.patients', 'SELECT')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'authenticated holds TABLE-level UPDATE (staff, unaffected)',
       has_table_privilege('authenticated', 'public.patients', 'UPDATE')::text,
       'true',
       CASE WHEN has_table_privilege('authenticated', 'public.patients', 'UPDATE')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'anon holds NOTHING on patients (0021)',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema='public' AND table_name='patients' AND grantee='anon'),
       '0',
       CASE WHEN (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='patients' AND grantee='anon') = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE ROW GATE. GRANT is the column gate; this policy is what keeps a patient
-- writing their OWN row and no other. 0082 must not disturb it.
SELECT 'patients_patient_update_selfscope exists (CARRY -> the row gate)',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname='public' AND tablename='patients'
           AND policyname='patients_patient_update_selfscope'),
       '1',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname='public' AND tablename='patients'
                     AND policyname='patients_patient_update_selfscope') = 1
            THEN 'OK' ELSE 'FAIL' END;

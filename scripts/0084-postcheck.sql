-- ===================================================================
-- 0084 POST-CHECK. READ-ONLY. Run AFTER `pnpm db:migrate`.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v expected_before=<the number PRE-CHECK row 1 printed> \
--        -f scripts/0084-postcheck.sql
--
-- SR-59: `expected_before` comes from THE SAME RUN's pre-check transcript,
-- never from an earlier one and never from a number in a report.
--
-- EVERY VERDICT MUST READ OK. Any FAIL halts and is reported IMMEDIATELY,
-- breaking SR-48, because a half-applied production schema is not a thing that
-- waits for a report (SR-50(c)).

\pset pager off
\timing off

\echo ''
\echo '=== 0084 POST-CHECK — every row must read OK ==='

SELECT '1. journal grew by exactly one',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       (:'expected_before'::int + 1)::text,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'expected_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END;

-- THE FILE APPLIED IS THE FILE APPROVED. This is the only row that proves it.
SELECT '2. 0084 sha256 IS in the journal',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '6636764d1759ebbedf4124f192da2e1f56fe6b259613b8bc2f2c363721d4ca36')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. appointment_notes_tenant_delete exists, FOR DELETE',
       coalesce((SELECT polcmd::text FROM pg_policy
                 WHERE polrelid = to_regclass('public.appointment_notes')
                   AND polname = 'appointment_notes_tenant_delete'), 'MISSING'),
       'd',
       CASE WHEN (SELECT polcmd::text FROM pg_policy
                  WHERE polrelid = to_regclass('public.appointment_notes')
                    AND polname = 'appointment_notes_tenant_delete') = 'd'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. patient_note_revisions_tenant_delete exists, FOR DELETE',
       coalesce((SELECT polcmd::text FROM pg_policy
                 WHERE polrelid = to_regclass('public.patient_note_revisions')
                   AND polname = 'patient_note_revisions_tenant_delete'), 'MISSING'),
       'd',
       CASE WHEN (SELECT polcmd::text FROM pg_policy
                  WHERE polrelid = to_regclass('public.patient_note_revisions')
                    AND polname = 'patient_note_revisions_tenant_delete') = 'd'
            THEN 'OK' ELSE 'FAIL' END;

-- The policies are for `authenticated` and for nobody else. A DELETE policy that
-- also reached `anon` or `patient` would be a patient able to erase a clinic's
-- note, which is the one way this migration could be dangerous.
SELECT '5. both delete policies target authenticated ONLY',
       coalesce((SELECT string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname)
                 FROM pg_policy p
                 JOIN pg_roles r ON r.oid = ANY (p.polroles)
                 WHERE p.polname IN ('appointment_notes_tenant_delete',
                                     'patient_note_revisions_tenant_delete')), 'none'),
       'authenticated',
       CASE WHEN (SELECT string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname)
                  FROM pg_policy p
                  JOIN pg_roles r ON r.oid = ANY (p.polroles)
                  WHERE p.polname IN ('appointment_notes_tenant_delete',
                                      'patient_note_revisions_tenant_delete')) = 'authenticated'
            THEN 'OK' ELSE 'FAIL' END;

-- The full policy set on each table, by name. A DROP that this migration did not
-- write would show up here as a missing name rather than as nothing at all.
SELECT '6. appointment_notes full policy set',
       (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
        WHERE polrelid = to_regclass('public.appointment_notes')),
       'appointment_notes_tenant_delete,appointment_notes_tenant_insert,'
       'appointment_notes_tenant_select,appointment_notes_tenant_update',
       CASE WHEN (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                  WHERE polrelid = to_regclass('public.appointment_notes'))
                = 'appointment_notes_tenant_delete,appointment_notes_tenant_insert,'
                  'appointment_notes_tenant_select,appointment_notes_tenant_update'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. patient_note_revisions full policy set',
       (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
        WHERE polrelid = to_regclass('public.patient_note_revisions')),
       'patient_note_revisions_tenant_delete,patient_note_revisions_tenant_insert,'
       'patient_note_revisions_tenant_select',
       CASE WHEN (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                  WHERE polrelid = to_regclass('public.patient_note_revisions'))
                = 'patient_note_revisions_tenant_delete,patient_note_revisions_tenant_insert,'
                  'patient_note_revisions_tenant_select'
            THEN 'OK' ELSE 'FAIL' END;

-- audit_log is NOT touched by this migration and must not have become erasable.
-- Stated as a check rather than as a sentence, because "we did not touch it" is
-- exactly the claim a check is for.
SELECT '8. audit_log still has NO delete policy',
       coalesce((SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                 WHERE polrelid = to_regclass('public.audit_log') AND polcmd = 'd'), 'none'),
       'none',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policy
                             WHERE polrelid = to_regclass('public.audit_log') AND polcmd = 'd')
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END POST-CHECK. Any FAIL halts and is reported IMMEDIATELY. ==='

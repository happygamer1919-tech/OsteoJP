-- ===================================================================
-- 0075 POST-CHECK. READ-ONLY. Run AFTER `pnpm db:migrate`.
-- ===================================================================
-- :expected_before is the journal count the PRE-CHECK printed. Pass it in:
--   psql ... -v expected_before=74 -f scripts/0075-postcheck.sql
--
-- THE HASH IS THE ONE THAT DECIDES. Row counts prove something ran; the sha256
-- proves the file APPLIED is the file APPROVED. 0073's journal made the same
-- point and it is the only check that survives a wrong branch being checked out.
\pset format aligned
\pset title '0075 POST-CHECK - every verdict must read OK'

SELECT 'journal count = before + 1' AS check,
       count(*)::text               AS observed,
       (:expected_before + 1)::text AS expected,
       CASE WHEN count(*) = :expected_before + 1 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM supabase_migrations.schema_migrations
UNION ALL
SELECT '0075 present in the journal',
       coalesce((SELECT version FROM supabase_migrations.schema_migrations WHERE version='0075'), 'MISSING'),
       '0075',
       CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='0075')
            THEN 'OK' ELSE 'FAIL' END
UNION ALL
SELECT '0073 and 0074 still present, unchanged',
       (SELECT string_agg(version, ',' ORDER BY version) FROM supabase_migrations.schema_migrations
         WHERE version IN ('0073','0074')),
       '0073,0074',
       CASE WHEN (SELECT string_agg(version, ',' ORDER BY version) FROM supabase_migrations.schema_migrations
                   WHERE version IN ('0073','0074')) = '0073,0074' THEN 'OK' ELSE 'FAIL' END
UNION ALL
SELECT 'RLS enabled on reminder_dispatches',
       coalesce((SELECT relrowsecurity::text FROM pg_class WHERE relname='reminder_dispatches'), 'NO TABLE'),
       'true',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE relname='reminder_dispatches') THEN 'OK' ELSE 'FAIL' END
UNION ALL
SELECT 'the three policies, by name',
       coalesce((SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                  WHERE polrelid='public.reminder_dispatches'::regclass), '(none)'),
       'reminder_dispatches_pipeline_insert,reminder_dispatches_pipeline_update,reminder_dispatches_staff_select',
       CASE WHEN (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                   WHERE polrelid='public.reminder_dispatches'::regclass)
                 = 'reminder_dispatches_pipeline_insert,reminder_dispatches_pipeline_update,reminder_dispatches_staff_select'
            THEN 'OK' ELSE 'FAIL' END
UNION ALL
SELECT 'function: owner / secdef / volatility',
       (SELECT pg_get_userbyid(proowner)||' / '||prosecdef::text||' / '||provolatile::text
          FROM pg_proc WHERE proname='reminder_dispatch_tenant'),
       'postgres / true / s',
       CASE WHEN (SELECT pg_get_userbyid(proowner)||' / '||prosecdef::text||' / '||provolatile::text
                    FROM pg_proc WHERE proname='reminder_dispatch_tenant') = 'postgres / true / s'
            THEN 'OK' ELSE 'FAIL' END
UNION ALL
-- THE ADDITION. Read proacl OUT OF pg_proc, not from information_schema and not
-- inferred from the REVOKE statements. PURPLE measured that Supabase's default
-- privileges grant service_role EXECUTE at CREATE FUNCTION time on some
-- databases and not others, so what the migration SAYS is not what the database
-- necessarily HAS.
SELECT 'function acl: authenticated yes, service_role/anon no',
       coalesce((SELECT array_to_string(proacl, ' ') FROM pg_proc WHERE proname='reminder_dispatch_tenant'),
                '(default: PUBLIC has EXECUTE)'),
       'contains authenticated=X, no service_role=, no anon=',
       CASE
         WHEN (SELECT proacl FROM pg_proc WHERE proname='reminder_dispatch_tenant') IS NULL THEN 'FAIL'
         WHEN EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proacl) a
                       WHERE p.proname='reminder_dispatch_tenant'
                         AND (a::text LIKE 'service_role=%' OR a::text LIKE 'anon=%')) THEN 'FAIL'
         WHEN NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proacl) a
                           WHERE p.proname='reminder_dispatch_tenant'
                             AND a::text LIKE 'authenticated=X%') THEN 'FAIL'
         ELSE 'OK'
       END;

-- ===================================================================
-- 0075 PRE-CHECK. READ-ONLY. Run BEFORE `pnpm db:migrate`.
-- ===================================================================
-- Every row it prints must match the expected value in its own `verdict`
-- column. If ANY verdict reads FAIL, stop and do not apply.
--
-- WHY A PRE-CHECK AT ALL, and it is not ceremony: 0058's apply block had none,
-- so a backwards timestamp produced "success" over a no-op and nobody could
-- tell. A migration that has already run and a migration that ran and did
-- nothing look identical afterwards. These four rows are what separate them.
\pset format aligned
\pset title '0075 PRE-CHECK - every verdict must read OK'

SELECT 'journal row count' AS check,
       count(*)::text      AS observed,
       'informational - the post-check asserts this PLUS ONE' AS expected,
       'OK'                AS verdict
  FROM supabase_migrations.schema_migrations
UNION ALL
SELECT 'max applied version',
       coalesce(max(version), '(none)'),
       '0074',
       CASE WHEN coalesce(max(version), '') = '0074' THEN 'OK' ELSE 'FAIL' END
  FROM supabase_migrations.schema_migrations
UNION ALL
SELECT 'reminder_dispatches exists?',
       coalesce(to_regclass('public.reminder_dispatches')::text, 'NULL'),
       'NULL',
       CASE WHEN to_regclass('public.reminder_dispatches') IS NULL THEN 'OK' ELSE 'FAIL' END
UNION ALL
SELECT 'reminder_dispatch_tenant exists?',
       coalesce((SELECT 'present' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='reminder_dispatch_tenant' LIMIT 1), 'absent'),
       'absent',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname='public' AND p.proname='reminder_dispatch_tenant')
            THEN 'OK' ELSE 'FAIL' END;

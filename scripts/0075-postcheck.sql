-- ===================================================================
-- 0075 POST-CHECK. READ-ONLY. Run AFTER `pnpm db:migrate`.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -v expected_before=74 \
--        -f scripts/0075-postcheck.sql
--
-- `expected_before` is the journal row count the PRE-CHECK printed (74).
--
-- ===================================================================
-- THE JOURNAL IS `drizzle.__drizzle_migrations`, NOT
-- `supabase_migrations.schema_migrations`. See the head of
-- scripts/0075-precheck.sql for why the first draft of both scripts named the
-- wrong table and what it cost.
-- ===================================================================
--
-- THE HASH IS THE ROW THAT DECIDES. A row count proves something ran; the
-- sha256 proves the file APPLIED is the file APPROVED. It is the only check
-- that survives a wrong branch being checked out in the apply worktree, which
-- has happened here twice (0049, 0058).
--
-- 0073 AND 0074 ARE RE-ASSERTED UNCHANGED. A migration that rewrote history
-- beneath itself would otherwise pass every forward-looking check.

\pset format aligned
\pset title '0075 POST-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION
      'POST-CHECK REFUSED: drizzle.__drizzle_migrations does not exist on this database.'
      USING HINT =
        'This is the journal `drizzle-kit migrate` writes. A database that lacks it has never '
        'been migrated by drizzle-kit. Check the connection target.';
  END IF;
END
$$;

SELECT 'journal count = before + 1'  AS check,
       count(*)::text                AS observed,
       (:expected_before + 1)::text  AS expected,
       CASE WHEN count(*) = :expected_before + 1 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'highest applied id',
       coalesce(max(id)::text, '(none)'),
       '75',
       CASE WHEN max(id) = 75 THEN 'OK' ELSE 'FAIL' END
  FROM drizzle.__drizzle_migrations

UNION ALL
-- THE ONE THAT DECIDES.
SELECT 'id 75 hash = sha256(0075 file)',
       coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 75), '(no id 75)'),
       'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 75)
               = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'id 74 hash unchanged (0074)',
       coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74), '(no id 74)'),
       'd6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74)
               = 'd6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'id 73 hash unchanged (0073)',
       coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 73), '(no id 73)'),
       '50a05c84108ea7cd4d0aa939b09332fcd59a748b83790bfc683c746906d842e4',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 73)
               = '50a05c84108ea7cd4d0aa939b09332fcd59a748b83790bfc683c746906d842e4'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'RLS enabled on reminder_dispatches',
       coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.reminder_dispatches')), 'NO TABLE'),
       'true',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.reminder_dispatches'))
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'the three policies, by name',
       coalesce((SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                  WHERE polrelid = to_regclass('public.reminder_dispatches')), '(none)'),
       'reminder_dispatches_pipeline_insert,reminder_dispatches_pipeline_update,reminder_dispatches_staff_select',
       CASE WHEN (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                   WHERE polrelid = to_regclass('public.reminder_dispatches'))
                 = 'reminder_dispatches_pipeline_insert,reminder_dispatches_pipeline_update,reminder_dispatches_staff_select'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'function: owner / secdef / volatility',
       coalesce((SELECT pg_get_userbyid(proowner)||' / '||prosecdef::text||' / '||provolatile::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'), '(absent)'),
       'postgres / true / s',
       CASE WHEN (SELECT pg_get_userbyid(proowner)||' / '||prosecdef::text||' / '||provolatile::text
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant') = 'postgres / true / s'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- Read proacl OUT OF pg_proc, not from information_schema and not inferred from
-- the REVOKE statements. Supabase's ALTER DEFAULT PRIVILEGES grants
-- service_role EXECUTE at CREATE FUNCTION time on some databases and not
-- others, so what the migration SAYS is not necessarily what the database HAS.
-- This is the one function in the set that revokes service_role by name.
SELECT 'function acl: authenticated yes; service_role/anon/patient no',
       coalesce((SELECT array_to_string(proacl, ' ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'),
                '(default: PUBLIC has EXECUTE)'),
       'contains authenticated=X; no service_role=, anon=, patient=',
       CASE
         WHEN (SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant') IS NULL THEN 'FAIL'
         WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                           unnest(p.proacl) a
                       WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'
                         AND (a::text LIKE 'service_role=%' OR a::text LIKE 'anon=%' OR a::text LIKE 'patient=%'))
              THEN 'FAIL'
         WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                               unnest(p.proacl) a
                           WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'
                             AND a::text LIKE 'authenticated=X%')
              THEN 'FAIL'
         ELSE 'OK'
       END;

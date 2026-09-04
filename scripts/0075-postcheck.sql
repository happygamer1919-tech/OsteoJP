-- ===================================================================
-- 0075 POST-CHECK. READ-ONLY. Run AFTER `pnpm db:migrate`.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v expected_before=74 -f scripts/0075-postcheck.sql
--
-- `expected_before` is the journal row count the PRE-CHECK printed (74).
--
-- THE PAGER IS OFF IN THIS FILE, not only on the command line, and the table is
-- under 80 columns. See the head of scripts/0075-precheck.sql: a 191-column
-- table went to `less`, which paints on the alternate screen, and the owner's
-- terminal kept no trace of it after he quit the pager. A check whose result
-- cannot be copied is a check nobody ran.
--
-- THE HASH IS THE ROW THAT DECIDES. A row count proves something ran; the
-- sha256 proves the file APPLIED is the file APPROVED. It is the only check
-- that survives a wrong branch in the apply worktree, which has happened twice
-- (0049, 0058). Hashes are compared in FULL; only the display is truncated.
--
-- 0073 AND 0074 ARE RE-ASSERTED UNCHANGED. A migration that rewrote history
-- beneath itself would otherwise pass every forward-looking check.

\pset pager off
\pset format aligned
\pset title '0075 POST-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION
      'POST-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT =
        'That is the journal drizzle-kit migrate writes. A database lacking it has '
        'never been migrated by drizzle-kit. Check the connection target.';
  END IF;
END
$$;

SELECT 'journal = before + 1'       AS check,
       count(*)::text               AS observed,
       (:expected_before + 1)::text AS expected,
       CASE WHEN count(*) = :expected_before + 1 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'highest applied id',
       coalesce(max(id)::text, 'none'),
       '75',
       CASE WHEN max(id) = 75 THEN 'OK' ELSE 'FAIL' END
  FROM drizzle.__drizzle_migrations

UNION ALL
-- THE ONE THAT DECIDES.
SELECT 'id 75 hash = 0075 file',
       left(coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 75), 'no id 75'), 12),
       'e268bc0ddbaa',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 75)
               = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'id 74 hash unchanged',
       left(coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74), 'no id 74'), 12),
       'd6b9fc00f430',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74)
               = 'd6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'id 73 hash unchanged',
       left(coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 73), 'no id 73'), 12),
       '50a05c84108e',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 73)
               = '50a05c84108ea7cd4d0aa939b09332fcd59a748b83790bfc683c746906d842e4'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'RLS on reminder_dispatches',
       coalesce((SELECT relrowsecurity::text FROM pg_class
                  WHERE oid = to_regclass('public.reminder_dispatches')), 'NO TABLE'),
       'true',
       CASE WHEN (SELECT relrowsecurity FROM pg_class
                   WHERE oid = to_regclass('public.reminder_dispatches'))
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'the 3 policies present',
       (SELECT count(*)::text FROM pg_policy
         WHERE polrelid = to_regclass('public.reminder_dispatches')),
       '3',
       CASE WHEN (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy
                   WHERE polrelid = to_regclass('public.reminder_dispatches'))
                 = 'reminder_dispatches_pipeline_insert,'
                   'reminder_dispatches_pipeline_update,'
                   'reminder_dispatches_staff_select'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'fn owner/secdef/volatile',
       coalesce((SELECT pg_get_userbyid(proowner)||'/'||prosecdef::text||'/'||provolatile::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'), 'absent'),
       -- The literal the CASE below compares against, character for character.
       -- It read 'postgres/t/s' while the comparison used 'postgres/true/s', so
       -- the row printed observed=postgres/true/s, expected=postgres/t/s, OK -
       -- a verdict contradicting its own two columns. Nothing was wrong with the
       -- check; the label was, and a reader who spots that stops trusting the
       -- whole table.
       'postgres/true/s',
       CASE WHEN (SELECT pg_get_userbyid(proowner)||'/'||prosecdef::text||'/'||provolatile::text
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant')
                 = 'postgres/true/s'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- Read proacl OUT OF pg_proc, not inferred from the REVOKE statements. Supabase's
-- ALTER DEFAULT PRIVILEGES grants service_role EXECUTE at CREATE FUNCTION time,
-- so what the migration SAYS is not necessarily what the database HAS. This is
-- the one function in the whole set that revokes service_role by name, and the
-- owner's production read proved all 20 existing ones do not.
SELECT 'fn acl: auth yes, others no',
       CASE
         WHEN (SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant') IS NULL
           THEN 'DEFAULT ACL'
         ELSE (SELECT count(*)::text || ' grantee(s)'
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                      unnest(p.proacl) a
                WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant')
       END,
       'no svc/anon/pat',
       CASE
         WHEN (SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant') IS NULL
              THEN 'FAIL'
         WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                           unnest(p.proacl) a
                       WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'
                         AND (a::text LIKE 'service_role=%' OR a::text LIKE 'anon=%'
                              OR a::text LIKE 'patient=%'))
              THEN 'FAIL'
         WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                               unnest(p.proacl) a
                           WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant'
                             AND a::text LIKE 'authenticated=X%')
              THEN 'FAIL'
         ELSE 'OK'
       END;

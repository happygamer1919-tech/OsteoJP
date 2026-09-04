-- ===================================================================
-- 0075 PRE-CHECK. READ-ONLY. Run BEFORE `pnpm db:migrate`.
-- ===================================================================
-- Every row it prints must read OK in its own `verdict` column. If ANY verdict
-- reads FAIL, stop and do not apply.
--
-- ===================================================================
-- THE JOURNAL IS `drizzle.__drizzle_migrations`. IT IS NOT
-- `supabase_migrations.schema_migrations`, AND THE FIRST DRAFT OF THIS
-- SCRIPT SAID IT WAS.
-- ===================================================================
-- That draft aborted on the owner's first line with
--   ERROR: relation "supabase_migrations.schema_migrations" does not exist
-- and printed no verdicts at all. Nothing was applied.
--
-- WHY THE WRONG TABLE LOOKED RIGHT. This repository has TWO appliers writing
-- TWO different journals:
--   * `supabase db reset`, which every LOCAL LANE uses (scripts/lane-stack.mjs),
--     records `supabase_migrations.schema_migrations` with a `version` column
--     holding '0074', '0075'. On a lane that table is real and populated.
--   * `pnpm db:migrate` -> `drizzle-kit migrate`, which is what PRODUCTION uses
--     (package.json, packages/db/drizzle.config.ts), records
--     `drizzle.__drizzle_migrations` with `id`, `hash`, `created_at` and NO
--     version column at all.
-- The draft was written against the journal that was visible on a lane. The
-- lane is not the applier production uses, so the shape it showed was not the
-- shape production has. Same family as every other stand-in in this project:
-- the check ran green against something that was not the thing.
--
-- WHY IDENTITY IS BY HASH AND NOT BY NAME. There is no version string to match.
-- `hash` is the sha256 of the migration FILE (proven: id 73 =
-- 50a05c84... and id 74 = d6b9fc00... are the sha256 of
-- 0073_viewer_visible_patient_set.sql and 0074_confirm_writers_and_therapist_set.sql,
-- and production's own 0073 and 0074 receipts recorded exactly those values).
-- So "0075 has not been applied" is asked as "no journal row carries 0075's
-- sha256", which cannot be satisfied by a differently-named file with the same
-- number or a same-named file with different contents.
--
-- WHY A PRE-CHECK AT ALL, and it is not ceremony: 0058's apply block had none,
-- so a backwards timestamp produced "success" over a no-op and nobody could
-- tell. A migration that has already run and a migration that ran and did
-- nothing look identical afterwards. These seven rows are what separate them.
--
-- NO ROW HERE IS INFORMATIONAL. Every one can FAIL; a row whose verdict is
-- always OK proves a query ran, not that anything is true.

\pset format aligned
\pset title '0075 PRE-CHECK - every verdict must read OK'

-- The journal's own existence is the FIRST thing checked, and it is checked
-- with a named error rather than left to abort on a bare "relation does not
-- exist" - which is the exact way the first draft failed, telling the reader
-- nothing about what to look at.
DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION
      'PRE-CHECK REFUSED: drizzle.__drizzle_migrations does not exist on this database.'
      USING HINT =
        'This is the journal `drizzle-kit migrate` writes, and it is the one production uses. '
        'A database that lacks it has never been migrated by drizzle-kit - a local lane built by '
        '`supabase db reset` records supabase_migrations.schema_migrations instead. Check the '
        'connection target before anything else.';
  END IF;
END
$$;

SELECT 'journal row count'         AS check,
       count(*)::text              AS observed,
       '74'                        AS expected,
       CASE WHEN count(*) = 74 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'highest applied id',
       coalesce(max(id)::text, '(none)'),
       '74',
       CASE WHEN max(id) = 74 THEN 'OK' ELSE 'FAIL' END
  FROM drizzle.__drizzle_migrations

UNION ALL
-- The last thing applied must be the 0074 that was APPROVED, byte for byte.
SELECT 'id 74 hash = sha256(0074 file)',
       coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74), '(no id 74)'),
       'd6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74)
               = 'd6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- 0075 NOT YET APPLIED, asked by IDENTITY. A number or a filename could be
-- reused; a sha256 could not.
SELECT '0075 sha256 absent from the journal',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa'),
       '0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                              WHERE hash = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE 0058 TRAP, ASKED IN SQL. drizzle decides what is pending with
-- `lastDbMigration.created_at < migration.folderMillis`, where folderMillis is
-- the journal file's `when`. 0075's `when` is 1787301000000. If the database's
-- newest created_at is NOT strictly less than that, drizzle applies nothing and
-- still prints "migrations applied successfully!".
SELECT 'newest created_at < 0075 when (1787301000000)',
       coalesce(max(created_at)::text, '(none)'),
       '1787300900000  (0074''s when)',
       CASE WHEN max(created_at) < 1787301000000 THEN 'OK' ELSE 'FAIL' END
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'reminder_dispatches absent',
       coalesce(to_regclass('public.reminder_dispatches')::text, 'NULL'),
       'NULL',
       CASE WHEN to_regclass('public.reminder_dispatches') IS NULL THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'reminder_dispatch_tenant absent',
       coalesce((SELECT 'present' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant' LIMIT 1), 'absent'),
       'absent',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant')
            THEN 'OK' ELSE 'FAIL' END;

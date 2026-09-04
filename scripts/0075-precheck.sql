-- ===================================================================
-- 0075 PRE-CHECK. READ-ONLY. Run BEFORE `pnpm db:migrate`.
-- ===================================================================
-- Every row must read OK in its own `verdict` column. If ANY verdict reads
-- FAIL, stop and do not apply.
--
-- ===================================================================
-- THREE THINGS THIS FILE HAS ALREADY GOT WRONG. ALL THREE ARE FIXED HERE
-- AND ALL THREE ARE NAMED, BECAUSE THE NEXT AUTHOR WILL REACH FOR THE
-- SAME SHAPES.
-- ===================================================================
--
-- 1. THE WRONG JOURNAL. The first draft read
--    `supabase_migrations.schema_migrations` and aborted on the owner's first
--    line with "relation does not exist". This repo has TWO appliers writing
--    TWO journals: `supabase db reset`, which every LOCAL LANE uses
--    (scripts/lane-stack.mjs), records supabase_migrations.schema_migrations
--    with a `version` column; `pnpm db:migrate` -> drizzle-kit, which is what
--    PRODUCTION uses, records `drizzle.__drizzle_migrations` with id, hash and
--    created_at and NO version column at all. The draft was written against the
--    journal visible on a lane, and the lane is not the applier production uses.
--
-- 2. NO VERDICTS REACHED THE OWNER. The second draft was correct SQL and he saw
--    only the two \pset echoes and `DO`. The rows were 191 COLUMNS WIDE, psql's
--    `pager` defaults to on, and a table wider than the terminal goes to `less`,
--    which paints it on the ALTERNATE SCREEN. Quitting the pager restores the
--    previous screen and the table is gone from scrollback entirely. He copied
--    everything that was actually there. Hence the two lines below and the
--    12-character hash prefixes: this table is now under 80 columns and the
--    pager is off in the file itself, so it cannot depend on how the block was
--    invoked.
--
-- 3. IDENTITY BY NAME. There is no version string to match, so identity is by
--    HASH. `hash` is the sha256 of the migration FILE - measured, not assumed:
--    a probe database migrated by drizzle-kit itself reproduced production's
--    journal exactly, id 74 = d6b9fc00..., id 73 = 50a05c84..., each equal to
--    `shasum -a 256` of its own file. So "0075 is not applied" is asked as "no
--    journal row carries 0075's sha256", which no renamed or edited file can
--    satisfy.
--
-- NO ROW IS INFORMATIONAL. Every one can FAIL. A row whose verdict is hardcoded
-- OK proves a query ran, not that anything is true.

\pset pager off
\pset format aligned
\pset title '0075 PRE-CHECK - every verdict must read OK'

-- The journal's own existence is checked FIRST, with a named error, so a
-- database that has never been migrated by drizzle-kit says so instead of
-- aborting on a bare "relation does not exist" - which is exactly how defect 1
-- presented.
DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION
      'PRE-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT =
        'That is the journal drizzle-kit migrate writes, and the one production uses. '
        'A database lacking it has never been migrated by drizzle-kit: a local lane '
        'built by supabase db reset records supabase_migrations.schema_migrations '
        'instead. Check the connection target before anything else.';
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
       coalesce(max(id)::text, 'none'),
       '74',
       CASE WHEN max(id) = 74 THEN 'OK' ELSE 'FAIL' END
  FROM drizzle.__drizzle_migrations

UNION ALL
-- Compared in FULL; only the display is truncated.
SELECT 'id 74 hash = 0074 file',
       left(coalesce((SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74), 'no id 74'), 12),
       'd6b9fc00f430',
       CASE WHEN (SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 74)
               = 'd6b9fc00f430e5bcbf421f8741b146af0b946e0f62523fcb8ddaa1c8eadbdde3'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- 0075 NOT YET APPLIED, asked by IDENTITY. A number or a filename could be
-- reused; a sha256 could not.
SELECT '0075 sha256 in journal',
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
-- newest created_at is NOT strictly less, drizzle applies nothing and still
-- prints "migrations applied successfully!".
SELECT 'newest when < 0075 when',
       coalesce(max(created_at)::text, 'none'),
       '1787300900000',
       CASE WHEN max(created_at) < 1787301000000 THEN 'OK' ELSE 'FAIL' END
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'reminder_dispatches absent',
       coalesce(to_regclass('public.reminder_dispatches')::text, 'NULL'),
       'NULL',
       CASE WHEN to_regclass('public.reminder_dispatches') IS NULL THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'dispatch_tenant fn absent',
       coalesce((SELECT 'present' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant' LIMIT 1), 'absent'),
       'absent',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.proname = 'reminder_dispatch_tenant')
            THEN 'OK' ELSE 'FAIL' END;

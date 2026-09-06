-- ===================================================================
-- 0080 PRE-CHECK. READ-ONLY. Nothing writes. Every verdict must read OK.
-- ===================================================================
-- Run BEFORE `pnpm db:migrate`. Any FAIL halts: do not retry, adjust or work
-- around it (SR-50 b). It prints `journal_rows_before` — carry that number into
-- the post-check.
\pset pager off
\pset format aligned
\pset title '0080 PRE-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'PRE-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT = 'That is the journal drizzle-kit migrate writes. Check the connection target.';
  END IF;
END
$$;

SELECT 'journal_rows_before'                AS check,
       count(*)::text                       AS observed,
       'carry this into the post-check'     AS expected,
       'OK'                                 AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
-- 0080 MUST BE ABSENT. Identity is the FILE HASH, never `id`: `id` is a SERIAL
-- and stopped matching the tag at the 0076/0077 gap.
SELECT '0080 is NOT yet applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'present' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'd76f8d067327d88d9775cfb07e850eae14bf15363bff9f4d6b6976da131d7969')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
SELECT '0079 IS applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE ROW THAT WOULD HAVE CAUGHT INC-07, AND THE REASON THIS FILE
-- EXISTS AT ALL FOR AN OTHERWISE SIMPLE CREATE TABLE.
-- ==================================================================
-- drizzle applies a migration only when its journal `when` is STRICTLY GREATER
-- than the newest created_at already in the table (pg-core/dialect.js: `if
-- (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)`).
-- A migration numbered BELOW one already applied is SILENTLY SKIPPED and
-- `db:migrate` still prints success.
--
-- THIS IS WHY THIS FILE IS 0080 AND NOT THE 0077 THAT SR-46 RESERVED. 0078 and
-- 0079 shipped first, so a file named 0077 would sort before them, would have to
-- carry a LOWER `when` to satisfy check-journal's strictly-increasing rule, and
-- would therefore never run on a database that already has 0079.
SELECT 'newest applied created_at < 0080 when',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1787401200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1787401200000
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE TABLE MUST NOT EXIST. CREATE TABLE IF NOT EXISTS would otherwise no-op
-- and every later verdict would pass against somebody else's table.
SELECT 'appointment_reschedule_requests absent',
       CASE WHEN to_regclass('public.appointment_reschedule_requests') IS NULL
            THEN 'absent' ELSE 'PRESENT' END,
       'absent',
       CASE WHEN to_regclass('public.appointment_reschedule_requests') IS NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- The three objects the new table's FKs point at.
SELECT 'FK targets exist (tenants, appointments, patients, users)',
       (CASE WHEN to_regclass('public.tenants') IS NOT NULL
              AND to_regclass('public.appointments') IS NOT NULL
              AND to_regclass('public.patients') IS NOT NULL
              AND to_regclass('public.users') IS NOT NULL
             THEN 'all present' ELSE 'MISSING' END),
       'all present',
       CASE WHEN to_regclass('public.tenants') IS NOT NULL
             AND to_regclass('public.appointments') IS NOT NULL
             AND to_regclass('public.patients') IS NOT NULL
             AND to_regclass('public.users') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- The policy delegates to appointments_rls, so that policy must be the one 0078
-- left behind. If it is not, the new table's access rule is not what was tested.
SELECT '0078 appointments_rls still carries viewer_location_ids',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='appointments'
                            AND policyname='appointments_rls'
                            AND qual LIKE '%viewer_location_ids%')
            THEN 'present' ELSE 'MISSING' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='public' AND tablename='appointments'
                            AND policyname='appointments_rls'
                            AND qual LIKE '%viewer_location_ids%')
            THEN 'OK' ELSE 'FAIL' END;

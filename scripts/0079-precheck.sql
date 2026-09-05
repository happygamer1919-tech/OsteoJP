-- ===================================================================
-- 0079 PRE-CHECK. READ-ONLY. Run BEFORE `pnpm db:migrate`.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/0079-precheck.sql
--
-- Print the journal count it reports and pass it to the POST-CHECK as
-- `-v expected_before=<n>`. Strategy states production is at journal 76,
-- max id 76, with 0075 applied and only 0079 pending. This prints it anyway,
-- because a number carried between dispatches is a claim and a number read
-- out of the database is a fact.
--
-- EVERY VERDICT MUST READ OK. Any FAIL halts: do not retry, adjust or work
-- around it. Report and stop.
--
-- ===================================================================
-- A MIGRATION IS IDENTIFIED BY ITS HASH HERE, NEVER BY `id`, AND THE
-- DIFFERENCE IS NOT COSMETIC.
-- ===================================================================
-- `drizzle.__drizzle_migrations.id` is a SERIAL - the number of migrations
-- applied so far - not the migration's number. Up to 0075 the two happened to
-- coincide, which is why scripts/0075-postcheck.sql could write "highest
-- applied id = 75" and be right.
--
-- THEY HAVE DIVERGED PERMANENTLY. 0076 is reserved and unstarted and 0077 is
-- released but unwritten, so the tags jump 0075 -> 0078 while the counter does
-- not. On production there are 76 rows and max(id) = 76 with 0078 as the last
-- tag applied. A check that asserts "max id = 79" after this migration would
-- fail on a correct apply, and one that asserts "id 75 exists" to prove 0075
-- landed is asserting nothing at all - with 76 rows, id 75 exists whatever was
-- applied.
--
-- The FIRST DRAFT of this file made exactly that mistake, in both directions.
-- It was caught by rehearsing against a database seeded to production's real
-- position rather than by reasoning about it.
--
-- So identity is the sha256 of the migration file, which is what drizzle
-- stores in `hash`, and the counter is used only for arithmetic.
--
-- THE PAGER IS OFF IN THIS FILE, not only on the command line. See the head of
-- scripts/0075-precheck.sql: a check whose result cannot be copied out of the
-- terminal is a check nobody ran.

\pset pager off
\pset format aligned
\pset title '0079 PRE-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION
      'PRE-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT =
        'That is the journal drizzle-kit migrate writes. A database lacking it has '
        'never been migrated by drizzle-kit. Check the connection target.';
  END IF;
END
$$;

\echo '=== THE NUMBER TO CARRY TO THE POST-CHECK AS -v expected_before=<n> ==='
SELECT count(*) AS journal_rows_before, max(id) AS max_id
  FROM drizzle.__drizzle_migrations;

\echo ''
SELECT 'journal is at 76 rows'        AS check,
       count(*)::text                 AS observed,
       '76'                           AS expected,
       CASE WHEN count(*) = 76 THEN 'OK' ELSE 'FAIL' END AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
-- 0078 IS THE LAST TAG APPLIED, asserted by its file hash.
SELECT '0078 is applied (by hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '68334d6a822088f2ecb591a4f9ece426fe48c0cb7c1a1128057074ca79a71864')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '68334d6a822088f2ecb591a4f9ece426fe48c0cb7c1a1128057074ca79a71864')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- 0075 IS ALREADY IN. If it were not, TWO migrations would go through in one
-- run, which rule 8 does not contemplate - halt and report instead.
SELECT '0075 is applied (by hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'e268bc0ddbaa72358e8b6d5fb47ce6087b9f7013ca804e48c30bd32f25360aaa')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- 0079 MUST NOT ALREADY BE THERE. Rule 8 is one migration in flight.
SELECT '0079 is NOT applied yet (by hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'present' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
-- THE STATE 0079 EXISTS TO CHANGE. If service_role can already execute nothing,
-- this is not the database the card was written about - stop and say so.
SELECT 'service_role CAN still execute (the defect)',
       count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE'))::text,
       '> 0',
       CASE WHEN count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) > 0
            THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef

UNION ALL
SELECT 'the SECURITY DEFINER set is present',
       count(*)::text,
       '>= 20',
       CASE WHEN count(*) >= 20 THEN 'OK' ELSE 'FAIL' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef;

\echo ''
\echo '=== FOR THE RECORD: who can execute what, BEFORE ==='
SELECT count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_role,
       count(*) FILTER (WHERE has_function_privilege('anon',         p.oid, 'EXECUTE')) AS anon,
       count(*) FILTER (WHERE has_function_privilege('authenticated',p.oid, 'EXECUTE')) AS authenticated,
       count(*) FILTER (WHERE has_function_privilege('patient',      p.oid, 'EXECUTE')) AS patient,
       count(*) FILTER (WHERE p.proacl IS NULL)                                         AS null_acls,
       count(*)                                                                         AS total
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef;

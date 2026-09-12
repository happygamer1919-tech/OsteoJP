-- ===================================================================
-- 0083 PRE-CHECK. READ-ONLY. Nothing writes. Every verdict must read OK.
-- ===================================================================
-- Run BEFORE the apply. Any FAIL halts: do not retry, adjust or work around it
-- (SR-50 b).
--
-- IT PRINTS THREE CARRY VALUES - journal_rows_before, instances_rows_before and
-- switch_values_before. CARRY ALL THREE INTO THE POST-CHECK FROM THIS RUN'S
-- TRANSCRIPT AND NEVER AN EARLIER ONE (SR-59): the post-check proves this
-- migration wrote no data, and it cannot prove that against a number nobody
-- wrote down - or against a number written down last week that happens to look
-- plausible.
--
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -f scripts/0083-precheck.sql
--
-- ===================================================================
-- 0083 QUEUES BEHIND 0082 AND THAT IS ENFORCED HERE, NOT REMEMBERED.
-- ===================================================================
-- 0082's journal `when` is 1787601200000 and 0083's is 1787701200000. drizzle
-- applies a file only when its `when` is STRICTLY GREATER than the newest
-- created_at already recorded:
--     pg-core/dialect.js -> Number(lastDbMigration.created_at) < migration.folderMillis
-- SO APPLYING 0083 FIRST WOULD PERMANENTLY SKIP 0082. Not fail - SKIP, silently,
-- while printing "migrations applied successfully". That is the INC-07 / 0058
-- failure mode exactly, and the only difference here is that it is predictable
-- in advance, which is why it is a pre-check row rather than a warning.
\pset pager off
\pset format aligned
\pset title '0083 PRE-CHECK - every verdict must read OK'

DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'PRE-CHECK REFUSED: drizzle.__drizzle_migrations does not exist here.'
      USING HINT = 'That is the journal drizzle-kit migrate writes; supabase db reset writes a DIFFERENT one. Check the connection target.';
  END IF;
END
$$;

SELECT 'journal_rows_before'                    AS check,
       count(*)::text                           AS observed,
       'carry this into the post-check'         AS expected,
       'OK'                                     AS verdict
  FROM drizzle.__drizzle_migrations

UNION ALL
SELECT 'instances_rows_before',
       (SELECT count(*)::text FROM public.patient_pack_instances),
       'carry this into the post-check',
       'OK'

UNION ALL
-- ZERO BY CONSTRUCTION TODAY - the columns do not exist yet - but it is carried
-- so the post-check can assert the apply wrote no VALUES, not merely no ROWS.
-- The two are different: an ALTER ... SET DEFAULT would leave the row count
-- untouched and stamp a value on every future insert.
SELECT 'switch_values_before',
       '0',
       'carry this into the post-check',
       'OK'

UNION ALL
-- 0083 MUST BE ABSENT. Identity is the FILE HASH and never `id`: `id` is a
-- SERIAL and stopped matching the tag at the 0076/0077 gap, so the tag, the
-- journal idx and the row id are three different numbers.
SELECT '0083 is NOT yet applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d')
            THEN 'present' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
-- ==================================================================
-- THE QUEUE ROW. 0082 MUST ALREADY BE APPLIED.
-- ==================================================================
-- If this reads FAIL, apply 0082 first and re-run this pre-check. Applying 0083
-- over an unapplied 0082 does not fail; it makes 0082 unapplyable for ever, and
-- prints success while doing it.
SELECT '0082 IS applied (by file hash)',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE 7.0b ROW. The only check that catches a silent skip BEFORE the apply
-- rather than after it. 0083's journal `when` is 1787701200000.
SELECT 'newest applied created_at < 0083 when',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '< 1787701200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) < 1787701200000
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- BOTH COLUMNS MUST BE ABSENT. The migration has no IF NOT EXISTS, so a column
-- that already exists raises 42701 and the apply stops - but finding out here
-- costs nothing and finding out there costs a failed production transaction.
SELECT 'patient_pack_instances.switch_amount_cents absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='patient_pack_instances'
                            AND column_name='switch_amount_cents')
            THEN 'PRESENT' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='patient_pack_instances'
                            AND column_name='switch_amount_cents')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
SELECT 'patient_pack_instances.switch_reason absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='patient_pack_instances'
                            AND column_name='switch_reason')
            THEN 'PRESENT' ELSE 'absent' END,
       'absent',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='patient_pack_instances'
                            AND column_name='switch_reason')
            THEN 'FAIL' ELSE 'OK' END

UNION ALL
-- No constraint name may be taken. A collision would abort the ALTER partway,
-- leaving the first column added and the second not.
SELECT 'none of the three CHECK names is taken',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname IN ('patient_pack_instances_switch_amount_nonneg',
                           'patient_pack_instances_switch_reason_nonblank',
                           'patient_pack_instances_switch_amount_and_reason_together')),
       '0',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conname IN ('patient_pack_instances_switch_amount_nonneg',
                                     'patient_pack_instances_switch_reason_nonblank',
                                     'patient_pack_instances_switch_amount_and_reason_together')) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'the target table exists',
       CASE WHEN to_regclass('public.patient_pack_instances') IS NOT NULL
            THEN 'present' ELSE 'MISSING' END,
       'present',
       CASE WHEN to_regclass('public.patient_pack_instances') IS NOT NULL
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THE EXISTING CONSTRAINTS, COUNTED BEFORE. Three CHECKs pre-date this file
-- (total_pos, remaining_range, legacy_consumed_range). The post-check asserts
-- the number went 3 -> 6 and not 3 -> 3 or 0 -> 3: an ADD COLUMN that somehow
-- rebuilt the table would show here and nowhere else.
-- ==================================================================
SELECT 'CHECK constraints on the table (before)',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid='public.patient_pack_instances'::regclass AND contype='c'),
       '3, and carry it into the post-check',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid='public.patient_pack_instances'::regclass AND contype='c') = 3
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- THERE IS NO `patient` ROLE GRANT ON THIS TABLE, AND THE POST-CHECK PROVES
-- THE APPLY DID NOT CREATE ONE. Unlike 0081's `patients.locale`, which landed
-- on a table carrying COLUMN-level patient grants, this table is staff-only.
-- Recorded as a number so "no new exposure" is an observation, not a belief.
-- ==================================================================
SELECT 'patient-role privileges on patient_pack_instances (before)',
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_schema='public' AND table_name='patient_pack_instances'
           AND grantee='patient'),
       '0, and carry it into the post-check',
       CASE WHEN (SELECT count(*) FROM information_schema.table_privileges
                   WHERE table_schema='public' AND table_name='patient_pack_instances'
                     AND grantee='patient') = 0
            THEN 'OK' ELSE 'FAIL' END;

-- ===================================================================
-- 0083 POST-CHECK. Every verdict must read OK.
-- ===================================================================
-- Run AFTER the apply. Any FAIL halts and is reported IMMEDIATELY, breaking
-- the one-report rule: a half-applied production schema is not a thing that
-- waits for a report (SR-50 c).
--
-- IT WRITES NOTHING PERMANENT. Four arms need to prove the CHECK constraints
-- actually FIRE - and one of them proves the opposite, that ZERO IS ACCEPTED,
-- because three refusals are equally satisfied by `CHECK (false)`. Every arm
-- runs inside a sub-transaction that is ALWAYS rolled back and asserts the row
-- count is unchanged afterwards.
--
-- SUBSTITUTE THE THREE NUMBERS THIS RUN'S PRE-CHECK PRINTED (SR-59: this run's
-- transcript, never an earlier one):
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v journal_before=NN -v instances_before=NNN -v checks_before=3 \
--        -f scripts/0083-postcheck.sql
\pset pager off
\pset format aligned
\pset title '0083 POST-CHECK - every verdict must read OK'

-- ===================================================================
-- ARMS 0a-0d: THE CONSTRAINTS ARE PROVEN BY MAKING THEM FIRE, AND BY
-- MAKING ONE OF THEM NOT FIRE.
-- ===================================================================
-- WHY THIS IS NOT `SELECT ... FROM pg_constraint`. That proves a constraint
-- with the right NAME and the right TEXT exists. It does not prove the database
-- ENFORCES it: one added NOT VALID satisfies the catalogue read and admits the
-- bad row anyway. A guard proves a test RAN; only the assertion proves it tested
-- the right subject.
--
-- AND ARM 0d IS NOT OPTIONAL. `CHECK (false)` passes 0a, 0b and 0c perfectly.
-- The ruling's content is that ZERO IS ACCEPTED WHILE MISSING IS REFUSED, so a
-- post-check that only proved the refusals would be green over a schema that
-- refuses the goodwill upgrade the ruling exists to record.
DO $$
DECLARE
  probe        record;
  rows_before  bigint;
  rows_after   bigint;
  refused      boolean;
  probe_id     uuid;
BEGIN
  SELECT count(*) INTO rows_before FROM public.patient_pack_instances;

  SELECT tenant_id, patient_id, pack_id, sessions_total, sessions_remaining
    INTO probe
    FROM public.patient_pack_instances
   ORDER BY created_at
   LIMIT 1;

  -- AN UNHANDLED CASE MUST FAIL, NOT FALL BACK. With no instance to clone there
  -- is nothing to probe with, and four arms that quietly did nothing would print
  -- exactly like four arms that passed.
  IF probe IS NULL THEN
    RAISE EXCEPTION
      'POST-CHECK REFUSED: patient_pack_instances is empty, so the enforcement arms have no row to clone. The constraints are UNPROVEN, not proven.';
  END IF;

  ---------------------------------------------------------------- 0a
  refused := false;
  BEGIN
    INSERT INTO public.patient_pack_instances
      (tenant_id, patient_id, pack_id, sessions_total, sessions_remaining,
       switch_amount_cents, switch_reason)
    VALUES (probe.tenant_id, probe.patient_id, probe.pack_id,
            probe.sessions_total, probe.sessions_remaining,
            -1, '0083 POSTCHECK PROBE - ROLLED BACK');
    RAISE EXCEPTION
      'POST-CHECK FAILED (0a): a NEGATIVE amount was accepted. patient_pack_instances_switch_amount_nonneg exists in name only.';
  EXCEPTION
    WHEN check_violation THEN refused := true;
    WHEN raise_exception THEN RAISE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (0a): the probe neither inserted nor was refused.';
  END IF;

  ---------------------------------------------------------------- 0b
  refused := false;
  BEGIN
    INSERT INTO public.patient_pack_instances
      (tenant_id, patient_id, pack_id, sessions_total, sessions_remaining,
       switch_amount_cents)
    VALUES (probe.tenant_id, probe.patient_id, probe.pack_id,
            probe.sessions_total, probe.sessions_remaining, 1500);
    RAISE EXCEPTION
      'POST-CHECK FAILED (0b): an amount with NO REASON was accepted. patient_pack_instances_switch_amount_and_reason_together exists in name only.';
  EXCEPTION
    WHEN check_violation THEN refused := true;
    WHEN raise_exception THEN RAISE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (0b): the probe neither inserted nor was refused.';
  END IF;

  ---------------------------------------------------------------- 0c
  refused := false;
  BEGIN
    INSERT INTO public.patient_pack_instances
      (tenant_id, patient_id, pack_id, sessions_total, sessions_remaining,
       switch_amount_cents, switch_reason)
    VALUES (probe.tenant_id, probe.patient_id, probe.pack_id,
            probe.sessions_total, probe.sessions_remaining, 1500, '   ');
    RAISE EXCEPTION
      'POST-CHECK FAILED (0c): a WHITESPACE-ONLY reason was accepted. patient_pack_instances_switch_reason_nonblank exists in name only.';
  EXCEPTION
    WHEN check_violation THEN refused := true;
    WHEN raise_exception THEN RAISE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (0c): the probe neither inserted nor was refused.';
  END IF;

  ---------------------------------------------------------------- 0d
  -- THE POSITIVE CONTROL. Zero WITH a reason must be ACCEPTED, and the row is
  -- then removed in the same block.
  BEGIN
    INSERT INTO public.patient_pack_instances
      (tenant_id, patient_id, pack_id, sessions_total, sessions_remaining,
       switch_amount_cents, switch_reason)
    VALUES (probe.tenant_id, probe.patient_id, probe.pack_id,
            probe.sessions_total, probe.sessions_remaining,
            0, '0083 POSTCHECK PROBE - ROLLED BACK')
    RETURNING id INTO probe_id;
    DELETE FROM public.patient_pack_instances WHERE id = probe_id;
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION
        'POST-CHECK FAILED (0d): ZERO WITH A REASON WAS REFUSED. The constraint is > 0 where the ruling says >= 0, and a goodwill upgrade cannot be recorded.';
  END;

  SELECT count(*) INTO rows_after FROM public.patient_pack_instances;
  IF rows_after <> rows_before THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: the probes changed the instance row count, % -> %.',
      rows_before, rows_after;
  END IF;

  RAISE NOTICE 'ARMS 0a-0d OK: three refusals fired, zero-with-a-reason was accepted, % rows.', rows_after;
END
$$;

SELECT 'journal = before + 1'                    AS check,
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS observed,
       (:'journal_before'::int + 1)::text        AS expected,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'journal_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END            AS verdict

UNION ALL
-- IDENTITY IS THE FILE HASH. The only check that proves the file APPLIED is the
-- file APPROVED; a renamed or edited file cannot satisfy it.
SELECT '0083 present by sha256 of the approved file',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = '12a756bd8fe934c01448b9cddd30c0fa02be9b27141b6c6cab7ed1f87a66e96d')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- 0082 MUST STILL BE THERE. It is the file 0083 queues behind, and the failure
-- mode this guards is not a rollback: it is 0082 having been SKIPPED.
SELECT '0082 STILL present by file hash',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'present' ELSE 'absent' END,
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                          WHERE hash = 'b43423ae98ba631501473ca67ebdbabc1f7914340391301f22be7ef9c620a4b9')
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'switch_amount_cents is nullable integer',
       (SELECT coalesce(data_type || '/' || is_nullable, 'MISSING')
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='patient_pack_instances'
           AND column_name='switch_amount_cents'),
       'integer/YES',
       CASE WHEN (SELECT data_type || '/' || is_nullable FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patient_pack_instances'
                     AND column_name='switch_amount_cents') = 'integer/YES'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'switch_reason is nullable text',
       (SELECT coalesce(data_type || '/' || is_nullable, 'MISSING')
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='patient_pack_instances'
           AND column_name='switch_reason'),
       'text/YES',
       CASE WHEN (SELECT data_type || '/' || is_nullable FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patient_pack_instances'
                     AND column_name='switch_reason') = 'text/YES'
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- NEITHER COLUMN HAS A DEFAULT, AND THIS IS THE FIRST STAMPED CONSTRAINT.
-- ==================================================================
-- "The amount is an input, never a pre-filled default that was accepted." A
-- DEFAULT is one word; it would make every future row claim a statement nobody
-- made, and the row could not afterwards tell "reception agreed" from
-- "reception did not look". Nothing else in this file would notice it.
SELECT 'neither column carries a DEFAULT',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='patient_pack_instances'
           AND column_name IN ('switch_amount_cents','switch_reason')
           AND column_default IS NOT NULL),
       '0',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patient_pack_instances'
                     AND column_name IN ('switch_amount_cents','switch_reason')
                     AND column_default IS NOT NULL) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'CHECK constraints on the table = before + 3',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid='public.patient_pack_instances'::regclass AND contype='c'),
       (:'checks_before'::int + 3)::text,
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid='public.patient_pack_instances'::regclass AND contype='c')
                 = :'checks_before'::int + 3
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- VALIDATED, not merely present. A NOT VALID constraint is enforced for new
-- rows only, and the arms above would still pass over it - they insert new rows.
SELECT 'all three new CHECKs are VALIDATED',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid='public.patient_pack_instances'::regclass
           AND conname LIKE '%switch%' AND convalidated),
       '3',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid='public.patient_pack_instances'::regclass
                     AND conname LIKE '%switch%' AND convalidated) = 3
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- ==================================================================
-- IT WROTE NO DATA. TWO SEPARATE CLAIMS, BECAUSE THEY FAIL DIFFERENTLY.
-- ==================================================================
-- The row count answers "no rows were added or lost". The value count answers
-- "no row acquired a switch amount", which a DEFAULT or a stray UPDATE would
-- break while leaving the row count untouched.
SELECT 'instance rows unchanged',
       (SELECT count(*)::text FROM public.patient_pack_instances),
       :'instances_before',
       CASE WHEN (SELECT count(*) FROM public.patient_pack_instances) = :'instances_before'::bigint
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
SELECT 'no row acquired a switch amount or reason',
       (SELECT (count(switch_amount_cents) + count(switch_reason))::text
          FROM public.patient_pack_instances),
       '0',
       CASE WHEN (SELECT count(switch_amount_cents) + count(switch_reason)
                    FROM public.patient_pack_instances) = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- NO NEW EXPOSURE. This table is staff-only and must have stayed that way.
SELECT 'patient-role privileges on the table still 0',
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_schema='public' AND table_name='patient_pack_instances'
           AND grantee='patient'),
       '0',
       CASE WHEN (SELECT count(*) FROM information_schema.table_privileges
                   WHERE table_schema='public' AND table_name='patient_pack_instances'
                     AND grantee='patient') = 0
            THEN 'OK' ELSE 'FAIL' END

UNION ALL
-- THE PRE-0083 CONSTRAINTS SURVIVED. An ADD COLUMN does not rebuild a table,
-- but this is the row that would say so if one ever did.
SELECT 'the three pre-0083 CHECKs are still there',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid='public.patient_pack_instances'::regclass
           AND conname IN ('patient_pack_instances_total_pos',
                           'patient_pack_instances_remaining_range',
                           'patient_pack_instances_legacy_consumed_range')),
       '3',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid='public.patient_pack_instances'::regclass
                     AND conname IN ('patient_pack_instances_total_pos',
                                     'patient_pack_instances_remaining_range',
                                     'patient_pack_instances_legacy_consumed_range')) = 3
            THEN 'OK' ELSE 'FAIL' END;

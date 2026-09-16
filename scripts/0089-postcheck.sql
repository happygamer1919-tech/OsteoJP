-- 0089 POST-CHECK. Card SR62-PU4-documentos-soft-delete.
--
-- Run by stage 2 of docs/migration-apply-0089.md, AFTER the apply, with three carries from
-- THIS sitting's pre-check transcript (SR-59):
--   -v journal_before=<row 1>  -v policies_before=<row 11>  -v secdef_before=<row 12>
--
-- EVERY VERDICT MUST READ OK (exactly 12), AND THE ARMS BLOCK MUST PRINT ITS NOTICE.
--
-- THE ARMS RUN INSIDE ONE TRANSACTION THAT IS ROLLED BACK. They borrow one tenant, build a
-- patient, a second patient, a staff user and two documents, then read as `patient` and as
-- `authenticated`. Nothing they create survives: verdict row 12 counts it.
--
-- WHAT THE ARMS ARE FOR. 0089 is an ALTER POLICY, not a new policy, so the policy COUNT does
-- not move (verdict 9 asserts it does NOT). The only way to show the rewrite did what it
-- claims is to read as a patient before and after a soft delete, which is what A1 and A2 do.

\pset pager off
\timing off

\echo ''
\echo '=== 0089 POST-CHECK: the arms first (one transaction, rolled back) ==='

BEGIN;

CREATE TEMP TABLE pc_fixture ON COMMIT DROP AS
SELECT (SELECT id FROM public.tenants ORDER BY id LIMIT 1) AS tenant_id,
       gen_random_uuid() AS patient,
       gen_random_uuid() AS other_patient,
       gen_random_uuid() AS staff,
       gen_random_uuid() AS doc_a,
       gen_random_uuid() AS doc_b;

DO $$
BEGIN
  IF (SELECT tenant_id FROM pc_fixture) IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): no tenant to borrow';
  END IF;
END
$$;

INSERT INTO public.users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
SELECT staff, tenant_id, '0089-postcheck-' || staff || '@example.invalid', '0089 post-check staff', true, false, false
  FROM pc_fixture;

INSERT INTO public.patients (id, tenant_id, full_name)
SELECT patient, tenant_id, '0089 post-check patient (rolled back)' FROM pc_fixture
UNION ALL
SELECT other_patient, tenant_id, '0089 post-check other patient (rolled back)' FROM pc_fixture;

INSERT INTO public.attachments (id, tenant_id, patient_id, storage_path, file_name)
SELECT doc_a, tenant_id, patient, tenant_id || '/0089-post-check-a', '0089 post-check A.pdf' FROM pc_fixture
UNION ALL
SELECT doc_b, tenant_id, patient, tenant_id || '/0089-post-check-b', '0089 post-check B.pdf' FROM pc_fixture;

CREATE TEMP TABLE pc_arm (probe text, outcome text) ON COMMIT DROP;
GRANT SELECT ON pc_fixture TO authenticated, patient;
GRANT INSERT, SELECT ON pc_arm TO authenticated, patient;

-- A1: the owning patient READS their document while it is live.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'patient_id', patient)::text,
         true) IS NOT NULL AS a1_claims_set
  FROM pc_fixture;
SET LOCAL ROLE patient;
INSERT INTO pc_arm
SELECT 'A1', CASE WHEN n = 1 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.attachments a JOIN pc_fixture f ON a.id = f.doc_a) x;
RESET ROLE;

-- A7: a DIFFERENT patient never saw it (selfscope preserved, checked before the delete).
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'patient_id', other_patient)::text,
         true) IS NOT NULL AS a7_claims_set
  FROM pc_fixture;
SET LOCAL ROLE patient;
INSERT INTO pc_arm
SELECT 'A7', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.attachments a JOIN pc_fixture f ON a.id = f.doc_a) x;
RESET ROLE;

-- The soft delete itself, written as the table owner (the app writes it as `authenticated`
-- under the untouched 0001 policy; what the arms measure is the READ consequence).
UPDATE public.attachments
   SET deleted_at = now(),
       deleted_by_user_id = (SELECT staff FROM pc_fixture),
       delete_reason = 'wrong patient, uploaded in error'
 WHERE id = (SELECT doc_a FROM pc_fixture);

-- A2: the owning patient can no longer read it. THIS IS THE MIGRATION'S WHOLE POINT.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'patient_id', patient)::text,
         true) IS NOT NULL AS a2_claims_set
  FROM pc_fixture;
SET LOCAL ROLE patient;
INSERT INTO pc_arm
SELECT 'A2', CASE WHEN n = 0 THEN 'OK' ELSE 'STILL SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.attachments a JOIN pc_fixture f ON a.id = f.doc_a) x;
-- A3 (patient half): the patient's OTHER, live document is untouched by the rewrite.
INSERT INTO pc_arm
SELECT 'A3', CASE WHEN n = 1 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.attachments a JOIN pc_fixture f ON a.id = f.doc_b) x;
RESET ROLE;

-- A4: STAFF still read the soft-deleted row. The 0001 policy is NOT touched, and keeping the
-- row readable at the database is what lets the trail be read later.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'admin', 'sub', staff)::text,
         true) IS NOT NULL AS a4_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'A4', CASE WHEN n = 1 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.attachments a JOIN pc_fixture f ON a.id = f.doc_a) x;
RESET ROLE;

-- A5, A6, A8: the CHECK and the FK refuse an unaccountable deletion. Each runs in its own
-- subtransaction so the failure is caught rather than aborting the arms.
DO $$
DECLARE
  f record;
BEGIN
  SELECT * INTO f FROM pc_fixture;

  BEGIN
    UPDATE public.attachments SET deleted_at = now() WHERE id = f.doc_b;
    INSERT INTO pc_arm VALUES ('A5', 'ACCEPTED a delete with no actor and no reason');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO pc_arm VALUES ('A5', 'OK');
  END;

  BEGIN
    UPDATE public.attachments
       SET deleted_at = now(), deleted_by_user_id = f.staff, delete_reason = E'\t\n  '
     WHERE id = f.doc_b;
    INSERT INTO pc_arm VALUES ('A6', 'ACCEPTED a whitespace-only reason');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO pc_arm VALUES ('A6', 'OK');
  END;

  BEGIN
    UPDATE public.attachments
       SET deleted_at = now(), deleted_by_user_id = gen_random_uuid(), delete_reason = 'unknown actor'
     WHERE id = f.doc_b;
    INSERT INTO pc_arm VALUES ('A8', 'ACCEPTED an actor that is not a user');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO pc_arm VALUES ('A8', 'OK');
  END;
END
$$;

-- The arms' verdict, as a NOTICE, so it adds no "| OK" row to the count below.
DO $$
DECLARE
  bad text;
  ran int;
BEGIN
  SELECT string_agg(probe || '=' || outcome, ' ' ORDER BY probe) INTO bad FROM pc_arm WHERE outcome <> 'OK';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): %', bad;
  END IF;
  SELECT count(*) INTO ran FROM pc_arm;
  IF ran <> 7 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): % of 7 probes ran', ran;
  END IF;
  RAISE NOTICE 'ARMS A1 A2 A3 A4 A5 A6 A7 A8 OK';
END
$$;

ROLLBACK;

\echo ''
\echo '=== 0089 POST-CHECK - every row must read OK ==='

SELECT '1. the journal grew by exactly one',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       '= ' || (:journal_before + 1),
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :journal_before + 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '2. 0089 sha256 is present',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced'),
       '= 1',
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations
                   WHERE hash = 'ec1b90634b4253e50fe1060b03b22a0b2fe447136baaaa811dba819d7c084ced') = 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. the newest journal when is 0089''s',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '= 1788301200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) = 1788301200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. the three columns exist and are all nullable',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'attachments'
           AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')
           AND is_nullable = 'YES'),
       '= 3',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name IN ('deleted_at', 'deleted_by_user_id', 'delete_reason')
                     AND is_nullable = 'YES') = 3
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. the CHECK constraint, by md5 and length of its definition',
       coalesce((SELECT md5(pg_get_constraintdef(oid)) || ' ' || length(pg_get_constraintdef(oid))::text
                   FROM pg_constraint WHERE conname = 'attachments_soft_delete_complete'), 'ABSENT'),
       '21a8365a5fb8c6a4d3eabb6025b35dd0 235',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'attachments_soft_delete_complete'
                            AND md5(pg_get_constraintdef(oid)) = '21a8365a5fb8c6a4d3eabb6025b35dd0'
                            AND length(pg_get_constraintdef(oid)) = 235)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '6. the FK constraint, by md5 of its definition',
       coalesce((SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
                  WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'), 'ABSENT'),
       '18e5b11368781041d450e7aebc0b9331',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'attachments_deleted_by_user_id_users_id_fk'
                            AND md5(pg_get_constraintdef(oid)) = '18e5b11368781041d450e7aebc0b9331')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. attachments_patient_selfscope gained the deleted_at conjunct, by md5 and length',
       coalesce((SELECT cmd || ' ' || roles::text || ' ' || md5(qual) || ' ' || length(qual)::text
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'attachments'
                    AND policyname = 'attachments_patient_selfscope'), 'ABSENT'),
       'SELECT {patient} ee4023fadfae136818251ad2192538ab 147',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'attachments'
                            AND policyname = 'attachments_patient_selfscope'
                            AND cmd = 'SELECT' AND roles::text = '{patient}'
                            AND md5(qual) = 'ee4023fadfae136818251ad2192538ab'
                            AND length(qual) = 147)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. attachments_tenant_isolation is untouched (both halves)',
       coalesce((SELECT md5(qual) || ' ' || md5(with_check) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'attachments'
                    AND policyname = 'attachments_tenant_isolation'), 'ABSENT'),
       '11ef341951d0d9b55ccd0acbb8d6a2e0 x2',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'attachments'
                            AND policyname = 'attachments_tenant_isolation'
                            AND md5(qual) = '11ef341951d0d9b55ccd0acbb8d6a2e0'
                            AND md5(with_check) = '11ef341951d0d9b55ccd0acbb8d6a2e0')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. attachments carries the SAME number of policies (ALTER POLICY, not a new one)',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attachments'),
       '= ' || :policies_before,
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attachments')
                 = :policies_before
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. no SECURITY DEFINER function was added',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       '= ' || :secdef_before,
       CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.prosecdef) = :secdef_before
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. the delete_reason column comment is present, by md5',
       coalesce(md5(col_description('public.attachments'::regclass,
                 (SELECT ordinal_position FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name = 'delete_reason')::int)), 'ABSENT'),
       '544869ec4d0dab44c6c8b9e96602ac5b',
       CASE WHEN md5(col_description('public.attachments'::regclass,
                 (SELECT ordinal_position FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'attachments'
                     AND column_name = 'delete_reason')::int)) = '544869ec4d0dab44c6c8b9e96602ac5b'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '12. nothing the arms created survived the rollback',
       ((SELECT count(*) FROM public.users WHERE full_name LIKE '0089 post-check%')
        + (SELECT count(*) FROM public.patients WHERE full_name LIKE '0089 post-check%')
        + (SELECT count(*) FROM public.attachments WHERE file_name LIKE '0089 post-check%'))::text,
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE full_name LIKE '0089 post-check%')
             AND NOT EXISTS (SELECT 1 FROM public.patients WHERE full_name LIKE '0089 post-check%')
             AND NOT EXISTS (SELECT 1 FROM public.attachments WHERE file_name LIKE '0089 post-check%')
            THEN 'OK' ELSE 'FAIL' END;

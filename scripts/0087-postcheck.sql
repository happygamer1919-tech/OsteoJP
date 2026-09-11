-- ===================================================================
-- 0087 POST-CHECK. Run in STAGE 2 of docs/migration-apply-0087.md.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v journal_before=<J> -v secdef_before=<S> -v guest_requests_before=<G> \
--        -f scripts/0087-postcheck.sql 2>&1 | tee /tmp/0087-postcheck.out
--
-- SR-59: J, S and G come out of THIS RUN's pre-check transcript, parsed by the
-- stage, never typed.
--
-- EVERY VERDICT MUST READ OK, AND THE ARMS BLOCK MUST PRINT ITS NOTICE. Any FAIL,
-- or any ERROR, halts and is reported IMMEDIATELY (SR-50(c)): a half-applied
-- production schema does not wait for a report.
--
-- ===================================================================
-- THE ARMS RUN INSIDE ONE TRANSACTION THAT IS ROLLED BACK
-- ===================================================================
-- The table is empty at apply time, so the arms build their own rows. They
-- borrow ONE existing location and ONE existing service in one tenant, and create
-- a second clinic, one receptionist assigned only to it, three guest requests at
-- the borrowed clinic and one intake on each:
--   i_old   arrived 8 days ago, request never converted   -> the purge takes it
--   i_conv  arrived 8 days ago, request converted          -> kept for ever
--   i_new   arrived now, request never converted           -> kept (clock not run)
-- The converted request points at a random id: converted_patient_id carries no
-- foreign key (0063 records it as data), so no patient row is created or borrowed.
-- `postgres` owns these tables and RLS is ENABLE, not FORCE, so the fixture rows
-- go in without claims. Then:
--
--   S1  reception with NO location assignment sees all three
--   S2  reception assigned ONLY to the other clinic sees none of them
--   S3  a therapist sees none, the converted one included: it does not treat
--       that person, and before conversion there is nobody to scope it by
--   S4  owner sees all three
--   S5  an owner of ANOTHER tenant sees none
--   W1  INSERT as authenticated is refused 42501 (the write is the guest route's)
--   W2  UPDATE as authenticated is refused 42501 (the clock cannot be moved)
--   W3  DELETE as authenticated is refused 42501 (only the purge deletes)
--   P1  purge(NULL) is refused 22004: the job never runs globally
--   P2  purge(tenant) returns exactly 1
--   P3  it took i_old, and kept i_conv and i_new
--   P4  every request survived: the purge deletes the ANSWERS, never the request
--   P5  exactly one audit row, for i_old's request, PII-free (two metadata keys)
--
-- The patient arm is NOT exercised here. Whether `postgres` may SET ROLE patient
-- on the hosted project has never been measured, and a post-check that halts on
-- a role switch after a clean apply proves nothing. The patient arm is proven by
-- packages/db/tests/guest-clinical-intakes.db.test.ts; row 9 and row 14 below
-- assert its policy and its helper's grant structurally.
--
-- The whole block ends in ROLLBACK. A failed probe raises before the ROLLBACK,
-- which aborts the transaction and psql with it, so a failure writes nothing
-- either. Row 18 re-asserts, after the rollback, that nothing was kept.

\pset pager off
\timing off

\echo ''
\echo '=== 0087 POST-CHECK: the arms first (one transaction, rolled back) ==='

BEGIN;

CREATE TEMP TABLE pc_fixture ON COMMIT DROP AS
WITH t AS (
  SELECT l.tenant_id,
         l.id AS loc,
         (SELECT s.id FROM public.services s WHERE s.tenant_id = l.tenant_id ORDER BY s.id LIMIT 1) AS svc
    FROM public.locations l
   WHERE EXISTS (SELECT 1 FROM public.services s WHERE s.tenant_id = l.tenant_id)
   ORDER BY l.tenant_id, l.id
   LIMIT 1
)
SELECT t.tenant_id, t.loc, t.svc,
       gen_random_uuid() AS loc_b,
       gen_random_uuid() AS rec_b,
       gen_random_uuid() AS conv_pat,
       gen_random_uuid() AS r_old,
       gen_random_uuid() AS r_conv,
       gen_random_uuid() AS r_new,
       gen_random_uuid() AS i_old,
       gen_random_uuid() AS i_conv,
       gen_random_uuid() AS i_new
  FROM t;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pc_fixture) THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): no tenant with a location and a service - the pre-check should have halted on row 18.';
  END IF;
END
$$;

INSERT INTO public.locations (id, tenant_id, name)
SELECT loc_b, tenant_id, '0087 post-check B (rolled back)' FROM pc_fixture;

INSERT INTO public.users (id, tenant_id, email, full_name)
SELECT rec_b, tenant_id, 'intake-0087-postcheck-' || rec_b || '@example.invalid',
       '0087 post-check reception' FROM pc_fixture;

INSERT INTO public.staff_locations (tenant_id, user_id, location_id)
SELECT tenant_id, rec_b, loc_b FROM pc_fixture;

INSERT INTO public.guest_booking_requests
  (id, tenant_id, full_name, phone, service_id, location_id,
   requested_starts_at, requested_ends_at, converted_patient_id)
SELECT r_old, tenant_id, '0087 post-check (rolled back)', '910000000', svc, loc,
       now() + interval '30 days', now() + interval '30 days 1 hour', NULL::uuid FROM pc_fixture
UNION ALL
SELECT r_conv, tenant_id, '0087 post-check (rolled back)', '910000000', svc, loc,
       now() + interval '30 days', now() + interval '30 days 1 hour', conv_pat FROM pc_fixture
UNION ALL
SELECT r_new, tenant_id, '0087 post-check (rolled back)', '910000000', svc, loc,
       now() + interval '30 days', now() + interval '30 days 1 hour', NULL::uuid FROM pc_fixture;

INSERT INTO public.guest_clinical_intakes
  (id, tenant_id, guest_booking_request_id, date_of_birth, reason, pacemaker, pregnancy,
   consent_ticked, consent_at, consent_version, created_at)
SELECT i_old, tenant_id, r_old, DATE '1980-01-01', 'post-check fixture',
       'nao'::public.intake_answer, 'nao'::public.intake_answer, true,
       now() - interval '8 days', 'rgpd-intake-2026-09-11', now() - interval '8 days' FROM pc_fixture
UNION ALL
SELECT i_conv, tenant_id, r_conv, DATE '1980-01-01', 'post-check fixture',
       'nao'::public.intake_answer, 'nao'::public.intake_answer, true,
       now() - interval '8 days', 'rgpd-intake-2026-09-11', now() - interval '8 days' FROM pc_fixture
UNION ALL
SELECT i_new, tenant_id, r_new, DATE '1980-01-01', 'post-check fixture',
       'nao'::public.intake_answer, 'nao'::public.intake_answer, true,
       now(), 'rgpd-intake-2026-09-11', now() FROM pc_fixture;

CREATE TEMP TABLE pc_arm (probe text, outcome text) ON COMMIT DROP;
GRANT SELECT ON pc_fixture TO authenticated;
GRANT INSERT, SELECT ON pc_arm TO authenticated;

-- S1: reception, no location assignment (a sub with no staff_locations row).
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'reception', 'sub', gen_random_uuid())::text,
         true) IS NOT NULL AS s1_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'S1', CASE WHEN n = 3 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.guest_clinical_intakes i
          JOIN pc_fixture f ON i.id IN (f.i_old, f.i_conv, f.i_new)) x;
RESET ROLE;

-- S2: reception assigned ONLY to clinic B. The fixtures are at the borrowed clinic.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'reception', 'sub', rec_b)::text,
         true) IS NOT NULL AS s2_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'S2', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.guest_clinical_intakes i
          JOIN pc_fixture f ON i.id IN (f.i_old, f.i_conv, f.i_new)) x;
RESET ROLE;

-- S3: a therapist who treats nobody here.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'therapist', 'sub', gen_random_uuid())::text,
         true) IS NOT NULL AS s3_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'S3', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.guest_clinical_intakes i
          JOIN pc_fixture f ON i.id IN (f.i_old, f.i_conv, f.i_new)) x;
RESET ROLE;

-- S4: owner.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'owner', 'sub', gen_random_uuid())::text,
         true) IS NOT NULL AS s4_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'S4', CASE WHEN n = 3 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.guest_clinical_intakes i
          JOIN pc_fixture f ON i.id IN (f.i_old, f.i_conv, f.i_new)) x;
RESET ROLE;

-- S5: an owner of another tenant.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', gen_random_uuid(), 'user_role', 'owner', 'sub', gen_random_uuid())::text,
         true) IS NOT NULL AS s5_claims_set;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'S5', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.guest_clinical_intakes i
          JOIN pc_fixture f ON i.id IN (f.i_old, f.i_conv, f.i_new)) x;
RESET ROLE;

-- W1-W3: every write is refused to authenticated by PRIVILEGE (42501). A refusal
-- with any other SQLSTATE is not the property and reads as a failure.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'owner', 'sub', gen_random_uuid())::text,
         true) IS NOT NULL AS w_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  f record;
BEGIN
  SELECT * INTO f FROM pc_fixture;

  BEGIN
    INSERT INTO public.guest_clinical_intakes
      (tenant_id, guest_booking_request_id, date_of_birth, reason, pacemaker, pregnancy,
       consent_ticked, consent_at, consent_version)
    VALUES (f.tenant_id, f.r_new, DATE '1980-01-01', 'x', 'nao', 'nao', true, now(), 'rgpd-intake-2026-09-11');
    INSERT INTO pc_arm VALUES ('W1', 'ADMITTED');
  EXCEPTION
    WHEN insufficient_privilege THEN INSERT INTO pc_arm VALUES ('W1', 'OK');
    WHEN OTHERS THEN INSERT INTO pc_arm VALUES ('W1', 'REFUSED ' || SQLSTATE);
  END;

  BEGIN
    UPDATE public.guest_clinical_intakes SET created_at = now() WHERE id = f.i_old;
    INSERT INTO pc_arm VALUES ('W2', 'ADMITTED');
  EXCEPTION
    WHEN insufficient_privilege THEN INSERT INTO pc_arm VALUES ('W2', 'OK');
    WHEN OTHERS THEN INSERT INTO pc_arm VALUES ('W2', 'REFUSED ' || SQLSTATE);
  END;

  BEGIN
    DELETE FROM public.guest_clinical_intakes WHERE id = f.i_new;
    INSERT INTO pc_arm VALUES ('W3', 'ADMITTED');
  EXCEPTION
    WHEN insufficient_privilege THEN INSERT INTO pc_arm VALUES ('W3', 'OK');
    WHEN OTHERS THEN INSERT INTO pc_arm VALUES ('W3', 'REFUSED ' || SQLSTATE);
  END;
END
$$;
RESET ROLE;

-- P1-P5: the retention job, as its owner (the only caller it has).
DO $$
BEGIN
  BEGIN
    PERFORM public.purge_expired_guest_intakes(NULL);
    INSERT INTO pc_arm VALUES ('P1', 'RAN WITHOUT A TENANT');
  EXCEPTION
    WHEN SQLSTATE '22004' THEN INSERT INTO pc_arm VALUES ('P1', 'OK');
    WHEN OTHERS THEN INSERT INTO pc_arm VALUES ('P1', 'REFUSED ' || SQLSTATE);
  END;
END
$$;

DO $$
DECLARE
  f record;
  n int;
BEGIN
  SELECT * INTO f FROM pc_fixture;
  n := public.purge_expired_guest_intakes(f.tenant_id);
  INSERT INTO pc_arm VALUES ('P2', CASE WHEN n = 1 THEN 'OK' ELSE 'RETURNED ' || n END);

  INSERT INTO pc_arm VALUES ('P3',
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.guest_clinical_intakes WHERE id = f.i_old)
          AND EXISTS (SELECT 1 FROM public.guest_clinical_intakes WHERE id = f.i_conv)
          AND EXISTS (SELECT 1 FROM public.guest_clinical_intakes WHERE id = f.i_new)
         THEN 'OK' ELSE 'WRONG SURVIVORS' END);

  INSERT INTO pc_arm VALUES ('P4',
    CASE WHEN (SELECT count(*) FROM public.guest_booking_requests
                WHERE id IN (f.r_old, f.r_conv, f.r_new)) = 3
         THEN 'OK' ELSE 'A REQUEST WAS DELETED' END);

  INSERT INTO pc_arm VALUES ('P5',
    CASE WHEN (SELECT count(*) FROM public.audit_log a
                WHERE a.tenant_id = f.tenant_id
                  AND a.entity_id = f.r_old
                  AND a.action = 'guest_intake.purged'
                  AND a.entity_type = 'guest_booking_request'
                  AND a.actor_user_id IS NULL
                  AND a.metadata ->> 'reason' = 'retention_7d_unconverted'
                  AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(a.metadata) AS k)
                      = ARRAY['intake_arrived_at', 'reason']) = 1
          AND (SELECT count(*) FROM public.audit_log a
                WHERE a.action = 'guest_intake.purged'
                  AND a.entity_id IN (f.r_conv, f.r_new)) = 0
         THEN 'OK' ELSE 'AUDIT ROW WRONG' END);
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
  IF ran <> 13 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): % of 13 probes ran', ran;
  END IF;
  RAISE NOTICE 'ARMS S1 S2 S3 S4 S5 W1 W2 W3 P1 P2 P3 P4 P5 OK';
END
$$;

ROLLBACK;

\echo ''
\echo '=== 0087 POST-CHECK: the verdicts - every row must read OK ==='

SELECT '1. journal grew by exactly one',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       (:'journal_before'::int + 1)::text,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'journal_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END;

-- THE FILE APPLIED IS THE FILE APPROVED. This is the only row that proves it.
SELECT '2. 0087 sha256 IS in the journal',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'ec6556aa26e89592822f76cfd92869f3bf4ec503680ef41753f4f962e6cd5c14')
            THEN 'OK' ELSE 'FAIL' END;

-- A journal `when`, a constant from _journal.json. It is not an apply time.
SELECT '3. the newest journal when is 0087''s',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '1788101200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) = 1788101200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. intake_answer has exactly three labels, in order',
       coalesce((SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum
                  WHERE enumtypid = to_regtype('public.intake_answer')), 'MISSING'),
       'sim,nao,nao_perguntado',
       CASE WHEN (SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum
                   WHERE enumtypid = to_regtype('public.intake_answer')) = 'sim,nao,nao_perguntado'
            THEN 'OK' ELSE 'FAIL' END;

-- ENABLE, not FORCE: the same posture as every policy-bearing table, and the one
-- the purge depends on (it runs as the table's owner).
SELECT '5. guest_clinical_intakes exists, RLS enabled and not forced',
       coalesce((SELECT relrowsecurity::text || ' ' || relforcerowsecurity::text FROM pg_class
                  WHERE oid = to_regclass('public.guest_clinical_intakes')), 'MISSING'),
       'true false',
       CASE WHEN (SELECT relrowsecurity::text || ' ' || relforcerowsecurity::text FROM pg_class
                   WHERE oid = to_regclass('public.guest_clinical_intakes')) = 'true false'
            THEN 'OK' ELSE 'FAIL' END;

-- There is no updated_at, on purpose: the retention clock runs on arrival.
SELECT '6. the fifteen columns, names, types and nullability exact',
       (SELECT count(*)::text || ' columns' FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'guest_clinical_intakes'),
       '15 columns, as 0087',
       CASE WHEN (SELECT string_agg(column_name || ' ' || udt_name || ' ' || is_nullable, ', ' ORDER BY ordinal_position)
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'guest_clinical_intakes')
               = 'id uuid NO, tenant_id uuid NO, guest_booking_request_id uuid NO, date_of_birth date NO, '
                 'reason text NO, health_conditions text YES, medication text YES, falls_accidents text YES, '
                 'surgeries text YES, pacemaker intake_answer NO, pregnancy intake_answer NO, '
                 'consent_ticked bool NO, consent_at timestamptz NO, consent_version text NO, '
                 'created_at timestamptz NO'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. eight CHECKs, one UNIQUE, two FKs (the request one ON DELETE CASCADE)',
       (SELECT 'check=' || count(*) FILTER (WHERE contype = 'c')
               || ' unique=' || count(*) FILTER (WHERE contype = 'u')
               || ' fk=' || count(*) FILTER (WHERE contype = 'f')
               || ' cascade=' || count(*) FILTER (WHERE contype = 'f' AND confdeltype = 'c'
                                                   AND confrelid = to_regclass('public.guest_booking_requests'))
          FROM pg_constraint WHERE conrelid = to_regclass('public.guest_clinical_intakes')),
       'check=8 unique=1 fk=2 cascade=1',
       CASE WHEN (SELECT 'check=' || count(*) FILTER (WHERE contype = 'c')
                         || ' unique=' || count(*) FILTER (WHERE contype = 'u')
                         || ' fk=' || count(*) FILTER (WHERE contype = 'f')
                         || ' cascade=' || count(*) FILTER (WHERE contype = 'f' AND confdeltype = 'c'
                                                             AND confrelid = to_regclass('public.guest_booking_requests'))
                    FROM pg_constraint WHERE conrelid = to_regclass('public.guest_clinical_intakes'))
               = 'check=8 unique=1 fk=2 cascade=1'
            THEN 'OK' ELSE 'FAIL' END;

-- tgtype 23 = ROW (1) + BEFORE (2) + INSERT (4) + UPDATE (16).
SELECT '8. the tenant-match trigger, enabled, BEFORE INSERT OR UPDATE',
       coalesce((SELECT string_agg(tgname || ':' || tgenabled::text || ':' || tgtype, ',' ORDER BY tgname)
                   FROM pg_trigger WHERE tgrelid = to_regclass('public.guest_clinical_intakes')
                    AND NOT tgisinternal), 'none'),
       'guest_clinical_intakes_tenant_matches:O:23',
       CASE WHEN (SELECT string_agg(tgname || ':' || tgenabled::text || ':' || tgtype, ',' ORDER BY tgname)
                    FROM pg_trigger WHERE tgrelid = to_regclass('public.guest_clinical_intakes')
                     AND NOT tgisinternal) = 'guest_clinical_intakes_tenant_matches:O:23'
            THEN 'OK' ELSE 'FAIL' END;

-- Exactly two policies, both SELECT (polcmd r), each for its one role. No
-- INSERT, UPDATE or DELETE policy exists for anybody.
SELECT '9. exactly two policies, both SELECT, one per reading role',
       (SELECT string_agg(p.polname || ':' || p.polcmd::text || ':'
                          || (SELECT string_agg(r.rolname, '+' ORDER BY r.rolname)
                                FROM pg_roles r WHERE r.oid = ANY (p.polroles)), ',' ORDER BY p.polname)
          FROM pg_policy p WHERE p.polrelid = to_regclass('public.guest_clinical_intakes')),
       'patient_select:r:patient, staff_select:r:authenticated',
       CASE WHEN (SELECT string_agg(p.polname || ':' || p.polcmd::text || ':'
                                    || (SELECT string_agg(r.rolname, '+' ORDER BY r.rolname)
                                          FROM pg_roles r WHERE r.oid = ANY (p.polroles)), ',' ORDER BY p.polname)
                    FROM pg_policy p WHERE p.polrelid = to_regclass('public.guest_clinical_intakes'))
               = 'guest_clinical_intakes_patient_select:r:patient,guest_clinical_intakes_staff_select:r:authenticated'
            THEN 'OK' ELSE 'FAIL' END;

-- md5 and length of the expression Postgres stores, measured on a database built
-- from this branch. A policy with the right name and a different body fails here.
SELECT '10. staff policy USING is exactly 0087''s (md5, length)',
       coalesce((SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                   FROM pg_policy WHERE polname = 'guest_clinical_intakes_staff_select'
                    AND polrelid = to_regclass('public.guest_clinical_intakes')), 'MISSING'),
       '7babbd8715f7e2369dccaa5f4c0cd872 630',
       CASE WHEN (SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                    FROM pg_policy WHERE polname = 'guest_clinical_intakes_staff_select'
                     AND polrelid = to_regclass('public.guest_clinical_intakes'))
               = '7babbd8715f7e2369dccaa5f4c0cd872 630'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. patient policy USING is exactly 0087''s (md5, length)',
       coalesce((SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                   FROM pg_policy WHERE polname = 'guest_clinical_intakes_patient_select'
                    AND polrelid = to_regclass('public.guest_clinical_intakes')), 'MISSING'),
       '2c24683c9c10b7ea2830024e5aa437ba 188',
       CASE WHEN (SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                    FROM pg_policy WHERE polname = 'guest_clinical_intakes_patient_select'
                     AND polrelid = to_regclass('public.guest_clinical_intakes'))
               = '2c24683c9c10b7ea2830024e5aa437ba 188'
            THEN 'OK' ELSE 'FAIL' END;

-- The privilege END STATE, read with has_table_privilege so a grant to PUBLIC
-- counts too (a named-role check cannot see one).
SELECT '12. table privileges: read-only for the readers, SELECT+INSERT for the writer',
       (SELECT string_agg(r || ':' || coalesce(
                 (SELECT string_agg(p, '+' ORDER BY p)
                    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
                   WHERE has_table_privilege(r, 'public.guest_clinical_intakes', p)), '-'), ',' ORDER BY r)
          FROM unnest(ARRAY['anon','authenticated','patient','service_role']) AS r),
       'anon:-,authenticated:SELECT,patient:SELECT,service_role:INSERT+SELECT',
       CASE WHEN (SELECT string_agg(r || ':' || coalesce(
                           (SELECT string_agg(p, '+' ORDER BY p)
                              FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
                             WHERE has_table_privilege(r, 'public.guest_clinical_intakes', p)), '-'), ',' ORDER BY r)
                    FROM unnest(ARRAY['anon','authenticated','patient','service_role']) AS r)
               = 'anon:-,authenticated:SELECT,patient:SELECT,service_role:INSERT+SELECT'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '13. purge: SECURITY DEFINER, owned by postgres, pinned path, NO app role executes',
       coalesce((SELECT p.prosecdef::text || ' ' || pg_get_userbyid(p.proowner) || ' '
                        || coalesce(array_to_string(p.proconfig, ';'), 'no-config') || ' exec:'
                        || coalesce((SELECT string_agg(r, '+' ORDER BY r)
                                       FROM unnest(ARRAY['anon','authenticated','patient','service_role']) AS r
                                      WHERE has_function_privilege(r, p.oid, 'EXECUTE')), 'none')
                   FROM pg_proc p WHERE p.oid = to_regprocedure('public.purge_expired_guest_intakes(uuid)')), 'MISSING'),
       'true postgres search_path=public exec:none',
       CASE WHEN (SELECT p.prosecdef::text || ' ' || pg_get_userbyid(p.proowner) || ' '
                         || coalesce(array_to_string(p.proconfig, ';'), 'no-config') || ' exec:'
                         || coalesce((SELECT string_agg(r, '+' ORDER BY r)
                                        FROM unnest(ARRAY['anon','authenticated','patient','service_role']) AS r
                                       WHERE has_function_privilege(r, p.oid, 'EXECUTE')), 'none')
                    FROM pg_proc p WHERE p.oid = to_regprocedure('public.purge_expired_guest_intakes(uuid)'))
               = 'true postgres search_path=public exec:none'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '14. patient_guest_request_ids: SECURITY DEFINER, postgres, STABLE, patient only',
       coalesce((SELECT p.prosecdef::text || ' ' || pg_get_userbyid(p.proowner) || ' ' || p.provolatile::text || ' '
                        || coalesce(array_to_string(p.proconfig, ';'), 'no-config') || ' exec:'
                        || coalesce((SELECT string_agg(r, '+' ORDER BY r)
                                       FROM unnest(ARRAY['anon','authenticated','patient','service_role']) AS r
                                      WHERE has_function_privilege(r, p.oid, 'EXECUTE')), 'none')
                   FROM pg_proc p WHERE p.oid = to_regprocedure('public.patient_guest_request_ids()')), 'MISSING'),
       'true postgres s search_path=public exec:patient',
       CASE WHEN (SELECT p.prosecdef::text || ' ' || pg_get_userbyid(p.proowner) || ' ' || p.provolatile::text || ' '
                         || coalesce(array_to_string(p.proconfig, ';'), 'no-config') || ' exec:'
                         || coalesce((SELECT string_agg(r, '+' ORDER BY r)
                                        FROM unnest(ARRAY['anon','authenticated','patient','service_role']) AS r
                                       WHERE has_function_privilege(r, p.oid, 'EXECUTE')), 'none')
                    FROM pg_proc p WHERE p.oid = to_regprocedure('public.patient_guest_request_ids()'))
               = 'true postgres s search_path=public exec:patient'
            THEN 'OK' ELSE 'FAIL' END;

-- THE TWO SENTENCES THE HEADER MAKES, READ BACK FROM THE DEPLOYED BODIES: the job
-- never reads converted_appointment_id, and nothing 0087 created writes a
-- contraindication.
SELECT '15. purge never names converted_appointment_id; no 0087 body names contraindication',
       (SELECT 'appointment_id:' || (pg_get_functiondef(to_regprocedure('public.purge_expired_guest_intakes(uuid)'))
                                     ILIKE '%converted_appointment_id%')::text
               || ' contraindication:' || count(*) FILTER (WHERE pg_get_functiondef(p.oid) ILIKE '%contraindication%')
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('patient_guest_request_ids', 'purge_expired_guest_intakes',
                             'guest_clinical_intake_tenant_matches')),
       'appointment_id:false contraindication:0',
       CASE WHEN (SELECT 'appointment_id:' || (pg_get_functiondef(to_regprocedure('public.purge_expired_guest_intakes(uuid)'))
                                               ILIKE '%converted_appointment_id%')::text
                         || ' contraindication:' || count(*) FILTER (WHERE pg_get_functiondef(p.oid) ILIKE '%contraindication%')
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public'
                     AND p.proname IN ('patient_guest_request_ids', 'purge_expired_guest_intakes',
                                       'guest_clinical_intake_tenant_matches'))
               = 'appointment_id:false contraindication:0'
            THEN 'OK' ELSE 'FAIL' END;

-- By DELTA, not through check-security-definer-owner.mjs: that script's constant
-- is summed with 0086's only when the two PRs merge, and a stale constant would
-- halt a correct apply.
SELECT '16. SECURITY DEFINER count grew by exactly two, all owned by postgres',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       (:'secdef_before'::int + 2)::text,
       CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.prosecdef) = :'secdef_before'::int + 2
             AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE n.nspname = 'public' AND p.prosecdef
                                AND pg_get_userbyid(p.proowner) <> 'postgres')
            THEN 'OK' ELSE 'FAIL' END;

-- At least as many as before: the apply deletes no request (the public form may
-- have added some since the pre-check, so "equal" would be the wrong claim).
SELECT '17. guest_booking_requests lost no row',
       (SELECT count(*)::text FROM public.guest_booking_requests),
       '>= ' || :'guest_requests_before',
       CASE WHEN (SELECT count(*) FROM public.guest_booking_requests) >= :'guest_requests_before'::int
            THEN 'OK' ELSE 'FAIL' END;

SELECT '18. nothing the arms created survived the rollback',
       ((SELECT count(*) FROM public.locations WHERE name = '0087 post-check B (rolled back)')
        + (SELECT count(*) FROM public.users WHERE email LIKE 'intake-0087-postcheck-%@example.invalid')
        + (SELECT count(*) FROM public.guest_booking_requests WHERE full_name = '0087 post-check (rolled back)')
        + (SELECT count(*) FROM public.audit_log WHERE action = 'guest_intake.purged'))::text,
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.locations WHERE name = '0087 post-check B (rolled back)')
             AND NOT EXISTS (SELECT 1 FROM public.users WHERE email LIKE 'intake-0087-postcheck-%@example.invalid')
             AND NOT EXISTS (SELECT 1 FROM public.guest_booking_requests WHERE full_name = '0087 post-check (rolled back)')
             AND NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'guest_intake.purged')
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END POST-CHECK. Any FAIL halts and is reported IMMEDIATELY. ==='

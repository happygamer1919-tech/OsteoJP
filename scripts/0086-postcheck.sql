-- ===================================================================
-- 0086 POST-CHECK. Run in STAGE 2 of docs/migration-apply-0086.md.
-- ===================================================================
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
--        -v journal_before=<J> -v users_before=<U> -v appointments_before=<A> \
--        -v clinics_before=<C> -v links_before=<K> \
--        -f scripts/0086-postcheck.sql 2>&1 | tee /tmp/0086-postcheck.out
--
-- SR-59: J, U, A, C and K come out of THIS RUN's pre-check transcript, parsed by
-- the stage, never typed.
--
-- EVERY VERDICT MUST READ OK, AND THE ARMS BLOCK MUST PRINT ITS NOTICE. Any FAIL,
-- or any ERROR, halts and is reported IMMEDIATELY (SR-50(c)): a half-applied
-- production schema does not wait for a report.
--
-- ===================================================================
-- THE ARMS RUN INSIDE ONE TRANSACTION THAT IS ROLLED BACK
-- ===================================================================
-- Production has no shared resource yet (0086 creates none; flagging NESA is the
-- owner's data step). So the arms build their own: two clinics, a therapist and a
-- colleague at the first, and a shared resource at the first. They borrow one
-- existing therapist ROLE and one existing PATIENT, and write nothing else.
-- `postgres` owns these tables and RLS is ENABLE, not FORCE, so the fixture rows
-- go in without claims. Then, as the fixture therapist through RLS (claims set,
-- role authenticated), six probes:
--
--   F1  shared_resource_practitioner_ids() returns EXACTLY the fixture resource
--   V2  the resource's appointment at the therapist's clinic is VISIBLE
--   V1  the resource's appointment at the OTHER clinic is INVISIBLE
--   V3  a colleague's own appointment at the same clinic stays INVISIBLE: the
--       widening is for shared resources, not for everyone at the clinic
--   W1  booking the resource at the therapist's clinic, on someone else's
--       behalf, is ADMITTED (so the created_by arm cannot be what admits it)
--   W2  the same at the other clinic is REFUSED 42501 by the policy
--
-- The whole block ends in ROLLBACK. A failed probe raises before the ROLLBACK,
-- which aborts the transaction and psql with it, so a failure writes nothing
-- either. Rows 12-15 below re-assert, after the rollback, that nothing was kept.
--
-- ===================================================================
-- ROWS 10 AND 11: THE POLICY IS EXACTLY WHAT THE MIGRATION SAYS
-- ===================================================================
-- md5 and length of the expression Postgres stores, captured on a database built
-- from this branch's migrations (941 characters, USING and WITH CHECK
-- identical). A policy with the right name and a different body fails here.

\pset pager off
\timing off

\echo ''
\echo '=== 0086 POST-CHECK: the arms first (one transaction, rolled back) ==='

BEGIN;

CREATE TEMP TABLE pc_fixture ON COMMIT DROP AS
WITH t AS (
  SELECT u.tenant_id, u.role_id
    FROM public.users u JOIN public.roles r ON r.id = u.role_id
   WHERE r.slug = 'therapist'
     AND EXISTS (SELECT 1 FROM public.patients p WHERE p.tenant_id = u.tenant_id)
   ORDER BY u.tenant_id, u.id
   LIMIT 1
)
SELECT t.tenant_id,
       t.role_id,
       (SELECT id FROM public.patients WHERE tenant_id = t.tenant_id ORDER BY id LIMIT 1) AS patient_id,
       gen_random_uuid() AS loc_a,
       gen_random_uuid() AS loc_b,
       gen_random_uuid() AS ther,
       gen_random_uuid() AS colleague,
       gen_random_uuid() AS res
  FROM t;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pc_fixture) THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): no therapist role with a patient in its tenant - the pre-check should have halted on row 16.';
  END IF;
END
$$;

INSERT INTO public.locations (id, tenant_id, name)
SELECT loc_a, tenant_id, 'NESA 0086 post-check A (rolled back)' FROM pc_fixture
UNION ALL
SELECT loc_b, tenant_id, 'NESA 0086 post-check B (rolled back)' FROM pc_fixture;

INSERT INTO public.users (id, tenant_id, role_id, email, full_name, is_bookable, is_shared_resource)
SELECT ther, tenant_id, role_id, 'nesa-0086-postcheck-ther@example.invalid',
       'NESA 0086 post-check therapist', true, false FROM pc_fixture
UNION ALL
SELECT colleague, tenant_id, role_id, 'nesa-0086-postcheck-colleague@example.invalid',
       'NESA 0086 post-check colleague', true, false FROM pc_fixture
UNION ALL
SELECT res, tenant_id, role_id, 'nesa-0086-postcheck-resource@example.invalid',
       'NESA 0086 post-check resource', true, true FROM pc_fixture;

-- All three at clinic A. Nobody is at clinic B.
INSERT INTO public.staff_locations (tenant_id, user_id, location_id)
SELECT tenant_id, res,       loc_a FROM pc_fixture
UNION ALL SELECT tenant_id, ther,      loc_a FROM pc_fixture
UNION ALL SELECT tenant_id, colleague, loc_a FROM pc_fixture;

-- Seeded as the table owner, before any claim is set.
INSERT INTO public.appointments
  (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
SELECT tenant_id, patient_id, res, loc_a, now() + interval '30 days', now() + interval '30 days 1 hour', 'scheduled'::appointment_status, res FROM pc_fixture
UNION ALL
SELECT tenant_id, patient_id, res, loc_b, now() + interval '31 days', now() + interval '31 days 1 hour', 'scheduled'::appointment_status, res FROM pc_fixture
UNION ALL
SELECT tenant_id, patient_id, colleague, loc_a, now() + interval '30 days', now() + interval '30 days 1 hour', 'scheduled'::appointment_status, colleague FROM pc_fixture;

CREATE TEMP TABLE pc_arm (probe text, outcome text) ON COMMIT DROP;
GRANT SELECT ON pc_fixture TO authenticated;
GRANT INSERT, SELECT ON pc_arm TO authenticated;

SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', f.tenant_id, 'user_role', 'therapist', 'sub', f.ther)::text,
         true) AS claims_set
  FROM pc_fixture f;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  f record;
  n int;
  ids uuid[];
BEGIN
  SELECT * INTO f FROM pc_fixture;

  ids := public.shared_resource_practitioner_ids();
  INSERT INTO pc_arm VALUES ('F1', CASE WHEN ids = ARRAY[f.res] THEN 'OK' ELSE 'GOT ' || coalesce(ids::text, 'null') END);

  SELECT count(*) INTO n FROM public.appointments WHERE practitioner_id = f.res AND location_id = f.loc_a;
  INSERT INTO pc_arm VALUES ('V2', CASE WHEN n = 1 THEN 'OK' ELSE 'SAW ' || n END);

  SELECT count(*) INTO n FROM public.appointments WHERE practitioner_id = f.res AND location_id = f.loc_b;
  INSERT INTO pc_arm VALUES ('V1', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END);

  SELECT count(*) INTO n FROM public.appointments WHERE practitioner_id = f.colleague;
  INSERT INTO pc_arm VALUES ('V3', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END);

  BEGIN
    INSERT INTO public.appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
    VALUES (f.tenant_id, f.patient_id, f.res, f.loc_a,
            now() + interval '32 days', now() + interval '32 days 1 hour', 'scheduled'::appointment_status, f.res);
    INSERT INTO pc_arm VALUES ('W1', 'OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pc_arm VALUES ('W1', 'REFUSED ' || SQLSTATE);
  END;

  BEGIN
    INSERT INTO public.appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
    VALUES (f.tenant_id, f.patient_id, f.res, f.loc_b,
            now() + interval '33 days', now() + interval '33 days 1 hour', 'scheduled'::appointment_status, f.res);
    INSERT INTO pc_arm VALUES ('W2', 'ADMITTED');
  EXCEPTION
    WHEN insufficient_privilege THEN INSERT INTO pc_arm VALUES ('W2', 'OK');
    WHEN OTHERS THEN INSERT INTO pc_arm VALUES ('W2', 'REFUSED ' || SQLSTATE || ', not 42501');
  END;
END
$$;

RESET ROLE;

DO $$
DECLARE
  ran int;
  bad text;
BEGIN
  SELECT count(*) INTO ran FROM pc_arm;
  SELECT string_agg(probe || '=' || outcome, ', ' ORDER BY probe) INTO bad FROM pc_arm WHERE outcome <> 'OK';
  IF ran <> 6 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): % probes ran, expected 6.', ran;
  END IF;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): %', bad;
  END IF;
  RAISE NOTICE 'ARMS F1 V1 V2 V3 W1 W2 OK: the function returned exactly the shared resource; its row at the therapist''s clinic was visible and bookable, its row at the other clinic invisible and refused 42501, and a colleague''s own row stayed invisible. Rolled back.';
END
$$;

ROLLBACK;

\echo ''
\echo '=== 0086 POST-CHECK: every row must read OK ==='

SELECT '1. journal = before + 1',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       (:'journal_before'::int + 1)::text,
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :'journal_before'::int + 1
            THEN 'OK' ELSE 'FAIL' END;

-- THE FILE APPLIED IS THE FILE APPROVED. The only row that proves it.
SELECT '2. 0086 present by sha256 of the approved file',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = 'd3eb9e41dff3f7ba6ccd0c250baf76198e60e884733e06043fcd9518bbac8d99')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. 0085 STILL present by file hash',
       coalesce((SELECT 'present' FROM drizzle.__drizzle_migrations
                 WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1' LIMIT 1), 'ABSENT'),
       'present',
       CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                         WHERE hash = '568ad2cfde381dc795059b70c09f4f4b6a6a49e2e678fd503c23d4edb0b9ead1')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. users.is_shared_resource is boolean NOT NULL DEFAULT false',
       coalesce((SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_shared_resource'), 'MISSING'),
       'boolean NO false',
       CASE WHEN (SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '<none>')
                    FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_shared_resource')
               = 'boolean NO false'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. users rows unchanged',
       (SELECT count(*)::text FROM public.users),
       :'users_before',
       CASE WHEN (SELECT count(*) FROM public.users) = :'users_before'::int
            THEN 'OK' ELSE 'FAIL' END;

-- 0086 creates no NESA row; flagging the resource is the owner's data step.
SELECT '6. no user is flagged is_shared_resource yet',
       (SELECT count(*)::text FROM public.users WHERE is_shared_resource),
       '0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE is_shared_resource)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. the function is STABLE SECURITY DEFINER, owned by postgres, search_path=public',
       coalesce((SELECT p.provolatile::text || ' ' || p.prosecdef::text || ' ' || pg_get_userbyid(p.proowner)
                        || ' ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'shared_resource_practitioner_ids'), 'MISSING'),
       's true postgres search_path=public',
       CASE WHEN (SELECT p.provolatile::text || ' ' || p.prosecdef::text || ' ' || pg_get_userbyid(p.proowner)
                         || ' ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'shared_resource_practitioner_ids')
               = 's true postgres search_path=public'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. authenticated may EXECUTE it',
       has_function_privilege('authenticated', 'public.shared_resource_practitioner_ids()', 'EXECUTE')::text,
       'true',
       CASE WHEN has_function_privilege('authenticated', 'public.shared_resource_practitioner_ids()', 'EXECUTE')
            THEN 'OK' ELSE 'FAIL' END;

-- A named REVOKE leaves PUBLIC's grant, and REVOKE FROM PUBLIC leaves a named
-- role's: so all four are asserted, PUBLIC through the ACL itself.
SELECT '9. anon, patient, service_role and PUBLIC may NOT execute it',
       ((SELECT count(*) FROM unnest(ARRAY['anon', 'patient', 'service_role']) r
          WHERE has_function_privilege(r, 'public.shared_resource_practitioner_ids()', 'EXECUTE'))
        + (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
            WHERE p.proname = 'shared_resource_practitioner_ids' AND a.grantee = 0))::text,
       '0',
       CASE WHEN (SELECT count(*) FROM unnest(ARRAY['anon', 'patient', 'service_role']) r
                   WHERE has_function_privilege(r, 'public.shared_resource_practitioner_ids()', 'EXECUTE'))
               + (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
                   WHERE p.proname = 'shared_resource_practitioner_ids' AND a.grantee = 0) = 0
            THEN 'OK' ELSE 'FAIL' END;

SELECT '10. appointments_rls USING is 0086''s (md5, length)',
       coalesce((SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                   FROM pg_policy WHERE polname = 'appointments_rls'
                    AND polrelid = 'public.appointments'::regclass), 'MISSING'),
       '22e128271c25d59ca149731cb04e55aa 941',
       CASE WHEN (SELECT md5(pg_get_expr(polqual, polrelid)) || ' ' || length(pg_get_expr(polqual, polrelid))
                    FROM pg_policy WHERE polname = 'appointments_rls'
                     AND polrelid = 'public.appointments'::regclass)
               = '22e128271c25d59ca149731cb04e55aa 941'
            THEN 'OK' ELSE 'FAIL' END;

SELECT '11. appointments_rls WITH CHECK is 0086''s (md5, length)',
       coalesce((SELECT md5(pg_get_expr(polwithcheck, polrelid)) || ' ' || length(pg_get_expr(polwithcheck, polrelid))
                   FROM pg_policy WHERE polname = 'appointments_rls'
                    AND polrelid = 'public.appointments'::regclass), 'MISSING'),
       '22e128271c25d59ca149731cb04e55aa 941',
       CASE WHEN (SELECT md5(pg_get_expr(polwithcheck, polrelid)) || ' ' || length(pg_get_expr(polwithcheck, polrelid))
                    FROM pg_policy WHERE polname = 'appointments_rls'
                     AND polrelid = 'public.appointments'::regclass)
               = '22e128271c25d59ca149731cb04e55aa 941'
            THEN 'OK' ELSE 'FAIL' END;

-- THE ARMS KEPT NOTHING.
SELECT '12. appointments rows unchanged',
       (SELECT count(*)::text FROM public.appointments),
       :'appointments_before',
       CASE WHEN (SELECT count(*) FROM public.appointments) = :'appointments_before'::int
            THEN 'OK' ELSE 'FAIL' END;

SELECT '13. clinics unchanged',
       (SELECT count(*)::text FROM public.locations),
       :'clinics_before',
       CASE WHEN (SELECT count(*) FROM public.locations) = :'clinics_before'::int
            THEN 'OK' ELSE 'FAIL' END;

SELECT '14. staff_locations unchanged',
       (SELECT count(*)::text FROM public.staff_locations),
       :'links_before',
       CASE WHEN (SELECT count(*) FROM public.staff_locations) = :'links_before'::int
            THEN 'OK' ELSE 'FAIL' END;

SELECT '15. no post-check fixture row survived',
       ((SELECT count(*) FROM public.users WHERE email LIKE 'nesa-0086-postcheck-%')
        + (SELECT count(*) FROM public.locations WHERE name LIKE 'NESA 0086 post-check%'))::text,
       '0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE email LIKE 'nesa-0086-postcheck-%')
             AND NOT EXISTS (SELECT 1 FROM public.locations WHERE name LIKE 'NESA 0086 post-check%')
            THEN 'OK' ELSE 'FAIL' END;

\echo ''
\echo '=== END POST-CHECK. Any FAIL, or a missing ARMS notice, halts. ==='

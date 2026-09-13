-- 0088 POST-CHECK. Card MIG-0088-nesa-second-participant-visible-to-cb-therapists.
--
-- Run by stage 2 of docs/migration-apply-0088.md, AFTER the apply, with three carries from
-- THIS sitting's pre-check transcript (SR-59):
--   -v journal_before=<row 1>  -v policies_before=<row 11>  -v secdef_before=<row 12>
--
-- EVERY VERDICT MUST READ OK (exactly 9), AND THE ARMS BLOCK MUST PRINT ITS NOTICE.
--
-- THE ARMS RUN INSIDE ONE TRANSACTION THAT IS ROLLED BACK. They borrow one tenant, build two
-- clinics, a machine flagged as a shared resource, four therapists, a patient and two
-- bookings, then read and write as `authenticated` with therapist and owner claims. Nothing
-- they create survives: verdict row 9 counts it.

\pset pager off
\timing off

\echo ''
\echo '=== 0088 POST-CHECK: the arms first (one transaction, rolled back) ==='

BEGIN;

CREATE TEMP TABLE pc_fixture ON COMMIT DROP AS
SELECT (SELECT id FROM public.tenants ORDER BY id LIMIT 1) AS tenant_id,
       gen_random_uuid() AS loc_cb,
       gen_random_uuid() AS loc_lv,
       gen_random_uuid() AS machine,
       gen_random_uuid() AS booker,
       gen_random_uuid() AS colleague,
       gen_random_uuid() AS lv_therapist,
       gen_random_uuid() AS person,
       gen_random_uuid() AS patient,
       gen_random_uuid() AS a_machine,
       gen_random_uuid() AS a_person;

DO $$
BEGIN
  IF (SELECT tenant_id FROM pc_fixture) IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): no tenant to borrow';
  END IF;
END
$$;

INSERT INTO public.locations (id, tenant_id, name)
SELECT loc_cb, tenant_id, '0088 post-check CB (rolled back)' FROM pc_fixture
UNION ALL
SELECT loc_lv, tenant_id, '0088 post-check LV (rolled back)' FROM pc_fixture;

INSERT INTO public.users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
SELECT machine, tenant_id, '0088-postcheck-' || machine || '@example.invalid', '0088 post-check machine', true, false, true FROM pc_fixture
UNION ALL
SELECT booker, tenant_id, '0088-postcheck-' || booker || '@example.invalid', '0088 post-check booker', true, true, false FROM pc_fixture
UNION ALL
SELECT colleague, tenant_id, '0088-postcheck-' || colleague || '@example.invalid', '0088 post-check colleague', true, true, false FROM pc_fixture
UNION ALL
SELECT lv_therapist, tenant_id, '0088-postcheck-' || lv_therapist || '@example.invalid', '0088 post-check lv', true, true, false FROM pc_fixture
UNION ALL
SELECT person, tenant_id, '0088-postcheck-' || person || '@example.invalid', '0088 post-check person', true, true, false FROM pc_fixture;

INSERT INTO public.staff_locations (tenant_id, user_id, location_id)
SELECT tenant_id, machine, loc_cb FROM pc_fixture
UNION ALL SELECT tenant_id, booker, loc_cb FROM pc_fixture
UNION ALL SELECT tenant_id, colleague, loc_cb FROM pc_fixture
UNION ALL SELECT tenant_id, person, loc_cb FROM pc_fixture
UNION ALL SELECT tenant_id, lv_therapist, loc_lv FROM pc_fixture;

INSERT INTO public.patients (id, tenant_id, full_name)
SELECT patient, tenant_id, '0088 post-check patient (rolled back)' FROM pc_fixture;

INSERT INTO public.appointments
  (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at, status, room)
SELECT a_machine, tenant_id, patient, booker, machine, loc_cb,
       now() + interval '400 days', now() + interval '400 days 45 minutes', 'scheduled', NULL FROM pc_fixture
UNION ALL
SELECT a_person, tenant_id, patient, booker, person, loc_cb,
       now() + interval '400 days 2 hours', now() + interval '400 days 2 hours 45 minutes', 'scheduled', NULL FROM pc_fixture;

CREATE TEMP TABLE pc_arm (probe text, outcome text) ON COMMIT DROP;
GRANT SELECT ON pc_fixture TO authenticated;
GRANT INSERT, SELECT ON pc_arm TO authenticated;

-- V1: the CB colleague READS the booking with the machine as Terapeuta 2.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'therapist', 'sub', colleague)::text,
         true) IS NOT NULL AS v1_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'V1', CASE WHEN n = 1 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.appointments a JOIN pc_fixture f ON a.id = f.a_machine) x;

-- V2, V3: the same colleague can neither change nor remove it (0 rows, no error).
DO $$
DECLARE
  f record;
  n int;
BEGIN
  SELECT * INTO f FROM pc_fixture;
  UPDATE public.appointments SET room = '0088-post-check' WHERE id = f.a_machine;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO pc_arm VALUES ('V2', CASE WHEN n = 0 THEN 'OK' ELSE 'UPDATED ' || n END);
  DELETE FROM public.appointments WHERE id = f.a_machine;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO pc_arm VALUES ('V3', CASE WHEN n = 0 THEN 'OK' ELSE 'DELETED ' || n END);
END
$$;

-- V4: the colleague cannot read a PERSON's Terapeuta 2 booking.
INSERT INTO pc_arm
SELECT 'V4', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.appointments a JOIN pc_fixture f ON a.id = f.a_person) x;
RESET ROLE;

-- V5: a therapist at the OTHER clinic reads nothing.
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'therapist', 'sub', lv_therapist)::text,
         true) IS NOT NULL AS v5_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'V5', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.appointments a JOIN pc_fixture f ON a.id = f.a_machine) x;
RESET ROLE;

-- V6: with the machine UNFLAGGED, the colleague reads nothing (the flag is what grants it).
UPDATE public.users SET is_shared_resource = false WHERE id = (SELECT machine FROM pc_fixture);
SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', tenant_id, 'user_role', 'therapist', 'sub', colleague)::text,
         true) IS NOT NULL AS v6_claims_set
  FROM pc_fixture;
SET LOCAL ROLE authenticated;
INSERT INTO pc_arm
SELECT 'V6', CASE WHEN n = 0 THEN 'OK' ELSE 'SAW ' || n END
  FROM (SELECT count(*) AS n FROM public.appointments a JOIN pc_fixture f ON a.id = f.a_machine) x;
RESET ROLE;

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
  IF ran <> 6 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED (arms): % of 6 probes ran', ran;
  END IF;
  RAISE NOTICE 'ARMS V1 V2 V3 V4 V5 V6 OK';
END
$$;

ROLLBACK;

\echo ''
\echo '=== 0088 POST-CHECK - every row must read OK ==='

SELECT '1. the journal grew by exactly one',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations),
       '= ' || (:journal_before + 1),
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations) = :journal_before + 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '2. 0088 sha256 is present',
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations
         WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56'),
       '= 1',
       CASE WHEN (SELECT count(*) FROM drizzle.__drizzle_migrations
                   WHERE hash = 'e9217cc59ddfffced403d876c473908639b9a2df5726173f18ba1ced5dc2ea56') = 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '3. the newest journal when is 0088''s',
       (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations),
       '= 1788201200000',
       CASE WHEN (SELECT max(created_at) FROM drizzle.__drizzle_migrations) = 1788201200000
            THEN 'OK' ELSE 'FAIL' END;

SELECT '4. the policy: PERMISSIVE, SELECT, TO authenticated, no WITH CHECK',
       coalesce((SELECT permissive || ' ' || cmd || ' ' || roles::text || ' ' || coalesce(with_check, '(none)')
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'appointments'
                    AND policyname = 'appointments_shared_resource_second_participant_select'), 'ABSENT'),
       'PERMISSIVE SELECT {authenticated} (none)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'appointments'
                            AND policyname = 'appointments_shared_resource_second_participant_select'
                            AND permissive = 'PERMISSIVE' AND cmd = 'SELECT'
                            AND roles::text = '{authenticated}' AND with_check IS NULL)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '5. the policy expression, by md5 and length (measured on a database built from this branch)',
       coalesce((SELECT md5(qual) || ' ' || length(qual) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'appointments'
                    AND policyname = 'appointments_shared_resource_second_participant_select'), 'ABSENT'),
       'ef838bdfe9249f41ef5621909d37e383 359',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'appointments'
                            AND policyname = 'appointments_shared_resource_second_participant_select'
                            AND md5(qual) = 'ef838bdfe9249f41ef5621909d37e383' AND length(qual) = 359)
            THEN 'OK' ELSE 'FAIL' END;

SELECT '6. appointments_rls is untouched (both halves)',
       coalesce((SELECT md5(qual) || ' ' || md5(with_check) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'appointments_rls'), 'ABSENT'),
       '22e128271c25d59ca149731cb04e55aa x2',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'appointments_rls'
                            AND md5(qual) = '22e128271c25d59ca149731cb04e55aa'
                            AND md5(with_check) = '22e128271c25d59ca149731cb04e55aa')
            THEN 'OK' ELSE 'FAIL' END;

SELECT '7. appointments carries exactly one more policy',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments'),
       '= ' || (:policies_before + 1),
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments')
                 = :policies_before + 1
            THEN 'OK' ELSE 'FAIL' END;

SELECT '8. no SECURITY DEFINER function was added',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef),
       '= ' || :secdef_before,
       CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.prosecdef) = :secdef_before
            THEN 'OK' ELSE 'FAIL' END;

SELECT '9. nothing the arms created survived the rollback',
       ((SELECT count(*) FROM public.users WHERE full_name LIKE '0088 post-check%')
        + (SELECT count(*) FROM public.locations WHERE name LIKE '0088 post-check%')
        + (SELECT count(*) FROM public.patients WHERE full_name LIKE '0088 post-check%'))::text,
       '= 0',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE full_name LIKE '0088 post-check%')
             AND NOT EXISTS (SELECT 1 FROM public.locations WHERE name LIKE '0088 post-check%')
             AND NOT EXISTS (SELECT 1 FROM public.patients WHERE full_name LIKE '0088 post-check%')
            THEN 'OK' ELSE 'FAIL' END;

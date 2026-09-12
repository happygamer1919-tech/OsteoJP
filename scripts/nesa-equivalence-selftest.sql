-- ===================================================================
-- SELF-TEST FOR scripts/nesa-equivalence.sql. LANE DATABASE ONLY.
-- ===================================================================
-- IT WRITES, AND EVERYTHING IT WRITES IS ROLLED BACK. The whole file is one
-- transaction ending in ROLLBACK, so nothing survives it - including the
-- pending migration, which the POLICY ARM applies inside that transaction. It
-- must NEVER be pointed at production: it refuses to run there (see the guard
-- below), but the rule is the operator's, not the script's.
--
-- ===================================================================
-- WHY A GATE NEEDS ITS OWN NEGATIVE ARM
-- ===================================================================
-- Run against production as it stands, nesa-equivalence.sql reports
-- `loosened 0, tightened 0, INERT` - which is the true answer, because no
-- shared-resource row exists yet. But a gate that has only ever printed zeroes
-- has not been shown to be capable of printing anything else. A counter that is
-- broken and a counter that is correctly zero look identical, and the one time
-- it matters is the run where it should NOT be zero.
--
-- So this seeds the situation the policy change is FOR, runs the same three
-- counters over it, and asserts they move - and only where they should:
--
--   A. a therapist and a shared resource assigned to the SAME location, with an
--      appointment on the resource created by RECEPTION
--        -> must be LOOSENED (this is the whole requirement), and it must be the
--           ONLY row that is
--   B. the same resource, an appointment recorded at a DIFFERENT location
--        -> must NOT be loosened. Until 2026-09-10 the ruled predicate scoped by
--           where the RESOURCE is and this row leaked (loosened 2,
--           outside_expected 1, HALT). Strategy then ruled the criterion wins
--           and the disjunct gained the APPOINTMENT's own location test, so this
--           row is now the overshoot that must stay closed.
--   C. a therapist at a DIFFERENT location entirely
--        -> must be UNCHANGED. This is "LV is unaffected", measured.
--   D. every non-therapist principal
--        -> must be UNCHANGED.
--   E. nobody loses a row.
--
-- ===================================================================
-- AND THE POLICY ARM, BECAUSE A-E MEASURE A RESTATED PREDICATE
-- ===================================================================
-- A-E compare two expressions written out in this file. They prove the
-- ARITHMETIC of the widening, not that the migration's own text does it. So the
-- last section applies packages/db/migrations/0086_nesa_shared_resource.sql
-- inside this transaction, flags the fixture resource, and exercises the REAL
-- appointments_rls through RLS as the therapist: an INSERT with no RETURNING, so
-- WITH CHECK is the only thing judged (a RETURNING would drag the SELECT policy
-- in - SR-60).
--
-- It also runs one probe BEFORE the migration and AFTER it, and reports it
-- separately rather than as a verdict: a therapist INSERT that stamps
-- created_by = the therapist. 0078's `created_by = auth.uid()` arm admits that
-- row at ANY location in the tenant, today, and this migration does not touch
-- that arm. It is printed so the residual is measured instead of asserted away.
-- ===================================================================

\pset pager off
\pset format aligned
\set ON_ERROR_STOP on

-- REFUSE A PRODUCTION HOST. `current_database()` is the same everywhere, so the
-- discriminator is the row count: production carries tens of thousands of
-- appointments and a lane carries dozens. A wrong guess here writes to a real
-- clinic's database, so it errors rather than warns.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.appointments) > 1000 THEN
    RAISE EXCEPTION
      'nesa-equivalence-selftest: this database has % appointments and looks like production. '
      'This file WRITES (and rolls back). Run it on a lane database only.',
      (SELECT count(*) FROM public.appointments);
  END IF;
END
$$;

BEGIN;

/* ---------------------------------------------------------------- seed -- */

-- ONE TENANT FOR EVERY FIXTURE ROW. The policy arm inserts through RLS as the
-- therapist, so the appointment's tenant must be the therapist's JWT tenant; a
-- fixture that picked "the first location" across tenants would be refused on
-- tenant grounds and read as a location refusal. The tenant is the first one
-- that can host the whole scenario.
CREATE TEMP TABLE fixture ON COMMIT DROP AS
WITH t AS (
  SELECT u.tenant_id
    FROM public.users u JOIN public.roles r ON r.id = u.role_id
   WHERE r.slug = 'therapist'
     AND (SELECT count(*) FROM public.locations l WHERE l.tenant_id = u.tenant_id) >= 2
     AND EXISTS (SELECT 1 FROM public.users u2 JOIN public.roles r2 ON r2.id = u2.role_id
                  WHERE r2.slug = 'reception' AND u2.tenant_id = u.tenant_id)
     AND EXISTS (SELECT 1 FROM public.patients p WHERE p.tenant_id = u.tenant_id)
   GROUP BY u.tenant_id
  HAVING count(*) >= 2
   ORDER BY u.tenant_id
   LIMIT 1
)
SELECT
  t.tenant_id,
  (SELECT id FROM public.locations WHERE tenant_id = t.tenant_id ORDER BY id LIMIT 1)          AS loc_a,
  (SELECT id FROM public.locations WHERE tenant_id = t.tenant_id ORDER BY id OFFSET 1 LIMIT 1) AS loc_b,
  (SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
    WHERE r.slug = 'therapist' AND u.tenant_id = t.tenant_id ORDER BY u.id LIMIT 1)          AS ther_a,
  (SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
    WHERE r.slug = 'therapist' AND u.tenant_id = t.tenant_id ORDER BY u.id OFFSET 1 LIMIT 1) AS ther_b,
  (SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
    WHERE r.slug = 'reception' AND u.tenant_id = t.tenant_id ORDER BY u.id LIMIT 1)          AS recep,
  (SELECT id FROM public.patients WHERE tenant_id = t.tenant_id ORDER BY id LIMIT 1)          AS patient_id,
  gen_random_uuid()                                                                          AS resource_id
FROM t;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fixture) THEN
    RAISE EXCEPTION 'nesa-equivalence-selftest: no tenant on this lane has 2 therapists, 2 locations, a receptionist and a patient. Seed the lane first.';
  END IF;
END
$$;

\echo '=== FIXTURE (loc_a plays CB, where the resource lives; loc_b plays LV) ==='
SELECT f.tenant_id,
       f.loc_a, (SELECT name FROM public.locations WHERE id = f.loc_a) AS loc_a_name,
       f.loc_b, (SELECT name FROM public.locations WHERE id = f.loc_b) AS loc_b_name,
       f.ther_a, f.ther_b, f.recep
  FROM fixture f;

-- The resource. A login-less staff row: users.id has NO foreign key to
-- auth.users (spec section 1), which is what makes NESA insertable at all.
INSERT INTO public.users (id, tenant_id, role_id, email, full_name, is_bookable)
SELECT f.resource_id, f.tenant_id,
       -- The role the THERAPIST FIXTURE already holds, rather than a lookup by
       -- slug: `roles` is per-tenant in some databases and a bare slug lookup
       -- returns more than one row.
       (SELECT role_id FROM public.users WHERE id = f.ther_a),
       'nesa-selftest@example.invalid', 'NESA (self-test resource)', true
  FROM fixture f;

-- THER_A and the resource share LOC_A. THER_B is at LOC_B and must not move.
INSERT INTO public.staff_locations (tenant_id, user_id, location_id)
SELECT f.tenant_id, f.resource_id, f.loc_a FROM fixture f
UNION ALL SELECT f.tenant_id, f.ther_a, f.loc_a FROM fixture f
UNION ALL SELECT f.tenant_id, f.ther_b, f.loc_b FROM fixture f;

-- A: the requirement. Reception books the resource at LOC_A. Today THER_A
-- cannot see this row - no arm of the policy reaches it.
INSERT INTO public.appointments
  (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
SELECT f.tenant_id, f.patient_id, f.resource_id, f.loc_a,
       now() + interval '3 days', now() + interval '3 days 1 hour', 'scheduled', f.recep
  FROM fixture f;

-- B: the overshoot. Same resource, recorded at LOC_B. Must stay invisible to
-- THER_A, who is not assigned to LOC_B.
INSERT INTO public.appointments
  (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
SELECT f.tenant_id, f.patient_id, f.resource_id, f.loc_b,
       now() + interval '4 days', now() + interval '4 days 1 hour', 'scheduled', f.recep
  FROM fixture f;

/* ------------------------------------------------------------- measure -- */

SELECT set_config('nesa.resource_ids', '{' || (SELECT resource_id FROM fixture) || '}', false)
  AS resource_ids_set;

CREATE TEMP TABLE nesa_equiv (
  user_id uuid, role_slug text, assigned_locations int,
  resources_visible_to_viewer int,
  rows_total bigint, old_visible bigint, new_visible bigint,
  loosened_rows bigint, tightened_rows bigint,
  loosened_outside_expected bigint, expected_still_invisible bigint
) ON COMMIT DROP;

-- The measurement body is character-identical to nesa-equivalence.sql's. It is
-- restated rather than \i-ed because that file also creates its own temp table
-- and prints its own report; only the loop is wanted here.
DO $$
DECLARE
  u record;
  c jsonb;
  res uuid[];
  supplied uuid[] := current_setting('nesa.resource_ids', true)::uuid[];
BEGIN
  FOR u IN
    SELECT usr.id, usr.tenant_id, r.slug,
           (SELECT count(*) FROM public.staff_locations sl WHERE sl.user_id = usr.id) AS locs
      FROM public.users usr JOIN public.roles r ON r.id = usr.role_id
     ORDER BY r.slug, usr.id
  LOOP
    c := jsonb_build_object('tenant_id', u.tenant_id, 'user_role', u.slug, 'sub', u.id);
    PERFORM set_config('request.jwt.claims', c::text, true);

    SELECT coalesce(array_agg(DISTINCT sl.user_id), '{}'::uuid[])
      INTO res
      FROM public.staff_locations sl
     WHERE sl.user_id = ANY (coalesce(supplied, '{}'::uuid[]))
       AND sl.tenant_id = u.tenant_id
       AND sl.location_id = ANY (public.viewer_location_ids());

    INSERT INTO nesa_equiv
    SELECT u.id, u.slug, u.locs, cardinality(res), count(*),
           count(*) FILTER (WHERE old_ok),
           count(*) FILTER (WHERE new_ok),
           count(*) FILTER (WHERE new_ok AND NOT old_ok),
           count(*) FILTER (WHERE old_ok AND NOT new_ok),
           count(*) FILTER (WHERE new_ok AND NOT old_ok AND NOT expected),
           count(*) FILTER (WHERE expected AND NOT new_ok)
      FROM (
        SELECT
          ((a.tenant_id = (SELECT public.jwt_tenant_id()))
           AND ((a.created_by = (SELECT auth.uid()))
                OR ((SELECT public.jwt_role()) = 'owner')
                OR (((SELECT public.jwt_role()) = 'therapist')
                    AND ((a.practitioner_id = (SELECT auth.uid()))
                         OR (a.practitioner_2_id = (SELECT auth.uid()))))
                OR (((SELECT public.jwt_role()) = ANY (ARRAY['admin','reception']))
                    AND ((NOT (SELECT public.viewer_has_location_assignment()))
                         OR ((a.location_id IS NOT NULL)
                             AND (a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))))))))
          IS TRUE AS old_ok,
          ((a.tenant_id = (SELECT public.jwt_tenant_id()))
           AND ((a.created_by = (SELECT auth.uid()))
                OR ((SELECT public.jwt_role()) = 'owner')
                OR (((SELECT public.jwt_role()) = 'therapist')
                    AND ((a.practitioner_id = (SELECT auth.uid()))
                         OR (a.practitioner_2_id = (SELECT auth.uid()))))
                OR (((SELECT public.jwt_role()) = 'therapist')
                    AND (a.practitioner_id = ANY (coalesce(res, '{}'::uuid[])))
                    AND (a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))))
                OR (((SELECT public.jwt_role()) = ANY (ARRAY['admin','reception']))
                    AND ((NOT (SELECT public.viewer_has_location_assignment()))
                         OR ((a.location_id IS NOT NULL)
                             AND (a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))))))))
          IS TRUE AS new_ok,
          (((SELECT public.jwt_role()) = 'therapist')
           AND (a.tenant_id = (SELECT public.jwt_tenant_id()))
           AND (a.practitioner_id = ANY (coalesce(res, '{}'::uuid[])))
           AND (a.location_id IS NOT NULL)
           AND (a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))))
          IS TRUE AS expected
        FROM public.appointments a
      ) t;
  END LOOP;
END
$$;

/* -------------------------------------------------------------- assert -- */

\echo ''
\echo '=== THE THERAPIST WHO SHARES A LOCATION WITH THE RESOURCE ==='
SELECT loosened_rows, loosened_outside_expected, tightened_rows, expected_still_invisible
  FROM nesa_equiv WHERE user_id = (SELECT ther_a FROM fixture);

\echo ''
\echo '=== THE THERAPIST AT THE OTHER LOCATION - must be all zero ==='
SELECT loosened_rows, loosened_outside_expected, tightened_rows, expected_still_invisible
  FROM nesa_equiv WHERE user_id = (SELECT ther_b FROM fixture);

\echo ''
\echo '=== VERDICTS (restated predicate) ==='
SELECT
  CASE WHEN (SELECT loosened_rows FROM nesa_equiv WHERE user_id = (SELECT ther_a FROM fixture)) = 1
        AND (SELECT expected_still_invisible FROM nesa_equiv WHERE user_id = (SELECT ther_a FROM fixture)) = 0
       THEN 'PASS' ELSE 'FAIL' END
    AS "A: the sharing therapist gains exactly the ONE row at its location",
  CASE WHEN (SELECT loosened_outside_expected FROM nesa_equiv WHERE user_id = (SELECT ther_a FROM fixture)) = 0
       THEN 'PASS' ELSE 'FAIL' END
    AS "B: the row recorded at the other location is NOT gained",
  CASE WHEN (SELECT coalesce(sum(loosened_rows + tightened_rows), 0) FROM nesa_equiv
              WHERE user_id = (SELECT ther_b FROM fixture)) = 0
       THEN 'PASS' ELSE 'FAIL' END
    AS "C: the other location is untouched",
  CASE WHEN (SELECT coalesce(sum(loosened_rows + tightened_rows), 0) FROM nesa_equiv
              WHERE role_slug <> 'therapist') = 0
       THEN 'PASS' ELSE 'FAIL' END
    AS "D: no non-therapist principal moves",
  CASE WHEN (SELECT coalesce(sum(tightened_rows), 0) FROM nesa_equiv) = 0
       THEN 'PASS' ELSE 'FAIL' END
    AS "E: nobody loses a row";

/* ---------------------------------------------------- the real policy -- */

CREATE TEMP TABLE policy_arm (probe text, stage text, created_by_is text, outcome text) ON COMMIT DROP;
GRANT SELECT ON fixture TO authenticated;
GRANT INSERT, SELECT ON policy_arm TO authenticated;

SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', f.tenant_id, 'user_role', 'therapist', 'sub', f.ther_a)::text,
         true) AS claims_set
  FROM fixture f;

-- THE RESIDUAL, BEFORE. As the therapist, stamping created_by = self, at LOC_B.
SET LOCAL ROLE authenticated;
DO $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM fixture;
  BEGIN
    INSERT INTO public.appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
    VALUES (f.tenant_id, f.patient_id, f.resource_id, f.loc_b,
            now() + interval '8 days', now() + interval '8 days 1 hour', 'scheduled', f.ther_a);
    INSERT INTO policy_arm VALUES ('R  NESA at the OTHER location', 'before', 'the therapist', 'ADMITTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO policy_arm VALUES ('R  NESA at the OTHER location', 'before', 'the therapist',
                                   'REFUSED ' || SQLSTATE || ': ' || SQLERRM);
  END;
END
$$;
RESET ROLE;

\echo ''
-- 0086 IS APPLIED HERE EVEN WHERE IT ALREADY IS. Since the promotion (2026-09-11) a
-- database built from supabase/migrations - CI, and any lane reset after it - already
-- carries 0086. Every statement in it is idempotent (ADD COLUMN IF NOT EXISTS, CREATE
-- OR REPLACE, ALTER POLICY, REVOKE/GRANT, COMMENT), so re-applying it inside this
-- transaction is harmless. But on such a database the R 'before' row above was measured
-- against the NEW policy, so it is not a before. The before/after comparison means
-- something only on a pre-0086 database, which is what production is until the apply.
\echo '=== APPLYING 0086 INSIDE THIS TRANSACTION (rolled back below) ==='
\ir ../packages/db/migrations/0086_nesa_shared_resource.sql
UPDATE public.users SET is_shared_resource = true WHERE id = (SELECT resource_id FROM fixture);

SELECT set_config('request.jwt.claims',
         json_build_object('tenant_id', f.tenant_id, 'user_role', 'therapist', 'sub', f.ther_a)::text,
         true) AS claims_set
  FROM fixture f;

SET LOCAL ROLE authenticated;
DO $$
DECLARE f record; n int;
BEGIN
  SELECT * INTO f FROM fixture;

  -- W1. THE REQUIREMENT: NESA at the therapist's OWN location, booked on
  -- somebody else's behalf, so the created_by arm cannot be what admits it.
  BEGIN
    INSERT INTO public.appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
    VALUES (f.tenant_id, f.patient_id, f.resource_id, f.loc_a,
            now() + interval '5 days', now() + interval '5 days 1 hour', 'scheduled', f.recep);
    INSERT INTO policy_arm VALUES ('W1 NESA at the therapist''s OWN location', 'after', 'reception', 'ADMITTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO policy_arm VALUES ('W1 NESA at the therapist''s OWN location', 'after', 'reception',
                                   'REFUSED ' || SQLSTATE || ': ' || SQLERRM);
  END;

  -- W2. THE OVERSHOOT WRITE: the same, at the OTHER location. The new disjunct
  -- must not admit it.
  BEGIN
    INSERT INTO public.appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
    VALUES (f.tenant_id, f.patient_id, f.resource_id, f.loc_b,
            now() + interval '6 days', now() + interval '6 days 1 hour', 'scheduled', f.recep);
    INSERT INTO policy_arm VALUES ('W2 NESA at the OTHER location', 'after', 'reception', 'ADMITTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO policy_arm VALUES ('W2 NESA at the OTHER location', 'after', 'reception',
                                   'REFUSED ' || SQLSTATE || ': ' || SQLERRM);
  END;

  -- R, AFTER. The residual probe again, unchanged in every respect but the stage.
  BEGIN
    INSERT INTO public.appointments
      (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
    VALUES (f.tenant_id, f.patient_id, f.resource_id, f.loc_b,
            now() + interval '7 days', now() + interval '7 days 1 hour', 'scheduled', f.ther_a);
    INSERT INTO policy_arm VALUES ('R  NESA at the OTHER location', 'after', 'the therapist', 'ADMITTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO policy_arm VALUES ('R  NESA at the OTHER location', 'after', 'the therapist',
                                   'REFUSED ' || SQLSTATE || ': ' || SQLERRM);
  END;

  -- V1. READ through USING: the seeded row B, which reception created at LOC_B.
  SELECT count(*) INTO n FROM public.appointments
   WHERE practitioner_id = f.resource_id AND location_id = f.loc_b AND created_by = f.recep;
  INSERT INTO policy_arm VALUES ('V1 reception''s NESA row at the OTHER location', 'after', 'reception',
                                 CASE WHEN n = 0 THEN 'INVISIBLE' ELSE 'VISIBLE (' || n || ')' END);

  -- V2. And row A at LOC_B's counterpart, which the change is FOR.
  SELECT count(*) INTO n FROM public.appointments
   WHERE practitioner_id = f.resource_id AND location_id = f.loc_a AND created_by = f.recep;
  INSERT INTO policy_arm VALUES ('V2 reception''s NESA rows at the OWN location', 'after', 'reception',
                                 CASE WHEN n = 0 THEN 'INVISIBLE' ELSE 'VISIBLE (' || n || ')' END);
END
$$;
RESET ROLE;

\echo ''
\echo '=== THE REAL POLICY, AS THE THERAPIST AT loc_a ==='
SELECT probe, stage, created_by_is, outcome FROM policy_arm ORDER BY probe, stage DESC;

\echo ''
\echo '=== VERDICTS (real policy) ==='
SELECT
  CASE WHEN (SELECT outcome FROM policy_arm WHERE probe LIKE 'W1%') = 'ADMITTED'
       THEN 'PASS' ELSE 'FAIL' END
    AS "W1: a CB therapist CAN create a NESA appointment at CB",
  CASE WHEN (SELECT outcome FROM policy_arm WHERE probe LIKE 'W2%') LIKE 'REFUSED 42501%'
       THEN 'PASS' ELSE 'FAIL' END
    AS "W2: the new disjunct does NOT admit a NESA appointment at LV",
  CASE WHEN (SELECT outcome FROM policy_arm WHERE probe LIKE 'V1%') = 'INVISIBLE'
       THEN 'PASS' ELSE 'FAIL' END
    AS "V1: the NESA row at LV is not readable",
  CASE WHEN (SELECT outcome FROM policy_arm WHERE probe LIKE 'R%' AND stage = 'before')
          = (SELECT outcome FROM policy_arm WHERE probe LIKE 'R%' AND stage = 'after')
       THEN 'UNCHANGED BY THIS MIGRATION' ELSE 'CHANGED - investigate' END
    AS "R: 0078's created_by arm, before vs after (reported, not a verdict)";

ROLLBACK;

\echo ''
\echo '=== ROLLED BACK. Nothing above was kept, the migration included. ==='
SELECT count(*) AS nesa_selftest_rows_left
  FROM public.users WHERE email = 'nesa-selftest@example.invalid';
SELECT count(*) AS is_shared_resource_column_left
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_shared_resource';

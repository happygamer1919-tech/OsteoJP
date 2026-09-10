-- ===================================================================
-- SELF-TEST FOR scripts/nesa-equivalence.sql. LANE DATABASE ONLY.
-- ===================================================================
-- IT WRITES, AND EVERYTHING IT WRITES IS ROLLED BACK. The whole file is one
-- transaction ending in ROLLBACK, so nothing survives it. It must NEVER be
-- pointed at production: it refuses to run there (see the guard below), but the
-- rule is the operator's, not the script's.
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
-- counters over it, and asserts they move:
--
--   A. a therapist and a shared resource assigned to the SAME location, with an
--      appointment on the resource created by RECEPTION
--        -> must be LOOSENED (this is the whole requirement) and must be
--           inside `expected`
--   B. the same resource, an appointment recorded at a DIFFERENT location
--        -> the ruled predicate scopes by where the RESOURCE is, not by where
--           the APPOINTMENT is, so this is loosened AND OUTSIDE `expected`.
--           It is seeded on purpose: it is the one disagreement between the
--           ruled predicate and the dispatch's acceptance criterion, and this
--           file is how it is shown to exist rather than argued about.
--   C. a therapist at a DIFFERENT location entirely
--        -> must be UNCHANGED. This is "LV is unaffected", measured.
--   D. every non-therapist principal
--        -> must be UNCHANGED.
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

CREATE TEMP TABLE fixture ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.tenants ORDER BY id LIMIT 1)                     AS tenant_id,
  (SELECT id FROM public.locations ORDER BY id LIMIT 1)                   AS loc_a,
  (SELECT id FROM public.locations ORDER BY id OFFSET 1 LIMIT 1)          AS loc_b,
  (SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
    WHERE r.slug = 'therapist' ORDER BY u.id LIMIT 1)                     AS ther_a,
  (SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
    WHERE r.slug = 'therapist' ORDER BY u.id OFFSET 1 LIMIT 1)            AS ther_b,
  (SELECT u.id FROM public.users u JOIN public.roles r ON r.id = u.role_id
    WHERE r.slug = 'reception' ORDER BY u.id LIMIT 1)                     AS recep,
  (SELECT id FROM public.patients ORDER BY id LIMIT 1)                    AS patient_id,
  gen_random_uuid()                                                       AS resource_id;

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

-- B: the disagreement. Same resource, recorded at LOC_B.
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
                    AND (a.practitioner_id = ANY (coalesce(res, '{}'::uuid[]))))
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
\echo '=== VERDICTS ==='
SELECT
  CASE WHEN (SELECT loosened_rows FROM nesa_equiv WHERE user_id = (SELECT ther_a FROM fixture)) = 2
       THEN 'PASS' ELSE 'FAIL' END
    AS "A+B: the sharing therapist gains both resource rows",
  CASE WHEN (SELECT loosened_outside_expected FROM nesa_equiv WHERE user_id = (SELECT ther_a FROM fixture)) = 1
       THEN 'PASS' ELSE 'FAIL' END
    AS "B: exactly one gained row is OUTSIDE the viewer's locations",
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

ROLLBACK;

\echo ''
\echo '=== ROLLED BACK. Nothing above was kept. ==='
SELECT count(*) AS nesa_selftest_rows_left
  FROM public.users WHERE email = 'nesa-selftest@example.invalid';

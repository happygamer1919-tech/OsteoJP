-- ===================================================================
-- READ-ONLY. The equivalence gate for 0078. Changes nothing.
-- ===================================================================
-- THE ONE THING 0078 CHANGES, inside appointments_rls:
--
--   OLD:  location_id IS NOT NULL AND location_in_viewer_scope(location_id)
--   NEW:  location_id IS NOT NULL
--         AND location_id = ANY (coalesce((SELECT viewer_location_ids()), '{}'::uuid[]))
--
-- THE coalesce IS NOT DECORATION. `= ANY ((SELECT f()))` is parsed as ANY over a
-- SUBQUERY, so postgres compares uuid to uuid[] and refuses the expression
-- outright. Wrapping it in coalesce makes the operand an ARRAY-typed scalar, so
-- ANY takes its array form - and the subselect is still an InitPlan evaluated
-- once. This is the idiom 0073's viewer_visible_patient_ids already uses.
--
-- WHY THEY ARE THE SAME PREDICATE, read from the two function bodies:
--   location_in_viewer_scope(L) = EXISTS(staff_locations WHERE user_id=auth.uid()
--                                        AND location_id=L AND tenant_id=jwt_tenant_id())
--   viewer_location_ids()       = array_agg(location_id) FROM the SAME three conditions
-- Same rows, same filters. One asks per row; the other builds the set once.
-- NULL is excluded by the `IS NOT NULL` guard on BOTH sides, so `NULL = ANY(...)`
-- yielding NULL rather than false can never be reached.
--
-- ===================================================================
-- BUT A READING IS NOT A PROOF, SO THIS EVALUATES BOTH EXPRESSIONS OVER
-- EVERY ROW OF THE REAL TABLE, FOR EVERY REAL PRINCIPAL.
-- ===================================================================
-- Not five representatives chosen by me - EVERY staff user in every tenant, so
-- the choice of principal is not a place where I can be wrong. For each one it
-- sets that user's claims and counts the rows where the OLD policy expression
-- and the NEW one disagree, IN EITHER DIRECTION:
--
--   loosened_rows  = NEW visible, OLD not   (a permissive error - the dangerous one)
--   tightened_rows = OLD visible, NEW not   (someone loses rows they can see today)
--
-- A test that only counted the first would pass a policy that hides a
-- therapist's own patients from them. Both are counted and both must be zero.
--
-- It also prints the class of each principal (role, assigned locations) so the
-- five classes the ruling names are visibly covered rather than assumed.

\pset pager off
\pset format aligned

DROP TABLE IF EXISTS pg_temp.rls_equiv;
CREATE TEMP TABLE rls_equiv (
  user_id uuid, role_slug text, assigned_locations int,
  rows_total bigint, old_visible bigint, new_visible bigint,
  loosened_rows bigint, tightened_rows bigint
);

DO $$
DECLARE u record; c jsonb;
BEGIN
  FOR u IN
    SELECT usr.id, usr.tenant_id, r.slug,
           (SELECT count(*) FROM public.staff_locations sl WHERE sl.user_id = usr.id) AS locs
      FROM public.users usr JOIN public.roles r ON r.id = usr.role_id
     ORDER BY r.slug, usr.id
  LOOP
    c := jsonb_build_object('tenant_id', u.tenant_id, 'user_role', u.slug, 'sub', u.id);
    PERFORM set_config('request.jwt.claims', c::text, true);

    INSERT INTO pg_temp.rls_equiv
    SELECT u.id, u.slug, u.locs, count(*),
           count(*) FILTER (WHERE old_ok),
           count(*) FILTER (WHERE new_ok),
           count(*) FILTER (WHERE new_ok AND NOT old_ok),
           count(*) FILTER (WHERE old_ok AND NOT new_ok)
      FROM (
        SELECT
          /* THE POLICY AS IT STANDS ON PRODUCTION TODAY, copied from
             pg_get_expr(polqual) and not retyped from the migration file. */
          ((a.tenant_id = (SELECT public.jwt_tenant_id()))
           AND ((a.created_by = (SELECT auth.uid()))
                OR ((SELECT public.jwt_role()) = 'owner')
                OR (((SELECT public.jwt_role()) = 'therapist')
                    AND ((a.practitioner_id = (SELECT auth.uid()))
                         OR (a.practitioner_2_id = (SELECT auth.uid()))))
                OR (((SELECT public.jwt_role()) = ANY (ARRAY['admin','reception']))
                    AND ((NOT (SELECT public.viewer_has_location_assignment()))
                         OR ((a.location_id IS NOT NULL)
                             AND public.location_in_viewer_scope(a.location_id))))))
          IS TRUE AS old_ok,
          /* 0078. One sub-expression differs; everything else is character-identical. */
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
          IS TRUE AS new_ok
        FROM public.appointments a
      ) t;
  END LOOP;
END
$$;

\echo '=== EVERY PRINCIPAL, EVERY ROW. loosened and tightened must both be 0. ==='
SELECT role_slug,
       count(*)                AS principals,
       sum(assigned_locations) AS total_assignments,
       min(old_visible)        AS min_visible,
       max(old_visible)        AS max_visible,
       sum(loosened_rows)      AS loosened,
       sum(tightened_rows)     AS tightened
  FROM pg_temp.rls_equiv
 GROUP BY role_slug
 ORDER BY role_slug;

\echo ''
\echo '=== the five classes the ruling names, each shown present ==='
SELECT CASE WHEN role_slug = 'owner' THEN 'owner'
            WHEN role_slug = 'admin'     AND assigned_locations > 0 THEN 'admin WITH a location'
            WHEN role_slug = 'admin'     AND assigned_locations = 0 THEN 'admin WITHOUT a location'
            WHEN role_slug = 'reception' THEN 'reception'
            WHEN role_slug = 'therapist' THEN 'therapist'
            ELSE role_slug END           AS principal_class,
       count(*)            AS principals,
       sum(loosened_rows)  AS loosened,
       sum(tightened_rows) AS tightened,
       CASE WHEN sum(loosened_rows) = 0 AND sum(tightened_rows) = 0 THEN 'IDENTICAL' ELSE 'DIFFERS - HALT' END AS verdict
  FROM pg_temp.rls_equiv
 GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== THE SINGLE ANSWER ==='
SELECT sum(loosened_rows)  AS loosened_total,
       sum(tightened_rows) AS tightened_total,
       count(*)            AS principals_checked,
       max(rows_total)     AS rows_per_principal,
       CASE WHEN sum(loosened_rows) = 0 AND sum(tightened_rows) = 0
            THEN 'EQUIVALENT - the visible row set is identical for every principal'
            ELSE 'NOT EQUIVALENT - DO NOT APPLY' END AS verdict
  FROM pg_temp.rls_equiv;

-- ===================================================================
-- READ-ONLY. The INVERTED equivalence gate for the NESA shared-resource
-- policy change. Changes nothing: no DDL, no DML, no transaction that
-- needs rolling back. Safe on production.
-- ===================================================================
-- Migration: packages/db/migrations-pending/NEXT-AFTER-0085_nesa_shared_resource.sql
-- Card:      SCHED-17-nesa-shared-agenda-at-cb
-- Spec:      docs/design/SPEC-nesa-shared-agenda.md
--
-- ===================================================================
-- WHY THIS GATE INVERTS INSTEAD OF DISAPPEARING
-- ===================================================================
-- 0078's gate asserted the visible row set was IDENTICAL: loosened 0 and
-- tightened 0, over 28 principals and 41,558 rows. It could, because 0078 was a
-- performance rewrite that changed no permission.
--
-- This change DELIBERATELY LOOSENS. "loosened must be 0" is therefore the wrong
-- assertion and dropping the gate is the wrong response, because a widening with
-- no measurement of its own size is exactly how a location boundary disappears
-- without anybody noticing. So the gate keeps both counters and changes what it
-- demands of them:
--
--   tightened_rows                 MUST BE 0   nobody loses a row they see today
--   loosened_outside_expected      MUST BE 0   nothing became visible except
--                                              shared-resource rows at the
--                                              viewer's own locations
--   expected_still_invisible       MUST BE 0   every row the change is FOR did
--                                              in fact become visible
--
-- The second and third together are what "loosened equals EXACTLY the
-- shared-resource rows at the viewer's locations" means, stated as two
-- one-sided assertions that can each name their own counterexamples.
--
-- ===================================================================
-- IT RUNS BEFORE THE MIGRATION, WHICH IS THE POINT, SO IT CANNOT USE
-- THE COLUMN OR THE FUNCTION THE MIGRATION CREATES.
-- ===================================================================
-- `users.is_shared_resource` and `shared_resource_practitioner_ids()` do not
-- exist yet. The alternative - apply inside a transaction and roll back - takes
-- an ACCESS EXCLUSIVE lock on `users` and `appointments` on a live production
-- database to answer a read-only question. That is not acceptable and it is not
-- necessary.
--
-- Instead the resource set is supplied as a PARAMETER and the function body is
-- restated inline against `staff_locations`, which is what the function reads:
--
--   shared_resource_practitioner_ids()
--     = ids of is_shared_resource users at a location the viewer is also at
--   inline here
--     = ids from :resource_ids at a location the viewer is also at
--
-- The supplied list stands in for the column. Same join, same tenant filter,
-- same viewer_location_ids().
--
--   psql ... -v resource_ids='{<nesa-user-uuid>}' -f scripts/nesa-equivalence.sql
--
-- ===================================================================
-- WITH NO ARGUMENT IT MEASURES THE REAL APPLY, AND THAT ANSWER MATTERS
-- ===================================================================
-- The default is the EMPTY set, which is the true state of production today:
-- spec section 1 established there is no NESA practitioner row anywhere - NESA
-- exists only as `services.name`. So the default run answers the question
-- "what does applying this migration to production, as it stands, change?" and
-- the answer should be NOTHING: loosened 0, tightened 0.
--
-- That is not a weaker result than the 0078 gate, it is a different fact worth
-- having: the schema change is inert until the owner creates the resource row,
-- so applying it and creating the data are two separately reversible steps
-- rather than one flip. Run it AGAIN with the real id once that row exists, and
-- the same three assertions then measure the actual widening.
-- ===================================================================

\pset pager off
\pset format aligned

\if :{?resource_ids}
\else
\set resource_ids '{}'
\endif

\echo '=== NESA shared-resource policy — INVERTED equivalence gate ==='
\echo 'resource ids under test (empty = production as it stands today):'
SELECT :'resource_ids'::uuid[] AS resource_ids,
       cardinality(:'resource_ids'::uuid[]) AS n;

-- HANDED TO THE DO BLOCK AS A SESSION SETTING, NOT AS AN INTERPOLATION. psql
-- does NOT substitute :variables inside a dollar-quoted body, so `:'resource_ids'`
-- written in there would reach the server as those literal characters and fail
-- at parse time. set_config touches session state only; it writes no data.
SELECT set_config('nesa.resource_ids', :'resource_ids', false) AS resource_ids_set;

DROP TABLE IF EXISTS pg_temp.nesa_equiv;
CREATE TEMP TABLE nesa_equiv (
  user_id uuid, role_slug text, assigned_locations int,
  resources_visible_to_viewer int,
  rows_total bigint, old_visible bigint, new_visible bigint,
  loosened_rows bigint, tightened_rows bigint,
  loosened_outside_expected bigint, expected_still_invisible bigint
);

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

    /* THE FUNCTION BODY, INLINE. Identical join and filters to
       shared_resource_practitioner_ids(); the supplied list stands in for the
       is_shared_resource column the migration has not created yet. */
    SELECT coalesce(array_agg(DISTINCT sl.user_id), '{}'::uuid[])
      INTO res
      FROM public.staff_locations sl
     WHERE sl.user_id = ANY (coalesce(supplied, '{}'::uuid[]))
       AND sl.tenant_id = u.tenant_id
       AND sl.location_id = ANY (public.viewer_location_ids());

    INSERT INTO pg_temp.nesa_equiv
    SELECT u.id, u.slug, u.locs, cardinality(res), count(*),
           count(*) FILTER (WHERE old_ok),
           count(*) FILTER (WHERE new_ok),
           count(*) FILTER (WHERE new_ok AND NOT old_ok),
           count(*) FILTER (WHERE old_ok AND NOT new_ok),
           /* Became visible and is NOT a shared-resource row at one of the
              viewer's own locations. MUST BE 0. */
           count(*) FILTER (WHERE new_ok AND NOT old_ok AND NOT expected),
           /* Is a row this change is FOR and did not become visible. MUST BE 0. */
           count(*) FILTER (WHERE expected AND NOT new_ok)
      FROM (
        SELECT
          /* THE POLICY AS IT STANDS ON PRODUCTION TODAY (post-0078), copied
             from pg_get_expr(polqual) rather than retyped from a file. */
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

          /* THE PROPOSED POLICY. One new disjunct; everything else is
             character-identical to the expression above. */
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

          /* ==========================================================
             THE INDEPENDENT CHARACTERISATION OF WHAT MAY BE LOOSENED.
             ==========================================================
             The dispatch's acceptance criterion, written out: a shared-resource
             row AT THE VIEWER'S LOCATIONS. It is NOT the new disjunct restated -
             restating the predicate and comparing it with itself would prove
             nothing. It adds the condition the disjunct does not carry:

               the APPOINTMENT'S OWN location_id must be one the viewer is
               assigned to.

             The first ruled predicate scoped only by where the RESOURCE is, so
             the two disagreed: an appointment on the CB machine recorded against
             Linda-a-Velha satisfied the disjunct and failed this, and the
             self-test counted it (outside_expected 1, HALT). Strategy ruled on
             2026-09-10 that the criterion wins and the disjunct gained the
             APPOINTMENT's location test, so the two now agree and
             `loosened_outside_expected` is zero by construction. It is still
             counted: an edit to either side that reopens the gap is exactly
             what it exists to catch. */
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

\echo ''
\echo '=== EVERY PRINCIPAL, EVERY ROW, BY ROLE ==='
SELECT role_slug,
       count(*)                        AS principals,
       sum(assigned_locations)         AS total_assignments,
       sum(resources_visible_to_viewer) AS resource_slots,
       sum(loosened_rows)              AS loosened,
       sum(tightened_rows)             AS tightened,
       sum(loosened_outside_expected)  AS loosened_outside_expected,
       sum(expected_still_invisible)   AS expected_still_invisible
  FROM pg_temp.nesa_equiv
 GROUP BY role_slug
 ORDER BY role_slug;

\echo ''
\echo '=== ONLY THERAPISTS MAY MOVE. Any other role showing a change is a defect. ==='
SELECT role_slug,
       sum(loosened_rows)  AS loosened,
       sum(tightened_rows) AS tightened,
       CASE WHEN role_slug <> 'therapist' AND sum(loosened_rows) + sum(tightened_rows) > 0
            THEN 'DEFECT - a non-therapist principal changed'
            ELSE 'ok' END AS verdict
  FROM pg_temp.nesa_equiv
 GROUP BY role_slug
 ORDER BY role_slug;

\echo ''
\echo '=== THE THERAPISTS WHO GAINED ROWS, one line each ==='
SELECT user_id, assigned_locations, resources_visible_to_viewer,
       old_visible, new_visible, loosened_rows, loosened_outside_expected
  FROM pg_temp.nesa_equiv
 WHERE loosened_rows > 0
 ORDER BY loosened_rows DESC;

\echo ''
\echo '=== THE SINGLE ANSWER ==='
SELECT sum(loosened_rows)             AS loosened_total,
       sum(tightened_rows)            AS tightened_total,
       sum(loosened_outside_expected) AS outside_expected_total,
       sum(expected_still_invisible)  AS missed_target_total,
       count(*)                       AS principals_checked,
       max(rows_total)                AS rows_per_principal,
       CASE
         WHEN sum(tightened_rows) > 0
           THEN 'HALT - somebody LOSES rows they can see today'
         WHEN sum(loosened_outside_expected) > 0
           THEN 'HALT - rows became visible that are NOT shared-resource rows at the viewer''s locations'
         WHEN sum(expected_still_invisible) > 0
           THEN 'HALT - rows this change is FOR did not become visible'
         WHEN sum(loosened_rows) = 0
           THEN 'INERT - correct and changes nothing yet (no shared resource exists). Re-run with -v resource_ids once the row is created.'
         ELSE 'BOUNDED - the widening is exactly the shared-resource rows at each viewer''s locations'
       END AS verdict
  FROM pg_temp.nesa_equiv;

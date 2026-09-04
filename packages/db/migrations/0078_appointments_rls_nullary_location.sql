/* ================================================================== */
/* 0078 - appointments_rls stops calling a function PER ROW.          */
/* ================================================================== */
/* MEASURED ON PRODUCTION, 2026-09-04, and this migration exists for  */
/* exactly one line of one EXPLAIN:                                   */
/*                                                                    */
/*   Seq Scan on appointments  (rows=494) (actual rows=41543)         */
/*     Filter: ... AND (location_id IS NOT NULL                       */
/*                      AND location_in_viewer_scope(location_id))    */
/*     Rows Removed by Filter: 6                                      */
/*     actual time=1.230..4691.535                                    */
/*                                                                    */
/* 4,691 ms in one scan that removes SIX rows. Every other helper in  */
/* this policy is already wrapped `(SELECT f())`, which the planner    */
/* evaluates ONCE as an InitPlan. location_in_viewer_scope is the one  */
/* that takes a per-row argument, so it cannot be - and it therefore   */
/* runs 41,543 times, each call an EXISTS over staff_locations.        */
/*                                                                    */
/* THE SAME QUERY, SAME DATABASE, SAME MINUTE, with the ONLY variable  */
/* moved being whether the principal has a staff_locations row (which  */
/* is what makes viewer_has_location_assignment() short-circuit the    */
/* OR before the expensive arm):                                       */
/*   owner, 0 assignments : stat strip    76.7 ms                      */
/*   admin, 1 assignment  : stat strip 5,798.4 ms      -> 76x          */
/*                                                                    */
/* ================================================================== */
/* WHAT CHANGES. ONE SUB-EXPRESSION.                                   */
/* ================================================================== */
/*   OLD: location_id IS NOT NULL AND location_in_viewer_scope(location_id) */
/*   NEW: location_id IS NOT NULL                                      */
/*        AND location_id = ANY (coalesce((SELECT viewer_location_ids()), '{}'::uuid[])) */
/*                                                                     */
/* THEY ARE THE SAME PREDICATE, and it is readable from the two bodies: */
/*   location_in_viewer_scope(L) = EXISTS(staff_locations              */
/*        WHERE user_id = auth.uid() AND location_id = L               */
/*          AND tenant_id = jwt_tenant_id())                           */
/*   viewer_location_ids()       = array_agg(location_id) over the     */
/*        SAME three conditions.                                       */
/* Same rows, same filters. One asks per row; the other builds the set */
/* once. viewer_location_ids() already exists (0073) and 0071          */
/* established the nullary wrap; this is that treatment one layer down. */
/*                                                                     */
/* THE `coalesce` IS LOad-BEARING, not decoration. `= ANY ((SELECT f()))` */
/* parses as ANY over a SUBQUERY, so postgres compares uuid to uuid[]   */
/* and refuses the expression outright - it did, on the first draft of  */
/* the equivalence script. coalesce makes the operand an ARRAY-typed    */
/* scalar so ANY takes its array form, and the subselect is still an    */
/* InitPlan evaluated once. 0073's viewer_visible_patient_ids uses      */
/* exactly this idiom.                                                  */
/*                                                                     */
/* NULL CANNOT REACH EITHER SIDE. `NULL = ANY(...)` is NULL rather than */
/* false, which would be a real difference - and the `location_id IS    */
/* NOT NULL` guard in front of it is kept precisely so that case is     */
/* unreachable. Removing that guard is not a simplification.            */
/*                                                                     */
/* ================================================================== */
/* ALTER, NOT DROP + CREATE.                                           */
/* ================================================================== */
/* A DROP leaves a window in which the table has RLS enabled and no     */
/* policy. That FAILS CLOSED - nobody sees anything - rather than open, */
/* so it is not an exposure, but it is still a window in which the      */
/* clinic's agenda is empty. ALTER POLICY rewrites USING and WITH CHECK */
/* in one statement and preserves the policy's role list, command and   */
/* permissiveness, none of which this migration means to touch.         */
/*                                                                     */
/* BOTH USING AND WITH CHECK ARE REWRITTEN. The policy is FOR ALL and   */
/* carries both, character-identical to each other on production today. */
/* Changing only USING would leave a write path evaluating the old      */
/* per-row form - the slow half surviving where nobody would look for   */
/* it - and would silently split one rule into two.                     */
/*                                                                     */
/* ================================================================== */
/* THE GATE THIS SHIPPED BEHIND                                        */
/* ================================================================== */
/* scripts/0078-equivalence.sql evaluated BOTH expressions over EVERY   */
/* row of production's appointments table for EVERY staff principal in  */
/* every tenant - 28 principals x 41,558 rows - and counted the         */
/* disagreements in both directions. loosened 0, tightened 0.           */
/* packages/db/tests/appointments-rls-equivalence.db.test.ts does the   */
/* same for the five principal classes on a seeded database, INCLUDING  */
/* the admin-with-no-assignment class that production happens to have   */
/* none of, and reddens when the predicate is loosened AND when it is   */
/* tightened.                                                          */

ALTER POLICY appointments_rls ON public.appointments
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (
      (created_by = ( SELECT auth.uid() ))
      OR (( SELECT public.jwt_role() ) = 'owner'::text)
      OR ((( SELECT public.jwt_role() ) = 'therapist'::text)
          AND ((practitioner_id = ( SELECT auth.uid() ))
               OR (practitioner_2_id = ( SELECT auth.uid() ))))
      OR ((( SELECT public.jwt_role() ) = ANY (ARRAY['admin'::text, 'reception'::text]))
          AND ((NOT ( SELECT public.viewer_has_location_assignment() ))
               OR ((location_id IS NOT NULL)
                   AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[]))))))
    )
  )
  WITH CHECK (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (
      (created_by = ( SELECT auth.uid() ))
      OR (( SELECT public.jwt_role() ) = 'owner'::text)
      OR ((( SELECT public.jwt_role() ) = 'therapist'::text)
          AND ((practitioner_id = ( SELECT auth.uid() ))
               OR (practitioner_2_id = ( SELECT auth.uid() ))))
      OR ((( SELECT public.jwt_role() ) = ANY (ARRAY['admin'::text, 'reception'::text]))
          AND ((NOT ( SELECT public.viewer_has_location_assignment() ))
               OR ((location_id IS NOT NULL)
                   AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[]))))))
    )
  );--> statement-breakpoint

COMMENT ON POLICY appointments_rls ON public.appointments IS
  'Tenant + role scope for staff. 0078 replaced the per-row '
  'location_in_viewer_scope(location_id) with a nullary set membership against '
  'viewer_location_ids(), which the planner evaluates once as an InitPlan '
  'instead of 41,543 times per scan. The visible row set is unchanged: proven '
  'on production over every principal and every row before the change.';

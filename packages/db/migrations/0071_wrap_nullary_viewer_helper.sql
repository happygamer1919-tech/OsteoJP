/* ================================================================== */
/* 0071 — wrap public.viewer_has_location_assignment() in (select ...) */
/*        in patients_select and appointments_rls. NOTHING ELSE.      */
/*                                                                     */
/* SCOPE, RULED BY THE OWNER AS SR-22 AND BOUNDED BY IT: two policies, */
/* one token each. No other policy, no helper body, no table, no index,*/
/* no grant. patients_update and patients_delete carry the same        */
/* unwrapped call and are DELIBERATELY NOT TOUCHED here — they are on  */
/* the write path, they are not what /patients measured, and SR-23     */
/* requires the full re-audit to be reported before any further        */
/* migration. They are carded.                                        */
/* ================================================================== */
/*                                                                     */
/* WHAT THIS CHANGES, AND WHY IT IS SAFE WHERE THE NEIGHBOURING CALLS  */
/* ARE NOT.                                                            */
/*                                                                     */
/*   public.viewer_has_location_assignment()  takes NO ARGUMENTS.      */
/*   public.location_in_viewer_scope(location_id)      takes the row's */
/*   public.patient_appt_at_viewer_location(id)        own column.     */
/*   public.patient_appt_treated_by_viewer(id)                         */
/*                                                                     */
/* Wrapping a call in `(select ...)` turns it into an InitPlan that    */
/* Postgres evaluates ONCE per statement. For a nullary STABLE function*/
/* that is semantically identical: it has no per-row input, so its     */
/* answer cannot vary by row. For the three CORRELATED helpers it      */
/* would freeze one row's answer and apply it to every row, which is a */
/* security defect dressed as an optimisation. PERF-05 said so and was */
/* right about them; what it missed is that these two policies carry   */
/* BOTH kinds, and classified them by the correlated one.              */
/*                                                                     */
/* MEASURED, on a disposable shim with these policies transcribed and  */
/* seeded to the shape the PERF-01 card recorded from production       */
/* (8,400 patients / 41,429 appointments):                             */
/*                                                                     */
/*   /patients stat strip     1,087 ms  ->  596 ms                     */
/*   /patients list count       481 ms  ->  362 ms                     */
/*   60 concurrent renders    53.4 s    ->  29.8 s   (at max: 2)       */
/*                                                                     */
/* The stat strip's cost is per-row helper calls, not the query shape: */
/* it scans appointments TWICE through a UNION ALL over both patient   */
/* columns, so appointments_rls fires on ~82,858 row visits per render.*/
/*                                                                     */
/* PROVEN IDENTICAL, NOT ASSUMED. The visible set is compared as a SET */
/* and not as a count: same rows, in the same order, hashed. Four      */
/* equal integers would pass on two different sets of the same size.   */
/* packages/db/tests/rls-nullary-wrap.db.test.ts holds the proof and   */
/* the negative arm; the existing isolation suites hold the rest.      */
/*                                                                     */
/* THE BODIES BELOW ARE 0047 AND 0049 VERBATIM apart from the single   */
/* wrapped call in each. Diff them against those files: every other    */
/* branch, comment and operator is byte-identical, deliberately, so a  */
/* reviewer can see that nothing else moved.                           */
/* ================================================================== */

DROP POLICY "patients_select" ON public.patients;--> statement-breakpoint

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR public.patient_appt_at_viewer_location(id)
          OR (primary_location_id IS NOT NULL AND public.location_in_viewer_scope(primary_location_id))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.patient_appt_treated_by_viewer(id)
      )
    )
  );
--> statement-breakpoint

DROP POLICY "appointments_rls" ON public.appointments;--> statement-breakpoint

CREATE POLICY "appointments_rls" ON public.appointments
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      /* creator always sees their own row — RETURNING-safe (mirrors 0047). */
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR practitioner_2_id = (select auth.uid())
        )
      )
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR (location_id IS NOT NULL AND public.location_in_viewer_scope(location_id))
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      /* every active staff role may create/edit an appointment they author. */
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR practitioner_2_id = (select auth.uid())
        )
      )
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR (location_id IS NOT NULL AND public.location_in_viewer_scope(location_id))
        )
      )
    )
  );

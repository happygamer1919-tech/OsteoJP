-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0073_viewer_visible_patient_set.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0073 — patients_select resolves the viewer's visible-patient set     */
/*        ONCE PER STATEMENT. SR-33. NOTHING ELSE.                      */
/*                                                                      */
/* SCOPE, RULED BY THE OWNER AS SR-33 AND BOUNDED BY IT:                */
/*   - two new nullary helpers, public.viewer_location_ids() and        */
/*     public.viewer_visible_patient_ids();                             */
/*   - the admin/reception branch of patients_select, and ONLY that     */
/*     branch, tests membership of that set.                            */
/* No other policy. appointments_rls is NOT touched. patients_update    */
/* and patients_delete are NOT touched. The correlated helpers stay     */
/* (SR-23). The application's own predicate stays. NO INDEX is added.   */
/* The 21 policies SR-27 released stay whole for 0074.                  */
/* ================================================================== */
/*                                                                      */
/* WHAT WAS WRONG, MEASURED RATHER THAN REASONED (PERF-08).             */
/*                                                                      */
/* Postgres applies RLS quals BEFORE user quals, as a security barrier. */
/* patients_select's admin/reception branch called TWO CORRELATED       */
/* helpers - patient_appt_at_viewer_location(id) and                    */
/* location_in_viewer_scope(primary_location_id) - each taking the      */
/* row's own column, so each was evaluated on EVERY row of patients     */
/* before the name filter could remove any of them:                     */
/*                                                                      */
/*   Seq Scan on patients (actual time=2.207..349.205 rows=350 loops=1) */
/*     Rows Removed by Filter: 8050                                     */
/*                                                                      */
/* The cost was therefore FLAT in the search term's selectivity: 's'    */
/* 396 ms, 'si' 706 ms, 'silva' 334 ms. Same database, same minute, the */
/* owner's session ran 6.4 ms because patients_select short-circuits on */
/* jwt_role() = 'owner' and never reaches the branch at all. Decomposed */
/* at 8,400 patients / 41,429 appointments: RLS alone 270.8 ms, the app */
/* predicate alone 41.3 ms. RLS WAS 91% OF IT.                          */
/*                                                                      */
/* WHAT THIS DOES INSTEAD.                                              */
/*                                                                      */
/* viewer_visible_patient_ids() answers the same question ONCE, driven  */
/* from the LOCATION side rather than the patient side. Instead of      */
/* asking 8,400 times "does THIS patient have an appointment at one of  */
/* my locations", it asks once "which patients do my locations reach".  */
/* Wrapped in `(SELECT ...)` in the policy it is an InitPlan:           */
/* `loops=1` replaces 8,400 correlated calls.                           */
/*                                                                      */
/* NO INDEX IS ADDED, and none is needed - the three arms are served by */
/* indexes that already exist, or by one scan where a scan is right:    */
/*   arm 2 (patient_2_id)          appointments_patient_2_idx    [0068] */
/*   arm 3 (primary_location_id)   patients_tenant_primary_location_idx */
/*                                                                [0045]*/
/*   arm 1 (patient_id)            ONE pass over appointments filtered  */
/*                                 on (tenant_id, location_id). The     */
/*                                 planner takes                        */
/*                                 appointments_tenant_location_start_idx*/
/*                                 [0016] when the viewer's locations   */
/*                                 are selective and a single seq scan  */
/*                                 when they are not - observed         */
/*                                 choosing the scan at 1 location of 2 */
/*                                 and 14,242 of 42,000 rows. Either    */
/*                                 way it is ONE pass, not 8,400.       */
/*                                                                      */
/* MEASURED, 10 concurrent, reception, on the disposable shim seeded to */
/* the shape the PERF-01 card records from production:                  */
/*                                                                      */
/*   /patients list      872 ms  ->  215 ms                             */
/*   /patients search    899 ms  ->  177 ms                             */
/*   open one patient     13 ms  ->   38 ms   <- THE REGRESSION         */
/*                                                                      */
/* RE-MEASURED INDEPENDENTLY while authoring this migration, on one     */
/* local connection with no pooler, 8,400 patients / 42,000             */
/* appointments, A and B in ONE transaction so the fixture cannot move  */
/* between them:                                                        */
/*                                                                      */
/*   list  (count of all visible)   358.7 ms  ->  66.2 ms               */
/*   search ('%silva 1%', 965 hits) 232.3 ms  ->  74.7 ms               */
/*   ordered-id md5   d9f1598a3cc0d9bbe68d249ec1223b2e  BOTH, 7,330 rows*/
/*                                                                      */
/* THE REGRESSION IS REAL AND IS RECORDED RATHER THAN HIDDEN. Opening   */
/* ONE patient now pays the fixed cost of computing the whole set:      */
/* 13 -> 38 ms at 10 concurrent. That is the trade this shape makes. It */
/* is 25 ms on a path nobody waits on, against 700 ms removed from the  */
/* two paths reception lives in all day. The owner accepted it          */
/* explicitly when releasing SR-33, and it is on the card.              */
/*                                                                      */
/* WHY IT IS SAFE WHERE WRAPPING THE CORRELATED HELPERS WOULD NOT BE.   */
/*                                                                      */
/* 0071 wrapped a NULLARY helper because a function with no per-row     */
/* input cannot vary by row. The two helpers below are also NULLARY:    */
/* they take no parameters and derive everything from the viewer's own  */
/* claims (auth.uid(), jwt_tenant_id()) and staff_locations. Evaluating */
/* them once per statement is therefore semantically identical, for the */
/* same reason 0071's wrap was.                                         */
/*                                                                      */
/* What is NOT done here, and must not be done later: the correlated    */
/* helpers are NOT wrapped. patient_appt_treated_by_viewer(id) still    */
/* takes the row's own column in the therapist branch, and              */
/* patient_appt_at_viewer_location(id) and                              */
/* location_in_viewer_scope(location_id) still do in patients_update,   */
/* patients_delete and appointments_rls. Wrapping one would freeze one  */
/* row's answer and apply it to every row - a security defect dressed   */
/* as an optimisation. SR-23 forbids it and the suite asserts it.       */
/*                                                                      */
/* THE SET IS PROVEN IDENTICAL, NOT ASSUMED, and by ordered id lists    */
/* hashed with md5 rather than by counts: two different sets of the     */
/* same size pass a count check identically. Six principals, both       */
/* policies, before and after, in one database:                         */
/* packages/db/tests/rls-visible-patient-set.db.test.ts.                */
/*                                                                      */
/* EQUIVALENCE, TERM BY TERM, so a reviewer can check it without        */
/* running anything. For a viewer WITH a location assignment the old    */
/* branch admitted a patient when                                       */
/*                                                                      */
/*   patient_appt_at_viewer_location(id)                                */
/*     = EXISTS an appointment in the viewer's tenant, with a non-null  */
/*       location_id, joined to staff_locations on that location and    */
/*       the same tenant, for THIS user, where the patient is either    */
/*       participant                                                    */
/*   OR (primary_location_id IS NOT NULL                                */
/*       AND location_in_viewer_scope(primary_location_id))             */
/*     = the patient's primary location is one of the viewer's          */
/*                                                                      */
/* viewer_visible_patient_ids() is the union of exactly those three     */
/* arms - patient_id, patient_2_id, primary_location_id - over the same */
/* tenant and the same staff_locations rows, so membership of it is the */
/* same predicate read from the other side. `location_id = ANY (array)` */
/* is never true for a NULL location_id, which is the `IS NOT NULL`     */
/* the old form wrote out; the primary_location_id arm keeps its own    */
/* IS NOT NULL implicitly for the same reason.                          */
/* ================================================================== */

/* ================================================================== */
/* HELPER 1 — the viewer's own locations.                              */
/*                                                                     */
/* Nullary, STABLE, SECURITY DEFINER. It reads staff_locations, which  */
/* carries its own RLS policy; the definer (postgres) owns the table   */
/* and RLS is ENABLE-not-FORCE, so the read is not self-referential -  */
/* the same mechanism viewer_has_location_assignment() has used since  */
/* 0047.                                                               */
/*                                                                     */
/* NEVER NULL. array_agg over no rows returns NULL, and a NULL array   */
/* makes `= ANY` return NULL, which a policy reads as "not visible" -  */
/* an unassigned viewer would silently see nothing. coalesce to an     */
/* empty array so the "no assignment" case is a value, not an absence. */
/* ================================================================== */
CREATE OR REPLACE FUNCTION public.viewer_location_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(sl.location_id), '{}'::uuid[])
    FROM public.staff_locations sl
   WHERE sl.user_id = auth.uid()
     AND sl.tenant_id = public.jwt_tenant_id()
$$;--> statement-breakpoint

/* 0060's rule: every public SECURITY DEFINER function is owned by
 * `postgres`, because the owner is whose privileges it runs with and a
 * different applying principal would silently change the answer. */
ALTER FUNCTION public.viewer_location_ids() OWNER TO postgres;--> statement-breakpoint

/* REVOKE FROM THE NAMED ROLES AND NOT ONLY FROM PUBLIC. Supabase's
 * ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to `anon`,
 * `authenticated` and `service_role`, and `REVOKE ... FROM PUBLIC` does NOT
 * touch a privilege held by a NAMED role. 0072's own post-check caught exactly
 * that: a function meant for authenticated callers was left callable by an
 * unauthenticated PostgREST request. These two answer "which patients may this
 * viewer see", so anon and patient get nothing. */
REVOKE ALL ON FUNCTION public.viewer_location_ids() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_location_ids() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_location_ids() FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_location_ids() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.viewer_location_ids() IS
  'The location ids in the calling staff user''s staff_locations rows for the '
  'JWT tenant. Nullary and STABLE so a policy may evaluate it once per '
  'statement. Empty array, never NULL, when the viewer has no assignment - the '
  'callers distinguish "no assignment" from "assigned to nothing" themselves. '
  'SR-33, migration 0073.';--> statement-breakpoint

/* ================================================================== */
/* HELPER 2 — the patients those locations reach.                      */
/*                                                                     */
/* DRIVEN FROM THE LOCATION SIDE, which is the whole point: the        */
/* viewer's locations are the small input and the patient set is the   */
/* output, instead of every patient row asking the question itself.    */
/* The indexes it can use are named in the header; no index is added   */
/* by this migration.                                                  */
/*                                                                     */
/* THE `(SELECT ...)` AROUND viewer_location_ids() IS LOAD-BEARING and */
/* is not decoration: a bare `= ANY (public.viewer_location_ids())`    */
/* re-evaluates the array for every row examined AND cannot be used as */
/* an index condition. As a scalar sub-select it becomes an InitPlan   */
/* evaluated once, and `= ANY ($0)` is index-scannable.                */
/*                                                                     */
/* UNION ALL + array_agg(DISTINCT ...) rather than UNION: the dedup    */
/* happens once, in the aggregate, instead of over three inputs.       */
/* ================================================================== */
CREATE OR REPLACE FUNCTION public.viewer_visible_patient_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.patient_id), '{}'::uuid[])
    FROM (
      /* the viewer's locations reach this patient as the FIRST participant */
      SELECT a.patient_id AS patient_id
        FROM public.appointments a
       WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
         AND a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
         AND a.patient_id IS NOT NULL
      UNION ALL
      /* ... or as the SECOND participant. 0047's helper followed both, and a
       * set that followed only patient_id would NARROW visibility. */
      SELECT a.patient_2_id AS patient_id
        FROM public.appointments a
       WHERE a.tenant_id = (SELECT public.jwt_tenant_id())
         AND a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
         AND a.patient_2_id IS NOT NULL
      UNION ALL
      /* ... or the patient's primary location is one of the viewer's. This arm
       * is UNCONDITIONAL, exactly as 0047 wrote it: it is NOT gated on the
       * patient having no appointments. */
      SELECT p.id AS patient_id
        FROM public.patients p
       WHERE p.tenant_id = (SELECT public.jwt_tenant_id())
         AND p.primary_location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
    ) AS s
$$;--> statement-breakpoint

ALTER FUNCTION public.viewer_visible_patient_ids() OWNER TO postgres;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.viewer_visible_patient_ids() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_visible_patient_ids() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.viewer_visible_patient_ids() FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.viewer_visible_patient_ids() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.viewer_visible_patient_ids() IS
  'The patient ids the calling staff user''s locations reach, in the JWT '
  'tenant: either participant of an appointment at one of those locations, or '
  'a patient whose primary_location_id is one of them. It is the SAME '
  'predicate patient_appt_at_viewer_location(id) and '
  'location_in_viewer_scope(primary_location_id) answered per row before '
  'migration 0073, computed once from the indexed side. Empty array, never '
  'NULL. It does NOT encode the no-assignment case - patients_select still '
  'tests viewer_has_location_assignment() for that. SR-33, migration 0073.';--> statement-breakpoint

/* ================================================================== */
/* THE POLICY.                                                         */
/*                                                                     */
/* 0071's patients_select VERBATIM apart from the admin/reception      */
/* branch's second and third terms, which become one membership test.  */
/* Diff it against 0071: every other branch, comment and operator is   */
/* byte-identical, deliberately, so a reviewer can see nothing else    */
/* moved. The owner branch, the created_by branch and the therapist    */
/* branch are untouched, and the therapist branch STILL calls a        */
/* correlated helper, unwrapped, on purpose.                           */
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
          OR id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.patient_appt_treated_by_viewer(id)
      )
    )
  );

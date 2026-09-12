-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0086_nesa_shared_resource.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ==================================================================== */
/* NESA AS A SHARED BOOKABLE RESOURCE AT CASTELO BRANCO                 */
/*                                                                      */
/* NO NUMBER. THIS FILE IS NOT APPLIABLE AND THAT IS DELIBERATE.        */
/* It must land AFTER 0085 (clinic hours), which does not exist yet, so */
/* it carries no tag, has no journal entry, and lives outside           */
/* packages/db/migrations where drizzle-kit cannot see it. See the      */
/* README beside it for how it is promoted.                             */
/*                                                                      */
/* NOTHING HERE IS APPLIED UNTIL STRATEGY HAS READ THE OUTPUT OF        */
/* scripts/nesa-equivalence.sql AGAINST PRODUCTION.                     */
/*                                                                      */
/* Card: SCHED-17-nesa-shared-agenda-at-cb                              */
/* Spec: docs/design/SPEC-nesa-shared-agenda.md                         */
/* Rulings implemented, all three from the 2026-09-10 dispatch:         */
/*   1. USING **and** WITH CHECK - read and write, granted on purpose.  */
/*   2. The location scoping lives INSIDE the nullary STABLE SECURITY   */
/*      DEFINER function.                                               */
/*   3. It ships behind the INVERTED equivalence gate.                  */
/* ==================================================================== */


/* ==================================================================== */
/* 1. THE FLAG                                                          */
/* ==================================================================== */
/* Additive: one column, NOT NULL with a false default, so every        */
/* existing row keeps today's meaning and nothing is rewritten.         */
/*                                                                      */
/* WHY A COLUMN AND NOT AN ENV VAR OR A ROLE. Spec section 1 rules out  */
/* both. An env var naming the NESA user id is the SR-43 shape that     */
/* cost two days: not in a diff, not assertable, knowable only by       */
/* somebody opening a console. A fourth `roles.slug` would ripple       */
/* through every policy that reads jwt_role() for a property that is    */
/* not about permissions - NESA is not a kind of staff member, it is a  */
/* machine that holds appointments.                                     */
/*                                                                      */
/* `is_bookable` CANNOT EXPRESS THIS. JP is bookable and is not shared. */
/* The two flags answer different questions: may this appear in the     */
/* Terapeuta dropdown, and is this a person.                            */
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_shared_resource boolean NOT NULL DEFAULT false;--> statement-breakpoint

COMMENT ON COLUMN public.users.is_shared_resource IS
  'TRUE for a bookable row that is a clinic RESOURCE rather than a person - a '
  'device or a room that holds appointments. Read by '
  'shared_resource_practitioner_ids(), by appointments_rls through it, and by '
  'the patient portal roster to EXCLUDE these rows: a patient must never be '
  'offered "NESA" as somebody to book with. Distinct from is_bookable, which '
  'every practitioner has.';--> statement-breakpoint


/* ==================================================================== */
/* 2. THE NULLARY SET FUNCTION                                          */
/* ==================================================================== */
/* NULLARY, AND THAT IS THE WHOLE DESIGN. 0078 exists because a         */
/* PER-ROW helper - location_in_viewer_scope(location_id) - cost        */
/* 4,691 ms in one sequential scan that removed six rows, because the   */
/* planner called it once per row over 41,543 of them. A per-row        */
/* is_shared_resource(practitioner_id) would reintroduce exactly that   */
/* defect, on the same table, in the same policy, three migrations      */
/* later. This takes no argument, so `(SELECT f())` is an InitPlan      */
/* evaluated ONCE per statement.                                        */
/*                                                                      */
/* THE LOCATION SCOPING IS IN HERE, WHICH IS RULING 2. It is what makes */
/* "Linda-a-Velha is unaffected" a property of the DATA rather than a   */
/* sentence in a report: an LV therapist's viewer_location_ids() does   */
/* not contain Castelo Branco, so this returns an empty array for them  */
/* and the new disjunct below can never fire. No LV-shaped check is     */
/* bolted on anywhere; there is nothing to forget to update.            */
/*                                                                      */
/* A THERAPIST WITH NO LOCATION ASSIGNMENT GETS NOTHING, and that is    */
/* the right default rather than an oversight. 0078's admin/reception   */
/* arm has an explicit `NOT viewer_has_location_assignment()` escape    */
/* (an unassigned admin sees the whole tenant); the therapist arm has   */
/* never had one and this does not add one. An unscoped widening is not */
/* a widening anybody asked for.                                        */
CREATE OR REPLACE FUNCTION public.shared_resource_practitioner_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT u.id), '{}'::uuid[])
    FROM public.users u
    JOIN public.staff_locations sl
      ON sl.user_id = u.id
     AND sl.tenant_id = u.tenant_id
   WHERE u.tenant_id = public.jwt_tenant_id()
     AND u.is_shared_resource
     AND sl.location_id = ANY (public.viewer_location_ids())
$$;--> statement-breakpoint

/* 0060's rule: every public SECURITY DEFINER function is owned by
 * `postgres`, because the owner is whose privileges it runs with and a
 * different applying principal would silently change the answer. */
ALTER FUNCTION public.shared_resource_practitioner_ids() OWNER TO postgres;--> statement-breakpoint

/* REVOKE FROM THE NAMED ROLES AND NOT ONLY FROM PUBLIC. Supabase's
 * ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to `anon`,
 * `authenticated` and `service_role`, and `REVOKE ... FROM PUBLIC` does NOT
 * touch a privilege held by a NAMED role - 0072's post-check caught exactly
 * that. This function answers "which clinic resources may this viewer act
 * on", so anon and patient get nothing.
 *
 * SERVICE_ROLE IS REVOKED TOO, following 0079. It bypasses RLS anyway, so an
 * EXECUTE grant buys it nothing and only widens the surface. */
REVOKE ALL ON FUNCTION public.shared_resource_practitioner_ids() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shared_resource_practitioner_ids() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shared_resource_practitioner_ids() FROM patient;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shared_resource_practitioner_ids() FROM service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shared_resource_practitioner_ids() TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.shared_resource_practitioner_ids() IS
  'The ids of shared-resource users (users.is_shared_resource) assigned to a '
  'location the CALLING viewer is also assigned to, in the caller''s tenant. '
  'Nullary on purpose: appointments_rls calls it once per statement as an '
  'InitPlan. A per-row equivalent is the 4,691 ms defect 0078 removed. Returns '
  'an empty array for a viewer with no location assignment, which is what keeps '
  'the widening scoped.';--> statement-breakpoint


/* ==================================================================== */
/* 3. THE POLICY                                                        */
/* ==================================================================== */
/* ONE NEW DISJUNCT, IN BOTH ARMS. Everything else below is             */
/* character-identical to what 0078 left on production; it is restated  */
/* rather than patched because ALTER POLICY rewrites the whole          */
/* expression and there is no syntax for "add a disjunct".              */
/*                                                                      */
/* RULING 1 - USING **AND** WITH CHECK, AND THE SECOND HALF IS A GRANT  */
/* RATHER THAN A CONSEQUENCE. The policy is FOR ALL. USING alone would  */
/* give a CB therapist read and no edit, which is not the requirement.  */
/* Adding the disjunct to WITH CHECK also governs INSERT and the        */
/* post-UPDATE row state, so a CB therapist may CREATE a NESA           */
/* appointment - but only one RECORDED at a location that is theirs,     */
/* which is the location test in section 3b. That is the intended grant.*/
/* It is written here so it is granted on purpose and not discovered     */
/* later as a side effect of wanting edit.                              */
/*                                                                      */
/* WHAT THIS FIXES IS A HALF-STATE, NOT AN ABSENCE. Today the ONLY      */
/* reason any NESA appointment is reachable by a therapist is the       */
/* unrelated `created_by = auth.uid()` arm. The simulation in the spec  */
/* shows the database ACCEPTS a NESA appointment from a therapist and   */
/* then HIDES it from every other CB therapist - an appointment that    */
/* exists, is billable, and is invisible to the colleague standing next */
/* to the machine.                                                      */
/*                                                                      */
/* practitioner_2_id IS NOT INCLUDED, DELIBERATELY. The second          */
/* practitioner column is for a co-treating PERSON. A resource is never */
/* the second practitioner on somebody else's appointment, and widening */
/* on a column the requirement does not mention would be a grant nobody */
/* ruled.                                                              */
/*                                                                      */
/* THE coalesce IS LOAD-BEARING, exactly as 0078 records: `= ANY        */
/* ((SELECT f()))` parses as ANY over a SUBQUERY, so postgres compares  */
/* uuid to uuid[] and refuses the expression outright. coalesce makes   */
/* the operand an ARRAY-typed scalar so ANY takes its array form, and   */
/* the subselect is still an InitPlan evaluated once.                   */
ALTER POLICY appointments_rls ON public.appointments
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (
      (created_by = ( SELECT auth.uid() ))
      OR (( SELECT public.jwt_role() ) = 'owner'::text)
      OR ((( SELECT public.jwt_role() ) = 'therapist'::text)
          AND ((practitioner_id = ( SELECT auth.uid() ))
               OR (practitioner_2_id = ( SELECT auth.uid() ))))
      OR ((( SELECT public.jwt_role() ) = 'therapist'::text)
          AND (practitioner_id = ANY (coalesce(( SELECT public.shared_resource_practitioner_ids() ), '{}'::uuid[])))
          AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[]))))
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
      OR ((( SELECT public.jwt_role() ) = 'therapist'::text)
          AND (practitioner_id = ANY (coalesce(( SELECT public.shared_resource_practitioner_ids() ), '{}'::uuid[])))
          AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[]))))
      OR ((( SELECT public.jwt_role() ) = ANY (ARRAY['admin'::text, 'reception'::text]))
          AND ((NOT ( SELECT public.viewer_has_location_assignment() ))
               OR ((location_id IS NOT NULL)
                   AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[]))))))
    )
  );--> statement-breakpoint

COMMENT ON POLICY appointments_rls ON public.appointments IS
  'Tenant + role scope for staff. 0078 made the admin/reception location test '
  'a nullary set membership. This adds a fourth therapist disjunct: a therapist '
  'may read AND write appointments whose practitioner is a SHARED RESOURCE '
  '(users.is_shared_resource) at a location they share with it, and only where '
  'the appointment itself is recorded at one of their locations, which is what '
  'makes NESA at Castelo Branco a genuinely shared agenda instead of one that '
  'is visible only to whoever booked it. Deliberately LOOSENING: the size and '
  'the shape of the loosening are measured by scripts/nesa-equivalence.sql, '
  'which must show tightened = 0 before this is applied.';--> statement-breakpoint


/* ==================================================================== */
/* 3b. THE LOCATION TEST, RULED 2026-09-10, AND WHAT IT MEASURES        */
/* ==================================================================== */
/* The first draft scoped the widening only by where the RESOURCE is,    */
/* and the gate halted on it. The self-test measured, for the therapist  */
/* sharing a location with the resource: loosened 2,                    */
/* loosened_outside_expected 1. The one was a NESA appointment RECORDED  */
/* at Linda-a-Velha, readable AND creatable by a CB therapist, because   */
/* the disjunct sits in WITH CHECK too.                                 */
/*                                                                      */
/* STRATEGY RULED THE CRITERION WINS. The new disjunct in BOTH arms now  */
/* also requires                                                        */
/*                                                                      */
/*   location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[])) */
/*                                                                      */
/* - the same nullary STABLE SECURITY DEFINER function 0078 already      */
/* calls, in the same InitPlan shape, evaluated once per statement. A   */
/* NULL location_id makes `= ANY` NULL, which RLS treats as false, so a  */
/* row with no location is never reached through this arm; the admin    */
/* arm's explicit IS NOT NULL is not needed for the same result here.    */
/*                                                                      */
/* MEASURED ON THE BLUE LANE, 2026-09-10, AFTER THE CHANGE:             */
/*   default arm (no resource row, i.e. production as it stands)        */
/*     loosened 0, tightened 0 over 14 principals, verdict INERT        */
/*   self-test, restated predicate                        5/5 PASS      */
/*     sharing therapist  loosened 1, outside_expected 0, tightened 0,  */
/*                        expected_still_invisible 0                    */
/*     other-location therapist, every non-therapist      all 0         */
/*   self-test, THIS FILE applied in a rolled-back transaction           */
/*     W1 CB therapist creates NESA at CB, created_by reception  ADMITTED */
/*     W2 the same at LV                          REFUSED 42501         */
/*     V1 reception's NESA row at LV                  INVISIBLE         */
/*                                                                      */
/* WHAT THIS DOES NOT CLOSE, MEASURED RATHER THAN ASSUMED. 0078's        */
/* `created_by = auth.uid()` arm is in WITH CHECK as well, and it admits */
/* any row a principal stamps with its own id, at any location in the    */
/* tenant. The staff create path stamps created_by = the actor           */
/* (apps/web/lib/scheduling/actions.ts, createAppointment), so a CB      */
/* therapist booking NESA at LV THROUGH THE APP passes RLS by that arm - */
/* ADMITTED before this migration and after it. That is a property of   */
/* 0078, not of this file; narrowing it governs every staff insert, not  */
/* only NESA, and is a separate ruling.                                 */

/* ==================================================================== */
/* 4. WHAT THIS MIGRATION DOES NOT DO                                   */
/* ==================================================================== */
/* IT CREATES NO NESA ROW. The resource user, its is_bookable flag and  */
/* its staff_locations row at Castelo Branco are DATA, and data is the  */
/* owner's to write. A migration that inserted a practitioner would be  */
/* a schema change that silently changed a dropdown.                    */
/*                                                                      */
/* IT CHANGES NO APPLICATION CODE. The four app-layer changes in spec   */
/* section 3 and the patient-portal exclusion in section 2 ship         */
/* alongside, not here. The spec's recommendation stands: the app-layer */
/* half MUST NOT ship alone - on its own it converts "a CB therapist    */
/* cannot book NESA" into "a CB therapist can book NESA and nobody else */
/* can see it", which is worse than the present state and harder to     */
/* notice.                                                             */

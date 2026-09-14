-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0088_nesa_second_participant_visible.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ==================================================================== */
/* 0088 - A BOOKING WITH NESA AS TERAPEUTA 2 IS VISIBLE TO THE THERAPISTS */
/* WHO SHARE THE MACHINE'S CLINIC                                         */
/*                                                                        */
/* Card:   MIG-0088-nesa-second-participant-visible-to-cb-therapists      */
/* Ruling: SCHED-29.3 (owner, 2026-09-13): appointments where NESA is a   */
/*         second participant become visible on NESA's agenda to CB       */
/*         therapists.                                                    */
/* ==================================================================== */


/* ==================================================================== */
/* 1. WHAT THIS REVERSES, AND WHY THAT IS A RULING AND NOT A DRIFT        */
/* ==================================================================== */
/* 0086 left practitioner_2_id out of its shared-resource disjunct ON     */
/* PURPOSE: "A resource is never the second practitioner on somebody     */
/* else's appointment, and widening on a column the requirement does not  */
/* mention would be a grant nobody ruled."                                */
/*                                                                        */
/* Both halves of that sentence have since changed. SCHED-29 (2026-09-13) */
/* made NESA exactly that: a therapist books themselves as Terapeuta and  */
/* NESA as Terapeuta 2, at Castelo Branco and nowhere else. And the owner */
/* has now ruled the grant (SCHED-29.3). Without it the machine's agenda  */
/* is the half-state 0086 was written to end, one column over: a booking  */
/* that holds NESA's hour and is invisible to the colleague standing next */
/* to the machine.                                                        */


/* ==================================================================== */
/* 2. A SEPARATE SELECT POLICY, NOT A DISJUNCT IN appointments_rls        */
/* ==================================================================== */
/* The ruling is VISIBILITY. appointments_rls is FOR ALL, and its USING   */
/* expression governs SELECT, the rows an UPDATE may target, AND the rows */
/* a DELETE may remove. A disjunct added there would have handed every CB */
/* therapist delete on a colleague's booking - a grant nobody ruled.      */
/*                                                                        */
/* A PERMISSIVE FOR SELECT policy is ORed with appointments_rls for       */
/* SELECT only. UPDATE and DELETE still require appointments_rls's own    */
/* USING, which this file does not touch, so a CB therapist can read such */
/* a row and cannot change or remove it. The isolation test measures both */
/* refusals rather than trusting this paragraph.                          */
/*                                                                        */
/* TO authenticated, like appointments_rls. The patient role reads        */
/* appointments through appointments_patient_selfscope (0010) and gains   */
/* nothing here.                                                          */


/* ==================================================================== */
/* 3. THE PREDICATE IS 0086'S, WITH ONE COLUMN CHANGED                    */
/* ==================================================================== */
/* Tenant, role therapist, the resource named by the NULLARY function     */
/* 0086 created, and the appointment recorded at one of the viewer's own  */
/* locations - the location test strategy ruled on 2026-09-10 for 0086,   */
/* kept character for character. Only practitioner_id becomes            */
/* practitioner_2_id.                                                     */
/*                                                                        */
/* NULLARY FUNCTIONS, SO INITPLANS. Both helpers take no argument, so     */
/* `(SELECT f())` is evaluated once per statement, not once per row: the  */
/* 4,691 ms per-row defect 0078 removed is not reintroduced. The coalesce */
/* is load-bearing for the reason 0078 records: without it `= ANY` over a */
/* subquery compares uuid to uuid[] and the expression is refused.        */
/*                                                                        */
/* LINDA-A-VELHA IS UNAFFECTED AS A PROPERTY OF THE DATA.                 */
/* shared_resource_practitioner_ids() returns only resources assigned to  */
/* a location the viewer is also assigned to, so for an LV-only therapist */
/* it is empty and this policy cannot admit a row.                        */
/*                                                                        */
/* NO NEW FUNCTION. The SECURITY DEFINER count and its owner checker are  */
/* unchanged by this file.                                                */
CREATE POLICY "appointments_shared_resource_second_participant_select" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = 'therapist'::text)
    AND (practitioner_2_id = ANY (coalesce(( SELECT public.shared_resource_practitioner_ids() ), '{}'::uuid[])))
    AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[])))
  );--> statement-breakpoint

COMMENT ON POLICY "appointments_shared_resource_second_participant_select" ON public.appointments IS
  'SCHED-29.3. A therapist may READ an appointment whose SECOND practitioner is a '
  'shared resource (users.is_shared_resource) at a location they share with it, '
  'when the appointment is recorded at one of their locations: the booking that '
  'holds NESA''s hour as Terapeuta 2 appears on NESA''s agenda for the therapists '
  'at that clinic. SELECT only, on purpose: UPDATE and DELETE still require '
  'appointments_rls, so the grant is visibility and nothing else.';


/* ==================================================================== */
/* 4. WHAT THIS MIGRATION DOES NOT DO                                     */
/* ==================================================================== */
/* IT FLAGS NO ROW. With no users row carrying is_shared_resource the     */
/* function returns an empty array and this policy admits nothing: the    */
/* production state until GREEN's NESA flag block is run.                 */
/*                                                                        */
/* IT DOES NOT DRAW THE ROW BY ITSELF. A readable row appears on NESA's   */
/* agenda only when the agenda query asks for it; the read that does so   */
/* (listAppointments, SCHED-29.3) ships in the same PR, and on its own    */
/* would change nothing for a therapist, because RLS would still hide the */
/* colleague's row.                                                       */

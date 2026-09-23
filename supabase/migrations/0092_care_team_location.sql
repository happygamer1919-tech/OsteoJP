-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0092_care_team_location.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

-- CARE-LOC (0092). A therapist's patient-following view stops at their own clinic.
--
-- ===========================================================================
-- THE RULING
-- ===========================================================================
-- Owner, 2026-09-21, ruled option (b): a therapist sees appointments of patients
-- they treat or are assigned to ONLY at clinics in viewer_location_ids().
--
-- 0091 shipped that view WITHOUT a location predicate. The production
-- measurement that produced the ruling is deliberately NOT reproduced in this
-- file: it is an unfixed cross-clinic disclosure on a PUBLIC repository, and it
-- stays out of every committed byte until this migration is applied. It is in
-- the owner's report and in the apply document's owner-only section.
--
-- NOTE WHAT THIS IS NOT. The NESA rules were never the problem: 0088's policy
-- and 0090's function BOTH already carry
-- `location_id = ANY (viewer_location_ids())`, and the deployed function body
-- was read back off production to confirm it is not a stale variant. The
-- cross-clinic path is 0091's patient-following policy and nothing else.
--
-- WHAT THIS MIGRATION DOES NOT CLOSE, and it is not an oversight.
-- `appointments_rls` admits a therapist's OWN work - `created_by = auth.uid()`
-- or `practitioner_id/practitioner_2_id = auth.uid()` - with NO location
-- predicate on those arms. So after this change a therapist still sees
-- appointments they personally booked or worked at a clinic they no longer
-- belong to. Narrowing that is a different and much larger behaviour change
-- (it would hide a therapist's own history from them), it was NOT ruled, and
-- it is carried to the owner as a question rather than decided here.
--
-- ===========================================================================
-- ONE POLICY IS AMENDED, AND A SECOND WAS EXAMINED AND DELIBERATELY LEFT
-- ===========================================================================
-- Exactly two live read paths follow the care-team helpers. Both were found by
-- querying `pg_policies` on production rather than by reading the repository:
--
--   appointments.appointments_care_team_patient_history_select   -> AMENDED HERE
--   patients.patients_select                                     -> NOT amended
--
-- `patients_select`'s therapist arm is `id = ANY (viewer_treated_patient_ids())`
-- - patients the therapist PERSONALLY TREATED. That is not a cross-clinic
-- disclosure: they treated the person. Narrowing it by location would HIDE a
-- patient a therapist genuinely treated at the other clinic, which is a
-- behaviour change the ruling does not ask for and which would break a real
-- workflow. It is left alone, on purpose, and the question is carried to the
-- owner rather than decided here.
--
-- ===========================================================================
-- ALTER, NOT DROP AND CREATE
-- ===========================================================================
-- `ALTER POLICY ... USING` replaces the expression and leaves the policy in
-- place, so the POLICY COUNT DOES NOT MOVE. A drop-and-create would take the
-- count down and back up, and a post-check that asserts "the count did not
-- change" would pass on a run where the CREATE silently failed. This is the
-- shape 0089 settled on for the same reason.
--
-- SELECT-only, as 0091 was. UPDATE and DELETE still require appointments_rls,
-- so this remains a rule about VISIBILITY and never a right to change a
-- colleague's booking.

ALTER POLICY "appointments_care_team_patient_history_select" ON public.appointments
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = 'therapist'::text)
    -- THE LINE THIS MIGRATION EXISTS FOR. The same predicate 0088 and 0090
    -- already use, so all three NESA/care read paths now agree on what "this
    -- therapist's clinic" means and there is one definition to change.
    AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[])))
    AND (
      (patient_id   = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids() ), '{}'::uuid[])))
      OR (patient_2_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids() ), '{}'::uuid[])))
      OR (patient_id   = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
      OR (patient_2_id = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
    )
  );--> statement-breakpoint

COMMENT ON POLICY "appointments_care_team_patient_history_select" ON public.appointments IS
  'CARE-01 as ruled by Q-CARE-1 (c), NARROWED by CARE-LOC (owner, 2026-09-21, '
  'option b). A therapist may READ every appointment of a patient they are '
  'assigned to by reception, or of any patient they have themselves treated - '
  'BUT ONLY AT A CLINIC IN viewer_location_ids(). SELECT only: UPDATE '
  'and DELETE still require appointments_rls, so this is visibility and never a '
  'right to change a colleague''s booking. The location predicate is the same '
  'one 0088 and 0090 use.';--> statement-breakpoint

/* ====================================================================== */
/* PENDING, AND IT FOLLOWS 0112. The patient read rules test membership   */
/* of a patient-id set with a hashed lookup instead of a linear search.   */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. Five read rules (RLS policies) and one function    */
/* ask "is this row's patient in the set of patients the caller may       */
/* reach?" with                                                           */
/*     x = ANY (coalesce((SELECT public.f()), '{}'::uuid[]))              */
/* The set is computed once per statement (an InitPlan), but ANY over an  */
/* array is a linear search, run once per row the read examines. A read   */
/* that examines the whole tenant therefore costs rows x set size, which  */
/* grows with the square of the clinic's size. This file rewrites each    */
/* such term as                                                           */
/*     x IN (SELECT unnest((SELECT public.f())))                          */
/* which the planner runs as a HASHED SubPlan: the set is still computed  */
/* once, hashed once, and probed once per row. Nothing else changes: no   */
/* role, arm, function call, table, column, grant or row.                 */
/*                                                                        */
/* RULED: strategy's U3, 2026-11-03. Number 0113, Tier C, its own         */
/* closed-hours sitting on Wednesday 2026-11-18, after the Montemor       */
/* clinic opens (Tuesday 2026-11-17). Authored now and HELD: this lane    */
/* never applies it; GREEN applies it.                                    */
/*                                                                        */
/* NO NUMBER YET, BY CONSTRUCTION. 0108 is the last file on main. 0109    */
/* (#1682), 0110 (#1704), 0111 (#1706) and 0112 (#1708) are ruled and     */
/* held. This file takes 0113 at its promotion, after 0112 is applied and */
/* merged. At promotion its journal `when` MUST BE STRICTLY GREATER than  */
/* 0112's; scripts/check-journal.mjs refuses one that is not.             */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT WAS MEASURED (BLUE, synthetic data, 2026-11-03)                */
/* ====================================================================== */
/* One tenant of 16,500 patients across two clinics (production holds    */
/* about 16,400 in one tenant), then 33,000; a second tenant of 5,000.    */
/* The app's own SQL, as the assigned principal, median of 3, total ms.   */
/* Full tables: the pull request body.                                    */
/*                                                                        */
/*   rule (term)                         16,500        33,000             */
/*                                       now -> this   now -> this        */
/*   patients_select, receptionist                                        */
/*     with both clinics, search count   444 -> 74     1641 -> 148        */
/*   patients_select, therapist,                                          */
/*     list count                        100 -> 18      371 -> 34         */
/*   appointments_care_team_patient_                                      */
/*     history_select, therapist, count   90 -> 17      336 -> 30         */
/*   appointment_survey_sends_select,                                     */
/*     therapist, count                   49 -> 8       183 -> 12         */
/*   clinical_records_select, therapist,                                  */
/*     count (the term's share)           11 ms         29 ms             */
/*   clinical_episodes_select, therapist,                                 */
/*     count (the term's share)            3 ms         23 ms             */
/*                                                                        */
/* NOT CHANGED, because they did not grow: patient_care_team_select (the  */
/* table holds care-team rows only: 6.0 -> 6.7 ms), patient_care_team_    */
/* insert (one row per statement: 6.7 -> 9.8 ms), and the app-side term   */
/* in apps/web/lib/patients/scope.ts (no difference at either size).      */
/* pack_instance_consuming_sessions did not grow either (one patient per  */
/* call) and IS changed, for the reason in section 3.                     */
/*                                                                        */
/* ====================================================================== */
/* 2. WHY THE ROWS ARE THE SAME, FOR EVERY CALLER                         */
/* ====================================================================== */
/* `x IN (SELECT ...)` is defined as `x = ANY (SELECT ...)`, so the two   */
/* forms differ only in where the set comes from: an array, or the rows   */
/* of unnest over the same array. They agree in every case, NULL         */
/* included, so they are equal as three-valued expressions and not only   */
/* where a policy reads them:                                             */
/*   - the array is NULL: coalesce gives '{}' and ANY is false; unnest of */
/*     NULL gives no row and IN is false;                                 */
/*   - x is NULL (patient_2_id on most appointments): both are NULL when  */
/*     the set has a member and false when it is empty;                   */
/*   - x is not NULL: both are true when x is a member. Otherwise both    */
/*     are false, because no set holds a NULL element: each helper        */
/*     filters `patient_id IS NOT NULL` and `patient_2_id IS NOT NULL`,   */
/*     or reads a NOT NULL column (0073, 0074, 0091, 0096).               */
/* The helper is still called inside its own scalar subselect, so it is   */
/* still evaluated once per statement (0071, 0073; rls-nullary-wrap).     */
/* Measured: 48 of 48 id sets equal at each size (8 principals, 6         */
/* tables), and packages/db/tests/patient-id-array-reads.db.test.ts       */
/* proves it per rule, per role, both directions, with a control that     */
/* goes red on a narrowed variant.                                        */
/*                                                                        */
/* The hashed plan does not depend on work_mem: the planner estimates an  */
/* unnest of a computed array at its default size, so it chose the hash   */
/* at work_mem 64kB as at 4MB (measured). Production's value was not      */
/* read.                                                                  */
/*                                                                        */
/* ====================================================================== */
/* 3. THE STATEMENTS, AND WHY THE PACK FUNCTION IS ONE OF THEM            */
/* ====================================================================== */
/*   P0 pack_instance_consuming_sessions(uuid), CREATE OR REPLACE: the    */
/*      body of 0108 with its three patient-set terms rewritten. 0108     */
/*      states patients_select's USING term for term, and its test        */
/*      (pack-instance-consuming-sessions.db.test.ts) pins that the two   */
/*      move together. Same signature, same LANGUAGE, STABLE, SECURITY    */
/*      DEFINER and search_path, so its owner (postgres), its EXECUTE     */
/*      grant (authenticated only) and its comment are kept by the        */
/*      REPLACE. The SECURITY DEFINER count does not move.                */
/*   P1 patients_select (0096): the three patient-set terms.              */
/*   P2 clinical_records_select (0096): the care-team term.               */
/*   P3 clinical_episodes_select (0104): the care-team term.              */
/*   P4 appointments_care_team_patient_history_select (0092): the four    */
/*      terms (care team and treated set, first and second patient).      */
/*   P5 appointment_survey_sends_select (0102): the treated-set term.     */
/* Each ALTER POLICY replaces only the expression: name, command,         */
/* PERMISSIVE, TO authenticated and the comment stay, and no policy count */
/* moves. Each is the policy as its last migration left it, verbatim,     */
/* except the rewritten terms. The location terms                         */
/* (location_id = ANY (viewer_location_ids())) are NOT rewritten: that    */
/* set is the caller's one or two clinics and does not grow.              */
/*                                                                        */
/* IDEMPOTENT: run twice, the catalogue reads as after the first run.     */
/*                                                                        */
/* ====================================================================== */
/* 4. THE LOCKS, AND THE SITTING                                          */
/* ====================================================================== */
/* P0 takes no table lock. Each ALTER POLICY run as postgres takes ACCESS */
/* EXCLUSIVE on its table (patients, clinical_records, clinical_episodes, */
/* appointments, appointment_survey_sends) and on every table the        */
/* platform's supautils.policy_grants setting names, until the COMMIT     */
/* (0107, measured 2026-10-12). Every read of a patient and of the agenda */
/* waits for the end of the transaction. So the policies come last, this  */
/* file is closed hours only and never R9, and the two bounds below make  */
/* a lock it cannot take in 5 seconds a clean failure with nothing        */
/* applied.                                                               */
/*                                                                        */
/* ====================================================================== */
/* 5. THE REMINDER SWEEP AND THE SLEEPING JOB                             */
/* ====================================================================== */
/* Both read patients and appointments, and the survey sends write and    */
/* read appointment_survey_sends, through withReminderTenantContext       */
/* (apps/web/lib/reminders/context.ts): role authenticated, user_role     */
/* 'admin', and NO user id. For that principal viewer_has_location_       */
/* assignment() is false, so patients_select admits it by `NOT (...)`     */
/* before the rewritten term; the therapist arms (P2 to P5's rewritten    */
/* terms) never apply to it; and the survey sends' admin arm is the       */
/* location term, unchanged. Neither job reads clinical_records,          */
/* clinical_episodes or the pack function. Same rows, so no change in     */
/* behaviour for either; the DB test carries this principal.              */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

/* P0. 0108's function, its three patient-set terms rewritten (section 3). */
CREATE OR REPLACE FUNCTION public.pack_instance_consuming_sessions(p_pack_instance_id uuid)
  RETURNS TABLE (appointment_id uuid, starts_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT a.id, a.starts_at
    FROM public.patient_pack_instances i
    JOIN public.patients p
      ON p.id = i.patient_id
     AND p.tenant_id = i.tenant_id
    JOIN public.appointments a
      ON a.pack_instance_id = i.id
     AND a.tenant_id = i.tenant_id
   WHERE i.id = p_pack_instance_id
     AND i.tenant_id = (SELECT public.jwt_tenant_id())
     AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception', 'therapist')
     AND a.status <> 'cancelled'
     AND (
           p.created_by = (SELECT auth.uid())
        OR (SELECT public.jwt_role()) = 'owner'
        OR (
             (SELECT public.jwt_role()) IN ('admin', 'reception')
             AND (
                   NOT (SELECT public.viewer_has_location_assignment())
                OR p.id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))
             )
           )
        OR (
             (SELECT public.jwt_role()) = 'therapist'
             AND (
                   p.id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))
                OR p.id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
             )
           )
     )
   ORDER BY a.starts_at, a.id;
END
$fn$;--> statement-breakpoint

/* P1. 0096's patients_select USING, its three patient-set terms          */
/* rewritten.                                                             */
ALTER POLICY "patients_select" ON public.patients
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))
          OR id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
        )
      )
    )
  );--> statement-breakpoint

/* P2. 0096's clinical_records_select USING, its care-team term           */
/* rewritten. The admin and therapist function calls stay as they are.    */
ALTER POLICY "clinical_records_select" ON public.clinical_records
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
          OR patient_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
        )
      )
    )
  );--> statement-breakpoint

/* P3. 0104's clinical_episodes_select USING, its care-team term          */
/* rewritten.                                                             */
ALTER POLICY "clinical_episodes_select" ON public.clinical_episodes
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'reception'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          public.clinical_therapist_sees_patient(patient_id)
          OR patient_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
        )
      )
    )
  );--> statement-breakpoint

/* P4. 0092's appointments_care_team_patient_history_select USING, its    */
/* four patient-set terms rewritten. The location term stays.             */
ALTER POLICY "appointments_care_team_patient_history_select" ON public.appointments
  USING (
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = 'therapist'::text)
    AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[])))
    AND (
      (patient_id      IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids()))))
      OR (patient_2_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids()))))
      OR (patient_id   IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))
      OR (patient_2_id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))
    )
  );--> statement-breakpoint

/* P5. 0102's appointment_survey_sends_select USING, its treated-set term */
/* rewritten. The admin and reception location term stays.                */
ALTER POLICY "appointment_survey_sends_select" ON public.appointment_survey_sends
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (
      (SELECT public.jwt_role()) = 'owner'
      OR (
        (SELECT public.jwt_role()) IN ('admin', 'reception')
        AND location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
      )
      OR (
        (SELECT public.jwt_role()) = 'therapist'
        AND patient_id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))
      )
    )
  );--> statement-breakpoint

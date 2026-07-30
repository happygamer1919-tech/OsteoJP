-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0047_patients_location_rls.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0047 — patients RLS: PL-09 role+location model (defense-in-depth).   */
/*                                                                    */
/* PL-09 (owner ruling 2026-07-29) applied to the patients table. This  */
/* is the RLS enforcement of the ALREADY-app-enforced scope (Phase 1:   */
/* patients/queries.ts therapistPatientScope + patientLocationScope,    */
/* Phase 3 statistics). RLS is defense-in-depth — it must mirror the app */
/* and never be STRICTER (a stricter policy silently hides rows the app  */
/* intends to show, e.g. the booking patient picker).                   */
/*                                                                    */
/* READ matrix (patients demographics; NOT clinical — that is 0045):    */
/*   ANY staff -> a patient they CREATED (created_by = auth.uid()). This  */
/*      "see what you created" clause is first because it also makes     */
/*      createPatient's INSERT ... RETURNING work for every role (see    */
/*      CRITICAL below).                                                 */
/*   owner     -> all in-tenant.                                         */
/*   admin     -> their location(s): a patient with an appointment       */
/*                (primary OR secondary slot) at one of the viewer's      */
/*                staff_locations, OR whose patients.primary_location_id  */
/*                is one of them (UNCONDITIONAL fallback). UNASSIGNED     */
/*                viewer (no staff_locations) -> sees ALL (no lockout,    */
/*                mirrors viewerLocationScope's empty -> null).           */
/*   reception -> SAME location basis as admin. NOTE: DIFFERS from        */
/*                clinical (0045), where reception is DENIED. For          */
/*                demographics reception has full location access.        */
/*   therapist -> OWN patients: created_by (above) OR treats/treated as   */
/*                PRIMARY or SECONDARY practitioner. Mirrors               */
/*                therapistPatientScope (W10-04).                         */
/*                                                                    */
/* CRITICAL — why the helpers query ONLY appointments + staff_locations   */
/* and NEVER the patients table:                                         */
/*   A patients-table SELECT policy is applied to the row returned by     */
/*   createPatient's `INSERT INTO patients ... RETURNING`. A SECURITY     */
/*   DEFINER helper that re-queries `patients WHERE id = NEW.id` does NOT  */
/*   see the just-inserted row (the sub-select uses the pre-INSERT        */
/*   snapshot), so it returns FALSE and the RETURNING is rejected with    */
/*   "new row violates row-level security policy" — breaking patient      */
/*   creation for therapist (created_by) and located reception/admin.     */
/*   Therefore the policy references the NEW row's OWN columns directly    */
/*   (created_by, primary_location_id, id, tenant_id) and the helpers      */
/*   touch only OTHER tables (appointments, staff_locations), which are    */
/*   not being mutated and are fully visible. The top-level               */
/*   `created_by = auth.uid()` guarantees the creator can always RETURNING */
/*   their row regardless of location.                                    */
/*                                                                    */
/* WRITE matrix:                                                        */
/*   SELECT/UPDATE/DELETE -> the READ scope (USING). You cannot mutate a   */
/*     row you cannot see. UPDATE WITH CHECK is tenant-only, so a          */
/*     legitimate edit that moves primary_location_id is not blocked.      */
/*   INSERT -> tenant-only (any authenticated staff). New patients have no */
/*     appointment and may have no location yet; the app capability grid   */
/*     (patients:create) is the create gate; RLS keeps the tenant wall.    */
/*                                                                    */
/* UNTOUCHED (orthogonal, different roles): patients_patient_selfscope     */
/*   (0010, TO patient), patients_patient_update_selfscope (0019, TO       */
/*   patient), auth_admin_read_patients (0010, TO supabase_auth_admin).    */
/*   Only patients_tenant_isolation (0001, TO authenticated) is replaced.  */
/*   Service-role paths (ingestion, reminders, migration) run BYPASSRLS.   */
/*                                                                    */
/* HELPERS: SECURITY DEFINER, STABLE, search_path=public. Every table read */
/*   is tenant-filtered on public.jwt_tenant_id(); viewer resolved via      */
/*   auth.uid() = public.users.id against staff_locations. No JWT location  */
/*   claim needed. Same pattern as 0045, minus any patients self-read.      */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* A. Helpers (appointments + staff_locations only; never patients).   */
/* ------------------------------------------------------------------ */

/* Viewer has ANY location assignment. Drives the no-lockout fallback   */
/* (mirrors viewerLocationScope: empty assignment -> null -> see all).  */
CREATE OR REPLACE FUNCTION public.viewer_has_location_assignment()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_locations sl
    WHERE sl.user_id   = auth.uid()
      AND sl.tenant_id = public.jwt_tenant_id()
  )
$$;
--> statement-breakpoint

/* The given location is one of the viewer's staff_locations. Used with  */
/* the patient's primary_location_id passed DIRECTLY from the policy      */
/* (unconditional fallback basis).                                        */
CREATE OR REPLACE FUNCTION public.location_in_viewer_scope(p_location_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_locations sl
    WHERE sl.user_id     = auth.uid()
      AND sl.location_id = p_location_id
      AND sl.tenant_id   = public.jwt_tenant_id()
  )
$$;
--> statement-breakpoint

/* The patient has an appointment (primary OR secondary slot) at one of   */
/* the viewer's locations (appointment basis). Reads appointments +       */
/* staff_locations only.                                                  */
CREATE OR REPLACE FUNCTION public.patient_appt_at_viewer_location(p_patient_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.staff_locations sl
      ON sl.location_id = a.location_id
     AND sl.tenant_id   = a.tenant_id
    WHERE (a.patient_id = p_patient_id OR a.patient_2_id = p_patient_id)
      AND a.tenant_id    = public.jwt_tenant_id()
      AND a.location_id IS NOT NULL
      AND sl.user_id     = auth.uid()
  )
$$;
--> statement-breakpoint

/* The viewer treats/treated the patient as PRIMARY or SECONDARY           */
/* practitioner (therapist own-patient basis). Reads appointments only.    */
CREATE OR REPLACE FUNCTION public.patient_appt_treated_by_viewer(p_patient_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE (a.patient_id = p_patient_id OR a.patient_2_id = p_patient_id)
      AND a.tenant_id   = public.jwt_tenant_id()
      AND (a.practitioner_id = auth.uid() OR a.practitioner_2_id = auth.uid())
  )
$$;
--> statement-breakpoint

-- RLS is evaluated as the querying role, so `authenticated` needs EXECUTE even
-- though each body runs as the (BYPASSRLS) owner. NOT granted to `patient` (the
-- portal principal is governed solely by the 0010/0019 self-scope policies).
GRANT EXECUTE ON FUNCTION public.viewer_has_location_assignment()             TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.location_in_viewer_scope(uuid)               TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_appt_at_viewer_location(uuid)        TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_appt_treated_by_viewer(uuid)         TO authenticated;--> statement-breakpoint

/* ================================================================== */
/* B. Replace the tenant-only staff policy with the PL-09 matrix.       */
/*    Drop ONLY patients_tenant_isolation (0001, TO authenticated).     */
/* ================================================================== */
DROP POLICY "patients_tenant_isolation" ON public.patients;--> statement-breakpoint

/* Shared USING predicate (SELECT/UPDATE/DELETE). References the row's own
   columns directly (created_by, primary_location_id) so it is safe on the
   RETURNING of an INSERT; helpers touch only appointments/staff_locations. */
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
          NOT public.viewer_has_location_assignment()
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

/* INSERT: tenant-only (new patients have no location yet; see header). */
CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

/* UPDATE: gated by the READ scope (USING); WITH CHECK keeps the tenant
   wall only, so a legitimate edit (incl. moving primary_location_id) works. */
CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT public.viewer_has_location_assignment()
          OR public.patient_appt_at_viewer_location(id)
          OR (primary_location_id IS NOT NULL AND public.location_in_viewer_scope(primary_location_id))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.patient_appt_treated_by_viewer(id)
      )
    )
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

/* DELETE: gated by the READ scope (cannot delete a row you cannot see). */
CREATE POLICY "patients_delete" ON public.patients
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT public.viewer_has_location_assignment()
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
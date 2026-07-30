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
/* EXACTLY, never be STRICTER (a stricter policy silently hides rows the */
/* app intends to show, e.g. a patient the agenda booking picker lists). */
/*                                                                    */
/* READ matrix (patients demographics; NOT clinical — that is 0045):    */
/*   owner     -> all in-tenant.                                         */
/*   admin     -> their location(s): a patient with an appointment       */
/*                (primary OR secondary slot) at one of the viewer's      */
/*                staff_locations, OR whose patients.primary_location_id  */
/*                is one of them (UNCONDITIONAL fallback). UNASSIGNED     */
/*                viewer (no staff_locations) -> sees ALL (no lockout).   */
/*   reception -> SAME location basis as admin. NOTE: this DIFFERS from   */
/*                clinical (0045), where reception is DENIED. For         */
/*                demographics reception has full location access         */
/*                (front desk), per the PL-09 ruling.                     */
/*   therapist -> OWN patients only: created_by = auth.uid(), OR treats/  */
/*                treated as PRIMARY or SECONDARY practitioner            */
/*                (visibility follows appointments). Reuses the 0045      */
/*                helper clinical_therapist_sees_patient, which matches   */
/*                therapistPatientScope (W10-04) byte-for-byte.           */
/*                                                                    */
/* WHY A NEW HELPER (not reuse clinical_admin_sees_patient):            */
/*   The 0045 admin helper is deliberately NARROWER than the patients    */
/*   app scope in two ways, so reusing it here would be STRICTER than     */
/*   the app and hide rows:                                              */
/*     1. Its primary_location_id fallback is GATED ("only when the       */
/*        patient has NO non-null-location appointment"). patientLocation */
/*        Scope's fallback is UNCONDITIONAL — a patient with a LocA        */
/*        appointment AND primary_location_id=LocB is visible to BOTH      */
/*        LocA (appointment) and LocB (fallback) staff.                    */
/*     2. It matches on appointments.patient_id ONLY; the patients app     */
/*        scope also matches patient_2_id (the secondary participant).     */
/*   patient_visible_to_located_viewer() below mirrors patientLocation-    */
/*   Scope + viewerLocationScope (the no-lockout empty-assignment rule)    */
/*   exactly. It is role-neutral (keys on auth.uid() staff_locations), so  */
/*   it serves admin AND reception from one definition.                    */
/*                                                                    */
/* WRITE matrix:                                                        */
/*   SELECT/UPDATE/DELETE -> the READ scope above (USING). You cannot     */
/*     mutate a row you cannot see. UPDATE WITH CHECK is tenant-only, so   */
/*     a legitimate edit that moves primary_location_id is not blocked;    */
/*     the USING clause already gates WHICH rows the viewer may touch.     */
/*   INSERT -> tenant-only (any authenticated staff). A brand-new patient  */
/*     has no appointment and possibly no location yet, so location/owner  */
/*     ship attaches AFTER (created_by / primary_location_id / first        */
/*     appointment). Scoping INSERT by location would be both wrong (no     */
/*     location yet) and fragile (the NEW row is not visible to a           */
/*     SECURITY DEFINER helper mid-INSERT). The app capability grid         */
/*     (patients:create) is the real create gate; RLS keeps the tenant     */
/*     wall.                                                              */
/*                                                                    */
/* UNTOUCHED (orthogonal, different roles):                             */
/*   patients_patient_selfscope          (0010, TO patient, SELECT)      */
/*   patients_patient_update_selfscope   (0019, TO patient, UPDATE)      */
/*   auth_admin_read_patients            (0010, TO supabase_auth_admin)  */
/*   Only patients_tenant_isolation (0001, TO authenticated, FOR ALL) is  */
/*   replaced. Service-role paths (ingestion, reminders, migration) run    */
/*   BYPASSRLS and are unaffected.                                        */
/*                                                                    */
/* HELPER: one SECURITY DEFINER, STABLE, search_path=public function.     */
/*   Every table read is tenant-filtered on public.jwt_tenant_id(), so no  */
/*   cross-tenant leak is possible even though DEFINER bypasses RLS on      */
/*   appointments/staff_locations/patients. auth.uid() = public.users.id.  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* A. Helper — role-neutral "is this patient at the viewer's location". */
/*    Mirrors apps/web patientLocationScope + viewerLocationScope        */
/*    (no-lockout empty-assignment fallback) exactly.                    */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.patient_visible_to_located_viewer(p_patient_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    -- No-lockout: a viewer with NO staff_locations assignment falls back to
    -- ALL in-tenant (mirrors viewerLocationScope: empty ids -> null -> no
    -- location filter). Prevents locking out an admin/reception not yet
    -- assigned to a clinic.
    NOT EXISTS (
      SELECT 1
      FROM public.staff_locations sl0
      WHERE sl0.user_id   = auth.uid()
        AND sl0.tenant_id = public.jwt_tenant_id()
    )
    -- Appointment basis: an appointment (primary OR secondary patient slot) at
    -- one of the viewer's locations.
    OR EXISTS (
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
    -- Fallback basis (UNCONDITIONAL): primary_location_id at one of the
    -- viewer's locations. Not gated on "no appointments" (that is the 0045
    -- clinical narrowing this deliberately does NOT copy).
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      JOIN public.staff_locations sl2
        ON sl2.location_id = p.primary_location_id
       AND sl2.tenant_id   = p.tenant_id
      WHERE p.id           = p_patient_id
        AND p.tenant_id    = public.jwt_tenant_id()
        AND p.primary_location_id IS NOT NULL
        AND sl2.user_id    = auth.uid()
    )
$$;
--> statement-breakpoint

-- RLS is evaluated as the querying role, so `authenticated` needs EXECUTE even
-- though the body runs as the (BYPASSRLS) owner. NOT granted to `patient` (the
-- portal principal is governed solely by the 0010/0019 self-scope policies).
GRANT EXECUTE ON FUNCTION public.patient_visible_to_located_viewer(uuid) TO authenticated;--> statement-breakpoint

/* ================================================================== */
/* B. Replace the tenant-only staff policy with the PL-09 matrix.       */
/*    Drop ONLY patients_tenant_isolation (0001, TO authenticated).     */
/*    The TO patient / TO supabase_auth_admin policies stay in place.   */
/* ================================================================== */
DROP POLICY "patients_tenant_isolation" ON public.patients;--> statement-breakpoint

/* READ: owner all / admin+reception their-location / therapist own. */
CREATE POLICY "patients_select" ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND public.patient_visible_to_located_viewer(id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.clinical_therapist_sees_patient(id)
      )
    )
  );
--> statement-breakpoint

/* INSERT: tenant-only (see WRITE matrix — new patients have no location yet). */
CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

/* UPDATE: gated by the READ scope (USING); WITH CHECK keeps the tenant wall
   only, so a legitimate edit (incl. moving primary_location_id) is allowed. */
CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND public.patient_visible_to_located_viewer(id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.clinical_therapist_sees_patient(id)
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
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND public.patient_visible_to_located_viewer(id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND public.clinical_therapist_sees_patient(id)
      )
    )
  );
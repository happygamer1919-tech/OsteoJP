-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0043_clinical_records_location_rls.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0043 — clinical_records RLS tighten (R16): strict single-location    */
/*         admin, therapist own-patients, admin WRITE removed.          */
/*                                                                    */
/* OWNER RULING (R16, folded in via CYAN audit frame 20260724T170931Z): */
/*   - admin  = STRICT SINGLE-LOCATION on clinical_records (READ scoped  */
/*              to the admin's staff_locations; WRITE REMOVED — read-only */
/*              on clinical, matching the app permission matrix where     */
/*              admin holds clinical_records:read only).                  */
/*   - therapist = OWN patients only: a record they authored             */
/*              (practitioner_id = auth.uid()) OR a patient they created  */
/*              (patients.created_by) OR a patient they treat/treated as  */
/*              PRIMARY or SECONDARY practitioner (visibility follows      */
/*              appointments). This is the RLS enforcement of the         */
/*              already-app-enforced W10-04 scope (therapistPatientScope, */
/*              owner-approved 2026-07-21) — the "migration-gated follow- */
/*              up" that file's own comment forward-references.           */
/*   - owner  = all in-tenant (UNCHANGED).                                */
/*   - reception = DENIED (no read, no write) — UNCHANGED; re-proven with */
/*              an explicit assertion in the isolation matrix.            */
/*                                                                    */
/* PATIENT -> LOCATION BASIS (owner ruling, R16):                        */
/*   The admin match is EXISTS-over-appointments: a patient with          */
/*   appointments at N locations is visible to admins of ALL N (never     */
/*   collapsed to one "primary" column). PLUS a persisted patients        */
/*   FALLBACK column (primary_location_id) used ONLY for patients with NO */
/*   appointment carrying a non-null location_id. The fallback NEVER       */
/*   overrides the appointment basis (a patient created at A but treated   */
/*   at B stays visible to B's admin).                                     */
/*                                                                    */
/* NULLABILITY DECISION (explicit, no silent-NULL orphaning):            */
/*   primary_location_id is NULLABLE. A zero-appointment patient whose     */
/*   fallback is NULL is UNASSIGNED -> visible to OWNER ONLY (owner = all  */
/*   in-tenant), never to any admin. This is the documented "unassigned   */
/*   -> owner-only" behaviour: clinical data is never orphaned (owner      */
/*   always sees it), and no admin sees an unlocated patient. The go-      */
/*   forward writer (apps/web createPatient) captures the create action's  */
/*   location context EXPLICITLY server-side (never inferred from          */
/*   created_by.staff_locations); absent context -> NULL -> owner-only.    */
/*                                                                    */
/* HELPERS: two SECURITY DEFINER, STABLE, search_path=public functions.   */
/*   Each filters tenant_id = jwt_tenant_id() on EVERY table it reads, so  */
/*   no cross-tenant leak is possible even though DEFINER bypasses RLS on  */
/*   appointments/staff_locations/patients. auth.uid() = public.users.id   */
/*   (the staff principal; forwarded as the JWT `sub` claim).             */
/*                                                                    */
/* The immutability trigger enforce_clinical_record_immutability (0001)    */
/* and the patient self-scope policy clinical_records_patient_selfscope    */
/* (0010, TO patient) are ORTHOGONAL and left UNTOUCHED.                   */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* A. Fallback column: patients.primary_location_id                    */
/*   NULLABLE (see NULLABILITY DECISION above). ON DELETE SET NULL — if  */
/*   the referenced clinic is removed, the patient falls back to         */
/*   unassigned -> owner-only rather than blocking the delete.           */
/* ------------------------------------------------------------------ */

ALTER TABLE "patients" ADD COLUMN "primary_location_id" uuid;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_primary_location_id_locations_id_fk" FOREIGN KEY ("primary_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patients_tenant_primary_location_idx" ON "patients" USING btree ("tenant_id","primary_location_id");--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* B. Backfill (idempotent). Zero rows today on a purged environment,   */
/*   but the statement is REQUIRED and correct for any environment/time- */
/*   point that DOES have patients (this migration outlives the purge).  */
/*                                                                    */
/*   Derivation per patient, in priority order:                         */
/*     1. The location of the patient's EARLIEST appointment that has a   */
/*        non-null location_id (the creating/first-seen clinic).         */
/*     2. Else, the creating staffer's SINGLE staff_locations membership  */
/*        — ONLY when the creator belongs to EXACTLY ONE location. A       */
/*        creator in 2+ clinics is AMBIGUOUS (CYAN's "which one?"), so we  */
/*        leave NULL -> unassigned -> owner-only rather than guess.        */
/*     3. Else NULL (unassigned -> owner-only).                          */
/*                                                                    */
/*   Idempotent: only fills rows still NULL, so a re-run never overwrites  */
/*   a value. Note the fallback column is CONSULTED only for zero-(non-    */
/*   null-location)-appointment patients; filling it for appointment-      */
/*   having patients is harmless (never read) and keeps the column         */
/*   sensibly populated.                                                  */
/* ------------------------------------------------------------------ */

UPDATE "patients" p
SET "primary_location_id" = COALESCE(
  (
    SELECT a.location_id
    FROM public.appointments a
    WHERE a.patient_id = p.id
      AND a.tenant_id = p.tenant_id
      AND a.location_id IS NOT NULL
    ORDER BY a.starts_at ASC, a.created_at ASC
    LIMIT 1
  ),
  (
    -- (array_agg)[1] returns the SINGLE membership location; the HAVING clause
    -- yields a row ONLY when the creator has exactly one (uuid has no max()
    -- aggregate, hence array_agg over max/min).
    SELECT (array_agg(sl.location_id))[1]
    FROM public.staff_locations sl
    WHERE sl.tenant_id = p.tenant_id
      AND sl.user_id = p.created_by
    HAVING count(*) = 1
  )
)
WHERE p."primary_location_id" IS NULL;--> statement-breakpoint

/* ================================================================== */
/* C. Helpers — SECURITY DEFINER, STABLE, search_path=public pinned.    */
/*    Every table read is tenant-filtered on public.jwt_tenant_id().     */
/* ================================================================== */

/* Admin location scope: TRUE when the CURRENT admin (auth.uid()) shares a */
/* location with the patient. Appointment basis first (EXISTS over every   */
/* appointment location — multi-location patients reach every location's    */
/* admin); the fallback basis applies ONLY when the patient has NO           */
/* appointment carrying a non-null location_id (closing the null-location    */
/* edge: such a patient resolves to no location under the appointment basis, */
/* so the persisted fallback still decides visibility).                      */
CREATE OR REPLACE FUNCTION public.clinical_admin_sees_patient(p_patient_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.staff_locations sl
        ON sl.location_id = a.location_id
       AND sl.tenant_id   = a.tenant_id
      WHERE a.patient_id   = p_patient_id
        AND a.tenant_id    = public.jwt_tenant_id()
        AND a.location_id IS NOT NULL
        AND sl.user_id     = auth.uid()
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.appointments a2
        WHERE a2.patient_id  = p_patient_id
          AND a2.tenant_id   = public.jwt_tenant_id()
          AND a2.location_id IS NOT NULL
      )
      AND EXISTS (
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
    )
$$;
--> statement-breakpoint

/* Therapist patient scope: TRUE when the patient is one the CURRENT        */
/* therapist (auth.uid()) CREATED, or treats/treated as PRIMARY or          */
/* SECONDARY practitioner. Mirrors apps/web therapistPatientScope (W10-04)   */
/* exactly, so RLS is true defense-in-depth (never STRICTER than the app,    */
/* which would silently hide rows the app intends to show — e.g. the review  */
/* queue). The record-author signal (clinical_records.practitioner_id =      */
/* auth.uid()) is added INLINE in the policies (it is a clinical_records      */
/* column, not a patient-scope fact).                                        */
CREATE OR REPLACE FUNCTION public.clinical_therapist_sees_patient(p_patient_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id         = p_patient_id
        AND p.tenant_id  = public.jwt_tenant_id()
        AND p.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE (a.patient_id = p_patient_id OR a.patient_2_id = p_patient_id)
        AND a.tenant_id   = public.jwt_tenant_id()
        AND (a.practitioner_id = auth.uid() OR a.practitioner_2_id = auth.uid())
    )
$$;
--> statement-breakpoint

-- RLS is evaluated as the querying role, so `authenticated` needs EXECUTE on
-- both helpers even though each runs its body as the (BYPASSRLS) owner. NOT
-- granted to `patient`: the patient principal is governed solely by the 0010
-- self-scope policy (TO patient) and never reaches these staff policies.
GRANT EXECUTE ON FUNCTION public.clinical_admin_sees_patient(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.clinical_therapist_sees_patient(uuid) TO authenticated;--> statement-breakpoint

/* ================================================================== */
/* D. Rewrite the clinical_records STAFF policies (TO authenticated).    */
/*    Drop the 0001 role-list policies (owner/admin/therapist tenant-    */
/*    wide) and replace with the R16 location/patient-scoped matrix.     */
/*    The 0010 patient self-scope policy (TO patient) is a SEPARATE      */
/*    policy on the same table and is NOT dropped here.                  */
/* ================================================================== */

DROP POLICY "clinical_records_select" ON public.clinical_records;--> statement-breakpoint
DROP POLICY "clinical_records_insert" ON public.clinical_records;--> statement-breakpoint
DROP POLICY "clinical_records_update" ON public.clinical_records;--> statement-breakpoint
DROP POLICY "clinical_records_delete" ON public.clinical_records;--> statement-breakpoint

/* READ matrix:
     owner     -> all in-tenant
     admin     -> own-location only (appointment basis OR fallback)
     therapist -> authored record OR own patient (created/treats)
     reception -> DENIED (matches no branch)
*/
CREATE POLICY "clinical_records_select" ON public.clinical_records
  FOR SELECT
  TO authenticated
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
        )
      )
    )
  );
--> statement-breakpoint

/* WRITE matrix (INSERT/UPDATE/DELETE):
     owner     -> all in-tenant
     therapist -> authored record OR own patient (created/treats)
     admin     -> WRITE REMOVED (read-only on clinical)
     reception -> DENIED
   Immutability of locked/signed rows stays enforced by the 0001 BEFORE
   trigger (untouched); these policies gate WHO may touch a row, the trigger
   gates WHICH rows.
*/
CREATE POLICY "clinical_records_insert" ON public.clinical_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
        )
      )
    )
  );
--> statement-breakpoint

CREATE POLICY "clinical_records_update" ON public.clinical_records
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
        )
      )
    )
  );
--> statement-breakpoint

CREATE POLICY "clinical_records_delete" ON public.clinical_records
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
        )
      )
    )
  );

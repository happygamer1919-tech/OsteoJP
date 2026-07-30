/* ================================================================== */
/* 0049 — appointments RLS: add the `created_by = auth.uid()` escape.     */
/*        PL-11 (owner ruling 2026-07-30: "all active staff roles may      */
/*        create and edit appointments"; availability is advisory).        */
/*                                                                    */
/* THE BUG 0049 FIXES. 0048 shipped `appointments_rls` FOR ALL with        */
/*   read-scope == write-scope and, UNLIKE the patients policy (0047),      */
/*   NO `created_by = auth.uid()` branch. Because createAppointment does    */
/*   `insert into appointments ... returning`, the SELECT (USING) policy    */
/*   is applied to the RETURNING row AND the WITH CHECK to the new row.     */
/*   Consequence for a LOCATION-SCOPED admin/reception (e.g. Lurdes): a     */
/*   save whose location_id is outside their staff_locations fails WITH     */
/*   CHECK -> the INSERT is rejected -> createAppointment throws -> the      */
/*   team sees "appointment save blocked". This contradicts the owner        */
/*   ruling that every active staff role may create/edit appointments.       */
/*                                                                    */
/* THE FIX mirrors 0047 EXACTLY: add `created_by = (select auth.uid())` to  */
/*   USING + WITH CHECK. createAppointment sets created_by = actor.userId,   */
/*   so the creator's OWN new row always satisfies WITH CHECK (every staff   */
/*   role may create) and USING (RETURNING-safe). The escape is             */
/*   creator-specific: a row a viewer did NOT create is still governed by    */
/*   the PL-09 read scope (owner-all / therapist-own[primary|secondary] /    */
/*   admin+reception-own-location / unassigned-all), so visibility of        */
/*   OTHERS' appointments is unchanged. Cross-tenant stays walled by the     */
/*   top-level tenant_id = jwt_tenant_id() (created_by is a within-tenant    */
/*   uid). No table, column, function, or other policy is touched — only     */
/*   appointments_rls is replaced. appointments_patient_selfscope (0010,     */
/*   TO patient) is a different role and is left intact.                     */
/* ================================================================== */

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
          NOT public.viewer_has_location_assignment()
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
          NOT public.viewer_has_location_assignment()
          OR (location_id IS NOT NULL AND public.location_in_viewer_scope(location_id))
        )
      )
    )
  );

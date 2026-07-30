-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0048_appointments_location_rls.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0048 — appointments RLS: PL-09 Phase 2b (defense-in-depth) + the      */
/*        SECURITY DEFINER conflict function booking needs to keep        */
/*        working once appointments (and patients, 0047) are scoped.      */
/*                                                                    */
/* PL-09 (owner ruling 2026-07-29) applied to the appointments table.     */
/* READ + WRITE matrix (staff, TO authenticated):                        */
/*   owner     -> all in-tenant.                                          */
/*   therapist -> OWN agenda: appointments where they are the PRIMARY or  */
/*                SECONDARY practitioner (practitioner_id / _2_id).        */
/*   admin     -> their location(s): appointments.location_id in the       */
/*                viewer's staff_locations. UNASSIGNED viewer -> all        */
/*                (no-lockout, mirrors 0047 + viewerLocationScope).         */
/*   reception -> SAME location basis as admin.                            */
/*                                                                    */
/* WHY DIRECT COLUMNS (the 0047 INSERT...RETURNING lesson): createAppoint- */
/*   ment does `insert into appointments ... returning`, and the SELECT     */
/*   policy is applied to the RETURNING row. So the policy references the    */
/*   NEW row's OWN columns (practitioner_id, practitioner_2_id, location_id) */
/*   directly and the helpers touch only staff_locations — never a self-     */
/*   query of appointments, which would not see the just-inserted row and    */
/*   would reject the RETURNING. FOR ALL with the same predicate in USING +   */
/*   WITH CHECK: read scope == write scope for every role (you may only        */
/*   create/move an appointment into your own scope).                          */
/*                                                                    */
/* THE CONFLICT FUNCTION — appointment_conflicts():                        */
/*   Booking's double-booking check (apps/web lib/scheduling/conflict.ts)   */
/*   must see conflicts REGARDLESS of the booker's row scope: a ROOM clash   */
/*   spans therapists, and a THERAPIST clash spans locations (a therapist    */
/*   cannot be in two clinics at once). Under scoped appointments RLS a      */
/*   therapist/reception would no longer see those rows -> silent double-     */
/*   booking. It ALSO patches a latent gap 0047 already introduced: the      */
/*   conflict query INNER JOINs patients, so a scoped patients policy         */
/*   silently DROPS a room conflict whose patient the booker cannot see.      */
/*   This SECURITY DEFINER function runs as the (BYPASSRLS) owner over both    */
/*   appointments AND patients, tenant-filtered on jwt_tenant_id(), so it      */
/*   returns the FULL conflict set. It is READ-ONLY and returns only the       */
/*   fields the warning UI needs (id, patient name, window, room, kind).       */
/*                                                                    */
/* UNTOUCHED: appointments_patient_selfscope (0010, TO patient) is a         */
/*   different role and stays. Only appointments_tenant_isolation (0001,      */
/*   TO authenticated) is replaced. Service-role paths run BYPASSRLS.         */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* A. Conflict function — SECURITY DEFINER, tenant-filtered, read-only. */
/*    Mirrors conflict.ts findConflicts: therapist-overlap (same         */
/*    practitioner) + room-overlap (same location + case-insensitive     */
/*    room), half-open window, cancelled excluded, own rows excluded.    */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.appointment_conflicts(
  p_practitioner uuid,
  p_location uuid,
  p_room text,
  p_starts timestamptz,
  p_ends timestamptz,
  p_exclude uuid[]
)
  RETURNS TABLE (
    id uuid,
    patient_name text,
    starts_at timestamptz,
    ends_at timestamptz,
    room text,
    kind text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  -- therapist overlap: same practitioner, overlapping window.
  SELECT a.id, p.full_name, a.starts_at, a.ends_at, a.room, 'therapist'::text
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  WHERE a.tenant_id = public.jwt_tenant_id()
    AND a.status <> 'cancelled'
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.practitioner_id = p_practitioner
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
  UNION ALL
  -- room overlap: same location + same room (case-insensitive), only when a
  -- room is given. A null-room appointment never conflicts on room.
  SELECT a.id, p.full_name, a.starts_at, a.ends_at, a.room, 'room'::text
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  WHERE p_room IS NOT NULL
    AND btrim(p_room) <> ''
    AND a.tenant_id = public.jwt_tenant_id()
    AND a.status <> 'cancelled'
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.location_id = p_location
    AND lower(a.room) = lower(btrim(p_room))
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.appointment_conflicts(uuid, uuid, text, timestamptz, timestamptz, uuid[]) TO authenticated;--> statement-breakpoint

/* ================================================================== */
/* B. Replace the tenant-only staff policy with the PL-09 matrix.        */
/*    Reuses the 0047 helpers viewer_has_location_assignment() +          */
/*    location_in_viewer_scope(uuid). Direct columns only (RETURNING-safe).*/
/* ================================================================== */
DROP POLICY "appointments_tenant_isolation" ON public.appointments;--> statement-breakpoint

CREATE POLICY "appointments_rls" ON public.appointments
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
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
      (select public.jwt_role()) = 'owner'
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
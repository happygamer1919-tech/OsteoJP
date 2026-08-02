/* ================================================================== */
/* 0052 — a no_show RELEASES its slot (owner ruling S1).              */
/*                                                                    */
/* THE RULING. The blocking set becomes scheduled + confirmed +        */
/*   completed. `cancelled` and `no_show` both release the slot.       */
/*   Rationale: the patient did not attend, the therapist was in fact  */
/*   free, and the row is historical rather than an occupation.        */
/*   `completed` stays blocking on conservative grounds — an overlap   */
/*   with a completed session is always a data error and rejecting it  */
/*   costs nothing.                                                    */
/*                                                                    */
/* WHAT CHANGES. Exactly two predicates inside                        */
/*   public.appointment_conflicts(), one per branch:                   */
/*     the status test now excludes no_show as well as cancelled.      */
/*   Everything else in the function body is reproduced VERBATIM from  */
/*   0048 so the diff reads as a two-line change.                      */
/*                                                                    */
/* WHY 0048'S HEADER IS NOT EDITED. 0048 is already applied. Its       */
/*   header ("cancelled excluded") correctly describes what 0048 did.  */
/*   Rewriting an applied migration would make the file stop           */
/*   describing what actually ran on prod. The corrected description   */
/*   belongs here, where the behaviour actually changes.               */
/*                                                                    */
/* THE THIRD SITE. The same predicate exists in the app layer at       */
/*   apps/api/lib/appointments/store.ts. It is changed in the SAME PR  */
/*   as this migration. They are not allowed to drift:                 */
/*   apps/api/lib/appointments/blocking-status.test.ts reads BOTH this */
/*   file and store.ts as text and fails if they express different     */
/*   sets. Landing either half alone turns CI red, by design.          */
/*                                                                    */
/* SAFETY. CREATE OR REPLACE preserves the owner, the SECURITY         */
/*   DEFINER attribute, the STABLE marker and existing EXECUTE grants; */
/*   the signature is unchanged so nothing dependent breaks and no     */
/*   re-GRANT is needed. No data is read, written, or backfilled. No   */
/*   table is locked. Reversible by re-applying the 0048 body.         */
/*                                                                    */
/* NO PAST-DATE EXPOSURE (verified, not assumed). Freeing a past       */
/*   no_show does NOT make a past date bookable by a patient. The      */
/*   patient slot sweep is floored three times over in                 */
/*   store.ts listOpenSlots: the day grid is generated from now::date  */
/*   forward, the sweep carries `where s.starts_at > now`, and         */
/*   bookAppointment / rescheduleAppointment throw slot_in_past on     */
/*   submit. Staff availability is deliberately NOT floored (staff may */
/*   record a past walk-in), so a past no_show will now read as free   */
/*   in the STAFF agenda — which is the intended meaning of the ruling */
/*   and grants staff no capability they did not already have.         */
/* ================================================================== */

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
    AND a.status NOT IN ('cancelled', 'no_show')   -- 0052: was <> 'cancelled'
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
    AND a.status NOT IN ('cancelled', 'no_show')   -- 0052: was <> 'cancelled'
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.location_id = p_location
    AND lower(a.room) = lower(btrim(p_room))
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
$$;

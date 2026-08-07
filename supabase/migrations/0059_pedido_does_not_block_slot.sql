-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0059_pedido_does_not_block_slot.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0059 — an UNCONFIRMED pedido does not occupy a slot (JP option B).  */
/*                                                                    */
/* THE RULING. A portal booking arrives as a `pedido` — an appointment */
/*   row at status `scheduled` with an `appointment_request`           */
/*   notification, awaiting reception's confirmation. JP ruled option  */
/*   B: an unconfirmed pedido must NOT hold the slot against anyone    */
/*   else. Staff may book over it, and another patient may book it,    */
/*   until reception actually confirms.                                */
/*                                                                    */
/* WHAT CHANGES. Exactly one added clause per branch inside            */
/*   public.appointment_conflicts(). Everything else in the body is    */
/*   reproduced VERBATIM from 0052, so the diff reads as two added     */
/*   NOT EXISTS predicates and nothing else.                           */
/*                                                                    */
/* WHY THE PREDICATE IS "scheduled AND HAS AN appointment_request ROW" */
/*   AND NOT SOMETHING SIMPLER. Both simpler markers were checked      */
/*   against the code and REFUSED on evidence, not on taste:           */
/*                                                                    */
/*   `created_by IS NULL` as the portal marker. Refused.               */
/*     packages/db/tests/appointments-created-by-provenance.test.ts    */
/*     proves 7/7 against live Postgres that 0049's WITH CHECK is a    */
/*     DISJUNCTION, so a STAFF principal satisfying another branch may */
/*     insert a null `created_by` and the database accepts it. Keying  */
/*     the exclusion on it would move staff rows into the             */
/*     does-not-block set. That is a double-booking generator, which   */
/*     is the one outcome this function exists to prevent.             */
/*                                                                    */
/*   Status alone. Refused: `scheduled` is also the status of an       */
/*     ordinary staff-created booking. Excluding every `scheduled` row */
/*     would free almost every future appointment in the clinic.       */
/*                                                                    */
/*   The conjunction is what makes it exact. `appointment_request` is  */
/*   written ONLY by the portal booking path                           */
/*   (apps/api/lib/notifications/patient-change.ts) and its CHECK      */
/*   constraint in 0055 pins the vocabulary, so the row's existence is */
/*   the provenance record. A staff booking has no such row and keeps  */
/*   blocking; a confirmed pedido leaves `scheduled` and keeps         */
/*   blocking from that moment on.                                     */
/*                                                                    */
/* WHY THIS IS A MIGRATION AND NOT AN APP-LAYER FILTER. The obvious    */
/*   alternative — return the same rows and filter them in             */
/*   apps/web/lib/scheduling/conflict.ts — cannot work, and the reason */
/*   is RLS rather than convenience. The only provenance is a          */
/*   `staff_notifications` row whose SELECT policy (0055) is pinned to */
/*   `recipient_user_id = auth.uid()`. A caller who is NOT a recipient */
/*   — an admin, or a therapist not on the appointment — would see no  */
/*   notification and classify every pedido as an ordinary booking. It */
/*   would then block THEM and not reception, inconsistently and       */
/*   invisibly. Inside this function the read is SECURITY DEFINER, so  */
/*   it sees the row regardless of who is asking and every caller gets */
/*   the SAME answer. That consistency is the point.                   */
/*                                                                    */
/* THE SECURITY DEFINER READ IS AN EXISTENCE TEST AND NOTHING ELSE.    */
/*   It returns no notification column, no recipient, no message and   */
/*   no id. It answers exactly one question — "is this appointment a   */
/*   pedido" — and the function's own output columns are unchanged, so */
/*   this widens no caller's visibility by one field. It is the        */
/*   narrowest read that answers the question.                         */
/*                                                                    */
/* THIS IS ONE OF THREE SITES AND THEY LAND TOGETHER. The same         */
/*   exclusion is added in the same PR to                              */
/*   apps/api/lib/appointments/store.ts (patient booking + open-slot   */
/*   sweep) and apps/web/lib/scheduling/day-availability.ts (staff     */
/*   free-interval display). Shipping half would make the portal and   */
/*   the staff agenda disagree about which slots are free, which is    */
/*   precisely what PG8 (SYNC) exists to prove does not happen.        */
/*   apps/api/lib/appointments/blocking-status.test.ts reads all three */
/*   as TEXT and fails if any one of them lacks the exclusion, so      */
/*   landing them separately turns CI red by design.                   */
/*                                                                    */
/* WHAT THIS DOES NOT WEAKEN. The confirm path keeps its transactional */
/*   re-check: confirmAppointmentRequest takes the slot locks, calls   */
/*   this function inside the transaction, and repeats the status      */
/*   predicate on the UPDATE. So two pedidos may coexist on one slot   */
/*   — which is the ruling — but the SECOND confirm finds the first    */
/*   one now `confirmed`, and `confirmed` has always blocked. Two      */
/*   confirms cannot both succeed.                                     */
/*                                                                    */
/* SAFETY. CREATE OR REPLACE preserves the owner, the SECURITY         */
/*   DEFINER attribute, the STABLE marker and existing EXECUTE grants; */
/*   the signature is unchanged, so nothing dependent breaks and no    */
/*   re-GRANT is needed. No data is read, written or backfilled. No    */
/*   table is locked. Reversible by re-applying the 0052 body.         */
/*                                                                    */
/* STABLE IS STILL CORRECT. The added read touches                     */
/*   `staff_notifications`, another ordinary table; STABLE promises    */
/*   consistency within a single statement, which a second table read  */
/*   does not violate. IMMUTABLE would have been wrong before and      */
/*   after.                                                            */
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
    AND NOT (                                      -- 0059: unconfirmed pedido
      a.status = 'scheduled'
      AND EXISTS (
        SELECT 1 FROM public.staff_notifications n
        WHERE n.appointment_id = a.id
          AND n.kind = 'appointment_request'
      )
    )
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
    AND NOT (                                      -- 0059: unconfirmed pedido
      a.status = 'scheduled'
      AND EXISTS (
        SELECT 1 FROM public.staff_notifications n
        WHERE n.appointment_id = a.id
          AND n.kind = 'appointment_request'
      )
    )
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.location_id = p_location
    AND lower(a.room) = lower(btrim(p_room))
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
$$;

-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0059_pedido_does_not_block_slot.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0059 — an UNCONFIRMED pedido does not occupy a slot (JP option B).  */
/*                                                                    */
/* THE RULING. A portal booking arrives as a `pedido`: an appointment  */
/*   row at status `scheduled` carrying an `appointment_request`       */
/*   notification, awaiting reception's confirmation. JP ruled option  */
/*   B — an unconfirmed pedido must NOT hold the slot against anyone   */
/*   else. Staff may book over it and another patient may book it,     */
/*   until reception actually confirms.                                */
/*                                                                    */
/* THIS MIGRATION SHIPS ONE HELPER AND ONE EDIT.                       */
/*   1. public.is_unconfirmed_pedido(uuid) — the SINGLE definition of  */
/*      "this appointment is an unconfirmed pedido".                   */
/*   2. public.appointment_conflicts() — 0052's body VERBATIM plus one */
/*      call to that helper per branch.                                */
/*                                                                    */
/* ================================================================== */
/* WHY A HELPER FUNCTION AND NOT AN INLINE `NOT EXISTS`.               */
/* ================================================================== */
/*                                                                    */
/* THE SAME EXCLUSION IS NEEDED AT THREE SITES, and two of them are    */
/*   ordinary application queries that CANNOT PERFORM THIS READ AT ALL */
/*   under their own privileges. This is the fact that decides the     */
/*   design, and it is worth stating precisely because an inline       */
/*   predicate looks obviously simpler until you check it:             */
/*                                                                    */
/*   apps/api/lib/appointments/store.ts runs as the `patient` role     */
/*     (withPatientContext -> `set local role patient`). That role has */
/*     no grant on `staff_notifications` whatsoever. An inline EXISTS  */
/*     would not return false — it would ERROR.                        */
/*                                                                    */
/*   apps/web/lib/scheduling/day-availability.ts runs as              */
/*     `authenticated`, which CAN read `staff_notifications` — but the */
/*     0055 SELECT policy pins it to `recipient_user_id = auth.uid()`. */
/*     A caller who is not a recipient (an admin, a therapist not on   */
/*     the appointment) would see no row, conclude "not a pedido", and */
/*     the pedido would keep blocking THEM while not blocking          */
/*     reception. Inconsistent and invisible: the worst shape a        */
/*     scheduling bug can take, because each person's screen is        */
/*     self-consistent.                                                */
/*                                                                    */
/*   SECURITY DEFINER makes the answer THE SAME FOR EVERY CALLER,      */
/*     which is the property the ruling actually requires. "Is this    */
/*     slot free" must not depend on who is asking.                    */
/*                                                                    */
/* ONE DEFINITION, THREE CALLERS. The alternative — three copies of    */
/*   the predicate — is the exact shape that drifted before and        */
/*   produced the S1 incident that blocking-status.test.ts was written */
/*   for. Here the app sites call the function by NAME, so they cannot */
/*   express a different rule; they can only fail to call it, which is */
/*   what the extended drift guard checks.                             */
/*                                                                    */
/* ================================================================== */
/* WHY THE PREDICATE IS "scheduled AND HAS AN appointment_request ROW" */
/* ================================================================== */
/*                                                                    */
/* Both simpler markers were checked against the code and REFUSED on   */
/*   evidence rather than on taste:                                    */
/*                                                                    */
/*   `created_by IS NULL` as the portal marker. REFUSED.               */
/*     packages/db/tests/appointments-created-by-provenance.test.ts    */
/*     proves 7/7 against live Postgres that 0049's WITH CHECK is a    */
/*     DISJUNCTION, so a STAFF principal satisfying another branch may */
/*     insert a null `created_by` and the database accepts it. Keying  */
/*     the exclusion on it would move STAFF rows into the              */
/*     does-not-block set. That is a double-booking generator, and a   */
/*     double booking is the one outcome this function exists to       */
/*     prevent.                                                        */
/*                                                                    */
/*   Status alone. REFUSED: `scheduled` is also the status of an       */
/*     ordinary staff booking, so excluding it would free almost every */
/*     future appointment in the clinic.                               */
/*                                                                    */
/* THE CONJUNCTION IS WHAT MAKES IT EXACT. `appointment_request` is    */
/*   written only by the portal booking path                           */
/*   (apps/api/lib/notifications/patient-change.ts) and 0055's CHECK   */
/*   constraint pins the vocabulary, so the row's existence IS the     */
/*   provenance record. A staff booking has no such row and keeps      */
/*   blocking. A confirmed pedido leaves `scheduled` and blocks again  */
/*   from that moment.                                                 */
/*                                                                    */
/* THE KNOWN WEAKNESS, recorded rather than hidden: emitPatientChange  */
/*   is best-effort and never throws                                   */
/*   (apps/api/lib/notifications/patient-change.ts:138). If that write */
/*   fails, the appointment exists with no `appointment_request` row.  */
/*   It is then invisible in reception's queue AND blocks like a staff */
/*   booking. That fails in the SAFE direction — it over-blocks, never */
/*   under-blocks — but it is the one place where losing a row loses a */
/*   pedido. Carded separately; not fixed here, because fixing it is a */
/*   change to the emit path and not to occupancy.                     */
/*                                                                    */
/* ================================================================== */
/* WHAT THIS DOES NOT WEAKEN.                                          */
/* ================================================================== */
/*                                                                    */
/* THE CONFIRM PATH KEEPS ITS TRANSACTIONAL RE-CHECK, unchanged.       */
/*   confirmAppointmentRequest takes the slot advisory locks, calls    */
/*   this function INSIDE the transaction, and repeats the status      */
/*   predicate on the UPDATE. So two pedidos may now coexist on one    */
/*   slot — which is the ruling — but the second confirm finds the     */
/*   first one `confirmed`, and `confirmed` has always blocked. Two    */
/*   confirms cannot both succeed.                                     */
/*                                                                    */
/* SAFETY. CREATE OR REPLACE preserves the owner, the SECURITY         */
/*   DEFINER attribute, the STABLE marker and existing EXECUTE grants; */
/*   the signature is unchanged so nothing dependent breaks and the    */
/*   0048 grant still holds. No data is read, written or backfilled.   */
/*   No table is locked. Reversible by re-applying the 0052 body.      */
/*                                                                    */
/* STABLE IS STILL CORRECT. The added read touches another ordinary    */
/*   table; STABLE promises consistency within a single statement,     */
/*   which a second table read does not violate.                       */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* 1. The single definition.                                           */
/*                                                                    */
/* IT RETURNS A BOOLEAN AND NOTHING ELSE. No notification id, no       */
/*   recipient, no message, no kind. It answers exactly one question,  */
/*   which is the narrowest read that can answer it, and it widens no  */
/*   caller's visibility by a single field.                            */
/*                                                                    */
/* TENANT-SCOPED EVEN THOUGH IT IS SECURITY DEFINER, and deliberately: */
/*   a definer function bypasses RLS, so without this clause a caller  */
/*   could probe appointment ids across tenants. With it, an id        */
/*   outside the caller's tenant simply answers false. Inside the      */
/*   tenant the only fact obtainable is whether a given appointment    */
/*   uuid is a pedido, for an id the caller must already possess;      */
/*   appointment ids are uuids and not enumerable.                     */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.is_unconfirmed_pedido(p_appointment uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.staff_notifications n ON n.appointment_id = a.id
    WHERE a.id = p_appointment
      AND a.tenant_id = public.jwt_tenant_id()
      AND a.status = 'scheduled'
      AND n.kind = 'appointment_request'
  )
$$;
--> statement-breakpoint

/* Both roles need it, and the reason differs per role.
   `authenticated` is the staff agenda and the conflict function's callers.
   `patient` is the portal slot sweep in apps/api, which runs under
   `set local role patient` and has no grant on staff_notifications at all —
   this function is the ONLY way that path can answer the question. */
GRANT EXECUTE ON FUNCTION public.is_unconfirmed_pedido(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_unconfirmed_pedido(uuid) TO patient;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 2. The conflict function. 0052's body verbatim, plus one call per   */
/*    branch. The signature is unchanged, so 0048's GRANT still holds  */
/*    and nothing dependent breaks.                                    */
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
    AND a.status NOT IN ('cancelled', 'no_show')   -- 0052: was <> 'cancelled'
    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B
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
    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B
    AND a.starts_at < p_ends
    AND a.ends_at > p_starts
    AND a.location_id = p_location
    AND lower(a.room) = lower(btrim(p_room))
    AND (p_exclude IS NULL OR a.id <> ALL (p_exclude))
$$;

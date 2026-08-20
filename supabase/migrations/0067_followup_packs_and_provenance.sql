-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0067_followup_packs_and_provenance.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ------------------------------------------------------------------ */
/* 0067 - FOUR CHANGES THE 2026-08-20 BATCH NEEDS, IN ONE MIGRATION.   */
/*                                                                    */
/*   1. appointments.origin        provenance for a portal pedido      */
/*   2. appointments.pack_instance_id  a pacote session IS a booking   */
/*   3. patient_pack_instances.legacy_consumed  balances preserved     */
/*   4. two patient_followup_* tables  the recuperacao surface         */
/*                                                                    */
/* ONE MIGRATION BY OWNER RULING 2026-08-20, because rule 8 allows one */
/* in flight repo-wide and the batch needs all four. They are          */
/* unrelated in subject and identical in risk profile: additive        */
/* columns with defaults, two new tables, and ONE data backfill that   */
/* is an arithmetic identity.                                         */
/* ------------------------------------------------------------------ */


/* ================================================================== */
/* 1. appointments.origin - WHERE THE ROW CAME FROM.                   */
/* ================================================================== */
/* Q-PEDIDO-EMIT-1, RULED 2026-08-20, option A: a portal booking that  */
/* cannot be recorded as a pedido is NOT refused to the patient. The   */
/* provenance column is the agreed fix.                               */
/*                                                                    */
/* WHAT IT REPLACES AND WHY THAT MATTERS. Today the ONLY record in the */
/* database saying "a patient asked for this" is a staff_notifications */
/* row with kind='appointment_request'. 0059's is_unconfirmed_pedido   */
/* JOINS on exactly that row. The emit is best-effort and cannot fail  */
/* the booking - correctly, a patient whose booking succeeded must not */
/* be told it failed because reception's notification could not be     */
/* written - so when the emit fails the appointment becomes            */
/* INDISTINGUISHABLE FROM A STAFF BOOKING: reception is never told to  */
/* confirm it, AND IT BLOCKS ITS SLOT as though it had been confirmed. */
/* The request is lost and the slot is taken by nothing.              */
/*                                                                    */
/* WHY created_by IS NULL CANNOT SERVE, so nobody proposes it again:   */
/* packages/db/tests/appointments-created-by-provenance.test.ts proves */
/* 7/7 against live Postgres that 0049's WITH CHECK is a DISJUNCTION,  */
/* so a STAFF principal may insert a null created_by. The absence of a */
/* creator does not identify a patient.                                */
/* ------------------------------------------------------------------ */

ALTER TABLE public.appointments
  ADD COLUMN origin text NOT NULL DEFAULT 'staff';--> statement-breakpoint

/* TWO VALUES, NOT THREE. A 'guest' value was considered and rejected:  */
/* a guest request is CONVERTED by reception, so the appointment really */
/* is staff-created, and the guest_booking_requests row is already its  */
/* own provenance record. An enum member nothing writes is a value a    */
/* future reader has to work out the meaning of.                       */
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_origin_check
  CHECK (origin IN ('staff', 'patient_portal'));--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* THE BACKFILL, AND WHAT IT HONESTLY CANNOT RECOVER.                  */
/*                                                                    */
/* Every existing row defaults to 'staff', which is WRONG for portal   */
/* bookings already in the table. They are recovered from the only     */
/* record that exists for them - the notification row this column is   */
/* replacing.                                                         */
/*                                                                    */
/* A PEDIDO WHOSE NOTIFICATION WAS NEVER WRITTEN IS NOT IN THIS        */
/* BACKFILL AND CANNOT BE. That row is the exact failure this column   */
/* exists to prevent; it was already invisible before this migration   */
/* and it stays invisible for history. THE COLUMN PREVENTS THE NEXT    */
/* ONE, it does not recover the last one. Stated here rather than left */
/* for somebody to discover that the backfill "missed" rows.          */
/* ------------------------------------------------------------------ */
UPDATE public.appointments a
  SET origin = 'patient_portal'
  WHERE EXISTS (
    SELECT 1 FROM public.staff_notifications n
    WHERE n.appointment_id = a.id
      AND n.kind = 'appointment_request'
  );--> statement-breakpoint

/* PARTIAL, because 'staff' is almost every row and indexing it would  */
/* index the table. This serves reception finding portal requests.     */
CREATE INDEX IF NOT EXISTS appointments_tenant_origin_idx
  ON public.appointments (tenant_id, starts_at DESC)
  WHERE origin <> 'staff';--> statement-breakpoint

COMMENT ON COLUMN public.appointments.origin IS
  'WHERE THE ROW CAME FROM. staff = created on the staff platform (the '
  'default, and every pre-0067 row unless the backfill found otherwise); '
  'patient_portal = created by a PATIENT PRINCIPAL through the portal. '
  'Q-PEDIDO-EMIT-1, ruled 2026-08-20. This is what is_unconfirmed_pedido '
  'keys on: before 0067 it joined staff_notifications, so a failed '
  'best-effort notification emit made a patient request indistinguishable '
  'from a staff booking AND left it blocking its slot. The function reads this OR the old notification row - a disjunction, so the window between applying this migration and deploying the code that writes the column cannot regress. Backfilled from '
  'those notification rows; a pedido whose notification was never written '
  'was already invisible and is not recoverable. Migration 0067.';--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* is_unconfirmed_pedido, REKEYED. 0059's body with the JOIN replaced. */
/*                                                                    */
/* CREATE OR REPLACE, so every existing GRANT and every caller is      */
/* untouched - 0052's conflict function calls it, the staff agenda     */
/* calls it, and the portal slot sweep calls it under `role patient`,  */
/* which has no grant on staff_notifications at all and for which this */
/* function is the ONLY way to ask the question.                      */
/*                                                                    */
/* THE STATUS TEST IS UNCHANGED AND IS THE 'UNCONFIRMED' HALF. `origin` */
/* is PROVENANCE and never changes; a pedido reception confirms moves  */
/* to status='confirmed' and stops matching here, exactly as before.   */
/*                                                                    */
/* IT IS A DISJUNCTION, NOT A REPLACEMENT, AND THAT IS A CORRECTION    */
/* THE DB-GATED SUITE FORCED. The first draft keyed on `origin` ALONE, */
/* which is what the ruling asks for and is WRONG FOR A WINDOW ON      */
/* PRODUCTION:                                                        */
/*                                                                    */
/*   rule 7 applies a migration BEFORE its PR merges, so between the   */
/*   apply and the deploy of the app change the OLD code is still      */
/*   creating portal bookings - with no `origin`, therefore 'staff'.   */
/*   Keyed on origin alone, every pedido created in that window would  */
/*   read as a staff booking: reception never told, AND THE SLOT       */
/*   BLOCKED. That is worse than the defect being fixed, and it would  */
/*   have shipped silently.                                           */
/*                                                                    */
/* pedido-does-not-block.db.test.ts caught it: five assertions went    */
/* red because they seed a pedido the way the product does TODAY.      */
/*                                                                    */
/* THE DISJUNCTION COSTS NOTHING AND WEAKENS NOTHING. `origin` catches */
/* the case the notification cannot - a pedido whose best-effort emit  */
/* FAILED - which is the entire point of the column. The notification  */
/* arm catches the transition window and every legacy row the backfill */
/* could not reach. Neither arm can produce a false positive: a staff  */
/* booking has neither marker.                                        */
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
    WHERE a.id = p_appointment
      AND a.tenant_id = public.jwt_tenant_id()
      AND a.status = 'scheduled'
      AND (
        a.origin = 'patient_portal'
        OR EXISTS (
          SELECT 1 FROM public.staff_notifications n
          WHERE n.appointment_id = a.id
            AND n.kind = 'appointment_request'
        )
      )
  )
$$;--> statement-breakpoint


/* ================================================================== */
/* 2. appointments.pack_instance_id - A PACOTE SESSION IS A BOOKING.   */
/* ================================================================== */
/* Selecting a Pacote of N in Nova marcacao booked ONE appointment,    */
/* and `consumir` on the patient profile burned a session with NO      */
/* appointment row: no who, no when, no slot. The balance was a        */
/* COUNTER that nothing could reconcile against the diary.            */
/*                                                                    */
/* NULLABLE AND NO DEFAULT. Almost every appointment is not a pacote   */
/* session, and a column that is NULL for the ordinary case is the     */
/* honest shape - the same choice booking_group_id and batch_id made.  */
/*                                                                    */
/* A REAL FK, unlike booking_group_id and batch_id which are bare      */
/* uuids. Those group appointments with EACH OTHER, so there is no row */
/* to point at. This points at a specific patient_pack_instances row   */
/* and the database can and should refuse a dangling one.             */
/* ------------------------------------------------------------------ */

ALTER TABLE public.appointments
  ADD COLUMN pack_instance_id uuid
  REFERENCES public.patient_pack_instances(id);--> statement-breakpoint

/* THE BALANCE QUERY'S INDEX. Deriving a balance counts the linked     */
/* rows for one instance, so this is the access path for the feature.  */
/* Partial: NULL on almost every row.                                  */
CREATE INDEX IF NOT EXISTS appointments_pack_instance_idx
  ON public.appointments (pack_instance_id)
  WHERE pack_instance_id IS NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN public.appointments.pack_instance_id IS
  'The patient_pack_instances row this appointment draws a session from, or '
  'NULL for an ordinary appointment. Before 0067 a pacote booking decremented '
  'a counter and left no link, so a balance could not be reconciled against '
  'the diary and `consumir` burned sessions with no appointment at all. The '
  'remaining balance is now DERIVED: sessions_total - legacy_consumed - the '
  'count of linked appointments that are not cancelled. Migration 0067.';--> statement-breakpoint


/* ================================================================== */
/* 3. patient_pack_instances.legacy_consumed - EXISTING BALANCES ARE   */
/*    PRESERVED EXACTLY, AND NO APPOINTMENT ROW IS INVENTED.           */
/* ================================================================== */
/* THIS IS THE ONE PLACE THIS MIGRATION COULD HAVE LIED, so it is the  */
/* one with the longest note.                                         */
/*                                                                    */
/* The instruction is that the balance DERIVES from linked appointment */
/* rows and that existing balances are preserved exactly and no        */
/* appointment row is fabricated for a past consumption. Those three   */
/* CANNOT ALL HOLD from linked rows alone:                            */
/*                                                                    */
/*   - a session consumed through `consumir` has no appointment, ever; */
/*   - a pacote appointment booked before this migration has no link,  */
/*     because the column did not exist;                              */
/*   so counting linked rows for any existing instance yields ZERO,    */
/*   and a derived balance would silently RESTORE every session the    */
/*   patient has already used. That is fabricating SESSIONS, which is  */
/*   the same lie as fabricating appointments, pointing the other way. */
/*                                                                    */
/* SO WHAT IS KNOWN IS RECORDED, ONCE, AS A NUMBER. legacy_consumed is */
/* how many sessions were consumed before linkage existed. It is the   */
/* honest name: we know HOW MANY and we do not know WHICH, and no      */
/* column here pretends otherwise.                                    */
/*                                                                    */
/* THE BACKFILL IS AN ARITHMETIC IDENTITY, which is why "exactly" is a */
/* claim rather than a hope. At migration time there are zero linked   */
/* rows, so the derived balance is                                    */
/*                                                                    */
/*     sessions_total - legacy_consumed - 0                           */
/*   = sessions_total - (sessions_total - sessions_remaining)         */
/*   = sessions_remaining                                             */
/*                                                                    */
/* - the value the row already carried, for every row, with no case    */
/* analysis and nothing to get wrong.                                  */
/*                                                                    */
/* sessions_remaining IS LEFT IN PLACE AND BECOMES A FROZEN RECORD.    */
/* Dropping it in the same migration that introduces the new model     */
/* would remove the only evidence the backfill could ever be checked   */
/* against. It is no longer read for the balance, and a guard in the   */
/* required check asserts no application code writes it - because a    */
/* vestigial column that something still writes drifts silently, which */
/* is the whole family of defect this project keeps finding.          */
/* ------------------------------------------------------------------ */

ALTER TABLE public.patient_pack_instances
  ADD COLUMN legacy_consumed integer NOT NULL DEFAULT 0;--> statement-breakpoint

UPDATE public.patient_pack_instances
  SET legacy_consumed = sessions_total - sessions_remaining;--> statement-breakpoint

/* The same range the 0037 checks put on sessions_remaining, for the   */
/* same reason: a consumed count outside 0..total is not a number this */
/* table can mean anything by.                                        */
ALTER TABLE public.patient_pack_instances
  ADD CONSTRAINT patient_pack_instances_legacy_consumed_range
  CHECK (legacy_consumed >= 0 AND legacy_consumed <= sessions_total);--> statement-breakpoint

COMMENT ON COLUMN public.patient_pack_instances.legacy_consumed IS
  'Sessions consumed BEFORE appointment linkage existed - through the removed '
  '`consumir` action, or by a pacote booking made when appointments carried no '
  'pack_instance_id. Backfilled ONCE at 0067 to sessions_total - '
  'sessions_remaining, which makes the derived balance identical to the stored '
  'one for every existing row. It records HOW MANY were consumed and not '
  'WHICH, because which is not knowable. New consumption is an appointment '
  'row, never an increment here. Migration 0067.';--> statement-breakpoint


/* ================================================================== */
/* 4. THE RECUPERACAO SURFACE - TWO TABLES.                            */
/* ================================================================== */
/* Reception needs to find patients recently in treatment with no      */
/* future booking, and act on them. Two facts have to survive a page   */
/* reload and be attributable: that somebody was POSTPONED, and that   */
/* somebody was CONTACTED on a given channel.                          */
/*                                                                    */
/* NEITHER TABLE SENDS ANYTHING. Every contact is a client-side deep   */
/* link opened on the receptionist's own device (wa.me, sms:, mailto:). */
/* There is no server-side send on this path, no Twilio, no Resend,    */
/* and R9's live-send flags are untouched. These tables record that a  */
/* human pressed a link, which is the only thing the server can know.  */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.patient_followup_postponements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  /* The instant the patient returns to the list. Stored as a timestamp
     rather than a week count so the list's predicate is a comparison and
     never arithmetic over a unit somebody has to remember. */
  postponed_until timestamptz NOT NULL,
  /* WHO AND WHEN, on both the act and its reversal. The card asks for
     "reversible, visible who and when", and a reversal that erased the row
     would answer neither question afterwards. */
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES public.users(id),
  revoked_at timestamptz,
  /* A reversal has both halves or neither. Without this a row could carry
     a revoker and no time, or a time and no revoker, and the list's
     predicate would disagree with the audit trail. */
  CONSTRAINT patient_followup_postponements_revoked_pair
    CHECK ((revoked_by IS NULL) = (revoked_at IS NULL))
);--> statement-breakpoint

/* THE LIST'S OWN QUERY: this tenant's still-active postponements. Partial
   on revoked_at IS NULL so it indexes the working set rather than the
   history the table keeps. */
CREATE INDEX IF NOT EXISTS patient_followup_postponements_active_idx
  ON public.patient_followup_postponements (tenant_id, patient_id, postponed_until)
  WHERE revoked_at IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.patient_followup_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  channel text NOT NULL,
  contacted_by uuid NOT NULL REFERENCES public.users(id),
  contacted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_followup_contacts_channel_check
    CHECK (channel IN ('whatsapp', 'sms', 'email'))
);--> statement-breakpoint

/* APPEND-ONLY BY DESIGN, and the index says what the screen asks: the
   MOST RECENT contact per patient per channel. The table keeps every one,
   because "reception rang them three times" is a different fact from
   "reception rang them", and only the history can tell them apart. */
CREATE INDEX IF NOT EXISTS patient_followup_contacts_latest_idx
  ON public.patient_followup_contacts (tenant_id, patient_id, channel, contacted_at DESC);--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* GRANTS FIRST, THEN POLICIES. 0064's header is explicit about why:   */
/* a policy without a grant is DEAD, this table inherits nothing from  */
/* 0003 (which applied to the tables that existed when it ran), and it */
/* inherits nothing from the platform's default privileges either -    */
/* 0064 shipped a policy with no grant and every statement answered    */
/* `permission denied`, on the same Supabase stack.                    */
/*                                                                    */
/* NO DELETE, ON EITHER TABLE. A postponement is REVOKED, which is a   */
/* recorded act with a name and a time; a contact is a historical fact */
/* and deleting it would erase that somebody was contacted. Same       */
/* annul-never-delete principle the clinical records follow.           */
/*                                                                    */
/* NO UPDATE ON CONTACTS. A contact happened at an instant. There is   */
/* nothing about it to amend, and an UPDATE path would only be a way   */
/* to rewrite who did what.                                           */
/*                                                                    */
/* THE PATIENT ROLE GETS NOTHING. Neither table is patient-facing and  */
/* both name staff members.                                            */
/* ------------------------------------------------------------------ */
GRANT SELECT, INSERT, UPDATE ON public.patient_followup_postponements TO authenticated;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON public.patient_followup_postponements FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.patient_followup_postponements FROM patient;--> statement-breakpoint
GRANT ALL ON public.patient_followup_postponements TO service_role;--> statement-breakpoint

GRANT SELECT, INSERT ON public.patient_followup_contacts TO authenticated;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.patient_followup_contacts FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.patient_followup_contacts FROM patient;--> statement-breakpoint
GRANT ALL ON public.patient_followup_contacts TO service_role;--> statement-breakpoint

ALTER TABLE public.patient_followup_postponements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.patient_followup_contacts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY patient_followup_postponements_select_own_tenant
  ON public.patient_followup_postponements
  FOR SELECT TO authenticated
  USING (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

CREATE POLICY patient_followup_postponements_insert_own_tenant
  ON public.patient_followup_postponements
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

/* Same tenant on BOTH sides, so a row cannot be moved between tenants
   by an UPDATE. This is the revoke path and nothing else uses it. */
CREATE POLICY patient_followup_postponements_update_own_tenant
  ON public.patient_followup_postponements
  FOR UPDATE TO authenticated
  USING (tenant_id = public.jwt_tenant_id())
  WITH CHECK (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

CREATE POLICY patient_followup_contacts_select_own_tenant
  ON public.patient_followup_contacts
  FOR SELECT TO authenticated
  USING (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

CREATE POLICY patient_followup_contacts_insert_own_tenant
  ON public.patient_followup_contacts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

COMMENT ON TABLE public.patient_followup_postponements IS
  'Recuperacao de utentes: reception postponing a patient out of the '
  'follow-up list until a date. Reversible, and the reversal is RECORDED '
  '(revoked_by, revoked_at) rather than erasing the row. The list reads the '
  'active ones - revoked_at IS NULL AND postponed_until > now(). Location '
  'scope is applied in the application per PL-09, not here. Migration 0067.';--> statement-breakpoint

COMMENT ON TABLE public.patient_followup_contacts IS
  'Recuperacao de utentes: a marker that reception used a channel to reach a '
  'patient, with who and when. APPEND-ONLY - no UPDATE and no DELETE grant. '
  'NOTHING IS SENT BY THE SERVER on this path: every contact is a client-side '
  'deep link (wa.me, sms:, mailto:) opened on the receptionist device, so this '
  'records that a human pressed a link and never that a message was '
  'delivered. R9 live-send flags are untouched. Migration 0067.';

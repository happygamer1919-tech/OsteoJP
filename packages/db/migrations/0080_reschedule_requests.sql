/* ==================================================================== */
/* 0077 — A RESCHEDULE REQUEST BECOMES A ROW.                           */
/* SEC-reschedule-request-has-no-row, the fix half of INC-CONFIRM-10.   */
/* Released by SR-46; authorship released by the 2026-09-06 dispatch.   */
/* ==================================================================== */
/*                                                                      */
/* WHAT WAS WRONG. A patient pressed "Pedir remarcacao" on a real 24h   */
/* confirm link, was shown "Pedido recebido", and it reached nobody.    */
/* The press wrote exactly two things: `consumed_at` on the confirm     */
/* code, and one `audit_log` row. audit_log is not a screen. There was  */
/* NO ROW ANYWHERE IN THE SCHEMA meaning "this patient asked to move an */
/* existing appointment" - all 43 tables were checked on the incident   */
/* card, and this migration is what that check concluded.               */
/*                                                                      */
/* ==================================================================== */
/* IT IS ADDITIVE, AND THAT IS BOTH THE OWNER'S RULING AND SR-50(d).    */
/* ==================================================================== */
/* Owner, 2026-09-04: a new row REPRESENTS the request and the          */
/* appointment is UNTOUCHED, so a patient's press can never cancel a    */
/* booking by itself. Reception decides; the patient asks.              */
/*                                                                      */
/* SR-50(d) permits the lane to self-apply a migration that CREATES new */
/* objects, and routes anything that ALTERs or DROPs an existing one to */
/* strategy first. This file creates one table, three indexes, one      */
/* policy and four grants. IT ALTERS NOTHING AND DROPS NOTHING.         */
/*                                                                      */
/* ==================================================================== */
/* WHY NOT staff_notifications, WHICH IS THE OBVIOUS PLACE              */
/* ==================================================================== */
/* Two reasons, and the second is the one that decided it.              */
/*                                                                      */
/* 1. ITS `kind` IS CHECK-PINNED to five values and none of them says   */
/*    this. `appointment_request` means a request for a NEW booking and */
/*    would file this into reception's new-bookings queue under a label */
/*    that says the wrong thing; `rescheduled` ASSERTS THE APPOINTMENT  */
/*    HAS MOVED, which is a false statement in a clinical record. A     */
/*    sixth value means DROP CONSTRAINT + ADD CONSTRAINT on an existing */
/*    table - exactly the ALTER that SR-50(d) sends to strategy - so    */
/*    taking that route would have made this migration un-self-         */
/*    appliable for the sake of reusing a table that is wrong anyway.   */
/*                                                                      */
/* 2. THE TWO ROWS HAVE OPPOSITE DURABILITY DISCIPLINES, and mixing     */
/*    them is the actual defect. `staff_notifications` is written       */
/*    POST-COMMIT and BEST-EFFORT by emitPatientChange, which never     */
/*    throws - SR-31 exists because a lost emit hid a pedido reception  */
/*    was never told about. THIS row must be written INSIDE THE         */
/*    PATIENT'S OWN TRANSACTION so it cannot be lost, because losing it */
/*    reproduces the incident. A table whose rows are sometimes         */
/*    best-effort and sometimes load-bearing cannot be reasoned about.  */
/*                                                                      */
/* SO THE PRACTITIONER NOTIFICATION IS A READ, NOT A SECOND WRITE. One  */
/* row per request; the people who must see it are derived from the     */
/* APPOINTMENT at read time - practitioner_1, practitioner_2, reception */
/* at that location, the owner. "Both practitioners are notified when   */
/* practitioner_2_id is set" (owner, 2026-09-04) is therefore true by   */
/* construction and cannot half-fail, which two INSERTs could.          */
/*                                                                      */
/* ==================================================================== */
/* WHY THE POLICY ASKS THE APPOINTMENT INSTEAD OF COPYING ITS COLUMNS   */
/* ==================================================================== */
/* The set of staff who may see a request is EXACTLY the set who may    */
/* see the appointment it is about. Two ways to say that:               */
/*                                                                      */
/*   (a) denormalise location_id / practitioner_id / practitioner_2_id  */
/*       onto this row and restate appointments_rls here; or            */
/*   (b) EXISTS against appointments and let ITS policy answer.         */
/*                                                                      */
/* (a) IS THE FASTER ONE AND IT IS WRONG. Reception moves appointments: */
/* practitioner and location change. A copy taken at request time then  */
/* diverges from the appointment, and the row would be visible to the   */
/* wrong people - silently, and in the direction that leaks.            */
/*                                                                      */
/* (b) COSTS A CORRELATED SUBQUERY PER ROW, which is the exact shape    */
/* 0073, 0074B and 0078 spent this month removing. SR-24 requires that  */
/* be stated rather than discovered: THIS TABLE IS A WORKLIST, not a    */
/* record. Rows arrive one patient-press at a time and leave when       */
/* reception handles them, so the live set is units, against the 41,570 */
/* appointments and 8,404 patients those migrations were fighting. The  */
/* per-row cost is over the FILTERED set and the filter is `handled_at  */
/* IS NULL` on a partial index.                                         */
/*                                                                      */
/* WHEN TO REVISIT: if this table ever holds thousands of unhandled     */
/* rows, the cost model above is void and (a) plus a trigger to keep    */
/* the copy in step becomes the right trade. That is the trigger, and   */
/* it is a number rather than a feeling.                                */
/* ==================================================================== */

CREATE TABLE IF NOT EXISTS "appointment_reschedule_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  /* Hard architecture rule 1. Denormalised from the appointment ON PURPOSE and
     unlike the visibility columns above: tenant_id is IMMUTABLE for an
     appointment - nothing moves a booking between tenants - so this copy cannot
     drift, and rule 2 needs it on the row to key the policy without a join. */
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "appointment_id" uuid NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  /* Also denormalised, also immutable: an appointment does not change patient.
     It lets the queue name the patient without reaching through the
     appointment, and it keeps the row meaningful in an export. */
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  /* WHEN THE PATIENT PRESSED, not when the row was written. Same distinction
     staff_notifications.occurred_at makes and for the same reason. */
  "requested_at" timestamptz NOT NULL,
  /* HOW they asked. One value today; a CHECK rather than free text so a second
     channel is a deliberate migration and not a typo. NOT an enum: 0061's own
     header records that widening a CHECK is the cheaper of the two. */
  "via" text NOT NULL,
  /* NULL = still on the queue. The queue's whole clearing mechanism, and the
     reason it is a column rather than a derived condition: "the appointment
     moved" is not the same fact as "somebody dealt with this", and a patient
     whose request reception DECLINED must still leave the queue. */
  "handled_at" timestamptz,
  /* SET NULL, not CASCADE: removing the staff member who handled a request must
     not delete the record that it WAS handled. Same reasoning as
     staff_notifications.actor_user_id. */
  "handled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "appointment_reschedule_requests_via_check"
    CHECK ("via" IN ('sms_code')),
  /* handled_by without handled_at, or the reverse, is a half-written state.
     Refused here rather than tidied in a reader. */
  CONSTRAINT "appointment_reschedule_requests_handled_pair_check"
    CHECK (("handled_at" IS NULL) = ("handled_by" IS NULL))
);--> statement-breakpoint

/* THE QUEUE'S OWN INDEX, PARTIAL. The queue asks one question - "what is
   unhandled, oldest first" - and a partial index means the index holds only the
   live set rather than every request ever made. */
CREATE INDEX IF NOT EXISTS "appt_reschedule_req_open_idx"
  ON "appointment_reschedule_requests" ("tenant_id", "requested_at")
  WHERE "handled_at" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "appt_reschedule_req_appointment_idx"
  ON "appointment_reschedule_requests" ("appointment_id");--> statement-breakpoint

/* ONE OPEN REQUEST PER APPOINTMENT, enforced by the database rather than by the
   writer. The confirm code is consumed by the same press, so a second press on
   the SAME code cannot reach here - but a patient who receives a second reminder
   for the same appointment gets a second code, and pressing that would queue the
   same decision twice. Reception should see one row per appointment to decide
   on, not a press count. A partial unique index, so a HANDLED request never
   blocks a later genuine one. */
CREATE UNIQUE INDEX IF NOT EXISTS "appt_reschedule_req_one_open_uq"
  ON "appointment_reschedule_requests" ("appointment_id")
  WHERE "handled_at" IS NULL;--> statement-breakpoint

ALTER TABLE "appointment_reschedule_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ==================================================================== */
/* THE POLICY. Staff only, and exactly the staff who can see the        */
/* appointment.                                                         */
/* ==================================================================== */
/* FOR ALL rather than a SELECT policy plus an UPDATE policy: reception */
/* both reads the queue and clears it, and splitting them would let the */
/* two drift. Every arm is the SAME expression on both sides, which is  */
/* the property 0078's header says was nearly lost by rewriting only    */
/* USING.                                                               */
/*                                                                      */
/* THE PATIENT ROLE IS GRANTED NOTHING HERE AND HAS NO POLICY. The      */
/* patient writes this row through a SECURITY DEFINER path that runs as */
/* the reminder tenant context, exactly as the confirm code does; a     */
/* patient session must never read the clinic's worklist.               */
CREATE POLICY "appointment_reschedule_requests_rls"
  ON "appointment_reschedule_requests"
  FOR ALL
  TO authenticated
  USING (
    tenant_id = ( SELECT public.jwt_tenant_id() )
    AND EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.id = appointment_id
    )
  )
  WITH CHECK (
    tenant_id = ( SELECT public.jwt_tenant_id() )
    AND EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.id = appointment_id
    )
  );--> statement-breakpoint

/* THE EXISTS IS NOT A NULL CHECK AND IT IS NOT REDUNDANT WITH THE FK.
   appointment_id is NOT NULL and references appointments, so the row always
   exists in the table. What the subquery asks is whether it exists FOR THIS
   READER - appointments_rls is applied to that SELECT like any other, so the
   answer is "can you see this appointment". That is the entire access rule, and
   it is stated once, in the table that owns it. */
COMMENT ON POLICY "appointment_reschedule_requests_rls"
  ON "appointment_reschedule_requests" IS
  'Visible to exactly the staff who can see the appointment. The EXISTS is '
  'evaluated under appointments_rls, so location scope, therapist scope and the '
  'owner override are inherited rather than restated - and cannot drift when '
  'reception moves the appointment to another practitioner or clinic.';--> statement-breakpoint

/* ==================================================================== */
/* GRANTS. Stated as an END STATE, per SR-52's corollary.               */
/* ==================================================================== */
/* No REVOKE is issued because there is nothing to revoke: the table is */
/* created by this file, so the only privileges it can carry are the    */
/* ones Supabase's ALTER DEFAULT PRIVILEGES grants at CREATE TABLE      */
/* time. THAT IS EXACTLY THE ENVIRONMENT-DEPENDENT INHERITANCE SR-52    */
/* names, so this states what it wants instead of assuming.            */
/*                                                                      */
/* anon and patient get NOTHING, by name, so the state does not depend  */
/* on whether default privileges fired on this database.               */
/*                                                                      */
/* AND `authenticated` IS REVOKED BEFORE IT IS GRANTED, WHICH THE FIRST  */
/* DRAFT OF THIS FILE DID NOT DO. That draft issued only the GRANT of    */
/* three privileges and called it an end state. IT IS NOT: Supabase's    */
/* ALTER DEFAULT PRIVILEGES grants ALL to `authenticated` at CREATE      */
/* TABLE time, so the table was created with DELETE already held and     */
/* granting three more removed nothing. The DB-gated suite caught it -   */
/* has_table_privilege('authenticated', ..., 'DELETE') was true against  */
/* a file whose own comment two lines down says nobody may delete.       */
/*                                                                      */
/* IT IS SR-52 ONE LAYER OVER, on tables instead of functions: reasoning */
/* about what a grant leaves behind is environment-dependent, so state   */
/* the end state - REVOKE the lot, then GRANT exactly what is intended.  */
REVOKE ALL ON TABLE "appointment_reschedule_requests" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "appointment_reschedule_requests" FROM anon;--> statement-breakpoint
REVOKE ALL ON TABLE "appointment_reschedule_requests" FROM patient;--> statement-breakpoint
REVOKE ALL ON TABLE "appointment_reschedule_requests" FROM authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "appointment_reschedule_requests" TO authenticated;--> statement-breakpoint

/* NO DELETE, FOR ANYONE. A handled request is a record that a patient asked and
   the clinic answered; clearing the queue is an UPDATE that stamps handled_at,
   never a removal. The only way a row leaves is with its appointment or its
   tenant, by cascade. */
COMMENT ON TABLE "appointment_reschedule_requests" IS
  '0077. One row per "this patient asked to move this appointment", written '
  'inside the patient press transaction so it cannot be lost. The appointment '
  'is never modified by the request. Cleared by stamping handled_at; never '
  'deleted.';

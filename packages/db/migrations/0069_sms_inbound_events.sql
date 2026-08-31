/* ================================================================== */
/* 0069 — sms_inbound_events (W14-06)                                 */
/*                                                                    */
/* The storage half of the reception reply queue. #1083 wired the      */
/* inbound Twilio webhook end to end - signature, classification, the  */
/* four guard rails, the status transitions and the audit trail - and  */
/* left exactly ONE thing unbuilt, because it needed a table and       */
/* migration authorship was frozen: somewhere to keep the reply a      */
/* human has to read. SR-14 opened authorship for this number only.    */
/*                                                                    */
/* NUMBER DERIVATION, re-derived at authoring time and not taken from  */
/* a reservation. packages/db/migrations/meta/_journal.json ends at    */
/* idx 67, tag 0068_appointments_patient_2_index, 68 entries; both     */
/* mirrored trees (packages/db/migrations and supabase/migrations)     */
/* hold 68 files and agree. Next free is 0069, journal idx 68.         */
/*                                                                    */
/* WHY audit_log COULD NOT SERVE, since it already receives a row for  */
/* every inbound reply and the obvious question is why a second table  */
/* exists at all. Two reasons, and either alone is sufficient:         */
/*                                                                    */
/*   1. THE BODY. Reception cannot resolve "the patient wrote          */
/*      something we could not read" without reading what they wrote.  */
/*      That is patient-authored free text, and CLAUDE.md rule 7 keeps */
/*      patient content out of logs. audit_log.metadata IS a log: its  */
/*      own contract in lib/scheduling/audit.ts says "IDs, status and  */
/*      ISO timestamps only - never patient PII".                      */
/*   2. NO RESOLUTION STATE. audit_log is append-only by RLS (SELECT + */
/*      INSERT policies only, no UPDATE). A queue that cannot be       */
/*      marked done is not a queue; it is a list that grows forever.   */
/*                                                                    */
/* The audit row STAYS. It is the permanent trail - ids, intent,       */
/* outcome, `source: patient-sms-reply` - and it is written for every  */
/* reply including the ones this table never sees. This table is the   */
/* WORKING COPY: it holds the message text and the resolution, and it  */
/* is the only place either lives.                                     */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* 1. The table.                                                       */
/*                                                                    */
/* THE SENDER'S NUMBER IS HASHED AND NEVER STORED IN CLEAR. The stub   */
/* this replaces said so in its header and it is kept: a queue row     */
/* does not need a dialable number, because the row carries patient_id */
/* whenever the sender matched, and a staff session entitled to that   */
/* patient reads the real number from the ficha. When the sender did   */
/* NOT match, an unmatched phone number is the one piece of PII the    */
/* clinic has no relationship to and no lawful reason to keep. The     */
/* hash still does the work a hash is for: two replies from the same   */
/* stranger group together, and a support question ("did this number   */
/* write to us?") is answerable by hashing the number and looking.     */
/*                                                                    */
/* THE BODY IS STORED IN CLEAR, and that is the deliberate exception   */
/* this table exists to make. It is the only reason the queue is       */
/* workable. It is confined by RLS to owner/admin/reception of the     */
/* owning tenant, which is a strictly smaller audience than the        */
/* clinical record the same staff already read.                        */
/*                                                                    */
/* NO FOREIGN KEY ON patient_id OR appointment_id, matching 0055 and   */
/* 0054: the ids are recorded as DATA about what the reply matched at  */
/* the moment it arrived. A cascade would delete the record of a reply */
/* when the appointment is removed, and ON DELETE SET NULL would       */
/* silently rewrite what reception already read. Both are NULLABLE     */
/* because the common review case is a reply that matched NOTHING -    */
/* that is precisely why it needs a human.                             */
/*                                                                    */
/* resolved_by DOES carry an FK with ON DELETE SET NULL, the same      */
/* asymmetry 0061 chose for staff_notifications.actor_user_id and for  */
/* the same reason: removing a staff user must not delete the record   */
/* that a reply was resolved, but the row should stop naming someone   */
/* who no longer exists.                                               */
/*                                                                    */
/* provider_message_sid IS THE REPLY'S REFERENCE and it is NOT NULL.   */
/* Twilio redelivers on any non-2xx, so the same reply can arrive      */
/* twice; the unique index in section 2 is what makes the second       */
/* delivery a no-op rather than a duplicate queue item.                */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "sms_inbound_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  /* Twilio's MessageSid. The reply's reference, and the dedupe key. */
  "provider_message_sid" text NOT NULL,
  /* sha256 hex of the E.164 sender. Never the number itself. */
  "from_phone_hash" text NOT NULL,
  /* What the patient wrote. The one reason this table exists. */
  "body" text NOT NULL,
  /* The classifier's verdict, from lib/reminders/inbound-classify.ts. */
  "classification" text NOT NULL,
  /* Why it needs a human, from lib/reminders/inbound-reply.ts. NULL when the
     reply was acted on automatically and is filed here for reference only. */
  "review_reason" text,
  /* What the reply matched, when it matched anything. Data, not references. */
  "patient_id" uuid,
  "appointment_id" uuid,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  /* NULL = still in the queue. This column IS the queue. */
  "resolution" text,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  /* The vocabulary is pinned in the database, exactly as 0055 pinned the
     notification kinds: the TypeScript contract calls itself fixed, and a CHECK
     is how the database says the same thing. A fifth classification needs a
     migration, which is the point. */
  CONSTRAINT "sms_inbound_events_classification_check"
    CHECK ("classification" IN ('confirmada', 'cancelada', 'opt_out', 'review')),
  CONSTRAINT "sms_inbound_events_resolution_check"
    CHECK ("resolution" IS NULL OR "resolution" IN ('confirmed', 'cancelled', 'read')),

  /* RESOLUTION AND ITS TIMESTAMP MOVE TOGETHER OR NOT AT ALL. Without this a
     row can be resolved with no record of when, or carry a resolution instant
     while still sitting in the queue - and the queue predicate reads
     `resolution IS NULL`, so the second shape would be a row that is done and
     invisible to nobody. `resolved_by` is deliberately NOT in the conjunction:
     the FK sets it NULL when a staff user is removed, and that must not
     retroactively invalidate a resolution that really happened. */
  CONSTRAINT "sms_inbound_events_resolved_pair_check"
    CHECK (("resolution" IS NULL) = ("resolved_at" IS NULL))
);
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 2. Indexes.                                                         */
/*                                                                    */
/* THE QUEUE INDEX IS PARTIAL, over unresolved rows only. The page     */
/* asks exactly one question - "what is still waiting, oldest first"   */
/* - and a partial index stays small no matter how much resolved       */
/* history accumulates behind it. Oldest first, not newest: a work     */
/* queue is worked from the front, and a patient who replied two days  */
/* ago has waited longer than one who replied this morning.            */
/*                                                                    */
/* THE UNIQUE INDEX IS THE IDEMPOTENCY GUARD. Twilio treats any        */
/* non-2xx as a delivery failure and redelivers; the route also        */
/* returns 200 for a reply that changed nothing, so a redelivery is    */
/* rare rather than impossible. Scoped to (tenant, sid) rather than    */
/* sid alone: the sid is globally unique at Twilio, but a unique index */
/* that omits tenant_id is a cross-tenant coupling waiting for a       */
/* second clinic, and it costs nothing to include.                     */
/* ------------------------------------------------------------------ */

CREATE INDEX IF NOT EXISTS "sms_inbound_events_queue_idx"
  ON "sms_inbound_events" ("tenant_id", "received_at")
  WHERE "resolution" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "sms_inbound_events_provider_sid_uq"
  ON "sms_inbound_events" ("tenant_id", "provider_message_sid");
--> statement-breakpoint

/* Answering "what came in about this appointment" without scanning. */
CREATE INDEX IF NOT EXISTS "sms_inbound_events_appointment_idx"
  ON "sms_inbound_events" ("tenant_id", "appointment_id")
  WHERE "appointment_id" IS NOT NULL;
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 3. Table gates. RLS is the row gate, GRANT is the table gate; both  */
/* are required (0003_grants.sql).                                     */
/*                                                                    */
/* This table does NOT inherit 0003's blanket grant: `GRANT ... ON ALL */
/* TABLES IN SCHEMA public` applied to the tables that existed when it */
/* ran. The explicit REVOKE below exists to survive a FUTURE blanket   */
/* grant, not to undo a present one.                                   */
/*                                                                    */
/* THE PATIENT ROLE GETS NOTHING, and this is the load-bearing line.   */
/* Every row holds another person's message text, and many hold an     */
/* appointment id. A patient who could read this table could read the  */
/* clinic's inbound correspondence. The patient role is login-less and */
/* dedicated (0010) and the policies below target `authenticated`, so  */
/* a patient connection matches no policy anyway - the missing GRANT   */
/* makes the refusal happen at the table gate, before RLS is           */
/* consulted. Two independent enforcement points for one MUST-NEVER.   */
/*                                                                    */
/* UPDATE IS GRANTED because resolving is an update. DELETE and        */
/* TRUNCATE stay revoked: nothing in the queue's design asks anyone to */
/* delete a reply, and "resolve" is the whole state machine.           */
/* ------------------------------------------------------------------ */

GRANT SELECT, INSERT, UPDATE ON public.sms_inbound_events TO authenticated;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON public.sms_inbound_events FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.sms_inbound_events FROM patient;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 4. Row gates.                                                       */
/*                                                                    */
/* OWNER, ADMIN AND RECEPTION. NOT THERAPIST. Owner ruling 2026-08-31: */
/* "reception and admin read and resolve, nobody else." Owner is       */
/* admin's superset in this matrix and is included for the same reason */
/* it holds `guest_requests:read` - so the clinic's own account is not */
/* refused a page its admins can open. The role the ruling excludes is */
/* THERAPIST, and it is excluded here.                                 */
/*                                                                    */
/* THE ROLE PREDICATE IS IN THE POLICY, NOT ONLY IN THE APPLICATION,   */
/* and the repo has paid for that lesson twice. `guest_requests:read`  */
/* exists because a queue gated on `appointments:read` - a capability  */
/* EVERY role holds - showed a therapist the whole tenant's guest      */
/* queue on deployed production. The application check                 */
/* (`sms_replies:read`, added in the same change) is the first gate;   */
/* this is the one that holds when a future page forgets it.           */
/*                                                                    */
/* NO LOCATION SCOPE, and that is a decision rather than an omission.  */
/* An inbound SMS has no location: it arrives at ONE clinic number for */
/* the whole tenant, and the reply that most needs a human is the one  */
/* that matched no patient and therefore no appointment and therefore  */
/* no location. Scoping by location would hide exactly the rows the    */
/* queue exists for. Reception sees the tenant's replies; that is the  */
/* same audience the number itself already reaches.                    */
/*                                                                    */
/* THE UPDATE POLICY CARRIES BOTH USING AND WITH CHECK with the same   */
/* predicate: USING decides which rows may be touched, WITH CHECK what */
/* they may become. Without WITH CHECK a receptionist could move a row */
/* to another tenant. It does NOT constrain WHICH columns change - the */
/* application only ever writes the resolution triple, and expressing  */
/* column immutability would need a trigger. Recorded, as 0055         */
/* recorded the same limit, so it is not mistaken for an oversight.    */
/*                                                                    */
/* INSERT IS TENANT-SCOPED AND ROLE-SCOPED TOO, which differs from     */
/* 0055's tenant-only insert. The writer is the inbound webhook, which */
/* runs through withReminderTenantContext - `set local role            */
/* authenticated` with user_role `admin` (apps/web/lib/reminders/      */
/* context.ts). So the tighter predicate is satisfied by the only      */
/* writer that exists, and a future writer under a different role      */
/* fails LOUDLY at the insert rather than quietly acquiring the right  */
/* to file rows in this queue.                                         */
/* ------------------------------------------------------------------ */

ALTER TABLE public.sms_inbound_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "sms_inbound_events_staff_select" ON public.sms_inbound_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );
--> statement-breakpoint

CREATE POLICY "sms_inbound_events_staff_update" ON public.sms_inbound_events
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  )
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );
--> statement-breakpoint

CREATE POLICY "sms_inbound_events_staff_insert" ON public.sms_inbound_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );
--> statement-breakpoint

COMMENT ON TABLE public.sms_inbound_events IS
  'Inbound patient SMS replies to appointment reminders. Working queue for '
  'reception: holds the message body (the only place it lives) and the '
  'resolution. The permanent trail is audit_log, action '
  'appointment.patient_sms_reply, metadata.source patient-sms-reply. '
  'Sender number is stored HASHED, never in clear. W14-06, owner 2026-08-31.';

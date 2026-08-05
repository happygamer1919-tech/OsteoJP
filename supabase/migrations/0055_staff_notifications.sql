-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0055_staff_notifications.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0055 — staff_notifications (W13-02, Wave 13 LOOP 2)                */
/*                                                                    */
/* The storage half of the in-app notification centre. PG4: "in-app   */
/* centre on the bell icon. Events for booked, cancelled,             */
/* rescheduled, pedido de marcacao, fanning out to reception and the  */
/* assigned therapist. In-app only."                                  */
/*                                                                    */
/* NUMBER DERIVATION, per WAVE-13.md section 1.5 — re-derived at      */
/* authoring time, never taken from a reservation. The journal        */
/* packages/db/migrations/meta/_journal.json ends at idx 53, tag      */
/* 0054_patient_audit_log_and_token_consumption, 54 entries; both     */
/* mirrored trees (packages/db/migrations and supabase/migrations)    */
/* agree. Next free is therefore 0055, journal idx 54.                */
/*                                                                    */
/* THE RESERVATION DISAGREES, AND THE JOURNAL WINS. WAVE-13.md        */
/* section 5 reserves 0055 for LOOP 4 (services.patient_bookable) and */
/* does not list LOOP 2 as migration-bearing at all. That table is    */
/* labelled INTENT, NOT TRUTH for exactly this reason. LOOP 2 runs    */
/* before LOOP 4 in wave order and is authoring first, so it takes    */
/* 0055 and LOOP 4 re-derives its own number when it authors — which  */
/* will be 0056 if nothing else lands first. Recorded here rather     */
/* than silently, because the one incident section 1.5 exists to      */
/* prevent (PL-31 consuming a session-held reservation of 0053) was   */
/* invisible precisely because nobody wrote the divergence down.      */
/*                                                                    */
/* WHY LOOP 2 IS MIGRATION-BEARING WHEN THE WAVE DOC DID NOT SAY SO.  */
/* LOOP 2's own Definition of Done requires the unread count to be    */
/* "derived from data, never from a client-only counter that a reload */
/* resets". Read state is PER USER: two reception staff looking at    */
/* the same event have independent read state. There is no existing   */
/* table that can carry it — a repo-wide read of packages/db/src/     */
/* schema.ts finds no notification table of any kind, and audit_log   */
/* and analytics_events are append-only trails with no recipient and  */
/* no read state. So the DoD cannot be met without storage. The board */
/* anticipated this (W13-02 carries gate owner_merge for this exact   */
/* reason); the wave doc's section 5 did not. Surfaced to the owner.  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* 1. The table.                                                       */
/*                                                                    */
/* ONE ROW PER RECIPIENT, not one row per event with an audience       */
/* descriptor resolved at read time. Both designs can render a list;   */
/* only this one makes per-user read state a column instead of a       */
/* second table, and PG4's fan-out requirement ("reception AND the     */
/* assigned therapist") is naturally expressed as N inserts. It also   */
/* means a reception user hired next month does not retroactively      */
/* inherit an unread backlog of changes that happened before they      */
/* existed, which is the correct behaviour and would take extra work   */
/* to achieve under the other design.                                  */
/*                                                                    */
/* IDENTIFIERS AND INSTANTS ONLY. This mirrors the PII rule stated in  */
/* apps/api/lib/notifications/patient-change.ts and counsel's Inngest  */
/* payload-minimisation property (docs/rgpd-token-flow.md section 9,   */
/* guarded by apps/web/lib/reminders/payload-minimization.test.ts):    */
/* no patient name, no phone, no email, NO SERVICE NAME, no clinical   */
/* content. patient_id is stored so the centre can link to the record; */
/* the name is joined at RENDER time by a staff session that is        */
/* already entitled to see it. Storing the name here would copy PII    */
/* into a second place with its own lifetime, and service names are    */
/* forbidden outright — several of them identify a treatment type, the */
/* same reason the token landing page may not show one (section 7).    */
/*                                                                    */
/* NO FOREIGN KEY ON appointment_id OR patient_id, matching 0054's     */
/* reasoning: the ids are recorded as DATA. A cascade would delete the */
/* notification trail, and ON DELETE SET NULL is an UPDATE that would  */
/* silently rewrite what a user already read. Both ids stay NOT NULL   */
/* because, unlike an audit refusal, a notification cannot exist       */
/* without the appointment that provoked it.                           */
/*                                                                    */
/* recipient_user_id DOES cascade, and that is the one place this      */
/* table differs from an audit trail. A notification is a message TO   */
/* someone; when that someone is removed from the tenant, their unread */
/* list is meaningless and keeping it would leave rows no policy in    */
/* section 4 can ever select. Deleting a staff user is already an      */
/* owner-confirmable destructive operation.                            */
/*                                                                    */
/* THE FOUR KINDS ARE PINNED BY CHECK. They are the four PG4 names,    */
/* with pedido de marcacao stored as `appointment_request` because     */
/* every other enum-ish value in this schema is an English slug and a  */
/* pt-PT value here would be the only one; the pt-PT wording lives in  */
/* packages/i18n where all user-facing copy lives. A fifth kind        */
/* requires a migration, which is the point: the contract in           */
/* patient-change.ts calls itself FIXED, and a CHECK constraint is how */
/* the database says the same thing.                                   */
/*                                                                    */
/* previous_starts_at AND new_starts_at are both carried so the centre */
/* renders "moved from X to Y" without a second read. For a           */
/* cancellation and for a booking they are equal, which is the         */
/* convention the emitting contract already established.               */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "staff_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "appointment_id" uuid NOT NULL,
  "patient_id" uuid NOT NULL,
  "previous_starts_at" timestamp with time zone NOT NULL,
  "new_starts_at" timestamp with time zone NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_notifications_kind_check"
    CHECK ("kind" IN ('booked', 'cancelled', 'rescheduled', 'appointment_request'))
);
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 2. Indexes.                                                         */
/*                                                                    */
/* The list query is "my notifications, newest first", so the centre   */
/* index leads on recipient and orders by occurred_at DESC.            */
/*                                                                    */
/* The unread count gets its OWN partial index. It is rendered on the  */
/* bell on every staff page load, so it is the hottest query this      */
/* table will serve, and a partial index over read_at IS NULL stays    */
/* small no matter how large the read history grows.                   */
/*                                                                    */
/* THE UNIQUE INDEX IS AN IDEMPOTENCY GUARD, not a lookup. emitPatient */
/* Change is called post-commit and is deliberately best-effort, so a  */
/* retry (today a redeploy mid-request, tomorrow anything that wraps   */
/* the emit in a queue) could deliver the same event twice and         */
/* double-post it to every recipient. The reminder pipeline learned    */
/* this the expensive way — apps/web/lib/reminders/offsets.ts documents */
/* an idempotency key that omitted `channel` and let Inngest silently  */
/* dedupe a whole channel with no error and no log. The natural key    */
/* here is recipient + appointment + kind + the instant the patient    */
/* acted: the same patient action reaching the same person twice is a  */
/* duplicate, while a genuine second cancel-and-rebook has a different */
/* occurred_at and is correctly a second row.                          */
/* ------------------------------------------------------------------ */

CREATE INDEX IF NOT EXISTS "staff_notifications_recipient_time_idx"
  ON "staff_notifications" ("recipient_user_id", "occurred_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "staff_notifications_unread_idx"
  ON "staff_notifications" ("recipient_user_id")
  WHERE "read_at" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "staff_notifications_dedupe_uq"
  ON "staff_notifications"
  ("recipient_user_id", "appointment_id", "kind", "occurred_at");
--> statement-breakpoint

/* Tenant-scoped sweeps and any future retention job. */
CREATE INDEX IF NOT EXISTS "staff_notifications_tenant_time_idx"
  ON "staff_notifications" ("tenant_id", "occurred_at");
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 3. Table gates. RLS is the row gate, GRANT is the table gate; both  */
/* are required (0003_grants.sql).                                     */
/*                                                                    */
/* These tables do NOT inherit 0003's blanket grant: `GRANT ... ON ALL */
/* TABLES IN SCHEMA public` applied to the tables that existed when it */
/* ran, not to tables created afterwards. So what is absent below is   */
/* an effective control today, and the explicit REVOKE exists to       */
/* survive a future blanket grant rather than to undo a present one.   */
/*                                                                    */
/* THE PATIENT ROLE GETS NOTHING. NOT SELECT, NOT INSERT, NOTHING.     */
/* This is the load-bearing line in the file. Staff notifications      */
/* carry other patients' appointment ids and patient ids; a patient    */
/* who could read this table could enumerate the clinic's diary. The   */
/* patient role is login-less and dedicated (created in 0010) and      */
/* staff policies target `authenticated`, so a patient connection      */
/* matches no policy here — but the missing GRANT means the refusal    */
/* happens at the table gate, before RLS is even consulted. Two        */
/* independent reasons for the same denial, which is what "every       */
/* MUST-NEVER row has an enforcement point" (PG6) is asking for.       */
/*                                                                    */
/* UPDATE IS GRANTED, unlike 0054's two append-only tables, because    */
/* marking a notification read IS an update. It is confined by the     */
/* policy in section 4 to the recipient's own rows. DELETE and         */
/* TRUNCATE stay revoked: nothing in PG4 asks a user to delete a       */
/* notification, and "mark read" is the whole of the state machine.    */
/* ------------------------------------------------------------------ */

GRANT SELECT, INSERT, UPDATE ON public.staff_notifications TO authenticated;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON public.staff_notifications FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.staff_notifications FROM patient;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 4. Row gates.                                                       */
/*                                                                    */
/* SELECT and UPDATE are BOTH pinned to `recipient_user_id =           */
/* auth.uid()`, not merely to the tenant. A notification centre is     */
/* addressed mail: a therapist reading reception's list, or marking    */
/* someone else's items read, is a defect even though both are inside  */
/* the same tenant. auth.uid() resolves because users.id is 1:1 with   */
/* Supabase auth.users.id (packages/db/src/schema.ts:190-193) and      */
/* withTenantContext forwards `sub` for exactly this purpose           */
/* (packages/db/src/client.ts:79-81).                                  */
/*                                                                    */
/* THE UPDATE POLICY HAS BOTH USING AND WITH CHECK, and they are the   */
/* same predicate on purpose: USING decides which rows may be touched, */
/* WITH CHECK decides what they may become. Without WITH CHECK a user  */
/* could reassign their own notification to another recipient. With    */
/* it, the row must still be theirs after the write. Note this policy  */
/* does NOT constrain WHICH columns change — a recipient can rewrite   */
/* their own row's kind or instants. That is accepted rather than      */
/* overlooked: the blast radius is one person's own notification list, */
/* the application only ever writes read_at, and expressing            */
/* column-level immutability here would need a trigger whose cost is   */
/* not justified by that radius. It is recorded so a later reader does */
/* not mistake it for an oversight.                                    */
/*                                                                    */
/* INSERT is tenant-scoped only. The writer is the platform acting on  */
/* a patient's committed change, and the recipients are resolved       */
/* server-side by the fan-out (all reception users of the tenant, plus */
/* the assigned practitioners by id) — never from client input. A      */
/* recipient predicate here would forbid the only write that exists.   */
/* ------------------------------------------------------------------ */

ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "staff_notifications_own_select" ON public.staff_notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    AND recipient_user_id = auth.uid()
  );
--> statement-breakpoint

CREATE POLICY "staff_notifications_own_update" ON public.staff_notifications
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    AND recipient_user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND recipient_user_id = auth.uid()
  );
--> statement-breakpoint

CREATE POLICY "staff_notifications_tenant_insert" ON public.staff_notifications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.jwt_tenant_id());

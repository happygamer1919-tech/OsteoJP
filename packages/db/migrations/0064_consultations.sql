/* ================================================================== */
/* 0064 - consultations. THE FIRE-PENDING DATA-LOSS GAP.              */
/*                                                                    */
/* WHAT WAS LOST, AND WHY NOTHING COULD FIND IT AFTERWARDS.           */
/*                                                                    */
/* fireConsultationWebhookAction fired the M1 webhook and returned.   */
/* Nothing was written anywhere at fire time. The audio object key,   */
/* the patient, the clinician and BOTH consultation timestamps lived  */
/* only in React state in Recorder.tsx - consultation_started_at in a */
/* useRef. On a failed fire the client showed "O processamento sera   */
/* retomado" and no code anywhere kept that promise. One refresh and  */
/* every value needed to re-fire was gone.                            */
/*                                                                    */
/* AND THE AUDIO COULD NOT BE RECOVERED BY HAND EITHER. The scoped S3 */
/* key is PutObject + GetObject only - no list (audio-storage.ts).    */
/* Without the object key, the uploaded recording is unreachable: you */
/* cannot enumerate the bucket to find it. A 7-day lifecycle then     */
/* deletes it. The consultation was unrecoverable AND silent.         */
/*                                                                    */
/* This table is written BEFORE the fire, so the durable record       */
/* exists whether or not the fire ever succeeds.                      */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* THE TIMESTAMPS ARE PERSISTED SO THEY ARE NEVER RE-STAMPED.         */
/*                                                                    */
/* This is the whole reason both timestamps are columns rather than   */
/* something a retry could recompute. The partner derives their       */
/* idempotency key from patient_id + consultation_started_at +        */
/* consultation_ended_at. A retry that re-stamped either one would    */
/* present a NEW key for the SAME consultation, and their side would  */
/* create a SECOND clinical record instead of replaying the first.    */
/* The failure would look like success on both sides: our fire        */
/* returns 2xx, their pipeline reports a record created. Nobody sees  */
/* the duplicate until a clinician opens the patient.                 */
/*                                                                    */
/* The UNIQUE constraint below enforces that at the same grain the    */
/* partner dedupes at: (tenant, patient, started, ended). Two rows    */
/* sharing that triple would be two of our consultations for one of   */
/* theirs, which is exactly the duplicate this table exists to stop.  */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* NO WRITE POLICY FOR ANY ROLE, AND THAT IS THE POINT.               */
/*                                                                    */
/* Same shape as 0063 and for a sharper reason. fire_status,          */
/* attempt_count, last_attempt_at and last_error are a MACHINE        */
/* VERDICT about whether the partner received this consultation. They */
/* are written by the fire path and by the Inngest retry function,    */
/* both through the sanctioned service-role seam (getDbAdmin) with    */
/* tenant_id set explicitly - CLAUDE.md rule 3, the same seam the AI  */
/* ingestion writer uses. The retry job has no session at all, so RLS */
/* has nothing to key on there in any case.                           */
/*                                                                    */
/* Granting `authenticated` an UPDATE policy would mean a staff       */
/* session could set fire_status = 'fired' on a consultation the      */
/* partner never received. The row would then read as delivered,      */
/* the retry scanner would skip it forever, and the audio would age   */
/* out of the bucket. A row that says 'fired' has to mean a machine   */
/* saw a terminal response, never that somebody marked it done.       */
/*                                                                    */
/* SELECT is granted, tenant-scoped, because a stuck consultation has */
/* to be visible to a human (fire_status = 'needs_attention').        */
/* Everything else is denied by the absence of a policy: fail-closed  */
/* by default, in both directions, for authenticated and anon alike.  */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),

  patient_id uuid NOT NULL REFERENCES public.patients(id),
  /* The recording clinician, from the JWT at fire time. Never client-supplied. */
  doctor_id uuid NOT NULL REFERENCES public.users(id),

  /* The ONLY handle on the uploaded recording. The scoped S3 credential has no
     list permission, so an object whose key is not written down here cannot be
     found again by any means. Not nullable for that reason: a consultation row
     with no key would be a record of something unrecoverable. */
  audio_object_key text NOT NULL,

  /* PERSISTED SO THEY ARE NEVER RE-DERIVED. See the header. Both feed the
     partner's idempotency key verbatim; a retry reads them from here. */
  consultation_started_at timestamptz NOT NULL,
  consultation_ended_at timestamptz NOT NULL,

  /* pending        - written before the fire; the retry scanner owns it.
     fired          - a terminal response was seen (2xx, or 409 = already there).
     needs_attention - the retry ceiling was reached. THE HUMAN-VISIBLE STATE.
     The default is 'pending' because the row is inserted BEFORE the fire is
     attempted, so pending is the only truthful value at insert time. */
  fire_status text NOT NULL DEFAULT 'pending',

  /* Attempts made, including the first fire. Drives the backoff and the
     ceiling, and rides on the M1 payload as `attempt` so the partner can see
     which delivery they are looking at. */
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  /* PII-FREE by construction: the writers store a status code or an error class
     name, never a response body, never payload content. */
  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT consultations_fire_status_check
    CHECK (fire_status IN ('pending', 'fired', 'needs_attention')),
  CONSTRAINT consultations_window_check
    CHECK (consultation_ended_at >= consultation_started_at),
  CONSTRAINT consultations_attempt_count_check
    CHECK (attempt_count >= 0),

  /* THE PARTNER'S IDEMPOTENCY GRAIN, ENFORCED ON OUR SIDE. See the header:
     patient + both instants is exactly what their key is derived from, so two
     rows sharing it would be two consultations for one of their records. A
     double-submitted fire therefore reuses the existing row instead of opening
     a second, competing retry stream against the same key. */
  CONSTRAINT consultations_recording_unique
    UNIQUE (tenant_id, patient_id, consultation_started_at, consultation_ended_at)
);--> statement-breakpoint

/* The retry scanner's only query: pending rows, oldest attempt first, across
   every tenant (the job has no tenant context). Partial, so it stays small -
   it indexes the work queue, not the table. NULLS FIRST puts a row that has
   never been attempted ahead of one that has. */
CREATE INDEX IF NOT EXISTS consultations_pending_idx
  ON public.consultations (last_attempt_at NULLS FIRST)
  WHERE fire_status = 'pending';--> statement-breakpoint

/* The human's query: what is stuck in my clinic. Covers 'needs_attention'
   lookups and the per-tenant history read. */
CREATE INDEX IF NOT EXISTS consultations_tenant_status_idx
  ON public.consultations (tenant_id, fire_status, created_at DESC);--> statement-breakpoint

ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* TABLE GATE. RLS is the ROW gate; GRANT is the TABLE gate; BOTH are  */
/* required (0003_grants.sql), and a policy without a grant is dead.   */
/*                                                                    */
/* THIS TABLE INHERITS NOTHING. `GRANT ... ON ALL TABLES IN SCHEMA     */
/* public` in 0003 applied to the tables that existed when it ran, and */
/* never to tables created afterwards - the same note 0055 and 0058    */
/* carry.                                                             */
/*                                                                    */
/* AND IT INHERITS NOTHING FROM SUPABASE'S DEFAULT PRIVILEGES EITHER,  */
/* WHICH IS NEW INFORMATION AND WORTH THE LINES. 0058's header states  */
/* that Supabase applies schema-wide DEFAULT PRIVILEGES, so a new      */
/* table picks up SELECT and INSERT for `authenticated` at CREATE time */
/* with no statement granting them. On this migration that did not     */
/* happen: the first draft shipped the policy below with NO grant, and */
/* the DB-gated suite answered `permission denied for table            */
/* consultations` to EVERY statement - including the SELECT the policy */
/* exists to allow. Same Supabase stack, same `supabase db reset`.     */
/* Whatever 0058 observed does not hold here, so nothing on this table */
/* relies on it.                                                      */
/*                                                                    */
/* THE POSITIVE CONTROL IS WHY THAT WAS CAUGHT AND IT IS THE POINT.    */
/* With no grant, every negative assertion - cannot insert, cannot     */
/* update, cannot delete - PASSES, and passes FOR THE WRONG REASON:    */
/* not because the design refuses those writes but because the role    */
/* cannot reach the table at all. A suite of only negative assertions  */
/* would have gone green over a table reception could never read, and  */
/* the stuck-consultation state this whole migration exists to surface */
/* would have been invisible in production. The SELECT test is what    */
/* fails when the table gate is shut, and it did.                     */
/*                                                                    */
/* SELECT ONLY, and the REVOKE is not decoration: it is what keeps     */
/* fire_status a MACHINE verdict. Writes are the service-role seam.    */
/*                                                                    */
/* REFERENCES and TRIGGER are left alone, as in 0058: neither reads    */
/* nor writes a row, and revoking schema-wide defaults this migration  */
/* did not grant is scope it does not own.                            */
/*                                                                    */
/* THE PATIENT ROLE GETS NOTHING. A patient has no business reading    */
/* the delivery state of a clinical recording.                        */
/* ------------------------------------------------------------------ */

GRANT SELECT ON public.consultations TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.consultations FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.consultations FROM patient;--> statement-breakpoint

/* THE WRITER'S GRANT, EXPLICIT, following 0021_grants_hardening's rule for
   every post-0003 table. 0021 exists because Supabase auto-applies service_role
   grants at PROJECT CREATION and a table created later gets nothing - the same
   inheritance gap the block above just proved is real on this table. Leaving it
   implicit would mean the fire path and the retry job depend on connecting as
   the table OWNER, which is true today and is not a property this migration
   should quietly rest on. BYPASSRLS answers the row gate; this answers the
   table gate. */
GRANT ALL ON public.consultations TO service_role;--> statement-breakpoint

/* STAFF READ, tenant-scoped on the JWT claim, exactly like every other domain
   table. This is what makes a stuck consultation visible to a human. */
CREATE POLICY consultations_select_own_tenant
  ON public.consultations
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

/* NO INSERT, UPDATE OR DELETE POLICY, FOR ANY ROLE. Deliberate - see the
   header. Writes are the service-role seam with an explicit tenant_id; DELETE
   is absent because a consultation that failed to reach the partner is
   precisely the record you must not be able to make disappear.

   Note which gate refuses which. With SELECT granted and the rest revoked, a
   staff INSERT/UPDATE/DELETE is refused by the TABLE gate (permission denied)
   before RLS is consulted at all, and cross-tenant reads are refused by the
   ROW gate above. Two different mechanisms, and the suite asserts them
   separately so neither can be mistaken for the other. */

COMMENT ON TABLE public.consultations IS
  'One row per recorded consultation, written BEFORE the M1 webhook fires so a '
  'failed fire is recoverable instead of silent. Holds the only copy of the S3 '
  'audio object key (the scoped credential cannot list the bucket) and both '
  'consultation timestamps, which a retry re-uses VERBATIM because the AI '
  'partner derives their idempotency key from patient_id plus those two '
  'instants - re-stamping either would create a duplicate clinical record '
  'instead of an idempotent replay. fire_status is a machine verdict: written '
  'only through the service-role seam, never by a staff session, so ''fired'' '
  'always means a terminal response was observed. Migration 0064.';

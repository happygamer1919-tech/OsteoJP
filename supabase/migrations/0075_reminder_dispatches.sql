-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0075_reminder_dispatches.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0075 - reminder_dispatches, and the ONE function the status         */
/*        callback resolves a tenant with. SR-45 as ruled, with the    */
/*        four decisions taken on 2026-09-04.                          */
/*                                                                     */
/* SCOPE, RULED AND BOUNDED: this table, its indexes, its gates, and   */
/* that one function. No other table, no other policy, no backfill.    */
/* ================================================================== */
/*                                                                     */
/* WHY IT EXISTS, and it is a cost that has already been paid rather   */
/* than a precaution.                                                  */
/*                                                                     */
/* From 2026-09-02 to 2026-09-03 EVERY outbound message failed at      */
/* Twilio - the sender variable was wrong, SR-43 - and the system      */
/* reported nothing anywhere a person would look. The owner found it   */
/* in the Twilio console. On 2026-09-03 a post-visit SMS reached a     */
/* patient who already had an appointment the next day, and that was   */
/* also found by a human reading a log.                                */
/*                                                                     */
/* Nothing in this database could have answered either question,       */
/* because nothing records that a message was attempted. What exists   */
/* and what each one is NOT:                                           */
/*   sms_inbound_events        INBOUND only - replies that arrived.    */
/*   audit_log                 carries messaging.check.send, which is  */
/*                             the owner's OWN test page. The reminder */
/*                             pipeline writes no audit row at all.    */
/*   appointment_confirm_codes one row per 24h reminder that got as    */
/*                             far as minting a link. A proxy for      */
/*                             'attempted', and silent about delivery. */
/*                                                                     */
/* Everything else went to `console` and to Inngest run output, which  */
/* is not queryable and expires.                                       */
/* ================================================================== */

CREATE TABLE public.reminder_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES public.tenants(id),

  /* CASCADE, like appointment_confirm_codes and unlike audit_log: this
   * is operational telemetry about a message, not a legal record of an
   * act, so it has no reason to outlive the appointment it describes. */
  appointment_id uuid NOT NULL
    REFERENCES public.appointments(id) ON DELETE CASCADE,

  channel text NOT NULL
    CONSTRAINT reminder_dispatches_channel_check
    CHECK (channel IN ('sms', 'email')),

  /* ================================================================
   * TEXT, NOT AN ENUM, AND `notification_kind` IS NOT A COLUMN.
   * RULING 1, 2026-09-04.
   *
   * The id set moves with copy work - `reminder.24h.sms`,
   * `reminder.24h.sms.fee`, `confirmation.email`, `follow_up.sms` -
   * so an enum would need a migration every time a body is added,
   * and a body is added by a copy decision rather than a schema one.
   *
   * AND THE KIND IS DERIVED FROM IT RATHER THAN STORED BESIDE IT.
   * `reminder.24h.sms` already carries the kind, the offset and the
   * channel. A second column meaning the same thing is a second thing
   * that can disagree, and the one that disagrees silently is the one
   * nobody reads.
   * ================================================================ */
  template_id text NOT NULL
    CONSTRAINT reminder_dispatches_template_id_not_blank
    CHECK (btrim(template_id) <> ''),

  /* ================================================================
   * THE OUTCOME, AND THE REASON IS TIED TO IT IN BOTH DIRECTIONS.
   * RULING 4, 2026-09-04.
   *
   * A SUPPRESSION GETS A ROW. "We deliberately sent nothing, and here
   * is why" is the half that would have made the last two days
   * legible: a pipeline that records only its successes cannot tell
   * 'nobody was due' from 'everybody was refused'.
   *
   * THE CHECK IS AN EQUIVALENCE, NOT AN IMPLICATION. A reason without
   * a suppression is a row that lies about what happened; a
   * suppression without a reason is the case this table exists to
   * end. Both are refused.
   * ================================================================ */
  outcome text NOT NULL
    CONSTRAINT reminder_dispatches_outcome_check
    CHECK (outcome IN ('sent', 'suppressed', 'provider_error')),

  suppression_reason text
    CONSTRAINT reminder_dispatches_reason_matches_outcome
    CHECK ((suppression_reason IS NOT NULL) = (outcome = 'suppressed')),

  /* ================================================================
   * LENGTH AND SEGMENTS ARE STORED, NOT DERIVED AT READ TIME.
   *
   * The segment RULE can change - a body that leaves GSM-7 drops to
   * 70-character segments - and a historical row must say what was
   * true when it was sent, not what today's rule would make of it.
   * Both are NULL for email, which has no segments and whose length
   * nobody is billed for.
   * ================================================================ */
  body_length integer
    CONSTRAINT reminder_dispatches_body_length_sane
    CHECK (body_length IS NULL OR body_length >= 0),

  segments smallint
    CONSTRAINT reminder_dispatches_segments_sane
    CHECK (segments IS NULL OR segments >= 1),

  /* The provider's own id: a Twilio SID, or a Resend id. NULL when the
   * message was suppressed, because nothing was handed over. */
  provider_message_id text,

  /* What the provider last told us: queued, sent, delivered,
   * undelivered, failed. Deliberately NOT constrained to a list - the
   * values are Twilio's and Resend's to change, and a CHECK here would
   * turn their vocabulary change into our failed webhook. */
  provider_status text,

  /* TEXT and not an integer. Twilio's codes are numeric (30003, 21211)
   * and Resend's are not, and one column that holds both honestly is
   * better than two that are each null half the time. */
  provider_error_code text,

  /* When WE handed it over, which is the only instant this row can
   * know at insert time. */
  created_at timestamptz NOT NULL DEFAULT now(),

  /* When the provider last told us something. NULL until a callback
   * arrives, which is also how "handed over and never heard about
   * again" is distinguishable from "delivered". */
  status_at timestamptz
);--> statement-breakpoint

COMMENT ON TABLE public.reminder_dispatches IS
  'One row per ATTEMPT to hand a patient message to a provider, including '
  'attempts deliberately suppressed. A LEDGER, not a state machine: a retry '
  'writes a second row, because two attempts are two facts. Carries no '
  'recipient - the patient is reachable through appointment_id, and a hash '
  'nobody needs is a pseudonymous identifier nobody can justify.';--> statement-breakpoint

/* ================================================================== */
/* NO RECIPIENT COLUMN, AND NOT EVEN A HASH.                           */
/*                                                                     */
/* `sms_inbound_events.from_phone_hash` exists because an inbound       */
/* message has no appointment to hang off and the sender is the only    */
/* way to correlate it. This table has `appointment_id`, so the         */
/* recipient is one join away and storing it again would be storing     */
/* PII for no question it answers. CLAUDE.md rule 7.                    */
/* ================================================================== */

/* The operator read: "what happened on this tenant, most recent first". */
CREATE INDEX reminder_dispatches_tenant_time_idx
  ON public.reminder_dispatches (tenant_id, created_at DESC);--> statement-breakpoint

/* "Everything we ever sent about this appointment", which is the read a
 * person doing support actually makes. */
CREATE INDEX reminder_dispatches_appointment_idx
  ON public.reminder_dispatches (appointment_id);--> statement-breakpoint

/* ================================================================== */
/* THE UNIQUE INDEX IS WHAT MAKES THE CALLBACK'S LOOKUP SINGLE-VALUED. */
/*                                                                     */
/* PARTIAL, because a suppressed row has no provider id and there will  */
/* be many of them - a plain unique index would collapse every          */
/* suppression into one row. Without the uniqueness the callback would  */
/* have to choose between duplicate rows for one SID, and "choose" on a */
/* delivery record means "guess".                                       */
/* ================================================================== */
CREATE UNIQUE INDEX reminder_dispatches_provider_message_id_key
  ON public.reminder_dispatches (provider_message_id)
  WHERE provider_message_id IS NOT NULL;--> statement-breakpoint

/* ================================================================== */
/* TABLE GATES. RLS is the row gate, GRANT is the table gate, and both  */
/* are required - 0064's lesson was a policy with no grant, which makes */
/* every statement answer `permission denied`.                          */
/*                                                                     */
/* THE REVOKES ARE EXPLICIT rather than assumed absent, for the same    */
/* reason 0072 wrote them: Supabase applies default privileges at       */
/* CREATE TABLE, so "no grants" that is written as nothing is not       */
/* nothing. INSERT and SELECT only: nobody edits a delivery record by   */
/* hand, and DELETE would let a bad week be tidied away.                */
/* ================================================================== */
REVOKE ALL ON public.reminder_dispatches FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON public.reminder_dispatches FROM anon;--> statement-breakpoint
REVOKE ALL ON public.reminder_dispatches FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.reminder_dispatches FROM patient;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.reminder_dispatches TO authenticated;--> statement-breakpoint

ALTER TABLE public.reminder_dispatches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ================================================================== */
/* WHO MAY READ IT: owner, admin and reception of the owning tenant.    */
/*                                                                     */
/* NOT `therapist`, and that is a decision rather than an omission. A   */
/* delivery log is an operational and billing surface - who was texted, */
/* how many segments, what the provider charged for - and it is the     */
/* desk's instrument, not a clinical one. A therapist who needs to know */
/* whether a patient was reminded reads the appointment, which carries  */
/* the confirmation axis.                                              */
/* ================================================================== */
CREATE POLICY "reminder_dispatches_staff_select" ON public.reminder_dispatches
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint

/* ================================================================== */
/* WHO MAY WRITE IT: the dispatch path, which runs as `admin` inside    */
/* withReminderTenantContext - the same seam sms_inbound_events uses    */
/* for the Twilio webhook, and the same one 0069 admits.               */
/*                                                                     */
/* THE UPDATE IS FOR THE STATUS CALLBACK AND NOTHING ELSE, and its      */
/* WITH CHECK carries the same predicate as its USING: USING decides    */
/* which rows may be touched, WITH CHECK what they may become. Without  */
/* the second half a caller could move a row to another tenant, which   */
/* is the defect 0069's own comment names one table over.               */
/* ================================================================== */
CREATE POLICY "reminder_dispatches_pipeline_insert" ON public.reminder_dispatches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  );--> statement-breakpoint

CREATE POLICY "reminder_dispatches_pipeline_update" ON public.reminder_dispatches
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  );--> statement-breakpoint

/* ================================================================== */
/* THE TENANT LOOKUP FOR THE STATUS CALLBACK. RULING 2, 2026-09-04.    */
/*                                                                     */
/* THE PROBLEM IT SOLVES IS THE ONE 0072 SOLVED FOR CONFIRM CODES.     */
/* Twilio posts a status callback carrying a MessageSid and nothing    */
/* else we control. The route has no session and does not know the     */
/* tenant until something tells it, so the crossing has to be made     */
/* once, deliberately, in a function that cannot be steered.           */
/*                                                                     */
/* THE ALTERNATIVE WAS AN ENV VAR AND IT WAS REJECTED. The inbound     */
/* webhook takes its tenant from REMINDERS_INBOUND_TENANT_ID, which is */
/* the honest interim for one clinic and does not survive a second -   */
/* its own comment says so. A lookup on a value WE wrote survives the  */
/* second clinic without another decision.                             */
/*                                                                     */
/* IT RETURNS tenant_id AND NOTHING ELSE, which is the whole of the    */
/* ruling. Not the row, not the appointment, not the status: a         */
/* function that returned the rowtype would widen every time a column  */
/* is added, and this one is reachable from an unauthenticated route.  */
/*                                                                     */
/* STABLE, not VOLATILE: it writes nothing. The callback's UPDATE runs */
/* on the caller's own transaction once the tenant is known, under the */
/* policies above, so this function cannot change a delivery record    */
/* even by accident.                                                   */
/* ================================================================== */
CREATE OR REPLACE FUNCTION public.reminder_dispatch_tenant(p_provider_message_id text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT d.tenant_id
    FROM public.reminder_dispatches d
   WHERE d.provider_message_id = p_provider_message_id
$$;--> statement-breakpoint

/* 0060's rule: every public SECURITY DEFINER function is owned by
 * `postgres`, because the owner is whose privileges it runs with and a
 * different applying principal would silently change the answer. */
ALTER FUNCTION public.reminder_dispatch_tenant(text) OWNER TO postgres;--> statement-breakpoint

/* ================================================================== */
/* REVOKE FROM EVERY NAMED ROLE, service_role INCLUDED.                */
/*                                                                     */
/* `REVOKE ... FROM PUBLIC` DOES NOT REMOVE A PRIVILEGE A NAMED ROLE   */
/* HOLDS IN ITS OWN RIGHT. 0072 wrote that out for anon and patient.   */
/* What 0072 did NOT name is `service_role`, and PURPLE measured on CI */
/* that Supabase's ALTER DEFAULT PRIVILEGES grants it EXECUTE at       */
/* CREATE FUNCTION time ON SOME DATABASES AND NOT OTHERS.              */
/*                                                                     */
/* SO A REVOKE THAT READS AS SUFFICIENT IS NOT. This migration's first */
/* draft revoked PUBLIC, anon and patient, and a catalogue read of the */
/* result showed service_role holding EXECUTE anyway - on the lane     */
/* database, from the default privilege and not from any statement     */
/* here. The list below is therefore exhaustive by NAME rather than by */
/* the assumption that PUBLIC covers them.                             */
/*                                                                     */
/* WHY service_role MATTERS ON THIS PARTICULAR FUNCTION: it is the     */
/* Supabase key that bypasses RLS entirely, and this function exists   */
/* to cross a tenant boundary. A role that already bypasses RLS does   */
/* not need a tenant lookup, and handing it one widens the only        */
/* deliberate crossing in the file for no caller that exists.          */
/*                                                                     */
/* PROVEN BY READING proacl BACK OUT OF pg_proc, not by trusting these */
/* statements - see reminder-dispatches.db.test.ts and the post-check. */
/* ================================================================== */
REVOKE ALL ON FUNCTION public.reminder_dispatch_tenant(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reminder_dispatch_tenant(text) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reminder_dispatch_tenant(text) FROM patient;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reminder_dispatch_tenant(text) FROM service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reminder_dispatch_tenant(text) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.reminder_dispatch_tenant(text) IS
  'The tenant a provider message id belongs to, and nothing else. Exists so '
  'the Twilio status callback - which has no session and knows only the SID - '
  'can enter tenant-scoped RLS from a value WE wrote rather than from the '
  'payload. Same crossing resolve_confirm_code makes for the confirm page, '
  'bounded the same three ways: one argument, one column, no table grant.';--> statement-breakpoint

/* ================================================================== */
/* RETENTION IS NOT HERE. RULING 3, 2026-09-04.                        */
/*                                                                     */
/* This table grows one row per patient per message, forever, and that */
/* is a real cost that somebody will have to decide about. It is NOT   */
/* decided here: a retention policy written into the migration that    */
/* creates the table is a decision taken by whoever happened to be     */
/* authoring, at the moment they were least informed about how the     */
/* data would be used. It is carded separately instead.                */
/* ================================================================== */

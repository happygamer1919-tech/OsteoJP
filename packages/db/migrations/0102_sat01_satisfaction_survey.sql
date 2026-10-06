/* ====================================================================== */
/* SAT-01: the satisfaction survey ("Avaliacao de satisfacao"). Its three */
/* tables, its doors, its policies and its grants.                        */
/* ====================================================================== */
/* PENDING. This file must follow 0101 (the optional email on a public    */
/* booking request). It carries no number of its own, so a promotion is a */
/* rename and changes no byte.                                            */
/*                                                                        */
/* THE WHAT is docs/design/SPEC-SAT-01-satisfaction-form.md, as amended   */
/* to strategy's rulings S1 to S12 (S-1002-D) and R32 to R35 (S-1004-A).  */
/* The rulings this file implements:                                      */
/*   S3 the automatic send is skipped when ANY send, manual or automatic, */
/*   exists for the patient in the last 60 days;                          */
/*   S4 the manual send attaches to the patient's most recent concluded   */
/*   appointment, is not blocked by the 60-day rule, and is refused while */
/*   an unanswered link is still valid;                                   */
/*   S5 one row per send: time, sender or automatic, channel,             */
/*   appointment;                                                         */
/*   S7 an answer is read, ENFORCED HERE IN RLS, by the therapist who     */
/*   attended the appointment within their own clinics, by reception and  */
/*   admin for appointments at their clinics, and by the owner; by no     */
/*   other therapist;                                                     */
/*   S8 the patient's survey switch, and no send path overrides it;       */
/*   S12 comments are deleted after 24 months and scores are kept;        */
/*   R32 (O9) a fifth disabled reason for the manual send: the last       */
/*   concluded visit already has an answer;                               */
/*   R34 (O11) the survey switch is settable by the patient and by the    */
/*   same staff roles that edit reminder preferences, same clinic scope,  */
/*   with an audit row per change, in RLS;                                */
/*   R39 the two CREATE POLICY statements are the LAST two statements of  */
/*   this file.                                                           */
/*                                                                        */
/* WHAT IT ADDS: one column on patients, three tables, nine functions     */
/* (eight SECURITY DEFINER, one private helper that runs as its caller),  */
/* one trigger on patients, two SELECT policies, the grants below. WHAT   */
/* IT CHANGES IN EXISTING DATA: nothing. No backfill, no UPDATE and no    */
/* DELETE of any existing row. The new column takes a constant default,   */
/* which Postgres stores once in the catalogue: the patients table is not */
/* rewritten.                                                             */
/*                                                                        */
/* THE LOCKS, read from the statements and measured (the apply document's */
/* G6), for its R9 arm. NO STATEMENT BEFORE SECTION 6'S ALTER TABLE LOCKS */
/* A TABLE THAT EXISTED BEFORE THIS FILE, in any mode: the three tables   */
/* are created without their foreign keys to tenants, appointments,       */
/* patients and users, and all nine functions are plpgsql, whose bodies   */
/* are not planned when they are created (a SQL-language body is, and     */
/* that takes a lock on every table it reads). Every lock on an existing  */
/* table is taken in ONE GROUP at the end, the last nine statements,      */
/* in ONE order: ACCESS EXCLUSIVE on patients first (section 6's ALTER    */
/* TABLE; it stops READS of patients as well as writes), then SHARE ROW   */
/* EXCLUSIVE on appointments, tenants and users (section 7's foreign      */
/* keys; it stops WRITES to them), then the platform's tables (section    */
/* 8's policies). Reception writes patients and appointments, so this     */
/* file is neither catalog-only nor clear of the tables reception writes. */
/* Every lock is held until the single COMMIT of the pending set.         */
/* lock_timeout bounds each WAIT for a lock, not the time a lock is held, */
/* and neither bound covers the time between two statements; the third    */
/* setting, idle_in_transaction_session_timeout, bounds the time the      */
/* session sits idle between two statements.                              */
/*                                                                        */
/* WHY THE POLICIES COME LAST (R39). Measured on a local Supabase stack:  */
/* a CREATE POLICY run by postgres takes ACCESS EXCLUSIVE on every table  */
/* the platform's supautils.policy_grants setting names for that role     */
/* (auth.users, auth.sessions, auth.refresh_tokens, storage.objects and   */
/* the rest), and holds it until the COMMIT. Staff logins and token       */
/* refreshes wait on those locks. With the two policies last, they are    */
/* held for the last two statements only. Between ENABLE ROW LEVEL        */
/* SECURITY (section 4) and the policies, the readable tables have RLS on */
/* and no policy, which admits no application role: the safe side, and    */
/* inside this one transaction nobody else sees it. Nothing between them  */
/* needs a policy to exist.                                               */
/* ====================================================================== */

/* The two SET LOCAL lines, first, as every migration from 0100 on must   */
/* start (the lead's ruling (b) of 2026-10-01; values accepted by R10;    */
/* scripts/migration-timeouts.test.mjs refuses a file without them).      */
/* The third line is strategy's ruling of 2026-10-06 (Q5 of S-1006-A): a  */
/* sitting whose session stalls with the transaction open is ended by the */
/* server after 15 seconds idle, and its locks are released.              */
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* 1. ONE ROW PER SEND (S5, spec 6.3)                                     */
/* ====================================================================== */
/* The send is what staff see; the code is what the link carries.         */
/*                                                                        */
/* appointment_id is NOT unique: a manual send may follow an expired,     */
/* unanswered one for the same appointment (S4).                          */
/*                                                                        */
/* location_id IS A COPY of the appointment's location, made by the issue */
/* door when the send is written. The SELECT policy below reads it, so    */
/* what reception and admin see is decided by this row and by             */
/* viewer_location_ids(), never by the appointments policy: a later       */
/* change to that policy cannot widen or narrow who sees a send. A        */
/* JUDGMENT, NOT A RULING: the spec allows a helper or a copy, and a copy */
/* keeps the policy a plain per-row test with no join.                    */
/*                                                                        */
/* THE FOREIGN KEYS, AND WHAT A DELETE DOES (decided, and tested per      */
/* row). To the APPOINTMENT: a send goes with it (ON DELETE CASCADE, and  */
/* its code with the send); an answer does not, so an appointment that    */
/* has an answer cannot be hard-deleted (section 3, O6 (a)). To the       */
/* PATIENT: NO ACTION on both the send and the answer. A patient row      */
/* cannot be deleted while a send or an answer names it, exactly as it    */
/* cannot while a note, an invoice or a consent row does: the application */
/* hard-deletes only a patient nothing refers to, and an answer is never  */
/* erased as a side effect of deleting something else. So no answer       */
/* outlives its patient, and none disappears silently. merge_patients     */
/* (0005) does not know these tables: until the application re-points     */
/* them, a merged-away patient keeps its sends and answers and cannot be  */
/* hard-deleted (23503). That is application work, recorded in the spec.  */
/*                                                                        */
/* THE EIGHT FOREIGN KEYS TO tenants, appointments, patients AND users    */
/* ARE NOT WRITTEN IN THE THREE CREATE TABLE STATEMENTS. A REFERENCES     */
/* clause takes SHARE ROW EXCLUSIVE on the table it names and holds it    */
/* until the COMMIT. Section 7 adds the eight, each under the name the    */
/* inline form gives it (<table>_<column>_fkey) and with the same         */
/* definition, after the patients column. Only the two foreign keys to    */
/* appointment_survey_sends, a table of this file, are written inline.    */
/*                                                                        */
/* NO expires_at, following 0072 and SR-28: a link lives 14 days from its */
/* send, and that is read as sent_at + 14 days wherever it is decided.    */
CREATE TABLE public.appointment_survey_sends (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  appointment_id uuid NOT NULL,
  patient_id     uuid NOT NULL,
  location_id    uuid NOT NULL,
  channel        text NOT NULL
    CONSTRAINT appointment_survey_sends_channel_check CHECK (channel IN ('email', 'sms')),
  origin         text NOT NULL
    CONSTRAINT appointment_survey_sends_origin_check CHECK (origin IN ('automatic', 'manual')),
  sent_by        uuid,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  consumed_at    timestamptz,
  outcome        text
    CONSTRAINT appointment_survey_sends_outcome_check CHECK (outcome IN ('answered', 'opted_out')),
  CONSTRAINT appointment_survey_sends_sender_matches_origin CHECK ((origin = 'manual') = (sent_by IS NOT NULL)),
  CONSTRAINT appointment_survey_sends_outcome_matches_consumed CHECK ((consumed_at IS NULL) = (outcome IS NULL))
);--> statement-breakpoint

/* THE 60-DAY LOOKUP (S3) AND THE VALID-LINK LOOKUP (S4): both read the   */
/* sends of one patient, newest first.                                    */
CREATE INDEX appointment_survey_sends_patient_sent_idx
  ON public.appointment_survey_sends (tenant_id, patient_id, sent_at DESC);--> statement-breakpoint

/* An appointment's hard delete cascades here; without this index every   */
/* such delete would scan the table.                                      */
CREATE INDEX appointment_survey_sends_appointment_idx
  ON public.appointment_survey_sends (appointment_id);--> statement-breakpoint

COMMENT ON TABLE public.appointment_survey_sends IS
  'SAT-01 (S5): one row per survey send, automatic or manual. Written only by '
  'issue_survey_automatic and issue_survey_manual; consumed only by '
  'submit_survey_response and opt_out_survey. location_id is a copy of the '
  'appointment''s location at the send. A link lives 14 days from sent_at. '
  'Read by the owner, by admin and reception for sends at their clinics, and by '
  'a therapist for the patients they treat (S4''s roles, because S5 shows the '
  'status beside S4''s button). No application role may write it.';--> statement-breakpoint

/* ====================================================================== */
/* 2. THE CODE A LINK CARRIES (spec 6.3, the 0072 shape)                  */
/* ====================================================================== */
/* An HMAC of the code, never the code. One code per send. Nobody reads   */
/* this table: RLS on, no policy, and no grant to any application role.   */
/* It cannot be appointment_confirm_codes: that table allows one live     */
/* code per appointment, so a confirm code would block a survey code, and */
/* its expiry is read from starts_at.                                     */
CREATE TABLE public.appointment_survey_codes (
  code_hash text PRIMARY KEY
    CONSTRAINT appointment_survey_codes_hash_is_hex CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid NOT NULL,
  send_id   uuid NOT NULL UNIQUE REFERENCES public.appointment_survey_sends(id) ON DELETE CASCADE
);--> statement-breakpoint

COMMENT ON TABLE public.appointment_survey_codes IS
  'SAT-01: the survey link''s code, stored only as an HMAC (the 0072 shape), one '
  'per send. No application role can read or write it; only the survey doors '
  'touch it.';--> statement-breakpoint

/* ====================================================================== */
/* 3. ONE ANSWER PER SEND (spec 6.4)                                      */
/* ====================================================================== */
/* send_id, appointment_id, patient_id, channel and sent_at are copied    */
/* from the send by submit_survey_response, never taken from the caller.  */
/* location_id, practitioner_id and practitioner_2_id are copied from the */
/* appointment at the submit, so the S7 policy below reads this row and   */
/* viewer_location_ids() and nothing else. A JUDGMENT, NOT A RULING, the  */
/* same as the send's location copy: the spec allows a helper or a copy.  */
/*                                                                        */
/* appointment_id is UNIQUE: one answer per visit. RULED: R32 (O9) makes  */
/* an answered last visit a disabled reason for the manual send, so no    */
/* second answer for one appointment is ever asked for.                   */
/*                                                                        */
/* NO CASCADE from the send or the appointment (O6 (a), the spec's        */
/* recommendation): an appointment's hard delete is refused while an      */
/* answer exists, because an answer is something a patient gave and is    */
/* not lost silently. An unanswered send goes with its appointment.       */
CREATE TABLE public.appointment_survey_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  send_id           uuid NOT NULL UNIQUE REFERENCES public.appointment_survey_sends(id),
  appointment_id    uuid NOT NULL UNIQUE,
  patient_id        uuid NOT NULL,
  location_id       uuid NOT NULL,
  practitioner_id   uuid NOT NULL,
  practitioner_2_id uuid,
  nps               smallint NOT NULL
    CONSTRAINT appointment_survey_responses_nps_range CHECK (nps BETWEEN 0 AND 10),
  rating            smallint NOT NULL
    CONSTRAINT appointment_survey_responses_rating_range CHECK (rating BETWEEN 1 AND 5),
  comment           text
    CONSTRAINT appointment_survey_responses_comment_length CHECK (comment IS NULL OR char_length(comment) BETWEEN 1 AND 1000),
  comment_purged_at timestamptz,
  contact_consent   boolean NOT NULL,
  consent_version   text NOT NULL
    CONSTRAINT appointment_survey_responses_consent_version_not_blank CHECK (btrim(consent_version) <> '')
    CONSTRAINT appointment_survey_responses_consent_version_length CHECK (char_length(consent_version) <= 64),
  channel           text NOT NULL
    CONSTRAINT appointment_survey_responses_channel_check CHECK (channel IN ('email', 'sms')),
  sent_at           timestamptz NOT NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_survey_responses_purged_has_no_comment CHECK (comment_purged_at IS NULL OR comment IS NULL)
);--> statement-breakpoint

/* The list, newest first; and the retention job's 24-month scan.         */
CREATE INDEX appointment_survey_responses_tenant_submitted_idx
  ON public.appointment_survey_responses (tenant_id, submitted_at DESC);--> statement-breakpoint

COMMENT ON TABLE public.appointment_survey_responses IS
  'SAT-01: one answer per send and per appointment. It carries the patient''s '
  'identity (S7). Read, enforced in RLS, by the therapist who attended the '
  'appointment within their own clinics, by reception and admin for '
  'appointments at their clinics, and by the owner; by no other therapist. '
  'Written only by submit_survey_response. The comment is set to NULL after 24 '
  'months by purge_expired_survey_comments, and the scores are kept (S12). Not a '
  'clinical record.';--> statement-breakpoint

/* ====================================================================== */
/* 4. THE TABLE GATES                                                     */
/* ====================================================================== */
/* RLS on all three. Then REVOKE ALL from every application role BY NAME, */
/* because Supabase's ALTER DEFAULT PRIVILEGES hands authenticated and    */
/* service_role their table privileges at CREATE TABLE (a REVOKE from     */
/* PUBLIC does not touch a role granted by name), and then GRANT exactly  */
/* SELECT on the two readable tables to authenticated. No INSERT, UPDATE  */
/* or DELETE grant to any application role, and no write policy: the      */
/* doors below are the only writers. THE TWO SELECT POLICIES ARE THE LAST */
/* TWO STATEMENTS OF THIS FILE (section 8, R39); until they run, RLS is   */
/* on with no policy, and no application role reads either table.         */
/* service_role is left as the platform default makes it (a BYPASSRLS     */
/* administrative role the application does not drop to), as 0072 and     */
/* 0093 left it.                                                          */
ALTER TABLE public.appointment_survey_sends ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.appointment_survey_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.appointment_survey_responses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON TABLE public.appointment_survey_sends FROM PUBLIC, anon, authenticated, patient;--> statement-breakpoint
REVOKE ALL ON TABLE public.appointment_survey_codes FROM PUBLIC, anon, authenticated, patient;--> statement-breakpoint
REVOKE ALL ON TABLE public.appointment_survey_responses FROM PUBLIC, anon, authenticated, patient;--> statement-breakpoint

GRANT SELECT ON TABLE public.appointment_survey_sends TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE public.appointment_survey_responses TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* 5. THE DOORS                                                           */
/* ====================================================================== */
/* Every door: SECURITY DEFINER, SET search_path = public, owned by       */
/* postgres BY AN EXPLICIT PIN (0060's rule), REVOKE ALL from PUBLIC,     */
/* anon, authenticated, patient and service_role BY NAME (0079's rule: a  */
/* REVOKE from PUBLIC does not touch a role granted by name, and the      */
/* converse), then GRANT EXECUTE to authenticated alone. The purge gets   */
/* no grant at all.                                                       */
/*                                                                        */
/* ONE OWNER PIN PER SECURITY DEFINER FUNCTION, AND NONE ELSE. The        */
/* private helper of 5a is NOT SECURITY DEFINER, so it carries NO `ALTER  */
/* FUNCTION ... OWNER TO`: the repository's pairing rule                  */
/* (packages/db/tests/secdef-from-migrations.ts) calls a pin on a         */
/* function that is not a definer an extra pin and fails, and a migration */
/* cannot be edited once applied. The helper is owned by postgres all the */
/* same, because postgres creates it; the pre-check requires the session  */
/* to be postgres, and the post-check reads the owner of all nine.        */
/*                                                                        */
/* Every door that takes a tenant proves it twice: it must equal the JWT  */
/* tenant claim of the caller's session, and every row it reads or writes */
/* is matched on it in the same statement. A JUDGMENT, NOT A RULING: the  */
/* spec asks for the second; the first costs nothing on the app's paths   */
/* (withReminderTenantContext and runScoped both set the claim) and stops */
/* a session of one tenant naming another.                                */
/*                                                                        */
/* WHICH SESSION MAY CALL WHICH DOOR. The role is `authenticated` for all */
/* of them, so the test is the session's claims. A SERVER-ONLY session    */
/* carries a tenant and NO user and no patient claim: it is what the      */
/* application makes on its own database connection                       */
/* (withReminderTenantContext) for the 24-hour job and for the public     */
/* survey page, and nothing else can make one, because a JWT that         */
/* Supabase Auth signs always names its user, the anon key's role is      */
/* `anon` and the service key's is `service_role`, and neither of those   */
/* holds EXECUTE here. The automatic send (5b) and the THREE DOORS OF THE */
/* SURVEY PAGE (5e the read, 5f the answer, 5g the opt-out) answer only   */
/* that session. A session that carries a user, any staff member's        */
/* included, gets from them what an unknown code gets: nothing, false,    */
/* false. So a staff member who calls the manual door with a hash of      */
/* their own choosing holds a hash nobody can redeem: their own session   */
/* is refused here, and the page reaches these doors only with            */
/* HMAC(secret, the code in the link), a secret no staff member holds.    */
/* The manual send (5c) and the button's state (5d) are the other way     */
/* round: they need the staff member's own session.                       */
/*                                                                        */
/* THE CODE'S SHAPE IS CHECKED FIRST, IN EVERY DOOR THAT TAKES ONE: 64    */
/* lower-case hex characters, an HMAC. Anything else gets the answer a    */
/* wrong code gets (not_allowed from the two issue doors, false from the  */
/* answer and the opt-out, no row from the read), never the 23514 the     */
/* codes table's CHECK would raise, so the shape of a guess tells         */
/* nothing.                                                               */
/*                                                                        */
/* THE PER-PATIENT LOCK. Both issue doors take a transaction advisory     */
/* lock keyed on the patient before they decide, so two runs waking      */
/* together for one patient, or an automatic run and a manual press,      */
/* produce one send and not two. The second waits, then reads the first's */
/* committed send in its next statement and refuses.                      */

/* ---------------------------------------------------------------------- */
/* 5a. THE MANUAL SEND'S VERDICT, private. One predicate for the button's */
/* state and for the manual door, so the two cannot disagree. It runs as  */
/* its CALLER (no SECURITY DEFINER): inside a door that is postgres; no   */
/* application role may execute it directly.                              */
/*                                                                        */
/* The order of the refusals is the spec's (5.4): no concluded            */
/* appointment, opted out, no permitted channel, an unanswered link still */
/* valid; then the fifth, RULED BY R32 (O9): the most recent concluded    */
/* appointment already has an answer (reason "answered", copy text 82).   */
/* p_channel is 'email' or 'sms' for the door, and 'any' for the state:   */
/* no permitted channel then means neither.                               */
/*                                                                        */
/* Caller rights (S4): the owner; admin and reception when the            */
/* appointment the send attaches to is at one of their clinics; a         */
/* therapist for a patient they treat. A soft-deleted patient, a patient  */
/* of another tenant and a session with no user are not_allowed.          */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.survey_manual_verdict(p_tenant_id uuid, p_patient_id uuid, p_channel text)
  RETURNS TABLE (result text, appointment_id uuid)
  LANGUAGE plpgsql
  STABLE
  SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_role     text := (SELECT public.jwt_role());
  v_uid      uuid := (SELECT auth.uid());
  v_patient  record;
  v_appt     record;
  v_email_ok boolean;
  v_sms_ok   boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_patient_id IS NULL OR v_uid IS NULL
     OR p_tenant_id IS DISTINCT FROM (SELECT public.jwt_tenant_id())
     OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'reception', 'therapist') THEN
    RETURN QUERY SELECT 'not_allowed'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT p.survey_enabled, p.email, p.phone, p.reminder_email_enabled, p.reminder_sms_enabled
    INTO v_patient
    FROM public.patients p
   WHERE p.id = p_patient_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_allowed'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_role = 'therapist'
     AND NOT (p_patient_id = ANY (coalesce(public.viewer_treated_patient_ids(), '{}'::uuid[]))) THEN
    RETURN QUERY SELECT 'not_allowed'::text, NULL::uuid;
    RETURN;
  END IF;

  /* The patient's most recent concluded appointment, as the recipient    */
  /* (patient_id, never patient_2_id: default 9). The door finds it; the  */
  /* caller never names it.                                               */
  SELECT a.id, a.location_id
    INTO v_appt
    FROM public.appointments a
   WHERE a.tenant_id = p_tenant_id AND a.patient_id = p_patient_id AND a.status = 'completed'
   ORDER BY a.ends_at DESC, a.id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_appointment'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_role IN ('admin', 'reception')
     AND NOT (v_appt.location_id = ANY (coalesce(public.viewer_location_ids(), '{}'::uuid[]))) THEN
    RETURN QUERY SELECT 'not_allowed'::text, NULL::uuid;
    RETURN;
  END IF;

  IF NOT v_patient.survey_enabled THEN
    RETURN QUERY SELECT 'opted_out'::text, v_appt.id;
    RETURN;
  END IF;

  v_email_ok := v_patient.reminder_email_enabled AND coalesce(btrim(v_patient.email), '') <> '';
  v_sms_ok := v_patient.reminder_sms_enabled AND coalesce(btrim(v_patient.phone), '') <> '';
  IF NOT coalesce(CASE p_channel
                    WHEN 'email' THEN v_email_ok
                    WHEN 'sms' THEN v_sms_ok
                    WHEN 'any' THEN v_email_ok OR v_sms_ok
                    ELSE false
                  END, false) THEN
    RETURN QUERY SELECT 'no_channel'::text, v_appt.id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1
               FROM public.appointment_survey_sends s
              WHERE s.tenant_id = p_tenant_id
                AND s.patient_id = p_patient_id
                AND s.consumed_at IS NULL
                AND s.sent_at > now() - interval '14 days') THEN
    RETURN QUERY SELECT 'open_link'::text, v_appt.id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.appointment_survey_responses r WHERE r.appointment_id = v_appt.id) THEN
    RETURN QUERY SELECT 'answered'::text, v_appt.id;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ready'::text, v_appt.id;
END
$fn$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.survey_manual_verdict(uuid, uuid, text) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint

COMMENT ON FUNCTION public.survey_manual_verdict(uuid, uuid, text) IS
  'SAT-01 (S4): the manual send''s verdict, shared by survey_send_state and '
  'issue_survey_manual so the button and the door cannot disagree. Runs as its '
  'caller; no application role may execute it.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5b. THE AUTOMATIC SEND (S3). Called by the 24-hour job through         */
/* withReminderTenantContext, which carries a tenant and no user. Returns */
/* issued, cooldown, not_eligible or not_allowed.                         */
/*                                                                        */
/* not_allowed: the code is not 64 hex characters, the tenant is not the  */
/* session's, or the session carries a user or a patient claim.           */
/* A JUDGMENT, NOT A RULING: a staff session sends through the            */
/* manual door, which records who sent; letting it mint an automatic send */
/* would put a 60-day cooldown and an open link on a patient with no name */
/* on either.                                                             */
/* not_eligible: the appointment is not in the tenant or not concluded,   */
/* the patient is soft-deleted or opted out (S8), the channel is not      */
/* permitted (the patient's switch for it is off or the contact is        */
/* missing), or the appointment already has an answer (R32).              */
/* cooldown: ANY send to the patient, manual or automatic, in the last 60 */
/* days (S3), decided under the per-patient lock.                         */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.issue_survey_automatic(p_code_hash text, p_tenant_id uuid, p_appointment_id uuid, p_channel text)
  RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_patient_id uuid;
  v_appt       record;
  v_patient    record;
  v_send_id    uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_appointment_id IS NULL
     OR p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_tenant_id IS DISTINCT FROM (SELECT public.jwt_tenant_id())
     OR (SELECT auth.uid()) IS NOT NULL
     OR (SELECT public.jwt_patient_id()) IS NOT NULL THEN
    RETURN 'not_allowed';
  END IF;

  SELECT a.patient_id INTO v_patient_id
    FROM public.appointments a
   WHERE a.id = p_appointment_id AND a.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN 'not_eligible';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sat01:' || v_patient_id::text, 0));

  SELECT a.id, a.patient_id, a.location_id, a.status
    INTO v_appt
    FROM public.appointments a
   WHERE a.id = p_appointment_id AND a.tenant_id = p_tenant_id;
  IF NOT FOUND OR v_appt.status <> 'completed' THEN
    RETURN 'not_eligible';
  END IF;

  SELECT p.survey_enabled, p.email, p.phone, p.reminder_email_enabled, p.reminder_sms_enabled
    INTO v_patient
    FROM public.patients p
   WHERE p.id = v_appt.patient_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL;
  IF NOT FOUND OR NOT v_patient.survey_enabled THEN
    RETURN 'not_eligible';
  END IF;

  IF NOT coalesce(CASE p_channel
                    WHEN 'email' THEN v_patient.reminder_email_enabled AND coalesce(btrim(v_patient.email), '') <> ''
                    WHEN 'sms' THEN v_patient.reminder_sms_enabled AND coalesce(btrim(v_patient.phone), '') <> ''
                    ELSE false
                  END, false) THEN
    RETURN 'not_eligible';
  END IF;

  IF EXISTS (SELECT 1 FROM public.appointment_survey_responses r WHERE r.appointment_id = v_appt.id) THEN
    RETURN 'not_eligible';
  END IF;

  IF EXISTS (SELECT 1
               FROM public.appointment_survey_sends s
              WHERE s.tenant_id = p_tenant_id
                AND s.patient_id = v_appt.patient_id
                AND s.sent_at > now() - interval '60 days') THEN
    RETURN 'cooldown';
  END IF;

  INSERT INTO public.appointment_survey_sends (tenant_id, appointment_id, patient_id, location_id, channel, origin, sent_by)
  VALUES (p_tenant_id, v_appt.id, v_appt.patient_id, v_appt.location_id, p_channel, 'automatic', NULL)
  RETURNING id INTO v_send_id;

  INSERT INTO public.appointment_survey_codes (code_hash, tenant_id, send_id)
  VALUES (p_code_hash, p_tenant_id, v_send_id);

  RETURN 'issued';
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.issue_survey_automatic(text, uuid, uuid, text) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.issue_survey_automatic(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.issue_survey_automatic(text, uuid, uuid, text) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.issue_survey_automatic(text, uuid, uuid, text) IS
  'SAT-01 (S3): the automatic survey send, for the 24-hour job. Refuses a '
  'session with a user or a patient claim, a code that is not 64 hex '
  'characters, a tenant other than the session''s, an appointment not '
  'concluded, a patient opted out (S8) or without the channel, an answered '
  'appointment, and any send to the patient in the last 60 days, decided under '
  'a per-patient lock. Writes one send and its code.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5c. THE MANUAL SEND (S4, S5). Called with the staff member's own       */
/* session (runScoped), so auth.uid() is the sender; sent_by is never     */
/* taken from the caller. Not subject to the 60-day rule (S4). Returns    */
/* (result, appointment_id): issued, or the verdict's reason.             */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.issue_survey_manual(p_code_hash text, p_tenant_id uuid, p_patient_id uuid, p_channel text)
  RETURNS TABLE (result text, appointment_id uuid)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_channel  text := CASE WHEN p_channel IN ('email', 'sms') THEN p_channel ELSE 'none' END;
  v_verdict  record;
  v_location uuid;
  v_send_id  uuid;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'not_allowed'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sat01:' || p_patient_id::text, 0));

  SELECT v.result, v.appointment_id INTO v_verdict
    FROM public.survey_manual_verdict(p_tenant_id, p_patient_id, v_channel) v;
  IF v_verdict.result IS DISTINCT FROM 'ready' THEN
    RETURN QUERY SELECT coalesce(v_verdict.result, 'not_allowed'), v_verdict.appointment_id;
    RETURN;
  END IF;

  SELECT a.location_id INTO v_location
    FROM public.appointments a
   WHERE a.id = v_verdict.appointment_id AND a.tenant_id = p_tenant_id;

  INSERT INTO public.appointment_survey_sends (tenant_id, appointment_id, patient_id, location_id, channel, origin, sent_by)
  VALUES (p_tenant_id, v_verdict.appointment_id, p_patient_id, v_location, v_channel, 'manual', (SELECT auth.uid()))
  RETURNING id INTO v_send_id;

  INSERT INTO public.appointment_survey_codes (code_hash, tenant_id, send_id)
  VALUES (p_code_hash, p_tenant_id, v_send_id);

  /* Rule 6: a permission-sensitive staff action writes one audit row.    */
  /* The channel and the origin, never a score, a comment or a contact.   */
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, (SELECT auth.uid()), 'survey.sent', 'appointment', v_verdict.appointment_id,
          jsonb_build_object('channel', v_channel, 'origin', 'manual'));

  RETURN QUERY SELECT 'issued'::text, v_verdict.appointment_id;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.issue_survey_manual(text, uuid, uuid, text) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.issue_survey_manual(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.issue_survey_manual(text, uuid, uuid, text) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.issue_survey_manual(text, uuid, uuid, text) IS
  'SAT-01 (S4, S5): the manual survey send. Proves the caller''s right from the '
  'JWT role and auth.uid(), finds the patient''s most recent concluded '
  'appointment itself, and refuses with a reason under the per-patient lock: '
  'not_allowed (a code that is not 64 hex characters included), no_appointment, '
  'opted_out, no_channel, open_link, answered. Not '
  'subject to the 60-day rule. Writes one send with sent_by = auth.uid(), its '
  'code, and one audit_log row.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5d. THE BUTTON'S STATE (S4). The same verdict, written nowhere.        */
/* Returns (state, reason, appointment_id): ready; disabled with the      */
/* reason; or not_allowed.                                                */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.survey_send_state(p_tenant_id uuid, p_patient_id uuid)
  RETURNS TABLE (state text, reason text, appointment_id uuid)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_verdict record;
BEGIN
  SELECT v.result, v.appointment_id INTO v_verdict
    FROM public.survey_manual_verdict(p_tenant_id, p_patient_id, 'any') v;
  IF v_verdict.result = 'ready' THEN
    RETURN QUERY SELECT 'ready'::text, NULL::text, v_verdict.appointment_id;
  ELSIF v_verdict.result IS DISTINCT FROM 'not_allowed' AND v_verdict.result IS NOT NULL THEN
    RETURN QUERY SELECT 'disabled'::text, v_verdict.result, v_verdict.appointment_id;
  ELSE
    RETURN QUERY SELECT 'not_allowed'::text, NULL::text, NULL::uuid;
  END IF;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.survey_send_state(uuid, uuid) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.survey_send_state(uuid, uuid) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.survey_send_state(uuid, uuid) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.survey_send_state(uuid, uuid) IS
  'SAT-01 (S4): the Enviar avaliacao button''s state, from the same verdict as '
  'issue_survey_manual, without writing: ready, disabled with its reason, or '
  'not_allowed.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5e. THE GUEST PAGE'S READ. Opening the link performs nothing: STABLE,  */
/* no write. One row only when the session is the server's own (no user,  */
/* no patient claim), the code exists, its send is unconsumed, now() is   */
/* before sent_at + 14 days, the appointment is still concluded, the      */
/* patient is not soft-deleted, and the appointment has no answer (R32).  */
/* Zero rows for every other case, identically (SR-30): an unknown,       */
/* spent, expired or no-longer-eligible code cannot be told apart. It     */
/* takes no tenant, because the page does not know it before this answers */
/* (0072's reason); it returns three columns, never the table's row type. */
/* PLPGSQL, NOT SQL, AND NOT FOR STYLE: a SQL-language body is planned    */
/* when the function is created, which takes ACCESS SHARE on appointments */
/* and patients at this statement and holds it until the COMMIT. A        */
/* plpgsql body is planned at its first call. Every column in the query   */
/* is written with its table's alias, so none can be read as one of the   */
/* three output columns.                                                  */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.resolve_survey_code(p_code_hash text)
  RETURNS TABLE (tenant_id uuid, appointment_id uuid, visit_ends_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT s.tenant_id, s.appointment_id, a.ends_at
    FROM public.appointment_survey_codes c
    JOIN public.appointment_survey_sends s ON s.id = c.send_id AND s.tenant_id = c.tenant_id
    JOIN public.appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id
    JOIN public.patients p ON p.id = s.patient_id AND p.tenant_id = s.tenant_id
   WHERE c.code_hash = p_code_hash
     AND (SELECT auth.uid()) IS NULL
     AND (SELECT public.jwt_patient_id()) IS NULL
     AND s.consumed_at IS NULL
     AND now() < s.sent_at + interval '14 days'
     AND a.status = 'completed'
     AND p.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.appointment_survey_responses r WHERE r.appointment_id = s.appointment_id);
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.resolve_survey_code(text) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_survey_code(text) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_survey_code(text) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.resolve_survey_code(text) IS
  'SAT-01: the survey page''s only read. One row (tenant_id, appointment_id, '
  'visit_ends_at) for a live code, to the server''s own session only (no user, '
  'no patient claim); zero rows, identically, for an unknown, spent, expired or '
  'no-longer-eligible one and for any other session. Writes nothing.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5f. THE GUEST PAGE'S WRITE: the answer. THE ONLY WRITE PATH INTO       */
/* appointment_survey_responses. It locks the send row, then re-asks     */
/* resolve_survey_code in its next statement, so two presses of the same  */
/* link produce one answer: the second waits for the lock, then finds the */
/* send consumed and gets false. False, with nothing written, for every   */
/* code that resolve would not show; a value outside a CHECK (a score out */
/* of range, a comment over 1000 characters, a blank consent label)       */
/* raises, and the whole call rolls back. A comment that is empty or only */
/* whitespace is stored as NULL, never trimmed otherwise: A JUDGMENT, NOT */
/* A RULING.                                                              */
/* ONLY THE SERVER'S OWN SESSION: a session that carries a user or a      */
/* patient claim gets false before anything is read, so no staff member   */
/* can answer in a patient's name. A code that is not 64 hex characters   */
/* gets the same false.                                                   */
/* The audit row carries the channel only: never a score, a comment or    */
/* the consent choice (rule 7; the comment is treated as health data).    */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.submit_survey_response(
  p_code_hash       text,
  p_tenant_id       uuid,
  p_nps             integer,
  p_rating          integer,
  p_comment         text,
  p_contact_consent boolean,
  p_consent_version text
)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_send record;
  v_appt record;
BEGIN
  IF p_code_hash IS NULL OR p_tenant_id IS NULL
     OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_tenant_id IS DISTINCT FROM (SELECT public.jwt_tenant_id())
     OR (SELECT auth.uid()) IS NOT NULL
     OR (SELECT public.jwt_patient_id()) IS NOT NULL THEN
    RETURN false;
  END IF;

  SELECT s.id, s.appointment_id, s.patient_id, s.channel, s.sent_at
    INTO v_send
    FROM public.appointment_survey_codes c
    JOIN public.appointment_survey_sends s ON s.id = c.send_id AND s.tenant_id = c.tenant_id
   WHERE c.code_hash = p_code_hash AND c.tenant_id = p_tenant_id
     FOR UPDATE OF s;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.resolve_survey_code(p_code_hash) r WHERE r.tenant_id = p_tenant_id) THEN
    RETURN false;
  END IF;

  SELECT a.location_id, a.practitioner_id, a.practitioner_2_id
    INTO v_appt
    FROM public.appointments a
   WHERE a.id = v_send.appointment_id AND a.tenant_id = p_tenant_id;

  INSERT INTO public.appointment_survey_responses (
    tenant_id, send_id, appointment_id, patient_id, location_id, practitioner_id, practitioner_2_id,
    nps, rating, comment, contact_consent, consent_version, channel, sent_at
  ) VALUES (
    p_tenant_id, v_send.id, v_send.appointment_id, v_send.patient_id, v_appt.location_id,
    v_appt.practitioner_id, v_appt.practitioner_2_id,
    p_nps, p_rating, CASE WHEN p_comment IS NULL OR btrim(p_comment) = '' THEN NULL ELSE p_comment END,
    p_contact_consent, p_consent_version, v_send.channel, v_send.sent_at
  );

  UPDATE public.appointment_survey_sends s
     SET consumed_at = now(), outcome = 'answered'
   WHERE s.id = v_send.id;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, NULL, 'survey.submitted', 'appointment', v_send.appointment_id,
          jsonb_build_object('channel', v_send.channel));

  RETURN true;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.submit_survey_response(text, uuid, integer, integer, text, boolean, text) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.submit_survey_response(text, uuid, integer, integer, text, boolean, text) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.submit_survey_response(text, uuid, integer, integer, text, boolean, text) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.submit_survey_response(text, uuid, integer, integer, text, boolean, text) IS
  'SAT-01: the survey page''s answer, the only write path into '
  'appointment_survey_responses. Single use: locks the send, re-checks the code '
  'as resolve_survey_code does, writes one answer whose send, appointment, '
  'patient, channel and send time come from the send, consumes the send, and '
  'writes one audit_log row with the channel only. False, with nothing '
  'written, for any code resolve would not show, for a code that is not 64 hex '
  'characters, and for any session that carries a user or a patient claim: '
  'only the server''s own session answers for a patient.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5g. THE GUEST PAGE'S OPT-OUT (S8). On a live code: the send's patient  */
/* stops receiving surveys, the send is consumed as opted_out, and one    */
/* audit row is written. Only that patient's survey switch moves; the two */
/* reminder switches are not touched. ONLY THE SERVER'S OWN SESSION, as   */
/* 5f: no staff member can opt a patient out through a link.              */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.opt_out_survey(p_code_hash text, p_tenant_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_send record;
BEGIN
  IF p_code_hash IS NULL OR p_tenant_id IS NULL
     OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_tenant_id IS DISTINCT FROM (SELECT public.jwt_tenant_id())
     OR (SELECT auth.uid()) IS NOT NULL
     OR (SELECT public.jwt_patient_id()) IS NOT NULL THEN
    RETURN false;
  END IF;

  SELECT s.id, s.appointment_id, s.patient_id, s.channel
    INTO v_send
    FROM public.appointment_survey_codes c
    JOIN public.appointment_survey_sends s ON s.id = c.send_id AND s.tenant_id = c.tenant_id
   WHERE c.code_hash = p_code_hash AND c.tenant_id = p_tenant_id
     FOR UPDATE OF s;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.resolve_survey_code(p_code_hash) r WHERE r.tenant_id = p_tenant_id) THEN
    RETURN false;
  END IF;

  UPDATE public.patients p
     SET survey_enabled = false
   WHERE p.id = v_send.patient_id AND p.tenant_id = p_tenant_id;

  UPDATE public.appointment_survey_sends s
     SET consumed_at = now(), outcome = 'opted_out'
   WHERE s.id = v_send.id;

  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, NULL, 'survey.opt_out', 'appointment', v_send.appointment_id,
          jsonb_build_object('channel', v_send.channel));

  RETURN true;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.opt_out_survey(text, uuid) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.opt_out_survey(text, uuid) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.opt_out_survey(text, uuid) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.opt_out_survey(text, uuid) IS
  'SAT-01 (S8): the survey page''s opt-out. On a live code, sets the send''s '
  'patient''s survey_enabled to false, consumes the send as opted_out and writes '
  'one audit_log row. Touches no reminder switch. False for any session that '
  'carries a user or a patient claim.';--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* 5h. RETENTION (S12, default 10). The ONLY path that removes anything   */
/* from an answer, and it is an UPDATE, never a DELETE: the comment goes, */
/* the scores stay. Per tenant, a NULL tenant refused, one audit row per  */
/* purged answer. No application role may execute it, service_role        */
/* included: only its owner runs it (0087's shape).                       */
/* ---------------------------------------------------------------------- */
CREATE FUNCTION public.purge_expired_survey_comments(p_tenant_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
DECLARE
  v_purged integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'purge_expired_survey_comments: a tenant is required; this job never runs globally'
      USING ERRCODE = '22004';
  END IF;

  WITH purged AS (
    UPDATE public.appointment_survey_responses r
       SET comment = NULL, comment_purged_at = now()
     WHERE r.tenant_id = p_tenant_id
       AND r.comment IS NOT NULL
       AND r.submitted_at <= now() - interval '24 months'
    RETURNING r.id
  ),
  audited AS (
    INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
    SELECT p_tenant_id, NULL, 'survey.comment_purged', 'appointment_survey_response', g.id, '{}'::jsonb
      FROM purged g
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_purged FROM audited;

  RETURN v_purged;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.purge_expired_survey_comments(uuid) OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_expired_survey_comments(uuid) FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint

COMMENT ON FUNCTION public.purge_expired_survey_comments(uuid) IS
  'SAT-01 (S12): sets comment to NULL and comment_purged_at to now() on the '
  'tenant''s answers submitted 24 months ago or earlier; scores are kept. One '
  'audit_log row per purged answer. Refuses a NULL tenant. No application role '
  'may execute it.';--> statement-breakpoint

/* ====================================================================== */
/* 6. THE PATIENT'S SURVEY SWITCH AND ITS AUDIT ROW (S8, R34)             */
/* ====================================================================== */
/* patients.survey_enabled: on by default. Every send door reads it, and  */
/* refuses when it is off. It is not reminder_sms_enabled or              */
/* reminder_email_enabled, and turning it off never touches them.         */
/*                                                                        */
/* WHY ITS ALTER TABLE STANDS HERE, AFTER EVERYTHING THAT LOCKS NOTHING.  */
/* ALTER TABLE patients takes ACCESS EXCLUSIVE on patients and holds it   */
/* until the COMMIT, and ACCESS EXCLUSIVE stops every READ of patients as */
/* well as every write: the agenda's joins, the reminder jobs, the public */
/* booking page, the patient token hook. It is the FIRST lock this file   */
/* takes on a table that already exists, and the strongest, and it is     */
/* taken while the transaction holds no other: a session that already     */
/* reads patients is waited for and goes on untouched, whatever it writes */
/* next. Eight statements follow it (its comment, its grant, the          */
/* trigger, section 7's three statements, the two policies), where in     */
/* the first order sixty-four did. Nothing above needs the column to      */
/* exist: every function is plpgsql, whose body is not planned when it is */
/* created. No statement may be added between this ALTER TABLE and the    */
/* end of the file except in this section and the next.                   */
/*                                                                        */
/* WHO MAY SET IT (R34): "settable by the patient and by the same staff   */
/* roles that edit reminder preferences, same clinic scope, with an audit */
/* row per change, in RLS." It is protected exactly as the two reminder   */
/* switches are, so the principals are the same by construction, not by a */
/* second list that could drift. Staff: authenticated holds a TABLE-level */
/* UPDATE on patients, which covers a column added later, and the row     */
/* gate is the existing patients_update policy (0047): the owner; admin   */
/* and reception within their clinic scope; a therapist for a patient     */
/* they treat; the row's creator. The patient: the column grant below,    */
/* and the existing patients_patient_update_selfscope policy (0019),      */
/* their own row only. No policy is created or changed for it, and no     */
/* grant is widened.                                                      */
/*                                                                        */
/* THE AUDIT ROW: a trigger, because the write is a plain UPDATE of       */
/* patients (the portal's as the patient role, staff's as authenticated,  */
/* the opt-out door's as its owner), and a trigger is the one place every */
/* one of them passes. AFTER UPDATE, per row, and only WHEN the value     */
/* really changed: an UPDATE that sets it to what it already was writes   */
/* nothing. It is not `UPDATE OF survey_enabled`, which would miss a      */
/* change made by another trigger.                                        */
/*                                                                        */
/* WHY ITS FUNCTION IS SECURITY DEFINER. The row must be written          */
/* whichever role fires the trigger, and the patient role holds no INSERT */
/* on audit_log. This migration does not change the audit insert policy.  */
/* The function runs in the same transaction as the UPDATE: the change    */
/* and its row commit together or not at all. EXECUTE is revoked from     */
/* every role by name; a trigger function is never called directly, and   */
/* firing it needs no EXECUTE.                                            */
/*                                                                        */
/* WHAT THE ROW HOLDS: ids and the new value, nothing typed by anyone.    */
/* tenant_id, the PATIENT'S; actor_user_id, the session's user when it is */
/* a staff member of that tenant, else NULL; entity_id, the patient;      */
/* metadata {survey_enabled, actor_patient_id}, where actor_patient_id is */
/* the session's patient claim (the patient acting for themself) or null. */
/* Both actors NULL is a session with no identity: the opt-out door,      */
/* whose own survey.opt_out row sits beside this one.                     */
/* ====================================================================== */
CREATE FUNCTION public.patients_survey_switch_audit()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (NEW.tenant_id,
          (SELECT u.id FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.tenant_id = NEW.tenant_id),
          'survey.switch_changed', 'patient', NEW.id,
          jsonb_build_object('survey_enabled', NEW.survey_enabled, 'actor_patient_id', (SELECT public.jwt_patient_id())));
  RETURN NULL;
END
$fn$;--> statement-breakpoint

ALTER FUNCTION public.patients_survey_switch_audit() OWNER TO postgres;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.patients_survey_switch_audit() FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint

COMMENT ON FUNCTION public.patients_survey_switch_audit() IS
  'SAT-01 (R34): the trigger function behind patients_survey_switch_audit. '
  'Writes one audit_log row (survey.switch_changed, the patient, the new '
  'value, the acting staff user or the acting patient id) for every change of '
  'patients.survey_enabled, in the transaction of the change. No application '
  'role may execute it.';--> statement-breakpoint

/* FROM HERE TO THE COMMIT, patients IS LOCKED AGAINST READS AND WRITES.  */
ALTER TABLE public.patients
  ADD COLUMN survey_enabled boolean NOT NULL DEFAULT true;--> statement-breakpoint

COMMENT ON COLUMN public.patients.survey_enabled IS
  'SAT-01 (S8): whether this patient receives the satisfaction survey. On by '
  'default. Set by the patient in the portal, by the opt-out button on the '
  'survey page (opt_out_survey), or by the staff roles that may set the '
  'reminder switches, in the same clinic scope (R34): the patients_update '
  'policy decides. Every change writes one audit_log row '
  '(patients_survey_switch_audit). Every survey send door refuses a patient '
  'whose switch is off. Independent of reminder_sms_enabled and '
  'reminder_email_enabled.';--> statement-breakpoint

/* THE PATIENT MAY SET THEIR OWN SWITCH IN THE PORTAL. A column grant     */
/* that ADDS to the eight of 0019, 0020 and 0082; the row gate is the     */
/* existing patients_patient_update_selfscope policy (0019), untouched.   */
/* NO TABLE-LEVEL REVOKE IS ISSUED: a table-level REVOKE of UPDATE would  */
/* drop every column grant the patient role holds, which is the defect    */
/* 0020 and 0082 exist to repair.                                         */
GRANT UPDATE (survey_enabled) ON public.patients TO patient;--> statement-breakpoint

CREATE TRIGGER patients_survey_switch_audit
  AFTER UPDATE ON public.patients
  FOR EACH ROW
  WHEN (OLD.survey_enabled IS DISTINCT FROM NEW.survey_enabled)
  EXECUTE FUNCTION public.patients_survey_switch_audit();--> statement-breakpoint

/* ====================================================================== */
/* 7. THE EIGHT FOREIGN KEYS TO THE TABLES THAT ALREADY EXIST             */
/* ====================================================================== */
/* The three tables were created without them (section 1 says why). Each  */
/* is added here under the name the inline form gives it,                 */
/* <table>_<column>_fkey, and with the definition it had there; the       */
/* post-check reads all ten of this file's foreign keys by name and       */
/* definition. The three tables are empty, so validating a foreign key    */
/* reads no row.                                                          */
/*                                                                        */
/* THREE STATEMENTS, ONE PER NEW TABLE (strategy's ruling of 2026-10-06,  */
/* Q5 of S-1006-A): each ALTER TABLE adds every foreign key of its table, */
/* so five fewer round trips are made while patients is held. Each        */
/* foreign key takes SHARE ROW EXCLUSIVE on the table it names, which     */
/* stops WRITES to it until the COMMIT and stops no read.                 */
/*                                                                        */
/* THE ORDER IS ONE SEQUENCE, AND IT IS PART OF THE DESIGN: patients      */
/* (section 6, already held), then appointments, then tenants, then       */
/* users. The first statement, on the sends, writes its clauses in that   */
/* order and takes its locks together, inside the one statement, in the   */
/* order of its clauses (measured: the apply document's G6). The two      */
/* statements after it name only tables whose locks are already held.     */
/*                                                                        */
/* WHAT REMAINS, AND CANNOT BE ORDERED AWAY: the first statement waits    */
/* for its locks while patients is held. A transaction that wrote         */
/* appointments, tenants or users BEFORE section 6's ALTER TABLE, has not */
/* yet touched patients, and touches patients now, waits for this file    */
/* while this file waits for it: a deadlock, and Postgres ends that       */
/* transaction (40P01), not this one. The window is this group, a few     */
/* milliseconds; the sitting is in closed hours. The other order, foreign */
/* keys first, would end the commoner transaction instead: one that has   */
/* read patients and then writes.                                         */
/* The sends: appointments, then tenants, then users, SHARE ROW EXCLUSIVE */
/* on each, taken here and held to the COMMIT. patients: no new wait,     */
/* ACCESS EXCLUSIVE is already held (section 6).                          */
ALTER TABLE public.appointment_survey_sends
  ADD CONSTRAINT appointment_survey_sends_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,
  ADD CONSTRAINT appointment_survey_sends_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id),
  ADD CONSTRAINT appointment_survey_sends_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);--> statement-breakpoint

/* The codes: tenants, already held. No new wait.                         */
ALTER TABLE public.appointment_survey_codes
  ADD CONSTRAINT appointment_survey_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);--> statement-breakpoint

/* The answers: appointments, tenants and patients, all already held. No  */
/* new wait.                                                              */
ALTER TABLE public.appointment_survey_responses
  ADD CONSTRAINT appointment_survey_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),
  ADD CONSTRAINT appointment_survey_responses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);--> statement-breakpoint

/* ====================================================================== */
/* 8. WHO READS WHAT, ENFORCED IN RLS: THE LAST TWO STATEMENTS (R39)      */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE TWO STATEMENTS. Each CREATE POLICY takes the     */
/* platform locks the header describes, and they are held until the       */
/* COMMIT, so no statement may be added after them: a new statement goes  */
/* above this section.                                                    */
/*                                                                        */
/* One PERMISSIVE policy FOR SELECT per readable table, TO authenticated. */
/* SELECT only: a FOR ALL policy's USING also governs which rows an       */
/* UPDATE or DELETE may reach, and these tables take no write at all.     */
/*                                                                        */
/* "Their clinics" is viewer_location_ids() (0073): the caller's          */
/* staff_locations rows in the JWT tenant, an empty array when there are  */
/* none, so staff with no clinic assignment read nothing under the clinic */
/* arms. The patients policy's "no assignment means every clinic" branch  */
/* (0047) is NOT copied, because S7 says "at their clinics".              */
/*                                                                        */
/* Every helper call is wrapped as (SELECT ...), so the planner evaluates */
/* it once per statement (0071, 0073).                                    */

/* Sends: S4's roles, because S5 shows the status beside S4's button      */
/* (SOLO's reading in the spec, section 2). A therapist sees the sends of */
/* the patients they treat (viewer_treated_patient_ids(), 0074, either    */
/* practitioner and either participant), which says whether an answer     */
/* exists and never what it says.                                         */
CREATE POLICY appointment_survey_sends_select ON public.appointment_survey_sends
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (
      (SELECT public.jwt_role()) = 'owner'
      OR (
        (SELECT public.jwt_role()) IN ('admin', 'reception')
        AND location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
      )
      OR (
        (SELECT public.jwt_role()) = 'therapist'
        AND patient_id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
      )
    )
  );--> statement-breakpoint

/* Answers: S7, character for character in effect. The owner: every      */
/* clinic of the tenant. Admin and reception: appointments at their       */
/* clinics. A therapist: only an appointment they attended (either        */
/* practitioner of a shared NESA visit), and only at one of their own     */
/* clinics. No other therapist. patient and anon: no grant, so nothing.   */
CREATE POLICY appointment_survey_responses_select ON public.appointment_survey_responses
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (
      (SELECT public.jwt_role()) = 'owner'
      OR (
        (SELECT public.jwt_role()) IN ('admin', 'reception')
        AND location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
      )
      OR (
        (SELECT public.jwt_role()) = 'therapist'
        AND (practitioner_id = (SELECT auth.uid()) OR practitioner_2_id = (SELECT auth.uid()))
        AND location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
      )
    )
  );--> statement-breakpoint

/* ====================================================================== */
/* 9. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* It changes no existing row, policy, function or grant, except the one  */
/* column grant above, which ADDS survey_enabled to the patient role's    */
/* UPDATE columns, and the one trigger on patients, which fires only when */
/* survey_enabled changes. It gives no application role a DELETE on       */
/* anything new.                                                          */
/* The one DELETE that reaches these tables is an existing one: the       */
/* appointment hard delete cascades to that appointment's sends and their */
/* codes, and is refused while an answer exists (O6 (a)).                 */
/* ====================================================================== */

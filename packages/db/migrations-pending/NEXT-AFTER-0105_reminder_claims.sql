/* ====================================================================== */
/* The reminder sweep's own tables: reminder_claims and                   */
/* reminder_sweep_passes.                                                 */
/* ====================================================================== */
/* PENDING. This file must follow 0105. Its file name carries no number,  */
/* so a promotion is a rename and changes no byte. Strategy ruled its     */
/* number on 2026-10-13: 0106. Until it is promoted it is applied nowhere */
/* but a local throwaway database.                                        */
/*                                                                        */
/* WHAT THIS IS ABOUT. A reminder is "claimed" by the sender that takes   */
/* it, so that a second sender of the same reminder can find the first.   */
/* The daily reminder sweep also keeps two records of its own: a shadow   */
/* row for each reminder it would have handed over while it is switched   */
/* off, and a heartbeat for each pass. Until now all four were written as */
/* rows of audit_log, because no migration was allowed. Strategy ruled on */
/* 2026-10-12 (S-1012-A): no audit_log for claims; a dedicated table,     */
/* Tier C. This file is that table, and a second one for the heartbeat.   */
/*                                                                        */
/* WHY NOT audit_log. Any staff session of the tenant may insert an audit */
/* row (0001_rls), so any staff session could write a claim or a release  */
/* that the dispatcher would then believe. And 60 heartbeats a day per    */
/* clinic, with a shadow row per reminder, are operational bookkeeping:   */
/* they do not belong in the legal record of who did what.                */
/*                                                                        */
/* WHY NOT reminder_dispatches (0075). That ledger says what happened to  */
/* a message. It holds no start time, no offset and no claim, and a visit */
/* moved to another time must earn a reminder of its own: the claim's key */
/* carries the START.                                                     */
/*                                                                        */
/* ====================================================================== */
/* THE RULINGS THIS FILE IMPLEMENTS                                       */
/* ====================================================================== */
/* The brief of 2026-10-13 (after strategy's S-1012-A):                   */
/*   W  WRITERS: only the reminder job's own session, in the tenant       */
/*      context it already uses. A staff session reads the rows of its    */
/*      own tenant and never inserts, updates or deletes one. anon gets   */
/*      nothing and nothing new is granted to PUBLIC.                     */
/*   A  APPEND ONLY: a release is a new row, never an update. No update   */
/*      and no delete path for any application role.                      */
/*   T  tenant_id NOT NULL, row level security on, in the way of the      */
/*      sibling table reminder_dispatches (0075).                         */
/*   7b a reminder that was held back is tried again while the visit is   */
/*      still ahead: only a `sent` outcome blocks a second send. THIS     */
/*      FILE THEREFORE STORES NO OUTCOME AND HAS NO UNIQUE KEY OVER THE   */
/*      CLAIMS OF ONE REMINDER. A claim says "a sender took it"; whether  */
/*      it was sent stays in the ledger, and whether a claim blocks is    */
/*      decided by the code that reads both. Nothing here can make        */
/*      "held" final.                                                     */
/*   8a a late reminder may still go out, up to a limit that a later pull */
/*      request builds. The table only carries what that rule will read:  */
/*      the instant the reminder was due (due_at) and the instant it was  */
/*      taken (created_at). The late rule itself is not here.             */
/*   The sweep ships switched off. Nothing in this file sends anything.   */
/*                                                                        */
/* Strategy's rulings of 2026-10-13 on the first draft of this file:      */
/*   W-1  the writer is the userless `authenticated` session, as 0102.    */
/*   W-2  the heartbeat keeps its own table.                              */
/*   W-3  the rows of an appointment go with it (ON DELETE CASCADE).      */
/*   W-4  row level security ENABLED, NOT FORCED. No first FORCE in the   */
/*        schema.                                                         */
/*   W-5  service_role is REVOKED BY NAME on both tables.                 */
/*   W-6  the INSERT policy of reminder_claims proves that the            */
/*        appointment belongs to the row's tenant.                        */
/*   W-7  no duplicate refusal for shadow rows and heartbeats while the   */
/*        sweep is in shadow.                                             */
/*   W-8  the number is 0106.                                             */
/*   W-10 no purge here. A claim is never purged by age alone.            */
/*   W-11 confirmed as built: `send` is already in the heartbeat's mode   */
/*        list, one release per claim, due_at and early are stored.       */
/*                                                                        */
/* ====================================================================== */
/* WHO THE "REMINDER JOB'S OWN SESSION" IS, AND HOW IT IS KNOWN (W-1)     */
/* ====================================================================== */
/* The reminder job has no database role of its own. It runs as           */
/* `authenticated`, like a staff session, with claims it sets itself      */
/* (withReminderTenantContext, apps/web/lib/reminders/context.ts): a      */
/* tenant, the role `admin`, and NO user. A staff session always carries  */
/* its user. So the INSERT policies below admit a session that has the    */
/* tenant, the role owner or admin (the ledger's own test, 0075) and no   */
/* user (auth.uid() is null), and no other.                               */
/*                                                                        */
/* NO TEST OF THE PATIENT CLAIM, AND NOT BY OVERSIGHT. 0102's doors also  */
/* ask that public.jwt_patient_id() is null, but they are SECURITY        */
/* DEFINER and run as postgres. A policy runs as the caller, and          */
/* `authenticated` holds no EXECUTE on public.jwt_patient_id(): the first */
/* draft of this file asked it, and on the rehearsal database the job's   */
/* insert could not complete (the apply document has the record). It is   */
/* not needed here: a patient session's role is `patient`, the policies   */
/* are TO authenticated, and `patient` holds no privilege on either       */
/* table. The three helpers the policies do call (public.jwt_tenant_id(), */
/* public.jwt_role(), auth.uid()) are ones `authenticated` may execute,   */
/* and the pre-check reads that before the apply.                         */
/*                                                                        */
/* This is the test 0102 already uses for the automatic survey send, for  */
/* the same reason, in its words: a server-only session "is what the      */
/* application makes on its own database connection ... and nothing else  */
/* can make one, because a JWT that Supabase Auth signs always names its  */
/* user, the anon key's role is `anon` and the service key's is           */
/* `service_role`". Strategy ruled it for this file too (W-1).            */
/*                                                                        */
/* ====================================================================== */
/* ONE TABLE OR TWO: TWO (W-2)                                            */
/* ====================================================================== */
/* TWO. A claim, a release and a shadow row are each about ONE REMINDER   */
/* OF ONE APPOINTMENT: they share the key (appointment, offset, channel)  */
/* and they go when the appointment goes. A heartbeat is about ONE PASS   */
/* OF ONE TENANT: it names no appointment, shares no column with the      */
/* other three beyond the tenant, and must outlive every appointment the  */
/* pass looked at, because "the newest heartbeat is 45 minutes old" is    */
/* the alarm. In one table the appointment would have to be nullable and  */
/* its cascade would be right for three kinds of row and wrong for the    */
/* fourth.                                                                */
/*                                                                        */
/* ====================================================================== */
/* APPEND ONLY, AND HOW                                                   */
/* ====================================================================== */
/* By two things, and deliberately not by a trigger:                      */
/*   1. GRANTS. `authenticated` holds SELECT and INSERT on each table     */
/*      and nothing else. No UPDATE, no DELETE, no TRUNCATE. anon,        */
/*      patient, service_role and PUBLIC hold nothing.                    */
/*   2. POLICIES. Row level security is on, and each table has one SELECT */
/*      and one INSERT policy. With no UPDATE and no DELETE policy, a     */
/*      session that somehow held the privilege would still reach no row. */
/* NO TRIGGER, because an appointment's hard delete must still take its   */
/* claims with it (ON DELETE CASCADE, as the ledger does), and a trigger  */
/* that refuses every DELETE refuses that one too.                        */
/* service_role HOLDS NOTHING (W-5). The platform's default privileges    */
/* hand it every table privilege at CREATE TABLE, and it bypasses row     */
/* level security, so left alone it could rewrite or remove any row.      */
/* Section 4 revokes it by name. These are the first tables of the schema */
/* where it holds nothing; 0075 and 0102 left it as they found it. The    */
/* reminder job never runs as it, so the job's writes do not notice.      */
/* After this file only the table's owner can update or delete a row,     */
/* and no purge is built (W-10).                                          */
/*                                                                        */
/* ====================================================================== */
/* NO SEQUENCE                                                            */
/* ====================================================================== */
/* Both keys are uuids from gen_random_uuid(). This file creates no       */
/* sequence, so the rule that a new sequence is not born open to `anon`   */
/* has nothing to cover here.                                             */
/*                                                                        */
/* ====================================================================== */
/* THE LOCKS, read from the statements                                    */
/* ====================================================================== */
/* The order follows 0102. NO STATEMENT BEFORE SECTION 5 LOCKS A TABLE    */
/* THAT EXISTED BEFORE THIS FILE: the two tables are created without      */
/* their foreign keys to tenants and appointments, because a REFERENCES   */
/* clause takes SHARE ROW EXCLUSIVE on the table it names and holds it to */
/* the COMMIT. Section 5 adds those three keys in two statements          */
/* (appointments, then tenants: writes to them wait, reads do not).       */
/* Section 6 is the four CREATE POLICY statements, LAST, because each     */
/* takes ACCESS EXCLUSIVE on the platform tables the supautils setting    */
/* names and holds it to the COMMIT (measured for 0102). So this file is  */
/* closed hours only, like every migration that creates a policy. The     */
/* INSERT policy of reminder_claims names appointments in a sub-select    */
/* (W-6): parsing it takes ACCESS SHARE there, which waits for nobody     */
/* but a session holding ACCESS EXCLUSIVE.                                */
/* ====================================================================== */

/* The two SET LOCAL lines every migration from 0100 on must start with   */
/* (scripts/migration-timeouts.test.mjs refuses a file without them), and */
/* the third that 0102 added: a session that stalls with the transaction  */
/* open is ended by the server after 15 seconds idle.                     */
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* 1. reminder_claims: A CLAIM, ITS RELEASE, AND THE SWEEP'S SHADOW ROW   */
/* ====================================================================== */
/* THREE KINDS OF ROW, AND EACH COLUMN SAYS WHICH KINDS CARRY IT, IN BOTH */
/* DIRECTIONS (the ledger's rule, 0075: an equivalence, not an            */
/* implication, so a row cannot carry a field that means nothing for it). */
/*                                                                        */
/*   claim    a sender took this reminder for this start. Its id is the   */
/*            claim id. Carries the start, the taker, the due time and    */
/*            whether it was taken early.                                 */
/*   release  the sender of a claim gave it up (it threw before handing   */
/*            the message over). Carries claim_id, the claim it names,    */
/*            and no start of its own. A claim is LIVE while no release   */
/*            names it.                                                   */
/*   shadow   the sweep, switched off, would have handed this reminder    */
/*            over in this pass. Carries the start, the due time, how     */
/*            many minutes after the due time the pass ran, and whether   */
/*            the visit was saved after its due time.                     */
/*                                                                        */
/* offset_id IS TEXT, NOT AN ENUM AND NOT A CLOSED LIST: the offsets      */
/* (`48h`, `24h`) live in the application (reminders/offsets.ts), and a   */
/* third one is a product decision that should not need a migration.      */
/*                                                                        */
/* due_at IS STORED, AND SO IS early. The due time is the start minus the */
/* offset, as the offset was defined on the day the row was written. The  */
/* rule can change, and a row must say what was true when it was taken    */
/* (the ledger's reason for storing segments). A claim for an offset the  */
/* application does not know has no due time and no early flag: both      */
/* NULL, together. A shadow row always has its due time.                  */
/*                                                                        */
/* minutes_after_mark MAY BE NEGATIVE: the day's last pass takes          */
/* reminders that fall due before the next morning's first pass.          */
/*                                                                        */
/* A RELEASE NAMES A CLAIM OF THE SAME REMINDER, AND THE TABLE PROVES IT. */
/* The foreign key reminder_claims_claim_fkey has six columns: the        */
/* release's tenant, appointment, offset, channel, claim_kind and         */
/* claim_id must be the tenant, appointment, offset, channel, kind and id */
/* of ONE existing row. claim_kind is a generated column that reads       */
/* `claim` on a release and NULL on every other row, so the row a release */
/* names is of kind `claim`: never a shadow row, never another release.   */
/* A release that names a row of another tenant, another appointment,     */
/* another offset or another channel is refused the same way. A claim and */
/* a shadow row carry no claim_id and no claim_kind, so the key asks      */
/* nothing of them (MATCH SIMPLE). The first draft tied tenant and        */
/* appointment only; its reviewer asked for the rest. ONE RELEASE PER     */
/* CLAIM, by the partial unique index below: a second release of the same */
/* claim says nothing new.                                                */
/*                                                                        */
/* NO UNIQUE KEY OVER THE CLAIMS OF ONE REMINDER, ON PURPOSE. See 7b in   */
/* the header: a second claim for the same start is how a held or failed  */
/* reminder is tried again, and "at most one LIVE claim" cannot be an     */
/* index while a release is a separate row.                               */
/*                                                                        */
/* NO RECIPIENT AND NO PATIENT COLUMN, like the ledger: the patient is    */
/* one join away through appointment_id, so a patient merge has nothing   */
/* to re-point here.                                                      */
/*                                                                        */
/* THE APPOINTMENT IS OF THE ROW'S TENANT, BY THE INSERT POLICY (W-6),    */
/* not by a key: appointments has no unique key over (tenant_id, id) for  */
/* a foreign key to point at, and this file changes no existing table.    */
/* Section 6 has the policy and what it rests on.                         */
/*                                                                        */
/* THE TWO FOREIGN KEYS TO tenants AND appointments ARE NOT WRITTEN HERE. */
/* Section 5 adds them, under the names the inline form would give them.  */
CREATE TABLE public.reminder_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  appointment_id     uuid NOT NULL,
  kind               text NOT NULL
    CONSTRAINT reminder_claims_kind_check CHECK (kind IN ('claim', 'release', 'shadow')),
  offset_id          text NOT NULL
    CONSTRAINT reminder_claims_offset_id_not_blank CHECK (btrim(offset_id) <> ''),
  channel            text NOT NULL
    CONSTRAINT reminder_claims_channel_check CHECK (channel IN ('sms', 'email')),
  starts_at          timestamptz,
  due_at             timestamptz,
  taker              text
    CONSTRAINT reminder_claims_taker_check CHECK (taker IN ('run', 'sweep')),
  early              boolean,
  claim_id           uuid,
  claim_kind         text GENERATED ALWAYS AS (CASE WHEN kind = 'release' THEN 'claim' END) STORED,
  minutes_after_mark integer,
  saved_after_mark   boolean,
  pass_id            text
    CONSTRAINT reminder_claims_pass_id_not_blank CHECK (pass_id IS NULL OR btrim(pass_id) <> ''),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_claims_release_target_key
    UNIQUE (tenant_id, appointment_id, offset_id, channel, kind, id),
  CONSTRAINT reminder_claims_claim_fkey
    FOREIGN KEY (tenant_id, appointment_id, offset_id, channel, claim_kind, claim_id)
    REFERENCES public.reminder_claims (tenant_id, appointment_id, offset_id, channel, kind, id) ON DELETE CASCADE,
  CONSTRAINT reminder_claims_start_matches_kind CHECK ((starts_at IS NOT NULL) = (kind IN ('claim', 'shadow'))),
  CONSTRAINT reminder_claims_due_matches_kind CHECK (
    CASE kind WHEN 'release' THEN due_at IS NULL WHEN 'shadow' THEN due_at IS NOT NULL ELSE true END
  ),
  CONSTRAINT reminder_claims_due_not_after_start CHECK (due_at IS NULL OR due_at <= starts_at),
  CONSTRAINT reminder_claims_taker_matches_kind CHECK ((taker IS NOT NULL) = (kind = 'claim')),
  CONSTRAINT reminder_claims_early_matches_kind CHECK (
    CASE kind WHEN 'claim' THEN (early IS NULL) = (due_at IS NULL) ELSE early IS NULL END
  ),
  CONSTRAINT reminder_claims_claim_matches_kind CHECK ((claim_id IS NOT NULL) = (kind = 'release')),
  CONSTRAINT reminder_claims_release_names_another_row CHECK (claim_id IS NULL OR claim_id <> id),
  CONSTRAINT reminder_claims_minutes_match_kind CHECK ((minutes_after_mark IS NOT NULL) = (kind = 'shadow')),
  CONSTRAINT reminder_claims_saved_matches_kind CHECK ((saved_after_mark IS NOT NULL) = (kind = 'shadow'))
);--> statement-breakpoint

/* The two counts on the Lembretes SMS page: "the claims of this tenant   */
/* since an instant", read as the viewer.                                 */
CREATE INDEX reminder_claims_tenant_time_idx
  ON public.reminder_claims (tenant_id, created_at DESC);--> statement-breakpoint

/* "The rows of this reminder": the dispatcher's held read and the        */
/* sweep's taken-once read, both by appointment, offset, channel and      */
/* start. appointment_id leads, so an appointment's hard delete finds its */
/* rows here without scanning the table.                                  */
CREATE INDEX reminder_claims_mark_idx
  ON public.reminder_claims (appointment_id, offset_id, channel, starts_at);--> statement-breakpoint

/* One release per claim, and the lookup "is this claim released".        */
/* PARTIAL: only a release carries a claim_id.                            */
CREATE UNIQUE INDEX reminder_claims_release_claim_key
  ON public.reminder_claims (claim_id)
  WHERE claim_id IS NOT NULL;--> statement-breakpoint

COMMENT ON TABLE public.reminder_claims IS
  'The reminder sweep''s claim store. Three kinds of row, each about one '
  'reminder (appointment, offset, channel): a claim (a sender took it for this '
  'start), a release (the claim named by claim_id was given up) and a shadow '
  'row (the sweep, switched off, would have handed it over). APPEND ONLY: a '
  'release is a new row. It stores no outcome: whether a reminder was sent is '
  'in reminder_dispatches. Written only by the reminder job''s own session (a '
  'tenant, no user); read by owner, admin and reception of the tenant. Carries '
  'no recipient. Operational bookkeeping, not a legal record.';--> statement-breakpoint

/* ====================================================================== */
/* 2. reminder_sweep_passes: THE HEARTBEAT, ONE ROW PER TENANT PER PASS   */
/* ====================================================================== */
/* What a pass of the sweep did for one tenant, in counts. A pass that    */
/* could not finish for a tenant leaves no row for it, and that absence   */
/* is the signal the watch reads.                                         */
/*                                                                        */
/* pass_id is the scheduler's id for the run, so the rows of one pass can */
/* be read together across tenants. NULL when the caller has none.        */
/* NOT UNIQUE with the tenant, ON PURPOSE (W-7, while in shadow): a pass  */
/* the scheduler runs again after losing the first answer is a second     */
/* fact, and refusing its heartbeat would roll back the whole of that     */
/* tenant's pass. A duplicate refusal must exist before the sweep's send  */
/* mode is armed; that is carded, and it is not this file.                */
/*                                                                        */
/* mode says whether the pass was the shadow or the sender. `send` is in  */
/* the list today although nothing writes it (confirmed, W-11): without   */
/* it, the pull request that turns the sweep on would need a migration    */
/* sitting for one word. A word in a CHECK sends nothing.                 */
/*                                                                        */
/* pass_at is the pass's own clock, the instant every comparison of that  */
/* pass was made against; created_at is when the row was written.         */
/* look_ahead_before is set on the day's last pass only: it also took the */
/* reminders due before that instant.                                     */
/*                                                                        */
/* excluded_count: the visits the pass left out because they never had a  */
/* reminder (a count, not a row each, while that rule is unruled).        */
/*                                                                        */
/* The foreign key to tenants is added in section 5.                      */
CREATE TABLE public.reminder_sweep_passes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  pass_id           text
    CONSTRAINT reminder_sweep_passes_pass_id_not_blank CHECK (pass_id IS NULL OR btrim(pass_id) <> ''),
  mode              text NOT NULL
    CONSTRAINT reminder_sweep_passes_mode_check CHECK (mode IN ('shadow', 'send')),
  pass_at           timestamptz NOT NULL,
  look_ahead_before timestamptz,
  due_count         integer NOT NULL
    CONSTRAINT reminder_sweep_passes_due_count_sane CHECK (due_count >= 0),
  recorded_count    integer NOT NULL
    CONSTRAINT reminder_sweep_passes_recorded_count_sane CHECK (recorded_count >= 0),
  over_ceiling      boolean NOT NULL,
  excluded_count    integer NOT NULL
    CONSTRAINT reminder_sweep_passes_excluded_count_sane CHECK (excluded_count >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_sweep_passes_recorded_within_due CHECK (recorded_count <= due_count)
);--> statement-breakpoint

/* "The newest heartbeat of this tenant", which is the watch's read and   */
/* the page's "last pass".                                                */
CREATE INDEX reminder_sweep_passes_tenant_time_idx
  ON public.reminder_sweep_passes (tenant_id, pass_at DESC);--> statement-breakpoint

COMMENT ON TABLE public.reminder_sweep_passes IS
  'The reminder sweep''s heartbeat: one row per tenant per pass, with the '
  'counts of that pass (due, recorded, over the ceiling, left out). A tenant '
  'whose pass failed has no row for it. APPEND ONLY. Written only by the '
  'reminder job''s own session (a tenant, no user); read by owner, admin and '
  'reception of the tenant. Names no appointment and no person.';--> statement-breakpoint

/* ====================================================================== */
/* 3. ROW LEVEL SECURITY ON                                               */
/* ====================================================================== */
/* ENABLE, not FORCE (W-4), as on every table of this schema (0075        */
/* included). Until section 6 runs, each table has RLS on and no policy,  */
/* which admits no application role: the safe side, and inside this one   */
/* transaction nobody else sees it.                                       */
ALTER TABLE public.reminder_claims ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.reminder_sweep_passes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ====================================================================== */
/* 4. THE TABLE GATES                                                     */
/* ====================================================================== */
/* REVOKE ALL from every role BY NAME, because the platform's default     */
/* privileges hand `authenticated` and `service_role` their table         */
/* privileges at CREATE TABLE, and a REVOKE from PUBLIC does not touch a  */
/* role granted by name (0075, 0102). service_role is in the list by      */
/* strategy's ruling W-5: it bypasses row level security, so its table    */
/* privileges were the one way left to rewrite a row without owning the   */
/* table. Then exactly SELECT and INSERT to `authenticated`: the job's    */
/* session inserts and reads, a staff session reads. No UPDATE, no        */
/* DELETE, no TRUNCATE, to anyone but the table's owner.                  */
/*                                                                        */
/* A ROLE THE DEFAULTS NAME AND THIS LIST DOES NOT would keep what it was */
/* handed. The pre-check reads the defaults and refuses the apply if they */
/* name any other role, and the post-check pins the whole grantee list of */
/* both tables.                                                           */
REVOKE ALL ON TABLE public.reminder_claims FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
REVOKE ALL ON TABLE public.reminder_sweep_passes FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE public.reminder_claims TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.reminder_sweep_passes TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* 5. THE FOREIGN KEYS TO TABLES THAT EXISTED BEFORE THIS FILE            */
/* ====================================================================== */
/* THE FIRST LOCKS ON EXISTING TABLES ARE TAKEN HERE: SHARE ROW EXCLUSIVE */
/* on appointments, then on tenants, held to the COMMIT. Writes to those  */
/* two wait; reads do not. Both new tables are empty, so each key is      */
/* validated at once.                                                     */
/*                                                                        */
/* TO THE APPOINTMENT: ON DELETE CASCADE (W-3), as the ledger (0075)      */
/* and appointment_confirm_codes do it. A claim is bookkeeping about a    */
/* reminder, with no reason to outlive the appointment it is about, and a */
/* hard delete of an appointment is not refused because a reminder was    */
/* once claimed for it. The cascade runs as the table's owner, so it      */
/* needs no DELETE grant and no DELETE policy for the session that        */
/* deletes the appointment.                                               */
/* TO THE TENANT: NO ACTION, as everywhere.                               */
ALTER TABLE public.reminder_claims
  ADD CONSTRAINT reminder_claims_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,
  ADD CONSTRAINT reminder_claims_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);--> statement-breakpoint

/* tenants is already held. No new wait.                                  */
ALTER TABLE public.reminder_sweep_passes
  ADD CONSTRAINT reminder_sweep_passes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);--> statement-breakpoint

/* ====================================================================== */
/* 6. WHO READS AND WHO WRITES: THE LAST FOUR STATEMENTS                  */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE FOUR STATEMENTS. Each CREATE POLICY takes the    */
/* platform locks the header describes and holds them to the COMMIT, so a */
/* new statement goes above this section.                                 */
/*                                                                        */
/* One PERMISSIVE policy FOR SELECT and one FOR INSERT per table, each TO */
/* authenticated. Never FOR ALL: a FOR ALL policy's USING also decides    */
/* which rows an UPDATE or a DELETE may reach, and these tables take      */
/* neither. Every helper call is wrapped as (SELECT ...), so the planner  */
/* evaluates it once per statement (0071, 0073).                          */
/*                                                                        */
/* WHO READS: owner, admin and reception of the owning tenant, the        */
/* ledger's readers (0075) and the roles that hold reminders:log_read in  */
/* the application. NOT therapist, for the ledger's reason: this is the   */
/* desk's instrument. The reminder job's own session carries the role     */
/* `admin`, so it reads its tenant's rows through the same policy.        */
/*                                                                        */
/* WHO WRITES: the reminder job's own session, as the header defines it.  */
/* The tenant on the row must be the session's, so a job running for one  */
/* tenant cannot write a row of another.                                  */
/*                                                                        */
/* THE APPOINTMENT MUST BE OF THE ROW'S TENANT (W-6), on reminder_claims. */
/* The EXISTS below finds the appointment the row names, with the row's   */
/* tenant. Without it the job of one tenant could write a row with its    */
/* own tenant_id that names ANOTHER tenant's appointment, and the plain   */
/* foreign key would answer whether an appointment id exists anywhere.    */
/* With it, another tenant's appointment and an id that does not exist    */
/* are refused alike, by this policy, before the foreign key is asked.    */
/*                                                                        */
/* WHAT IT RESTS ON. A sub-select in a policy runs as the caller, so it   */
/* reads appointments THROUGH THE POLICIES OF appointments, as the job's  */
/* session. That session (a tenant, the role admin, no user) reads every  */
/* appointment of its tenant: the admin arm of appointments_rls (0086),   */
/* with no location assignment because there is no user. The pre-check    */
/* reads that `authenticated` holds SELECT on appointments and may        */
/* execute every function those policies call, and the DB-gated suite     */
/* inserts as the job. A LATER CHANGE THAT NARROWS WHAT AN ADMIN SESSION  */
/* READS IN appointments NARROWS WHAT THE JOB CAN CLAIM, silently: the    */
/* suite's "the job sees the appointments it must claim" arm is the       */
/* tripwire. The a.tenant_id test repeats what those policies already     */
/* hold, on purpose: it is the part that does not depend on them.         */
/*                                                                        */
/* THE COLUMNS OF THE NEW ROW ARE WRITTEN WITH THE TABLE'S NAME. Inside   */
/* the sub-select a bare tenant_id would be the appointment's own.        */
/*                                                                        */
/* WHAT IT COSTS: one primary-key lookup in appointments for each row     */
/* inserted (the apply document has the measured plan). The heartbeat     */
/* names no appointment, so its policy is unchanged.                      */
CREATE POLICY reminder_claims_staff_select ON public.reminder_claims
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint

CREATE POLICY reminder_claims_job_insert ON public.reminder_claims
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND (SELECT auth.uid()) IS NULL
    AND EXISTS (
      SELECT 1
        FROM public.appointments a
       WHERE a.id = reminder_claims.appointment_id
         AND a.tenant_id = reminder_claims.tenant_id
    )
  );--> statement-breakpoint

CREATE POLICY reminder_sweep_passes_staff_select ON public.reminder_sweep_passes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint

CREATE POLICY reminder_sweep_passes_job_insert ON public.reminder_sweep_passes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND (SELECT auth.uid()) IS NULL
  );--> statement-breakpoint

/* ====================================================================== */
/* 7. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* It changes no existing row, table, policy, function or grant. It       */
/* creates no function and no sequence. It moves no claim, release,       */
/* shadow row or heartbeat out of audit_log: none has been written in     */
/* production, because the pull requests that would write them were never */
/* merged. It builds no late rule and no purge (W-10): every row is kept  */
/* until the ledger's retention is ruled, a purge of old shadow rows and  */
/* heartbeats is carded, and a claim is never purged by age alone. It     */
/* gives no role but the table's owner an UPDATE or a DELETE.             */
/* The one DELETE that reaches reminder_claims is an existing one: an     */
/* appointment's hard delete cascades to that appointment's rows.         */
/* ====================================================================== */

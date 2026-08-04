-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0054_patient_audit_log_and_token_consumption.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0054 — patient_audit_log + action_token_consumptions (W13-01)       */
/*                                                                    */
/* Wave 13 LOOP 1. The two tables the one-action token endpoint needs, */
/* in ONE migration because they are written in ONE transaction and a  */
/* deployment holding one without the other cannot serve a redemption. */
/*                                                                    */
/* NUMBER DERIVATION, per WAVE-13.md section 1.5 (numbers are re-derived */
/* at authoring time, never taken from a reservation). The journal      */
/* packages/db/migrations/meta/_journal.json ends at idx 52, tag        */
/* 0053_patients_nif_exemption, 53 entries; both mirrored trees agree.  */
/* Next free is therefore 0054, journal idx 53. WAVE-13.md section 5    */
/* reserved 0054 as intent and the derivation agrees with it. It very   */
/* nearly did not: a session-held plan had reserved 0053 for this exact */
/* audit log while PL-31 merged 0053_patients_nif_exemption (#759),     */
/* because the reservation lived in a session rather than in the repo.  */
/*                                                                    */
/* SOURCE OF REQUIREMENTS. docs/rgpd-token-flow.md, written for the     */
/* clinic's data-protection counsel: section 6 (single use) and section */
/* 8 (audit log for patient-triggered writes). Both are marked          */
/* SPECIFIED, NOT YET BUILT in that document. This migration is the     */
/* storage half of building them.                                      */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* 1. The append-only guard, shared by both tables.                    */
/*                                                                    */
/* WHY A TRIGGER AND NOT ONLY RLS. This repository already has one     */
/* append-only table, audit_log, and 0003_grants.sql explains that its  */
/* append-only property is enforced by the ABSENCE of UPDATE/DELETE     */
/* policies: Postgres denies any command with no matching policy. That  */
/* is true and it is a good control, but it has two holes that counsel  */
/* specifically asked to close (section 8, "enforced at the database    */
/* level rather than by convention, plus a trigger refusing             */
/* modification"):                                                     */
/*                                                                    */
/*   a) RLS does not apply to a role with BYPASSRLS. service_role has   */
/*      it. Today no patient path uses service_role - the reminder and  */
/*      token paths go through withReminderTenantContext, which does    */
/*      `set local role authenticated` (packages/db/src/client.ts:115-  */
/*      127, apps/web/lib/reminders/context.ts) - but "today" is not an */
/*      enforcement mechanism, and an audit trail whose integrity       */
/*      depends on nobody later reaching for getDbAdmin is not          */
/*      integrity-protected in the sense counsel meant.                 */
/*                                                                    */
/*   b) RLS does not gate TRUNCATE at all. A TRUNCATE would erase the   */
/*      entire trail and every policy in this file would permit it.     */
/*      That is why TRUNCATE is named in the trigger below.             */
/*                                                                    */
/* FOR EACH STATEMENT, not FOR EACH ROW, deliberately: a statement-level */
/* BEFORE trigger fires even when the UPDATE or DELETE matches zero      */
/* rows, so "no rows were affected" can never be mistaken for "the guard */
/* ran and allowed it", and TRUNCATE triggers must be statement-level    */
/* in any case.                                                         */
/*                                                                    */
/* ERRCODE 42501 is insufficient_privilege - the same class a missing    */
/* GRANT raises, so a caller cannot tell the trigger from the grant and  */
/* both read as "you may not do this".                                  */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.refuse_append_only_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'public.% is append-only; % is refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 2. patient_audit_log — every patient-triggered write, section 8.     */
/*                                                                    */
/* COVERS BOTH PATIENT PATHS, which is why auth_means exists: token     */
/* redemption (role authenticated, via withReminderTenantContext) and   */
/* an authenticated portal action (role patient, via                    */
/* withPatientContext). One table, one trail, one query answers "what   */
/* did this patient do to this appointment and how did they prove they  */
/* were entitled to".                                                   */
/*                                                                    */
/* REFUSALS ARE ROWS. Counsel, section 8: "a rejected cancellation      */
/* attempt inside the cutoff is exactly the kind of event a later       */
/* dispute turns on". A trail that records only what succeeded cannot   */
/* answer the question it exists to answer.                             */
/*                                                                    */
/* WHY outcome AND reason RATHER THAN ONE `result` COLUMN. Counsel's    */
/* field list names a single Result field, "Success, or the reason for  */
/* refusal". Stored as one free-text column, finding every refusal      */
/* means knowing every phrasing any writer ever used, and a phrasing    */
/* that drifts hides refusals silently - the exact failure the field    */
/* exists to prevent. outcome is a two-value CHECK so refusals are      */
/* findable by predicate, reason carries counsel's text, and the CHECK  */
/* below makes a refusal without a stated reason impossible. The pair   */
/* IS counsel's Result field; docs/rgpd-token-flow.md section 8 records */
/* the same split so the document and the schema cannot drift apart.    */
/*                                                                    */
/* NO FOREIGN KEY ON patient_id OR appointment_id, deliberately, and    */
/* this is the one place this table departs from house style (audit_log */
/* and analytics_events both FK their subjects). An audit row must      */
/* OUTLIVE the record it describes: a dispute about a cancelled         */
/* appointment is precisely when that appointment is most likely to     */
/* have been removed, and ON DELETE CASCADE would erase the evidence at */
/* exactly the wrong moment. ON DELETE SET NULL is not an escape        */
/* either - it is an UPDATE, and the append-only trigger above would    */
/* refuse it, turning an ordinary deletion elsewhere into a hard error. */
/* The ids are recorded as data, not as references.                     */
/*                                                                    */
/* Both are NULLABLE because a refusal can precede identification: a    */
/* forged or malformed token resolves to no appointment and no patient, */
/* and that refusal must still be logged. A NOT NULL here would force   */
/* the code to invent an id or skip the row.                            */
/*                                                                    */
/* tenant_id KEEPS its foreign key but has NO cascade. Deleting a       */
/* tenant that still holds a patient audit trail is refused, which is   */
/* the correct answer for an audit trail and is in any case a           */
/* destructive operation this project routes to the owner.              */
/*                                                                    */
/* RETENTION HOOK, section 8: occurred_at, plus the dedicated index     */
/* below sized for a scheduled purge (DELETE ... WHERE occurred_at <    */
/* now() - <period>). The PERIOD IS NOT SET IN CODE and no default is   */
/* implied here: WAVE-13.md section 3.5 records it as an open counsel   */
/* item. Note that such a purge must run as a role able to pass the     */
/* trigger above; that is deliberate, so an erasure is an explicit,     */
/* privileged act rather than something the application can do.         */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "patient_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "patient_id" uuid,
  "appointment_id" uuid,
  "auth_means" text NOT NULL,
  "action" text NOT NULL,
  "outcome" text NOT NULL,
  "reason" text,
  "ip" varchar(45),
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "patient_audit_log_auth_means_check"
    CHECK ("auth_means" IN ('signed_token', 'otp_session')),
  CONSTRAINT "patient_audit_log_outcome_check"
    CHECK ("outcome" IN ('success', 'refused')),
  CONSTRAINT "patient_audit_log_refusal_needs_reason"
    CHECK ("outcome" <> 'refused' OR "reason" IS NOT NULL),
  CONSTRAINT "patient_audit_log_action_not_blank"
    CHECK (length(btrim("action")) > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "patient_audit_log_tenant_time_idx"
  ON "patient_audit_log" ("tenant_id", "occurred_at");
--> statement-breakpoint

/* The dispute lookup: everything that happened to one appointment. */
CREATE INDEX IF NOT EXISTS "patient_audit_log_appointment_idx"
  ON "patient_audit_log" ("appointment_id");
--> statement-breakpoint

/* The retention hook's index. Tenant-agnostic on purpose: a purge is a
   platform-wide scheduled job, not a tenant-scoped query. */
CREATE INDEX IF NOT EXISTS "patient_audit_log_retention_idx"
  ON "patient_audit_log" ("occurred_at");
--> statement-breakpoint

CREATE TRIGGER "patient_audit_log_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "patient_audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_append_only_modification();
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 3. action_token_consumptions — single use, section 6.                */
/*                                                                    */
/* THE PRIMARY KEY IS THE ENFORCEMENT. Single use is not a read-then-  */
/* write check: two redemptions of the same link arriving together      */
/* would both read "not consumed" and both proceed. It is a UNIQUE      */
/* INSERT performed in the SAME TRANSACTION as the action, so the       */
/* second one loses on the primary key and its whole transaction -      */
/* including the appointment write - rolls back. That is what makes     */
/* "the action and the record commit together or not at all" true       */
/* (counsel section 6) rather than merely intended, and it is race-free */
/* without any application-level locking.                               */
/*                                                                    */
/* THE HASH, NEVER THE TOKEN. Counsel section 6. The CHECK below is not */
/* decoration: a raw token is `<base64url payload>.<base64url sig>`,    */
/* around 183 characters and containing a dot, so it cannot match 64    */
/* lowercase hex characters. A future writer that passes the token      */
/* itself by mistake gets a constraint violation rather than a table    */
/* quietly full of live credentials.                                    */
/*                                                                    */
/* Same no-cascade reasoning as above: a consumption record that        */
/* disappeared with its appointment would make a spent token redeemable */
/* again, so appointment_id is data here too, not a reference.          */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "action_token_consumptions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "appointment_id" uuid NOT NULL,
  "action" text NOT NULL,
  "consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "action_token_consumptions_hash_is_sha256_hex"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "action_token_consumptions_action_not_blank"
    CHECK (length(btrim("action")) > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "action_token_consumptions_tenant_time_idx"
  ON "action_token_consumptions" ("tenant_id", "consumed_at");
--> statement-breakpoint

CREATE TRIGGER "action_token_consumptions_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "action_token_consumptions"
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_append_only_modification();
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 4. Table gates. RLS is the row gate, GRANT is the table gate; both   */
/* are required (0003_grants.sql).                                      */
/*                                                                    */
/* NOTE these tables do NOT inherit 0003's blanket grant: `GRANT ... ON  */
/* ALL TABLES IN SCHEMA public` applies to the tables existing when it   */
/* ran, not to tables created afterwards. So the absence of UPDATE and   */
/* DELETE below is a real, effective control today, and the explicit     */
/* REVOKE is there to survive a future blanket grant rather than to      */
/* undo a present one.                                                  */
/*                                                                    */
/* WHO WRITES WHAT:                                                     */
/*   authenticated - the token redemption path (role authenticated with  */
/*     an in-tenant role claim) writes both tables.                      */
/*   patient - an authenticated portal action writes the audit log only. */
/*     It never redeems a token, so it gets nothing on consumptions.     */
/*   A patient cannot READ the audit log. Nothing in the specification   */
/*     asks for patient-facing access to it, so least privilege applies. */
/* ------------------------------------------------------------------ */

GRANT SELECT, INSERT ON public.patient_audit_log TO authenticated;--> statement-breakpoint
GRANT INSERT ON public.patient_audit_log TO patient;--> statement-breakpoint
GRANT SELECT, INSERT ON public.action_token_consumptions TO authenticated;--> statement-breakpoint

REVOKE UPDATE, DELETE, TRUNCATE ON public.patient_audit_log FROM authenticated, patient;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.action_token_consumptions FROM authenticated, patient;--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 5. Row gates. Fail-closed: RLS on, and only SELECT/INSERT policies   */
/* exist, so UPDATE and DELETE are denied for want of a policy - the    */
/* same posture 0001_rls.sql gives audit_log, now with the trigger and  */
/* the grants behind it.                                                */
/* ------------------------------------------------------------------ */

ALTER TABLE public.patient_audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.action_token_consumptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "patient_audit_log_tenant_select" ON public.patient_audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.jwt_tenant_id());
--> statement-breakpoint

CREATE POLICY "patient_audit_log_tenant_insert" ON public.patient_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.jwt_tenant_id());
--> statement-breakpoint

/* The portal path. A patient may write a row about THEMSELVES and no
   one else: patient_id is pinned to the verified principal, so a patient
   cannot forge trail entries against another patient. */
CREATE POLICY "patient_audit_log_patient_insert" ON public.patient_audit_log
  FOR INSERT TO patient
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND patient_id = public.jwt_patient_id()
  );
--> statement-breakpoint

CREATE POLICY "action_token_consumptions_tenant_select" ON public.action_token_consumptions
  FOR SELECT TO authenticated
  USING (tenant_id = public.jwt_tenant_id());
--> statement-breakpoint

CREATE POLICY "action_token_consumptions_tenant_insert" ON public.action_token_consumptions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.jwt_tenant_id());

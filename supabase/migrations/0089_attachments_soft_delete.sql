-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0089_attachments_soft_delete.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* NEXT-AFTER-0088 - attachments: SOFT delete for a patient document.  */
/*                   Three columns, one CHECK, one FK, one policy       */
/*                   expression. SR-62 PU-4.                            */
/* ================================================================== */
/*                                                                    */
/* PARKED, NOT NUMBERED. BLUE's 0088 is authored and held unapplied,   */
/* so this file's number is not decidable yet. It lives in             */
/* migrations-pending, where the applier cannot see it. Promote it by  */
/* rename + journal entry + supabase mirror (see the README beside     */
/* this file). The body below is final; the rename is the only edit.   */
/*                                                                    */
/* ================================================================== */
/* THE RULING THIS IMPLEMENTS (owner, final)                           */
/* ================================================================== */
/* A document removed from a patient's Documentos tab is SOFT deleted: */
/* the row stays, the Storage object stays, and "who removed this and  */
/* why" can be answered later. RGPD makes that a question that gets    */
/* asked. A reason is REQUIRED. A hard delete is never offered.        */
/*                                                                    */
/* The case that prompted it: a document belonging to one patient was  */
/* uploaded to the file of a different patient who shares the family   */
/* name. Moving it to the right patient is a SEPARATE ticket and is    */
/* not built here.                                                     */
/*                                                                    */
/* ================================================================== */
/* WHERE EACH PART OF THE ANSWER LIVES                                 */
/* ================================================================== */
/*   who    attachments.deleted_by_user_id  AND audit_log.actor_user_id */
/*   when   attachments.deleted_at          AND audit_log.created_at    */
/*   why    attachments.delete_reason       ONLY                        */
/*                                                                    */
/* The reason is NOT copied into audit_log. audit_log carries ids,     */
/* enums, counts and timestamps only (CLAUDE.md rule 7, enforced by    */
/* apps/web/lib/audit/metadata-contract.ts); a sentence typed at a      */
/* front desk about one patient is prose. The audit row records        */
/* hadReason = true and the patient id; the prose lives in a real      */
/* domain column, exactly as record_annulments.reason does (0035).     */
/*                                                                    */
/* ================================================================== */
/* THE CHECK: ALL THREE OR NONE, AND A REASON THAT IS NOT BLANK        */
/* ================================================================== */
/* A row with deleted_at set and no actor, or an actor and no reason,  */
/* is a deletion nobody can account for, which is the one thing this   */
/* migration exists to prevent. The app refuses a blank reason; the    */
/* CHECK makes that true for every writer, including a service-role    */
/* script. "Not blank" is `~ '[^[:space:]]'` (at least one character   */
/* that is not whitespace) rather than a trim, because btrim strips    */
/* only spaces and a reason of tabs and newlines would pass a trim.     */
/*                                                                    */
/* ================================================================== */
/* RLS                                                                 */
/* ================================================================== */
/* STAFF (`attachments_tenant_isolation`, 0001, FOR ALL, tenant only)  */
/* is NOT touched. A soft-deleted row stays readable to staff in its   */
/* tenant; hiding it from the Documentos tab is the app's filter, and  */
/* keeping it visible at the database is what lets the trail be read.  */
/* The same policy already permits the UPDATE that sets the columns.   */
/*                                                                    */
/* PATIENT PORTAL (`attachments_patient_selfscope`, 0010, SELECT TO    */
/* patient) gains ONE conjunct: `deleted_at IS NULL`. A document staff  */
/* removed must stop reaching the patient too, and the portal's own    */
/* query filter is not the only wall. The two existing conjuncts are   */
/* restated character-identical to 0010, because ALTER POLICY rewrites */
/* the whole expression. The role (patient) and command (SELECT) are   */
/* not changed by ALTER POLICY ... USING.                              */
/*                                                                    */
/* ================================================================== */
/* WHAT IS NOT TOUCHED                                                 */
/* ================================================================== */
/* No grant. No table other than attachments. No function, no trigger. */
/* clinical_records, record_annulments and the immutability trigger    */
/* are out of scope and untouched. Existing rows get NULL in all three  */
/* columns, which satisfies the CHECK, so the ALTER cannot fail on      */
/* existing data. NOT additive under SR-50(d): it ALTERs a table and a  */
/* policy.                                                              */
/* ================================================================== */

ALTER TABLE "attachments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "deleted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_soft_delete_complete" CHECK (
  ("deleted_at" IS NULL AND "deleted_by_user_id" IS NULL AND "delete_reason" IS NULL)
  OR (
    "deleted_at" IS NOT NULL
    AND "deleted_by_user_id" IS NOT NULL
    AND "delete_reason" IS NOT NULL
    AND "delete_reason" ~ '[^[:space:]]'
  )
);--> statement-breakpoint

ALTER POLICY "attachments_patient_selfscope" ON public.attachments
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
    AND deleted_at IS NULL
  );--> statement-breakpoint

COMMENT ON COLUMN public.attachments.delete_reason IS
  'Why staff soft-deleted this document (required, non-blank). Free text, so it '
  'lives here and never in audit_log, whose row for the deletion carries only '
  'hadReason and the patient id. Set together with deleted_at and '
  'deleted_by_user_id or not at all (attachments_soft_delete_complete).';

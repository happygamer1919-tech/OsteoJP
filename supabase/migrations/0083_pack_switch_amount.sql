-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0083_pack_switch_amount.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ==================================================================== */
/* 0083 — WHAT RECEPTION SAID WAS CHARGED FOR A PACOTE SWITCH, AND WHY. */
/* PACK-06. Two nullable columns on patient_pack_instances.             */
/* ==================================================================== */
/*                                                                      */
/* THE RULING THIS FILE IMPLEMENTS, stamped by strategy 2026-09-08 and  */
/* recorded in docs/design/SPEC-pacote-switching.md sections 6, 6b, 7:  */
/*                                                                      */
/*   "Reception types the amount charged, with a reason, and the screen */
/*    records it. The screen may show today's catalogue difference as a */
/*    CLEARLY LABELLED SUGGESTION and must never record it as what the  */
/*    patient paid. Nothing in the database knows what anyone paid."    */
/*                                                                      */
/* AND THE STORAGE QUESTION IS RULED THE SAME WAY, 2026-09-09: TWO      */
/* NULLABLE COLUMNS ON THE INSTANCE, NOT audit_log.metadata. The amount */
/* charged is a FACT ABOUT THE INSTANCE and the next reader will look   */
/* at the instance. The audit-log route was the cheap one and it        */
/* collides with that helper's own contract - free text typed at a      */
/* front desk about one patient's money is exactly what "PII-free by    */
/* contract" excludes, and #1226 is the fix for a case where that       */
/* contract was already being broken.                                   */
/*                                                                      */
/* ==================================================================== */
/* WHAT THE THREE STAMPED CONSTRAINTS BECOME IN SQL                     */
/* ==================================================================== */
/*                                                                      */
/* (1) THE AMOUNT IS AN INPUT AND IS NEVER PRE-FILLED.                  */
/*     In SQL that is NO DEFAULT, and the absence is the constraint.    */
/*     A DEFAULT here would be the recorded version of the very defect  */
/*     the ruling prevents: the row could not afterwards tell           */
/*     "reception agreed" from "reception did not look". The screen's   */
/*     half - the suggestion sits BESIDE the field and never populates  */
/*     it - is PURPLE's and is not in this file. The post-check asserts */
/*     `column_default IS NULL` on both columns, because a default is   */
/*     one word and would be invisible in review.                       */
/*                                                                      */
/* (2) MISSING IS REFUSED.                                              */
/*     BOTH OR NEITHER: `(amount IS NULL) = (reason IS NULL)`. NULL on  */
/*     both is every instance that was never switched, which is all of  */
/*     them today. An amount with no reason is a number nobody can      */
/*     audit; a reason with no amount is a story with no settlement.    */
/*     AND AN EMPTY REASON IS ALSO MISSING - `btrim(reason) <> ''` -    */
/*     because '' is "nobody said" wearing the clothes of "somebody     */
/*     said", which is PORTAL-REHYDRATE 1.3 in a column.                */
/*                                                                      */
/* (3) ZERO IS ACCEPTED.                                                */
/*     `>= 0`, NOT `> 0`. A goodwill upgrade is a real commercial act,  */
/*     and collapsing "nothing was charged" into "nobody said" would    */
/*     lose the distinction the whole ruling is about. Negative is      */
/*     refused: a refund is not a switch charge and would need its own  */
/*     ruling and its own column.                                        */
/*                                                                      */
/* ==================================================================== */
/* CENTS, INTEGER, BECAUSE EVERY OTHER MONEY COLUMN HERE IS             */
/* ==================================================================== */
/* services.price_cents, service_packs.price_cents,                     */
/* service_location_prices.price_cents and pack_location_prices.        */
/* price_cents are all `integer`, all minor units, and all carry the    */
/* same comment: "minor units (cents), never float". A numeric or a     */
/* float here would be the one money column in the schema that rounds   */
/* differently from the other four.                                     */
/*                                                                      */
/* ==================================================================== */
/* THE REASON IS NOT LENGTH-CAPPED, AND THAT IS A DECISION              */
/* ==================================================================== */
/* An unbounded `text` column can take a whole pasted record. A cap     */
/* would prevent that, and it would also REFUSE A LEGITIMATE ENTRY AT   */
/* THE DESK, mid-transaction, with a database error - and a receptionist*/
/* who cannot save the reason will save no reason. No cap was stamped,  */
/* so none is invented here; it is raised on PACK-06 as a question for  */
/* strategy rather than settled by the author of the migration.         */
/*                                                                      */
/* THIS IS NOT THE audit_log PROBLEM MOVED. The objection to            */
/* audit_log.metadata was never "prose is bad"; it was that audit_log   */
/* is APPEND-ONLY, RETAINED FOR EVER, and contractually PII-free. A     */
/* domain column on the row the statement is about is editable,         */
/* correctable, deletable with the patient, and covered by the same     */
/* RLS as the rest of the instance.                                     */
/*                                                                      */
/* ==================================================================== */
/* IT IS ADDITIVE. NO BACKFILL, NO REWRITE, NO GRANT.                   */
/* ==================================================================== */
/* SR-50(d) routes an ALTER to strategy before a lane may self-apply.   */
/* This is an ALTER: two ADD COLUMN plus three CHECKs. It DROPS         */
/* nothing, RENAMES nothing, REWRITES nothing and BACKFILLS nothing.    */
/*                                                                      */
/* NO TABLE REWRITE. `ADD COLUMN` with NO DEFAULT is a catalogue change */
/* in PostgreSQL 11 and later. The two column CHECKs are declared       */
/* INLINE with the columns that create them, so there are no            */
/* pre-existing values to validate. THE TABLE-LEVEL CHECK IS THE ONE    */
/* EXCEPTION AND IT IS STILL FREE: it is added AFTER both columns       */
/* exist, so its validation scan reads rows whose two new columns are   */
/* both NULL, and `(NULL IS NULL) = (NULL IS NULL)` is true for every   */
/* one of them. `patient_pack_instances` is a small table.              */
/*                                                                      */
/* NO GRANT, AND A FUTURE SESSION SHOULD KNOW WHY IT DOES NOT NEED ONE. */
/* `patient_pack_instances` is staff-only: there is no `patient` role   */
/* grant on it at all, so unlike 0081's `patients.locale` there is no   */
/* column-grant trap here. `authenticated` holds table-level grants,    */
/* which cover columns added later, so reception can write both the     */
/* moment this applies.                                                 */
/*                                                                      */
/* NO `IF NOT EXISTS`, for the reason 0081 states at length: it would   */
/* accept somebody else's column of the same name, whatever its type,   */
/* and every check below would then pass against the wrong object. A    */
/* bare ADD COLUMN raises 42701 and stops.                              */
/*                                                                      */
/* ==================================================================== */
/* WHAT THIS FILE DOES NOT DO                                           */
/* ==================================================================== */
/* NO SWITCH. Nothing can move a patient between pacotes today, and     */
/* that is deliberate: `patient_pack_instances` is written in exactly   */
/* two places and both are INSERTs. This file makes the columns exist   */
/* so the screen has somewhere honest to write. The screen, the         */
/* repoint, the shared-base_service_id guard and the labelled           */
/* suggestion are PACK-06's build and are PURPLE's.                     */
/* ==================================================================== */

ALTER TABLE "patient_pack_instances"
  ADD COLUMN "switch_amount_cents" integer
  CONSTRAINT "patient_pack_instances_switch_amount_nonneg"
  CHECK ("switch_amount_cents" IS NULL OR "switch_amount_cents" >= 0);--> statement-breakpoint

COMMENT ON COLUMN "patient_pack_instances"."switch_amount_cents" IS
  'What reception STATED was charged when this instance was switched to a '
  'different pacote, in minor units (cents), never float. NULL means this '
  'instance was never switched - it is NOT zero, and zero is a real value '
  'meaning a goodwill upgrade was given. Nothing in the database can compute '
  'this: there is no price on an instance and invoices carry no pack '
  'reference, so a typed number is the only honest record. NEVER pre-filled '
  'from the catalogue difference - see 0083 and SPEC-pacote-switching.';--> statement-breakpoint

ALTER TABLE "patient_pack_instances"
  ADD COLUMN "switch_reason" text
  CONSTRAINT "patient_pack_instances_switch_reason_nonblank"
  CHECK ("switch_reason" IS NULL OR btrim("switch_reason") <> '');--> statement-breakpoint

COMMENT ON COLUMN "patient_pack_instances"."switch_reason" IS
  'Why the amount above was what it was, in reception''s own words. REQUIRED '
  'whenever the amount is set and refused when it is not: an amount with no '
  'reason is a number nobody can audit. An empty or whitespace-only string is '
  'refused too, because it is "nobody said" wearing the clothes of "somebody '
  'said".';--> statement-breakpoint

/* BOTH OR NEITHER. Table-level, because it spans two columns. */
ALTER TABLE "patient_pack_instances"
  ADD CONSTRAINT "patient_pack_instances_switch_amount_and_reason_together"
  CHECK (("switch_amount_cents" IS NULL) = ("switch_reason" IS NULL));

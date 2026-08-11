-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0061_no_double_confirmed_and_confirm_notification.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0061 — TWO CHANGES, ONE APPLY.                                      */
/*                                                                    */
/*   1. A DATABASE-LEVEL BAN on two CONFIRMED appointments overlapping */
/*      for one practitioner. Closes INC-08.                           */
/*   2. The `confirmed` notification kind plus an `actor_user_id`      */
/*      column, so a therapist accepting a pedido stops being          */
/*      invisible to reception. Closes the code half of acceptance     */
/*      item 20 / PG4.                                                 */
/*                                                                    */
/* THEY SHIP TOGETHER BECAUSE AN APPLY COSTS AN OWNER SITTING, not     */
/* because they are related. Owner instruction, 2026-08-11. They touch */
/* different tables and neither depends on the other; if one has to be */
/* reverted the other stands.                                          */
/* ================================================================== */


/* ================================================================== */
/* PART 1 — NO TWO CONFIRMED APPOINTMENTS ON ONE THERAPIST.            */
/* ================================================================== */
/*                                                                    */
/* THE OWNER RULING, 2026-08-11: staff may NOT deliberately place two  */
/*   confirmed appointments on one therapist at one time. The          */
/*   "Guardar mesmo assim" override is OVERRULED AT THE DATABASE.      */
/*                                                                    */
/* WHY A CONSTRAINT AND NOT MORE APPLICATION CHECKS. This is keyed on  */
/*   STATE, not on PATH, and that is the whole design. A confirmed     */
/*   production double booking (INC-08) was produced by THREE code     */
/*   paths in ninety seconds:                                          */
/*                                                                    */
/*     - a plain status patch (updateAppointment), which ran no        */
/*       conflict check at all;                                        */
/*     - a reschedule, which ran its check correctly and saw nothing,  */
/*       because the row it should have seen had been made invisible;  */
/*     - an Estado flip from `confirmed` back to `scheduled`, illegal  */
/*       under the lifecycle map and enforced nowhere on the server.   */
/*                                                                    */
/*   Two of those three left NO EVIDENCE of how. `allowConflict` is    */
/*   never written to audit metadata by any path in                    */
/*   apps/web/lib/scheduling/actions.ts, so a deliberate override is   */
/*   forensically invisible; and updateAppointment records only        */
/*   {changed, scope}, with no from/to status. Patching paths          */
/*   individually is the vacuous-guard failure mode this project has   */
/*   counted 123 instances of: you fix the three you found and the     */
/*   fourth is written next month. A constraint cannot be bypassed by  */
/*   a path nobody thought of.                                         */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* WHY THE PREDICATE IS `status = 'confirmed'` AND NOT "not cancelled" */
/* ------------------------------------------------------------------ */
/*                                                                    */
/* D1 REQUIRES STACKED PENDINGS TO STAY LEGAL. JP's option-B ruling    */
/*   is that an unconfirmed pedido does not hold the slot, and         */
/*   D1-pedido-versus-pedido-stacking records that two of them may     */
/*   coexist on one window. Verified against the tree rather than      */
/*   taken from a dispatch: 0059:145 keys is_unconfirmed_pedido on     */
/*   `a.status = 'scheduled'`, and                                     */
/*   apps/web/lib/notifications/centre.ts:96 declares                  */
/*   `const PENDING_STATUS = "scheduled"`. A pending pedido is         */
/*   therefore NEVER `confirmed`, and this partial predicate leaves    */
/*   every one of them legal.                                          */
/*                                                                    */
/* WHAT THIS DELIBERATELY DOES NOT COVER, recorded rather than hidden. */
/*   Two `scheduled` staff rows on one window remain legal at the      */
/*   database layer. The application check is therefore STILL          */
/*   LOAD-BEARING and this is a backstop, not a replacement. Claiming  */
/*   otherwise would be the same overreach the incident came from.     */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* THE THREE THINGS THAT MAKE THE DDL CORRECT RATHER THAN PLAUSIBLE.   */
/* ------------------------------------------------------------------ */
/*                                                                    */
/* HALF-OPEN RANGES. tstzrange(a, b) defaults to `[)`, so 10:00-11:00  */
/*   and 11:00-12:00 do NOT overlap. That is exactly the app's own     */
/*   semantics — appointment_conflicts uses                            */
/*   `a.starts_at < p_ends AND a.ends_at > p_starts` — so the database */
/*   and the application agree on what "overlapping" means. A closed   */
/*   `[]` range here would refuse every back-to-back appointment in    */
/*   the clinic, which is most of them.                                */
/*                                                                    */
/* NO NULLS TO REASON ABOUT. practitioner_id, starts_at, ends_at and   */
/*   status are all NOT NULL on this table (packages/db/src/schema.ts),*/
/*   so there is no row for which the constraint is silently vacuous.  */
/*                                                                    */
/* NO tenant_id IN THE KEY, and that is not an omission. practitioner  */
/*   ids are uuids drawn from `users`, and a user belongs to exactly   */
/*   one tenant, so two tenants can never share a practitioner_id and  */
/*   `practitioner_id WITH =` already partitions by tenant. Adding     */
/*   tenant_id would widen the index for no additional refusal.        */
/*                                                                    */
/* btree_gist IS REQUIRED because `practitioner_id WITH =` is an       */
/*   equality operator on a uuid, which plain gist cannot index. It is */
/*   available on Supabase and `IF NOT EXISTS` makes re-apply safe.    */
/*                                                                    */
/* THE APPLY CAN FAIL, AND THAT IS THE POINT. ADD CONSTRAINT ...       */
/*   EXCLUDE builds an index over existing rows and is REFUSED         */
/*   outright if any pair already violates it. The surviving row from  */
/*   INC-08 may be one. A read-only pre-check runs BEFORE this apply;  */
/*   if it returns rows the apply halts and the overlap is resolved by */
/*   a person, never by this file.                                     */
/* ================================================================== */

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_double_confirmed"
  EXCLUDE USING gist (
    "practitioner_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" = 'confirmed');--> statement-breakpoint


/* ================================================================== */
/* PART 2 — THE `confirmed` NOTIFICATION KIND, AND WHO DID IT.         */
/* ================================================================== */
/*                                                                    */
/* THE DEFECT. Reception's pedido queue is a LIVE QUERY ON STATE, not  */
/*   a message list: apps/web/lib/notifications/centre.ts:151-155      */
/*   selects `kind = 'appointment_request' AND status = 'scheduled'`.  */
/*   So when a THERAPIST confirms a pedido, the status leaves          */
/*   'scheduled' and the row SILENTLY DISAPPEARS from reception's      */
/*   queue. Nothing is written anywhere, and reception cannot tell     */
/*   "a therapist just accepted this" from "cancelled" or from "never  */
/*   there". centre.ts:118-121 documents the decline case collapsing   */
/*   into the same predicate on purpose; the confirmed-by-someone-else */
/*   case was never considered.                                        */
/*                                                                    */
/* ONE KIND, NOT FOUR. Owner ruling 2026-08-11: add `confirmed`, and   */
/*   instrument the CONFIRM path only. The other staff transitions     */
/*   (cancel, reschedule, no-show) still emit nothing; that is a KNOWN */
/*   GAP carded rather than silently accepted.                         */
/*                                                                    */
/* WHY A MIGRATION AT ALL, since the contract is TypeScript. 0055:83-86*/
/*   pinned the vocabulary in the database on purpose and said so:     */
/*   "A fifth kind requires a migration, which is the point: the       */
/*   contract in patient-change.ts calls itself FIXED, and a CHECK     */
/*   constraint is how the database says the same thing." This is that */
/*   migration, and the CHECK is rewritten rather than dropped.        */
/*                                                                    */
/* WHY actor_user_id EXISTS. Without it a `confirmed` row says an      */
/*   acceptance happened but not by whom — and reception receives the  */
/*   fan-out too, so their own confirmations would come back to them   */
/*   indistinguishable from a therapist's. The column is what makes    */
/*   the notification answer the question it was added for.            */
/*                                                                    */
/*   NULLABLE, and it must stay so: every row written before this      */
/*   migration has no actor, and back-filling one would invent a fact. */
/*   ON DELETE SET NULL rather than CASCADE — removing a staff user    */
/*   must not delete notifications OTHER people have already read.     */
/*   That differs from recipient_user_id, which does cascade, and the  */
/*   asymmetry is deliberate: a notification belongs to its recipient. */
/*                                                                    */
/* THE 0055 DEDUPE INDEX IS UNAFFECTED. It is unique over (recipient,  */
/*   appointment, kind, occurred_at); a `confirmed` row differs from   */
/*   the `appointment_request` row for the same appointment by `kind`, */
/*   so the two coexist and neither suppresses the other.              */
/* ================================================================== */

ALTER TABLE "staff_notifications"
  DROP CONSTRAINT IF EXISTS "staff_notifications_kind_check";--> statement-breakpoint

ALTER TABLE "staff_notifications"
  ADD CONSTRAINT "staff_notifications_kind_check"
  CHECK ("kind" IN ('booked', 'cancelled', 'rescheduled', 'appointment_request', 'confirmed'));--> statement-breakpoint

ALTER TABLE "staff_notifications"
  ADD COLUMN IF NOT EXISTS "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

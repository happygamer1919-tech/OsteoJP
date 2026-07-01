/* ================================================================== */
/* 0028 — batch scheduling: appointments.batch_id (column-only)       */
/*                                                                    */
/* Wave 01 (SPEC-appointments.md §4). The batch engine books a package */
/* across repeating slots (e.g. 7 Thursdays 09:00), skips busy ones,   */
/* and returns structured failures. This migration adds ONE nullable   */
/* column linking the appointments created by a single batch run:      */
/*   • appointments.batch_id (uuid, nullable, NO FK) — the batch's      */
/*     created rows share the value even when some slots in the run     */
/*     failed (busy), so it does NOT reuse recurrence_parent_id (which  */
/*     needs a bookable parent). recurrence_rule (existing) still       */
/*     documents the rule; the engine is app-layer and consumes         */
/*     getTherapistAvailability (#396) — no interval math here.         */
/*                                                                    */
/* NULL = not batch-created: every pre-0028 row. No backfill; existing  */
/* appointments remain valid and untouched. Orthogonal to              */
/* booking_group_id (multi-therapist, 0027) and recurrence_parent_id.   */
/*                                                                    */
/* No new table. The column inherits appointments' existing RLS         */
/* (tenant isolation, fail-closed) and GRANTs; no new policy or grant   */
/* is required (same shape as 0024 / 0027). A partial index serves      */
/* batch lookups without bloating the NULL-heavy common case.           */
/* ================================================================== */

ALTER TABLE "appointments" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
CREATE INDEX "appointments_batch_idx" ON "appointments" USING btree ("tenant_id","batch_id") WHERE "appointments"."batch_id" is not null;

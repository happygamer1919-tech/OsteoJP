-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0027_multi_therapist_booking.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0027 — multi-therapist booking: booking_group_id (column-only)     */
/*                                                                    */
/* Wave 01 (SPEC-appointments.md §3). Relates appointments created     */
/* together in one flow (two therapists / one patient / one tab) via a */
/* shared id. Adds ONE nullable column to appointments:                */
/*   • appointments.booking_group_id (uuid, nullable, NO FK) — the      */
/*     group is defined by the appointments that share the value;       */
/*     creation atomicity / partial-failure reporting is app-layer      */
/*     (like the batch engine, 0028). Bare uuid mirrors the existing    */
/*     recurrence_parent_id pattern on this table.                      */
/*                                                                    */
/* NULL = a standalone appointment: the common case, and EVERY          */
/* pre-0027 row — no backfill, existing single-therapist appointments  */
/* remain valid and untouched. Orthogonal to recurrence_parent_id       */
/* (recurring series over time), never collapsed into it.               */
/*                                                                    */
/* No new table. The new column inherits appointments' existing RLS     */
/* (tenant isolation, fail-closed) and table GRANTs automatically; no   */
/* new policy or grant is required (same as 0024's column-only add).    */
/* A partial index serves group lookups without bloating the index for  */
/* the NULL-heavy common case.                                          */
/* ================================================================== */

ALTER TABLE "appointments" ADD COLUMN "booking_group_id" uuid;--> statement-breakpoint
CREATE INDEX "appointments_booking_group_idx" ON "appointments" USING btree ("tenant_id","booking_group_id") WHERE "appointments"."booking_group_id" is not null;

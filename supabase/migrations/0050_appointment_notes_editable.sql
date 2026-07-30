-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0050_appointment_notes_editable.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0050 — appointment_notes: editable in place + last-edited stamp      */
/*        PL-13 (owner ruling 2026-07-30: "make them editable with       */
/*        last-edited stamps").                                          */
/*                                                                    */
/* The therapist report: staff must be able to open and CHANGE a note    */
/* in the patient's appointment history, and see who last edited it and  */
/* when. The shipped model (migration 0026) was APPEND-ONLY on the thread */
/* surface: appointment_notes had SELECT + INSERT policies only, so an    */
/* "edit" appended a new row and UPDATE resolved to 0 rows (no policy).   */
/* This migration makes the note row itself editable:                    */
/*   1. add `edited_at` (NULL = never edited) + `last_edited_by`;         */
/*   2. add the missing UPDATE policy (in-tenant), so an UPDATE is        */
/*      allowed for the caller's own tenant and denied cross-tenant.      */
/*                                                                    */
/* SCOPE of the UPDATE policy is TENANT-ONLY, exactly like the existing   */
/* SELECT/INSERT policies (0026). The finer "who may edit" rule           */
/* (patients:write capability; a therapist only for their own patients)   */
/* stays at the APP layer in editAppointmentNoteAction — the same place   */
/* appendAppointmentNoteAction enforces it. Notes are internal staff      */
/* communication, not clinical records, so this is intentionally NOT the  */
/* stricter clinical (0045) scope.                                        */
/*                                                                    */
/* DELETE is deliberately STILL denied (no DELETE policy): the owner ruled */
/* editable, not deletable; history is preserved. created_at is never     */
/* rewritten — an edit stamps edited_at + last_edited_by only. The full    */
/* DML grant to `authenticated` was already present (0026); only the       */
/* UPDATE POLICY was missing. Column-only add + one policy: no table,      */
/* function, or other policy is touched. Isolation re-proven in            */
/* packages/db/tests/appointment-notes-nullable-rls.test.ts (UPDATE now     */
/* allowed in-tenant, DELETE still 0 rows) and cross-tenant-rls-isolation.  */
/* ================================================================== */

ALTER TABLE "appointment_notes" ADD COLUMN "edited_at" timestamptz;--> statement-breakpoint
ALTER TABLE "appointment_notes" ADD COLUMN "last_edited_by" uuid REFERENCES "users"("id");--> statement-breakpoint

CREATE POLICY "appointment_notes_tenant_update" ON public.appointment_notes
  FOR UPDATE TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));

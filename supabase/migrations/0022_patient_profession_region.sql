-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0022_patient_profession_region.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0022 — patient demographic columns: profession + region            */
/*                                                                    */
/* Wave 01 (post-presentation adjustments). Adds two nullable text    */
/* columns to patients:                                               */
/*   • profession — clinically relevant (sedentary work, job strain). */
/*   • region     — administrative region/distrito, paired with the   */
/*                  existing `city` column for the address-reduction  */
/*                  surface (SPEC-patients.md).                        */
/*                                                                    */
/* Scope corrections vs the original brief (see DECISIONS.md          */
/* 2026-06-30):                                                        */
/*   • `city` is NOT added here — it already exists (text, nullable). */
/*   • The street `address` column is NOT dropped or altered. The     */
/*     drop is deferred until a fiscal/declaration dependency check.  */
/*   • The append-style patient_notes relation is NOT created here.   */
/*     patients.notes (single mutable text field) already exists and  */
/*     is sufficient for Wave 01; the relation is deferred to a later */
/*     loop pending JP's audit-trail ruling.                          */
/*                                                                    */
/* Grants/RLS: no change. The new columns are auto-covered by the     */
/* table-level GRANT … ON ALL TABLES … TO authenticated (0003) and    */
/* by service_role BYPASSRLS. patients RLS is table-level and applies */
/* to the new columns automatically. The patient role's column-scoped */
/* UPDATE grant deliberately excludes profession/region (staff data). */
/* ================================================================== */

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS profession text;
--> statement-breakpoint
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS region text;

-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0040_contraindication_other.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0040 — patients "Outra" contraindication + free-text note (W12-25)   */
/*                                                                    */
/* A decoupled fourth contraindication ("Outra") beside the three NESA */
/* flags (0031 epilepsy/pregnancy, 0034 pacemaker). Kept SEPARATE from  */
/* those flags' columns/migration (the coupled-flags lesson): a boolean */
/* + its own free-text note.                                           */
/*                                                                    */
/*   contraindication_other       — NOT NULL DEFAULT false (ships off   */
/*                                   for every existing patient).        */
/*   contraindication_other_note  — nullable free-text ("Especifique").  */
/*                                                                    */
/* patients keeps its tenant_id + RLS unchanged (column-only add on an   */
/* existing table; the standard tenant/role policies still gate rows).  */
/* No new behaviour until a patient is flagged.                          */
/* ================================================================== */

ALTER TABLE "patients" ADD COLUMN "contraindication_other" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "contraindication_other_note" text;

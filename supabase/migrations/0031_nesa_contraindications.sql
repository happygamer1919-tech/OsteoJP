-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0031_nesa_contraindications.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0031 — NESA contraindication flags                                 */
/*                                                                    */
/* Wave 02 (DECISIONS.md 2026-07-03 ruling A "NESA contraindications:  */
/* booking-time warning"). Adds boolean flags so the NESA booking      */
/* warning (W2-08) has a data source. Ruling: a SOFT warning at        */
/* booking, never a hard block — the DB only stores the flags; the     */
/* warning logic lives in the UI.                                      */
/*                                                                    */
/* Columns-only on existing tables — no new table, no backfill (every  */
/* existing row takes the false default), RLS untouched. The new       */
/* columns ride each table's existing table-level RLS (tenant          */
/* isolation, fail-closed) and GRANTs automatically (same shape as     */
/* 0022's profession/region and 0024's appointment columns,            */
/* DECISIONS 2026-07-01). NOT NULL DEFAULT false is safe on the        */
/* populated tables: the default fills existing rows in one pass.      */
/* ================================================================== */

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS contraindication_epilepsy boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS contraindication_pregnancy boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS contraindication_sensitive boolean NOT NULL DEFAULT false;

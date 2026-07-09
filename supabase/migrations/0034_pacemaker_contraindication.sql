-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0034_pacemaker_contraindication.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0034 — pacemaker NESA contraindication flag                        */
/*                                                                    */
/* Wave 05 Hotfix (W5-21). Adds a third NESA contraindication flag    */
/* alongside 0031's epilepsy/pregnancy:                               */
/*   • contraindication_pacemaker — "Portador de pacemaker", set on   */
/*     the new-patient / edit form, shown on the profile, and folded  */
/*     into the SOFT NESA booking-time warning (never a hard block).  */
/*                                                                    */
/* Columns-only on an existing table — no new table, no backfill      */
/* (every existing row takes the false default), RLS untouched. The   */
/* new column rides the patients table-level RLS (tenant isolation,   */
/* fail-closed) and the table-level GRANTs automatically (same shape  */
/* as 0031's contraindication flags, DECISIONS 2026-07-03 ruling A).  */
/*                                                                    */
/* Grants/RLS: no change. contraindication_pacemaker is staff-entered */
/* clinical-screening data, so — following the 0022 profession/region */
/* and 0033 referral_source precedent — it is deliberately NOT added  */
/* to the patient role's column-scoped self-UPDATE grant (0019        */
/* whitelist). The grant is an explicit column whitelist, so omitting */
/* the column excludes it by construction.                            */
/* ================================================================== */

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS contraindication_pacemaker boolean NOT NULL DEFAULT false;

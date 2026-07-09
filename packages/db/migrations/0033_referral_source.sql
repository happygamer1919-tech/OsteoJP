/* ================================================================== */
/* 0033 — patient referral source: how did the patient find us        */
/*                                                                    */
/* Wave 05 (W5-11). Adds one nullable text column to patients:        */
/*   • referral_source — staff-entered, captured on the new-patient   */
/*     form as an optional "Como nos conheceu?" dropdown (Redes       */
/*     sociais / Website / Recomendacao de um amigo / Outro). A       */
/*     single text column holds either the chosen option label or,    */
/*     when "Outro" is picked, the free-text the receptionist typed.  */
/*                                                                    */
/* Columns-only on an existing table — no new table, no backfill      */
/* (every existing row takes NULL), RLS untouched. The new column     */
/* rides the patients table-level RLS (tenant isolation, fail-closed) */
/* and the table-level GRANTs automatically (same shape as 0022's     */
/* profession/region and 0031's contraindication flags, DECISIONS     */
/* 2026-07-01).                                                        */
/*                                                                    */
/* Grants/RLS: no change. referral_source is staff-entered demographic */
/* data, so it is deliberately NOT added to the patient role's         */
/* column-scoped self-UPDATE grant (0019 whitelist). Following the     */
/* 0022 profession/region precedent, a patient cannot self-edit it —   */
/* the grant is an explicit column whitelist, so omitting the column   */
/* excludes it by construction.                                        */
/* ================================================================== */

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS referral_source text;

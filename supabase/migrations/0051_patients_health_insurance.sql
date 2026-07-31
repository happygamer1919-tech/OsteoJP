-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0051_patients_health_insurance.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0051 — patients.health_insurance_numbers (PL-23)                    */
/*                                                                    */
/* Owner CR 2026-07-31: "The user data section needs to have one or    */
/* more tabs where we can enter health insurance plan numbers - when   */
/* adding a new patient add a new input field called 'numeros dos      */
/* seguros de saude'".                                                 */
/*                                                                    */
/* SHAPE. The owner's own plural drives it: a patient may hold more    */
/* than one plan (ADSE plus a private insurer is ordinary in PT), so   */
/* this stores a LIST, not one string. Each entry is                   */
/*   { "insurer": string | null, "number": string }                    */
/* because a bare number with no insurer is not usable at the desk.    */
/* Logged as Q-PL-23-1 so the shape could be overruled before apply -  */
/* the shape IS the migration, which is why it was asked first.        */
/*                                                                    */
/* WHY A COLUMN AND NOT A CHILD TABLE. A patient_health_insurances     */
/* table would be the normalized answer, and it is what appointment    */
/* notes and patient_locations do. It is not proportionate here: this  */
/* list is only ever read and written WITH its patient, never queried  */
/* on its own, and a new domain table would carry its own tenant_id,   */
/* its own RLS policy and its own isolation test for no gain. A jsonb  */
/* column inherits the patients policies unchanged - a patient this    */
/* viewer cannot see keeps its insurance numbers invisible with it.    */
/*                                                                    */
/* NOT NULL DEFAULT '[]' so every existing row is an empty list rather */
/* than a NULL the app must special-case. The CHECK enforces that the  */
/* column is an ARRAY at the database level: the app validates each    */
/* entry, but nothing should be able to store an object or a scalar    */
/* here and make every reader defensive.                               */
/*                                                                    */
/* patients keeps its tenant_id + RLS unchanged (column-only add on an  */
/* existing table). No behaviour changes until a number is entered.    */
/* ================================================================== */

ALTER TABLE "patients"
  ADD COLUMN "health_insurance_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_health_insurance_numbers_is_array"
  CHECK (jsonb_typeof("health_insurance_numbers") = 'array');

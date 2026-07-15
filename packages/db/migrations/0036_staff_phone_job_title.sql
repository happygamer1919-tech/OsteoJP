/* ================================================================== */
/* 0036 — staff phone number + professional job title                 */
/*                                                                    */
/* Wave 08 (W8-02). Adds two nullable text columns to users:          */
/*   • phone     — a staff contact phone number. PII: never logged    */
/*     (rule 7); the audit trail records the FACT of a change, never  */
/*     the number itself. Admin-entered in Administracao > Equipa.    */
/*   • job_title — a professional/display title (Fisioterapeuta,      */
/*     Osteopata, Recepcionista, ...). ORTHOGONAL to the permission   */
/*     role (packages/auth ROLES / roles.slug): a therapist may hold  */
/*     role.slug = "therapist" and job_title = "Osteopata". It NEVER  */
/*     gates a capability — do not couple it to role_id.              */
/*                                                                    */
/* Columns-only on an existing table — no new table, no backfill      */
/* (every existing row takes NULL), RLS untouched. Both columns ride  */
/* the users table-level RLS (users_tenant_isolation, 0001 — tenant   */
/* isolation, fail-closed) and the table-level GRANTs automatically   */
/* (same shape as 0033's referral_source on patients, DECISIONS       */
/* 2026-07-01). No NEW policy or isolation surface is created.        */
/*                                                                    */
/* Grants/RLS: no change. Both are admin-managed staff fields, so     */
/* they are deliberately NOT added to any self-UPDATE grant — there   */
/* is no column-scoped grant on users, so the additive columns are    */
/* excluded from self-edit by construction (0033 referral_source /    */
/* 0022 profession precedent). Ships EMPTY; the owner fills phone +    */
/* job title by hand in Equipa after this lands.                      */
/* ================================================================== */

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone text;--> statement-breakpoint

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS job_title text;

-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0019_patient_reminder_prefs.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0019 — patient reminder preferences + patient self-update          */
/*                                                                    */
/* Adds per-patient reminder channel flags (SMS on, email off by      */
/* default, per Joao Pedro's product decision) and unlocks the        */
/* patient role to UPDATE their own editable profile fields.          */
/*                                                                    */
/* Permission design                                                  */
/*   The patient role had GRANT SELECT only on patients (0010         */
/*   comment: "read-only this wave"). Now that the portal exposes a   */
/*   profile PATCH, the patient must be able to UPDATE their own row. */
/*                                                                    */
/*   Two layers, both required (mirrors the authenticated + 0001 RLS  */
/*   pattern, now applied to the patient role):                       */
/*     • GRANT UPDATE (column list) — table gate, column-scoped.      */
/*       Limits the patient role to exactly the editable whitelist;   */
/*       full_name / email / nif / auth_user_id are excluded.         */
/*     • CREATE POLICY … FOR UPDATE — row gate (self-scope).          */
/*       USING = which rows can be seen for update.                   */
/*       WITH CHECK = which state is allowed after the update.        */
/*       Both clauses pin to the JWT patient_id + tenant_id so the    */
/*       patient can only ever UPDATE their own row.                  */
/* ================================================================== */

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS reminder_sms_enabled   boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS reminder_email_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Column-level UPDATE grant: editable contact/address/pref fields only.
-- The patient role cannot UPDATE identity fields (full_name, email, nif,
-- auth_user_id) — those require staff action or a future identity-change flow.
GRANT UPDATE (
  phone,
  address,
  postal_code,
  city,
  reminder_sms_enabled,
  reminder_email_enabled
) ON public.patients TO patient;
--> statement-breakpoint

CREATE POLICY "patients_patient_update_selfscope" ON public.patients
  FOR UPDATE
  TO patient
  USING (
    id        = (SELECT public.jwt_patient_id())
    AND tenant_id = (SELECT public.jwt_tenant_id())
  )
  WITH CHECK (
    id        = (SELECT public.jwt_patient_id())
    AND tenant_id = (SELECT public.jwt_tenant_id())
  );

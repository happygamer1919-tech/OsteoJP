-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0082_patient_locale_grant.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0082 — the patient role may write its own `locale`.                 */
/*                                                                    */
/* LANG-02. 0081 added `patients.locale` and deliberately granted      */
/* NOTHING: it was approved as two ADD COLUMN, and widening a          */
/* production apply past its approved shape is how an approval stops   */
/* meaning anything. This is that one line, in its own file, beside    */
/* the control that needs it — the account screen's "Idioma" row.      */
/*                                                                    */
/* WITHOUT IT the portal's profile PATCH fails with 42501, permission  */
/* denied for column locale, which reads like an RLS bug and is not    */
/* one. 0020 exists SOLELY because `updated_at` was missing from       */
/* 0019's list and that exact failure reached the portal.              */
/*                                                                    */
/* ================================================================== */
/* IT RESTATES THE WHOLE END STATE, AND THAT IS SR-56 APPLIED RATHER   */
/* THAN SR-56 COPIED.                                                  */
/* ================================================================== */
/* SR-56 says a privilege migration STATES ITS OWN END STATE: revoke   */
/* from every grantee that must not hold the privilege, then grant     */
/* exactly what is intended. Its worked example is a TABLE grant, and  */
/* its reasoning is that Supabase's ALTER DEFAULT PRIVILEGES has       */
/* already granted ALL at CREATE TABLE, so a GRANT removes nothing.    */
/*                                                                    */
/* COPIED LITERALLY ONTO A COLUMN GRANT, SR-56 WOULD BREAK THE PORTAL, */
/* and this was MEASURED rather than reasoned about. On a real         */
/* Postgres:                                                           */
/*                                                                    */
/*     GRANT UPDATE (a,b) ON t TO r;   -- column grants                */
/*     GRANT UPDATE ON TABLE t TO r;   -- table grant                  */
/*     REVOKE UPDATE ON TABLE t FROM r;                                */
/*     -- has_column_privilege(r,t,'a','UPDATE')  ->  FALSE            */
/*     -- information_schema.column_privileges     ->  0 rows          */
/*                                                                    */
/* A TABLE-LEVEL REVOKE TAKES THE COLUMN GRANTS WITH IT. So a file     */
/* that revoked and then granted only `locale` would leave the patient */
/* role able to write ONE column and unable to write the seven the     */
/* portal already depends on — 42501 on every profile save, which is   */
/* precisely the defect 0020 was written to fix, reintroduced by a     */
/* rule intended to prevent defects.                                   */
/*                                                                    */
/* SO THE END STATE IS STATED IN FULL: revoke everything the role      */
/* holds on this table, then grant the COMPLETE eight-column list.     */
/* After this file, what `patient` may UPDATE on `patients` is         */
/* readable HERE, in one place, instead of being the accumulated       */
/* residue of 0019 + 0020 + this. That is what SR-56 is FOR.           */
/*                                                                    */
/* ================================================================== */
/* WHY REVOKE UPDATE AND NOT REVOKE ALL                                */
/* ================================================================== */
/* `patient` also holds SELECT on this table, from 0010, under the     */
/* `patients_patient_selfscope` policy. REVOKE ALL would take it, and  */
/* the portal would stop being able to READ a patient's own row. The   */
/* privilege this file is the end state OF is UPDATE; SELECT belongs   */
/* to 0010 and is not restated here, because a file that restates a    */
/* privilege it is not about becomes the place two files disagree.     */
/*                                                                    */
/* ================================================================== */
/* WHAT DOES NOT MOVE                                                  */
/* ================================================================== */
/* • `authenticated` (staff) holds TABLE-level UPDATE, which covers    */
/*   every column including ones added later. Untouched, and the       */
/*   post-check asserts it did not move.                               */
/* • `anon` holds nothing (0021 revoked ALL on patients FROM anon) and */
/*   must continue to. Asserted, not assumed.                          */
/* • `patients_patient_update_selfscope` (0019) is the ROW gate and is */
/*   untouched: it pins both USING and WITH CHECK to the JWT           */
/*   patient_id, so this grant lets a patient write `locale` ON THEIR  */
/*   OWN ROW and on no other. GRANT is the column gate, RLS is the row */
/*   gate, and both are still required.                                */
/*                                                                    */
/* ================================================================== */
/* NOT APPLIED. Authored under SR-50; the apply is the owner's, and    */
/* rule 8 puts it behind the merge of #1208 (0081).                    */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* THE END STATE, IN TWO STATEMENTS THAT MUST NOT BE SEPARATED.        */
/* Between the REVOKE and the GRANT the patient role can update        */
/* nothing. drizzle runs a migration inside one transaction, so no     */
/* session ever observes that gap — but the two statements are kept in */
/* THIS ORDER, in THIS file, for the same reason: splitting them       */
/* across two migrations would make the gap real.                      */
/* ------------------------------------------------------------------ */
REVOKE UPDATE ON TABLE public.patients FROM patient;
--> statement-breakpoint

GRANT UPDATE (
  /* 0019 — the profile fields a patient may edit. */
  phone,
  address,
  postal_code,
  city,
  reminder_sms_enabled,
  reminder_email_enabled,
  /* 0020 — NOT optional. The portal's profile PATCH writes updated_at on
     every save, and its absence from 0019's list was a live 42501. */
  updated_at,
  /* 0082 — this file. The language the patient chose, so the 24h reminder,
     which is sent by a background job with no browser, can be written in it. */
  locale
) ON public.patients TO patient;
--> statement-breakpoint

COMMENT ON COLUMN public.patients.locale IS
  'The language the PATIENT chose: NULL means nobody has asked, and NULL is never '
  'backfilled to ''pt'' because the two render identically and the distinction is '
  'the only way to find a patient who has never been offered the choice. '
  'Patient-writable since 0082 (column-level GRANT UPDATE to the patient role, '
  'row-scoped by patients_patient_update_selfscope). Read by resolveLocale as its '
  'second argument. Migration 0081 added it, 0082 granted it.';

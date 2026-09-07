-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0081_patient_locale.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ==================================================================== */
/* 0081 — A PATIENT HAS A LANGUAGE, AND NULL MEANS NOBODY HAS ASKED.    */
/* LE-patient-language-not-stored. JP wants English available for       */
/* online booking and the portal.                                       */
/* ==================================================================== */
/*                                                                      */
/* WHY A COLUMN AND NOT A REQUEST HEADER. The 24h reminder is sent by a */
/* background job with NO BROWSER PRESENT - an Inngest function reading */
/* `loadReminderData` - so there is no Accept-Language, no cookie and   */
/* no session to read a preference from. If the language is not on the  */
/* row, an English booking gets a Portuguese SMS. That is the whole     */
/* reason this is a migration rather than a UI change.                  */
/*                                                                      */
/* THE SEAM ALREADY EXISTS AND HAS NEVER BEEN USED.                     */
/* `apps/web/lib/reminders/locale.ts` -> resolveLocale(tenantSettings,  */
/* patientLocale) takes a patient preference as its SECOND argument and */
/* its own header calls it "the seam for a future patients.locale       */
/* column without changing callers". All four dispatch call sites pass  */
/* ONE argument today. This file is what makes the second one real.     */
/*                                                                      */
/* ==================================================================== */
/* NULL IS A THIRD STATE AND IT IS NEVER BACKFILLED TO 'pt'.            */
/* ==================================================================== */
/* This is the point of the whole design and it is easy to undo by      */
/* accident, so it is stated in the schema rather than in a note.       */
/*                                                                      */
/*   NULL  = nobody has asked this patient                              */
/*   'pt'  = this patient CHOSE Portuguese                              */
/*   'en'  = this patient CHOSE English                                 */
/*                                                                      */
/* NULL and 'pt' RENDER IDENTICALLY - resolveLocale falls through NULL  */
/* to the tenant default and then to the platform default, which is pt  */
/* - so a backfill would look like a no-op on every screen and would be */
/* invisible in testing. What it would destroy is the ability to ever   */
/* find the patients who have not been offered the choice, and there    */
/* are roughly eight to ten thousand of them.                           */
/*                                                                      */
/* THAT IS PORTAL-REHYDRATE 1.3 EXACTLY: a convenience that maps an     */
/* unknown case onto a known, harmless-looking one, where the system    */
/* carries on reporting something reasonable. There is NO UPDATE, NO    */
/* DEFAULT and NO backfill in this file, and the post-check asserts     */
/* that zero rows were written.                                         */
/*                                                                      */
/* ==================================================================== */
/* IT IS ADDITIVE, AND STRATEGY APPROVED THE ALTER UNDER SR-50(d).      */
/* ==================================================================== */
/* SR-50(d) routes anything that ALTERs an existing object to strategy  */
/* before the lane may self-apply. This is an ALTER: two ADD COLUMN.    */
/* It creates two nullable columns and two CHECK constraints. It DROPS  */
/* nothing, RENAMES nothing, REWRITES nothing and BACKFILLS nothing.    */
/*                                                                      */
/* NO TABLE REWRITE. `ADD COLUMN <text>` with NO DEFAULT is a catalogue */
/* change in PostgreSQL 11 and later: existing rows are not touched and */
/* the table is not rewritten. The CHECK is declared INLINE, in the     */
/* same statement that creates the column, so there are no pre-existing */
/* values to validate and no validation scan either. On ~8,400 patients */
/* this is milliseconds under an ACCESS EXCLUSIVE lock held for the     */
/* catalogue update alone.                                              */
/*                                                                      */
/* ==================================================================== */
/* NO `IF NOT EXISTS`, DELIBERATELY.                                    */
/* ==================================================================== */
/* Every other object in this repository is created with IF NOT EXISTS  */
/* and this file breaks that convention on purpose. Section 7.0b of     */
/* PORTAL-REHYDRATE exists because a migration that SILENTLY DOES       */
/* NOTHING and reports success cost a day: drizzle skipped a file whose */
/* journal `when` was too low, printed "migrations applied             */
/* successfully", and the object was simply not there.                  */
/*                                                                      */
/* `IF NOT EXISTS` is the same failure wearing different clothes. If a  */
/* column called `locale` already exists on either table - added by     */
/* hand, or by a branch nobody remembers - IF NOT EXISTS would accept   */
/* it whatever its type, whatever its constraint, and every check below */
/* would then pass against somebody else's column. A bare ADD COLUMN    */
/* raises 42701 and stops. The pre-check asserts both are absent first, */
/* so this arm should be unreachable; it is here for the case where the */
/* pre-check's photograph and the apply's reality differ.               */
/*                                                                      */
/* ==================================================================== */
/* WHAT THIS FILE DOES NOT DO, AND THE SECOND ONE IS A TRAP             */
/* ==================================================================== */
/* 1. NO PATIENT-FACING WRITE PATH. Choosing a language is the LANG     */
/*    build's job (LE-patient-language-not-stored, LANG-01, LANG-02),   */
/*    which is not authorised. This file only makes the column exist.   */
/*                                                                      */
/* 2. NO GRANT, AND A FUTURE SESSION WILL TRIP OVER THAT.               */
/*    `patients` carries COLUMN-LEVEL UPDATE grants for the `patient`   */
/*    role, not a table-level one: migration 0019 granted exactly       */
/*    (phone, address, postal_code, city, reminder_sms_enabled,         */
/*    reminder_email_enabled) and 0020 had to be written solely to add  */
/*    `updated_at`, because Drizzle's $onUpdate appends it to every     */
/*    UPDATE and the portal's profile PATCH was failing with 42501.     */
/*                                                                      */
/*    SO `locale` IS NOT PATIENT-WRITABLE AFTER THIS FILE. A patient    */
/*    choosing English on the account screen will get "permission       */
/*    denied for column locale", which reads like an RLS bug and is     */
/*    not one. The fix is one line - GRANT UPDATE (locale) ON           */
/*    public.patients TO patient - and it belongs to the migration that */
/*    ships the account-screen control, beside the code that needs it.  */
/*    It is deliberately NOT here: this file was approved as two ADD    */
/*    COLUMN, and widening a production apply past its approved shape   */
/*    is how an approval stops meaning anything.                        */
/*                                                                      */
/*    STAFF ARE UNAFFECTED. `authenticated` holds table-level grants,   */
/*    which cover every column including ones added later, so reception */
/*    and the therapist can read and write `locale` immediately.        */
/*                                                                      */
/* ==================================================================== */
/* WHY guest_booking_requests TOO                                       */
/* ==================================================================== */
/* A visitor choosing English at step 1 of the public form is not a     */
/* patient yet. The choice has to survive the gap between the form and  */
/* reception converting the request, and `guest_booking_requests` is    */
/* the only row that exists in between. `guest-convert.ts` reads that   */
/* row and calls `insertPatientTx`, which is the single choke point     */
/* where the patient row is created - so one column here plus one field */
/* there carries the choice across, with nothing to reconcile.          */
/* ==================================================================== */

ALTER TABLE "patients"
  ADD COLUMN "locale" text
  CONSTRAINT "patients_locale_check"
  CHECK ("locale" IS NULL OR "locale" IN ('pt', 'en'));--> statement-breakpoint

COMMENT ON COLUMN "patients"."locale" IS
  'The language this patient CHOSE. NULL means nobody has asked, which is a '
  'different fact from choosing Portuguese and must never be backfilled to '
  'pt: the two render identically, so the backfill would be invisible and '
  'would destroy the only way to find patients who were never offered the '
  'choice. Resolved by resolveLocale(tenantSettings, patientLocale), which '
  'falls through NULL to the tenant default and then to pt.';--> statement-breakpoint

ALTER TABLE "guest_booking_requests"
  ADD COLUMN "locale" text
  CONSTRAINT "guest_booking_requests_locale_check"
  CHECK ("locale" IS NULL OR "locale" IN ('pt', 'en'));--> statement-breakpoint

COMMENT ON COLUMN "guest_booking_requests"."locale" IS
  'The language the visitor chose on the public booking form. Carried into '
  'patients.locale by guest-convert.ts at conversion. NULL means the form did '
  'not ask, which is every row written before this column existed.';

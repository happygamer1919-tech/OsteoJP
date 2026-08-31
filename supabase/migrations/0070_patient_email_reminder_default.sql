-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0070_patient_email_reminder_default.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0070 — the 48h email reminder reaches every patient who has an     */
/* email address. WF-18 C (JP, 2026-09-01). SR-15.                    */
/*                                                                    */
/* NUMBER DERIVATION, re-derived at authoring time and not taken from  */
/* a reservation. packages/db/migrations/meta/_journal.json ends at    */
/* idx 68, tag 0069_sms_inbound_events, 69 entries; both mirrored      */
/* trees hold 69 files and agree. Next free is 0070, journal idx 69.   */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* WHAT THIS REVERSES, NAMED PLAINLY BECAUSE IT WAS A PRODUCT RULING   */
/* AND NOT AN ACCIDENT.                                                */
/* ------------------------------------------------------------------ */
/* Migration 0019 added `reminder_email_enabled boolean NOT NULL       */
/* DEFAULT false` and its header records why: "SMS on, email off by    */
/* default, per Joao Pedro's product decision". That default was       */
/* deliberate and it was his.                                          */
/*                                                                    */
/* IT MADE THE 48h EMAIL UNREACHABLE. `planReminderChannels` honours   */
/* the flag, the 48h offset routes to EMAIL ONLY, and no patient has   */
/* ever switched it on - so for the whole life of the pipeline the 48h */
/* reminder reached NOBODY. That was reported as Q-W14-01 rather than  */
/* fixed, because reversing a recorded JP decision is his call.        */
/*                                                                    */
/* HE HAS NOW MADE IT (WF-18 C, relayed to the owner 2026-09-01): the  */
/* 48h reminder goes to every patient with a registered email, and the */
/* portal opt-out toggle stays exactly where it is.                    */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* THE PART THAT IS NOT RECOVERABLE, STATED BEFORE THE DDL RATHER THAN */
/* AFTER IT.                                                           */
/* ------------------------------------------------------------------ */
/* `false` in this column means BOTH "never chose" and "opted out".    */
/* There is no provenance to separate them: the portal profile PATCH   */
/* (apps/api/lib/patient/profile.ts) writes no audit row, so a patient */
/* who deliberately switched email OFF is indistinguishable from the   */
/* 33 who never opened the screen.                                     */
/*                                                                    */
/* SO THE BACKFILL BELOW CANNOT PRESERVE AN OPT-OUT. It will re-enable */
/* email for anyone who had turned it off, and there is no query that  */
/* could avoid that. SR-08 forbids building a set from the ABSENCE of  */
/* a record, and this migration does not pretend otherwise - it does   */
/* not invent a heuristic to guess which false is which.               */
/*                                                                    */
/* JP RULED KNOWING THIS. It was put to the owner in exactly these     */
/* terms and relayed. The mitigation is the one that actually works:   */
/* the portal toggle remains, so anyone re-enabled who did not want it */
/* can switch it off again - and THAT act will leave the column at     */
/* false with the same ambiguity, which is why the provenance gap is   */
/* carded rather than closed here.                                     */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* TWO STATEMENTS, AND THE ORDER MATTERS.                              */
/* ------------------------------------------------------------------ */
/* The DEFAULT change governs patients created AFTER this apply; the   */
/* UPDATE governs the ones that already exist. Neither implies the     */
/* other, and doing only the first is the failure mode that would look */
/* successful: every existing patient would keep `false` and the 48h   */
/* email would stay unreachable for exactly the people the clinic has. */
/*                                                                    */
/* THE BACKFILL IS SCOPED TO PATIENTS WITH AN EMAIL, and that is not   */
/* an optimisation. Setting the flag on a patient with no address      */
/* would record a preference for a channel they cannot receive, and    */
/* the dispatch would skip them on `contact.email` anyway - so the     */
/* only effect would be a column that lies about what was decided.     */
/* `<> ''` as well as NOT NULL: an empty string is a stored non-answer */
/* and `patients.email` is free text.                                  */
/*                                                                    */
/* IDEMPOTENT. Re-running sets the same rows to the value they already */
/* hold; the `= false` predicate makes the second run touch zero rows, */
/* which is also what makes the reported count meaningful.             */
/* ================================================================== */

ALTER TABLE public.patients
  ALTER COLUMN reminder_email_enabled SET DEFAULT true;--> statement-breakpoint

UPDATE public.patients
   SET reminder_email_enabled = true
 WHERE reminder_email_enabled = false
   AND email IS NOT NULL
   AND btrim(email) <> '';--> statement-breakpoint

/* The SMS default is UNTOUCHED and stays true. WF-18 C is about the email
   channel; the 24h SMS was already reaching patients and nothing about it
   was in question. Restated as a comment rather than as a redundant ALTER,
   because writing a statement that changes nothing would read as a decision
   somebody made today. */

COMMENT ON COLUMN public.patients.reminder_email_enabled IS
  'Per-patient opt-out for EMAIL reminders (the 48h offset). Default TRUE '
  'since 0070 (WF-18 C, JP 2026-09-01), reversing 0019''s false. A false '
  'value cannot distinguish "opted out" from "never chose" - there is no '
  'provenance for the choice - which is why the 0070 backfill re-enabled '
  'every patient with a registered email. The portal toggle is the opt-out.';

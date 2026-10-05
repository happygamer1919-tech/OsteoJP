/* ====================================================================== */
/* An optional email on a public booking request.                         */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. Strategy's ruling R40 (dispatch S-1004-A,           */
/* 2026-10-04): "Add an optional email field to the public form, label     */
/* "Email (opcional)", hint "Para receber a confirmação da marcação"."     */
/* The same ruling's channel rule: email if the patient has one, SMS only  */
/* without email. A visitor on the public form is not a patient yet, so    */
/* the address has to survive the gap between the form and reception       */
/* converting the request, and public.guest_booking_requests is the only   */
/* row that exists in between (the reason the language column was added    */
/* here before).                                                          */
/*                                                                        */
/* PENDING, AND IT FOLLOWS THE MAINTAIN REVOKE. This file is parked in     */
/* packages/db/migrations-pending and carries no number of its own. It     */
/* must follow 0100_revoke_maintain, the migration before it.              */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/* The two SET LOCAL lines every migration carries from 0100 on, then one  */
/* ALTER TABLE and one COMMENT:                                           */
/*   - one column, `email text`, NULLABLE, with NO DEFAULT. A nullable     */
/*     column with no default is a catalogue change: no row is rewritten   */
/*     and every existing row reads NULL, which means "the form did not    */
/*     ask, or the visitor left it empty";                                */
/*   - one CHECK, named guest_booking_requests_email_check, added by the   */
/*     same statement (see 2);                                            */
/*   - the column's comment.                                              */
/*                                                                        */
/* ====================================================================== */
/* 2. THE CHECK, AND WHY IT IS NO STRICTER THAN THE APPLICATION            */
/* ====================================================================== */
/* The application's own rule for an email is in                          */
/* apps/web/lib/patients/validation.ts: trimmed, at most 320 characters,   */
/* and matching /^[^\s@]+@[^\s@]+\.[^\s@]+$/. The CHECK is a backstop     */
/* behind that rule, never a second validator, so it must admit every      */
/* value the application admits:                                          */
/*   - LENGTH: at most 320, counted by char_length (code points). The      */
/*     application counts UTF-16 units, which is never fewer, so a value   */
/*     the application admits is never longer here;                       */
/*   - SHAPE: the same three parts, something@something.something, where   */
/*     "something" holds no `@` and none of the six ASCII whitespace       */
/*     characters (space, tab, line feed, carriage return, form feed,      */
/*     vertical tab). The application's `\s` forbids those six AND the     */
/*     Unicode spaces; this forbids the six only, so it is the looser of   */
/*     the two on purpose. The POSIX class [[:space:]] is NOT used:        */
/*     measured on a local Supabase stack (Postgres 17.6, ICU locale), it  */
/*     matches U+0085, which the application's `\s` does not, so that      */
/*     class would refuse a value the application admits.                  */
/* NULL is admitted, and the empty string is not: the application stores   */
/* "no email" as NULL.                                                    */
/*                                                                        */
/* ====================================================================== */
/* 3. NO GRANT, NO POLICY, AND WHY NONE IS NEEDED                         */
/* ====================================================================== */
/* The table's privileges are TABLE-level (0065): `authenticated` holds    */
/* SELECT and UPDATE, which is reception's queue and the convert; the      */
/* public form's INSERT runs on the owning role's connection, never as     */
/* `authenticated`; `anon` and `patient` hold nothing. A table-level       */
/* privilege covers every column, one added later included, and no column  */
/* of this table carries a column-level grant. So the new column is read   */
/* and written by exactly the roles that read and write `phone`, and this  */
/* file grants nothing and revokes nothing.                               */
/*                                                                        */
/* Row level security stays as it is: the two policies of 0063 (staff      */
/* SELECT and staff UPDATE, both on the tenant of the JWT) decide which    */
/* rows a caller sees, and a column added to a row is behind the same      */
/* policies. No policy is created, changed or dropped here.                */
/*                                                                        */
/* ====================================================================== */
/* 4. THE LOCK                                                            */
/* ====================================================================== */
/* ALTER TABLE takes ACCESS EXCLUSIVE on public.guest_booking_requests     */
/* until the transaction commits, and the CHECK is validated by one scan   */
/* of the table under that lock. The public form inserts into this table   */
/* and reception updates it, so both wait for the commit. The two bounds   */
/* below make a lock this transaction cannot take in 5 seconds a clean     */
/* failure with nothing applied.                                          */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

ALTER TABLE public.guest_booking_requests
  ADD COLUMN email text
  CONSTRAINT guest_booking_requests_email_check
  CHECK (
    email IS NULL
    OR (
      char_length(email) <= 320
      AND email ~ '^[^@ \t\n\r\f\v]+@[^@ \t\n\r\f\v]+\.[^@ \t\n\r\f\v]+$'
    )
  );--> statement-breakpoint

COMMENT ON COLUMN public.guest_booking_requests.email IS
  'The email address a visitor MAY give on the public booking form (optional; '
  'strategy ruling R40, 2026-10-04), so the clinic can confirm the appointment '
  'by email. NULL means the form did not ask or the visitor left it empty, '
  'which is every row written before this column existed. Personal data, '
  'read and written by exactly the roles that read and write phone.';--> statement-breakpoint

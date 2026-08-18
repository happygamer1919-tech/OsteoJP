-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0066_users_must_set_password.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ------------------------------------------------------------------ */
/* 0066 - RECORD THAT A STAFF PASSWORD IS TEMPORARY.                   */
/*                                                                    */
/* ONE COLUMN, ONE DEFAULT, ONE PARTIAL INDEX. No policy change, no    */
/* grant change, no data change to any existing row.                   */
/* ------------------------------------------------------------------ */
/* WHY IT EXISTS (SEC-02, owner ruling 2026-08-18).                    */
/*                                                                    */
/* The invite flow mints a temporary password and hands it over on a   */
/* screen. First login accepted it and logged straight in: no forced   */
/* rotation, so the temporary credential became the account's          */
/* permanent password. Observed on deployed production 2026-08-18.     */
/*                                                                    */
/* IT IS WORSE UNDER R9, WHICH IS THE CURRENT STATE. INVITES_LIVE_SEND */
/* is off, so no invite email is sent and the temporary password is    */
/* the ONLY way an invited staff member gets in. The hand-off is not a */
/* fallback today, it is the whole onboarding path - so every person   */
/* who ever read that screen holds a working credential to a clinical  */
/* system.                                                             */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* WHY A COLUMN RATHER THAN A FLAG ON THE AUTH USER.                   */
/*                                                                    */
/* Owner ruling 2026-08-18, and the deciding argument is not the       */
/* migration cost. A JWT is minted at sign-in and stays STALE until it */
/* refreshes. Carry this fact in the token and the staffer who has     */
/* JUST set their new password still presents a token demanding they   */
/* set one - so the guard sends them back to the screen they finished. */
/* THE CHEAPER DESIGN LOOPS THE EXACT PERSON THE FIX EXISTS TO HELP.   */
/*                                                                    */
/* A column read per request is never stale, and it is verifiable by   */
/* the DB-gated suite that already exists rather than by a claim-shape */
/* assumption nothing available here could check.                      */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* THE DEFAULT IS false, AND THAT IS A DECISION ABOUT REAL PEOPLE.     */
/*                                                                    */
/* Every staff member already onboarded also received a password an    */
/* admin chose and read. Defaulting to true would force all of them to */
/* rotate at their next sign-in - which is defensible, and it is an    */
/* OPERATIONAL EVENT landing on a working clinic at an arbitrary       */
/* moment, not a code change.                                          */
/*                                                                    */
/* WHAT CANNOT BE DONE, stated so nobody looks for it: we cannot tell  */
/* WHICH existing accounts still hold their handed-over password.      */
/* GoTrue owns the credential and does not expose a                    */
/* password-last-changed fact to this database, so there is no         */
/* predicate that selects only the exposed ones.                       */
/*                                                                    */
/* So this migration closes the hole GOING FORWARD and changes nothing */
/* for anyone already working. Forcing the existing population is a    */
/* separate, owner-TIMED action - a one-line UPDATE the owner runs     */
/* when it suits the clinic - and it is carded rather than smuggled    */
/* into a schema change.                                               */
/* ------------------------------------------------------------------ */

ALTER TABLE public.users
  ADD COLUMN must_set_password boolean NOT NULL DEFAULT false;--> statement-breakpoint

COMMENT ON COLUMN public.users.must_set_password IS
  'SEC-02: true while the account still holds the temporary password issued at invite. The app refuses every screen except the profile page until it is cleared. Cleared by the password-change action, never by hand.';--> statement-breakpoint

/* PARTIAL, because the true rows are the rare ones and the false rows */
/* are every staff member in the tenant. The guard asks "is THIS user  */
/* pending" by primary key, so this index is not for that read - it is */
/* for the operational question "who is still pending", which is how   */
/* the owner-timed backfill above would ever be checked or reversed.   */
CREATE INDEX IF NOT EXISTS users_must_set_password_idx
  ON public.users (tenant_id)
  WHERE must_set_password;--> statement-breakpoint

/* ====================================================================== */
/* Stop the next sequence in `public` from being born with `anon` holding */
/* SELECT, UPDATE and USAGE on it.                                        */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. `anon` is the platform's role for a request that   */
/* carries no signed-in user. Supabase's ALTER DEFAULT PRIVILEGES grants  */
/* ALL on new sequences in `public` to `anon`, `authenticated` and        */
/* `service_role`, and for a sequence ALL is three privileges: USAGE      */
/* (nextval and currval), UPDATE (nextval and setval) and SELECT          */
/* (currval, and reading the sequence's row). So the next sequence        */
/* `postgres` creates in `public` is born with `anon` holding all three,  */
/* until somebody remembers to revoke them by hand.                       */
/*                                                                        */
/* The MAINTAIN revoke (0100_revoke_maintain) took one privilege off      */
/* `authenticated`, on the tables and in their default. The read-only     */
/* measurement made for it found this default as well, and it was carded  */
/* on the board as SEC-anon-sequences-default: "anon's SEQUENCES default  */
/* in public". This file is that card, built. It follows                  */
/* 0102_sat01_satisfaction_survey, the migration before it.               */
/*                                                                        */
/* ====================================================================== */
/* 1. THE MEASUREMENT THIS ACTS ON                                        */
/* ====================================================================== */
/* Production, 2026-10-02, READ ONLY                                      */
/* (scripts/db/measure-0100-maintain.sql, inside a transaction that was   */
/* rolled back). The default privileges for SEQUENCES in `public`:        */
/*   - for objects `postgres` creates: `anon`, `authenticated`,           */
/*     `postgres` and `service_role` each SELECT, UPDATE, USAGE;          */
/*   - for objects `supabase_admin` creates: the same four, the same      */
/*     three;                                                             */
/*   - no default without a schema (a GLOBAL one) for any role.           */
/* That measurement did not count the sequences in `public`. No migration */
/* creates one, and a local Supabase stack built from every migration up  */
/* to the one before this holds none (read 2026-10-08), so the default is */
/* expected to cover no object today. The apply document's pre-check      */
/* reads the count on production and prints what `anon` holds on any it   */
/* finds.                                                                 */
/*                                                                        */
/* ====================================================================== */
/* 2. WHAT IT DOES, AND ONLY THAT                                         */
/* ====================================================================== */
/* The card's SCOPE sentence, to the letter: one ALTER DEFAULT            */
/* PRIVILEGES, FOR ROLE postgres, IN SCHEMA public, REVOKE ALL ON         */
/* SEQUENCES FROM anon, after the two SET LOCAL lines every migration     */
/* carries from 0100 on (scripts/migration-timeouts.test.mjs refuses a    */
/* file without them).                                                    */
/*                                                                        */
/* FOR ROLE postgres is written out, where the MAINTAIN revoke left the   */
/* role to whoever ran it: the default that changes is the one `postgres` */
/* owns, and the statement says so itself. REVOKE ALL, not three names:   */
/* for a sequence ALL is exactly the three privileges measured, and after */
/* it `anon` holds nothing in this default whatever it held before.       */
/*                                                                        */
/* Measured on a local Supabase stack (Postgres 17.6, 2026-10-08), in a   */
/* transaction that was rolled back: before, the entry read               */
/* {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,   */
/* service_role=rwU/postgres}; after, {postgres=rwU/postgres,             */
/* authenticated=rwU/postgres,service_role=rwU/postgres}. A sequence      */
/* created in `public` after it gave `anon` no USAGE, no SELECT and no    */
/* UPDATE; the same sequence created before it gave `anon` all three.     */
/*                                                                        */
/* ====================================================================== */
/* 3. WHAT IS LEFT AFTERWARDS, AND WHY                                    */
/* ====================================================================== */
/*   - `authenticated` and `service_role` keep the three privileges in    */
/*     this default. The card names `anon` and nobody else.               */
/*   - The default of `supabase_admin` still grants `anon` the three. It  */
/*     is out of reach, as the apply documents of the two revokes before  */
/*     this one record: `postgres` is not a member of `supabase_admin`,   */
/*     so it cannot change that role's default. It reaches only a         */
/*     sequence `supabase_admin` itself creates in `public`, and every    */
/*     relation there is owned by `postgres`.                             */
/*   - An EXISTING sequence is not touched. ALTER DEFAULT PRIVILEGES      */
/*     changes what the next object is given and no object that exists.   */
/*     None is expected to exist (section 1); the post-check proves that  */
/*     no sequence's privileges moved.                                    */
/*   - The FUNCTIONS default, which grants `anon` EXECUTE, is not         */
/*     touched: it is another default, and the card does not name it.     */
/*                                                                        */
/* ====================================================================== */
/* 4. NO LOCK ON ANY TABLE                                                */
/* ====================================================================== */
/* The statement is a catalogue change: one row of pg_default_acl. Read   */
/* from a second session while the transaction was open, on the same      */
/* local stack: no relation in `public`, `auth`, `storage` or `realtime`  */
/* was locked. The one relation lock it held was ROW EXCLUSIVE on the     */
/* sequence graphql.seq_schema_version, the platform's own counter of     */
/* schema changes, which blocks no read and no write of any table. So     */
/* neither bound below should ever fire; they are there because the rule  */
/* is the rule.                                                           */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;--> statement-breakpoint

/* ====================================================================== */
/* 5. WHAT THIS DOES NOT DO                                               */
/* ====================================================================== */
/* It is catalogue-only. It writes no row, creates, alters or drops no    */
/* table, sequence, policy or function, and touches no column. It removes */
/* one role's three privileges from one default. Every privilege on every */
/* object that exists, every other default, every policy, every function  */
/* and the SECURITY DEFINER count are unchanged, and the apply document's */
/* post-check proves each. There is no data change and no backfill.       */

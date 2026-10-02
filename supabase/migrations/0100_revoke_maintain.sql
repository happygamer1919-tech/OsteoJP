-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0100_revoke_maintain.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* Take MAINTAIN off `authenticated`, and stop new tables from being born  */
/* holding it.                                                            */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. Every tenant-scoped staff read and write runs as    */
/* `authenticated`: withTenantContext issues `set local role               */
/* authenticated` (packages/db/src/client.ts), which is what makes RLS     */
/* apply at all. So a privilege `authenticated` holds is a privilege the   */
/* application holds on every request.                                    */
/*                                                                        */
/* MAINTAIN is the eighth table privilege, new in Postgres 17. It lets a   */
/* role run VACUUM, ANALYZE, CLUSTER, REINDEX and REFRESH MATERIALIZED     */
/* VIEW on the relation, and LOCK TABLE in any mode. Supabase's ALTER      */
/* DEFAULT PRIVILEGES grants ALL on new tables to `authenticated`, and on  */
/* Postgres 17 ALL includes MAINTAIN. The migration before this one took   */
/* TRUNCATE, TRIGGER and REFERENCES off `authenticated` by the same two    */
/* statements and left MAINTAIN on purpose, because the card it acted on   */
/* named three privileges. The lead's ruling S-1001-A R1 takes MAINTAIN    */
/* off too: "MAINTAIN on authenticated: REVOKE, tables in public plus the  */
/* matching default privileges, same shape as 0099."                       */
/*                                                                        */
/* ====================================================================== */
/* 1. THE MEASUREMENT THIS ACTS ON (S-1001-A R3, "measurement before       */
/*    build"), production, 2026-10-02, READ ONLY                           */
/* ====================================================================== */
/* scripts/db/measure-0100-maintain.sql, run inside a READ ONLY            */
/* transaction and rolled back:                                           */
/*   - 48 relations in `public`, every one an ordinary table: 0            */
/*     partitioned, 0 views, 0 materialized views, 0 foreign tables;       */
/*   - `authenticated` holds MAINTAIN on 41 of the 48, GRANTED and         */
/*     EFFECTIVE alike (41 by the ACL, 41 by has_table_privilege), so no   */
/*     PUBLIC grant and no role membership hands it MAINTAIN: removing its */
/*     own grant removes all of it;                                       */
/*   - `anon` and PUBLIC hold nothing on any table in `public`;            */
/*   - the default privileges of `postgres` for TABLES in `public` grant   */
/*     `authenticated` DELETE, INSERT, MAINTAIN, SELECT, UPDATE. So the     */
/*     next CREATE TABLE by `postgres` re-grants MAINTAIN unless the       */
/*     default changes too;                                               */
/*   - the defaults of `supabase_admin` grant `authenticated` all eight.   */
/*     They are out of reach: ALTER DEFAULT PRIVILEGES without FOR ROLE    */
/*     changes the running role's default only, and `postgres` is not a   */
/*     member of `supabase_admin`. They reach only a table                */
/*     `supabase_admin` creates in `public`, and every table there is      */
/*     `postgres`'s.                                                      */
/*                                                                        */
/* ====================================================================== */
/* 2. NOTHING NEEDS IT                                                    */
/* ====================================================================== */
/* No code in apps/ or packages/ runs VACUUM, ANALYZE, CLUSTER, REINDEX,   */
/* REFRESH MATERIALIZED VIEW or LOCK TABLE. The two LOCK TABLE statements  */
/* in scripts/ belong to a data op the owner's session runs as the table   */
/* owner, and the ANALYZE statements belong to local perf seeders run the  */
/* same way. Autovacuum needs no grant. The schema has no materialized     */
/* view.                                                                  */
/*                                                                        */
/* WHAT THE REVOKE DOES AND DOES NOT TAKE AWAY, said precisely. Postgres  */
/* 17 lets LOCK TABLE take any mode from a role holding MAINTAIN, UPDATE,  */
/* DELETE or TRUNCATE. So `authenticated` keeps a strong LOCK on every     */
/* table where it still holds UPDATE or DELETE, and loses it only where it */
/* holds neither. What it loses everywhere is VACUUM, ANALYZE, CLUSTER,    */
/* REINDEX and REFRESH MATERIALIZED VIEW. SELECT, INSERT, UPDATE and       */
/* DELETE read their own privilege bits and never MAINTAIN, so no read and */
/* no write the application makes can change.                             */
/*                                                                        */
/* ====================================================================== */
/* 3. THE TWO SET LOCAL LINES FIRST                                       */
/* ====================================================================== */
/* The lead's ruling (b) of 2026-10-01: every migration from 0100 starts   */
/* with exactly these two lines, values accepted by strategy (R10), and    */
/* scripts/migration-timeouts.test.mjs refuses a file without them. A      */
/* migration that cannot take a lock in 5 seconds fails and rolls back     */
/* with nothing applied, instead of queueing behind a long transaction     */
/* while every query on that table queues behind it. This file takes no    */
/* table lock (a GRANT or REVOKE rewrites the catalogue row, not the       */
/* table), so neither bound should ever fire; they are there because the   */
/* rule is the rule from this number on.                                   */
/*                                                                        */
/* ====================================================================== */
/* 4. WHY A LOOP AND NOT A LIST                                            */
/* ====================================================================== */
/* The same reason as the migration before it: the end state is a property */
/* of EVERY table in `public`, present and future. The loop fixes today's  */
/* tables; section 5's ALTER DEFAULT PRIVILEGES keeps it true for          */
/* tomorrow's. A table where `authenticated` holds no MAINTAIN is left as  */
/* it is: revoking a privilege nobody holds changes no privilege.          */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')          /* ordinary + partitioned tables */
  LOOP
    EXECUTE format(
      'REVOKE MAINTAIN ON TABLE %s FROM authenticated',
      r.tbl
    );
  END LOOP;
END
$$;--> statement-breakpoint

/* ====================================================================== */
/* 5. THE DEFAULT, SO THE NEXT CREATE TABLE DOES NOT RE-GRANT IT           */
/* ====================================================================== */
/* REVOKE of exactly MAINTAIN, not REVOKE ALL: `authenticated` still       */
/* receives SELECT, INSERT, UPDATE and DELETE on a new table from this     */
/* default, and every migration that narrows those does it per table.      */
/* Revoking ALL by default would silently change what every future         */
/* migration has to restate.                                              */
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE MAINTAIN ON TABLES FROM authenticated;--> statement-breakpoint

/* ====================================================================== */
/* 6. WHAT THIS DOES NOT DO                                                */
/* ====================================================================== */
/* It is catalogue-only. It writes no row, creates, alters or drops no     */
/* table, policy or function, and touches no column. It removes one        */
/* privilege no code path uses from one role. Every other privilege of     */
/* every role, every policy, every function and the SECURITY DEFINER count */
/* are unchanged, and the apply document's post-check proves each. There   */
/* is no data change and no backfill.                                     */

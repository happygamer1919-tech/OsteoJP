/* ====================================================================== */
/* Take TRUNCATE, TRIGGER and REFERENCES off `authenticated`, and stop     */
/* new tables from being born holding them.                               */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. Every tenant-scoped staff read and write in this    */
/* product runs as `authenticated`: packages/db/src/client.ts:152 does     */
/* `set local role authenticated` inside withTenantContext, which is what  */
/* makes the RLS policies apply at all (the connecting role is the owner   */
/* and has BYPASSRLS). So `authenticated` is not a theoretical role here.  */
/* It is the role the application spends its entire life as, and every     */
/* privilege it holds is a privilege the application holds.               */
/*                                                                        */
/* It holds three it has never used: TRUNCATE, TRIGGER and REFERENCES.     */
/*                                                                        */
/* ====================================================================== */
/* 1. HOW IT CAME TO HOLD THEM, WHICH IS NOT BY ANY GRANT IN THIS REPO     */
/* ====================================================================== */
/* No migration in this repository grants them. Every GRANT to             */
/* `authenticated` in packages/db/migrations names its verbs: EXECUTE (34  */
/* of them), SELECT/INSERT/UPDATE/DELETE (16), and narrower combinations.  */
/* There is no `GRANT ALL ... TO authenticated` anywhere.                  */
/*                                                                        */
/* They arrive from Supabase's own ALTER DEFAULT PRIVILEGES, which grants  */
/* ALL on TABLES to `authenticated` at CREATE TABLE time. ALL includes     */
/* these three. 0080_reschedule_requests.sql:204-215 records the same      */
/* mechanism biting: a table was created already holding DELETE, and a     */
/* migration that granted three other verbs "removed nothing" - the        */
/* DB-gated suite caught it because has_table_privilege said DELETE was    */
/* true against a file whose own comment forbade deletes.                  */
/*                                                                        */
/* 0021_grants_hardening.sql CLOSED THIS DOOR FOR `anon` AND ONLY FOR      */
/* `anon`. Its last statement is                                           */
/*     ALTER DEFAULT PRIVILEGES IN SCHEMA public                           */
/*       REVOKE ALL ON TABLES FROM anon;                                   */
/* and there is no counterpart for `authenticated`, because at the time    */
/* `authenticated` was the role that legitimately needed table DML. The    */
/* verbs it needs were never ALL of them; nothing narrowed the rest.       */
/*                                                                        */
/* ====================================================================== */
/* 2. NOTHING NEEDS THEM, MEASURED RATHER THAN ASSUMED                     */
/* ====================================================================== */
/* TRUNCATE: the string does not appear as SQL anywhere in apps/,          */
/* packages/, scripts/ or supabase/. Every `truncate` in the tree is a     */
/* Tailwind class on a <span> or prose in a comment. Deletion in this      */
/* product is DELETE under RLS, or a cascade, or a soft delete.            */
/*                                                                        */
/* TRIGGER and REFERENCES are DDL privileges: they let a role create a     */
/* trigger on a table, or create a foreign key referencing it. All DDL in  */
/* this product happens in migrations, which run as the OWNER, never as    */
/* `authenticated`. The application creates no triggers and no constraints */
/* at runtime.                                                             */
/*                                                                        */
/* THE PORTAL IS NOT AFFECTED EITHER WAY. withPatientContext               */
/* (client.ts:196) drops to the `patient` role, which is a different       */
/* principal with its own policies; this file does not touch it. Whether   */
/* `patient` also inherited these three from the same default privileges   */
/* is a real question and a SEPARATE one - see the apply doc.              */
/*                                                                        */
/* ====================================================================== */
/* 3. WHY A LOOP AND NOT A LIST                                            */
/* ====================================================================== */
/* The repo's doctrine (SR-52, restated at 0080) is to state an END STATE  */
/* rather than reason about what a grant leaves behind. The end state here */
/* is a property of EVERY table in `public`, present and future, not of a  */
/* list someone must remember to extend. A list would be correct on the    */
/* day it was written and wrong at the next CREATE TABLE, which is exactly */
/* the failure mode this file exists to end.                              */
/*                                                                        */
/* The loop is therefore the statement of the rule, and §4's              */
/* ALTER DEFAULT PRIVILEGES is what keeps it true afterwards. Neither      */
/* alone is sufficient: the loop fixes today's tables, the default         */
/* privileges fix tomorrow's.                                             */

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
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM authenticated',
      r.tbl
    );
  END LOOP;
END
$$;--> statement-breakpoint

/* ====================================================================== */
/* 4. THE HALF 0021 DID FOR `anon` AND NOT FOR `authenticated`             */
/* ====================================================================== */
/* Without this, the next CREATE TABLE re-grants all three and §3's loop   */
/* becomes a fact about one afternoon. Stated as REVOKE of exactly the     */
/* three verbs rather than REVOKE ALL, because `authenticated` legitimately */
/* receives table DML on most new tables and those GRANTs are written per  */
/* table; revoking ALL by default would silently change what every future  */
/* migration has to restate.                                              */
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;--> statement-breakpoint

/* ====================================================================== */
/* 5. WHAT THIS DOES NOT DO                                                */
/* ====================================================================== */
/* It touches no policy, no function, no column and no row. It removes    */
/* three privileges no code path uses from one role. A staff session's     */
/* SELECT, INSERT, UPDATE and DELETE are untouched on every table, so      */
/* every screen behaves identically. There is no data change and no        */
/* backfill.                                                              */

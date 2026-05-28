-- OsteoJP — DML grants for the `authenticated` role.
--
-- Why this exists
--   RLS gates which ROWS a role can see / write (0001_rls.sql), but RLS only
--   runs after the table privilege check passes. Without these GRANTs the
--   `authenticated` role hits "permission denied for table <x>" before RLS
--   ever evaluates — exactly the failure documented in step 4 of
--   docs/supabase-setup.md. RLS = row gate, GRANT = table gate, both required.
--
-- What this does NOT do
--   These grants do not relax tenant isolation in any way. Every policy in
--   0001_rls.sql still runs; this migration only lets the authenticated role
--   ATTEMPT the operation so that RLS can then permit or deny it per its
--   tenant_id / user_role checks. service_role retains BYPASSRLS and is
--   unaffected; supabase_auth_admin's grants are managed in 0002.
--
-- audit_log note (do not "tighten" this later)
--   The table-level grant below includes UPDATE and DELETE on audit_log even
--   though that table is append-only. That's intentional: append-only is
--   enforced by RLS — 0001_rls.sql creates only SELECT + INSERT policies on
--   audit_log, and Postgres denies any command for which no policy exists.
--   Revoking UPDATE/DELETE at the GRANT layer would be redundant, and
--   per-table grant carve-outs add maintenance burden every time a new table
--   is added. The defense lives in the policy set, not here.

GRANT USAGE ON SCHEMA public TO authenticated;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO authenticated;
--> statement-breakpoint

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO authenticated;

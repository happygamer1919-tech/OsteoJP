-- Patient-RLS jwt helpers → SECURITY DEFINER (Fix A for the patient identity layer).
--
-- Problem (from migration 0010)
--   0010 added `GRANT USAGE ON SCHEMA auth TO patient`, but that grant silently
--   NO-OPS: migrations run as the non-superuser `postgres`, which does not own
--   the `auth` schema (owned by supabase_admin) and so cannot grant on it
--   (Postgres emits WARNING 01007 "no privileges were granted"). The dedicated
--   `patient` role therefore has NO USAGE on schema auth
--   (has_schema_privilege('patient','auth','USAGE') = false). Every patient
--   self-scope policy calls public.jwt_patient_id()/jwt_tenant_id(), which are
--   SECURITY INVOKER and read auth.jwt() — so under the `patient` role they fail
--   with "permission denied for schema auth". This breaks patient RLS both under
--   `supabase db reset` and on hosted prod (also non-superuser), identically.
--
-- Fix
--   Redefine the two helpers the patient policies call as SECURITY DEFINER. They
--   then execute with the privileges of their OWNER (the function role, which can
--   read auth.jwt()), so the calling `patient` role no longer needs direct
--   auth-schema USAGE. No manual `GRANT ... TO patient` is added anywhere: a
--   privileged grant cannot be performed by the prod migration role (postgres),
--   so relying on one would be a false green. The fix must hold under the
--   non-privileged, prod-equivalent apply — which SECURITY DEFINER does.
--
-- Why this is safe / unchanged behaviour
--   * CREATE OR REPLACE preserves the existing owner (postgres, the role that
--     created these in 0001/0010) and the existing EXECUTE grants. It only adds
--     the SECURITY DEFINER + search_path attributes.
--   * auth.jwt() reads the request.jwt.claims GUC via current_setting().
--     SECURITY DEFINER changes only the PRIVILEGE context, never that GUC, so
--     each helper still returns the CALLER's claim — same value, same result.
--   * STABLE is preserved, so the policies keep referencing them as
--     (select public.jwt_*()) initPlans (evaluated once per query, not per row).
--   * jwt_tenant_id() is shared with staff policies; its return value is
--     unchanged, so staff isolation is unaffected. Staff policies themselves are
--     NOT touched here. jwt_role() is intentionally left as-is.
--   * SET search_path = '' hardens the SECURITY DEFINER functions against
--     search_path injection (every name fully qualified). auth.jwt() is already
--     schema-qualified; `::uuid` and `->>` resolve from pg_catalog, which is
--     always implicitly searched even when search_path is empty. Mirrors the
--     0002 access-token hook hardening.

CREATE OR REPLACE FUNCTION public.jwt_patient_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT (auth.jwt() ->> 'patient_id')::uuid
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$;

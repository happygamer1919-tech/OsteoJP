-- OsteoJP Supabase Custom Access Token Hook.
--
-- Injects two custom claims into every issued access token:
--   * tenant_id  (uuid, from public.users.tenant_id)
--   * user_role  (text slug, from public.roles.slug joined via users.role_id)
--
-- The app-role claim is named `user_role`, NOT `role`. Supabase reserves the
-- `role` claim — PostgREST reads it and performs SET ROLE per request — so
-- writing a slug like 'therapist' there would break every authenticated
-- request. We leave the reserved `role` claim untouched and merge onto the
-- existing claims object rather than rebuilding it.
--
-- These are the same claims that RLS reads via public.jwt_tenant_id() /
-- public.jwt_role() (see 0001_rls.sql). Tenant isolation and role-based
-- access depend on this function running on every token issuance.
--
-- Manual step (NOT performed by this migration):
--   Supabase Dashboard → Authentication → Hooks → Customize Access Token Hook
--   → set to `public.custom_access_token_hook`.
-- Without that toggle the function exists but does nothing.
--
-- Security notes
--   * SECURITY DEFINER so the function reads users/roles with the owner's
--     privileges, regardless of which auth admin role invokes it.
--   * search_path = '' forces every identifier to be schema-qualified
--     (defense against search_path injection on a SECURITY DEFINER function).
--   * EXECUTE is granted only to supabase_auth_admin and revoked from
--     authenticated/anon/public — application code must never call this.
--   * supabase_auth_admin also receives a minimal SELECT grant and a
--     PERMISSIVE-for-SELECT policy on users + roles, so the lookup works
--     even if function ownership later moves off a superuser.

/* ================================================================== */
/* Function                                                           */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id   uuid;
  v_tenant_id uuid;
  v_role      text;
  v_claims    jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := COALESCE(event -> 'claims', '{}'::jsonb);

  SELECT u.tenant_id, r.slug
    INTO v_tenant_id, v_role
    FROM public.users AS u
    LEFT JOIN public.roles AS r ON r.id = u.role_id
   WHERE u.id = v_user_id
     AND u.is_active = true;

  IF v_tenant_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  END IF;

  IF v_role IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
--> statement-breakpoint

/* ================================================================== */
/* Grants                                                             */
/* ================================================================== */

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;
--> statement-breakpoint

-- Minimal SELECT for the lookup inside the hook.
GRANT SELECT ON public.users TO supabase_auth_admin;--> statement-breakpoint
GRANT SELECT ON public.roles TO supabase_auth_admin;--> statement-breakpoint

/* ================================================================== */
/* RLS allow-list policies for supabase_auth_admin                    */
/* PERMISSIVE FOR SELECT — does NOT relax tenant isolation for any    */
/* other role; supabase_auth_admin is only used by the hook itself.   */
/* ================================================================== */

CREATE POLICY "auth_admin_read_users" ON public.users
  AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin
  USING (true);
--> statement-breakpoint

CREATE POLICY "auth_admin_read_roles" ON public.roles
  AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin
  USING (true);

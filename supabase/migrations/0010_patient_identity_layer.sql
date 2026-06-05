-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0010_patient_identity_layer.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

-- Patient identity layer — a patient principal DISTINCT from staff users, with
-- RLS SELF-SCOPE (patient reads only their own rows), not staff tenant-scope.
--
-- Trust-boundary model (read this before changing anything here)
--   * A patient is NOT a row in public.users and is NOT a tenant role. It is a
--     Supabase auth user linked to ONE patients row via patients.auth_user_id.
--   * The access-token hook (redefined below) resolves that link and stamps the
--     token with: tenant_id, patient_id, and the RESERVED `role` claim = 'patient'.
--     Staff token issuance is byte-for-byte unchanged.
--   * A dedicated, login-less Postgres role `patient` carries SELECT-only,
--     SELF-SCOPE policies. Because staff policies target `authenticated` and
--     patient policies target `patient`, the two principals can NEVER share a
--     policy — a patient is confined to their own rows on EVERY path (PostgREST
--     via the `role` claim, and our Drizzle layer via withPatientContext, which
--     does `set local role patient`).
--   * Self-scope predicate = patient_id == jwt_patient_id() AND
--     tenant_id == jwt_tenant_id(). The tenant_id conjunct is belt-and-suspenders
--     against any cross-tenant edge (the guardrail: never another patient, never
--     cross-tenant).
--   * Missing/invalid patient_id claim → jwt_patient_id() returns NULL → every
--     predicate is FALSE → fail-closed, exactly like the staff tenant helper.
--   * RLS stays ENABLE (not FORCE), consistent with 0001: the table owner /
--     BYPASSRLS service_role are unaffected; the `patient` role is neither, so
--     its policies apply.

/* ================================================================== */
/* patients — auth linkage columns (drizzle-generated above)          */
/* ================================================================== */

ALTER TABLE "patients" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_auth_user_id_unique" UNIQUE("auth_user_id");--> statement-breakpoint

/* ================================================================== */
/* JWT claim helper — patient_id                                       */
/* Mirrors jwt_tenant_id()/jwt_role() (0001). Referenced in policies   */
/* as (select public.jwt_patient_id()) so it is an initPlan (once per  */
/* query, not per row).                                                */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.jwt_patient_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT (auth.jwt() ->> 'patient_id')::uuid
$$;
--> statement-breakpoint

/* ================================================================== */
/* The `patient` Postgres role + table/grant gates                    */
/* Idempotent (DO guards) so the migration is safe across environments */
/* (local Postgres, local Supabase, prod) where `authenticator` may or */
/* may not exist.                                                      */
/* ================================================================== */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'patient') THEN
    -- NOLOGIN: assumed via SET ROLE, never connected to directly.
    -- NOINHERIT: never auto-inherits privileges of any role it is granted to.
    CREATE ROLE patient NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint

-- Let the Supabase pooler login role assume `patient` (PostgREST SET ROLE +
-- our Drizzle `set local role patient`). Guarded: plain-Postgres test envs have
-- no `authenticator`, and there the privileged connection is a superuser that
-- can SET ROLE patient without an explicit grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT patient TO authenticator;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO patient;--> statement-breakpoint

-- The self-scope policies call public.jwt_patient_id()/jwt_tenant_id(), which are
-- SECURITY INVOKER and read auth.jwt(). Supabase grants these to `authenticated`;
-- the standalone `patient` role needs them too, or policy evaluation errors with
-- "permission denied for function auth.jwt()". Mirrors the authenticated setup.
GRANT USAGE ON SCHEMA auth TO patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.jwt() TO patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.jwt_patient_id() TO patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO patient;--> statement-breakpoint

-- Row gate (RLS is the row filter; GRANT is the table gate — both required).
-- SELECT only: the patient portal is read-only this wave. Least privilege.
GRANT SELECT ON
  public.patients,
  public.appointments,
  public.clinical_episodes,
  public.clinical_records,
  public.attachments,
  public.invoices
  TO patient;
--> statement-breakpoint

/* ================================================================== */
/* Self-scope SELECT policies (TO patient)                            */
/* ================================================================== */

CREATE POLICY "patients_patient_selfscope" ON public.patients
  FOR SELECT
  TO patient
  USING (
    id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

CREATE POLICY "appointments_patient_selfscope" ON public.appointments
  FOR SELECT
  TO patient
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

CREATE POLICY "clinical_episodes_patient_selfscope" ON public.clinical_episodes
  FOR SELECT
  TO patient
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

-- Patients may read their OWN clinical records (fichas). Field-level redaction
-- of therapist private notes + any draft/finalized gating is the Wave B endpoint
-- layer's job; RLS here is purely row ownership.
CREATE POLICY "clinical_records_patient_selfscope" ON public.clinical_records
  FOR SELECT
  TO patient
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

CREATE POLICY "attachments_patient_selfscope" ON public.attachments
  FOR SELECT
  TO patient
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

CREATE POLICY "invoices_patient_selfscope" ON public.invoices
  FOR SELECT
  TO patient
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

/* ================================================================== */
/* Access-token hook — resolve a patient principal                    */
/* Redefines public.custom_access_token_hook (0002) to ALSO stamp     */
/* patient claims. The staff branch is unchanged. SECURITY DEFINER +  */
/* search_path = '' carried over verbatim from 0002.                  */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id        uuid;
  v_tenant_id      uuid;
  v_role           text;
  v_patient_id     uuid;
  v_patient_tenant uuid;
  v_claims         jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := COALESCE(event -> 'claims', '{}'::jsonb);

  -- Staff principal (identical to 0002): a public.users row wins.
  SELECT u.tenant_id, r.slug
    INTO v_tenant_id, v_role
    FROM public.users AS u
    LEFT JOIN public.roles AS r ON r.id = u.role_id
   WHERE u.id = v_user_id
     AND u.is_active = true;

  IF v_tenant_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
    IF v_role IS NOT NULL THEN
      v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
    END IF;
  ELSE
    -- Patient principal: no staff row. Resolve by the auth link. Excludes
    -- soft-deleted and merged-away patients (they must not authenticate).
    SELECT p.id, p.tenant_id
      INTO v_patient_id, v_patient_tenant
      FROM public.patients AS p
     WHERE p.auth_user_id = v_user_id
       AND p.deleted_at IS NULL
       AND p.merged_into_id IS NULL;

    IF v_patient_id IS NOT NULL THEN
      v_claims := jsonb_set(v_claims, '{tenant_id}',  to_jsonb(v_patient_tenant::text));
      v_claims := jsonb_set(v_claims, '{patient_id}', to_jsonb(v_patient_id::text));
      -- Reserved `role` claim → PostgREST SET ROLE patient. With our Drizzle
      -- layer also running as `patient`, the patient is confined to the
      -- self-scope policies above on EVERY data path.
      v_claims := jsonb_set(v_claims, '{role}', to_jsonb('patient'::text));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
--> statement-breakpoint

-- Parity with 0002's users/roles grants: lets the hook's patient lookup work
-- even if the function owner is ever moved off a superuser. SECURITY DEFINER
-- currently runs as the (BYPASSRLS) owner, so this is defense-in-depth.
GRANT SELECT ON public.patients TO supabase_auth_admin;--> statement-breakpoint

CREATE POLICY "auth_admin_read_patients" ON public.patients
  AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin
  USING (true);

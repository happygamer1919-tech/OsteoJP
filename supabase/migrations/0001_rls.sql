-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0001_rls.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

-- OsteoJP RLS — tenant isolation (fail-closed) + role-aware clinical_records + audit append-only.
--
-- Model
--   * auth.jwt() carries two custom claims, injected by the Supabase
--     Custom Access Token Hook (see 0002_auth_token_hook.sql):
--       - tenant_id (uuid)
--       - user_role (text slug: owner | admin | therapist | reception)
--     NOTE: the app-role claim is `user_role`, NOT `role`. Supabase reserves
--     `role` — PostgREST consumes it to SET ROLE per request, so writing a
--     slug like 'therapist' there would break every authenticated request.
--   * Two STABLE helpers wrap the claim reads. In policies they are referenced
--     as (select public.jwt_tenant_id()) / (select public.jwt_role()) so
--     Postgres treats them as initPlans evaluated once per query, not per row.
--     (Supabase RLS perf guidance.)
--   * Every domain table has RLS ENABLED. Default tenant policy compares
--     tenant_id to the JWT claim. The `tenants` table is keyed on its own id.
--   * Missing/invalid tenant_id claim → helper returns NULL → predicate is
--     FALSE → row invisible. FAIL-CLOSED. There is no permissive fallback.
--   * service_role has BYPASSRLS in Supabase and is the supported escape hatch
--     for migrations / backend jobs / ingestion — no explicit carve-out here.
--   * clinical_records: receptionists cannot read; locked/signed records are
--     immutable via a BEFORE UPDATE OR DELETE trigger (addenda create new rows).
--   * audit_log: append-only — only SELECT + INSERT policies; absence of
--     UPDATE/DELETE policies denies both under RLS.

/* ================================================================== */
/* JWT claim helpers                                                  */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.jwt_role()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT auth.jwt() ->> 'user_role'
$$;
--> statement-breakpoint

/* ================================================================== */
/* Enable RLS on all 13 tables                                        */
/* ================================================================== */

ALTER TABLE public.tenants            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.roles              ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.locations          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.services           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.appointments       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.form_templates     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.clinical_episodes  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.clinical_records   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.attachments        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ================================================================== */
/* tenants — keyed on `id`, not `tenant_id`                           */
/* ================================================================== */

CREATE POLICY "tenants_tenant_isolation" ON public.tenants
  FOR ALL
  TO authenticated
  USING      (id = (select public.jwt_tenant_id()))
  WITH CHECK (id = (select public.jwt_tenant_id()));
--> statement-breakpoint

/* ================================================================== */
/* Standard tenant-scoped tables                                      */
/* ================================================================== */

CREATE POLICY "roles_tenant_isolation" ON public.roles
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "users_tenant_isolation" ON public.users
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "locations_tenant_isolation" ON public.locations
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "services_tenant_isolation" ON public.services
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "patients_tenant_isolation" ON public.patients
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "appointments_tenant_isolation" ON public.appointments
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "form_templates_tenant_isolation" ON public.form_templates
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "clinical_episodes_tenant_isolation" ON public.clinical_episodes
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "attachments_tenant_isolation" ON public.attachments
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "invoices_tenant_isolation" ON public.invoices
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

/* ================================================================== */
/* audit_log — append-only                                            */
/* SELECT + INSERT only; no UPDATE/DELETE policy ⇒ both are denied.   */
/* ================================================================== */

CREATE POLICY "audit_log_tenant_select" ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "audit_log_tenant_insert" ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

/* ================================================================== */
/* clinical_records — tenant isolation + role-aware read matrix       */
/*                                                                    */
/* Read matrix (resolved via public.jwt_role()):                      */
/*   owner       → all in-tenant                                      */
/*   admin       → all in-tenant                                      */
/*   therapist   → all in-tenant                                      */
/*                 TODO v0.1: tighten to patients-they-treat once     */
/*                 user_locations / appointment scoping exists.       */
/*   reception   → DENIED (no clinical_records read)                  */
/*                                                                    */
/* Writes (INSERT/UPDATE/DELETE) follow the same role gate. Immutable */
/* states (locked, signed) are blocked by a BEFORE trigger below —    */
/* RLS handles WHO can touch a row, the trigger handles WHICH rows.   */
/* ================================================================== */

CREATE POLICY "clinical_records_select" ON public.clinical_records
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin', 'therapist')
  );
--> statement-breakpoint

CREATE POLICY "clinical_records_insert" ON public.clinical_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin', 'therapist')
  );
--> statement-breakpoint

CREATE POLICY "clinical_records_update" ON public.clinical_records
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin', 'therapist')
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin', 'therapist')
  );
--> statement-breakpoint

CREATE POLICY "clinical_records_delete" ON public.clinical_records
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin', 'therapist')
  );
--> statement-breakpoint

/* ================================================================== */
/* clinical_records immutability                                      */
/* Finalized rows (record_status = 'locked' | 'signed') cannot be     */
/* updated or deleted. Mutations must instead create a new versioned  */
/* row (addendum). Trigger runs in BEFORE phase so the error fires    */
/* before any row is touched, and applies even to service_role.       */
/* ================================================================== */

CREATE OR REPLACE FUNCTION public.enforce_clinical_record_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('locked', 'signed') THEN
    RAISE EXCEPTION
      'clinical_records %: status=% is finalized and immutable; create a new versioned record (addendum) instead',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER clinical_records_enforce_immutability
  BEFORE UPDATE OR DELETE ON public.clinical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_clinical_record_immutability();

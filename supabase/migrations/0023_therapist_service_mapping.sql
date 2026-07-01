-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0023_therapist_service_mapping.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0023 — therapist-service mapping (greenfield)                       */
/*                                                                    */
/* Wave 01 (SPEC-appointments.md §6). A tenant-scoped join relating a  */
/* therapist (a `users` row with role therapist — there is no          */
/* dedicated therapist table) to the service(s) they deliver, so the   */
/* booking flow can auto-select the eligible service when a therapist  */
/* is picked. The 2026-06-30 audit confirmed no such relation existed  */
/* (no join table, array column, or FK); this is created from zero.    */
/*                                                                    */
/* Shape: id (pk), tenant_id, therapist_user_id (FK users), service_id */
/* (FK services), created_at, UNIQUE (tenant_id, therapist_user_id,    */
/* service_id) to prevent duplicate mappings. users and services are   */
/* NOT modified.                                                       */
/*                                                                    */
/* Mutability (SPEC silent on CRUD, says only "admin-managed" — see    */
/* DECISIONS.md 2026-07-01): a mapping is add/remove, not             */
/* edit-in-place, so the table gets SELECT/INSERT/DELETE policies and  */
/* grants but NO UPDATE. Admin-only restriction on writes is enforced  */
/* server-side (the RLS layer is tenant isolation, matching sibling    */
/* tenant-scoped tables like service_location_prices).                 */
/*                                                                    */
/* RLS: fail-closed tenant isolation, mirroring 0007. tenant_id is     */
/* compared to public.jwt_tenant_id() (0001); a missing/invalid claim  */
/* → helper returns NULL → predicate FALSE → row invisible. Grants:    */
/* authenticated gets SELECT/INSERT/DELETE (RLS = row gate, GRANT =    */
/* table gate, both required); service_role gets ALL (0021 F-2);       */
/* anon is revoked (0021 F-1).                                         */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS "therapist_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"therapist_user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "therapist_services_tenant_therapist_service_uq" UNIQUE("tenant_id","therapist_user_id","service_id"),
	CONSTRAINT "therapist_services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "therapist_services_therapist_user_id_users_id_fk" FOREIGN KEY ("therapist_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "therapist_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "therapist_services_tenant_idx" ON "therapist_services" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "therapist_services_tenant_service_idx" ON "therapist_services" USING btree ("tenant_id","service_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed, add/remove only (no UPDATE)    */
/* ================================================================== */

ALTER TABLE public.therapist_services ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "therapist_services_tenant_select" ON public.therapist_services;--> statement-breakpoint
CREATE POLICY "therapist_services_tenant_select" ON public.therapist_services
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

DROP POLICY IF EXISTS "therapist_services_tenant_insert" ON public.therapist_services;--> statement-breakpoint
CREATE POLICY "therapist_services_tenant_insert" ON public.therapist_services
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

DROP POLICY IF EXISTS "therapist_services_tenant_delete" ON public.therapist_services;--> statement-breakpoint
CREATE POLICY "therapist_services_tenant_delete" ON public.therapist_services
  FOR DELETE
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

/* Table grants. No UPDATE for authenticated (add/remove only). */
GRANT SELECT, INSERT, DELETE ON public.therapist_services TO authenticated;--> statement-breakpoint
GRANT ALL ON public.therapist_services TO service_role;--> statement-breakpoint
REVOKE ALL ON public.therapist_services FROM anon;

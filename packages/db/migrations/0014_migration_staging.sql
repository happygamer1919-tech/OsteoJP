CREATE TYPE "public"."migration_entity_type" AS ENUM('patient', 'appointment', 'clinical_episode', 'clinical_record', 'attachment');--> statement-breakpoint
CREATE TYPE "public"."migration_staging_status" AS ENUM('pending', 'validated', 'imported', 'failed');--> statement-breakpoint
CREATE TABLE "migration_staging_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_system" text NOT NULL,
	"entity_type" "migration_entity_type" NOT NULL,
	"source_id" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "migration_staging_status" DEFAULT 'pending' NOT NULL,
	"error_detail" jsonb,
	"imported_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_staging_tenant_source_uq" UNIQUE("tenant_id","source_system","entity_type","source_id")
);
--> statement-breakpoint
ALTER TABLE "migration_staging_rows" ADD CONSTRAINT "migration_staging_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "migration_staging_tenant_batch_idx" ON "migration_staging_rows" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "migration_staging_tenant_status_idx" ON "migration_staging_rows" USING btree ("tenant_id","status");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed                                */
/* Mirrors the standard tenant_isolation pattern from 0001_rls.sql /  */
/* 0008: USING / WITH CHECK both compare tenant_id to the JWT claim.  */
/* Missing or invalid claim -> public.jwt_tenant_id() returns NULL -> */
/* predicate FALSE -> row invisible. No permissive fallback.          */
/* The import job runs through withTenantContext (authenticated +     */
/* explicit tenant claims), so the policy applies to it; service_role */
/* keeps BYPASSRLS as the standard escape hatch. RLS = row gate,      */
/* GRANT = table gate — 0003 granted ALL TABLES point-in-time, so     */
/* each new table needs its own grant.                                */
/* ================================================================== */

ALTER TABLE public.migration_staging_rows ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "migration_staging_rows_tenant_isolation" ON public.migration_staging_rows
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_staging_rows TO authenticated;
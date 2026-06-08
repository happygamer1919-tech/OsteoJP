-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0008_ai_ingestion_requests.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

CREATE TYPE "public"."ingestion_status" AS ENUM('received', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_ingestion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"clinical_record_id" uuid,
	"status" "ingestion_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_ingestion_requests_tenant_idempotency_uq" UNIQUE("tenant_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "ai_ingestion_requests" ADD CONSTRAINT "ai_ingestion_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_ingestion_requests" ADD CONSTRAINT "ai_ingestion_requests_clinical_record_id_clinical_records_id_fk" FOREIGN KEY ("clinical_record_id") REFERENCES "public"."clinical_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_ingestion_requests_tenant_idx" ON "ai_ingestion_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ai_ingestion_requests_tenant_status_idx" ON "ai_ingestion_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "ai_ingestion_requests_record_idx" ON "ai_ingestion_requests" USING btree ("clinical_record_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed                                */
/* Mirrors the standard tenant_isolation pattern from 0001_rls.sql /  */
/* 0007: USING / WITH CHECK both compare tenant_id to the JWT claim.   */
/* Missing or invalid claim -> public.jwt_tenant_id() returns NULL ->  */
/* predicate FALSE -> row invisible. No permissive fallback.          */
/* service_role has BYPASSRLS and is the ingestion job's escape hatch. */
/* RLS = row gate, GRANT = table gate — both required; 0003 granted    */
/* ALL TABLES point-in-time, so each new table needs its own grant.   */
/* ================================================================== */

ALTER TABLE public.ai_ingestion_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "ai_ingestion_requests_tenant_isolation" ON public.ai_ingestion_requests
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_ingestion_requests TO authenticated;
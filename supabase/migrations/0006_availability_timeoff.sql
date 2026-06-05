-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0006_availability_timeoff.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

CREATE TYPE "public"."time_off_reason" AS ENUM('vacation', 'sick', 'holiday', 'other');--> statement-breakpoint
CREATE TABLE "availability_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_templates_dedupe_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","user_id","location_id","weekday","start_time","end_time","valid_from","valid_until"),
	CONSTRAINT "availability_templates_weekday_range" CHECK ("availability_templates"."weekday" between 0 and 6),
	CONSTRAINT "availability_templates_start_before_end" CHECK ("availability_templates"."start_time" < "availability_templates"."end_time")
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" time_off_reason NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_starts_before_ends" CHECK ("time_off"."starts_at" < "time_off"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "availability_templates" ADD CONSTRAINT "availability_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_templates" ADD CONSTRAINT "availability_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_templates" ADD CONSTRAINT "availability_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_templates_user_weekday_idx" ON "availability_templates" USING btree ("tenant_id","user_id","weekday");--> statement-breakpoint
CREATE INDEX "availability_templates_tenant_location_idx" ON "availability_templates" USING btree ("tenant_id","location_id");--> statement-breakpoint
CREATE INDEX "time_off_user_starts_idx" ON "time_off" USING btree ("tenant_id","user_id","starts_at");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed                                */
/* Mirrors the standard tenant_isolation pattern from 0001_rls.sql:   */
/* USING / WITH CHECK both compare tenant_id to the JWT claim. Missing */
/* or invalid claim → helper returns NULL → predicate FALSE → row      */
/* invisible. No permissive fallback. (RLS = row gate, GRANT = table   */
/* gate — both required; 0003 granted ALL TABLES point-in-time so each */
/* new table needs its own grant.)                                    */
/* ================================================================== */

ALTER TABLE public.availability_templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "availability_templates_tenant_isolation" ON public.availability_templates
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_templates TO authenticated;--> statement-breakpoint

ALTER TABLE public.time_off ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "time_off_tenant_isolation" ON public.time_off
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_off TO authenticated;
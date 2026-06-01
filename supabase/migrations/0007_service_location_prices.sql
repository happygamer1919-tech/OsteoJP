-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0007_service_location_prices.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

CREATE TABLE "service_location_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_location_prices_tenant_service_location_uq" UNIQUE("tenant_id","service_id","location_id"),
	CONSTRAINT "service_location_prices_price_nonneg" CHECK ("service_location_prices"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "service_location_prices" ADD CONSTRAINT "service_location_prices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_location_prices" ADD CONSTRAINT "service_location_prices_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_location_prices" ADD CONSTRAINT "service_location_prices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_location_prices_tenant_location_idx" ON "service_location_prices" USING btree ("tenant_id","location_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed                                */
/* Mirrors the standard tenant_isolation pattern from 0001_rls.sql:   */
/* USING / WITH CHECK both compare tenant_id to the JWT claim. Missing */
/* or invalid claim → helper returns NULL → predicate FALSE → row      */
/* invisible. No permissive fallback. (RLS = row gate, GRANT = table   */
/* gate — both required; 0003 granted ALL TABLES point-in-time so each */
/* new table needs its own grant.)                                    */
/* ================================================================== */

ALTER TABLE public.service_location_prices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "service_location_prices_tenant_isolation" ON public.service_location_prices
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_location_prices TO authenticated;
/* ================================================================== */
/* 0037 — service packs (definitions) + per-patient pack instances     */
/*                                                                    */
/* Wave 08 (W8-01a). Net-new pack model (no pack/bundle/session_count  */
/* table existed before — confirmed by grep). Two domain tables, each  */
/* tenant_id NOT NULL + its own tenant-isolation RLS policy + grants + */
/* an isolation test in this PR (rule 1/2 + project RLS rule).         */
/*                                                                    */
/*   service_packs — a bookable pack TYPE: a base service each session */
/*     draws down, a session_count, a pack price (integer cents), and  */
/*     location scoping consistent with services (location_id NULL =   */
/*     all locations). is_active soft-archives (never hard-delete a    */
/*     referenced pack). A pack is itself a bookable type (W8-01c).    */
/*                                                                    */
/*   patient_pack_instances — one patient's purchase of one pack:      */
/*     sessions_total + a monotonic sessions_remaining (0..total), a   */
/*     status, purchased_at. W8-01c registers/decrements/adjusts these */
/*     (this loop delivers the schema + seed only). Checks enforce a   */
/*     non-negative remaining that never exceeds total (no negative    */
/*     balances, no over-grant).                                       */
/*                                                                    */
/* Non-destructive: services.price_cents + service_location_prices are */
/* UNTOUCHED. "Offered only where priced" is derived in the service    */
/* layer from the PRESENCE of an active service_location_prices row    */
/* (no schema change, no live-pricing behaviour change — a destructive */
/* price_cents change would be a Field-6 owner HALT, not done here).   */
/*                                                                    */
/* RLS mirrors the standard tenant_isolation pattern (0001/0007):      */
/* USING / WITH CHECK compare tenant_id to public.jwt_tenant_id();     */
/* missing/invalid claim -> NULL -> predicate FALSE -> row invisible.  */
/* RLS = row gate, GRANT = table gate: each new table needs its grant. */
/* ================================================================== */

CREATE TABLE "service_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"base_service_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"session_count" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_packs_session_count_pos" CHECK ("service_packs"."session_count" > 0),
	CONSTRAINT "service_packs_price_nonneg" CHECK ("service_packs"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "patient_pack_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"sessions_total" integer NOT NULL,
	"sessions_remaining" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_pack_instances_total_pos" CHECK ("patient_pack_instances"."sessions_total" > 0),
	CONSTRAINT "patient_pack_instances_remaining_range" CHECK ("patient_pack_instances"."sessions_remaining" >= 0 AND "patient_pack_instances"."sessions_remaining" <= "patient_pack_instances"."sessions_total")
);
--> statement-breakpoint
ALTER TABLE "service_packs" ADD CONSTRAINT "service_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_packs" ADD CONSTRAINT "service_packs_base_service_id_services_id_fk" FOREIGN KEY ("base_service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_packs" ADD CONSTRAINT "service_packs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_pack_instances" ADD CONSTRAINT "patient_pack_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_pack_instances" ADD CONSTRAINT "patient_pack_instances_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_pack_instances" ADD CONSTRAINT "patient_pack_instances_pack_id_service_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."service_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_packs_tenant_idx" ON "service_packs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_packs_tenant_location_idx" ON "service_packs" USING btree ("tenant_id","location_id");--> statement-breakpoint
CREATE INDEX "service_packs_tenant_base_service_idx" ON "service_packs" USING btree ("tenant_id","base_service_id");--> statement-breakpoint
CREATE INDEX "patient_pack_instances_tenant_idx" ON "patient_pack_instances" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "patient_pack_instances_tenant_patient_idx" ON "patient_pack_instances" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "patient_pack_instances_tenant_pack_idx" ON "patient_pack_instances" USING btree ("tenant_id","pack_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed (mirrors 0001/0007).           */
/* ================================================================== */

ALTER TABLE public.service_packs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "service_packs_tenant_isolation" ON public.service_packs
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_packs TO authenticated;--> statement-breakpoint

ALTER TABLE public.patient_pack_instances ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "patient_pack_instances_tenant_isolation" ON public.patient_pack_instances
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_pack_instances TO authenticated;

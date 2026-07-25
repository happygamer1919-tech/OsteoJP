/* ================================================================== */
/* 0044 — service_pack_location_prices (W12-20, pacotes per-location)  */
/*                                                                    */
/* Owner ruling 2026-07-25: "I need the pacote edits to be the SAME as */
/* services — to put pricing per location. Copy the same edit          */
/* configuration from services into pacotes." This mirrors the Stream-F */
/* per-location SERVICE pricing (service_location_prices, 0007) onto    */
/* PACKS: an OVERRIDE junction over service_packs.price_cents (the pack */
/* base/catalog price). When a row exists here for a (pack, location)   */
/* pair it WINS for that location; absent -> the location inherits      */
/* service_packs.price_cents. is_active toggles an override off         */
/* (falling back to base) without deleting it. Decoupled from the       */
/* pack's single price_cents (kept as the base/fallback) and from the   */
/* pack's single location_id (kept as its own scoping field) — the      */
/* coupled-flags lesson: a new capability gets its own column/table,    */
/* it does not re-encode an existing one.                               */
/*                                                                    */
/* Net-new table (no service_pack_location_prices existed — confirmed  */
/* by grep). tenant_id NOT NULL (rule 1) + pack_id -> service_packs +   */
/* location_id -> locations. tenant_id ON DELETE cascade (a price       */
/* override is meaningless once the tenant is gone); pack_id/location_id */
/* ON DELETE no action (history-safe: never cascade a pack or location  */
/* delete through a price row — the deletePack path removes a pack's    */
/* own override rows inside its tx first, mirroring deleteService).      */
/* unique(tenant_id, pack_id, location_id) — one override per pair.      */
/*                                                                    */
/* Shape is byte-for-byte the service_location_prices mirror (0007):    */
/* id / tenant_id / <ref>_id / location_id / price_cents NOT NULL /     */
/* currency / is_active / created_at, same unique + nonneg CHECK + the  */
/* (tenant_id, location_id) index.                                      */
/*                                                                    */
/* RLS — tenant isolation, fail-closed, mirrors service_location_prices */
/* (0007) EXACTLY: a single FOR ALL policy whose USING / WITH CHECK     */
/* both compare tenant_id to public.jwt_tenant_id(). Missing/invalid    */
/* claim -> helper returns NULL -> predicate FALSE -> row invisible. No  */
/* permissive fallback. RLS = row gate, GRANT = table gate: the new     */
/* table needs its own grant.                                           */
/* ================================================================== */

CREATE TABLE "service_pack_location_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_pack_location_prices_tenant_pack_location_uq" UNIQUE("tenant_id","pack_id","location_id"),
	CONSTRAINT "service_pack_location_prices_price_nonneg" CHECK ("service_pack_location_prices"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "service_pack_location_prices" ADD CONSTRAINT "service_pack_location_prices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_pack_location_prices" ADD CONSTRAINT "service_pack_location_prices_pack_id_service_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."service_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_pack_location_prices" ADD CONSTRAINT "service_pack_location_prices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_pack_location_prices_tenant_location_idx" ON "service_pack_location_prices" USING btree ("tenant_id","location_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed. Mirrors service_location_prices */
/* (0007): one FOR ALL policy, USING / WITH CHECK both against the JWT  */
/* tenant claim. RLS = row gate, GRANT = table gate.                   */
/* ================================================================== */

ALTER TABLE public.service_pack_location_prices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "service_pack_location_prices_tenant_isolation" ON public.service_pack_location_prices
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_pack_location_prices TO authenticated;

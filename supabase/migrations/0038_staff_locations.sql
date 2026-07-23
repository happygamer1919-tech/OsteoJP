-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0038_staff_locations.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0038 — staff_locations junction (W12-15 thread b, Q-W10-04-1)       */
/*                                                                    */
/* Net-new many-to-many junction between staff (public.users) and      */
/* clinics (public.locations). Confirmed net-new: the only *_locations */
/* tables are `locations` + `patient_locations` (no staff<->location   */
/* junction existed). Before this, staff<->location was DERIVED from   */
/* availability_templates, which exist only for bookable therapists,   */
/* so RECEPTION had no location scope at all.                          */
/*                                                                    */
/*   staff_locations — one row per (staff member, clinic) membership.  */
/*     tenant_id NOT NULL (rule 1) + user_id -> users + location_id ->  */
/*     locations, all ON DELETE cascade (a membership is meaningless    */
/*     once the tenant, user, or location is gone; the row carries no   */
/*     history of its own). unique(tenant_id,user_id,location_id) — one */
/*     membership per pair. `color` (nullable) stores the per-location  */
/*     therapist colour (Q-W12-08): the junction is already keyed by    */
/*     (user, location), so the colour lives here; duplicates across    */
/*     locations are accepted (Rodica), and a NULL colour falls back to */
/*     the FNV-1a hash in therapist-color.ts (nothing breaks pre-seed). */
/*                                                                    */
/* This is the FOUNDATION migration of the Equipa overhaul. It creates  */
/* the table the reception-location model and the per-therapist         */
/* clinical_records RLS tighten (R16 admin location-scoping + therapist */
/* own-patients-only) will DERIVE scope from — that access-model tighten */
/* lands ISOLATED in migration 0039 (one migration in flight; the       */
/* highest-risk clinical-data change audited on its own). 0038 creates  */
/* and isolates the junction; it does NOT touch clinical_records.       */
/*                                                                    */
/* RLS: tenant isolation, fail-closed (mirrors 0001/0007/0037). SELECT  */
/* is tenant-scoped for every authenticated role (reception + therapist */
/* must read their own membership + colours); writes (INSERT/UPDATE/    */
/* DELETE) are further gated to owner/admin — team membership is a       */
/* Manage-users action (permission matrix). Missing/invalid tenant_id   */
/* claim -> jwt_tenant_id() NULL -> predicate FALSE -> row invisible.    */
/* RLS = row gate, GRANT = table gate: the new table needs its grant.    */
/*                                                                    */
/* NOTE (0039): admin write scope tightens to the admin's own           */
/* staff_locations location(s) per R16 when the access-model rewrite     */
/* lands; 0038 keeps the tenant-wide owner/admin write baseline (the     */
/* current admin power level — nothing is widened, the table is net-new).*/
/* ================================================================== */

CREATE TABLE "staff_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_locations_tenant_user_location_uq" ON "staff_locations" USING btree ("tenant_id","user_id","location_id");--> statement-breakpoint
CREATE INDEX "staff_locations_tenant_idx" ON "staff_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "staff_locations_user_idx" ON "staff_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_locations_location_idx" ON "staff_locations" USING btree ("location_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — tenant isolation, fail-closed (mirrors 0001/0037).           */
/* SELECT: any authenticated principal in the tenant.                 */
/* INSERT/UPDATE/DELETE: owner/admin only (Manage users).            */
/* ================================================================== */

ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "staff_locations_select" ON public.staff_locations
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

CREATE POLICY "staff_locations_insert" ON public.staff_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  );
--> statement-breakpoint

CREATE POLICY "staff_locations_update" ON public.staff_locations
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  );
--> statement-breakpoint

CREATE POLICY "staff_locations_delete" ON public.staff_locations
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (select public.jwt_tenant_id())
    AND (select public.jwt_role()) IN ('owner', 'admin')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_locations TO authenticated;

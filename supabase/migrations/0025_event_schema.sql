-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0025_event_schema.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0025 — analytics_events: KPI/analytics event feed (greenfield)      */
/*                                                                    */
/* Wave 01 (SPEC-events.md). An append-only event log capturing        */
/* patient/therapist/finance events as they happen, carrying enough    */
/* dimension to reconstruct the KPIs (revenue & services per           */
/* therapist, finance totals, filterable by date/location/therapist/   */
/* service) WITHOUT back-filling. Deployed now so capture starts       */
/* before the dashboard exists and nothing is lost.                    */
/*                                                                    */
/* DISTINCT from audit_log: audit_log is PII-free change tracking      */
/* (a field changed, no old→new values); this is the KPI feed AND the  */
/* per-appointment status-transition history. appointment_status_      */
/* changed events carry appointment_id/from_status/to_status/actor/    */
/* timestamp in payload; no standalone status-transition table.        */
/*                                                                    */
/* Money: amount_cents_gross is GROSS, integer cents (never float).    */
/* VAT treatment is applied at REPORT time, never at capture — the     */
/* VAT 0 vs 23 rate is an open accountant question (QUESTIONS.md), so  */
/* no VAT is baked into the event here.                                */
/*                                                                    */
/* RLS: append-only, tenant-isolated, fail-closed — mirrors audit_log  */
/* (0001_rls.sql). Only SELECT + INSERT policies exist, so UPDATE and  */
/* DELETE are denied by RLS (0 rows). Per 0003_grants.sql's audit_log  */
/* note, append-only is enforced by the POLICY SET, not by carving     */
/* UPDATE/DELETE out of the grant — so the table-level grant keeps the  */
/* full DML set and the missing policies do the work. tenant_id is     */
/* compared to public.jwt_tenant_id(); missing/invalid claim → NULL →  */
/* predicate FALSE → invisible. service_role gets ALL (0021 F-2), anon  */
/* is revoked (0021 F-1).                                               */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"therapist_user_id" uuid,
	"patient_id" uuid,
	"service_id" uuid,
	"location_id" uuid,
	"actor_user_id" uuid,
	"amount_cents_gross" integer,
	"currency" char(3),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_amount_gross_nonneg" CHECK ("analytics_events"."amount_cents_gross" IS NULL OR "analytics_events"."amount_cents_gross" >= 0),
	CONSTRAINT "analytics_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "analytics_events_therapist_user_id_users_id_fk" FOREIGN KEY ("therapist_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "analytics_events_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "analytics_events_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "analytics_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "analytics_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_tenant_occurred_idx" ON "analytics_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_tenant_type_idx" ON "analytics_events" USING btree ("tenant_id","event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_tenant_therapist_idx" ON "analytics_events" USING btree ("tenant_id","therapist_user_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — append-only (SELECT + INSERT only), tenant isolation          */
/* ================================================================== */

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "analytics_events_tenant_select" ON public.analytics_events;--> statement-breakpoint
CREATE POLICY "analytics_events_tenant_select" ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

DROP POLICY IF EXISTS "analytics_events_tenant_insert" ON public.analytics_events;--> statement-breakpoint
CREATE POLICY "analytics_events_tenant_insert" ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

/* Grants. Append-only is enforced by the missing UPDATE/DELETE policies,
   NOT by grant carve-outs (see 0003_grants.sql audit_log note): keep the full
   DML grant so UPDATE/DELETE deny as 0 rows via RLS in every environment. */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_events TO authenticated;--> statement-breakpoint
GRANT ALL ON public.analytics_events TO service_role;--> statement-breakpoint
REVOKE ALL ON public.analytics_events FROM anon;

-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0035_record_annulments.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0035 — record_annulments: append-only "Anular" for signed fichas   */
/*                                                                    */
/* Wave 05 Ficha Final 2 (W5-30). A signed clinical_record is         */
/* immutable (the clinical_records BEFORE UPDATE OR DELETE trigger,    */
/* 0001) — it can never be edited or deleted. "Anular" (void) is       */
/* therefore recorded as a NEW append-only row here; the locked        */
/* record row is NEVER updated or deleted and the immutability trigger */
/* is not touched. One row per annulment (reason optional). The UI     */
/* shows the record ANULADO and hides it behind a "Mostrar anulados"   */
/* toggle.                                                             */
/*                                                                    */
/* RLS: append-only, tenant-isolated, fail-closed — mirrors            */
/* patient_note_revisions (0030) / appointment_notes (0026) /          */
/* analytics_events (0025) / audit_log (0001). Only SELECT + INSERT    */
/* policies exist, so UPDATE and DELETE are denied by RLS (0 rows, no  */
/* error). Per 0003_grants.sql's audit_log note, append-only is        */
/* enforced by the POLICY SET, not by carving UPDATE/DELETE out of the */
/* grant — the table keeps the full DML grant and the missing policies */
/* do the work. tenant_id is compared to public.jwt_tenant_id(); a     */
/* missing/invalid claim → NULL → predicate FALSE → invisible.         */
/* service_role gets ALL; anon gets nothing.                           */
/* ================================================================== */

CREATE TABLE "record_annulments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"reason" text,
	"annulled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_annulments" ADD CONSTRAINT "record_annulments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_annulments" ADD CONSTRAINT "record_annulments_record_id_clinical_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."clinical_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_annulments" ADD CONSTRAINT "record_annulments_annulled_by_user_id_users_id_fk" FOREIGN KEY ("annulled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_annulments_tenant_idx" ON "record_annulments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "record_annulments_record_idx" ON "record_annulments" USING btree ("tenant_id","record_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — append-only (SELECT + INSERT only), tenant isolation          */
/* ================================================================== */

ALTER TABLE public.record_annulments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "record_annulments_tenant_select" ON public.record_annulments;--> statement-breakpoint
CREATE POLICY "record_annulments_tenant_select" ON public.record_annulments
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

DROP POLICY IF EXISTS "record_annulments_tenant_insert" ON public.record_annulments;--> statement-breakpoint
CREATE POLICY "record_annulments_tenant_insert" ON public.record_annulments
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

/* Grants. Append-only is enforced by the missing UPDATE/DELETE policies,
   NOT by grant carve-outs (see 0003_grants.sql audit_log note): keep the full
   DML grant so UPDATE/DELETE deny as 0 rows via RLS in every environment. */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_annulments TO authenticated;--> statement-breakpoint
GRANT ALL ON public.record_annulments TO service_role;--> statement-breakpoint
REVOKE ALL ON public.record_annulments FROM anon;

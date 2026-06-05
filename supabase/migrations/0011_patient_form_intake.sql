-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0011_patient_form_intake.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

ALTER TYPE "public"."record_source" ADD VALUE 'patient';--> statement-breakpoint
CREATE TABLE "patient_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"form_key" text NOT NULL,
	"therapy" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" "record_source" NOT NULL,
	"review_state" "ai_review_state" DEFAULT 'pending_review' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_form_submissions" ADD CONSTRAINT "patient_form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_form_submissions" ADD CONSTRAINT "patient_form_submissions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_form_submissions_tenant_idx" ON "patient_form_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "patient_form_submissions_patient_idx" ON "patient_form_submissions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patient_form_submissions_tenant_review_idx" ON "patient_form_submissions" USING btree ("tenant_id","review_state");--> statement-breakpoint

/* ================================================================== */
/* RLS — patient form intake                                          */
/*                                                                    */
/* Two principals, two policy sets, never shared (mirrors 0010):      */
/*   * patient  — self-scope INSERT + SELECT of their OWN submissions, */
/*                and only in the INITIAL review state. A patient can  */
/*                never submit for another patient, cross-tenant, or   */
/*                in a finalized state (no self-finalize path).        */
/*   * authenticated (staff) — standard tenant_isolation FOR ALL, so   */
/*                the future therapist review/finalize wave can read + */
/*                process within its tenant. service_role BYPASSes.    */
/*                                                                    */
/* ENABLE (not FORCE), consistent with 0001/0010. RLS = row gate,      */
/* GRANT = table gate — both required.                                */
/*                                                                    */
/* NOTE: no policy references the new 'patient' source LABEL — using a */
/* freshly-ADDed enum value in the same migration is forbidden by      */
/* Postgres. The app tags source='patient' at insert time (committed   */
/* migration → safe). 'pending_review' is a pre-existing label, so it  */
/* is safe to reference in WITH CHECK.                                */
/* ================================================================== */

ALTER TABLE public.patient_form_submissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Patient may read only their OWN submissions (self-scope), within their tenant.
CREATE POLICY "patient_form_submissions_patient_select" ON public.patient_form_submissions
  FOR SELECT
  TO patient
  USING (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
  );
--> statement-breakpoint

-- Patient may submit ONLY as themselves, in their tenant, and ONLY in the
-- initial review state — there is no path for a patient to self-finalize.
CREATE POLICY "patient_form_submissions_patient_insert" ON public.patient_form_submissions
  FOR INSERT
  TO patient
  WITH CHECK (
    patient_id = (select public.jwt_patient_id())
    AND tenant_id = (select public.jwt_tenant_id())
    AND review_state = 'pending_review'
  );
--> statement-breakpoint

-- Staff (the future review/finalize wave) — standard tenant isolation.
CREATE POLICY "patient_form_submissions_tenant_isolation" ON public.patient_form_submissions
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
--> statement-breakpoint

-- Table gates. Patient is read+insert only (immutable submission; no UPDATE/
-- DELETE for the patient). Staff get the full set for the review wave.
GRANT SELECT, INSERT ON public.patient_form_submissions TO patient;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_form_submissions TO authenticated;
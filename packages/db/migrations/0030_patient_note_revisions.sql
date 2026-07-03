/* ================================================================== */
/* 0030 — patient_note_revisions: append-only patient-note history    */
/*                                                                    */
/* Wave 02 (DECISIONS.md 2026-07-03 "Patient notes: migration/UI       */
/* transition plan", implementing JP's 2026-07-02 full-version-history */
/* ruling). Gives a patient's free-text notes a full, immutable        */
/* version history: one row per edit, newest read first.               */
/*                                                                    */
/* This migration CREATES the relation and BACKFILLS the current       */
/* single-field `patients.notes` into it as revision 1 (author NULL =   */
/* system/backfill, no known author). It does NOT touch                */
/* `patients.notes`, drops no column, and rewires no UI — the notes UI  */
/* flip to this relation is W2-11.                                      */
/*                                                                    */
/* RLS: append-only, tenant-isolated, fail-closed — mirrors            */
/* appointment_notes (0026) / analytics_events (0025) / audit_log       */
/* (0001). Only SELECT + INSERT policies exist, so UPDATE and DELETE    */
/* are denied by RLS (0 rows, no error). Per 0003_grants.sql's          */
/* audit_log note, append-only is enforced by the POLICY SET, not by    */
/* carving UPDATE/DELETE out of the grant — so the table keeps the full */
/* DML grant and the missing policies do the work. tenant_id is         */
/* compared to public.jwt_tenant_id(); a missing/invalid claim → NULL → */
/* predicate FALSE → invisible. service_role gets ALL (0021 F-2); anon  */
/* gets nothing.                                                        */
/* ================================================================== */

CREATE TABLE "patient_note_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"content" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_note_revisions" ADD CONSTRAINT "patient_note_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_note_revisions" ADD CONSTRAINT "patient_note_revisions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_note_revisions" ADD CONSTRAINT "patient_note_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_note_revisions_history_idx" ON "patient_note_revisions" USING btree ("tenant_id","patient_id","created_at" DESC);--> statement-breakpoint

/* ================================================================== */
/* Backfill — current patients.notes → revision 1 (author NULL).       */
/* One row per patient with a non-empty note; empty/NULL notes get     */
/* zero revisions. patients.notes is left untouched.                   */
/* ================================================================== */

INSERT INTO public.patient_note_revisions (tenant_id, patient_id, content, author_user_id, created_at)
SELECT tenant_id, id, notes, NULL, now()
FROM public.patients
WHERE notes IS NOT NULL AND btrim(notes) <> '';--> statement-breakpoint

/* ================================================================== */
/* RLS — append-only (SELECT + INSERT only), tenant isolation          */
/* ================================================================== */

ALTER TABLE public.patient_note_revisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "patient_note_revisions_tenant_select" ON public.patient_note_revisions;--> statement-breakpoint
CREATE POLICY "patient_note_revisions_tenant_select" ON public.patient_note_revisions
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

DROP POLICY IF EXISTS "patient_note_revisions_tenant_insert" ON public.patient_note_revisions;--> statement-breakpoint
CREATE POLICY "patient_note_revisions_tenant_insert" ON public.patient_note_revisions
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

/* Grants. Append-only is enforced by the missing UPDATE/DELETE policies,
   NOT by grant carve-outs (see 0003_grants.sql audit_log note): keep the full
   DML grant so UPDATE/DELETE deny as 0 rows via RLS in every environment. */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_note_revisions TO authenticated;--> statement-breakpoint
GRANT ALL ON public.patient_note_revisions TO service_role;--> statement-breakpoint
REVOKE ALL ON public.patient_note_revisions FROM anon;

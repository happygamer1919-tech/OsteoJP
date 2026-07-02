/* ================================================================== */
/* 0026 — appointment_notes: per-visit notes (append-only)            */
/*                                                                    */
/* Wave 01 (SPEC-appointments.md §2 + SPEC-patients.md Fichas          */
/* relocation). A note a therapist attaches to a single appointment    */
/* (visit), tied to the patient and OPTIONALLY to the clinical episode */
/* (ficha) the visit belongs to — so the per-visit note and the ficha  */
/* are one continuity, not two disconnected things.                    */
/*                                                                    */
/* SOFT completion gate (DECISIONS.md 2026-07-01, JP ruling): an       */
/* appointment CAN be marked completed with NO note. This migration    */
/* adds NO NOT NULL / CHECK / trigger that would hard-block            */
/* completion. The absence of a note is recorded as note_present=false */
/* on the appointment_status_changed event (analytics_events, 0025) in */
/* payload — never blocked at the DB. Nothing on appointments changes. */
/*                                                                    */
/* RLS: append-only, tenant-isolated, fail-closed — mirrors            */
/* analytics_events (0025) / audit_log (0001). Only SELECT + INSERT     */
/* policies exist, so UPDATE and DELETE are denied by RLS (0 rows).    */
/* Per 0003_grants.sql's audit_log note, append-only is enforced by    */
/* the POLICY SET, not by carving UPDATE/DELETE out of the grant — so  */
/* the table keeps the full DML grant and the missing policies do the  */
/* work. tenant_id is compared to public.jwt_tenant_id(); a missing/   */
/* invalid claim → NULL → predicate FALSE → invisible. service_role    */
/* gets ALL (0021 F-2); anon gets nothing.                             */
/* ================================================================== */

CREATE TABLE "appointment_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"episode_id" uuid,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_episode_id_clinical_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."clinical_episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_notes_tenant_idx" ON "appointment_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "appointment_notes_appointment_idx" ON "appointment_notes" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_notes_patient_idx" ON "appointment_notes" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "appointment_notes_episode_idx" ON "appointment_notes" USING btree ("episode_id");--> statement-breakpoint

/* ================================================================== */
/* RLS — append-only (SELECT + INSERT only), tenant isolation          */
/* ================================================================== */

ALTER TABLE public.appointment_notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "appointment_notes_tenant_select" ON public.appointment_notes;--> statement-breakpoint
CREATE POLICY "appointment_notes_tenant_select" ON public.appointment_notes
  FOR SELECT
  TO authenticated
  USING (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

DROP POLICY IF EXISTS "appointment_notes_tenant_insert" ON public.appointment_notes;--> statement-breakpoint
CREATE POLICY "appointment_notes_tenant_insert" ON public.appointment_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));--> statement-breakpoint

/* Grants. Append-only is enforced by the missing UPDATE/DELETE policies,
   NOT by grant carve-outs (see 0003_grants.sql audit_log note): keep the full
   DML grant so UPDATE/DELETE deny as 0 rows via RLS in every environment. */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_notes TO authenticated;--> statement-breakpoint
GRANT ALL ON public.appointment_notes TO service_role;--> statement-breakpoint
REVOKE ALL ON public.appointment_notes FROM anon;

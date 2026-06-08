-- Review/finalize write path — review-audit columns on patient_form_submissions.
--
-- The staff finalize wave (review queue → locked/signed clinical_record) needs
-- to record, on the submission row itself:
--   * clinical_record_id — the draft clinical_record a patient submission is
--     materialised into when a therapist CLAIMS it (review_state pending_review
--     → in_review). Lets the queue show the outcome and makes a re-claim
--     idempotent (claim returns the existing draft rather than forking a second).
--   * reviewed_by / reviewed_at — the finalize DECISION (who approved, when),
--     distinct from the resulting clinical_record's signed_by/signed_at.
--
-- All three are NULL until the staff review path touches the row. No RLS change:
-- the columns inherit patient_form_submissions' existing policies (migration
-- 0011) — staff tenant_isolation FOR ALL writes them; the patient role has only
-- INSERT/SELECT (no UPDATE) so a patient can never self-set a finalize outcome.
-- RLS stays ENABLE (not FORCE), consistent with 0001/0010/0011.
ALTER TABLE "patient_form_submissions" ADD COLUMN "clinical_record_id" uuid;--> statement-breakpoint
ALTER TABLE "patient_form_submissions" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "patient_form_submissions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patient_form_submissions" ADD CONSTRAINT "patient_form_submissions_clinical_record_id_clinical_records_id_fk" FOREIGN KEY ("clinical_record_id") REFERENCES "public"."clinical_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_form_submissions" ADD CONSTRAINT "patient_form_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
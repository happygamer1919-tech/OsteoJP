-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0004_clinical_record_supersedes.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

ALTER TABLE "clinical_records" ADD COLUMN "supersedes_id" uuid;--> statement-breakpoint
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_supersedes_id_clinical_records_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."clinical_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinical_records_supersedes_idx" ON "clinical_records" USING btree ("supersedes_id");
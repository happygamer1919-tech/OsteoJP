-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0032_secondary_participants.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ================================================================== */
/* 0032 — secondary participants: optional 2nd patient / 2nd therapist */
/*                                                                    */
/* Wave 04 (W4-19). Adds TWO nullable FK columns to `appointments`,     */
/* carrying an OPTIONAL secondary participant pair on ONE appointment   */
/* row as de-emphasized LINKED DISPLAY data:                            */
/*   • appointments.patient_2_id       uuid NULL → patients(id)          */
/*   • appointments.practitioner_2_id  uuid NULL → users(id)             */
/*                                                                    */
/* NULL = the common case and EVERY pre-0032 row — no backfill; existing */
/* single-participant appointments stay valid and untouched. The FKs are */
/* ON DELETE NO ACTION, exactly like the primary patient_id /            */
/* practitioner_id; a bare FK does not verify tenant match, so the        */
/* secondary participant is constrained to the SAME tenant at the app     */
/* layer (runScoped), precisely as the primaries already are.             */
/*                                                                    */
/* PRIMARY-ONLY SEMANTICS: availability, the Serviço/Localização auto-     */
/* selects, analytics money attribution, the AI-recording primary pair +  */
/* idempotency key, and the Estado/lifecycle axes ALL stay on the primary */
/* pair. The secondary is display-only (appointment details + agenda       */
/* +1 badge; rendered under the PRIMARY therapist column only).            */
/*                                                                    */
/* No new table. The two columns inherit `appointments`' existing RLS      */
/* (tenant isolation, fail-closed) and table GRANTs automatically — no new */
/* policy or grant is required (same as the 0027 / 0028 column-only adds). */
/* No index: the columns are NULL-heavy and never filtered/joined on (the  */
/* appointment row is always reached by its own id / primary indexes).     */
/* ================================================================== */

ALTER TABLE "appointments" ADD COLUMN "patient_2_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "practitioner_2_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_2_id_patients_id_fk" FOREIGN KEY ("patient_2_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practitioner_2_id_users_id_fk" FOREIGN KEY ("practitioner_2_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

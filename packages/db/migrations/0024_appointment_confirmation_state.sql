/* ================================================================== */
/* 0024 — appointment confirmation state (columns-only)               */
/*                                                                    */
/* Wave 01 (SPEC-appointments.md). Adds a CONFIRMATION axis to        */
/* appointments, orthogonal to the lifecycle `status` enum and never  */
/* collapsed into it (same discipline as record_status vs             */
/* ai_review_state):                                                   */
/*   • status (appointment_status) = where the appointment is in its  */
/*     life: scheduled/confirmed/completed/cancelled/no_show.          */
/*   • confirmation_state = did the patient confirm the reminder:      */
/*     pending/confirmed/declined.                                     */
/*                                                                    */
/* Adds:                                                              */
/*   • enum appointment_confirmation_state (pending/confirmed/declined)*/
/*   • appointments.confirmation_state (that enum, NOT NULL,           */
/*     DEFAULT 'pending')                                              */
/*   • appointments.confirmation_received_at (timestamptz, nullable)   */
/*   • appointments.confirmation_channel (text, nullable — sms/        */
/*     whatsapp/phone/email/manual…; text not enum so a new channel    */
/*     never forces a migration)                                       */
/*                                                                    */
/* The lifecycle `appointment_status` enum is NOT touched. No table    */
/* is created. The new columns inherit appointments' existing RLS      */
/* (tenant isolation, fail-closed) and its table GRANTs automatically; */
/* no new policy or grant is required.                                 */
/* ================================================================== */

DO $$ BEGIN
  CREATE TYPE "public"."appointment_confirmation_state" AS ENUM('pending', 'confirmed', 'declined');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_state "public"."appointment_confirmation_state" NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_received_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_channel text;

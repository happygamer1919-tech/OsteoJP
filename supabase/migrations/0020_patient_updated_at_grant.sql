-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0020_patient_updated_at_grant.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

-- 0020 — patch patient role: add updated_at to column-level UPDATE grant
--
-- Migration 0019 granted UPDATE on (phone, address, postal_code, city,
-- reminder_sms_enabled, reminder_email_enabled) to the patient role, but
-- omitted updated_at. The patients table uses Drizzle's $onUpdate() on the
-- updatedAt column, which automatically appends "updated_at = NOW()" to
-- every UPDATE query. Without this grant the portal's profile PATCH fails
-- with PostgresError 42501 (permission denied) whenever the patient role
-- executes an UPDATE.
GRANT UPDATE (updated_at) ON public.patients TO patient;

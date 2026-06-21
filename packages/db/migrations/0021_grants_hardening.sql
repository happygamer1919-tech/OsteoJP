-- 0021 — security hardening: explicit service_role grants + revoke anon
--
-- F-2 (low): Supabase auto-applies service_role grants at project creation
--   but they are invisible in migration history and lost in a plain-Postgres
--   replay. Migration 0003 only covered tables that existed at its run time.
--   This migration adds explicit GRANT ALL TO service_role for every post-0003
--   table so coverage is auditable and survives a vanilla-Postgres dry-run.
--
-- F-1 (medium): Supabase auto-grants ALL ON every table TO anon. No application
--   path uses the anon PostgREST role — all DB access goes through DATABASE_URL
--   (postgres.js, never anon). RLS is the primary enforcement (jwt_tenant_id()
--   returns NULL for anon → fail-closed). This revoke removes the over-grant.
--   ALTER DEFAULT PRIVILEGES prevents Supabase from re-granting on new tables.
--
-- Source: docs/service-role-grants-audit-2026-06-20.md (F-1, F-2)
--         docs/anon-grants-scope-2026-06-20.md
-- Dev-validated on ufbkzbyghvxtosyrkgjq — see audit doc addendum.

-- ============================================================
-- F-2: Explicit service_role grants for post-0003 tables
-- ============================================================
GRANT ALL ON public.patient_locations        TO service_role;--> statement-breakpoint
GRANT ALL ON public.availability_templates   TO service_role;--> statement-breakpoint
GRANT ALL ON public.time_off                 TO service_role;--> statement-breakpoint
GRANT ALL ON public.service_location_prices  TO service_role;--> statement-breakpoint
GRANT ALL ON public.ai_ingestion_requests    TO service_role;--> statement-breakpoint
GRANT ALL ON public.patient_form_submissions TO service_role;--> statement-breakpoint
GRANT ALL ON public.migration_staging_rows   TO service_role;--> statement-breakpoint
GRANT ALL ON public.quick_notes              TO service_role;--> statement-breakpoint

-- ============================================================
-- F-1: Revoke over-broad anon grants on all application tables
-- ============================================================
REVOKE ALL ON public.tenants                  FROM anon;--> statement-breakpoint
REVOKE ALL ON public.roles                    FROM anon;--> statement-breakpoint
REVOKE ALL ON public.users                    FROM anon;--> statement-breakpoint
REVOKE ALL ON public.locations                FROM anon;--> statement-breakpoint
REVOKE ALL ON public.services                 FROM anon;--> statement-breakpoint
REVOKE ALL ON public.patients                 FROM anon;--> statement-breakpoint
REVOKE ALL ON public.appointments             FROM anon;--> statement-breakpoint
REVOKE ALL ON public.form_templates           FROM anon;--> statement-breakpoint
REVOKE ALL ON public.clinical_episodes        FROM anon;--> statement-breakpoint
REVOKE ALL ON public.clinical_records         FROM anon;--> statement-breakpoint
REVOKE ALL ON public.attachments              FROM anon;--> statement-breakpoint
REVOKE ALL ON public.audit_log                FROM anon;--> statement-breakpoint
REVOKE ALL ON public.invoices                 FROM anon;--> statement-breakpoint
REVOKE ALL ON public.patient_locations        FROM anon;--> statement-breakpoint
REVOKE ALL ON public.availability_templates   FROM anon;--> statement-breakpoint
REVOKE ALL ON public.time_off                 FROM anon;--> statement-breakpoint
REVOKE ALL ON public.service_location_prices  FROM anon;--> statement-breakpoint
REVOKE ALL ON public.ai_ingestion_requests    FROM anon;--> statement-breakpoint
REVOKE ALL ON public.patient_form_submissions FROM anon;--> statement-breakpoint
REVOKE ALL ON public.migration_staging_rows   FROM anon;--> statement-breakpoint
REVOKE ALL ON public.quick_notes              FROM anon;--> statement-breakpoint

-- Block Supabase from re-granting on future table creation
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

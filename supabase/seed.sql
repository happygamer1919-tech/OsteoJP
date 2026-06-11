-- OsteoJP — branch / local seed.
--
-- Runs after migrations on `supabase db reset` (local) and on every Supabase
-- preview DB branch (referenced by [db.seed] in config.toml). Keep this to
-- DETERMINISTIC, NON-CLINICAL reference data only — it lands on disposable
-- branch databases, never production.
--
-- Scope, deliberately narrow:
--   * one demo tenant
--   * its role rows (slugs must match packages/auth/permissions.ts: ROLES)
-- That is the minimum the custom_access_token_hook needs to resolve a
-- `user_role` claim once a user is linked to this tenant.
--
-- NOT seeded here (and why):
--   * auth.users / public.users rows — would require committing a known
--     credential, which we do not do in a clinical repo. Create the auth user
--     on the branch and link a public.users row to complete the login proof;
--     see docs/supabase-branching.md → "Acceptance: prove the claim flow".
--   * patients / clinical_records / any PII — out of scope and owner-gated.
--   * form templates — seeded separately by packages/db/seed/form-templates.ts.
--
-- Idempotent: safe to re-run (branch re-seeds, local resets).

-- Fixed UUID so docs and manual link steps can reference it verbatim.
insert into public.tenants (id, name, slug, nif)
values ('00000000-0000-0000-0000-0000000000a1', 'OsteoJP (preview)', 'osteojp-preview', null)
on conflict (id) do nothing;

-- Same canonical set the runtime tenant-create path seeds (packages/db/seed/
-- roles.ts → CANONICAL_ROLES). Keep slug/name/description in sync with it.
insert into public.roles (tenant_id, slug, name, description)
values
  ('00000000-0000-0000-0000-0000000000a1', 'owner',      'Owner',        'Full access across the tenant.'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin',      'Admin',        'Tenant administration; no privilege escalation.'),
  ('00000000-0000-0000-0000-0000000000a1', 'therapist',  'Therapist',    'Clinical records for own patients.'),
  ('00000000-0000-0000-0000-0000000000a1', 'reception',  'Receptionist', 'Scheduling and invoicing; no clinical access.')
on conflict (tenant_id, slug) do nothing;

/* ================================================================== */
/* service_role DML grants — local/CI parity with production          */
/* ================================================================== */
--
-- WHY THIS EXISTS (added 2026-06-11)
--   Supabase CLI v2.106.0 stopped auto-exposing new `public` schema objects:
--   local start / db reset no longer applies the platform's default Data API
--   privileges, so tables created by migrations get NO implicit grants for
--   service_role. Our migrations explicitly grant `authenticated`
--   (0003 + per-table) but never granted `service_role` — it rode entirely on
--   those default ACLs. Result: under CLI >= 2.106 the sanctioned-bypass test
--   (ai-ingestion-rls-isolation.test.ts: "service_role write into another
--   tenant SUCCEEDS") fails with `permission denied for table
--   ai_ingestion_requests` before BYPASSRLS is even reached. RLS = row gate,
--   GRANT = table gate; service_role lost the table gate.
--
--   PRODUCTION is unaffected: the existing project (jaxmkwoxjcgzkwxgbayx)
--   keeps its grandfathered default privileges, where service_role has full
--   DML on public tables. These grants restore exactly that state on the
--   disposable local/CI/branch databases this file seeds — parity with prod,
--   no privilege beyond what prod already gives the role.
--
--   Seed (not migration) is deliberate: migration 0014 is owned by the
--   in-flight PR #166, and seed.sql runs AFTER all migrations on every
--   `supabase db reset`, so these blanket grants also cover tables added by
--   future migrations. FOLLOW-UP: once migration ownership frees up, move
--   explicit service_role grants into a migration (Supabase's recommended
--   durable path) and drop this block.
--
--   Idempotent and a no-op on stacks where the default ACLs still apply.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

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

insert into public.roles (tenant_id, slug, name, description)
values
  ('00000000-0000-0000-0000-0000000000a1', 'owner',      'Owner',        'Full access across the tenant.'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin',      'Admin',        'Tenant administration; no privilege escalation.'),
  ('00000000-0000-0000-0000-0000000000a1', 'therapist',  'Therapist',    'Clinical records for own patients.'),
  ('00000000-0000-0000-0000-0000000000a1', 'reception',  'Receptionist', 'Scheduling and invoicing; no clinical access.')
on conflict (tenant_id, slug) do nothing;

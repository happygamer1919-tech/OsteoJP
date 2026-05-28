# Supabase dev setup

One-time manual steps to bring a fresh Supabase project up to where the
OsteoJP code can connect to it, plus the SQL test that proves RLS, GRANTs,
and the per-request claim flow work end-to-end.

Reproducible: if the dev project is ever rebuilt, follow this top to bottom.

---

## 1. Project + region

- Create the Supabase project in **EU (Frankfurt)** — data residency
  requirement for clinical data (CLAUDE.md → Hard rule 8).
- Note the project ref (Dashboard → Project Settings → General →
  Reference ID). Used as `<project-ref>` below — keep it out of commits.

## 2. Get DATABASE_URL

Dashboard → **Project Settings → Database → Connection string → URI**.

Two URIs matter; both go in local `.env`, never in commits:

- **Connection pooler (transaction mode, port 6543)** — runtime path.
  Used by `packages/db` (postgres.js + drizzle) at request time. `SET LOCAL`
  and `set_config(..., true)` are transaction-scoped, so the transaction
  pooler is the correct mode here.
  ```
  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
  ```
- **Direct connection (port 5432)** — migrations path.
  Used by `pnpm db:migrate` (`drizzle-kit migrate`). drizzle-kit takes
  session-level advisory locks, which the transaction pooler does not
  support — migrations must hit the direct endpoint.
  ```
  postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
  ```

Local convention: put the pooled URI under `DATABASE_URL` and the direct
URI under `DATABASE_URL_DIRECT`. Wire `drizzle.config.ts` to read
`DATABASE_URL_DIRECT` for migrations.

## 3. Enable the Custom Access Token hook

Dashboard → **Authentication → Hooks → Customize Access Token (Auth Hook)**
→ pick `public.custom_access_token_hook` → **Save**.

The function already exists (created by `0002_auth_token_hook.sql`); the
toggle is what wires it into the auth pipeline. Without it the function
runs against nothing and every JWT comes out without the `tenant_id` /
`user_role` claims, so `withTenantContext` would set claims that aren't
backed by an issued token in production traffic.

## 4. Apply migrations

```bash
# .env: DATABASE_URL_DIRECT=postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres
pnpm db:migrate
```

Runs, in order:
1. `0000_empty_runaways.sql` — schema (13 tables, enums, indexes, FKs).
2. `0001_rls.sql` — RLS policies + immutability trigger + helper fns.
3. `0002_auth_token_hook.sql` — `custom_access_token_hook` + grants/policies.

Confirm with `pnpm db:check` (no DB required — just inspects local
migration files for consistency).

## 5. Verify RLS + GRANTs end-to-end

This is the gating check. Run the block below in **Dashboard → SQL Editor**
(connects as `postgres`, which has BYPASSRLS — exactly what we want for
seeding the two tenants before dropping privileges).

The whole block is wrapped in `BEGIN; ... ROLLBACK;` so nothing persists.
Placeholder UUIDs are used; the real check is that each step's expected
result line matches what the SQL Editor prints.

```sql
BEGIN;

-- ── Step 1: seed two tenants as postgres (still BYPASSRLS) ──────────
INSERT INTO public.tenants (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b');
-- expect: INSERT 0 2

-- ── Step 2: drop to authenticated — RLS now enforces ───────────────
SET LOCAL ROLE authenticated;
-- expect: SET

-- ── Step 3: claim tenant A ─────────────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","user_role":"therapist"}',
  true
);
-- expect: one row, set_config = the JSON payload

-- ── Step 4: insert a patient under tenant A ────────────────────────
INSERT INTO public.patients (tenant_id, full_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Patient A1');
-- expect: INSERT 0 1
-- failure mode: ERROR "permission denied for table patients"
--   → authenticated is missing GRANTs (see Failure modes below).

-- ── Step 5: tenant A sees its own row ──────────────────────────────
SELECT count(*) AS visible_to_a FROM public.patients;
-- expect: visible_to_a = 1

-- ── Step 6: switch claims to tenant B ──────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"tenant_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","user_role":"therapist"}',
  true
);
-- expect: one row, set_config = the new JSON payload

-- ── Step 7: tenant B cannot see tenant A's row (RLS read isolation) ─
SELECT count(*) AS visible_to_b FROM public.patients;
-- expect: visible_to_b = 0
-- failure mode: any non-zero count → tenant SELECT policy broken.

-- ── Step 8: cross-tenant INSERT must be rejected (WITH CHECK) ──────
-- Wrap in a savepoint so the rest of the transaction stays usable
-- even though the INSERT must error.
SAVEPOINT before_cross_tenant;
INSERT INTO public.patients (tenant_id, full_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cross-tenant smuggle attempt');
-- expect: ERROR
--   new row violates row-level security policy for table "patients"
-- failure mode: no error → WITH CHECK missing on patients_tenant_isolation.
ROLLBACK TO SAVEPOINT before_cross_tenant;

-- ── Step 9: discard everything ─────────────────────────────────────
ROLLBACK;
-- expect: ROLLBACK
```

All nine expected signals matching = RLS, GRANTs on `authenticated`, the
JWT claim helpers (`public.jwt_tenant_id` / `public.jwt_role`), and the
`tenants` + `patients` tenant-isolation policies all work end-to-end.

## 6. Failure modes

- **`ERROR: permission denied for table patients`** (or any other table)
  during step 4 or step 7 → `authenticated` doesn't hold the DML grant.
  Migrations don't grant table privileges to `authenticated` today, and
  Supabase's defaults can shift. Fix with a small `0003_grants.sql`:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO authenticated;
  -- audit_log: SELECT/INSERT only — RLS policies already deny UPD/DEL.
  ```
  Re-run the verification block after applying.

- **Step 7 returns > 0** → the `*_tenant_isolation` USING expression isn't
  filtering. Check `0001_rls.sql:81–148`, confirm `tenant_id =
  (select public.jwt_tenant_id())` is present on the table that leaked,
  and that RLS is actually enabled on it (`SELECT relrowsecurity FROM
  pg_class WHERE relname = '<table>';` should be `t`).

- **Step 8 does NOT error** → `WITH CHECK` is missing or wrong on the
  patients policy, OR the connecting role still has BYPASSRLS. Verify
  `SET LOCAL ROLE authenticated` actually took effect with
  `SELECT current_user;` immediately before the insert (expect
  `authenticated`, not `postgres`).

- **`role "authenticated" does not exist`** during step 2 → the project
  isn't a Supabase project, or the auth roles weren't initialized.
  Supabase creates `anon`, `authenticated`, `service_role`, and
  `supabase_auth_admin` automatically on project creation.

- **Issued JWTs in production have no `tenant_id` / `user_role` claims**
  → the Custom Access Token hook is created but not enabled (step 3 was
  skipped). Toggle it in the dashboard; existing tokens stay claim-less
  until they refresh.

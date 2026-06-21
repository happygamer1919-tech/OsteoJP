# Anon Grants Scope Audit — 2026-06-20

**Branch:** `chore/anon-grants-scope`  
**Scope:** DOCUMENTATION ONLY — no migration applied, no prod change.  
**Follow-up to:** F-1 in `docs/service-role-grants-audit-2026-06-20.md`  
**Status:** DRAFT — verify on a Supabase branch before prod apply.

---

## Background

Supabase auto-grants `ALL` privileges on every table to the `anon` PostgreSQL role at project creation time. The `anon` role is used by PostgREST for unauthenticated REST API requests to `https://<project>.supabase.co/rest/v1/<table>`.

All 19 production tables currently carry `GRANT ALL ON public.<table> TO anon` even though no part of this application ever makes unauthenticated PostgREST table queries. This audit determines which grants (if any) must be kept and which are safe to revoke.

---

## Architecture: How the `anon` Role Reaches the Database

```
Browser / client
    │
    ├── supabase.auth.*()       →  Supabase Auth API (/auth/v1/...)
    │                               ↳ NOT PostgREST; never hits anon role on tables
    │
    ├── fetch(apiBase + "/api/v1/...")
    │       └── apps/api (Next.js)  →  withPatientContext() → SET LOCAL ROLE patient
    │                               ↳ postgres.js via DATABASE_URL (never anon)
    │
    └── apps/web / apps/admin  →  withTenantContext() → SET LOCAL ROLE authenticated
                                   ↳ postgres.js via DATABASE_URL (never anon)

PostgREST (rest/v1/<table>)         ← anon role used HERE for unauthenticated calls
    ↑
    No application code reaches this path.
```

**Key facts:**
- All application DB access goes through `DATABASE_URL` (postgres.js), which connects as the database owner (`postgres`/`supabase_admin`). The `anon` role is never involved.
- `supabase.auth.*` calls hit the Supabase Auth API endpoint (`/auth/v1`), not PostgREST. No table DML.
- PostgREST is only reached if client code calls `supabase.from('<table>')` directly — which no app in this repo does for application tables.
- Even if a caller did reach PostgREST as `anon`, RLS would fail-closed: `jwt_tenant_id()` returns `NULL` for unauthenticated requests, and every tenant isolation policy uses `tenant_id = jwt_tenant_id()`, rejecting all rows.

---

## Public / Unauthenticated Path Inventory

Every no-auth path was traced to its DB access pattern.

### apps/portal (`apps/portal/proxy.ts`)

Public paths that bypass the session redirect middleware:

| Path | Handler | DB access via `anon`? |
|------|---------|----------------------|
| `/auth/login` | `supabase.auth.signInWithPassword()` / `signInWithOtp()` | **No** — Auth API only |
| `/auth/activate` | `supabase.auth.getUser()` | **No** — Auth API only |
| `/auth/reset-password` | `supabase.auth.resetPasswordForEmail()` | **No** — Auth API only |
| `/auth/callback` | `supabase.auth.exchangeCodeForSession()` | **No** — Auth API only |
| `/portal/clinics` | Static component, hardcoded constants | **No** — zero DB queries |

`/portal/clinics` (`apps/portal/app/portal/clinics/page.tsx`) renders entirely from hardcoded TypeScript constants (clinic names, addresses, phone numbers). It makes no DB queries of any kind.

### apps/web (`apps/web/proxy.ts` middleware exclusions)

Paths excluded from the staff session middleware:

| Path | Auth mechanism | DB access via `anon`? |
|------|---------------|----------------------|
| `/api/inngest` | Inngest signing key (`x-inngest-signature`) | **No** — Inngest serve endpoint only |
| `/api/v1/ingestion` | HMAC (`x-ingestion-key`) | **No** — uses `getDbAdmin()` (postgres role) |
| `/api/webhooks/ifthenpay` | Anti-phishing key header | **No** — fires Inngest event, no direct DB |
| `/api/v1/integrations/stripe/webhook` | Stripe signature verification | **No** — fires Inngest event, no direct DB |
| `/api/health` | None (public health check) | **No** — returns `{status:"ok"}`, no DB |

### apps/api

All patient-facing API endpoints are gated by `requirePatient()` (`apps/api/lib/auth/patient.ts`), which parses the Bearer token or session cookie and throws `UNAUTHENTICATED` before any DB call if no valid patient JWT is present. No endpoint in `apps/api` is publicly accessible without authentication.

### Summary

**Zero tables are read via the `anon` PostgreSQL role by any public or unauthenticated path in this application.** All unauthenticated interactions are limited to Supabase Auth API calls (which never touch the `anon` role on application tables) and one fully static page with no DB queries.

---

## Keep / Revoke Decision Per Table

RLS fail-close applies to all tables regardless — `jwt_tenant_id()` returns `NULL` for anon → all tenant policies return false → zero rows accessible. The revoke is belt-and-suspenders on top of RLS.

### Production Tables (19)

| Table | Anon reads required? | Anon writes required? | Decision |
|-------|---------------------|-----------------------|----------|
| `tenants` | No | No | **REVOKE ALL** |
| `roles` | No | No | **REVOKE ALL** |
| `users` | No | No | **REVOKE ALL** |
| `locations` | No | No | **REVOKE ALL** |
| `services` | No | No | **REVOKE ALL** |
| `service_location_prices` | No | No | **REVOKE ALL** |
| `patients` | No | No | **REVOKE ALL** |
| `patient_locations` | No | No | **REVOKE ALL** |
| `appointments` | No | No | **REVOKE ALL** |
| `availability_templates` | No | No | **REVOKE ALL** |
| `time_off` | No | No | **REVOKE ALL** |
| `form_templates` | No | No | **REVOKE ALL** |
| `clinical_episodes` | No | No | **REVOKE ALL** |
| `clinical_records` | No | No | **REVOKE ALL** |
| `attachments` | No | No | **REVOKE ALL** |
| `ai_ingestion_requests` | No | No | **REVOKE ALL** |
| `audit_log` | No | No | **REVOKE ALL** |
| `invoices` | No | No | **REVOKE ALL** |
| `patient_form_submissions` | No | No | **REVOKE ALL** |

### Pending Tables (not yet in prod)

| Table | Migration | Decision when applied |
|-------|-----------|----------------------|
| `migration_staging_rows` | 0014 | **REVOKE ALL** (include in same migration) |
| `quick_notes` | 0018 | **REVOKE ALL** (include in same migration) |

### Features That Could Introduce an `anon` Requirement in Future

None currently planned. If any of the following is added, re-evaluate before shipping:

- **Supabase Realtime** subscriptions from unauthenticated clients (not implemented; would need anon SELECT on targeted tables + matching RLS policy)
- **pg_graphql** public queries (not enabled; same pattern as Realtime)
- **Public booking catalog** served directly from PostgREST (current design proxies through `apps/api` with auth — if moved to direct PostgREST, catalog tables would need anon SELECT)

---

## Draft Revoke Migration

> **DRAFT — do NOT apply directly to prod.**  
> Verify on a Supabase branch (`supabase branches create anon-revoke-verify`) before applying to production. Confirm PostgREST schema cache reload is not needed (the cache reloads automatically on DDL changes).

```sql
-- ============================================================
-- DRAFT: Revoke anon grants on all application tables
-- Migration: 00XX_revoke_anon_grants.sql
--
-- Context: Supabase auto-grants ALL to anon at project creation.
-- No application path uses the anon PostgREST role for table DML.
-- All DB access goes through DATABASE_URL (postgres.js, never anon).
-- RLS already fails-closed for anon (jwt_tenant_id() → NULL).
-- This revoke is defence-in-depth eliminating the over-grant.
--
-- Verify on a Supabase branch before applying to prod.
-- ============================================================

-- Production tables (19)
REVOKE ALL ON public.tenants                   FROM anon;
REVOKE ALL ON public.roles                     FROM anon;
REVOKE ALL ON public.users                     FROM anon;
REVOKE ALL ON public.locations                 FROM anon;
REVOKE ALL ON public.services                  FROM anon;
REVOKE ALL ON public.service_location_prices   FROM anon;
REVOKE ALL ON public.patients                  FROM anon;
REVOKE ALL ON public.patient_locations         FROM anon;
REVOKE ALL ON public.appointments              FROM anon;
REVOKE ALL ON public.availability_templates    FROM anon;
REVOKE ALL ON public.time_off                  FROM anon;
REVOKE ALL ON public.form_templates            FROM anon;
REVOKE ALL ON public.clinical_episodes         FROM anon;
REVOKE ALL ON public.clinical_records          FROM anon;
REVOKE ALL ON public.attachments               FROM anon;
REVOKE ALL ON public.ai_ingestion_requests     FROM anon;
REVOKE ALL ON public.audit_log                 FROM anon;
REVOKE ALL ON public.invoices                  FROM anon;
REVOKE ALL ON public.patient_form_submissions  FROM anon;

-- Pending tables (applied when migrations 0014 / 0018 land in prod)
-- REVOKE ALL ON public.migration_staging_rows FROM anon;
-- REVOKE ALL ON public.quick_notes            FROM anon;

-- Revoke default future-table grants to prevent Supabase re-granting
-- on subsequent table creation (run once per schema):
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
```

### Smoke-test Checklist (Supabase branch)

Run these against the branch after applying the migration. All should return errors or empty results — **not data**.

```bash
# Attempt unauthenticated PostgREST read on each table — expect 401 or empty
curl -s "$SUPABASE_URL/rest/v1/tenants?select=id" \
  -H "apikey: $SUPABASE_ANON_KEY" | jq .

curl -s "$SUPABASE_URL/rest/v1/patients?select=id" \
  -H "apikey: $SUPABASE_ANON_KEY" | jq .

curl -s "$SUPABASE_URL/rest/v1/clinical_records?select=id" \
  -H "apikey: $SUPABASE_ANON_KEY" | jq .

# Auth flows must still work (these hit Auth API, not PostgREST):
# - Sign in / magic link / OTP
# - Session exchange / callback
# Portal /clinics page must render (static, no DB).
```

Expected: all PostgREST table queries return `{"message":"permission denied for table <name>","code":"42501"}` or `[]` (if RLS policy returns false before the grant check).

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Supabase internal feature relies on anon table access | Low | Medium | Check Supabase changelog before applying; test Realtime/graphql on branch |
| Future dev adds PostgREST public query without restoring grant | Low | Low | RLS still blocks; grant revoke surfaces the missing grant explicitly at dev time |
| `ALTER DEFAULT PRIVILEGES` blocks a new table add | Low | Low | New table add will require explicit grant to authenticated/patient — which is correct |

**Residual risk after revoke:** Negligible. RLS was already the primary enforcement layer; this removes a redundant but incorrect grant.

---

## References

- `docs/service-role-grants-audit-2026-06-20.md` — F-1 (anon over-grants finding)
- `packages/db/migrations/0001_rls.sql` — RLS enablement
- `packages/db/migrations/0003_grants.sql` — authenticated/patient grants
- `packages/db/src/schema.ts` — canonical table list
- `apps/portal/proxy.ts` — portal public path definitions
- `apps/web/proxy.ts` — staff app middleware exclusions
- `apps/api/lib/auth/patient.ts` — patient auth gate

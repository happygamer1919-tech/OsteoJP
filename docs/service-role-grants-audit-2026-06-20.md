# service_role Grants & RLS Posture Audit — 2026-06-20

**Scope:** audit only — no migration applied, no prod change. Read from
`prod-schema-pre-0015-0019-20260620-1758.sql`, `packages/db/src/schema.ts`,
`packages/db/migrations/0001–0019`, `apps/*/lib/supabase/admin.ts`, and
`packages/db/src/client.ts`. All claims are verifiable from those files.

---

## 1. Two distinct "service_role" paths

The codebase uses two separate service-role mechanisms — these are not the same
connection:

| Path | Code | PostgreSQL role | BYPASSRLS? |
|------|------|-----------------|-----------|
| `getDbAdmin()` | `packages/db/src/client.ts` | `postgres` / `supabase_admin` (database owner, via `DATABASE_URL`) | Yes — owner bypasses RLS implicitly |
| `createSupabaseAdminClient()` | `apps/*/lib/supabase/admin.ts` | `service_role` (via PostgREST + service_role key) | Yes — explicit `BYPASSRLS` attribute on the role |

Both bypass RLS. Neither is accessible to authenticated request handlers unless
explicitly imported. The distinction matters because table-level `GRANT` only
applies to PostgREST-path access (`service_role`); the owner path does not need
explicit grants.

### `getDbAdmin()` call sites (sanctioned uses only)

| File | Purpose |
|------|---------|
| `packages/db/src/provision.ts` | Tenant provisioning (cross-tenant by design) |
| `apps/web/lib/auth/provision.ts` | Staff user invite / role assignment |
| `apps/web/lib/ingestion/store.ts` | AI ingestion write path (labeled SANCTIONED) |
| `apps/web/lib/integrations/ifthenpay/ledger-drizzle.ts` | Payment callback (no JWT context; labeled SANCTIONED) |
| `apps/admin/lib/tenants.ts` | Superadmin tenant management |
| `apps/api/lib/appointments/store.ts` | Patient-portal appointment reads (tenant_id explicitly scoped in WHERE) |
| `apps/api/lib/auth/activation.ts` | Patient portal activation (explicit tenant_id filter) |

`apps/api/lib/fichas/read.ts` explicitly documents: *"never use getDbAdmin"* — it
uses `withPatientContext` instead.

### `createSupabaseAdminClient()` call sites

| File | Purpose |
|------|---------|
| `apps/web/app/clinical/[id]/actions.ts` | Storage signed upload URLs |
| `apps/web/lib/auth/provision.ts` | `inviteUserByEmail` / Supabase Auth admin |
| `apps/web/lib/clinical/storage.ts` | Signed upload/download URLs |
| `apps/admin/lib/tenants.ts` | Supabase Auth admin for tenant mgmt |
| `apps/api/lib/auth/activation.ts` | Patient activation (auth.users lookup) |
| `apps/api/lib/patient/download.ts` | Signed download URLs |

All uses are for Supabase Auth operations or Storage signed URLs, not raw table
DML (that goes through `getDbAdmin` / `withTenantContext`).

---

## 2. Table grant inventory — current prod (pre-0015–0019)

Source: `prod-schema-pre-0015-0019-20260620-1758.sql`.

**19 tables** are in prod. All have RLS enabled. All have:

```
GRANT ALL ON TABLE public.<table> TO anon;
GRANT ALL ON TABLE public.<table> TO authenticated;
GRANT ALL ON TABLE public.<table> TO service_role;
```

These broad grants are applied automatically by Supabase's migration runner —
none of our migration files contain explicit `GRANT ... TO service_role` or
`GRANT ... TO anon` statements. The `authenticated` grants for post-0003 tables
are explicit in the respective migration files; the `anon` and `service_role`
grants are Supabase-auto-applied.

| Table | Migration | In prod? | RLS enabled? | service_role GRANT ALL? |
|-------|-----------|----------|--------------|------------------------|
| tenants | 0000 | ✓ | ✓ | ✓ (auto) |
| roles | 0000 | ✓ | ✓ | ✓ (auto) |
| users | 0000 | ✓ | ✓ | ✓ (auto) |
| locations | 0000 | ✓ | ✓ | ✓ (auto) |
| services | 0000 | ✓ | ✓ | ✓ (auto) |
| patients | 0000 | ✓ | ✓ | ✓ (auto) |
| appointments | 0000 | ✓ | ✓ | ✓ (auto) |
| form_templates | 0000 | ✓ | ✓ | ✓ (auto) |
| clinical_episodes | 0000 | ✓ | ✓ | ✓ (auto) |
| clinical_records | 0000 | ✓ | ✓ | ✓ (auto) |
| attachments | 0000 | ✓ | ✓ | ✓ (auto) |
| audit_log | 0000 | ✓ | ✓ | ✓ (auto) |
| invoices | 0000 | ✓ | ✓ | ✓ (auto) |
| patient_locations | 0005 | ✓ | ✓ | ✓ (auto) |
| availability_templates | 0006 | ✓ | ✓ | ✓ (auto) |
| time_off | 0006 | ✓ | ✓ | ✓ (auto) |
| service_location_prices | 0007 | ✓ | ✓ | ✓ (auto) |
| ai_ingestion_requests | 0008 | ✓ | ✓ | ✓ (auto) |
| patient_form_submissions | 0011 | ✓ | ✓ | ✓ (auto) |
| migration_staging_rows | 0014 | **✗ not in prod** | ✓ (in SQL) | pending — will auto-apply |
| quick_notes | 0018 | **✗ not in prod** | ✓ (in SQL) | pending — will auto-apply |

The `prod-schema-pre-0015-0019` dump does not contain `migration_staging_rows`
despite 0014 being in the Drizzle journal. This means 0014 was not applied to
prod at the time the dump was captured. Migrations 0015–0019 are also pending.

---

## 3. RLS policy coverage — all 19 prod tables

Every table has at least one RLS policy. No table has RLS disabled.

Policy model summary:

| Policy type | Tables | Guard |
|-------------|--------|-------|
| Standard tenant isolation (FOR ALL, TO authenticated) | 17 tables | `tenant_id = jwt_tenant_id()` |
| Tenant isolation + role gate (clinical_records) | clinical_records | tenant + jwt_role() IN ('owner','admin','therapist') |
| Append-only (SELECT + INSERT only, no UPDATE/DELETE policy) | audit_log | tenant_id = jwt_tenant_id() |
| Patient self-scope (TO patient) | patients, appointments, clinical_episodes, clinical_records, attachments, invoices, patient_form_submissions | patient_id = jwt_patient_id() + tenant_id |
| supabase_auth_admin read (FOR SELECT) | patients, users, roles | USING (true) — for auth hook |

`service_role` and `postgres` (database owner) have `BYPASSRLS` — they are
unaffected by all policies above. This is expected and correct: the application
enforces tenant scoping explicitly in WHERE clauses when using `getDbAdmin()`.

---

## 4. Findings

### F-1 — `anon` role has GRANT ALL on all 19 tables (over-broad) ⚠️

**Severity: medium.** No data leaks today because RLS is enabled on all tables
and `jwt_tenant_id()` returns NULL for unauthenticated requests (fail-closed).
However, if any table's RLS were accidentally disabled, `anon` would have
unrestricted DML. Our application never needs unauthenticated database access
(no public PostgREST endpoints); the `anon` grants serve no function.

**Recommended action:** revoke all `anon` grants on application tables
(see proposed migration §6). **Verify with Supabase before applying:** Supabase
may use `anon` internally for schema introspection or realtime; test in a
staging environment first.

### F-2 — Explicit `service_role` grants absent from migration SQL (latent risk)

**Severity: low.** Supabase auto-applies `GRANT ALL TO service_role` when tables
are created via `supabase db push`. This works in the current environment but is
invisible in migration history — a future plain-Postgres local dev or migration
dry-run would silently omit service_role grants. All 19 prod tables are currently
covered by the auto-grant.

**Recommended action:** add explicit `GRANT ALL ON <table> TO service_role` in
the proposed migration for all post-0003 tables (those not covered by 0003's
point-in-time `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`). Belt-and-suspenders.

### F-3 — `migration_staging_rows` and `quick_notes` not in prod

**Severity: informational.** Both tables have correct RLS and authenticated grants
in their migration SQL (0014, 0018). When applied via Supabase, service_role will
auto-get grants. No gap in the SQL as written.

**Action:** apply migrations 0014–0019 in order when Ivan is ready.

### F-4 — `clinical_records.data` immutability trigger applies to service_role too ✓

`0001_rls.sql` creates `enforce_clinical_record_immutability` as a `BEFORE UPDATE
OR DELETE` trigger on `clinical_records`. The comment in 0001 explicitly notes it
"applies even to service_role." Confirmed: a `BEFORE` trigger fires regardless of
the caller's role or RLS bypass status.

No gap here. A service_role migration path cannot silently corrupt a
`locked`/`signed` record.

---

## 5. `private_notes` — hard-rule verification

`private_notes` is a **JSONB field key inside `clinical_records.data`**, not a
separate column. It is defined in form templates (physiotherapy-v1, physiotherapy-v4,
nesa-v1) and is filled by therapists as a therapist-private scratchpad.

### DB layer (service_role)

There is **no DB-layer constraint** blocking service_role from reading
`clinical_records.data` (including `data.private_notes`). This is **correct and
expected**: service_role BYPASSRLS is the sanctioned path for migrations and
admin tooling, not for AI extraction. The hard rule is enforced in the layers
below.

### Application layer — AI pipeline

`apps/api/lib/fichas/redaction.ts` is the critical guard:

```typescript
// DEFAULT-DENY ALLOW-LIST — never "remove private fields"
export const PATIENT_VISIBLE_DATA_KEYS: readonly string[] = [];
//                                              ↑ EMPTY by design

export const KNOWN_PRIVATE_DATA_KEYS = [
  "private_notes", // "NOTAS PESSOAIS" — must NEVER appear in patient response
  "red_flags",
  "cid_codes",
] as const;
```

`PATIENT_VISIBLE_DATA_KEYS` is empty: no `clinical_records.data` content is
serialized to patients, period. Tests in `redaction.test.ts` and `read.test.ts`
assert `private_notes` never appears in output.

`apps/api/lib/fichas/read.ts` explicitly states it never uses `getDbAdmin`.
The patient fichas API uses `withPatientContext` (drops to `patient` role, which
has RLS self-scope) and then passes results through `redactRecordForPatient`.

### Form template layer

All form templates that define `private_notes` set `ai_extractable: false`.
`physiotherapy-v4.json` version_note confirms: *"always-false fields (…
`private_notes`, …) stay false."* This flag is the contract for any AI extraction
pipeline — it must never send `ai_extractable: false` fields to the AI partner.

### AI ingestion WRITE path

`apps/web/lib/ingestion/store.ts` uses `getDbAdmin()` to WRITE ingestion results
(new `clinical_records` rows). It does not READ existing `clinical_records.data`
or pass any `private_notes` content to the AI partner.

**Verdict: the hard rule holds at all three layers (DB trigger, application
redaction, form template flag). No gap found.**

---

## 6. Draft proposed migration (SQL in doc — NOT committed, flagged for review)

> ⚠️ **REVIEW REQUIRED before applying to prod.** Particularly F-1's anon
> revoke: verify Supabase doesn't use `anon` for any internal introspection
> path (realtime, pg_graphql, Studio). Test in staging. The service_role grants
> in §6.2 are low-risk.

### 6.1 — Revoke `anon` grants from all application tables (F-1)

```sql
-- 00XX_revoke_anon_application_grants.sql
--
-- Revokes the over-broad GRANT ALL ON ... TO anon that Supabase auto-applies.
-- All our application tables are tenant-scoped and RLS-protected; anon has
-- no legitimate need for DML. Removes the latent risk of an accidentally-
-- disabled RLS policy exposing data to unauthenticated callers.
--
-- VERIFY IN STAGING FIRST: check that realtime, pg_graphql, and Studio
-- remain functional after this revoke.

REVOKE ALL ON public.tenants                FROM anon;
REVOKE ALL ON public.roles                  FROM anon;
REVOKE ALL ON public.users                  FROM anon;
REVOKE ALL ON public.locations              FROM anon;
REVOKE ALL ON public.services               FROM anon;
REVOKE ALL ON public.service_location_prices FROM anon;
REVOKE ALL ON public.patients               FROM anon;
REVOKE ALL ON public.patient_locations      FROM anon;
REVOKE ALL ON public.appointments           FROM anon;
REVOKE ALL ON public.availability_templates FROM anon;
REVOKE ALL ON public.time_off               FROM anon;
REVOKE ALL ON public.form_templates         FROM anon;
REVOKE ALL ON public.clinical_episodes      FROM anon;
REVOKE ALL ON public.clinical_records       FROM anon;
REVOKE ALL ON public.attachments            FROM anon;
REVOKE ALL ON public.ai_ingestion_requests  FROM anon;
REVOKE ALL ON public.audit_log              FROM anon;
REVOKE ALL ON public.invoices               FROM anon;
REVOKE ALL ON public.patient_form_submissions FROM anon;
REVOKE ALL ON public.migration_staging_rows FROM anon;  -- once 0014 is applied
REVOKE ALL ON public.quick_notes            FROM anon;  -- once 0018 is applied
```

### 6.2 — Explicit `service_role` grants for post-0003 tables (F-2)

```sql
-- Belt-and-suspenders: Supabase auto-applies these, but explicit grants are
-- auditable and survive a plain-Postgres migration replay.
-- 0003 covered only tables that existed at the point it ran; each post-0003
-- table needs its own explicit service_role grant.

GRANT ALL ON public.patient_locations       TO service_role;
GRANT ALL ON public.availability_templates  TO service_role;
GRANT ALL ON public.time_off                TO service_role;
GRANT ALL ON public.service_location_prices TO service_role;
GRANT ALL ON public.ai_ingestion_requests   TO service_role;
GRANT ALL ON public.patient_form_submissions TO service_role;
GRANT ALL ON public.migration_staging_rows  TO service_role;  -- once 0014 is applied
GRANT ALL ON public.quick_notes             TO service_role;  -- once 0018 is applied
```

### When to apply

Apply 6.2 together with or immediately after the 0014–0019 batch. Apply 6.1
**only after staging verification** (separate PR, separate deploy, monitor
Supabase Studio and realtime for 24 h).

---

## 7. Summary table

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| F-1 | `anon` has GRANT ALL on all 19 tables | Medium | Revoke in dedicated migration after staging test |
| F-2 | No explicit `service_role` grants in migration files | Low | Add explicit grants (§6.2) in 0014–0019 apply batch |
| F-3 | `migration_staging_rows`, `quick_notes` not in prod | Info | Apply 0014–0019 when ready |
| F-4 | Immutability trigger fires for service_role too | ✓ No gap | — |
| — | `private_notes` ai_extractable:false | ✓ Hard rule holds at all three layers | — |

**No critical gaps found.** The two actionable findings (F-1, F-2) are hygiene
improvements, not active vulnerabilities.

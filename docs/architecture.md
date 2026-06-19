# Architecture — OsteoJP Platform

> Engineering overview of the OsteoJP unified clinic platform. Single source of truth for system shape, stack, data model summary, permission model, key flows, CI gates, integration map, and deployment topology.
>
> Companion documents: [`mega-plan.md`](./mega-plan.md) (task plan), [`claude-md-reference.md`](./claude-md-reference.md) (architectural rules), [`tech-stack.md`](./tech-stack.md), [`handoff-brief.md`](./handoff-brief.md).
>
> Schema is the authoritative source for table shape — not this doc. See `packages/db/src/schema.ts`.

---

## 1. Overview

OsteoJP is a Portuguese osteopathy and physiotherapy clinic with locations in Linda-a-Velha, Castelo Branco, and Montemor-o-Novo (opening). The platform replaces two legacy systems — Fisiozero (clinical) and Stylus.pt (scheduling) — with a single multi-tenant application covering scheduling, patient records, clinical forms, invoicing, and payments. Multi-tenant from day 1 to support a future licensing path beyond OsteoJP.

The platform is API-first for clinical record ingestion: an external AI partner runs ambient recording → Whisper → LLM and pushes completed clinical reports into a signed endpoint. The platform owns the AI-ingestion review queue (`ai_review_state`, placeholder pending the partner contract), the clinical record lifecycle (`record_status`: `draft` → `locked` → `signed`), and the immutability of locked/signed records via a BEFORE trigger that fires even for `service_role`.

---

## 2. Hard architecture rules

Non-negotiable constraints applied across the codebase. Source: `CLAUDE.md`.

1. Every domain table has `tenant_id uuid not null`. No exceptions.
2. Every domain table has an RLS policy keyed on the JWT `tenant_id` claim.
3. Service-role queries (migrations, ingestion, jobs) must set `tenant_id` explicitly. Never global.
4. Clinical records have two orthogonal state machines (see §7):
   - `record_status` — lifecycle for all records: `draft` → `locked` → `signed`. Locking is enforced by a BEFORE UPDATE OR DELETE trigger that rejects mutations on locked/signed rows regardless of caller role.
   - `ai_review_state` — review queue for AI-ingested records only. PLACEHOLDER values pending the AI partner auth contract.
5. Form templates are JSON Schema-driven, versioned, and immutable once referenced by a record.
6. Audit log writes on every clinical record mutation and permission-sensitive action. No exceptions.
7. PII never appears in logs, error messages, or Sentry events. Sanitize before logging.
8. EU data residency: Supabase EU (Frankfurt), Vercel `fra1`, Resend EU. No US-region resources for stored data.

---

## 3. Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict |
| UI | shadcn/ui + Tailwind v4 |
| ORM | Drizzle ORM |
| Database | PostgreSQL via Supabase EU (Frankfurt) |
| Auth | Supabase Auth — JWT with `tenant_id` + `user_role` custom claims |
| File storage | Supabase Storage — signed URLs only, never public |
| Background jobs | Inngest |
| Hosting | Vercel (region `fra1`) |
| Error tracking | Sentry (EU) |
| Email | Resend (EU) |
| SMS | Twilio (PT sender) |
| Payments | IfThenPay (MB/MB Way) + Stripe (card) — both owner-gated |
| Fiscal invoicing | InvoiceXpress — Phase 4, owner-gated |
| Monorepo | pnpm + Turborepo |
| Node.js | 22.x (pinned in CI and Vercel) |
| Testing | Vitest (unit + RLS isolation), Playwright (E2E) |

---

## 4. Repo layout

```
apps/
  web/                 # Staff platform (Next.js) — scheduling, patients, clinical records
  admin/               # Superadmin (tenant management, tenant lifecycle, system ops)
  api/                 # Patient-facing REST API (Next.js) — portal backend at api.osteojp.pt
  portal/              # Patient portal (Next.js) — appointment booking, forms, documents
packages/
  db/                  # Drizzle schema, migrations (source), RLS policies, seed
  ui/                  # shadcn components, brand tokens, Storybook
  auth/                # Permission matrix (PERMISSIONS), JWT helpers, role guards
  i18n/                # User-facing strings: PT primary, EN secondary
tools/
  fisiozero-extractor/ # Data migration tooling (Phase 5)
docs/                  # Architecture, brand, QA, wireframes, templates
scripts/
  sync-supabase-migrations.mjs   # Mirrors packages/db/migrations → supabase/migrations
  check-openapi-drift.mjs        # Checks every API route is documented in openapi.yaml
supabase/
  migrations/          # Mirror of packages/db/migrations (auto-generated — do not hand-edit)
  config.toml          # Tracked; configures custom_access_token hook
  seed.sql             # Branch/local seed: one demo tenant + role rows
  .branches/           # Gitignored
  .temp/               # Gitignored
```

**Key layout notes:**

- Integration clients (InvoiceXpress, IfThenPay, Stripe) live in `apps/web/lib/integrations/`, not in a `packages/` directory — they are staff-app concerns only.
- `packages/db/src/schema.ts` is the canonical schema; the migration files under `packages/db/migrations/` are the applied history.
- Tests colocated: `foo.ts` + `foo.test.ts`. E2E tests in `apps/web/e2e/` (Playwright, covering auth, patients, scheduling, clinical, admin flows).
- `packages/i18n/strings.ts` + `portal-strings.ts` are the canonical string catalogs; all user-facing strings must use i18n keys.
- `tools/fisiozero-extractor` supports the Phase 5 data migration from the legacy system.

---

## 5. Turborepo + pnpm

The monorepo uses **pnpm workspaces** (`apps/*`, `packages/*`, `tools/*`) and **Turborepo** for build orchestration.

### 5.1 Workspace config (`pnpm-workspace.yaml`)

- Packages declare dependencies on each other with `workspace:*` protocol.
- Playwright version is pinned workspace-wide via `overrides` (`1.60.0`) to prevent two copies of `playwright-core` arising from `apps/web` and `packages/ui` pulling different versions.

### 5.2 Turborepo pipeline (`turbo.json`)

| Task | `dependsOn` | Notes |
|---|---|---|
| `build` | `^build` | Outputs: `.next/**`, `dist/**` |
| `dev` | — | `cache: false`, persistent |
| `lint` | — | No deps |
| `typecheck` | `^build` | Downstream packages must build first |
| `test` | `^build` | Unit (Vitest) |
| `e2e` | `^build` | Playwright; `cache: false` |

Running `pnpm <task>` from the repo root fans out to all workspaces respecting the dependency graph. Running `pnpm --filter <name> <task>` scopes to a single package.

### 5.3 Key scripts (root `package.json`)

| Script | What it runs |
|---|---|
| `pnpm dev` | All apps in dev mode |
| `pnpm build` | All apps (ordered by deps) |
| `pnpm lint` | All workspaces |
| `pnpm typecheck` | All workspaces (after build) |
| `pnpm test` | Vitest unit suites (no DB) |
| `pnpm db:generate` | `drizzle-kit generate` — creates SQL in `packages/db/migrations/` |
| `pnpm db:migrate` | `drizzle-kit migrate` — applies to production via direct connection |

---

## 6. The four apps

### 6.1 `apps/web` — staff platform

Next.js 16 App Router. The primary application: scheduling, patient records, clinical forms, body charts, invoicing, appointment reminders, user/role management.

Hosts:
- All staff-facing UI routes
- Inngest serving endpoints (`/api/inngest`, `/api/inngest/ifthenpay`, `/api/inngest/invoicexpress`, `/api/inngest/stripe`)
- IfThenPay payment callback webhook (`/api/webhooks/ifthenpay`)
- AI clinical record ingestion endpoint (`/api/v1/ingestion/clinical-records`)

Key external packages: `inngest`, `twilio`, `resend`, `pdf-lib`, `@sentry/nextjs`.

### 6.2 `apps/admin` — superadmin

Next.js 16 App Router. Internal operator console for managing the platform itself: list tenants, create tenants, suspend/activate tenants, view tenant details. Accessible only with the `operator` role (a separate auth path from the staff `user_role` claims; see `packages/auth/guard.ts`).

No patient data is accessible from this app.

### 6.3 `apps/api` — patient-facing REST API

Next.js 16 App Router. Exposes `/api/v1/...` routes consumed by the patient portal frontend (`apps/portal`). Routes are authenticated via the patient's Supabase session and the `patient` JWT principal resolved from `packages/auth/patient.ts`.

Key routes:
```
GET  /api/health
GET  /api/v1/auth/session              # patient identity (own patient_id + tenant_id)
GET  /api/v1/patient/profile           # patient's own profile
GET  /api/v1/patient/documents         # patient's documents
GET  /api/v1/patient/documents/:id/download
GET  /api/v1/me/fichas                 # patient's submitted intake forms
GET  /api/v1/me/forms/catalog          # available form templates
POST /api/v1/me/forms                  # submit intake form
GET  /api/v1/booking/catalog           # bookable services
GET  /api/v1/appointments              # patient's upcoming appointments
GET  /api/v1/appointments/:id
POST /api/v1/appointments/:id/cancel
POST /api/v1/appointments/:id/reschedule
```

The API also handles patient account activation (email/SMS via Twilio + Resend in sandbox-first mode).

### 6.4 `apps/portal` — patient portal

Next.js 16 App Router. Patient-facing UI at (planned) `portal.osteojp.pt`. Talks exclusively to `apps/api` for data; shares `@osteojp/auth`, `@osteojp/db`, `@osteojp/ui`, `@osteojp/i18n` packages.

Portal routes:
- `/auth/login` — patient sign-in
- `/portal/dashboard`
- `/portal/appointments` — upcoming + past
- `/portal/booking` — self-book an appointment
- `/portal/forms` — intake forms catalog + submission
- `/portal/clinics` — clinic locations
- `/portal/documents` — patient documents
- `/portal/account` — account settings

---

## 7. Data model

The full schema with column definitions, constraints, and indexes lives in `packages/db/src/schema.ts`. This section summarizes the table inventory and key relationships.

### 7.1 Table inventory (current — 19 tables)

| Table | Purpose |
|---|---|
| `tenants` | Top-level isolation unit. Every domain row belongs to one tenant. Carries `status` (active/suspended — managed by superadmin only). |
| `roles` | Role definitions per tenant. Slug must match `packages/auth/permissions.ts`: `owner`, `admin`, `therapist`, `reception`. |
| `users` | Staff accounts. `id` mirrors `auth.users.id` (Supabase Auth). JWT carries `tenant_id` + `user_role` derived from this table via the custom_access_token hook. |
| `locations` | Per-tenant clinic locations (Linda-a-Velha, Castelo Branco, Montemor-o-Novo). |
| `services` | Per-tenant service catalogue: treatment type, duration, base price (integer cents). |
| `service_location_prices` | Per-(service, location) price override. When a row exists for a pair it wins over `services.price_cents`; otherwise the location inherits the base. |
| `patients` | Patient records. Soft-deleted via `deleted_at`. Carries `auth_user_id` (nullable) linking to the patient portal principal once activated. |
| `patient_locations` | Junction table: many-to-many patient ↔ location assignment. |
| `appointments` | Scheduled sessions. Links patient, practitioner (user), location, service. Supports recurring series via `recurrence_rule` (RRULE) + `recurrence_parent_id`. |
| `availability_templates` | Therapist recurring weekly working hours per location. Weekday (0–6), start/end times, optional validity window. |
| `time_off` | Therapist absence blocks (vacation, sick, holiday, other). Cross-location; timestamptz start/end. |
| `form_templates` | Versioned JSON Schema-driven clinical form definitions. Immutable once referenced. Title and schema stored as JSONB; supports PT/EN labels. |
| `clinical_episodes` | A patient's course of treatment for a given complaint. Groups `clinical_records`. |
| `clinical_records` | Individual clinical notes. Two orthogonal state machines: `record_status` (draft/locked/signed) and `ai_review_state` (pending_review/in_review/approved/rejected — AI-ingested rows only). Addendum chain via `supersedes_id`. Body chart markers stored in `data.bodychart` (JSONB). |
| `ai_ingestion_requests` | One row per AI partner push, keyed by `(tenant_id, idempotency_key)`. Enables 24h dedupe and 409-on-mismatch. |
| `attachments` | Files attached to clinical records. `storage_path` is the Supabase Storage object path; app always issues signed URLs, never exposes public paths. |
| `audit_log` | Append-only. RLS allows INSERT + SELECT only — no UPDATE/DELETE policy exists, so both are denied under RLS. Indexes on `(entity_type, entity_id)` and `created_at`. |
| `invoices` | Internal billing ledger. `external_invoice_id` / `payment_provider` / `payment_ref` are relay hooks for the InvoiceXpress + IfThenPay integrations (see §12). |
| `patient_form_submissions` | Wave B: patient-submitted intake forms from the portal. Lands as `review_state = pending_review`; never auto-finalizes. Staff review path materialises a draft `clinical_record` and links it via `clinical_record_id`. |
| `migration_staging_rows` | Phase 5 foundation. Staging + idempotency ledger for Fisiozero → OsteoJP import. Unique on `(tenant_id, source_system, entity_type, source_id)`. `imported_entity_id` is intentionally not an FK (points at different target tables per `entity_type`). |
| `quick_notes` | Per-staff scratchpad. One row per `(tenant_id, staff_user_id)`. RLS self-scopes to the current staff user. |

### 7.2 Selected relationships

- `tenants` → all other domain tables (1-to-many on `tenant_id`)
- `patients` → `clinical_episodes` (1-to-many) → `clinical_records` (1-to-many)
- `appointments` → `clinical_records` (optional 1-to-1 when visit produces a record)
- `clinical_records` → `form_templates` (many-to-1, references a specific `(key, version)`)
- `clinical_records` → `attachments` (1-to-many)
- `clinical_records` → `clinical_records` (self-FK `supersedes_id`, addendum chain)
- `invoices` → `appointments` + `patients` (billing ledger)
- `patients` ↔ `locations` (many-to-many via `patient_locations`)
- `users` ↔ `locations` (availability via `availability_templates`, per weekday)
- `patient_form_submissions` → `clinical_records` (review claim result)

### 7.3 Conventions

- **Money:** integer cents + ISO currency on the column. Never floats.
- **Time:** all timestamps in UTC in DB; display layer converts to `Europe/Lisbon`.
- **Soft delete:** `patients` only — via `deleted_at` (records must never disappear).
- **JSONB:** `clinical_records.data` (filled form response), `form_templates.schema` (JSON Schema), `form_templates.title` (PT/EN).
- **Primary keys:** random UUID on all tables except `users.id`, which mirrors `auth.users.id`.

---

## 8. RLS + JWT security model

### 8.1 JWT custom claims

Every Supabase Auth token carries two custom claims injected by the **Custom Access Token Hook** (`public.custom_access_token_hook`, defined in migration `0002_auth_token_hook.sql`):

| Claim | Type | Value |
|---|---|---|
| `tenant_id` | `uuid` (as text in JWT) | From `public.users.tenant_id` for the signing user |
| `user_role` | `text` | Slug from `public.roles.slug` joined via `users.role_id` |

The claim is named `user_role`, NOT `role`. Supabase reserves the `role` claim for PostgREST's `SET ROLE` mechanism; writing a slug like `therapist` there would break all authenticated requests.

The hook runs as `SECURITY DEFINER` with `search_path = ''` (defense against search-path injection). `EXECUTE` is granted only to `supabase_auth_admin`; application code cannot call it. The hook must be enabled manually in the Supabase Dashboard under Authentication → Hooks.

### 8.2 JWT helper functions

Two `STABLE` SQL functions wrap claim reads. Referenced in policies as `(select public.jwt_tenant_id())` / `(select public.jwt_role())` so Postgres evaluates them as initPlans (once per query, not per row):

```sql
CREATE OR REPLACE FUNCTION public.jwt_tenant_id() RETURNS uuid AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$;

CREATE OR REPLACE FUNCTION public.jwt_role() RETURNS text AS $$
  SELECT auth.jwt() ->> 'user_role'
$$;
```

A missing or invalid `tenant_id` claim causes `jwt_tenant_id()` to return `NULL`, which makes every `tenant_id = (select public.jwt_tenant_id())` predicate `FALSE` — all rows invisible. **Fail-closed** by design.

### 8.3 RLS policies

Every domain table has RLS enabled. The standard tenant-isolation policy pattern:

```sql
CREATE POLICY "table_tenant_isolation" ON public.table_name
  FOR ALL TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()));
```

Exceptions to the standard pattern:

- **`tenants`** — keyed on `id` (not `tenant_id`): `id = (select public.jwt_tenant_id())`.
- **`audit_log`** — SELECT + INSERT policies only; absence of UPDATE/DELETE policies denies both.
- **`clinical_records`** — separate SELECT/INSERT/UPDATE/DELETE policies gate on role: `jwt_role() IN ('owner', 'admin', 'therapist')`. Reception is denied at the DB layer.
- **`patient_form_submissions`** — dual policy: patient `role` self-scope (INSERT + SELECT own rows only) + standard tenant-isolation for staff (Wave B).

`service_role` has `BYPASSRLS` in Supabase and is the sanctioned escape hatch for migrations, ingestion jobs, and seed scripts. All service-role queries still filter by `tenant_id` explicitly (rule 3).

### 8.4 Clinical records immutability trigger

Enforced by a `BEFORE UPDATE OR DELETE` trigger (`clinical_records_enforce_immutability`). Fires regardless of RLS or `BYPASSRLS`:

```sql
IF OLD.status IN ('locked', 'signed') THEN
  RAISE EXCEPTION '... is finalized and immutable; create a new versioned record instead'
  USING ERRCODE = 'check_violation';
END IF;
```

### 8.5 App-layer permission matrix

`packages/auth/permissions.ts` defines the `PERMISSIONS` record. All API routes and server actions check this before any DB call. RLS is the second line of defense.

| Capability | owner | admin | therapist | reception |
|---|---|---|---|---|
| `patients:read` | ✓ | ✓ | ✓ | ✓ |
| `patients:write` | ✓ | ✓ | ✓ | ✓ |
| `patients:delete` | ✓ | ✓ | ✗ | ✗ |
| `appointments:read/write` | ✓ | ✓ | ✓ | ✓ |
| `appointments:delete` | ✓ | ✓ | ✗ | ✓ |
| `services:read` | ✓ | ✓ | ✓ | ✓ |
| `services:write` | ✓ | ✓ | ✗ | ✗ |
| `locations:read` | ✓ | ✓ | ✓ | ✓ |
| `locations:write` | ✓ | ✓ | ✗ | ✗ |
| `clinical_records:read` | ✓ | ✓ | ✓ | **✗** |
| `clinical_records:author` | ✓ | **✗** | ✓ | ✗ |
| `clinical_records:review` | ✓ | **✗** | ✓ | ✗ |
| `clinical_records:sign` | ✓ | **✗** | ✓ | ✗ |
| `invoices:read` | ✓ | ✓ | ✓ | ✓ |
| `invoices:issue` | ✓ | ✓ | ✗ | ✓ |
| `invoices:void` | ✓ | ✓ | ✗ | ✗ |
| `users:read` | ✓ | ✓ | ✗ | ✗ |
| `users:manage` | ✓ | ✓ | ✗ | ✗ |
| `roles:read` | ✓ | ✓ | ✗ | ✗ |
| `roles:manage` | ✓ | **✗** | ✗ | ✗ |
| `settings:read/manage` | ✓ | ✓ | ✗ | ✗ |
| `audit_log:read` | ✓ | ✓ | ✗ | ✗ |

Key points: **Admin cannot author, review, or sign clinical records** (read-only, oversight role). **Only the owner can grant/change the owner role** (anti-escalation; `canReassignRole()` in `permissions.ts`). Reception has no clinical record access at all — enforced both here and by RLS.

---

## 9. Auth flow

### 9.1 Staff auth (apps/web, apps/admin)

```
User → signInWithPassword → Supabase Auth
Supabase Auth → custom_access_token_hook (SECURITY DEFINER)
  hook reads: users.tenant_id, roles.slug via users.role_id
  hook injects: { tenant_id, user_role } into JWT claims
JWT returned to browser → @supabase/ssr stores session in cookies
Server action / API route receives request with JWT cookie
→ packages/auth verifies JWT + checks PERMISSIONS matrix
→ Drizzle query sent with JWT context set by Supabase PostgREST
→ RLS evaluates jwt_tenant_id() + jwt_role() per-query (initPlan)
→ Filtered rows returned
```

`supabase-js` is used only for auth flows (`signInWithPassword`, session refresh). Application-layer queries go through Drizzle ORM via `packages/db`. No raw SQL in app code.

### 9.2 Patient auth (apps/api, apps/portal)

Patients authenticate via Supabase Auth with a separate principal type. The `custom_access_token_hook` returns `user_role = null` for patients (no row in `public.users`). `packages/auth/patient.ts` resolves the patient principal by looking up `patients.auth_user_id = auth.uid()`.

Patient portal RLS uses a self-scope policy: a patient can only read/write rows where `patient_id` matches their own `auth.uid()` → `patients.auth_user_id` lookup. Staff tenant-isolation policies do not apply to the patient role.

---

## 10. Clinical record state machines

Two orthogonal state machines on `clinical_records` (both defined in `packages/db/src/schema.ts`).

### 10.1 `record_status` — lifecycle (all records)

```
draft → locked → signed
                signed → [new row: addendum] → signed
```

- `draft`: editable by the assigned therapist (or owner). Content in `data` JSONB is mutable.
- `locked` → `signed`: immutable. The BEFORE trigger blocks any UPDATE/DELETE, including `service_role`.
- Addenda: a therapist opens a new record row with `supersedes_id` pointing at the finalized record. The chain preserves history.

### 10.2 `ai_review_state` — AI ingestion queue (AI-ingested records only, PLACEHOLDER)

Enum values: `pending_review`, `in_review`, `approved`, `rejected`. **PLACEHOLDER** — exact values and transition semantics depend on the AI partner auth contract (open item, see §15).

- AI ingestion never produces a `locked` or `signed` record directly.
- A human reviewer claiming the record (`pending_review` → `in_review`) is what advances it. Acceptance (`in_review` → `approved`) lets the record proceed through `record_status`.
- `patient_form_submissions` reuses the same `ai_review_state` enum for the Wave B patient intake review queue.

---

## 11. Migration workflow

### 11.1 Source of truth: `packages/db/migrations/`

Schema changes flow through Drizzle:

```
Edit packages/db/src/schema.ts
→ pnpm db:generate          # drizzle-kit generate → writes NNNN_*.sql to packages/db/migrations/
→ node scripts/sync-supabase-migrations.mjs   # mirrors SQL to supabase/migrations/ (byte-for-byte + auto-header)
→ git add packages/db/migrations/ supabase/migrations/
→ commit + PR
```

`supabase/migrations/` is a **generated mirror** — never hand-edit it. The source is always `packages/db/migrations/`.

### 11.2 Why the mirror exists

Supabase branching builds each PR's ephemeral DB branch by applying `supabase/migrations/*.sql` + `supabase/seed.sql`. There is no config knob to point Supabase at the Drizzle directory. The sync script keeps the two directories byte-identical so preview branches always match what Drizzle applies to production.

### 11.3 Applying migrations locally / on preview branches

```bash
supabase db reset   # applies all supabase/migrations/*.sql in order, then supabase/seed.sql
```

Used by both `db-tests.yml` (RLS isolation) and `e2e.yml` (Playwright) CI workflows.

### 11.4 Applying to production (`prod-migrate.yml`)

Manual, gated workflow (`workflow_dispatch` only). Requires typing `MIGRATE-PROD` exactly into the confirmation input. Uses `drizzle-kit migrate` against `PROD_DATABASE_URL_DIRECT` (the Supabase session pooler on port 5432 — drizzle-kit needs session-level advisory locks; the transaction pooler on 6543 does not support them). Idempotent: Drizzle tracks applied migrations in `drizzle.__drizzle_migrations` and skips already-applied files.

---

## 12. CI gates

Six GitHub Actions workflows. Three are **required** (branch-protection gates). Three are additional guards.

### 12.1 Required gates (branch protection)

| Workflow | Job name (wire to branch protection exactly) | Trigger | What it tests |
|---|---|---|---|
| `ci.yml` | `Lint + typecheck + test` | PR → `main` | `pnpm lint` + `pnpm typecheck` + `pnpm test` (Vitest, no DB). Fast, unit-only. |
| `db-tests.yml` | `DB-gated tests (RLS isolation, seeded DB)` | PR → `main`, push `main` | Boots local Supabase, runs `supabase db reset`, executes `packages/db` Vitest suite with `DATABASE_URL` set. Includes a skip-guard that turns the job RED if any of the six RLS isolation suites silently skips (zero tests collected). Docs-only PRs skip the Supabase boot but the job still reports green. |
| `e2e.yml` | `Playwright E2E (seeded DB)` | PR → `main` | Boots local Supabase, runs `supabase db reset`, seeds deterministic E2E fixture (`apps/web/e2e/seed/seed-e2e.mjs`), runs Playwright against `next dev`. Docs-only PRs skip. |

### 12.2 Non-required / advisory workflows

| Workflow | Trigger | What it checks |
|---|---|---|
| `supabase-branch-sync.yml` | PR touching `packages/db/migrations/**`, `supabase/migrations/**`, `supabase/config.toml`, `supabase/seed.sql`, or `scripts/sync-supabase-migrations.mjs`; push to `main` | Verifies `supabase/migrations/` is byte-identical to `packages/db/migrations/` (via `--check` flag). Also asserts `custom_access_token_hook` is enabled in `config.toml`. |
| `openapi-drift.yml` | PR touching `apps/api/app/api/**`, `apps/web/app/api/v1/**`, `docs/api/openapi.yaml`, or related scripts | Lints `docs/api/openapi.yaml` (Redocly), then checks every `/api/v1` route handler has a documented path+method. |
| `prod-migrate.yml` | `workflow_dispatch` only | Manual production migration (see §11.4). |

### 12.3 Vercel preview checks

Vercel posts a non-required `Preview – …` check on every PR. On the Hobby plan this check may show as `informational` or fail without blocking merge. It is not wired into branch protection.

---

## 13. External integrations

All integration clients live in `apps/web/lib/integrations/` (staff-app only). Each wrapper is **credential-gated**: it throws a typed config error before any network call when owner-supplied keys are absent. All integrations default to sandbox/dry-run mode in the absence of credentials or the `REMINDERS_LIVE_SEND=true` flag.

### 13.1 InvoiceXpress — **Phase 4, owner-gated**

Fiscal invoicing for Portugal (`fatura-recibo` format with NIF + AT-certified serial). Issues, retrieves, voids, and lists invoices. Relay is designed but not yet wired to real issuance.

- **Status:** keys unset (`INVOICEXPRESS_API_KEY`, `INVOICEXPRESS_ACCOUNT_NAME`). Every operation throws `InvoiceXpressConfigError` before any fetch.
- **Owner gates before live use:** (1) provision API key; (2) owner sign-off on VAT-23% wiring (CLAUDE.md: invoicing legal compliance is owner-confirmable).
- **Integration path:** `lib/integrations/invoicexpress/` → Inngest retry job at `/api/inngest/invoicexpress`.
- **Fiscal note:** IfThenPay records payment status; InvoiceXpress issues the legal fiscal document. They are independent — one collects money, the other issues the receipt.

### 13.2 IfThenPay — **owner-gated, no live calls**

Portuguese payment gateway for Multibanco references and MB Way push payments. Includes anti-spoofed callback handler and idempotent reconciliation against the internal `invoices` ledger.

- **Status:** keys unset (`IFTHENPAY_MB_KEY`, `IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_ANTIPHISHING_KEY`). Every operation throws `IfThenPayConfigError` before any fetch.
- **Integration path:** `lib/integrations/ifthenpay/` → Inngest retry job at `/api/inngest/ifthenpay`; public callback webhook at `/api/webhooks/ifthenpay`.

### 13.3 Stripe — **owner-gated, no live calls**

Card payment processing. Typed client + webhook handler + refund flow. Keys unset (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).

- **Status:** every operation throws `StripeConfigError` before any fetch.
- **Integration path:** `lib/integrations/stripe/` → Inngest retry job at `/api/inngest/stripe`; webhook at `/api/v1/integrations/stripe/webhook`.

### 13.4 Twilio — **sandbox-first**

SMS notifications (appointment reminders, patient activation). PT SMS sender ID "OsteoJP" — registration process documented in `docs/twilio-pt-sender-registration.md`.

- **Status:** SDK imported lazily; no network call fires unless `REMINDERS_LIVE_SEND=true` AND provider keys are present. Defaults to sandbox (logs intent, no send).
- **PT registration:** sender ID registration pending (required before any live SMS to PT numbers).
- **Used in:** `apps/web/lib/reminders/clients.ts` (staff reminders), `apps/api/lib/notify/clients.ts` (patient activation).

### 13.5 Resend — **sandbox-first**

Transactional email (reminders, post-visit, patient activation, staff invite). EU region. Sender domain `@osteojp.pt` pending DNS verification.

- **Status:** SDK imported lazily; sandbox-first same gate as Twilio above.
- **DNS pending:** SPF, DKIM, DMARC records documented in `docs/dns-records-pending.md`. Owner DNS access required.
- **Used in:** `apps/web/lib/reminders/clients.ts`, `apps/web/lib/admin/staff.ts`, `apps/api/lib/notify/clients.ts`.

### 13.6 Sentry — **active**

Error tracking, EU region (`@sentry/nextjs`). Configured in `apps/web/sentry.server.config.ts`, `sentry.edge.config.ts`, and `instrumentation.ts`. `tracesSampleRate`: 1.0 in dev, 0.1 in production. PII scrubbed before any event is sent (rule 7).

### 13.7 Inngest — **active**

Background job orchestration. Separate Inngest "apps" per integration domain (core, ifthenpay, invoicexpress, stripe), each with its own serving endpoint under `/api/inngest/`. Functions handle retry, deduplication, and concurrency.

Key jobs:
| Job | Trigger |
|---|---|
| Appointment reminder 48h + 24h | Scheduled per appointment |
| Post-visit thank-you | Event: appointment marked complete |
| Post-visit feedback | Cron: +3 days post-appointment |
| IfThenPay payment reconciliation | Event: payment callback received |
| InvoiceXpress issue with retries | Event: `invoice/issue.requested` |
| Stripe charge with retries | Event: invoice payment by card |
| AI review queue notification | Event: ingestion accepted (PLACEHOLDER) |

All jobs operate on a single tenant context (rule 3). Failures reported to Sentry (PII sanitized).

---

## 14. Deployment topology

```
EU data-residency boundary
  Vercel (fra1)
    apps/web   — staff platform (app.osteojp.pt)
    apps/admin — superadmin (admin.osteojp.pt)
    apps/api   — patient API (api.osteojp.pt)
    apps/portal — patient portal (portal.osteojp.pt)
  Supabase EU (Frankfurt)
    PostgreSQL (with RLS) + Auth + Storage
  Resend EU — transactional email
  Sentry EU — error tracking
  Inngest — background jobs (US-hosted worker, EU DB access)

External / outbound only (no stored clinical data crosses these)
  Twilio — PT SMS
  IfThenPay — MB/MB Way payments
  Stripe — card payments
  InvoiceXpress — fiscal invoicing

AI Partner (inbound only — pushes into /api/v1/ingestion)
  Ambient recording → Whisper → LLM pipeline (external)
```

**Vercel regions:** all four apps are deployed with `regions: ["fra1"]` (from `vercel.json` at repo root). Vercel Hobby tier — Vercel preview checks are non-required.

**Vercel setup checklist** (applied manually in the dashboard — do not automate):
- Settings → General → Data Preferences → disable "Improve models with this project's data"
- Settings → Build and Deployment → Node.js Version → 22.x

---

## 15. Open questions

Items needing decision from the lead, owner, or AI partner before they can be resolved.

1. **AI ingestion auth contract.** `CLAUDE.md` specifies API key + HMAC. The partner has recommended a service-account bearer token. Decision pending; affects `packages/ingestion` and the partner-side client.
2. **Per-field `ai_extractable` flag values.** All form template fields currently set to `false` pending the AI partner contract. Narrative fields will likely flip to `true` once signed; structured fields and `private_notes` stay `false` permanently.
3. **Email sender details.** Sender display name, reply-to address, and 48h vs 24h reminder timing. Owner decision.
4. **Resend DNS verification.** SPF/DKIM/DMARC records pending DNS access from the owner (see `docs/dns-records-pending.md`).
5. **Twilio PT sender registration.** Sender ID "OsteoJP" needs PT carrier registration before any live SMS.
6. **No-show charge policy.** Whether the no-show email mentions a late-cancellation fee. Owner decision.
7. **Montemor-o-Novo opening date + contacts.** Pending owner confirmation.
8. **VAT-23% sign-off (#107).** Required before InvoiceXpress or Stripe can issue real documents. Owner-confirmable per CLAUDE.md.
9. **`invoicing.total*` string deduplication.** `invoicing.totalPaid/Pending/Overdue` duplicate status labels. Flagged in i18n copy review.
10. **`patients.fieldSex` EN label.** Current: `"Biological sex"`. Confirm clinically acceptable (vs `"Sex"`). Flagged in i18n copy review.

---

## 16. References

- [`mega-plan.md`](./mega-plan.md) — phased task plan
- [`CLAUDE.md`](../CLAUDE.md) — architectural rules (the source this doc transcribes)
- [`tech-stack.md`](./tech-stack.md) — stack rationale
- [`handoff-brief.md`](./handoff-brief.md) — team context
- [`brand-tokens.md`](./brand-tokens.md) — visual identity
- [`brand-voice.md`](./brand-voice.md) — copy and tone reference
- [`sms-templates.md`](./sms-templates.md) — SMS content
- [`email-templates-reminders.md`](./email-templates-reminders.md) — appointment reminder emails
- [`email-templates-post-visit.md`](./email-templates-post-visit.md) — post-visit emails
- [`supabase-branching.md`](./supabase-branching.md) — per-PR Supabase branch setup and CI guard
- [`supabase-setup.md`](./supabase-setup.md) — Supabase project configuration
- [`dns-records-pending.md`](./dns-records-pending.md) — Resend DNS items
- [`twilio-pt-sender-registration.md`](./twilio-pt-sender-registration.md) — SMS sender registration
- [`ops/prod-migrate.md`](./ops/prod-migrate.md) — production migration runbook
- [`docs/api/openapi.yaml`](./api/openapi.yaml) — API spec
- [`packages/db/src/schema.ts`](../packages/db/src/schema.ts) — schema source of truth
- [`packages/auth/permissions.ts`](../packages/auth/permissions.ts) — permission matrix source
- [`apps/web/lib/integrations/`](../apps/web/lib/integrations/) — integration clients
- [`apps/web/e2e/`](../apps/web/e2e/) — Playwright E2E suite

# OsteoJP Platform — Project Context for Claude Code

## What this is
Unified clinic platform for OsteoJP (Linda-a-Velha, Castelo Branco, Montemor-o-Novo).
Replaces Fisiozero + Stylus.pt. Multi-tenant from day 1 (licensing path).
API-first: an external AI partner ingests clinical records via a signed endpoint.
Reference site: https://osteojp.pt — brand and tone source of truth.

## Hard architecture rules — do not violate
1. Every domain table has `tenant_id uuid not null`. No exceptions.
2. Every domain table has an RLS policy keyed on the JWT `tenant_id` claim.
3. Service-role queries (migrations, ingestion, jobs) MUST set `tenant_id` explicitly. Never global.
4. Clinical records have two orthogonal state machines, defined in `packages/db/src/schema.ts`:
   - `record_status` — lifecycle of every clinical record regardless of origin: `draft` → `locked` → `signed`. Locking makes content immutable (enforced by the BEFORE UPDATE OR DELETE trigger); signing attaches the therapist signature. Changes after locking create addendum versions.
   - `ai_review_state` — review queue for records arriving via the AI ingestion endpoint only. PLACEHOLDER values (`pending_review`, `in_review`, `approved`, `rejected`) pending the AI partner auth contract; refine in schema once signed off. AI ingestion never produces a `locked` or `signed` record directly — a human reviewer must accept the AI payload, after which the resulting `clinical_record` follows the standard `record_status` lifecycle.
5. Form templates are JSON-Schema-driven. Templates are versioned and immutable once referenced by a record.
6. Audit log writes on every clinical record mutation and every permission-sensitive action. No exceptions.
7. PII never appears in logs, error messages, or Sentry events. Sanitize before logging.
8. EU data residency: Supabase EU (Frankfurt), Vercel `fra1`, Resend EU. No US-region resources for stored data.

## Stack
- Next.js 16 App Router, TypeScript strict
- shadcn/ui + Tailwind v4
- Drizzle ORM + PostgreSQL (Supabase EU)
- Supabase Auth (JWT with tenant_id + role claims)
- Supabase Storage (signed URLs only, never public)
- Inngest for background jobs
- Vercel hosting (region: fra1)
- Sentry (EU)
- pnpm + Turborepo
- Vitest + Playwright

## Repo layout
- `apps/web` — staff platform (Next.js)
- `apps/admin` — superadmin (tenant management, system ops)
- `packages/db` — Drizzle schema, migrations, RLS policies
- `packages/ui` — shadcn components, brand tokens
- `packages/auth` — permission matrix, JWT helpers
- `packages/ingestion` — AI partner ingestion contract + validators
- `packages/integrations` — InvoiceXpress, IfThenPay, Stripe, Twilio, Resend

## Permission matrix (server-enforced, do not relax client-side)
| Action | Admin | Therapist | Receptionist |
|---|---|---|---|
| View any patient | ✓ | ✓ (own only) | ✓ |
| View clinical records | ✓ | ✓ (own patients only) | ✗ |
| Edit clinical records | ✗ (read only) | ✓ (own, until locked) | ✗ |
| Schedule appointments | ✓ | ✓ (own calendar) | ✓ |
| Issue invoices | ✓ | ✗ | ✓ |
| Manage users/roles | ✓ | ✗ | ✗ |
| Tenant settings | ✓ | ✗ | ✗ |

Enforcement: server-side check in every API route + RLS as defense-in-depth.

## Languages
Portuguese (default), English (secondary). All user-facing strings via i18n keys. Patient communications respect per-patient preference.

## Coding conventions
- Server actions over API routes when possible.
- No `any`. If forced, comment why.
- Database access: only through `packages/db`. No raw SQL in app code.
- All dates in UTC in DB, Europe/Lisbon for display.
- Money: integer cents, currency on the column. Never floats.
- File uploads always go through signed URLs; never proxy through the Next.js server.
- Tests live next to code: `foo.ts` + `foo.test.ts`.

## Naming
- Tables: `snake_case`, plural (`patients`, `clinical_records`).
- TS: `camelCase` vars, `PascalCase` types/components.
- Routes: `/api/v1/...` with explicit versioning.

## Brand
- Logo: teal #45B9A7, magenta #8B1863, soft grey wordmark #98B2C2.
- Canonical palette source: `Logotipo_OsteoJP_2023.pdf`, sampled at 300 DPI (confirmed true vector). These sampled hexes are canonical and supersede any earlier approximations.
- Typography: clinical, generous spacing. Inter or similar.
- Tone: serious, precise, not warm. "Padrão ouro." No emoji in product UI.
- Print branding on every report, declaration, invoice: logo + location contacts + fiscal info.

## Tone for Claude Code's own output in this repo
- Direct. No motivational filler. No "great question."
- Correction over validation. If a request is wrong, say so with reasoning.
- Flag missing context explicitly rather than guessing.
- When a decision touches owner-confirmable scope, log it to docs/QUESTIONS.md with a recommended default, mark the ticket blocked, and continue with the next unblocked ticket.

## Owner-confirmable items (do not auto-decide)
- Anything touching invoicing legal compliance
- Anything touching clinical data retention beyond defaults
- Anything that changes the V1 vs V1.1 scope line
- Anything that introduces a new third-party vendor

## Supabase setup
- Project linked: `jaxmkwoxjcgzkwxgbayx`, region Central EU (Frankfurt).
- Use the `supabase` CLI for all migrations and schema operations (`supabase db push`, `supabase migration new`).
- `supabase-js` is used only for auth flows. Application-layer queries go through Drizzle ORM via `packages/db`.
- `supabase/.branches/` and `supabase/.temp/` are gitignored. `supabase/migrations/` and `supabase/config.toml` are tracked.

## Vercel project setup checklist
Apply to every new Vercel project created under the OsteoJP platform.

- Settings → General → Data Preferences → disable "Improve models with this project's data". Per-project on Hobby tier; disable both the project toggle AND the team toggle on Pro.
- Settings → Build and Deployment → Node.js Version → set to 22.x (match local dev environment).

Healthcare data sensitivity (GDPR, clinical records). Defense in depth from project creation.

## Out of scope for V1 (do not build, ignore in PR reviews)
Patient portal, WhatsApp, mobile app, telehealth, insurance, waitlist, loyalty, pilates module, Formação module, CID-10 mandatory enforcement, full historical archive migration.

## Definition of done (gates, all must pass before any commit)
Run from repo root, in this order:

- pnpm lint
- pnpm typecheck
- pnpm test (Vitest, includes RLS isolation tests)
- pnpm build
- pnpm test:e2e (Playwright) for any ticket touching user-facing flows

A ticket is done only when: gates green, PR opened with the standard format,
ticket status updated, DECISIONS.md appended.

## Backlog

- Tickets live in the task graph (streams D, E, F pattern: numbered tickets
  with explicit dependencies and status).
- Pick order: next unblocked ticket in the active stream. If the whole stream
  is blocked, switch streams and note the switch in DECISIONS.md.
- Never start work that has no ticket. If the owner gives an ad-hoc instruction,
  create the ticket first, then execute.

## RLS verification (project-specific, non-negotiable)

- Every migration adding a domain table must ship with: tenant_id column,
  RLS policy, and an isolation test in the same PR.
- RLS isolation tests MUST run in CI (GitHub Actions). If they are skipped or
  absent from the workflow, treat it as a red gate and fix before feature work.

## Preview verification for PRs
Every PR checklist must reference the Vercel preview deployment URL and include
role-specific steps (test as Admin, Therapist, Receptionist where relevant),
since the permission matrix is the core risk surface.

## Human-only setup (do not attempt via CLI or automation)
The "Vercel project setup checklist" section is executed manually by the owner
in the Vercel dashboard. Do not attempt it. If a new Vercel project is created,
open a QUESTIONS.md item reminding the owner to apply the checklist.

## Environment and secrets

- Local secrets live in .env.local (gitignored). Production secrets live in
  Vercel and Supabase dashboards only.
- If a required env var is missing, do not stub or hardcode it: log to
  QUESTIONS.md, block the ticket, move on.
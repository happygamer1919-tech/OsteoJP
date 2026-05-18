cat > docs/tech-stack.md << 'EOF'
# OsteoJP Platform — Locked Tech Stack

Locked: May 2026. Changes require explicit decision + doc update.

## Application
- **Framework:** Next.js 15 (App Router) + TypeScript strict
- **UI:** shadcn/ui + Tailwind CSS v4
- **Forms:** React Hook Form + Zod
- **State:** Server components by default; Zustand only if needed client-side

## Data
- **Database:** PostgreSQL via Supabase (EU/Frankfurt region)
- **ORM:** Drizzle
- **Auth:** Supabase Auth (JWT with tenant_id + role claims)
- **File storage:** Supabase Storage (signed URLs only)
- **Migrations:** Drizzle Kit, all migrations in `packages/db/migrations`

## Infrastructure
- **Hosting:** Vercel, region `fra1` (Frankfurt)
- **Background jobs:** Inngest
- **Monitoring:** Sentry (EU org)
- **Analytics:** Vercel Analytics

## Integrations
- **Email:** Resend
- **SMS:** Twilio (PT sender)
- **WhatsApp:** Twilio Business API (V1.1)
- **Invoicing:** InvoiceXpress (PT AT-certified)
- **Payments:**
  - Stripe (cards, EU entity)
  - IfThenPay (Multibanco + MB Way)

## Repo
- **Package manager:** pnpm
- **Monorepo:** Turborepo
- **Layout:**
  - `apps/web` — staff platform
  - `apps/admin` — superadmin / tenant management
  - `packages/db` — Drizzle schema + migrations + seeds
  - `packages/ui` — shadcn components + brand tokens
  - `packages/auth` — permission matrix + JWT helpers
  - `packages/i18n` — PT/EN strings
  - `packages/integrations` — third-party clients
  - `packages/ingestion` — AI partner ingestion contract

## Testing
- **Unit:** Vitest
- **E2E:** Playwright
- **Convention:** test files colocated (`foo.ts` + `foo.test.ts`)

## Constraints (non-negotiable)
- EU data residency end-to-end (no US-region resources for stored data)
- Multi-tenant via row-level tenancy + Postgres RLS
- Every domain table has \`tenant_id\` + RLS policy
- Service-role queries must set \`tenant_id\` explicitly
EOF
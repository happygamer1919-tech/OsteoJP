# Mega Plan — OsteoJP Platform

> Full phased task plan for the OsteoJP build, from foundations to post-launch. Each task is owned by either `[YOU]` (the lead) or `[MAX]` (content/QA/docs contributor).
>
> Companion documents: [`handoff-brief.md`](./handoff-brief.md) (team context), [`claude-md-reference.md`](./claude-md-reference.md) (architectural rules).

---

## Phase 0 — Foundations

- `[YOU]` Lock tech stack against handoff plan
- `[YOU]` Open Supabase EU project (Frankfurt region)
- `[YOU]` Open Vercel project + reserve `app.osteojp.pt`, `app-dev.osteojp.pt`, `api.osteojp.pt`
- `[YOU]` Open Resend + Sentry EU + Twilio (PT sender) + Stripe (EU) + IfThenPay sandbox
- `[YOU]` InvoiceXpress account + sandbox API key
- `[YOU]` Confirm AI partner authentication contract (API key + HMAC)
- `[YOU]` Onboard Max: GitHub collaborator, repo clone, machine setup verified
- `[YOU]` Commit OsteoJP `CLAUDE.md` to repo root
- `[YOU]` Set branch protection on `main` (PR + 1 approval + status checks required)
- `[MAX]` Complete machine setup (brew, git, node, python, VS Code, Claude Code, GitHub Desktop)
- `[MAX]` Extract brand tokens from OsteoJP logo (palette hex, typography recs) → `docs/brand-tokens.md`
- `[MAX]` Scrape osteojp.pt + write brand voice guide (tone, PT/EN vocabulary) → `docs/brand-voice.md`
- `[MAX]` Seed `docs/` folder with handoff brief, mega plan, CLAUDE.md reference
- `[MAX]` Create `.github/PULL_REQUEST_TEMPLATE.md` + issue templates (bug, task, content)

---

## Phase 1 — Discovery & Design

- `[YOU]` DB schema v0 in Drizzle (tenants, users, roles, patients, locations, services, appointments, form_templates, clinical_episodes, clinical_records, attachments, audit_log, invoices)
- `[YOU]` RLS policies for every domain table
- `[YOU]` Permission matrix in code (`packages/auth/permissions.ts`)
- `[YOU]` API surface spec — OpenAPI doc covering all V1 endpoints
- `[YOU]` AI ingestion endpoint contract finalized + signed off with partner
- `[YOU]` Wireframe sign-off for 6 critical screens (dashboard, agenda, patient profile, clinical record editor, appointment modal, invoicing view)
- `[MAX]` Wireframes for the 6 critical screens (Excalidraw or Figma, low-fi)
- `[MAX]` Author osteopathy form template as JSON Schema → `packages/db/seed/form-templates/osteopathy-v1.json` (PT + EN labels, `ai_extractable` flags)
- `[MAX]` Author physiotherapy form template once owner provides sample
- `[MAX]` Extract every user-facing string → `packages/i18n/strings.pt.json` + `strings.en.json`
- `[MAX]` Author appointment reminder email templates PT + EN
- `[MAX]` Author post-visit email templates PT + EN
- `[MAX]` Author SMS templates PT + EN (160-char compliant)
- `[MAX]` Write `docs/architecture.md` from the mega plan

---

## Phase 2 — Infrastructure

- `[YOU]` Monorepo scaffold (pnpm + Turborepo + Next 15)
- `[YOU]` Drizzle migrations runner + first migration deployed to Supabase dev
- `[YOU]` CI/CD GitHub Actions: lint, typecheck, test on PR; deploy on merge
- `[YOU]` Vercel deploy preview wired per branch; production wired to `main`
- `[YOU]` Auth flow end-to-end (signup, login, JWT with `tenant_id` + role)
- `[YOU]` Sentry SDK installed in `apps/web`; sourcemaps uploading
- `[YOU]` Env var management via Vercel; `.env.example` committed
- `[YOU]` Supabase branching enabled (DB branch per PR)
- `[MAX]` Storybook scaffold for `packages/ui`
- `[MAX]` Component docs as components are built (ongoing)
- `[MAX]` Set up GitHub Projects board mirroring Miro phases
- `[MAX]` Apply brand tokens to `packages/ui` Tailwind config

---

## Phase 3 — Core Build

Six parallel streams, all `[YOU]` for implementation. Max takes the horizontal QA + content layer.

- `[YOU]` ~~Stream A — **Patients**: CRUD, search, merge, multi-location assignment, audit log~~ ✅ **Shipped** (PR #47)
- `[YOU]` ~~Stream B — **Scheduling**: agenda UI, recurring, conflict detection, vacation/availability templates, room conflicts~~ ✅ **Shipped** (PRs #43, #49)
- `[YOU]` ~~Stream C — **Clinical records**: form engine, body chart, image uploads, versioning, signature~~ ✅ **Shipped** (PR #51)
- `[YOU]` Stream D — **AI ingestion**: endpoint, HMAC, validation, review queue, state machine — ⏳ pending AI partner auth contract
- `[YOU]` ~~Stream E — **Reminders**: Resend templates + Twilio SMS + Inngest schedulers~~ ✅ **Shipped** (PR #57)
- `[YOU]` ~~Stream F — **Admin**: tenant settings, users, roles, services per location, prices~~ ✅ **Shipped** (PR #41)
- `[MAX]` ~~Seed data — 50 fake patients, realistic PT names/addresses, varied appointment history~~ ✅ **Shipped** (PR #52)
- `[MAX]` ~~Test scenarios in plain English for every workflow (you turn into Playwright)~~ ✅ **Shipped** (PR #53 — 51 Playwright scenarios)
- `[MAX]` Manual QA pass on every PR — load preview URL, run workflow, write findings as issues — ⏳ pending QA user credentials
- `[MAX]` Bug triage: repro steps, severity, screenshots — ⏳ follows QA pass
- `[MAX]` Form template authoring as new therapy types arrive (RPG, NESA, massagem, pilates terapêutico) — ⏳ blocked on owner intake form PDFs
- `[MAX]` ~~UI copy review — every screen, every modal, every error state, PT + EN~~ ✅ **Shipped** (PR #55 — 12 fixes, see `docs/i18n-copy-review.md`)
- `[MAX]` ~~Maintain `docs/` as features ship~~ ✅ **This PR**
- `[MAX]` Weekly demo prep: 3-min Loom walking through what shipped — ⏳ pending demoable login

---

## Phase 4 — External Integrations

- `[YOU]` **InvoiceXpress**: issue, retrieve, void, list, error handling, retry via Inngest
- `[YOU]` **IfThenPay**: MB + MB Way payment requests, callback handler, reconciliation
- `[YOU]` **Stripe**: card payments, webhook handler, refund flow
- `[YOU]` **AI partner**: end-to-end ingestion test, signed test payload, full state machine cycle
- `[YOU]` Locked-record print: clinical report PDF with logo + clinic contacts + fiscal data
- `[MAX]` Invoice template design (PDF layout) — logo, contacts, fiscal info, NIF field, fatura-recibo format
- `[MAX]` Clinical report PDF template design (header, footer, signature block, print branding)
- `[MAX]` Declaration templates (presence, treatment) — content + layout
- `[MAX]` QA all integrations end-to-end on staging once each is shipped

---

## Phase 5 — Data Migration

- `[YOU]` Scraping worker (Playwright, resumable, rate-limited, idempotent)
- `[YOU]` Importer: staging → validation → production pipeline
- `[YOU]` Reconciliation report generator (per-batch diff: source vs target)
- `[YOU]` Edge case handlers (duplicate patients, missing fields, orphan appointments)
- `[MAX]` Spot-check reconciliation reports against random patient samples
- `[MAX]` Document migration edge cases as they emerge in `docs/migration-notes.md`
- `[MAX]` Coordinate sign-off batches with owner (you brief Max, he handles owner-facing comms)
- `[MAX]` Build the "migration health" dashboard content (numbers, status, next batch)

---

## Phase 6 — Testing & Polish

- `[YOU]` Playwright E2E suite — top 20 workflows
- `[YOU]` Performance pass: agenda load <1s for full week, patient search <300ms
- `[YOU]` Permission audit: deliberate RLS-break attempts across tenants
- `[YOU]` Backup + restore drill (full DB restore from snapshot, timed)
- `[YOU]` P0/P1 bug fix sweep
- `[MAX]` Exhaustive manual QA — every screen, every role, every permission combination
- `[MAX]` Copy/i18n consistency pass — terminology, capitalization, tone
- `[MAX]` Accessibility check — keyboard navigation, contrast, screen reader labels
- `[MAX]` Cross-browser QA (Chrome, Safari, Firefox; mobile responsive)
- `[MAX]` Maintain bug board: triage, prioritize with you, close as fixed

---

## Phase 7 — Soft Launch

- `[YOU]` Cutover plan written: rollback steps, fallback Fisiozero access, comms script
- `[YOU]` On-call rotation set: you primary, Max secondary triage
- `[YOU]` Production monitoring: Sentry alerts, Supabase usage dashboards, Vercel logs
- `[YOU]` Parallel run config: which workflows dual-entered, which already migrated
- `[MAX]` Train-the-trainer documentation: short videos for staff (record with Loom)
- `[MAX]` In-app help text + tooltips authored
- `[MAX]` FAQ doc for staff (`docs/staff-faq.md`)
- `[MAX]` Daily staff feedback log during parallel run

---

## Phase 8 — Full Launch

- `[YOU]` Cutover execution: flip DNS / config flags, system of record changes
- `[YOU]` Fisiozero set to read-only access for staff
- `[YOU]` Stylus scheduling decommissioned
- `[YOU]` Post-cutover smoke tests: every critical workflow live
- `[MAX]` Launch comms to staff (email + WhatsApp group message, PT)
- `[MAX]` Launch announcement copy for OsteoJP team (internal)
- `[MAX]` Staff cheat sheet (1-pager, what changed, where to find things)

---

## Phase 9 — Post-Launch

- `[YOU]` 2-week hypercare: daily check-ins with owner, rapid bug fixes
- `[YOU]` V1.1 architecture spikes (patient portal, WhatsApp)
- `[YOU]` Monthly release cadence established
- `[YOU]` Performance + cost review at 30 days
- `[MAX]` V1.1 backlog grooming with owner inputs
- `[MAX]` Patient-facing portal copy (PT + EN) prepared for V1.1
- `[MAX]` Quarterly retro doc — what worked, what didn't, what's next
- `[MAX]` Owner-facing monthly status reports
# Mega Plan — OsteoJP Platform

> Full phased task plan for the OsteoJP build, from foundations to post-launch. Each task is owned by either `[YOU]` (Ivan, lead engineer) or `[MAX]` (Max, content/QA/docs).
>
> Companion documents: [`handoff-brief.md`](./handoff-brief.md) (team context), [`claude-md-reference.md`](./claude-md-reference.md) (architectural rules).

---

## Phase 0 — Foundations ✅

- `[YOU]` ~~Lock tech stack against handoff plan~~ ✅
- `[YOU]` ~~Open Supabase EU project (Frankfurt region)~~ ✅
- `[YOU]` ~~Open Vercel project + reserve `app.osteojp.pt`, `app-dev.osteojp.pt`, `api.osteojp.pt`~~ ✅
- `[YOU]` ~~Open Resend + Sentry EU + Twilio (PT sender) + IfThenPay sandbox~~ ✅ **Note: Stripe removed from scope** (clinic uses cash, terminal, MB Way only)
- `[YOU]` ~~InvoiceXpress account + sandbox API key~~ ✅ (existing account `osteojplda.app.invoicexpress.com`)
- `[YOU]` ~~Confirm AI partner authentication contract (API key + HMAC)~~ ✅
- `[YOU]` ~~Onboard Max: GitHub collaborator, repo clone, machine setup verified~~ ✅
- `[YOU]` ~~Commit OsteoJP `CLAUDE.md` to repo root~~ ✅
- `[YOU]` ~~Set branch protection on `main` (PR + 1 approval + status checks required)~~ ✅
- `[MAX]` ~~Complete machine setup (brew, git, node, python, VS Code, Claude Code, GitHub Desktop)~~ ✅
- `[MAX]` ~~Extract brand tokens from OsteoJP logo (palette hex, typography recs) → `docs/brand-tokens.md`~~ ✅ **Shipped** (`docs/brand-tokens.md`)
- `[MAX]` ~~Scrape osteojp.pt + write brand voice guide (tone, PT/EN vocabulary) → `docs/brand-voice.md`~~ ✅ **Shipped** (`docs/brand-voice.md`)
- `[MAX]` ~~Seed `docs/` folder with handoff brief, mega plan, CLAUDE.md reference~~ ✅
- `[MAX]` ~~Create `.github/PULL_REQUEST_TEMPLATE.md` + issue templates (bug, task, content)~~ ✅
- `[MAX]` ~~Open service accounts: Resend, Sentry EU, Twilio, InvoiceXpress~~ ✅
- `[MAX]` IfThenPay sandbox — ⏳ account created by Max via website signup; awaiting reply with API keys → hand to Ivan as `IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_ANTI_PHISHING_KEY`, `IFTHENPAY_CALLBACK_URL`

---

## Phase 1 — Discovery & Design ✅

- `[YOU]` ~~DB schema v0 in Drizzle (tenants, users, roles, patients, locations, services, appointments, form_templates, clinical_episodes, clinical_records, attachments, audit_log, invoices)~~ ✅
- `[YOU]` ~~RLS policies for every domain table~~ ✅
- `[YOU]` ~~Permission matrix in code (`packages/auth/permissions.ts`)~~ ✅
- `[YOU]` ~~API surface spec — OpenAPI doc covering all V1 endpoints~~ ✅
- `[YOU]` ~~AI ingestion endpoint contract finalized + signed off with partner~~ ✅
- `[YOU]` ~~Wireframe sign-off for 6 critical screens~~ ✅
- `[MAX]` ~~Wireframes for the 6 critical screens (Excalidraw or Figma, low-fi)~~ ✅ **Shipped** (`docs/wireframes/`)
- `[MAX]` ~~Author osteopathy form template as JSON Schema → `packages/db/seed/form-templates/osteopathy-v1.json`~~ ✅ **Shipped** (PR #64)
- `[MAX]` ~~Author physiotherapy form template~~ ✅ **Shipped** (PR #64, v3)
- `[MAX]` ~~Extract every user-facing string → `packages/i18n/strings.pt.json` + `strings.en.json`~~ ✅ **Shipped** (PR #55)
- `[MAX]` ~~Author appointment reminder email templates PT + EN~~ ✅ **Shipped** (`docs/email-templates-reminders.md`)
- `[MAX]` ~~Author post-visit email templates PT + EN~~ ✅ **Shipped** (`docs/email-templates-post-visit.md`)
- `[MAX]` ~~Author SMS templates PT + EN (160-char compliant)~~ ✅ **Shipped** (`docs/sms-templates.md`)
- `[MAX]` ~~Write `docs/architecture.md` from the mega plan~~ ✅ **Shipped** (`docs/architecture.md`)

---

## Phase 2 — Infrastructure ✅

- `[YOU]` ~~Monorepo scaffold (pnpm + Turborepo + Next 15)~~ ✅
- `[YOU]` ~~Drizzle migrations runner + first migration deployed to Supabase dev~~ ✅
- `[YOU]` ~~CI/CD GitHub Actions: lint, typecheck, test on PR; deploy on merge~~ ✅
- `[YOU]` ~~Vercel deploy preview wired per branch; production wired to `main`~~ ✅
- `[MAX]` ~~Vercel project for `apps/portal` created (2026-06-10)~~ ✅ project `osteojp-portal`, Node 22.x, analytics off, env vars set, live at `osteojp-portal.vercel.app`. Custom domain `patient.osteojp.pt` deferred to go-live.
- `[YOU]` ~~Auth flow end-to-end (signup, login, JWT with `tenant_id` + role)~~ ✅
- `[YOU]` ~~Sentry SDK installed in `apps/web`; sourcemaps uploading~~ ✅
- `[YOU]` ~~Env var management via Vercel; `.env.example` committed~~ ✅
- `[YOU]` ~~Supabase branching enabled (DB branch per PR)~~ ✅
- `[MAX]` ~~Storybook scaffold for `packages/ui`~~ ✅
- `[MAX]` ~~Component docs as components are built~~ ✅ (ongoing)
- `[MAX]` ~~Set up GitHub Projects board mirroring Miro phases~~ ✅
- `[MAX]` ~~Apply brand tokens to `packages/ui` Tailwind config~~ ✅

---

## Phase 3 — Core Build ✅

Six parallel streams (Ivan) + horizontal QA/content layer (Max).

### Staff Platform Streams (Ivan)

- `[YOU]` ~~Stream A — **Patients**: CRUD, search, merge, multi-location assignment, audit log~~ ✅ **Shipped** (PR #47)
- `[YOU]` ~~Stream B — **Scheduling**: agenda UI, recurring, conflict detection, vacation/availability templates, room conflicts~~ ✅ **Shipped** (PRs #43, #49)
- `[YOU]` ~~Stream C — **Clinical records**: form engine, body chart, image uploads, versioning, signature~~ ✅ **Shipped** (PR #51)
- `[YOU]` ~~Stream D — **AI ingestion**: endpoint, HMAC, validation, review queue, state machine~~ ✅ **Shipped**
- `[YOU]` ~~Stream E — **Reminders**: Resend templates + Twilio SMS + Inngest schedulers~~ ✅ **Shipped** (PR #57)
- `[YOU]` ~~Stream F — **Admin**: tenant settings, users, roles, services per location, prices~~ ✅ **Shipped** (PR #41)

### Patient Portal (`apps/portal`) — all phases merged to main

| Phase | What | PRs | Status |
|---|---|---|---|
| A | Auth shell, routing, middleware, i18n (245 keys PT+EN), brand tokens | #130–134 | ✅ merged |
| B | 4-step booking flow + appointments list + 24h server-side cancel | #130–134 | ✅ merged |
| C | Account page + `PATCH /api/v1/patient/profile` (phone, address, postalCode, city) | #130–134 | ✅ merged |
| D | JSON Schema form renderer + 7 embedded templates | #135 | ✅ merged |
| E | Documents/invoices placeholder | — | ⏸ deferred to Phase 4 |
| F | Clinics page (real data), a11y pass (WCAG 2.5.8, skip links, aria-current, focus-visible) | #136 | ✅ merged |

**Portal fixes:**
- PR #152 — magic link login spacing fix ✅
- PR #154 — `middleware.ts` → `proxy.ts` rename ✅

### Form Templates (7 total — `packages/db/seed/form-templates/`)

| Key | Template | Status |
|---|---|---|
| `general-anamnese-v1` | General anamnesis (23 fields, 6 sections) | ✅ |
| `osteopathy-v2` | Osteopathy intake | ✅ |
| `physiotherapy-v1` | Physiotherapy intake (v3, with consent + x-fisiozero-field mappings) | ✅ |
| `nesa-v1` | NESA — complete. 4 NESA-specific fields + 2 contraindications added (Ivan sign-off 2026-06-11). One item pending: epilepsy absolute/relative classification (JP) | 🔶 |
| `massagem-terapeutica-v1` | Thin wrapper referencing physio structure | ✅ |
| `pilates-terapeutico-v1` | Thin wrapper referencing physio structure | ✅ |
| `rpg-v1` | Thin wrapper referencing physio structure | ✅ |

### Max — Phase 3 QA/Content Layer

- `[MAX]` ~~Seed data — 50 fake patients (25 Linda-a-Velha, 25 Castelo Branco), idempotent loader~~ ✅ **Shipped** (`packages/db/seed/patients.ts`, PR #52)
- `[MAX]` ~~Test scenarios in plain English — 45 portal QA scenarios~~ ✅ **Shipped** (`docs/patient-portal/qa-scenarios-portal.md`, PR #135)
- `[MAX]` ~~Portal i18n strings — 270 keys PT+EN (nested + flat)~~ ✅ **Shipped** (PR #135)
- `[MAX]` ~~Unauthenticated QA pass — all scenarios passing~~ ✅ **Shipped** (`docs/qa-pass-portal-2026-06-09.md`)
- `[MAX]` ~~UI copy review — PT + EN, 12 fixes~~ ✅ **Shipped** (PR #55, `docs/i18n-copy-review.md`)
- `[MAX]` Manual QA pass (authenticated flows) — ⏳ blocked on Ivan activating test patient **Maria João Silva**
- `[MAX]` ~~NESA form clinical fields~~ ✅ — structure + 4 NESA fields + 2 contraindications shipped (PR #163). One item remaining: epilepsy absolute/relative contraindication classification — pending JP ruling.
- `[MAX]` Wave C full QA pass (45 scenarios) — ⏳ blocked on Ivan building Wave C UI screens

---

## Phase 4 — External Integrations 🔶

Backend integrations complete. UI + payment go-live blocked on João Pedro.

- `[YOU]` ~~**InvoiceXpress**: issue, retrieve, void, list, error handling, retry via Inngest~~ ✅
- `[YOU]` ~~**IfThenPay**: MB + MB Way payment requests, callback handler, reconciliation~~ ✅ backend done; go-live blocked on JP sandbox keys
- `[YOU]` ~~**AI partner**: end-to-end ingestion test, signed test payload, full state machine cycle~~ ✅
- `[YOU]` ~~Locked-record print: clinical report PDF with logo + clinic contacts + fiscal data~~ ✅ (PR #128)
- `[YOU]` **Stripe** — ❌ removed from scope (clinic uses cash, terminal, MB Way only)
- `[YOU]` `/invoicing` UI route — ⏳ pending
- `[MAX]` ~~Invoice template design (PDF layout) — logo, contacts, fiscal info, NIF, fatura-recibo format~~ ✅
- `[MAX]` ~~Clinical report PDF template design (header, footer, signature block, print branding)~~ ✅
- `[MAX]` ~~Declaration templates (presence, treatment) — content + layout~~ ✅
- `[MAX]` QA all integrations end-to-end on staging — ⏳ blocked on JP sandbox keys + VAT sign-off

**Waiting on João Pedro:**
- PT entity IfThenPay sandbox keys (`IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_ANTI_PHISHING_KEY`, `IFTHENPAY_CALLBACK_URL`)
- VAT 23% sign-off
- Protocol-discount invoicing decision
- Protocol label visibility decision
- `ai_extractable` Group A/B final sign-off
- Sender display name (Resend/Twilio) — ✅ Twilio PT alphanumeric sender "OsteoJP" registered and approved 2026-06-11. Ivan to update `TWILIO_SENDER_ID` env var in Vercel from the test number to `OsteoJP`.

---

## Phase 5–9 — Deprioritised

Phases 5 through 9 are explicitly out of scope for the current build cycle. No work to proceed on these phases.

---

_Last updated: 2026-06-10_

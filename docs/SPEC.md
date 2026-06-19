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
- `[YOU]` ~~Set branch protection on `main` (PR + CI status checks required)~~ ✅ **Note: approval requirement temporarily removed while Ivan is away; re-enable before real patient data lands**
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

- `[YOU]` ~~Monorepo scaffold (pnpm + Turborepo + **Next.js 16** App Router)~~ ✅
- `[YOU]` ~~Drizzle migrations runner + first migration deployed to Supabase dev~~ ✅
- `[YOU]` ~~CI/CD GitHub Actions: lint, typecheck, test on PR; deploy on merge~~ ✅ Three required gates: **Lint + typecheck + test**, **DB-gated tests (RLS isolation, seeded DB)**, **Playwright E2E (seeded DB)**. Vercel checks are informational only (rate-limited on Hobby tier).
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

### Staff Platform — V1 Streams (Ivan) ✅

- `[YOU]` ~~Stream A — **Patients**: CRUD, search, merge, multi-location assignment, audit log~~ ✅ **Shipped** (PR #47)
- `[YOU]` ~~Stream B — **Scheduling**: agenda UI, recurring, conflict detection, vacation/availability templates, room conflicts~~ ✅ **Shipped** (PRs #43, #49)
- `[YOU]` ~~Stream C — **Clinical records**: form engine, body chart, image uploads, versioning, signature~~ ✅ **Shipped** (PR #51)
- `[YOU]` ~~Stream D — **AI ingestion**: endpoint, HMAC, validation, review queue, state machine~~ ✅ **Shipped**
- `[YOU]` ~~Stream E — **Reminders**: Resend templates + Twilio SMS + Inngest schedulers~~ ✅ **Shipped** (PR #57)
- `[YOU]` ~~Stream F — **Admin**: tenant settings, users, roles, services per location, prices~~ ✅ **Shipped** (PR #41)

### Staff Platform — V2 Glass Restyle (Waves 1–7) ✅

Full visual restyle of all staff screens onto the `v2-glass` design system (Tailwind v4 tokens, `@osteojp/ui` component library). All waves merged to `main`.

| Wave | What | Status |
|---|---|---|
| W1 | Dashboard (Início) | ✅ merged (#244) |
| W2 | Agenda — glass + appointment drawer refactor | ✅ merged (#245) |
| W3 | Pacientes list + profile + episode pages | ✅ merged |
| W4 | Fichas Clínicas (clinical records) | ✅ merged (#246) |
| W5 | Revisão (AI review queue) | ✅ merged (#243) |
| W6 | Administração | ✅ merged (#251) |
| W7 | Marcações (bookings list) + copy/i18n audit | ✅ merged (#254, #257, #258) |

**Post-restyle fixes:**
- PR #260 — fix(ingestion): log the real DB error on the 500 path
- PR #261 — fix(web): exclude Inngest subpaths from session middleware
- PR #265 — feat(web): wire M1 dashboard placeholders
- PR #278 — fix(portal): guard dashboard session call against error boundary
- PR #287 — fix(db): `phone_digits` generated column + trgm index (phone search perf)
- PR #288 — fix(web): remove unbounded patient prefetch from agenda
- PR #289 — fix(web): P2 copy fixes — sign out, remarcar, guardar, editar dados, error strings
- PR #291 — fix(web): P3 copy fixes — sentence case, arrows, BrandLockup, terminology

### M1: Dashboard & Portal Polish (Max, autonomous) — Partially complete

- `[MAX]` ~~Wire M1 dashboard placeholders~~ ✅ **Shipped** (PR #265)
- `[MAX]` ~~Dashboard session error guard~~ ✅ **Shipped** (PR #278)
- `[MAX]` **Receita (mês):** revenue aggregation from issued invoices — ⏳ pending
- `[MAX]` **Resumo semanal:** weekly appointment counts — ⏳ pending
- `[MAX]` **Notas rápidas:** persistence, scoped per-staff — ⏳ pending
- `[MAX]` **Marcações query tuning:** confirm bounded date-window fetch — ⏳ pending
- `[MAX]` **Portal i18n runtime:** pt-PT default, language switcher deferred — ⏳ pending
- `[MAX]` **Refresh `docs/SPEC.md`:** this document — ✅ done (2026-06-19)

### M2: Migration Logic, Wave 2 (Max) ✅ — Complete

- `[MAX]` ~~Migration batch validation + edge case handlers~~ ✅ **Shipped** (PR #273)
- `[MAX]` ~~Migration reconciliation report generator~~ ✅ **Shipped** (PR #274)
- `[MAX]` ~~Migration health dashboard queries~~ ✅ **Shipped** (PR #275)

### M3: CI Hardening (Ivan-only, HOLD)

Both items touch load-bearing CI gates or migrations. **Drafts only — do not merge without Ivan's review.**

- `[YOU]` **Pin `supabase/setup-cli`** in `db-tests.yml` and `e2e.yml` (currently float on `latest`) — ⏳ HOLD
- `[YOU]` **Relocate `service_role` grants** from `supabase/seed.sql` into migration `0018` — ⏳ HOLD

### Patient Portal (`apps/portal`) — all phases merged to main

| Phase | What | PRs | Status |
|---|---|---|---|
| A | Auth shell, routing, middleware, i18n (245 keys PT+EN), brand tokens | #130–134 | ✅ merged |
| B | 4-step booking flow + appointments list + 24h server-side cancel | #130–134 | ✅ merged |
| C | Account page + `PATCH /api/v1/patient/profile` (phone, address, postalCode, city) | #130–134 | ✅ merged |
| D | JSON Schema form renderer + 7 embedded templates | #135 | ✅ merged |
| E | Documents/invoices placeholder | — | ⏸ deferred to Phase 4 |
| F | Clinics page (real data), a11y pass (WCAG 2.5.8, skip links, aria-current, focus-visible) | #136 | ✅ merged |

**Portal fixes (post-Phase F):**
- PR #152 — magic link login spacing fix ✅
- PR #154 — `middleware.ts` → `proxy.ts` rename ✅
- PR #263 — fix(portal): add `/auth/reset-password` page (closes #234) ✅
- PR #271 — fix(portal): announce download error to screen readers (closes #268) ✅
- PR #272 — fix(portal): NavButton role + auth layout landmark (closes #269 #270) ✅
- PR #276 — fix(portal): P3 a11y fixes — contrast, labels, live regions ✅
- PR #278 — fix(portal): guard dashboard session call against error boundary ✅
- PR #283 — fix(portal): derive dashboard greeting name from `patients` table (closes #282) ✅
- PR #290 — fix(portal): sync `first_name`/`last_name` to auth metadata on profile save ✅

**Portal a11y audit (2026-06-17) — `docs/qa-a11y-portal-2026-06-17.md`:**
Full source-code audit of 38 files. 1 P1, 2 P2, 5 P3 findings. All P1 and P2 findings fixed (PRs #271, #272). All 5 P3 findings now resolved:

| # | Finding | Fix |
|---|---|---|
| 4 | Insufficient contrast on secondary text | PR #276 |
| 5 | Missing `aria-label` on icon-only buttons | PR #276 |
| 6 | `appointments/[id]/AppointmentActions.tsx` — `disabled` removes cancel from tab order | ✅ `aria-disabled` + click guard in place |
| 7 | Missing live region on booking error | PR #276 |
| 8 | Skip link missing `focus-visible:ring-2 ring-focus-ring ring-offset-2` | ✅ classes in `PortalChrome.tsx` |

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

### Migration sequence (as of 2026-06-19)

18 migrations in `supabase/migrations/`. Next free number: **`0018`**.

| # | Migration | Notes |
|---|---|---|
| 0000 | `empty_runaways` | Scaffold |
| 0001 | `rls` | Row-level security policies |
| 0002 | `auth_token_hook` | JWT custom claims hook |
| 0003 | `grants` | Service-role grants |
| 0004 | `clinical_record_supersedes` | Addendum versioning |
| 0005 | `patient_merge_multilocation` | Merge + multi-location |
| 0006 | `availability_timeoff` | Availability templates + time-off |
| 0007 | `service_location_prices` | Per-location price overrides |
| 0008 | `ai_ingestion_requests` | AI partner ingestion table |
| 0009 | `tenant_status` | Tenant active/suspended |
| 0010 | `patient_identity_layer` | NIF + identity fields |
| 0011 | `patient_form_intake` | Form intake linkage |
| 0012 | `patient_jwt_security_definer` | JWT security definer function |
| 0013 | `review_finalize_audit` | AI review finalization audit |
| 0014 | `migration_staging` | Fisiozero migration staging |
| 0015 | `patients_phone_digits_index` | `phone_digits` generated column + btree + trgm GIN index |
| 0016 | `agenda_location_start_idx` | Agenda location + start-time composite index |
| 0017 | `perf_indexes` | Additional performance indexes |

### Phase 3 QA / Content

- `[MAX]` ~~Seed data — 50 fake patients (25 Linda-a-Velha, 25 Castelo Branco), idempotent loader~~ ✅ **Shipped** (`packages/db/seed/patients.ts`, PR #52)
- `[MAX]` ~~Test scenarios in plain English — 45 portal QA scenarios~~ ✅ **Shipped** (`docs/patient-portal/qa-scenarios-portal.md`, PR #135)
- `[MAX]` ~~Portal i18n strings — 270 keys PT+EN (nested + flat)~~ ✅ **Shipped** (PR #135)
- `[MAX]` ~~Unauthenticated QA pass — all scenarios passing~~ ✅ **Shipped** (`docs/qa-pass-portal-2026-06-09.md`)
- `[MAX]` ~~UI copy review — PT + EN, 12 fixes~~ ✅ **Shipped** (PR #55, `docs/i18n-copy-review.md`)
- `[MAX]` ~~Staff platform copy/i18n audit (2026-06-18)~~ ✅ **Shipped** (`docs/qa-copy-staff-2026-06-18.md`, PR #286)
- `[MAX]` ~~Staff a11y audit (portal, 2026-06-17)~~ ✅ **Shipped** (`docs/qa-a11y-portal-2026-06-17.md`, PR #267)
- `[MAX]` ~~Cross-browser QA portal (2026-06-18)~~ ✅ **Shipped** (`docs/qa-cross-browser-2026-06-18.md`, PR #279)
- `[MAX]` ~~Phase 6 performance audit (2026-06-18)~~ ✅ **Shipped** (`docs/qa-performance-2026-06-18.md`, PR #281)
- `[MAX]` ~~Staff platform FAQ + help text~~ ✅ **Shipped** (`docs/help-text-staff.md`, PR #298)
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
- `[YOU]` `/invoicing` UI route — ⏳ pending (table scaffold live at `apps/web/app/invoicing/page.tsx`; data layer and drawer gated on Phase 4 activation)
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

**Waiting on Andrei:**
- Fisiozero Tier-1 per-field mapping spec — gates Stream D per-field mapping. Ingestion is proven (PR #262); payload stored verbatim until spec arrives.

---

## Phase 5 — Performance & Observability 🔶

Performance baseline established. P1 regressions resolved.

- `[MAX]` ~~Phase 6 performance audit~~ ✅ (`docs/qa-performance-2026-06-18.md`, PR #281)
- `[MAX]` ~~P1 fix: phone search sequential scan~~ ✅ `phone_digits` generated column + trgm GIN index (PR #287)
- `[MAX]` ~~P1 fix: unbounded patient prefetch on agenda~~ ✅ prefetch removed (PR #288)
- `[YOU]` Agenda load < 1 s target — ⏳ pending (index `0016_agenda_location_start_idx` + `0017_perf_indexes` landed; E2E measurement pending)
- `[YOU]` Patient search < 300 ms target — ⏳ pending (perf indexes landed; measurement pending)

---

## Phase 6–9 — Deprioritised

Phases 6 through 9 are explicitly out of scope for the current build cycle. No work to proceed on these phases.

---

## Go-live sequence
*(locked, for when gates clear)*

1. Supabase Pro on (before any real patient data).
2. Backup and restore drill.
3. Fisiozero final extraction.
4. Import to prod.
5. DNS: `app.osteojp.pt`, `patient.osteojp.pt`, Resend MX/SPF/DKIM, resolve `api.osteojp.pt` host conflict.
6. Go live.

**Supabase Pro precedes the cutover extraction.**

---

_Last updated: 2026-06-19 (refreshed for V2 glass restyle, portal fixes, M1/M2 completion, migration sequence 0015–0017, a11y P3 resolution, perf P1 fixes)_

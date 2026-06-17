# OsteoJP — Session Handoff
**Date:** 2026-06-17
**Prepared by:** Max (sm33xy) + Claude
**Session:** 10 → 11 handoff

---

## COPY THIS ENTIRE BLOCK AS YOUR FIRST MESSAGE IN THE NEXT CHAT

---

You are continuing work on **OsteoJP**, a Portuguese clinic management platform for osteopathy and physiotherapy. I am Max, the QA, content, i18n, and portal co-lead. The lead engineer is Ivan (happygamer1919-tech). The clinic owner is João Pedro (JP).

**Repo:** `happygamer1919-tech/OsteoJP` (Turborepo monorepo, pnpm 11.1.3, Node 22.x, TypeScript)
**Apps:** `apps/web` (staff platform), `apps/admin`, `apps/api` (patient API), `apps/portal` (patient portal)
**Infra:** Supabase EU Frankfurt (production ref: `jaxmkwoxjcgzkwxgbayx`), Vercel fra1, Inngest
**UI:** Next.js, shadcn/ui, Drizzle ORM, Tailwind
**Working directory (Mac):** `~/Projects/OsteoJP`

---

## What this project is

OsteoJP is a ground-up clinic management platform replacing Fisiozero for a Portuguese osteopathy and physiotherapy clinic. Two active locations: Linda-a-Velha and Castelo Branco. Six therapy types: Osteopatia, Fisioterapia, Massagens, Pilates Terapêutico, NESA, RPG. The platform has a staff-facing web app (Ivan), a patient-facing portal (Max/Ivan), and a patient API. Everything is PT-first, multi-tenant, RLS-enforced.

---

## Phase status

- ✅ Phase 0 — Foundations
- ✅ Phase 1 — Discovery & Design
- ✅ Phase 2 — Infrastructure
- ✅ Phase 3 — Core Build (staff platform + patient portal phases A–F)
- 🔶 Phase 4 — Payments (backend done; blocked on IfThenPay wiring + InvoiceXpress)
- ⬜ Phases 5–9 — Explicitly deprioritised

---

## What happened in session 10 (2026-06-17)

### apps/api deployed to Vercel

`apps/api` is now live at **`https://osteojp-api.vercel.app`** (fra1 region).

- `NEXT_PUBLIC_API_URL=https://osteojp-api.vercel.app` set on `osteojp-portal` Production scope in Vercel.
- This unblocks all portal screens that fetch from the patient API (Dashboard, Marcações, Formulários, Booking).

### Production DB credentials reset

Production DB password was reset (new value in Max's keychain / Vercel dashboard — do not store here). All `DATABASE_URL` env vars updated across the three Vercel projects (`osteojp-platform`, `osteojp-portal`, `osteojp-api`) to use the `aws-1-eu-central-1` pooler endpoint.

### Maria João Silva test account (canonical QA patient)

| Field | Value |
|---|---|
| Email | `triboimax635+maria@gmail.com` |
| Portal password | `MariaQA2026!` |
| Patient record UUID | `a1b2c3d4-0000-0000-0000-000000000001` |
| Supabase auth UID | `773d6c96-f0a7-42cf-9cb2-7aaa178e162b` |
| Portal URL | `https://osteojp-portal.vercel.app` |

### Vercel token

A Vercel token was created this session for automation use. The value is in Max's notes only — it must be rotated before session 11 begins. Do not commit it to the repo.

### PRs merged this session

| PR | Description |
|---|---|
| #230 | `fix(portal)`: use `setSession()` to exchange magic link hash token (auth fix) |
| #231 | `fix(portal)`: QA round 1 — name fallback + appointments error copy |
| #235 | `feat(portal)`: Portuguese 404 not-found page |
| #236 | `fix(ui)`: distinct `aria-label` on desktop + mobile nav in PortalShell |
| #249 + #250 | `fix(api)`: replace `getClaims()` with `getSession()` + local JWT decode in `getPatientPrincipal()` (fixes #247) |
| #255 | `copy(i18n)`: fix 3 admin string issues found during V2-W6 audit |
| #257 | `copy/i18n`: Marcações missing filter keys + EN register fix; PLAN.md updated |

### Authenticated QA pass — partial

QA run against `https://osteojp-portal.vercel.app` as Maria João Silva:

| Screen | Result | Notes |
|---|---|---|
| Clínicas | ✅ Pass | |
| Conta | ✅ Pass | |
| Dashboard | ❌ Fail | Pending E2E retest now that `apps/api` is deployed |
| Marcações | ❌ Not retested | Blocked until api is live — now unblocked |
| Formulários | ❌ Not retested | Blocked until api is live — now unblocked |
| Booking | ❌ Not retested | Blocked until api is live — now unblocked |

---

## Current blockers

| Blocker | Waiting on | Impact |
|---|---|---|
| Dashboard / Marcações / Formulários / Booking QA | Session 11 retest (api now live) | Authenticated QA incomplete |
| Issue #234: `/auth/reset-password` 404 | Ivan | Reset-password flow broken for patients |
| Issue #114: cross-tenant email uniqueness | Ivan (parked, V1.1) | Single-tenant at launch; licensing-phase decision |
| Rotate Vercel token | Max | Token above must be rotated before use in next session |
| Ivan: portal invite UI | Ivan | Clean auth flow for real patients |
| Ivan: `patient.osteojp.pt` DNS | Ivan | Custom domain not resolving |
| Ivan: GitHub Actions secrets for e2e CI | Ivan | CI e2e uses dev DB |
| Ivan: rotate `AI_INGESTION_HMAC_SECRET` | Ivan | Exposed during live ingestion test |
| Ivan: rotate `DATABASE_URL_DIRECT` + add `PROD_DATABASE_URL_DIRECT` secret | Ivan | |
| IfThenPay wiring | Ivan (has keys) | Phase 4 |
| JP: epilepsy NESA classification | João Pedro | `nesa-v1.json` final field |
| JP: brand voice Q1 + Q4 | João Pedro | Voice guide not fully locked |

---

## First task of session 11

**Retest all data screens now that `apps/api` is live.**

Log in as Maria João Silva (`triboimax635+maria@gmail.com` / `MariaQA2026!`) at `https://osteojp-portal.vercel.app` and retest:

1. **Dashboard** — appointment counts, upcoming list, revenue summary. Should now resolve instead of erroring.
2. **Marcações** — full bookings list, filters, pagination.
3. **Formulários** — form list and individual form detail.
4. **Booking** — full booking flow (therapist → date → time → confirm).

For each screen: note what loads, what errors, what is visually broken. Update the QA table above. Open a bug PR for any new failures.

---

## Key files

- `docs/handoff-2026-06-12-session10.md` — previous handoff (session 9→10)
- `docs/HANDOFF-2026-06-17.md` — Ivan-away operating contract (Ivan's handoff doc, wider scope)
- `docs/patient-portal/qa-scenarios-portal.md` — 45 QA scenarios
- `docs/DECISIONS.md` — all decisions including Wave 2+3+4
- `docs/QUESTIONS.md` — open questions
- `docs/brand-voice.md` — complete with §6 microcopy patterns + §7 do/don't
- `docs/design/PLAN.md` — Wave task list with completion ticks
- `packages/i18n/src/strings.pt.json` — PT strings (staff platform)
- `packages/i18n/src/strings.en.json` — EN strings (staff platform)
- `packages/i18n/src/portal/strings.pt.json` — PT strings (patient portal)
- `packages/i18n/src/portal/strings.en.json` — EN strings (patient portal)

---

## Environment

| Resource | URL / ref |
|---|---|
| Portal | `https://osteojp-portal.vercel.app` (production, `main`) |
| Staff platform | `https://osteojp-platform.vercel.app` |
| Patient API | `https://osteojp-api.vercel.app` ← **new this session** |
| Production Supabase | `https://jaxmkwoxjcgzkwxgbayx.supabase.co` |
| Dev Supabase | `https://ufbkzbyghvxtosyrkgjq.supabase.co` |
| GitHub | `https://github.com/happygamer1919-tech/OsteoJP` |

---

## People

| Person | Contact | Role |
|---|---|---|
| Max | sm33xy (GitHub) | QA, content, i18n, portal UI, copy, docs, infrastructure |
| Ivan | happygamer1919-tech (GitHub) | Lead engineer — apps/web, apps/api, DB, infra |
| João Pedro | Stamrud@gmail.com | Clinic owner — **English only** |
| Andrei | info@a-and-i-automation.com | AI/automation partner |

---

## Clinic reference data

### Linda-a-Velha
- Praça Central Plaza, n.º 1 – A, 2795-246 Linda-a-Velha
- 969 472 111 / 214 191 988 · clinica.osteojp@gmail.com
- Seg–Sex 09:00–19:00

### Castelo Branco
- R. Fernando Namora, n.º 6, 6000-140 Castelo Branco
- 969 877 553 / 272 328 221 · geral.castelobranco@osteojp.pt
- Seg–Sex 09:00–19:00

### Fiscal
- NIF/VAT: 510.200.427

### Brand tokens
- Teal: `#45B9A7`
- Magenta: `#8B1863`
- Grey (logo only): `#98B2C2`

---

## Recurring rules

1. Always `git checkout main && git pull` before branching.
2. Never push directly to main — PRs only.
3. Lockfile conflicts on every PR — resolve with `git checkout --ours` + `pnpm install --no-frozen-lockfile`.
4. macOS `sed -i` fails — use `perl -i -p -e 's/old/new/g'` or Python for multiline.
5. pnpm locked at 11.1.3.
6. JSON templates — validate with `python3 -c "import json; json.load(open('file.json'))"` before committing.
7. Never commit secrets — GitHub push protection is active.
8. Claude in Chrome — drops on long conversations, start fresh if tools disappear.
9. Miro — 3-board free limit hit, OsteoJP content lives inside existing board.
10. `private_notes` — hard-locked `ai_extractable: false`, never reaches AI pipeline.
11. SMS templates in PT — strip accents (GSM-7 constraint, documented exception).
12. Vercel free tier — 100 deployments/day limit. Monitor.
13. Any PR touching `db-tests.yml` or `e2e.yml` is an automatic HOLD for Ivan's review — do not self-merge.
14. One migration in flight at a time, sequential numbering. Next free number is `0015`.
15. Worktree isolation is mandatory for parallel terminals.

---

*Prepared end of session 10, 2026-06-17. Session 11 starts with a full retest of all portal data screens against the live API.*

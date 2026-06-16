# OsteoJP — Session Handoff
**Date:** 2026-06-11
**Prepared by:** Max (sm33xy) + Claude
**Session:** 8 → 9 handoff (comprehensive)

---

## COPY THIS ENTIRE BLOCK AS YOUR FIRST MESSAGE IN THE NEXT CHAT

---

You are continuing work on **OsteoJP**, a Portuguese clinic management platform for osteopathy and physiotherapy. I am Max, the QA, content, i18n, and portal co-lead. The lead engineer is Ivan (happygamer1919-tech). The clinic owner is João Pedro (JP).

**Repo:** `happygamer1919-tech/OsteoJP` (Turborepo monorepo, pnpm 11.1.3, Node 22.x, TypeScript)
**Apps:** `apps/web` (staff platform), `apps/admin`, `apps/api` (patient API), `apps/portal` (patient portal)
**Infra:** Supabase EU Frankfurt (production ref: `jaxmkwoxjcgzkwxgbayx`), Vercel fra1, Inngest
**UI:** Next.js 16, shadcn/ui, Drizzle ORM, Tailwind
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
- 🔶 Phase 4 — Payments (backend done; blocked on JP keys + VAT sign-off)
- ⬜ Phases 5–9 — Explicitly deprioritised

---

## What happened in session 8 (2026-06-11) — full account

### Started with
The session opened with Ivan's message giving NESA form sign-off and unblocking several items. Before that, we planned the patient portal on a Miro-equivalent board (6 frames: scope, flows, screens, data contracts, phases, open questions), then built it as an interactive HTML widget when Miro's 3-board free limit was hit. Ivan then reviewed it and we proceeded to execute.

### What we built and shipped (Max's PRs, all merged)

| PR | What | Why |
|---|---|---|
| #158 | i18n: soften portal login copy | "Entrar com link por email" → "Receber link de acesso por email". "Ainda não tem conta?" → "Ainda não tem acesso? A sua clínica entrará em contacto consigo." PT + EN. |
| #159 | docs: answer Q3 + Q4 | Q3 = dev credentials use a separate Supabase project (not production). Q4 = `osteojp-portal` Vercel project created by Max. |
| #160 | docs: 12 portal wireframes | All 12 patient portal screens as Excalidraw files in `docs/portal-wireframes/`. 390×844px mobile, PT-first, brand tokens applied. Source of truth for Wave C UI. |
| #161 | docs: SPEC + staff-faq fixes | SPEC IfThenPay owner corrected to MAX. staff-faq locations fixed (Montemor→Linda-a-Velha, x2). |
| #162 | docs: migration-notes.md stub | Phase 5 prep. Edge cases (duplicates, orphans, attachment migration, therapy type mapping, Stylus.pt). Batch log template. |
| #163 | fix(forms): nesa-v1.json complete | 4 NESA-specific fields (protocol, stimulation parameters, electrode placement, patient response — all `ai_extractable: false`). 2 contraindications (pacemaker, metal implants). Epilepsy classification pending JP. |
| #164 | fix(ci): skip DB/E2E on docs-only PRs | All doc PRs were failing required DB/E2E checks. Added path filter: docs/, *.md, *.excalidraw, packages/db/seed/ skip Supabase boot. Jobs still run and report green. |
| #171 | docs: session 8 closeout | SPEC NESA updated. Twilio reg doc. Session handoff. Brand tokens + brand voice open items resolved. |

### Ivan's PRs (also merged this session)
| PR | What |
|---|---|
| #165 | ci: manual gated prod-migrate workflow |
| #166 | feat(migration): migration staging table + RLS + 2 new test files |
| #167 | fix(ci): tightened docs-skip filter (workflow + seed changes no longer excused) |
| #168 | fix(db): service_role grants for Supabase CLI 2.106 |
| #169 | docs: brand-tokens.md (canonical hex values confirmed) |
| #170 | docs: brand-voice.md extended (§6 microcopy patterns, §7 do/don't) |
| #172 | fix(ci): repair Playwright version-resolve step in E2E workflow |

### Infrastructure created this session
- **`osteojp-portal` Vercel project** — created by Max. Root: `apps/portal`. Node 22.x. Analytics off. 3 env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL). Live at `osteojp-portal.vercel.app`. Custom domain `patient.osteojp.pt` deferred to go-live.
- **Twilio PT alphanumeric sender "OsteoJP"** — registered and immediately approved. Added to "My New Notifications Service" sender pool alongside the trial Long Code. One-way outbound only (correct for reminders). Ivan needs to update `TWILIO_SENDER_ID` env var in Vercel.

### Decisions made
- NESA form: Ivan gave sign-off on structure (keep osteopathy base), 4 NESA fields, 2 contraindications. Epilepsy = pending JP.
- Dev/staging Supabase: separate project, not production. Max to create (same pattern as Vercel portal project).
- Brand voice Q2 (patient name) resolved: first name in friendly contexts, full name in formal. Q3 (multilingual fallback) resolved: show PT when EN missing. Q1 + Q4 still pending JP.
- SMS copy: accent-free by design (GSM-7 constraint). Already implemented in `docs/sms-templates.md`.
- CI: docs-only PRs skip DB/E2E. Code PRs unaffected.

---

## The first thing to do in session 9

**Create the dev Supabase project.** This is Max's task (same ownership as the portal Vercel project). It directly unblocks local e2e for everyone.

Full runbook is in `docs/supabase-setup.md`. Steps:

1. Go to `https://supabase.com/dashboard/new`
   - Name: `osteojp-dev`
   - Region: **EU (Frankfurt)** — mandatory for clinical data (CLAUDE.md hard rule 8)
   - Save the password in keychain
   - Plan: Free

2. Get the two DATABASE_URLs from Dashboard → Project Settings → Database → Connection string → URI:
   - Port `6543` (transaction pooler) → `DATABASE_URL`
   - Port `5432` (session pooler) → `DATABASE_URL_DIRECT`

3. Enable the auth hook: Dashboard → Authentication → Hooks → Customize Access Token → select `public.custom_access_token_hook` → Save

4. Get the project ref from Dashboard → Project Settings → General → Reference ID

5. Run migrations: `DATABASE_URL_DIRECT=<port-5432-url> pnpm db:migrate`

6. Verify RLS end-to-end using the SQL block in `docs/supabase-setup.md` §5

7. Add env vars to Vercel Development scope (both `osteojp-platform` and `osteojp-portal` projects) + update local `.env.example`

8. Tell Ivan the two DATABASE_URL values so he can wire e2e CI

---

## Current blockers

| Blocker | Waiting on | Impact |
|---|---|---|
| Maria João Silva test patient activation | Ivan (said "today" on 2026-06-11) | Authenticated QA (45 scenarios) fully blocked |
| Wave C UI screens | Ivan — will ping with preview URL | Wave C QA + copy review blocked |
| `TWILIO_SENDER_ID` env var update | Ivan | SMS reminders still going from trial number |
| IfThenPay sandbox keys reply | IfThenPay (submitted) | Phase 4 blocked |
| JP VAT sign-off | João Pedro | Phase 4 blocked |
| Epilepsy NESA classification | João Pedro | nesa-v1.json final item |
| Brand voice Q1 + Q4 | João Pedro | Voice guide not fully locked |
| Dev Supabase project | **Max — in progress** | Local e2e blocked |

---

## Unblocked tasks in priority order

1. **Create dev Supabase project** (see above — first task of session 9)
2. **Authenticated QA (45 scenarios)** — unblocks the moment Ivan activates Maria João Silva. Scenarios in `docs/patient-portal/qa-scenarios-portal.md`.
3. **Wave C QA pass** — unblocks when Ivan sends preview URL
4. **Copy review pass on brand-voice.md §6 + §7** — Ivan extended with microcopy patterns and do/don't this session. Cross-check against `packages/i18n/src/portal/strings.pt.json` for any conflicts.

---

## Key files

### Docs
- `docs/SPEC.md` — single source of truth for all phases and task ownership
- `docs/QUESTIONS.md` — all open questions log (Q1–Q4 all answered)
- `docs/DECISIONS.md` — all decisions log
- `docs/supabase-setup.md` — full runbook for dev Supabase project setup + RLS verification
- `docs/twilio-pt-sender-registration.md` — Twilio submission log (status: approved)
- `docs/migration-notes.md` — Phase 5 prep, edge cases, batch log template
- `docs/handoff-2026-06-11.md` — session 8 handoff (superseded by this doc)

### Portal wireframes (NEW session 8)
- `docs/portal-wireframes/` — 12 Excalidraw files, 390×844px, PT-first
- Open at excalidraw.com by drag and drop
- Files: 01-login, 02-activate, 03-dashboard, 04-booking-service, 05-booking-slot, 06-booking-confirm, 07-appointments, 08-forms, 09-form-fill, 10-documents, 11-clinics, 12-account

### Portal app
- `apps/portal/app/portal/` — all routes live
- `apps/portal/proxy.ts` — route protection (replaces middleware.ts)
- `packages/i18n/src/portal/strings.pt.json` — 245 keys PT (updated session 8: 2 login keys)
- `packages/i18n/src/portal/strings.en.json` — 245 keys EN

### Forms
- `packages/db/seed/form-templates/nesa-v1.json` — complete except epilepsy classification
- All 7 templates: general-anamnese-v1, osteopathy-v2, physiotherapy-v1, nesa-v1, massagem-terapeutica-v1, pilates-terapeutico-v1, rpg-v1

### CI/CD
- `.github/workflows/ci.yml` — lint + typecheck + vitest (no DB, fast)
- `.github/workflows/db-tests.yml` — RLS isolation (skips docs-only PRs)
- `.github/workflows/e2e.yml` — Playwright (skips docs-only PRs, Playwright fix in #172)
- `.github/workflows/prod-migrate.yml` — manual gated Drizzle migration to prod

---

## Recurring rules (read before touching anything)

1. **One branch per task.** Finish and push before switching. The branch mess in session 8 came from rebasing mid-task. Use the terminal, not the Claude chat container.
2. **Never push directly to main.** PRs only, 1 approval + status checks required.
3. **Lockfile conflicts on every PR** — always `git checkout main && git pull` before branching.
4. **macOS `sed -i` fails** — use `perl -i -p -e 's/old/new/g'` instead.
5. **pnpm locked at 11.1.3** — do not upgrade.
6. **JSON templates** — validate with `python3 -c "import json; json.load(open('file.json'))"` before committing.
7. **Never commit secrets.** GitHub push protection is active — it will block the push and you'll have to amend (learned the hard way in session 8 with a GitHub token in the handoff doc).
8. **Claude in Chrome MCP** — drops on long conversations. Fix: fresh conversation. Batch `navigate` + screenshot in single `browser_batch` call.
9. **Miro free plan** — 3-board limit hit. OsteoJP content lives inside "Dwellio + A&I" board.
10. **`packages/db/seed/`** — form templates and seed fixtures. Not schema. Doesn't trigger DB tests.
11. **`supabase/migrations/`** — real schema changes. Always triggers full DB + E2E suite.
12. **Patient portal data contract** — portal never touches DB directly. All reads/writes go through `apps/api` (`/api/v1/patient/...`). Every response tenant-scoped via JWT.

---

## Environment

- Portal local: `http://localhost:3001` (`pnpm --filter portal dev`)
- Portal Vercel: `osteojp-portal.vercel.app` (production)
- Staff platform Vercel: `osteojp-platform.vercel.app`
- Production Supabase: `https://jaxmkwoxjcgzkwxgbayx.supabase.co`
- Dev Supabase: **to be created in session 9**
- GitHub: `https://github.com/happygamer1919-tech/OsteoJP`
- GitHub file retrieval: `curl -s -H "Authorization: token <token>" "https://api.github.com/repos/happygamer1919-tech/OsteoJP/contents/[path]" | python3 -c "import sys,json,base64; d=json.load(sys.stdin); print(base64.b64decode(d['content'].replace('\n','')).decode())"`

---

## People

| Person | Contact | Role | Language |
|---|---|---|---|
| Max | sm33xy (GitHub) | QA, content, portal UI, copy, docs, infrastructure (Vercel, Supabase, Twilio) | — |
| Ivan | happygamer1919-tech (GitHub) | Lead engineer — apps/web, apps/api, DB, infra | — |
| João Pedro | Stamrud@gmail.com | Clinic owner, clinical director, content sign-off | **English only — never send Portuguese** |

> All JP communications route through Ivan unless contacting JP directly. JP speaks English only.

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

### Brand tokens (canonical — do not use other values)
- Teal: `#45B9A7`
- Magenta: `#8B1863`
- Grey (logo only): `#98B2C2`

---

## Next session checklist

- [ ] Create dev Supabase project (`osteojp-dev`, EU Frankfurt) — full runbook in `docs/supabase-setup.md`
- [ ] Enable Custom Access Token hook on dev project
- [ ] Run `pnpm db:migrate` against dev project
- [ ] Verify RLS end-to-end (SQL block in `docs/supabase-setup.md` §5)
- [ ] Add dev DATABASE_URL + DATABASE_URL_DIRECT to Vercel Development scope (both projects)
- [ ] Tell Ivan the DATABASE_URL values for e2e CI
- [ ] Check if Ivan activated Maria João Silva → if yes, run 45-scenario authenticated QA immediately
- [ ] Check if Ivan sent Wave C preview URL → if yes, run Wave C QA + copy review
- [ ] Check IfThenPay inbox for reply
- [ ] Check JP reply on epilepsy NESA classification + brand voice Q1/Q4

---

*Prepared end of session 8, 2026-06-11. Session 9 starts with dev Supabase project creation.*

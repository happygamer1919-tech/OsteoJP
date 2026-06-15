# OsteoJP — Session Handoff
**Date:** 2026-06-12
**Prepared by:** Max (sm33xy) + Claude
**Session:** 9 → 10 handoff

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

## What happened in session 9 (2026-06-12)

### Infrastructure completed

**Dev Supabase project (`osteojp-dev`) — fully operational**
- Project ref: `ufbkzbyghvxtosyrkgjq`
- Region: EU Frankfurt (eu-central-1)
- Password: `u93WfKueepPpHqWu` (save in keychain)
- DATABASE_URL (port 6543): `postgresql://postgres.ufbkzbyghvxtosyrkgjq:u93WfKueepPpHqWu@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`
- DATABASE_URL_DIRECT (port 5432): `postgresql://postgres.ufbkzbyghvxtosyrkgjq:u93WfKueepPpHqWu@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`
- All 3 migrations applied cleanly
- Custom Access Token hook enabled (`public.custom_access_token_hook`)
- RLS verified end-to-end (tenant isolation + cross-tenant write rejection confirmed)
- Both DATABASE_URL values added to Vercel Development scope on both `osteojp-platform` and `osteojp-portal`

**Ivan's task remaining:** add `DATABASE_URL` + `DATABASE_URL_DIRECT` as GitHub Actions secrets for e2e CI.

### IfThenPay sandbox keys received

Keys forwarded to Ivan:
- MB Way key: `PDW-316174`
- Backoffice user: `ivanmacovei`
- Backoffice password: `info@a-and-i-automation.com`
- Backoffice key: `0322-6013-0993-2353`
- Active for 6 months
- Env var to add: `IFTHENPAY_MBWAY_KEY = PDW-316174`

Phase 4 is unblocked on the IfThenPay side.

### Maria João Silva test patient

- Created in staff platform: UUID `9f1d45c1-c0c6-418e-a3bc-a3ed6be16da5`, email `triboimax635+maria@gmail.com`, DOB 01/01/1985, Linda-a-Velha
- Created in production Supabase auth: UID `773d6c96-f0a7-42cf-9cb2-7aaa178e162b`
- Portal invite flow does not exist in the staff UI yet — Ivan must build it as part of Wave C
- Workaround: send magic link directly from Supabase dashboard → project `jaxmkwoxjcgzkwxgbayx` → Auth → Users

### Magic link auth bug — partially fixed

The portal auth callback only handles PKCE (`?code=` param). Magic links deliver tokens as URL hash fragments (`#access_token=...`) which never reach the server. Three PRs were merged to fix this client-side:

- **PR #210** — added `useEffect` with `getSession()` — deployed but did not work (`getSession()` races the async hash exchange)
- **PR #228 v1** — switched to `onAuthStateChange` — deployed but did not work (`@supabase/ssr` `createBrowserClient` uses cookies and does not auto-process hash fragments)
- **PR #228 v2** — switched to `setSession()` with manual token extraction from hash — deployed but **not yet tested** (rate limit hit before we could send a fresh magic link)

**First task of session 10:** test the magic link fix. Send a fresh magic link to `triboimax635+maria@gmail.com` and confirm it redirects to `/portal/dashboard`.

If it still fails, the correct long-term fix is to switch the Supabase invite to PKCE flow (delivers `?code=` which the server callback handles correctly). That is Ivan's work.

### Supabase redirect URLs (production project)

Both added to `jaxmkwoxjcgzkwxgbayx` → Auth → URL Configuration:
- Site URL: `https://osteojp-portal.vercel.app`
- Redirect allowlist: `https://patient.osteojp.pt/**` and `https://osteojp-portal.vercel.app/**`

`patient.osteojp.pt` DNS not yet set up — Ivan's task.

### Wave C + Wave 4 shipped by Ivan this session

Ivan shipped a massive amount of work:
- **Wave C** — all portal UI screens from wireframes (W1-01 through W3-06, 142 files)
- **Wave 4** — staff screen restyling (W4-01 through W4-11), i18n sweep (`utente → paciente`), token debt sweep, docs consolidation

### Copy/i18n fixes merged this session (all Max's PRs)

| PR | Fix |
|---|---|
| #185 | `common.back` PT: "Voltar" → "Anterior"; `appointments.cancel_confirm`: "Sim, cancelar" → "Cancelar marcação" |
| #212 | 3 Wave C portal copy fixes: `directamente` → `diretamente`, greeting fallback "Paciente" removed, therapy label capitalisation |
| #214 | `BookingFlow` back button: "Voltar" → "Anterior" |
| #224 | Docs consolidation (Ivan's PR — Wave 2+3 decisions + questions logged) |
| #226 | `patients.colPhone`: "Telefone" → "Telemóvel"; `review.claim`: "Reivindicar" → "Assumir" |
| #227 | 10 hardcoded strings on staff login page extracted to `login.*` i18n keys |

---

## Current blockers

| Blocker | Waiting on | Impact |
|---|---|---|
| Magic link auth fix verification | Rate limit reset (1h) | Authenticated QA blocked |
| Ivan: portal invite UI | Ivan | Clean auth flow for real patients |
| Ivan: `patient.osteojp.pt` DNS | Ivan | Custom domain not resolving |
| Ivan: GitHub Actions secrets for e2e CI | Ivan | CI e2e uses dev DB |
| IfThenPay wiring | Ivan (has keys) | Phase 4 |
| JP: epilepsy NESA classification | João Pedro | nesa-v1.json final field |
| JP: brand voice Q1 + Q4 | João Pedro | Voice guide not fully locked |

---

## First task of session 10

**Test the magic link fix.** Rate limit resets ~1 hour after the last send (around 12:02 session time).

Give Claude Chrome extension this prompt:

> Go to `https://supabase.com/dashboard/project/jaxmkwoxjcgzkwxgbayx/auth/users`, find `triboimax635+maria@gmail.com`, open her detail panel, click "Send magic link", confirm the toast, then check Gmail for the newest email and click the link. Report the exact URL you land on and what you see on screen. Do not enter any credentials.

If it redirects to `/portal/dashboard` — authenticated QA (45 scenarios) can begin immediately.
If it still fails — escalate to Ivan to switch invite to PKCE flow.

---

## Authenticated QA — ready to run once login works

45 scenarios documented in `docs/patient-portal/qa-scenarios-portal.md`.

Maria João Silva credentials:
- Email: `triboimax635+maria@gmail.com`
- Portal: `https://osteojp-portal.vercel.app`
- Auth method: magic link from Supabase dashboard (until Ivan builds the invite UI)

---

## Key files

- `docs/supabase-setup.md` — dev project runbook (completed)
- `docs/DECISIONS.md` — all decisions including Wave 2+3+4
- `docs/QUESTIONS.md` — open questions (Q1, Q2 Wave 3, Q3 Wave 3, Q6 portal heritage all logged)
- `docs/brand-voice.md` — complete with §6 microcopy patterns + §7 do/don't
- `docs/design/SPEC-foundation.md` — Wave 1 foundation spec
- `docs/design/SPEC-portal.md` — portal spec
- `docs/design/SPEC-staff-screens.md` — staff screens spec
- `docs/design/PLAN.md` — Wave 1-4 task list with completion ticks
- `packages/i18n/src/strings.pt.json` — PT strings (staff platform)
- `packages/i18n/src/strings.en.json` — EN strings (staff platform)
- `packages/i18n/src/portal/strings.pt.json` — PT strings (patient portal)
- `packages/i18n/src/portal/strings.en.json` — EN strings (patient portal)

---

## Environment

- Portal Vercel: `https://osteojp-portal.vercel.app` (production, `main` branch, commit `4f85452`)
- Staff platform Vercel: `https://osteojp-platform.vercel.app`
- Production Supabase: `https://jaxmkwoxjcgzkwxgbayx.supabase.co`
- Dev Supabase: `https://ufbkzbyghvxtosyrkgjq.supabase.co`
- GitHub: `https://github.com/happygamer1919-tech/OsteoJP`

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
12. Vercel free tier — 100 deployments/day limit. Ivan hit this during Wave 4 push. Monitor.

---

*Prepared end of session 9, 2026-06-12. Session 10 starts with magic link auth fix verification.*

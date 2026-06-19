# Patient Portal E2E QA — 2026-06-19

**Target:** https://osteojp-portal.vercel.app  
**Test user:** triboimax635+maria@gmail.com (Maria João Silva)  
**Browser:** Chromium headless (Playwright 1.61)  
**Tested against:** production deploy (Vercel 24 h rate-limit active — existing deploy)  
**Run date:** 2026-06-19  

---

## Summary table

| Screen              | Result | Notes |
|---------------------|--------|-------|
| Login               | ✅ PASS | Auth HTTP 200; redirect → `/portal/dashboard` |
| Dashboard           | ✅ PASS | Greeting "Olá, Maria"; empty-state "Sem consultas marcadas"; no RSC errors; `<main>` + `<nav>` + `<header>` landmarks present; `[role="alert" aria-live="assertive"]` live region present |
| Appointments        | ✅ PASS | Tab bar renders (Início · Marcações · Formulários · Clínicas · Conta); empty state loads |
| Forms               | ✅ PASS | "Sem fichas enviadas" empty state |
| Booking (all 4 steps) | ✅ PASS | Full flow exercised — see detail below |
| Clinics             | ✅ PASS | Title "Clínicas"; "As nossas clínicas" content |
| Account             | ✅ PASS | Avatar "MJ"; full name "Maria João Silva"; email visible; "Alterar palavra-passe" → `/auth/reset-password` ✓ |
| Documents           | ✅ PASS | "Sem documentos disponíveis" empty state |

**Total: 8 PASS / 0 WARN / 0 FAIL**

---

## Booking walk-through detail (Passo 1–4)

| Step | Action | Result |
|------|--------|--------|
| Passo 1 de 4 — Escolha a clínica | 2 clinics shown: **Clínica OsteoJP**, **OsteoJP** | ✅ Clicked "Clínica OsteoJP" |
| Passo 2 de 4 — Escolha o serviço | 5 services: Fisioterapia, Massagem Terapêutica, Osteopatia, Pilates Terapêutico, RPG (all 60 min) | ✅ Clicked "Fisioterapia" |
| Passo 3 de 4 — Escolha a data e hora | Calendar: June 2026; 10 time slots 08:00–17:00 for Tue 23 Jun | ✅ Clicked 23/06/2026 · 08:00 → "Continuar" |
| Passo 4 de 4 — Confirmar marcação | Summary: Clínica OsteoJP · Fisioterapia · Terça-feira, 23 de junho · 08:00 · "A sua marcação ficará a aguardar confirmação da receção. Receberá um SMS quando for confirmada." | ✅ NOT submitted (stop before "Confirmar marcação") |

---

## Session 11 & 12 fix verification

### Fix 1 — Dashboard greeting from patient profile (session 12)
- **Expected:** greeting reflects patient first name from the patients table, not raw auth metadata
- **Result:** ✅ `<h3>` reads **"Olá, Maria"** — correct profile name rendered

### Fix 2 — Auth metadata sync (session 11)
- **Expected:** Account page shows full name and avatar initials from the synced profile
- **Result:** ✅ Avatar initials **"MJ"**, full name **"Maria João Silva"**, email `triboimax635+maria@gmail.com` — all correct

### Fix 3 — A11y landmarks (session 11)
- **Expected:** `<main>`, `<nav>`, `<header>` / banner all present
- **Result:** ✅ `main=true`, `nav=true`, `banner=true` — all three landmarks confirmed

### Fix 4 — Icon-only buttons aria-label (session 11 P3)
- **Expected:** 0 icon-only buttons missing `aria-label`
- **Result:** ✅ **0 violations** — all icon buttons are labelled

### Fix 5 — Live regions (session 11 P3)
- **Expected:** At least one `[aria-live]` or `[role="alert"]` region present
- **Result:** ✅ `[role="alert" aria-live="assertive"]` found on Dashboard

---

## Account page detail

| Field | Value |
|-------|-------|
| Avatar initials | MJ |
| Full name | Maria João Silva |
| Email | triboimax635+maria@gmail.com |
| Telemóvel | — (not set) |
| Morada | — (not set) |
| Código postal / Localidade | — (not set) |
| Alterar palavra-passe | `<a href="/auth/reset-password">` — navigation confirmed ✓ |
| Preferências — Idioma | Português (PT) |
| Preferências — SMS | ON (24h antes da consulta) |
| Preferências — Email | OFF (48h antes da consulta) |

---

## Network observations

**RSC prefetch `_rsc=…` → ERR_ABORTED (Chrome):** Next.js App Router issues background RSC prefetch requests; when the test navigates before they complete, the browser aborts them. These are expected and non-blocking — no content is missing as a result.  
**No `$RX(` or `E{"digest"` in RSC stream** (verified via `curl` with session cookie on Dashboard) — clean.

---

## Pending / out of scope

- **Booking confirmation submit:** intentionally not triggered during testing (would create a real pending appointment in the QA patient account).
- **P3 F2 — WebKit RSC prefetch blocked by ITP:** documented in `docs/qa-cross-browser-2026-06-18.md`; not retested here (Chrome-only run).
- **Forms — submission flow:** forms page shows correct empty state; no intake forms are configured in the QA tenant, so the submission path was not exercised.

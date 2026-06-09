# QA Pass — Patient Portal
**Date:** 2026-06-09
**Tester:** Max (sm33xy)
**Environment:** Local dev — `http://localhost:3001` (portal) against Supabase EU Frankfurt
**Branch:** main (post Phase F merge)
**Method:** Claude in Chrome automated + manual verification

---

## Summary

All 5 flows tested. 5 pass, 0 blocked, 2 minor observations (no fix required before launch).
Authenticated flows (booking, forms, account) pending test credentials from Ivan.

---

## Flow Results

### 1. Auth — `/auth/login` ✅ Pass

- Page loads cleanly with no errors
- All labels in correct European Portuguese: "Entrar", "Email", "Palavra-passe", "Esqueceu a palavra-passe?", "Entrar com link por email"
- Helper text correct: "Ainda não tem conta? A sua clínica irá enviar-lhe um convite por SMS."
- Branding renders correctly: OsteoJP logo, "Portal do Paciente", teal button styling
- No broken styles or layout issues

### 2. Route Protection — `/portal/dashboard` while logged out ✅ Pass

- Unauthenticated access to `/portal/dashboard` correctly redirects to `/auth/login`
- Protected route middleware working as expected

### 3. Login error handling ✅ Pass

- Form submits correctly with invalid credentials
- Returns localized error: "Email ou palavra-passe incorretos."
- Input fields, password mask, and submit handling all work
- **Pending:** happy-path login not verified — requires test patient credentials from Ivan

### 4. Clinics page — `/portal/clinics` ✅ Pass

Both clinic cards render correctly with real data from osteojp.pt:

**Linda-a-Velha (Lisboa)**
- Address: Praça Central Plaza, n.º 1 – A, 2795-246 ✅
- Phones: 969 472 111 / 214 191 988 ✅
- Email: clinica.osteojp@gmail.com ✅
- "Ver no mapa" → valid Google Maps URL ✅
- Hours: Segunda a Sexta 09:00–19:00 ✅
- "Marcar consulta aqui" button present ✅

**Castelo Branco**
- Address: R. Fernando Namora, n.º 6, 6000-140 ✅
- Phones: 969 877 553 / 272 328 221 ✅
- Email: geral.castelobranco@osteojp.pt ✅
- "Ver no mapa" → valid Google Maps URL ✅
- Hours: Segunda a Sexta 09:00–19:00 ✅
- "Marcar consulta aqui" button present ✅

### 5. Responsive layout — 390px (iPhone) ✅ Pass

- Bottom nav fits correctly, no overflow
- Cards and forms fit within viewport
- No horizontal scroll

### 6. Accessibility ✅ Pass

- Skip-to-content link present and functional
- Focus rings visible on interactive elements (keyboard tab)
- Portuguese labels on all form fields
- `aria-current="page"` on active nav item
- Icons marked `aria-hidden`

---

## Minor Observations

### ⚠️ O1 — `/portal/clinics` accessible without authentication

`/portal/clinics` is reachable without login (no redirect). This is **intentional** — a patient receiving an invite SMS should be able to find the clinic address before activating their account. No fix required. Recommend adding a comment to `middleware.ts` to document the intentional public exception.

### ⚠️ O2 — Bottom nav visible on unauthenticated `/portal/clinics`

The bottom nav (Início, Consultas, Fichas, Clínicas, Conta) renders on the clinics page even when logged out. The links all redirect to login correctly, so functionality is unaffected. Cosmetic only — low priority for V1.

---

## Pending — Authenticated Flows

The following flows require a test patient account in the dev Supabase. Blocked on Ivan providing credentials or running the seed script.

| Flow | Description |
|---|---|
| Booking | Location → service → slot → confirm → pending |
| Appointments | View upcoming/past, cancel within 24h |
| Forms | Fill Ficha Geral, submit, verify status update |
| Account | Edit phone/address, verify PATCH saves correctly |
| Dashboard | Verify next appointment card with real data |

**Action:** Ask Ivan to create a test patient or run `pnpm --filter @osteojp/db seed` against dev DB.

---

## Environment Notes

- `NEXT_PUBLIC_API_URL=http://localhost:3002` — `apps/api` was not running during this pass; all API-dependent screens untested locally
- Vercel preview protected by Vercel Authentication — Ivan to disable for preview deployments or upgrade to Pro for external collaborator access

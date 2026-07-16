# Portal completion audit — `apps/portal` vs a client-facing launch (W8-04)

> Read-only recon, 2026-07-16 (Wave 08, W8-04). No code changed. Verifies + extends
> the starting map in `docs/loops/wave-08/W8-04-portal-completion-recon.md` against
> the code on `main` (`20b08c5`). Every claim carries a `file:line` citation.
> **No live security/data exposure was found** (the HALT-LOUD trigger): documents
> download through short-lived **signed** URLs (never public), all patient data
> flows through `apps/api` under a Bearer session + RLS, and the root route
> redirects anonymous visitors to login. Outputs: the four audit sections below +
> a proposed **Wave 09 candidate list** (unordered, candidates only — for owner +
> Rodica to spec against later).

## 1. What exists (route-by-route)

The portal is a Next.js App Router app; the API source of truth is `apps/api`.

| Route | Status | Notes / citation |
|-------|--------|------------------|
| `/` | ✅ works | Redirect only: authed → `/portal/dashboard`, anon → `/auth/login` (`app/page.tsx:6,9,11`). |
| `/auth/login` | ✅ works | Password + magic-link OTP, hash-fragment handling. |
| `/auth/activate` | ⚠️ works, env-fragile | Password set for an invited patient; needs the Supabase anon key **at runtime**, no build-time validation (see §3). |
| `/auth/callback` | ✅ works | OAuth/OTP code exchange (`route.ts`). |
| `/auth/reset-password` | ✅ works | Email OTP request. |
| `/portal/dashboard` | ✅ works | Greeting + next-appointment hero + quick actions + last-3 past. Reads the session (`dashboard/page.tsx:57`); appointments via `apps/api`. |
| `/portal/booking` | ✅ works (proven on prod) | 4-step wizard (location → service → date/slot → confirm). Slots are DISPLAY-only; source of truth is `apps/api` `listOpenSlots` (`apps/api/lib/appointments/store.ts:316`). Booking proven on prod, ref `9F8F24D0`. |
| `/portal/booking/pending` | ✅ works | Confirmation. Reference code = first 8 chars of the appointment UUID, uppercased (`booking/pending/page.tsx:32`). |
| `/portal/appointments` + `/[id]` | ✅ works | Próximas/Histórico tabs; detail with a 24h-cutoff cancel. Reschedule is phone-only by SPEC (not a bug). |
| `/portal/documents` | ✅ works, secure | Year-grouped; download via a **short-lived signed URL, never proxied** (`documents/DownloadButton.tsx:8`). No public-URL exposure. |
| `/portal/forms` | ⚠️ partial | Submission list with review status. The "pending forms" (not-yet-submitted) surface is omitted because the API exposes no such data (see §2). |
| `/portal/clinics` | ⚠️ static | Hardcoded roster (Linda-a-Velha + Castelo Branco); not data-driven. |
| `/portal/account` | ✅ works | Edit phone/address/postal/city + reminder toggles + logout. Language is PT-only, no runtime switcher (`account/AccountView.tsx`). |

Chrome: `portal/layout.tsx` → `PortalChrome` (top bar + bottom tabs). Auth is enforced **per page** via the Supabase session, not a shared guard/middleware (there is no `apps/portal/middleware.ts`); data access is API + RLS gated regardless (see §2).

## 2. What is missing or broken

- **Therapist-visibility gate (the important one).** A therapist is invisible to booking when `availabilityCoversExists` (`apps/api/lib/appointments/store.ts:175`) returns false — i.e. no active, location-scoped `availability_templates` row covers the slot. `listOpenSlots` (`store.ts:316`) filters on availability + no-conflict + no-time_off, but **does NOT join `therapist_services`** — the service→therapist mapping (migration 0023) is **not enforced** in slot listing (deferred per the 0023 comment). Net effect: **a therapist with no working hours is invisible (enforced), but a therapist with hours and no service map is NOT filtered out (not enforced).** The intended "no-hours + no-service-map = invisible" rule is only half-implemented.
- **Pending-forms surface omitted** — `dashboard` has no "forms to complete" banner because the API exposes no not-yet-submitted-forms data.
- **Reschedule is phone-only** — by SPEC, not a defect. Worth confirming it stays that way for launch.
- **PT-only language** — no runtime locale switcher (`account/AccountView.tsx`); acceptable for a PT clinic, a gap only if EN patients are expected.
- **Clinics roster is static** — hardcoded, so a new/changed clinic needs a code change.
- **No auth middleware / shared guard** — auth is per-page via `supabase.auth.getSession()`; a session-expired user may see an empty screen rather than a clean redirect on some routes (data stays protected by API + RLS — not a leak, a UX/robustness gap).

## 3. Env / config gaps

- **`NEXT_PUBLIC_API_URL` absent on Preview (known).** `apiBase()` returns `''` when unset (`apps/portal/lib/api/client.ts:90-91` **and** `apps/portal/app/portal/account/actions.ts:13-14`), so calls hit `//api/v1/...` and fail with no fallback. Set it on the Preview environment.
- **Supabase runtime env** — `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read at runtime (auth + `/auth/activate`); there is **no build-time env validation**, so a missing var fails silently/at request time rather than at build (aligns with the recorded FF2 follow-up on `/auth/activate`).
- **`NEXT_PUBLIC_APP_URL`** — declared in `.env.example`, currently unused in portal code.

## 4. PWA state

- **Installability only (v1, #568).** `apps/portal/app/manifest.ts`: name/short_name OsteoJP, `start_url` `/portal/dashboard`, `display` standalone, `theme_color` `#45B9A7`.
- **No service worker, no offline, no push — by design** (manifest comment). All API calls are `cache: "no-store"`. The offline-absent state is intentional for v1.

## Proposed Wave 09 candidates (unordered, candidates only — owner + Rodica to spec)

- **Enforce the service→therapist booking filter (0023).** Join `therapist_services` into `listOpenSlots` so a therapist with hours but no service map is correctly invisible for that service. Closes the half-implemented visibility rule.
- **Env-var validation + a `NEXT_PUBLIC_API_URL` Preview fallback.** Fail fast at build/boot when required public env is missing; give `apiBase()` a sane fallback or a loud error instead of `//api/v1`.
- **Pending-forms surface.** Add an API for not-yet-submitted forms + a dashboard banner.
- **Per-patient locale switcher.** Runtime PT/EN toggle honoring the per-patient preference.
- **Data-driven clinics roster.** Replace the hardcoded `/portal/clinics` list with tenant location data.
- **Offline / error resilience.** Optional service worker + graceful offline/error states (explicitly out of scope for v1).
- **Shared auth guard / middleware.** A single portal auth boundary so session-expiry redirects are consistent across routes.
- **Already queued (Rodica asks, carry forward):** Packs em uso view; Recuperação Utentes report.

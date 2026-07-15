# Loop W8-04 - Portal completion recon (Wave 08 Dados e KPI)

GATE: **Wave 08 Dados e KPI, READ-ONLY RECON, NO CODE.** Audits `apps/portal` end to end against a client-facing launch and outputs a findings document + a proposed Wave 09 candidate list. **No fixes in this loop.** Runs LAST in Wave 08. Starts from **fresh `origin/main`**; never stacked. **GREEN self-merge** (docs-only).

## Field 1. Scope and ground truth

Produce a committed findings document in `docs/` that maps what the patient portal HAS, what is MISSING or BROKEN, the env gaps, and the therapist-visibility gate, plus a proposed Wave 09 candidate list for the owner and Rodica to spec against. This is an audit: read-only, no code changes, no fixes.

Ground truth (recon at authoring 2026-07-15, embed as the STARTING map - the executor verifies + extends it, executor runs with ZERO memory):
- **Portal route tree (`apps/portal/app/`):**
  - Auth: `/auth/login` (password + magic-link OTP, hash-fragment handling), `/auth/activate` (password set, requires an activation session), `/auth/callback` (code exchange), `/auth/reset-password` (email OTP request). Auth wrapper `auth/layout.tsx`.
  - Portal: `/` (redirect: authed -> `/portal/dashboard`, anon -> `/auth/login`), `/portal/dashboard` (greeting + next-appointment hero + quick actions + last-3 past), `/portal/booking` (4-step wizard: location -> service -> date/slot -> confirm), `/portal/booking/pending` (confirmation; reference code = first 8 chars of the appointment UUID uppercased, `booking/pending/page.tsx:32`), `/portal/appointments` + `/portal/appointments/[id]` (list with Proximas/Historico tabs + detail with a 24h-cutoff cancel; reschedule is phone-only by SPEC), `/portal/documents` (year-grouped, signed-URL download), `/portal/forms` (submission list with review status), `/portal/clinics` (STATIC hardcoded roster - Linda-a-Velha + Castelo Branco), `/portal/account` (edit phone/address/postal/city, reminder toggles, PT-only language, logout). Portal chrome `portal/layout.tsx`.
- **Booking (proven on prod, ref `9F8F24D0`):** the portal only DISPLAYS slots; the source of truth is `apps/api` at `/api/v1/booking/slots` -> `apps/api/lib/appointments/store.ts:316-370` (`listOpenSlots`), which expands active availability templates into a 30-min grid (Europe/Lisbon) over a 14-day horizon and keeps a slot only if at least one active therapist has template coverage + no appointment conflict + no time_off. Confirm slot booking POSTs `/api/v1/appointments` and `chooseTherapist` picks an eligible therapist.
- **Therapist-visibility gate (audit item):** a therapist is invisible to booking when `availabilityCoversExists` (`store.ts:175-196`) returns false - i.e. no active, location-scoped `availability_templates` row covering the slot. **`therapist_services` (mapping, migration 0023) EXISTS but is NOT enforced in `listOpenSlots`** (service->therapist filtering is deferred, per the 0023 comment). So today the gate is availability-only; a therapist with no hours is invisible, but a therapist with hours but no service map is NOT filtered out. This is a real finding to record (no-hours + no-service-map = intended-invisible, but only the no-hours half is enforced).
- **PWA (#568 v1 installability):** `apps/portal/app/manifest.ts` (name/short_name OsteoJP, `start_url` `/portal/dashboard`, `display` standalone, theme `#45B9A7`). **No service worker, no offline, no push - by design** (manifest comment). All API calls are `cache: "no-store"`. Confirm the offline-absent state is intended.
- **Env gaps:** `NEXT_PUBLIC_API_URL` is read by `apiBase()` (`apps/portal/lib/api/client.ts:90-91`) + `account/actions.ts:13-14`; **if absent (known gap on Preview) `apiBase()` returns "" and calls hit `//api/v1/...` and fail** with no fallback. Also `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (auth), `NEXT_PUBLIC_APP_URL` (declared in `.env.example`, currently unused in portal code). `/auth/activate` needs the Supabase anon key at runtime; there is no build-time env validation. This aligns with the recorded FF2 follow-up (portal `/auth/activate` build-time env fallback).
- **Known gaps/stubs to verify + record:** pending-forms banner omitted (`dashboard/page.tsx:86-87` - the API exposes no not-yet-submitted forms data); reschedule phone-only (by design); PT-only language (`account/AccountView.tsx:157-158`, no runtime switcher); service->therapist booking filter not enforced (0023 deferred); no build-time env validation; no offline/error-resilience beyond generic boundaries.

**Scope:** an `apps/portal` end-to-end audit committed as a findings doc under `docs/` covering (1) what exists (route-by-route status), (2) what is missing or broken (with the therapist-visibility gate + the deferred service-map filter called out), (3) env/config gaps (NEXT_PUBLIC_API_URL absent on Preview known), (4) the PWA state (installability yes, offline no by design), plus a proposed Wave 09 candidate list for owner + Rodica. Read-only; NO code, NO fixes, NO migration.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w8-04-portal-recon origin/main -b osteojp-w8-04-portal-recon`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Verify + extend the starting map** above route-by-route (read-only): confirm each route's status, the booking/slot source, the therapist-visibility gate + the deferred 0023 filter, the PWA state, and the env reads. Note anything the starting map got wrong (correct it in the doc).
3. **Write the findings doc** under `docs/` (e.g. `docs/status/2026-07-15-portal-completion-audit.md` or `docs/portal-completion-audit.md`): the four sections (exists / missing-broken / env / PWA) as a route-by-route table + prose, with file:line citations, and the therapist-visibility finding stated plainly.
4. **Propose a Wave 09 candidate list** (in the same doc or a clearly-linked section): each candidate = one line with origin + a gate/note, UNORDERED, candidates-only (owner + Rodica spec against it later). Examples to consider from the recon: enforce the service->therapist booking filter (0023); env-var validation + a NEXT_PUBLIC_API_URL Preview fallback; pending-forms surface; per-patient locale switcher; offline/error resilience. Do NOT scope or sequence them.
5. **Gates (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still run green (a docs change should not break them); `pnpm test:e2e` unaffected. Confirm `git diff --name-only origin/main` shows ONLY files under `docs/` (plus the BACKLOG row flip if the executor closes the loop there).

## Field 3. Definition of done (machine-verifiable)
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files (and no `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, or app code). Paste it.
- **Findings-doc PROOF:** the committed doc covers all four sections route-by-route with file:line citations and the therapist-visibility finding. Paste its path + section headers.
- **Wave 09 candidates PROOF:** a candidate list exists (unordered, candidates-only, each with origin + gate/note). Paste it.
- **Gates green** (docs change does not break lint/typecheck/test/build).

## Field 4. Verification (paste evidence)
The no-code diff, the findings doc path + section headers, the Wave 09 candidate list, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **READ-ONLY: no code, no fixes, no migration, no schema, no workflow.** The ONLY writes are the findings doc (+ optional Wave 09 candidate section) under `docs/` and the BACKLOG row flip on close.
- **No live-DB connection, no credentials.** The audit reads the repo; any prod fact (e.g. the `9F8F24D0` booking) is cited from the record, not re-run.
- **Do not scope or sequence Wave 09** - candidates only, for the owner + Rodica.
- Plain hyphens only; no emoji; no em/en dashes. **Never force-push / `--admin`.** SYNTHETIC/read-only.
- **Standing test-data rule (Wave 08):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); use **disposable test patients only**; the reference therapist for tests is **Tiago Reis**. (This loop runs no destructive QA at all.)

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The audit surfaces a LIVE security/data issue (e.g. an unsigned document URL, a cross-tenant portal leak, a missing auth guard) - HALT-LOUD with the finding rather than folding it into a candidate list; a live exposure is escalated, not queued.
- Producing a useful audit would require RUNNING the portal against live data or credentials - HALT (this loop is read-only against the repo + the record).

## Field 7. Report back
The no-code diff, the findings doc path + section headers, the Wave 09 candidate list, gates green, PR number.

## Merge policy (embed, Wave 08 Dados e KPI)
- **W8-04 is GREEN self-merge (docs-only, no code, no migration).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. A live security/data exposure found during the audit is an instant HALT-LOUD, not a self-merge.
- **Runs LAST in Wave 08**, fresh `origin/main`, never stacked. Workflow files NEVER touched. Plain hyphens only. HALT-LOUD on scope/product/data/reality mismatch.

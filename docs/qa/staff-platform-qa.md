# OsteoJP Staff Platform — QA Checklist

Client: https://osteojp.pt/ · App: `apps/web` (staff platform) · Prod: `https://osteojp-platform.vercel.app`

Scope: exhaustive manual QA of the staff platform — every screen, every role, every permission combination, plus i18n, accessibility, and cross-browser. Portal QA is tracked separately (already done).

## Run log

**Last updated:** 2026-06-25 · env: prod (`osteojp-platform.vercel.app`), build = `main` post-#360/#361 · Vercel Hobby (503 flicker present).

| Section | Status | Result | Issues |
|---|---|---|---|
| §1 Auth & session | Done (owner) | All 6 checks PASS | — |
| §3 Screen smoke | Done (owner) | All screens render; 1 write defect + 1 fiscal | #357, #363 |
| §4 i18n / copy | Done (owner) | 3 localization gaps | #364 |
| Accessibility | Done (owner) | Keyboard + headings OK; 4 defects | #365 |
| §2 Role × permission matrix | Paused | Needs Vercel Pro (#356) + active admin/therapist/reception test users | — |
| Cross-browser / responsive | Paused | Needs Safari + Firefox (Chrome-only extension can't cover) | — |

Notes:
- All passes so far run as `owner` via the Chrome extension. §2 requires the three non-owner test users (not yet created) and is best run after Vercel Pro tames the 503 flicker.
- `/agenda` = scheduling calendar (time grid); `/marcacoes` = filterable appointment list. Confirmed distinct.
- 503-retry on writes is the #356 infra issue, not a functional bug; #353 write-outage itself is fixed.
- Filed: **#357** dashboard notes GET-fallback (cause+fix noted), **#363** [P1] tenant NIF wrong (`501200427`→`510200427`; IVA-23% JP check noted), **#364** [P2] i18n gaps (update-password EN, sex enum, DOB ISO), **#365** [P2] a11y (unlabeled icon links, active-nav + primary-CTA contrast, unlabeled merge input).

---

## 0. Before you start

- [ ] Confirm the build under test (Vercel deployment SHA = current `main`).
- [ ] **Known instability:** transient 503s on the write path (server-action POST + initial `?_rsc=` GETs) that retry to 200 — tracked in #356, gated on Vercel Pro. Do **not** file these as new bugs; note them against #356. Ideally run this pass *after* Pro is on so infra flicker doesn't mask real defects.
- [ ] One test user per role: `owner`, `admin`, `therapist`, `reception` (create via `/admin/staff` as owner).
- [ ] Test-data naming: prefix throwaway patients `QA TEST DELETE ME <HH:MM:SS>`. Track every row created and delete at the end (patients have FK children: appointments, clinical_episodes, clinical_records, attachments, invoices — delete children first).
- [ ] Tenant: `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. All data must stay inside this tenant (see §2 tenant-isolation tests).

### Do NOT file these as bugs (expected pre-launch / by-design)
- [ ] Staff invite sends no email — live-send is off pre-launch (#354; `docs/cutover-runbook.md`).
- [ ] InvoiceXpress issuance hidden/inert — IX creds absent by design until JP provisions; VAT pinned 0%.
- [ ] Only the *declaração de presença* is offered; *declaração de tratamento* is deferred (Q4). Presença is issuable by staff anytime, with **no** signed-record precondition.
- [ ] No patient-facing therapist picker in booking — clinic always assigns (Q2).
- [ ] No late-cancellation fee UI anywhere (Q3).
- [ ] Montemor-o-Novo location hidden until a confirmed opening date (Q5).

---

## 1. Auth & session

- [ ] `/login` — valid login for each role lands in the app; invalid credentials show a clear PT error.
- [ ] `/` — unauthenticated redirect to `/login`; authenticated redirect to `/dashboard`.
- [ ] `/auth/update-password` — password update flow works; enforces sensible rules; confirms success.
- [ ] Logout clears session; protected routes redirect to `/login` afterward.
- [ ] Session persists across a full-page reload and across RSC (client) navigations (this is the #353 area — confirm interactive components stay hydrated after navigating around).
- [ ] Direct-URL access to a protected route while logged out → redirect, no flash of content.

---

## 2. Role × permission matrix (the core of this pass)

Source of truth: `packages/auth/permissions.ts`. For **each** role, verify the allowed actions succeed **and** the denied actions are blocked in the UI (control hidden/disabled) **and** at the server (direct action/URL returns 403, not a silent allow). RLS is defense-in-depth for clinical + tenant; test both layers.

### Capability expectations

| Capability | owner | admin | therapist | reception |
|---|---|---|---|---|
| patients read / write | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| patients delete | ✓ | ✓ | ✗ | ✗ |
| appointments read / write | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| appointments delete (cancel) | ✓ | ✓ | ✗ | ✓ |
| services read / write | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✓ / ✗ |
| locations read / write | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✓ / ✗ |
| clinical_records read | ✓ | ✓ | ✓ | ✗ |
| clinical_records author / review / sign | ✓ | ✗ | ✓ | ✗ |
| invoices read | ✓ | ✓ | ✓ | ✓ |
| invoices issue | ✓ | ✓ | ✗ | ✓ |
| invoices void | ✓ | ✓ | ✗ | ✗ |
| users read / manage | ✓ / ✓ | ✓ / ✓ | ✗ | ✗ |
| roles read | ✓ | ✓ | ✗ | ✗ |
| settings read / manage | ✓ / ✓ | ✓ / ✓ | ✗ | ✗ |
| audit_log read | ✓ | ✓ | ✗ | ✗ |

### Critical negative tests (must be blocked at BOTH UI and server)
- [ ] **reception → clinical anything**: `/clinical*` routes denied; no clinical entry points visible; direct URL + direct server action both 403/redirect (also enforced by RLS).
- [ ] **admin → author/review/sign clinical**: can open and read a record, but author/review/sign controls are absent and the server actions 403.
- [ ] **therapist → settings / users / roles / delete patient / issue-void invoice**: all blocked.
- [ ] **reception → void invoice / write services / write locations / settings**: all blocked (issue invoice allowed).
- [ ] **Role-assignment (`/admin/staff`)**: only `owner` can grant the `owner` role or change a user who currently holds `owner`. `admin` can assign/reassign non-owner roles only; the role `<select>` must not offer `owner` to a non-owner actor, and the server action must reject it.
- [ ] **Privilege escalation**: a non-owner cannot promote themselves or anyone to owner via UI or crafted request.

### Tenant isolation
- [ ] No screen, search, or direct-ID lookup returns any row outside tenant `3a2d…3560` (patients, appointments, clinical, invoices, audit).
- [ ] Crafted request with another tenant's record ID returns not-found/403, never the row (RLS check).

---

## 3. Per-screen functional checks

### Dashboard `/dashboard`
- [ ] Loads and hydrates; widgets render with real tenant data.
- [ ] **Notas rápidas** quick-note saves (was the #357/#353 GET-fallback area — confirm it POSTs and persists, not a native GET).
- [ ] Counts/summaries match the underlying data.

### Agenda `/agenda` and Marcações `/marcacoes`
- [ ] Week/day view loads; performance acceptable (target full week < 1s once Pro is on).
- [ ] Create appointment: clinic assigns therapist (no patient-facing picker); required fields validated.
- [ ] Recurring appointments create the correct series.
- [ ] Conflict detection: overlapping therapist booking and room conflict both blocked/warned.
- [ ] Availability/vacation templates respected (no booking into blocked time).
- [ ] Reschedule and cancel (per role: reception/admin/owner can cancel, therapist cannot).
- [ ] Multi-location: appointments scoped to the selected location; no cross-location bleed.
- [ ] Confirm `/marcacoes` vs `/agenda` roles/behaviors (clarify which is the list vs calendar) and that both stay consistent.

### Patients `/patients`, `/patients/new`, `/patients/[id]`, `/patients/[id]/edit`
- [ ] List + search (target < 300ms once Pro is on); pagination/empty states.
- [ ] Create (write completes and navigates — #353 area), validation, PT NIF handling.
- [ ] Edit + save; audit_log records the change (visible to owner/admin).
- [ ] Delete (owner/admin only) with confirmation; therapist/reception have no delete.
- [ ] Multi-location assignment shows correctly.
- [ ] Patient detail tabs (Resumo / Dados pessoais / etc.) all render.

### Clinical `/clinical`, `/clinical/new`, `/clinical/[id]`, `/clinical/episodes/[id]`, `/clinical/review`, `/clinical/review/[recordId]`
- [ ] List + open a record (owner/admin/therapist; reception denied).
- [ ] Author a new record (owner/therapist): form engine renders fields with PT labels; body chart works; image upload attaches; save persists.
- [ ] Versioning: edits create versions; history viewable.
- [ ] Sign/finalize (owner/therapist): locks the record; locked records are read-only.
- [ ] Review queue `/clinical/review`: claim → edit narrative → finalize (owner/therapist; admin read-only; reception denied).
- [ ] `private_notes` never surfaces to any AI-extraction path and respects its lock (spot-check the field is excluded from any extract/preview).

### Invoicing `/invoicing`
- [ ] List/read for all roles; issue (owner/admin/reception), void (owner/admin only).
- [ ] IX integration inert (no creds) — issuing records to the internal ledger only; no live IX call. Do not flag as a bug.
- [ ] VAT shows 0% (art. 9.º CIVA) on any generated document.
- [ ] *Declaração de presença* issuable anytime, no signed-record gate (Q4); *tratamento* not offered.

### Admin `/admin`, `/admin/staff`, `/admin/services`, `/admin/locations`, `/admin/settings`
- [ ] Owner/admin only; therapist/reception fully blocked.
- [ ] Staff: invite/create user, assign role (owner-tier protection per §2), deactivate.
- [ ] Services: CRUD, prices, per-location availability.
- [ ] Locations: CRUD; Montemor hidden per Q5.
- [ ] Settings: tenant fiscal data (NIF 510.200.427), saves and reflects in PDFs/footers.

### Reschedule link `/r/[token]`
- [ ] Valid token resolves to the right appointment; reschedule works.
- [ ] Tampered/expired token rejected cleanly (no info leak).

---

## 4. Cross-cutting

### i18n / copy (PT-PT)
- [ ] Every screen, modal, button, empty state, and error message reviewed for PT-PT vocabulary, capitalization, and tone.
- [ ] No leftover English/placeholder strings; no missing-key fallbacks.
- [ ] Dates/times/currency formatted PT (DD/MM/AAAA, `0,00 €`).

### Accessibility
- [ ] Full keyboard navigation (tab order, focus visible, no traps) on every screen.
- [ ] Forms have associated labels; errors announced.
- [ ] Color contrast meets WCAG AA against brand tokens.
- [ ] Screen-reader labels on icon-only controls.

### Cross-browser + responsive
- [ ] Chrome, Safari, Firefox: login, agenda, patient create, clinical author, invoicing.
- [ ] Mobile responsive: agenda and patient flows usable at phone width.

---

## 5. Bug logging

For each defect: severity (P0 block launch / P1 major / P2 minor / P3 polish), exact repro steps, role used, screenshot, and the route. File as GitHub issues in `happygamer1919-tech/OsteoJP`. Re-check fixes and close on the bug board.

> Note: this checklist is grounded in `packages/auth/permissions.ts` and the `apps/web/app` route inventory as of current `main`. If routes or the permission matrix change, re-sync before the next pass.

# Session 13 Closeout — 2026-06-19

**Ground truth is the `gh` CLI and the live repo, not this document. Where they
disagree, the repo wins.**

---

## PRs merged this session (#308–329)

All merged to `main` on 2026-06-19.

### QA passes and audit docs

| PR | Title |
|----|-------|
| #308 | `docs`: staff platform a11y audit — 18 findings (3 P1, 10 P2, 5 P3) |
| #309 | `docs`: perf confirmation — phone_digits + location index EXPLAIN ANALYZE |
| #310 | `docs`: patient portal E2E QA report — 8-screen pass, all green |
| #317 | `docs(qa)`: seed patient data QA pass — 2026-06-19 |
| #325 | `docs(qa)`: seed data QA — appointments, episodes, records (16 integrity checks, all pass) |

### /ship tooling

| PR | Title |
|----|-------|
| #311 | `feat(dev)`: `/ship` command + `scripts/merge-on-green.sh` — polls GitHub Actions check-runs (not statuses), ignores Vercel; handles pnpm-lock conflicts |

### Storybook

| PR | Title |
|----|-------|
| #312 | `feat(ui/stories)`: Input, Textarea, UserAreaCluster stories |
| #323 | `feat(ui/stories)`: StatusBadge, GlassStatusChip, Tabs — expanded stories, JSDoc, context demos |

### M1 dashboard / Notas rápidas reference docs

| PR | Title |
|----|-------|
| #313 | `docs`: staff dashboard feature reference — Resumo semanal, Receita, Notas rápidas, Marcações window (code-verified data sources, per-staff vs tenant-shared scoping) |

### i18n

| PR | Title |
|----|-------|
| #314 | `fix(i18n)`: terminology, capitalisation and register fixes PT+EN — applies quick-fix candidates from `docs/qa-i18n-consistency-2026-06-19.md`; no keys renamed/dropped/added |

### Performance (P2/P3)

| PR | Title |
|----|-------|
| #315 | `perf(web)`: cache agenda reference data with `unstable_cache` (60 s revalidate, P3-5 from performance audit) |

### Staff platform a11y

| PR | Title |
|----|-------|
| #316 | `fix(a11y)`: staff platform — all 18 findings from `docs/qa-a11y-staff-2026-06-19.md` (3 P1 blockers, 10 P2 fixes, 5 P3 nits); markup/ARIA only, no logic changes |
| #324 | `docs`: a11y verification report — post-PR #316 cross-check confirms all 18 original findings resolved; rescan finds 9 new P2 focus-ring omissions and 2 new P3 issues (documented in `docs/qa-a11y-staff-verify-2026-06-19.md`) |
| #328 | `fix(admin)`: a11y — sr-only input labels, `scope=col` on table headers, contextual `aria-label` on action buttons, `role=alert` on error banners, `aria-hidden` on decorative elements; i18n audit doc for `apps/admin` |

### Full content set

| PR | Title |
|----|-------|
| #318 | `docs`: `migration-notes.md` expanded from stub to code-verified reference covering staging flow, edge cases, reconciliation format, health queries (PRs #273–275) |
| #319 | `docs(pdf-templates)`: four print-ready A4 HTML templates — fatura-recibo, declaração de presença, declaração de tratamento, relatório clínico — plus `docs/pdf-templates/SPEC.md` for Ivan to wire into Puppeteer |
| #320 | `docs`: full `architecture.md` rewrite verified against live codebase — V2 system, all four apps, Inngest pipeline, RLS/Drizzle layer, CI gates |
| #321 | `feat(reminders)`: confirmation, follow-up, and no-show notification templates — 3 new Inngest functions (`sendAppointmentConfirmation`, `sendFollowUpNotification`, `sendNoShowNotification`), 12 new templates (PT+EN × email+SMS × 3 types), `appointment/completed` and `appointment/noshow` events, `assertSmsCompliant()` guard, 36 new unit tests |
| #326 | `docs`: `permissions-matrix.md` + `test-scenarios-permissions.md` — 4-role / 24-capability matrix, `assignableRoles` anti-escalation rules, verified against `packages/auth/permissions.ts` |

### Seed depth

| PR | Title |
|----|-------|
| #322 | `feat(db)`: dev seed — 271 appointments, 12 clinical episodes, 24 records, 4 roles, 3 locations; adds `dev-ids.ts` (fixed UUIDs, side-effect-free) and `dev-reference.ts` |

### Staff E2E

| PR | Title |
|----|-------|
| #327 | `test(e2e)`: staff-scenario specs — `auth.spec.ts` (per-role login), `patients.spec.ts` (card-content assertions, phoneDisplay fixture), `dashboard.spec.ts` (9 role-gated assertions across admin/therapist/reception) |

### apps/web + apps/portal i18n sweeps

| PR | Title |
|----|-------|
| #329 | `fix(portal/i18n)`: 9 hardcoded PT strings routed through `packages/i18n` portal dictionary — `common.toast_region`, `common.version`, `common.footer_locations`, `auth.activate_req_done/pending`, `account.address_placeholder`, `forms.form_word`, `clinics.clinic_label/weekdays`; also fixes fragile `.replace('Preencher ', '')` that would break under EN locale |

*(apps/web was confirmed fully wired in a separate sweep that found no hardcoded strings — `placeholder="0.00"` and empty skeleton strings are the only intentional non-translations.)*

---

## Current state

### Phase status (unchanged from HANDOFF-2026-06-18.md)

| Phase | Status |
|---|---|
| 0 Foundations | ✅ Complete |
| 1 Discovery & Design | ✅ Complete |
| 2 Infrastructure | ✅ Complete |
| 3 Core build | ✅ Functionally complete (bar NESA epilepsy ruling) |
| 4 Payments | 🔶 Code-complete; gated on JP (VAT, protocol-discount, IfThenPay wiring) |
| 5–9 | ⬜ Unstarted |

### CI gates

- 3 required checks (**ci**, **db-tests**, **e2e**) all green on `main`.
- Branch protection: 0 required approvals; green CI is the merge gate.
- `supabase/setup-cli@v1` still floats — see **New flags** below.

### Migration state

- **Supabase migrations:** 19 files applied (0000–0018). Next free number: **0019**.
- **Drizzle journal** (`packages/db/migrations/meta/_journal.json`): 15 entries (0000–0014). **Migrations 0015–0018 exist as SQL files but are absent from the journal.** The SQL files exist (Drizzle generated them and `sync-supabase-migrations.mjs` mirrored them); the journal just needs the 4 missing entries added. No data is at risk — this is a tooling-only gap. See **Ivan queue** below.
- **`service_role` grants** remain in `supabase/seed.sql` (lines ~40–78). The M3 plan to move them into a migration is still pending Ivan's review.

### M1 items completed this session

- Staff dashboard feature reference doc (data sources, scoping) — #313.
- i18n terminology/register fixes applied to both staff and portal dictionaries — #314, #329.
- Performance P3 (agenda reference-data caching) — #315.

### M1 items still outstanding

- **Receita (mês):** revenue aggregation from issued invoices.
- **Resumo semanal:** weekly appointment count widget.
- **Notas rápidas persistence:** currently in-memory / localStorage; needs server-side per-staff storage (migration 0019 candidate). Note: `docs/features/dashboard.md` (#313) flagged stale "tenant-shared" copy in `notas-rapidas.tsx` — the code is already per-staff; only the comment is wrong.
- **Portal i18n runtime locale switcher:** portal defaults to `pt` (correct); visible language-switcher deferred.
- **`docs/SPEC.md` refresh:** still stale (predates V2).

### A11y state

- Staff platform: 18 original P1/P2/P3 findings all resolved (#316). Post-#316 rescan (#324) found **9 new P2 focus-ring omissions** and **2 new P3 issues** — documented in `docs/qa-a11y-staff-verify-2026-06-19.md`. No new P1 blockers. These are a follow-up sweep, not launch-blockers.
- Admin app: P1/P2/P3 a11y fixes applied (#328).
- Portal: all audit findings resolved in prior sessions; no new findings this session.

### Content and docs completeness

- `docs/architecture.md` — full V2 rewrite, current (#320).
- `docs/migration-notes.md` — complete (#318).
- `docs/pdf-templates/` — four HTML templates + SPEC.md (#319). Ready for Puppeteer wiring by Ivan.
- `docs/permissions-matrix.md` + `docs/test-scenarios-permissions.md` — code-verified (#326).
- `apps/web/lib/reminders/templates.ts` — full 12-template notification set in production code (#321).

---

## New flags observed this session

### `supabase/setup-cli@v1` transient failures (strengthens M3 case)

`supabase/setup-cli@v1` produced **two transient setup failures** this session:

1. One on a push in the `fix/i18n-terminology` branch (later became #316 context).
2. One in the `test(e2e)` run for #327 — CI went red on the first attempt, then cleared on re-run with no code change.

Both recovered on re-run without intervention. The root cause is the `@v1` floating tag pulling in whatever patch release the `supabase/setup-cli` maintainers last published. The M3 pin to a known-good SHA or semver (e.g. `@v1.6.3`) would eliminate these. **The two failures this session make the case for the pin more concrete.** File it as observed evidence when Ivan reviews M3.

### Staff E2E specs trimmed to deterministic core

The #327 E2E specs cover three scenarios from `docs/test-scenarios-staff.md`:
- `auth.spec.ts`: per-role login (therapist + reception)
- `patients.spec.ts`: scenario 4.1 card-content (NIF, phone)
- `dashboard.spec.ts`: 9 role-gated KPI/tile assertions

Flakier scenarios (scheduling, clinical record flows) were left for a later PR to avoid intermittent gate failures. **Watch the next few PRs** — if the three new specs show intermittent failures, the seed reset or Supabase setup timing should be investigated before adding more E2E coverage.

---

## Queued for Ivan on return

### M3 — CI hardening (HOLD for Ivan's review, do not merge)

Both items touch load-bearing CI gates or a migration:

1. **Pin `supabase/setup-cli`** in `.github/workflows/db-tests.yml:100` and `.github/workflows/e2e.yml:97`. Both currently use `supabase/setup-cli@v1` (floating). Pin to a known-good SHA or `@v1.x.y` tag. Two transient failures this session (see above) make this urgent.

2. **`service_role` grants into a migration.** Grants currently live in `supabase/seed.sql` (lines ~40–78). The M3 plan is to move them into migration `0019` so they apply in the Supabase branching flow without a seed dependency. **Next free migration number is 0019.**

3. **Drizzle journal reconciliation.** `packages/db/migrations/meta/_journal.json` has 15 entries (last: `0014_migration_staging`). Migrations 0015–0018 exist as SQL files (both in `packages/db/migrations/` and as auto-generated mirrors in `supabase/migrations/`) but are not in the journal. Ivan must add the 4 missing entries so `drizzle-kit` doesn't attempt to re-apply them. This is a tooling-only fix; no SQL changes required.

### Ivan-only infrastructure (unchanged from HANDOFF-2026-06-18.md)

- **Vercel Pro** + ownership transfer to A&I Automation.
- **Supabase Pro** before any real patient data lands.
- **DNS:** `app.osteojp.pt`, `patient.osteojp.pt`, Resend records; resolve `api.osteojp.pt` host conflict.
- **Rotate `AI_INGESTION_HMAC_SECRET`** (exposed during live ingestion test in an earlier session).
- **Rotate `DATABASE_URL_DIRECT`**, then add `PROD_DATABASE_URL_DIRECT` secret.
- **Flip `TWILIO_SENDER_ID`** to `OsteoJP`.
- **Re-enable PR approval requirement** before real patient data lands.
- **Wire PDF templates** (`docs/pdf-templates/`) into Puppeteer PDF rendering — SPEC at `docs/pdf-templates/SPEC.md`.

---

## Queued for JP (8 decisions)

Unchanged from `docs/jp-decisions-2026-06-17.md`. Ivan to forward verbatim. Summary:

| # | Item | Blocks |
|---|---|---|
| 1 | NESA intake form — confirmed field list | NESA intake form |
| 2 | Booking — optional therapist preference field (yes/no + label) | Booking flow |
| 3 | Late-cancellation / no-show fee (amount + cut-off hours) | Cancellation screen, no-show notification |
| 4 | Patient documents at launch — which types; signed-record prerequisite? | Documents section |
| 5 | Montemor-o-Novo — "Coming soon" or hidden in booking | Booking flow |
| 6 | NESA + epilepsy — absolute or relative contraindication | Contraindications logic |
| 7 | Phase 4 invoicing — VAT rate, protocol-discount rules, protocol-label copy | Invoicing go-live |
| 8 | Brand logo — original vector file (SVG/EPS/AI) | Palette verification |

---

## Parked / V1.1

- **Issue #114:** cross-tenant email uniqueness (single-tenant at launch; licensing-phase decision).
- In-portal form-filling engine (V1.1).
- Booking data-layer for therapist / category / notes; portal documents / invoices (V1.1 / Phase 4).

---

## Go-live sequence (locked)

1. Supabase Pro on.
2. Backup and restore drill.
3. Fisiozero final extraction.
4. Import to prod.
5. Go live.

**Supabase Pro precedes the cutover extraction.**

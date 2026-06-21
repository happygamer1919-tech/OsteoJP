# OsteoJP — Handoff 2026-06-20

**Ground truth is the `gh` CLI and the live repo, not this document. Where they disagree, the repo wins.**

**Prepared by:** Max (sm33xy) + Claude  
**Session:** 14 (2026-06-20)

---

## PRs merged this session (2026-06-20)

All merged to `main` on 2026-06-20.

| PR | Title |
|----|-------|
| #330 | `docs`: session 13 closeout — PRs #308–329, phase state, Ivan/JP queues |
| #331 | `fix(dashboard)`: isolate widget fetches — degrade one widget on failure, not the whole panel |
| #332 | `feat(invoicing-ui)`: invoicing list page, patient tab, gated issue action |
| #333 | `ci`: **pin `supabase/setup-cli` to v2.107.0** (M3 item — two transient failures in session 13 made this urgent) |
| #334 | `docs`: cutover runbook for go-live SOR switch |
| #335 | `test(web)`: cross-browser Playwright — add Firefox and WebKit projects to staff suite |
| #336 | `feat(portal)`: **persist patient reminder toggles server-side** (migration 0019; also fixes latent patient UPDATE grant bug) |
| #337 | `fix(dashboard)`: Resumo semanal day labels no longer overlap |
| #338 | `chore(db)`: **reconcile `_journal.json` for 0015–0019 + drift-guard test** (M3 item) |

---

## Key details on notable PRs

### #331 — Dashboard widget isolation

Each M1 dashboard widget (Resumo semanal, Receita do mês, Notas rápidas, Marcações) now fetches independently. A failure in one widget degrades that card only — the rest of the panel continues to render. This closes the last known reliability gap in the M1 dashboard.

### #332 — Invoicing UI

Phase 4 invoicing list page and patient invoice tab shipped behind the existing staff permission gate (`issue_invoices`). The gated issue action is visible to Admin and Receptionist only. Phase 4 backend (IfThenPay wiring, InvoiceXpress) is still pending JP sign-off on VAT + protocol-discount rules.

### #333 — CI pin (M3 complete)

`supabase/setup-cli` pinned to `@v2.107.0` in both `db-tests.yml` and `e2e.yml`. This was the first of the two M3 CI-hardening items. Two transient failures in session 13 made this urgent; no longer blocked by Ivan.

### #335 — Cross-browser E2E

Firefox and WebKit added as separate Playwright projects in the staff platform E2E suite (`apps/web/playwright.config.ts`). The three existing staff specs (`auth`, `patients`, `dashboard`) now run against all three engines on CI. See `docs/qa-cross-browser-staff-2026-06-20.md` for the QA report.

### #336 — Patient reminder prefs (migration 0019)

**Two changes in one:**

1. **Feature:** `reminder_sms_enabled` (DEFAULT true) and `reminder_email_enabled` (DEFAULT false) added to the `patients` table. Portal `ReminderToggles` now accepts server-read initial state and persists via `updateReminderPrefsAction` (optimistic UI + rollback on error). `planReminderChannels` and all four dispatch functions (reminder/confirmation/follow-up/no-show) gate sends on patient prefs in addition to tenant config.

2. **Latent bug fix:** The `patient` DB role had `GRANT SELECT` only on `public.patients` (migration 0010 comment: "read-only this wave"). The profile PATCH endpoint (`PATCH /api/v1/patient/profile`) was silently broken — `updateOwnProfile` would fail at the Postgres `GRANT` check before RLS ever evaluated. Migration 0019 adds `GRANT UPDATE (phone, address, postal_code, city, reminder_sms_enabled, reminder_email_enabled)` (column-level, identity fields excluded) and a `FOR UPDATE` self-scope RLS policy.

### #337 — Resumo semanal labels

Day-of-week labels on the weekly summary widget were overlapping on narrow viewports. Fixed with truncated abbreviated labels + overflow guard.

### #338 — Drizzle journal reconciliation (M3 complete)

`packages/db/migrations/meta/_journal.json` now has 20 entries (0000–0019), matching all SQL files in `packages/db/migrations/`. The 4 entries for 0015–0018 that were absent since session 12 are now present. A drift-guard test was added to CI so future SQL-without-journal gaps are caught before they accumulate. This was the second M3 item.

---

## Current state

### Phase status

| Phase | Status |
|---|---|
| 0 Foundations | ✅ Complete |
| 1 Discovery & Design | ✅ Complete |
| 2 Infrastructure | ✅ Complete |
| 3 Core build | ✅ Functionally complete (bar NESA epilepsy ruling) |
| 4 Payments | 🔶 Invoicing UI live (#332); backend gated on JP (VAT + protocol-discount sign-off, IfThenPay wiring) |
| 5–9 | ⬜ Unstarted |

### CI gates

- 3 required checks (**ci**, **db-tests**, **e2e**) all green on `main`.
- `supabase/setup-cli` now **pinned** to `v2.107.0` — transient failures eliminated (#333).
- Cross-browser E2E now runs Chrome + Firefox + WebKit on CI (#335).

### Migration state

- **20 SQL files applied:** `0000_empty_runaways` → `0019_patient_reminder_prefs`.
- **Drizzle journal:** 20 entries (0000–0019), fully reconciled (#338). No drift.
- **Next free migration number: `0020`.**
- `service_role` grants remain in `supabase/seed.sql` (lines ~40–78). M3 item to move them into migration `0020` — still pending, Ivan-only.

### M1 dashboard

| Item | Status |
|---|---|
| Widget isolation (degrade-one-on-failure) | ✅ Done (#331) |
| Resumo semanal day labels | ✅ Done (#337) |
| Receita (mês) revenue aggregation | ⬜ Outstanding |
| Notas rápidas server-side persistence | ⬜ Outstanding (uses migration 0018 `quick_notes` table — no new migration needed) |
| Portal i18n locale switcher | ⬜ Deferred (runtime defaults to `pt`) |
| `docs/SPEC.md` refresh | ⬜ Outstanding |

### Patient portal

- Reminder toggle preferences now persist server-side (#336). Patients can opt out of SMS or email independently; the scheduler respects per-patient prefs before sending.
- Profile PATCH (`phone`, `address`, `postalCode`, `city`) is now unblocked — the missing `patient` role UPDATE grant has been applied in migration 0019.

### A11y state

- Staff platform: 18 original audit findings all resolved (#316). Post-rescan found 9 new P2 focus-ring omissions + 2 P3 nits — documented in `docs/qa-a11y-staff-verify-2026-06-19.md`. No P1 blockers.
- Admin app: P1/P2/P3 fixes applied (#328).
- Portal: all audit findings resolved in prior sessions.

---

## M3 status — mostly complete

| Item | Status |
|---|---|
| Pin `supabase/setup-cli` in `db-tests.yml` + `e2e.yml` | ✅ Done (#333, pinned to `@v2.107.0`) |
| `_journal.json` reconciliation for 0015–0019 + drift guard | ✅ Done (#338) |
| Move `service_role` grants from `supabase/seed.sql` into a migration | ⬜ Still pending — Ivan-only (touches seed + CI) |

---

## Ivan queue on return

### Infrastructure (unchanged priorities)

- **Vercel Pro** + ownership transfer to A&I Automation.
- **Supabase Pro** before any real patient data lands.
- **DNS:** `app.osteojp.pt`, `patient.osteojp.pt`, Resend records; resolve `api.osteojp.pt` host conflict.
- **Rotate `AI_INGESTION_HMAC_SECRET`** (exposed during the live ingestion test).
- **Rotate `DATABASE_URL_DIRECT`**, then add `PROD_DATABASE_URL_DIRECT` secret.
- **Flip `TWILIO_SENDER_ID`** to `OsteoJP`.
- **Re-enable PR approval requirement** before real patient data lands.
- **Wire PDF templates** into Puppeteer PDF rendering — spec at `docs/pdf-templates/SPEC.md`.

### M3 remaining item

- **`service_role` grants migration:** move grants from `supabase/seed.sql` into migration `0020` so they apply in the Supabase branching flow without a seed dependency. Migration `0020` is the next free number.

### Phase 4 invoicing backend

- IfThenPay callback wiring.
- InvoiceXpress integration.
- Gated on JP VAT + protocol-discount sign-off (see JP queue below).

---

## JP queue (8 decisions, unchanged)

Ivan to forward `docs/jp-decisions-2026-06-17.md` verbatim.

| # | Item | Blocks |
|---|---|---|
| 1 | NESA intake form — confirmed field list | NESA intake form |
| 2 | Booking — optional therapist preference field | Booking flow |
| 3 | Late-cancellation / no-show fee (amount + cut-off hours) | Cancellation screen, no-show notification |
| 4 | Patient documents at launch — types; signed-record prerequisite? | Documents section |
| 5 | Montemor-o-Novo — "Coming soon" or hidden in booking | Booking flow |
| 6 | NESA + epilepsy — absolute or relative contraindication | Contraindications logic |
| 7 | Phase 4 invoicing — VAT rate, protocol-discount rules, label copy | Invoicing go-live |
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

---

## Session 15 first tasks (Max, autonomous)

1. **Notas rápidas persistence** — wire quick-notes to the `quick_notes` table (migration 0018, already applied). Per-staff scope. Replaces the current `useState`-only implementation. No new migration needed.
2. **A11y P2 follow-up sweep** — fix the 9 new focus-ring omissions and 2 P3 nits in `docs/qa-a11y-staff-verify-2026-06-19.md`.
3. **`docs/SPEC.md` refresh** — update stale spec to reflect V2 design system, portal, and current phase status.

---

## Addendum (post-recheck) — 0014 was also missing

**Discovered:** 2026-06-21, before session 15 work began.

### What happened

The tracking reconciliation in session 14 (PR #338) inserted rows for migrations 0008–0019 into `drizzle.__drizzle_migrations` based on sha256 hashes of the SQL files. The rows confirmed the hashes were registered, but **a tracking row is not proof the objects exist** — it only means the SQL was acknowledged by Drizzle's migration bookkeeping. The objects themselves can still be absent if the migration was applied to tracking without being applied to the schema.

A direct object-level recheck against prod (`to_regclass`, `pg_type`, `pg_policy`) found:

- **0008–0013**: all objects genuinely present. ✓
- **0014 (`0014_migration_staging`)**: `migration_staging_rows` table, both enums (`migration_entity_type`, `migration_staging_status`), and the `migration_staging_rows_tenant_isolation` RLS policy were all **MISSING**.

### What was applied

0014 was applied to prod using the same safe procedure as 0015–0019:

1. Schema-only snapshot (`prod-schema-pre-0014-<timestamp>.sql`).
2. Single atomic `BEGIN` / `\i packages/db/migrations/0014_migration_staging.sql` / `COMMIT`.
3. Object-level verify: table present, both enums present, policy present, 7 GRANTs to `authenticated` present.

Prod now has all migrations 0000–0019 applied. The 20-row tracking table matches reality. `prod-migrate` is a verified no-op.

### Clarification: `migration_batches` does not exist

The diagnostic probed for `public.migration_batches` speculatively. That table was never created by any migration and does not exist by design. The `batch_id` column on `migration_staging_rows` is a grouping UUID — batches are logical, not a separate table.

### Lesson learned

**Always verify object existence directly** (`to_regclass`, `pg_type`, `pg_policy`, `pg_indexes`). A row in the Drizzle tracking table proves only that the hash was registered — not that the DDL succeeded. Per-migration object checklists (as done for 0015–0019 in session 14) should be the standard for any out-of-band apply.

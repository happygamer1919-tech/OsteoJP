# Decisions log

Append-only. Every session appends decisions made and reasoning.

## 2026-06-10 — Workflow setup session

- Added "Definition of done", "Backlog", "RLS verification", "Preview
  verification for PRs", "Human-only setup", and "Environment and secrets"
  sections to root CLAUDE.md.
- Replaced the "flag it and stop" rule for owner-confirmable scope with the
  log-to-QUESTIONS.md, block-ticket, continue protocol.
- Created root script `test:e2e` (`turbo run e2e`) and a turbo `e2e` task so
  the e2e gate is runnable from repo root. Previously only `apps/web` had an
  `e2e` script, so the drafted gate `pnpm test:e2e` did not exist.
- Verified all five gates exist and run: lint PASS, typecheck PASS, test PASS,
  build FAIL (missing Supabase env vars, see QUESTIONS.md Q1), test:e2e FAIL
  (same root cause). Failures pre-exist this change and are environmental.

## 2026-06-10 — Step 1 closeout session

- PR #156 found unmerged despite session precondition. Did not merge it
  autonomously (owner review action). Closeout branch merges the #156 branch
  so this work builds on it; merge #156 before or with this PR.
- Merged global ~/.claude/CLAUDE.md: operator profile sections restored
  alongside the loop protocol (outside the repo, no git).
- Q1 resolution attempted: apps/web linked to Vercel osteojp-platform, env
  pull executed, but development scope is empty and production secrets were
  not pulled locally (e2e mutates data). Q3 and Q4 opened.
- Q2 resolved: docs/SPEC.md created from mega-plan.md; mega-plan.md is now a
  pointer. SPEC is the single source of truth.
- Gates re-run: build still FAIL (portal only; web, admin, api build green),
  test:e2e still FAIL (missing E2E_* creds and seeded DB). Both purely
  environmental, no app code touched per session scope.

## 2026-06-10 — Q3/Q4 resolution session (Max)

- Q3 resolved: dev/e2e credentials will use a dedicated non-production Supabase
  project, never production. Dev Supabase project creation is a follow-up task
  for Ivan. Until then local e2e stays on CI's seeded DB workflow.
- Q4 resolved: osteojp-portal Vercel project created under Ivan_Bong_420's
  projects. Root: apps/portal. Node 22.x. Analytics off. Three NEXT_PUBLIC_*
  env vars added across all environments (non-sensitive). First production
  deployment confirmed green at osteojp-portal.vercel.app. Custom domain
  patient.osteojp.pt deferred to go-live.
- i18n copy tweaks shipped as PR #158 (two login page strings, PT + EN).
  Awaiting Ivan review and merge.

## 2026-06-11 — Migration pipeline foundation (branch migration-foundation)

- Built the source-agnostic Fisiozero → OsteoJP migration foundation in
  packages/db/src/migration: normalized intermediate types (MigrationPatient,
  MigrationAppointment, MigrationClinicalEpisode, MigrationClinicalRecord,
  MigrationAttachment) grounded 1:1 in schema.ts target columns; staging
  helpers; an idempotent importer; and a validation pass. No Fisiozero
  scraping, adapter, or field mapping was built (blocked on the CSV+ZIP export
  sample) — the seam is `interface FisiozeroSource` in src/migration/source.ts,
  TODO only.
- Idempotency design: target tables get NO source_id column. The new
  migration_staging_rows table (migration 0014, the only migration this wave,
  byte-mirrored to supabase/migrations) doubles as staging area and ledger:
  unique (tenant_id, source_system, entity_type, source_id) with
  imported_entity_id pointing at the created target row. Re-runs update (or,
  for clinical records, skip) instead of inserting — proven by a live-DB test
  that imports the same synthetic batch twice.
- Status machine on staged rows: pending → validated → imported, with failed
  + re-stage-to-pending. Transitions are guarded in SQL WHERE clauses; error
  details are structured and PII-free (codes + field names, never values).
- The importer runs ONLY through withTenantContext (authenticated role, RLS
  applies); tenant_id is still set explicitly on every insert. Patient dedupe
  delegates to the existing merge_patients() SQL function via a thin wrapper —
  not reimplemented.
- Cross-record references use source ids resolved through the ledger; refs to
  platform-owned rows (locations, practitioners, services) use resolver maps
  built per run. Free-text Fisiozero event-type → service mapping belongs to
  the future adapter, not the pipeline.
- migration_staging_rows has the standard tenant-isolation RLS policy + grant;
  covered by a dedicated RLS isolation suite. Both new DB-gated suites were
  added to .github/scripts/assert-rls-executed.mjs (now 8 hard-required
  suites) so they can never silently skip in CI.
- Opened Q5 (QUESTIONS.md): migrated records draft vs locked, and whether a
  dedicated `migrated` record_source value is wanted. Foundation supports
  both; decision needed before the first real batch.
- Gates: lint, typecheck, test (197/197 in packages/db incl. both new suites
  against a seeded local Supabase), build green for web/admin/api/db; portal
  build fails on the known pre-existing missing-env issue (Q1/Q3). supabase
  db reset applies 0000–0014 cleanly.

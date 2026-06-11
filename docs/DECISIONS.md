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

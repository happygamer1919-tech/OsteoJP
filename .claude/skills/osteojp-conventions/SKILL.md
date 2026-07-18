---
name: osteojp-conventions
description: The OsteoJP loop-execution discipline. Load this before executing any OsteoJP loop, opening a PR, running the gates, or making a merge decision - i.e. whenever you are about to branch, commit, decide whether a check is green, choose a merge class, or close a loop on the board. It carries the merge policy, the halt-loud protocol, the immutability and data-safety rules, and the two lessons learned in Wave 09. It mirrors committed authority (CLAUDE.md, docs/design/BACKLOG.md coordination protocol, docs/design/DECISIONS.md); when this file and those disagree, the source docs win.
---

# OsteoJP loop discipline

This distils the committed execution rules so a fresh session runs a loop safely
without re-deriving them. It invents nothing. The authorities are `CLAUDE.md`, the
coordination protocol in `docs/design/BACKLOG.md`, and `docs/design/DECISIONS.md`.
If this file drifts from them, they win.

## Authority order

- **Committed loop files and docs OUTRANK the session prompt.** A loop file's
  ground truth outranks any briefing shorthand; when they conflict, the committed
  doc wins and the briefing is recorded as imprecise. The board
  (`docs/design/BACKLOG.md`) is the single source of truth for live loop status;
  `gh` CLI is ground truth when indexed history is stale.
- **Done is a number, a file, or an exit code** - a merged PR number with
  checks-API evidence, a committed file, row counts, gates green. Never a
  self-asserted prose claim.

## The gates and the merge policy

- Gates, from repo root, in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, and `pnpm test:e2e` for any user-facing change.
- **Read required checks from the CHECKS API, never the PR banner.** GREEN
  self-merge only when EVERY required check (DB-gated tests, Lint+typecheck+test,
  Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform,
  osteojp-portal) are green. **Never `--admin`, never the bypass box.** A refused
  merge is a HALT, not a workaround. A flaky unrelated check is re-run, not merged
  around; never present a red required check as done.
- **Merge classes:** (a) GREEN self-merge - the default for a migration-free loop;
  (b) OWNER VISUAL GATE - visual-heavy loops: all checks green is necessary but NOT
  sufficient; push, paste the platform PREVIEW URL + the surfaces to inspect, and
  HALT for the owner to merge; (c) OWNER-MERGE - migrations, and standing
  agent-governing files (`.github/workflows/`, `.claude/skills/`): push and HALT.
- **`db-tests.yml` / `e2e.yml` are an automatic owner hold, never self-merged.**
  Workflow files are never touched by a wave loop.

## Isolation and git

- One worktree per loop as a sibling `../osteojp-<loop>`, branched from **fresh
  `origin/main`**, never stacked on an owner-held branch. A0 guard: assert
  toplevel, clean tree, HEAD == origin/main tip, and that main contains the prior
  loop's merge.
- Feature branches only; never commit to main. **Never force-push, never `--admin`,
  never rewrite history, never merge stale.** Conflicts in DECISIONS.md /
  QUESTIONS.md resolve by UNION (keep every entry, chronological).

## Halt-loud over improvisation

On a scope / product / data / reality mismatch, **HALT**: write a halt file to
`~/osteojp-mailbox/` and record the product/scope question in
`docs/design/QUESTIONS.md` with a recommended default, then move to the next
UNBLOCKED loop. Never guess a product decision; never wait idle. Product, scope,
and data questions always go to the mailbox, never self-authorized.

## Immutability and data safety (never defeated)

- The clinical-records lock trigger (`record_status` draft -> locked -> signed) and
  `audit_log` append-only are never bypassed. An immutability-bypass instinct is a
  mailbox escalation, not an action.
- Every domain table ships `tenant_id` + an RLS policy + an isolation test in the
  SAME PR. **One migration in flight at a time**, sequential numbering; a migration
  is applied by the deliberate manual step, never automated around.
- **The cloud DB is READ-ONLY** absent an explicit, per-write owner authorization
  (a single Wave 08 authorized write is spent). DB access only through
  `packages/db`; no raw SQL in app code. Money is integer cents. **PII is never
  logged** (rule 7).

## i18n is a single point of failure

Every user-facing string is a key in BOTH `packages/i18n/src/strings.pt.json` and
`strings.en.json` (`StringKey` is the intersection - a one-file key fails
typecheck). `JSON.parse` BOTH files at every gate; invalid JSON kills all three
builds. pt-PT default, faithful en-GB; plain hyphens only, no em/en dashes, correct
diacritics.

## Verify and test data

SYNTHETIC-DATA-ONLY for verify; disposable test patients only. **Never run
destructive QA against Maria Joao Silva** (`triboimax635+maria@gmail.com`).
Reference therapist for tests is **Tiago Reis**. E2E runs against local
`127.0.0.1` Supabase; the seeded Playwright E2E in CI is the authoritative gate.

## Two lessons from Wave 09 (Correcoes CB)

1. **Flip the board row on EVERY loop close - it is part of closing, not an
   afterthought.** When a loop merges, flip its `docs/design/BACKLOG.md` row to
   DONE (with the PR number + merge commit + a one-line outcome) in the docs delta
   that rides the NEXT loop's PR, and re-scan for rows whose gate just cleared. This
   was missed once in Wave 09; the owner ruled it standing. A stale board row is a
   defect.

2. **Return to the reporter's SOURCE LANGUAGE before concluding a QA reporter is
   wrong.** When a QA item's premise appears false against the code, re-read the
   reporter's exact quoted words in the QA record BEFORE deciding they were
   mistaken. **Absence-of-feature and presence-of-defect produce identical code
   reads.** In Wave 09 item 9, the code correctly showed no notes on hover; the
   premise was read as "notes leak on hover (contain them)" when the reporter
   actually meant "notes are missing from hover (add them)" - a feature request, not
   a leak. The code read was right; the conclusion was backwards. Quote the source,
   then conclude.

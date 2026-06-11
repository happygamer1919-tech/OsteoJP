# Design Loop — Implementation Plan

This file is the single backlog and protocol for the autonomous design-system
build-out. A terminal with no other context can run a full wave by reading this
file top to bottom and following the protocol below. Tasks are added to the
waves in later PRs; the protocol is fixed.

---

## How the loop works

Run one task at a time, in order, never skipping ahead. For each task:

1. **Pick the first unchecked task** (`- [ ]`) in the current wave. If the
   current wave has no unchecked tasks, the loop is done — see step 9.
2. **Create a fresh worktree off `origin/main`**, named after the task:
   `git fetch origin` then
   `git worktree add ../OsteoJP-<task-id> -b design/<task-id>-<slug> origin/main`.
   Never reuse another task's worktree. Never branch off local `main`.
3. **Implement strictly per the SPEC file the task references.** Do only what
   that SPEC specifies for this task. Use only values from `docs/brand-tokens.md`.
   Do not invent scope, tokens, or components the SPEC does not call for.
4. **Run the gates for the affected packages** and fix until green, in order:
   `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (scope to the
   touched packages where the toolchain allows). Do not proceed while any gate
   is red.
5. **Invoke the `design-reviewer` subagent on your own diff**, then the
   `a11y-reviewer` subagent. Fix every finding of severity `blocker` and `fix`.
   Re-run both reviewers until each returns `PASS` (or only `nit` findings
   remain). Re-run the step-4 gates after any fix.
6. **Open a PR with the standard template**, title prefixed with the task ID
   (e.g. `[W1-01] Button component`). The PR body uses the repo's standard
   format: plain-language summary, a preview-deployment verification checklist
   with role-specific steps where relevant, and any DECISIONS.md / QUESTIONS.md
   entries added.
7. **Tick the task checkbox in this PLAN.md inside the same PR** (`- [ ]` →
   `- [x]`). The checkbox flip and the implementation ship together.
8. **Move to the next unchecked task.** Never touch a checked (`- [x]`) task.
   Never push to `main` and never merge your own PR.
9. **Stop when the wave has no unchecked tasks** and report a summary listing
   every PR opened in the run (task ID, title, PR URL, gate/reviewer status).

Hard rules: one task = one worktree = one branch = one PR. Token values come
only from `docs/brand-tokens.md`. Blocker and fix findings must be resolved
before the PR is opened. Never push to `main`.

---

## Wave 1 — Foundation components

<!-- Tasks added in a later PR. Each: `- [ ] [W1-NN] <name> — SPEC: docs/design/SPEC-<x>.md` -->

_(no tasks yet)_

---

## Wave 2 — Staff screens

<!-- Placeholder. Tasks added in a later PR. -->

_(no tasks yet)_

---

## Wave 3 — Portal

<!-- Placeholder. Tasks added in a later PR. -->

_(no tasks yet)_

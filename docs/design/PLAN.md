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

W1-01 is a hard gate: it must be merged into main before any other Wave 1 task starts; pause and wait for that merge after opening the W1-01 PR.

- [x] W1-01 — Foundation prerequisites + Button. Add lucide-react to packages/ui (the single approved new dependency), add motion tokens (duration-fast/base/slow, ease-standard, reduced-motion handling) to theme.css per spec section 2, build Button per section 4.1 with all four variants, three sizes, and all six states including loading. Storybook story covering every variant x size x state. Acceptance: gates green, design-reviewer PASS, a11y-reviewer PASS, no hex literals in the diff.
- [x] W1-02 — Field, Input, Textarea per section 4.2. Label association, required marker, helper and error rendering with role=alert, leading and trailing slots, all states. Story shows default, focus, invalid, disabled, with helper and with error.
- [x] W1-03 — Select, Checkbox, Switch per section 4.3. Native select skinned, checkbox with indeterminate, switch with role=switch and animated thumb. Story per control covering all states.
- [x] W1-04 — Card, KpiCard, StatusChip per sections 4.4 and 4.5. Card header and footer slots, interactive variant with single tab stop, KpiCard loading skeleton, StatusChip five tones with and without dot. Stories included.
- [x] W1-05 — Drawer and Dialog per section 4.6. Focus trap, restore, Escape, backdrop, dirty-state discard confirmation wiring between them, sticky header and footer, mobile full-width behavior. Story demonstrates open, close, and dirty-discard flow.
- [ ] W1-06 — Table and TableCardRow, Tabs, SegmentedControl per sections 4.7 and 4.8. Table built-in loading, empty, and error states using Skeleton and EmptyState from W1-07 if merged, otherwise placeholder slots with a TODO referencing W1-07 and a follow-up note in the PR. Keyboard semantics for tabs and segments.
- [ ] W1-07 — Skeleton, EmptyState, ErrorState per section 4.10. Shimmer with reduced-motion fallback, SkeletonText and SkeletonTable helpers, EmptyState heritage prop consuming HeritageDivider from W1-09 if merged, otherwise prop reserved with TODO. Stories for all shapes and compositions.
- [ ] W1-08 — Toast and Banner per section 4.9. Single polite live region, assertive for error tone, max 3 stack, pause on hover and focus, Banner single-instance rule documented in the story. Story triggers each tone.
- [ ] W1-09 — HeritageDivider per section 4.12, plus the allowed-hosts rule documented in the component docblock. Both variants, aria-hidden, tiling verified visually in the story at 3 widths.
- [ ] W1-10 — AppShell (staff + portal layouts) per section 4.11. BrandLockup integrated, nav as data with role filtering left to callers, mobile collapse to drawer + persistent help button on staff, bottom tab bar on portal with 44px targets. Story renders both layouts with sample nav data. This task migrates apps/web to consume the shared shell with zero visual regression beyond the spec, and is the only Wave 1 task allowed to touch apps/web.

Cross-task rules: never edit another task's component except through its exported API. If a dependency task has not merged, ship with the documented TODO pattern rather than blocking or building a private copy. Every PR ticks its own checkbox in PLAN.md.

---

## Wave 2 — Staff screens

<!-- Placeholder. Tasks added in a later PR. -->

_(no tasks yet)_

---

## Wave 3 — Portal

<!-- Placeholder. Tasks added in a later PR. -->

_(no tasks yet)_

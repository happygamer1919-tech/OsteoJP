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
8. **Decide merge via the "Self-merge policy" below**, then move to the next
   unchecked task. Never touch a checked (`- [x]`) task. Never `git push`
   directly to `main`; the only way main advances is a policy-compliant merge.
9. **Stop when the wave has no unchecked tasks** and report the end-of-wave
   summary. List every PR opened in the run (task ID, title, PR URL,
   gate/reviewer status, and whether it self-merged or was left open and why).
   The summary MUST also list every changed route/screen with its Vercel preview
   URL, grouped for a single human QA pass by Max.

Hard rules: one task = one worktree = one branch = one PR. Token values come
only from `docs/brand-tokens.md`. Blocker and fix findings must be resolved
before the PR is opened. Never `git push` directly to `main`; main advances only
through a merge that satisfies the "Self-merge policy".

### Parallel loops

Multiple loops may run at the same time, one per wave. Concurrency rules:

- **Wave binding.** A loop binds to exactly one wave at dispatch and only ever
  ticks checkboxes in its own wave section. It never reads, edits, or ticks a
  task in another wave's list.
- **Path allowlist per wave.** Each loop's diff must stay inside its wave's
  allowed paths:
  - **Wave 2** may touch: `apps/web`, `docs/design`, `packages/i18n` strings
    files, and NEW files under `packages/ui`.
  - **Wave 3** may touch: `apps/portal`, `docs/design`, `packages/i18n` strings
    files, and NEW files under `packages/ui`.
  No loop may modify an EXISTING `packages/ui` component file. If a task needs a
  change to an existing `packages/ui` component, stop that task, log it in
  `docs/QUESTIONS.md` (the component, the needed change, the blocked task), and
  move to the next task. The design-reviewer blocks any file outside the bound
  wave's allowlist.
- **i18n strings are additive.** Strings files under `packages/i18n` are
  append-only across loops: on a rebase conflict, keep BOTH sides and never drop
  an existing key.
- **Shared gate (cross-wave prerequisite).** A wave's task list may declare a
  task in ANOTHER wave as its prerequisite. When a task names such a
  prerequisite, the loop polls GitHub for that PR's merge before starting the
  task — `gh pr view <pr> --json state,mergedAt`, `sleep 600` between checks. If
  it is still unmerged after 8 hours, give up, report the block, and move to the
  next task.

### Self-merge policy

After both reviewers PASS and the PR is open, the loop may merge its own PR ONLY
when ALL of these hold:

- Every required status check is green, verified with `gh pr checks` showing
  nothing pending. Admin bypass of a pending or failing required check is
  forbidden.
- Both reviewer agents (design-reviewer and a11y-reviewer) returned `PASS` after
  all fixes.
- The e2e suite is green whenever the diff touches `apps/web` or `apps/portal`.
- The diff stays entirely inside the bound wave's path allowlist.
- The diff contains ZERO changes to any of: drizzle migrations, anything RLS- or
  auth-related, payment or webhook code, `.github/workflows`.

If any single condition is unmet, leave the PR open, summarize exactly which
condition blocked it, and continue to the next task. Never use admin privileges
to force a merge past a pending or failing required check.

Failed NON-required checks (for example a Vercel deploy that was skipped or
rate-limited) do not block self-merge; when self-merging past one, say so
explicitly in the summary.

---

## Wave 1 — Foundation components

W1-01 is a hard gate: it must be merged into main before any other Wave 1 task starts; pause and wait for that merge after opening the W1-01 PR.

- [x] W1-01 — Foundation prerequisites + Button. Add lucide-react to packages/ui (the single approved new dependency), add motion tokens (duration-fast/base/slow, ease-standard, reduced-motion handling) to theme.css per spec section 2, build Button per section 4.1 with all four variants, three sizes, and all six states including loading. Storybook story covering every variant x size x state. Acceptance: gates green, design-reviewer PASS, a11y-reviewer PASS, no hex literals in the diff.
- [x] W1-02 — Field, Input, Textarea per section 4.2. Label association, required marker, helper and error rendering with role=alert, leading and trailing slots, all states. Story shows default, focus, invalid, disabled, with helper and with error.
- [x] W1-03 — Select, Checkbox, Switch per section 4.3. Native select skinned, checkbox with indeterminate, switch with role=switch and animated thumb. Story per control covering all states.
- [x] W1-04 — Card, KpiCard, StatusChip per sections 4.4 and 4.5. Card header and footer slots, interactive variant with single tab stop, KpiCard loading skeleton, StatusChip five tones with and without dot. Stories included.
- [x] W1-05 — Drawer and Dialog per section 4.6. Focus trap, restore, Escape, backdrop, dirty-state discard confirmation wiring between them, sticky header and footer, mobile full-width behavior. Story demonstrates open, close, and dirty-discard flow.
- [x] W1-06 — Table and TableCardRow, Tabs, SegmentedControl per sections 4.7 and 4.8. Table built-in loading, empty, and error states using Skeleton and EmptyState from W1-07 if merged, otherwise placeholder slots with a TODO referencing W1-07 and a follow-up note in the PR. Keyboard semantics for tabs and segments.
- [x] W1-07 — Skeleton, EmptyState, ErrorState per section 4.10. Shimmer with reduced-motion fallback, SkeletonText and SkeletonTable helpers, EmptyState heritage prop consuming HeritageDivider from W1-09 if merged, otherwise prop reserved with TODO. Stories for all shapes and compositions.
- [x] W1-08 — Toast and Banner per section 4.9. Single polite live region, assertive for error tone, max 3 stack, pause on hover and focus, Banner single-instance rule documented in the story. Story triggers each tone.
- [x] W1-09 — HeritageDivider per section 4.12, plus the allowed-hosts rule documented in the component docblock. Both variants, aria-hidden, tiling verified visually in the story at 3 widths.
- [x] W1-10 — AppShell (staff + portal layouts) per section 4.11. BrandLockup integrated, nav as data with role filtering left to callers, mobile collapse to drawer + persistent help button on staff, bottom tab bar on portal with 44px targets. Story renders both layouts with sample nav data. This task migrates apps/web to consume the shared shell with zero visual regression beyond the spec, and is the only Wave 1 task allowed to touch apps/web.

Cross-task rules: never edit another task's component except through its exported API. If a dependency task has not merged, ship with the documented TODO pattern rather than blocking or building a private copy. Every PR ticks its own checkbox in PLAN.md.

---

## Wave 2 — Staff screens

Wave 2 binds to apps/web per the parallel-loops path allowlist. W2-01 is a hard gate: it must be merged into main before any other Wave 2 or Wave 3 task starts; pause and wait for that merge after opening the W2-01 PR (self-merge it when the policy conditions hold).

- [x] W2-01 — Composite components in packages/ui (NEW files only): Combobox, DatePicker, TimeField, SlotPicker per SPEC-staff-screens section 2, each with full states and Storybook stories. Shared hard gate for Wave 2 and Wave 3.
- [x] W2-02 — Dashboard per SPEC-staff-screens section 3. Same metrics and data as today, KpiCards, appointments table, all states, role scoping unchanged.
- [x] W2-03 — Agenda per SPEC-staff-screens section 4: toolbar, day grid, week view, current-time line, slot interactions, overlap rendering, blocked time, all states, mobile single-therapist day view.
- [x] W2-04 — Appointment Drawer per SPEC-staff-screens section 5: create, view, edit modes, patient search Combobox with create pivot, conflict banner, dirty-discard, toasts. Replaces the current appointment modal with identical data and permissions.
- [x] W2-05 — Patient profile per SPEC-staff-screens section 6: header card, permission-filtered tabs, view-then-edit cards, history table, clinical records list with the two separate status axes, documents, patient-scoped invoicing tab.
- [ ] W2-06 — Clinical record editor per SPEC-staff-screens section 7: section rail, restyled form engine output, AI-prefill caption on narrative fields only, bodychart container restyle only, status bar with autosave text, locked and signed read-only rendering, single review banner. No heritage on this screen.
- [ ] W2-07 — Invoicing view per SPEC-staff-screens section 8: filters, table, detail drawer, disabled-with-helper actions for inactive integrations, admin and owner gating per existing permissions.
- [ ] W2-08 — Polish and debt per SPEC-staff-screens section 9: app-shell ring fix or file removal, hex and spacing sweep with grep proof, anti-goal verification (one banner max, no blank-then-pop, motion budget), pt-PT and en-GB pass on all six screens.

---

## Wave 3 — Portal

Wave 3 binds to apps/portal per the parallel-loops path allowlist. Cross-wave prerequisite: do not start any Wave 3 task until the Wave 2 task W2-01 PR is merged to main (poll per the shared gate pattern). W3-01 is then this wave's own hard gate: merge it before starting W3-02 onward. Heritage motifs are forbidden in apps/portal this wave (QUESTIONS Q6 item b, pending JP).

- [x] W3-01 — Migration gate per SPEC-portal section 1: portal consumes packages/ui theme.css, all hardcoded hexes migrated with grep proof, every emoji replaced with the canonical lucide icons, portal AppShell adopted with bottom tabs, Inter loaded. Existing portal e2e flows stay green.
- [x] W3-02 — Login and Activate per SPEC-portal sections 3 and 4: brand lockup, restyled credential and activation forms, inline validation, expired-token ErrorState, language switcher.
- [x] W3-03 — Dashboard per SPEC-portal section 5: greeting, next-appointment hero card, single pending-forms banner, quick actions grid, all states.
- [x] W3-04 — Appointments list and detail per SPEC-portal section 6: upcoming and history segments, appointment cards, detail with 24h-cutoff-aware cancel and email-only reschedule, all states.
- [x] W3-05 — Booking flow per SPEC-portal section 7: four steps with progress, inline DatePicker plus SlotPicker, confirm summary, honest pending status on success, slot-taken recovery without state loss.
- [ ] W3-06 — Clinics and Account per SPEC-portal section 8: clinic cards, grouped account rows, view-then-edit drawer, language preference, sign-out with confirm.
- [ ] W3-07 — Documents and Forms per SPEC-portal sections 9 and 10: document list with download, pending-first forms list, restyled form filling, submit flow that always communicates pending_review.

Cross-task rules for both waves: never edit another task's files except through exported APIs; never modify existing packages/ui components (stop and log to QUESTIONS.md); i18n strings additive keep-both; each PR ticks only its own checkbox; self-merge strictly per the PLAN.md self-merge policy.

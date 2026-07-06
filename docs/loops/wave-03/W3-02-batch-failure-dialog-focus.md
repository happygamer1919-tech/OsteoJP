# Loop W3-02 - Batch failure dialog focus + stacking fix (migration-free)

GATE: none. UI lane, migration-free. Recon-first. Runs in parallel with any one in-flight migration (touches no `packages/db` or workflow files).

## Field 1. Scope and ground truth
The partial-success batch failure dialog (`BatchFailureDialog`, shipped W2-05 #457 and reused by W2-10 #462) renders BEHIND or ALONGSIDE the "Nova marcação" drawer. Because it sits inside/under the drawer, any interaction with the dialog triggers the drawer's "Descartar alterações?" (discard changes) prompt, making the dialog effectively uninteractable — the user cannot edit-and-rebook a failed slot.

Ground truth (locked rulings to embed — GREEN runs with zero memory):
- **Batch scheduling is partial-success by design** (DECISIONS 2026-07-03): booking N slots books every FREE slot and reports each failure with its reason and nearest free alternative in the failure dialog; it never refuses the whole batch. The dialog offers a per-row inline date/time edit that re-attempts that ONE slot through the same engine (count = 1). Successes are never blocked.
- The failure dialog and the drawer's dirty-state discard guard ("Descartar alterações?") are the two interacting pieces. The dialog must live TOP-MOST with its own focus scope; interacting with it must never bubble into the drawer's discard/dirty-state guard.

Fix required: the failure dialog renders top-most (correct portal / z-index / focus trap), receives focus on open, and is fully interactable; interacting with it NEVER triggers the drawer's discard prompt; edit-and-rebook works end to end from the dialog (a failed slot is re-attempted and, on success, moves out of the failure list).

Recon before writing (report findings, paste paths):
- `BatchFailureDialog` component path and how it is mounted relative to the appointment drawer (is it a child of the drawer's DOM/portal subtree? shared overlay root?).
- The drawer's discard-prompt logic ("Descartar alterações?") — what dirty-state / outside-interaction condition triggers it, and why dialog interaction currently satisfies that condition.
- The overlay/portal and focus-management primitives already in use (the shadcn/Radix Dialog stack, z-index tokens, focus-trap utilities) so the fix uses the established pattern, not a bespoke one.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-02-batch-failure-dialog-focus origin/main -b osteojp-w3-02-batch-failure-dialog-focus`; assert `git rev-parse --show-toplevel` ends in the worktree name (NOT the primary clone); assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE editing: the dialog mount relationship to the drawer, the exact discard-prompt trigger condition, and the established overlay/focus primitives.
3. Fix stacking + focus: render `BatchFailureDialog` top-most (own portal/overlay root above the drawer, correct z-index, focus trapped inside it on open). Isolate it from the drawer's discard guard so clicking/typing inside the dialog is not treated as an outside-interaction or a drawer dirty-state change.
4. Verify the inline rebook path: editing a failed slot's date/time and re-attempting resolves that one slot through the same engine and updates the dialog (success removes the row; a still-busy slot re-reports with its reason + nearest alternative).
5. Tests: component/interaction test — dialog is focused and top-most on open; interacting with it does NOT invoke the discard prompt; a rebound slot leaves the failure list.
6. Full gates for the touched user-facing views: lint, typecheck, test, build, and `test:e2e` covering the partial-failure batch → dialog → edit-and-rebook flow.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Recon report pasted (dialog/drawer mount relationship + discard-trigger cause).
- e2e proves, in order: trigger a batch with at least one busy slot → failure dialog appears TOP-MOST and FOCUSED → clicking/editing inside it does NOT open "Descartar alterações?" → editing one failed slot's time and re-attempting books it and removes it from the list. Paste the e2e summary.
- Component/interaction tests for the three assertions (top-most+focused, no discard prompt on interaction, rebook clears the row) pass. Paste results.
- Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only`, component/interaction test results, e2e summary of the full edit-and-rebook flow, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change, no engine change (the `batchSchedule` engine and `batch-failure-core.ts` logic stay as shipped in W2-05/W2-09 — this is a stacking/focus/interaction fix only).
- Preserve partial-success semantics: successes are never blocked; the dialog only handles failed slots (DECISIONS 2026-07-03).
- A0 worktree isolation: work only in `../osteojp-w3-02-batch-failure-dialog-focus` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight (this loop opens none).
- Never force-push. Never merge with `--admin`. Never bypass branch protection.
- pt-PT via i18n keys, no hardcoded strings, no emoji. DB access only through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if
- The dialog cannot be lifted top-most without editing shared overlay primitives in `packages/ui` in a way that risks other dialogs (surface the tradeoff and the blast radius rather than proceeding).
- The discard-prompt trigger cannot be isolated from dialog interaction without changing the drawer's dirty-state semantics for the ordinary edit case (would regress the discard guard).
- Fixing focus/stacking would require an engine or data-model change (moves it out of the migration-free UI lane).
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-02.md` stating the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop with the branch green and the resume state recorded. Never guess a product decision.

## Field 7. Report back
Recon report, the stacking/focus/isolation fix, component/interaction test results, migration-free proof, e2e summary of edit-and-rebook, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check SUCCESS, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.

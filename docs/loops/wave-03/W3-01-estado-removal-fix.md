# Loop W3-01 - Estado selector removal from Nova marcação (recon-first, migration-free)

GATE: none. UI lane, migration-free. Recon-first: a prior fix (W2-02, PR #454) claimed removal but QA proved it did not take. Runs in parallel with any one in-flight migration (touches no `packages/db` or workflow files).

## Field 1. Scope and ground truth
Rodica QA screenshots (2026-07-05) prove the **Estado** selector (the appointment lifecycle control) is STILL present in the "Nova marcação" creation flow, despite W2-02 (#454) claiming its removal. Recon why the earlier fix did not take, then remove it for good across every creation surface.

Ground truth (locked rulings to embed — GREEN runs with zero memory):
- **Two orthogonal axes, never collapsed** (DECISIONS 2026-07-01, migration 0024): `status` (lifecycle: `scheduled` → `confirmed` → `completed` → `cancelled` → `no_show`) and `confirmation_state` (`pending` / `confirmed` / `declined`) are SEPARATE axes and must never be merged into one control. Removing the Estado (lifecycle) selector must NOT touch or collapse the confirmation axis.
- **Creation invariant:** every new appointment is created with lifecycle `status = scheduled` and `confirmation_state = pending` (pt-PT display "pendente"). There is NO lifecycle selector anywhere in the creation UI. Lifecycle transitions happen later, from the appointment's own actions, never at creation.
- **Why the W2-02 fix likely did not take:** there is more than one creation surface. Candidates: the primary "Nova marcação" drawer, the "Agendar lote" batch drawer (W2-10, #462), and any residual "Marcação recorrente" remnant. W2-02 probably edited one surface and missed a second drawer or a shared form sub-component that still renders the Estado control. Recon must enumerate ALL of them.

Recon before writing (report findings, paste component paths):
- Every component that CREATES an appointment: the Nova marcação drawer, the Agendar lote drawer, and any shared appointment-form sub-component they mount. Identify precisely which one(s) still render an Estado / lifecycle `status` selector.
- The create server action(s) and whether any of them read a lifecycle `status` from user input (form field) rather than hardcoding `scheduled`.
- The confirmation-axis controls (the W2 confirmation thumbs, #441) — confirm they are DISTINCT from the Estado selector so removal does not disturb them.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w3-01-estado-removal-fix origin/main -b osteojp-w3-01-estado-removal-fix`; assert `git rev-parse --show-toplevel` ends in the worktree name (NOT the primary clone); assert `git status --porcelain` is empty. HALT if either fails.
2. Recon, report BEFORE editing: the full list of creation surfaces and the exact component/line still rendering the Estado selector; the create action(s) and whether any read lifecycle `status` from input; confirmation-axis controls confirmed distinct. Explain why W2-02 missed it.
3. Remove the Estado / lifecycle selector from EVERY creation surface recon found (drawer, lote drawer, any shared sub-component). Ensure the create path hardcodes `status = 'scheduled'` and `confirmation_state = 'pending'` server-side, never from a user-supplied lifecycle field.
4. Tests: component test asserting no lifecycle Estado control renders in each creation surface; a create-action test asserting a new appointment is persisted with `status = scheduled` and `confirmation_state = pending` regardless of payload.
5. Full gates for the touched user-facing views: lint, typecheck, test, build, and `test:e2e` covering Nova marcação (assert the Estado control is absent and a created appointment is scheduled/pendente).

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Recon list of ALL creation surfaces pasted, with the specific surface(s) that still had the Estado control identified and the root cause of the W2-02 miss stated.
- No lifecycle Estado selector renders in ANY creation surface: paste a `git grep` for the removed control returning zero hits in creation components, plus the passing component tests.
- Create path proven to always persist `status = scheduled`, `confirmation_state = pending`: paste the create-action test result.
- e2e green proving the Estado control is absent from Nova marcação and a created appointment is scheduled/pendente (paste summary).
- Confirmation axis untouched: the confirmation controls still render and function (state which test/e2e proves it).

## Field 4. Verification (paste evidence)
Recon report (all creation surfaces + root cause), migration-free `git diff --name-only`, `git grep` zero-hit for the Estado control in creation components, component-test results, create-action test result, e2e summary, confirmation-axis-intact evidence, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change.
- Remove ONLY the lifecycle Estado selector. NEVER collapse or touch the `confirmation_state` axis; the two axes stay orthogonal (DECISIONS 2026-07-01).
- A0 worktree isolation: work only in the dedicated worktree `../osteojp-w3-01-estado-removal-fix` off origin/main; never edit the primary clone.
- Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`. One migration in flight at a time (repo-wide; this loop opens none).
- Never force-push. Never merge with `--admin`. Never bypass branch protection.
- pt-PT via i18n keys, no hardcoded strings, no emoji. DB access only through `packages/db` (no raw SQL in app code); `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if
- Recon finds a creation surface writing lifecycle `status` from user input that cannot be hardcoded to `scheduled` without touching the confirmation axis.
- Removing the Estado control would collapse the two axes into one (semantics regression).
- A creation surface exists that is outside this loop's understood scope (e.g. an admin bulk-import path) and would need lifecycle input.
- HALT-LOUD PROTOCOL (all halts, all W3 loops): do not improvise and do not stall the chain. Write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-01.md` stating the mismatch, the options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` for the owner answer for up to 30 minutes. If an answer arrives, apply it and archive the exchange under `~/osteojp-mailbox/archive/`. If no answer within 30 minutes, classic stop: leave the branch green (no half-applied work), record the exact resume state in the loop/ticket, and end the run. Never guess a product decision to keep moving.

## Field 7. Report back
Recon report (all creation surfaces + root cause of the W2-02 miss), per-surface removal, migration-free proof, `git grep` zero-hit, component + create-action test results, e2e summary, confirmation-axis-intact evidence, gate results, PR number.
Close: open a PR per template. GREEN chained runner applies the merge gate (every required check polled to SUCCESS with nothing PENDING, diff touches neither `db-tests.yml` nor `e2e.yml`, PR mergeable). A refused merge is a HALT.

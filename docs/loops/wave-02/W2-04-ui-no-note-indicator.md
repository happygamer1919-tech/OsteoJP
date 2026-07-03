# Loop W2-04 - No-note indicator on completed appointments (UI)

GATE: none — precondition satisfied (`note_present` capture #449 merged). UI lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db` or workflow files). Open PR and apply the merge gate; never self-merge anything touching `db-tests.yml` or `e2e.yml` (this loop touches neither). Supersedes abandoned PR #440 — do NOT touch that PR.

## Field 1. Scope and ground truth
Render a clearly visible indicator on COMPLETED appointments that have zero per-visit notes, so the clinic can catch a therapist who closed an appointment without documenting it (the owner requirement behind the soft-warning ruling, DECISIONS 2026-07-01).

TRUTH SOURCE for the live indicator: `EXISTS(appointment_notes for this appointment, tenant-scoped)` — NOT the `analytics_events` `appointment_status_changed.note_present` value. Rationale: the analytics event (#449) is the immutable HISTORICAL KPI record of whether a note was present AT completion; the indicator reflects CURRENT state, so a note added late must CLEAR the indicator. These are deliberately different reads and must not be conflated. The event stays the audit/KPI source; the indicator is a present-state read of `appointment_notes`.

Recon before writing (report findings):
- Every view that renders completed appointments and could carry the indicator: appointment preview, agenda, patient-profile Marcações tab, Marcações list. Paste the component paths.
- The existing badge/indicator component pattern (how other statuses/badges are rendered) and the established pt-PT badge wording convention.
- The tenant-scoped read path for `appointment_notes` existence (server action / query already available, or the minimal read to add — no new DB migration).

Indicator: show only when `status = completed` AND no `appointment_notes` row exists for that appointment. pt-PT label "Sem nota" (or the codebase's established badge wording pattern if it dictates a different shape). Not shown for non-completed appointments; not shown for completed appointments that have at least one note.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-nonote origin/main -b osteojp-w2-nonote`; assert `git rev-parse --show-toplevel` ends in the worktree name (NOT the primary checkout); assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE editing: the list of views rendering completed appointments (paste paths), the badge component pattern + wording convention, and the tenant-scoped `appointment_notes`-existence read available to the UI.
3. Implement the indicator: a present-state read of `appointment_notes` existence per completed appointment (tenant-scoped, via `packages/db`/server action — no raw SQL in app code), surfaced through the existing badge component in each view recon identified. pt-PT string via the i18n layer (no hardcoded copy).
4. Tests (component, per existing patterns): indicator PRESENT for completed-without-note; ABSENT for completed-with-note; ABSENT for non-completed. If the read is a server action, cover the existence query too.
5. Full gates for the touched user-facing views: lint, typecheck, test, build, and `test:e2e` for the affected screens.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- Indicator implemented in every view recon identified as rendering completed appointments (paste the list and where each got the badge).
- Component tests pass for the three cases (completed-without-note → shown; completed-with-note → absent; non-completed → absent). Paste results.
- e2e green for the agenda / patient-profile flow that surfaces the indicator (paste summary).
- Lint/typecheck/test/build green (paste commands run).

## Field 4. Verification (paste evidence)
Recon report (views + badge pattern + notes-existence read), migration-free `git diff --name-only`, the three component-test results, e2e summary, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change.
- Read TRUTH from `appointment_notes` existence (present state), NOT from `analytics_events.note_present` (historical). Do not conflate the two.
- DB access only through `packages/db` (no raw SQL in app code); tenant-scoped read, `tenant_id` from JWT context, never payload.
- pt-PT via i18n keys, no hardcoded strings, no emoji.
- Do NOT touch PR #440 (abandoned; superseded by this loop). Its closing comment is handled per the QUESTIONS 2026-07-03 housekeeping ticket when this loop merges.

## Field 6. Halt loud if
- No tenant-scoped way to read `appointment_notes` existence exists without a schema/migration change (would move this out of the migration-free lane).
- Recon finds completed appointments are not distinguishable by `status = completed` in the render path.
- The only available "note present" signal is the analytics event (which would make the indicator historical, not present-state) — surface it rather than shipping the wrong semantics.

## Field 7. Report back
Recon report, per-view implementation, three component-test results, migration-free proof, e2e + gate results, PR number. Open a PR per template and HALT for the merge gate (UI lane — no self-merge; poll every required check to SUCCESS per LOOP-DISPATCH.md before owner merge). On merge, post the superseded-by comment on #440 per the QUESTIONS 2026-07-03 housekeeping ticket.

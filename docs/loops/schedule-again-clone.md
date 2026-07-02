# Loop - Schedule-again clone endpoint (migration-free)

Status: WRITTEN. Non-migration code lane (parallel-safe, not migration-numbered — same lane as availability-query.md). Green terminal. No migration in flight required (this loop ships zero schema change). Executor: PURPLE.

## Field 1. Scope and ground truth
Build a server-side clone action: given an existing `appointments.id`, create ONE new appointment that copies the clinical shape of the source and starts fresh on its own lifecycle. This unblocks Max's "schedule-again" UI action on the patient profile (clone an existing appointment, ask the user only for the new date/time).

Schema ground truth (current through migration 0028, verified against `packages/db/src/schema.ts` — no schema change in this loop):
- `appointments` columns relevant here: `tenant_id`, `patient_id` (NOT NULL, FK), `practitioner_id` (NOT NULL, FK → `users.id`), `location_id` (NOT NULL, FK), `service_id` (nullable FK), `room` (text), `starts_at`/`ends_at` (`timestamptz`, both NOT NULL), `status` (enum, default `scheduled`), `confirmation_state` (enum, default `pending`), `confirmation_received_at` (`timestamptz`, nullable), `confirmation_channel` (nullable free text), `recurrence_rule`/`recurrence_parent_id`, `booking_group_id` (0027, bare uuid), `batch_id` (0028, bare uuid), `notes` (inline free text), `created_by`, `created_at`, `updated_at`.
- **Two orthogonal axes**: `confirmation_state` (0024) is a SEPARATE axis from `status`. Never merge them. A clone resets BOTH: `status = scheduled`, `confirmation_state = pending`.
- **Duration** is derived, not stored: `duration = ends_at - starts_at` on the source. The caller supplies the new `starts_at`; the new `ends_at` is `new starts_at + duration`.
- **`appointment_notes` (0026) is a separate append-only, per-visit RELATION** (`appointment_id`, `patient_id`, `episode_id`, `author_user_id`, `body`, `created_at`), NOT a column on `appointments`. It is never copied. The inline `appointments.notes` free-text column is likewise per-visit and is never copied.

Field-by-field clone mapping (Ivan-decided, encode exactly):
- **COPIED from source**: `patient_id`, `practitioner_id`, `service_id` (the "service"), `location_id`, and duration (`ends_at - starts_at`, re-applied to the new `starts_at`).
- **Caller supplies ONLY**: the new `starts_at`. New `ends_at` = new `starts_at` + source duration.
- **`tenant_id`**: derived from the JWT via the standard `runScoped`/`withTenantContext` path, NEVER from the payload.
- **FRESH lifecycle on the new row**: `status = scheduled`, `confirmation_state = pending`, `confirmation_received_at = NULL`, `confirmation_channel = NULL`.
- **Explicitly NOT copied**: `booking_group_id` (0027), `batch_id` (0028), the `appointment_notes` 0026 relation, the inline `notes` column, and any lifecycle timestamps (`created_at`/`updated_at` take fresh defaults). The clone is a standalone appointment, not part of the source's group or batch.
- **Also NOT copied (a clone is a standalone one-off, not a series)**: `recurrence_rule` and `recurrence_parent_id` stay NULL; `room` stays NULL; `created_by` = the acting user from JWT context, not the source's `created_by`. If committed SPEC-appointments (docs/design/SPEC-v2-marcacoes.md, and appointment creation in SPEC-v2-agenda §3) contradicts any line of this mapping, HALT and report rather than improvise.

Availability enforcement (Ivan-decided scope note): this endpoint does NOT enforce availability. The UI surfaces availability and the clinic may deliberately override it (e.g. book over a busy slot). The clone action creates the appointment at the requested `starts_at` unconditionally. Availability checking lives in the read-only availability query (availability-query.md) consumed by the UI, not here.

tenant scoping and RLS: the source appointment must belong to the caller's tenant. A cross-tenant source id is a HARD failure — RLS confines the lookup to the caller's tenant, so a foreign id resolves to zero rows and the action rejects. A test must prove the cross-tenant read returns nothing and the clone is refused. No schema change, no migration, no Supabase mirror.

## Field 2. Ordered steps
1. **A0 isolation + clean-tree guard** (verbatim, LOOP-DISPATCH.md): own worktree off origin/main — `git worktree add ../osteojp-schedule-again origin/main -b osteojp-schedule-again`. Assert `git rev-parse --show-toplevel` ends in the worktree name, NOT the primary checkout. Assert `git status --porcelain` is empty. Never `git checkout -b` in a shared checkout. HALT if either assertion fails.
2. **Read-only recon, report BEFORE writing**: confirm the `appointments` column names above are unchanged on main; confirm the `runScoped`/`withTenantContext` helper signature (packages/db/src/client.ts) and how existing appointment-creation code sets `created_by` and derives tenant claims (see apps/web/app/agenda/appointment-drawer.tsx and its server action for the established insert pattern). Report findings.
3. **Implement the server-side clone action**: accept a source `appointmentId` and a new `startsAt`; derive tenant_id from JWT (runScoped/withTenantContext); read the source row inside tenant context (RLS-scoped); if not found, reject (cross-tenant / missing source is a hard failure). Compute `duration = source.ends_at - source.starts_at`, `new ends_at = startsAt + duration`. Insert one new appointment copying ONLY the fields in the Field 1 mapping, with fresh lifecycle values and all not-copied fields left NULL/default. Return the created row (or its id). Add a thin server action wired for Max's UI action; no UI in this loop.
4. **Tests** (see DoD): round-trip clone, field-by-field copied/not-copied assertions, duration preservation, and cross-tenant rejection.
5. Typecheck, lint, unit/integration tests for the affected package green. No Supabase mirror (migration-free).

## Field 3. Definition of done (machine-verifiable)
- **Clone round-trip on dev**: create a source appointment; clone it with a new `starts_at`; assert the copied fields on the new row match the source (`patient_id`, `practitioner_id`, `service_id`, `location_id`) AND `ends_at - starts_at` equals the source duration AND the new `starts_at` is the supplied value. Paste both rows. Purge both with `DELETE ... RETURNING`.
- **Not-copied assertion**: on the cloned row assert `status = 'scheduled'`, `confirmation_state = 'pending'`, `confirmation_received_at IS NULL`, `confirmation_channel IS NULL`, `booking_group_id IS NULL`, `batch_id IS NULL`, `recurrence_rule IS NULL`, `recurrence_parent_id IS NULL`, `notes IS NULL`, and that no `appointment_notes` row was created for the clone. Paste the check.
- **Duration-preservation assertion**: explicit test that a source with a non-round duration (e.g. 45 min) clones to the same duration at the new start.
- **Cross-tenant rejection**: a clone request whose source id belongs to a different tenant returns zero-row / refused (RLS-enforced); paste the evidence that the read returns nothing and the action rejects, and that no row is inserted.
- Unit/integration tests green (paste count and pass line). Typecheck and lint clean, CI green.
- **Migration-free proof**: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/` and ZERO under `supabase/migrations/`. Paste the full `git diff --name-only`.
- Full merge-gate evidence per LOOP-DISPATCH.md: `gh pr checks` all required checks SUCCESS (poll until nothing PENDING), diff touches neither db-tests.yml nor e2e.yml, PR mergeable.

## Field 4. Verification (paste evidence)
Recon findings (confirmed column names + helper signature + existing insert pattern), clone round-trip rows, copied-field match, not-copied/lifecycle assertion, duration-preservation test, cross-tenant rejection evidence, purge with RETURNING, test count green, `git diff --name-only` proving migration-free, `gh pr checks` output.

## Field 5. Restrictions and scope boundary
- **MIGRATION-FREE PROOF REQUIRED**: `git diff --name-only origin/main` must show zero files under `packages/db/migrations/` and zero under `supabase/migrations/`. No schema change of any kind — no column, no enum value, no index, no Supabase mirror. Do NOT generate a mirror.
- Do NOT modify the `appointments` or `appointment_notes` schema.
- **db-tests.yml and e2e.yml are untouchable.** Any diff to either is an automatic hold for Ivan, never self-merged.
- No UI in this loop (the schedule-again UI action is Max's, gated on this endpoint).
- No availability enforcement in this endpoint (Ivan-decided; recorded in Field 1). Do not add an availability gate here.
- `tenant_id` from JWT only, never from payload. `created_by` = acting user, never copied from the source.
- No merge-bypass, no `--admin`, no bypass box.

## Field 6. Halt loud if
- The `appointments` schema on main differs from the Field 1 mapping (a column renamed, missing, or a new NOT-NULL column not covered by the copy/fresh/NULL rules).
- Committed SPEC-appointments (SPEC-v2-marcacoes.md / SPEC-v2-agenda §3) contradicts any line of the field-by-field clone mapping or the no-availability-enforcement choice.
- The action appears to need a schema change (any column/enum/index). Stop and report; do not improvise a migration.
- Cross-tenant isolation cannot be proven with a deliberate foreign-id read returning zero rows.
- The merge gate refuses (a refused merge is a HALT, not an escalation).

## Field 7. Report-back format
Recon findings, clone action signature shipped, clone round-trip + copied/not-copied/duration evidence, cross-tenant rejection proof, purge with RETURNING, test count green, `git diff --name-only` proving migration-free, `gh pr checks` result, PR number.

Close: open a PR per template.

# Loop 0026 - Appointment lifecycle: gated completion (soft warning) + per-visit notes

GATE: 0025 DONE (met). MIG lane. Green terminal. One migration in flight at a time - confirm 0025 is the latest migration on main and no other migration PR is open before dispatch.

## Field 1. Scope and ground truth
Migration 0026. Appointment lifecycle: gated completion (SOFT WARNING per DECISIONS.md 2026-07-01) plus per-visit notes, designed together with the Fichas relocation so the per-visit note and the ficha are not two disconnected things. SPEC-appointments.md (§2) and SPEC-patients.md (Fichas relocation) are ground truth; on any conflict with this file, HALT and report. The gate does NOT hard-block: closing an appointment without a note SUCCEEDS at the DB layer and note_present is recorded on the appointment_status_changed event (analytics_events, 0025). SPEC-appointments §2 explicitly sanctions the warn path ("rejected without a note (or warns, per JP ruling)"), so soft warning is aligned, not a divergence. Confirm 0025 is latest and no migration PR is open; this is 0026.
Credentials: drizzle-kit migrate runs cwd=packages/db, loads packages/db/.env (rotated, perms 600). Never .env.local.
Mirror: generate (node scripts/sync-supabase-migrations.mjs) then --check before the PR, or two required checks fail (the 0022 lesson).
Convention: any new app-written note relation uses the append-only policy pattern per DECISIONS.md 2026-07-01 (SELECT+INSERT policies, UPDATE/DELETE denied as 0 rows, mirroring audit_log / analytics_events), NOT the no-grant 42501 pattern used by admin-only add/remove tables.

## Field 2. Ordered steps
1. A0 isolation guard: own worktree off origin/main (git worktree add ../osteojp-appointment-lifecycle origin/main -b osteojp-appointment-lifecycle), assert toplevel is the worktree not the primary checkout, assert git status --porcelain empty. Never git checkout -b in a shared checkout.
2. Read-only recon, report BEFORE writing: the current lifecycle status enum and completion path; the per-visit note structure SPEC-appointments specifies; how Fichas currently attaches and what SPEC-patients' relocation requires; whether analytics_events needs a first-class note_present column for filterable reporting or whether it rides in payload (follow the 0025 promotion precedent: promote to a real indexed column if SPEC wants it filterable, else keep in payload).
3. Write migration 0026 per SPEC: the per-visit note structure (tenant-scoped, append-consistent), the Fichas relocation schema changes, and note_present as column or payload per recon. The gate is BEHAVIORAL (app logic + event capture). Do NOT add any NOT NULL or CHECK that would hard-block completion without a note.
4. RLS tenant-scoped fail-closed on every new relation; append-only policy pattern where app-written.
5. Generate Supabase mirror, run --check, confirm clean.
6. Apply on dev, db tests green, isolation tests for every new relation.

## Field 3. Definition of done (machine-verifiable)
- 0026 applies clean on dev (paste output).
- Per-visit note structure + Fichas relocation present per SPEC (note any SPEC override).
- Paste one appointment_status_changed completion row WITH note (note_present true) and one WITHOUT (false), both round-tripped, then purged with RETURNING.
- Proof completion with null note succeeds at the DB layer (no hard block).
- mirror --check pass, db suite green (paste count).

## Field 4. Verification (paste evidence)
Recon findings, apply output, introspection of new note/Fichas objects, both note_present rows round-tripped and purged, no-hard-block proof, mirror --check line, db test count.

## Field 5. Restrictions and scope boundary
Soft warning only, never a DB-level block. Do not touch confirmation state or lifecycle status semantics. No UI. Do not touch db-tests.yml or e2e.yml. tenant_id from JWT. No merge-bypass.

## Field 6. Halt loud if
SPEC contradicts this file on note structure or Fichas relocation, the completion path already hard-blocks, note_present cannot be captured without a change SPEC does not sanction, or any step would add a blocking constraint.

## Field 7. Report back
Recon findings, apply-clean y/n, note/Fichas objects present, note_present true+false captured and purged, no-hard-block proof, mirror --check, db test count, PR number.
Close: open a PR per template.

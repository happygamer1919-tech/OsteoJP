# Loop 0027 - Multi-therapist booking

GATE: 0026 DONE. MIG lane. Green terminal. One migration in flight at a time - confirm 0026 is the latest migration on main and no other migration PR is open before dispatch.

## Field 1. Scope and ground truth
Migration 0027. Multi-therapist booking: two appointments, two therapists, one patient, one flow. SPEC-appointments.md (§3) is ground truth for the linking mechanism; on conflict, HALT. Working assumption to verify in recon: a tenant-scoped booking-group link on appointments (nullable group id, so single appointments are untouched), NOT a structural rework of appointments. SPEC §3 names a "possible booking-group concept to relate them" and defaults to each appointment independent (both attempted, failures reported like batch), which this link supports without forcing all-or-nothing. Conflict reporting at booking time consumes the merged availability query (read-only, already on main, #396). Confirm 0026 is latest, no migration PR open; this is 0027.
Credentials and mirror: same ground truth as 0026 (packages/db/.env; generate mirror and --check before PR).

## Field 2. Ordered steps
1. A0 isolation guard: own worktree off origin/main (git worktree add ../osteojp-multi-therapist-booking origin/main -b osteojp-multi-therapist-booking), assert toplevel is the worktree not the primary checkout, assert clean tree. Never git checkout -b in a shared checkout.
2. Read-only recon, report BEFORE writing: what linking mechanism SPEC-appointments specifies (group table vs group id column), whether any grouping concept already exists on appointments, and what the booking flow needs stored (creation atomicity is app-layer, schema only carries the link).
3. Write migration 0027 per SPEC. If SPEC specifies a group relation, it is tenant-scoped with fail-closed RLS. If a nullable column, confirm existing appointments RLS covers it. Existing single-therapist appointments must remain valid with no backfill.
4. Isolation tests for any new relation.
5. Generate Supabase mirror, run --check. Apply on dev, db tests green.

## Field 3. Definition of done (machine-verifiable)
- 0027 applies clean on dev.
- Two seeded appointments (two therapists, one patient) link under one group and round-trip; paste rows, purge with RETURNING.
- Pre-existing appointments unaffected (paste a check showing null/absent group on old rows).
- mirror --check pass, db suite green (paste count).

## Field 4. Verification (paste evidence)
Recon findings, apply output, linked-pair round-trip and purge, old-rows-unaffected check, mirror --check line, db test count.

## Field 5. Restrictions and scope boundary
Schema link only, no booking UI, no batch logic (that is 0028). Do not modify the availability query. No db-tests.yml or e2e.yml. tenant_id from JWT. No merge-bypass.

## Field 6. Halt loud if
SPEC's mechanism differs from recon assumptions in a way that changes scope, a grouping concept already exists, or the flow appears to need schema this file does not sanction.

## Field 7. Report back
Recon findings, apply-clean, linked-pair proof, old-rows check, mirror --check, db test count, PR number.
Close: open a PR per template.

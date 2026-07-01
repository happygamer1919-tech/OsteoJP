# Loop 0028 - Batch scheduling engine

GATE: 0027 DONE AND availability query DONE (met, #396) AND availability_templates dev seed merged. MIG lane. Green terminal. One migration in flight at a time - confirm 0027 is the latest migration on main and no other migration PR is open before dispatch.

## Field 1. Scope and ground truth
Migration 0028 plus engine. Batch scheduling: recurrence rule in, book free slots via the merged availability query, return structured failures (busy date + hour + nearest free alternative). SPEC-appointments.md (§4) is ground truth for the recurrence model and failure shape; on conflict, HALT. Schema is expected minimal (verify in recon): a batch identifier linking created appointments and whatever recurrence-rule storage SPEC requires, nothing more. The engine consumes getTherapistAvailability (availability query, #396), it does not reimplement interval math. Live verification depends on the availability_templates dev seed (separate loop, must be merged first; HALT if absent). Confirm 0027 is latest, no migration PR open; this is 0028.
Credentials and mirror: same ground truth as 0026 (packages/db/.env; generate mirror and --check before PR).

## Field 2. Ordered steps
1. A0 isolation guard: own worktree off origin/main (git worktree add ../osteojp-batch-scheduling origin/main -b osteojp-batch-scheduling), assert toplevel is the worktree not the primary checkout, assert clean tree. Never git checkout -b in a shared checkout.
2. Read-only recon, report BEFORE writing: SPEC's recurrence model and failure shape; whether a batch/recurrence storage concept exists; confirm seeded availability_templates rows exist on dev (HALT if not); confirm getTherapistAvailability signature on main.
3. Write migration 0028 per SPEC (batch link + recurrence storage only).
4. Build the engine server-side: expand the recurrence rule to candidate slots, check each against getTherapistAvailability, book free ones, and for each conflict return the structured failure (date, hour, nearest free alternative from the same availability result). Partial success is expected behavior, not an error.
5. Isolation tests for new relations; engine tests covering all-free, all-busy, mixed, and nearest-alternative correctness.
6. Generate Supabase mirror, run --check. Apply on dev, db tests green.

## Field 3. Definition of done (machine-verifiable)
- 0028 applies clean on dev.
- Live run against seeded data: a recurrence request where some slots are free and some are booked produces booked appointments for the free slots AND structured failures (date, hour, nearest alternative) for the busy ones; paste both sides, purge created rows with RETURNING.
- Engine tests green (paste count), db suite green (paste count), mirror --check pass.

## Field 4. Verification (paste evidence)
Recon findings, apply output, live mixed-run evidence (bookings + structured failures), purge with RETURNING, test counts, mirror --check line.

## Field 5. Restrictions and scope boundary
No UI (batch failure pop-up is Max's, gated on this). Do not modify the availability query or reimplement its math. No db-tests.yml or e2e.yml. tenant_id from JWT. No merge-bypass.

## Field 6. Halt loud if
Seed absent on dev, SPEC recurrence model conflicts with recon, the engine appears to need schema beyond batch link + recurrence storage, or nearest-alternative cannot be derived from the availability result.

## Field 7. Report back
Recon findings, apply-clean, live mixed-run evidence, purge proof, engine + db test counts, mirror --check, PR number.
Close: open a PR per template.

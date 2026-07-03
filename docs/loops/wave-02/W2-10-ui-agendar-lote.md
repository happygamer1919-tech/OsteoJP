# Loop W2-10 - Agendar lote (batch V2 UI)

GATE: PRECONDITION — W2-09 (batch V2 engine, explicit per-slot datetime list) must be MERGED to main first. GREEN runner (Wave 02 single-executor, DECISIONS 2026-07-03). Migration-free. Open PR and apply the merge gate; never touch `db-tests.yml`/`e2e.yml`. Confirm W2-09 is on main before dispatch.

## Field 1. Scope and ground truth
A new "Agendar lote" flow in the booking surface (pt-PT) that collects a batch of appointments with a PER-DATE time and submits through the W2-09 explicit-list engine. Owner pre-ruling baked in: the V1 "Marcação recorrente" control is REPLACED by Agendar lote — do NOT keep both entry points.

Ground truth (verify at recon — report findings before writing):
- Where the V1 recorrente entry point lives (the `AppointmentDrawer` repeat fields wired through `batchSchedule` in W2-05) — this is the control being REPLACED.
- The W2-09 engine's explicit-list input + result types (import them; do not re-derive).
- The `therapist_services` auto-select behavior (from W2-02 / #445) to reuse for service selection.
- The W2-05 failure Dialog component (reused here for partial-failure).

User flow (each step pt-PT):
1. Select **patient**.
2. Select **therapist**; **service auto-selects** per `therapist_services` (editable).
3. Enter **count** of appointments.
4. Choose a **recurrence pattern** (every X weekday) that GENERATES candidate dates from the count.
5. **Per-date time picker**: each generated date carries its OWN time (this is the whole point — V1 could not do per-date times).
6. **Summary mini-dashboard**: list every selected slot (date + time + therapist + service) for review.
7. **Confirm** → submit the explicit slot list through the W2-09 engine.
- On partial failure: reuse the **W2-05 failure Dialog** (each failure row: reason, `nearestAlternative`, inline edit-and-rebook that re-attempts that slot through the engine).

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-agendarlote origin/main -b osteojp-w2-agendarlote`; assert toplevel ends in the worktree name; assert clean tree; confirm W2-09 is on main. HALT if any fails.
2. Recon, report BEFORE editing: the V1 recorrente entry point (to remove), the W2-09 explicit-list input/result types, the `therapist_services` auto-select, and the W2-05 failure Dialog. Paste paths.
3. Build the Agendar lote flow: patient → therapist (+ auto service, editable) → count → weekday pattern → candidate dates → per-date time pickers → summary → confirm, submitting the explicit slot list via the W2-09 engine. pt-PT via i18n.
4. REPLACE the V1 recorrente control with Agendar lote (owner pre-ruled: single entry point). Remove the old recurrente entry from the booking surface; do not leave both.
5. Partial-failure: on a result with failures, open the reused W2-05 Dialog (reasons, `nearestAlternative`, inline edit-and-rebook per row).
6. Tests: full-flow happy path (all slots free → all booked, no dialog); mixed-result submit (some booked + dialog rows with correct fields + rebook-from-dialog); per-date time is honored per slot; the V1 recorrente entry point is GONE (assert absence). e2e per existing patterns.
7. Full gates: lint, typecheck, test, build, `test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- Full Agendar lote flow implemented and submitting through the W2-09 explicit-list engine (paste where the engine call is made).
- V1 recorrente control removed (paste the diff + a test asserting its absence).
- Tests pass: happy path (no dialog), mixed result (dialog + rebook), per-date time honored. Paste results.
- e2e green for the Agendar lote flow (paste summary).
- Lint/typecheck/test/build green.

## Field 4. Verification (paste evidence)
Recon report, the engine-call site, the V1-removal diff + absence test, the flow tests (happy/mixed/per-date-time), migration-free proof, e2e + gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. No engine changes (W2-09 owns the engine; if the UI needs an engine change, HALT — reopen W2-09).
- SINGLE entry point: Agendar lote REPLACES V1 recorrente (owner pre-ruling). Do not keep both.
- Reuse the W2-05 failure Dialog and the `therapist_services` auto-select; do not reinvent.
- pt-PT via i18n keys, no hardcoded copy, no emoji. Keep the two appointment axes separate; batch appointments get house defaults. DB access only through `packages/db`, tenant from JWT.
- GREEN runner: self-merge only on all-green required checks; never touch `db-tests.yml`/`e2e.yml`.

## Field 6. Halt loud if
- W2-09 is not on main (precondition unmet), or the explicit-list engine input is not available/typed.
- Collecting per-date times or submitting the explicit list would require an engine change (that is W2-09 scope).
- Removing the V1 recorrente control would orphan a booking capability the engine cannot cover.

## Field 7. Report back
Recon report, engine-call site, V1-removal diff + absence test, flow tests, migration-free proof, e2e + gate results, PR number. Open a PR per template and apply the MERGE GATE per LOOP-DISPATCH.md (GREEN runner: all required checks SUCCESS, no db-tests.yml/e2e.yml touch, mergeable; a refused merge is a HALT).

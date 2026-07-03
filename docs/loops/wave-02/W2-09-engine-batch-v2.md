# Loop W2-09 - Batch V2 engine: explicit per-slot datetime list

GATE: none — GREEN runner (Wave 02 is single-executor, DECISIONS 2026-07-03). Migration-free (extends `batchSchedule`, `apps/web/lib/scheduling/batch.ts`, no schema change). Open PR and apply the merge gate; the runner never touches `db-tests.yml` or `e2e.yml`.

## Field 1. Scope and ground truth
Extend the batch engine (`batchSchedule`, shipped 0028) so it accepts an EXPLICIT per-slot datetime LIST as input, in addition to the existing recurrence-rule input. Motivating case (Rodica): 10 appointments, every Thursday, but a specific time chosen per date — the current recurrence rule produces one fixed time across all dates, which cannot express per-date times. This loop is engine-only; the UI that collects the per-date times is W2-10.

Ground truth (verify at recon — report findings before writing):
- The current `batchSchedule` signature and input type (recurrence-rule shape: first slot + `repeatFreq`/`occurrences` or equivalent), and its result/`failures` shape (each failure carries `reason` + `nearestAlternative`; all successes share one `batch_id`, 0028).
- Its consumers: the recorrente path was wired through `batchSchedule` in W2-05 (#457). Enumerate every caller so the refactor stays backward-compatible.
- `getTherapistAvailability` usage inside the engine (how free/busy is decided per slot), so the explicit-list path applies the SAME availability check per slot.

Design (locked):
- Add an explicit-list input mode: an array of concrete `{ starts_at, ends_at }` (or `{ starts_at, durationMin }`) slots, alongside the existing recurrence input. The engine accepts EITHER shape (discriminated input). Recurrence input is internally expanded to a slot list, so both modes converge on one per-slot booking loop.
- Backward compatible: existing callers passing the recurrence input keep working unchanged (covered by tests). No caller is required to change in this loop.
- Output contract UNCHANGED: shared `batch_id` across all booked slots; structured `successes` and `failures`, each failure carrying `reason` and `nearestAlternative` for its slot. Per-slot availability decides booked vs failed (never all-or-nothing — ruling G, DECISIONS 2026-07-03).

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-batchv2 origin/main -b osteojp-w2-batchv2`; assert `git rev-parse --show-toplevel` ends in the worktree name; assert `git status --porcelain` empty. HALT if either fails.
2. Recon, report BEFORE editing: paste the current `batchSchedule` signature + input/result types, every caller, and how per-slot availability + `batch_id` assignment work today.
3. Implement the explicit-list input mode: a discriminated input (recurrence | explicit list); expand recurrence to a slot list internally; run the SAME per-slot availability + booking loop for both; assign one shared `batch_id`; build `successes`/`failures` identically. Keep all types exported for W2-10.
4. Tests (unit, next to `batch.ts`): explicit-list input books only the FREE slots; each per-slot failure carries `reason` + `nearestAlternative`; ALL booked slots share ONE `batch_id`; the existing recurrence-rule input path is still green (backward-compat); a mixed explicit list (some free, some busy) returns the right split.
5. Full gates: lint, typecheck, test, build (and `test:e2e` if a wired caller's flow is touched — this loop is engine-only, so e2e may be unaffected; run it if any UI-consumed path changed).

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- Explicit-list mode implemented; both input modes converge on one booking loop (paste the diff of the input handling).
- Unit tests pass: explicit-list books free-only; per-slot failures carry `reason` + `nearestAlternative`; single shared `batch_id`; recurrence input still green. Paste results.
- Full suite totals pasted (before/after count).
- Lint/typecheck/test/build green.

## Field 4. Verification (paste evidence)
Recon report (signature, callers, availability + batch_id mechanics), the input-handling diff, the four unit-test outcomes, migration-free proof, suite totals, gate results.

## Field 5. Restrictions and scope boundary
- Engine only: `batchSchedule`/`batch.ts` (+ its types/tests). NO UI (that is W2-10). Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`.
- Backward compatible: do NOT break the recurrence-input callers wired in W2-05. Output contract (shared `batch_id`, `successes`/`failures` with `reason`+`nearestAlternative`) is UNCHANGED.
- Partial-success always (ruling G): never refuse the whole batch. Keep the two appointment axes separate; batch-created appointments get house defaults.
- DB access only through `packages/db`; tenant-scoped, `tenant_id` from JWT. GREEN runner: self-merge only on all-green required checks; never touch `db-tests.yml`/`e2e.yml`; never bypass protection.

## Field 6. Halt loud if
- The explicit-list mode cannot be added without breaking an existing recurrence caller's contract.
- `batchSchedule`'s result cannot express per-slot `reason`/`nearestAlternative` for explicit-list slots without a broader redesign.
- Per-slot availability would require a schema/migration change (moves out of the migration-free lane).

## Field 7. Report back
Recon report, input-handling diff, four unit-test outcomes, migration-free proof, suite totals, PR number. Open a PR per template. (GREEN runner: apply the MERGE GATE per LOOP-DISPATCH.md — every required check SUCCESS polled until nothing PENDING, diff touches neither db-tests.yml nor e2e.yml, PR mergeable. A refused merge is a HALT.)

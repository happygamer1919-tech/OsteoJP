# Loop W2-05 - Batch failure pop-up wiring (partial-success) (UI)

GATE: none — precondition satisfied (ruling G received, DECISIONS 2026-07-03 "Batch scheduling is partial-success by design"). UI lane, migration-free. Open PR and apply the merge gate; never self-merge anything touching `db-tests.yml` or `e2e.yml` (touches neither). Supersedes abandoned PR #439 — do NOT touch that PR.

## Field 1. Scope and ground truth
Implement partial-success batch booking per ruling G: booking N recurring slots books every FREE slot and reports each failure (never refuses the whole batch). Wire the existing "Marcação recorrente" UI through `batchSchedule` instead of the older all-or-nothing recurring branch of `createAppointment`.

Ground truth (verify at recon — QUESTIONS 2026-07-02 recorded this): `batchSchedule` (`apps/web/lib/scheduling/batch.ts`) has ZERO callers; the recorrente path (`AppointmentDrawer` repeat fields `repeatFreq`/`occurrences`) is wired to `createAppointment`, whose recurring branch blocks the whole series on any single conflict via an inline Banner. This loop routes the recorrente submission through `batchSchedule` and adds the failure dialog. Ground truth for behavior is ruling G; on conflict, HALT.

Recon before writing (report findings):
- How the "Marcação recorrente" path creates appointments today (the exact submit handler and the call it makes), confirming it does NOT already call `batchSchedule`.
- `batchSchedule`'s input shape (first slot + recurrence, or an explicit slot list) and its result shape — specifically the `failures` array and each failure's fields (expected: date, hour, reason, `nearestAlternative`). Paste the actual result type.
- The existing Dialog + inline-edit component patterns to reuse for the failure list.

Behavior: route the recorrente submission through `batchSchedule`. On the result:
- Successes are booked.
- If `failures.length === 0`: no dialog (silent success, existing success feedback).
- If `failures.length > 0`: open a dialog listing each failure row with date, hour, reason, `nearestAlternative`, and an inline edit control per row (adjust the datetime and rebook THAT slot from the dialog via the same `batchSchedule`/engine call). pt-PT copy throughout.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-batchpopup origin/main -b osteojp-w2-batchpopup`; assert toplevel ends in the worktree name; assert clean tree. HALT if either fails.
2. Recon, report BEFORE editing: the recorrente submit handler + its current call; confirmation that `batchSchedule` is not yet called; the `batchSchedule` input and result/`failures` shapes (paste the type); the Dialog + inline-edit patterns to reuse.
3. HALT CHECK: if recon shows the recorrente path structurally cannot hand its slots to `batchSchedule` without ENGINE changes (input contract mismatch requiring `batch.ts` changes), STOP — engine changes are W2-09 scope, not this loop. Surface evidence and a recommended default.
4. Implement: swap the recorrente submission to call `batchSchedule` (replacing the `createAppointment` recurring branch for `repeatFreq !== "none"`); keep single (`repeatFreq === "none"`) creation unchanged. Build the failure Dialog (successes summarized; failures itemized with date/hour/reason/`nearestAlternative`; per-row inline edit that re-attempts that one slot through the engine). pt-PT via i18n.
5. Tests: all-success (no dialog opens); mixed (some booked + dialog rows rendered with the right fields); rebook-from-dialog (editing a failed row's datetime and resubmitting books it / re-reports). Follow existing component/e2e patterns.
6. Full gates for the touched flow: lint, typecheck, test, build, `test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- Recorrente submission now routes through `batchSchedule` (paste the diff hunk of the swapped call).
- Tests pass for all-success, mixed, and rebook-from-dialog (paste results).
- e2e green for the recorrente booking flow (paste summary).
- Lint/typecheck/test/build green.

## Field 4. Verification (paste evidence)
Recon report (recorrente handler, `batchSchedule` result shape, dialog patterns), the HALT-check outcome, the swapped-call diff, the three test results, migration-free proof, e2e + gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. NO `batch.ts` ENGINE changes — if the wiring needs them, HALT (that is W2-09).
- Behavior is partial-success (ruling G): never refuse the whole batch; every failure is reported with reason + `nearestAlternative`.
- Keep the two appointment axes separate (`status` vs `confirmation_state`); batch-created appointments get the house defaults, same as single creation.
- pt-PT via i18n keys, no hardcoded copy, no emoji. DB access only through `packages/db`.
- Do NOT touch PR #439 (abandoned; superseded). Closing comment handled per the QUESTIONS 2026-07-03 housekeeping ticket on merge.

## Field 6. Halt loud if
- The recorrente path cannot pass its slots to `batchSchedule` without engine (`batch.ts`) changes — that is W2-09 scope.
- `batchSchedule`'s result does not expose per-failure `reason`/`nearestAlternative` (the dialog cannot be built as specified) — surface the actual shape.
- Routing through `batchSchedule` would change single (non-recurring) creation behavior.

## Field 7. Report back
Recon report, HALT-check outcome, swapped-call diff, three test results, migration-free proof, e2e + gate results, PR number. Open a PR per template and HALT for the merge gate (UI lane — no self-merge; poll checks to SUCCESS per LOOP-DISPATCH.md). On merge, post the superseded-by comment on #439 per the QUESTIONS 2026-07-03 housekeeping ticket.

# Loop W5-05 - Agendar lote: per-row editable dates (Batch 1, migration-free)

GATE: none. UI lane, migration-free. Reuses the existing `batchSchedule` action; adds no new server action.

## Field 1. Scope and ground truth
In **Agendar lote** (batch scheduling), each generated date must become **editable via a per-row date picker before creation**. Weekly generation stays the default. Availability checks and the `batchSchedule` structured-failure handling run against the **edited** dates.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- Date generation: `apps/web/lib/scheduling/lote.ts` -> `generateLoteDates(startDate, everyWeeks, count)` steps `everyWeeks * 7` days from the start (all rows land on the same weekday).
- Orchestrator + failure classification: `apps/web/lib/scheduling/batch.ts`, `apps/web/lib/scheduling/batch-core.ts`.
- UI: `apps/web/app/agenda/appointment-drawer.tsx` (lote section ~lines 180-817); failure display `apps/web/app/agenda/batch-failure-dialog.tsx`.
- **Today the UI already lets the user edit each row's TIME** (per-row `TimeField`, ~lines 798-810) but **not each row's DATE** - the date is fixed by the weekly recurrence. **This loop adds per-row DATE editing** (the genuine delta; per-row time already exists).
- Structured-failure shape (`batch-core.ts`): `BatchFailure { startsAt: ISO-UTC, date: "yyyy-mm-dd", hhmm: "HH:mm" Lisbon, reason: "busy", nearestAlternative: BatchAlternative | null }`. The batch aggregates per-slot conflicts with a nearest free alternative.
- Availability/conflict at booking runs through `findConflictsForWindow` (see `apps/web/lib/scheduling/actions.ts` `createAppointment`), which checks templates, `time_off` absences, and appointment overlaps.
- Dates: DB UTC, Lisbon wall-clock for display (CLAUDE.md date rule). TimeField 15-min step (W4 TimeField).
- **RECON FIRST (report BEFORE building):** confirm rows carry per-row time but recurrence-fixed dates; confirm the drawer's row model (how `startsAt` is composed from date + time); confirm `batchSchedule` consumes an explicit per-row `startsAt` set (so feeding edited dates needs no server change).

**Scope:** add a per-row **date picker** so each generated row's date is editable before submit; keep weekly generation as the default that seeds the rows; recompose each row's `startsAt` from (edited date + its time); run availability + `batchSchedule` structured-failure handling against the edited set; keep the failure dialog + nearest-alternative UX intact. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-05-lote origin/main -b osteojp-w5-05-lote`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the row model (date+time -> startsAt), that per-row time already exists, and that `batchSchedule` takes explicit per-row startsAt.
3. **Per-row date picker:** add a date input per generated row (default = the recurrence date), on the 4px grid + tokens (UI-STYLE.md), reusing the existing date-picker primitive used elsewhere in the drawer/agenda. Editing a row's date recomputes its `startsAt` (Lisbon wall-clock -> UTC) without touching other rows.
4. **Weekly default preserved:** the generator still seeds the rows on the weekly cadence; edits are per-row overrides on top.
5. **Availability + failures on edited dates:** the pre-submit availability check and `batchSchedule` run against the edited `startsAt` set; `BatchFailure` + nearest-alternative still render per row via `batch-failure-dialog.tsx`. No change to the failure shape or the server action.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for lote (edit a row date -> that row books on the new date; an edited date that collides surfaces the busy failure + nearest alternative).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **No-new-server-action PROOF:** `batchSchedule` / `batch-core.ts` signatures unchanged; the edit is UI-side composing `startsAt`. Paste the relevant diff scope.
- **Recon report pasted:** row model + existing per-row time + batchSchedule input.
- **Per-row date edit proven:** an e2e edits one row's date and that row books on the edited date while siblings keep the recurrence date. Paste it.
- **Edited-date conflict proven:** an e2e/unit shows an edited date that collides yields the `busy` `BatchFailure` + nearest alternative. Paste it.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, no-new-server-action proof, the per-row date-edit e2e, the edited-date conflict test, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free**; reuse `batchSchedule` + `batch-core.ts` (no new server action, no change to `BatchFailure` shape).
- **Weekly generation stays the default;** per-row edit is additive.
- **UTC in DB, Lisbon for display;** compose `startsAt` correctly (no off-by-one across the Lisbon/UTC boundary).
- pt-PT i18n (both files), no emoji, UI-STYLE.md, existing date-picker primitive (no new `packages/ui` primitive without HALT).
- **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. Halt if: `batchSchedule` does NOT accept explicit per-row `startsAt` (would need a server-action change beyond UI), or the drawer's row model cannot express per-row dates without a shared primitive change.

## Field 7. Report back
Recon report, the per-row date-edit implementation, migration-free + no-new-server-action proofs, the date-edit + conflict tests, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

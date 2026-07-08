# Loop W5-09 - Marcacoes tab per-row edit actions (Batch 2, migration-free)

GATE: none. UI + server-action-reuse lane, migration-free.

## Field 1. Scope and ground truth
The **Marcacoes** tab in the patient profile is view-only. Add **per-row edit actions** (reschedule date/time, estado change within lifecycle rules, cancel), **reusing the existing Agenda server actions**. Primary-only semantics preserved; the lifecycle and confirmation axes are never collapsed.

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory):
- The tab is labeled **Consultas** in the profile and is view-only: `apps/web/app/patients/[id]/appointments-list.tsx`. It lists appointments (date, time, practitioner, service, status badge) with a single action - **"Schedule Again"** (clone, past/completed only, ~lines 99-107). **No reschedule / estado-change / cancel per row today.**
- Agenda server actions to REUSE (do not fork): `apps/web/lib/scheduling/actions.ts` - `createAppointment`, `cloneAppointment`, and the update/cancel/estado-transition actions that the Agenda drawer already calls (e.g. `updateAppointment` for reschedule, the estado/lifecycle transition action, cancel). Availability/conflict on reschedule runs through `findConflictsForWindow` (templates + `time_off` absences + overlaps).
- **Two orthogonal axes must stay separate** (CLAUDE.md rule 4 analog for appointments, DECISIONS 0026/0024): the **lifecycle** axis (scheduled -> ... -> completed, gated completion) and the **confirmation** axis (appointment_confirmation_state) are distinct - an estado change must respect lifecycle rules and never collapse the two axes into one control.
- **Primary-only semantics** (DECISIONS 2026-07-06/07 secondary participants): availability, conflict, money attribution, and lifecycle all live on the PRIMARY pair; the secondary is display-only. Row edits operate on the primary; do not add secondary-editing here.
- **RECON FIRST (report BEFORE building):** the Consultas list component + its read query; the exact Agenda server actions for reschedule / estado / cancel and their input shapes; the permission gates (who may reschedule/cancel - reuse the Agenda gates, do not relax); the lifecycle rules an estado change must respect.

**Scope:** add per-row **Reschedule** (date/time, runs the existing availability/conflict check), **Estado change** (only transitions the lifecycle rules allow), and **Cancel**, each wired to the **same existing Agenda server action**; keep primary-only semantics; keep the lifecycle and confirmation axes distinct. pt-PT i18n (both files), UI-STYLE.md row-actions.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-09-marcacoes origin/main -b osteojp-w5-09-marcacoes`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the view-only Consultas list; the reused Agenda actions (reschedule/estado/cancel) + input shapes + gates; the lifecycle rules.
3. **Per-row actions** grouped per UI-STYLE.md (row-actions disclosure or inline ghost actions), each calling the **existing** Agenda server action - no new action, no forked logic: Reschedule (date/time -> availability/conflict check -> `updateAppointment`), Estado (lifecycle-legal transitions only), Cancel.
4. **Axes preserved:** estado control offers only lifecycle-legal transitions and never touches the confirmation axis; confirmation stays its own thing.
5. **Primary-only:** edits act on the primary pair; no secondary editing.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` from the patient profile: reschedule a row (conflict blocks an unavailable slot), change estado within rules (illegal transition rejected), cancel a row.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Action-reuse PROOF:** the new UI imports/calls the existing Agenda server actions; no new appointment mutation action is authored (or if a thin wrapper is needed, it delegates to the existing action). Paste the import/call lines.
- **Recon report pasted:** view-only list, reused actions + gates, lifecycle rules.
- **Per-row edit e2e:** reschedule (with a conflict case), estado change (with an illegal-transition rejection), cancel - all from the profile Marcacoes/Consultas tab. Paste it.
- **Axes-not-collapsed PROOF:** state + test that the estado control cannot set a confirmation-axis value and cannot make an illegal lifecycle jump. Paste it.
- **Permission gates unchanged:** reused as-is (a receptionist/therapist can only do what Agenda already allows). State it.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, action-reuse proof, the per-row edit e2e (reschedule/estado/cancel + negative cases), the axes-not-collapsed test, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Migration-free;** **reuse existing Agenda server actions** - never fork appointment mutation logic.
- **Never collapse the lifecycle and confirmation axes;** estado transitions obey the existing lifecycle rules (gated completion, DECISIONS 0026).
- **Primary-only semantics** preserved (no secondary editing here).
- **Reuse the existing permission gates;** never relax who may reschedule/cancel/change estado.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md`. Halt if: an edit action would require a NEW server action or a lifecycle-rule change (out of a UI-reuse loop), or reschedule/cancel from the profile would bypass an Agenda-side guard.

## Field 7. Report back
Recon report, the per-row actions wired to reused Agenda actions, migration-free + action-reuse proofs, the edit e2e + axes test, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

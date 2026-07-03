# Loop W2-02 - UI quick-fix batch (migration-free)

GATE: none — migration-free UI/PURPLE lane. Runs in parallel with any one in-flight migration (does not touch `packages/db/migrations` or `supabase/migrations`). Open PR and follow the merge gate; PURPLE/UI lanes never self-merge anything touching `db-tests.yml` or `e2e.yml`.

## Field 1. Scope and ground truth
Five small, independent staff-UI fixes, all pt-PT, all migration-free. No schema changes; where a fix "hides" a field, the DB column stays and historical data still displays. Ground truth is the current `apps/web` components; recon each surface before editing. Brand/tone per CLAUDE.md (pt-PT default, serious register, no emoji).

The five items:
1. **Nova marcação form — remove the Estado selector.** RECON FIRST: identify exactly what the "Estado" selector currently writes — the lifecycle `appointment_status` enum (scheduled/confirmed/completed/cancelled/no_show) or the orthogonal `confirmation_state` (pending/confirmed/declined, 0024). These are two separate axes and MUST NOT be collapsed (DECISIONS 2026-07-01, and CLAUDE.md hard rule). Only if it maps to the lifecycle `status`: remove the selector so every new appointment is created with `status = scheduled` and `confirmation_state = pending` (the house defaults). HALT if the field maps to `confirmation_state` or to anything other than the lifecycle status — the removal semantics differ and need a ruling.
2. **Archived locations excluded from selection.** Any location marked archived is excluded from EVERY selection dropdown (new-appointment booking, filters that create/scope new records). Historical records that already reference an archived location STILL display that location's name (read path unchanged). Recon the location dropdown source(s) and the archived flag before editing.
3. **Patient profile + edit form — hide street address.** Show `localidade` / `região` only; hide the street-address line in both the profile display and the edit form. The DB column is untouched (data retained, just not surfaced). Consistent with the 2026-06-30 address-reduction direction.
4. **Merge the Contactos card into Dados pessoais.** Fold the Contactos card's fields into the Dados pessoais card on the patient profile; no field is dropped, only relocated. One card instead of two.
5. **Surface the profession field.** Show `profession` (the 0022 column) in both the patient profile display and the edit form, following the existing label+value row pattern (omit the row when null, matching the #393 convention for the other 0022 fields).

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-quickfix origin/main -b osteojp-w2-quickfix`; assert toplevel ends in the worktree name; assert clean tree. HALT if either fails.
2. Recon, report BEFORE editing: for item 1, paste what the Estado selector binds to (component + the field it writes) and CONFIRM it is the lifecycle `status` (HALT otherwise). For item 2, paste the location-dropdown data source and the archived-flag column. For items 3–5, paste the patient profile + edit-form component paths and the current card structure.
3. Implement the five items, each a focused change following existing component patterns and i18n keys (no hardcoded strings — pt-PT via the i18n layer). Keep the two appointment axes separate at all times.
4. Tests: extend the existing component/e2e tests for each touched surface (new-appointment create defaults to scheduled/pending; archived location absent from the booking dropdown but present on a historical record; address hidden in profile + edit; Contactos fields present inside Dados pessoais; profession shown when set, omitted when null). Follow the repo's existing test placement (`foo.ts` + `foo.test.ts`) and e2e patterns.
5. Full gates for user-facing flows: lint, typecheck, test, build, and `test:e2e` for the affected screens.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste the command output.
- All five items implemented, each with a passing test (paste the test names/results).
- e2e green for the new-appointment flow and the patient-profile flow (paste the run summary).
- Recon evidence for item 1 pasted, confirming the Estado selector wrote the lifecycle `status` (or a HALT record if it did not).
- Lint/typecheck/test/build all green (paste the commands run).

## Field 4. Verification (paste evidence)
Recon report (Estado binding + confirmation, location dropdown source, profile/edit paths), the migration-free `git diff --name-only` output, per-item test results, e2e summary, gate command results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema changes, no column drops — "hidden" fields keep their DB columns and historical display.
- Never collapse `appointment_status` and `confirmation_state`. HALT on item 1 if the Estado field is not the lifecycle status.
- pt-PT strings via i18n keys only; no hardcoded copy. No emoji in product UI.
- UI/PURPLE lane: open a PR and apply the merge gate; never self-merge anything touching `db-tests.yml` or `e2e.yml` (this loop should touch neither).

## Field 6. Halt loud if
- Item 1's Estado selector maps to `confirmation_state` or anything other than the lifecycle `status`.
- Removing the Estado selector would leave a new appointment without a valid default `status`/`confirmation_state`.
- Any item cannot be done without a schema/migration change (that would move it out of this migration-free loop).
- The archived-location flag does not exist or the dropdown source cannot be identified.

## Field 7. Report back
Recon report, five per-item results with tests, migration-free `git diff --name-only` proof, e2e + gate results, PR number. Open a PR per template and HALT for the merge gate (UI/PURPLE lane — no self-merge on any db-tests.yml/e2e.yml touch; per LOOP-DISPATCH.md poll every required check to SUCCESS before the owner merges).

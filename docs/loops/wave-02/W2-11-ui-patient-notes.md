# Loop W2-11 - Patient notes tab + Notas Rápidas rewire to the revisions relation

GATE: none — precondition met (W2-01 / migration 0030 `patient_note_revisions` merged, #452). GREEN runner (Wave 02 single-executor, DECISIONS 2026-07-03). Migration-free (0030 already shipped the relation). Open PR and apply the merge gate; never touch `db-tests.yml`/`e2e.yml`.

## Field 1. Scope and ground truth
Flip the patient-notes UI onto the append-only `patient_note_revisions` relation (0030) per the recorded transition plan (DECISIONS 2026-07-03 "Patient notes: migration/UI transition plan"): after this loop, all note UI reads/writes go through the revisions relation and the UI no longer touches `patients.notes`. The `patients.notes` column STAYS in the DB (untouched, no migration) — only the UI stops using it. Full history semantics (JP, 2026-07-02) apply to every write from here on.

Four parts:

**(1) Read-only pre-step — trace the current Notas Rápidas write destination.** RECON, pasted before any write: where the dashboard "Notas Rápidas" card writes today (candidate: a `quick_notes` table — PR #383 noted "quick_notes saves to public.quick_notes not tenants.settings.notes"; confirm the actual destination) and the current row count.
- If the existing rows are PATIENT-LINKABLE (carry or can resolve a `patient_id`): migrate them into `patient_note_revisions` inside THIS loop via a guarded script (counts pasted before/after; `author_user_id` = original author if known else NULL; `created_at` = original timestamp if available else now()).
- If rows exist but CANNOT be mapped to a patient: HALT with the count and a recommended default (e.g. leave them in place, add a follow-up ticket; or archive) — do NOT silently drop or guess a patient.
- If zero rows / not patient-scoped by design: record that and proceed (nothing to migrate).

**(2) Patient profile — new Notas tab.** Lists `patient_note_revisions` for the patient, NEWEST FIRST, each showing author and timestamp. A composer appends a NEW revision (`author_user_id` = current user, `tenant_id` from JWT). Never edits/deletes an existing revision (append-only relation).

**(3) Notas Rápidas rewire.** The dashboard card STAYS, gains a patient SELECTOR (search). Saving appends a `patient_note_revisions` row for the selected patient (author = current user, tenant from JWT). No patient selected → cannot save (surface the requirement).

**(4) Flip off `patients.notes`.** The notes UI stops reading AND writing `patients.notes` entirely; all note UI goes through the revisions relation. The `patients.notes` column is left in the DB (no migration, no drop — its retirement is a later decision, DECISIONS 2026-07-03).

Ground truth for behavior is the transition-plan ruling; on conflict, HALT. `patient_note_revisions` shape and its tenant-scoped read/append paths come from 0030 (`packages/db`).

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-patientnotes origin/main -b osteojp-w2-patientnotes`; assert toplevel ends in the worktree name; assert clean tree. HALT if either fails.
2. Read-only recon (part 1), REPORT before writing: the Notas Rápidas write destination + row count; whether rows are patient-linkable; the current read/write sites of `patients.notes` in the UI (grep, paste the list). Decide migrate vs HALT vs nothing-to-migrate per part 1.
3. If migrating: guarded script (reuse the seed env loader + `SEED_DEV_CONFIRM` opt-in; never print credentials) copying patient-linkable quick notes into `patient_note_revisions`; paste before/after counts; idempotent (zero-delta re-run).
4. Patient profile Notas tab (part 2): list revisions newest-first with author + timestamp; composer appends a revision (author = current user, tenant from JWT), tenant-scoped read via `packages/db`.
5. Notas Rápidas rewire (part 3): add the patient search/selector; save appends a `patient_note_revisions` row for that patient.
6. Flip (part 4): remove every UI read/write of `patients.notes`; route all note UI through the revisions relation. Do NOT alter the DB column.
7. Tests: append creates a revision with the correct author; history ordered DESC; reads are tenant-scoped (cross-tenant cannot read); dashboard quick-note lands on the SELECTED patient; and a grep-backed assertion that NO UI write path references `patients.notes` anymore. e2e per existing patterns.
8. Full gates: lint, typecheck, test, build, `test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- Part 1 recon pasted (destination + count) and its outcome (migrated with counts / HALT / nothing-to-migrate); if migrated, before/after counts + zero-delta re-run pasted.
- Notas tab: append creates a revision (correct author + timestamp); history ordered desc; tenant-scoped read proven. Paste tests.
- Notas Rápidas: quick-note lands on the selected patient (paste test).
- Flip proven: `patients.notes` no longer referenced by any UI WRITE path — paste the grep evidence (and no UI read path either).
- Lint/typecheck/test/build + e2e green.

## Field 4. Verification (paste evidence)
Part-1 recon + outcome (+ migration counts/zero-delta if any), Notas-tab tests (append/order/tenant), quick-note-to-selected-patient test, the `patients.notes`-not-referenced grep, migration-free proof, e2e + gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Do NOT alter or drop `patients.notes` (column stays; retirement is a later decision).
- Append-only: the UI never edits or deletes a revision; every change is a new revision (author + timestamp). Reads/writes tenant-scoped, `tenant_id` from JWT, via `packages/db` (no raw SQL in app code).
- Any data migration is guarded (`SEED_DEV_CONFIRM`), idempotent, and HALTs on unmappable rows — never guesses a patient, never drops data, never prints credentials.
- pt-PT via i18n keys, no hardcoded copy, no emoji. GREEN runner: self-merge only on all-green checks; never touch `db-tests.yml`/`e2e.yml`.

## Field 6. Halt loud if
- Notas Rápidas rows exist but cannot be mapped to a patient (surface count + recommended default).
- The Notas Rápidas destination is not what recon assumed and mapping is unclear.
- Flipping off `patients.notes` would drop a note the revisions relation does not yet hold (ordering: migrate/backfill first, then flip).
- The append/read paths for `patient_note_revisions` are not available tenant-scoped without a schema change.

## Field 7. Report back
Part-1 recon + outcome, Notas-tab + quick-note tests, `patients.notes`-not-referenced grep, migration-free proof, e2e + gate results, PR number. Open a PR per template and apply the MERGE GATE per LOOP-DISPATCH.md (GREEN runner: all required checks SUCCESS, no db-tests.yml/e2e.yml touch, mergeable; a refused merge is a HALT).

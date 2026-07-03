# Loop W2-12 - Working-hours admin (availability template CRUD)

GATE: none — GREEN runner (Wave 02 single-executor, DECISIONS 2026-07-03). Migration-free (CRUD over the existing `availability_templates` table; no schema change). Open PR and apply the merge gate; never touch `db-tests.yml`/`e2e.yml`.

## Field 1. Scope and ground truth
Give the clinic a working-hours management surface in Administração so a real therapist's schedule can be onboarded WITHOUT scripts (today availability rows are seeded, not editable in-app). Per therapist: LIST, CREATE, EDIT, ARCHIVE availability templates — each carrying weekday, start time, end time, and location (active locations only).

Ground truth (verify at recon — report findings before writing, HALT conditions below):
- The exact `availability_templates` schema (columns, keys, whether it has an archived/`is_active` flag or only hard rows). Paste it.
- How `getTherapistAvailability` CONSUMES template rows to produce a therapist's working hours per weekday/date — specifically what happens when the same therapist has MULTIPLE templates on the same weekday (union? overlap? last-wins?). Paste the consumption logic.
- Whether the Administração surface already has a therapist-scoped admin area to extend, and the active-locations source (post W2-03 the active set is the two OsteoJP (LV)/(CB) rows).

Overlap semantics — HALT CHECK: if same-therapist same-weekday overlap behavior is AMBIGUOUS in the consumption logic (e.g. overlapping templates would double-count or produce undefined free/busy), STOP with evidence and a recommended default. **Recommended default: REJECT overlapping templates for the same therapist + weekday + location at write time** (validation in the create/edit path), so the data can never express an ambiguous overlap.

Behavior: templates are add/edit/archive (no hard delete of a template that shaped historical availability — archive instead, mirroring the location cleanup discipline). Location dropdown shows ACTIVE locations only. pt-PT labels throughout.

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-workinghours origin/main -b osteojp-w2-workinghours`; assert toplevel ends in the worktree name; assert clean tree. HALT if either fails.
2. Recon, REPORT before writing: the `availability_templates` schema; the `getTherapistAvailability` consumption logic incl. same-weekday multiple-template behavior; the Administração admin surface to extend; the active-locations source. Run the overlap HALT CHECK.
3. Implement per-therapist CRUD in Administração: list templates; create (weekday, start, end, active location); edit; archive. Validation: `end > start` (reject `end <= start`); and — per the overlap default (or the ruling if the HALT surfaced one) — reject an overlapping template for the same therapist + weekday + location. pt-PT via i18n.
4. Wire writes through `packages/db` (tenant-scoped, `tenant_id` from JWT), reusing existing admin permission gating (working-hours management is an admin action per the permission matrix — do not relax client-side).
5. Tests: create a template for a therapist that had none → `getTherapistAvailability` for that weekday now returns working hours (the booking availability panel reflects it); edit changes the panel; archive removes it from the panel; validation rejects `end <= start`; validation rejects an overlapping template (per default). e2e per existing patterns.
6. Full gates: lint, typecheck, test, build, `test:e2e`.

## Field 3. Definition of done (machine-verifiable)
- Migration-free PROOF: `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- Per-therapist list/create/edit/archive implemented in Administração (paste where).
- e2e: create a template for a therapist lacking one → the booking availability panel shows working hours for that weekday; edit + archive reflected in the panel (paste summary).
- Validation: `end <= start` rejected; overlapping template rejected (per the overlap default/ruling). Paste tests.
- Location dropdown shows active locations only (paste test).
- Lint/typecheck/test/build + e2e green.

## Field 4. Verification (paste evidence)
Recon report (schema, consumption logic + overlap behavior, admin surface, active-locations source), overlap HALT-check outcome, the CRUD implementation, the create→panel e2e, edit/archive reflection, the two validation tests, migration-free proof, gate results.

## Field 5. Restrictions and scope boundary
- Migration-free: NO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. No schema change — if the table lacks an archived flag and archiving needs a column, HALT (that would be a migration loop).
- Archive, never hard-delete, a template that shaped historical availability.
- Active locations only in the dropdown (post-W2-03 set). Admin-gated write path; do not relax the permission matrix client-side.
- pt-PT via i18n keys, no hardcoded copy, no emoji. DB access only through `packages/db`, tenant from JWT. GREEN runner: self-merge only on all-green checks; never touch `db-tests.yml`/`e2e.yml`.

## Field 6. Halt loud if
- Same-therapist same-weekday overlap semantics are ambiguous in the consumption logic (apply the reject-overlap default via recommended-default menu).
- `availability_templates` has no archived/`is_active` flag and archive would require a schema change (→ migration loop, out of this lane).
- `getTherapistAvailability` cannot reflect a newly created template without other changes.

## Field 7. Report back
Recon report, overlap HALT-check outcome, CRUD implementation, create→panel + edit/archive e2e, validation tests, migration-free proof, gate results, PR number. Open a PR per template and apply the MERGE GATE per LOOP-DISPATCH.md (GREEN runner: all required checks SUCCESS, no db-tests.yml/e2e.yml touch, mergeable; a refused merge is a HALT).

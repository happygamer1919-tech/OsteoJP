# Loop W12-40 - Team data bulk update (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, DATA, GATED ON THE OWNER FILE. OWNER-MERGE (real-prod data). BLOCKED until the owner supplies the file.** Apply a bulk update of therapist data (number - role - services per therapist) from an owner-supplied file: validate against Equipa, rehearse on local, apply owner-gated, owner visual-checks. NOT dispatchable until the file arrives (Q-W12-05). Starts from **fresh `origin/main`**; one data window in flight; never stacked.

## Preconditions (hard gate)
1. **The owner supplies the source file** (per therapist: number/phone - role/funcao - services). Until then this loop is BLOCKED; do NOT synthesize the data. Register/track the file request as Q-W12-05.

## Field 1. Scope and ground truth

Take the owner-supplied per-therapist file, validate every row against the current Equipa (real therapists/roles/services), rehearse the update on local `127.0.0.1`, apply to prod under an explicit owner authorization phrase with per-row before/after counts + HALT-on-mismatch, then the owner visual-checks Equipa. Data only; no code, no schema (unless a target column is missing, which HALTs to the relevant build loop).

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Targets exist on `users` + mappings:** staff `users` carry `phone`, `role_id` (via `changeRole`), `job_title`; therapist->service mapping is `therapist_services` (`schema.ts:409-411`) + the primary service (`setPrimaryService`); working locations are DERIVED from `availability_templates` (until W12-15 lands `staff_locations`). So "number - role - services per therapist" maps to `users.phone` + role + `therapist_services` rows.
- **Equipa is the validation source of truth** (`apps/web/lib/admin/staff.ts` `listStaff`; services `listServices`); every file row must resolve to a real therapist + real role + real services; an unresolved row HALTs to a Q (never guess/create a therapist to fit the file).
- **This is the DATA counterpart to the CB "wrong filter/wrong therapists" complaints** (the W10-04 isolation model derives scope from real assignments, so it is only as correct as this data). Getting the data right is the point.
- **Cloud is REAL DATA ONLY** - the rehearsal is on local `127.0.0.1`; the prod apply is owner-gated with per-row before/after + HALT-on-mismatch (the W10-02 discipline). No synthetic data on the cloud.

**Scope:** a validated data plan (`docs/recon/W12-40-team-data-plan.md`) from the owner file + a local rehearsal + an owner-gated prod apply with counts + the owner's Equipa visual check. Data only; no code/schema (a missing target column HALTs to the build loop that owns it, e.g. W12-15 for `staff_locations`).

## Field 2. Ordered steps
1. **File-arrival gate:** confirm the owner file is present + parseable; if absent, keep the loop BLOCKED (Q-W12-05) and do nothing else. **A0 isolation guard** off fresh `origin/main`; worktree; assert clean tree + HEAD == tip.
2. **Validate:** parse the file; resolve every row to a real therapist + role + services against Equipa; write `docs/recon/W12-40-team-data-plan.md` with the exact per-row target updates (phone/role/`therapist_services`); list any unresolved row -> HALT to a Q, do not guess.
3. **Rehearse on local `127.0.0.1`:** seed equivalents; apply the plan; verify per-row before/after + that no appointment/history is harmed; paste the rehearsal.
4. **Apply to prod - OWNER-GATED:** ONLY under the explicit owner authorization phrase for this data window, apply the validated updates, per-row before/after counts, HALT-on-mismatch; never create a therapist to fit the file.
5. **Owner visual check:** the owner reviews Equipa (roles/services/numbers) + a CB agenda filter sanity check (the assignments now drive the isolation scope).
6. **Gate (docs/data):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green; `git diff --name-only origin/main` shows only the data-plan doc (no code/schema).

## Field 3. Definition of done (machine-verifiable)
- **Validation PROOF:** every file row resolved to a real therapist/role/service; unresolved rows HALTed, not guessed; the plan doc committed.
- **Rehearsal PROOF:** local per-row before/after showing the intended updates + zero history harm.
- **Prod-apply PROOF (owner-gated):** the owner authorization phrase quoted; prod per-row before/after counts; HALT-on-mismatch not triggered; no therapist created to fit the file.
- **Owner-check PROOF:** the owner's Equipa + CB-filter visual confirmation.
- **No-code PROOF:** `git diff --name-only origin/main` shows only the data-plan doc (no code/schema).

## Field 4. Verification (paste evidence)
The validated plan, the local rehearsal counts, the owner-gated prod before/after counts, the owner Equipa/CB-filter check, the no-code diff, PR number.

## Field 5. Restrictions and scope boundary
- **BLOCKED until the owner file arrives** (Q-W12-05); NEVER synthesize the therapist data.
- **A0 worktree isolation** off fresh `origin/main`; one data window in flight, never stacked.
- **Equipa is the validation source of truth** - an unresolved row HALTs; never create/rename a therapist to fit the file.
- **REAL-PROD data write - owner-gated**; rehearse on local `127.0.0.1`; per-row before/after + HALT-on-mismatch (W10-02 discipline). Cloud REAL DATA ONLY.
- If a target column is missing (e.g. `staff_locations` not yet built) - HALT to the owning build loop (W12-15); do NOT add schema here.
- No PII in logs (phone numbers are the data, never logged); plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The owner file is absent or unparseable - stay BLOCKED (Q-W12-05).
- Any file row does not resolve to a real therapist/role/service - HALT to a Q; never guess.
- The prod authorization phrase is absent - do the validation + local rehearsal + plan, and HALT the prod apply.
- A target field requires a schema change not yet built - HALT to the owning build loop.

## Field 7. Report back
The validated plan, the local rehearsal, the owner-gated prod counts, the owner Equipa/CB-filter check, the no-code diff, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-40 is OWNER-MERGE (real-prod data action, owner file-gated).** NOT `[SELF-MERGE-OK]`. Required checks + all three Vercel deploys green (checks API not banner) necessary; the owner supplies the file, authorizes the data window, and visual-checks Equipa before merge.
- **BLOCKED until the file arrives.** Fresh `origin/main`, one data window in flight, never stacked. Workflow files never touched. HALT-LOUD on an unresolved row or a missing authorization phrase.

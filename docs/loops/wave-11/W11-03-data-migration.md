# Loop W11-03 - Real-data migration (Wave 11 Separacao de Producao)

GATE: **Wave 11 Separacao de Producao, DATA loop, OWNER-GATED FREEZE WINDOW.** Migrates the REAL clinic data from the old project `jaxmkwoxjcgzkwxgbayx` (source, read) into the new Frankfurt Pro project (target, write) during a staff-writes-paused freeze window, one audited step at a time, with per-table before/after counts and a HALT-on-mismatch protocol identical to W10-02. App + portal are smoke-tested against the new project via Preview envs BEFORE any Production repoint. **Preconditions (both required): W11-02 is merged (new project provisioned + verified) AND the owner has replied with the exact phrase `AUTORIZO MIGRACAO` plus the plan version.** **Mandatory CYAN checkpoints: the owner invokes CYAN immediately BEFORE authorization and immediately AFTER completion.** Runs AFTER W11-02 merged; fresh `origin/main`; never stacked. **OWNER-MERGE.**

---

## Preconditions (hard gate - do not open the freeze window until ALL are true)

1. **W11-02 merged.** `origin/main` contains `docs/recon/W11-02-provisioning-evidence.md`; the new project is verified (schema head `0037`, RLS + immutability trigger + auth hook proven, buckets, secrets-by-name), and EMPTY of real data.
2. **CYAN checkpoint BEFORE (mandatory).** The owner invokes CYAN immediately before authorization; CYAN's pre-migration verification (source quiescent, target empty + verified, plan version current) is recorded before the window opens. Absent the CYAN-before checkpoint, **HALT**.
3. **Owner authorization received.** The owner has replied with the **exact phrase `AUTORIZO MIGRACAO`** naming the **plan version** (e.g. `AUTORIZO MIGRACAO plan v1`, matching the SPLIT PLAN v1 freeze-window runbook version). No other wording opens the window. If the phrase is absent, ambiguous, or names a different version than what W11-01 merged, **HALT** (Field 6).
4. **Staff writes paused (freeze window).** Staff are notified and writes to the OLD project are paused for the window (the source must be quiescent so the dump is a consistent point-in-time - the W10-02 lesson: live QA drift during a write window forced repeated re-versioning). If writes cannot be paused, **HALT** (a drifting source invalidates the counts).

Only when ALL hold does the freeze window open. It closes the moment this loop's DONE conditions are met (or on the first mismatch HALT).

---

## Field 1. Scope and ground truth

Execute EXACTLY the SPLIT PLAN v1 freeze-window runbook, in order, one step at a time, pasting the source before-count and the target after-count for every table as evidence, until the retained REAL data is faithfully present on the new project and the app + portal smoke-pass against it via Preview envs. The write target is the NEW project; the OLD project is READ ONLY throughout and is never mutated (it is the rollback). The window is narrow, audited, and freeze-gated.

Ground truth (embed - the SPLIT PLAN v1 freeze-window runbook in `docs/recon/W11-01-split-plan.md` is the AUTHORITATIVE step list; this is the constraint map GREEN honours while running it; the executor runs with ZERO memory):

- **Source = old project `jaxmkwoxjcgzkwxgbayx` (READ ONLY); target = the new Frankfurt Pro project (WRITE).** The old project is NEVER written in this loop - it stays the live system of record until W11-04 cutover and the rollback thereafter. Any write to the old project is an instant VIOLATION and a HALT.
- **What migrates (the retained REAL set + whatever real usage added since W11-01, per SPLIT PLAN v1 + the Q-W11-01-1 ruling on the residue island):** `tenants` (1) FIRST (every domain FK except none depends on it; `tenant_id` is the isolation key), then `locations` (2, CB + LV), `users` (19+), `services` (25), `service_location_prices` (23), `service_packs` (14), `tenants.settings` (incl. the delete-password secret hash), then the live patient-domain real data created since real usage began. **Children-after-parents on restore** (the FK map is `ON DELETE NO ACTION` except `tenant_id` CASCADE; a wrong order raises `23503`). The exact per-table expected counts come from SPLIT PLAN v1's pre-flight snapshot, re-confirmed at freeze time (the source may have grown since W11-01).
- **The BLOCKED residue island disposition follows the Q-W11-01-1 owner ruling** (recommended default: LEAVE it behind on the frozen old project - the clean production project holds only live real data). Whatever the owner ruled, execute THAT; do not import the immutable signed synthetic residue unless the owner explicitly ruled it travels.
- **Storage objects migrate too:** the attachment objects in the private buckets (referenced by `attachments`, `schema.ts:799-819`) are copied to the new project's buckets; the signed-URL model means the object paths must line up with the restored `attachments` rows. Per-bucket object counts are part of the evidence.
- **HALT-on-mismatch is identical to W10-02:** for EACH step, paste the source BEFORE count, run exactly the plan's dump/restore step, paste the target AFTER count, and confirm it matches the plan's expected count. **Any deviation, unexpected count, FK surprise (`23503`), trigger block (`check_violation`), or storage-object shortfall is an immediate HALT to the mailbox** - do not improvise a workaround, do not proceed to the next step. The immutability trigger stays enabled on the target throughout (it should never fire, because the migrated real fichas restore in their stored `status`; if it fires, something is wrong - HALT).
- **Preview smoke BEFORE any Production repoint:** after the restore + count reconciliation, point a PREVIEW env (not Production) at the new project and smoke the app + portal: staff login (the auth hook injects the claim; a therapist sees only their own scope; admin/owner see tenant-wide), open a patient + a ficha, the agenda renders, a portal patient can log in and see their appointments, and a signed-URL attachment opens. **Production is NOT repointed here** - that is W11-04. The smoke is the go/no-go evidence for W11-04.
- **CYAN checkpoints are mandatory and written into this loop:** the owner invokes CYAN (a) immediately BEFORE authorization (pre-migration verification: source quiescent, target empty + verified, plan version current) and (b) immediately AFTER completion (post-migration verification: counts reconciled, smoke green, old project untouched). Both checkpoints are recorded as evidence; the loop does not close without the CYAN-after checkpoint.
- **Standing (post W10-02):** the cloud holds REAL DATA ONLY; no synthetic data is created on either project. This loop moves REAL data between two real projects - it introduces no synthetic rows.

**Scope:** the new project holds a faithful copy of the retained REAL data (per-table counts reconciled source->target, storage objects copied), the app + portal smoke-pass against it via Preview envs, and the old project is provably untouched; then the DECISIONS + board delta are prepared. No code change, no migration, no schema change. The only writes are the audited restores into the NEW project the plan authorizes (plus the disposable Preview-smoke actions), plus the DECISIONS + board docs delta. The OLD project is read-only throughout.

## Field 2. Ordered steps
1. **Precondition check:** confirm W11-02 merged; the CYAN-BEFORE checkpoint is recorded; the owner phrase `AUTORIZO MIGRACAO` + matching plan version is in the mailbox; staff writes are paused. If any is missing -> HALT (Field 6). Paste the authorization evidence (the phrase + version + the CYAN-before record, not any secret).
2. **A0 isolation guard:** fetch origin; assert `origin/main` contains W11-02's merge; `git worktree add ../osteojp-w11-03-data-migration origin/main -b osteojp-w11-03-data-migration`; assert toplevel + clean tree + HEAD == tip. Fetch-and-fast-forward before the window opens. HALT (Field 6) if any fails.
3. **Re-read + snapshot:** load the SPLIT PLAN v1 freeze-window runbook; restate the ordered dump/restore steps, the expected per-table counts, the storage-object counts, and the residue-island disposition ruling. Take the freeze-time source snapshot (the source is now quiescent) and confirm the counts against the plan (the source may have grown since W11-01; re-confirm). Paste it as the run manifest.
4. **Execute step-by-step (the freeze window, target = new project):** for EACH plan step, in order (parents before children): paste the source BEFORE count, run exactly the plan's dump/restore step into the NEW project, paste the target AFTER count, confirm it matches the plan's expected count. Copy the storage objects per the plan; paste per-bucket counts. **Any deviation, unexpected count, FK `23503`, trigger `check_violation`, or storage shortfall is an immediate HALT to the mailbox (Field 6)** - no workaround, no next step.
5. **Reconcile end state:** every migrated table's target count equals the source (or the plan-accepted subset per the residue ruling); storage object counts match; the retained-real set (`users`, `services`, prices, packs, `locations`, `tenants`, settings) is present and equal. Paste the full source->target reconciliation. Confirm the OLD project counts are UNCHANGED (proof it was read-only).
6. **Preview smoke (NOT Production):** point a Preview env at the new project; smoke staff login + isolation (therapist scope vs admin/owner tenant-wide, the auth-hook claim reaching RLS), patient + ficha open, agenda render, portal patient login + appointment view, and a signed-URL attachment open. Paste the smoke results. Production is NOT repointed.
7. **CYAN checkpoint AFTER (mandatory):** the owner invokes CYAN for the post-migration verification (counts reconciled, smoke green, old project untouched). Record it. The loop does not close without it.
8. **DECISIONS + board delta:** append a DECISIONS entry recording the migration (authorization phrase + version, the per-table source->target reconciliation, the storage counts, the residue-island disposition, the Preview smoke result, both CYAN checkpoints, the old project untouched). Flip the W11-03 board row.
9. **Gates (no code change):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green; confirm `git diff --name-only origin/main` shows ONLY `docs/` files (DECISIONS + BACKLOG) and ZERO code/migration/workflow files - the data change is in the new cloud project, not the repo.

## Field 3. Definition of done (machine-verifiable)
- **Authorization + freeze PROOF:** the owner phrase `AUTORIZO MIGRACAO` + plan version + the CYAN-before checkpoint are pasted; staff writes were paused; the window opened only after all held.
- **Per-step evidence PROOF:** every plan step shows source BEFORE -> restore -> target AFTER, matching the plan's expected count; storage per-bucket counts match. Paste the full ledger.
- **Reconciliation PROOF:** every migrated table's target count equals the source (or the plan-accepted subset); the retained-real set is present + equal; the OLD project counts are UNCHANGED (read-only proof).
- **Preview-smoke PROOF:** app + portal smoke against the new project via Preview envs passes (staff isolation via the auth-hook claim, patient/ficha/agenda, portal appointment view, signed-URL attachment); Production was NOT repointed.
- **CYAN-after PROOF:** the post-migration CYAN checkpoint is recorded.
- **DECISIONS PROOF:** the migration entry (authorization, reconciliation, residue disposition, smoke, both CYAN checkpoints, old project untouched) is appended. Paste it.
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files. Paste it.
- **Gates green.**

## Field 4. Verification (paste evidence)
The authorization phrase + version + CYAN-before, the run manifest, the full per-step source->target ledger + storage counts, the reconciliation + old-project-unchanged proof, the Preview smoke results, the CYAN-after record, the DECISIONS entry, the board delta, the no-code diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W11-02). **The freeze window is the wave's authorized real-data MIGRATION window** - it opens only on `AUTORIZO MIGRACAO` + version + the CYAN-before checkpoint + a paused source, and closes at DONE or the first mismatch.
- **The OLD project is READ ONLY throughout** - it is the source and the rollback; any write to it is an instant VIOLATION and a HALT. The write target is the NEW project only.
- **Execute ONLY the approved plan, in order, one step at a time.** No scripts or restores outside the audited runbook; no step substitution.
- **Immutability + append-only are NEVER defeated.** The migrated real fichas restore in their stored `status`; the target's immutability trigger stays enabled (it should never fire during a faithful restore - if it does, HALT). The residue-island disposition follows the Q-W11-01-1 ruling; nothing is force-deleted or force-imported.
- **Preview smoke is mandatory BEFORE any Production repoint** - Production is NOT touched in this loop (that is W11-04). A repoint here is out of scope and a HALT.
- **The CYAN checkpoints are not optional** - before authorization and after completion, both recorded.
- Any deviation, unexpected count, FK `23503`, trigger `check_violation`, or storage shortfall is an immediate HALT to the mailbox. Plain hyphens only; no emoji; no em/en dashes. **Never force-push / `--admin`.** No PII printed in evidence (counts only); no secret VALUES.
- **Standing test-data rule:** no synthetic data is created on either project; this loop moves REAL data between two real projects.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- Any precondition is unmet: W11-02 not merged, the CYAN-before checkpoint absent, the owner phrase `AUTORIZO MIGRACAO` + matching version absent/ambiguous/for a different version, or staff writes not paused (a drifting source).
- The A0 guard fails, OR `origin/main` does NOT contain W11-02's merge.
- ANY step yields a count that does not match the plan's expected count, an FK `23503`, a trigger `check_violation`, or a storage-object shortfall - HALT immediately with the exact step, expected vs actual, and the error; do not proceed or improvise (the W10-02 discipline).
- The OLD project is about to be written, or is found already mutated during the window - HALT (the source/rollback must stay pristine).
- The migration would require defeating immutability/append-only, or force-importing/force-deleting the residue island against the ruling - HALT-LOUD and refuse.
- The Preview smoke fails (isolation broken, the auth-hook claim not reaching RLS, a signed-URL attachment 404, portal cannot read appointments) - HALT with the failure; do NOT hand off to W11-04 on a red smoke.
- The cloud writes cannot run (target access blocked / credentials only the owner holds) - HALT with the exact blocker.

## Field 7. Report back
The authorization phrase + version + CYAN-before, the run manifest, the full per-step source->target ledger + storage counts, the reconciliation + old-project-unchanged proof, the Preview smoke, the CYAN-after record, the DECISIONS entry, the board delta, the no-code diff, gates green, PR number.

## Merge policy (embed, Wave 11 Separacao de Producao)
- **W11-03 is OWNER-MERGE.** The real-data migration is gated by the exact owner phrase `AUTORIZO MIGRACAO` + plan version + the mandatory CYAN-before checkpoint + a paused source BEFORE the freeze window opens; the per-step source->target evidence + the Preview smoke + the CYAN-after checkpoint + the DECISIONS entry are pasted BEFORE the owner merges the docs PR. All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys green (read from the checks API NOT the banner) is NECESSARY for the docs PR. GREEN NEVER self-merges this loop.
- **Runs after W11-02 merged**, fresh `origin/main`, never stacked. The OLD project is read-only throughout (source + rollback); the write target is the NEW project; Production is NOT repointed here (that is W11-04). Immutability + append-only are never defeated. Workflow files NEVER touched. Plain hyphens only. HALT-LOUD on any deviation from the approved runbook.

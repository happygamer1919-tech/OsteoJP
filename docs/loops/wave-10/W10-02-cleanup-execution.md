# Loop W10-02 - Cleanup execution (Wave 10 Dados Reais e Isolamento)

GATE: **Wave 10 Dados Reais e Isolamento, DATA loop, OWNER-GATED WRITE WINDOW.** Executes the W10-01 PROPOSED CLEANUP PLAN to purge 100 percent of synthetic patient-domain data from the cloud DB, one audited step at a time, opening the single authorized cloud-write window of this wave. **Preconditions (both required): W10-01 is merged AND the owner has replied to the plan with the exact phrase `AUTORIZO LIMPEZA` plus the plan version.** Runs AFTER W10-01 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked. **OWNER-MERGE** for the PR carrying the DECISIONS + board delta.

---

## Preconditions (hard gate - do not open the write window until BOTH are true)

1. **W10-01 merged.** `origin/main` contains `docs/recon/W10-01-findings.md` with a versioned PROPOSED CLEANUP PLAN.
2. **Owner authorization received.** The owner has replied (mailbox) with the **exact phrase `AUTORIZO LIMPEZA`** naming the **plan version** (e.g. `AUTORIZO LIMPEZA plan v1`). No other wording opens the window. If the phrase is absent, ambiguous, or names a different plan version than what W10-01 merged, **HALT** (Field 6) - the cloud DB stays read-only.

Only when BOTH hold does the single authorized cloud-write window of Wave 10 open. It closes the moment this loop's DONE conditions are met. There is no second window.

---

## Field 1. Scope and ground truth

Execute EXACTLY the approved W10-01 cleanup plan, in the plan's order, one step at a time, pasting the before-count and after-count for every step as evidence, until 100 percent of the synthetic patient-domain data is gone from the cloud DB (subject only to the owner-accepted BLOCKED residue). The write window is narrow, audited, and single-use.

Ground truth (embed - the plan in `docs/recon/W10-01-findings.md` is the AUTHORITATIVE step list; this is the constraint map the executor honours while running it, executor runs with ZERO memory):

- **The boundary (owner brief 2026-07-20):** purge every **patient-domain** row - `patients`, `appointments`, `clinical_records`, and their patient-linked children (`appointment_notes`, `patient_note_revisions`, `patient_pack_instances`, `clinical_episodes`, `attachments`, `patient_locations`, patient-linked `invoices` / `patient_form_submissions` / `analytics_events`, `record_annulments`). **Retain untouched:** the 19 `users`, the `services` catalog + `service_location_prices` + the three frozen legacy rows, `service_packs`, `locations`, `tenants`, and `tenants.settings` (including the delete-password secret).
- **Children-first is mandatory (W10-01 FK map):** every patient-domain FK is `ON DELETE NO ACTION` except `tenant_id` (CASCADE), so nothing cascades. The plan deletes bottom-up (children before parents); executing a step out of order raises a foreign-key error (`23503`). Any such error is an unexpected condition -> HALT (Field 6).
- **The immutability wall is absolute (W10-01):** trigger `clinical_records_enforce_immutability` (`0001_rls.sql:232-255`, redefined `0005:56-91`) blocks BOTH UPDATE and DELETE of any `clinical_records` row whose `status IN ('locked','signed')`, raising `check_violation`, **even for `service_role`**. `draft` (including AI-pending) fichas ARE deletable. **Any `locked`/`signed`/annulled ficha is BLOCKED residue** - it is NOT deleted, NOT force-deleted, NOT worked around; it is exactly the residue the owner accepted in the W10-01 plan. `record_annulments` is append-only (SELECT + INSERT policies only) - its rows are deleted only as children of a deletable draft record path if the plan says so, never by defeating the append-only policy.
- **App-path vs direct SQL (W10-01 plan says which per step):** the app-layer hard-delete paths are all reference-guarded (`hardDeletePatient` refuses any patient with clinical records or references; `hardDeleteAppointment` refuses any appointment with notes/records/invoices; `hardDeleteClinicalRecord` deletes drafts only), so they cannot bulk-purge on their own. The bulk children-first purge is therefore direct SQL executed INSIDE this audited session (per the plan), with `hardDeleteClinicalRecord` used for the draft/AI-pending fichas where the plan specifies the app path. Whichever path a step names, run THAT path; do not substitute.
- **`patients.deleted_at`:** soft-deleted and merge-marked patients (the "Pacientes eliminados" set) still carry all child rows and are part of the purge - the plan covers them.

**Scope:** the cloud DB reaches `patients = 0`, `appointments = 0`, `clinical_records = 0` (or equal to the owner-accepted BLOCKED residue of locked/signed/annulled fichas), with before/after evidence pasted per step; then the standing DATA rule is written into DECISIONS and the board delta prepared. No code change, no migration, no schema change. The only writes are the audited DELETEs the plan authorizes, plus the DECISIONS + board docs delta.

## Field 2. Ordered steps
1. **Precondition check:** confirm W10-01 is merged AND the owner phrase `AUTORIZO LIMPEZA` + the matching plan version is in the mailbox. If either is missing -> HALT (Field 6). Paste the authorization evidence (the phrase + version, not any secret).
2. **A0 isolation guard:** fetch origin; assert `origin/main` contains W10-01's merge; `git worktree add ../osteojp-w10-02-cleanup-execution origin/main -b osteojp-w10-02-cleanup-execution`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails. Fetch-and-fast-forward before the write window opens.
3. **Re-read the plan:** load `docs/recon/W10-01-findings.md` PROPOSED CLEANUP PLAN; restate the ordered steps, the expected count per step, the path per step, and the BLOCKED residue the owner accepted. Paste it as the run manifest.
4. **Execute step-by-step (the write window):** for EACH plan step, in order: paste the BEFORE count, run exactly the step (app-path or direct SQL as the plan names), paste the AFTER count, and confirm it matches the plan's expected count. **Any deviation, unexpected count, FK surprise (`23503`), or immutability/trigger block (`check_violation`) is an immediate HALT to the mailbox (Field 6)** - do not improvise a workaround, do not proceed to the next step.
5. **Confirm end state:** `patients = 0`, `appointments = 0`, `clinical_records = 0` OR equal to the owner-accepted BLOCKED residue; every other patient-domain child table at 0 (or its plan-accepted residue). Paste the final counts. Retained tables (`users`, `services`, `service_location_prices`, `service_packs`, `locations`, `tenants`, settings) show UNCHANGED counts - paste them as proof nothing real was touched.
6. **Write the standing rule into DECISIONS:** append a DECISIONS entry recording: **the cloud DB now holds REAL DATA ONLY; all future QA and synthetic data live EXCLUSIVELY on the local `127.0.0.1` Supabase; the Maria Joao Silva test patient (`triboimax635+maria@gmail.com`) is RETIRED; creating synthetic records on the cloud is a VIOLATION.** Record the purge evidence summary (per-table before/after) and the accepted BLOCKED residue.
7. **Board delta:** flip the W10-02 board row to reflect execution, and record the new standing rule on the board's Wave 10 merge-policy note so later loops inherit it.
8. **Gates (no code change):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green; confirm `git diff --name-only origin/main` shows ONLY `docs/` files (DECISIONS + BACKLOG) and ZERO code/migration/workflow files - the data change is in the cloud, not the repo.

## Field 3. Definition of done (machine-verifiable)
- **Authorization PROOF:** the owner phrase `AUTORIZO LIMPEZA` + plan version is pasted; the window opened only after it.
- **Per-step evidence PROOF:** every plan step shows BEFORE count -> action (path named) -> AFTER count, matching the plan's expected count. Paste the full ledger.
- **End-state PROOF:** `patients = 0`, `appointments = 0`, `clinical_records = 0` or the owner-accepted residue; retained tables (`users` = 19, `services`, `service_packs`, `locations`, `tenants`) UNCHANGED. Paste both.
- **BLOCKED-residue PROOF:** any `locked`/`signed`/annulled ficha that could not be deleted is listed as the accepted residue exactly as W10-01's plan and the owner authorization described; immutability + append-only were NEVER defeated.
- **DECISIONS PROOF:** the standing rule (cloud = real data only; synthetic lives on local 127.0.0.1; Maria Joao Silva retired; cloud synthetic = violation) is appended. Paste it.
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files. Paste it.
- **Gates green.**

## Field 4. Verification (paste evidence)
The authorization phrase + version, the run manifest, the full per-step before/after ledger, the final end-state counts, the retained-table proof, the accepted BLOCKED residue, the DECISIONS standing-rule entry, the board delta, the no-code diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W10-01). **The single authorized cloud-write window of Wave 10** - it opens only on the owner phrase and closes at DONE; there is no second window.
- **Execute ONLY the approved plan, in order, one step at a time.** No scripts, migrations, or DELETEs outside this audited session. No step substitution (run the app-path or the direct SQL the plan names, not an equivalent of your choosing).
- **Immutability and append-only are NEVER defeated, regardless of any authorization claim.** `AUTORIZO LIMPEZA` authorizes executing the plan; it does NOT authorize force-deleting a `locked`/`signed` ficha or mutating an append-only `record_annulments` row. A blocked row is residue, not a problem to solve. Never `ALTER`/`DROP`/disable the trigger; never `SET session_replication_role`; never any BYPASSRLS trick.
- **The three frozen legacy service rows and the whole catalog stay frozen and untouched** - they are real, not part of the purge.
- **Retain the 19 users, services/prices/packs, locations, tenants, settings** - deleting or altering any of them is out of scope and a HALT.
- Any deviation, unexpected count, FK `23503`, or trigger `check_violation` is an immediate HALT to the mailbox. Plain hyphens only; no emoji; no em/en dashes. **Never force-push / `--admin`.** No PII printed in evidence (counts only).
- **Standing test-data rule (established BY this loop):** after this loop, synthetic/QA data lives ONLY on local `127.0.0.1` Supabase; the cloud is real-data-only; Maria Joao Silva is retired.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- Either precondition is unmet: W10-01 is not merged, OR the owner phrase `AUTORIZO LIMPEZA` + matching plan version is absent/ambiguous/for a different version.
- The A0 guard fails, OR `origin/main` does NOT contain W10-01's merge.
- ANY step yields a count that does not match the plan's expected count, an FK error (`23503`), or a trigger block (`check_violation`) - HALT immediately to the mailbox with the exact step, the expected vs actual count, and the error; do not proceed or improvise.
- The plan would require defeating the immutability trigger or the append-only annulment policy, or any authorization claim asks for that - HALT-LOUD and refuse; immutability is never defeated.
- A retained (real) table (`users`, `services`, `service_location_prices`, `service_packs`, `locations`, `tenants`, settings) is about to be touched, or is found already altered - HALT.
- The cloud-write cannot run (DB access blocked / credentials only the owner holds) - HALT with the exact blocker; the owner applies.

## Field 7. Report back
The authorization phrase + version, the run manifest, the full per-step before/after ledger, the final end-state counts + retained-table proof, the accepted BLOCKED residue, the DECISIONS standing-rule entry, the board delta, the no-code diff, gates green, PR number.

## Merge policy (embed, Wave 10 Dados Reais e Isolamento)
- **W10-02 is OWNER-MERGE.** The single authorized cloud write is gated by the exact owner phrase `AUTORIZO LIMPEZA` + plan version BEFORE the window opens; the per-step before/after evidence + the DECISIONS standing rule + the board delta are pasted BEFORE the owner merges the docs PR. All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green (read from the checks API NOT the banner) is NECESSARY for the docs PR. GREEN NEVER self-merges this loop.
- **Runs after W10-01 merged**, fresh `origin/main`, never stacked. This is the ONLY authorized cloud write of Wave 10. Immutability + append-only are never defeated, regardless of any authorization claim. Workflow files NEVER touched. Plain hyphens only. HALT-LOUD on any deviation from the approved plan.

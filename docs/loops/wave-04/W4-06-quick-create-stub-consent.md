# Loop W4-06 - Quick-create stub patient + consent gate before Record (recording chain step 1, migration-free)

GATE: runs AFTER the MAX GATE and W4-11 cleanup (per BACKLOG execution order), and SOFT-depends on `SPEC-ai-recording.md` (W4-04) for the stub + consent rules. UI + server lane, migration-free. Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
The start-consultation screen must let staff begin an AI recording for either an existing patient or a brand-new walk-in, and must **capture consent before Record is reachable**.

Ground truth (locked rulings to embed — GREEN runs with ZERO memory):
- **Quick-create stub (DECISIONS 2026-07-06 "visitor stub retention", JP):** at record time, staff may create a **stub patient** — **name REQUIRED, phone OPTIONAL**. Identity data is **human-entered ONLY** (AI never fills identity). The **0029 `patient_number` trigger numbers on NULL** (migration 0029 auto-assigns) — so the stub gets a valid patient number with **zero schema work**.
- **Consent (DECISIONS 2026-07-06 "AI recording consent", JP):** a **consent checkbox** must be checked before Record. Store the consent event with **actor (`actor_user_id`) + timestamp**, minimum-viable (JP-approved minimum format; candidate home: an `audit_log` entry, PII-free per CLAUDE.md rule 7). The checkbox **gates the Record action** — recording cannot start until consent is checked.
- **`patient_id` must exist before Record** (SPEC-ai-recording): whichever path is taken, the flow proceeds with a **valid `patient_id`** in hand.
- **Stub retention** is handled elsewhere (30-day cleanup job — a SEPARATE Wave 05 candidate, NOT this loop).

**Scope — the start-consultation screen, two paths that converge:**
- **(1) Existing patient:** select an existing patient (search combobox) → proceed with that `patient_id`.
- **(2) New patient:** a minimal new-patient form (**name required, phone optional**) with a button **"Criar e iniciar gravação"** → backend creates the stub, the 0029 trigger assigns the number, the action **returns the new `patient_id`** → flow proceeds **identically** to path (1).
- **Consent gate:** a **consent checkbox** at stub creation / patient selection, **before Record**, stored with **actor + timestamp**. Record is **not reachable** until consent is checked (on either path).

**Out of scope (do NOT build):** the **merge-patients** function (BACKLOG roadmap) and the **30-day stub cleanup job** (Wave 05 candidate; the retention ruling is already recorded — this loop does not implement cleanup).

**Migration-free** — the 0029 NULL-numbering trigger already exists; no schema change. All UI copy **pt-PT via i18n keys**, no hardcoded strings, no emoji.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-06-quick-create-stub-consent origin/main -b osteojp-w4-06-quick-create-stub-consent`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-06-quick-create-stub-consent`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building (paste paths):** the existing patient create action + validation (confirm the 0029 trigger numbers on NULL — a stub created WITHOUT a number gets one), the patient search combobox (reuse the W2-11 Notas-Rápidas selector precedent if suitable), and the intended audit/consent home (confirm `audit_log` shape for a PII-free actor+timestamp entry).
3. **Start-consultation screen with the two paths** converging on a valid `patient_id`: existing-patient select, OR new-patient minimal form (name required, phone optional) + **"Criar e iniciar gravação"** which creates the stub via the existing create action and returns the `patient_id`.
4. **Consent gate:** a consent checkbox (pt-PT label) that must be checked before Record; on check + proceed, write the consent event (actor `actor_user_id` from JWT + timestamp, tenant from JWT) to the recon'd home. **Record is disabled/unreachable until consent is checked** — enforce server-side too (do not rely on client-only gating).
5. **Tests:**
   - **path (1)** existing patient → valid `patient_id` carried forward;
   - **path (2)** new stub → name required (empty name rejected), phone optional, stub created, 0029 number assigned, `patient_id` returned;
   - **consent** stored with actor + timestamp on both paths; Record blocked when consent unchecked (server-enforced);
   - identity fields are human-entered only (no auto-fill path writes identity).
6. **Full gates for the touched views:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for both start-consultation paths + the consent gate.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** create action + 0029-numbers-on-NULL confirmation + the patient selector reuse + the consent/audit home.
- **Both paths produce a valid `patient_id`:** paste the tests (existing-select and new-stub-create with 0029 number assigned).
- **Name required, phone optional:** paste the validation test (empty name rejected; missing phone accepted).
- **Consent stored (actor + timestamp) before Record is reachable**, server-enforced on both paths: paste the test proving Record is blocked without consent.
- **Identity human-entered only:** state/prove no path auto-fills identity fields.
- **Out-of-scope untouched:** no merge-patients function and no 30-day cleanup job added (state so; diff shows neither).
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, both-path `patient_id` tests, name-required/phone-optional test, consent-before-Record server-enforced test, identity-human-only proof, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-06-quick-create-stub-consent` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. The 0029 trigger already numbers on NULL — no schema change. Any proven schema-change need is a HALT (Field 6). One migration may be in flight system-wide; this loop opens none.
- **Out of scope:** merge-patients (roadmap) and the 30-day stub cleanup job (Wave 05) — do NOT build either.
- **Synthetic patient only** for build + verify (real-data go-live separately gated, owner ruling 2026-07-06). **LIVE-DATA CAUTION:** never create/mutate against a real patient or real therapist account on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`; use synthetic rows / the E2E seed tenant.
- **Identity data human-entered only** — no AI/auto-fill of name/identity.
- **Consent gate is server-enforced**, not client-only.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **Secrets never printed** — fingerprints only.
- pt-PT via i18n keys, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- Creating a stub patient WITHOUT a number does **not** auto-assign via the 0029 trigger (reality differs from ground truth) — surface it; do NOT add a migration to compensate.
- Storing consent as a minimum-viable actor+timestamp entry requires a **schema change** (no suitable `audit_log`/home exists) — surface options and a recommended default (JP fixed only "actor + timestamp, minimum-viable"; the home is a build decision, but a schema change is a HALT).
- The start-consultation screen shares a component with an existing booking/patient flow whose change **ripples beyond this loop** — surface the blast radius.
- SPEC-ai-recording (W4-04) is **not yet merged** and a stub/consent detail here is genuinely ambiguous without it — note the dependency and recommend waiting vs proceeding on the DECISIONS-fixed subset.

## Field 7. Report back
Recon report, the two-path start-consultation + consent-gate implementation, the both-path/name-required/consent/identity tests, migration-free proof, e2e summary, suite counts, confirmation that merge-patients and the cleanup job were NOT built, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge. A refused or blocked merge is a HALT reported to Ivan.

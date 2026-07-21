# Loop W10-04c - Label contraindicacoes Gerais (Wave 10 Dados Reais e Isolamento)

GATE: **Wave 10 Dados Reais e Isolamento, MICRO code loop (i18n label only), migration-free, GREEN self-merge.** Renames the patient-form section label "Contraindicacoes NESA" to "Contraindicacoes Gerais" in BOTH i18n files, per the JP ruling (2026-07-21). Field keys and stored data untouched; no schema change. Runs strictly AFTER W10-04 merged and BEFORE W10-04b starts. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Rename ONE i18n label so the patient-form contraindications section reads "Contraindicacoes Gerais" (pt) / "General contraindications" (en), per the closed JP ruling (Q-W9-00-1, DECISIONS 2026-07-21). This is a presentation-only string change; it touches no field key, no column, no enum, no schema, no stored data.

Ground truth (recon at authoring 2026-07-21, embed - executor verifies read-only, executor runs with ZERO memory; all file:line refs verified at authoring):

- **The exact key: `patients.contraindicationsLabel`** (there is exactly one key holding this label).
  - `packages/i18n/src/strings.pt.json:985` - current pt value **"Contraindicações NESA"** -> rename to **"Contraindicações Gerais"** (keep the diacritic).
  - `packages/i18n/src/strings.en.json:985` - current en value **"NESA contraindications"** -> rename to **"General contraindications"**.
- **Usage (presentational only, confirmed):** `apps/web/app/patients/_components/patient-form.tsx:219` (the `<legend>` of the contraindications `<fieldset>`, comment `NESA contraindication flags (W2-08)`), and `apps/web/app/patients/[id]/page.tsx:170` (a read-only detail row label on the patient profile). Both are display strings; the executor confirms these are the only consumers (grep the key) and that no test asserts the literal old string in a way the rename breaks (update any such assertion).
- **The checkbox fields are SEPARATE and are NOT touched:** the three checkboxes bind to distinct i18n keys `patients.fieldContraindicationEpilepsy` / `...Pregnancy` / `...Pacemaker` (`strings.pt.json:986-988`) and to distinct DB columns `patients.contraindication_epilepsy` / `_pregnancy` / `_pacemaker` (`packages/db/src/schema.ts:470-474`, booleans, migrations 0031/0034). Renaming the SECTION label changes none of them - no schema, no data, no field key.
- **Do NOT touch the neighbouring admin key `admin.services.contraindicationSensitive`** (`strings.*.json:989`, pt "Sensível a contraindicações NESA") - that is the admin service-catalog flag label, a different surface; it is out of scope for this rename.
- **The ruling (Q-W9-00-1, DECISIONS 2026-07-21):** JP chose **"Contraindicacoes Gerais"**; Rodica's proposed "Alertas" was **rejected** because it collides with the `red_flags` ficha field already labelled "Alertas (sinais de alarme)" (`packages/db/seed/form-templates/osteopathy-v4.json:78`), a different surface. So the label is "Gerais", not "Alertas".
- **No model change.** Q-W9-00-1's "model question" branch (whether the contraindications are NESA-specific vs general) is settled by the ruling as a label-only change; this loop does not alter which contraindications apply to which services, and does not touch the 0031 contraindication model.

**Scope:** two i18n value edits (pt + en) for `patients.contraindicationsLabel`, both files valid JSON. No field key, column, schema, migration, or stored-data change. The only writes are the two i18n edits + the BACKLOG row flip on close.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W10-04's merge; `git worktree add ../osteojp-w10-04c-label-gerais origin/main -b osteojp-w10-04c-label-gerais`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Rename the label** in BOTH files: `strings.pt.json:985` -> "Contraindicações Gerais"; `strings.en.json:985` -> "General contraindications". Do not touch any other key (especially not `admin.services.contraindicationSensitive` or the three `fieldContraindication*` keys).
3. **Confirm consumers:** grep `contraindicationsLabel`; confirm only the two presentational usages; update any test that asserts the old literal.
4. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. **JSON.parse BOTH i18n files** (a one-file key or invalid JSON fails typecheck + all three builds). Confirm `git diff --name-only origin/main` shows ONLY the two i18n files (+ any test touched) - ZERO migration + ZERO workflow files.

## Field 3. Definition of done (machine-verifiable)
- **Label PROOF:** `strings.pt.json:985` = "Contraindicações Gerais" and `strings.en.json:985` = "General contraindications"; both files JSON.parse clean; `StringKey` intersection unbroken (same key in both). Paste the two-line diff.
- **No-collateral PROOF:** `admin.services.contraindicationSensitive` and the three `fieldContraindication*` keys are UNCHANGED. Paste `git diff` scoped to the i18n files showing only the one key's value changed on each side.
- **No-schema PROOF:** `git diff --name-only origin/main` shows ONLY i18n (+ any updated test); ZERO migration/workflow/schema files. Paste it.
- **Suite counts** with all gates green (including i18n parity pt+en).

## Field 4. Verification (paste evidence)
The two-line label diff, the no-collateral scoped diff, the no-schema file list, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W10-04). **Migration-free, label-only:** no field key, column, schema, migration, or stored-data change; if anything beyond the two i18n values seems needed, HALT.
- **Touch ONLY `patients.contraindicationsLabel`** - never `admin.services.contraindicationSensitive`, never the `fieldContraindication*` keys, never the 0031 contraindication columns.
- **The label is "Gerais", not "Alertas"** (the JP ruling; "Alertas" collides with the red_flags ficha field). Do not use "Alertas".
- pt-PT diacritics correct ("Contraindicações Gerais"); both i18n files JSON.parse; no emoji; plain hyphens only; no em/en dashes. **Never force-push / `--admin`.**
- **Standing test-data rule (post W10-02):** any verify runs on local `127.0.0.1` synthetic data only; the cloud is real-data-only. (This loop changes only a static string; it needs no data.)

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W10-04's merge.
- The key `patients.contraindicationsLabel` is not at `strings.*.json:985` as described, or has additional consumers that would make the rename semantically wrong (e.g. it turns out to drive logic, not just display) - HALT with the finding.
- The rename appears to require a schema/field/model change to stay consistent - HALT (the ruling is label-only; a model change is a different, larger loop).

## Field 7. Report back
The two-line label diff, the no-collateral scoped diff, the no-schema file list, suite counts, PR number.

## Merge policy (embed, Wave 10 Dados Reais e Isolamento)
- **W10-04c is GREEN self-merge (migration-free, i18n-only).** GREEN self-merge once ALL required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API NOT the banner. If anything beyond the two i18n values surfaces, HALT and convert to a follow-up.
- **Runs strictly AFTER W10-04 merged and BEFORE W10-04b** (owner-ordered sequence), fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/reality mismatch.

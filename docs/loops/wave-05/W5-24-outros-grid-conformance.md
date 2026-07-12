# Loop W5-24 - Outros grid conformance to the legacy 4x5 layout (Wave 05 Ficha Final)

GATE: **Wave 05 Ficha Final, migration-free.** Depends on **SPEC-ficha-medica.md AMENDMENTS 2026-07-11 ruling F** (authoritative) and the shipped Outros section (W5-19, ruling C). Migration-free (schema is `form_templates` + the RecordForm renderer; this loop touches only the renderer). Composes with W5-25 (BodyChart.tsx) and W5-26 (BodyChart.tsx + maybe seed) - no file collision expected (this loop edits only the `checkbox_group` case of RecordForm.tsx); coordinate if run in parallel.

## Field 1. Scope and ground truth

Make the **Outros** checkbox section render as the legacy **4-column, 5-row grid** with the free-text pulled INLINE as the 20th grid cell, per AMENDMENTS ruling F. Presentation only - no data-model change.

Ground truth (recon 2026-07-11, embed - the executor runs with ZERO memory; ruling F authoritative):
- **Renderer:** `apps/web/app/clinical/[id]/RecordForm.tsx`, the `case "checkbox_group"` block. Today it partitions sub-fields into `checkboxEntries` (the nineteen booleans) rendered in `grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4`, then `textEntries` (the single `other` sub-key) rendered AFTER the grid as a separate full-width `<Input>` with no visible label (aria-label preserved) and placeholder `s["clinical.healthProblemsOtherPlaceholder"]` (currently "Outras condicoes, alergias, medicamentos...", ruling C).
- **Template / order:** `packages/db/seed/form-templates/osteopathy-v3.json`, `health_problems` (`x-widget: checkbox_group`). Property order recon-verified = the legacy 4x5 reading order ONE-FOR-ONE: `smoker` (Fumador), `pregnancy` (Gravidez), `osteoporosis` (Osteoporose), `anemia` (Anemia), `lupus` (Lupus), `neoplasia` (Neoplasia), `dementia_alzheimer` (Demencia / Alzheimer), `parkinson` (Parkinson), `depression` (Depressao), `epilepsy` (Epilepsia), `multiple_sclerosis` (Esclerose multipla), `rheumatoid_arthritis` (Artrite reumatoide), `food_allergies` (Alergias Alimentares), `medication_allergies` (Alergias Medicamentosas), `hypertension` (Hipertensao), `hypotension` (Hipotensao), `diabetes` (Diabetes), `respiratory_problems` (Problemas Respiratorios), `covid_19` (COVID-19), then `other` (the free-text, 20th).
- **VERDICT:** the checkbox membership + order ALREADY match ruling F one-for-one (no reorder needed). The ONLY deltas are presentation: **(a)** strict **4-column desktop -> 2-column collapse** (drop the intermediate `sm:grid-cols-3` so the legacy 4x5 reading is exact); **(b)** the `other` free-text moves from the separate below-grid block INTO the grid as the **20th cell**; **(c)** placeholder becomes **"Outras..."**. This is NOT a pre-satisfied loop (three real presentation deltas remain) - not a halt.
- **Free-text mapping:** `other` read/write is unchanged (`obj.other` <-> `onChange({ ...obj, other: value })`); only its rendered cell position moves. Storage keys before == after.
- **i18n:** the placeholder "Outras..." ships pt-PT via i18n. Prefer updating the existing key `clinical.healthProblemsOtherPlaceholder` value in BOTH `strings.pt.json` and `strings.en.json` (recon the current en value; keep parity - a one-file key fails typecheck). If a new key is cleaner, add it to both files.
- **Twelve AI keys:** untouched (Outros is not an AI field). `apps/web/lib/ingestion/ficha-medica-compat.test.ts` (the W5-13 compat test) MUST stay green.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-24-outros-grid-conformance origin/main -b osteojp-w5-24-outros-grid-conformance`; assert `git rev-parse --show-toplevel` ends in `osteojp-w5-24-outros-grid-conformance`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** paste the current rendered cell order and the current placeholder value; confirm the seed property order still equals ruling F one-for-one; confirm the three deltas.
3. **Grid columns:** change the checkbox grid to strict **4-up desktop / 2-up collapse** (e.g. `grid-cols-2` + `lg:grid-cols-4` or `md:grid-cols-4`; remove the `sm:grid-cols-3` intermediate). Reading order preserved (left-to-right, top-to-bottom).
4. **Inline free-text as the 20th cell:** render the `other` free-text INSIDE the same grid, as the final cell after `covid_19`, spanning one cell (matching a checkbox cell width), no visible label (keep the aria-label), placeholder **"Outras..."**. Remove the separate below-grid `textEntries` block. Keep read/write against `obj.other` unchanged. Preserve `readOnly` (disabled input on locked/signed).
5. **Placeholder copy:** set the placeholder to **"Outras..."** via i18n in BOTH string files (pt + en).
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (a Ficha Clinica renders the Outros 4x5 grid with the free-text as the 20th cell).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Rendered cell-order AUDIT:** a pasted e2e/DOM audit of the Outros grid listing all **20 cells** in DOM/reading order, matching ruling F one-for-one: (1) Fumador, (2) Gravidez, (3) Osteoporose, (4) Anemia, (5) Lupus, (6) Neoplasia, (7) Demencia / Alzheimer, (8) Parkinson, (9) Depressao, (10) Epilepsia, (11) Esclerose multipla, (12) Artrite reumatoide, (13) Alergias Alimentares, (14) Alergias Medicamentosas, (15) Hipertensao, (16) Hipotensao, (17) Diabetes, (18) Problemas Respiratorios, (19) COVID-19, (20) the free-text input with placeholder "Outras...". Paste it.
- **Stored-values-unchanged PROOF:** a test on an EXISTING draft record proves the `health_problems` stored object has the **same keys before and after** the render change - the nineteen booleans + `other`, byte-identical key set; a value set on `other` reads back from `other`. Paste it.
- **W5-13 compatibility test GREEN:** `ficha-medica-compat.test.ts` passes (the twelve keys still bind). Paste the passing run.
- **Suite counts** with all gates green (baseline web 816 or the then-current baseline; report the number).

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the 20-cell rendered cell-order audit, the stored-values-unchanged proof on an existing draft, the passing W5-13 compatibility test, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md AMENDMENTS ruling F authoritative.**
- **Migration-free.** No new column, no template version bump (the seed order already matches; do NOT edit `osteopathy-v3.json`), no workflow, no vendor.
- **Presentation only** - do NOT add/remove/rename any `health_problems` boolean or the `other` key; the data model is frozen; stored values map unchanged.
- **Twelve AI keys frozen** and bound to fields, not positions; the W5-13 compatibility test stays green.
- **Scope to the `checkbox_group` renderer** - do not touch BodyChart.tsx (W5-25/W5-26 remit), the field sequence (W5-19 shipped it), or any other section.
- pt-PT i18n (both files), no emoji, UI-STYLE.md tokens. **Never force-push / `--admin`.** Secrets never printed. Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- Recon finds the Outros section ALREADY renders the 4x5 grid WITH the free-text as the inline 20th cell AND placeholder "Outras..." (all three deltas already shipped) - then there is nothing to build; halt and recommend a docs-only already-shipped close.
- The seed `health_problems` property order NO LONGER equals the ruling-F 4x5 order (drifted since authoring) - surface the mismatch with a recommended default (re-derive the grid from the seed order, since ruling F says the seed IS the legacy order).
- Achieving the inline 20th-cell layout would require editing the referenced-v3 template (not just the renderer) AND v3 is referenced by records (rule-5) - surface the blast radius; ruling F expects a renderer-only change.
- Any twelve-key binding would move as a side effect.

## Field 7. Report back
Recon report (current cell order + the three deltas), the 20-cell rendered cell-order audit, the stored-values-unchanged proof, the passing W5-13 compatibility test, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

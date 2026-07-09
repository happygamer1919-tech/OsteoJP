# Loop W5-19 - Ficha Clinica field sequence + Outros + no-date (Wave 05 Hotfix)

GATE: **Wave 05 Hotfix, Batch H (migration-free).** Depends on **SPEC-ficha-medica.md AMENDMENTS 2026-07-09** (authoritative rulings B, C, D) and the shipped Ficha Clinica form (W5-14/W5-15). Migration-free (schema is `form_templates` + the RecordForm renderer). Composes with W5-20 (mobilidade at position 10) and W5-23 (display-name rename) - no file collision expected beyond `osteopathy-v3.json`/RecordForm; coordinate if run in parallel.

## Field 1. Scope and ground truth

Enforce the AMENDMENTS **authoritative field sequence** exactly on the Ficha Clinica form (creation AND edit): **remove the Data do Episodio input** and wire the auto-stamp read-only display; **reorder** to the authoritative sequence; implement the **Outros** rename + restructure.

Ground truth (recon 2026-07-09, embed - executor runs with ZERO memory; AMENDMENTS rulings B/C/D authoritative):
- **Form renderer:** `apps/web/app/clinical/[id]/RecordForm.tsx` renders `topLevelFields(schema)` in **template property order** (`Object.entries(schema.properties)`; `apps/web/lib/clinical/form-template.ts`). So field order == the property-key order in the active template JSON. Widget resolver `widgetOf` (same file).
- **Active template:** `packages/db/seed/form-templates/osteopathy-v3.json` (`key: "osteopathy"`, `version: 3`, title `Ficha Medica` -> renamed to `Ficha Clinica` by W5-23). This is the single template offered on creation (W5-13, `FICHA_MEDICA_KEY = "osteopathy"`).
- **CURRENT actual field order (top-to-bottom, recon verified):** (1) `episode_date` Data do Episodio [date, in `required`], (2) `weight_kg` Peso, (3) `height_cm` Altura, (4) `linked_appointment` Marcacao respectiva - these four are the header grid row via `HEADER_ROW_KEYS = ["episode_date","weight_kg","height_cm","linked_appointment"]`; then (5) `red_flags` Alertas, (6) `cid_codes` Codigos CID, (7) `health_problems` **Problemas de Saude** [checkbox_group: 19 booleans incl. Lupus + `other` free-text], (8) `consultation_reason` Motivos [required], (9) `relief_aggravation` Condicoes Alivio/Agravamento, (10) `clinical_history` Antecedentes, (11) `systems_review` Anamnese por Sistemas, (12) `bodychart`, (13) `mobilidade`, (14) `mobilidade_observacoes`, (15) `neurological_tests` Testes Neurologicos, (16) `special_tests` Testes Especiais, (17) `diagnostico`, (18) `tratamento`, (19) `treatment_plan` Plano, (20) `treatment_objectives` Objectivos, (21) `observations`; then the SignatureConsent block (W5-16, rendered by RecordForm, not in the schema).
- **VERDICT:** the current order ALREADY matches the AMENDMENTS sequence for fields 2-13 (W5-14/W5-15 shipped it). The ONLY deltas are **(a)** the position-1 Data do Episodio input (remove) and **(b)** the `health_problems` section title + free-text (Outros rename/restructure). This is NOT a full pre-satisfied match, so **not a halt** - two real deltas remain.
- **Data do Episodio (ruling B):** `episode_date` is `required` in the template and is auto-prefilled to today in RecordForm state. Removing the input must not break required-validation. **Preferred path:** on save, populate `episode_date` server-side from `created_at` (keeps the field valid without an input) - migration-free, no template bump, rule-5 safe. Alternative: drop `episode_date` from the template `required` (a schema edit to v3; only if the server-populate path is not viable). Remove `episode_date` from `HEADER_ROW_KEYS` and from the state prefill. Display created date/time **read-only** on the record view and the patient-profile Registos clinicos list (Lisbon display, UTC storage).
- **Outros (ruling C):** the `checkbox_group` renderer (RecordForm.tsx) already partitions boolean sub-fields into a **four-column grid** (Lupus in-grid) and renders text sub-fields (`other`) AFTER the grid - W5-14 fixed the orphaned-render bug. Deltas: (i) the SECTION title, currently `health_problems.x-label.pt = "Problemas de Saude"`, becomes **"Outros"**; (ii) the `other` free-text renders with **no visible label** and placeholder **"Outras condicoes, alergias, medicamentos..."** (today it renders a labeled `Field` with `labelOf(...) = "Outros"` and no placeholder). Presentation only; `health_problems`, its 19 booleans, and `other` are unchanged data. **Mechanism recon:** the section title comes from the template `x-label`; prefer a **renderer-level label override** for `health_problems -> "Outros"` (migration-free, no v3 schema edit) to keep rule-5 clean; if instead the executor edits `osteopathy-v3.json` `x-label`, that is a title-only schema value change re-seeded to dev (recon whether v3 is already referenced by records; if referenced and a schema edit is required, HALT per Field 6).
- **Twelve AI keys:** unchanged and bound to fields, not positions. `apps/web/lib/ingestion/ficha-medica-compat.test.ts` (the W5-13 compatibility test) MUST stay green.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-19-ficha-sequence-and-outros origin/main -b osteojp-w5-19-ficha-sequence-and-outros`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** paste the current top-to-bottom field order; confirm the two deltas vs the AMENDMENTS sequence; confirm the mechanism choice for the Outros title (renderer override vs template x-label) and the Data-do-Episodio required-validation path (server-populate vs drop-from-required).
3. **Remove Data do Episodio (ruling B):** drop the date input; remove `episode_date` from `HEADER_ROW_KEYS` and the state prefill; keep `episode_date` valid at save (server-populate from `created_at`, preferred); wire the read-only created date/time display on the record view + the patient-profile Registos clinicos list.
4. **Enforce the sequence (ruling D):** verify/adjust the field order to the authoritative sequence 1-14; Peso and Altura strictly adjacent; Bodychart untouched.
5. **Outros (ruling C):** section title "Problemas de Saude" -> **"Outros"**; grid unchanged (4-col, Lupus in-grid, responsive collapse); the `other` free-text below the grid with NO visible label + placeholder "Outras condicoes, alergias, medicamentos...".
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (a freshly created Ficha Clinica renders the authoritative sequence with no date input and an "Outros" section).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Top-to-bottom field-order AUDIT:** an e2e/snapshot of a freshly created record listing every rendered field top-to-bottom, matching the AMENDMENTS list **one-for-one** (1 Peso+Altura+Marcacao, no date; 2 Alertas; 3 Codigos CID; 4 Outros; 5 Motivos; 6 Condicoes; 7 Antecedentes; 8 Anamnese; 9 Bodychart; 10 Mobilidade + Observacoes; 11 Testes Neurologicos then Especiais; 12 Diagnostico/Tratamento/Plano/Objectivos; 13 Observacoes; 14 signature/consent). Paste it.
- **No date input PROOF:** a test asserts there is NO `input[type=date]` and no "Data do Episodio" label anywhere in the form; the created date/time shows read-only on the record view + profile list. Paste it.
- **Outros PROOF:** a test asserts the section reads "Outros" (not "Problemas de Saude"), the grid still renders all 19 conditions in four columns with Lupus in-grid, and the free-text has NO visible label + the exact placeholder. Paste it.
- **W5-13 compatibility test GREEN:** `ficha-medica-compat.test.ts` passes - the twelve keys still bind. Paste the passing run.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the top-to-bottom field-order audit, the no-date-input proof, the Outros proof, the passing W5-13 compatibility test, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md AMENDMENTS authoritative** (rulings B/C/D).
- **Migration-free.** No new column, no workflow, no vendor.
- **Presentation only for Outros** - do NOT add/remove/rename `health_problems` booleans or the `other` key; the data model is frozen.
- **Twelve AI keys are frozen and bind to fields, not positions** - reordering must not touch them; the W5-13 compatibility test stays green.
- **Bodychart unchanged** (do not touch `BodyChart.tsx`); Mobilidade is W5-20's remit (this loop only fixes its ORDER at position 10, not the widget).
- **No manual created-date entry anywhere.** Prefer the server-populate path for `episode_date`; a template `required` edit only if server-populate is not viable, and never a data-model change.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, or dirty tree).
- The shipped sequence ALREADY matches the AMENDMENTS list one-for-one INCLUDING no date input and an "Outros" section (i.e. both deltas are already done) - then there is nothing to build; halt and recommend a docs-only already-shipped close.
- Keeping `episode_date` valid at save requires editing the v3 template `required` AND recon shows v3 is already referenced by a record (rule-5 immutability) - surface the version-bump question with a recommended default.
- The Outros rename can only be done by editing the referenced-v3 `x-label` (not via a renderer override) AND v3 is already referenced by records - surface the rule-5 blast radius.
- Any twelve-key binding would move as a side effect of the reorder (the compatibility test would break).

## Field 7. Report back
Recon report (current order + the two deltas), the field-order audit, the no-date + Outros proofs, the passing W5-13 compatibility test, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

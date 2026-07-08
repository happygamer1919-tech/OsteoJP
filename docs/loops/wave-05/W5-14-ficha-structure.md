# Loop W5-14 - Ficha structure: field sequence, header strip, timestamp, Problemas grid (Batch 4, per SPEC-ficha-medica.md)

GATE: **Batch 4.** Depends on **SPEC-ficha-medica.md** (authoritative, sec 3-5) and **W5-13** (the Ficha Medica template exists). Migration-free (schema is `form_templates` + renderer). Runs after W5-13.

## Field 1. Scope and ground truth
Implement the **full field sequence** (SPEC sec 5), the **read-only patient header strip** (SPEC sec 3), the **auto creation timestamp** (SPEC sec 4), the **Problemas de Saude grid restructure**, and the **Outros rules** (SPEC sec 5.4).

Ground truth (recon 2026-07-08, embed - executor runs with ZERO memory; SPEC sec 3-5 authoritative):
- **Form renderer:** `apps/web/app/clinical/[id]/RecordForm.tsx` (`FieldWidget`, ~lines 131-252) renders a `form_templates` JSON-Schema into fields; widget resolver in `apps/web/lib/clinical/form-template.ts`.
- **Problemas de Saude bug (root cause, SPEC sec 5.4):** the `checkbox_group` case (~lines 181-216) renders `grid grid-cols-1 sm:grid-cols-2`, gives text sub-fields `sm:col-span-2` and checkboxes a bare `min-w-0` div. Mixing the full-width **Outros** text item into the same grid as single-column checkboxes disrupts grid flow -> the current broken render (only **Lupus** under the header, the rest orphaned below Outros). The fix is a **four-column grid** with Outros rendered after the grid, not interleaved.
- **`health_problems` data already has all 19 conditions + `other`** (osteopathy-v2 -> Ficha Medica, W5-13): smoker, pregnancy, osteoporosis, anemia, lupus, neoplasia, dementia_alzheimer, parkinson, depression, epilepsy, multiple_sclerosis, rheumatoid_arthritis, food_allergies, medication_allergies, hypertension, hypotension, diabetes, respiratory_problems, covid_19, + other. **This is a rendering restructure, not a data-model change** - Lupus simply joins the grid.
- **Patient header strip (SPEC sec 3):** read-only, pulled from the profile (name + patient number + a few demographics); the ficha never re-requests nome/NIF/contactos/morada/profissao (NO-DUPLICATION rule). Profile data source: the patient record (`apps/web/lib/patients`).
- **Creation timestamp (SPEC sec 4):** no manual created-date picker; `created_at` auto-stamped (UTC, Lisbon display) shown on the profile. `episode_date` stays a clinical field, prefilled today, editable (Q-W5-1).
- **Field sequence (SPEC sec 5, authoritative order):** 5.0 header strip; 5.1 header row (Data do Episodio, Peso, Altura adjacent, Marcacao respectiva); 5.2 Alertas; 5.3 Codigos CID; 5.4 Problemas de Saude 4-col grid + Outros, directly above 5.8; 5.5 Motivos (required); 5.6 Condicoes Alivio/Agravamento; 5.7 Antecedentes (helper text); 5.8 Anamnese por Sistemas; 5.9 Bodychart (EXISTING, unchanged); [5.10-5.13 are W5-15]; 5.14 signature/consent (W5-16).
- **RECON FIRST (report BEFORE building):** the renderer + the checkbox_group bug; the header-strip data source; where `created_at` displays on the profile; that the Ficha Medica schema (from W5-13) carries the sequence fields; the existing Bodychart component (leave unchanged).

**Scope (this loop = SPEC 5.0-5.9 + timestamp + grid + Outros):** render the header strip; implement the header row (Peso/Altura adjacent); Alertas; Codigos CID; the **four-column Problemas de Saude grid** (Lupus in the grid, Outros after the grid reserved for allergy/medication specifics + uncovered items, nothing duplicated with Anamnese, grid directly above Anamnese); Motivos (required) / Condicoes / Antecedentes (helper text) / Anamnese; keep Bodychart unchanged; auto creation timestamp (no manual picker); `episode_date` prefilled today + editable. **W5-15 does 5.10-5.13; W5-16 does 5.14.** pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-14-ficha-structure origin/main -b osteojp-w5-14-ficha-structure`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the renderer + checkbox_group bug; header-strip source; created_at display; the Ficha Medica schema sequence.
3. **Header strip (SPEC 3):** read-only patient strip at the top; no duplicated profile fields anywhere in the ficha.
4. **Field sequence 5.1-5.9 (SPEC 5):** in authoritative order; Peso and Altura adjacent with nothing between; Bodychart the existing component, unchanged.
5. **Problemas de Saude grid (SPEC 5.4):** replace the broken render with a **four-column grid**; Lupus in the grid; **Outros** rendered after the grid (reserved for allergy/medication specifics + uncovered items); nothing duplicated with Anamnese; grid directly above Anamnese. Fix the `checkbox_group` renderer so a full-width text sub-field no longer disrupts grid flow (render checkboxes in the 4-col grid, text sub-fields below it).
6. **Timestamp (SPEC 4):** no manual created-date picker; `created_at` auto-stamped + shown on profile; `episode_date` prefilled today + editable.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (a new Ficha Medica renders the full 5.0-5.9 sequence; the Problemas grid shows all 19 conditions in four columns with Outros after; no created-date picker).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under migrations/workflows. Paste it.
- **Recon report pasted:** renderer + bug; header-strip source; created_at; the sequence in the Ficha Medica schema.
- **Field sequence proven:** an e2e/snapshot asserts the 5.0-5.9 order incl. header strip, Peso/Altura adjacency, Bodychart unchanged. Paste it.
- **Problemas grid fixed:** all **19** conditions render in a **four-column** grid (Lupus included), Outros after the grid; the orphaned-render bug is gone. Paste the test (assert all 19 present + Outros placement).
- **No-duplication proven:** the ficha renders the read-only header strip and does NOT re-request nome/NIF/contactos/morada/profissao. State + test.
- **Timestamp proven:** no manual created-date input; `created_at` auto-stamped + shown on profile; `episode_date` prefilled today + editable. Paste it.
- **Suite counts** (baseline web 816) with green gates.

## Field 4. Verification (paste evidence)
Recon report, migration-free diff, the field-sequence e2e/snapshot, the Problemas-grid fix test (19 conditions, 4 columns, Outros after), the no-duplication proof, the timestamp proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`. **SPEC-ficha-medica.md authoritative** (sec 3-5).
- **Migration-free** (schema is `form_templates` + renderer).
- **Bodychart unchanged** (SPEC 5.9) - do not touch `BodyChart.tsx`.
- **NO-DUPLICATION:** the ficha never re-requests profile data (SPEC 3).
- **Problemas grid is a rendering restructure, not a data change** - the 19 booleans + Outros already exist; do not add/remove conditions.
- **Do not implement 5.10-5.13 (W5-15) or 5.14 (W5-16)** here.
- **No manual created-date picker** (SPEC 4).
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md`. Halt if: fixing the `checkbox_group` renderer would ripple to other templates' checkbox groups in a way that changes their render (surface the blast radius); or the header-strip data would require a query change beyond reading the patient record.

## Field 7. Report back
Recon report, the field sequence + header strip + timestamp implementation, the Problemas-grid fix, the no-duplication proof, migration-free proof, suite counts, PR number. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.

# Loop W12-24 - Declaracao de Presenca: manual blank + NIF field (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE. OWNER VISUAL GATE. Migration-free (patient NIF already exists; the declaration is generated, not persisted).** Manual-mode Declaracao starts blank (no stale prefill), and the declaration gains a NIF field. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Two changes to the Declaracao de Presenca dialog + its PDF: (a) switching to manual mode explicitly clears the prefilled date/start/end/location; (b) add a NIF field to the dialog + the generated PDF (optionally prefilled from `patients.nif`, editable). Presentation + generation only; no schema.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Component:** `apps/web/app/patients/[id]/DeclaracaoDialog.tsx` (Documentos tab dialog); server action `declaracao-actions.ts` (`generateDeclaracaoUrlAction` -> 60s signed PDF URL); PDF pipeline `apps/web/lib/clinical/declaracao/{generate.ts,declaracao-model.ts,declaracao-pdf.ts}`; e2e `apps/web/e2e/declaracao.spec.ts`.
- **Manual mode does NOT fully blank:** auto mode (`selectAppointment(id)`, `:56-67`) prefills date/start/end/location from the appointment; manual mode (option value `""`, `:118`) calls `selectAppointment("")` which only resets `locationId=null` (`:64-66`) and LEAVES stale date/start/end. A fresh open is blank (initial state `:49-51`), but switching from a selected appointment back to manual keeps the old values. Fix: manual explicitly clears date/start/end (+ location) so manual always starts blank.
- **NIF is ABSENT from the declaration:** not in the dialog inputs (`:109-139`), not in `DeclaracaoRequest` (`declaracao-actions.ts:16-22`), not in `GenerateDeclaracaoInputs` (`generate.ts:27-36`), not in `buildDeclaracaoModel` (`generate.ts:59-101`). `patients.nif` EXISTS on the patient but is never queried/rendered here. Add NIF: a dialog input (prefill from `patients.nif` when available, editable) -> the request -> the model -> the PDF render.
- **No persistence:** the declaration is generated on demand (signed URL); adding NIF does NOT need a schema change (patient NIF already stored; the field flows through the request/model to the PDF).

**Scope:** `DeclaracaoDialog.tsx` (manual-clear + NIF input) + the request/inputs/model/PDF (NIF render) + i18n (both files, NIF label) + tests. Migration-free; verify on local + Preview.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-24-declaracao`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Manual blank:** make `selectAppointment("")` clear date/start/end/location so manual mode always starts blank (including when switching back from a selected appointment).
3. **NIF field:** add a NIF input to the dialog (prefill from `patients.nif` if present, editable) -> `DeclaracaoRequest` -> `GenerateDeclaracaoInputs` -> `buildDeclaracaoModel` -> the PDF render (placed per the declaration template + CLAUDE.md print-branding).
4. **i18n:** the NIF label (+ any manual-mode helper) in BOTH i18n files, same key; JSON.parse both.
5. **Test:** e2e - switching to manual clears the fields; a manual declaration with a typed NIF renders NIF in the PDF; an auto declaration prefills NIF from the patient. Update `declaracao.spec.ts`.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` ZERO migration/workflow.

## Field 3. Definition of done (machine-verifiable)
- **Manual-blank PROOF:** an e2e selects an appointment (prefilled), switches to manual, and asserts date/start/end/location are cleared. Paste it.
- **NIF PROOF:** an e2e renders a declaration with a NIF value and asserts NIF appears in the PDF/model; auto mode prefills from `patients.nif`. Paste it.
- **No-schema PROOF:** `git diff --name-only origin/main` ZERO migration/workflow (patient NIF reused, declaration not persisted).
- **Gates green** incl. i18n parity pt+en.

## Field 4. Verification (paste evidence)
The manual-blank e2e, the NIF-render e2e, the no-schema diff, suite counts, the Preview URL (owner generates a manual + an auto declaration, sees blank-on-manual + NIF), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Migration-free:** reuse `patients.nif`; the declaration is generated, not persisted; no schema.
- The declaration is a printed legal-ish document - keep the CLAUDE.md print-branding (logo + location contacts + fiscal info) intact; NIF is added, nothing removed.
- Verify on local `127.0.0.1`; pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.** No PII in logs (the NIF value is document content, never logged).

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- NIF turns out to need persistence or a schema change (it should not; `patients.nif` exists) - HALT with the finding.
- The declaration is legally sensitive and the NIF placement/label needs owner/JP wording confirmation - HALT to a Q with a recommended default (label "NIF", prefilled from the patient, editable).

## Field 7. Report back
The manual-blank e2e, the NIF-render e2e, the no-schema diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-24 is OWNER VISUAL GATE (declaration is a visible document, migration-free).** Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the Preview + a sample manual + auto declaration and HALTs; owner confirms + merges. NOT `[SELF-MERGE-OK]`.
- Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any persistence/schema need or legal-wording ambiguity.

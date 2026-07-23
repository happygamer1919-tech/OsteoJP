# Loop W12-22 - Ficha clinica sequence + remove Codigos CID (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE, display-order only. OWNER VISUAL GATE. Migration-free (new immutable template v5 + owner-gated template-row seed). Signed-record immutability NEVER touched.** Enforce Rodica's exact ficha section order and remove "Codigos CID" entirely, as a NEW template version - never an edit of the immutable v4, never a mutation of any signed record. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Author `osteopathy-v5.json` with the exact Rodica display order + no `cid_codes`, wire the current-template resolver to v5 for NEW fichas, and PROVE existing (signed/locked) records are untouched. Display-order only; no field semantics change, no schema/DDL.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **Order is the `x-order` array (array position IS the order):** `packages/db/seed/form-templates/osteopathy-v4.json:16-34`; the renderer emits fields in `x-order` sequence (`apps/web/lib/clinical/form-template.ts:69-71,84-101`), and the array (not `properties` key order) is the source of truth for both the body and the in-ficha left nav.
- **New fichas resolve to the HIGHEST ACTIVE version** via `resolveCurrentTemplates`/`currentTemplateForKey` (`apps/web/lib/clinical/template-version.ts:37-65`); existing records join `form_templates` BY STORED ID (`records.ts`/`episodes.ts:123`/`review.ts:102`), so a signed record renders its ORIGINAL structure forever.
- **v4 is IMMUTABLE once referenced (CLAUDE.md rule 5):** the change is a NEW version `osteopathy-v5.json`, not an edit of v4 (v1/v2/v3/v4 coexist). Removing CID + reordering happens ONLY in v5.
- **"Codigos CID" appears at:** `osteopathy-v4.json:21` (`"cid_codes"` in `x-order`, index 4) + `:84-95` (property def) + `apps/web/app/clinical/[id]/RecordForm.tsx:42,46` (`ROW_GROUPS` pairs `red_flags`+`cid_codes` on one row, testid `ficha-alertas-cid-row`). v5 drops `cid_codes` from `x-order` + `properties`; the `ROW_GROUPS` pairing is updated so `red_flags` (Alertas) renders alone. (Immutable v3/v4 keep CID; do NOT touch them.)
- **The exact Rodica order (0-15) the executor maps to the v4/v5 field keys:** 0 Paciente dashboard (personal details) | 1 Peso | 2 Altura | 3 Motivos da Consulta / Inicio / Contexto em que ocorre | 4 Condicoes Alivio / Agravamento | 5 Observacoes | 6 Mobilidade Activa / Passiva | 7 Testes Especiais | 8 Observacoes Mobilidade Activa / Passiva | 9 Anamnese por Sistemas | 10 Outros | 11 Antecedentes Clinicos / Cirurgia / Medicacao | 12 Diagnostico | 13 Objectivos do Tratamento | 14 Plano de Tratamento | 15 Tratamento. The executor maps each to the existing field key (e.g. Motivos -> `chief_complaint`, Alertas stays but CID is removed, etc.) - a name that has no existing field key HALTs to a Q (do NOT invent a new field; this is display-order only).
- **Immutability is enforced by the BEFORE UPDATE OR DELETE trigger** `clinical_records_enforce_immutability` (`supabase/migrations/0001_rls.sql:236-259`; re-parent-aware redefine `0005:60-96`): any change to a locked/signed record's `data`/status/signature raises `check_violation`. A display-order change edits ONLY the template seed/new version, never `clinical_records`, so signed records are provably untouched - the loop verifies the trigger stays enabled + that a diff of a pre-existing signed record's `data` is empty after v5 is active.
- **Seeding v5 on prod = a template-row DATA insert (owner-gated).** New template versions are seeded via `packages/db/seed/form-templates/`; inserting the v5 `form_templates` row on prod is a real-data write, rehearsed on local, applied under the owner phrase.

**Scope:** `osteopathy-v5.json` + the resolver wiring + the `ROW_GROUPS` update + the owner-gated v5 template-row seed + tests (new fichas render the v5 order without CID; a pre-existing signed record renders unchanged; the immutability trigger stays enabled). ZERO DDL/migration; no field-semantics change.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-22-ficha-v5`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Map the order:** map Rodica's 0-15 to the existing v4 field keys; any unmapped name HALTs to a Q. Author `osteopathy-v5.json` = v4 minus `cid_codes`, `x-order` re-sequenced to the mapped order; keep all field semantics/labels/`x-note` identical (display-order only).
3. **Wire the resolver:** ensure `currentTemplateForKey` resolves NEW fichas to v5 (highest active); update `ROW_GROUPS` so `red_flags` renders without `cid_codes`.
4. **Prove immutability:** a test/verify that a pre-existing signed record (stored `formTemplateId` = v4) still renders the v4 structure + its `data` diff is empty after v5 is active; confirm the trigger stays enabled.
5. **Seed v5 (DATA, owner-gated):** rehearse the v5 template-row insert on local; apply to prod ONLY under the owner phrase, before/after counts.
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` shows the new seed + resolver/RecordForm + tests - ZERO migration/DDL.

## Field 3. Definition of done (machine-verifiable)
- **Order PROOF:** an e2e/unit renders a NEW ficha and asserts the section order equals Rodica's 0-15 and that CID is absent. Paste the assertion.
- **No-CID PROOF:** `cid_codes` is gone from v5's `x-order` + `properties`; `ROW_GROUPS` renders `red_flags` alone; v3/v4 unchanged. Paste the diff.
- **Immutability PROOF:** a pre-existing signed record renders its v4 structure unchanged + its `data` diff is empty; the `clinical_records_enforce_immutability` trigger is enabled. Paste the check.
- **Seed PROOF (owner-gated):** the v5 template row applied to prod under the owner phrase, before/after counts.
- **No-DDL PROOF:** `git diff --name-only origin/main` ZERO migration/DDL.
- **Gates green.**

## Field 4. Verification (paste evidence)
The order e2e, the no-CID diff, the immutability proof (unchanged signed record + trigger enabled), the owner-gated seed counts, the no-DDL diff, suite counts, the Preview URL (owner opens a new ficha + confirms the order + no CID), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Display-order ONLY:** no field-semantics change, no new field, no schema/DDL/migration; a name with no existing field key HALTs to a Q.
- **NEVER edit v4 (or v1/v2/v3)** - they are immutable once referenced; the change is a NEW v5. **NEVER mutate any signed/locked record** - the immutability trigger stays enabled and is proven untouched.
- The v5 template-row seed is a REAL-PROD data write - owner-gated, rehearsed on local `127.0.0.1`, before/after counts. Cloud is REAL DATA ONLY.
- pt-PT diacritics correct in v5 labels (identical to v4); both i18n files JSON.parse if any string moves; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.** No PII.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- A Rodica-order name has no existing field key (would require a new field) - HALT to a Q (display-order only; a new field is a separate ficha loop).
- Any step would edit v4 or mutate a signed record - HALT (immutability is inviolable).
- The v5 seed's owner authorization phrase is absent - author v5 + the resolver + tests + the local rehearsal, and HALT the prod seed.

## Field 7. Report back
The order e2e, the no-CID diff, the immutability proof, the owner-gated seed counts, the no-DDL diff, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-22 is OWNER VISUAL GATE (ficha layout is visual) + an owner-gated v5 template seed.** NOT `[SELF-MERGE-OK]`. Required checks + all three Vercel deploys green (checks API not banner) NECESSARY but not sufficient; GREEN pushes the Preview + the new-ficha order screenshot + the immutability proof and HALTs; the owner authorizes the v5 seed + merges.
- Migration-free (no DDL); fresh `origin/main`, one PR + one data window in flight, never stacked. Workflow files never touched. HALT-LOUD on any immutability/v4-edit risk.

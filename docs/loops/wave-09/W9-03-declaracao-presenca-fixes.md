# Loop W9-03 - Declaracao de Presenca fixes (Wave 09 Correcoes CB)

GATE: **Wave 09 Correcoes CB, migration-free expected, OWNER VISUAL GATE.** Fixes the three Declaracao de Presenca defects the CB team calls an "erro grave": the wrong (LV) carimbo on CB declarations, the missing clinic logo, and the forced auto-download in the manual option. Runs AFTER W9-02 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked. **OWNER VISUAL GATE:** all checks green is NECESSARY but NOT sufficient; GREEN pushes + pastes the osteojp-platform PREVIEW URL + a CB and an LV declaration to inspect, then HALTs; the owner merges.

## Field 1. Scope and ground truth

Fix item 2 of the CB QA (`docs/qa/2026-07-16-castelo-branco-qa.md`): a CB Declaracao de Presenca prints the LV carimbo, the clinic logo does not render, and the document auto-downloads even when the user chose the manual option. After the fix: the carimbo is per-location (a CB declaration carries the CB stamp, an LV declaration the LV stamp), the clinic logo renders, and the manual option opens the document as a preview instead of forcing a download. Document CONTENT is otherwise unchanged.

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory; W9-01 finding (d) is the authoritative asset-pipeline map, this is the starting map):
- **The Declaracao de Presenca shipped in W5-31 (FF2, #563).** The responsavel line is a tenant setting (code-default "Dr. Joao Paulo Santos Silva" + `tenants.settings.declaracao` override, Q-W5-31 / Q-W5-11). The localidade line is per-location: it comes from the marcacao, with a tenant-default fallback (Q-W5-10). So a per-location read ALREADY exists in this pipeline for the localidade line - the carimbo/logo fix follows the same pattern (derive the asset from the declaration's location, not a hardcoded LV asset).
- **Template + assets:** the print template is under `docs/pdf-templates/` (`declaration-presenca.html`); the stamp/signature asset is Q-W5-9 (the signature/stamp image asset). W9-01 (d) states where the logo + carimbo are read, whether per-location assets exist or a single LV asset is hardcoded, why the logo does not render, and where the auto-download-vs-preview decision is made.
- **Brand print rule (CLAUDE.md):** every report, declaration, and invoice prints the logo + location contacts + fiscal info. The logo not rendering is a regression against this rule.
- **The editable-fields request is item 12 (acompanhantes), JP-gated, OUT OF SCOPE.** This loop preserves the JP-approved default document content and fixes ONLY the stamp/logo/download defects. Do not add editable declaration fields here.

**Scope:** (1) per-location carimbo (derive from the declaration's location like the localidade line already does; a CB declaration carries the CB stamp); (2) the clinic logo renders on the declaration (per the print-branding rule); (3) the manual option opens a preview (new tab / inline viewer) instead of forcing an auto-download. Document content unchanged; the responsavel + localidade behaviour (Q-W5-10 / Q-W5-11 defaults) is preserved. Migration-free expected (assets/settings, not schema).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-02's merge; `git worktree add ../osteojp-w9-03-declaracao-presenca origin/main -b osteojp-w9-03-declaracao-presenca`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume W9-01 (d):** read `docs/recon/W9-01-findings.md` section (d); confirm the asset read points + the download-vs-preview decision site; paste the citations.
3. **Per-location carimbo:** derive the stamp asset from the declaration's location (mirror the existing per-location localidade read); a CB declaration carries the CB stamp, an LV declaration the LV stamp. If a per-location stamp ASSET does not exist yet, HALT to QUESTIONS with a recommended default (do not invent a stamp image); the wiring lands here, the asset is owner-supplied (Q-W5-9 relation).
4. **Logo render:** fix the logo so it renders on the declaration (per the CLAUDE.md print-branding rule). Root-cause why it was absent (per W9-01 (d)) and cite the fix.
5. **Preview not forced download:** the manual option opens the document as a preview (new tab or inline viewer); the explicit download action still downloads. No forced auto-download in the manual path.
6. **Tests:** a test that the stamp asset resolves per location (CB -> CB stamp, LV -> LV stamp); a test that the logo is present in the rendered declaration; a test/assertion that the manual path does not trigger a forced download. Preserve the W5-31 content + responsavel/localidade defaults (regression assertion).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (a user-facing surface changed). JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files.
8. **OWNER VISUAL GATE:** push; paste the osteojp-platform PREVIEW URL + steps to open a CB declaration and an LV declaration; HALT for the owner to inspect the stamp, logo, and preview-not-download before merging.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`. Paste it.
- **Per-location carimbo PROOF:** a CB declaration resolves the CB stamp, an LV declaration the LV stamp. Paste the test + the resolution path.
- **Logo PROOF:** the clinic logo renders on the declaration. Paste the assertion + the root-cause note from W9-01 (d).
- **Preview PROOF:** the manual option opens a preview and does NOT force a download. Paste the assertion.
- **Content-unchanged PROOF:** the W5-31 document content + responsavel/localidade defaults are unchanged; NO editable declaration fields added (item 12 stays JP-gated). Paste the regression assertion.
- **OWNER VISUAL GATE PROOF:** the preview URL + the CB/LV declaration steps pasted; the loop HALTED for owner merge (NOT self-merged).
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The W9-01 (d) citations, the migration-free diff, the per-location-carimbo + logo + preview + content-unchanged proofs, suite counts, the PREVIEW URL + CB/LV declaration steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-02). **Migration-free expected;** if the fix needs a schema change (e.g. a new per-location asset column) HALT to convert - do not add a migration here.
- **Document CONTENT unchanged.** Fix stamp/logo/download only. **No editable declaration fields** (item 12 acompanhantes is JP-gated).
- **Preserve the W5-31 responsavel (Q-W5-11) + localidade (Q-W5-10) defaults.** Derive the stamp per location the same way the localidade is already derived.
- **Do NOT invent a stamp image asset.** If a per-location asset is missing, HALT to QUESTIONS (Q-W5-9 relation) with a recommended default; wire the resolution, owner supplies the asset.
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md; print-branding rule (logo + location contacts + fiscal info on every declaration). DB access only through `packages/db`. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**
- **Standing test-data rule (Wave 09):** never run destructive QA against **Maria Joao Silva** (`triboimax635+maria@gmail.com`); disposable test patients only; reference therapist **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-02's merge.
- A per-location carimbo requires a new asset that does not exist - HALT to QUESTIONS (owner supplies the CB stamp; do not fabricate an image).
- The fix would need a schema change or an edit to the JP-approved document content - HALT (content is JP-gated; a schema change converts to a follow-up).
- The download-vs-preview change would alter how the declaration is stored or signed - HALT (do not touch the signature/storage path; W5-31 shipped it).

## Field 7. Report back
The W9-01 (d) citations, the migration-free diff, the carimbo + logo + preview + content-unchanged proofs, suite counts, the PREVIEW URL + CB/LV steps, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-03 is the OWNER VISUAL GATE** (standing rule for visual-heavy loops since W7-03). All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green, read from the checks API NOT the banner, is NECESSARY but NOT sufficient. GREEN pushes + pastes the osteojp-platform PREVIEW URL + the CB and LV declaration inspection steps, then HALTs; **the owner inspects a CB and an LV declaration on the preview URL and merges.** GREEN NEVER self-merges.
- **Runs after W9-02 merged**, fresh `origin/main`, never stacked. Workflow files NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch.

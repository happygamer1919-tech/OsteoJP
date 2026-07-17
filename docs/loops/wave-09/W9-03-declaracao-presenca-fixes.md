# Loop W9-03 - Declaracao de Presenca fixes (Wave 09 Correcoes CB)

> **STATE 2026-07-17 (W9-03b) - asset micro follow-up, OWNER VISUAL GATE.** The owner
> supplied the canonical logo (`Logotipo_OsteoJP_2023.jpg`, the full lockup: figure mark +
> "osteojp" wordmark + "Osteopatia, Fisioterapia e Formacao" tagline) on 2026-07-17. Per the
> ruling 2026-07-17 item 2 ("when the owner pastes local file paths, commit them into the
> slots ... otherwise as a micro follow-up PR that carries the same OWNER VISUAL GATE"), W9-03
> having merged (#599), this lands as **W9-03b**: `apps/web/lib/clinical/assets/clinic-logo.jpg`
> replaces the W9-03 stand-in (the icon-512 mark drawn next to a Helvetica "OsteoJP" wordmark),
> embedded via pdf-lib `embedJpg` as a single centered lockup. The per-location carimbo wiring
> is UNCHANGED: CB still renders a BLANK stamp area (never the LV carimbo). **The CB carimbo
> asset is still pending** - a separate micro follow-up when the owner supplies it; its slot
> stays defined-but-empty (blank area). Rendered CB + LV locally: both carry the canonical
> logo; CB blank stamp, LV keeps its carimbo. Same OWNER VISUAL GATE (owner inspects, then
> merges).


> **STATE 2026-07-17 (2nd) - EXECUTED and pushed for the OWNER VISUAL GATE. What shipped vs
> the blank-stamp ruling:**
>
> All three defects fixed, migration-free, no document content changed:
> - **Carimbo (the erro grave): per-location resolution.** `signatureStampBytesForLocation`
>   keys on `normalizeLocationKey` (the SAME canonical key the localidade line uses). LV keeps
>   its existing stamp (renamed `signature-stamp-linda-a-velha.png`); **CB resolves to a
>   defined-but-empty slot -> a clean BLANK stamp area, NEVER the LV carimbo.** An unknown or
>   null location also renders blank - the fallback is never another clinic's stamp. The model
>   layer now receives the location identity (`resolveStampLocationKey`, mirroring
>   `resolveLocalidade`); before, `generate.ts` resolved the location then DISCARDED it, which
>   is exactly why every declaration got the LV stamp.
> - **Logo: the real mark now renders.** W9-01 (d) said no PNG/JPEG logo existed; **at
>   execution one DOES** - `apps/portal/public/icon-512.png`, the canonical OsteoJP brand mark
>   (verified by eye: the teal/magenta/grey figure, not a padded app icon), 512x512 RGBA. Per
>   the ruling ("wire from the canonical app logo asset if one exists in the repo"), it was
>   inlined as `clinic-logo-asset.ts` and embedded via pdf-lib `embedPng`, replacing W5-31's
>   hand-drawn teal-rectangle stand-in. **No slot left blank - the asset existed, so it was
>   wired.** (The wordmark stays as Helvetica type, as before.) The incoming clinic-staff logo,
>   if different, regenerates that one file.
> - **Download -> preview.** Dropped the `{ download: pdf.filename }` option from the single
>   `createSignedUrl` call (`declaracao-actions.ts`), so Storage serves the object
>   `Content-Disposition: inline` and the tab the client already opens previews it. Both paths
>   (marcacao and "Introducao manual") share that one action, so both now preview. The storage
>   upload, path, and bytes are untouched.
>
> **VISUAL PROOF rendered at execution** (CB + LV declarations generated locally, first page
> inspected): the LV declaration shows the real logo at top and the LV carimbo at the bottom;
> the CB declaration shows the same real logo and a BLANK stamp area with "Castelo Branco" as
> the localidade. This is exactly the ruling's gate criteria. Pasted in the PR for the owner.
>
> **STILL OPEN - Q-W9-01-7 (not resolved by this loop):** the "Introducao manual" path sets
> `locationId = null`, so `resolveStampLocationKey` falls through to the tenant default
> (oldest ACTIVE location). Since the owner re-activated LV on 2026-07-17 (ruling 5a), a
> manually-entered CB declaration would resolve to LV's stamp - the dialog exposes no location
> selector on the manual path. **This loop does NOT add editable declaration fields (item 12
> is JP-gated), and adding a manual-path location selector is a UI change the loop did not
> scope.** Recorded as a follow-up so the manual path's stamp selection is decided
> deliberately; the marcacao path (the common case) is fully correct.
>
> **Content-unchanged:** the W5-31 responsavel (Q-W5-11 default "Dr. Joao Paulo Santos Silva")
> and localidade (Q-W5-10) behaviour are preserved; no editable declaration fields added; the
> verbatim pt-PT legal body is untouched. `docs/pdf-templates/declaration-presenca.html` was
> already marked DEPRECATED in the W9-04 docs delta.

> **STATE 2026-07-17: UNBLOCKED by owner ruling with a BLANK-STAMP default. Resequenced to run
> AFTER W9-04. Recorded here (docs delta riding the W9-04 PR) so the executing loop reads this
> from committed authority, not from a session.**
>
> **Why it was blocked.** W9-01 (d) found there is **no CB carimbo asset anywhere in the
> repo** - exactly ONE stamp exists (`apps/web/lib/clinical/declaracao/assets/signature-stamp.png`,
> the LV/Fisiozero block), resolved with **no location parameter at all**
> (`declaracao-model.ts:64`, `signatureStampBytes()` is zero-argument). This loop's Field 6
> therefore required a HALT rather than fabricating an image. The asset request went to
> `outbox/W9-03-ASSET-REQUEST-carimbo-CB-plus-logo-2026-07-17.md`; W9-04 was run first under
> the owner's resequencing authorization (session ruling 2026-07-17 item 6, confirmed item 3).
>
> **The unblocking ruling (owner, 2026-07-17, item 2), verbatim:**
>
> > "W9-03 unblocked with the blank-stamp default, built as per-location asset resolution: LV
> > keeps its existing stamp; CB renders a clean blank stamp area with a defined asset slot.
> > The erro grave (LV stamp on CB documents) dies immediately with no image needed. Logo:
> > wire from the canonical app logo asset if one exists in the repo; if none exists, place
> > the slot and leave it blank. The CB carimbo and logo files are incoming from clinic staff;
> > when the owner pastes local file paths, commit them into the slots - inside W9-03 if still
> > open, otherwise as a micro follow-up PR that carries the same OWNER VISUAL GATE. W9-03
> > gate inspection: CB declaration shows blank stamp and never the LV stamp; LV declaration
> > unchanged plus logo state as built."
>
> **What this means for the executor:**
> - **Build per-location asset RESOLUTION**, keyed on `normalizeLocationKey` (the same
>   canonical key the localidade line already uses: `linda-a-velha` / `castelo-branco`,
>   `location-contacts.ts:70,79`). LV resolves to the existing stamp. CB resolves to an
>   EMPTY slot -> a clean blank stamp area, never the LV stamp.
> - **The "erro grave" dies with no image needed.** A CB declaration stops printing the LV
>   carimbo the moment resolution is per-location; the blank area is the already-supported
>   `signatureStamp: false` behaviour (`declaracao-pdf.ts:110-113` leaves blank vertical space
>   for a physical stamp). This is a fix, not a placeholder.
> - **Logo:** wire from a canonical app logo asset **if one exists in the repo**. W9-01 (d)
>   established the committed brand assets are **SVG** (`packages/ui/src/assets/brand/logo-*.svg`)
>   and pdf-lib embeds **only PNG/JPEG**, which is why W5-31 hand-drew a rectangle stand-in
>   (`declaracao-pdf.ts:66-76`). **The executor VERIFIES whether a canonical PNG/JPEG logo
>   exists at execution; if none does, place the slot and leave it blank** per the ruling - do
>   NOT fabricate or rasterise one absent a further ruling.
> - **Incoming assets:** the CB carimbo + logo files are coming from clinic staff. When the
>   owner pastes local paths, commit them into the slots - **inside W9-03 if still open,
>   otherwise as a micro follow-up PR carrying the same OWNER VISUAL GATE.**
> - **OWNER VISUAL GATE inspection (per the ruling):** a **CB declaration shows a blank stamp
>   area and NEVER the LV stamp**; an **LV declaration is unchanged**, plus the logo state as
>   built.
>
> **Corrections from W9-01 (d) that still stand (the loop file's starting map is wrong):**
> - `docs/pdf-templates/declaration-presenca.html` is **NOT the template** - it is dead
>   documentation (`docs/pdf-templates/SPEC.md:5`: "awaiting wire-up to PDF renderer"; zero
>   code references). The renderer is **pdf-lib** (`declaracao-pdf.ts`). Editing that HTML
>   changes nothing. **Mark it deprecated in this loop's docs delta** (owner ruling item 6:
>   "Mark the dead declaration HTML template deprecated in the docs delta; renderer stays
>   pdf-lib").
> - The **"manual option" is not a download-vs-preview toggle**. It is
>   `documents.declaracao.manualOption` = "Introducao manual", the empty-value first entry in
>   the marcacao dropdown (`DeclaracaoDialog.tsx:118`). BOTH paths force the same download.
>   There is no preview option today to fix - the default must be flipped to inline. The
>   download is one option on one call: `createSignedUrl(path, 60, { download: pdf.filename })`
>   (`declaracao-actions.ts:45-47`); dropping it yields `inline`. The client already tries to
>   preview (`window.open`, `DeclaracaoDialog.tsx:84`).
> - **The manual path sets `locationId = null`** (`DeclaracaoDialog.tsx:65`), so it falls back
>   to `tenantDefaultLocation` (the oldest ACTIVE location). Per-location stamp resolution
>   keyed off a null `locationId` inherits that fallback, and the dialog exposes no location
>   selector on the manual path. **Q-W9-01-7 remains open** on how the manual path picks a
>   stamp. NOTE: LV was `is_active = false` at recon and the owner **re-activated it via the
>   app on 2026-07-17** (ruling item 5a), so the oldest-active-location fallback may now
>   resolve to LV again - the executor must not assume the recon-time state.
> - The generation path **writes to Storage** (`declaracao-actions.ts:38-43`, admin
>   service-role, tenant-prefixed path). The download flag sits 3 lines below the upload, so
>   W9-03 must touch this file, but the change is narrow: `createSignedUrl` only - no bytes,
>   no path, no upload change, and the path construction at :38 is untouched. This is a signed
>   URL, **not** the clinical `record_status` state machine: no `clinical_records` row, no
>   therapist signature, so the Field 6 "alters how the declaration is stored or signed" HALT
>   does not trigger.

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

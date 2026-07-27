# Loop PL-03a - Declaracao de Presenca: editable free-text observacoes (UI, NON-migration) (Pre-Launch, Rodica batch 2026-07-27)

GATE: **Pre-Launch, FEATURE, Declaracao PDF. OWNER VISUAL GATE, migration-free.**
Add an editable free-text "observacoes" field, entered before PDF generation,
rendered between the treatment sentence and the "Por ser verdade" paragraph.
**Recon confirmed declaracoes are TRANSIENT (no DB table/column); nothing is
persisted - so this needs NO migration and is the WHOLE fix.** See "Why there is
no PL-03b" below. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Rodica's words, verbatim, do not translate:

> "Continua a nao ser possivel editar as declaracoes de presenca para acrescentar
> informacoes"

Add a free-text observacoes field, editable before PDF generation, rendered
BETWEEN the treatment sentence and the "Por ser verdade" paragraph.

Ground truth (recon at authoring 2026-07-27, embed - executor RE-VERIFIES
read-only, ZERO memory):

- **No persistence exists, and none is needed.** There is NO declarations table or
  column in `packages/db/src/schema.ts` (grep `declarac` hits only an unrelated
  comment `:507`). Generation is fully transient: `apps/web/lib/clinical/declaracao/generate.ts:20-23`
  ("No writes (nothing persisted)") and `declaracao-actions.ts:11-14` ("nothing
  persisted beyond the transient PDF object"). **Adding observacoes is a purely
  transient UI + PDF change - no DB column required.**
- **Composition is in `declaracao-pdf.ts` (NOT `declaracao-model.ts`).** The
  treatment sentence = `declaracaoParagraph1()` (`:36-41`), drawn at `:152-156`;
  "Por ser verdade" = `DECLARACAO_PARAGRAPH_2` (`:42-43`), drawn at `:159-163`.
  **Insert the observacoes block between `:157` (`y -= 12;` after paragraph 1) and
  `:159` (the paragraph-2 loop).** Only render it when non-empty; wrap it to the
  page width so layout does not break.
- **The data model threads through four files:** add an optional `observacoes`
  string to `DeclaracaoInputs` (`declaracao-model.ts:65-91`) and `DeclaracaoModel`
  (`:93-111`), populate it in `buildDeclaracaoModel` (`:113-136`); the request/
  input carriers are `DeclaracaoRequest` (`declaracao-actions.ts:16-23`) and
  `GenerateDeclaracaoInputs` (`generate.ts:27-39`).
- **The dialog has NO free-text input today.** `DeclaracaoDialog.tsx` inputs are:
  marcacao `<select>` (`:149-161`), date (`:165`), start/end `TimeField`
  (`:172-181`), NIF text (`:187-194`). Add a labelled `<textarea>` (observacoes,
  optional) that flows into `generateDeclaracaoUrlAction`.
- **Tests to extend:** `declaracao-model.test.ts`, `declaracao-pdf.test.ts`
  (asserts drawn text - the natural place to prove observacoes renders), e2e
  `apps/web/e2e/declaracao.spec.ts`.

**Scope:** the observacoes field end-to-end (dialog textarea -> action -> generate
-> model -> pdf), plus tests, plus i18n for the new label. ZERO migration, ZERO
workflow, ZERO schema.

## Why there is no PL-03b (migration) - the split the briefing asked about

The briefing said: "If this needs a column it becomes a migration and therefore
owner-gated ... split into PL-03a (UI) and PL-03b (migration) if so." **It does NOT
need a column.** Recon proves declaracoes are generated transiently and never
persisted (`generate.ts:20-23`), so the DoD ("PDF with 200 chars of custom text")
is fully met by the transient path. **No PL-03b build loop is authored.**

Persisting a declaracao (storing its observacoes on a record for re-generation or
audit) would be a genuine design change: it introduces a new persisted artifact
and raises the immutability question (standing rule 8 - signed clinical records are
immutable; a persisted declaracao would need its own annul-not-delete story). That
is a FUTURE owner decision, not a pre-launch requirement, and is tracked as a
loose-end on the board (not a blocking migration). Do not build persistence under
this loop.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-pl-03a-declaracao-observacoes`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Reproduce:** generate a Declaracao today; confirm there is no way to add free text and no observacoes block in the PDF.
3. **Thread the field (transient):** add optional `observacoes` to `DeclaracaoInputs`/`DeclaracaoModel`/`buildDeclaracaoModel`, `DeclaracaoRequest`, `GenerateDeclaracaoInputs`; add the dialog `<textarea>`. No schema, no persistence.
4. **Render** the observacoes block in `declaracao-pdf.ts` between `:157` and `:159` (after paragraph 1, before "Por ser verdade"); render only when non-empty; wrap to width; keep the branding/signature/stamp layout intact.
5. **i18n:** the textarea label + any helper in BOTH `packages/i18n/src/strings.pt.json` and `strings.en.json`; JSON.parse both.
6. **Tests:** extend `declaracao-pdf.test.ts` to assert a 200-char observacoes string appears in the drawn output AND the paragraph-2 / signature layout still renders (no overlap/clipping); extend the e2e to enter observacoes and generate.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; scoped diff (no migration/workflow).

## Field 3. Definition of done (machine-verifiable)
- **Content PROOF (briefing DoD):** a PDF generated with 200 chars of custom
  observacoes text present in the output; a `declaracao-pdf.test.ts` assertion
  proves the string is drawn. Paste the assertion + run.
- **Placement PROOF:** the observacoes block renders BETWEEN the treatment sentence
  and "Por ser verdade"; a test asserts the ordering / y-position, and the
  signature + stamp still render (layout unbroken). Paste it.
- **Transient PROOF:** `git diff --name-only origin/main` shows ZERO migration /
  schema files - no column was added (declaracoes stay transient). Paste it.
- **Empty-safe PROOF:** with observacoes empty, the PDF is byte-equivalent to
  today's (no stray blank block). Paste the test.
- **Gates green** (i18n parity pt+en).

## Field 4. Verification (paste evidence)
The before/after PDF (or drawn-text assertion), the 200-char content test, the
placement + layout-unbroken test, the empty-safe test, the no-migration diff,
suite counts, the Preview URL (owner generates a Declaracao, types observacoes,
sees them in the PDF between the treatment sentence and "Por ser verdade"), PR
number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Transient only:** no schema,
  no column, no persistence. If persistence is ever wanted it is a separate
  owner-gated design decision (rule 8), NOT this loop.
- **Layout is load-bearing:** the declaracao carries branding + signature + the
  per-location stamp (W12-32); the observacoes block must not push the signature/
  stamp off-page or overlap "Por ser verdade". Wrap + measure.
- Verify on local `127.0.0.1` synthetic data; cloud REAL DATA ONLY. pt-PT
  diacritics; both i18n files parse; no emoji; plain hyphens; no em/en dashes; no
  new hex. Never force-push / `--admin`. No PII in logs.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- Recon on the branch contradicts the authoring recon and a declaracao IS
  persisted somewhere (a table/column appears) - HALT: that changes this from a
  transient UI change into a migration (the PL-03b case), which is owner-gated.
- The observacoes block cannot fit between paragraph 1 and "Por ser verdade"
  without pushing the signature/stamp off-page - HALT with the layout finding and
  a recommended default (cap length / paginate) rather than shipping a broken PDF.

## Field 7. Report back
The 200-char content test, the placement + layout test, the empty-safe test, the
no-migration diff, suite counts, PR number, and the confirmation that no PL-03b was
needed (declaracoes transient).

## Merge policy (embed, Pre-Launch)
- **PL-03a is OWNER VISUAL GATE (PDF output is visual, migration-free).** Required
  checks + all three Vercel deploys green (checks API not banner) NECESSARY but not
  sufficient; GREEN pushes the Preview + a sample PDF and HALTs; owner generates a
  Declaracao with observacoes and confirms the placement + intact layout. GREEN
  does NOT self-merge. Fresh `origin/main`, one PR in flight, never stacked.
  Workflow files never touched. HALT-LOUD on a persistence surprise or a broken
  layout.

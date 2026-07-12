# Loop W5-31 - Declaracao de Presenca PDF (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** Reuses the **W5-16 PDF infrastructure** (pdf-lib, `apps/web/lib/clinical/report/pdf.ts` / `rgpd/rgpd-pdf.ts`) - **no new vendor**. **No schema change.** Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add a **"Imprimir Declaracao de Presenca"** button in the patient profile **Documentos** section that opens a dialog (select a marcacao or enter date/time manually, all editable) and generates a Fisiozero-template attendance-declaration **PDF**.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **PDF infra (reuse, no new vendor):** the W5-16 Gerar PDF used the existing pdf-lib pipeline (`apps/web/lib/clinical/report/pdf.ts`, `apps/web/lib/clinical/rgpd/rgpd-pdf.ts`, `rgpd/rgpd-model.ts`). Reuse this for the Declaracao; the clinic logo is the `BrandLockup` inline SVG (`packages/ui/src/brand/*`), print-branding per CLAUDE.md Brand ("logo + location contacts + fiscal info"). **Portuguese accents must render correctly** in the PDF (recon the pdf-lib font/encoding used by the RGPD PDF - it already renders pt-PT; reuse the same font path so accented glyphs are correct).
- **Surface:** patient profile **Documentos** (the W5-10 surface). Add the button there.
- **Dialog:** select one of the patient's **marcacoes** (prefills **date**, **hora inicio**, **hora fim** from the appointment) OR manual **date + time** entry; **all three editable** before generating.
- **Fisiozero template (exact):**
  1. clinic **logo centered top**;
  2. title **"Declaracao de Presenca"**;
  3. body paragraph 1: **"Para os devidos efeitos se declara que {nome do paciente} esteve em tratamento nas nossas instalacoes no dia {dia} entre as {hora inicio} e as {hora fim}."**
  4. body paragraph 2: **"Por ser verdade se passa a presente declaracao que vai assinada pelo responsavel dos servicos e autenticada com o carimbo em uso nesta clinica."**
  5. then **"{localidade}, {dia}"** where `localidade` comes from the selected marcacao's location, **falling back to the tenant default location**;
  6. then a **signature/stamp image slot** rendered **only if a tenant asset exists** (a settings key; asset pending from owner - see QUESTIONS), otherwise **blank vertical space** for a physical stamp and signature;
  7. then the line **"(Dr. Joao Paulo Santos Silva)"** sourced from a **tenant setting**, NOT hardcoded.
- **Localidade default:** per-location from the marcacao; fallback to the tenant default location (confirm with JP whether a fixed "Lisboa" is preferred - QUESTIONS; default is per-location).
- **Responsavel name:** a tenant setting (default value confirmed with JP - QUESTIONS); never hardcode "Dr. Joao Paulo Santos Silva" as a literal - read it from tenant settings with a sane default.
- **Signature/stamp asset:** a tenant settings key; if unset, render blank space (owner sources the Fisiozero export / JP asset - QUESTIONS). Reuse the signed-URL storage pattern (rule 8) if the asset is a stored file; never public.
- **No schema change.** The declaration reads existing patient/marcacao/tenant-settings data; it persists nothing new (the generated PDF may save to Documentos via the attachments path if desired, reusing W5-16, but adds no column).

**Scope:** the Documentos button + dialog (marcacao select prefill or manual, all editable); the Fisiozero-template PDF via the W5-16 pdf-lib infra (logo, title, two verbatim paragraphs, localidade line, conditional stamp/signature slot, tenant-sourced responsavel line); correct pt-PT accents. No schema change, no new vendor. pt-PT i18n (both files); en coherent for UI chrome (the declaration body is pt-PT legal text).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-31-declaracao-presenca origin/main -b osteojp-w5-31-declaracao-presenca`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the W5-16 pdf-lib pipeline + its font path (pt-PT accents); the Documentos surface; how a marcacao exposes date + hora inicio/fim + location; the tenant default location + the responsavel + the stamp-asset settings keys (which exist, which are pending). Paste findings.
3. **Button + dialog:** "Imprimir Declaracao de Presenca" in Documentos; dialog with a marcacao select (prefills date/hora inicio/hora fim from the chosen appointment) OR manual date + time; all three fields editable before generate. Use scoped locators + explicit dialog handling in the E2E.
4. **PDF generation:** the Fisiozero template above via the reused pdf-lib infra; logo centered top; title; paragraph 1 with `{nome do paciente}`/`{dia}`/`{hora inicio}`/`{hora fim}` interpolated; paragraph 2 verbatim; "{localidade}, {dia}" (marcacao location -> tenant default fallback); conditional stamp/signature slot (asset present -> render; absent -> blank space); responsavel line from tenant setting. Correct pt-PT accents.
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (open Documentos -> Imprimir Declaracao -> select a marcacao prefills date/hora -> generate -> PDF carries the logo, both paragraphs with the patient name + date + times, the localidade line, and the responsavel line; manual date/time entry works; accents render).

## Field 3. Definition of done (machine-verifiable)
- **No-schema-change + no-new-vendor PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`; no new dependency added to any `package.json` (the pdf-lib infra is reused). Paste it.
- **Recon report pasted:** pdf-lib font path (accents); Documentos surface; marcacao date/hora/location exposure; tenant default location + responsavel + stamp-asset settings keys.
- **Prefill PROOF:** an E2E selects a marcacao and asserts date + hora inicio + hora fim prefill from that appointment and are editable; manual entry path also asserted. Paste it.
- **PDF-content PROOF:** the generated PDF contains the logo, the title "Declaracao de Presenca", body paragraph 1 with the patient name + `{dia}` + `{hora inicio}` + `{hora fim}` correctly interpolated, body paragraph 2 verbatim, the "{localidade}, {dia}" line, and the responsavel line "(Dr. Joao Paulo Santos Silva)" sourced from the tenant setting (not a hardcoded literal). Paste the test + a sample render/preview.
- **Localidade-fallback PROOF:** with a marcacao location -> that localidade; with no location -> the tenant default localidade. Paste it.
- **Stamp-slot PROOF:** with the tenant stamp asset set -> the image renders; unset -> blank vertical space. Paste it.
- **Accents PROOF:** an assertion that accented pt-PT characters render correctly in the PDF (not mojibake). Paste it.
- **Responsavel-not-hardcoded PROOF:** a grep/assertion that the responsavel name is read from tenant settings, with no hardcoded "Dr. Joao Paulo Santos Silva" literal in the PDF code path. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the no-schema/no-vendor diff, the prefill E2E, the PDF-content test + sample, the localidade-fallback proof, the stamp-slot proof, the accents proof, the responsavel-not-hardcoded proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Reuse the W5-16 pdf-lib infra;** **no new vendor/dependency** (CLAUDE.md owner-confirmable - if a new PDF dep seems required, HALT to QUESTIONS, do not add silently).
- **No schema change.** Read existing patient/marcacao/tenant-settings data; persist nothing new (saving the PDF to Documentos via the existing attachments path is allowed, adds no column).
- **Responsavel + stamp asset from tenant settings,** never hardcoded literals; localidade from the marcacao with a tenant-default fallback.
- **Signed-URL storage only** (rule 8) if the stamp asset or generated PDF is stored; never public; EU region.
- **Correct pt-PT accents in the PDF** - reuse the RGPD PDF font path.
- **SYNTHETIC-DATA-ONLY** for verify. Audit on any write (rule 6).
- pt-PT i18n (both files) for UI chrome; the declaration body is verbatim pt-PT. No emoji, UI-STYLE.md, logo via BrandLockup. **Never force-push / `--admin`.** Secrets never printed. Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Generating the PDF needs a NEW dependency/vendor beyond the reused pdf-lib infra (owner-confirmable) - HALT to QUESTIONS, do not add silently.
- Persisting anything requires a schema change - it must NOT; the declaration reads existing data.
- The tenant default location, the responsavel name, or the stamp asset settings keys do not exist and cannot be added without a schema change - surface with the recommended default (blank stamp space; per-location localidade; a configurable responsavel default), do not hardcode.
- Correct pt-PT accents are not achievable with the reused pdf-lib font - surface the font gap.

## Field 7. Report back
Recon report, the no-schema/no-vendor diff, the prefill E2E, the PDF-content test + sample, the localidade-fallback proof, the stamp-slot proof, the accents proof, the responsavel-not-hardcoded proof, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. Live-apply verification evidence (W5-27 seed, W5-30 migration 0035) must be pasted in the loop report before merge regardless (not applicable to this no-schema loop, which has no live-DB step). Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.

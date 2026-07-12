# Loop W5-34 - Guiao do Exame Subjetivo in-app panel (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** Adds a collapsible read-only guide panel to the Iniciar consulta recording screen. **Migration-free, no schema change.** Depends on **`docs/clinical/guiao-exame-subjetivo.md`** (authored + merged in the FF2 authoring PR - the content source). Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

On the **Iniciar consulta** recording screen, add a **collapsible panel "Guiao do Exame Subjetivo"** rendering the content of **`docs/clinical/guiao-exame-subjetivo.md`** as **structured static content** (sections collapsible, read-only), **collapsed by default**, that **never overlaps or interferes with the recording controls**. **pt only** for now.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **Recording screen:** `apps/web/app/consultation/StartConsultation.tsx` (the consent + Iniciar gravacao flow) hands off to the recording UI `apps/web/app/consultation/Recorder.tsx` (W4-07). The guiao panel belongs on this recording screen, alongside (not on top of) the recording controls. Recon the exact mount point so the panel sits beside/below the controls and never overlaps them.
- **Content source:** `docs/clinical/guiao-exame-subjetivo.md` (the external-therapist guiao, committed as ground truth for this in-app guide). Render its content as structured static content. Two viable approaches - recon and pick the simpler:
  - **(preferred)** transcribe the guiao into a typed pt-only content structure (a static array of sections/items) consumed by the panel component, so there is no markdown-loader dependency and no runtime file read;
  - **(alternative)** import the markdown as a build-time static asset IF the app already has a markdown pipeline (recon; do NOT add a new markdown dependency just for this - that would be a new-vendor decision).
  The panel content must match the guiao doc; keep them in sync (the doc is the source of truth).
- **Structure:** the guiao's top-level items become collapsible sections (e.g. Motivo da consulta, SE DOR, Participacao e contexto de vida, Antecedentes pessoais, Medicacao/alergias, Habitos de vida, Pesquisa de flags e revisao de sistemas). Read-only; no inputs. Collapsed by default so it does not crowd the recording controls.
- **Non-interference:** the panel is presentation chrome; it must not capture focus from, resize over, or block the Iniciar gravacao / recording controls. No dialog/modal that blocks recording. Collapsed by default.
- **pt only:** render pt-PT content only for now (no en translation required this loop; note as a follow-up if the owner wants en later).
- **No schema change, no migration, no new vendor.**

**Scope:** a collapsible, read-only "Guiao do Exame Subjetivo" panel on the Iniciar consulta recording screen, rendering the guiao doc content as structured static sections, collapsed by default, non-overlapping with recording controls, pt only. Migration-free.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-34-guiao-in-app origin/main -b osteojp-w5-34-guiao-in-app`; assert toplevel + clean tree + HEAD == `origin/main` tip; assert `docs/clinical/guiao-exame-subjetivo.md` exists on `origin/main`. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** the recording screen mount point (`StartConsultation.tsx` / `Recorder.tsx`) + where the panel sits without overlapping controls; whether a markdown pipeline exists (else transcribe to a typed static structure - no new vendor). Paste findings.
3. **Panel:** a collapsible "Guiao do Exame Subjetivo" panel; sections collapsible, read-only, collapsed by default; content matches `docs/clinical/guiao-exame-subjetivo.md`; pt only. Uses scoped locators + stable selectors.
4. **Non-interference:** verify the panel never overlaps/blocks the recording controls (collapsed default; expanding pushes layout, does not overlay a modal over the controls).
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (the panel renders collapsed by default on the recording screen; expanding shows the guiao sections read-only; the recording controls stay reachable and are never overlapped; collapsing restores).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + no-vendor PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`; no new dependency in any `package.json`. Paste it.
- **Recon report pasted:** the recording-screen mount point + non-overlap placement; the content approach (typed static vs existing markdown pipeline).
- **Collapsed-default PROOF:** an E2E asserts the panel is present and COLLAPSED by default on the Iniciar consulta recording screen. Paste it.
- **Expand/read-only PROOF:** expanding shows the guiao sections as read-only static content (no inputs); collapsing restores. Paste it.
- **Content-match PROOF:** an assertion that the rendered panel content matches `docs/clinical/guiao-exame-subjetivo.md` (key section headings present). Paste it.
- **Non-interference PROOF:** an assertion that the recording controls remain reachable and are never overlapped/blocked when the panel is expanded (no blocking modal). Paste it.
- **pt-only PROOF:** the panel renders pt-PT content (no missing-key/en fallback). Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, the migration-free/no-vendor diff, the collapsed-default proof, the expand/read-only proof, the content-match proof, the non-interference proof, the pt-only proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`.
- **Read-only static content;** no inputs, no data capture, no schema change, no migration.
- **Non-interference is a hard requirement:** the panel never overlaps, blocks, or steals focus from the recording controls; collapsed by default; no blocking dialog/modal (per the browser-dialog caution).
- **No new vendor/dependency** for markdown rendering - transcribe to a typed static structure if no markdown pipeline exists (a new markdown dep is owner-confirmable; HALT to QUESTIONS rather than add it).
- **Keep the panel in sync with the guiao doc** (`docs/clinical/guiao-exame-subjetivo.md` is the source of truth).
- **pt only** this loop; en is a noted follow-up, not built here.
- No emoji, UI-STYLE.md tokens, min 44px tap targets on the collapse controls. **Never force-push / `--admin`.** Plain hyphens only. SYNTHETIC-DATA-ONLY for verify.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, dirty tree, HEAD != tip, or the guiao doc is absent from `origin/main`).
- Rendering the guiao requires a NEW markdown dependency/vendor (owner-confirmable) - HALT to `docs/design/QUESTIONS.md`; transcribe to a typed static structure instead.
- The only mount point available forces the panel to overlap or block the recording controls - surface it; non-interference is non-negotiable.

## Field 7. Report back
Recon report, the migration-free/no-vendor diff, the collapsed-default proof, the expand/read-only proof, the content-match proof, the non-interference proof, the pt-only proof, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. Live-apply verification evidence (W5-27 seed, W5-30 migration 0035) must be pasted in the loop report before merge regardless (not applicable to this static-content loop, which has no live-DB step). Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.

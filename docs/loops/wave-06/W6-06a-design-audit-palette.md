# Loop W6-06a - Design audit + color-equity palette plan (Wave 06 Melhorias)

GATE: **Wave 06 Melhorias, DESIGN PASS (audit half), runs LAST after all other Wave 06 loops, BEFORE W6-06b.** Produce (1) a prioritized platform-wide visual-audit inventory and (2) the owner-mandated color-equity palette plan with AA proofs, committed as design docs. **GREEN MUST use the `/ui-ux-pro-max` skill.** Docs/plan only, no product-surface code changes. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

This is the AUDIT half of the Wave 06 design pass (split from W6-06 for a safer palette rollout, owner-authorized). It front-loads the platform-wide visual audit and the color-equity decision into a committed, reviewable plan, so W6-06b implements against an agreed spec instead of improvising equity ratios live. It does NOT restyle surfaces; that is W6-06b.

Ground truth (recon at authoring 2026-07-14, embed - executor runs with ZERO memory):
- **The palette today:** `packages/ui/theme.css` defines the canonical tokens: `--color-brand-teal #45B9A7` (= `--color-accent-2`, "cyan"/current teal-green), `--color-brand-magenta #8B1863` (= `--color-accent-1`, the **logo purple**), `--color-brand-grey #98B2C2`, plus full `primary` / `accent-1` / `accent-2` / `neutral` scales (50-900). `packages/ui/src/tokens.test.ts` GUARDS the canonical hexes (teal `#45B9A7`, magenta `#8B1863`) - they must not drift.
- **The purple is already a brand token, just under-used:** UI-STYLE.md 7 currently says "magenta reserved for brand lockup" and "`text-brand-teal` for links/accents." The owner mandate is to promote the logo purple (accent-1 `#8B1863` + its existing tints) into general UI usage with a fixed equity, WITHOUT changing the canonical hexes (so `tokens.test.ts` stays green).
- **Owner color-equity mandate (verbatim, plan to this ratio):** **55 percent white+grey** (primary/neutral/grey scales), **25 percent cyan** (current teal/green, accent-2), **20 percent purple** (accent-1 `#8B1863`). Accessibility **AA preserved** throughout.
- **Bodychart marker tokens are OUT OF BOUNDS:** the nine-entry marker palette from W5-25/W5-28 lives in `apps/web/app/globals.css` (`@theme`, `fill-marker-*` / `stroke-marker-*`); it is NOT part of the brand palette and is **untouched** by the equity plan. The plan must explicitly exclude it.
- **The visual-audit surfaces:** the patient section is the priority (patient profile tabs - Registos clinicos has a stray line mid-layout, Documentos is weak; patient-section dashboards/layouts), then the whole platform (Dashboard/Inicio, Agenda, Marcacoes, Administracao, Faturacao, Estatisticas once W6-05 lands, auth screens). The audit inventories issues across all of these.
- **The design system reference:** `docs/design/UI-STYLE.md` (token-only, 4px grid, global focus ring, StatusBadge, row-actions disclosure) is the shared visual language; the plan proposes the UI-STYLE.md 7 edit for the new equity (executed in W6-06b).
- **Docs-only loop:** the deliverables are committed design docs under `docs/design/` (or `docs/status/`); no product-surface `.tsx`/token changes here.

**Scope:** using `/ui-ux-pro-max`, produce (1) a prioritized platform-wide visual-audit inventory doc (every finding tagged by surface + severity, patient section first) and (2) a color-equity palette plan doc mapping the 55/25/20 white-grey/cyan/purple ratio to concrete token usage per surface-region, with an AA proof for every purple (accent-1) foreground/background pairing it introduces, an explicit exclusion of the bodychart marker tokens, and the proposed UI-STYLE.md 7 wording for W6-06b to apply. Canonical hexes unchanged. Docs only. pt-PT for any user-facing copy referenced (no i18n edits here).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w6-06a-design-audit origin/main -b osteojp-w6-06a-design-audit`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Load `/ui-ux-pro-max`** and use it to drive the audit (mandatory).
3. **Recon + audit:** inventory the current palette tokens + UI-STYLE.md; walk every surface (patient section first) and record visual findings (the Registos stray line, weak Documentos, dashboard/layout weaknesses, inconsistencies), tagged by surface + severity + a recommended fix. Paste the inventory.
4. **Palette plan:** map the 55/25/20 equity to token usage per surface-region (backgrounds/surfaces = white+grey; primary accents/links/CTAs = cyan; secondary emphasis/section accents/selected states = purple), keeping canonical hexes fixed. Provide an **AA contrast proof** (ratio >= 4.5:1 text, >= 3:1 large/UI) for every accent-1 purple pairing introduced. Explicitly EXCLUDE the bodychart marker palette. Draft the UI-STYLE.md 7 replacement wording.
5. **Commit the two docs** (audit inventory + palette plan) under `docs/design/`. No product-surface code.
6. **Gates (docs loop):** the plan is complete and internally consistent; every proposed purple pairing carries an AA number; the bodychart exclusion is explicit; zero em/en dashes in the authored docs; markdown renders. (No `pnpm test:e2e` product assertions - this loop ships no product code; run `pnpm lint`/`typecheck`/`build` only if the repo requires them for a docs change, else state N/A.)

## Field 3. Definition of done (machine-verifiable)
- **Docs-only PROOF:** `git diff --name-only origin/main` shows ONLY files under `docs/`; ZERO product-surface (`apps/**`, `packages/**`), ZERO token/css, ZERO `.github/workflows/`. Paste it.
- **`/ui-ux-pro-max` used PROOF:** state that the skill drove the audit (name it in the report).
- **Audit inventory PROOF:** a prioritized findings list covering the patient section (incl. the Registos stray line + weak Documentos) and the rest of the platform, each finding tagged surface + severity + recommended fix. Paste representative entries + the total count.
- **Palette-plan PROOF:** the 55/25/20 equity mapped to concrete token usage per surface-region; canonical hexes unchanged (accent-1 `#8B1863`, accent-2 `#45B9A7`); the proposed UI-STYLE.md 7 wording included. Paste it.
- **AA PROOF:** every purple (accent-1) foreground/background pairing the plan introduces has a contrast ratio meeting AA, listed explicitly. Paste the table.
- **Bodychart-exclusion PROOF:** the plan explicitly states the W5-25/W5-28 `fill-marker-*` / `stroke-marker-*` palette in `apps/web/app/globals.css` is untouched. Paste it.
- **Dash PROOF:** `grep -nP "[\x{2013}\x{2014}]"` over the authored docs returns nothing. Paste the empty result.

## Field 4. Verification (paste evidence)
The docs-only diff, the skill-used statement, the audit inventory, the palette plan + UI-STYLE 7 wording, the AA table, the bodychart-exclusion statement, the dash-grep empty result, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Runs after all other Wave 06 loops, before W6-06b.**
- **`/ui-ux-pro-max` is mandatory** for the audit.
- **Docs/plan only.** No product-surface code, no token/css change, no i18n edit here (that is W6-06b).
- **Canonical brand hexes never change** (accent-1 `#8B1863`, accent-2 `#45B9A7`, grey `#98B2C2`); the equity is a USAGE ratio, not a re-hex. `packages/ui/src/tokens.test.ts` must stay valid.
- **Bodychart marker palette (W5-25/W5-28) is excluded** and untouched.
- **AA preserved:** every introduced purple pairing carries an AA proof.
- No scope expansion, no new features; audit + plan for the verbatim W6-06 deliverables only. **Never force-push / `--admin`.** Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- The 55/25/20 equity cannot be achieved at AA on some surface without either changing a canonical hex or touching the bodychart palette - HALT with the specific pairing + a recommended default (e.g. use an accent-1 tint from the existing scale that meets AA), do not re-hex a brand token or touch markers.
- The audit surfaces a structural problem whose fix is out of the verbatim W6-06 scope (a new feature, a data change) - log to `docs/design/QUESTIONS.md` as a Wave 07 candidate; do not fold it into scope.

## Field 7. Report back
The docs-only diff, the skill-used statement, the audit inventory + count, the palette plan + UI-STYLE 7 wording, the AA table, the bodychart-exclusion statement, the dash-grep empty result, PR number.

**Merge policy (owner amendment 2026-07-12, standing for Wave 06):** GREEN self-merge permitted once ALL required checks are green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green, read from the checks API, never the banner. The cross-browser lane no longer exists. This loop is docs-only -> GREEN self-merge once the required checks pass. Workflow files are never touched. Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks.

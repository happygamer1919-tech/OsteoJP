# Loop W5-28 - Bodychart Fisiozero-exact marker glyphs (Wave 05 Ficha Final 2)

GATE: **Wave 05 Ficha Final 2 (FF2).** Render-only change to `apps/web/app/clinical/[id]/BodyChart.tsx`. Depends on **W5-25** (shape+color+legend, merged) and **W5-26** (EVA `intensity`, merged) - both already touch `BodyChart.tsx`. **Migration-free and template-free.** Starts from **fresh `origin/main`** (fetch-and-fast-forward first); never stacked. **The Fisiozero-exact glyph mapping in this loop SUPERSEDES the AMENDMENTS ruling-G geometric shape column** (colors + legend retained); recorded in DECISIONS 2026-07-12.

## Field 1. Scope and ground truth

Replace the nine marker SVG **shapes** with **Fisiozero-exact glyphs, redrawn clean**. **KEEP** the existing unique per-type AA color tokens and the always-visible legend from W5-25. **KEEP** the W5-26 EVA `intensity` logic untouched.

Ground truth (recon at authoring 2026-07-12, embed - executor runs with ZERO memory):
- **Component:** `apps/web/app/clinical/[id]/BodyChart.tsx` (the `bodychart` x-widget). After W5-25 each `marker_type` renders a distinct SVG glyph in its own UI-STYLE marker-palette color token, with an always-visible legend mapping glyph+color to the pt-PT type name. After W5-26 a `pain_location` marker can carry an optional `intensity` (0-10 EVA) shown in the marker list ("Local da dor - EVA 7/10") and on-chart.
- **This loop re-draws the nine SHAPES only.** Color tokens (W5-25) and the legend (W5-25) and the EVA logic (W5-26) are unchanged. The marker array shape `{ marker_type, x, y, view }` (+ optional `intensity` on `pain_location`) is unchanged; placement (click + keyboard), the four views, and read-only gating are unchanged.
- **Authoritative Fisiozero-exact glyph mapping (redrawn clean as SVG, keyed by the frozen `marker_type` enum; these textual descriptions are the AUTHORING AUTHORITY and supersede the ruling-G shapes):**

| `marker_type` | pt-PT label | Fisiozero-exact glyph |
|---|---|---|
| `blockage_dysfunction` | Bloqueio / Disfuncao | **solid upward triangle** |
| `scar` | Cicatriz | **an X formed of short hatch strokes** |
| `hypertonicity` | Hipertonicidade | **dense crosshatch patch** |
| `hypotonicity` | Hipotonicidade | **ellipse filled with diagonal lines** |
| `pain_radiation` | Irradiacao da dor | **lightning bolt** |
| `pain_location` | Local da dor | **circle with center dot (target)** |
| `paresthesia` | Parestesia | **ellipse filled with dots** |
| `rotation_right` | Rotacao direita | **clockwise curved arrow** |
| `rotation_left` | Rotacao esquerda | **counterclockwise curved arrow** |

- **Nine frozen enum values** (`osteopathy` `bodychart.items.properties.marker_type.enum`) are unchanged: `blockage_dysfunction`, `scar`, `hypertonicity`, `hypotonicity`, `pain_radiation`, `pain_location`, `paresthesia`, `rotation_right`, `rotation_left`.
- **Legibility:** each glyph must be distinct at the on-chart marker size (min ~12px) and in the legend; shape carries the meaning, color reinforces (greyscale-legible), consistent with W5-25.
- **Colors:** reuse the exact W5-25 UI-STYLE marker-palette tokens per type; do NOT change hues, do NOT introduce raw hex, do NOT reserve-break magenta.
- **EVA untouched:** the `BodyChartEva` unit suite must stay green; `intensity` selector + display + read-only gating are W5-26's and are NOT modified here.
- **Twelve AI keys:** untouched (bodychart is `ai_extractable: false`); the W5-13 `ficha-medica-compat.test.ts` stays green.
- **Post-deploy visual verification:** Rodica visually verifies the rendered glyphs against her Fisiozero screenshot after deploy; the textual descriptions above are the authoring authority for the build. Note this as a post-merge owner/Rodica check, not a build gate.

**Scope:** re-draw the nine marker SVG glyphs to the Fisiozero-exact mapping above in `BodyChart.tsx`, keeping W5-25 colors + legend and W5-26 EVA logic intact. Render-only, migration-free, template-free. pt-PT i18n (both files) for any legend label already present (reuse).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w5-28-bodychart-fisiozero-glyphs origin/main -b osteojp-w5-28-bodychart-fisiozero-glyphs`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **Recon, report BEFORE building:** confirm W5-25 (per-type shape+color+legend) and W5-26 (EVA `intensity`) are present on `origin/main`; paste the current nine glyph render + the color-token map + the legend source + where the EVA logic sits (so it is left untouched). Confirm the nine enum values are unchanged.
3. **Re-draw glyphs:** replace each of the nine shapes with its Fisiozero-exact glyph (table above), redrawn as clean SVG, each keeping its existing W5-25 palette color token. Keep marker position math, the `title` tooltip, the keyboard cursor indicator, and (for `pain_location`) the W5-26 EVA display.
4. **Legend:** the always-visible legend from W5-25 now shows the new glyphs beside the same nine pt-PT type names + colors. Presentation chrome, always shown.
5. **Leave EVA + colors + placement + storage untouched.**
6. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. `BodyChartEva` + W5-13 compat), `pnpm build`, `pnpm test:e2e` (place one of each of the nine types -> nine distinct Fisiozero glyphs render; legend shows all nine; a `pain_location` marker still shows its EVA; colors unchanged).

## Field 3. Definition of done (machine-verifiable)
- **Migration-free + template-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`, and does NOT touch any `packages/db/seed/form-templates/osteopathy-*.json`. Paste it.
- **Nine-Fisiozero-glyph PROOF:** an E2E snapshot OR DOM assertion proving all nine `marker_type` values render with the NEW distinct Fisiozero glyph identifiers (e.g. nine distinct glyph ids/paths). Paste it.
- **Colors-retained PROOF:** assert each type still uses its W5-25 palette color token (nine distinct tokens, unchanged from W5-25). Paste it.
- **Legend PROOF:** the always-visible legend lists all nine pt-PT type names with the new glyph + its color. Paste it.
- **EVA-untouched PROOF:** the `BodyChartEva` unit suite passes; a `pain_location` marker still shows "Local da dor - EVA n/10" and read-only gating on signed records is unchanged. Paste the passing run.
- **No-placement/storage-change PROOF:** placement (click/keyboard) and the persisted marker shape `{ marker_type, x, y, view }` (+ optional `intensity`) are unchanged. Paste it.
- **W5-13 compat GREEN:** `ficha-medica-compat.test.ts` passes. Paste it.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
Recon report, migration-free + template-free diff, the nine-Fisiozero-glyph assertion, the colors-retained proof, the legend proof, the EVA-untouched (`BodyChartEva` green) proof, the no-placement/storage-change proof, passing W5-13 compat, suite counts, preview URL, PR number. Note the Rodica post-deploy visual check as a separate owner verification.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **Fisiozero-exact glyph mapping (this loop) is the authoring authority for shapes; it supersedes ruling-G shapes.**
- **Render-only.** Do NOT change placement, the four views, the marker array shape, read-only gating, or storage.
- **Keep W5-25 colors + legend and W5-26 EVA logic intact** - this loop touches SHAPES only. Do not re-hue, do not add raw hex, do not touch the EVA selector/display.
- **Migration-free and template-free.** No `osteopathy-*.json` edit, no new column, no workflow, no vendor.
- **Never color alone** - each Fisiozero glyph must disambiguate its type in greyscale.
- **No new `packages/ui` primitive** - the glyphs live in `apps/web` (`BodyChart.tsx`); a `packages/ui` change ripples beyond one surface (HALT and surface the blast radius per UI-STYLE.md).
- **Twelve AI keys frozen**; W5-13 compat stays green.
- pt-PT i18n (both files), no emoji, UI-STYLE.md tokens, min 44px tap targets where interactive. **Never force-push / `--admin`.** Secrets never printed. Plain hyphens only. SYNTHETIC-DATA-ONLY for any dry-run.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Recon finds W5-25 or W5-26 has NOT merged to `origin/main` (the color/legend or EVA base this loop preserves is absent) - surface the ordering; this loop composes on top of both.
- The nine `marker_type` enum values have drifted (added/removed/renamed) - surface the mismatch; the glyph mapping binds to the frozen enum.
- Rendering a Fisiozero glyph would force changing a W5-25 color token or the W5-26 EVA logic - surface it; this loop must not alter colors or EVA.
- A `packages/ui` primitive change is the only way to render the glyphs - surface the blast radius before touching `packages/ui`.

## Field 7. Report back
Recon report, the nine-Fisiozero-glyph proof, the colors-retained proof, the legend proof, the EVA-untouched proof, the no-placement/storage-change proof, passing W5-13 compat, migration-free + template-free diff, suite counts, PR number.

**Merge policy (owner amendment 2026-07-12):** GREEN self-merge permitted once ALL required checks are green AND all three Vercel deployment checks (osteojp-api, osteojp-platform, osteojp-portal) are green. The cross-browser E2E lane is non-required and is ignored, never waited on. Live-apply verification evidence (W5-27 seed, W5-30 migration 0035) must be pasted in the loop report before merge regardless (not applicable to this render-only loop, which has no live-DB step). Close: open ONE PR against `main`; self-merge on the policy above once green. Never force-push / `--admin`; never self-merge on red required checks. Rodica's Fisiozero-screenshot visual check happens post-deploy and does not block merge.
